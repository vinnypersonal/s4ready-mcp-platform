# s4ready Clean Core Advisor

**Status: Planned — Phase 2**

AI-powered ABAP code migration advisor. Analyzes custom Z-code (programs, enhancements,
BAdIs, user exits) and produces a migration roadmap to SAP BTP clean core.

## What it does

1. **Scan**: Upload or connect to ABAP source code (ZIP, SE38, abapGit, or live S/4 via ADT)
2. **Classify**: Each object rated: KEEP / REFACTOR_TO_RAP / REPLACE_WITH_STANDARD / REPLACE_WITH_JOULE_AGENT / RETIRE
3. **Generate**: Side-by-side migration code for objects rated REFACTOR_TO_RAP
4. **Prioritize**: Migration backlog with effort estimates (S/M/L/XL) and business impact scores
5. **Document**: Auto-generated technical spec for each migration item

## Supported SAP versions (ECC AND S/4)

Unlike other s4ready tools, this tool analyzes **source code** — not live SAP data.
Therefore it works on both ECC and S/4.

| Source system | Supported |
|---|---|
| ECC 6.0 EHP6, EHP7, EHP8 | ✅ Yes |
| S/4HANA on-prem (all releases) | ✅ Yes |
| S/4HANA Cloud Private Edition | ✅ Yes |
| S/4HANA Cloud Public Edition (Side-by-Side only) | ✅ Yes |

## MCP tools (planned)

```
analyze_abap_object          — Analyze a single program/class/function group
generate_rap_migration       — Generate RAP BO from a classical ABAP object
classify_enhancement_spot    — Classify a BAdI / user exit / enhancement spot
generate_migration_backlog   — Full landscape backlog from a list of objects
check_clean_core_compliance  — Check if code uses only released APIs
```

## Architecture notes

This tool differs from Vendor 360:
- **No live SAP OData calls** for the analysis itself
- Input: ABAP source code (as text)
- AI model: SAP-ABAP-1 (via AI Core) — the SAP-trained model for ABAP
- Fallback: Claude with ABAP-specific few-shot examples
- Output: structured JSON + generated ABAP/CDS/RAP code blocks

## Build plan (Phase 2 — estimated 4-6 weeks)

Week 1-2: ABAP parser + object classifier
Week 3-4: RAP generator (CDS + behavior definition + implementation)
Week 5: Migration backlog builder + effort estimator
Week 6: Testing against real ECC and S/4 code bases

## Prerequisites (when built)

- SAP AI Core with SAP-ABAP-1 model deployed, OR Anthropic API key
- ABAP source files (ZIP export, abapGit, or ADT live connection)
- For ECC: Cloud Connector for live RFC/ADT connection (optional)
- For SAP Store listing: SAP PartnerEdge Build membership

## Contact

Interested in early access? Contact: products@s4ready.ai
