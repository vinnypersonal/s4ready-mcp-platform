/**
 * MCP Tool: explain_anomaly
 *
 * Root-cause explainer. When get_partner_360 flags a risk, the user can
 * ask "why?" — this tool fetches the relevant detail and asks the AI
 * to explain in plain English what happened and what to do.
 */

import { z } from 'zod';
import type { ToolHandler, ToolContext } from '@s4ready/core';
import { buildBlockedInvoicesQuery, buildOpenAPItemsQuery } from '../queries/sap-queries';

const schema = z.object({
  partnerId: z.string().min(1).describe('SAP Business Partner ID.'),
  anomalyType: z.enum([
    'BLOCKED_INVOICES',
    'OVERDUE_PAYMENT',
    'QUALITY_ISSUE',
    'PARTNER_BLOCKED',
    'LOW_OTD'
  ]).describe('Type of anomaly to investigate.'),
  referenceId: z.string().optional().describe(
    'Specific document ID to investigate (invoice, PO, etc). Optional — will fetch recent ones if omitted.'
  )
});

type Input = z.infer<typeof schema>;

export const explainAnomalyHandler: ToolHandler<Input> = {
  name: 'explain_anomaly',
  description:
    'Explain why a risk flag exists for a vendor or customer. ' +
    'Fetches relevant SAP documents and generates a plain-English root-cause analysis ' +
    'with recommended next actions. Use when the user asks "why is this invoice blocked?" ' +
    'or "why are payments overdue?"',
  inputSchema: schema,

  async handler(input: Input, ctx: ToolContext) {
    // Fetch the relevant context documents based on anomaly type.
    let contextData: Record<string, unknown>[] = [];
    let contextDescription = '';

    try {
      switch (input.anomalyType) {
        case 'BLOCKED_INVOICES': {
          const r = await ctx.sap.fetchOData(buildBlockedInvoicesQuery(input.partnerId));
          contextData = r.results as Record<string, unknown>[];
          contextDescription = `Blocked invoices for partner ${input.partnerId}`;
          break;
        }
        case 'OVERDUE_PAYMENT': {
          const r = await ctx.sap.fetchOData(buildOpenAPItemsQuery(input.partnerId, 10));
          contextData = (r.results as Record<string, unknown>[]).filter(item => {
            const due = item.NetDueDate ? new Date(String(item.NetDueDate)) : null;
            return due && due < new Date();
          });
          contextDescription = `Overdue AP items for partner ${input.partnerId}`;
          break;
        }
        default:
          contextDescription = `${input.anomalyType} for partner ${input.partnerId}`;
      }
    } catch {
      // Don't fail if context fetch errors — LLM can still explain with general knowledge.
    }

    const contextText = contextData.length > 0
      ? JSON.stringify(contextData.slice(0, 5), null, 2)
      : 'No specific document data available.';

    const prompt = `
Anomaly type: ${input.anomalyType}
Partner ID: ${input.partnerId}
${input.referenceId ? `Specific document: ${input.referenceId}` : ''}

Context data from SAP:
${contextText}

Explain in plain business English:
1. What is the root cause of this issue?
2. What business impact does it have?
3. What are the 2-3 specific next actions to resolve it?

Be specific. Reference document IDs where present. Maximum 5 sentences total.
`.trim();

    const result = await ctx.ai.complete(
      {
        system: 'You are a senior SAP functional consultant explaining an issue to a business user. Be precise, actionable, and avoid jargon.',
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 400,
        temperature: 0.2
      },
      {
        tenantId: ctx.user.tenantId,
        userId: ctx.user.userId,
        toolId: ctx.manifest.id
      }
    );

    return {
      success: true,
      partnerId: input.partnerId,
      anomalyType: input.anomalyType,
      explanation: result.text.trim(),
      supportingDocuments: contextData.slice(0, 5),
      fetchedAt: new Date().toISOString()
    };
  }
};
