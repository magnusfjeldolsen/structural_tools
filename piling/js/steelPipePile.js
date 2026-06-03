/**
 * SteelPipePile ("stålrørspel") — reusable model of a driven steel pipe pile.
 *
 * Encapsulates the pile cross-section, material, and derived section/material
 * properties that are INDEPENDENT of pile type (rock-tip, soil-tip, friction…).
 * Each pile-type calculator combines an instance of this class with its own
 * resistance/driving model.
 *
 * Extracted from piling/tip-bearing-on-rock.html — the formulas below mirror
 * that page's calc() exactly so behaviour is preserved.
 *
 * UNITS (engineering inputs in, SI out):
 *   - D, t supplied in millimetres (matching the Kynningsrud catalogue)
 *   - material.fyk in MPa, material.E in GPa, material.rho in kg/m³
 *   - getters return SI (m, m², m⁴, Pa, m/s) unless the name says otherwise
 *
 * References: Peleveiledningen 2019 (4.6/4.7 driving, Tab. 4-13 material
 * constants); NS-EN 1993-1-1 (cross-section class, γ_M0); Kynningsrud
 * stålrør dimension table.
 */
export class SteelPipePile {
  /**
   * Kynningsrud catalogue: outer diameter D [mm] → available wall thicknesses t [mm].
   * (Object keys are strings; use the static helpers to read it in sorted order.)
   */
  static CATALOG = {
    '323.9': [5.0, 8.0, 10.0, 12.5],
    '406.4': [5.0, 8.0, 10.0, 12.5],
    '508':   [5.0, 6.3, 8.0, 10.0, 12.5],
    '610':   [6.3, 8.0, 10.0, 12.5],
    '711':   [6.3, 8.0, 8.8, 10.0, 12.5, 14.2],
    '813':   [6.3, 8.0, 8.8, 10.0, 12.5, 14.2, 16.0],
    '914':   [8.0, 10.0, 12.5, 14.2, 16.0],
    '1016':  [8.0, 10.0, 12.5, 14.2, 16.0],
    '1220':  [10.0, 12.5, 14.2],
  };

  /** Default steel material (S355, NS-EN 1993 / Peleveiledningen Tab. 4-13). */
  static STEEL_DEFAULT = Object.freeze({ fyk: 355, E: 210, rho: 7850, gammaM0: 1.05 });

  /**
   * @param {object}  opts
   * @param {number}  opts.D         outer diameter [mm]
   * @param {number}  opts.t         wall thickness [mm]
   * @param {object} [opts.material] { fyk [MPa], E [GPa], rho [kg/m³], gammaM0 }
   */
  constructor({ D, t, material = SteelPipePile.STEEL_DEFAULT } = {}) {
    if (!(D > 0) || !(t > 0)) throw new Error('SteelPipePile: D and t must be positive (mm)');
    if (2 * t >= D) throw new Error('SteelPipePile: wall thickness too large for diameter');
    this.D = D;                 // mm
    this.t = t;                 // mm
    this.material = { ...SteelPipePile.STEEL_DEFAULT, ...material };
  }

  // ── catalogue helpers ────────────────────────────────────────────────────
  /** Outer diameters available in the catalogue, sorted ascending [mm]. */
  static availableDiameters() {
    return Object.keys(SteelPipePile.CATALOG).map(Number).sort((a, b) => a - b);
  }
  /** Wall thicknesses available for a given outer diameter [mm] (empty if unknown). */
  static thicknessesFor(D) {
    return SteelPipePile.CATALOG[String(D)] ?? [];
  }

  // ── geometry ─────────────────────────────────────────────────────────────
  get D_m() { return this.D / 1000; }                       // m
  get t_m() { return this.t / 1000; }                       // m
  get innerDiameter_m() { return this.D_m - 2 * this.t_m; } // m

  /** Cross-sectional steel area A = π·t·(D−t) [m²] (thin-wall, matches calc()). */
  get area() { return Math.PI * this.t_m * (this.D_m - this.t_m); }
  get area_cm2() { return this.area * 1e4; }
  get area_mm2() { return this.area * 1e6; }

  /** Second moment of area of the hollow circular section I = π/64·(D⁴ − Dᵢ⁴) [m⁴]. */
  get secondMomentOfArea() {
    return (Math.PI / 64) * (this.D_m ** 4 - this.innerDiameter_m ** 4);
  }

  // ── mass ─────────────────────────────────────────────────────────────────
  /** Mass per metre = ρ·A [kg/m] (the catalogue weight). */
  get massPerMetre() { return this.material.rho * this.area; }
  /** Total pile mass for a driven length [kg]. m_pel = ρ·A·l */
  mass(length_m) { return this.massPerMetre * length_m; }

  // ── material / strength ──────────────────────────────────────────────────
  /** Design yield strength f_yd = f_yk/γ_M0 [Pa]. */
  get fyd() { return (this.material.fyk * 1e6) / this.material.gammaM0; }
  get fyd_MPa() { return this.fyd / 1e6; }

  // ── cross-section classification (NS-EN 1993-1-1, CHS) ────────────────────
  /** ε = √(235/f_yk), f_yk in MPa. */
  get epsilon() { return Math.sqrt(235 / this.material.fyk); }
  /** Slenderness D/t (dimensionless). */
  get slenderness() { return this.D / this.t; }
  /** Class-3 limit 90·ε² for circular hollow sections. */
  get classLimit() { return 90 * this.epsilon ** 2; }
  /** True if D/t ≤ 90·ε² (section is at most class 3). */
  get sectionClassOK() { return this.slenderness <= this.classLimit; }

  // ── one-dimensional stress-wave properties (driving) ─────────────────────
  /** Stress-wave speed c = √(E/ρ) [m/s] (Peleveiledningen 4-50). */
  get waveSpeed() { return Math.sqrt((this.material.E * 1e9) / this.material.rho); }
  /** Acoustic impedance z = ρ·c·A [N·s/m] (= A·E/c). */
  get impedance() { return this.material.rho * this.waveSpeed * this.area; }
}
