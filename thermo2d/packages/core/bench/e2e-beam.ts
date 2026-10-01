import { applyCommands, createEmptyProject, runProject, rebarTable } from '../src/index.js';
const t0 = Date.now();
let { project } = applyCommands(createEmptyProject('Bjelke'), [
  { type: 'material.addFromLibrary', libraryId: 'concrete-siliceous', id: 'concrete' },
  { type: 'material.addFromLibrary', libraryId: 'reinforcing-steel', id: 'steel' },
  { type: 'template.create', templateId: 'rect-beam', params: { b: 300, h: 500 }, materialId: 'concrete', id: 'beam' },
  { type: 'rebarSet.add', set: { name: 'Bunn', kind: 'edge', regionId: 'beam', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, diameter: 20, materialId: 'steel', cover: 35, count: 4 } },
  { type: 'exposure.apply', faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'fire-unexposed' }] },
  { type: 'probe.addAtDepth', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, depth: 25, name: 'd25' },
  { type: 'probe.addAtDepth', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, depth: 50, name: 'd50' },
  { type: 'analysis.update', id: 'an_main', patch: { duration: 5400, dt: 5, outputInterval: 300 } },
]);
const res = runProject(project, { onProgress: (p) => { if (p.step % 200 === 0) process.stdout.write(`t=${p.t} `); } });
console.log(`\nmesh ${res.mesh.stats.nodeCount} nodes, ${res.mesh.stats.elementCount} el, minAngle ${res.mesh.stats.minAngleDeg.toFixed(1)}; solver ${res.stats.linearSolver}, ${res.stats.steps} steps, ${res.stats.wallTimeMs.toFixed(0)} ms, total ${Date.now() - t0} ms`);
console.log('energy imbalance', res.energy.relativeImbalance.toExponential(2), 'warnings', res.warnings);
const rows = rebarTable(project, res, [1800, 3600, 5400]);
for (const r of rows) console.log(r.name, r.x.toFixed(0), r.y.toFixed(0), r.temps.map((t) => t.toFixed(0)).join(' / '), 'ks', r.ks.map((k) => (k == null ? '-' : k.toFixed(2))).join(' / '));
for (const p of res.probes) { const i = res.probes.indexOf(p); const v = res.probeValues[i]; console.log(p.id, p.found, v[v.length - 1].toFixed(0)); }
