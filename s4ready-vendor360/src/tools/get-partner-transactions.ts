/**
 * MCP Tool: get_partner_transactions
 *
 * Drill-down: fetch a specific category of transactions for a partner.
 * Called when the user asks "show me all overdue invoices for Tata Steel"
 * or "list open POs for vendor 1000234".
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext } from '@s4ready/core';
import {
  buildOpenPOsQuery, buildOpenSOsQuery, buildSupplierInvoicesQuery,
  buildBlockedInvoicesQuery, buildOpenAPItemsQuery, buildOpenARItemsQuery,
  buildPaymentHistoryQuery, buildQualityNotificationsQuery, buildActiveContractsQuery
} from '../queries/sap-queries';

const schema = z.object({
  partnerId: z.string().min(1).describe('SAP Business Partner ID.'),
  transactionType: z.enum([
    'OPEN_PO', 'OPEN_SO', 'INVOICES', 'BLOCKED_INVOICES',
    'OVERDUE_AP', 'OVERDUE_AR', 'PAYMENTS', 'QUALITY_NOTIFICATIONS', 'CONTRACTS'
  ]).describe('Which category of transactions to fetch.'),
  limit: z.number().int().min(1).max(200).optional().default(50)
});

type Input = z.infer<typeof schema>;

const DESCRIPTIONS: Record<Input['transactionType'], string> = {
  OPEN_PO: 'open purchase orders',
  OPEN_SO: 'open sales orders',
  INVOICES: 'recent supplier invoices',
  BLOCKED_INVOICES: 'blocked invoices requiring release',
  OVERDUE_AP: 'overdue accounts payable items',
  OVERDUE_AR: 'overdue accounts receivable items',
  PAYMENTS: 'recent payment history',
  QUALITY_NOTIFICATIONS: 'quality notifications',
  CONTRACTS: 'active purchasing contracts'
};

export const getPartnerTransactionsHandler: ToolHandler<Input> = {
  name: 'get_partner_transactions',
  description:
    'Drill into a specific category of transactions for a vendor or customer. ' +
    'Use after get_partner_360 when the user wants to see individual documents.',
  inputSchema: schema,

  async handler(input: Input, ctx: ToolContext) {
    const limit = input.limit ?? 50;

    const query = (() => {
      switch (input.transactionType) {
        case 'OPEN_PO': return buildOpenPOsQuery(input.partnerId, limit);
        case 'OPEN_SO': return buildOpenSOsQuery(input.partnerId, limit);
        case 'INVOICES': return buildSupplierInvoicesQuery(input.partnerId, limit);
        case 'BLOCKED_INVOICES': return buildBlockedInvoicesQuery(input.partnerId);
        case 'OVERDUE_AP': return buildOpenAPItemsQuery(input.partnerId, limit);
        case 'OVERDUE_AR': return buildOpenARItemsQuery(input.partnerId, limit);
        case 'PAYMENTS': return buildPaymentHistoryQuery(input.partnerId, 'VENDOR', limit);
        case 'QUALITY_NOTIFICATIONS': return buildQualityNotificationsQuery(input.partnerId, limit);
        case 'CONTRACTS': return buildActiveContractsQuery(input.partnerId);
      }
    })();

    const response = await ctx.sap.fetchOData(query);

    return {
      success: true,
      partnerId: input.partnerId,
      transactionType: input.transactionType,
      description: DESCRIPTIONS[input.transactionType],
      count: response.results.length,
      results: response.results
    };
  }
};
