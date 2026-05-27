/**
 * AuthProvider that validates XSUAA tokens (BTP). XSUAA is essentially a
 * customized OAuth2/JWT provider, so we delegate most of the work to the
 * existing JwtAuthProvider after extracting BTP-specific bindings from VCAP.
 *
 * In production, prefer the @sap/xssec library for fully-vetted XSUAA
 * validation. We use a thin JWKS-based check here to keep deps minimal.
 */

import { JwtAuthProvider } from '../standalone/jwt-auth';
import type { AuthProvider, UserContext } from '../../interfaces/auth-provider';

interface XsuaaCredentials {
  clientid: string;
  clientsecret: string;
  url: string; // OAuth issuer URL
  uaadomain: string;
  xsappname: string;
  /** Token verification key (PEM). */
  verificationkey?: string;
}

export class XsuaaAuthProvider implements AuthProvider {
  private readonly delegate: JwtAuthProvider;

  constructor(credentials: XsuaaCredentials) {
    // XSUAA exposes a JWKS endpoint at <url>/token_keys.
    const jwksUri = `${credentials.url}/token_keys`;

    this.delegate = new JwtAuthProvider({
      jwksUri,
      issuer: credentials.url,
      audience: credentials.xsappname,
      // XSUAA standard claim names:
      tenantClaim: 'zid', // BTP zone ID = tenant ID
      rolesClaim: 'scope', // XSUAA scopes
      userIdClaim: 'user_name',
      nameClaim: 'given_name'
    });
  }

  validateToken(token: string): Promise<UserContext> {
    return this.delegate.validateToken(token);
  }

  hasRole(user: UserContext, role: string): boolean {
    // XSUAA scopes are namespaced: <xsappname>.<scope>. Match against either
    // the bare role or the namespaced form.
    return user.roles.some(r => r === role || r.endsWith(`.${role}`));
  }

  /**
   * Helper: parse XSUAA credentials from VCAP_SERVICES env (set by CF).
   */
  static fromVcapServices(env: NodeJS.ProcessEnv = process.env): XsuaaAuthProvider {
    const vcap = JSON.parse(env.VCAP_SERVICES ?? '{}');
    const binding = vcap.xsuaa?.[0]?.credentials;
    if (!binding) {
      throw new Error('No XSUAA service binding found in VCAP_SERVICES');
    }
    return new XsuaaAuthProvider(binding);
  }
}
