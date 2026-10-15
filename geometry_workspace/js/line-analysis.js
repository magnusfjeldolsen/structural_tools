/**
 * line-analysis.js — linjeberegningen (#63): kreftene i skjøten langs hele
 * den nye delen, med delvis samvirke.
 *
 * Ingen DOM. N og mm inne i modulen; lastetabellen tas imot i m, kN og kNm
 * (slik den limes inn fra et rammeprogram) og regnes om ved innlesing.
 *
 * MODELLEN — to lag med felles krumning (Volkersen for N, Newmark 1951 for M)
 * --------------------------------------------------------------------------
 * Lag 1 er det eksisterende, lag 2 den nye delen. Skjøten mellom dem er en
 * jevn fjær: q = k·δ, der δ er glidningen og k = rader·K/s [N/mm²]. Likevekt
 * for den nye delen gir N₂′ = q. Glidningens deriverte er forskjellen i
 * tøyning i skjøten:
 *
 *      δ′ = ε₂ − ε₁ = N₂/EA₂ + ε_ny − N₁/EA₁ − ε_eks − κᵀd
 *
 * der d = (y₂ − y₁, x₂ − x₁) er avstanden mellom lagenes tyngdepunkt og κ =
 * (κ_x, κ_y) den felles krumningen. Momentet om det sammensatte tyngdepunktet
 * er M = K₀·κ + N·r₁ + N₂·d, med K₀ = K₁ + K₂ (lagenes egne stivheter) og
 * r₁ = c₁ − c. Setter man inn N₁ = N − N₂ og κ, og deriverer N₂′ = k·δ:
 *
 *      N₂″ = λ²·(N₂ − N₂∞)
 *      λ²  = k·(1/EA₁ + 1/EA₂ + dᵀK₀⁻¹d)
 *      N₂∞ = [N/EA₁ + dᵀK₀⁻¹(M − N·r₁) + ε_eks − ε_ny] / (λ²/k)
 *
 * N₂∞ er kraften den nye delen får uten glidning (k → ∞) — den samme som full
 * samvirkning gir (testet mot `axialInGroup`). Med N i det sammensatte
 * tyngdepunktet og M = 0 blir den r·N = N·EA₂/EA, uansett eksentrisitet.
 *
 * SIDEVEIS FASTHOLDING. Holdes delen rett om en akse av omgivelsene, er
 * krumningen om den aksen null, og fastholdingen tar momentet. Da faller
 * aksens ledd ut av både λ² og N₂∞. Med begge akser fastholdt er det ren
 * Volkersen: λ² = k(1/EA₁ + 1/EA₂). Valget kan endre q_max med en faktor 2
 * (profil på siden av gurten), og har derfor ingen standardverdi.
 *
 * HVOR N ANGRIPER. Angriper N i det eksisterende tyngdepunktet (gurten i et
 * fagverk, der knutepunktet fører kraften inn), gir det et moment N·r₁ om det
 * sammensatte tyngdepunktet — men bare om akser som ikke er fastholdt.
 */

/* ================================================================== *
 * Lastetabellen
 * ================================================================== */

/**
 * Leser en tabell limt inn fra Excel eller et rammeprogram:
 * `z  N  M_x  M_y  N_før` i m, kN, kNm, kNm, kN. Skilletegn tab, semikolon
 * eller mellomrom; komma eller punktum som desimaltegn. Linjer som ikke
 * starter med et tall (overskrifter) hoppes over. Manglende kolonner er 0.
 * Et hopp i N legges inn som to rader med samme z.
 *
 * @param {string} text
 * @returns {{rows: Array<{z:number,N:number,Mx:number,My:number,Nf:number}>, errors: string[], jumps: number[]}}
 *   `rows` i m/kN/kNm som oppgitt; `jumps` er z [m] der to rader har samme z
 */
export function parseLoadTable(text) {
  const rows = [];
  const errors = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const cells = (/[\t;]/.test(t) ? t.split(/[\t;]/) : t.split(/\s+/)).map((c) => c.trim().replace(',', '.'));
    const nums = cells.map(Number);
    if (!Number.isFinite(nums[0]) || cells[0] === '') return; // overskrift
    const v = (k) => (Number.isFinite(nums[k]) ? nums[k] : 0);
    rows.push({ z: nums[0], N: v(1), Mx: v(2), My: v(3), Nf: v(4), line: i + 1 });
  });
  const jumps = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].z < rows[i - 1].z) {
      errors.push(`Linje ${rows[i].line}: z = ${rows[i].z} m er mindre enn forrige rad — tabellen må gå framover i z.`);
    } else if (rows[i].z === rows[i - 1].z) {
      jumps.push(rows[i].z);
    }
  }
  return { rows: rows.map(({ line, ...r }) => r), errors, jumps };
}

/**
 * Lasten i et punkt, lineært interpolert, i N og Nmm.
 * @param {Array} rows  fra `parseLoadTable` (m, kN, kNm)
 * @param {number} zMm
 * @param {number} side  −1 venstre grense, +1 høyre grense, 0 snittet ved et hopp
 * @returns {{N:number, Mx:number, My:number, Nf:number}}
 */
export function loadAt(rows, zMm, side = 0) {
  const out = { N: 0, Mx: 0, My: 0, Nf: 0 };
  if (!rows || !rows.length) return out;
  const z = zMm / 1000;
  const pick = (r) => ({ N: r.N * 1e3, Mx: r.Mx * 1e6, My: r.My * 1e6, Nf: r.Nf * 1e3 });
  if (z <= rows[0].z) return pick(rows[0]);
  if (z >= rows[rows.length - 1].z) return pick(rows[rows.length - 1]);
  // Rader med akkurat denne z: et hopp (to rader) eller et vanlig punkt.
  const at = rows.filter((r) => r.z === z);
  if (at.length) {
    const left = pick(at[0]);
    const right = pick(at[at.length - 1]);
    if (side < 0) return left;
    if (side > 0) return right;
    return { N: (left.N + right.N) / 2, Mx: (left.Mx + right.Mx) / 2, My: (left.My + right.My) / 2, Nf: (left.Nf + right.Nf) / 2 };
  }
  let i = 1;
  while (rows[i].z < z) i++;
  const a = rows[i - 1];
  const b = rows[i];
  const t = (z - a.z) / (b.z - a.z);
  const lerp = (u, w) => u + (w - u) * t;
  return pick({ N: lerp(a.N, b.N), Mx: lerp(a.Mx, b.Mx), My: lerp(a.My, b.My), Nf: lerp(a.Nf, b.Nf) });
}

/* ================================================================== *
 * To lag
 * ================================================================== */

function props(parts) {
  let EA = 0, ESx = 0, ESy = 0, EIx0 = 0, EIy0 = 0, EIxy0 = 0;
  for (const p of parts || []) {
    const pr = p && p.props;
    const E = p ? Number(p.E) : NaN;
    if (!pr || !Number.isFinite(E)) continue;
    EA += E * pr.A; ESx += E * pr.Sx; ESy += E * pr.Sy;
    EIx0 += E * pr.Ix0; EIy0 += E * pr.Iy0; EIxy0 += E * pr.Ixy0;
  }
  const yc = EA ? ESx / EA : 0;
  const xc = EA ? ESy / EA : 0;
  return { EA, xc, yc, EIx: EIx0 - EA * yc * yc, EIy: EIy0 - EA * xc * xc, EIxy: EIxy0 - EA * xc * yc };
}

/** Invers av en symmetrisk 0×0, 1×1 eller 2×2-matrise; `null` hvis singulær. */
function inverse(m) {
  if (m.length === 0) return [];
  if (m.length === 1) return m[0][0] > 0 ? [[1 / m[0][0]]] : null;
  const D = m[0][0] * m[1][1] - m[0][1] * m[1][0];
  if (!(D > 1e-12 * Math.abs(m[0][0] * m[1][1]))) return null;
  return [[m[1][1] / D, -m[0][1] / D], [-m[1][0] / D, m[0][0] / D]];
}

const quad = (u, M, v) => u.reduce((s, ui, i) => s + ui * v.reduce((t, vj, j) => t + M[i][j] * vj, 0), 0);

/**
 * De to lagene, med det modellen trenger.
 * @param {{existingParts: Array, newParts: Array, restraint: 'free'|'x'|'y'|'xy', nAt: 'existing'|'composite'}} arg
 *   `restraint` er aksene som er FASTHOLDT (krumningen om dem er null)
 */
export function twoLayer({ existingParts, newParts, restraint = 'free', nAt = 'composite' }) {
  const p1 = props(existingParts);
  const p2 = props(newParts);
  const EA = p1.EA + p2.EA;
  const c = { x: EA ? (p1.EA * p1.xc + p2.EA * p2.xc) / EA : 0, y: EA ? (p1.EA * p1.yc + p2.EA * p2.yc) / EA : 0 };
  // Akse «x» = bøyning om x-aksen (κ_x, M_x, EI_x, avstander i y); «y» tilsvarende.
  const fixed = restraint === 'xy' ? ['x', 'y'] : restraint === 'x' ? ['x'] : restraint === 'y' ? ['y'] : [];
  const axes = ['x', 'y'].filter((a) => !fixed.includes(a));
  const off = { x: (q) => q.yc, y: (q) => q.xc };
  const d = axes.map((a) => off[a](p2) - off[a](p1));
  const r1 = axes.map((a) => off[a](p1) - c[a === 'x' ? 'y' : 'x']);
  const K = { xx: p1.EIx + p2.EIx, yy: p1.EIy + p2.EIy, xy: p1.EIxy + p2.EIxy };
  const K0 = axes.map((a) => axes.map((b) => (a === b ? (a === 'x' ? K.xx : K.yy) : K.xy)));
  const K0inv = inverse(K0);
  return {
    EA1: p1.EA, EA2: p2.EA, EA,
    c1: { x: p1.xc, y: p1.yc }, c2: { x: p2.xc, y: p2.yc }, c,
    e: { x: p2.xc - p1.xc, y: p2.yc - p1.yc },
    axes, d, r1, K0inv, nAt, restraint,
    valid: p1.EA > 0 && p2.EA > 0 && K0inv !== null,
  };
}

/** dᵀK₀⁻¹d — bøyeleddet i λ². Null når alle akser er fastholdt. */
function bendingTerm(layer) {
  return layer.axes.length ? quad(layer.d, layer.K0inv, layer.d) : 0;
}

/** λ² [1/mm²] for skjøtestivheten k [N/mm²]. */
export function lambda2(layer, k) {
  return k * (1 / layer.EA1 + 1 / layer.EA2 + bendingTerm(layer));
}

/**
 * N₂∞ [N]: kraften i den nye delen uten glidning.
 * @param {object} layer  fra `twoLayer`
 * @param {{N?:number, Mx?:number, My?:number, epsExisting?:number, epsNew?:number}} load
 *   N [N] som driver (N − N_før), M [Nmm] om det sammensatte tyngdepunktet, fri tøyning per del
 */
export function nInfinity(layer, { N = 0, Mx = 0, My = 0, epsExisting = 0, epsNew = 0 } = {}) {
  const Mfull = { x: Mx, y: My };
  // N i eksisterende tyngdepunkt: ekstra moment N·r₁ om de frie aksene.
  const M = layer.axes.map((a, i) => Mfull[a] + (layer.nAt === 'existing' ? N * layer.r1[i] : 0));
  const MminusNr1 = M.map((m, i) => m - N * layer.r1[i]);
  const bend = layer.axes.length ? quad(layer.d, layer.K0inv, MminusNr1) : 0;
  const num = N / layer.EA1 + bend + (epsExisting - epsNew);
  return num / (1 / layer.EA1 + 1 / layer.EA2 + bendingTerm(layer));
}

/* ================================================================== *
 * Løseren
 * ================================================================== */

/**
 * Nettet: tett ved endene og ved hopp (der q har en topp eller en spiss),
 * grovere imellom. Avstanden vokser geometrisk fra h_min = 1/(300λ) til
 * h₀ = 1/(30λ) (høyst L/200). Ved en spiss gir en sentraldifferanse
 * `1 − λh/2` av toppen, så h_min holder feilen under 0,2 %. Hvert segment
 * mellom to slike punkter bygges symmetrisk, så speiling gir samme nett.
 */
function buildMesh(za, zb, lambda, jumps) {
  const len = zb - za;
  const h0 = Math.min(1 / (30 * lambda), len / 200);
  const hmin = Math.min(h0, 1 / (300 * lambda));
  const g = 1.15;
  const feats = [za, ...jumps.filter((j) => j > za && j < zb).sort((u, v) => u - v), zb];
  const z = [za];
  for (let s = 0; s < feats.length - 1; s++) {
    const A = feats[s];
    const half = (feats[s + 1] - A) / 2;
    const d = [0];
    while (d[d.length - 1] < half) {
      const last = d[d.length - 1];
      d.push(last + Math.min(h0, hmin + (g - 1) * last));
    }
    const scale = half / d[d.length - 1];
    const left = d.map((v) => v * scale);
    const seg = [...left, ...left.slice(0, -1).reverse().map((v) => 2 * half - v)];
    for (let i = 1; i < seg.length; i++) z.push(A + seg[i]);
  }
  z[z.length - 1] = zb;
  if (z.length > 200001) throw new Error('For mange punkter i nettet — λL er urimelig stor.');
  return z;
}

/**
 * Løser (N₂′/k(z))′ = c·(N₂ − N₂∞(z)) på [za, zb] — skjøtestivheten k kan
 * variere i soner langs delen (#71). Med én sone er det N₂″ = λ²(N₂ − N₂∞),
 * λ² = c·k.
 *
 * Fysikken ved en sonegrense: glidningen δ = N₂′/k er kontinuerlig (delene
 * kan ikke rives fra hverandre), så q = k·δ HOPPER med forholdet mellom k, mens
 * kraften per skrue F = K·δ er kontinuerlig så lenge skruen er den samme.
 *
 * Endelige differanser i fluks-form på et gradert nett (tett ved ender, hopp
 * og sonegrenser), løst med Thomas-algoritmen — tridiagonalt, ingen cosh,
 * tåler stor λL. Rendene: løs ende N₂ = 0; festet ende N₂ = N₂∞.
 *
 * Bakoverkompatibelt: `lambda` uten `zones` er én sone med k = 1, c = λ².
 *
 * @param {{za:number, zb:number, nInf:(z:number, side:number)=>number,
 *          endA:'loose'|'fixed', endB:'loose'|'fixed', jumps?: number[],
 *          lambda?: number, c?: number, zones?: Array<{z0:number, z1:number, k:number}>}} arg  z i mm, k i N/mm²
 * @returns {{z: number[], N2: number[], Ninf: number[], q: number[], delta: number[], kAt: number[]}}
 *   q i N/mm (= kN/m), δ i mm; ved en sonegrense er q og k fra sonen til høyre
 */
export function solveLine({ za, zb, lambda, c: cIn, zones: zonesIn, nInf, endA = 'loose', endB = 'loose', jumps = [], nA = null, nB = null }) {
  const zones = zonesIn && zonesIn.length ? zonesIn : [{ z0: za, z1: zb, k: 1 }];
  const c = zonesIn && zonesIn.length ? cIn : lambda * lambda;
  const kMax = Math.max(...zones.map((zn) => zn.k));
  const bounds = zones.slice(0, -1).map((zn) => zn.z1);
  const z = buildMesh(za, zb, Math.sqrt(c * kMax), [...jumps, ...bounds]);
  const n = z.length;
  // Stivheten i et punkt (side: −1 venstre sone, +1 høyre sone ved en grense).
  const kOf = (zz, side = 1) => {
    for (let i = 0; i < zones.length; i++) {
      const zn = zones[i];
      const last = i === zones.length - 1;
      if (side < 0 ? zz > zn.z0 + 1e-9 && zz <= zn.z1 + 1e-9 : zz >= zn.z0 - 1e-9 && (zz < zn.z1 - 1e-9 || last)) return zn.k;
    }
    return zones[zones.length - 1].k;
  };
  const kSeg = (i) => kOf((z[i] + z[i + 1]) / 2); // stivheten mellom punkt i og i+1
  const Ninf = z.map((zz, i) => nInf(zz, i === 0 ? +1 : i === n - 1 ? -1 : 0));

  const N2 = new Array(n).fill(0);
  // Festet ende: kraften fra knutepunktet (`nA`/`nB` når det er avstand fram
  // til første skrue, ellers N₂∞ i randen).
  N2[0] = endA === 'fixed' ? (nA ?? Ninf[0]) : 0;
  N2[n - 1] = endB === 'fixed' ? (nB ?? Ninf[n - 1]) : 0;

  // Indre punkter: a·N_{i−1} + b·N_i + e·N_{i+1} = −c·N∞_i, med
  // a = 2/((h₋+h₊)·h₋·k₋), e = 2/((h₋+h₊)·h₊·k₊), b = −a − e − c.
  const m = n - 2;
  const cp = new Array(m);
  const dp = new Array(m);
  for (let t = 0; t < m; t++) {
    const i = t + 1;
    const hm = z[i] - z[i - 1];
    const hp = z[i + 1] - z[i];
    const a = 2 / ((hm + hp) * hm * kSeg(i - 1));
    const e = 2 / ((hm + hp) * hp * kSeg(i));
    const b = -a - e - c;
    let rhs = -c * Ninf[i];
    if (t === 0) rhs -= a * N2[0];
    if (t === m - 1) rhs -= e * N2[n - 1];
    const denom = t === 0 ? b : b - a * cp[t - 1];
    cp[t] = e / denom;
    dp[t] = (t === 0 ? rhs : rhs - a * dp[t - 1]) / denom;
  }
  for (let t = m - 1; t >= 0; t--) N2[t + 1] = t === m - 1 ? dp[t] : dp[t] - cp[t] * N2[t + 2];

  // N₂′ andre ordens: sentralt inne i en sone, ensidig i endene og — fra hver
  // side for seg — ved en sonegrense, der N₂′ har et knekkpunkt.
  const back = (i) => {
    const g0 = z[i] - z[i - 1];
    const g1 = z[i - 1] - z[i - 2];
    return ((2 * g0 + g1) / (g0 * (g0 + g1))) * N2[i] - ((g0 + g1) / (g0 * g1)) * N2[i - 1] + (g0 / (g1 * (g0 + g1))) * N2[i - 2];
  };
  const fwd = (i) => {
    const h0 = z[i + 1] - z[i];
    const h1 = z[i + 2] - z[i + 1];
    return (-(2 * h0 + h1) / (h0 * (h0 + h1))) * N2[i] + ((h0 + h1) / (h0 * h1)) * N2[i + 1] - (h0 / (h1 * (h0 + h1))) * N2[i + 2];
  };
  const delta = new Array(n);
  const q = new Array(n);
  const kAt = new Array(n);
  for (let i = 0; i < n; i++) {
    const kR = kOf(z[i], +1);
    kAt[i] = kR;
    if (i === 0) delta[i] = fwd(0) / kR;
    else if (i === n - 1) delta[i] = back(n - 1) / kOf(z[i], -1);
    else {
      const kL = kOf(z[i], -1);
      if (kL !== kR && i >= 2 && i <= n - 3) {
        delta[i] = (back(i) / kL + fwd(i) / kR) / 2;
      } else {
        const hm = z[i] - z[i - 1];
        const hp = z[i + 1] - z[i];
        const d1 = (hm * hm * N2[i + 1] - hp * hp * N2[i - 1] + (hp * hp - hm * hm) * N2[i]) / (hm * hp * (hm + hp));
        delta[i] = d1 / kR;
      }
    }
    q[i] = kR * delta[i];
  }
  // Uten soner er k = 1, så q = N₂′ som før.
  return { z, N2, Ninf, q, delta, kAt };
}

/** ∫f dz med trapesregelen. */
export function integrate(z, f) {
  let s = 0;
  for (let i = 1; i < z.length; i++) s += ((f[i] + f[i - 1]) / 2) * (z[i] - z[i - 1]);
  return s;
}

/* ================================================================== *
 * Hele beregningen for én skjøt
 * ================================================================== */

/**
 * Linjeberegningen for én skjøt mellom eksisterende og ny del, med K_ser og
 * K_u = ⅔·K_ser side om side.
 *
 * Hvilken K som styrer hva: stivere skjøt gir høyere topp og mer kraft i den
 * nye delen, så **K_ser** styrer toppkraften og N₂. Mykere skjøt gir mindre
 * til den nye delen, så **K_u** styrer η og kraften igjen i den eksisterende,
 * N₁. (K_ser i bruddgrensetilstand er en øvre grense for toppen, ikke
 * EC5-praksis — det står i resultatet.)
 *
 * @param {{layer: object, rows: Array, jumps?: number[], za: number, zb: number,
 *          endA: 'loose'|'fixed', endB: 'loose'|'fixed', kSer: number,
 *          epsExisting?: number, epsNew?: number}} arg  za/zb i mm, kSer i N/mm²
 */
export function analyseLine({ layer, rows, jumps = [], za, zb, endA, endB, kSer, zones, epsExisting = 0, epsNew = 0, serOnly = false, a3a = 0, a3b = 0 }) {
  const jumpsMm = jumps.map((z) => z * 1000).filter((z) => z > za && z < zb);
  const nInf = (z, side) => {
    const l = loadAt(rows, z, side);
    return nInfinity(layer, { N: l.N - l.Nf, Mx: l.Mx, My: l.My, epsExisting, epsNew });
  };
  // Skruesoner (#71): rader, a og K per sone. Uten soner: én sone med kSer.
  // Endeavstand a₃ (#75): mellom enden og første skrue er det ingen
  // forbindelse (k = 0), så kraften i den nye delen er konstant der. Ligningen
  // løses fra første til siste skrue; strekningene uten skruer legges på etterpå.
  const zc0 = za + Math.max(0, a3a);
  const zc1 = zb - Math.max(0, a3b);
  const zsAll = zones && zones.length
    ? zones
    : [{ z0: za, z1: zb, rows: 1, a: 1, K: kSer }];
  const zs = zsAll
    .map((zn) => ({ ...zn, z0: Math.max(zn.z0, zc0), z1: Math.min(zn.z1, zc1) }))
    .filter((zn) => zn.z1 - zn.z0 > 1e-9);
  const c = lambda2(layer, 1); // λ² = c·k
  const zoneAt = (z) => zs.find((zn, i) => z >= zn.z0 - 1e-9 && (z < zn.z1 - 1e-9 || i === zs.length - 1)) || zs[zs.length - 1];
  const run = (scale) => {
    const zk = zs.map((zn) => ({ z0: zn.z0, z1: zn.z1, k: (zn.rows * zn.K * scale) / zn.a }));
    const solved = solveLine({
      za: zc0, zb: zc1, c, zones: zk, nInf, endA, endB, jumps: jumpsMm.filter((z) => z > zc0 && z < zc1),
      nA: nInf(za, +1), nB: nInf(zb, -1),
    });
    const s = padEnds(solved, za, zb, zc0, zc1, nInf);
    const N1 = s.z.map((zz, i) => loadAt(rows, zz, i === 0 ? +1 : i === s.z.length - 1 ? -1 : 0).N - s.N2[i]);
    // Kraft per skrue F = K·δ = q·a/rader [N] — kontinuerlig over en
    // sonegrense med samme skrue, og det tallet skruene dimensjoneres for.
    const F = s.z.map((zz, i) => {
      const zn = zoneAt(zz);
      return (Math.abs(s.q[i]) * zn.a) / zn.rows;
    });
    const argmax = (arr) => {
      let im = 0;
      for (let i = 1; i < arr.length; i++) if (Math.abs(arr[i]) > Math.abs(arr[im])) im = i;
      return im;
    };
    const iq = argmax(s.q);
    const iF = argmax(F);
    const iN1 = argmax(N1);
    // η: hvor mye av kraften ved full samvirkning den nye delen faktisk får,
    // der N₂∞ er størst (endene holdes utenfor — der er N₂ bundet av randen).
    // Bare punkt med skruer (k > 0): på strekningen uten skruer (a₃) følger N₂ ikke med.
    let iInf = -1;
    for (let i = 1; i < s.z.length - 1; i++) {
      if (!(s.kAt[i] > 0)) continue;
      if (iInf < 0 || Math.abs(s.Ninf[i]) > Math.abs(s.Ninf[iInf])) iInf = i;
    }
    if (iInf < 0) iInf = Math.floor(s.z.length / 2);
    const eta = Math.abs(s.Ninf[iInf]) > 1e-9 ? s.N2[iInf] / s.Ninf[iInf] : null;
    const lambdas = zk.map((zn) => Math.sqrt(c * zn.k));
    return {
      scale, lambdas, lambda: Math.max(...lambdas), ...s, N1, F,
      qMax: s.q[iq], zAtQmax: s.z[iq],
      Fmax: F[iF], zAtFmax: s.z[iF],
      N1max: N1[iN1], zAtN1max: s.z[iN1],
      N1a: N1[0], N1b: N1[N1.length - 1],
      N2a: s.N2[0], N2b: s.N2[s.N2.length - 1],
      eta, zAtEta: s.z[iInf],
    };
  };
  return { ser: run(1), u: serOnly ? null : run(2 / 3), zones: zs, c };
}

/**
 * Legger strekningene uten skruer (a₃) til ytterst: N₂ konstant (verdien i
 * første/siste skrue), q = 0. Punktet i første skrue står to ganger — én gang
 * med q = 0 (siste punkt uten skruer) og én med toppen — så sprangene synes i
 * plottene.
 */
function padEnds(s, za, zb, zc0, zc1, nInf) {
  if (zc0 - za < 1e-9 && zb - zc1 < 1e-9) return s;
  const out = { z: [], N2: [], Ninf: [], q: [], delta: [], kAt: [] };
  const push = (z, N2, i = -1) => {
    out.z.push(z);
    out.N2.push(N2);
    out.Ninf.push(i >= 0 ? s.Ninf[i] : nInf(z, 0));
    out.q.push(i >= 0 ? s.q[i] : 0);
    out.delta.push(i >= 0 ? s.delta[i] : 0);
    out.kAt.push(i >= 0 ? s.kAt[i] : 0);
  };
  if (zc0 - za > 1e-9) {
    push(za, s.N2[0]);
    push(zc0, s.N2[0]);
  }
  s.z.forEach((z, i) => push(z, s.N2[i], i));
  if (zb - zc1 > 1e-9) {
    const last = s.N2[s.N2.length - 1];
    push(zc1, last);
    push(zb, last);
  }
  return out;
}

/**
 * Foreslår skruesoner slik at største kraft per skrue (K_ser) holder seg under
 * et mål — typisk R_v,d fra EC5-knutepunkt (#73). Verktøyet regner fortsatt
 * ingen kapasitet; målet er et tall brukeren oppgir.
 *
 * Delen deles i like celler, minst `minLen` lange. Alle starter med den
 * glisneste tillatte avstanden. Celler der F > mål gjøres ett trinn tettere,
 * og det løses på nytt — en tettere celle trekker til seg mer kraft, så
 * naboene kan måtte følge etter. Trinnene går bare én vei, så det ender
 * alltid: enten holder alt, eller cellene som ikke holder står på tetteste
 * avstand. Til slutt slås like naboceller sammen til soner.
 *
 * @param {object} arg  som `analyseLine`, pluss `rowsPerZone`, `K` [N/mm],
 *   `spacings` [mm], `target` [N], `minLen` [mm]
 * @returns {{zones: Array<{z0:number, z1:number, a:number}>, ok: boolean, Fmax: number,
 *            worst: {z:number, F:number}, iterations: number}}  z i mm, F i N
 */
export function suggestZones({ layer, rows, jumps = [], za, zb, endA, endB, epsExisting = 0, epsNew = 0, rowsPerZone, K, spacings, target, minLen, a3a = 0, a3b = 0 }) {
  const sp = [...new Set((spacings || []).filter((v) => v > 0))].sort((u, v) => v - u); // glisnest først
  const len = zb - za;
  const nCells = Math.max(1, Math.floor(len / Math.max(minLen, 1e-9)));
  // Cellene er nøyaktig `minLen` lange, og resten legges i midtcellen: da blir
  // grensene runde tall regnet fra hver ende, og forslaget symmetrisk.
  const rest = len - nCells * minLen;
  const mid = Math.floor((nCells - 1) / 2);
  const edges = [za];
  for (let i = 0; i < nCells; i++) edges.push(edges[i] + minLen + (i === mid ? rest : 0));
  edges[nCells] = zb;
  const cellOf = (z) => {
    let lo = 0;
    let hi = nCells;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (edges[m] <= z) lo = m;
      else hi = m;
    }
    return lo;
  };
  const level = new Array(nCells).fill(0);
  const merge = () => {
    const out = [];
    for (let i = 0; i < nCells; i++) {
      const z0 = edges[i];
      const z1 = edges[i + 1];
      const a = sp[level[i]];
      if (out.length && out[out.length - 1].a === a) out[out.length - 1].z1 = z1;
      else out.push({ z0, z1, a });
    }
    return out;
  };
  let res = null;
  let iterations = 0;
  const maxIter = sp.length * nCells + 2;
  while (iterations < maxIter) {
    iterations++;
    const zones = merge();
    res = analyseLine({
      layer, rows, jumps, za, zb, endA, endB, epsExisting, epsNew, serOnly: true, a3a, a3b,
      zones: zones.map((z) => ({ z0: z.z0, z1: z.z1, rows: rowsPerZone, a: z.a, K })),
    }).ser;
    const cellMax = new Array(nCells).fill(0);
    res.z.forEach((z, k) => {
      const i = Math.min(nCells - 1, cellOf(z));
      cellMax[i] = Math.max(cellMax[i], res.F[k]);
      // Et punkt på en cellegrense hører til begge.
      if (i > 0 && Math.abs(z - edges[i]) < 1e-6) cellMax[i - 1] = Math.max(cellMax[i - 1], res.F[k]);
    });
    // Celler over målet blir ett trinn tettere. Står en allerede på tetteste
    // avstand, er den tette sonen for kort (kortere enn ≈ 2/λ) — da blir den
    // nærmeste naboen som ikke er tettest, tettere i stedet, så sonen vokser.
    const top = sp.length - 1;
    const bump = new Set();
    for (let i = 0; i < nCells; i++) {
      if (!(cellMax[i] > target)) continue;
      if (level[i] < top) {
        bump.add(i);
        continue;
      }
      for (let d = 1; d < nCells; d++) {
        const cand = [i - d, i + d].filter((j) => j >= 0 && j < nCells && level[j] < top);
        if (cand.length) {
          cand.forEach((j) => bump.add(j));
          break;
        }
      }
    }
    if (!bump.size) break;
    bump.forEach((i) => level[i]++);
  }
  let iw = 0;
  for (let k = 1; k < res.F.length; k++) if (res.F[k] > res.F[iw]) iw = k;
  return {
    zones: merge(),
    ok: res.F[iw] <= target + 1e-9,
    Fmax: res.F[iw],
    worst: { z: res.z[iw], F: res.F[iw] },
    iterations,
  };
}
