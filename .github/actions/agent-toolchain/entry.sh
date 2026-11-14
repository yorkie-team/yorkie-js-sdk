#!/bin/sh
# What runs INSIDE the container the agent toolchain action starts: the check
# of the branch's files, the install, and the check of what it left.
#
# Everything that reads or changes a file of the branch is here, and nowhere on
# the runner. The container has the workspace as its one writable mount, an
# empty read-only directory over `.git` and each `.trusted-*` checkout, and
# `main`'s `.npmrc` read-only over the root one — so whatever a path in the
# branch's tree turns out to be, following it leads nowhere but the branch's
# own files.
#
# The action mounts this directory read-only at /opt/agent-toolchain and pnpm,
# the pinned copy the runner fetched, read-only at /opt/pnpm.
#
#   sh /opt/agent-toolchain/entry.sh <workspace root>
set -eu
root="$1"
cd "$root"

# Before: the tree, the lockfile, the workspace file and every manifest are of
# the shape this repository's own have, or the install does not start.
node /opt/agent-toolchain/check-install-inputs.mjs before "$root"

# Exactly what the lockfile pins, no lifecycle script, no pnpmfile, and the
# locations pinned here whatever a setting says. The store is in the
# container and goes with it.
node /opt/pnpm/bin/pnpm.cjs install --frozen-lockfile --ignore-scripts --ignore-pnpmfile \
  --config.manage-package-manager-versions=false \
  --config.modules-dir=node_modules \
  --config.virtual-store-dir=node_modules/.pnpm \
  --config.store-dir=/tmp/pnpm-store

# After: every project the install installed for, and what it placed there,
# is still inside the workspace.
node /opt/agent-toolchain/check-install-inputs.mjs installed "$root"
