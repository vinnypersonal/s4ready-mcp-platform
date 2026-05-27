-- Migration 002: Audit log table

CREATE TABLE IF NOT EXISTS audit_log (
  id           BIGSERIAL PRIMARY KEY,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category     TEXT NOT NULL,
  tenant_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  action       TEXT NOT NULL,
  tool_id      TEXT,
  resource     TEXT,
  outcome      TEXT NOT NULL CHECK (outcome IN ('success','failure','denied')),
  duration_ms  INTEGER,
  metadata     JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_ts
  ON audit_log (tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_user
  ON audit_log (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_tool
  ON audit_log (tool_id, timestamp DESC) WHERE tool_id IS NOT NULL;

COMMENT ON TABLE audit_log IS
  'Immutable audit trail. One row per tool invocation, config change, or security event.';
