/**
 * SAP connectivity. Single entry point for tool authors to call SAP,
 * regardless of:
 *   - SAP version (S/4 Cloud, S/4 on-prem, ECC)
 *   - Auth mode (Principal Propagation, basic, OAuth)
 *   - Deployment mode (BTP Destination Service, direct HTTP)
 *
 * Tool authors invoke fetchOData / callBapi. The connector resolves the
 * right transport, credentials, and SAP client.
 */

import type { SapSystemType } from '../sap/versions';

export interface SapSystemInfo {
  id: string;
  type: SapSystemType;
  release?: string;
}

export interface ODataQuery {
  /** Service path, e.g. "/sap/opu/odata/sap/API_BUSINESS_PARTNER" */
  servicePath: string;
  /** Entity set, e.g. "A_BusinessPartner" */
  entitySet: string;
  /** OData query parameters: $filter, $select, $expand, $top, $orderby */
  params?: Record<string, string>;
  /** Specific record key, e.g. "'1000234'" — appended as (key) */
  key?: string;
}

export interface ODataResponse<T = Record<string, unknown>> {
  /** Records returned. Always an array even if a single record was requested. */
  results: T[];
  /** Total count if $count was requested. */
  count?: number;
  /** Raw response metadata for debugging. */
  meta?: {
    durationMs: number;
    sapVersion?: string;
    requestId?: string;
  };
}

/**
 * BAPI / RFC call — used by ECC adapter and rarely by S/4 (only when an
 * OData equivalent doesn't exist).
 */
export interface BapiCall {
  bapiName: string;
  importParams?: Record<string, unknown>;
  tableParams?: Record<string, unknown[]>;
}

export interface BapiResponse {
  exportParams: Record<string, unknown>;
  tableParams: Record<string, unknown[]>;
  return?: Array<{ type: string; id: string; number: string; message: string }>;
}

export interface SapConnector {
  /**
   * Information about the connected SAP system. Useful for version-gating
   * tool logic.
   */
  getSystemInfo(systemId?: string): Promise<SapSystemInfo>;

  /**
   * Fetch OData. The standard call for S/4 and modern ECC.
   * @param systemId Which SAP system to call (matches sap_systems[].id in tenant config).
   *                 Omit to use the tenant's default system.
   */
  fetchOData<T = Record<string, unknown>>(
    query: ODataQuery,
    systemId?: string
  ): Promise<ODataResponse<T>>;

  /**
   * Call a BAPI / RFC. Only available on ECC connectors.
   * @throws Error on S/4 connectors that don't expose BAPIs.
   */
  callBapi?(call: BapiCall, systemId?: string): Promise<BapiResponse>;

  /**
   * Test reachability of a system. Used by admin portal.
   */
  ping(systemId?: string): Promise<{ reachable: boolean; latencyMs?: number; error?: string }>;
}

export class SapConnectorError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly sapMessage?: string,
    public readonly systemId?: string
  ) {
    super(message);
    this.name = 'SapConnectorError';
  }
}
