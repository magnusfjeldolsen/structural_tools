/** Synthetic mesh / result / project fixture (no core implementation needed). */
import { createEmptyProject, type Mesh, type Project, type RunResult } from '@thermo2d/core';

/** Structured rectangle mesh b × h mm with nx × ny cells; region 'r0'; boundary edges 0..3 = bottom,right,top,left. */
export function gridMesh(b = 300, h = 500, nx = 6, ny = 10): Mesh {
  const nodes: number[] = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) nodes.push((i * b) / nx, (j * h) / ny);
  const id = (i: number, j: number) => j * (nx + 1) + i;
  const tris: number[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      tris.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
      tris.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
  const boundary: Mesh['boundary'] = [];
  for (let i = 0; i < nx; i++) boundary.push({ a: id(i, 0), b: id(i + 1, 0), regionIndex: 0, edgeRef: { regionId: 'r0', ring: 0, edgeIndex: 0 } });
  for (let j = 0; j < ny; j++) boundary.push({ a: id(nx, j), b: id(nx, j + 1), regionIndex: 0, edgeRef: { regionId: 'r0', ring: 0, edgeIndex: 1 } });
  for (let i = nx; i > 0; i--) boundary.push({ a: id(i, ny), b: id(i - 1, ny), regionIndex: 0, edgeRef: { regionId: 'r0', ring: 0, edgeIndex: 2 } });
  for (let j = ny; j > 0; j--) boundary.push({ a: id(0, j), b: id(0, j - 1), regionIndex: 0, edgeRef: { regionId: 'r0', ring: 0, edgeIndex: 3 } });
  const n = (nx + 1) * (ny + 1);
  return {
    nodes: Float64Array.from(nodes),
    triangles: Uint32Array.from(tris),
    elementRegion: new Int32Array(tris.length / 3),
    regions: [{ id: 'r0', materialId: 'm0', kind: 'region', elementCount: tris.length / 3, area: b * h }],
    boundary,
    stats: { nodeCount: n, elementCount: tris.length / 3, minAngleDeg: 26.6, minEdge: Math.min(b / nx, h / ny), maxEdge: Math.hypot(b / nx, h / ny), poorElements: 0 },
    warnings: [],
  };
}

export function fixtureProject(): Project {
  const p = createEmptyProject('Fixture beam', 'prj_fixture');
  p.settings.language = 'en';
  p.materials.push({ id: 'm0', name: 'Concrete C30/37', category: 'concrete', model: { kind: 'constant', lambda: 1.5, cp: 1000, rho: 2300 }, emissivity: 0.7, validRange: [20, 1200], source: { text: 'EN 1992-1-2:2004 §3.3' }, quality: 'standard', tags: ['concrete'], origin: 'builtin' });
  p.regions.push({ id: 'r0', name: 'Beam', polygon: { outer: [[0, 0], [300, 0], [300, 500], [0, 500]], holes: [] }, materialId: 'm0', source: 'template' });
  p.timeSeries.push({ id: 'ts_fire', name: 'ISO 834', points: Array.from({ length: 91 }, (_, i) => [i * 60, 20 + 345 * Math.log10(8 * i + 1)] as [number, number]), interpolation: 'linear', afterEnd: 'hold', unit: '°C', source: { kind: 'preset', ref: 'iso834', citation: { text: 'EN 1991-1-2:2002 §3.2.1' } } });
  p.timeSeries.push({ id: 'ts_amb', name: 'Ambient 20 °C', points: [[0, 20], [7200, 20]], interpolation: 'linear', afterEnd: 'hold', unit: '°C', source: { kind: 'generated' } });
  p.boundaryConditions.push({ id: 'bc_fire', name: 'Fire', type: 'convection-radiation', gasSeriesId: 'ts_fire', alphaC: 25, phi: 1, epsM: 0.7, epsF: 1, edgeRefs: [{ regionId: 'r0', ring: 0, edgeIndex: 0 }, { regionId: 'r0', ring: 0, edgeIndex: 1 }, { regionId: 'r0', ring: 0, edgeIndex: 3 }] });
  p.boundaryConditions.push({ id: 'bc_amb', name: 'Unexposed', type: 'convection', airSeriesId: 'ts_amb', alpha: 4, edgeRefs: [{ regionId: 'r0', ring: 0, edgeIndex: 2 }] });
  p.rebars.push({ id: 'b1', name: 'B1', centre: [45, 45], diameter: 20, materialId: 'm0' }, { id: 'b2', name: 'B2', centre: [255, 45], diameter: 20, materialId: 'm0' });
  p.probes.push({ id: 'p1', name: 'B1', position: [45, 45], kind: 'rebar', linkedRebarId: 'b1' }, { id: 'p2', name: 'Centre', position: [150, 250], kind: 'manual' });
  return p;
}

/** Fake result: temperature rises from the exposed faces with time. */
export function fixtureResult(project = fixtureProject(), nSnap = 10, duration = 5400): RunResult {
  const mesh = gridMesh();
  const times: number[] = [];
  const fields: Float32Array[] = [];
  const n = mesh.stats.nodeCount;
  const temp = (x: number, y: number, t: number) => {
    const d = Math.min(x, 300 - x, y);
    return 20 + (1000 * (t / duration)) * Math.exp(-d / 60);
  };
  for (let k = 0; k < nSnap; k++) {
    const t = (k * duration) / (nSnap - 1);
    times.push(t);
    const f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = temp(mesh.nodes[2 * i], mesh.nodes[2 * i + 1], t);
    fields.push(f);
  }
  const steps = 108;
  const probeTimes = new Float64Array(steps + 1);
  for (let i = 0; i <= steps; i++) probeTimes[i] = (i * duration) / steps;
  const probes = project.probes.map((p) => ({ id: p.id, position: p.position, found: true, element: 0 }));
  const probeValues = probes.map((p) => Float64Array.from(probeTimes, (t) => temp(p.position[0], p.position[1], t)));
  return {
    analysisId: project.analyses[0].id,
    scenarioId: null,
    mode: 'transient',
    mesh,
    times,
    fields,
    probes,
    probeTimes,
    probeValues,
    energy: { storedChange: 1e6, boundaryIn: 1.005e6, sourceIn: 0, relativeImbalance: 0.005 },
    stats: { steps, rejectedSteps: 0, newtonIterations: 250, wallTimeMs: 1234, linearSolver: 'pcg-jacobi', nodeCount: n, elementCount: mesh.stats.elementCount },
    warnings: [],
    stamp: { projectHash: 'abcdef0123456789', coreVersion: '0.1.0', createdAt: '2026-09-30T12:00:00Z' },
  };
}
