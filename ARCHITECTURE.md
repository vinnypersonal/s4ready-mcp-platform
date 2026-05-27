# Architecture — s4ready.ai Agent Platform

## High-level system view

```
                     ┌──────────────────────────────────────┐
                     │       Customer Access Channels        │
                     │                                       │
                     │  Joule    Web Chat   REST API  Teams │
                     │  (SAP)    (Next.js)  (direct)  (bot) │
                     └──────────────────────────────────────┘
                                       │
                                       ▼
                ┌──────────────────────────────────────────┐
                │     s4ready-vendor360  (or any tool)      │
                │                                           │
                │     ┌─────────────────────────────┐      │
                │     │   Tool-Specific Logic       │      │
                │     │   - MCP tool handlers       │      │
                │     │   - SAP query builders      │      │
                │     │   - Aggregation & KPIs      │      │
                │     │   - AI narrative generation │      │
                │     └─────────────────────────────┘      │
                │              │                            │
                │              ▼                            │
                │     ┌─────────────────────────────┐      │
                │     │   @s4ready/core (library)   │      │
                │     │                             │      │
                │     │   Platform Interfaces:      │      │
                │     │   • AuthProvider            │      │
                │     │   • ConfigStore             │      │
                │     │   • AuditLog                │      │
                │     │   • SapConnector            │      │
                │     │   • AiClient                │      │
                │     │   • Cache                   │      │
                │     └─────────────────────────────┘      │
                │              │                            │
                │      ┌───────┴───────┐                    │
                │      ▼               ▼                    │
                │  BTP Adapters    Standalone Adapters     │
                │  ─────────────  ───────────────────       │
                │  • XSUAA        • Keycloak / JWT          │
                │  • HANA Cloud   • PostgreSQL              │
                │  • Audit Log    • PostgreSQL audit table  │
                │  • Destination  • Direct SAP connection   │
                │  • AI Core      • Anthropic/OpenAI direct │
                └──────────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────┐
                │   Customer's SAP System       │
                │   • S/4HANA Cloud / Private   │
                │   • S/4HANA on-prem           │
                │   • ECC (clean-core tool only)│
                └──────────────────────────────┘
```

## Three deployment modes

The `DEPLOY_MODE` environment variable selects which adapters bind:

| Mode | AuthProvider | ConfigStore | AuditLog | SapConnector | AiClient |
|---|---|---|---|---|---|
| `btp` | XSUAA | HANA Cloud | SAP Audit Log Svc | BTP Destination | AI Core |
| `standalone` | JWT or Keycloak | PostgreSQL | PostgreSQL | Direct HTTP | Anthropic/OpenAI direct |
| `hybrid` | configurable per service | configurable | configurable | configurable | configurable |

Same tool code, three deploy modes, switched at startup.

## Tool isolation

Each tool repo:
- Depends on `@s4ready/core` (private npm package)
- Has its own `manifest.ts` declaring tool metadata
- Has its own deploy artifacts (`deploy/btp/`, `deploy/docker/`, `deploy/kubernetes/`)
- Is independently versioned, sold, deployed
- Has its own `PREREQUISITES.md` listing customer requirements

A customer buying Vendor 360 never sees Clean Core code. A consulting partner reselling can resell one tool, not the whole platform.

## Data flow: a Vendor 360 query

```
1. User opens Joule, types "Vendor 360 for Tata Steel"
2. Joule routes to registered MCP agent → POST to your tool's /mcp endpoint
3. Tool's MCP handler validates JWT (XSUAA in BTP, Keycloak/JWT in standalone)
4. Tool's MCP handler resolves tenant from JWT claims
5. Tool calls @s4ready/core to load tenant config (cached, HANA or Postgres)
6. Tool calls SAP search query (resolves "Tata Steel" → vendor 1000234)
7. Tool calls get_partner_360 — parallel-fetches 8 OData services
8. Tool aggregates data, computes KPIs
9. Tool calls AI client for narrative (Claude via AI Core or direct)
10. Tool writes audit log entry
11. Response streams back to Joule as MCP tool result
12. Joule renders as a card with KPI tiles + narrative
```

Total target: under 4 seconds p95.

## Multi-tenancy

In SaaS mode (one deployed instance, many customers):
- Every request carries a `tenant_id` claim in JWT
- `ConfigStore.getTenantConfig(tenantId)` returns per-tenant settings
- `SapConnector` uses tenant-specific destination / credentials
- `AuditLog` writes include tenant_id
- AI prompts include tenant context but never leak across tenants
- Database queries are tenant-scoped at the SQL layer

In single-tenant mode (customer BTP, self-hosted):
- `DEFAULT_TENANT_ID` env var set
- All requests resolve to that tenant
- Simplified deployment

## Cost controls (baked in)

Every tool invocation enforces:

1. **Token budget per query** — hard cap per tool (e.g., Vendor 360 = 5000 tokens)
2. **Per-tenant monthly quota** — soft cap with overage billing
3. **Per-user rate limit** — prevents runaway automation (default 60 req/min)
4. **Cache-first AI** — identical queries within TTL return cached narrative
5. **Tiered models** — config selects model per query complexity
6. **Structured queries skip LLM** — top-N lists don't need AI

Real-world cost per Vendor 360 query with these controls: $0.005–0.015.

## Security model

1. **Layer 1 — User auth:** OIDC via customer IdP or Joule's SAML (handled by SAP)
2. **Layer 2 — Service-to-service:** JWT validated on every MCP call
3. **Layer 3 — SAP access:** Principal Propagation (production) or service user (dev)
4. **Layer 4 — Data isolation:** tenant_id enforced at every layer
5. **Layer 5 — Audit:** every tool call logged with who/what/when/duration
6. **Layer 6 — PII handling:** configurable redaction before LLM, never log secrets

## Why this architecture

- **Deployment-agnostic core** = sell to enterprise (BTP) and SMB (standalone) without forking the codebase
- **Per-tool repos** = sell independently, license cleanly, security review per product
- **MCP protocol native** = first-class Joule integration without custom adapters
- **Cost controls in core** = profitable at scale, not just at demo time
