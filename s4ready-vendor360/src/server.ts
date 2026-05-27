/**
 * s4ready Vendor 360 — Server entrypoint.
 *
 * Boots the platform adapters (based on DEPLOY_MODE env var),
 * registers the vendor360 tool, and starts the MCP + REST HTTP server.
 *
 *   DEPLOY_MODE=standalone  → PostgreSQL + Anthropic direct + JWT auth
 *   DEPLOY_MODE=btp         → HANA Cloud + AI Core + XSUAA (CF bindings)
 *   SAP_MODE=mock           → No SAP system needed (great for demos)
 */

import 'dotenv/config';
import { createPlatform, createMcpServer } from '@s4ready/core';
import vendor360Tool from './tool';

async function main() {
  const platform = await createPlatform();

  const server = await createMcpServer({
    platform,
    tools: [vendor360Tool],
    skipAuth: process.env.SKIP_AUTH === 'true'
  });

  // Graceful shutdown.
  const shutdown = async (signal: string) => {
    platform.logger.info(`Received ${signal}, shutting down…`);
    await server.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('[s4ready] Fatal startup error:', err);
  process.exit(1);
});
