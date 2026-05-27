# Vendor 360 — Prerequisites & System Requirements

Send this document to your customer's IT team before starting implementation.

---

## SAP System Requirements

### Supported SAP Versions
| Version | Supported | Notes |
|---|---|---|
| S/4HANA Cloud Public Edition | ✅ Yes | All releases |
| S/4HANA Cloud Private Edition | ✅ Yes | Release 2308+ recommended |
| S/4HANA On-Premise | ✅ Yes | Release 2020 (1909 min) |
| ECC 6.0 | ❌ No | Use s4ready Clean Core Advisor instead |
| SAP R/3 | ❌ No | |

### Required SAP OData Services

These must be activated in the SAP system via `/IWFND/MAINT_SERVICE` or equivalent:

| Service | Entity | Purpose |
|---|---|---|
| `API_BUSINESS_PARTNER` | A_BusinessPartner | Vendor/customer master data |
| `API_PURCHASEORDER_PROCESS_SRV` | A_PurchaseOrder | Purchase orders (vendors) |
| `API_SALES_ORDER_SRV` | A_SalesOrder | Sales orders (customers) |
| `API_SUPPLIERINVOICE_PROCESS_SRV` | A_SupplierInvoice | Supplier invoices |
| `API_OPLACCTGDOCITEMCUBE_SRV` | OperationalAcctgDocItem | Open AP/AR items |
| `API_CLEAREDACCTGDOCITEMCUBE_SRV` | ClearedAcctgDocItem | Payment history |
| `API_QUALITYNOTIFICATION` | A_QualityNotification | Quality notifications (optional) |
| `API_PURGCONTRACT_PROCESS_SRV` | A_PurchaseContract | Contracts (optional) |

All are SAP-released APIs included in standard S/4HANA. No custom development required.

### SAP User/Role Requirements
The technical user or principal propagation flow needs:
- Read access to the 8 OData services above
- SAP role: `SAP_BR_PURCHASER` and/or `SAP_BR_AP_ACCOUNTANT` (or equivalent custom roles)
- No write access required

---

## Deployment Option 1: SaaS (s4ready-hosted)

**Customer provides:**
- SAP Cloud Connector installed and configured pointing to S/4HANA
- Outbound HTTPS from SAP landscape to `*.s4ready.ai` on port 443
- Identity provider (Azure AD / Okta / SAP IAS) with OIDC federation to s4ready.ai

**s4ready.ai provides:**
- Everything else (hosting, database, AI, monitoring)

**Rollout time:** 2–4 hours

---

## Deployment Option 2: Customer BTP

**Customer needs:**
- BTP Enterprise Agreement (not Trial)
- BTP Subaccount in a region close to their S/4
- Cloud Foundry space with entitlements:

| Service | Plan |
|---|---|
| Cloud Foundry Runtime | At least 1 GB |
| XSUAA | application |
| HANA Cloud | hdi-shared (minimum) |
| SAP AI Core | standard |
| Destination | lite |
| Connectivity | lite |
| Audit Log Service | standard |
| Application Logging | standard |

- SAP Build Code subscription (for Joule Agent Builder)
- SAP Joule entitlement

**s4ready.ai provides:**
- Deployment package (this repo)
- Deployment runbook
- Joule registration guide

**Rollout time:** 1–2 business days

---

## Deployment Option 3: Self-Hosted

**Customer provides:**
- Linux server: minimum **4 vCPU, 8 GB RAM** (VM, bare metal, or Kubernetes)
- **Docker 24+** and Docker Compose v2, OR Kubernetes 1.28+
- **PostgreSQL 14+** (can be managed service: AWS RDS, Azure Database, etc.)
- Outbound HTTPS from server to SAP system and to AI provider
- SSL certificate for the server's hostname
- AI provider API key (Anthropic, OpenAI, or Azure OpenAI)

**Optional:**
- Keycloak 24+ for identity management (bundled in docker-compose; customer can substitute any OIDC provider)
- SAP Cloud Connector (if S/4 is on-prem without direct HTTPS exposure)

**Note on Joule integration:** Joule requires a BTP Destination pointing to the MCP server. In self-hosted mode, the customer must either expose the server to the internet (recommended: behind a WAF) or use Cloud Connector for SAP Build Code to reach it.

**Rollout time:** 2–3 business days

---

## Network Requirements

| Direction | Source | Destination | Port | Protocol |
|---|---|---|---|---|
| Outbound | MCP server | SAP S/4HANA | 443 | HTTPS / OData |
| Outbound | MCP server | AI provider | 443 | HTTPS |
| Inbound | Joule / SAP Build Code | MCP server | 443 | HTTPS (MCP) |
| Inbound | Web browsers | MCP server | 443 | HTTPS (Web chat) |

---

## Security

- All data in transit: TLS 1.2+
- SAP credentials: stored in BTP Credential Store (Options 1 & 2) or customer's vault (Option 3)
- No SAP data stored permanently outside SAP: query results are cached in memory for ≤ 5 minutes, then discarded
- AI prompts: contain aggregated business KPIs only — no PII, no raw document content sent to AI
- Full audit trail: every query logged with user, timestamp, partner accessed, duration
- GDPR: data processed in the region of deployment; no cross-region transfer

---

## Estimating Go-Live Effort

| Activity | Effort |
|---|---|
| Activate OData services in SAP | 1–2 hours (SAP Basis) |
| Configure SAP Cloud Connector (on-prem only) | 2–4 hours |
| Deploy MCP server (Options 2 or 3) | 2–4 hours |
| Configure BTP Destination | 30 minutes |
| Register Joule agent in Build Code | 30 minutes |
| User acceptance testing | 1–2 days |
| **Total** | **2–3 days** |

For Option 1 (SaaS), most steps are handled by s4ready.ai. Customer effort is ≤ 4 hours.

---

## Contact

For implementation support: support@s4ready.ai  
Documentation: https://docs.s4ready.ai/vendor360
