/**
 * AiClient using SAP AI Core. Connects via service binding (VCAP) and
 * routes completion requests to whichever model is configured (Claude,
 * GPT, Gemini, SAP-RPT-1) through AI Core's generative-ai-hub orchestration.
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

interface AiCoreCredentials {
  serviceurls: { AI_API_URL: string };
  url: string; // UAA url
  clientid: string;
  clientsecret: string;
  resource_group?: string;
}

export interface AiCoreClientOptions {
  credentials: AiCoreCredentials;
  defaultModel?: string;
  defaultDeploymentId?: string;
  resourceGroup?: string;
  budget?: TokenBudget;
  logger?: Logger;
}

export class AiCoreClient implements AiClient {
  private readonly credentials: AiCoreCredentials;
  private readonly defaultModel: string;
  private readonly defaultDeploymentId?: string;
  private readonly resourceGroup: string;
  private readonly budget: TokenBudget;
  private readonly logger?: Logger;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(options: AiCoreClientOptions) {
    this.credentials = options.credentials;
    this.defaultModel = options.defaultModel ?? 'anthropic--claude-3.5-sonnet';
    this.defaultDeploymentId = options.defaultDeploymentId;
    this.resourceGroup = options.resourceGroup
      ?? options.credentials.resource_group
      ?? 'default';
    this.budget = options.budget ?? new TokenBudget();
    this.logger = options.logger;
  }

  async complete(
    request: AiCompletionRequest,
    context: { tenantId: string; userId: string; toolId: string }
  ): Promise<AiCompletionResponse> {
    try {
      this.budget.checkAffordable(context.tenantId, request.maxTokens ?? 2048);
    } catch (err) {
      throw new AiBudgetExceededError(
        err instanceof Error ? err.message : 'Budget exceeded',
        context.tenantId
      );
    }

    const token = await this.getToken();
    const model = request.model ?? this.defaultModel;
    const start = Date.now();

    // AI Core "Generative AI Hub" orchestration endpoint accepts a model
    // name and routes to the right backend. The exact path depends on
    // whether you've deployed via foundation-models or orchestration service.
    const endpoint = this.defaultDeploymentId
      ? `/v2/inference/deployments/${this.defaultDeploymentId}/chat/completions`
      : `/v2/inference/completions`;

    try {
      const response = await axios.post(
        `${this.credentials.serviceurls.AI_API_URL}${endpoint}`,
        {
          model,
          max_tokens: request.maxTokens ?? 2048,
          temperature: request.temperature ?? 0.3,
          messages: [
            ...(request.system ? [{ role: 'system', content: request.system }] : []),
            ...request.messages
          ],
          stop: request.stopSequences
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'AI-Resource-Group': this.resourceGroup,
            'Content-Type': 'application/json'
          },
          timeout: 60_000
        }
      );

      const data = response.data;
      const text = data.choices?.[0]?.message?.content
        ?? data.content?.[0]?.text
        ?? '';
      const usage = data.usage ?? {};
      const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
      const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
      const total = inputTokens + outputTokens;

      this.budget.recordUsage(context.tenantId, total);

      return {
        text,
        usage: {
          inputTokens,
          outputTokens,
          totalTokens: total
        },
        model,
        durationMs: Date.now() - start
      };
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
      this.logger?.error('AI Core completion failed', {
        tenantId: context.tenantId,
        toolId: context.toolId,
        error: msg
      });
      throw new Error(`AI Core completion failed: ${msg}`);
    }
  }

  async embed(
    texts: string[],
    context: { tenantId: string; userId: string }
  ): Promise<{ embeddings: number[][]; tokensUsed: number }> {
    const token = await this.getToken();
    const response = await axios.post(
      `${this.credentials.serviceurls.AI_API_URL}/v2/inference/embeddings`,
      { input: texts, model: 'text-embedding-3-large' },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'AI-Resource-Group': this.resourceGroup,
          'Content-Type': 'application/json'
        }
      }
    );
    const tokens = response.data.usage?.total_tokens ?? 0;
    this.budget.recordUsage(context.tenantId, tokens);
    return {
      embeddings: response.data.data.map((d: { embedding: number[] }) => d.embedding),
      tokensUsed: tokens
    };
  }

  async getBudgetStatus(tenantId: string) {
    const status = this.budget.getStatus(tenantId);
    return status ?? {
      monthlyQuota: Infinity,
      consumed: 0,
      remaining: Infinity,
      resetAt: new Date().toISOString()
    };
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.token;
    }
    const response = await axios.post(
      `${this.credentials.url}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientid,
        client_secret: this.credentials.clientsecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    this.cachedToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
    };
    return this.cachedToken.token;
  }
}
