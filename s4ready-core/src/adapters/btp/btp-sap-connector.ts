/**
 * SapConnector that uses BTP Destination Service to call SAP. Reads
 * destination configuration from VCAP, exchanges service credentials for an
 * OAuth token, then either:
 *   - Uses the destination's stored credentials (technical user mode), or
 *   - Performs principal propagation (forwards user's identity to SAP)
 *
 * For production deployments, prefer principal propagation so each user's
 * SAP authorizations are respected.
 */

import axios, { type AxiosInstance } from 'axios';
import {
  type SapConnector,
  type SapSystemInfo,
  type ODataQuery,
  type ODataResponse,
  SapConnectorError
} from '../../interfaces/sap-connector';
import type { TenantConfig } from '../../interfaces/config-store';
import type { Logger } from '../../utils/logger';

interface DestinationServiceCredentials {
  clientid: string;
  clientsecret: string;
  url: string; // token URL
  uri: string; // destination service base URI
}

interface ResolvedDestination {
  URL: string;
  User?: string;
  Password?: string;
  Authentication?: string;
  authTokens?: Array<{ value: string; type: string }>;
  // Additional properties exposed by destination definition
  [key: string]: unknown;
}

export interface BtpSapConnectorOptions {
  tenantConfig: TenantConfig;
  /** XSUAA token of the requesting user (for principal propagation). */
  userToken?: string;
  logger?: Logger;
}

export class BtpSapConnector implements SapConnector {
  private readonly destCreds: DestinationServiceCredentials;
  private readonly tenantConfig: TenantConfig;
  private readonly defaultSystemId: string;
  private readonly userToken?: string;
  private readonly logger?: Logger;
  private cachedAccessToken?: { token: string; expiresAt: number };

  constructor(options: BtpSapConnectorOptions) {
    this.tenantConfig = options.tenantConfig;
    this.userToken = options.userToken;
    this.logger = options.logger;

    const defaultSystem =
      options.tenantConfig.sap_systems.find(s => s.default)
      ?? options.tenantConfig.sap_systems[0];
    if (!defaultSystem) {
      throw new Error('No SAP systems configured for tenant');
    }
    this.defaultSystemId = defaultSystem.id;

    const vcap = JSON.parse(process.env.VCAP_SERVICES ?? '{}');
    const binding = vcap.destination?.[0]?.credentials;
    if (!binding) {
      throw new Error('Destination service binding not found in VCAP_SERVICES');
    }
    this.destCreds = binding;
  }

  async getSystemInfo(systemId?: string): Promise<SapSystemInfo> {
    const sys = this.resolveSystem(systemId);
    return { id: sys.id, type: sys.type, release: sys.release };
  }

  async fetchOData<T = Record<string, unknown>>(
    query: ODataQuery,
    systemId?: string
  ): Promise<ODataResponse<T>> {
    const sys = this.resolveSystem(systemId);
    const dest = await this.resolveDestination(sys.destination_name);
    const client = this.buildClient(dest);

    const start = Date.now();
    let url = `${query.servicePath}/${query.entitySet}`;
    if (query.key) url += `(${query.key})`;

    const params = new URLSearchParams({ $format: 'json', ...(query.params ?? {}) });

    try {
      const response = await client.get(url, { params });
      const data = response.data;

      let results: T[];
      let count: number | undefined;
      if (data?.d?.results !== undefined) {
        results = data.d.results;
        count = data.d.__count !== undefined ? Number(data.d.__count) : undefined;
      } else if (data?.d !== undefined) {
        results = [data.d];
      } else if (data?.value !== undefined) {
        results = data.value;
        count = data['@odata.count'] !== undefined ? Number(data['@odata.count']) : undefined;
      } else {
        results = [data];
      }

      return {
        results,
        count,
        meta: { durationMs: Date.now() - start, sapVersion: sys.release }
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const sapMsg = err?.response?.data?.error?.message?.value
        ?? err?.response?.data?.error?.message
        ?? err?.message;
      this.logger?.warn('OData call failed (BTP)', {
        systemId: sys.id, url, status, sapMsg
      });
      throw new SapConnectorError(
        `SAP OData call failed [${status ?? 'no-status'}]: ${sapMsg}`,
        status, sapMsg, sys.id
      );
    }
  }

  async ping(systemId?: string): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    const sys = this.resolveSystem(systemId);
    const start = Date.now();
    try {
      const dest = await this.resolveDestination(sys.destination_name);
      // Just resolving the destination proves reachability of dest service;
      // a real ping requires hitting the SAP system itself.
      const client = this.buildClient(dest);
      await client.get('/sap/opu/odata/IWFND/CATALOGSERVICE;v=2', {
        params: { $format: 'json', $top: '1' }
      });
      return { reachable: true, latencyMs: Date.now() - start };
    } catch (err: any) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err?.message ?? 'Unknown error'
      };
    }
  }

  private resolveSystem(systemId?: string) {
    const id = systemId ?? this.defaultSystemId;
    const sys = this.tenantConfig.sap_systems.find(s => s.id === id);
    if (!sys) throw new Error(`Unknown SAP system: ${id}`);
    return sys;
  }

  private async resolveDestination(destinationName: string): Promise<ResolvedDestination> {
    const accessToken = await this.getDestinationServiceToken();

    // If we have a user token and the destination supports principal propagation,
    // pass it via X-user-token header.
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`
    };
    if (this.userToken) {
      headers['X-user-token'] = this.userToken;
    }

    const response = await axios.get(
      `${this.destCreds.uri}/destination-configuration/v1/destinations/${destinationName}`,
      { headers }
    );
    return response.data.destinationConfiguration ?? response.data;
  }

  private async getDestinationServiceToken(): Promise<string> {
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt > Date.now() + 30_000) {
      return this.cachedAccessToken.token;
    }

    const response = await axios.post(
      `${this.destCreds.url}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.destCreds.clientid,
        client_secret: this.destCreds.clientsecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    this.cachedAccessToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
    };
    return this.cachedAccessToken.token;
  }

  private buildClient(dest: ResolvedDestination): AxiosInstance {
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };

    // Pass through SAP client header if present in destination properties.
    if (dest['sap-client']) {
      headers['sap-client'] = String(dest['sap-client']);
    }

    if (dest.Authentication === 'BasicAuthentication' && dest.User && dest.Password) {
      const encoded = Buffer.from(`${dest.User}:${dest.Password}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    } else if (dest.authTokens && dest.authTokens.length > 0) {
      // Principal propagation or OAuth — destination service returns a usable token.
      const tok = dest.authTokens[0];
      headers.Authorization = `${tok.type} ${tok.value}`;
    }

    return axios.create({
      baseURL: dest.URL,
      timeout: 30_000,
      headers
    });
  }
}
