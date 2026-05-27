/**
 * MCP Tool: get_partner_360
 *
 * THE headliner. Parallel-fetches 8 SAP OData services, aggregates KPIs,
 * flags risks, generates an AI narrative, and returns a complete 360° view.
 * Target p95 latency: < 4 seconds.
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext } from '@s4ready/core';
import {
  buildGetPartnerQuery, buildOpenPOsQuery, buildOpenSOsQuery,
  buildSupplierInvoicesQuery, buildOpenAPItemsQuery, buildOpenARItemsQuery,
  buildPaymentHistoryQuery, buildQualityNotificationsQuery,
  buildActiveContractsQuery, dateMonthsAgo
} from '../queries/sap-queries';
import { aggregate } from '../services/aggregator';
import { generateNarrative } from '../services/narrative';

const schema = z.object({
  partnerId: z.string().min(1).describe(
    'SAP Business Partner ID (e.g. "1000234"). Use search_business_partner first if you have a name.'
  ),
  partnerType: z.enum(['VENDOR', 'CUSTOMER', 'AUTO']).optional().default('AUTO').describe(
    'Whether this is a vendor, customer, or auto-detect from SAP data.'
  ),
  monthsBack: z.number().int().min(1).max(36).optional().default(12).describe(
    'How many months of history to fetch. Default 12.'
  ),
  includeNarrative: z.boolean().optional().default(true).describe(
    'Whether to include an AI-generated executive summary. Set false for raw data only.'
  )
});

type Input = z.infer<typeof schema>;

export const getPartner360Handler: ToolHandler<Input> = {
  name: 'get_partner_360',
  description:
    'Get a complete 360° view of a vendor or customer. Fetches open POs/SOs, invoices, ' +
    'payment history, quality notifications, contracts, and computes KPIs. Includes an ' +
    'AI-generated executive summary. The primary tool for vendor/customer review.',
  inputSchema: schema,

  async handler(input: Input, ctx: ToolContext) {
    const start = Date.now();

    // Short-lived cache (60s) — user refreshing the same partner gets instant response.
    const cacheKey = `360:${ctx.user.tenantId}:${input.partnerId}:${input.monthsBack}`;
    const cached = await ctx.cache.get<unknown>(cacheKey);
    if (cached) {
      ctx.logger.debug('360 cache hit', { partnerId: input.partnerId });
      return cached;
    }

    ctx.logger.info('Fetching 360 view', { partnerId: input.partnerId });

    // ── Parallel fetch — all 8 services simultaneously ───────────────────

    const [
      partnerData,
      purchaseOrders,
      salesOrders,
      supplierInvoices,
      openAPItems,
      openARItems,
      payments,
      qualityNotifications,
      contracts
    ] = await Promise.allSettled([
      ctx.sap.fetchOData(buildGetPartnerQuery(input.partnerId)),
      ctx.sap.fetchOData(buildOpenPOsQuery(input.partnerId, 100)),
      ctx.sap.fetchOData(buildOpenSOsQuery(input.partnerId, 100)),
      ctx.sap.fetchOData(buildSupplierInvoicesQuery(input.partnerId, 50)),
      ctx.sap.fetchOData(buildOpenAPItemsQuery(input.partnerId, 50)),
      ctx.sap.fetchOData(buildOpenARItemsQuery(input.partnerId, 50)),
      ctx.sap.fetchOData(buildPaymentHistoryQuery(input.partnerId, 'VENDOR', 20)),
      ctx.sap.fetchOData(buildQualityNotificationsQuery(input.partnerId, 20)),
      ctx.sap.fetchOData(buildActiveContractsQuery(input.partnerId))
    ]);

    // Extract results — treat failures as empty (log but continue).
    const extract = (r: PromiseSettledResult<{ results: unknown[] }>, name: string) => {
      if (r.status === 'rejected') {
        ctx.logger.warn(`${name} fetch failed — continuing without it`, {
          error: (r.reason as Error)?.message
        });
        return [];
      }
      return r.value.results as Record<string, unknown>[];
    };

    const rawPartner = extract(partnerData, 'BusinessPartner');
    if (rawPartner.length === 0) {
      return {
        success: false,
        error: `Business partner ${input.partnerId} not found in SAP. Verify the ID and SAP client.`
      };
    }

    // Auto-detect partner type from SAP data if needed.
    const p = rawPartner[0];
    let partnerType = input.partnerType;
    if (partnerType === 'AUTO') {
      partnerType = p.IsSupplier && p.IsCustomer ? 'VENDOR'
        : p.IsSupplier ? 'VENDOR'
        : 'CUSTOMER';
    }

    // ── Aggregate ────────────────────────────────────────────────────────

    const partner360 = aggregate({
      partner: rawPartner,
      purchaseOrders: partnerType === 'CUSTOMER' ? [] : extract(purchaseOrders, 'PurchaseOrders'),
      salesOrders: partnerType === 'VENDOR' ? [] : extract(salesOrders, 'SalesOrders'),
      supplierInvoices: extract(supplierInvoices, 'SupplierInvoices'),
      openAPItems: extract(openAPItems, 'OpenAPItems'),
      openARItems: extract(openARItems, 'OpenARItems'),
      payments: extract(payments, 'Payments'),
      qualityNotifications: extract(qualityNotifications, 'QualityNotifications'),
      contracts: extract(contracts, 'Contracts'),
      monthsBack: input.monthsBack ?? 12
    });

    // ── AI Narrative ─────────────────────────────────────────────────────

    if (input.includeNarrative !== false) {
      partner360.narrative = await generateNarrative(partner360, {
        ai: ctx.ai,
        cache: ctx.cache,
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId
      });
    }

    // Cache the result for 60 seconds.
    await ctx.cache.set(cacheKey, partner360, 60);

    // Audit.
    const durationMs = Date.now() - start;
    await ctx.audit.write({
      category: 'data_access',
      tenantId: ctx.user.tenantId,
      userId: ctx.user.userId,
      action: 'get_partner_360',
      toolId: ctx.manifest.id,
      resource: `partner:${input.partnerId}`,
      outcome: 'success',
      durationMs,
      metadata: {
        partnerId: input.partnerId,
        partnerType,
        riskFlagCount: partner360.riskFlags.length,
        narrativeIncluded: !!partner360.narrative
      }
    });

    ctx.logger.info('360 view assembled', {
      partnerId: input.partnerId,
      durationMs,
      riskFlags: partner360.riskFlags.length
    });

    return { success: true, ...partner360 };
  }
};
