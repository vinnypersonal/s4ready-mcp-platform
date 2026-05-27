/**
 * AI client — unified interface over SAP AI Core, Anthropic direct, OpenAI,
 * Azure OpenAI. Supports text completions and embeddings with cost controls.
 */

export interface AiCompletionRequest {
  /** System prompt setting persona / rules. */
  system?: string;
  /** Conversation messages. */
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Override default model. */
  model?: string;
  /** Maximum tokens to generate. */
  maxTokens?: number;
  /** 0 = deterministic, 1 = creative. */
  temperature?: number;
  /** Stop sequences. */
  stopSequences?: string[];
}

export interface AiCompletionResponse {
  /** The model's text output. */
  text: string;
  /** Token usage for billing and budget enforcement. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  /** Model that actually served the request. */
  model: string;
  /** Latency. */
  durationMs: number;
}

export interface AiClient {
  /**
   * Generate a text completion. Enforces tenant token budget;
   * throws AiBudgetExceededError if budget exhausted.
   */
  complete(
    request: AiCompletionRequest,
    context: { tenantId: string; userId: string; toolId: string }
  ): Promise<AiCompletionResponse>;

  /**
   * Generate text embeddings. Useful for semantic search across vendor names,
   * material descriptions, etc.
   */
  embed(
    texts: string[],
    context: { tenantId: string; userId: string }
  ): Promise<{ embeddings: number[][]; tokensUsed: number }>;

  /**
   * Check remaining monthly token budget for a tenant.
   */
  getBudgetStatus(tenantId: string): Promise<{
    monthlyQuota: number;
    consumed: number;
    remaining: number;
    resetAt: string;
  }>;
}

export class AiBudgetExceededError extends Error {
  constructor(message: string, public readonly tenantId: string) {
    super(message);
    this.name = 'AiBudgetExceededError';
  }
}
