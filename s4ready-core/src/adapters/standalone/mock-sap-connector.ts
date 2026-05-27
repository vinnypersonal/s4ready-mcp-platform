/**
 * Mock SapConnector for local dev and tests. Returns realistic-looking
 * fake data so tools can be exercised end-to-end without an SAP system.
 *
 * The data set is intentionally small and stable — designed for demos,
 * sales calls, and CI tests, not for performance testing.
 */

import type {
  SapConnector,
  SapSystemInfo,
  ODataQuery,
  ODataResponse
} from '../../interfaces/sap-connector';
import { MOCK_BUSINESS_PARTNERS, MOCK_PURCHASE_ORDERS, MOCK_SALES_ORDERS,
         MOCK_SUPPLIER_INVOICES, MOCK_AR_AP_ITEMS, MOCK_PAYMENTS,
         MOCK_QUALITY_NOTIFICATIONS, MOCK_CONTRACTS } from './mock-data';

export class MockSapConnector implements SapConnector {
  async getSystemInfo(): Promise<SapSystemInfo> {
    return {
      id: 'MOCK',
      type: 's4hana_cloud_public',
      release: '2023'
    };
  }

  async fetchOData<T = Record<string, unknown>>(
    query: ODataQuery
  ): Promise<ODataResponse<T>> {
    const start = Date.now();
    // Simulate real-world latency so demos feel realistic.
    await this.delay(50 + Math.random() * 150);

    const dataset = this.pickDataset(query.servicePath, query.entitySet);
    const filtered = this.applyFilter(dataset, query.params?.$filter);
    const sorted = this.applyOrderBy(filtered, query.params?.$orderby);
    const limited = this.applyTop(sorted, query.params?.$top);

    return {
      results: limited as T[],
      count: filtered.length,
      meta: {
        durationMs: Date.now() - start,
        sapVersion: '2023-MOCK'
      }
    };
  }

  async ping(): Promise<{ reachable: boolean; latencyMs: number }> {
    return { reachable: true, latencyMs: 5 };
  }

  private pickDataset(servicePath: string, entitySet: string): Record<string, unknown>[] {
    const path = servicePath.toUpperCase();
    if (path.includes('BUSINESS_PARTNER')) return MOCK_BUSINESS_PARTNERS;
    if (path.includes('PURCHASEORDER') || path.includes('PURCHASE_ORDER')) return MOCK_PURCHASE_ORDERS;
    if (path.includes('SALES_ORDER') || path.includes('SALESORDER')) return MOCK_SALES_ORDERS;
    if (path.includes('SUPPLIERINVOICE') || path.includes('SUPPLIER_INVOICE')) return MOCK_SUPPLIER_INVOICES;
    if (path.includes('OPLACCTGDOCITEM') || path.includes('OPLACCTG')) return MOCK_AR_AP_ITEMS;
    if (path.includes('CLEAREDACCTGDOCITEM') || path.includes('CLEAREDACCTG')) return MOCK_PAYMENTS;
    if (path.includes('QUALITYNOTIFICATION') || path.includes('QUALITY')) return MOCK_QUALITY_NOTIFICATIONS;
    if (path.includes('PURGCONTRACT') || path.includes('CONTRACT')) return MOCK_CONTRACTS;
    return [];
  }

  /**
   * Very simple $filter evaluator. Supports `eq`, `ne`, `gt`, `lt`, `ge`,
   * `le`, `and`, plus `substringof()`. Not a full OData parser; just enough
   * for the tool queries we issue.
   */
  private applyFilter(
    data: Record<string, unknown>[],
    filter?: string
  ): Record<string, unknown>[] {
    if (!filter) return data;
    const f = filter.trim();
    return data.filter(item => this.evalFilter(item, f));
  }

  private evalFilter(item: Record<string, unknown>, expr: string): boolean {
    // Handle compound AND first.
    const andParts = this.splitOnAnd(expr);
    if (andParts.length > 1) {
      return andParts.every(part => this.evalFilter(item, part));
    }

    // substringof('foo', Field)
    const substr = expr.match(/^substringof\s*\(\s*'([^']*)'\s*,\s*(\w+)\s*\)$/i);
    if (substr) {
      const [, needle, field] = substr;
      const value = String(item[field] ?? '');
      return value.toLowerCase().includes(needle.toLowerCase());
    }

    // contains(Field, 'foo')
    const contains = expr.match(/^contains\s*\(\s*(\w+)\s*,\s*'([^']*)'\s*\)$/i);
    if (contains) {
      const [, field, needle] = contains;
      const value = String(item[field] ?? '');
      return value.toLowerCase().includes(needle.toLowerCase());
    }

    // Field op value
    const binop = expr.match(/^(\w+)\s+(eq|ne|gt|lt|ge|le)\s+(.+)$/i);
    if (binop) {
      const [, field, op, rawValue] = binop;
      const value = String(item[field] ?? '');
      let target = rawValue.trim();
      if (target.startsWith("'") && target.endsWith("'")) {
        target = target.slice(1, -1);
      }
      switch (op.toLowerCase()) {
        case 'eq': return value === target;
        case 'ne': return value !== target;
        case 'gt': return value > target;
        case 'lt': return value < target;
        case 'ge': return value >= target;
        case 'le': return value <= target;
      }
    }

    return true;
  }

  private splitOnAnd(expr: string): string[] {
    // Naive split on " and " — doesn't handle parens correctly but is enough
    // for the queries our tools generate.
    return expr.split(/\s+and\s+/i).map(s => s.trim());
  }

  private applyOrderBy(
    data: Record<string, unknown>[],
    orderby?: string
  ): Record<string, unknown>[] {
    if (!orderby) return data;
    const [field, direction] = orderby.split(/\s+/);
    const dir = direction?.toLowerCase() === 'desc' ? -1 : 1;
    return [...data].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      if (av === undefined) return 1;
      if (bv === undefined) return -1;
      return av > bv ? dir : -dir;
    });
  }

  private applyTop(
    data: Record<string, unknown>[],
    top?: string
  ): Record<string, unknown>[] {
    if (!top) return data;
    const n = parseInt(top, 10);
    return Number.isFinite(n) ? data.slice(0, n) : data;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
