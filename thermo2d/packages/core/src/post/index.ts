// Post-processing: interpolation, isotherms, heat flow, metrics, rebar table.
export { locateElement, barycentric, interpolateField, locateMany } from './locate.js';
export { fieldAtTime, lineProfile, isotherm, reducedSection, fieldRange } from './field.js';
export type { LineProfile, ReducedSection } from './field.js';
export { heatFlowAcrossEdges, surfaceTemperatures, uValue, psiValue, fRsi } from './flux.js';
export type { HeatFlowResult, SurfaceTemperatures } from './flux.js';
export { timeToThreshold, probeValueAt, rebarTable, evaluateMetrics, dewPoint, condensationCheck } from './metrics.js';
// lookupReduction lives here too but is exported from the library module (same semantics) to avoid a duplicate export.
export type { RebarRow, MetricResult, CondensationCheck } from './metrics.js';
