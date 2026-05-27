/**
 * The contract every s4ready tool implements.
 *
 * A tool is a self-contained npm package that:
 *   - Exports a default `Tool` object
 *   - Declares its metadata (manifest)
 *   - Provides MCP tool handlers
 *   - Optionally provides REST handlers, scheduled jobs, etc.
 */

import type { z } from 'zod';
import type { UserContext } from './auth-provider';
import type { SapConnector } from './sap-connector';
import type { AiClient } from './ai-client';
import type { ConfigStore } from './config-store';
import type { AuditLog } from './audit-log';
import type { Cache } from './cache';
import type { Logger } from '../utils/logger';
import type { SapVersion } from '../sap/versions';

/**
 * Static metadata about the tool, declared once.
 */
export interface ToolManifest {
  /** Stable identifier, kebab-case. */
  id: string;
  /** Human-readable name. */
  displayName: string;
  /** Semver. */
  version: string;
  /** Long description for the catalog. */
  description: string;
  /** technical | functional — used for catalog filtering. */
  category: 'technical' | 'functional';
  /** Personas that benefit. */
  personas?: string[];
  /** Which SAP versions this tool works with. */
  supportedSapVersions: SapVersion[];
  /** Whether the tool needs SAP connectivity at all. */
  requiresSap: boolean;
  /** Required tenant scopes / XSUAA scopes. */
  requiredScopes?: string[];
  /** Required SAP OData services (informational, for prereqs doc). */
  requiredSapServices?: string[];
}

/**
 * Context passed to every tool handler. Already authenticated, tenant
 * resolved, services bound.
 */
export interface ToolContext {
  /** Tool manifest, for self-introspection. */
  manifest: ToolManifest;
  /** Authenticated user. */
  user: UserContext;
  /** Tool-specific config, resolved from tenant YAML. */
  toolConfig: Record<string, unknown>;
  /** SAP connector, pre-authed for this request. */
  sap: SapConnector;
  /** AI client. */
  ai: AiClient;
  /** Audit writer. */
  audit: AuditLog;
  /** Cache. */
  cache: Cache;
  /** Logger pre-tagged with tenant + request id. */
  logger: Logger;
  /** Request id for tracing. */
  requestId: string;
}

/**
 * Definition of one MCP tool exposed by this s4ready tool.
 * (Yes, "tool" is overloaded: an s4ready tool exposes multiple MCP tools.)
 */
export interface ToolHandler<TInput = unknown, TOutput = unknown> {
  /** MCP tool name, e.g. "get_partner_360". Lowercase + underscores. */
  name: string;
  /** Description shown to the LLM. */
  description: string;
  /** Zod schema for input validation. */
  inputSchema: z.ZodSchema<TInput>;
  /** Handler function. */
  handler: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

/**
 * Optional REST endpoint exposed by the tool, for direct API consumption
 * (web chat UI, third-party integrations).
 */
export interface RestHandler {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  handler: (req: {
    body: unknown;
    query: Record<string, string>;
    params: Record<string, string>;
  }, context: ToolContext) => Promise<{ status: number; body: unknown }>;
}

/**
 * The thing every tool exports as default.
 */
export interface Tool {
  manifest: ToolManifest;

  /** MCP tool handlers exposed by this tool. */
  handlers: ToolHandler<any, any>[];

  /** Optional REST endpoints. */
  restHandlers?: RestHandler[];

  /** Called once at startup. Use for warming caches, validating config. */
  initialize?: (deps: {
    config: ConfigStore;
    logger: Logger;
  }) => Promise<void>;

  /** Called on shutdown. Use for flushing buffers, closing connections. */
  shutdown?: () => Promise<void>;
}
