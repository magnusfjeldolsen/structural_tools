/**
 * FEM system: precomputed element geometry, lumped-capacity node groups,
 * boundary segments and Dirichlet nodes; assembles residual and Jacobian.
 *
 * Geometry arrives in mm and is converted to m here. Residual entries are in
 * W per metre depth; the Jacobian in W/K per metre depth.
 */
import type { BoundaryCondition } from '../model/types.js';
import { edgeKey, type Mesh } from '../mesh/types.js';
import type { MaterialEvaluator, SeriesEvaluator, SolveInput } from './types.js';
import { buildPattern, slotOf, type CsrPattern } from './sparse.js';

const SIGMA = 5.67e-8; // W/m²K⁴
const K0 = 273.15;
const GAUSS = 1 / Math.sqrt(3);
const MM = 1e-3;

const SEG_CONV = 1, SEG_CONVRAD = 2, SEG_FLUX = 3;

export interface AssemblyStats {
  /** L2 norm of the residual (all free nodes). */
  resNorm: number;
  /** Boundary power into the body from flux-type conditions, W/m. */
  powerBc: number;
  /** Volumetric source power, W/m. */
  powerSrc: number;
  /** Reaction power at fixed-temperature nodes (full residual there), W/m. */
  powerReact: number;
}

export class FemSystem {
  readonly n: number;
  readonly m: number;
  readonly pattern: CsrPattern;
  readonly values: Float64Array;
  readonly R: Float64Array;
  readonly materials: MaterialEvaluator[];
  readonly linearMaterials: boolean;
  readonly hasRadiation: boolean;
  // elements
  private readonly area: Float64Array; // m²
  private readonly bc: Float64Array; // 6 per element: b0 b1 b2 c0 c1 c2 (m)
  private readonly slots: Int32Array; // 9 per element
  private readonly elemMat: Int32Array;
  private readonly elemSrc: Int32Array; // source index or -1
  // lumped capacity groups
  readonly capPtr: Int32Array;
  readonly capMat: Int32Array;
  readonly capArea: Float64Array; // m²
  private readonly capHOld: Float64Array;
  // boundary segments (flux-type)
  private readonly segA: Int32Array;
  private readonly segB: Int32Array;
  private readonly segL: Float64Array; // m
  private readonly segType: Int8Array;
  private readonly segAlpha: Float64Array;
  private readonly segRad: Float64Array; // Φ εm εf σ
  private readonly segS1: Int32Array;
  private readonly segS2: Int32Array;
  private readonly segSlots: Int32Array; // aa ab ba bb
  readonly segCount: number;
  // Dirichlet
  readonly fixedNodes: Int32Array;
  private readonly fixedSeries: Int32Array;
  private readonly fixedColSlots: Int32Array; // flattened
  private readonly fixedColPtr: Int32Array;
  // sources
  private readonly sources: (number | SeriesEvaluator)[];
  readonly series: SeriesEvaluator[];
  readonly stats: AssemblyStats = { resNorm: 0, powerBc: 0, powerSrc: 0, powerReact: 0 };
  readonly warnings: string[] = [];
  /** Segment index list per boundary condition id (for post-processing). */
  readonly segmentsByEdgeKey = new Map<string, number[]>();

  constructor(readonly input: SolveInput) {
    const mesh = input.mesh;
    const n = (this.n = mesh.nodes.length / 2);
    const m = (this.m = mesh.triangles.length / 3);
    if (n === 0 || m === 0) throw new Error('The mesh is empty: draw at least one region before running.');

    // materials per region index
    this.materials = mesh.regions.map((r) => {
      const mat = input.materials[r.id];
      if (!mat) throw new Error(`Region "${r.id}" has no material. Assign a material to every region before running.`);
      return mat;
    });
    this.linearMaterials = this.materials.every((mt) => mt.isConstant === true);

    // series registry
    const seriesIds = Object.keys(input.series);
    this.series = seriesIds.map((id) => input.series[id]);
    const seriesIndex = new Map<string, number>(seriesIds.map((id, i) => [id, i]));
    const needSeries = (id: string, what: string): number => {
      const k = seriesIndex.get(id);
      if (k === undefined) throw new Error(`${what} refers to time series "${id}", which does not exist in the project.`);
      return k;
    };

    // element geometry
    this.pattern = buildPattern(n, mesh.triangles);
    this.values = new Float64Array(this.pattern.colIdx.length);
    this.R = new Float64Array(n);
    this.area = new Float64Array(m);
    this.bc = new Float64Array(6 * m);
    this.slots = new Int32Array(9 * m);
    this.elemMat = new Int32Array(m);
    this.elemSrc = new Int32Array(m).fill(-1);
    const nodes = mesh.nodes, tri = mesh.triangles;
    const groups: Map<number, number>[] = new Array(n);
    for (let i = 0; i < n; i++) groups[i] = new Map();
    for (let e = 0; e < m; e++) {
      const a = tri[3 * e], b = tri[3 * e + 1], c = tri[3 * e + 2];
      const x0 = nodes[2 * a] * MM, y0 = nodes[2 * a + 1] * MM;
      const x1 = nodes[2 * b] * MM, y1 = nodes[2 * b + 1] * MM;
      const x2 = nodes[2 * c] * MM, y2 = nodes[2 * c + 1] * MM;
      const det = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      const A = 0.5 * det;
      if (!(A > 0)) throw new Error(`Element ${e} is degenerate or clockwise (area ${A}). Re-mesh the section.`);
      this.area[e] = A;
      this.bc[6 * e] = y1 - y2;
      this.bc[6 * e + 1] = y2 - y0;
      this.bc[6 * e + 2] = y0 - y1;
      this.bc[6 * e + 3] = x2 - x1;
      this.bc[6 * e + 4] = x0 - x2;
      this.bc[6 * e + 5] = x1 - x0;
      const ids = [a, b, c];
      for (let r = 0; r < 3; r++)
        for (let s = 0; s < 3; s++) this.slots[9 * e + 3 * r + s] = slotOf(this.pattern, ids[r], ids[s]);
      const matIdx = mesh.elementRegion[e];
      this.elemMat[e] = matIdx;
      for (const id of ids) groups[id].set(matIdx, (groups[id].get(matIdx) ?? 0) + A / 3);
    }
    // capacity groups
    this.capPtr = new Int32Array(n + 1);
    let total = 0;
    for (let i = 0; i < n; i++) {
      total += groups[i].size;
      this.capPtr[i + 1] = total;
    }
    this.capMat = new Int32Array(total);
    this.capArea = new Float64Array(total);
    this.capHOld = new Float64Array(total);
    for (let i = 0; i < n; i++) {
      let k = this.capPtr[i];
      for (const [mat, A] of groups[i]) {
        this.capMat[k] = mat;
        this.capArea[k] = A;
        k++;
      }
    }

    // sources
    this.sources = [];
    for (const src of input.heatSources) {
      const rIdx = mesh.regions.findIndex((r) => r.id === src.regionId);
      if (rIdx < 0) continue;
      const k = this.sources.length;
      this.sources.push(src.q);
      for (let e = 0; e < m; e++) if (mesh.elementRegion[e] === rIdx) this.elemSrc[e] = k;
    }

    // boundary conditions
    const bcByKey = new Map<string, BoundaryCondition>();
    for (const bcnd of input.boundaryConditions) for (const ref of bcnd.edgeRefs) bcByKey.set(edgeKey(ref), bcnd);
    const segA: number[] = [], segB: number[] = [], segL: number[] = [], segType: number[] = [];
    const segAlpha: number[] = [], segRad: number[] = [], segS1: number[] = [], segS2: number[] = [];
    const fixed = new Map<number, number>();
    let hasRadiation = false;
    mesh.boundary.forEach((seg, sIdx) => {
      const key = edgeKey(seg.edgeRef);
      const bcnd = bcByKey.get(key);
      if (!bcnd || bcnd.type === 'insulated') return;
      const L = Math.hypot(nodes[2 * seg.b] - nodes[2 * seg.a], nodes[2 * seg.b + 1] - nodes[2 * seg.a + 1]) * MM;
      if (bcnd.type === 'fixed') {
        const s = needSeries(bcnd.temperatureSeriesId, `Boundary condition "${bcnd.name}"`);
        fixed.set(seg.a, s);
        fixed.set(seg.b, s);
        return;
      }
      const list = this.segmentsByEdgeKey.get(key) ?? [];
      list.push(segA.length);
      this.segmentsByEdgeKey.set(key, list);
      segA.push(seg.a);
      segB.push(seg.b);
      segL.push(L);
      if (bcnd.type === 'convection') {
        const alpha = bcnd.alpha ?? (bcnd.surfaceResistance ? 1 / bcnd.surfaceResistance : undefined);
        if (alpha === undefined || !(alpha > 0))
          throw new Error(`Boundary condition "${bcnd.name}" needs a film coefficient (alpha) or a surface resistance.`);
        segType.push(SEG_CONV);
        segAlpha.push(alpha);
        segRad.push(0);
        const s = needSeries(bcnd.airSeriesId, `Boundary condition "${bcnd.name}"`);
        segS1.push(s);
        segS2.push(s);
      } else if (bcnd.type === 'convection-radiation') {
        hasRadiation = true;
        const epsM = bcnd.epsM ?? this.materials[seg.regionIndex].emissivity;
        segType.push(SEG_CONVRAD);
        segAlpha.push(bcnd.alphaC);
        segRad.push(bcnd.phi * epsM * bcnd.epsF * SIGMA);
        const s1 = needSeries(bcnd.gasSeriesId, `Boundary condition "${bcnd.name}"`);
        const s2 = bcnd.radiationSeriesId ? needSeries(bcnd.radiationSeriesId, `Boundary condition "${bcnd.name}"`) : s1;
        segS1.push(s1);
        segS2.push(s2);
      } else {
        segType.push(SEG_FLUX);
        segAlpha.push(0);
        segRad.push(0);
        const s = needSeries(bcnd.fluxSeriesId, `Boundary condition "${bcnd.name}"`);
        segS1.push(s);
        segS2.push(s);
      }
      void sIdx;
    });
    this.hasRadiation = hasRadiation;
    this.segCount = segA.length;
    this.segA = Int32Array.from(segA);
    this.segB = Int32Array.from(segB);
    this.segL = Float64Array.from(segL);
    this.segType = Int8Array.from(segType);
    this.segAlpha = Float64Array.from(segAlpha);
    this.segRad = Float64Array.from(segRad);
    this.segS1 = Int32Array.from(segS1);
    this.segS2 = Int32Array.from(segS2);
    this.segSlots = new Int32Array(4 * this.segCount);
    for (let s = 0; s < this.segCount; s++) {
      const a = this.segA[s], b = this.segB[s];
      this.segSlots[4 * s] = slotOf(this.pattern, a, a);
      this.segSlots[4 * s + 1] = slotOf(this.pattern, a, b);
      this.segSlots[4 * s + 2] = slotOf(this.pattern, b, a);
      this.segSlots[4 * s + 3] = slotOf(this.pattern, b, b);
    }
    // Dirichlet nodes
    const fixedList = Array.from(fixed.entries()).sort((x, y) => x[0] - y[0]);
    this.fixedNodes = Int32Array.from(fixedList.map((f) => f[0]));
    this.fixedSeries = Int32Array.from(fixedList.map((f) => f[1]));
    const colSlots: number[] = [];
    this.fixedColPtr = new Int32Array(fixedList.length + 1);
    fixedList.forEach(([i], k) => {
      const { rowPtr, colIdx } = this.pattern;
      for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) {
        const j = colIdx[p];
        if (j !== i) colSlots.push(slotOf(this.pattern, j, i));
      }
      this.fixedColPtr[k + 1] = colSlots.length;
    });
    this.fixedColSlots = Int32Array.from(colSlots);
  }

  get hasFixed(): boolean {
    return this.fixedNodes.length > 0;
  }

  /** Impose prescribed temperatures at time t. */
  setFixed(theta: Float64Array, t: number): void {
    for (let k = 0; k < this.fixedNodes.length; k++) theta[this.fixedNodes[k]] = this.series[this.fixedSeries[k]].at(t);
  }

  /** Cache H(θ_old) per capacity group at the start of a step. */
  cacheOldEnthalpy(thetaOld: Float64Array): void {
    const { capPtr, capMat, capHOld, materials } = this;
    for (let i = 0; i < this.n; i++) {
      const th = thetaOld[i];
      for (let k = capPtr[i]; k < capPtr[i + 1]; k++) capHOld[k] = materials[capMat[k]].enthalpy(th);
    }
  }

  /** Stored enthalpy of the whole section for a field, J/m. */
  storedEnthalpy(theta: ArrayLike<number>): number {
    const { capPtr, capMat, capArea, materials } = this;
    let H = 0;
    for (let i = 0; i < this.n; i++) {
      const th = theta[i];
      for (let k = capPtr[i]; k < capPtr[i + 1]; k++) H += capArea[k] * materials[capMat[k]].enthalpy(th);
    }
    return H;
  }

  /**
   * Assemble R (and J when wantJ) for the current iterate.
   *  R = C(θ, θ_old)/dt + α·[K(θ)θ − F_bc(θ, t) − F_src(t)] + gOld
   * where invDt = 0 for steady state (no capacity term), α = 1 (backward Euler) or 0.5 (Crank–Nicolson),
   * and gOld (optional) = (1−α)·[K(θ_old)θ_old − F(θ_old, t_old)] computed by `oldPart`.
   * Fixed nodes are eliminated (R_i = 0, identity row/column). Stats are updated in place.
   */
  assemble(theta: Float64Array, thetaOld: Float64Array, t: number, invDt: number, alpha: number, wantJ: boolean, gOld: Float64Array | null, eliminate = true): AssemblyStats {
    const { n, m, R, values, area, bc, slots, elemMat, materials } = this;
    R.fill(0);
    if (wantJ) values.fill(0);
    const tri = this.input.mesh.triangles;
    // conductivity + sources
    let powerSrc = 0;
    for (let e = 0; e < m; e++) {
      const a = tri[3 * e], b = tri[3 * e + 1], c = tri[3 * e + 2];
      const ta = theta[a], tb = theta[b], tc = theta[c];
      const lam = materials[elemMat[e]].lambda((ta + tb + tc) / 3);
      const A = area[e];
      const coef = (alpha * lam) / (4 * A);
      const o = 6 * e;
      const b0 = bc[o], b1 = bc[o + 1], b2 = bc[o + 2], c0 = bc[o + 3], c1 = bc[o + 4], c2 = bc[o + 5];
      const k00 = coef * (b0 * b0 + c0 * c0), k01 = coef * (b0 * b1 + c0 * c1), k02 = coef * (b0 * b2 + c0 * c2);
      const k11 = coef * (b1 * b1 + c1 * c1), k12 = coef * (b1 * b2 + c1 * c2), k22 = coef * (b2 * b2 + c2 * c2);
      R[a] += k00 * ta + k01 * tb + k02 * tc;
      R[b] += k01 * ta + k11 * tb + k12 * tc;
      R[c] += k02 * ta + k12 * tb + k22 * tc;
      if (wantJ) {
        const s = 9 * e;
        values[slots[s]] += k00;
        values[slots[s + 1]] += k01;
        values[slots[s + 2]] += k02;
        values[slots[s + 3]] += k01;
        values[slots[s + 4]] += k11;
        values[slots[s + 5]] += k12;
        values[slots[s + 6]] += k02;
        values[slots[s + 7]] += k12;
        values[slots[s + 8]] += k22;
      }
      const si = this.elemSrc[e];
      if (si >= 0) {
        const src = this.sources[si];
        const q = typeof src === 'number' ? src : src.at(t);
        const f = (q * A) / 3;
        R[a] -= alpha * f;
        R[b] -= alpha * f;
        R[c] -= alpha * f;
        powerSrc += q * A;
      }
    }
    // capacity (lumped, enthalpy form)
    if (invDt > 0) {
      const { capPtr, capMat, capArea, capHOld } = this;
      const { diag } = this.pattern;
      for (let i = 0; i < n; i++) {
        const th = theta[i], tho = thetaOld[i];
        const dth = th - tho;
        let r = 0, j = 0;
        for (let k = capPtr[i]; k < capPtr[i + 1]; k++) {
          const mat = materials[capMat[k]];
          const dH = mat.enthalpy(th) - capHOld[k];
          r += capArea[k] * dH;
          if (wantJ) j += capArea[k] * (Math.abs(dth) > 1e-3 ? dH / dth : mat.rhoCp(th));
        }
        R[i] += r * invDt;
        if (wantJ) values[diag[i]] += j * invDt;
      }
    }
    // boundary flux terms
    let powerBc = 0;
    const { segA, segB, segL, segType, segAlpha, segRad, segS1, segS2, segSlots, series } = this;
    for (let s = 0; s < this.segCount; s++) {
      const a = segA[s], b = segB[s];
      const ta = theta[a], tb = theta[b];
      const half = 0.5 * segL[s];
      const type = segType[s];
      let raa = 0, rab = 0, rbb = 0, fa = 0, fb = 0;
      for (let g = 0; g < 2; g++) {
        const xi = g === 0 ? -GAUSS : GAUSS;
        const Na = 0.5 * (1 - xi), Nb = 0.5 * (1 + xi);
        const ts = Na * ta + Nb * tb;
        let q: number, dq: number;
        if (type === SEG_CONV) {
          const al = segAlpha[s];
          q = al * (series[segS1[s]].at(t) - ts);
          dq = -al;
        } else if (type === SEG_CONVRAD) {
          const al = segAlpha[s], rad = segRad[s];
          const tg = series[segS1[s]].at(t), tr = series[segS2[s]].at(t);
          const Tr = tr + K0, Ts = ts + K0;
          q = al * (tg - ts) + rad * (Tr * Tr * Tr * Tr - Ts * Ts * Ts * Ts);
          dq = -al - 4 * rad * Ts * Ts * Ts;
        } else {
          q = series[segS1[s]].at(t);
          dq = 0;
        }
        fa += half * Na * q;
        fb += half * Nb * q;
        raa += half * Na * Na * dq;
        rab += half * Na * Nb * dq;
        rbb += half * Nb * Nb * dq;
      }
      powerBc += fa + fb;
      R[a] -= alpha * fa;
      R[b] -= alpha * fb;
      if (wantJ) {
        values[segSlots[4 * s]] -= alpha * raa;
        values[segSlots[4 * s + 1]] -= alpha * rab;
        values[segSlots[4 * s + 2]] -= alpha * rab;
        values[segSlots[4 * s + 3]] -= alpha * rbb;
      }
    }
    if (gOld) for (let i = 0; i < n; i++) R[i] += gOld[i];
    // Dirichlet elimination
    let powerReact = 0;
    const { fixedNodes, fixedColSlots, fixedColPtr } = this;
    const { rowPtr, diag } = this.pattern;
    for (let k = 0; eliminate && k < fixedNodes.length; k++) {
      const i = fixedNodes[k];
      powerReact += R[i];
      R[i] = 0;
      if (wantJ) {
        for (let p = rowPtr[i]; p < rowPtr[i + 1]; p++) values[p] = 0;
        for (let p = fixedColPtr[k]; p < fixedColPtr[k + 1]; p++) values[fixedColSlots[p]] = 0;
        values[diag[i]] = 1;
      }
    }
    let rn = 0;
    for (let i = 0; i < n; i++) rn += R[i] * R[i];
    const st = this.stats;
    st.resNorm = Math.sqrt(rn);
    st.powerBc = powerBc;
    st.powerSrc = powerSrc;
    st.powerReact = powerReact;
    return st;
  }

  /**
   * Crank–Nicolson old part: gOld = (1−α)·[K(θ_old)θ_old − F_bc(θ_old, t_old) − F_src(t_old)].
   * Implemented by assembling with invDt = 0, alpha = (1−α) into R and copying it. Also returns the old boundary/source power.
   */
  oldPart(thetaOld: Float64Array, tOld: number, oneMinusAlpha: number, out: Float64Array): { powerBc: number; powerSrc: number } {
    this.assemble(thetaOld, thetaOld, tOld, 0, oneMinusAlpha, false, null, false);
    out.set(this.R);
    return { powerBc: this.stats.powerBc, powerSrc: this.stats.powerSrc };
  }
}
