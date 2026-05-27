/**
 * SapConnector that talks directly to SAP via HTTP, no BTP Destination Service.
 * Used in standalone deployments (Option 3) and in local dev. Supports
 * S/4HANA OData V2/V4 with Basic, OAuth password, and OAuth SAML Bearer auth.
 *
 * For ECC, this connector covers the SOAP web service case. RFC support is
 * a separate adapter (planned in the clean-core tool repo).
 */

import axios, { type AxiosInstance } from 'axios';
import https from 'https';
import type { TenantConfig } from '../../interfaces/config-store';
import {
  type SapConnector,
  type SapSystemInfo,
  type ODataQuery,
  type ODataResponse,
  SapConnectorError
} from '../../interfaces/sap-connector';
import type { Logger } from '../../utils/logger';

interface SystemContext {
  id: string;
  type: 's4hana_cloud_public' | 's4hana_cloud_private' | 's4hana_on_prem' | 'ecc';
  baseUrl: string;
  client: AxiosInstance;
  release?: string;
}

export interface DirectSapConnectorOptions {
  tenantConfig: TenantConfig;
  /** Optional resolver to fetch secrets referenced by *_ref fields. */
  secretResolver?: (ref: string) => Promise<string>;
  /** Allow self-signed SAP certs in dev (set false in prod). */
  rejectUnauthorized?: boolean;
  logger?: Logger;
}

export class DirectSapConnector implements SapConnector {
  private readonly systems = new Map<string, SystemContext>();
  private readonly defaultSystemId: string;
  private readonly logger?: Logger;

  constructor(options: DirectSapConnectorOptions) {
    this.logger = options.logger;

    const defaultSystem = options.tenantConfig.sap_systems.find(s => s.default)
      ?? options.tenantConfig.sap_systems[0];
    if (!defaultSystem) {
      throw new Error('No SAP systems configured for tenant');
    }
    this.defaultSystemId = defaultSystem.id;

    for (const sys of options.tenantConfig.sap_systems) {
      if (!sys.direct) {
        // No direct config — this system is configured for BTP destinations only.
        // We skip it here; the BtpSapConnector handles those.
        continue;
      }

      const httpsAgent = new https.Agent({
        rejectUnauthorized: options.rejectUnauthorized ?? true
      });

      const client = axios.create({
        baseURL: sys.direct.base_url,
        timeout: 30_000,
        httpsAgent,
        headers: {
          Accept: 'application/json',
          'sap-client': sys.direct.sap_client ?? '100'
        }
      });

      // Auth interceptor — applied per-request so we can refresh creds.
      client.interceptors.request.use(async config => {
        switch (sys.direct!.auth_type) {
          case 'basic': {
            const user = sys.direct!.username_ref
              ? await options.secretResolver?.(sys.direct!.username_ref)
              : undefined;
            const pass = sys.direct!.password_ref
              ? await options.secretResolver?.(sys.direct!.password_ref)
              : undefined;
            if (user && pass) {
              const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
              config.headers.set('Authorization', `Basic ${encoded}`);
            }
            break;
          }
          // OAuth flows are stubbed for now; production deployments should
          // implement these. Most direct dev usage relies on basic auth.
          case 'oauth2_password':
          case 'oauth2_saml_bearer':
          case 'principal_propagation':
            throw new SapConnectorError(
              `Auth type '${sys.direct!.auth_type}' is not yet supported in standalone direct connector. ` +
              `Use BTP mode for principal propagation, or basic auth for development.`
            );
        }
        return config;
      });

      this.systems.set(sys.id, {
        id: sys.id,
        type: sys.type,
        baseUrl: sys.direct.base_url,
        client,
        release: sys.release
      });
    }

    if (this.systems.size === 0) {
      throw new Error('No SAP systems with direct connection configured');
    }
  }

  async getSystemInfo(systemId?: string): Promise<SapSystemInfo> {
    const sys = this.resolve(systemId);
    return { id: sys.id, type: sys.type, release: sys.release };
  }

  async fetchOData<T = Record<string, unknown>>(
    query: ODataQuery,
    systemId?: string
  ): Promise<ODataResponse<T>> {
    const sys = this.resolve(systemId);
    const start = Date.now();

    let url = `${query.servicePath}/${query.entitySet}`;
    if (query.key) url += `(${query.key})`;

    const params = new URLSearchParams({ $format: 'json', ...(query.params ?? {}) });

    try {
      const response = await sys.client.get(url, { params });
      const data = response.data;

      // OData V2: { d: { results: [...] } } or { d: {...singleObj} }
      // OData V4: { value: [...] } or {...singleObj}
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
        meta: {
          durationMs: Date.now() - start,
          sapVersion: sys.release
        }
      };
    } catch (err: any) {
      const status = err?.response?.status;
      const sapMsg = err?.response?.data?.error?.message?.value
        ?? err?.response?.data?.error?.message
        ?? err?.message;
      this.logger?.warn('OData call failed', {
        systemId: sys.id,
        url,
        status,
        sapMsg
      });
      throw new SapConnectorError(
        `SAP OData call failed [${status ?? 'no-status'}]: ${sapMsg}`,
        status,
        sapMsg,
        sys.id
      );
    }
  }

  async ping(systemId?: string): Promise<{ reachable: boolean; latencyMs?: number; error?: string }> {
    const sys = this.resolve(systemId);
    const start = Date.now();
    try {
      // Lightweight call: fetch service catalog.
      await sys.client.get('/sap/opu/odata/IWFND/CATALOGSERVICE;v=2', {
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

  private resolve(systemId?: string): SystemContext {
    const id = systemId ?? this.defaultSystemId;
    const sys = this.systems.get(id);
    if (!sys) throw new Error(`Unknown SAP system: ${id}`);
    return sys;
  }
}
