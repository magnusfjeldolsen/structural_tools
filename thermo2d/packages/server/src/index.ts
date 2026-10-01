// @thermo2d/server — MCP server, CLI and the pieces tests reuse.
export { createServer } from './mcp.js';
export { ServerState, resultKey, safeName } from './state.js';
export { Workspace, WorkspaceError, workspaceFromArgs } from './workspace.js';
export { registerTools, registerResources, registerPrompts, describeEdges, teach } from './tools.js';
export { parseArgs, runProjectFile, main as cliMain } from './cli.js';
export * from './figures.js';
export * as coreApi from './coreApi.js';
