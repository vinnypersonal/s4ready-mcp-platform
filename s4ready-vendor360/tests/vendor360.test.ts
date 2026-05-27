/**
 * Vendor 360 integration tests. Run against mock SAP — no live system needed.
 * These exercise the full stack: tool handler → aggregator → narrative.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createPlatform } from '@s4ready/core';
import type { Platform, ToolContext } from '@s4ready/core';
import vendor360Tool from '../src/tool';

// Minimal tenant config for tests — no DB, no real SAP, no real AI.
const DEMO_TENANT = {
  tenant: { id: 'demo', name: 'Demo', subscription_tier: 'enterprise' as const },
  sap_systems: [{
    id: 'MOCK', description: 'Mock S/4', destination_name: 'MOCK',
    type: 's4hana_cloud_public' as const, default: true
  }],
  tools: { vendor360: { enabled: true, config: {} } }
};

const DEMO_USER = {
  userId: 'test-user',
  tenantId: 'demo',
  roles: ['user'],
  claims: {}
};

let platform: Platform;

beforeAll(async () => {
  process.env.SAP_MODE = 'mock';
  process.env.SKIP_AUTH = 'true';
  process.env.DEFAULT_TENANT_ID = 'demo';

  platform = await createPlatform({
    mode: 'standalone',
    overrides: {
      config: {
        async getTenantConfig() { return DEMO_TENANT as any; },
        async getToolConfig() { return {}; },
        async invalidate() {},
        async listTenants() { return ['demo']; },
        async saveTenantConfig() {}
      },
      audit: {
        async write() {},
        async query() { return []; }
      },
      ai: {
        async complete() {
          return {
            text: 'Tata Steel is an active vendor with good payment history. No critical issues found.',
            usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
            model: 'mock',
            durationMs: 10
          };
        },
        async embed() { return { embeddings: [[0.1, 0.2]], tokensUsed: 10 }; },
        async getBudgetStatus() { return { monthlyQuota: 100000, consumed: 0, remaining: 100000, resetAt: '' }; }
      }
    }
  });

  await vendor360Tool.initialize?.({ config: platform.config, logger: platform.logger });
});

async function makeContext(overrides?: Partial<ToolContext>): Promise<ToolContext> {
  const tenantConfig = await platform.config.getTenantConfig('demo');
  const sap = await platform.createSapConnector(DEMO_USER, tenantConfig);
  return {
    manifest: vendor360Tool.manifest,
    user: DEMO_USER,
    toolConfig: {},
    sap,
    ai: platform.ai,
    audit: platform.audit,
    cache: platform.cache,
    logger: platform.logger.child({ test: true }),
    requestId: 'test-req-001',
    ...overrides
  };
}

// ── search_business_partner ───────────────────────────────────────────────

describe('search_business_partner', () => {
  it('finds Tata Steel by name', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'search_business_partner')!;
    const ctx = await makeContext();
    const result = await handler.handler({ query: 'tata', partnerType: 'BOTH', limit: 10 }, ctx) as any;

    expect(result.success).toBe(true);
    expect(result.results.length).toBeGreaterThan(0);
    const tata = result.results.find((r: any) => r.name.toLowerCase().includes('tata'));
    expect(tata).toBeDefined();
    expect(tata.id).toBe('1000234');
  });

  it('finds partner by exact ID', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'search_business_partner')!;
    const ctx = await makeContext();
    const result = await handler.handler({ query: '1000234', partnerType: 'BOTH', limit: 5 }, ctx) as any;
    expect(result.success).toBe(true);
    expect(result.results.some((r: any) => r.id === '1000234')).toBe(true);
  });

  it('returns empty results for unknown partner', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'search_business_partner')!;
    const ctx = await makeContext();
    const result = await handler.handler({ query: 'XXXXXXXXNONEXISTENT', partnerType: 'BOTH', limit: 5 }, ctx) as any;
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
  });

  it('filters by VENDOR type', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'search_business_partner')!;
    const ctx = await makeContext();
    const result = await handler.handler({ query: '', partnerType: 'VENDOR', limit: 20 }, ctx) as any;
    expect(result.success).toBe(true);
    result.results.forEach((r: any) => {
      expect(r.type === 'VENDOR' || r.type === 'BOTH').toBe(true);
    });
  });
});

// ── get_partner_360 ───────────────────────────────────────────────────────

describe('get_partner_360', () => {
  it('returns full 360 for Tata Steel', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_360')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerId: '1000234',
      partnerType: 'AUTO',
      monthsBack: 12,
      includeNarrative: true
    }, ctx) as any;

    expect(result.success).toBe(true);
    expect(result.partner.name).toContain('Tata Steel');
    expect(result.kpis).toBeDefined();
    expect(result.kpis.totalSpendOrRevenue).toBeGreaterThan(0);
    expect(result.riskFlags).toBeInstanceOf(Array);
    expect(result.recentTransactions).toBeInstanceOf(Array);
    expect(result.narrative).toBeTruthy();
  });

  it('detects blocked vendor', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_360')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerId: '1000238', partnerType: 'AUTO', monthsBack: 12, includeNarrative: false
    }, ctx) as any;

    expect(result.success).toBe(true);
    expect(result.partner.isBlocked).toBe(true);
    const blockedFlag = result.riskFlags.find((f: any) => f.code === 'PARTNER_BLOCKED');
    expect(blockedFlag).toBeDefined();
    expect(blockedFlag.severity).toBe('high');
  });

  it('returns error for unknown partner', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_360')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerId: 'DOES_NOT_EXIST', partnerType: 'AUTO', monthsBack: 12, includeNarrative: false
    }, ctx) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('skips narrative when includeNarrative=false', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_360')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerId: '1000234', partnerType: 'VENDOR', monthsBack: 6, includeNarrative: false
    }, ctx) as any;
    expect(result.success).toBe(true);
    expect(result.narrative).toBeUndefined();
  });
});

// ── get_partner_risk_summary ──────────────────────────────────────────────

describe('get_partner_risk_summary', () => {
  it('scores multiple partners', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_risk_summary')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerIds: ['1000234', '1000238']
    }, ctx) as any;

    expect(result.success).toBe(true);
    expect(result.partners).toHaveLength(2);

    // Blocked vendor (1000238) should have higher risk than healthy vendor (1000234)
    const blocked = result.partners.find((p: any) => p.id === '1000238');
    const healthy = result.partners.find((p: any) => p.id === '1000234');
    expect(blocked).toBeDefined();
    expect(healthy).toBeDefined();
    expect(blocked.riskScore).toBeGreaterThan(healthy.riskScore);
    expect(blocked.riskLevel).toBe('CRITICAL');
  });

  it('sorts results highest risk first', async () => {
    const handler = vendor360Tool.handlers.find(h => h.name === 'get_partner_risk_summary')!;
    const ctx = await makeContext();
    const result = await handler.handler({
      partnerIds: ['1000234', '1000235', '1000238']
    }, ctx) as any;

    const scores = result.partners.map((p: any) => p.riskScore);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i]);
    }
  });
});
