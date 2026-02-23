# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Yorkie JavaScript SDK — client-side libraries for building collaborative editing applications with the [Yorkie](https://yorkie.dev) platform. This is a **pnpm monorepo** with multiple publishable packages and example apps.

## Common Commands

### Setup
```bash
pnpm i                    # Install all dependencies (pnpm is enforced)
```

### Build
```bash
pnpm sdk build             # Build the core SDK
pnpm build:packages        # Build all packages
pnpm sdk build:proto       # Regenerate protobuf code (buf generate)
```

### Test
Tests require a running Yorkie server (Docker):
```bash
docker compose -f docker/docker-compose.yml up --build -d   # Start Yorkie server
pnpm sdk test                          # Run all SDK tests
pnpm sdk test test/integration/tree_test.ts   # Run a specific test file
pnpm sdk test:watch                    # Watch mode
pnpm sdk test:bench                    # Run benchmarks
```

Use `.only` on `describe`/`it` blocks to run specific suites or tests within a file.

### Lint
```bash
pnpm lint                  # ESLint with auto-fix (zero warnings enforced)
```

### Run Examples
```bash
docker compose -f docker/docker-compose.yml up --build -d   # Needs Yorkie server
pnpm sdk dev               # Start dev server at http://0.0.0.0:9000/
```

### Package-specific Commands
Use the root shorthand filters: `pnpm sdk <cmd>`, `pnpm react <cmd>`, `pnpm schema <cmd>`, `pnpm prosemirror <cmd>`, `pnpm devtools <cmd>`.

## Architecture

### Packages (`packages/`)

- **`sdk`** (`@yorkie-js/sdk`) — Core SDK. Client connection, document management, CRDT implementations, and protobuf API layer.
- **`react`** (`@yorkie-js/react`) — React hooks/providers: `YorkieProvider`, `DocumentProvider`, `ChannelProvider`, `useYorkieDoc`, `useSelector`, `useRevisions`.
- **`prosemirror`** (`@yorkie-js/prosemirror`) — ProseMirror editor binding.
- **`schema`** (`@yorkie-js/schema`) — ANTLR-based schema definition and validation (`antlr/YorkieSchema.g4`).
- **`devtools`** (`@yorkie-js/devtools`) — Chrome extension for debugging (built with Plasmo).
- **`mcp`** — Model Context Protocol integration.

### Core SDK Structure (`packages/sdk/src/`)

- **`client/`** — `Client` class: manages server connection, document attachment/detachment, sync.
- **`document/`** — Central module:
  - `document.ts` — `Document` class: the main collaborative document abstraction.
  - `crdt/` — CRDT type implementations: `CRDTObject`, `CRDTArray`, `CRDTText`, `CRDTTree`, `CRDTCounter`, `Primitive`.
  - `json/` — User-facing JSON proxy wrappers over CRDTs: `JSONObject`, `JSONArray`, `Text`, `Tree`, `Counter`.
  - `operation/` — Operation types (Add, Remove, Set, Edit, Style, TreeEdit, etc.).
  - `change/` — Change tracking, changepacks, and checkpoints.
  - `time/` — Logical clocks: `TimeTicket`, `VersionVector`, `ActorID`.
  - `presence/` — Presence/session data structures.
  - `history.ts` — Undo/redo history management.
- **`channel/`** — Channel management for presence/broadcast.
- **`api/`** — Protobuf generated code and `converter.ts` for serialization.
- **`util/`** — Observable pattern, logger, validators, tree utilities.

### Test Structure (`packages/sdk/test/`)

- `unit/` — Unit tests for individual CRDT types and utilities.
- `integration/` — Integration tests requiring a running Yorkie server.
- `bench/` — Vitest benchmarks.
- `helper/` — Shared test utilities and helpers.

### Key Design Patterns

- **CRDT + JSON proxy**: Internal state uses CRDTs (`crdt/`). Users interact through JSON proxies (`json/`) that automatically generate operations on mutation.
- **Operation-based sync**: Document changes produce operations that are collected into changes, packed into changepacks, and synced via protobuf API.
- **Logical timestamps**: Every operation is tagged with a `TimeTicket` (lamport timestamp + actorID) for conflict resolution.

## Code Conventions

- **TypeScript strict mode**, target ES2020.
- **Prettier**: single quotes, trailing commas, 80 char width.
- **ESLint**: zero warnings policy, enforced in CI and pre-commit hooks.
- **Commit messages**: subject line < 70 chars (what changed), body explains why.
- **Test framework**: Vitest with custom-jsdom environment.
- **Build**: Vite library mode outputting UMD + ES modules.
- **Protobuf source of truth**: [yorkie-team/yorkie](https://github.com/yorkie-team/yorkie/tree/main/api) repo.
