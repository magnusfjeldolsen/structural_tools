// Library: material models, built-in materials and curves, time-series import, reduction tables.
export {
  compileMaterial,
  evaluateMaterial,
  evaluateModel,
  interpTable,
  concreteLambda,
  concreteCp,
  concreteCpDry,
  concreteCpPeak,
  concreteDensityRatio,
  steelLambda,
  steelCp,
  timberLambda,
  timberCp,
  timberDensityRatio,
  airLayerResistance,
} from './models.js';
export type { Properties } from './models.js';
export {
  REDUCTION_TABLES,
  KC_SILICEOUS,
  KC_CALCAREOUS,
  KS_HOT_ROLLED,
  KS_COLD_WORKED,
  KS_COMPRESSION,
  KP_COLD_WORKED_A,
  KP_COLD_WORKED_B,
  KP_QUENCHED,
  KY_STRUCTURAL,
  KE_STRUCTURAL,
  lookupReduction,
  getReductionTable,
  ksSteel,
  kcConcrete,
} from './reduction.js';
export { MATERIAL_LIBRARY } from './materials.js';
export {
  CURVE_LIBRARY,
  GENERATORS,
  PARAMETRIC_LIMITS,
  generateCurve,
  seriesFromLibrary,
  sampleTimes,
  iso834,
  externalFire,
  hydrocarbon,
  hcm,
  parametricFire,
  dedupe,
  repeatSeries,
  scaleSeries,
  sumSeries,
  RWS_POINTS,
  RABT_ZTV_ROAD_POINTS,
  RABT_ZTV_RAIL_POINTS,
  ASTM_E119_POINTS,
} from './curves.js';
export type { GeneratorName, Params as CurveParams, Points as SeriesPoints, ParametricFireParams } from './curves.js';
export { parseTimeSeriesText, parseEpw, resample } from './import.js';
export type { ImportOptions, ImportReport, TimeUnit } from './import.js';
export {
  BUILTIN_LIBRARY,
  setActiveLibrary,
  getActiveLibrary,
  searchLibrary,
  getLibraryItem,
  materialFromLibrary,
  libraryHash,
  parseLibraryFile,
  mergeLibraries,
} from './api.js';
export type { LibraryQuery } from './api.js';
