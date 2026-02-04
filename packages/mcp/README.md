# @yorkie-js/mcp

MCP (Model Context Protocol) server for [Yorkie](https://yorkie.dev) collaborative editing. This package enables AI assistants like Claude to interact with Yorkie documents.

## Features

- **Document Management**: Attach, detach, read, and update Yorkie documents
- **Real-time Sync**: Automatic synchronization with Yorkie server
- **Presence Tracking**: View active collaborators on documents
- **Revision Management**: Create and list document revisions/checkpoints
- **Resource Access**: Expose documents as MCP resources

## Installation

```bash
npm install @yorkie-js/mcp
# or
pnpm add @yorkie-js/mcp
```

## Quick Start

### With Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "yorkie": {
      "command": "npx",
      "args": ["@yorkie-js/mcp"],
      "env": {
        "YORKIE_API_URL": "https://api.yorkie.dev",
        "YORKIE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### With Cursor

Add to your Cursor MCP settings:

```json
{
  "mcpServers": {
    "yorkie": {
      "command": "npx",
      "args": ["@yorkie-js/mcp"],
      "env": {
        "YORKIE_API_URL": "https://api.yorkie.dev",
        "YORKIE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `YORKIE_API_URL` | Yorkie server URL | `https://api.yorkie.dev` |
| `YORKIE_API_KEY` | Project API key | - |

## Available Tools

### Client Management

| Tool | Description |
|------|-------------|
| `yorkie_get_client_status` | Get current client activation status and ID |
| `yorkie_activate_client` | Activate client connection to server |
| `yorkie_deactivate_client` | Deactivate client and detach all documents |

### Document Operations

| Tool | Description |
|------|-------------|
| `yorkie_attach_document` | Attach to a document (creates if not exists) |
| `yorkie_detach_document` | Detach from a document |
| `yorkie_list_documents` | List all attached documents |
| `yorkie_get_document` | Get document content as JSON |
| `yorkie_update_document` | Update document with key-value pairs |
| `yorkie_sync_document` | Manually sync document (for manual mode) |

### Presence & Collaboration

| Tool | Description |
|------|-------------|
| `yorkie_get_presences` | Get active users on a document |

### Revisions

| Tool | Description |
|------|-------------|
| `yorkie_create_revision` | Create a checkpoint/snapshot |
| `yorkie_list_revisions` | List all revisions for a document |

## Available Resources

Documents are exposed as MCP resources with the URI format:

```
yorkie://documents/{documentKey}
```

## Usage Examples

### Basic Document Operations

```
User: Create a todo list document and add some items

Claude: I'll create a Yorkie document for your todo list.
[Uses yorkie_attach_document with documentKey="my-todos"]
[Uses yorkie_update_document to add items]
```

### Collaborative Editing

```
User: Who else is working on the project-notes document?

Claude: Let me check the active collaborators.
[Uses yorkie_attach_document with documentKey="project-notes"]
[Uses yorkie_get_presences]
```

### Document Versioning

```
User: Save a checkpoint of the current document state

Claude: I'll create a revision for you.
[Uses yorkie_create_revision with a descriptive message]
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run locally
YORKIE_API_KEY=your-key node dist/index.js

# Run tests
pnpm test
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Assistant  │────▶│  @yorkie-js/mcp  │────▶│  Yorkie Server  │
│  (Claude, etc)  │◀────│   (MCP Server)   │◀────│                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │  @yorkie-js/sdk  │
                        │  (CRDT Client)   │
                        └──────────────────┘
```

## Related Packages

- [@yorkie-js/sdk](https://www.npmjs.com/package/@yorkie-js/sdk) - Core Yorkie JavaScript SDK
- [@yorkie-js/react](https://www.npmjs.com/package/@yorkie-js/react) - React hooks for Yorkie

## License

Apache-2.0
