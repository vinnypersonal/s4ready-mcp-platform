/**
 * Vendor / Customer 360 — Tool Definition
 *
 * Assembles a complete 360° view of any SAP vendor or customer in one
 * conversational query. Replaces 8 transactions and 3 systems with one answer.
 *
 * MCP tools exposed:
 *   search_business_partner   — fuzzy name/ID search
 *   get_partner_360           — full 360 view (the headliner)
 *   get_partner_transactions  — paginated drill-down
 *   explain_anomaly           — root-cause on a flagged issue
 *   get_partner_risk_summary  — aggregated risk score
 */

import type { Tool, ToolManifest } from '@s4ready/core';
import { SAP_VERSIONS_S4_ONLY } from '@s4ready/core';
import { searchBusinessPartnerHandler } from './tools/search-business-partner';
import { getPartner360Handler } from './tools/get-partner-360';
import { getPartnerTransactionsHandler } from './tools/get-partner-transactions';
import { explainAnomalyHandler } from './tools/explain-anomaly';
import { getPartnerRiskSummaryHandler } from './tools/get-partner-risk-summary';

export const manifest: ToolManifest = {
  id: 'vendor360',
  displayName: 'Vendor & Customer 360',
  version: '1.0.0',
  description:
    'Get a complete 360° view of any SAP vendor or customer — open POs, invoices, ' +
    'payments, quality rejections, contracts, and an AI-generated summary — all from ' +
    'one natural-language question inside Joule or the s4ready web app.',
  category: 'functional',
  personas: [
    'Procurement Manager',
    'Accounts Payable / Receivable',
    'Sales Manager',
    'Credit Manager',
    'Plant Head',
    'CFO / Finance Head'
  ],
  supportedSapVersions: SAP_VERSIONS_S4_ONLY,
  requiresSap: true,
  requiredSapServices: [
    'API_BUSINESS_PARTNER',
    'API_PURCHASEORDER_PROCESS_SRV',
    'API_SALES_ORDER_SRV',
    'API_SUPPLIERINVOICE_PROCESS_SRV',
    'API_OPLACCTGDOCITEMCUBE_SRV',
    'API_CLEAREDACCTGDOCITEMCUBE_SRV',
    'API_QUALITYNOTIFICATION',
    'API_PURGCONTRACT_PROCESS_SRV'
  ]
};

export const vendor360Tool: Tool = {
  manifest,
  handlers: [
    searchBusinessPartnerHandler,
    getPartner360Handler,
    getPartnerTransactionsHandler,
    explainAnomalyHandler,
    getPartnerRiskSummaryHandler
  ],
  async initialize({ logger }) {
    logger.info('Vendor 360 tool initialized', { version: manifest.version });
  }
};

export default vendor360Tool;
