import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { YorkieManager } from './yorkie-manager.js';
import { tools, handleToolCall } from './tools/index.js';
import { getResources, readResource } from './resources/index.js';

const serverName = 'yorkie-mcp';
const serverVersion = '0.0.1';

/**
 * Main entry point for the MCP server.
 */
async function main() {
  const apiUrl = process.env.YORKIE_API_URL || 'https://api.yorkie.dev';
  const apiKey = process.env.YORKIE_API_KEY;

  if (!apiKey) {
    console.error('Warning: YORKIE_API_KEY not set. Some operations may fail.');
  }

  const yorkieManager = new YorkieManager(apiUrl, apiKey);

  const server = new Server(
    {
      name: serverName,
      version: serverVersion,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return handleToolCall(yorkieManager, name, args);
  });

  // List available resources
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const resources = await getResources(yorkieManager);
    return { resources };
  });

  // Read resource content
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    return readResource(yorkieManager, uri);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.error(`\n${serverName}: Received ${signal}, shutting down...`);
    try {
      await yorkieManager.deactivate();
      console.error(`${serverName}: Cleanup complete`);
      process.exit(0);
    } catch (error) {
      console.error(`${serverName}: Error during shutdown:`, error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${serverName} v${serverVersion} started`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
