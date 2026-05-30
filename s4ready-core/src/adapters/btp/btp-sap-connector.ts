/**
 * SapConnector that uses BTP Destination Service to call SAP. Reads
 * destination configuration from VCAP, exchanges service credentials for an
 * OAuth token, then either:
 *   - Uses the destination's stored credentials (technical user mode), or
 *   - Performs principal propagation (forwards user's identity to SAP)
 *
 * For on-premise SAP systems (ProxyType=OnPremise), all requests are routed
 * through the BTP Connectivity Service → Cloud Connector → SAP system.
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

interface ConnectivityCredentials {
  clientid: string;
  clientsecret: string;
  token_service_url?: string;
  url?: string;
  onpremise_proxy_host: string;
  onpremise_proxy_http_port?: string | number;
  onpremise_proxy_port?: string | number;
}

interface ResolvedDestination {
  URL: string;
  User?: string;
  Password?: string;
  Authentication?: string;
  ProxyType?: string;
  'sap-client'?: string;
  [key: string]: unknown;
}

interface DestinationServiceResponse {
  destinationConfiguration: ResolvedDestination;
  authTokens?: Array<{ value: string; type: string; error?: string }>;
  httpHeaders?: Array<{ key: string; value: string }>;
}

export interface BtpSapConnectorOptions {
  tenantConfig: TenantConfig;
  /** XSUAA token of the requesting user (for principal propagation). */
  userToken?: string;
  logger?: Logger;
}

export class BtpSapConnector implements SapConnector {
  private readonly destCreds: DestinationServiceCredentials;
  private readonly connCreds?: ConnectivityCredentials;
  private readonly tenantConfig: TenantConfig;
  private readonly defaultSystemId: string;
  private readonly userToken?: string;
  private readonly logger?: Logger;
  private cachedDestToken?: { token: string; expiresAt: number };
  private cachedConnToken?: { token: string; expiresAt: number };

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

    const destBinding = vcap.destination?.[0]?.credentials;
    if (!destBinding) {
      throw new Error('Destination service binding not found in VCAP_SERVICES');
    }
    this.destCreds = destBinding;

    // Connectivity Service binding — required for on-premise (Cloud Connector) destinations.
    this.connCreds = vcap.connectivity?.[0]?.credentials;
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
    const destResp = await this.resolveDestination(sys.destination_name);
    const client = await this.buildClient(destResp);

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
      const destResp = await this.resolveDestination(sys.destination_name);
      const client = await this.buildClient(destResp);
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

  private async resolveDestination(destinationName: string): Promise<DestinationServiceResponse> {
    const accessToken = await this.getDestinationServiceToken();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`
    };
    if (this.userToken) {
      headers['X-user-token'] = this.userToken;
    }

    const response = await axios.get<DestinationServiceResponse>(
      `${this.destCreds.uri}/destination-configuration/v1/destinations/${destinationName}`,
      { headers }
    );

    this.logger?.info('Destination resolved', {
      name: destinationName,
      proxyType: response.data.destinationConfiguration?.ProxyType,
      auth: response.data.destinationConfiguration?.Authentication,
      hasAuthTokens: !!response.data.authTokens?.length
    });

    return response.data;
  }

  private async getDestinationServiceToken(): Promise<string> {
    if (this.cachedDestToken && this.cachedDestToken.expiresAt > Date.now() + 30_000) {
      return this.cachedDestToken.token;
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
    this.cachedDestToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
    };
    return this.cachedDestToken.token;
  }

  private async getConnectivityToken(): Promise<string> {
    if (this.cachedConnToken && this.cachedConnToken.expiresAt > Date.now() + 30_000) {
      return this.cachedConnToken.token;
    }
    if (!this.connCreds) {
      throw new Error('Connectivity service not bound — required for on-premise destinations');
    }
    const tokenUrl = this.connCreds.token_service_url ?? this.connCreds.url;
    if (!tokenUrl) {
      throw new Error('Connectivity service binding missing token_service_url');
    }
    const response = await axios.post(
      `${tokenUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.connCreds.clientid,
        client_secret: this.connCreds.clientsecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    this.cachedConnToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
    };
    return this.cachedConnToken.token;
  }

  private async buildClient(destResp: DestinationServiceResponse): Promise<AxiosInstance> {
    const dest = destResp.destinationConfiguration;
    const headers: Record<string, string> = {
      Accept: 'application/json'
    };

    if (dest['sap-client']) {
      headers['sap-client'] = String(dest['sap-client']);
    }

    // Auth: prefer tokens returned by Destination Service (handles OAuth, PP, etc.)
    const authTokens = destResp.authTokens?.filter(t => !t.error);
    if (authTokens && authTokens.length > 0) {
      const tok = authTokens[0];
      headers.Authorization = `${tok.type} ${tok.value}`;
    } else if (dest.Authentication === 'BasicAuthentication' && dest.User && dest.Password) {
      const encoded = Buffer.from(`${dest.User}:${dest.Password}`).toString('base64');
      headers.Authorization = `Basic ${encoded}`;
    }

    const isOnPremise = dest.ProxyType === 'OnPremise';

    if (isOnPremise) {
      // Route through BTP Connectivity Service → Cloud Connector → SAP
      if (!this.connCreds) {
        throw new Error(
          'Connectivity service not bound. On-premise destinations require the ' +
          'connectivity service to be bound (s4ready-vendor360-connectivity).'
        );
      }
      const connToken = await this.getConnectivityToken();
      headers['Proxy-Authorization'] = `Bearer ${connToken}`;

      const proxyPort = Number(
        this.connCreds.onpremise_proxy_http_port
        ?? this.connCreds.onpremise_proxy_port
        ?? 20003
      );

      this.logger?.info('Routing via Connectivity proxy', {
        proxyHost: this.connCreds.onpremise_proxy_host,
        proxyPort,
        targetUrl: dest.URL
      });

      return axios.create({
        baseURL: dest.URL,
        timeout: 30_000,
        headers,
        proxy: {
          protocol: 'http',
          host: this.connCreds.onpremise_proxy_host,
          port: proxyPort
        }
      });
    }

    // Cloud destination — direct call
    return axios.create({
      baseURL: dest.URL,
      timeout: 30_000,
      headers
    });
  }
}
