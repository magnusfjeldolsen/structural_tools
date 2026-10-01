/**
 * Spec §14 case 15: build the case-5 model only through MCP tools, run it, then run the
 * saved project through the CLI's run function and compare probe values (≤ 1e-6 K).
 * Runs when the core is complete; otherwise skipped with a reason (lead integrates).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/mcp.js';
import { ServerState } from '../src/state.js';
import { Workspace } from '../src/workspace.js';
import { runProjectFile } from '../src/cli.js';
import { hasCore } from '../src/coreApi.js';

const coreReady = ['applyCommands', 'buildTemplate', 'searchLibrary', 'prepareRun', 'mesh', 'createRun', 'runProject', 'serializeProject', 'parseProject', 'projectHash', 'encodeResults'].every(hasCore);

let dir: string;
let client: Client;
let state: ServerState;

async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const raw = (await client.callTool({ name, arguments: args })) as { content: { type: string; text?: string }[]; isError?: boolean };
  const text = raw.content.find((c) => c.type === 'text')?.text ?? '';
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  if (raw.isError) throw new Error(`${name} failed: ${text}`);
  return json;
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'thermo2d-case15-'));
  state = new ServerState(new Workspace(dir));
  await state.loadUserLibrary();
  const server = await createServer(state);
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  client = new Client({ name: 'case15', version: '0.0.0' });
  await client.connect(ct);
});

afterAll(async () => {
  await client?.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('case 15: MCP round trip equals CLI run', () => {
  // TODO(lead): un-skip automatically once the core exports listed in coreReady exist.
  it.skipIf(!coreReady)('builds the 300×500 beam through MCP, runs it, and the CLI reproduces it within 1e-6 K', async () => {
    const { projectId } = await call('create_project', { name: 'case15 beam', language: 'en' });
    const concrete = await call('search_library', { text: 'siliceous', category: 'material', limit: 5 });
    const concreteId = concrete.items.find((i: any) => i.materialCategory === 'concrete')?.id ?? concrete.items[0].id;
    const steel = await call('search_library', { text: 'reinforc', category: 'material', limit: 5 });
    const steelLib = steel.items.find((i: any) => i.materialCategory === 'metal')?.id ?? steel.items[0].id;
    const t = await call('create_from_template', { projectId, templateId: 'rect-beam', params: { b: 300, h: 500 }, libraryMaterialId: concreteId });
    const regionId = t.regions[0].id;
    // Bottom edge of a CCW rectangle starting at the bottom-left corner is edge 0.
    const edges = t.edges as { side: string; edgeIndex: number; ring: number }[];
    const bottom = edges.find((e) => e.side === 'bottom')!;
    await call('apply_commands', {
      projectId,
      commands: [
        { type: 'material.addFromLibrary', libraryId: steelLib, id: 'm_steel' },
        { type: 'rebarSet.add', set: { name: 'Bottom bars', kind: 'edge', regionId, edgeRef: { regionId, ring: bottom.ring, edgeIndex: bottom.edgeIndex }, diameter: 20, materialId: 'm_steel', cover: 35, count: 4 } },
        { type: 'exposure.apply', regionIds: [regionId], faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'fire-unexposed' }], fireCurve: 'iso834', fireDuration: 5400 },
        { type: 'probe.addForRebars' },
        { type: 'project.setMesh', patch: { preset: 'coarse' } },
        { type: 'analysis.update', id: 'an_main', patch: { duration: 5400, dt: 30, outputInterval: 600, adaptive: { enabled: false, maxDeltaPerStep: 50, minDt: 1 } } },
      ],
    });
    const model = await call('get_model', { projectId, includeEdges: false });
    expect(model.rebars.length).toBe(4);
    expect(model.probes.length).toBe(4);
    const v = await call('validate', { projectId });
    expect(v.errors).toBe(0);
    const run = await call('run_analysis', { projectId, wait: true, timeoutSeconds: 600 });
    expect(run.status).toBe('done');
    const q = await call('query_results', { projectId, query: 'probes', times: [5400] });
    const mcpValues = q.probes.map((p: any) => p.values['5400'] as number);
    expect(mcpValues.every((x: number) => Number.isFinite(x) && x > 100)).toBe(true);
    const { path: saved } = await call('save_project', { projectId });

    const cli = await runProjectFile(saved, { out: path.join(dir, 'cli-out') });
    const cliValues = cli.result.probes.map((_, k) => cli.result.probeValues[k][cli.result.probeValues[k].length - 1]);
    const mcpResult = state.getResult(projectId, undefined, null).result;
    const mcpExact = mcpResult.probes.map((_, k) => mcpResult.probeValues[k][mcpResult.probeValues[k].length - 1]);
    expect(cliValues.length).toBe(mcpExact.length);
    for (let k = 0; k < cliValues.length; k++) expect(Math.abs(cliValues[k] - mcpExact[k])).toBeLessThanOrEqual(1e-6);
    expect(cli.result.stamp?.projectHash).toBe(mcpResult.stamp?.projectHash);

    const fig = await call('make_figure', { projectId, kind: 'time-series', format: 'svg' });
    expect(fig.path).toMatch(/\.svg$/);
    const html = await call('make_figure', { projectId, kind: 'interactive', format: 'html' });
    expect(html.bytes).toBeGreaterThan(10000);
    const explain = (await client.callTool({ name: 'explain_results', arguments: { projectId, lang: 'en' } })) as { content: { text?: string }[] };
    expect(explain.content[0].text).toContain('Key results');
  }, 600000);
});
