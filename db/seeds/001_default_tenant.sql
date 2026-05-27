-- Seed: default tenant for local development
-- This creates a "default" tenant that works with SKIP_AUTH=true and
-- SAP_MODE=mock so you can run the tool on your laptop with zero config.

INSERT INTO tenant_config (tenant_id, version, yaml_body, valid_from)
VALUES (
  'default',
  1,
  $YAML$
tenant:
  id: default
  name: Local Development Tenant
  region: local
  subscription_tier: enterprise
  contact:
    admin_email: dev@localhost

sap_systems:
  - id: MOCK
    description: Mock S/4HANA (built-in test data)
    destination_name: MOCK
    type: s4hana_cloud_public
    default: true

tools:
  vendor360:
    enabled: true
    config:
      default_months_back: 12
      modules_vendor: [MM, FI, QM]
      modules_customer: [SD, FI]
      external_enrichment: []
      kpi_definitions:
        overdue_threshold_days: 30
        late_delivery_tolerance_days: 2
      role_visibility:
        bank_details: [admin]
        pricing: [user, admin]
        full_view: [admin]

ai:
  default_model: claude-sonnet-4-6
  narrative_language: en
  redact_pii_before_llm: false
  audit_all_prompts: false
  token_budget_per_query: 5000
  monthly_token_quota: 500000

channels:
  s4ready_web:
    enabled: true

billing:
  meter_type: flat
$YAML$,
  NOW()
)
ON CONFLICT (tenant_id, version) DO NOTHING;
