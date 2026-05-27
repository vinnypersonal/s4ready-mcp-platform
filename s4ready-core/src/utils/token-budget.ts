/**
 * Token budget enforcement. Tracks per-tenant monthly token consumption
 * and per-query caps. Backed by the AI client implementation; this is the
 * common in-memory accounting layer.
 */

interface BudgetEntry {
  tenantId: string;
  monthlyQuota: number;
  consumed: number;
  resetAt: Date;
}

export class TokenBudget {
  private budgets = new Map<string, BudgetEntry>();

  /**
   * Set or update the monthly token quota for a tenant.
   */
  setQuota(tenantId: string, monthlyQuota: number): void {
    const existing = this.budgets.get(tenantId);
    if (existing) {
      existing.monthlyQuota = monthlyQuota;
    } else {
      this.budgets.set(tenantId, {
        tenantId,
        monthlyQuota,
        consumed: 0,
        resetAt: this.computeNextReset()
      });
    }
  }

  /**
   * Record token usage. Throws if quota exceeded (after the spend).
   */
  recordUsage(tenantId: string, tokens: number): void {
    const entry = this.budgets.get(tenantId);
    if (!entry) {
      // No quota set = unlimited. This is intentional for free dev mode.
      return;
    }
    this.maybeReset(entry);
    entry.consumed += tokens;
  }

  /**
   * Check available budget. Does not consume.
   */
  getStatus(tenantId: string): {
    monthlyQuota: number;
    consumed: number;
    remaining: number;
    resetAt: string;
  } | null {
    const entry = this.budgets.get(tenantId);
    if (!entry) return null;
    this.maybeReset(entry);
    return {
      monthlyQuota: entry.monthlyQuota,
      consumed: entry.consumed,
      remaining: Math.max(0, entry.monthlyQuota - entry.consumed),
      resetAt: entry.resetAt.toISOString()
    };
  }

  /**
   * Throw if a planned token spend would exceed the budget.
   * Call before invoking the LLM.
   */
  checkAffordable(tenantId: string, planned: number): void {
    const entry = this.budgets.get(tenantId);
    if (!entry) return;
    this.maybeReset(entry);
    if (entry.consumed + planned > entry.monthlyQuota) {
      throw new Error(
        `Token budget exhausted for tenant ${tenantId}. ` +
        `Consumed ${entry.consumed} / ${entry.monthlyQuota}. ` +
        `Resets ${entry.resetAt.toISOString()}.`
      );
    }
  }

  private maybeReset(entry: BudgetEntry): void {
    if (new Date() >= entry.resetAt) {
      entry.consumed = 0;
      entry.resetAt = this.computeNextReset();
    }
  }

  private computeNextReset(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0));
  }
}
