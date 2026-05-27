# s4ready Admin Portal

**Status: Phase 2 (after first customer)**

Tenant management UI for s4ready.ai SaaS customers and tool operators.

## Five screens

1. **Dashboard** — tenant overview, usage tiles, recent activity feed
2. **SAP Systems** — register and test SAP connections, monitor latency
3. **Tools Catalog** — enable/disable tools, configure per-tool settings, try-it sandbox
4. **Users & Roles** — assign users to roles, sync from IdP, bulk import
5. **Billing & Audit** — consumption charts, audit log download, invoice history

## Tech stack (planned)

- **Framework**: Next.js 14 (App Router)
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Next.js API routes calling MCP hub's `/api/v1/admin/*` endpoints
- **Auth**: NextAuth.js with OIDC federation
- **Deploy**: Vercel (SaaS mode) or standalone Docker

## Integration with s4ready.ai portal

The admin portal will live at `app.s4ready.ai/admin` for SaaS customers,
or at `<customer-url>/admin` for self-hosted deployments.

The same Next.js app will also host:
- `app.s4ready.ai/` — customer dashboard
- `app.s4ready.ai/vendor360` — Vendor 360 web chat UI
- `app.s4ready.ai/code-review` — existing ABAP review tool (migrated here)

## Build plan

Kick off after first paying customer has validated Vendor 360. The admin portal
follows the tool, not the other way around — first customer can be configured
with YAML files directly.
