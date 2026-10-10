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
 * Løser N₂″ = λ²(N₂ − N₂∞(z)) på [za, zb] med endelige differanser på et
 * gradert nett og Thomas-algoritmen (tridiagonal, ingen cosh — tåler stor λL).
 *
 * Rendene: løs ende N₂ = 0; festet ende N₂ = N₂∞ (grenseverdien fra innsiden
 * av delen). Ved et hopp brukes snittet av N₂∞ på hver side i selve punktet.
 *
 * @param {{za:number, zb:number, lambda:number, nInf:(z:number, side:number)=>number,
 *          endA:'loose'|'fixed', endB:'loose'|'fixed', jumps?: number[]}} arg  z i mm
 * @returns {{z: number[], N2: number[], Ninf: number[], q: number[]}}  q i N/mm (= kN/m)
 */
export function solveLine({ za, zb, lambda, nInf, endA = 'loose', endB = 'loose', jumps = [] }) {
  const z = buildMesh(za, zb, lambda, jumps);
  const n = z.length;
  const Ninf = z.map((zz, i) => nInf(zz, i === 0 ? +1 : i === n - 1 ? -1 : 0));

  const N2 = new Array(n).fill(0);
  N2[0] = endA === 'fixed' ? Ninf[0] : 0;
  N2[n - 1] = endB === 'fixed' ? Ninf[n - 1] : 0;

  // Indre punkter: a·N_{i−1} + b·N_i + c·N_{i+1} = −λ²·N∞_i, med
  // a = 2/(h₋(h₋+h₊)), c = 2/(h₊(h₋+h₊)), b = −a − c − λ².
  const l2 = lambda * lambda;
  const m = n - 2;
  const cp = new Array(m);
  const dp = new Array(m);
  for (let k = 0; k < m; k++) {
    const i = k + 1;
    const hm = z[i] - z[i - 1];
    const hp = z[i + 1] - z[i];
    const a = 2 / (hm * (hm + hp));
    const c = 2 / (hp * (hm + hp));
    const b = -a - c - l2;
    let rhs = -l2 * Ninf[i];
    if (k === 0) rhs -= a * N2[0];
    if (k === m - 1) rhs -= c * N2[n - 1];
    const denom = k === 0 ? b : b - a * cp[k - 1];
    cp[k] = c / denom;
    dp[k] = (k === 0 ? rhs : rhs - a * dp[k - 1]) / denom;
  }
  for (let k = m - 1; k >= 0; k--) N2[k + 1] = k === m - 1 ? dp[k] : dp[k] - cp[k] * N2[k + 2];

  // q = N₂′, andre ordens på ujevnt nett: sentralt inne, ensidig i endene.
  const q = new Array(n);
  for (let i = 1; i < n - 1; i++) {
    const hm = z[i] - z[i - 1];
    const hp = z[i + 1] - z[i];
    q[i] = (hm * hm * N2[i + 1] - hp * hp * N2[i - 1] + (hp * hp - hm * hm) * N2[i]) / (hm * hp * (hm + hp));
  }
  {
    const h0 = z[1] - z[0];
    const h1 = z[2] - z[1];
    q[0] = (-(2 * h0 + h1) / (h0 * (h0 + h1))) * N2[0] + ((h0 + h1) / (h0 * h1)) * N2[1] - (h0 / (h1 * (h0 + h1))) * N2[2];
    const g0 = z[n - 1] - z[n - 2];
    const g1 = z[n - 2] - z[n - 3];
    q[n - 1] = ((2 * g0 + g1) / (g0 * (g0 + g1))) * N2[n - 1] - ((g0 + g1) / (g0 * g1)) * N2[n - 2] + (g0 / (g1 * (g0 + g1))) * N2[n - 3];
  }
  return { z, N2, Ninf, q };
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
export function analyseLine({ layer, rows, jumps = [], za, zb, endA, endB, kSer, epsExisting = 0, epsNew = 0 }) {
  const jumpsMm = jumps.map((z) => z * 1000).filter((z) => z > za && z < zb);
  const nInf = (z, side) => {
    const l = loadAt(rows, z, side);
    return nInfinity(layer, { N: l.N - l.Nf, Mx: l.Mx, My: l.My, epsExisting, epsNew });
  };
  const run = (k) => {
    const lam = Math.sqrt(lambda2(layer, k));
    const s = solveLine({ za, zb, lambda: lam, nInf, endA, endB, jumps: jumpsMm });
    const N1 = s.z.map((zz, i) => loadAt(rows, zz, i === 0 ? +1 : i === s.z.length - 1 ? -1 : 0).N - s.N2[i]);
    let iq = 0;
    for (let i = 1; i < s.q.length; i++) if (Math.abs(s.q[i]) > Math.abs(s.q[iq])) iq = i;
    let iN1 = 0;
    for (let i = 1; i < N1.length; i++) if (Math.abs(N1[i]) > Math.abs(N1[iN1])) iN1 = i;
    // η: hvor mye av kraften ved full samvirkning den nye delen faktisk får,
    // der N₂∞ er størst (endene holdes utenfor — der er N₂ bundet av randen).
    let iInf = Math.floor(s.z.length / 2);
    for (let i = 1; i < s.z.length - 1; i++) if (Math.abs(s.Ninf[i]) > Math.abs(s.Ninf[iInf])) iInf = i;
    const eta = Math.abs(s.Ninf[iInf]) > 1e-9 ? s.N2[iInf] / s.Ninf[iInf] : null;
    return {
      k, lambda: lam, ...s, N1,
      qMax: s.q[iq], zAtQmax: s.z[iq],
      N1max: N1[iN1], zAtN1max: s.z[iN1],
      N1a: N1[0], N1b: N1[N1.length - 1],
      N2a: s.N2[0], N2b: s.N2[s.N2.length - 1],
      eta, zAtEta: s.z[iInf],
    };
  };
  return { ser: run(kSer), u: run((2 / 3) * kSer) };
}
