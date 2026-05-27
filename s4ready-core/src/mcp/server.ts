/**
 * MCP server scaffold. Tool authors give us a list of Tool objects;
 * we expose them via the MCP protocol over HTTP Streamable transport
 * (the SAP-blessed transport for Joule integration).
 *
 * We also expose:
 *   GET  /health                  Liveness probe
 *   GET  /                        Same as /health
 *   POST /mcp                     MCP protocol endpoint
 *   GET  /mcp                     MCP protocol endpoint (SSE for some clients)
 *   POST /api/v1/tools/:name      REST endpoint for web chat UI / curl
 *   POST /api/v1/admin/...        Admin operations (gated by role)
 */

import http, { type IncomingMessage, type ServerResponse } from 'http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { Platform } from '../platform';
import type { Tool, ToolContext, ToolHandler } from '../interfaces/tool';
import { AuthError, type UserContext } from '../interfaces/auth-provider';
import { v4 as uuid } from './uuid';

export interface McpServerOptions {
  platform: Platform;
  tools: Tool[];
  /** Override port (defaults to PORT env, then 8080). */
  port?: number;
  /** Skip auth on incoming requests (dev only). NEVER enable in production. */
  skipAuth?: boolean;
}

export interface RunningServer {
  port: number;
  stop: () => Promise<void>;
}

export function createMcpServer(options: McpServerOptions): Promise<RunningServer> {
  const { platform, tools, skipAuth } = options;
  const port = options.port ?? parseInt(process.env.PORT ?? '8080', 10);

  // Initialize all tools (warm caches, validate config).
  return initializeTools(tools, platform).then(() => {
    const httpServer = http.createServer(async (req, res) => {
      const requestId = uuid();
      const logger = platform.logger.child({ requestId });

      try {
        // Health check — no auth needed.
        if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
          return sendJson(res, 200, {
            status: 'ok',
            mode: platform.mode,
            tools: tools.map(t => ({
              id: t.manifest.id,
              version: t.manifest.version,
              handlers: t.handlers.map(h => h.name)
            }))
          });
        }

        // MCP protocol endpoint.
        if ((req.method === 'POST' || req.method === 'GET') && req.url === '/mcp') {
          await handleMcpRequest(req, res, { platform, tools, skipAuth, requestId, logger });
          return;
        }

        // REST API endpoints.
        if (req.url?.startsWith('/api/v1/tools/') && req.method === 'POST') {
          await handleRestToolCall(req, res, { platform, tools, skipAuth, requestId, logger });
          return;
        }

        sendJson(res, 404, { error: 'Not found' });
      } catch (err: any) {
        logger.error('Request handling error', { error: err?.message, stack: err?.stack });
        if (!res.headersSent) {
          sendJson(res, 500, { error: 'Internal server error', requestId });
        }
      }
    });

    return new Promise<RunningServer>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, '0.0.0.0', () => {
        platform.logger.info('MCP server listening', { port, mode: platform.mode });
        platform.logger.info('Endpoints', {
          health: `http://0.0.0.0:${port}/health`,
          mcp: `http://0.0.0.0:${port}/mcp`,
          rest: `http://0.0.0.0:${port}/api/v1/tools/{tool_name}`
        });
        platform.logger.info('Loaded tools', {
          tools: tools.map(t => `${t.manifest.id}@${t.manifest.version}`)
        });
        resolve({
          port,
          stop: () =>
            new Promise<void>((resolveStop, rejectStop) => {
              httpServer.close(err => (err ? rejectStop(err) : resolveStop()));
            }).then(async () => {
              await Promise.all(tools.map(t => t.shutdown?.()));
              await platform.shutdown();
            })
        });
      });
    });
  });
}

async function initializeTools(tools: Tool[], platform: Platform): Promise<void> {
  for (const tool of tools) {
    if (tool.initialize) {
      await tool.initialize({ config: platform.config, logger: platform.logger });
    }
  }
}

interface HandlerContext {
  platform: Platform;
  tools: Tool[];
  skipAuth?: boolean;
  requestId: string;
  logger: ReturnType<Platform['logger']['child']>;
}

async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HandlerContext
): Promise<void> {
  // Auth: validate token if present. The MCP protocol itself doesn't define
  // auth — we expect Joule (and other clients) to send a Bearer token.
  let user: UserContext | undefined;
  if (!ctx.skipAuth) {
    user = await authenticate(req, ctx.platform);
  } else {
    user = devUser();
  }

  const mcpServer = buildMcpServerForUser(ctx.tools, ctx.platform, user, ctx.requestId);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => transport.close());

  await mcpServer.connect(transport);
  await transport.handleRequest(req, res);
}

async function handleRestToolCall(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: HandlerContext
): Promise<void> {
  const toolName = req.url!.split('/').pop()!;

  let handler: ToolHandler | undefined;
  let owningTool: Tool | undefined;
  for (const tool of ctx.tools) {
    const h = tool.handlers.find(handler => handler.name === toolName);
    if (h) {
      handler = h;
      owningTool = tool;
      break;
    }
  }

  if (!handler || !owningTool) {
    return sendJson(res, 404, { error: `Unknown tool: ${toolName}` });
  }

  let user: UserContext;
  try {
    user = ctx.skipAuth ? devUser() : await authenticate(req, ctx.platform);
  } catch (err) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const body = await readJson(req);
  let parsedInput: unknown;
  try {
    parsedInput = handler.inputSchema.parse(body);
  } catch (err: any) {
    return sendJson(res, 400, { error: 'Invalid input', details: err?.errors ?? err?.message });
  }

  try {
    const toolContext = await buildToolContext(
      owningTool, handler, ctx.platform, user, ctx.requestId
    );
    const result = await handler.handler(parsedInput, toolContext);
    return sendJson(res, 200, result);
  } catch (err: any) {
    ctx.logger.error('Tool handler failed', { tool: toolName, error: err?.message });
    return sendJson(res, 500, { error: err?.message ?? 'Tool execution failed' });
  }
}

async function authenticate(req: IncomingMessage, platform: Platform): Promise<UserContext> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing Bearer token', 'INVALID_TOKEN');
  }
  return platform.auth.validateToken(authHeader.slice('Bearer '.length));
}

function devUser(): UserContext {
  return {
    userId: 'dev-user',
    tenantId: process.env.DEFAULT_TENANT_ID ?? 'default',
    displayName: 'Dev User',
    roles: ['admin', 'user'],
    claims: {}
  };
}

function buildMcpServerForUser(
  tools: Tool[],
  platform: Platform,
  user: UserContext,
  requestId: string
): McpServer {
  const server = new McpServer({
    name: 's4ready-mcp',
    version: '1.0.0'
  });

  for (const tool of tools) {
    for (const handler of tool.handlers) {
      const schemaShape =
        handler.inputSchema instanceof z.ZodObject
          ? handler.inputSchema.shape
          : { input: handler.inputSchema };

      server.tool(
        handler.name,
        handler.description,
        schemaShape as any,
        async (input: Record<string, any>) => {
          try {
            const parsed = handler.inputSchema.parse(input);
            const toolContext = await buildToolContext(
              tool, handler, platform, user, requestId
            );
            const result = await handler.handler(parsed, toolContext);
            return {
              content: [{
                type: 'text' as const,
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
              }]
            };
          } catch (err: any) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({ success: false, error: err?.message ?? 'Tool failed' })
              }],
              isError: true
            };
          }
        }
      );
    }
  }
  return server;
}

async function buildToolContext(
  tool: Tool,
  _handler: ToolHandler,
  platform: Platform,
  user: UserContext,
  requestId: string
): Promise<ToolContext> {
  const tenantConfig = await platform.config.getTenantConfig(user.tenantId);
  const toolConfig = await platform.config.getToolConfig(user.tenantId, tool.manifest.id) ?? {};
  const sap = await platform.createSapConnector(user, tenantConfig);

  return {
    manifest: tool.manifest,
    user,
    toolConfig,
    sap,
    ai: platform.ai,
    audit: platform.audit,
    cache: platform.cache,
    logger: platform.logger.child({
      requestId,
      tenantId: user.tenantId,
      userId: user.userId,
      tool: tool.manifest.id
    }),
    requestId
  };
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
