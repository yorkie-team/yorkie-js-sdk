# Yorkie JavaScript SDK

pnpm monorepo with multiple packages for building collaborative editing applications.

## Development Commands

```sh
pnpm i                       # Install (pnpm enforced)
pnpm sdk build               # Build core SDK
pnpm sdk build:proto         # Regenerate protobuf code (buf generate)
pnpm lint                    # ESLint with auto-fix (zero warnings enforced)

# Tests require a running Yorkie server:
docker compose -f docker/docker-compose.yml up --build -d
pnpm sdk test                # Run all SDK tests
pnpm sdk test test/integration/tree_test.ts  # Specific test file
```

Package filters: `pnpm sdk`, `pnpm react`, `pnpm schema`, `pnpm prosemirror`, `pnpm devtools`

## After Making Changes

Always run before submitting:
```sh
pnpm lint && pnpm sdk build && pnpm sdk test
```

## Project Docs

- **Design docs**: `docs/design/` for architectural context. New docs use [TEMPLATE.md](docs/design/TEMPLATE.md).
- **Task tracking**: `docs/tasks/active/` for in-progress, `docs/tasks/archive/` for completed. Use `YYYYMMDD-<slug>-{todo,lessons}.md` pairs.
- **Setup**: Husky manages git hooks. Run `pnpm install` to set up automatically.

## Packages

- **`sdk`** (`@yorkie-js/sdk`) — Core: client, documents, CRDTs, protobuf API
- **`react`** (`@yorkie-js/react`) — React hooks/providers
- **`prosemirror`** (`@yorkie-js/prosemirror`) — ProseMirror binding
- **`schema`** (`@yorkie-js/schema`) — ANTLR-based schema validation (`antlr/YorkieSchema.g4`)
- **`devtools`** (`@yorkie-js/devtools`) — Chrome extension (Plasmo)
- **`mcp`** — Model Context Protocol integration

## Gotchas

- Protobuf source of truth is in [yorkie-team/yorkie](https://github.com/yorkie-team/yorkie/tree/main/api), not this repo
- ESLint enforces zero warnings — CI and pre-commit hooks will reject any warnings
- Tests use Vitest with custom-jsdom environment
- Use `.only` on `describe`/`it` blocks to run specific tests within a file
- Prettier config: single quotes, trailing commas, 80 char width

## Key Design Pattern

Internal state uses CRDTs (`crdt/`). Users interact through JSON proxies (`json/`) that automatically generate operations on mutation. Every operation is tagged with a `TimeTicket` (lamport timestamp + actorID).
