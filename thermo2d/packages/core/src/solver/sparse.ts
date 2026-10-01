/**
 * Sparse symmetric linear algebra for the FEM solver.
 *  - CSR pattern (full symmetric storage) built once from the element connectivity.
 *  - Jacobi-preconditioned conjugate gradients (warm start supported).
 *  - Direct skyline (envelope) Cholesky with reverse Cuthill–McKee ordering.
 * All arrays are typed arrays; nothing is allocated inside solve loops.
 */

export interface CsrPattern {
  n: number;
  rowPtr: Int32Array;
  colIdx: Int32Array;
  /** Slot of the diagonal entry per row. */
  diag: Int32Array;
}

/** Build the symmetric CSR pattern (with diagonal) from triangle connectivity. */
export function buildPattern(n: number, triangles: Uint32Array): CsrPattern {
  const adj: number[][] = new Array(n);
  for (let i = 0; i < n; i++) adj[i] = [i];
  const m = triangles.length / 3;
  for (let e = 0; e < m; e++) {
    const a = triangles[3 * e], b = triangles[3 * e + 1], c = triangles[3 * e + 2];
    adj[a].push(b, c);
    adj[b].push(a, c);
    adj[c].push(a, b);
  }
  const rowPtr = new Int32Array(n + 1);
  let nnz = 0;
  const rows: Int32Array[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = Array.from(new Set(adj[i])).sort((x, y) => x - y);
    rows[i] = Int32Array.from(s);
    nnz += s.length;
    rowPtr[i + 1] = nnz;
  }
  const colIdx = new Int32Array(nnz);
  const diag = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    colIdx.set(rows[i], rowPtr[i]);
    diag[i] = slotOf({ n, rowPtr, colIdx, diag }, i, i);
  }
  return { n, rowPtr, colIdx, diag };
}

/** Slot index of entry (i, j) or -1. Binary search inside the sorted row. */
export function slotOf(p: CsrPattern, i: number, j: number): number {
  let lo = p.rowPtr[i], hi = p.rowPtr[i + 1] - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = p.colIdx[mid];
    if (c === j) return mid;
    if (c < j) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** y = A x for CSR values. */
export function matVec(p: CsrPattern, values: Float64Array, x: Float64Array, y: Float64Array): void {
  const { n, rowPtr, colIdx } = p;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = rowPtr[i], end = rowPtr[i + 1]; k < end; k++) s += values[k] * x[colIdx[k]];
    y[i] = s;
  }
}

export interface LinearSolver {
  readonly name: string;
  /** Prepare for the given matrix values (factorise for direct solvers). Returns false when the matrix is not SPD. */
  prepare(values: Float64Array): boolean;
  /** Solve A x = b; x may hold a warm start. Returns the iteration count (1 for direct), or -1 when not converged. */
  solve(values: Float64Array, b: Float64Array, x: Float64Array): number;
  readonly lastIterations: number;
}

// ---------------------------------------------------------------------------
// Jacobi-preconditioned CG
// ---------------------------------------------------------------------------

export class PcgSolver implements LinearSolver {
  readonly name = 'pcg-jacobi';
  lastIterations = 0;
  private readonly r: Float64Array;
  private readonly z: Float64Array;
  private readonly d: Float64Array;
  private readonly q: Float64Array;
  private readonly invDiag: Float64Array;
  constructor(
    private readonly p: CsrPattern,
    public tolerance = 1e-10,
    public maxIterations = 3000,
  ) {
    const n = p.n;
    this.r = new Float64Array(n);
    this.z = new Float64Array(n);
    this.d = new Float64Array(n);
    this.q = new Float64Array(n);
    this.invDiag = new Float64Array(n);
  }

  prepare(values: Float64Array): boolean {
    const { n, diag } = this.p;
    for (let i = 0; i < n; i++) {
      const v = values[diag[i]];
      if (!(v > 0)) return false;
      this.invDiag[i] = 1 / v;
    }
    return true;
  }

  solve(values: Float64Array, b: Float64Array, x: Float64Array): number {
    const { n } = this.p;
    const { r, z, d, q, invDiag } = this;
    matVec(this.p, values, x, q);
    let bnorm = 0;
    for (let i = 0; i < n; i++) {
      r[i] = b[i] - q[i];
      bnorm += b[i] * b[i];
    }
    bnorm = Math.sqrt(bnorm);
    if (bnorm === 0) {
      x.fill(0);
      this.lastIterations = 0;
      return 0;
    }
    const target = this.tolerance * bnorm;
    let rz = 0;
    for (let i = 0; i < n; i++) {
      z[i] = r[i] * invDiag[i];
      d[i] = z[i];
      rz += r[i] * z[i];
    }
    for (let it = 1; it <= this.maxIterations; it++) {
      matVec(this.p, values, d, q);
      let dq = 0;
      for (let i = 0; i < n; i++) dq += d[i] * q[i];
      if (dq <= 0) {
        this.lastIterations = it;
        return -1;
      }
      const alpha = rz / dq;
      let rnorm = 0;
      for (let i = 0; i < n; i++) {
        x[i] += alpha * d[i];
        r[i] -= alpha * q[i];
        rnorm += r[i] * r[i];
      }
      if (Math.sqrt(rnorm) <= target) {
        this.lastIterations = it;
        return it;
      }
      let rzNew = 0;
      for (let i = 0; i < n; i++) {
        z[i] = r[i] * invDiag[i];
        rzNew += r[i] * z[i];
      }
      const beta = rzNew / rz;
      rz = rzNew;
      for (let i = 0; i < n; i++) d[i] = z[i] + beta * d[i];
    }
    this.lastIterations = this.maxIterations;
    return -1;
  }
}

// ---------------------------------------------------------------------------
// Reverse Cuthill–McKee ordering
// ---------------------------------------------------------------------------

export function reverseCuthillMcKee(p: CsrPattern): Int32Array {
  const { n, rowPtr, colIdx } = p;
  const degree = new Int32Array(n);
  for (let i = 0; i < n; i++) degree[i] = rowPtr[i + 1] - rowPtr[i] - 1;
  const visited = new Uint8Array(n);
  const order = new Int32Array(n);
  let count = 0;
  const queue = new Int32Array(n);
  const nbrs: number[] = [];
  for (let start = 0; start < n; start++) {
    if (visited[start]) continue;
    // pseudo-peripheral start: min degree in this component (cheap, good enough for 2D meshes)
    let root = start;
    // BFS twice from the min-degree node to find a far node
    root = farthestNode(p, minDegreeNode(p, degree, visited, start), visited);
    let head = 0, tail = 0;
    queue[tail++] = root;
    visited[root] = 1;
    while (head < tail) {
      const v = queue[head++];
      order[count++] = v;
      nbrs.length = 0;
      for (let k = rowPtr[v], end = rowPtr[v + 1]; k < end; k++) {
        const w = colIdx[k];
        if (!visited[w]) {
          visited[w] = 1;
          nbrs.push(w);
        }
      }
      nbrs.sort((a, b) => degree[a] - degree[b]);
      for (const w of nbrs) queue[tail++] = w;
    }
  }
  // reverse
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = order[n - 1 - i];
  return perm;
}

function minDegreeNode(p: CsrPattern, degree: Int32Array, visited: Uint8Array, start: number): number {
  // Walk the component of `start` (BFS) to find the min-degree unvisited node.
  const { rowPtr, colIdx } = p;
  const seen = new Set<number>([start]);
  const stack = [start];
  let best = start;
  while (stack.length) {
    const v = stack.pop()!;
    if (degree[v] < degree[best]) best = v;
    for (let k = rowPtr[v], end = rowPtr[v + 1]; k < end; k++) {
      const w = colIdx[k];
      if (!visited[w] && !seen.has(w)) {
        seen.add(w);
        stack.push(w);
      }
    }
  }
  return best;
}

function farthestNode(p: CsrPattern, root: number, visited: Uint8Array): number {
  const { n, rowPtr, colIdx } = p;
  const dist = new Int32Array(n).fill(-1);
  const queue: number[] = [root];
  dist[root] = 0;
  let last = root;
  for (let h = 0; h < queue.length; h++) {
    const v = queue[h];
    last = v;
    for (let k = rowPtr[v], end = rowPtr[v + 1]; k < end; k++) {
      const w = colIdx[k];
      if (!visited[w] && dist[w] < 0) {
        dist[w] = dist[v] + 1;
        queue.push(w);
      }
    }
  }
  return last;
}

// ---------------------------------------------------------------------------
// Skyline Cholesky
// ---------------------------------------------------------------------------

export class SkylineSolver implements LinearSolver {
  readonly name = 'skyline-cholesky-rcm';
  lastIterations = 1;
  private readonly perm: Int32Array; // new -> old
  private readonly invPerm: Int32Array; // old -> new
  private readonly colStart: Int32Array; // first column of each (permuted) row
  private readonly ptr: Int32Array; // start of each row in `sky`
  private readonly sky: Float64Array;
  private readonly slotMap: Int32Array; // CSR slot -> skyline position (or -1 for upper entries)
  private readonly y: Float64Array;
  private readonly bp: Float64Array;
  readonly profile: number;

  constructor(private readonly p: CsrPattern) {
    const { n, rowPtr, colIdx } = p;
    this.perm = reverseCuthillMcKee(p);
    this.invPerm = new Int32Array(n);
    for (let I = 0; I < n; I++) this.invPerm[this.perm[I]] = I;
    this.colStart = new Int32Array(n);
    for (let I = 0; I < n; I++) {
      const i = this.perm[I];
      let c = I;
      for (let k = rowPtr[i], end = rowPtr[i + 1]; k < end; k++) {
        const J = this.invPerm[colIdx[k]];
        if (J < c) c = J;
      }
      this.colStart[I] = c;
    }
    this.ptr = new Int32Array(n + 1);
    for (let I = 0; I < n; I++) this.ptr[I + 1] = this.ptr[I] + (I - this.colStart[I] + 1);
    this.profile = this.ptr[n];
    this.sky = new Float64Array(this.profile);
    this.slotMap = new Int32Array(colIdx.length).fill(-1);
    for (let i = 0; i < n; i++) {
      const I = this.invPerm[i];
      for (let k = rowPtr[i], end = rowPtr[i + 1]; k < end; k++) {
        const J = this.invPerm[colIdx[k]];
        if (J <= I) this.slotMap[k] = this.ptr[I] + (J - this.colStart[I]);
      }
    }
    this.y = new Float64Array(n);
    this.bp = new Float64Array(n);
  }

  prepare(values: Float64Array): boolean {
    const { n } = this.p;
    const { sky, slotMap, ptr, colStart } = this;
    sky.fill(0);
    for (let k = 0; k < slotMap.length; k++) {
      const s = slotMap[k];
      if (s >= 0) sky[s] = values[k];
    }
    for (let I = 0; I < n; I++) {
      const cI = colStart[I];
      const pI = ptr[I] - cI; // sky[pI + k] = L[I][k]
      for (let J = cI; J < I; J++) {
        const cJ = colStart[J];
        const pJ = ptr[J] - cJ;
        const kStart = cI > cJ ? cI : cJ;
        let s = sky[pI + J];
        for (let k = kStart; k < J; k++) s -= sky[pI + k] * sky[pJ + k];
        sky[pI + J] = s / sky[pJ + J];
      }
      let d = sky[pI + I];
      for (let k = cI; k < I; k++) d -= sky[pI + k] * sky[pI + k];
      if (!(d > 0)) return false;
      sky[pI + I] = Math.sqrt(d);
    }
    return true;
  }

  solve(_values: Float64Array, b: Float64Array, x: Float64Array): number {
    const { n } = this.p;
    const { sky, ptr, colStart, perm, y, bp } = this;
    for (let I = 0; I < n; I++) bp[I] = b[perm[I]];
    // forward: L y = bp
    for (let I = 0; I < n; I++) {
      const cI = colStart[I];
      const pI = ptr[I] - cI;
      let s = bp[I];
      for (let k = cI; k < I; k++) s -= sky[pI + k] * y[k];
      y[I] = s / sky[pI + I];
    }
    // backward: L^T x = y (column oriented)
    for (let I = n - 1; I >= 0; I--) {
      const cI = colStart[I];
      const pI = ptr[I] - cI;
      const xi = y[I] / sky[pI + I];
      y[I] = xi;
      for (let k = cI; k < I; k++) y[k] -= sky[pI + k] * xi;
    }
    for (let I = 0; I < n; I++) x[perm[I]] = y[I];
    this.lastIterations = 1;
    return 1;
  }
}
