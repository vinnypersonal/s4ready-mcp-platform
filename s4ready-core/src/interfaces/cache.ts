/**
 * In-process cache. Used heavily for SAP master data (vendors don't change
 * every second) and for AI narratives (identical queries skip the LLM).
 */

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(prefix?: string): Promise<void>;
  has(key: string): Promise<boolean>;
}
