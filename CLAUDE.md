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
pnpm verify:fast   # lint, licence headers, doc links, build, unit tests (~30s, no server)
pnpm sdk test      # plus the integration suites, with the server above running
```

## Task Workflow

1. **Plan** — write `docs/tasks/active/YYYYMMDD-<slug>-todo.md` before code;
   update `docs/design/` if architecture changes.
2. **Branch + commit** — topic branch from `main`; each commit
   `pnpm verify:fast` green. `bash scripts/setup.sh` installs hooks that check
   this for you — lint-staged on commit, `verify:fast` on push.
3. **Self review** — `/self-review`: review → fix → re-verify over the full
   branch diff, **max 3 rounds, stopping at the first round with no blocking
   findings**. Log each round in `*-lessons.md`; a finding you believe is wrong
   goes there with evidence.
4. **Open PR** — rebase onto the base first (`origin/main`, or
   `upstream/main` from a fork). Body = Summary + Test plan.
5. **Before merge** — `bash scripts/tasks-archive.sh && bash scripts/tasks-index.sh`.

## Project Docs

- **Design docs**: `docs/design/` for architectural context. New docs use [TEMPLATE.md](docs/design/TEMPLATE.md).
- **Task tracking**: `docs/tasks/active/` for in-progress, `docs/tasks/archive/` for completed. Use `YYYYMMDD-<slug>-{todo,lessons}.md` pairs.
- **Setup**: `bash scripts/setup.sh` once per clone installs the git hooks and the Claude Code hooks (from a `$GIT_DIR` snapshot, never from the working tree).

## Packages

- **`sdk`** (`@yorkie-js/sdk`) — Core: client, documents, CRDTs, protobuf API
- **`react`** (`@yorkie-js/react`) — React hooks/providers
- **`prosemirror`** (`@yorkie-js/prosemirror`) — ProseMirror binding
- **`schema`** (`@yorkie-js/schema`) — ANTLR-based schema validation (`antlr/YorkieSchema.g4`)
- **`devtools`** (`@yorkie-js/devtools`) — Chrome extension (Plasmo)

## Gotchas

- Protobuf source of truth is in [yorkie-team/yorkie](https://github.com/yorkie-team/yorkie/tree/main/api), not this repo
- ESLint enforces zero warnings — CI and pre-commit hooks will reject any warnings
- Never hand-edit `src/api/yorkie/v1/*_pb.ts` or `packages/schema/antlr/*.ts` — regenerate (`pnpm sdk build:proto`, `pnpm schema build:schema`)
- Every source file under `packages/*/src`, `packages/*/test` and `scripts/` needs the Apache 2.0 header (`pnpm verify:license`)
- Tests use Vitest with custom-jsdom environment
- Use `.only` on `describe`/`it` blocks to run specific tests within a file
- Prettier config: single quotes, trailing commas, 80 char width

## Key Design Pattern

Internal state uses CRDTs (`crdt/`). Users interact through JSON proxies (`json/`) that automatically generate operations on mutation. Every operation is tagged with a `TimeTicket` (lamport timestamp + actorID).
