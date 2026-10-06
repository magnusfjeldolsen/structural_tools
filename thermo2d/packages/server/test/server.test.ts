import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp.js';
import { ServerState, safeName } from '../src/state.js';
import { Workspace, WorkspaceError, workspaceFromArgs } from '../src/workspace.js';
import { parseArgs } from '../src/cli.js';
import { describeEdges, teach } from '../src/tools.js';
import { hasCore } from '../src/coreApi.js';
import { CommandError } from '@thermo2d/core';
import { fixtureProject } from '../../figures/test/fixture.js';

const coreReady = ['applyCommands', 'validateProject', 'buildTemplate', 'searchLibrary'].every(hasCore);

let dir: string;
let client: Client;
let state: ServerState;

type ToolText = { content: { type: string; text?: string }[]; isError?: boolean };
async function call(name: string, args: Record<string, unknown> = {}): Promise<{ raw: ToolText; json: any }> {
  const raw = (await client.callTool({ name, arguments: args })) as ToolText;
  const text = raw.content.find((c) => c.type === 'text')?.text ?? '';
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { raw, json };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'thermo2d ws '));
  state = new ServerState(new Workspace(dir));
  await state.loadUserLibrary();
  const server = await createServer(state);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(ct);
});

afterAll(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('workspace safety', () => {
  it('rejects paths that escape the workspace', () => {
    const ws = state.workspace;
    expect(() => ws.resolve('../outside.txt')).toThrow(WorkspaceError);
    // An absolute path outside the workspace on this platform (Windows: C:\outside\x, Linux: /outside/x).
    expect(() => ws.resolve(path.resolve(path.sep, 'outside', 'x'))).toThrow(/outside the workspace/);
    expect(ws.resolve('sub/inside.json').toLowerCase().startsWith(ws.root.toLowerCase())).toBe(true);
    expect(ws.projectPath('beam').toLowerCase()).toBe(path.join(ws.root, 'beam.thermo.json').toLowerCase());
    expect(ws.projectPath('beam.thermo.json')).toBe(ws.projectPath('beam'));
  });
  it('handles spaces in the workspace path and picks the folder from args or env', () => {
    expect(dir).toContain(' ');
    const ws = workspaceFromArgs(['--workspace', dir]);
    expect(ws.root).toBe(path.resolve(dir));
    const ws2 = workspaceFromArgs([], { THERMO2D_WORKSPACE: dir });
    expect(ws2.root).toBe(path.resolve(dir));
    expect(safeName('a/b:c*d.thermo.json')).toBe('a_b_c_d');
  });
});

describe('cli args', () => {
  it('parses commands, positionals and flags', () => {
    const a = parseArgs(['run', 'C:\\p\\x.thermo.json', '--out', 'D:\\o', '--html', '--analysis', 'an_main']);
    expect(a.command).toBe('run');
    expect(a.positional).toEqual(['C:\\p\\x.thermo.json']);
    expect(a.flags).toEqual({ out: 'D:\\o', html: true, analysis: 'an_main' });
    expect(parseArgs([]).command).toBe('help');
  });
});

describe('teaching errors', () => {
  it('exposes code, field, options and a hint', () => {
    const r = teach(new CommandError('bad-value', 'diameter must be positive', { field: 'diameter', value: -1, options: [8, 10, 12], suggestion: 'Use a positive diameter in mm.' }));
    expect(r.isError).toBe(true);
    const j = JSON.parse(r.content[0].type === 'text' ? r.content[0].text : '{}');
    expect(j.code).toBe('bad-value');
    expect(j.field).toBe('diameter');
    expect(j.options).toEqual([8, 10, 12]);
    expect(j.hint).toContain('positive');
  });
  it('describes edges with sides and attached boundary conditions', () => {
    const edges = describeEdges(fixtureProject());
    expect(edges.length).toBe(4);
    expect(edges.map((e) => e.side)).toEqual(['bottom', 'right', 'top', 'left']);
    expect(edges[0].bcId).toBe('bc_fire');
    expect(edges[2].bcId).toBe('bc_amb');
    expect(edges[1].length).toBe(500);
  });
});

describe('MCP server', () => {
  it('lists the tools from the spec', async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    for (const t of ['describe_capabilities', 'search_library', 'get_library_item', 'create_project', 'open_project', 'save_project', 'list_projects', 'create_from_template', 'apply_commands', 'get_model', 'get_model_image', 'import_time_series', 'validate', 'run_analysis', 'get_run_status', 'cancel_run', 'query_results', 'make_figure', 'explain_results', 'compare_scenarios', 'run_sweep', 'make_report', 'open_in_app']) {
      expect(tools).toContain(t);
    }
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toEqual(expect.arrayContaining(['fire-check-rc-section', 'wall-thermal-bridge-check', 'compare-insulation', 'import-and-run-climate']));
  });

  it('describe_capabilities returns units, BC types and workflow', async () => {
    const { raw, json } = await call('describe_capabilities');
    expect(raw.isError).toBeFalsy();
    expect(json.units.length).toBe('mm');
    expect(json.boundaryConditionTypes['convection-radiation'].fields.alphaC).toContain('25');
    expect(json.typicalWorkflow[0]).toBe('create_project');
    expect(json.workspace).toBe(state.workspace.root);
  });

  it('create_project, list_projects, save_project and open_project round trip', async () => {
    const created = await call('create_project', { name: 'Test beam', language: 'en' });
    expect(created.raw.isError).toBeFalsy();
    const id = created.json.projectId as string;
    expect(id).toBeTruthy();
    const listed = await call('list_projects');
    expect(listed.json.open.some((o: any) => o.projectId === id)).toBe(true);
    if (!hasCore('serializeProject')) return;
    const saved = await call('save_project', { projectId: id });
    expect(saved.raw.isError).toBeFalsy();
    expect(saved.json.path.toLowerCase()).toContain('test beam.thermo.json');
    const opened = await call('open_project', { name: 'Test beam' });
    expect(opened.raw.isError).toBeFalsy();
    expect(opened.json.summary.name).toBe('Test beam');
  });

  it('unknown project id is a teaching error, not a crash', async () => {
    const { raw, json } = await call('get_model', { projectId: 'nope' });
    expect(raw.isError).toBe(true);
    expect(json.error).toContain('No open project');
    expect(json.code).toBe('unknown-project');
  });

  it('rejects files outside the workspace', async () => {
    const { raw, json } = await call('import_time_series', { projectId: 'x', name: 's', file: '../secret.csv' });
    expect(raw.isError).toBe(true);
    expect(String(json.error)).toMatch(/No open project|outside the workspace/);
  });

  it.skipIf(!coreReady)('search_library finds concrete with citations', async () => {
    const { raw, json } = await call('search_library', { text: 'concrete', category: 'material', limit: 5 });
    expect(raw.isError).toBeFalsy();
    expect(json.count).toBeGreaterThan(0);
    expect(json.items[0].source).toBeTruthy();
  });

  it.skipIf(!coreReady)('create_from_template → apply_commands → validate', async () => {
    const { json: c } = await call('create_project', { name: 'Template beam', language: 'en' });
    const projectId = c.projectId;
    const lib = await call('search_library', { text: 'concrete', category: 'material', limit: 3 });
    const libId = lib.json.items[0].id;
    const t = await call('create_from_template', { projectId, templateId: 'rect-beam', params: { b: 300, h: 500 }, libraryMaterialId: libId });
    expect(t.raw.isError).toBeFalsy();
    expect(t.json.regions.length).toBe(1);
    const regionId = t.json.regions[0].id;
    const a = await call('apply_commands', { projectId, commands: [{ type: 'probe.add', probe: { name: 'mid', position: [150, 250], kind: 'manual' } }, { type: 'exposure.apply', regionIds: [regionId], faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'ambient' }], fireCurve: 'iso834' }] });
    expect(a.raw.isError).toBeFalsy();
    expect(a.json.counts.probes).toBe(1);
    expect(a.json.counts.boundaryConditions).toBeGreaterThanOrEqual(1);
    const v = await call('validate', { projectId, mesh: true });
    expect(v.raw.isError).toBeFalsy();
    expect(v.json.errors).toBe(0);
    const dry = await call('apply_commands', { projectId, commands: [{ type: 'region.delete', ids: [regionId] }], dry_run: true });
    expect(dry.json.dryRun).toBe(true);
    const m = await call('get_model', { projectId });
    expect(m.json.regions.length).toBe(1);
    const img = await call('get_model_image', { projectId, format: 'svg' });
    expect(img.raw.isError).toBeFalsy();
    expect(img.raw.content.some((x) => x.type === 'text' && x.text?.startsWith('<svg'))).toBe(true);
  });

  it.skipIf(!coreReady)('bad command is rejected atomically with a teaching message', async () => {
    const { json: c } = await call('create_project', { name: 'Bad', language: 'en' });
    const { raw, json } = await call('apply_commands', { projectId: c.projectId, commands: [{ type: 'region.addPrimitive', shape: { kind: 'rect', x: 0, y: 0, width: 100, height: 100 } }, { type: 'no.such.command' }] });
    expect(raw.isError).toBe(true);
    expect(json.error).toBeTruthy();
    const m = await call('get_model', { projectId: c.projectId });
    expect(m.json.regions.length).toBe(0);
  });
});
