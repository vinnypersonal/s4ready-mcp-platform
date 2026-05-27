# s4ready Vendor & Customer 360

> Get a complete 360° view of any SAP vendor or customer in one question.

## What it is

An AI agent for SAP S/4HANA that replaces 8 transactions and 3 systems with a single
conversational query. Works inside SAP Joule, Microsoft Teams, or the s4ready web app.

Ask: **"Vendor 360 for Tata Steel"**

Get: open POs, invoices, payments, quality notifications, contracts, risk flags,
and an AI-generated executive summary — in under 4 seconds.

## Who it's for

- **Procurement Managers** — pre-meeting briefings, vendor risk review
- **Accounts Payable** — blocked invoice investigation, payment status
- **Sales Managers** — customer relationship state, AR overview
- **Credit Managers** — risk assessment, credit limit review
- **Plant Managers** — supplier performance, quality issues
- **CFOs / Finance Heads** — portfolio-level vendor/customer risk

## Deployment options

All three supported out of the box:

| Mode | Where it runs | Joule support |
|---|---|---|
| **SaaS** | s4ready.ai (your BTP) | ✅ |
| **Customer BTP** | Customer's own BTP CF | ✅ |
| **Self-hosted** | Customer's Linux/K8s | ⚠️ (requires internet exposure) |

## Quick start (mock data — no SAP needed)

```bash
cp .env.example .env          # defaults to SAP_MODE=mock, SKIP_AUTH=true
pnpm install && pnpm dev
curl http://localhost:8080/health
```

## Quick start (real SAP)

```bash
cp .env.example .env
# Edit .env: set SAP_BASE_URL, SAP_USERNAME, SAP_PASSWORD, SAP_CLIENT
# Edit .env: set ANTHROPIC_API_KEY
# Edit .env: set SAP_MODE=direct
pnpm install && pnpm dev
```

## Deploy to BTP

```bash
# Login to CF first
cf login -a https://api.cf.eu10.hana.ondemand.com

# Deploy (creates services + pushes app)
./deploy/scripts/deploy-btp.sh
```

## Deploy standalone (Docker)

```bash
cp .env.example .env   # edit as above
./deploy/scripts/deploy-docker.sh
```

## Register with Joule

After deployment: follow [docs/JOULE_REGISTRATION.md](docs/JOULE_REGISTRATION.md).

## MCP tools exposed

| Tool | What it does |
|---|---|
| `search_business_partner` | Fuzzy search by name or ID |
| `get_partner_360` | Full 360 view (headliner) |
| `get_partner_transactions` | Drill-down by transaction type |
| `explain_anomaly` | Root cause on a specific risk flag |
| `get_partner_risk_summary` | Risk score for 1-20 partners |

## Customer requirements

See [docs/PREREQUISITES.md](docs/PREREQUISITES.md) — send this to the customer's IT team.

## Architecture

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the full platform design.

## License

Proprietary. © 2026 s4ready.ai. All rights reserved.
Not to be redistributed without a valid license agreement.
