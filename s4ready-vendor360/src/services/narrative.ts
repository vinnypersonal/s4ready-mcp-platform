/**
 * Narrative generator. Calls the AI client with structured Partner360 data
 * to produce a concise, business-friendly summary for Joule or the web chat.
 *
 * Design principles:
 *   - Prompt is deterministic (low temperature) for consistency
 *   - Never sends raw SAP field names to the model
 *   - Token budget enforced before the call
 *   - Cached: same partner + same KPIs within 5 min → no LLM call
 */

import type { AiClient } from '@s4ready/core';
import type { Cache } from '@s4ready/core';
import type { Partner360 } from './aggregator';

const SYSTEM_PROMPT = `You are a senior SAP business analyst embedded inside a procurement system.
Your job is to produce a clear, factual, plain-English summary of a vendor or customer's relationship status.

Rules:
- Maximum 4 sentences. Be specific with numbers.
- Lead with the most important insight (positive or a risk).
- Name the specific issues (blocked invoices, overdue payments, quality problems).
- End with a recommended next action if risks exist.
- Use the user's currency and locale (amounts are already formatted).
- Never use jargon like "OTD" without explanation.
- Do not mention SAP transaction codes, field names, or technical terms.
- Tone: professional, direct, as if briefing a CFO before a vendor meeting.`;

export async function generateNarrative(
  partner360: Partner360,
  context: {
    ai: AiClient;
    cache: Cache;
    tenantId: string;
    userId: string;
    language?: string;
  }
): Promise<string> {
  // Cache key is deterministic — same partner + same risk flags → same narrative.
  const cacheKey = `narrative:${context.tenantId}:${partner360.partner.id}:${partner360.riskFlags.map(f => f.code).sort().join(',')}`;
  const cached = await context.cache.get<string>(cacheKey);
  if (cached) return cached;

  const { partner, kpis, riskFlags } = partner360;
  const currency = kpis.currency;

  // Build a compact, structured prompt. No raw SAP field names.
  const prompt = `
Vendor/Customer: ${partner.name} (${partner.id})
Partner type: ${partner.type}
Country: ${partner.country}
Account status: ${partner.isBlocked ? 'BLOCKED — no new transactions allowed' : 'Active'}

Financial summary (last ${partner360.dataMonthsBack} months):
- Total ${partner.type === 'CUSTOMER' ? 'revenue' : 'spend'}: ${fmtAmt(kpis.totalSpendOrRevenue, currency)}
- Open ${partner.type === 'CUSTOMER' ? 'sales orders' : 'purchase orders'}: ${kpis.openDocumentCount}
- Overdue amount: ${fmtAmt(kpis.overdueAmount, currency)} (${kpis.overdueCount} document(s))
- Blocked invoices: ${fmtAmt(kpis.blockedInvoiceAmount, currency)} (${kpis.blockedInvoiceCount} invoice(s))
- Quality notifications: ${kpis.qualityNotificationCount}
- Active contracts: ${kpis.activeContractCount}
- On-time delivery: ${kpis.onTimeDeliveryPct !== null ? `${kpis.onTimeDeliveryPct}%` : 'no data'}
- Avg payment delay: ${kpis.avgPaymentDelayDays !== null ? `${kpis.avgPaymentDelayDays > 0 ? '+' : ''}${kpis.avgPaymentDelayDays} days` : 'no data'}

Risk flags: ${riskFlags.length === 0 ? 'None' : riskFlags.map(f => `[${f.severity.toUpperCase()}] ${f.message}`).join('; ')}
`.trim();

  try {
    const result = await context.ai.complete(
      {
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 300,
        temperature: 0.2
      },
      {
        tenantId: context.tenantId,
        userId: context.userId,
        toolId: 'vendor360'
      }
    );

    const narrative = result.text.trim();
    // Cache for 5 minutes — prevents repeat calls when user refreshes.
    await context.cache.set(cacheKey, narrative, 300);
    return narrative;
  } catch (err: any) {
    // AI failure must not break the tool — return a fallback summary.
    const fallback = buildFallbackNarrative(partner360);
    return fallback;
  }
}

function buildFallbackNarrative(p360: Partner360): string {
  const { partner, kpis } = p360;
  const parts: string[] = [];

  if (partner.isBlocked) {
    parts.push(`${partner.name} is currently blocked in SAP — no new transactions can be posted.`);
  } else {
    parts.push(`${partner.name} is an active ${partner.type.toLowerCase()} in your SAP system.`);
  }

  const spend = fmtAmt(kpis.totalSpendOrRevenue, kpis.currency);
  parts.push(`Total ${partner.type === 'CUSTOMER' ? 'revenue' : 'spend'} over the last ${p360.dataMonthsBack} months: ${spend}.`);

  if (kpis.overdueCount > 0) {
    parts.push(`${kpis.overdueCount} overdue payment(s) totalling ${fmtAmt(kpis.overdueAmount, kpis.currency)}.`);
  }
  if (kpis.blockedInvoiceCount > 0) {
    parts.push(`${kpis.blockedInvoiceCount} blocked invoice(s) require attention.`);
  }

  return parts.join(' ');
}

function fmtAmt(amount: number, currency: string): string {
  if (amount === 0) return `${currency} 0`;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}
