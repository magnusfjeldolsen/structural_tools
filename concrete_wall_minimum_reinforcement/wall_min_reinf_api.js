/**
 * Minimum reinforcement for concrete walls — pure calculation layer.
 *
 * NS-EN 1992-1-1 §7.3.2, §7.3.3, §7.3.4, §9.6 with the Norwegian National Annex,
 * plus NS-EN 1992-3 for watertight walls.
 *
 * No DOM access, no side effects. See SPEC.md for the contract this implements.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WallMinReinf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ES = 200000;                                     // steel modulus [MPa]
  const BAR_DIAMETERS = [8, 10, 12, 16, 20, 25, 32];
  const SPACINGS = [75, 100, 125, 150, 200, 250, 300, 400];

  /** EC2 Table 7.2N — maximum bar diameter phi*s [mm] for crack control. */
  const T72N_SIGMA = [160, 200, 240, 280, 320, 360, 400, 450];
  const T72N = {
    0.4: [40, 32, 20, 16, 12, 10, 8, 6],
    0.3: [32, 25, 16, 12, 10, 8, 6, 5],
    0.2: [25, 16, 12, 8, 6, 5, 4, null]
  };
  const T72N_WK = [0.2, 0.3, 0.4];

  /** EN 1992-3 Table L.1 — restraint at the top of a wall cast on a base. */
  const TABLE_L1 = [[1, 0], [2, 0], [3, 0.05], [4, 0.30], [8, 0.50]];
  const R_BASE = 0.5;

  const CEMENT_S = { R: 0.20, N: 0.25, S: 0.38 };

  const area = (dia, spacing) => (1000 / spacing) * Math.PI * dia * dia / 4;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (x, x0, x1, y0, y1) => (x1 === x0 ? y0 : y0 + (x - x0) / (x1 - x0) * (y1 - y0));

  // ---------------------------------------------------------------- materials

  /** EC2 Table 3.1 — mean axial tensile strength. Matches EC2ConcreteUtils.calculateFctm. */
  function fctmOf(fck) {
    return fck <= 50 ? 0.30 * Math.pow(fck, 2 / 3) : 2.12 * Math.log(1 + (fck + 8) / 10);
  }

  /** EC2 (3.2) + (3.4) — tensile strength at age t. */
  function fctmAt(fck, days, cementClass) {
    const fctm = fctmOf(fck);
    if (!days || days >= 28) return { value: fctm, betaCc: 1 };
    const s = CEMENT_S[cementClass] || CEMENT_S.N;
    const betaCc = Math.exp(s * (1 - Math.sqrt(28 / days)));
    return { value: Math.pow(betaCc, 1) * fctm, betaCc };            // alpha = 1 for t < 28 d
  }

  const ecmOf = (fck) => 22000 * Math.pow((fck + 8) / 10, 0.3);

  // ------------------------------------------------------- Table 7.2N inverse

  /**
   * Build the phi*s(sigma_s) curve at an arbitrary wk by interpolating between the
   * tabulated columns. Rows where a bracketing column has no value are dropped.
   */
  function t72nColumn(wk) {
    if (wk < T72N_WK[0] - 1e-9 || wk > T72N_WK[T72N_WK.length - 1] + 1e-9) return null;
    let lo = T72N_WK[0], hi = T72N_WK[T72N_WK.length - 1];
    for (let i = 0; i < T72N_WK.length - 1; i++) {
      if (wk >= T72N_WK[i] - 1e-9 && wk <= T72N_WK[i + 1] + 1e-9) { lo = T72N_WK[i]; hi = T72N_WK[i + 1]; break; }
    }
    const a = T72N[lo], b = T72N[hi];
    const pts = [];
    for (let i = 0; i < T72N_SIGMA.length; i++) {
      if (a[i] == null || b[i] == null) continue;
      pts.push({ sigma: T72N_SIGMA[i], phi: lo === hi ? a[i] : lerp(wk, lo, hi, a[i], b[i]) });
    }
    return pts;
  }

  /**
   * Invert Table 7.2N: the steel stress permitted for a bar of adjusted size phiReq.
   * Never clamps silently — a request below the table's stress range is refused, because
   * pinning sigma_s at 160 MPa there would understate the reinforcement.
   */
  function sigmaFromTable(phiReq, wk, fyk) {
    const pts = t72nColumn(wk);
    if (!pts || pts.length < 2) return { status: 'wkOutOfRange' };
    if (phiReq > pts[0].phi) return { status: 'outOfTable' };
    const last = pts[pts.length - 1];
    if (phiReq <= last.phi) {
      return { status: 'capped', sigmaS: Math.min(last.sigma, fyk) };
    }
    for (let i = 0; i < pts.length - 1; i++) {
      if (phiReq <= pts[i].phi && phiReq >= pts[i + 1].phi) {
        const s = lerp(phiReq, pts[i].phi, pts[i + 1].phi, pts[i].sigma, pts[i + 1].sigma);
        return { status: 'ok', sigmaS: Math.min(s, fyk) };
      }
    }
    return { status: 'outOfTable' };
  }

  // ------------------------------------------------------------ buildability

  function buildability(ccMax) {
    if (!isFinite(ccMax) || ccMax <= 0) return 'unbuildable';
    if (ccMax < 75) return 'unbuildable';
    if (ccMax < 100) return 'tight';
    return 'ok';
  }

  // -------------------------------------------------------------- main entry

  function calculate(raw) {
    const inp = normalise(raw);
    const warnings = [];
    const checks = [];

    const t = inp.t;
    const Ac = 1000 * t;
    const layers = inp.layers;

    // --- materials
    const fctm = fctmOf(inp.fck);
    const { value: fctEff, betaCc } = fctmAt(inp.fck, inp.crackAgeDays, inp.cementClass);
    const Ecm = ecmOf(inp.fck);
    const alphaE = ES / Ecm;

    if (inp.crackAgeDays < 28) {
      warnings.push('fct,eff is taken as fctm(' + inp.crackAgeDays + ' d) = ' + fctEff.toFixed(2) +
        ' MPa per 7.3.2(2). Several National Annexes impose a floor on fct,eff for early-age ' +
        'restraint — confirm against NA:2010 before relying on this reduction.');
    }

    // --- detailing, §9.6 + NA.9.6.3
    const AsVMin = 0.002 * Ac / layers;
    const AsVMax = 0.04 * Ac;
    const sVMax = Math.min(3 * t, 400);
    const sHMax = 400;
    const AsVProv = area(inp.vBar.dia, inp.vBar.spacing);
    const kNA = inp.kNaOverride != null ? inp.kNaOverride : (inp.exposureSide === 'exterior' ? 0.30 : 0.15);
    const naLeg = kNA * Ac * fctm / inp.fyk;
    const quarterLeg = 0.25 * AsVProv;
    const AsHMin = layers === 2
      ? Math.max(quarterLeg, naLeg)
      : Math.max(quarterLeg, 2 * naLeg);
    const AsHMinLeg = (layers === 2 ? naLeg : 2 * naLeg) >= quarterLeg ? 'NA.9.6.3' : '25 % of As,v';

    const AsVTotal = AsVProv * layers;
    const linksNeeded = AsVTotal > 0.02 * Ac;
    const linksWaived = inp.vBar.dia <= 16 && inp.cover > 2 * inp.vBar.dia;

    // --- crack control, §7.3.2
    const wkInfo = targetWk(inp, t);
    const kc = inp.kcMode === 'pureTension' ? 1.0 : inp.kcMode === 'house' ? 0.6 : inp.kcCustom;
    const k = inp.kMode === 'external' ? 1.0 : clamp(lerp(t, 300, 800, 1.0, 0.65), 0.65, 1.0);
    const Act = Ac;
    const AsFloor = kc * k * fctEff * Act / (inp.fyk * layers);
    const crackActive = inp.crackReq !== 'none' && wkInfo.wk != null;

    const bars = [];
    const barsDirect = [];
    if (crackActive) {
      for (const dia of BAR_DIAMETERS) {
        bars.push(simplifiedBar(dia, inp, { t, Act, kc, k, fctEff, AsFloor, wk: wkInfo.wk, sHMax }));
        barsDirect.push(directBar(dia, inp, { t, Act, kc, k, fctEff, alphaE, AsFloor, wk: wkInfo.wk, sHMax }));
      }
    }

    // --- what governs, for the selected bar
    const tableCovers = crackActive && wkInfo.wk >= 0.2 - 1e-9 && wkInfo.wk <= 0.4 + 1e-9;
    const methodEffective = (crackActive && !tableCovers) ? 'direct' : inp.method;
    if (crackActive && !tableCovers) {
      warnings.push('wk = ' + fmt(wkInfo.wk, 3) + ' mm lies outside Table 7.2N, which only spans ' +
        '0,20 to 0,40 mm. The simplified route of 7.3.3 cannot answer here, so the tool has switched ' +
        'to the direct calculation of 7.3.4. EN 1992-3 Figure 7.103N extends the tabulated route below ' +
        '0,20 mm; it is not reproduced here.');
    }
    const source = methodEffective === 'direct' ? barsDirect : bars;
    const alt = methodEffective === 'direct' ? bars : barsDirect;
    const sel = source.find(b => b.dia === inp.selectedDia) || source[0] || null;
    const selAlt = alt.find(b => b.dia === inp.selectedDia) || null;
    const blocked = crackActive && sel && (sel.status === 'outOfTable' || sel.status === 'unreachable' || sel.status === 'wkOutOfRange');
    const crackAs = sel && !blocked ? sel.AsReq : null;

    const detailCc = AsHMin > 0 ? Math.min(1000 * Math.PI * Math.pow(inp.selectedDia, 2) / 4 / AsHMin, sHMax) : sHMax;
    let hGov;
    if (blocked) {
      // The chosen bar cannot satisfy the crack requirement by this route. Reporting the
      // detailing minimum here would read as an answer; it is not one.
      hGov = { As: null, clause: 'no valid answer for ø' + inp.selectedDia, dia: inp.selectedDia,
               ccMax: null, blocked: true, blockReason: sel.status, detailingAs: AsHMin };
    } else if (crackAs != null && crackAs > AsHMin) {
      hGov = { As: crackAs, clause: '7.3.2 (crack)', dia: sel.dia, ccMax: sel.ccMax,
               ratio: crackAs / AsHMin, blocked: false };
    } else {
      hGov = { As: AsHMin, clause: AsHMinLeg, dia: inp.selectedDia, ccMax: detailCc, ratio: 1, blocked: false };
    }
    hGov.altAs = selAlt && selAlt.AsReq != null ? selAlt.AsReq : null;
    hGov.altRoute = inp.method === 'direct' ? 'simplified' : 'direct';

    const vCrack = inp.restrainedTopBottom && crackActive && crackAs != null ? crackAs : null;
    const vGov = vCrack != null && vCrack > AsVMin
      ? { As: vCrack, clause: '7.3.2 (crack, restrained top and bottom)' }
      : { As: AsVMin, clause: '9.6.2(1)' };

    // --- restrained zone height
    const zone = zoneHeight(inp, t);

    // --- checks
    pushChecks(checks, {
      inp, t, Ac, layers, AsVMin, AsVMax, AsVProv, AsVTotal, sVMax, sHMax,
      AsHMin, linksNeeded, linksWaived, crackActive, wkInfo, sel, selAlt, hGov, AsFloor, zone,
      methodEffective
    });

    if (crackActive && wkInfo.wk < 0.2) {
      warnings.push('wk = ' + wkInfo.wk.toFixed(3) + ' mm is below the range of Table 7.2N. ' +
        'The simplified route of 7.3.3 cannot answer this — use the direct calculation to 7.3.4.');
    }
    if (crackActive && layers === 1) {
      warnings.push('A single central layer sits t/2 from the surface, so eq. (7.7N) penalises it ' +
        'heavily. Crack control under edge restraint is normally not achievable in one layer — ' +
        'use two layers, or provide movement joints (EN 1992-3 Table N.1(b)).');
    }

    return {
      ok: true,
      inputs: inp,
      material: { fctm, fctEff, Ecm, alphaE, betaCc },
      detailing: {
        Ac, AsVMin, AsVMax, sVMax, sHMax, AsVProv, AsVTotal, kNA, naLeg, quarterLeg,
        AsHMin, AsHMinLeg, links: { needed: linksNeeded, waived: linksWaived }
      },
      crack: {
        active: crackActive, wk: wkInfo.wk, wkSource: wkInfo.source,
        kc, k, Act, AsFloor, bars, barsDirect, methodEffective, tableCovers
      },
      governing: { horizontal: hGov, vertical: vGov },
      zone,
      checks,
      warnings,
      constants: { BAR_DIAMETERS, SPACINGS }
    };
  }

  // ------------------------------------------------------------- sub-routines

  function targetWk(inp, t) {
    switch (inp.crackReq) {
      case 'none': return { wk: null, source: 'crack control not required' };
      case 'wk040': return { wk: 0.40, source: 'wk = 0,40 mm (X0)' };
      case 'wk020': return { wk: 0.20, source: 'wk = 0,20 mm' };
      case 'custom': return { wk: inp.wkCustom, source: 'wk = ' + fmt(inp.wkCustom, 3) + ' mm (user)' };
      case 'watertight': {
        const ratio = inp.hD / t;
        const wk = ratio <= 5 ? 0.20 : ratio >= 35 ? 0.05 : lerp(ratio, 5, 35, 0.20, 0.05);
        return { wk, source: 'EN 1992-3 Class 1, hD/h = ' + fmt(ratio, 1) + ' → wk1 = ' + fmt(wk, 3) + ' mm' };
      }
      case 'wk030':
      default: {
        if (inp.naCoverUplift.on) {
          const kcc = clamp(inp.naCoverUplift.cnom / inp.naCoverUplift.cminDur, 1.0, 1.3);
          return { wk: 0.30 * kcc, source: 'NA.7.3.1(5): 0,30·kc with kc = ' + fmt(kcc, 2) };
        }
        return { wk: 0.30, source: 'wk = 0,30 mm (XC/XD/XS)' };
      }
    }
  }

  /** 7.3.3(2) — Table 7.2N with the eq. (7.7N) / (7.122) size adjustment. */
  function simplifiedBar(dia, inp, ctx) {
    const hMinusD = inp.layers === 2 ? inp.cover + dia / 2 : ctx.t / 2;
    const denom = inp.mode === 'watertight' ? 10 : 8;
    const fAdj = (ctx.fctEff / 2.9) * ctx.t / (denom * hMinusD);
    const phiStarReq = dia / fAdj;
    const inv = sigmaFromTable(phiStarReq, ctx.wk, inp.fyk);

    if (inv.status === 'outOfTable' || inv.status === 'wkOutOfRange') {
      return { dia, phiStarReq, sigmaS: null, AsReq: null, ccMax: null, status: inv.status, build: null, route: 'simplified' };
    }
    const AsReq = Math.max(ctx.kc * ctx.k * ctx.fctEff * ctx.Act / (inv.sigmaS * inp.layers), ctx.AsFloor);
    const raw = 1000 * Math.PI * dia * dia / 4 / AsReq;
    const ccMax = Math.min(raw, ctx.sHMax);
    return {
      dia, phiStarReq, sigmaS: inv.sigmaS, AsReq, ccMax, ccUncapped: raw,
      status: inv.status, build: buildability(raw),
      floorGoverns: AsReq <= ctx.AsFloor * 1.0001, route: 'simplified'
    };
  }

  /** 7.3.4 — direct crack width calculation, section fully in tension. */
  function directBar(dia, inp, ctx) {
    const hMinusD = inp.layers === 2 ? inp.cover + dia / 2 : ctx.t / 2;
    const cEff = inp.layers === 2 ? inp.cover : (ctx.t - dia) / 2;
    const hcEf = Math.min(2.5 * hMinusD, ctx.t / 2);
    const AcEff = 1000 * hcEf;

    const wkOf = (As) => {
      const sigmaS = Math.min(ctx.kc * ctx.k * ctx.fctEff * ctx.Act / (As * inp.layers), inp.fyk);
      const rho = As / AcEff;
      const srMax = 3.4 * cEff + 0.8 * 1.0 * 0.425 * dia / rho;
      const eps = Math.max(
        (sigmaS - 0.4 * ctx.fctEff / rho * (1 + ctx.alphaE * rho)) / ES,
        0.6 * sigmaS / ES
      );
      return { wk: srMax * eps, sigmaS, srMax, rho };
    };

    const lo = ctx.AsFloor, hi = 20000;
    if (wkOf(lo).wk <= ctx.wk) {
      const r = wkOf(lo);
      const raw = 1000 * Math.PI * dia * dia / 4 / lo;
      return {
        dia, sigmaS: r.sigmaS, AsReq: lo, ccMax: Math.min(raw, ctx.sHMax), ccUncapped: raw,
        srMax: r.srMax, status: 'ok', build: buildability(raw), floorGoverns: true, route: 'direct'
      };
    }
    if (wkOf(hi).wk > ctx.wk) {
      return { dia, sigmaS: null, AsReq: null, ccMax: null, status: 'unreachable', build: null, route: 'direct' };
    }
    let a = lo, b = hi;
    for (let i = 0; i < 60; i++) {
      const m = (a + b) / 2;
      if (wkOf(m).wk > ctx.wk) a = m; else b = m;
    }
    const As = b;
    const r = wkOf(As);
    const raw = 1000 * Math.PI * dia * dia / 4 / As;
    const srLimit = 5 * (cEff + dia / 2);
    return {
      dia, sigmaS: r.sigmaS, AsReq: As, ccMax: Math.min(raw, ctx.sHMax), ccUncapped: raw,
      srMax: r.srMax, status: 'ok', build: buildability(raw),
      floorGoverns: false, wideSpacing: raw > srLimit, srLimit, route: 'direct'
    };
  }

  /** EN 1992-3 Annex L / Annex M — height over which edge restraint actually cracks. */
  function zoneHeight(inp, t) {
    const practice = 3 * t;
    if (!inp.wallL || !inp.wallH) return { practice, tableL1: null };
    const LH = inp.wallL / inp.wallH;
    let Rtop;
    if (LH <= 1) Rtop = 0;
    else if (LH >= 8) Rtop = 0.5;
    else {
      Rtop = 0.5;
      for (let i = 0; i < TABLE_L1.length - 1; i++) {
        const [x0, y0] = TABLE_L1[i], [x1, y1] = TABLE_L1[i + 1];
        if (LH >= x0 && LH <= x1) { Rtop = lerp(LH, x0, x1, y0, y1); break; }
      }
    }
    const Rcrit = inp.epsCtu / inp.epsFree;
    if (Rcrit >= R_BASE) {
      return { practice, tableL1: { LH, Rtop, Rcrit, height: 0, note: 'noCracking' } };
    }
    if (Rtop >= Rcrit) {
      return { practice, tableL1: { LH, Rtop, Rcrit, height: inp.wallH, note: 'fullHeight' } };
    }
    const frac = clamp((R_BASE - Rcrit) / (R_BASE - Rtop), 0, 1);
    return { practice, tableL1: { LH, Rtop, Rcrit, height: frac * inp.wallH, frac, note: 'partial' } };
  }

  function pushChecks(checks, c) {
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

    if (c.inp.wallL) {
      const ratio = c.inp.wallL / c.t;
      add('scope', 'Wall definition, 9.6.1(1)', ratio >= 4 ? 'ok' : 'fail',
        'length / thickness = ' + fmt(ratio, 1) + (ratio >= 4 ? ' ≥ 4' : ' < 4 — §9.6 does not apply, design as a column'));
    } else {
      add('scope', 'Wall definition, 9.6.1(1)', 'info',
        '§9.6 applies where length / thickness ≥ 4. A wall governed by out-of-plane bending follows the slab rules of §9.3 instead.');
    }

    add('vspacing', 'Vertical bar spacing, 9.6.2(3)',
      c.inp.vBar.spacing <= c.sVMax ? 'ok' : 'fail',
      'c' + c.inp.vBar.spacing + ' vs max ' + fmt(c.sVMax, 0) + ' mm = min(3t, 400)');

    add('vmin', 'Vertical minimum, 9.6.2(1)',
      c.AsVProv >= c.AsVMin ? 'ok' : 'fail',
      'provided ' + fmt(c.AsVProv, 0) + ' vs required ' + fmt(c.AsVMin, 0) + ' mm²/m per layer');

    add('vmax', 'Vertical maximum, 9.6.2(1)',
      c.AsVTotal <= c.AsVMax ? 'ok' : 'fail',
      fmt(c.AsVTotal, 0) + ' vs 0,04·Ac = ' + fmt(c.AsVMax, 0) + ' mm²/m (0,08·Ac at laps)');

    add('hspacing', 'Horizontal bar spacing, 9.6.3(2)',
      c.hGov.ccMax <= c.sHMax ? 'ok' : 'warn',
      'required c' + fmt(c.hGov.ccMax, 0) + ', code maximum c400');

    if (c.linksNeeded) {
      add('links', 'Transverse links, 9.6.4(1)', 'warn',
        'vertical steel exceeds 0,02·Ac — links to §9.5.3 are required');
    } else if (c.layers === 2) {
      add('links', 'Transverse links, 9.6.4(2)', c.linksWaived ? 'ok' : 'warn',
        c.linksWaived
          ? 'waived: ø ≤ 16 mm with cover > 2ø'
          : '4 links/m² required where the main reinforcement is nearest the faces, unless ø ≤ 16 mm with cover > 2ø');
    }

    if (c.crackActive && c.sel) {
      if (c.sel.status === 'outOfTable') {
        add('crack', 'Crack control, 7.3.3(2)', 'fail',
          'ø' + c.sel.dia + ' needs a φ*s beyond Table 7.2N. No simplified answer exists — calculate directly to 7.3.4 or use a smaller bar.');
      } else if (c.sel.status === 'unreachable') {
        add('crack', 'Crack control, 7.3.4', 'fail',
          'wk = ' + fmt(c.wkInfo.wk, 2) + ' mm is not reachable with ø' + c.sel.dia + ' at any spacing.');
      } else {
        add('crack', 'Crack control, ' + (c.methodEffective === 'direct' ? '7.3.4' : '7.3.3(2)'),
          c.sel.build === 'unbuildable' ? 'fail' : c.sel.build === 'tight' ? 'warn' : 'ok',
          'ø' + c.sel.dia + ' at σs = ' + fmt(c.sel.sigmaS, 0) + ' MPa needs c' + fmt(c.sel.ccUncapped, 0) +
          (c.sel.build === 'unbuildable' ? ' — below 75 mm, not buildable' :
            c.sel.build === 'tight' ? ' — tight but buildable' : ''));
      }
      if (c.methodEffective === 'simplified' && c.selAlt && c.selAlt.AsReq != null &&
          c.sel.AsReq != null && c.selAlt.AsReq > c.sel.AsReq * 1.05) {
        add('tableCalibration', 'Table 7.2N is calibrated for bending', 'warn',
          'Note 1 to Table 7.2N states the table assumes k2 = 0,5, kc = 0,4 and hcr = 0,5h — a section ' +
          'in bending. A wall cracking under edge restraint is in uniform tension, where k2 = 1,0 and ' +
          'hcr = h. Eq. (7.7N) rescales the bar size for that, but it does not restore k2 inside sr,max. ' +
          'Calculating directly to 7.3.4 with k2 = 1,0 gives ' + fmt(c.selAlt.AsReq, 0) + ' mm²/m, ' +
          fmt((c.selAlt.AsReq / c.sel.AsReq - 1) * 100, 0) + ' % more. 7.3.1(9) makes the two routes ' +
          'alternatives, so both are compliant — but for restraint the direct route is the truthful one.');
      }
      const AsTot = c.sel.AsReq != null ? c.sel.AsReq * c.layers : null;
      if (AsTot != null && AsTot > 0.04 * c.Ac) {
        add('congestion', 'Reinforcement ratio', 'fail',
          fmt(c.sel.AsReq, 0) + ' mm\u00b2/m per face is ' + fmt(100 * AsTot / c.Ac, 1) +
          ' % of the section across both faces, past the 4 % that 9.6.2(1) allows for the vertical ' +
          'steel in both faces together. A crack requirement this tight is not a reinforcement ' +
          'problem: EN 1992-3 7.3.1(111) expects liners or prestress for Tightness Class 2 and 3, ' +
          'and Table N.1(b) offers movement joints as the alternative.');
      } else if (AsTot != null && AsTot > 0.02 * c.Ac) {
        add('congestion', 'Reinforcement ratio', 'warn',
          fmt(100 * AsTot / c.Ac, 1) + ' % of the section across both faces. Check bar spacing against ' +
          '8.2 clear distances and think about whether movement joints would be cheaper.');
      }
      if (c.sel.floorGoverns) {
        add('floor', 'Yield floor, 7.3.2(2)', 'info',
          'the crack width is not what governs here — As is at the floor ' + fmt(c.AsFloor, 0) +
          ' mm²/m at which the steel would reach fyk on first cracking');
      }
    }

    if (c.zone.tableL1) {
      const z = c.zone.tableL1;
      const status = z.note === 'noCracking' ? 'ok' : z.height > c.zone.practice * 1.05 ? 'warn' : 'ok';
      const detail = z.note === 'noCracking'
        ? 'R_crit = ' + fmt(z.Rcrit, 2) + ' exceeds the 0,50 base restraint — no restraint cracking predicted'
        : 'L/H = ' + fmt(z.LH, 1) + ' → R = 0,50 at base, ' + fmt(z.Rtop, 2) + ' at top; cracked zone ' +
          fmt(z.height, 0) + ' mm vs 3t = ' + fmt(c.zone.practice, 0) + ' mm' +
          (z.height > c.zone.practice * 1.05 ? ' — 3t is unconservative for this geometry' : '');
      add('zone', 'Restrained zone, EN 1992-3 Table L.1', status, detail);
    }
  }

  // ----------------------------------------------------------------- helpers

  function fmt(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    return v.toFixed(dp).replace('.', ',');
  }

  function num(v, dflt) {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return isFinite(n) ? n : dflt;
  }

  function normalise(r) {
    r = r || {};
    const layers = r.layers === 1 ? 1 : 2;
    return {
      mode: r.mode || 'onBase',
      restrainedTopBottom: !!r.restrainedTopBottom,
      t: clamp(num(r.t, 350), 50, 3000),
      fck: clamp(num(r.fck, 35), 12, 90),
      fyk: clamp(num(r.fyk, 500), 200, 700),
      layers,
      cover: clamp(num(r.cover, 35), 10, 200),
      exposureSide: r.exposureSide === 'interior' ? 'interior' : 'exterior',
      kNaOverride: r.kNaOverride == null || r.kNaOverride === '' ? null : num(r.kNaOverride, null),
      vBar: {
        dia: clamp(num(r.vBar && r.vBar.dia, 12), 5, 40),
        spacing: clamp(num(r.vBar && r.vBar.spacing, 250), 40, 600)
      },
      crackReq: r.crackReq || 'wk030',
      wkCustom: clamp(num(r.wkCustom, 0.30), 0.01, 1.0),
      naCoverUplift: {
        on: !!(r.naCoverUplift && r.naCoverUplift.on),
        cnom: num(r.naCoverUplift && r.naCoverUplift.cnom, 35),
        cminDur: Math.max(1, num(r.naCoverUplift && r.naCoverUplift.cminDur, 25))
      },
      hD: clamp(num(r.hD, 2000), 0, 100000),
      kcMode: r.kcMode || 'pureTension',
      kcCustom: clamp(num(r.kcCustom, 1.0), 0.05, 1.0),
      kMode: r.kMode === 'ec2h' ? 'ec2h' : 'external',
      crackAgeDays: clamp(num(r.crackAgeDays, 28), 1, 28),
      cementClass: CEMENT_S[r.cementClass] ? r.cementClass : 'N',
      method: r.method === 'direct' ? 'direct' : 'simplified',
      selectedDia: BAR_DIAMETERS.includes(num(r.selectedDia, 16)) ? num(r.selectedDia, 16) : 16,
      wallL: r.wallL ? num(r.wallL, null) : null,
      wallH: r.wallH ? num(r.wallH, null) : null,
      epsFree: num(r.epsFree, 320e-6),
      epsCtu: num(r.epsCtu, 100e-6)
    };
  }

  return {
    calculate,
    // exposed for tests and for the UI's matrix
    fctmOf, fctmAt, ecmOf, sigmaFromTable, t72nColumn, area, buildability,
    BAR_DIAMETERS, SPACINGS, T72N, T72N_SIGMA, TABLE_L1, fmt
  };
});
