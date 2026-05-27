/**
 * Audit logging. Every tool invocation, config change, and security event
 * is captured for compliance and customer-facing audit trails.
 *
 * BTP mode: writes to SAP Audit Log Service.
 * Standalone mode: writes to a PostgreSQL audit table.
 */

export interface AuditEvent {
  /** ISO 8601 timestamp, set automatically if omitted. */
  timestamp?: string;

  /** What category of event. */
  category: 'tool_invocation' | 'config_change' | 'auth' | 'data_access' | 'admin' | 'error';

  /** Tenant the event belongs to. */
  tenantId: string;

  /** User who triggered the event, or 'system' for automated ones. */
  userId: string;

  /** Free-form short description. Avoid PII. */
  action: string;

  /** Tool involved, if applicable. */
  toolId?: string;

  /** SAP entity involved, e.g. "vendor 1000234" — masked if sensitive. */
  resource?: string;

  /** Outcome of the action. */
  outcome: 'success' | 'failure' | 'denied';

  /** Latency in milliseconds, when applicable. */
  durationMs?: number;

  /** Additional structured context. Do not log secrets. */
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  /**
   * Record an audit event. Should never throw — log internally if it fails.
   */
  write(event: AuditEvent): Promise<void>;

  /**
   * Query recent events. Used by admin portal.
   * Implementations should enforce a max result count.
   */
  query(filter: {
    tenantId: string;
    fromDate?: string;
    toDate?: string;
    category?: AuditEvent['category'];
    userId?: string;
    toolId?: string;
    limit?: number;
  }): Promise<AuditEvent[]>;
}
