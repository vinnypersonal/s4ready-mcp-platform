-- Migration 001: Tenant configuration store
-- Run on first deployment. Safe to re-run (idempotent).

CREATE TABLE IF NOT EXISTS tenant_config (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  version      INTEGER NOT NULL DEFAULT 1,
  yaml_body    TEXT NOT NULL,
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_to     TIMESTAMPTZ,
  created_by   TEXT DEFAULT 'system',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, version)
);

CREATE INDEX IF NOT EXISTS idx_tenant_config_active
  ON tenant_config (tenant_id, valid_to)
  WHERE valid_to IS NULL;

COMMENT ON TABLE tenant_config IS
  'Versioned tenant configuration. Each new save adds a row and sets valid_to on the previous version.';
