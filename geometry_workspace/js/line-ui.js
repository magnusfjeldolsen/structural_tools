/**
 * line-ui.js — linjeberegningen i Forsterkning-fanen (#63): broen fra
 * modellen til `line-analysis.js`, og panelene (input til venstre, resultat
 * til høyre). Mekanikken ligger i `line-analysis.js`; her er bare valg av
 * skjøt, kontroll av input, enheter og visning.
 *
 * Enheter: tabellen og z_a/z_b i m, kN, kNm; skjøtedata absolutte (a i mm,
 * K i N/mm); fri tøyning i ‰. Alt regnes om til N og mm her.
 */

import { parseLoadTable, twoLayer, lambda2, analyseLine, suggestZones } from './line-analysis.js';
import { slipModulus } from './connection-stiffness.js';
import { lengthLabel } from './units.js';
import { n } from './derivation.js';

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ================================================================== *
 * 1. Broen
 * ================================================================== */

const RESTRAINTS = [
  { key: 'free', label: 'Fri — kan bøye om begge akser' },
  { key: 'y', label: 'Fastholdt om y-aksen (sideveis)' },
  { key: 'x', label: 'Fastholdt om x-aksen' },
  { key: 'xy', label: 'Fastholdt om begge akser' },
];

const rel = (u, v) => Math.abs(u - v) <= 1e-6 * Math.max(Math.abs(u), Math.abs(v), 1);

/**
 * Regner linjeberegningen for tilstanden, gitt snittberegningens resultat
 * (`computeReinforcement`), som allerede har gruppene og skjøtestivhetene.
 *
 * @returns {{ok: boolean, blocked: string[], warnings: Array<{short:string,text:string}>, ...}}
 */
export function computeLine(state, rf) {
  const line = state.line || {};
  const blocked = [];
  const warnings = [];
  const out = { ok: false, blocked, warnings, line };
  if (!rf) {
    blocked.push('Ingen geometri å regne på.');
    return out;
  }
  if (rf.allExisting) blocked.push('Ingen del er merket «ny». Linjeberegningen gjelder en forsterkning.');

  const table = parseLoadTable(line.table);
  out.table = table;
  for (const e of table.errors) blocked.push(e);
  if (table.rows.length < 2) blocked.push('Lim inn lastdiagrammet: minst to rader med z, N, M_x, M_y.');

  if (!line.nAt) blocked.push('Velg hvor N angriper.');
  if (!line.restraint) blocked.push('Velg sideveis fastholding.');

  const zMin = table.rows.length ? table.rows[0].z : 0;
  const zMax = table.rows.length ? table.rows[table.rows.length - 1].z : 0;
  const za = line.za == null ? zMin : line.za;
  const zb = line.zb == null ? zMax : line.zb;
  out.za = za;
  out.zb = zb;
  if (table.rows.length >= 2 && !(zb > za)) blocked.push('Utstrekningen må ha z_b > z_a.');

  // Skjøtene som berører en ny del. Én skjøtelinje, eller to like og speilede.
  const toNew = rf.joints.filter((j) => j.hasNeighbor && !j.existingOnly);
  let pick = null;
  if (!rf.allExisting && !toNew.length) blocked.push('Tegn skjøten mellom eksisterende og ny del (fanen «Geometri», G).');
  else if (toNew.length === 1) pick = { joints: toNew, groupIds: toNew[0].groupIds, pair: false };
  else if (toNew.length === 2) {
    const pair = mirroredPair(toNew, rf);
    if (pair) pick = pair;
    else blocked.push('Linjeberegningen gjelder én skjøtelinje mellom eksisterende og ny del, eller to like, speilede nye deler. Her er det to ulike.');
  } else if (toNew.length > 2) {
    blocked.push(`Linjeberegningen gjelder én skjøtelinje mellom eksisterende og ny del. Her berører ${toNew.length} skjøter en ny del — det krever et koblet system som ikke er med ennå.`);
  }
  if (pick && pick.joints.some((j) => j.overConstrained)) {
    blocked.push('Skjøten er statisk ubestemt (lukket sløyfe). Linjeberegningen gjelder en skjøt som er en bro mellom to deler.');
  }

  // Skruetypen fra skjøten (K_ser, ev. EC5-data) er standard for alle soner;
  // rader, a og skrue kan overstyres per sone (#71).
  let base = null;
  if (pick) {
    const j = pick.joints[0];
    const c = j.connector || {};
    const gap = c.stiffSource === 'ec5' && c.ec5Contact === 'gap';
    if (gap) blocked.push(`${escapeHtml(j.name)}: ingen kontakt mellom delene — tabell 7.1 gjelder ikke. Legg inn K fritt (ETA/forsøk).`);
    const K = j.slipSer && j.slipSer.valid ? j.slipSer.K : NaN;
    base = { rows: Number(c.rows) || 1, a: Number(c.spacing) || 200, K, ec5: c.stiffSource === 'ec5', d: Number(c.ec5D) || null, connector: c, rho: j.rhoSource };
    if (!(K > 0) && !gap) blocked.push(`${escapeHtml(j.name)}: K_ser mangler — sett skruetypen i skjøtelista.`);
  }
  out.pick = pick;
  out.base = base;
  const zones = base && table.rows.length >= 2 && zb > za ? resolveZones(line, za, zb, base) : [];
  out.zones = zones;
  for (const zn of zones) {
    if (!(zn.K > 0)) blocked.push(`Sone ${n(zn.z0, 2)}–${n(zn.z1, 2)} m: K mangler.`);
    if (!(zn.rows > 0) || !(zn.a > 0)) blocked.push(`Sone ${n(zn.z0, 2)}–${n(zn.z1, 2)} m: rader og a må være satt.`);
  }
  if (blocked.length) return out;

  const groupSet = new Set(pick.groupIds);
  const existingParts = rf.sectionParts.filter((p) => !groupSet.has(p.id));
  const newParts = rf.sectionParts.filter((p) => groupSet.has(p.id));
  const layer = twoLayer({ existingParts, newParts, restraint: line.restraint, nAt: line.nAt });
  if (!layer.valid) {
    blocked.push('Tverrsnittet er degenerert (EA eller EI ≈ 0) — sjekk geometrien.');
    return out;
  }

  // Et speilet par: begge skjøtene har sonene, så stivheten dobles; per
  // skjøt er q halvparten, og kraften per skrue er den samme.
  const nJ = pick.joints.length;
  const res = analyseLine({
    layer,
    rows: table.rows,
    jumps: table.jumps,
    za: za * 1000,
    zb: zb * 1000,
    endA: line.endA,
    endB: line.endB,
    zones: zones.map((zn) => ({ z0: zn.z0 * 1000, z1: zn.z1 * 1000, rows: zn.rows * nJ, a: zn.a, K: zn.K })),
    epsExisting: (Number(line.epsExisting) || 0) / 1000,
    epsNew: (Number(line.epsNew) || 0) / 1000,
  });

  const share = pick.pair ? 0.5 : 1;
  const j0 = pick.joints[0];
  const qT = Number(j0.raw && j0.raw.qT) || 0;
  const zoneAtZ = (zm) => zones.find((zn, i) => zm >= zn.z0 - 1e-9 && (zm < zn.z1 - 1e-9 || i === zones.length - 1)) || zones[zones.length - 1];
  const zFmax = res.ser.zAtFmax / 1000;
  const zAt = zoneAtZ(zFmax);

  out.ok = true;
  out.layer = layer;
  out.res = res;
  out.kSer = Math.max(...zones.map((zn) => (zn.rows * nJ * zn.K) / zn.a));
  out.share = share;
  out.zoneStats = zones.map((zn, i) => {
    const pick2 = (run) => {
      let best = 0;
      let at = zn.z0;
      run.z.forEach((zz, k) => {
        const zm = zz / 1000;
        if (zm < zn.z0 - 1e-9 || zm > zn.z1 + 1e-9) return;
        if (run.F[k] > best) { best = run.F[k]; at = zm; }
      });
      return { F: best / 1000, z: at };
    };
    const ser = pick2(res.ser);
    const u = pick2(res.u);
    const len = (zn.z1 - zn.z0) * 1000;
    return { ...zn, count: Math.max(1, Math.round(len / zn.a)) * zn.rows, Fser: ser.F, Fu: u.F, zAt: ser.z, Lc: 1 / res.ser.lambdas[i] };
  });
  out.summary = {
    joint: pick.pair ? `${j0.name} + ${pick.joints[1].name}` : j0.name,
    rows: zAt.rows,
    a: zAt.a,
    zones: zones.length,
    count: out.zoneStats.reduce((t, z) => t + z.count, 0) * nJ,
    qMax: { ser: res.ser.qMax * share, u: res.u.qMax * share, z: res.ser.zAtQmax / 1000 },
    Fv: { ser: res.ser.Fmax / 1000, u: res.u.Fmax / 1000, z: zFmax },
    Fax: qT ? (Math.abs(qT) * zAt.a) / zAt.rows / 1000 : null,
    N2a: line.endA === 'fixed' ? { ser: res.ser.N2a / 1000, u: res.u.N2a / 1000 } : null,
    N2b: line.endB === 'fixed' ? { ser: res.ser.N2b / 1000, u: res.u.N2b / 1000 } : null,
    N1max: { ser: res.ser.N1max / 1000, u: res.u.N1max / 1000, z: res.u.zAtN1max / 1000 },
    eta: { ser: res.ser.eta, u: res.u.eta },
    Lc: { ser: 1 / res.ser.lambda, u: 1 / res.u.lambda, serMax: 1 / Math.min(...res.ser.lambdas), uMax: 1 / Math.min(...res.u.lambdas) },
  };

  if (res.u.eta != null && res.u.eta < 0.9) {
    warnings.push({
      short: `η = ${n(res.u.eta, 2)} (K_u): den nye delen når ikke sin fulle andel.`,
      text: 'Delen er for kort i forhold til den karakteristiske lengden 1/λ, eller skjøten for myk: den nye delen får mindre enn ved full samvirkning, og den eksisterende delen bærer resten. Kontroller N₁ i den eksisterende delen.',
    });
  }
  out.zoneStats.forEach((zs, i) => {
    if (zs.a > 0.5 * zs.Lc) {
      warnings.push({
        short: `Sone ${n(zs.z0, 2)}–${n(zs.z1, 2)} m: a = ${n(zs.a, 0)} mm > 1/(2λ) = ${n(0.5 * zs.Lc, 0)} mm — enkeltskruene betyr noe.`,
        text: 'Modellen smører skruene ut langs skjøten. Når skrueavstanden er stor i forhold til den karakteristiske lengden, får de ytterste skruene mer enn den utsmurte toppen tilsier.',
      });
    }
    // En tett endesone virker fullt først når den er minst ≈ 2/λ lang.
    const neighbour = out.zoneStats[i === 0 ? 1 : i - 1];
    const isEnd = (i === 0 && line.endA !== 'fixed') || (i === out.zoneStats.length - 1 && line.endB !== 'fixed');
    if (isEnd && neighbour && zs.rows * zs.K / zs.a > neighbour.rows * neighbour.K / neighbour.a && (zs.z1 - zs.z0) * 1000 < 2 * zs.Lc) {
      warnings.push({
        short: `Endesonen ${n(zs.z0, 2)}–${n(zs.z1, 2)} m er kortere enn 2/λ ≈ ${n((2 * zs.Lc) / 1000, 2)} m — toppen sprer seg inn i neste sone.`,
        text: 'Kraften fra enden bygges opp over noen karakteristiske lengder 1/λ. Er den tette sonen kortere, tar den glisnere sonen innenfor en del av toppen. Tallene er fortsatt riktige — sonen er bare mindre effektiv enn den kunne vært.',
      });
    }
  });
  if (pick.pair) {
    warnings.push({
      short: 'To like, speilede nye deler: tallene gjelder hver skjøt.',
      text: 'De to nye delene er like (EA, EI) og speilet om det eksisterende tyngdepunktet. De regnes som én del med summen av skjøtestivhetene og e = 0; q og skruekraft er per skjøt.',
    });
  }
  return out;
}

/**
 * Sonene som faktisk gjelder: fra z_a til z_b uten hull eller overlapp. Tom
 * liste i tilstanden = én sone med skjøtens rader og a. Hver sone kan
 * overstyre rader, a og skruen (K_ser direkte, eller d når skjøten regner K
 * etter EC5 tabell 7.1).
 * @returns {Array<{z0:number, z1:number, rows:number, a:number, K:number, Kser:number|null, d:number|null}>}  z i m
 */
export function resolveZones(line, za, zb, base) {
  const raw = line && Array.isArray(line.zones) && line.zones.length ? line.zones : [{ zEnd: null }];
  const out = [];
  let start = za;
  raw.forEach((zn, i) => {
    const last = i === raw.length - 1;
    const end = last ? zb : Math.min(zb, Math.max(start, Number.isFinite(zn.zEnd) ? zn.zEnd : zb));
    if (!last && end - start < 1e-6) return;
    const rows = zn.rows || base.rows;
    const a = zn.a || base.a;
    let K = base.K;
    if (zn.Kser > 0) K = zn.Kser;
    else if (zn.d > 0 && base.ec5) {
      const c = base.connector || {};
      const r = base.rho || {};
      const sm = slipModulus({
        source: 'ec5', fastener: c.ec5Fastener || 'dowel', rho1: r.aValue ?? undefined, rho2: r.bValue ?? undefined,
        d: zn.d, dc: zn.d, contact: c.ec5Contact || 'timber-timber', state: 'SLS',
      });
      K = sm && sm.valid ? sm.K : NaN;
    }
    out.push({ z0: start, z1: end, rows, a, K, Kser: zn.Kser || null, d: zn.d || null });
    start = end;
  });
  if (out.length) out[out.length - 1].z1 = zb;
  return out;
}

/* ---------------- sonene: endringer (rene funksjoner) ---------------- */

/** Tilstandsform av løste soner: grensen i `zEnd`, bare overstyringer lagres. */
function toState(zones, base) {
  return zones.map((zn, i) => ({
    zEnd: i === zones.length - 1 ? null : Math.round(zn.z1 * 1000) / 1000, // hele mm
    rows: zn.rows !== base.rows ? zn.rows : null,
    a: zn.a !== base.a ? zn.a : null,
    Kser: zn.Kser || null,
    d: zn.d || null,
  }));
}

/** Deler sone i på midten. */
export function splitZone(zones, i, base) {
  const zn = zones[i];
  const mid = Math.round(((zn.z0 + zn.z1) / 2) * 1000) / 1000;
  const next = [...zones.slice(0, i), { ...zn, z1: mid }, { ...zn, z0: mid }, ...zones.slice(i + 1)];
  return toState(next, base);
}

/** Fjerner sone i; naboen (til venstre, ellers høyre) tar over lengden. */
export function deleteZone(zones, i, base) {
  if (zones.length < 2) return toState(zones, base);
  const next = zones.slice();
  if (i > 0) next[i - 1] = { ...next[i - 1], z1: zones[i].z1 };
  else next[1] = { ...next[1], z0: zones[0].z0 };
  next.splice(i, 1);
  return toState(next, base);
}

/** Flytter grensen etter sone i — også starten på sone i+1. */
export function moveBoundary(zones, i, zEnd, base) {
  if (i >= zones.length - 1) return toState(zones, base);
  const lo = zones[i].z0 + 0.01;
  const hi = zones[i + 1].z1 - 0.01;
  const z = Math.min(hi, Math.max(lo, zEnd));
  const next = zones.slice();
  next[i] = { ...next[i], z1: z };
  next[i + 1] = { ...next[i + 1], z0: z };
  return toState(next, base);
}

/** Endrer rader, a, K_ser eller d i sone i (tom verdi = skjøtens standard). */
export function setZoneField(zones, i, key, value, base) {
  const next = zones.slice();
  const v = value === '' || value == null || !(Number(value) > 0) ? null : Number(value);
  const zn = { ...next[i] };
  if (key === 'rows') zn.rows = v ?? base.rows;
  if (key === 'a') zn.a = v ?? base.a;
  if (key === 'Kser') zn.Kser = v;
  if (key === 'd') zn.d = v;
  next[i] = zn;
  return toState(next, base);
}

/** Deler sone i ved z [m] (ikke nærmere enn 1 cm fra kantene). */
export function splitZoneAt(zones, i, z, base) {
  const zn = zones[i];
  const at = Math.min(zn.z1 - 0.01, Math.max(zn.z0 + 0.01, z));
  const next = [...zones.slice(0, i), { ...zn, z1: at }, { ...zn, z0: at }, ...zones.slice(i + 1)];
  return toState(next, base);
}

/**
 * «Foreslå soner» (#73): kjører `suggestZones` med rader og skrue fra første
 * sone, og gir sonene tilbake i tilstandsform. Mål og minste lengde i N og mm.
 */
export function suggestFor(lr, { target, spacings, minLen }) {
  if (!lr || !lr.layer || !lr.zones || !lr.zones.length) return null;
  const z0 = lr.zones[0];
  const nJ = lr.pick ? lr.pick.joints.length : 1;
  const line = lr.line || {};
  const r = suggestZones({
    layer: lr.layer,
    rows: lr.table.rows,
    jumps: lr.table.jumps, // i m — analyseLine regner om og filtrerer selv
    za: lr.za * 1000,
    zb: lr.zb * 1000,
    endA: line.endA,
    endB: line.endB,
    epsExisting: (Number(line.epsExisting) || 0) / 1000,
    epsNew: (Number(line.epsNew) || 0) / 1000,
    rowsPerZone: z0.rows * nJ,
    K: z0.K,
    spacings,
    target,
    minLen,
  });
  const zones = r.zones.map((z) => ({ z0: z.z0 / 1000, z1: z.z1 / 1000, rows: z0.rows, a: z.a, K: z0.K, Kser: z0.Kser, d: z0.d }));
  return { ...r, zones: toState(zones, lr.base), count: zones.length };
}

/**
 * Sonestripen under plottet av kraft per skrue: samme z-akse som plottene
 * (samme viewBox og marger som `plotSvg`), én bit per sone med tetthet som
 * farge, og håndtak på grensene som kan dras.
 */
export function zoneStripSvg(lr) {
  if (!lr.ok || !lr.zones || !lr.zones.length) return '';
  const W = 480, Hh = 34, Lm = 46, R = 8;
  const x0 = lr.zones[0].z0;
  const x1 = lr.zones[lr.zones.length - 1].z1;
  const X = (v) => Lm + ((v - x0) / (x1 - x0 || 1)) * (W - Lm - R);
  const ks = lr.zones.map((z) => (z.rows * z.K) / z.a);
  const kMin = Math.min(...ks);
  const kMax = Math.max(...ks);
  const segs = lr.zones.map((z, i) => {
    const t = kMax > kMin ? (ks[i] - kMin) / (kMax - kMin) : 0.5;
    const w = X(z.z1) - X(z.z0);
    return `<g data-strip-seg="${i}">
      <rect x="${X(z.z0).toFixed(1)}" y="6" width="${Math.max(0, w).toFixed(1)}" height="16" fill="#e879f9" fill-opacity="${(0.15 + 0.55 * t).toFixed(2)}" stroke="#475569" stroke-width="0.6" />
      ${w > 34 ? `<text x="${(X(z.z0) + w / 2).toFixed(1)}" y="17.5" fill="#f1f5f9" font-size="9" text-anchor="middle" pointer-events="none">a=${n(z.a, 0)}</text>` : ''}
    </g>`;
  }).join('');
  const handles = lr.zones.slice(0, -1).map((z, i) => `<g data-strip-bound="${i}" style="cursor:ew-resize">
      <rect x="${(X(z.z1) - 5).toFixed(1)}" y="2" width="10" height="24" fill="transparent" />
      <line x1="${X(z.z1).toFixed(1)}" y1="3" x2="${X(z.z1).toFixed(1)}" y2="25" stroke="#f8fafc" stroke-width="2" />
    </g>`).join('');
  return `<svg data-zone-strip viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Skruesoner langs z — dra grensene, dobbeltklikk for å dele"
      font-family="ui-sans-serif, system-ui, sans-serif" style="touch-action:none">
    ${segs}${handles}
    <text data-strip-readout x="${Lm}" y="${Hh - 1}" fill="#94a3b8" font-size="8">dra en grense · dobbeltklikk for å dele · Shift = fritt (ellers 5 cm-trinn)</text>
  </svg>`;
}

/** Gjør sonestripen interaktiv: dra grenser, dobbeltklikk for å dele. */
export function bindZoneStrip(host, store, lr) {
  const svg = host.querySelector('[data-zone-strip]');
  if (!svg || !lr || !lr.ok) return;
  const W = 480, Lm = 46, R = 8;
  const zones = lr.zones;
  const x0 = zones[0].z0;
  const x1 = zones[zones.length - 1].z1;
  const toZ = (clientX) => {
    const r = svg.getBoundingClientRect();
    const vx = ((clientX - r.left) / r.width) * W;
    return x0 + ((vx - Lm) / (W - Lm - R)) * (x1 - x0);
  };
  const X = (v) => Lm + ((v - x0) / (x1 - x0 || 1)) * (W - Lm - R);
  const readout = svg.querySelector('[data-strip-readout]');
  svg.querySelectorAll('[data-strip-bound]').forEach((g) => {
    const i = Number(g.dataset.stripBound);
    const lo = zones[i].z0 + 0.01;
    const hi = zones[i + 1].z1 - 0.01;
    const line = g.querySelector('line');
    const segL = svg.querySelector(`[data-strip-seg="${i}"] rect`);
    const segR = svg.querySelector(`[data-strip-seg="${i + 1}"] rect`);
    let dragging = false;
    let z = zones[i].z1;
    g.addEventListener('pointerdown', (e) => {
      dragging = true;
      g.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    g.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      let v = toZ(e.clientX);
      if (!e.shiftKey) v = Math.round(v / 0.05) * 0.05;
      z = Math.min(hi, Math.max(lo, v));
      const px = X(z);
      line.setAttribute('x1', px); line.setAttribute('x2', px);
      segL.setAttribute('width', Math.max(0, px - X(zones[i].z0)));
      segR.setAttribute('x', px);
      segR.setAttribute('width', Math.max(0, X(zones[i + 1].z1) - px));
      if (readout) readout.textContent = `grense ved z = ${n(z, 2)} m · sone ${n(z - zones[i].z0, 2)} m / ${n(zones[i + 1].z1 - z, 2)} m`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      if (Math.abs(z - zones[i].z1) > 1e-9) store.setLine({ zones: moveBoundary(zones, i, z, lr.base) });
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  });
  svg.querySelectorAll('[data-strip-seg]').forEach((g) => {
    g.addEventListener('dblclick', (e) => {
      const i = Number(g.dataset.stripSeg);
      let v = toZ(e.clientX);
      if (!e.shiftKey) v = Math.round(v / 0.05) * 0.05;
      store.setLine({ zones: splitZoneAt(zones, i, v, lr.base) });
    });
  });
}

/** To symmetriske endesoner med lengde L [m] og avstand aEnd; midten beholder første sones a. */
export function endZones(zones, za, zb, L, aEnd, base) {
  const len = zb - za;
  if (!(L > 0) || !(aEnd > 0) || 2 * L >= len) return null;
  const mid = zones[Math.floor(zones.length / 2)] || zones[0];
  const end = { rows: zones[0].rows, a: aEnd, Kser: zones[0].Kser, d: zones[0].d };
  const next = [
    { ...end, z0: za, z1: za + L },
    { rows: mid.rows, a: mid.a, Kser: mid.Kser, d: mid.d, z0: za + L, z1: zb - L },
    { ...end, z0: zb - L, z1: zb },
  ];
  return toState(next, base);
}

/** To nye deler som er like og speilet om det eksisterende tyngdepunktet. */
function mirroredPair(toNew, rf) {
  const [ja, jb] = toNew;
  const ga = new Set(ja.groupIds);
  const gb = new Set(jb.groupIds);
  if (!ga.size || !gb.size || [...ga].some((id) => gb.has(id))) return null;
  const sum = (ids) => {
    let EA = 0, ESx = 0, ESy = 0, EIx0 = 0, EIy0 = 0;
    for (const p of rf.sectionParts) {
      if (!ids.has(p.id)) continue;
      EA += p.E * p.props.A; ESx += p.E * p.props.Sx; ESy += p.E * p.props.Sy;
      EIx0 += p.E * p.props.Ix0; EIy0 += p.E * p.props.Iy0;
    }
    const yc = ESx / EA, xc = ESy / EA;
    return { EA, xc, yc, EIx: EIx0 - EA * yc * yc, EIy: EIy0 - EA * xc * xc };
  };
  const A = sum(ga);
  const B = sum(gb);
  const rest = sum(new Set(rf.sectionParts.map((p) => p.id).filter((id) => !ga.has(id) && !gb.has(id))));
  if (!(A.EA > 0 && B.EA > 0 && rest.EA > 0)) return null;
  const same = rel(A.EA, B.EA) && rel(A.EIx, B.EIx) && rel(A.EIy, B.EIy);
  const tol = 1e-6 * Math.max(1, Math.abs(A.xc), Math.abs(A.yc));
  const mirrored = Math.abs(A.xc + B.xc - 2 * rest.xc) < tol && Math.abs(A.yc + B.yc - 2 * rest.yc) < tol;
  if (!same || !mirrored) return null;
  return { joints: [ja, jb], groupIds: [...ga, ...gb], pair: true };
}

/* ================================================================== *
 * 2. Input (venstre panel)
 * ================================================================== */

const H = (title, body, extra = '') => `
  <div>
    <div class="flex items-center justify-between gap-2 mb-1.5">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">${title}</h3>
      ${extra}
    </div>
    ${body}
  </div>`;

const sel = (key, value, options, placeholder) => `
  <select data-line="${key}" data-focus-key="line-${key}" id="line-${key}">
    ${placeholder ? `<option value="" ${value ? '' : 'selected'} disabled>${placeholder}</option>` : ''}
    ${options.map((o) => `<option value="${o.key}" ${value === o.key ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>`;

const num = (key, label, value, attrs = '') => `
  <div>
    <label class="field-label" for="line-${key}">${label}</label>
    <input id="line-${key}" data-line="${key}" data-focus-key="line-${key}" type="number" ${attrs}
           value="${value === null || value === undefined ? '' : value}" />
  </div>`;

const ENDS = [{ key: 'loose', label: 'Løs ende' }, { key: 'fixed', label: 'Festet i knutepunkt' }];

/**
 * Venstre panel i linjemodus: lastdiagram, utstrekning, randbetingelser og
 * forutsetningene. Ingen løpende tekst — forklaringene står i `title`.
 */
export function lineInputsHtml(state, lr) {
  const line = state.line || {};
  const t = lr && lr.table;
  const status = !t || !t.rows.length
    ? '<span class="text-slate-500">Ingen rader ennå.</span>'
    : t.errors.length
    ? `<span class="text-rose-300">${escapeHtml(t.errors[0])}</span>`
    : `<span class="text-slate-400">${t.rows.length} rader · z ${n(t.rows[0].z, 2)}–${n(t.rows[t.rows.length - 1].z, 2)} m${t.jumps.length ? ` · ${t.jumps.length} hopp` : ''}</span>`;
  return [
    H(
      `<span class="inline-flex items-center gap-1.5">Lastdiagram
         <button data-line-help title="Fortegn og enheter"
                 class="w-4 h-4 inline-flex items-center justify-center rounded-full border border-sky-500 text-sky-300 hover:bg-sky-900/60 text-[10px] font-bold leading-none normal-case">?</button>
       </span>`,
      `
      <textarea id="line-table" data-line="table" data-focus-key="line-table" rows="6" spellcheck="false"
        class="w-full font-mono text-[11px] leading-snug"
        title="Lim inn fra Excel eller rammeprogrammet. Kolonner: z [m], N total [kN], M_x [kNm], M_y [kNm], N_før [kN]. Hopp i N: to rader med samme z. N_før er last som sto på før forsterkningen — den blir i den eksisterende delen."
        placeholder="z [m]   N [kN]   M_x [kNm]   M_y [kNm]   N_før [kN]&#10;0       60       0           0           0&#10;3,2     60       0           0           0&#10;3,2     85       0           0           0">${escapeHtml(line.table || '')}</textarea>
      <p class="text-[10px] mt-1">${status}</p>`,
      `<button data-line-prompt title="Kopierer en instruksjon til din egen AI: den gjør om lastunderlaget ditt til tabellen her, og foreslår og begrunner innstillingene under."
               class="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0 normal-case tracking-normal">Kopier prompt</button>`
    ),
    H('Utstrekning', `
      <div class="grid grid-cols-2 gap-1.5">
        ${num('za', 'z_a [m] (tom = tabellens start)', line.za, 'step="0.1"')}
        ${num('zb', 'z_b [m] (tom = tabellens slutt)', line.zb, 'step="0.1"')}
        <div><label class="field-label" for="line-endA">Ende ved z_a</label>${sel('endA', line.endA, ENDS)}</div>
        <div><label class="field-label" for="line-endB">Ende ved z_b</label>${sel('endB', line.endB, ENDS)}</div>
      </div>`),
    H('Skruesoner', zonesHtml(lr, state), lr && lr.zones && lr.zones.length
      ? `<span class="flex gap-1">
           <button data-zact="suggest" title="Foreslå soner slik at største kraft per skrue holder seg under et mål"
             class="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0 normal-case tracking-normal">Foreslå…</button>
           <button data-zact="endzones" title="To symmetriske, tettere endesoner i én operasjon"
             class="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0 normal-case tracking-normal">Endesoner…</button>
         </span>`
      : ''),
    H('Forutsetninger', `
      <div class="space-y-1.5">
        <div title="I et fagverk fører knutepunktet N inn i det eksisterende profilet. Da gir N et moment om det sammensatte tyngdepunktet, med mindre delen er fastholdt.">
          <label class="field-label" for="line-nAt">N angriper i</label>
          ${sel('nAt', line.nAt, [{ key: 'existing', label: 'Det eksisterende tyngdepunktet' }, { key: 'composite', label: 'Det sammensatte tyngdepunktet' }], '— velg —')}
        </div>
        <div title="Fastholdt: omgivelsene hindrer bøyning om aksen og tar momentet. Kan endre toppkraften med en faktor 2 for en del på siden av gurten — derfor ingen standard.">
          <label class="field-label" for="line-restraint">Sideveis fastholding</label>
          ${sel('restraint', line.restraint, RESTRAINTS, '— velg —')}
        </div>
        <div class="grid grid-cols-2 gap-1.5" title="Tøyningen hver del ville fått uten last (fukt, kryp, temperatur). Skjøten holder igjen forskjellen. Negativ = krymping.">
          ${num('epsExisting', 'Fri tøyning ε_eks [‰]', line.epsExisting, 'step="0.05"')}
          ${num('epsNew', 'Fri tøyning ε_ny [‰]', line.epsNew, 'step="0.05"')}
        </div>
      </div>`),
  ].join('');
}

/** Binder input-feltene i venstre panel til store. */
export function bindLineInputs(host, store, { onHelp, onCopyPrompt } = {}, lr = null) {
  if (lr && lr.zones && lr.zones.length && lr.base) {
    const zones = lr.zones;
    const base = lr.base;
    host.querySelectorAll('[data-zone]').forEach((el) => {
      el.addEventListener('change', () => {
        zoneMsg = null;
        const [i, key] = el.dataset.zone.split(':');
        const idx = Number(i);
        if (key === 'zEnd' || key === 'len') {
          const raw = String(el.value).trim();
          const v = Number(raw.replace(',', '.'));
          if (raw === '' || !Number.isFinite(v)) {
            flash(raw === '' ? 'Tomt felt (eller ikke et tall) — grensen står uendret.' : `«${escapeHtml(raw)}» er ikke et tall — grensen står uendret.`, 'warn');
            store.setLine({ zones: setZoneField(zones, 0, 'noop', null, base) });
            return;
          }
          // Lengde: endrer slutten på sonen — den siste endrer starten sin.
          const last = idx === zones.length - 1;
          const bi = key === 'len' && last ? idx - 1 : idx;
          const want = key === 'zEnd' ? v : last ? zones[idx].z1 - v : zones[idx].z0 + v;
          const lo = zones[bi].z0 + 0.01;
          const hi = zones[bi + 1].z1 - 0.01;
          if (want < lo - 1e-9 || want > hi + 1e-9) {
            const got = Math.min(hi, Math.max(lo, want));
            flash(key === 'len'
              ? `Lengden må være mellom 0,01 og ${n((last ? zones[idx].z1 - lo : hi - zones[idx].z0), 2)} m, så ingen sone forsvinner — satt til ${n(Math.abs((last ? zones[idx].z1 : zones[idx].z0) - got), 2)} m.`
              : `Grensen må ligge mellom ${n(lo, 2)} og ${n(hi, 2)} m, så ingen sone forsvinner — satt til ${n(got, 2)} m.`, 'warn');
          }
          store.setLine({ zones: moveBoundary(zones, bi, want, base) });
          return;
        }
        store.setLine({ zones: setZoneField(zones, idx, key, el.value, base) });
      });
    });
    host.querySelectorAll('[data-zact]').forEach((el) => {
      el.addEventListener('click', () => {
        const [act, i] = el.dataset.zact.split(':');
        if (act !== 'suggest' && act !== 'endzones') zoneMsg = null;
        if (act === 'split') store.setLine({ zones: splitZone(zones, Number(i), base) });
        if (act === 'del') store.setLine({ zones: deleteZone(zones, Number(i), base) });
        if (act === 'endzones' || act === 'suggest') {
          const form = host.querySelector(act === 'suggest' ? '[data-suggest-form]' : '[data-endzones-form]');
          if (form) form.hidden = !form.hidden;
        }
        if (act === 'suggest-make') {
          const target = Number(String(host.querySelector('#line-sg-target').value).replace(',', '.'));
          const minLen = Number(String(host.querySelector('#line-sg-min').value).replace(',', '.'));
          const spText = host.querySelector('#line-sg-sp').value;
          const spacings = spText.split(/[\s;,]+/).map(Number).filter((v) => v > 0);
          const len = zones[zones.length - 1].z1 - zones[0].z0;
          const problems = [];
          if (!(target > 0)) problems.push('målet må være et tall større enn 0');
          if (!spacings.length) problems.push('oppgi minst én avstand, f.eks. «50 100 200»');
          if (!(minLen > 0) || minLen > len) problems.push(`minste sonelengde må være mellom 0 og ${n(len, 2)} m`);
          store.setLine({ suggest: { target: target > 0 ? target : null, spacings: spText, minLen: minLen > 0 ? minLen : 0.5 } });
          if (problems.length) {
            flash(`Kan ikke foreslå: ${problems.join('; ')}.`, 'warn');
            store.setLine({});
            return;
          }
          const r = suggestFor(lr, { target: target * 1000, spacings, minLen: minLen * 1000 });
          if (!r) return;
          flash(r.ok
            ? `Forslag: ${r.count} soner, F maks ${n(r.Fmax / 1000, 2)} kN ≤ ${n(target, 2)} kN. Juster gjerne etterpå.`
            : `Målet nås ikke: F = ${n(r.worst.F / 1000, 2)} kN ved z = ${n(r.worst.z / 1000, 2)} m selv med a = ${Math.min(...spacings)} mm. Prøv flere rader, sterkere skrue eller tettere avstand.`,
          r.ok ? 'info' : 'warn');
          store.setLine({ zones: r.zones });
        }
        if (act === 'endzones-make') {
          const L = Number(String(host.querySelector('#line-endL').value).replace(',', '.'));
          const aEnd = Number(host.querySelector('#line-endA-a').value);
          const next = endZones(zones, zones[0].z0, zones[zones.length - 1].z1, L, aEnd, base);
          if (next) store.setLine({ zones: next });
          else {
            const msg = host.querySelector('[data-endzones-msg]');
            if (msg) msg.textContent = 'Lengden må være > 0 og mindre enn halve delen, og a > 0.';
          }
        }
      });
    });
  }
  const help = host.querySelector('[data-line-help]');
  if (help && onHelp) help.addEventListener('click', (e) => { e.stopPropagation(); onHelp(help); });
  const prompt = host.querySelector('[data-line-prompt]');
  if (prompt && onCopyPrompt) prompt.addEventListener('click', () => onCopyPrompt());
  host.querySelectorAll('[data-line]').forEach((el) => {
    const key = el.dataset.line;
    el.addEventListener('change', () => {
      const raw = el.value;
      if (key === 'table' || key === 'endA' || key === 'endB' || key === 'nAt' || key === 'restraint') {
        store.setLine({ [key]: raw });
      } else if (key === 'za' || key === 'zb') {
        store.setLine({ [key]: raw === '' ? null : Number(raw) });
      } else {
        store.setLine({ [key]: Number(raw) || 0 });
      }
    });
  });
}

/**
 * Sonelisten: én rad per sone. Grensene ligger mellom sonene, så å endre
 * «til» flytter starten på neste — aldri hull eller overlapp. Tomt felt =
 * skjøtens standard (vist som plassholder).
 */
/**
 * Melding under sonelisten (rettet verdi, forslagets resultat). Står til
 * neste endring av sonene — panelet tegnes ofte (musa over lerretet o.l.),
 * så den kan ikke forsvinne ved første omtegning.
 */
let zoneMsg = null;
function flash(text, level = 'info') {
  zoneMsg = { text, level };
}

function zonesHtml(lr, state) {
  if (!lr || !lr.zones || !lr.zones.length || !lr.base) {
    return '<p class="text-[11px] text-slate-500 italic">Lim inn lastdiagrammet og velg skjøt først.</p>';
  }
  const base = lr.base;
  const kHead = base.ec5 ? 'd [mm]' : 'K_ser';
  const kTip = base.ec5
    ? 'Skruediameter i sonen — K regnes etter EC5 tabell 7.1 med skjøtens skruetype og densitet. Tom = skjøtens d.'
    : 'Glidningsmodul per skrue i sonen [N/mm]. Tom = skjøtens K_ser.';
  const stats = lr.ok && lr.zoneStats ? lr.zoneStats : null;
  const inp = (i, key, value, placeholder, attrs = '') => `<input data-zone="${i}:${key}" data-focus-key="zone-${i}-${key}" id="zone-${i}-${key}" type="number" ${attrs}
      class="w-full !px-1 !py-0.5 text-[11px] num" value="${value == null ? '' : value}" placeholder="${placeholder}" />`;
  const rows = lr.zones
    .map((zn, i) => {
      const last = i === lr.zones.length - 1;
      return `<tr class="border-t border-slate-700/60">
        <td class="py-0.5 pr-1 num text-slate-400 whitespace-nowrap">${n(zn.z0, 2)}</td>
        <td class="py-0.5 pr-1 w-14">${last ? `<span class="num text-slate-400 px-1">${n(zn.z1, 2)}</span>` : inp(i, 'zEnd', zn.z1, '', 'step="0.05"')}</td>
        <td class="py-0.5 pr-1 w-12">${lr.zones.length > 1 ? inp(i, 'len', Math.round((zn.z1 - zn.z0) * 1000) / 1000, '', 'step="0.05" min="0.01"') : `<span class="num text-slate-400 px-1">${n(zn.z1 - zn.z0, 2)}</span>`}</td>
        <td class="py-0.5 pr-1 w-10">${inp(i, 'rows', zn.rows !== base.rows ? zn.rows : '', base.rows, 'step="1" min="1"')}</td>
        <td class="py-0.5 pr-1 w-12">${inp(i, 'a', zn.a !== base.a ? zn.a : '', base.a, 'step="5" min="1"')}</td>
        <td class="py-0.5 pr-1 w-16">${base.ec5 ? inp(i, 'd', zn.d, base.d || '', 'step="0.5" min="1"') : inp(i, 'Kser', zn.Kser, Math.round(base.K) || '', 'step="100" min="1"')}</td>
        <td class="py-0.5 pr-1 num text-right text-slate-400">${stats ? stats[i].count : ''}</td>
        <td class="py-0.5 whitespace-nowrap text-right">
          <button data-zact="split:${i}" title="Del sonen på midten" class="px-1 text-slate-400 hover:text-white">÷</button>
          ${lr.zones.length > 1 ? `<button data-zact="del:${i}" title="Fjern sonen — naboen tar over lengden" class="px-1 text-slate-400 hover:text-red-400">✕</button>` : ''}
        </td>
      </tr>`;
    })
    .join('');
  const total = stats ? stats.reduce((t, z) => t + z.count, 0) : null;
  const msg = zoneMsg;
  const sg = (state && state.line && state.line.suggest) || { target: null, spacings: '50 75 100 150 200', minLen: 0.5 };
  const suggest = stats ? n((2 * stats[0].Lc) / 1000, 2) : '';
  return `<table class="w-full text-[11px]">
      <thead><tr class="text-slate-500">
        <th class="text-left font-normal py-1">z fra</th>
        <th class="text-left font-normal py-1" title="Flytter også starten på neste sone">z til [m]</th>
        <th class="text-left font-normal py-1" title="Endrer slutten på sonen (den siste: starten), så naboen tar opp forskjellen">lengde</th>
        <th class="text-left font-normal py-1">rader</th>
        <th class="text-left font-normal py-1">a [mm]</th>
        <th class="text-left font-normal py-1" title="${escapeHtml(kTip)}">${kHead}</th>
        <th class="text-right font-normal py-1" title="lengde/a · rader">skruer</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${total != null ? `<p class="text-[10px] text-slate-400 mt-1 text-right">totalt ${total} skruer${lr.pick && lr.pick.pair ? ' per skjøt' : ''}</p>` : ''}
    ${msg ? `<p class="text-[11px] mt-1 leading-snug ${msg.level === 'warn' ? 'text-amber-300' : 'text-sky-300'}">${msg.text}</p>` : ''}
    <div data-suggest-form hidden class="mt-1.5 rounded border border-slate-700 bg-slate-900/60 p-2 space-y-1.5">
      <div class="grid grid-cols-2 gap-1.5">
        <div title="Typisk R_v,d per skrue fra EC5-knutepunkt. Verktøyet regner ingen kapasitet — dette er et tall du oppgir.">
          <label class="field-label" for="line-sg-target">Mål: F maks per skrue [kN]</label>
          <input id="line-sg-target" type="number" step="0.1" min="0" value="${sg.target ?? ''}" placeholder="f.eks. R_v,d" /></div>
        <div><label class="field-label" for="line-sg-min">Minste sonelengde [m]</label>
          <input id="line-sg-min" type="number" step="0.1" min="0.05" value="${sg.minLen}" /></div>
      </div>
      <div><label class="field-label" for="line-sg-sp">Tillatte avstander a [mm]</label>
        <input id="line-sg-sp" type="text" value="${escapeHtml(sg.spacings)}" placeholder="50 75 100 150 200" /></div>
      <div class="flex items-center justify-between gap-2">
        <span class="text-[10px] text-slate-500">Rader og skrue fra første sone. Regnes med K_ser.</span>
        <button data-zact="suggest-make" class="px-2 py-0.5 text-[11px] bg-sky-700 hover:bg-sky-600 rounded">Foreslå soner</button>
      </div>
    </div>
    <div data-endzones-form hidden class="mt-1.5 rounded border border-slate-700 bg-slate-900/60 p-2 space-y-1.5">
      <div class="grid grid-cols-2 gap-1.5">
        <div><label class="field-label" for="line-endL">Lengde per ende [m]</label>
          <input id="line-endL" type="number" step="0.1" min="0" placeholder="${suggest ? `≈ 2/λ = ${suggest}` : ''}" value="${suggest ? suggest.replace(',', '.') : ''}" /></div>
        <div><label class="field-label" for="line-endA-a">a i endene [mm]</label>
          <input id="line-endA-a" type="number" step="5" min="1" value="${Math.max(10, Math.round((lr.zones[0].a || base.a) / 2))}" /></div>
      </div>
      <div class="flex items-center justify-between gap-2">
        <span data-endzones-msg class="text-[10px] text-amber-300"></span>
        <button data-zact="endzones-make" class="px-2 py-0.5 text-[11px] bg-sky-700 hover:bg-sky-600 rounded">Lag endesoner</button>
      </div>
      <p class="text-[10px] text-slate-500">Lager tre soner: tette ender og midten med dagens avstand. 2/λ er lengden toppen bygges opp over med dagens avstand.</p>
    </div>`;
}

/* ================================================================== *
 * 2b. Fortegn og AI-prompt
 * ================================================================== */

/** Det som gjelder tabellen spesielt; aksefiguren (`axisConventionHtml`) følger under. */
export function lineConventionHtml() {
  const row = (k, v) => `<tr class="border-t border-slate-700/60"><td class="py-1 pr-3 align-top font-semibold text-slate-200 whitespace-nowrap">${k}</td><td class="py-1 text-slate-300">${v}</td></tr>`;
  return `<table class="w-full text-[11px]"><tbody>
    ${row('z [m]', 'Posisjon langs den nye delen (bjelkeaksen z), stigende. Mellom radene interpoleres lineært.')}
    ${row('N [kN]', 'Total normalkraft i det sammensatte tverrsnittet. <strong>Strekk positiv</strong>, trykk negativ.')}
    ${row('M_x [kNm]', 'Moment om x-aksen (vannrett i tegningen). Positiv gir <strong>strekk i overkant</strong>.')}
    ${row('M_y [kNm]', 'Moment om y-aksen (loddrett). Positiv gir <strong>strekk på høyre side</strong> — motsatt av mange rammeprogram; snu fortegnet om nødvendig.')}
    ${row('N_før [kN]', 'Del av N som sto på før forsterkningen ble montert. Blir i den eksisterende delen. 0 hvis ubelastet ved montering.')}
    ${row('Hopp', 'To rader med samme z: verdien rett før, så rett etter (typisk ved et knutepunkt).')}
    ${row('Tall', 'Komma eller punktum som desimaltegn; tab, semikolon eller mellomrom mellom kolonnene; overskriftslinjer hoppes over.')}
  </tbody></table>`;
}

const RESTRAINT_TEXT = {
  free: 'fri — kan bøye om begge akser',
  y: 'fastholdt om y-aksen (sideveis)',
  x: 'fastholdt om x-aksen',
  xy: 'fastholdt om begge akser',
};

/**
 * Prompten brukeren gir sin egen AI: gjør om lastunderlaget til tabellen
 * her, og foreslå og begrunn innstillingene. Tar med delene i tegningen og
 * det som alt er valgt, så svaret passer modellen.
 */
export function aiPrompt(state) {
  const st = state || {};
  const unit = st.unit || 'mm';
  const shapes = (st.shapes || []).filter((x) => x && x.include !== false && x.role !== 'void');
  const list = (stage) => shapes.filter((x) => (x.stage === 'new') === (stage === 'new'))
    .map((x) => `${x.name || x.id}${x.material && x.material.name ? ` (${x.material.name})` : ''}`).join(', ') || '—';
  const line = st.line || {};
  const chosen = [
    line.za != null || line.zb != null ? `utstrekning z_a = ${line.za ?? '(tabellens start)'} m, z_b = ${line.zb ?? '(tabellens slutt)'} m` : null,
    `ender: ${line.endA === 'fixed' ? 'festet' : 'løs'} ved z_a, ${line.endB === 'fixed' ? 'festet' : 'løs'} ved z_b`,
    line.nAt ? `N angriper i ${line.nAt === 'existing' ? 'det eksisterende' : 'det sammensatte'} tyngdepunktet` : null,
    line.restraint ? `sideveis: ${RESTRAINT_TEXT[line.restraint]}` : null,
  ].filter(Boolean);

  return `Du skal hjelpe meg å gjøre om et lastunderlag til inndata for «linjeberegningen» i Geometri-workspace (structural_tools). Den regner ut kreftene i skjøten (skruer, lim, sveis) mellom en eksisterende konstruksjonsdel og en ny forsterkningsdel langs hele den nye delen, med delvis samvirke (Volkersen/Newmark).

# Det jeg vil ha tilbake
1. En TABELL, tabulatorseparert, med overskriftslinje og nøyaktig disse kolonnene i denne rekkefølgen:
   z [m]	N [kN]	M_x [kNm]	M_y [kNm]	N_før [kN]
2. Et forslag til INNSTILLINGENE nedenfor, med én–to setninger begrunnelse for hvert valg. Si tydelig fra der underlaget ikke gir svaret eller du må anta noe — ikke gjett i stillhet.
3. En kort liste over antakelser du har gjort (lastkombinasjon, fortegn du har snudd, punkter du har lagt til).

# Tabellen — regler
- z: posisjon langs den nye delen i meter, regnet fra ett endepunkt, stigende. Ta med alle punkter der lasten endrer seg: knutepunkt, punktlaster, opplegg, endene av forsterkningen. Mellom radene interpoleres lineært, så en jevnt varierende last trenger nok punkter til at kurven blir riktig (moment under jevnt fordelt last: minst 5–10 punkter per felt).
- HOPP: der N eller M endrer seg sprangvis (typisk ved et knutepunkt i et fagverk eller under en punktlast), skriv TO rader med samme z — først verdien rett før, så verdien rett etter.
- N: total normalkraft i den ferdig forsterkede delen. Strekk positiv, trykk negativ.
- M_x: moment om tverrsnittets x-akse (vannrett akse i tverrsnittstegningen, y peker opp). Positiv gir strekk i overkant.
- M_y: moment om y-aksen (loddrett akse, x peker mot høyre). Positiv gir strekk på høyre side. MERK: dette er motsatt av vanlig bjelkekonvensjon i mange rammeprogram — snu fortegnet hvis underlaget bruker M_y = −∫σ·x dA, og si at du har gjort det.
- N_før: den delen av N som allerede sto på den eksisterende delen da forsterkningen ble montert (egenvekt, permanent last som ikke avlastes). Den blir i den eksisterende delen og belaster ikke skjøten. Sett 0 hvis delen er ubelastet (avstivet/avlastet) ved montering. Moment som sto på før montering er ikke med i modellen — si fra hvis det er betydelig.
- Lastkombinasjon: én tabell per kombinasjon. For skruekreftene: bruk den dimensjonerende kombinasjonen i bruddgrensetilstand. Lag gjerne flere tabeller hvis ulike kombinasjoner gir størst N og størst M.
- Enheter: m, kN, kNm. Ingen tusenskiller.

# Innstillingene — hva de betyr og når de velges
- UTSTREKNING z_a og z_b [m]: hvor den nye delen starter og slutter, i samme z som tabellen. Står de tomme, brukes hele tabellen.
- ENDE ved z_a og ved z_b, hver for seg:
  · «Løs ende»: den nye delen er bare festet med skruer langs delen og stopper der. Kraften i den er null i enden, og hele andelen må inn gjennom skruene nær enden — dette gir de største skruekreftene.
  · «Festet i knutepunkt»: den nye delen er koblet direkte inn i knutepunktet (plater, bolter, kontakt mot knutepunktsdel), så den tar sin andel derfra. Da må knutepunktsforbindelsen dimensjoneres for kraften i den nye delen, og verktøyet oppgir den.
  · Er det usikkert, velg løs ende — det er på den sikre siden for skruene.
- N ANGRIPER I:
  · «Det eksisterende tyngdepunktet» når lasten føres inn i den eksisterende delen og den nye bare henger på langs (typisk en fagverksgurt der knutepunktet sitter på det eksisterende profilet). Det gir et moment når delene ligger eksentrisk.
  · «Det sammensatte tyngdepunktet» når lasten fordeles på begge delene, eller når kreftene i underlaget allerede er regnet på det forsterkede tverrsnittet med lasten i dets tyngdepunkt.
- SIDEVEIS FASTHOLDING — om delen kan bøye ut om en akse når N angriper eksentrisk:
  · «Fri»: ingenting hindrer bøyning om noen akse.
  · «Fastholdt om y-aksen (sideveis)»: f.eks. taktro, lekter, plater eller avstivning hindrer utbøyning sideveis.
  · «Fastholdt om x-aksen» / «om begge akser»: tilsvarende for den andre aksen eller begge.
  · Valget kan endre toppkraften i skruene med en faktor 2 for en forsterkning som ligger på siden av gurten. Begrunn det ut fra hva som faktisk holder delen.
- FRI TØYNING ε_eks og ε_ny [‰]: tøyningen hver del ville fått uten last og uten skruer — svinn eller svelling fra fuktendring (negativt = krymping), kryp under N_før, temperatur. Typisk: ny trelast som tørker inn i et tørt bygg krymper mer enn den gamle (f.eks. 1 % fuktendring ≈ 0,1 ‰ langs fibrene for nåletre — oppgi kilde/antakelse). Sett 0 hvis det ikke er grunnlag, og si fra.
- SKJØTEDATA legges inn i verktøyet per skjøt (ikke i tabellen): antall skruerader, skrueavstand a langs delen [mm] og glidningsmodul K_ser per skrue [N/mm] (EC5 tabell 7.1 eller ETA), og eventuelt q_T [kN/m] — last som henges opp gjennom skjøten vinkelrett på skjøteflaten.

# Mitt tverrsnitt (fra tegningen)
- Enhet i tegningen: ${unit}. x mot høyre, y opp; bjelkeaksen z går ut av tegningen.
- Eksisterende: ${list('existing')}
- Ny: ${list('new')}
${chosen.length ? `- Valgt så langt: ${chosen.join('; ')}.\n` : ''}
# Underlaget
[Lim inn lastunderlaget her: snittkrefter fra rammeprogrammet, tabell, skjermbilde av diagram, eller beskrivelse av system og laster.]
`;
}

/* ================================================================== *
 * 3. Resultat (høyre panel)
 * ================================================================== */

/** Plukker ut ≤ 400 punkter, men beholder alltid ytterpunktene. */
function decimate(x, ys) {
  const step = Math.max(1, Math.ceil(x.length / 400));
  const idx = [];
  for (let i = 0; i < x.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== x.length - 1) idx.push(x.length - 1);
  // Topper skal ikke forsvinne i utplukket: ta med største |y| for hver serie.
  for (const y of ys) {
    let im = 0;
    for (let i = 1; i < y.length; i++) if (Math.abs(y[i]) > Math.abs(y[im])) im = i;
    if (!idx.includes(im)) idx.push(im);
  }
  idx.sort((a, b) => a - b);
  return idx;
}

/**
 * Lite linjeplott. `series`: [{y, color, dash, label}], x i m.
 * Fargene kommer inn som verdier, så samme funksjon tegner både skjerm og
 * rapport (der det er lys bakgrunn).
 */
export function plotSvg({ title, unit, x, series, palette, marks = [] }) {
  const P = palette || { text: '#94a3b8', grid: '#334155', title: '#cbd5e1' };
  const W = 480, H = 156, Lm = 46, R = 8, T = 34, B = 20;
  const all = series.flatMap((s) => s.y);
  let lo = Math.min(0, ...all);
  let hi = Math.max(0, ...all);
  if (hi - lo < 1e-9) hi = lo + 1;
  const pad = (hi - lo) * 0.08;
  hi += pad;
  if (lo < 0) lo -= pad;
  const x0 = x[0];
  const x1 = x[x.length - 1];
  const X = (v) => Lm + ((v - x0) / (x1 - x0 || 1)) * (W - Lm - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const idx = decimate(x, series.map((s) => s.y));
  const fmt = (v) => n(v, Math.abs(v) >= 100 ? 0 : 1);
  const out = [];
  out.push(`<text x="${Lm}" y="11" fill="${P.title}" font-size="11">${title}</text>`);
  out.push(`<text x="${W - R}" y="11" fill="${P.text}" font-size="10" text-anchor="end">${unit}</text>`);
  out.push(`<line x1="${Lm}" y1="${Y(0)}" x2="${W - R}" y2="${Y(0)}" stroke="${P.grid}" />`);
  for (const v of [hi / (1 + 0.08), lo < 0 ? lo / (1 + 0.08) : null]) {
    if (v == null) continue;
    out.push(`<text x="${Lm - 4}" y="${Y(v) + 3}" fill="${P.text}" font-size="9" text-anchor="end">${fmt(v)}</text>`);
  }
  for (let i = 0; i <= 4; i++) {
    const v = x0 + ((x1 - x0) * i) / 4;
    out.push(`<text x="${X(v)}" y="${H - 6}" fill="${P.text}" font-size="9" text-anchor="middle">${n(v, 2)}${i === 4 ? ' m' : ''}</text>`);
  }
  // Sonegrensene (#71) som stiplede loddrette linjer.
  for (const m of marks) {
    out.push(`<line x1="${X(m).toFixed(1)}" y1="${T}" x2="${X(m).toFixed(1)}" y2="${H - B}" stroke="${P.text}" stroke-width="0.8" stroke-dasharray="2 3" />`);
  }
  for (const s of series) {
    const d = idx.map((i, k) => `${k ? 'L' : 'M'}${X(x[i]).toFixed(1)} ${Y(s.y[i]).toFixed(1)}`).join(' ');
    out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.6" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} />`);
  }
  const legend = series.filter((s) => s.label).map((s, i) =>
    `<g transform="translate(${Lm + i * 140} 25)"><line x1="0" y1="0" x2="14" y2="0" stroke="${s.color}" stroke-width="1.6" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''}/><text x="18" y="3" fill="${P.text}" font-size="9">${s.label}</text></g>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${title}" font-family="ui-sans-serif, system-ui, sans-serif">${out.join('')}${legend}</svg>`;
}

const SCREEN = { existing: '#60a5fa', fresh: '#fb923c', q: '#60a5fa', anchor: '#e879f9', inf: '#94a3b8' };

/** Plottene langs z: kraft i delene, og q. */
export function linePlots(lr, palette, colors = SCREEN) {
  const r = lr.res;
  const x = r.ser.z.map((z) => z / 1000);
  const kN = (a) => a.map((v) => v / 1000);
  const forces = plotSvg({
    title: 'Kraft i delene langs z',
    unit: 'kN',
    x,
    palette,
    series: [
      { y: kN(r.u.N1), color: colors.existing, label: 'N₁ eksisterende (K_u)' },
      { y: kN(r.ser.N2), color: colors.fresh, label: 'N₂ ny (K_ser)' },
      { y: kN(r.ser.Ninf), color: colors.inf, dash: '3 3', label: 'N₂∞ full samvirkning' },
    ],
  });
  const marks = (lr.zones || []).slice(0, -1).map((zn) => zn.z1);
  const perScrew = plotSvg({
    title: 'Kraft per skrue F = q·a/rader',
    unit: 'kN',
    x,
    palette,
    marks,
    series: [
      { y: r.ser.F.map((v) => v / 1000), color: colors.anchor, label: 'K_ser' },
      { y: r.u.F.map((v) => v / 1000), color: colors.anchor, dash: '4 3', label: 'K_u = ⅔·K_ser' },
    ],
  });
  const flow = plotSvg({
    title: `Kraft gjennom skjøten q${lr.share < 1 ? ' (per skjøt)' : ''}`,
    unit: 'kN/m',
    x,
    palette,
    marks,
    series: [
      { y: r.ser.q.map((v) => v * lr.share), color: colors.anchor, label: 'K_ser' },
      { y: r.u.q.map((v) => v * lr.share), color: colors.anchor, dash: '4 3', label: 'K_u = ⅔·K_ser' },
    ],
  });
  return { forces, perScrew, flow };
}

/** Tabell per sone: lengde, skruer, a, K og største kraft per skrue. */
export function zoneStatsTable(lr, { screen = true } = {}) {
  if (!lr.ok || !lr.zoneStats) return '';
  const td = screen ? 'py-0.5 pl-2 text-right num' : 'num';
  const body = lr.zoneStats
    .map((z) => `<tr${screen ? ' class="border-t border-slate-700/60"' : ''}>
        <td${screen ? ' class="py-0.5 pr-2 num text-slate-300 whitespace-nowrap"' : ''}>${n(z.z0, 2)}–${n(z.z1, 2)}</td>
        <td class="${td}">${z.rows}</td>
        <td class="${td}">${n(z.a, 0)}</td>
        <td class="${td}">${n(z.K, 0)}</td>
        <td class="${td}">${z.count}</td>
        <td class="${td}${screen ? ' text-white font-semibold' : ''}">${n(z.Fser, 2)}</td>
        <td class="${td}">${n(z.zAt, 2)}</td>
      </tr>`)
    .join('');
  const th = (t, tip = '') => `<th${screen ? ' class="text-right font-normal py-1 pl-2"' : ' class="num"'}${tip ? ` title="${escapeHtml(tip)}"` : ''}>${t}</th>`;
  return `<table class="${screen ? 'w-full text-[11px]' : ''}">
      <thead><tr${screen ? ' class="text-slate-500"' : ''}>
        <th${screen ? ' class="text-left font-normal py-1"' : ''}>Sone z [m]</th>
        ${th('rader')}${th('a [mm]')}${th('K_ser [N/mm]')}${th('skruer')}
        ${th('F maks [kN]', 'Største kraft per skrue i sonen (K_ser)')}${th('ved z [m]')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Rader i resultattabellen: [etikett, K_ser, K_u, hvilken som styrer, tooltip]. */
export function lineRows(lr) {
  const s = lr.summary;
  const rows = [
    [`q_max [kN/m]<br><span class="opacity-70">z = ${n(s.qMax.z, 2)} m</span>`, n(Math.abs(s.qMax.ser), 1), n(Math.abs(s.qMax.u), 1), 'ser', 'Største kraft gjennom skjøten per meter. Stivere skjøt gir høyere topp, så K_ser styrer.'],
    [`Mest belastede skrue F_v [kN]<br><span class="opacity-70">z = ${n(s.Fv.z, 2)} m · ${s.rows} rad${s.rows === 1 ? '' : 'er'}, a = ${n(s.a, 0)} mm</span>`, n(s.Fv.ser, 2), n(s.Fv.u, 2), 'ser', 'Største kraft per skrue langs delen, F = K·δ = q·a/rader — skjær i den mest belastede skruen. Til kontroll i EC5-knutepunkt.'],
  ];
  if (s.Fax != null) rows.push(['Ytterste skrue F_ax [kN] (fra q_T)', n(s.Fax, 2), n(s.Fax, 2), null, 'q_T·a/rader — uttrekk når skruen står vinkelrett på skjøteflaten. Kombineres med F_v i EC5 8.7.3.']);
  if (s.N2a) rows.push(['N₂ inn i knutepunktet ved z_a [kN]', n(s.N2a.ser, 1), n(s.N2a.u, 1), 'ser', 'Festet ende: kraften i den nye delen går gjennom knutepunktsforbindelsen, ikke gjennom skruene.']);
  if (s.N2b) rows.push(['N₂ inn i knutepunktet ved z_b [kN]', n(s.N2b.ser, 1), n(s.N2b.u, 1), 'ser', 'Festet ende: kraften i den nye delen går gjennom knutepunktsforbindelsen, ikke gjennom skruene.']);
  rows.push([`N₁ maks, eksisterende [kN]<br><span class="opacity-70">z = ${n(s.N1max.z, 2)} m</span>`, n(s.N1max.ser, 1), n(s.N1max.u, 1), 'u', 'Kraften som blir igjen i den eksisterende delen. Mykere skjøt gir mer, så K_u styrer.']);
  rows.push(['η = N₂ / N₂∞', s.eta.ser == null ? '–' : n(s.eta.ser, 3), s.eta.u == null ? '–' : n(s.eta.u, 3), 'u', 'Hvor mye av andelen ved full samvirkning den nye delen faktisk får, der den er størst.']);
  rows.push([
    `Karakteristisk lengde 1/λ [mm]${s.zones > 1 ? '<br><span class="opacity-70">tetteste–glisneste sone</span>' : ''}`,
    s.zones > 1 ? `${n(s.Lc.ser, 0)}–${n(s.Lc.serMax, 0)}` : n(s.Lc.ser, 0),
    s.zones > 1 ? `${n(s.Lc.u, 0)}–${n(s.Lc.uMax, 0)}` : n(s.Lc.u, 0),
    null,
    'Kraften bygges 63 % opp over 1/λ og 95 % over 3/λ. Med soner har hver sone sin egen 1/λ.',
  ]);
  rows.push([`Skruer totalt${s.zones > 1 ? ` (${s.zones} soner)` : ''}`, String(s.count), String(s.count), null, 'Summen av lengde/a · rader over sonene — til mengdeberegning.']);
  return rows;
}

/* ------------------------------------------------------------------ *
 * Skruekraften langs skjøten
 * ------------------------------------------------------------------ */

/** Lineær interpolasjon i (xs, ys) ved x. */
function interp(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid;
  }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}

/** Feltgrensene: endene og hoppene i diagrammet [mm]. */
function featureZ(lr) {
  const za = lr.za * 1000;
  const zb = lr.zb * 1000;
  const jumps = (lr.table.jumps || []).map((z) => z * 1000).filter((z) => z > za && z < zb);
  return [...new Set([za, ...jumps, zb])].sort((a, b) => a - b);
}

/**
 * Største |q| og kraft per skrue i hvert felt mellom to knutepunkt i
 * lastdiagrammet (eller endene). Det er tallene man trenger for å velge
 * skrueavstand felt for felt: toppene sitter i endene og ved hoppene.
 * @returns {Array<{z0:number, z1:number, qSer:number, qU:number, zAt:number, FvSer:number, FvU:number}>}  z i m, q i kN/m, F i kN
 */
export function lineZones(lr) {
  if (!lr || !lr.ok) return [];
  const f = featureZ(lr);
  const peak = (run, arr, z0, z1) => {
    let best = 0;
    let at = z0;
    for (let i = 0; i < run.z.length; i++) {
      const z = run.z[i];
      if (z < z0 - 1e-9 || z > z1 + 1e-9) continue;
      if (Math.abs(arr[i]) > Math.abs(best)) { best = arr[i]; at = z; }
    }
    return { v: Math.abs(best), at };
  };
  const out = [];
  for (let i = 0; i < f.length - 1; i++) {
    const r = lr.res;
    const qs = peak(r.ser, r.ser.q, f[i], f[i + 1]);
    const qu = peak(r.u, r.u.q, f[i], f[i + 1]);
    const Fs = peak(r.ser, r.ser.F, f[i], f[i + 1]);
    const Fu = peak(r.u, r.u.F, f[i], f[i + 1]);
    out.push({ z0: f[i] / 1000, z1: f[i + 1] / 1000, qSer: qs.v * lr.share, qU: qu.v * lr.share, zAt: Fs.at / 1000, FvSer: Fs.v / 1000, FvU: Fu.v / 1000 });
  }
  return out;
}

/**
 * q(z) og kreftene langs hele delen som tabulatorseparert tekst, til Excel
 * eller videre beregning. Jevn deling (standard 0,05 m) pluss endene og
 * hoppene, så toppene alltid er med. |q| og kraft per skrue er størrelser
 * (retningen skifter langs delen); N₁ og N₂ har fortegn (strekk positiv).
 */
export function qTableTsv(lr, step = 0.05) {
  if (!lr || !lr.ok) return '';
  const zs = new Set();
  for (let z = lr.za; z < lr.zb - 1e-9; z += step) zs.add(Math.round(z * 1e6) / 1e6);
  for (const zMm of featureZ(lr)) zs.add(Math.round(zMm) / 1000);
  zs.add(lr.zb);
  const sorted = [...zs].sort((a, b) => a - b);
  const r = lr.res;
  const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');
  const lines = [
    `z [m]\t|q| K_ser [kN/m]\t|q| K_u [kN/m]\tF_v per skrue K_ser [kN]\tN1 eksisterende K_u [kN]\tN2 ny K_ser [kN]`,
  ];
  for (const z of sorted) {
    const zm = z * 1000;
    const qs = Math.abs(interp(r.ser.z, r.ser.q, zm)) * lr.share;
    const qu = Math.abs(interp(r.u.z, r.u.q, zm)) * lr.share;
    const Fv = interp(r.ser.z, r.ser.F, zm) / 1000;
    const N1 = interp(r.u.z, r.u.N1, zm) / 1000;
    const N2 = interp(r.ser.z, r.ser.N2, zm) / 1000;
    lines.push([fmt(z, 3), fmt(qs, 2), fmt(qu, 2), fmt(Fv, 3), fmt(N1, 2), fmt(N2, 2)].join('\t'));
  }
  return lines.join('\n');
}

/** Felttabellen som HTML (panel og rapport bruker samme rader). */
export function lineZonesTable(lr, { screen = true } = {}) {
  const zones = lineZones(lr);
  if (!zones.length) return '';
  const cls = screen ? 'py-0.5 pl-2 text-right num' : 'num';
  const body = zones
    .map((z) => `<tr${screen ? ' class="border-t border-slate-700/60"' : ''}>
        <td${screen ? ' class="py-0.5 pr-2 num text-slate-300 whitespace-nowrap"' : ''}>${n(z.z0, 2)}–${n(z.z1, 2)}</td>
        <td class="${cls}">${n(z.qSer, 1)}</td>
        <td class="${cls}">${n(z.FvSer, 2)}</td>
        <td class="${cls}">${n(z.qU, 1)}</td>
        <td class="${cls}">${n(z.zAt, 2)}</td>
      </tr>`)
    .join('');
  const th = (t, tip = '') => `<th${screen ? ' class="text-right font-normal py-1 pl-2"' : ' class="num"'}${tip ? ` title="${escapeHtml(tip)}"` : ''}>${t}</th>`;
  return `<table class="${screen ? 'w-full text-[11px]' : ''}">
      <thead><tr${screen ? ' class="text-slate-500"' : ''}>
        <th${screen ? ' class="text-left font-normal py-1"' : ''}>Felt z [m]</th>
        ${th('|q| maks K_ser [kN/m]', 'Største kraft gjennom skjøten i feltet — styrende for skruene')}
        ${th(`F_v per skrue [kN]`, 'Største kraft per skrue i feltet, K_ser: |q|·a/rader med sonens a og rader')}
        ${th('|q| maks K_u [kN/m]')}
        ${th('ved z [m]', 'Hvor i feltet største kraft per skrue sitter (K_ser)')}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

/** Høyre panel i linjemodus. */
export function lineOutputHtml(lr) {
  if (!lr.ok) {
    return `<div class="space-y-1">${lr.blocked
      .map((b) => `<div class="flex gap-1.5 text-[11px] text-slate-300 leading-snug"><span class="text-sky-400 shrink-0">→</span><span>${b}</span></div>`)
      .join('')}</div>`;
  }
  const warns = lr.warnings.length
    ? `<div class="space-y-1 mb-2">${lr.warnings
        .map((w) => `<div class="flex items-start gap-1.5 text-[11px] text-amber-200 leading-snug" title="${escapeHtml(w.text)}"><span class="shrink-0">⚠</span><span>${w.short}</span></div>`)
        .join('')}</div>`
    : '';
  const body = lineRows(lr)
    .map(([label, ser, u, gov, tip]) => `<tr class="border-t border-slate-700/60" title="${escapeHtml(tip)}">
        <td class="py-1 pr-2 text-slate-300 leading-tight">${label}</td>
        <td class="py-1 pl-2 text-right num ${gov === 'ser' ? 'text-white font-semibold' : 'text-slate-400'}">${ser}${gov === 'ser' ? ' ●' : ''}</td>
        <td class="py-1 pl-2 text-right num ${gov === 'u' ? 'text-white font-semibold' : 'text-slate-400'}">${u}${gov === 'u' ? ' ●' : ''}</td>
      </tr>`)
    .join('');
  const { forces, perScrew, flow } = linePlots(lr);
  return `${warns}
    <p class="text-[11px] text-slate-400 mb-1 truncate">Skjøt: <span class="text-slate-200">${escapeHtml(lr.summary.joint)}</span></p>
    <table class="w-full text-[11px]">
      <thead><tr class="text-slate-500">
        <th class="text-left font-normal py-1"></th>
        <th class="text-right font-normal py-1 pl-2" title="Bruksgrensestivhet. Brukt i bruddgrense er den en øvre grense for toppkraften, ikke EC5-praksis.">K_ser</th>
        <th class="text-right font-normal py-1 pl-2" title="K_u = ⅔·K_ser, EC5 2.2.2(2).">K_u</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="text-[10px] text-slate-500 mt-1">● styrende · hold musa over en rad for forklaring · 1 N/mm = 1 kN/m</p>
    <div class="mt-3 space-y-1">${perScrew}${zoneStripSvg(lr)}${forces}${flow}</div>
    <div class="mt-2">
      <h4 class="text-[11px] text-slate-400 mb-0.5">Per sone</h4>
      ${zoneStatsTable(lr)}
    </div>
    <details class="mt-2 rounded border border-slate-700 bg-slate-900/60" data-line-zones ${lr.zonesOpen ? 'open' : ''}>
      <summary class="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
        <span class="chev text-slate-500" style="display:inline-block">›</span>
        Per felt mellom knutepunkt (${lineZones(lr).length})
      </summary>
      <div class="px-2.5 pb-2.5 pt-1">
        ${lineZonesTable(lr)}
        <p class="text-[10px] text-slate-500 mt-1">Toppene sitter i endene og ved hoppene. Bruk tabellen til å legge skruesonene der behovet er.</p>
      </div>
    </details>`;
}

/** Detaljer i linjemodus: tallene bak λ og N₂∞, og forutsetningene. */
export function lineDetailsHtml(lr, unit) {
  if (!lr.ok) return '';
  const L = lr.layer;
  const u = lengthLabel(unit || 'mm');
  const row = (k, v) => `<div class="flex justify-between gap-2"><span class="text-slate-400">${k}</span><span class="num text-slate-200">${v}</span></div>`;
  const restr = (RESTRAINTS.find((r) => r.key === lr.line.restraint) || {}).label || '';
  return `<div class="space-y-0.5 text-[11px]">
      ${row('EA₁ eksisterende / EA₂ ny [N]', `${n(L.EA1, 0)} / ${n(L.EA2, 0)}`)}
      ${row('e = c₂ − c₁ (x, y) [mm]', `${n(L.e.x, 1)}, ${n(L.e.y, 1)}`)}
      ${row('Sideveis', escapeHtml(restr))}
      ${row('k = Σ rader·K_ser/a [N/mm²]', n(lr.kSer, 2))}
      ${row('λ (K_ser) [1/mm]', n(lr.res.ser.lambda, 6))}
      ${row('λ² = k·(1/EA₁ + 1/EA₂ + dᵀK₀⁻¹d)', n(lambda2(L, lr.kSer), 6))}
    </div>
    <ul class="list-disc list-inside space-y-1 text-[11px] text-slate-400 leading-snug mt-2">
      <li>N₂″ = λ²·(N₂ − N₂∞), N₂∞ = [N/EA₁ + dᵀK₀⁻¹(M − N·r₁) + ε_eks − ε_ny] / (λ²/k). Løst med endelige differanser; testet mot lukkede løsninger.</li>
      <li>Lineær elastisk, skruene smurt ut langs skjøten, felles krumning for delene. Eksentrisitet mellom profilene gir i tillegg bøyning og aksialkraft i skruene, som ikke er med.</li>
      <li>Langtid (k_def), fukt og midlertidig avstiving er ikke med utover fri tøyning per del. Kryp under N_før med k_def = 0,6 tilsvarer ε ≈ 0,6·N_før/EA₁.</li>
      <li>Geometri i ${u}; tabell og utstrekning i m.</li>
    </ul>`;
}
