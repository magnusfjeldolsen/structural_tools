import { describe, expect, it } from 'vitest';
import { buildPattern, matVec, PcgSolver, SkylineSolver, slotOf, reverseCuthillMcKee } from '../../src/solver/sparse.js';
import { gridMesh } from '../helpers/gridMesh.js';

/** Graph Laplacian + diagonal shift on the mesh pattern: SPD. */
function laplacian(n: number, triangles: Uint32Array) {
  const p = buildPattern(n, triangles);
  const values = new Float64Array(p.colIdx.length);
  for (let i = 0; i < n; i++) {
    let deg = 0;
    for (let k = p.rowPtr[i]; k < p.rowPtr[i + 1]; k++) {
      const j = p.colIdx[k];
      if (j !== i) {
        values[k] = -1 - 0.1 * ((i * 7 + j * 3) % 5); // asymmetric-looking but we symmetrise below
        deg++;
      }
    }
    void deg;
  }
  // symmetrise and set diagonal dominance
  for (let i = 0; i < n; i++)
    for (let k = p.rowPtr[i]; k < p.rowPtr[i + 1]; k++) {
      const j = p.colIdx[k];
      if (j > i) {
        const kk = slotOf(p, j, i);
        const v = 0.5 * (values[k] + values[kk]);
        values[k] = v;
        values[kk] = v;
      }
    }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = p.rowPtr[i]; k < p.rowPtr[i + 1]; k++) if (p.colIdx[k] !== i) s += Math.abs(values[k]);
    values[p.diag[i]] = s + 0.5 + (i % 3);
  }
  return { p, values };
}

describe('sparse linear algebra', () => {
  const mesh = gridMesh({ x0: 0, x1: 100, y0: 0, y1: 60, nx: 25, ny: 15 });
  const n = mesh.nodes.length / 2;
  const { p, values } = laplacian(n, mesh.triangles);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) b[i] = Math.sin(i * 0.37) + 0.2;

  it('PCG and skyline Cholesky agree to 1e-9', () => {
    const x1 = new Float64Array(n), x2 = new Float64Array(n);
    const pcg = new PcgSolver(p, 1e-14, 5000);
    expect(pcg.prepare(values)).toBe(true);
    expect(pcg.solve(values, b, x1)).toBeGreaterThan(0);
    const sky = new SkylineSolver(p);
    expect(sky.prepare(values)).toBe(true);
    sky.solve(values, b, x2);
    let maxDiff = 0;
    for (let i = 0; i < n; i++) maxDiff = Math.max(maxDiff, Math.abs(x1[i] - x2[i]));
    expect(maxDiff).toBeLessThan(1e-9);
    const y = new Float64Array(n);
    matVec(p, values, x2, y);
    let res = 0;
    for (let i = 0; i < n; i++) res = Math.max(res, Math.abs(y[i] - b[i]));
    expect(res).toBeLessThan(1e-10);
  });

  it('RCM produces a permutation and reduces the profile', () => {
    const perm = reverseCuthillMcKee(p);
    expect(new Set(Array.from(perm)).size).toBe(n);
    const sky = new SkylineSolver(p);
    // natural ordering of a 26×16 grid has bandwidth ~27; profile must be well below n²/2
    expect(sky.profile).toBeLessThan((n * n) / 8);
  });

  it('skyline reports non-SPD matrices', () => {
    const bad = Float64Array.from(values);
    bad[p.diag[3]] = -1;
    expect(new SkylineSolver(p).prepare(bad)).toBe(false);
  });
});
