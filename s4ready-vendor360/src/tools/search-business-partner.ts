/**
 * MCP Tool: search_business_partner
 *
 * Fuzzy search for a vendor or customer by name, ID, or partial name.
 * Called first when the user says "vendor 360 for Tata Steel" —
 * the LLM calls this to resolve the name to a Partner ID before calling
 * get_partner_360.
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext } from '@s4ready/core';
import { buildSearchPartnerQuery } from '../queries/sap-queries';

const schema = z.object({
  query: z.string().min(1).describe(
    'Search term — vendor/customer name, partial name, or SAP partner ID. E.g. "Tata", "1000234", "Reliance".'
  ),
  partnerType: z.enum(['VENDOR', 'CUSTOMER', 'BOTH']).optional().default('BOTH').describe(
    'Filter by partner type. Default BOTH.'
  ),
  limit: z.number().int().min(1).max(50).optional().default(10).describe(
    'Max results. Default 10.'
  )
});

type Input = z.infer<typeof schema>;

export const searchBusinessPartnerHandler: ToolHandler<Input> = {
  name: 'search_business_partner',
  description:
    'Search for SAP vendors or customers by name or ID. Returns a list of matches with basic details. ' +
    'Use this before calling get_partner_360 to resolve a name to a partner ID.',
  inputSchema: schema,
  async handler(input: Input, ctx: ToolContext) {
    const start = Date.now();
    const cacheKey = `search:${ctx.user.tenantId}:${input.query.toLowerCase()}:${input.partnerType}`;

    const cached = await ctx.cache.get<unknown[]>(cacheKey);
    if (cached) return { success: true, results: cached, fromCache: true };

    const query = buildSearchPartnerQuery(input.query, input.limit ?? 10);
    const response = await ctx.sap.fetchOData(query);

    let results = response.results as Record<string, unknown>[];

    // Filter by partnerType if not BOTH
    if (input.partnerType === 'VENDOR') {
      results = results.filter(r => r.IsSupplier === true || r.IsSupplier === 'true');
    } else if (input.partnerType === 'CUSTOMER') {
      results = results.filter(r => r.IsCustomer === true || r.IsCustomer === 'true');
    }

    const shaped = results.map(r => ({
      id: String(r.BusinessPartner ?? ''),
      name: String(r.BusinessPartnerFullName ?? ''),
      type: r.IsSupplier && r.IsCustomer ? 'BOTH'
        : r.IsSupplier ? 'VENDOR'
        : 'CUSTOMER',
      country: String(r.Country ?? ''),
      city: r.CityName ? String(r.CityName) : undefined,
      isBlocked: Boolean(r.BusinessPartnerIsBlocked),
      lastActivity: r.LastChangeDate ? String(r.LastChangeDate) : undefined
    }));

    // Cache search results for 2 minutes — vendor names don't change often.
    await ctx.cache.set(cacheKey, shaped, 120);

    await ctx.audit.write({
      category: 'data_access',
      tenantId: ctx.user.tenantId,
      userId: ctx.user.userId,
      action: 'search_business_partner',
      toolId: ctx.manifest.id,
      resource: `query:${input.query}`,
      outcome: 'success',
      durationMs: Date.now() - start,
      metadata: { resultCount: shaped.length, query: input.query }
    });

    return {
      success: true,
      results: shaped,
      totalFound: shaped.length,
      tip: shaped.length === 0
        ? 'No results. Try a shorter search term or check the SAP client number.'
        : shaped.length === 1
          ? `Found 1 match. Use id "${shaped[0].id}" in get_partner_360.`
          : `Found ${shaped.length} matches. Pick the right id and call get_partner_360.`
    };
  }
};
