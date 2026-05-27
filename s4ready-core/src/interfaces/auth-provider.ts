/**
 * Identity & access. Validates incoming tokens (from Joule, web chat, REST API),
 * resolves user context, exposes scopes / roles, and supports principal
 * propagation when calling SAP downstream.
 */

export interface UserContext {
  /** Stable user identifier — email or SAP user ID typically. */
  userId: string;

  /** Display name, when available. */
  displayName?: string;

  /** Tenant the user belongs to. Required for multi-tenancy. */
  tenantId: string;

  /** Roles granted to the user (from IdP groups or XSUAA scopes). */
  roles: string[];

  /** Free-form claims passed through from the original token. */
  claims: Record<string, unknown>;

  /**
   * Token suitable for principal propagation to downstream SAP.
   * In BTP mode: the user's XSUAA token, which BTP Destination Service
   * exchanges for an SAP session.
   * In standalone mode: undefined (use technical user instead).
   */
  propagationToken?: string;
}

export interface AuthProvider {
  /**
   * Validate the bearer token from the Authorization header.
   * Returns user context on success, throws on failure.
   *
   * @param token Raw token string (without "Bearer " prefix).
   * @throws AuthError when token is invalid, expired, or missing required claims.
   */
  validateToken(token: string): Promise<UserContext>;

  /**
   * Check if a user has a specific role. Convenience helper.
   */
  hasRole(user: UserContext, role: string): boolean;

  /**
   * Optional: revoke / logout a session. Most JWT providers no-op this.
   */
  revoke?(token: string): Promise<void>;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_TOKEN' | 'EXPIRED' | 'MISSING_CLAIMS' | 'INTERNAL'
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
