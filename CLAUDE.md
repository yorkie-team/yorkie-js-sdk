# Yorkie JavaScript SDK

Client-side SDK for Yorkie, providing real-time collaboration primitives (Document, Text, Tree, Counter) for JavaScript/TypeScript applications.

## Tech Stack

- TypeScript (strict), pnpm 9.6+ monorepo, Vite, Vitest
- ConnectRPC + Protocol Buffers for server communication
- ESLint 9 (flat config), Prettier, Husky + lint-staged

## Development Commands

```sh
pnpm i                    # Install dependencies (pnpm enforced)
pnpm sdk build            # Build the core SDK
pnpm sdk test             # Run SDK tests (requires Yorkie server)
pnpm sdk test:watch       # Run tests in watch mode
pnpm sdk test:bench       # Run benchmarks
pnpm sdk build:proto      # Regenerate protobuf TypeScript code
pnpm sdk build:docs       # Generate API docs via typedoc
pnpm sdk dev              # Start dev server (CodeMirror example)
pnpm lint                 # ESLint with fix across all packages
pnpm build:packages       # Build all packages
pnpm build:examples       # Build all examples

# Integration test server
docker compose -f docker/docker-compose.yml up --build -d
```

## Project Structure

```
packages/
  sdk/              # Core SDK (@yorkie-js/sdk)
    src/
      client/       # Client connection management
      document/     # Document model, CRDT types, operations
      api/          # Generated protobuf code + converters
      util/         # Logger, error codes, observable
    test/           # Vitest tests with custom matchers
  react/            # React hooks/providers (@yorkie-js/react)
  prosemirror/      # ProseMirror binding (@yorkie-js/prosemirror)
  schema/           # Document schema validation (@yorkie-js/schema)
  devtools/         # Browser extension (Plasmo)
  mcp/              # MCP integration
examples/           # 17 example apps (vanilla, React, Next.js, Vue)
design/             # Design documents
docker/             # Docker Compose for test infrastructure
```

## Code Conventions

- Apache 2.0 license header on all source files
- `Array<T>` not `T[]` (enforced by ESLint)
- `undefined` not `null` (null is banned by ESLint)
- `camelCase` for variables, `PascalCase` for types/enums
- JSDoc required on all public classes and methods
- Full path imports: `@yorkie-js/sdk/src/document/document`
- Prettier: 80 chars, single quotes, trailing commas
- Commit messages: subject max 70 chars, body at 80 chars

## Architecture Notes

- **Document model**: Mirrors Go server CRDT types in TypeScript
- **Sync protocol**: ConnectRPC over HTTP/2 with WatchDocument streaming
- **Change management**: Operations buffered locally, synced via ChangePack
- **Presence**: Per-client presence data synced alongside document state
- Tests require a running Yorkie server (use docker-compose)
