# Getting Started — s4ready.ai Agent Platform

This guide takes you from a fresh zip to a running, working Vendor 360 tool in 15 minutes.

## Prerequisites on your laptop

- **Node.js 20+** ([nodejs.org](https://nodejs.org))
- **pnpm** (`npm install -g pnpm`)
- **Docker Desktop** (optional, for standalone deployment testing)
- **Cloud Foundry CLI** (optional, for BTP deployment) — `cf --version`
- **MTA Build Tool** (optional, for BTP deployment) — `npm install -g mbt`

## Step 1: Extract and inspect

```bash
unzip s4ready-mcp-platform-v1.zip
cd s4ready-mcp-platform-v1
ls -la
```

You'll see 5 folders + this guide. Each top-level folder is a future GitHub repo.

## Step 2: Build the shared core library

```bash
cd s4ready-core
pnpm install
pnpm build
pnpm test
```

Expected: all tests pass. This produces `dist/` which `s4ready-vendor360` consumes.

## Step 3: Run Vendor 360 locally (with mocked SAP)

```bash
cd ../s4ready-vendor360
pnpm install
cp .env.example .env
# Default .env has DEPLOY_MODE=standalone, SAP_MODE=mock — works out of the box
pnpm dev
```

You should see:
```
[s4ready] Loaded tool: vendor360 (v1.0.0)
[s4ready] Server listening on http://0.0.0.0:8080
[s4ready] MCP endpoint: http://0.0.0.0:8080/mcp
[s4ready] Health endpoint: http://0.0.0.0:8080/health
```

## Step 4: Talk to the tool

In a new terminal:

```bash
# Health check
curl http://localhost:8080/health

# List MCP tools
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/list",
    "id":1
  }'

# Call the search tool
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{"name":"search_business_partner","arguments":{"query":"tata"}},
    "id":2
  }'

# Get full Vendor 360 (mocked data)
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc":"2.0",
    "method":"tools/call",
    "params":{"name":"get_partner_360","arguments":{"partnerId":"1000234","partnerType":"VENDOR"}},
    "id":3
  }'
```

## Step 5: Run against your real S/4 system

Edit `s4ready-vendor360/.env`:

```bash
DEPLOY_MODE=standalone
SAP_MODE=direct
SAP_BASE_URL=https://your-s4.example.com
SAP_USERNAME=your_user
SAP_PASSWORD=your_password
SAP_CLIENT=100
```

Restart the server. The tool now hits your real S/4.

## Step 6: Deploy to BTP

See `s4ready-vendor360/docs/INSTALLATION.md` section "BTP deployment".

## Step 7: Register with Joule

See `s4ready-vendor360/docs/JOULE_REGISTRATION.md`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm: command not found` | Run `npm install -g pnpm` |
| `Cannot find module '@s4ready/core'` | Run `pnpm build` in `s4ready-core` first |
| Port 8080 already in use | Set `PORT=8081` in `.env` |
| `401 Unauthorized` from S/4 | Check `.env` SAP_USERNAME, SAP_PASSWORD, SAP_CLIENT |
| `Connection refused` to S/4 | Check SAP_BASE_URL is reachable, SSL cert valid |

## Where to go next

- Read `s4ready-vendor360/docs/PREREQUISITES.md` — share with prospects
- Read `s4ready-vendor360/docs/INSTALLATION.md` — your deployment playbook
- Read `ARCHITECTURE.md` — the full platform architecture
- Read `s4ready-clean-core/README.md` — the next tool to build
