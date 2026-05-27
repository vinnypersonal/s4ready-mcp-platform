#!/usr/bin/env bash
# deploy/scripts/deploy-btp.sh
# Deploy s4ready-vendor360 to SAP BTP Cloud Foundry.
# Run this from the root of the s4ready-vendor360 repo.

set -euo pipefail

REGION="${BTP_REGION:-eu10}"
APP_NAME="s4ready-vendor360"
SPACE="${CF_SPACE:-development}"

echo "==================================================="
echo " s4ready Vendor 360 — BTP Cloud Foundry Deployment"
echo " Region: $REGION | Space: $SPACE"
echo "==================================================="

# ── 1. Pre-flight checks ────────────────────────────────────────────────────
command -v cf >/dev/null || { echo "ERROR: CF CLI not installed. https://docs.cloudfoundry.org/cf-cli/install-go-cli.html"; exit 1; }
command -v mbt >/dev/null || { echo "WARNING: MTA Build Tool not found. Install with: npm install -g mbt"; }

cf target 2>/dev/null | grep -q "org" || { echo "ERROR: Not logged in to CF. Run: cf login -a https://api.cf.$REGION.hana.ondemand.com"; exit 1; }

# ── 2. Build TypeScript ──────────────────────────────────────────────────────
echo ""
echo "Step 1/5: Building TypeScript..."
cd "$(dirname "$0")/../.."
(cd ../s4ready-core && pnpm build)
pnpm build

# ── 3. Create BTP service instances (idempotent) ────────────────────────────
echo ""
echo "Step 2/5: Creating BTP service instances (skipping if already exist)..."

create_service_if_missing() {
  local SERVICE=$1 PLAN=$2 NAME=$3 CONFIG=${4:-}
  if cf service "$NAME" &>/dev/null; then
    echo "  ✓ $NAME already exists"
  else
    echo "  + Creating $NAME ($SERVICE / $PLAN)..."
    if [[ -n "$CONFIG" ]]; then
      cf create-service "$SERVICE" "$PLAN" "$NAME" -c "$CONFIG"
    else
      cf create-service "$SERVICE" "$PLAN" "$NAME"
    fi
  fi
}

XSUAA_CONFIG=$(cat deploy/btp/xs-security.json)

create_service_if_missing xsuaa application "${APP_NAME}-xsuaa" "$XSUAA_CONFIG"
create_service_if_missing hana hdi-shared "${APP_NAME}-hana"
create_service_if_missing aicore standard "${APP_NAME}-aicore"
create_service_if_missing destination lite "${APP_NAME}-destination"
create_service_if_missing connectivity lite "${APP_NAME}-connectivity"
create_service_if_missing auditlog standard "${APP_NAME}-auditlog"
create_service_if_missing application-logs standard "${APP_NAME}-applogs"

# Wait for async services to provision.
echo "  Waiting for HANA to provision (may take 3-5 minutes)..."
while ! cf service "${APP_NAME}-hana" | grep -q "create succeeded"; do
  echo -n "  ."
  sleep 15
done
echo " done."

# ── 4. Push the app ──────────────────────────────────────────────────────────
echo ""
echo "Step 3/5: Pushing app to CF..."
cf push -f deploy/btp/manifest.yml --no-start

# ── 5. Run DB migrations ─────────────────────────────────────────────────────
echo ""
echo "Step 4/5: Running database migrations via CF task..."
cf run-task "$APP_NAME" "node dist/db-migrate.js" --name "db-migrate" -m 256M -k 512M

# Poll for task completion.
echo "  Waiting for migration task..."
for i in $(seq 1 20); do
  STATUS=$(cf tasks "$APP_NAME" | grep "db-migrate" | awk '{print $3}' | head -1)
  if [[ "$STATUS" == "SUCCEEDED" ]]; then
    echo "  ✓ Migrations complete"
    break
  elif [[ "$STATUS" == "FAILED" ]]; then
    echo "  ✗ Migration failed. Check: cf logs $APP_NAME --recent"
    exit 1
  fi
  sleep 15
done

# ── 6. Start the app ─────────────────────────────────────────────────────────
echo ""
echo "Step 5/5: Starting app..."
cf start "$APP_NAME"

# ── 7. Verify ────────────────────────────────────────────────────────────────
echo ""
APP_URL=$(cf app "$APP_NAME" | grep "routes:" | awk '{print $2}')
echo "==================================================="
echo " Deployment complete!"
echo " URL: https://$APP_URL"
echo " Health: https://$APP_URL/health"
echo " MCP:    https://$APP_URL/mcp"
echo "==================================================="
echo ""
echo "Next step: Register this MCP server in SAP Build Code."
echo "See: docs/JOULE_REGISTRATION.md"
