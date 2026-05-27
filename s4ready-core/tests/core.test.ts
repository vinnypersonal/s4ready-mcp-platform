/**
 * Core library unit tests. These run without any SAP or external services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InMemoryCache } from '../src/adapters/standalone/in-memory-cache';
import { TokenBudget } from '../src/utils/token-budget';
import { MockSapConnector } from '../src/adapters/standalone/mock-sap-connector';
import { isS4HanaVersion, isEccVersion, SAP_VERSIONS_S4_ONLY } from '../src/sap/versions';

// ────────────────────────────────────────────────────────────────────────────
// InMemoryCache
// ────────────────────────────────────────────────────────────────────────────

describe('InMemoryCache', () => {
  let cache: InMemoryCache;

  beforeEach(() => { cache = new InMemoryCache(1); }); // 1s TTL for speed
  afterEach(() => cache.destroy());

  it('stores and retrieves a value', async () => {
    await cache.set('k1', { name: 'Tata Steel' });
    expect(await cache.get('k1')).toEqual({ name: 'Tata Steel' });
  });

  it('returns undefined for missing key', async () => {
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    await cache.set('k2', 'temporary', 0.05); // 50ms TTL
    await new Promise(r => setTimeout(r, 80));
    expect(await cache.get('k2')).toBeUndefined();
  });

  it('deletes a key', async () => {
    await cache.set('k3', 'value');
    await cache.delete('k3');
    expect(await cache.get('k3')).toBeUndefined();
  });

  it('clears by prefix', async () => {
    await cache.set('vendor:100', 'a');
    await cache.set('vendor:200', 'b');
    await cache.set('order:100', 'c');
    await cache.clear('vendor:');
    expect(await cache.get('vendor:100')).toBeUndefined();
    expect(await cache.get('vendor:200')).toBeUndefined();
    expect(await cache.get('order:100')).toBe('c');
  });

  it('reports has() correctly', async () => {
    await cache.set('exists', true);
    expect(await cache.has('exists')).toBe(true);
    expect(await cache.has('nope')).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// TokenBudget
// ────────────────────────────────────────────────────────────────────────────

describe('TokenBudget', () => {
  let budget: TokenBudget;

  beforeEach(() => { budget = new TokenBudget(); });

  it('allows usage under quota', () => {
    budget.setQuota('tenant-a', 10000);
    expect(() => budget.checkAffordable('tenant-a', 5000)).not.toThrow();
    budget.recordUsage('tenant-a', 5000);
    const status = budget.getStatus('tenant-a');
    expect(status?.consumed).toBe(5000);
    expect(status?.remaining).toBe(5000);
  });

  it('throws when quota exceeded on checkAffordable', () => {
    budget.setQuota('tenant-b', 1000);
    budget.recordUsage('tenant-b', 900);
    expect(() => budget.checkAffordable('tenant-b', 200)).toThrow(/budget exhausted/i);
  });

  it('returns null for unconfigured tenant', () => {
    expect(budget.getStatus('unknown')).toBeNull();
  });

  it('does not throw for unconfigured tenant (unlimited)', () => {
    expect(() => budget.checkAffordable('unlimited-tenant', 99999)).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// MockSapConnector
// ────────────────────────────────────────────────────────────────────────────

describe('MockSapConnector', () => {
  let connector: MockSapConnector;

  beforeEach(() => { connector = new MockSapConnector(); });

  it('ping returns reachable', async () => {
    const result = await connector.ping();
    expect(result.reachable).toBe(true);
  });

  it('returns system info as S4 Cloud Public', async () => {
    const info = await connector.getSystemInfo();
    expect(info.type).toBe('s4hana_cloud_public');
  });

  it('fetches business partners', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
      entitySet: 'A_BusinessPartner'
    });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results[0]).toHaveProperty('BusinessPartner');
  });

  it('filters by eq on BusinessPartner', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
      entitySet: 'A_BusinessPartner',
      params: { $filter: "BusinessPartner eq '1000234'" }
    });
    expect(result.results).toHaveLength(1);
    expect((result.results[0] as any).BusinessPartnerFullName).toContain('Tata Steel');
  });

  it('filters blocked vendors', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
      entitySet: 'A_BusinessPartner',
      params: { $filter: "BusinessPartnerIsBlocked eq 'true'" }
    });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('applies $top limit', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
      entitySet: 'A_BusinessPartner',
      params: { $top: '2' }
    });
    expect(result.results.length).toBeLessThanOrEqual(2);
  });

  it('fetches purchase orders', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV',
      entitySet: 'A_PurchaseOrder'
    });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('filters POs by supplier', async () => {
    const result = await connector.fetchOData({
      servicePath: '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV',
      entitySet: 'A_PurchaseOrder',
      params: { $filter: "Supplier eq '1000234'" }
    });
    expect(result.results.every((r: any) => r.Supplier === '1000234')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SAP version helpers
// ────────────────────────────────────────────────────────────────────────────

describe('SAP version helpers', () => {
  it('recognises S/4 versions', () => {
    expect(isS4HanaVersion('s4hana_cloud_public')).toBe(true);
    expect(isS4HanaVersion('s4hana_on_prem_2023')).toBe(true);
    expect(isS4HanaVersion('ecc_6_ehp8')).toBe(false);
  });

  it('recognises ECC versions', () => {
    expect(isEccVersion('ecc_6_ehp8')).toBe(true);
    expect(isEccVersion('s4hana_cloud_public')).toBe(false);
  });

  it('SAP_VERSIONS_S4_ONLY has no ECC entries', () => {
    expect(SAP_VERSIONS_S4_ONLY.every(isS4HanaVersion)).toBe(true);
  });
});
