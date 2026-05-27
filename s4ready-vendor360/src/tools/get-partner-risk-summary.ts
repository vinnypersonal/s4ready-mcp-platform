/**
 * MCP Tool: get_partner_risk_summary
 *
 * Lightweight risk roll-up. Returns a risk score and flag list without
 * the full 360 data. Used when the user asks "which of my top vendors
 * have open issues?" — the LLM can call this for multiple partners quickly.
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext } from '@s4ready/core';
import {
  buildGetPartnerQuery, buildBlockedInvoicesQuery,
  buildOpenAPItemsQuery, buildQualityNotificationsQuery
} from '../queries/sap-queries';

const schema = z.object({
  partnerIds: z.array(z.string().min(1)).min(1).max(20).describe(
    'List of SAP Business Partner IDs to assess. Max 20.'
  )
});

type Input = z.infer<typeof schema>;

interface PartnerRisk {
  id: string;
  name: string;
  riskScore: number; // 0–100, higher = riskier
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  topFlag?: string;
  isBlocked: boolean;
}

export const getPartnerRiskSummaryHandler: ToolHandler<Input> = {
  name: 'get_partner_risk_summary',
  description:
    'Quickly assess the risk level of multiple vendors or customers. Returns a risk score ' +
    '(0-100) and top risk flag for each. Useful for portfolio-level risk scanning or ' +
    '"which of my top vendors has the most issues?" questions.',
  inputSchema: schema,

  async handler(input: Input, ctx: ToolContext) {
    const results: PartnerRisk[] = await Promise.all(
      input.partnerIds.map(id => this.assessPartner(id, ctx))
    );

    results.sort((a, b) => b.riskScore - a.riskScore);

    return {
      success: true,
      assessedAt: new Date().toISOString(),
      partners: results,
      summary: {
        critical: results.filter(r => r.riskLevel === 'CRITICAL').length,
        high: results.filter(r => r.riskLevel === 'HIGH').length,
        medium: results.filter(r => r.riskLevel === 'MEDIUM').length,
        low: results.filter(r => r.riskLevel === 'LOW').length
      }
    };
  },

  async assessPartner(id: string, ctx: ToolContext): Promise<PartnerRisk> {
    const [partnerRes, blockedRes, overdueRes, qualityRes] = await Promise.allSettled([
      ctx.sap.fetchOData(buildGetPartnerQuery(id)),
      ctx.sap.fetchOData(buildBlockedInvoicesQuery(id)),
      ctx.sap.fetchOData(buildOpenAPItemsQuery(id, 20)),
      ctx.sap.fetchOData(buildQualityNotificationsQuery(id, 10))
    ]);

    const partner = partnerRes.status === 'fulfilled'
      ? (partnerRes.value.results[0] as Record<string, unknown> | undefined)
      : undefined;
    const name = partner ? String(partner.BusinessPartnerFullName ?? id) : id;
    const isBlocked = Boolean(partner?.BusinessPartnerIsBlocked);

    const blockedCount = blockedRes.status === 'fulfilled' ? blockedRes.value.results.length : 0;

    const today = new Date();
    const overdueItems = overdueRes.status === 'fulfilled'
      ? (overdueRes.value.results as Record<string, unknown>[]).filter(item => {
          const due = item.NetDueDate ? new Date(String(item.NetDueDate)) : null;
          return due && due < today;
        })
      : [];

    const qualityCount = qualityRes.status === 'fulfilled' ? qualityRes.value.results.length : 0;

    // Risk scoring: simple additive model.
    let score = 0;
    let topFlag: string | undefined;

    if (isBlocked) { score += 50; topFlag = 'Partner blocked in SAP'; }
    if (blockedCount > 0) { score += Math.min(blockedCount * 10, 30); if (!topFlag) topFlag = `${blockedCount} blocked invoice(s)`; }
    if (overdueItems.length > 0) { score += Math.min(overdueItems.length * 5, 20); if (!topFlag) topFlag = `${overdueItems.length} overdue payment(s)`; }
    if (qualityCount > 0) { score += Math.min(qualityCount * 3, 10); if (!topFlag) topFlag = `${qualityCount} quality notification(s)`; }

    score = Math.min(score, 100);

    const riskLevel: PartnerRisk['riskLevel'] =
      score >= 75 ? 'CRITICAL'
      : score >= 50 ? 'HIGH'
      : score >= 25 ? 'MEDIUM'
      : 'LOW';

    return { id, name, riskScore: score, riskLevel, topFlag, isBlocked };
  }
} as ToolHandler<Input> & { assessPartner(id: string, ctx: ToolContext): Promise<PartnerRisk> };
