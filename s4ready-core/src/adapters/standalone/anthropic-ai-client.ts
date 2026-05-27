/**
 * AiClient that talks directly to Anthropic's API. Used in standalone mode
 * and as a fallback when AI Core is unavailable.
 *
 * Enforces token budgets via the shared TokenBudget utility.
 */

import axios from 'axios';
import type {
  AiClient,
  AiCompletionRequest,
  AiCompletionResponse
} from '../../interfaces/ai-client';
import { AiBudgetExceededError } from '../../interfaces/ai-client';
import { TokenBudget } from '../../utils/token-budget';
import type { Logger } from '../../utils/logger';

export interface AnthropicAiClientOptions {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
  /** Per-request hard cap. */
  maxOutputTokens?: number;
  /** Tenant budget tracker (shared across requests). */
  budget?: TokenBudget;
  logger?: Logger;
}

const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  // Approximate Anthropic pricing in USD per million tokens, as of build time.
  // Used only for cost estimation logs; not customer-facing.
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 }
};

export class AnthropicAiClient implements AiClient {
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly baseUrl: string;
  private readonly maxOutputTokens: number;
  private readonly budget: TokenBudget;
  private readonly logger?: Logger;

  constructor(options: AnthropicAiClientOptions) {
    this.apiKey = options.apiKey;
    this.defaultModel = options.defaultModel ?? 'claude-sonnet-4-6';
    this.baseUrl = options.baseUrl ?? 'https://api.anthropic.com';
    this.maxOutputTokens = options.maxOutputTokens ?? 2048;
    this.budget = options.budget ?? new TokenBudget();
    this.logger = options.logger;
  }

  async complete(
    request: AiCompletionRequest,
    context: { tenantId: string; userId: string; toolId: string }
  ): Promise<AiCompletionResponse> {
    // Budget check (best-effort; uses last known consumption).
    try {
      this.budget.checkAffordable(context.tenantId, request.maxTokens ?? this.maxOutputTokens);
    } catch (err) {
      throw new AiBudgetExceededError(
        err instanceof Error ? err.message : 'Budget exceeded',
        context.tenantId
      );
    }

    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    try {
      const response = await axios.post(
        `${this.baseUrl}/v1/messages`,
        {
          model,
          max_tokens: request.maxTokens ?? this.maxOutputTokens,
          temperature: request.temperature ?? 0.3,
          system: request.system,
          messages: request.messages,
          stop_sequences: request.stopSequences
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          timeout: 60_000
        }
      );

      const data = response.data;
      const text = data.content?.[0]?.text ?? '';
      const usage = data.usage ?? { input_tokens: 0, output_tokens: 0 };
      const totalTokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);

      this.budget.recordUsage(context.tenantId, totalTokens);

      const durationMs = Date.now() - start;
      this.logger?.debug('AI completion', {
        tenantId: context.tenantId,
        toolId: context.toolId,
        model,
        durationMs,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        estimatedCostUsd: this.estimateCost(model, usage.input_tokens, usage.output_tokens)
      });

      return {
        text,
        usage: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          totalTokens
        },
        model,
        durationMs
      };
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown error';
      this.logger?.error('AI completion failed', {
        tenantId: context.tenantId,
        toolId: context.toolId,
        model,
        error: msg
      });
      throw new Error(`AI completion failed: ${msg}`);
    }
  }

  async embed(
    _texts: string[],
    _context: { tenantId: string; userId: string }
  ): Promise<{ embeddings: number[][]; tokensUsed: number }> {
    // Anthropic does not provide an embeddings endpoint as of build time.
    // For embeddings, deploy in BTP mode (AI Core handles it) or use a
    // separate embedding provider (e.g., OpenAI text-embedding-3, Voyage).
    throw new Error(
      'Embeddings not supported by AnthropicAiClient. ' +
      'Configure an embedding adapter separately or run in BTP mode.'
    );
  }

  async getBudgetStatus(tenantId: string) {
    const status = this.budget.getStatus(tenantId);
    return status ?? {
      monthlyQuota: Infinity,
      consumed: 0,
      remaining: Infinity,
      resetAt: new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1,
        1
      )).toISOString()
    };
  }

  private estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICE_PER_MTOK[model] ?? PRICE_PER_MTOK['claude-sonnet-4-6'];
    return (inputTokens / 1_000_000) * pricing.input +
           (outputTokens / 1_000_000) * pricing.output;
  }
}
