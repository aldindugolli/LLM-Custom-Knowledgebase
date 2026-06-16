#!/usr/bin/env bash
set -euo pipefail

HERMES_PORT="${HERMES_PORT:-3412}"
HERMES_VAULT_PATH="${HERMES_VAULT_PATH:-./vault}"

echo "=== Brainstorm — Hermes Memory Service ==="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is required. Install from https://nodejs.org"
  exit 1
fi
echo "[OK] Node.js $(node --version)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

# Build
echo ""
echo "Building..."
npm run build

# Scaffold vault directories
echo ""
echo "Scaffolding vault at ${HERMES_VAULT_PATH}..."
mkdir -p "${HERMES_VAULT_PATH}"/{sessions,learnings,decisions,concepts,projects,references,.obsidian}

# Create index if missing
if [ ! -f "${HERMES_VAULT_PATH}/index.md" ]; then
  cat > "${HERMES_VAULT_PATH}/index.md" << 'VAULTINDEX'
---
id: vault-index
type: index
title: Vault Index
tags: [index]
created: $(date -I)
updated: $(date -I)
---

# Vault Index

Welcome to the Brainstorm knowledge vault.

## Sessions
_No sessions yet._

## Learnings
_No learnings yet._

## Decisions
_No decisions yet._

## Concepts
_No concepts yet._

## Projects
_No projects registered._
VAULTINDEX
fi

echo "[OK] Vault ready at $(realpath "${HERMES_VAULT_PATH}")"

# Start service
echo ""
echo "============================================"
echo "Starting Hermes Memory Service..."
echo "  Port:     ${HERMES_PORT}"
echo "  Vault:    ${HERMES_VAULT_PATH}"
echo "  PID:      $$"
echo "============================================"
echo ""
echo "Configure opencode to use this service by setting:"
echo "  env.HERMES_URL=http://127.0.0.1:${HERMES_PORT}"
echo ""
echo "Press Ctrl+C to stop."

HERMES_PORT="${HERMES_PORT}" HERMES_VAULT_PATH="${HERMES_VAULT_PATH}" node dist/index.js
