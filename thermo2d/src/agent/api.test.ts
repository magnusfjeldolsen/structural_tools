// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createAgentApi, queryResults, toAgentError } from './api.js';
import { useStore } from '../state/store.js';
import type { Project, RunResult } from '@thermo2d/core';
import { CommandError } from '@thermo2d/core';

describe('agent API', () => {
  const api = createAgentApi();

  it('describe() returns MCP-shaped tools with object schemas', () => {
    const d = api.describe();
    expect(d.name).toBe('thermo2d');
    expect(d.tools.length).toBeGreaterThanOrEqual(10);
    for (const t of d.tools) {
      expect(t.name).toMatch(/^[a-z_]+$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe('object');
      expect(typeof t.inputSchema.properties).toBe('object');
      expect(api.tools[t.name]).toBeTypeOf('function');
    }
  });

  it('rejects a bad command with a message and leaves the project unchanged', async () => {
    const before = useStore.getState().project;
    await expect(api.call('apply_commands', { commands: [{ type: 'region.update', id: 'nope', patch: {} }] })).rejects.toMatchObject({ error: true, code: expect.any(String), message: expect.stringMatching(/nope/) });
    expect(useStore.getState().project).toBe(before);
    await expect(api.call('no_such_tool')).rejects.toMatchObject({ error: true, options: expect.arrayContaining(['validate']) });
  });

  it('builds a beam from a template and reads it back', async () => {
    const res = (await api.call('create_from_template', { templateId: 'rect-beam', params: { b: 300, h: 500 }, withDefaults: false })) as { regionIds: string[] };
    expect(res.regionIds).toHaveLength(1);
    const p = (await api.call('get_project')) as Project;
    expect(p.regions[0].polygon.outer.length).toBeGreaterThanOrEqual(4);
    const issues = (await api.call('validate')) as { code: string }[];
    expect(issues.some((i) => i.code === 'no-material')).toBe(true);
  });

  it('query_results reads points, probes and extremes from a fake result', () => {
    const project = useStore.getState().project;
    const r: RunResult = {
      analysisId: 'an_main',
      scenarioId: null,
      mode: 'transient',
      mesh: {
        nodes: new Float64Array([0, 0, 100, 0, 0, 100]),
        triangles: new Uint32Array([0, 1, 2]),
        elementRegion: new Int32Array([0]),
        regions: [{ id: 'r', materialId: null, kind: 'region', elementCount: 1, area: 5000 }],
        boundary: [],
        stats: { nodeCount: 3, elementCount: 1, minAngleDeg: 45, minEdge: 100, maxEdge: 141, poorElements: 0 },
        warnings: [],
      },
      times: [0, 60],
      fields: [new Float32Array([20, 20, 20]), new Float32Array([100, 40, 20])],
      probes: [{ id: 'p', position: [10, 10], found: true, element: 0 }],
      probeTimes: new Float64Array([0, 30, 60]),
      probeValues: [new Float64Array([20, 50, 80])],
      energy: { storedChange: 0, boundaryIn: 0, sourceIn: 0, relativeImbalance: 0 },
      stats: { steps: 2, rejectedSteps: 0, newtonIterations: 2, wallTimeMs: 1, linearSolver: 'pcg', nodeCount: 3, elementCount: 1 },
      warnings: [],
    };
    const pt = queryResults(r, project, { kind: 'point', x: 0, y: 0 }) as { temperature: number };
    expect(pt.temperature).toBe(100);
    const pr = queryResults(r, project, { kind: 'probe', time: 45 }) as { probes: { temperature: number }[] };
    expect(pr.probes[0].temperature).toBe(65);
    const ex = queryResults(r, project, { kind: 'extremes' }) as { max: { temperature: number; x: number } };
    expect(ex.max).toMatchObject({ temperature: 100, x: 0 });
    const tt = queryResults(r, project, { kind: 'time-to-threshold', threshold: 50 }) as { probes: { seconds: number | null }[] };
    expect(tt.probes[0].seconds).toBe(30);
    expect(() => queryResults(r, project, { kind: 'point', x: 500, y: 500 })).toThrow(/outside/);
    expect(toAgentError(new CommandError('x', 'boom', { field: 'f', options: [1] }))).toMatchObject({ error: true, code: 'x', field: 'f', options: [1] });
  });
});
