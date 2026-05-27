# s4ready Deployment Report

## Date
2026-05-27

## Local Build Status
- s4ready-core build: PASS
- s4ready-core tests: 21/21 passing
- s4ready-vendor360 build: PASS
- Mock server tests: 4/4 passing

## Fixes Applied

### s4ready-core/src/adapters/standalone/in-memory-cache.ts
- Fixed import path from `../interfaces/cache` → `../../interfaces/cache` (was one level too shallow)

### s4ready-core/src/adapters/standalone/mock-sap-connector.ts
- Fixed null comparison bug in sort comparator: `av > bv` → `(av ?? '') > (bv ?? '')`
- Added `splitOnOr()` method and OR evaluation in `evalFilter()` — OData filters using `substringof(...) or ...` now work correctly (this was causing the search test to fail)

### s4ready-core/src/interfaces/tool.ts
- Changed `inputSchema: z.ZodSchema<TInput>` → `inputSchema: z.ZodType<TInput, any, any>`
- Required because `ZodDefault<ZodOptional<...>>` has differing input/output types which Zod's strict `ZodSchema<T>` does not allow

### s4ready-core/src/adapters/standalone/in-memory-config-store.ts (NEW)
- Created `InMemoryConfigStore` implementing `ConfigStore` interface
- Returns sensible default tenant config
- Used when `SAP_MODE=mock` to avoid requiring PostgreSQL for local dev

### s4ready-core/src/platform.ts
- Added `InMemoryConfigStore` import
- In standalone mode: when `SAP_MODE=mock`, uses `InMemoryConfigStore` and `LocalConsoleAuditLog` instead of PostgreSQL
- In standalone mode: when VCAP_SERVICES has XSUAA binding, uses `XsuaaAuthProvider` (enables BTP auth with standalone deploy mode)
- In standalone mode: when VCAP_SERVICES has aicore binding, uses `AiCoreClient` (picks up BTP AI Core automatically)

### s4ready-vendor360/tsconfig.json
- Changed `paths["@s4ready/core"]` from `["../s4ready-core/src/index.ts"]` → `["../s4ready-core/dist/index.d.ts"]`
- The old path caused TypeScript to re-compile core source files as part of vendor360 build, breaking the `rootDir` constraint

### s4ready-vendor360/package.json
- Added `dotenv` dependency (was imported in server.ts but missing from package.json)
- Changed `@s4ready/core` from `file:../s4ready-core` → `file:./vendor-packages/s4ready-core-1.0.0.tgz`
- CF Node.js buildpack cannot resolve relative paths outside the app directory; tarball works correctly

### s4ready-vendor360/deploy/btp/manifest.yml
- Changed `DEPLOY_MODE: btp` → `DEPLOY_MODE: standalone` (HANA not available in this subaccount)
- Changed `SAP_MODE: btp` → `SAP_MODE: mock` (no SAP system needed for demo)
- Added `SKIP_AUTH: "true"` (enables testing without Bearer token; set to false for production)
- Added `DEFAULT_TENANT_ID: default`
- Reduced instances from 2 → 1
- Removed `s4ready-vendor360-hana` and `s4ready-vendor360-aicore` from services (HANA not available; AI Core free plan blocked by existing extended plan)

### s4ready-vendor360/.cfignore (NEW)
- Excludes node_modules, .env, tests, .git, pnpm files from CF upload

### s4ready-vendor360/vendor-packages/s4ready-core-1.0.0.tgz (NEW)
- Pre-packed tarball of s4ready-core for CF deployment

## BTP Deployment
- CF API endpoint: https://api.cf.ap11.hana.ondemand.com
- API version: 3.220.0
- Org: National_University of Singapore_dy4t-l26dwj-qzmt
- Space: dev
- App URL: https://s4ready-vendor360.cfapps.ap11.hana.ondemand.com
- Health check: PASS
- MCP tools endpoint: PASS (5 tools visible: search_business_partner, get_partner_360, get_partner_transactions, explain_anomaly, get_partner_risk_summary)
- Mock search (Tata Steel): PASS

## Services Created
| Service | Offering | Plan | Status |
|---------|----------|------|--------|
| s4ready-vendor360-xsuaa | xsuaa | application | create succeeded |
| s4ready-vendor360-destination | destination | lite | create succeeded |
| s4ready-vendor360-connectivity | connectivity | lite | create succeeded |
| s4ready-vendor360-applogs | application-logs | lite | create succeeded |

**Not created (not available/blocked):**
- `s4ready-vendor360-hana` — HANA Cloud (hdi-shared/hana plan) not entitled in this subaccount
- `s4ready-vendor360-aicore` — AI Core free plan blocked: subaccount already has an `extended` plan instance (`default_aicore`)

## Issues Encountered

### 1. HANA Cloud not available
HANA Cloud service is not in the marketplace for this BTP subaccount. Worked around by using `DEPLOY_MODE=standalone` with `SAP_MODE=mock`. For production real-SAP use, either:
- Entitle HANA Cloud in BTP cockpit, or
- Use PostgreSQL (a `postgresql-db free` instance `zepcappg-postgres` already exists and is shared with other apps)

### 2. AI Core free plan blocked
Subaccount already has an AI Core `extended` plan instance (`default_aicore`). The `free` plan cannot coexist with `extended`. Worked around by omitting AI Core binding (AI features are disabled in mock mode anyway). For narrative generation, either:
- Bind `default_aicore` to this app directly (`cf bind-service s4ready-vendor360 default_aicore`)
- Set `ANTHROPIC_API_KEY` env var to use direct Anthropic API

### 3. pnpm file: dependency not usable on CF
The `file:../s4ready-core` reference in package.json works locally but the relative path `../` doesn't exist in CF's container. Fixed by running `npm pack` on s4ready-core and bundling the tarball in `vendor-packages/`.

### 4. MCP Streamable HTTP transport headers
The MCP endpoint requires `Accept: application/json, text/event-stream` header. Plain JSON-RPC POST without this header returns a 406 error. This is expected for the MCP Streamable HTTP transport (required for SAP Joule).

## Next Steps for the Developer

1. **Enable AI narratives**: Either set `ANTHROPIC_API_KEY` as a CF env var (`cf set-env s4ready-vendor360 ANTHROPIC_API_KEY sk-ant-...`) or bind the existing `default_aicore` service (`cf bind-service s4ready-vendor360 default_aicore && cf restage s4ready-vendor360`)

2. **Enable real SAP data**: When you have an SAP S/4HANA system, set `SAP_MODE=direct` and configure `SAP_BASE_URL`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_CLIENT` as CF env vars

3. **Register with SAP Joule**: 
   - Go to BTP Cockpit → Joule → Configure Agent Hub
   - Register the MCP endpoint: `https://s4ready-vendor360.cfapps.ap11.hana.ondemand.com/mcp`
   - Use the XSUAA service `s4ready-vendor360-xsuaa` for OAuth configuration
   - Assign role collection `S4Ready_Vendor360_User` to Joule users

4. **Set SKIP_AUTH=false for production**: Once Joule is configured and passing Bearer tokens, set `cf set-env s4ready-vendor360 SKIP_AUTH false && cf restage s4ready-vendor360`

5. **Add a database for tenant config persistence**: Bind the existing `zepcappg-postgres` service (postgresql-db free) and set `SAP_MODE=direct` to enable multi-tenant config storage

6. **Update the core tarball when making changes**: After any changes to s4ready-core, run `cd s4ready-core && npm pack`, copy the new tgz to `s4ready-vendor360/vendor-packages/`, update the version reference in `package.json`, and redeploy
