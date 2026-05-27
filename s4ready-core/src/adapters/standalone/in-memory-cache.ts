/**
 * Simple in-memory cache with TTL. Works in all deploy modes. For very large
 * deployments we'd swap in Redis, but for most tenants this is fine and avoids
 * adding a dependency.
 */

import type { Cache } from '../../interfaces/cache';

interface Entry {
  value: unknown;
  expiresAt: number;
}

export class InMemoryCache implements Cache {
  private store = new Map<string, Entry>();
  private sweeperHandle?: NodeJS.Timeout;

  constructor(private readonly defaultTtlSeconds: number = 300) {
    // Periodic sweep of expired entries to avoid unbounded memory growth.
    this.sweeperHandle = setInterval(() => this.sweep(), 60_000);
    // Don't keep the event loop alive just for the sweeper.
    if (this.sweeperHandle.unref) this.sweeperHandle.unref();
  }

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl * 1000
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(prefix?: string): Promise<void> {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    return !!entry && entry.expiresAt >= Date.now();
  }

  /** Stop the background sweeper. Used in tests and graceful shutdown. */
  destroy(): void {
    if (this.sweeperHandle) clearInterval(this.sweeperHandle);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) this.store.delete(key);
    }
  }
}
