# Joule Registration Guide — s4ready Vendor 360

This guide walks you through registering the Vendor 360 MCP server with SAP Build Code
and creating a Joule Agent that your users can invoke from Fiori / Joule.

## Prerequisites

- Your MCP server is deployed and reachable (BTP or standalone via SAP Cloud Connector)
- You have access to SAP Build Code with Agent Builder
- Your BTP subaccount has Joule entitlement

---

## Step 1: Create a BTP Destination for the MCP Server

Go to **BTP Cockpit → Connectivity → Destinations → New Destination**

Fill in:

| Field | Value |
|---|---|
| Name | `S4READY-VENDOR360-MCP` |
| Type | `HTTP` |
| URL | Your deployed server URL (e.g. `https://s4ready-vendor360.cfapps.eu10.hana.ondemand.com`) |
| Proxy Type | `Internet` (for BTP-hosted) or `OnPremise` (for on-prem via Cloud Connector) |
| Authentication | `NoAuthentication` (the MCP server handles auth internally via XSUAA) |

Additional Properties (click **New Property** for each):

| Property | Value |
|---|---|
| `HTML5.DynamicDestination` | `true` |
| `WebIDEEnabled` | `true` |
| `BuildCode.MCP` | `true` |

Click **Save**, then **Check Connection** — you should see `200 OK`.

---

## Step 2: Open SAP Build Code Agent Builder

1. Open **SAP Build Code** in your BTP subaccount
2. Navigate to **Joule Studio → Agent Builder**
3. Click **+ New Agent**

---

## Step 3: Add the MCP Server

In the Agent Builder, click **Add MCP Server** and fill in:

| Field | Value |
|---|---|
| **Name** | `Vendor 360 Assistant` |
| **Description** | `Get a complete 360° view of SAP vendors and customers including open POs, invoices, payments, quality issues, and contracts.` |
| **Path** | `/mcp` |
| **Namespace** | `v360` |
| **Timeout** | `60` |
| **Destination** | Select `S4READY-VENDOR360-MCP` |

Click **Save**. The builder will fetch the tool list from `/mcp`.

Verify that these 5 tools appear:
- `v360_search_business_partner`
- `v360_get_partner_360`
- `v360_get_partner_transactions`
- `v360_explain_anomaly`
- `v360_get_partner_risk_summary`

---

## Step 4: Configure the Agent Expertise

In the **Expertise** field (max 1000 characters), paste:

```
I am an SAP Vendor and Customer Intelligence Assistant powered by live data from your SAP S/4HANA system. I specialise in giving procurement teams, finance teams, and sales managers an instant 360° view of any vendor or customer. I can show open purchase orders, outstanding invoices, payment history, quality notifications, active contracts, and risk flags — all from a single question. I replace the need to navigate transactions like ME2M, FBL1N, MIRO, and ME3M manually.
```

---

## Step 5: Configure the Agent Instructions

In the **Instructions** field, paste:

```
## Role
You are an SAP Vendor and Customer Intelligence assistant with access to live S/4HANA data.

## Tools and When to Use Them
- v360_search_business_partner → When user mentions a vendor/customer name (not an ID). Always call this first to resolve the name to an ID.
- v360_get_partner_360 → Main tool. Call after resolving partner ID for a full 360 view.
- v360_get_partner_transactions → When user wants to drill into a specific category (e.g. "show me blocked invoices").
- v360_explain_anomaly → When user asks "why?" about a risk flag.
- v360_get_partner_risk_summary → When user asks to compare risk across multiple vendors.

## Behavior Rules
1. If user gives a name, always call search_business_partner first.
2. If search returns multiple matches, ask the user to confirm which one.
3. Always include the AI narrative summary at the top of your response.
4. Present KPIs as a bullet list: Spend YTD, Open POs, Overdue, Blocked invoices, Quality issues.
5. If risk flags exist, highlight them prominently.
6. Never fabricate data — always call a tool.
7. If a tool fails, explain in plain English what went wrong — never show raw JSON errors.
8. Default months-back is 12 unless the user specifies otherwise.
9. Always confirm the currency when showing amounts.
```

---

## Step 6: Set Suggested Prompts

Add these suggested prompts to help users get started:

1. `Vendor 360 for Tata Steel`
2. `Show me all blocked invoices for our top 5 vendors`
3. `Which vendors have quality issues this year?`
4. `Customer 360 for Hindustan Unilever`
5. `Why is invoice 1900001234 blocked?`

---

## Step 7: Publish and Test

1. Click **Publish Agent**
2. Open your SAP Fiori Launchpad
3. Open Joule (the AI assistant icon)
4. Type: `Vendor 360 for Tata Steel`

Expected response: A structured card with KPI tiles, AI narrative, and risk flags.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Agent not found in Joule" | Agent not published | Publish the agent in Build Code |
| "Destination not in dropdown" | Missing `BuildCode.MCP=true` property | Add to destination additional properties |
| Path validation error | Entered full URL in Path field | Enter only `/mcp` — no hostname |
| Tools list is empty | Server not reachable | Check destination → `Check Connection` |
| `401 Unauthorized` from tool | XSUAA binding issue | Verify `xs-security.json` and rebind XSUAA service |
| Tool returns empty data | SAP client wrong or OData service not active | Check SAP_CLIENT env, activate API_BUSINESS_PARTNER in SAP |

---

## What the user sees in Joule

When a user types "Vendor 360 for Tata Steel", Joule:
1. Calls `search_business_partner(query="Tata Steel")` → gets ID 1000234
2. Calls `get_partner_360(partnerId="1000234")` → gets full data
3. Renders a structured response with:
   - Partner summary card (name, status, country, payment terms)
   - KPI tiles (spend, open POs, overdue, quality)
   - Risk flags (if any)
   - AI narrative summary (3-4 sentences)
   - Action buttons: "Show blocked invoices", "Explain anomaly", "Show all POs"
