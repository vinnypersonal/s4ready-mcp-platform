# s4ready.ai Agent Platform

AI-powered agents for SAP S/4HANA and ECC, deployable as SaaS, on customer BTP, or self-hosted.

## What's in this monorepo

This is a deliverable bundle. Each folder is intended to become its own GitHub repository so tools can be sold and licensed independently.

| Folder | Purpose | Status |
|---|---|---|
| `s4ready-core/` | Shared platform library — auth, config, MCP server, SAP connector, AI client | ✅ Production-ready |
| `s4ready-vendor360/` | First tool: Vendor / Customer 360° view for SAP | ✅ Production-ready |
| `s4ready-clean-core/` | Code migration advisor for ECC → S/4HANA | 📋 Skeleton + docs |
| `s4ready-admin-portal/` | Tenant management UI | 📋 Skeleton + docs |
| `s4ready-portal-additions/` | Files to add to existing s4ready.ai Next.js portal | 📋 Skeleton + docs |

## Deployment models supported

Every tool supports all three:

| Model | Deploy target | Customer experience |
|---|---|---|
| **SaaS** | Your BTP (or your DigitalOcean/AWS) | Customer logs in at `app.s4ready.ai` |
| **Customer BTP** | Customer's own BTP CF | Customer's IT deploys; integrates with their Joule |
| **Self-hosted** | Customer's Linux/K8s | Air-gapped capable, no BTP needed |

## Quick start (local development, 15 minutes)

```bash
# 1. Install pnpm if you haven't
npm install -g pnpm

# 2. Build the core library
cd s4ready-core
pnpm install
pnpm build

# 3. Run Vendor 360 locally with mocked SAP
cd ../s4ready-vendor360
pnpm install
pnpm dev

# 4. Test it
curl http://localhost:8080/health
curl -X POST http://localhost:8080/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Deploy to BTP

```bash
cd s4ready-vendor360
./deploy/scripts/deploy-btp.sh
```

## Deploy standalone (Docker)

```bash
cd s4ready-vendor360
docker compose -f deploy/docker/docker-compose.yml up -d
```

See each tool's `README.md` and `docs/PREREQUISITES.md` for details.

## Next steps after unzipping

1. Create separate GitHub repos for each top-level folder
2. Initialize each as its own git repo
3. Push to GitHub
4. Set up GitHub Packages to publish `s4ready-core` as a private package
5. First tool to test: `s4ready-vendor360` against your S/4 sandbox

## License

Proprietary. © 2026 s4ready.ai. All rights reserved.
