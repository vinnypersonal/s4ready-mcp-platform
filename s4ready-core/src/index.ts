/**
 * @s4ready/core - Shared platform library for s4ready.ai agent tools.
 *
 * This library provides:
 *   - Platform service interfaces (auth, config, audit, SAP, AI)
 *   - BTP and standalone adapter implementations
 *   - MCP server scaffolding for tool authors
 *   - Tool registration and lifecycle hooks
 *   - Logging, metrics, cost controls
 *
 * Tool authors import from this package and never reimplement these concerns.
 */

// Interfaces
export * from './interfaces/auth-provider';
export * from './interfaces/config-store';
export * from './interfaces/audit-log';
export * from './interfaces/sap-connector';
export * from './interfaces/ai-client';
export * from './interfaces/cache';
export * from './interfaces/tool';

// Platform factory
export { createPlatform, PlatformOptions, Platform } from './platform';

// MCP server
export { createMcpServer, McpServerOptions } from './mcp/server';

// Utilities
export { Logger, createLogger } from './utils/logger';
export { TokenBudget } from './utils/token-budget';

// SAP version detection / typing
export {
  SapVersion,
  SapSystemType,
  SAP_VERSIONS_ALL,
  SAP_VERSIONS_S4_ONLY,
  isS4HanaVersion,
  isEccVersion
} from './sap/versions';

// Re-export commonly used types from MCP SDK so tool authors don't need a second dep
export type {
  Tool as McpToolDefinition,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
