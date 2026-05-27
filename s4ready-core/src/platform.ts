/**
 * Platform factory. The single public entry point that wires together all
 * adapters for the chosen deploy mode and exposes them to tool code.
 *
 *   const platform = await createPlatform({ mode: 'standalone' });
 *   const server = createMcpServer({ platform, tools: [...] });
 *
 * Every tool receives services through the ToolContext, never imports
 * adapters directly. This is what makes the codebase deployment-agnostic.
 */

import type { AuthProvider } from './interfaces/auth-provider';
import type { ConfigStore } from './interfaces/config-store';
import type { AuditLog } from './interfaces/audit-log';
import type { AiClient } from './interfaces/ai-client';
import type { SapConnector } from './interfaces/sap-connector';
import type { Cache } from './interfaces/cache';
import type { TenantConfig } from './interfaces/config-store';
import type { UserContext } from './interfaces/auth-provider';
import { createLogger, type Logger } from './utils/logger';
import { TokenBudget } from './utils/token-budget';

// Standalone adapters
import { JwtAuthProvider } from './adapters/standalone/jwt-auth';
import { PostgresConfigStore } from './adapters/standalone/postgres-config-store';
import { PostgresAuditLog } from './adapters/standalone/postgres-audit-log';
import { DirectSapConnector } from './adapters/standalone/direct-sap-connector';
import { MockSapConnector } from './adapters/standalone/mock-sap-connector';
import { AnthropicAiClient } from './adapters/standalone/anthropic-ai-client';
import { InMemoryCache } from './adapters/standalone/in-memory-cache';

// BTP adapters
import { XsuaaAuthProvider } from './adapters/btp/xsuaa-auth';
import { BtpSapConnector } from './adapters/btp/btp-sap-connector';
import { SapAuditLog } from './adapters/btp/sap-audit-log';
import { AiCoreClient } from './adapters/btp/ai-core-client';

import { Pool } from 'pg';

export type DeployMode = 'btp' | 'standalone' | 'hybrid';

export interface PlatformOptions {
  mode?: DeployMode;
  /** Logger to use (one will be created if omitted). */
  logger?: Logger;
  /** Override individual services for testing. */
  overrides?: {
    auth?: AuthProvider;
    config?: ConfigStore;
    audit?: AuditLog;
    ai?: AiClient;
    cache?: Cache;
  };
}

/**
 * The Platform object: wires services together. SapConnector is per-request
 * (needs tenant config + user token) so it's a factory function rather than
 * a singleton.
 */
export interface Platform {
  mode: DeployMode;
  logger: Logger;
  auth: AuthProvider;
  config: ConfigStore;
  audit: AuditLog;
  ai: AiClient;
  cache: Cache;
  /**
   * Build a SapConnector for a specific user + tenant. The connector embeds
   * the user's token (for principal propagation in BTP mode) and the
   * tenant's SAP system list.
   */
  createSapConnector(user: UserContext, tenantConfig: TenantConfig): Promise<SapConnector>;
  /** Graceful shutdown — closes pools, sweeps caches. */
  shutdown(): Promise<void>;
}

const DEFAULT_MODE: DeployMode = (process.env.DEPLOY_MODE as DeployMode) || 'standalone';

export async function createPlatform(options: PlatformOptions = {}): Promise<Platform> {
  const mode = options.mode ?? DEFAULT_MODE;
  const logger = options.logger ?? createLogger({ component: 'platform', mode });

  logger.info('Initializing s4ready platform', { mode });

  const budget = new TokenBudget();
  const cache: Cache = options.overrides?.cache ?? new InMemoryCache(300);

  let auth: AuthProvider;
  let config: ConfigStore;
  let audit: AuditLog;
  let ai: AiClient;

  if (mode === 'btp') {
    // BTP mode: bind everything from VCAP_SERVICES.
    const vcap = JSON.parse(process.env.VCAP_SERVICES ?? '{}');

    if (!options.overrides?.auth) {
      auth = XsuaaAuthProvider.fromVcapServices();
    } else {
      auth = options.overrides.auth;
    }

    // Config store in BTP mode could be HANA Cloud; for v1 we still use
    // Postgres-style storage on top of HANA (HANA accepts Postgres-style
    // queries via the HDI container's JDBC). For simplicity in v1 we expect
    // a Postgres-compatible connection string from the HANA HDI binding.
    if (!options.overrides?.config) {
      const hanaBinding = vcap.hana?.[0]?.credentials
        ?? vcap['hana-cloud']?.[0]?.credentials;
      if (!hanaBinding) {
        throw new Error('HANA service binding not found. BTP mode requires HANA Cloud.');
      }
      // HANA Cloud binding typically exposes host, port, user, password, schema.
      // We use node-postgres as a generic SQL client; for production a HANA
      // native driver (@sap/hana-client) is recommended.
      const pool = new Pool({
        host: hanaBinding.host,
        port: hanaBinding.port,
        user: hanaBinding.user,
        password: hanaBinding.password,
        database: hanaBinding.schema ?? hanaBinding.database,
        ssl: { rejectUnauthorized: false }
      });
      config = new PostgresConfigStore({ pg: pool, logger });
    } else {
      config = options.overrides.config;
    }

    if (!options.overrides?.audit) {
      const auditBinding = vcap.auditlog?.[0]?.credentials;
      if (auditBinding) {
        audit = new SapAuditLog(auditBinding, logger);
      } else {
        logger.warn('Audit Log service not bound; falling back to local logging');
        audit = new LocalConsoleAuditLog(logger);
      }
    } else {
      audit = options.overrides.audit;
    }

    if (!options.overrides?.ai) {
      const aiBinding = vcap.aicore?.[0]?.credentials;
      if (!aiBinding) {
        throw new Error('AI Core service binding not found in BTP mode');
      }
      ai = new AiCoreClient({
        credentials: aiBinding,
        budget,
        logger
      });
    } else {
      ai = options.overrides.ai;
    }
  } else {
    // Standalone mode: read all settings from env vars.
    auth = options.overrides?.auth ?? new JwtAuthProvider({
      issuer: process.env.OIDC_ISSUER,
      jwksUri: process.env.OIDC_JWKS_URI,
      audience: process.env.OIDC_AUDIENCE,
      secret: process.env.JWT_SECRET,
      tenantClaim: process.env.JWT_TENANT_CLAIM ?? 'tenant_id'
    });

    if (!options.overrides?.config) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      config = new PostgresConfigStore({ pg: pool, logger });
    } else {
      config = options.overrides.config;
    }

    if (!options.overrides?.audit) {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });
      audit = new PostgresAuditLog({ pg: pool, logger });
    } else {
      audit = options.overrides.audit;
    }

    if (!options.overrides?.ai) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        logger.warn('ANTHROPIC_API_KEY not set; AI features will be unavailable');
        ai = new NullAiClient();
      } else {
        ai = new AnthropicAiClient({
          apiKey,
          defaultModel: process.env.AI_MODEL ?? 'claude-sonnet-4-6',
          budget,
          logger
        });
      }
    } else {
      ai = options.overrides.ai;
    }
  }

  const createSapConnector = async (
    user: UserContext,
    tenantConfig: TenantConfig
  ): Promise<SapConnector> => {
    // Mock mode short-circuits everything — used in dev and tests.
    if (process.env.SAP_MODE === 'mock') {
      return new MockSapConnector();
    }

    if (mode === 'btp') {
      return new BtpSapConnector({
        tenantConfig,
        userToken: user.propagationToken,
        logger
      });
    }

    return new DirectSapConnector({
      tenantConfig,
      secretResolver: defaultSecretResolver,
      rejectUnauthorized: process.env.SAP_INSECURE_TLS !== 'true',
      logger
    });
  };

  return {
    mode,
    logger,
    auth,
    config,
    audit,
    ai,
    cache,
    createSapConnector,
    async shutdown() {
      if (cache instanceof InMemoryCache) cache.destroy();
      logger.info('Platform shutdown complete');
    }
  };
}

/**
 * Resolve secret references like "tenant://acme/secrets/key" against env vars.
 * Format: SECRET_<TENANT>_<KEY>. Trivial implementation; production should
 * use a real secret store (BTP Credential Store, HashiCorp Vault).
 */
async function defaultSecretResolver(ref: string): Promise<string> {
  // tenant://<tenant>/secrets/<key>
  const match = ref.match(/^tenant:\/\/([^/]+)\/secrets\/(.+)$/);
  if (!match) {
    // Treat as a literal env var name.
    return process.env[ref] ?? '';
  }
  const [, tenant, key] = match;
  const envKey = `SECRET_${tenant.toUpperCase().replace(/-/g, '_')}_${key.toUpperCase()}`;
  return process.env[envKey] ?? '';
}

/**
 * Audit log that just writes to the application logger. Used as a safe
 * fallback when no audit backend is bound.
 */
class LocalConsoleAuditLog implements AuditLog {
  constructor(private readonly logger: Logger) {}
  async write(event: import('./interfaces/audit-log').AuditEvent): Promise<void> {
    this.logger.info('AUDIT', event as unknown as Record<string, unknown>);
  }
  async query(): Promise<import('./interfaces/audit-log').AuditEvent[]> {
    return [];
  }
}

/**
 * AI client that throws on use. Used when no AI key is configured to keep
 * the platform bootable for non-AI dev tasks.
 */
class NullAiClient implements AiClient {
  async complete(): Promise<never> {
    throw new Error('AI client not configured. Set ANTHROPIC_API_KEY or run in BTP mode.');
  }
  async embed(): Promise<never> {
    throw new Error('AI client not configured.');
  }
  async getBudgetStatus() {
    return {
      monthlyQuota: 0,
      consumed: 0,
      remaining: 0,
      resetAt: new Date().toISOString()
    };
  }
}
