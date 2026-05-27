/**
 * AuditLog backed by PostgreSQL. Used in standalone mode.
 * Best-effort writes — never throws back to the caller.
 */

import { Pool, type PoolConfig } from 'pg';
import type { AuditEvent, AuditLog } from '../../interfaces/audit-log';
import type { Logger } from '../../utils/logger';

export class PostgresAuditLog implements AuditLog {
  private readonly pool: Pool;
  private readonly logger?: Logger;

  constructor(options: { pg: PoolConfig | Pool; logger?: Logger }) {
    this.pool = options.pg instanceof Pool ? options.pg : new Pool(options.pg);
    this.logger = options.logger;
  }

  async write(event: AuditEvent): Promise<void> {
    const timestamp = event.timestamp ?? new Date().toISOString();
    try {
      await this.pool.query(
        `INSERT INTO audit_log
         (timestamp, category, tenant_id, user_id, action, tool_id, resource, outcome, duration_ms, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          timestamp,
          event.category,
          event.tenantId,
          event.userId,
          event.action,
          event.toolId ?? null,
          event.resource ?? null,
          event.outcome,
          event.durationMs ?? null,
          event.metadata ? JSON.stringify(event.metadata) : null
        ]
      );
    } catch (err) {
      this.logger?.error('Audit write failed', {
        error: err instanceof Error ? err.message : String(err),
        event
      });
    }
  }

  async query(filter: {
    tenantId: string;
    fromDate?: string;
    toDate?: string;
    category?: AuditEvent['category'];
    userId?: string;
    toolId?: string;
    limit?: number;
  }): Promise<AuditEvent[]> {
    const where: string[] = ['tenant_id = $1'];
    const params: unknown[] = [filter.tenantId];

    if (filter.fromDate) {
      params.push(filter.fromDate);
      where.push(`timestamp >= $${params.length}`);
    }
    if (filter.toDate) {
      params.push(filter.toDate);
      where.push(`timestamp <= $${params.length}`);
    }
    if (filter.category) {
      params.push(filter.category);
      where.push(`category = $${params.length}`);
    }
    if (filter.userId) {
      params.push(filter.userId);
      where.push(`user_id = $${params.length}`);
    }
    if (filter.toolId) {
      params.push(filter.toolId);
      where.push(`tool_id = $${params.length}`);
    }

    const limit = Math.min(filter.limit ?? 100, 1000);
    params.push(limit);

    const sql = `
      SELECT timestamp, category, tenant_id, user_id, action,
             tool_id, resource, outcome, duration_ms, metadata
      FROM audit_log
      WHERE ${where.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT $${params.length}
    `;

    const result = await this.pool.query(sql, params);

    return result.rows.map(r => ({
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
      category: r.category,
      tenantId: r.tenant_id,
      userId: r.user_id,
      action: r.action,
      toolId: r.tool_id ?? undefined,
      resource: r.resource ?? undefined,
      outcome: r.outcome,
      durationMs: r.duration_ms ?? undefined,
      metadata: r.metadata ?? undefined
    }));
  }
}
