#!/usr/bin/env bash
# deploy/scripts/deploy-docker.sh
# Deploy s4ready-vendor360 using Docker Compose (Option 3 — standalone).
# Run from s4ready-vendor360 root.

set -euo pipefail

echo "==================================================="
echo " s4ready Vendor 360 — Standalone Docker Deployment"
echo "==================================================="

# ── 1. Checks ───────────────────────────────────────────────────────────────
command -v docker >/dev/null || { echo "ERROR: Docker not installed."; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "ERROR: Docker Compose v2 not available."; exit 1; }

if [[ ! -f ".env" ]]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "IMPORTANT: Edit .env and set at minimum:"
  echo "  - ANTHROPIC_API_KEY"
  echo "  - SAP_BASE_URL, SAP_USERNAME, SAP_PASSWORD (or leave SAP_MODE=mock for demo)"
  echo ""
fi

# ── 2. Build images ──────────────────────────────────────────────────────────
echo "Building Docker images (this takes ~3 minutes first time)..."
cd "$(dirname "$0")/../.."
# Dockerfile is in s4ready-vendor360/deploy/docker/ but builds from repo root
# so both s4ready-core and s4ready-vendor360 are in context.
docker compose -f s4ready-vendor360/deploy/docker/docker-compose.yml --env-file s4ready-vendor360/.env build

# ── 3. Start ──────────────────────────────────────────────────────────────────
echo "Starting services..."
docker compose -f s4ready-vendor360/deploy/docker/docker-compose.yml --env-file s4ready-vendor360/.env up -d

# ── 4. Wait for health ────────────────────────────────────────────────────────
echo "Waiting for vendor360 to become healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:${PORT:-8080}/health > /dev/null 2>&1; then
    echo "✓ Server is healthy"
    break
  fi
  echo -n "."
  sleep 3
done

PORT="${PORT:-8080}"
echo ""
echo "==================================================="
echo " Deployment complete!"
echo " Health:  http://localhost:$PORT/health"
echo " MCP:     http://localhost:$PORT/mcp"
echo " REST:    http://localhost:$PORT/api/v1/tools/search_business_partner"
echo "==================================================="
echo ""
echo "Quick test:"
echo "  curl -X POST http://localhost:$PORT/mcp \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"jsonrpc\":\"2.0\",\"method\":\"tools/list\",\"id\":1}'"
echo ""
echo "View logs:   docker compose -f deploy/docker/docker-compose.yml logs -f vendor360"
echo "Stop:        docker compose -f deploy/docker/docker-compose.yml down"
