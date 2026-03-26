#!/usr/bin/env bash
set -euo pipefail

# Husky manages git hooks in this repo (.husky/).
# Running 'pnpm install' triggers the 'prepare' script which sets
# up Husky automatically. This script is a no-op here.

echo "Husky manages git hooks in this repo."
echo "Run 'pnpm install' to set up hooks automatically."
