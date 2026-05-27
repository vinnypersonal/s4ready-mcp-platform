/**
 * JWT-based AuthProvider for standalone deployments. Validates RS256 tokens
 * signed by an OIDC provider (Keycloak, Auth0, customer's IdP) using JWKS.
 * Falls back to HS256 for simple deployments.
 */

import jwt, { type JwtPayload } from 'jsonwebtoken';
import jwksClient, { type JwksClient } from 'jwks-rsa';
import { AuthError, type AuthProvider, type UserContext } from '../../interfaces/auth-provider';

export interface JwtAuthOptions {
  /** OIDC issuer URL (e.g., https://keycloak.example.com/realms/s4ready). */
  issuer?: string;
  /** JWKS endpoint URL. Auto-discovered from issuer if omitted. */
  jwksUri?: string;
  /** Expected audience claim. */
  audience?: string;
  /** Shared secret for HS256, when JWKS is not used. */
  secret?: string;
  /** Claim that holds the tenant id. Default: "tenant_id". */
  tenantClaim?: string;
  /** Claim that holds roles. Default: "roles". */
  rolesClaim?: string;
  /** Claim that holds user id. Default: "sub". */
  userIdClaim?: string;
  /** Claim that holds display name. Default: "name". */
  nameClaim?: string;
}

export class JwtAuthProvider implements AuthProvider {
  private readonly jwks?: JwksClient;
  private readonly tenantClaim: string;
  private readonly rolesClaim: string;
  private readonly userIdClaim: string;
  private readonly nameClaim: string;

  constructor(private readonly options: JwtAuthOptions) {
    if (options.jwksUri) {
      this.jwks = jwksClient({
        jwksUri: options.jwksUri,
        cache: true,
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true
      });
    }
    this.tenantClaim = options.tenantClaim ?? 'tenant_id';
    this.rolesClaim = options.rolesClaim ?? 'roles';
    this.userIdClaim = options.userIdClaim ?? 'sub';
    this.nameClaim = options.nameClaim ?? 'name';
  }

  async validateToken(token: string): Promise<UserContext> {
    if (!token) {
      throw new AuthError('Empty token', 'INVALID_TOKEN');
    }

    let decoded: JwtPayload;

    try {
      if (this.jwks) {
        decoded = await this.verifyRsa(token);
      } else if (this.options.secret) {
        decoded = jwt.verify(token, this.options.secret, {
          audience: this.options.audience,
          issuer: this.options.issuer
        }) as JwtPayload;
      } else {
        throw new AuthError('No JWKS or secret configured', 'INTERNAL');
      }
    } catch (err) {
      if (err instanceof AuthError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('expired')) {
        throw new AuthError('Token expired', 'EXPIRED');
      }
      throw new AuthError(`Token validation failed: ${message}`, 'INVALID_TOKEN');
    }

    const userId = decoded[this.userIdClaim] as string;
    const tenantId = decoded[this.tenantClaim] as string;

    if (!userId) throw new AuthError(`Missing ${this.userIdClaim} claim`, 'MISSING_CLAIMS');
    if (!tenantId) throw new AuthError(`Missing ${this.tenantClaim} claim`, 'MISSING_CLAIMS');

    const rolesValue = decoded[this.rolesClaim];
    const roles: string[] = Array.isArray(rolesValue)
      ? rolesValue.map(String)
      : typeof rolesValue === 'string'
        ? rolesValue.split(',').map(s => s.trim())
        : [];

    return {
      userId,
      tenantId,
      displayName: decoded[this.nameClaim] as string | undefined,
      roles,
      claims: decoded,
      // Standalone mode: pass the original token through for downstream SAP if
      // SAP accepts the same JWT (rare). Most standalone SAP connections use
      // a technical user and ignore propagationToken.
      propagationToken: token
    };
  }

  hasRole(user: UserContext, role: string): boolean {
    return user.roles.includes(role);
  }

  private verifyRsa(token: string): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          if (!this.jwks) {
            callback(new Error('JWKS not configured'));
            return;
          }
          this.jwks.getSigningKey(header.kid, (err, key) => {
            if (err) {
              callback(err);
              return;
            }
            callback(null, key?.getPublicKey());
          });
        },
        {
          audience: this.options.audience,
          issuer: this.options.issuer,
          algorithms: ['RS256']
        },
        (err, decoded) => {
          if (err) reject(err);
          else resolve(decoded as JwtPayload);
        }
      );
    });
  }
}
