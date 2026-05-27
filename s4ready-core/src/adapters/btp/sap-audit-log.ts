/**
 * AuditLog backed by SAP Audit Log Service (BTP). Falls back to local
 * logging if the service binding is missing.
 *
 * For production deployments, the @sap/audit-logging package provides a
 * fully-featured client. Here we implement the minimal HTTP shape directly.
 */

import axios from 'axios';
import type { AuditEvent, AuditLog } from '../../interfaces/audit-log';
import type { Logger } from '../../utils/logger';

interface AuditLogCredentials {
  url: string;
  uaa: {
    clientid: string;
    clientsecret: string;
    url: string;
  };
}

export class SapAuditLog implements AuditLog {
  private readonly credentials: AuditLogCredentials;
  private readonly logger?: Logger;
  private cachedToken?: { token: string; expiresAt: number };

  constructor(credentials: AuditLogCredentials, logger?: Logger) {
    this.credentials = credentials;
    this.logger = logger;
  }

  async write(event: AuditEvent): Promise<void> {
    const timestamp = event.timestamp ?? new Date().toISOString();
    try {
      const token = await this.getToken();
      // Audit Log Service uses configurable message structures.
      // Here we map our generic event onto the "configuration-change" or
      // "data-access" categories per SAP's recommendation.
      const endpoint = event.category === 'data_access'
        ? '/audit-log/v2/data-accesses'
        : '/audit-log/v2/security-events';

      await axios.post(
        `${this.credentials.url}${endpoint}`,
        {
          uuid: this.uuid(),
          time: timestamp,
          tenant: event.tenantId,
          user: event.userId,
          object: {
            type: event.toolId ?? 'platform',
            id: event.resource ?? event.action
          },
          attributes: [
            { name: 'category', new: event.category },
            { name: 'action', new: event.action },
            { name: 'outcome', new: event.outcome },
            { name: 'duration_ms', new: String(event.durationMs ?? 0) }
          ],
          channel: 's4ready-mcp-platform'
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 5_000
        }
      );
    } catch (err) {
      // Audit failures must never break the user-visible flow.
      this.logger?.error('Audit Log write failed', {
        error: err instanceof Error ? err.message : String(err),
        event
      });
    }
  }

  async query(): Promise<AuditEvent[]> {
    // SAP Audit Log Service does not provide a query API to consumers —
    // audit data is accessed via the BTP cockpit or a separate viewer.
    // Returning [] is the documented behavior for this implementation.
    this.logger?.warn('Audit query not supported on SAP Audit Log Service');
    return [];
  }

  private async getToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 30_000) {
      return this.cachedToken.token;
    }
    const response = await axios.post(
      `${this.credentials.uaa.url}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.uaa.clientid,
        client_secret: this.credentials.uaa.clientsecret
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    this.cachedToken = {
      token: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
    };
    return this.cachedToken.token;
  }

  private uuid(): string {
    // Lightweight UUID v4-ish generator. Good enough for audit message IDs.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
