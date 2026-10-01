#!/usr/bin/env node
/**
 * thermo2d MCP server over stdio.
 *   node dist/mcp.mjs [--workspace <dir>]     (or THERMO2D_WORKSPACE)
 * Never writes to stdout except MCP frames; logs go to stderr.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ServerState } from './state.js';
import { workspaceFromArgs } from './workspace.js';
import { registerPrompts, registerResources, registerTools } from './tools.js';
import * as api from './coreApi.js';

export async function createServer(state: ServerState): Promise<McpServer> {
  const server = new McpServer({ name: 'thermo2d', version: api.CORE_VERSION }, { instructions: 'thermo2d: 2D steady/transient heat analysis of cross-sections. Call describe_capabilities first; build a model with create_project → create_from_template → apply_commands; validate; run_analysis; query_results / make_figure / explain_results; save_project. All geometry in mm, temperatures in °C, time in s.' });
  registerTools(server, state);
  registerResources(server, state);
  registerPrompts(server);
  return server;
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const workspace = workspaceFromArgs(argv);
  const state = new ServerState(workspace);
  await state.loadUserLibrary();
  const server = await createServer(state);
  const transport = new StdioServerTransport();
  process.on('uncaughtException', (e) => console.error('[thermo2d] uncaught:', e));
  process.on('unhandledRejection', (e) => console.error('[thermo2d] unhandled:', e));
  await server.connect(transport);
  console.error(`[thermo2d] MCP server ready; workspace ${workspace.root}; library ${state.library.length} items`);
}

const isMain = (() => {
  try {
    const arg = process.argv[1] ?? '';
    return /mcp\.(mjs|ts|js)$/i.test(arg);
  } catch {
    return false;
  }
})();

if (isMain) {
  main().catch((e) => {
    console.error('[thermo2d] fatal:', e);
    process.exit(1);
  });
}
