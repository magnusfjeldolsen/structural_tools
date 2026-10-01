import { describe, expect, it } from 'vitest';
import { canonicalJson, createEmptyProject, decodeResults, encodeResults, fnv1a64, parseProject, projectHash, serializeProject, ProjectParseError, type Mesh, type RunResult } from '../../src/index.js';

describe('project io', () => {
  it('round-trips an empty project through JSON', () => {
    const p = createEmptyProject('Test', 'prj_1');
    const text = serializeProject(p);
    const back = parseProject(text);
    expect(back).toEqual(p);
  });

  it('rejects broken documents with a pointed message', () => {
    const p = createEmptyProject('Test');
    const raw = JSON.parse(serializeProject(p));
    raw.analyses[0].dt = -5;
    expect(() => parseProject(raw)).toThrow(ProjectParseError);
    try {
      parseProject(raw);
    } catch (e) {
      expect((e as ProjectParseError).issues[0].path).toBe('analyses.0.dt');
    }
    expect(() => parseProject('{not json')).toThrow(/valid JSON/);
  });

  it('hashes independently of key order and timestamps', () => {
    const p = createEmptyProject('Test', 'prj_1');
    const q = { ...p, meta: { ...p.meta, modified: '2000-01-01T00:00:00.000Z' } };
    expect(projectHash(p)).toBe(projectHash(q));
    expect(projectHash({ ...p, name: 'Other' })).not.toBe(projectHash(p));
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });
});

describe('results container', () => {
  it('round-trips typed arrays and metadata', () => {
    const mesh: Mesh = {
      nodes: new Float64Array([0, 0, 1, 0, 0, 1]),
      triangles: new Uint32Array([0, 1, 2]),
      elementRegion: new Int32Array([0]),
      regions: [{ id: 'r', materialId: 'm', kind: 'region', elementCount: 1, area: 0.5 }],
      boundary: [
        { a: 0, b: 1, regionIndex: 0, edgeRef: { regionId: 'r', ring: 0, edgeIndex: 0 } },
        { a: 1, b: 2, regionIndex: 0, edgeRef: { regionId: 'r', ring: 0, edgeIndex: 1 } },
        { a: 2, b: 0, regionIndex: 0, edgeRef: { regionId: 'r', ring: 0, edgeIndex: 2 } },
      ],
      stats: { nodeCount: 3, elementCount: 1, minAngleDeg: 45, minEdge: 1, maxEdge: 1.414, poorElements: 0 },
      warnings: [],
    };
    const result: RunResult = {
      analysisId: 'an',
      scenarioId: null,
      mode: 'transient',
      mesh,
      times: [0, 60],
      fields: [new Float32Array([20, 20, 20]), new Float32Array([100, 50, 20])],
      probes: [{ id: 'p', position: [0.2, 0.2], found: true, element: 0 }],
      probeTimes: new Float64Array([0, 30, 60]),
      probeValues: [new Float64Array([20, 40, 60.5])],
      energy: { storedChange: 1, boundaryIn: 1, sourceIn: 0, relativeImbalance: 0 },
      stats: { steps: 2, rejectedSteps: 0, newtonIterations: 4, wallTimeMs: 1, linearSolver: 'pcg', nodeCount: 3, elementCount: 1 },
      warnings: ['w'],
      stamp: { projectHash: 'abc', coreVersion: '0.1.0', createdAt: 'now' },
    };
    const bytes = encodeResults(result);
    const back = decodeResults(bytes);
    expect(Array.from(back.mesh.nodes)).toEqual(Array.from(mesh.nodes));
    expect(Array.from(back.mesh.triangles)).toEqual([0, 1, 2]);
    expect(Array.from(back.fields[1])).toEqual([100, 50, 20]);
    expect(Array.from(back.probeValues[0])).toEqual([20, 40, 60.5]);
    expect(back.times).toEqual([0, 60]);
    expect(back.stamp?.projectHash).toBe('abc');
    expect(back.mesh.boundary).toHaveLength(3);
    // Works on a copy with a non-zero byteOffset too.
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    expect(Array.from(decodeResults(padded.subarray(3)).fields[0])).toEqual([20, 20, 20]);
  });
});
