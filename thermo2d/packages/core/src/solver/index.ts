// Solver: FEM on linear triangles, Newton + implicit stepping, own sparse linear algebra.
export { createRun, runToEnd } from './run.js';
export { compileSeries, constantSeries } from './series.js';
export { constantMaterial, tableMaterial, concreteEn1992Rows, steelEn1993Rows } from './material.js';
export { FemSystem } from './assembly.js';
export { buildPattern, PcgSolver, SkylineSolver, reverseCuthillMcKee, matVec } from './sparse.js';
export type { CsrPattern, LinearSolver } from './sparse.js';
