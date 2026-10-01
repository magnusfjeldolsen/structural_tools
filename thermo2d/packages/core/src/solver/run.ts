/**
 * Time stepping, Newton iteration and result collection.
 * Modes: transient (backward Euler / Crank–Nicolson), steady, periodic.
 */
import type { Analysis } from '../model/types.js';
import { locateMany } from '../post/locate.js';
import { FemSystem } from './assembly.js';
import { PcgSolver, SkylineSolver, type LinearSolver } from './sparse.js';
import type { Run, RunOptions, RunProgress, RunResult, Snapshot, SolveInput } from './types.js';

const EPS_T = 1e-9;
const PCG_SWITCH_ITERATIONS = 300;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

class RunImpl implements Run {
  readonly sys: FemSystem;
  readonly theta: Float64Array;
  private readonly thetaOld: Float64Array;
  private readonly thetaPrev: Float64Array;
  private dtPrev = 0;
  private readonly thetaStart: Float64Array;
  private readonly delta: Float64Array;
  private readonly rhs: Float64Array;
  private readonly gOld: Float64Array | null;
  private readonly analysis: Analysis;
  private readonly alpha: number;
  private readonly linear: boolean;
  private pcg: PcgSolver | null = null;
  private direct: SkylineSolver | null = null;
  private solver: LinearSolver;
  private solverName: string;
  private jValid = false;
  private jDt = -1;
  t = 0;
  done = false;
  private dtCur: number;
  private nextOutputIndex = 1;
  private times: number[] = [];
  private fields: Float32Array[] = [];
  private readonly probeEl: Int32Array;
  private readonly probeW: Float64Array;
  private probeTimes: number[] = [];
  private probeVals: number[][];
  private boundaryIn = 0;
  private sourceIn = 0;
  private oldPowerBc = 0;
  private oldPowerSrc = 0;
  private steps = 0;
  private rejected = 0;
  private newtonTotal = 0;
  private wall = 0;
  private cycles = 0;
  private thetaPrevCycle: Float64Array | null = null;
  private lastNewtonIters = 0;
  readonly warnings: string[] = [];
  private nonConverged = 0;
  progress: RunProgress = { t: 0, fraction: 0, step: 0 };

  constructor(readonly input: SolveInput) {
    const t0 = now();
    this.sys = new FemSystem(input);
    const n = this.sys.n;
    this.analysis = input.analysis;
    const an = this.analysis;
    if (!(an.dt > 0) && an.mode !== 'steady') throw new Error('The time step must be greater than zero.');
    if (!(an.duration > 0) && an.mode !== 'steady') throw new Error('The duration must be greater than zero.');
    this.theta = new Float64Array(n);
    if (input.initialField) {
      if (input.initialField.length !== n) throw new Error(`Initial field has ${input.initialField.length} values but the mesh has ${n} nodes.`);
      this.theta.set(input.initialField);
    } else this.theta.fill(an.initialTemperature);
    this.thetaOld = Float64Array.from(this.theta);
    this.thetaPrev = Float64Array.from(this.theta);
    this.thetaStart = Float64Array.from(this.theta);
    this.delta = new Float64Array(n);
    this.rhs = new Float64Array(n);
    this.alpha = an.mode !== 'steady' && an.timeIntegration === 'crank-nicolson' ? 0.5 : 1;
    this.gOld = this.alpha < 1 ? new Float64Array(n) : null;
    this.linear = this.sys.linearMaterials && !this.sys.hasRadiation;
    this.dtCur = an.dt;
    if (an.mode === 'steady' || this.linear) {
      // steady: one factorisation; linear transient: factorise once per Δt and reuse for every step
      this.direct = new SkylineSolver(this.sys.pattern);
      this.solver = this.direct;
      this.solverName = this.direct.name;
    } else {
      this.pcg = new PcgSolver(this.sys.pattern);
      this.solver = this.pcg;
      this.solverName = this.pcg.name;
    }
    const loc = locateMany(input.mesh, input.probes.map((p) => p.position));
    this.probeEl = loc.element;
    this.probeW = loc.weights;
    this.probeVals = input.probes.map(() => []);
    if (an.mode !== 'steady') {
      this.snapshot(0);
      this.recordProbes(0);
    }
    this.wall += now() - t0;
  }

  // ---------------------------------------------------------------- helpers

  private snapshot(t: number): void {
    this.times.push(t);
    this.fields.push(Float32Array.from(this.theta));
  }

  private recordProbes(t: number): void {
    this.probeTimes.push(t);
    const tri = this.input.mesh.triangles;
    for (let p = 0; p < this.probeEl.length; p++) {
      const e = this.probeEl[p];
      if (e < 0) {
        this.probeVals[p].push(NaN);
        continue;
      }
      const w = this.probeW;
      this.probeVals[p].push(w[3 * p] * this.theta[tri[3 * e]] + w[3 * p + 1] * this.theta[tri[3 * e + 1]] + w[3 * p + 2] * this.theta[tri[3 * e + 2]]);
    }
  }

  private switchToDirect(reason: string): void {
    if (!this.direct) this.direct = new SkylineSolver(this.sys.pattern);
    if (this.solver !== this.direct) {
      this.solver = this.direct;
      this.solverName = `${this.pcg?.name ?? 'pcg'}→${this.direct.name}`;
      this.jValid = false;
      this.warnings.push(`Switched to the direct solver (${reason}).`);
    }
  }

  /**
   * Newton iteration for the state at tNew. Returns true when converged.
   * invDt = 0 → steady state. Leaves sys.stats at the last evaluated residual.
   */
  private newton(dtTry: number, tNew: number, invDt: number, maxIt: number): boolean {
    const { sys, theta, thetaOld, delta, rhs } = this;
    const n = sys.n;
    const tol = this.analysis.tolerance;
    const alpha = invDt > 0 ? this.alpha : 1;
    if (invDt > 0 && this.dtPrev > 0) {
      // linear predictor from the previous step (saves a Newton iteration on smooth problems)
      const f = Math.min(2, dtTry / this.dtPrev);
      const prev = this.thetaPrev;
      for (let i = 0; i < n; i++) theta[i] = thetaOld[i] + f * (thetaOld[i] - prev[i]);
    } else theta.set(thetaOld);
    sys.setFixed(theta, tNew);
    let res0 = -1, prevRes = Infinity, lastMaxD = Infinity, damp = 0;
    let iters = 0;
    let converged = false;
    for (let it = 0; it <= maxIt; it++) {
      const wantJ = !(this.linear && this.jValid && this.jDt === dtTry);
      const st = sys.assemble(theta, thetaOld, tNew, invDt, alpha, wantJ, invDt > 0 ? this.gOld : null);
      const res = st.resNorm;
      if (it === 0) {
        res0 = res;
        if (res0 <= 1e-10) {
          converged = true;
          break;
        }
      }
      if (res <= tol.residual * res0 || (it > 0 && lastMaxD < tol.deltaTheta && res <= 1e-2 * res0)) {
        converged = true;
        break;
      }
      if (it > 0 && res > prevRes && damp < 4) {
        // diverging: keep half of the last update and re-evaluate
        for (let i = 0; i < n; i++) {
          delta[i] *= 0.5;
          theta[i] -= delta[i];
        }
        lastMaxD *= 0.5;
        damp++;
        continue;
      }
      if (it === maxIt) break;
      prevRes = res;
      damp = 0;
      if (wantJ) {
        let ok = this.solver.prepare(sys.values);
        if (!ok && this.solver === this.pcg) {
          this.switchToDirect('the system was not positive definite for CG');
          ok = this.solver.prepare(sys.values);
        }
        if (!ok) throw new Error('The system matrix is not positive definite; check materials (λ, ρ, cp must be positive) and boundary conditions.');
        if (this.linear) {
          this.jValid = true;
          this.jDt = dtTry;
        }
      }
      for (let i = 0; i < n; i++) rhs[i] = -sys.R[i];
      delta.fill(0);
      let k = this.solver.solve(sys.values, rhs, delta);
      if (k < 0) {
        this.switchToDirect('CG did not converge');
        if (!this.solver.prepare(sys.values)) throw new Error('The system matrix is not positive definite.');
        delta.fill(0);
        k = this.solver.solve(sys.values, rhs, delta);
      } else if (this.solver === this.pcg && k > PCG_SWITCH_ITERATIONS) {
        this.switchToDirect(`CG needed ${k} iterations per solve`);
      }
      lastMaxD = 0;
      for (let i = 0; i < n; i++) {
        theta[i] += delta[i];
        const a = Math.abs(delta[i]);
        if (a > lastMaxD) lastMaxD = a;
      }
      iters++;
    }
    this.lastNewtonIters = iters;
    this.newtonTotal += iters;
    return converged;
  }

  private solveSteady(): void {
    const ok = this.newton(0, 0, 0, Math.max(this.analysis.maxNewtonIterations, 50));
    if (!ok) this.warnings.push('The steady-state iteration did not fully converge; check materials and boundary conditions.');
    this.thetaOld.set(this.theta);
    this.snapshot(0);
    this.recordProbes(0);
    const st = this.sys.stats;
    this.boundaryIn = st.powerBc + st.powerReact;
    this.sourceIn = st.powerSrc;
    this.steps = 1;
  }

  private outputTime(): number {
    const an = this.analysis;
    const interval = an.outputInterval > 0 ? an.outputInterval : an.duration;
    return Math.min(this.nextOutputIndex * interval, an.duration);
  }

  step(): boolean {
    if (this.done) return false;
    const t0 = now();
    const an = this.analysis;
    if (an.mode === 'steady') {
      this.solveSteady();
      this.done = true;
      this.progress = { t: 0, fraction: 1, step: 1 };
      this.wall += now() - t0;
      return false;
    }
    const { sys, theta, thetaOld } = this;
    const target = this.outputTime();
    let dtTry = Math.min(this.dtCur, target - this.t);
    if (dtTry <= EPS_T) {
      this.nextOutputIndex++;
      this.wall += now() - t0;
      return !this.done;
    }
    sys.cacheOldEnthalpy(thetaOld);
    if (this.gOld) {
      const old = sys.oldPart(thetaOld, this.t, 1 - this.alpha, this.gOld);
      this.oldPowerBc = old.powerBc;
      this.oldPowerSrc = old.powerSrc;
    }
    const ad = an.adaptive;
    let rejectedThisStep = false;
    for (;;) {
      const ok = this.newton(dtTry, this.t + dtTry, 1 / dtTry, an.maxNewtonIterations);
      let maxChange = 0;
      for (let i = 0; i < sys.n; i++) {
        const a = Math.abs(theta[i] - thetaOld[i]);
        if (a > maxChange) maxChange = a;
      }
      const tooBig = ad.enabled && maxChange > ad.maxDeltaPerStep;
      if (ok && !tooBig) break;
      if (ad.enabled && dtTry > ad.minDt + EPS_T) {
        dtTry = Math.max(ad.minDt, dtTry / 2);
        rejectedThisStep = true;
        this.rejected++;
        continue;
      }
      if (!ok) {
        this.nonConverged++;
        if (this.nonConverged <= 3) this.warnings.push(`Newton did not converge at t = ${(this.t + dtTry).toFixed(1)} s; the step was accepted anyway.`);
        if (this.nonConverged === 4) this.warnings.push('Further non-converged steps are not listed.');
      } else if (ad.enabled && this.nonConverged === 0 && this.rejected === 1) {
        this.warnings.push('The adaptive time step reached its minimum.');
      }
      break;
    }
    // accept
    const st = sys.stats;
    const a = this.alpha;
    this.boundaryIn += dtTry * (a * st.powerBc + (1 - a) * this.oldPowerBc + st.powerReact);
    this.sourceIn += dtTry * (a * st.powerSrc + (1 - a) * this.oldPowerSrc);
    this.t += dtTry;
    this.thetaPrev.set(thetaOld);
    this.dtPrev = dtTry;
    thetaOld.set(theta);
    this.steps++;
    this.recordProbes(this.t);
    if (this.t >= target - EPS_T) {
      this.t = target;
      this.snapshot(this.t);
      this.nextOutputIndex++;
    }
    if (ad.enabled) {
      if (rejectedThisStep) this.dtCur = dtTry;
      else if (this.lastNewtonIters <= 3) this.dtCur = Math.min(an.dt, this.dtCur * 1.5);
    }
    if (this.t >= an.duration - EPS_T) {
      if (an.mode === 'periodic') this.endCycle();
      else this.done = true;
    }
    const frac = an.mode === 'periodic' ? Math.min(1, (this.cycles + this.t / an.duration) / Math.max(1, an.periodic?.maxCycles ?? 10)) : this.t / an.duration;
    this.progress = { t: this.t, fraction: this.done ? 1 : frac, step: this.steps, message: an.mode === 'periodic' ? `cycle ${this.cycles + 1}` : undefined };
    this.wall += now() - t0;
    return !this.done;
  }

  private endCycle(): void {
    const an = this.analysis;
    const maxCycles = an.periodic?.maxCycles ?? 10;
    const tolerance = an.periodic?.tolerance ?? 0.05;
    this.cycles++;
    let diff = Infinity;
    if (this.thetaPrevCycle) {
      diff = 0;
      for (let i = 0; i < this.sys.n; i++) {
        const d = Math.abs(this.theta[i] - this.thetaPrevCycle[i]);
        if (d > diff) diff = d;
      }
    }
    if (diff < tolerance || this.cycles >= maxCycles) {
      if (diff >= tolerance) this.warnings.push(`Periodic state not reached after ${this.cycles} cycles (max change ${diff.toFixed(2)} K between cycles).`);
      this.done = true;
      return;
    }
    this.thetaPrevCycle = Float64Array.from(this.theta);
    this.t = 0;
    this.nextOutputIndex = 1;
    this.times = [];
    this.fields = [];
    this.probeTimes = [];
    this.probeVals = this.input.probes.map(() => []);
    this.thetaStart.set(this.theta);
    this.boundaryIn = 0;
    this.sourceIn = 0;
    this.snapshot(0);
    this.recordProbes(0);
  }

  get snapshotCount(): number {
    return this.times.length;
  }

  snapshotAt(i: number): Snapshot {
    return { t: this.times[i], theta: this.fields[i] };
  }

  result(): RunResult {
    const { sys, analysis: an } = this;
    const stored = sys.storedEnthalpy(this.theta) - sys.storedEnthalpy(this.thetaStart);
    const isSteady = an.mode === 'steady';
    const imbalance = isSteady
      ? Math.abs(this.boundaryIn + this.sourceIn) / Math.max(Math.abs(sys.stats.powerBc) + Math.abs(sys.stats.powerReact) + Math.abs(sys.stats.powerSrc), 1e-9)
      : Math.abs(stored - this.boundaryIn - this.sourceIn) / Math.max(Math.abs(stored), Math.abs(this.boundaryIn), Math.abs(this.sourceIn), 1e-9);
    const warnings = this.warnings.slice();
    // material range check over the stored fields
    const regionMin = new Float64Array(sys.materials.length).fill(Infinity);
    const regionMax = new Float64Array(sys.materials.length).fill(-Infinity);
    const mesh = this.input.mesh;
    for (const f of this.fields) {
      for (let e = 0; e < sys.m; e++) {
        const r = mesh.elementRegion[e];
        for (let k = 0; k < 3; k++) {
          const v = f[mesh.triangles[3 * e + k]];
          if (v < regionMin[r]) regionMin[r] = v;
          if (v > regionMax[r]) regionMax[r] = v;
        }
      }
    }
    sys.materials.forEach((mt, r) => {
      const [lo, hi] = mt.validRange;
      if (regionMin[r] < lo - 1e-6 || regionMax[r] > hi + 1e-6)
        warnings.push(`Material "${mt.name}" (region "${mesh.regions[r].id}") was used outside its valid range ${lo}–${hi} °C (reached ${regionMin[r].toFixed(0)}–${regionMax[r].toFixed(0)} °C).`);
    });
    return {
      analysisId: an.id,
      scenarioId: null,
      mode: an.mode,
      mesh,
      times: this.times.slice(),
      fields: this.fields.slice(),
      probes: this.input.probes.map((p, i) => ({ id: p.id, position: p.position, found: this.probeEl[i] >= 0, element: this.probeEl[i] })),
      probeTimes: Float64Array.from(this.probeTimes),
      probeValues: this.probeVals.map((v) => Float64Array.from(v)),
      energy: { storedChange: stored, boundaryIn: this.boundaryIn, sourceIn: this.sourceIn, relativeImbalance: imbalance },
      stats: {
        steps: this.steps,
        rejectedSteps: this.rejected,
        newtonIterations: this.newtonTotal,
        wallTimeMs: this.wall,
        linearSolver: this.solverName,
        nodeCount: sys.n,
        elementCount: sys.m,
        cycles: an.mode === 'periodic' ? this.cycles : undefined,
      },
      warnings,
    };
  }
}

export function createRun(input: SolveInput): Run {
  return new RunImpl(input);
}

/** Run to completion (or until cancelled) and return the result. */
export function runToEnd(input: SolveInput, opts: RunOptions = {}): RunResult {
  const run = new RunImpl(input);
  let emitted = 0;
  const emit = () => {
    if (!opts.onSnapshot) return;
    if (emitted > run.snapshotCount) emitted = 0; // periodic mode restarted a cycle
    while (emitted < run.snapshotCount) opts.onSnapshot(run.snapshotAt(emitted++));
  };
  emit();
  while (!run.done) {
    if (opts.shouldCancel?.()) break;
    run.step();
    opts.onProgress?.(run.progress);
    emit();
  }
  return run.result();
}
