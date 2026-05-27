import type { ConfigStore, TenantConfig } from '../../interfaces/config-store';

const DEFAULT_TENANT: TenantConfig = {
  tenant: {
    id: 'default',
    name: 'Dev Tenant',
    subscription_tier: 'pro'
  },
  sap_systems: [
    {
      id: 'default',
      destination_name: 'S4H_MOCK',
      type: 's4hana_cloud_public',
      default: true
    }
  ],
  tools: {
    vendor360: { enabled: true }
  }
};

export class InMemoryConfigStore implements ConfigStore {
  private configs = new Map<string, TenantConfig>();

  constructor(defaults?: Record<string, TenantConfig>) {
    if (defaults) {
      for (const [id, cfg] of Object.entries(defaults)) {
        this.configs.set(id, cfg);
      }
    }
  }

  async getTenantConfig(tenantId: string): Promise<TenantConfig> {
    const cfg = this.configs.get(tenantId) ?? { ...DEFAULT_TENANT, tenant: { ...DEFAULT_TENANT.tenant, id: tenantId } };
    return cfg;
  }

  async getToolConfig<T = Record<string, unknown>>(tenantId: string, toolId: string): Promise<T | undefined> {
    const cfg = await this.getTenantConfig(tenantId);
    const tool = cfg.tools[toolId];
    if (!tool?.enabled) return undefined;
    return (tool.config ?? {}) as T;
  }

  async invalidate(_tenantId: string): Promise<void> {}

  async listTenants(): Promise<string[]> {
    return [...this.configs.keys()];
  }

  async saveTenantConfig(config: TenantConfig): Promise<void> {
    this.configs.set(config.tenant.id, config);
  }
}
