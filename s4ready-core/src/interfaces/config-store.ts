/**
 * Tenant configuration. Loads per-tenant YAML/JSON config from storage
 * (HANA in BTP mode, Postgres in standalone), caches in-memory with TTL,
 * exposes typed accessors for tool authors.
 */

export interface TenantConfig {
  tenant: {
    id: string;
    name: string;
    region?: string;
    subscription_tier: 'free' | 'pro' | 'team' | 'enterprise';
    contact?: {
      admin_email?: string;
      technical_contact?: string;
    };
  };

  sap_systems: Array<{
    id: string;
    description?: string;
    /** Destination name in BTP, or connection alias in standalone */
    destination_name: string;
    type: 's4hana_cloud_public' | 's4hana_cloud_private' | 's4hana_on_prem' | 'ecc';
    release?: string;
    default?: boolean;
    /** Override for standalone mode — direct connection details */
    direct?: {
      base_url: string;
      auth_type: 'basic' | 'oauth2_password' | 'oauth2_saml_bearer' | 'principal_propagation';
      username_ref?: string;
      password_ref?: string;
      sap_client?: string;
    };
  }>;

  /** Tool-specific config, keyed by tool id. */
  tools: Record<string, {
    enabled: boolean;
    config?: Record<string, unknown>;
  }>;

  ai?: {
    default_model?: string;
    fallback_model?: string;
    narrative_language?: string;
    redact_pii_before_llm?: boolean;
    audit_all_prompts?: boolean;
    token_budget_per_query?: number;
    monthly_token_quota?: number;
  };

  channels?: {
    joule?: { enabled: boolean; agent_hub_registration_id?: string };
    s4ready_web?: { enabled: boolean; sso_provider?: string };
    ms_teams?: { enabled: boolean };
    whatsapp?: { enabled: boolean };
  };

  branding?: {
    display_name?: string;
    primary_color?: string;
    logo_url?: string;
  };

  billing?: {
    meter_type?: 'per_active_user' | 'per_query' | 'flat';
    monthly_quota?: { queries?: number; users?: number };
    overage_policy?: 'block' | 'notify_and_continue';
  };
}

export interface ConfigStore {
  /**
   * Fetch the active config for a tenant. May return cached value.
   * Throws if tenant doesn't exist.
   */
  getTenantConfig(tenantId: string): Promise<TenantConfig>;

  /**
   * Get tool-specific config for the given tenant + tool, with type safety.
   * Returns undefined if the tool is not enabled for the tenant.
   */
  getToolConfig<T = Record<string, unknown>>(
    tenantId: string,
    toolId: string
  ): Promise<T | undefined>;

  /**
   * Force-refresh the cached config for a tenant.
   * Called when admin portal saves new config.
   */
  invalidate(tenantId: string): Promise<void>;

  /**
   * List all tenant IDs known to the store. Used for admin views.
   */
  listTenants(): Promise<string[]>;

  /**
   * Admin operation: write a new config version.
   * Old versions retained for audit.
   */
  saveTenantConfig(config: TenantConfig): Promise<void>;
}
