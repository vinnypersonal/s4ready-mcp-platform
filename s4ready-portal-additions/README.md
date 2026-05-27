# s4ready Portal Additions

**Status: Phase 2**

Files to add to the existing s4ready.ai Next.js portal.

## What to add

### New pages on s4ready.ai (marketing)

```
app/agents/page.tsx                 — Agent catalog
app/agents/vendor360/page.tsx       — Vendor 360 landing page
app/agents/clean-core/page.tsx      — Clean Core landing page
```

### New Next.js app: app.s4ready.ai

Create a second Vercel project at `app.s4ready.ai`:

```
app.s4ready.ai/
  app/
    page.tsx                        — Customer dashboard
    vendor360/page.tsx              — Web chat UI for Vendor 360
    clean-core/page.tsx             — Web chat UI for Clean Core
    admin/...                       — Admin portal screens
    settings/page.tsx
    billing/page.tsx
  lib/
    mcp-client.ts                   — Calls the MCP hub REST API
    auth.ts                         — Extended NextAuth with BTP XSUAA support
```

### MCP client library (key file)

```typescript
// app.s4ready.ai/lib/mcp-client.ts
// Calls the MCP hub (deployed on BTP or standalone) via REST + SSE.

export async function callTool(
  toolName: string,
  input: Record<string, unknown>,
  options: { tenantId: string; token: string; stream?: boolean }
): Promise<Response> {
  const url = `${process.env.MCP_HUB_URL}/api/v1/tools/${toolName}`;
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.token}`,
      'X-Tenant-ID': options.tenantId,
      ...(options.stream ? { 'Accept': 'text/event-stream' } : {})
    },
    body: JSON.stringify(input)
  });
}
```

## Domain plan

```
s4ready.ai          — Marketing site (existing Next.js, add /agents pages)
app.s4ready.ai      — Customer app (new Next.js project on Vercel)
api.s4ready.ai      — MCP hub (BTP Cloud Foundry, proxied via Vercel rewrites)
docs.s4ready.ai     — Documentation (Docusaurus or Mintlify)
```

## Pricing page update

Add an **Enterprise** tier to s4ready.ai/pricing:

| Feature | Free | Pro | Team | Enterprise |
|---|---|---|---|---|
| ABAP code review | 3/day | 100/day | Unlimited | Unlimited |
| Vendor 360 | — | — | — | ✅ |
| Joule integration | — | — | — | ✅ |
| Custom BTP deployment | — | — | — | ✅ |
| Price | $0 | $29/mo | $199/mo | Contact sales |
