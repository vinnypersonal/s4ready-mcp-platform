/**
 * ConfigStore backed by PostgreSQL. Used in standalone mode.
 * Schema migration in db/migrations/001_create_tenant_config.sql.
 */

import { Pool, type PoolConfig } from 'pg';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ConfigStore, TenantConfig } from '../../interfaces/config-store';
import type { Logger } from '../../utils/logger';

interface CacheEntry {
  config: TenantConfig;
  loadedAt: number;
}

export interface PostgresConfigStoreOptions {
  /** Postgres connection details. */
  pg: PoolConfig | Pool;
  /** Cache TTL in seconds. */
  cacheTtlSeconds?: number;
  logger?: Logger;
}

export class PostgresConfigStore implements ConfigStore {
  private readonly pool: Pool;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly logger?: Logger;

  constructor(options: PostgresConfigStoreOptions) {
    this.pool = options.pg instanceof Pool ? options.pg : new Pool(options.pg);
    this.cacheTtlMs = (options.cacheTtlSeconds ?? 300) * 1000;
    this.logger = options.logger;
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.loadedAt < this.cacheTtlMs) {
      return cached.config;
    }

    const result = await this.pool.query<{ yaml_body: string }>(
      `SELECT yaml_body
       FROM tenant_config
       WHERE tenant_id = $1
         AND (valid_to IS NULL OR valid_to > NOW())
       ORDER BY version DESC
       LIMIT 1`,
      [tenantId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const yaml = result.rows[0].yaml_body;
    const config = parseYaml(yaml) as TenantConfig;
    this.cache.set(tenantId, { config, loadedAt: Date.now() });
    return config;
  }

  async getToolConfig<T = Record<string, unknown>>(
    tenantId: string,
    toolId: string
  ): Promise<T | undefined> {
    const tenant = await this.getTenantConfig(tenantId);
    const toolEntry = tenant.tools[toolId];
    if (!toolEntry?.enabled) return undefined;
    return (toolEntry.config ?? {}) as T;
  }

  async invalidate(tenantId: string): Promise<void> {
    this.cache.delete(tenantId);
  }

  async listTenants(): Promise<string[]> {
    const result = await this.pool.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id FROM tenant_config WHERE valid_to IS NULL OR valid_to > NOW()`
    );
    return result.rows.map(r => r.tenant_id);
  }

  async saveTenantConfig(config: TenantConfig): Promise<void> {
    const tenantId = config.tenant.id;
    const yaml = stringifyYaml(config);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Mark current active version as superseded.
      await client.query(
        `UPDATE tenant_config SET valid_to = NOW() WHERE tenant_id = $1 AND valid_to IS NULL`,
        [tenantId]
      );
      // Insert new version.
      await client.query(
        `INSERT INTO tenant_config (tenant_id, version, yaml_body, valid_from)
         VALUES ($1,
                 COALESCE((SELECT MAX(version) FROM tenant_config WHERE tenant_id = $1), 0) + 1,
                 $2,
                 NOW())`,
        [tenantId, yaml]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    this.cache.delete(tenantId);
    this.logger?.info('Tenant config saved', { tenantId });
  }
}
