/**
 * joint-force-figure.js — forklaringsfiguren bak (?) ved «Krefter i skjøtene».
 *
 * Bjelken sett fra siden, i tre situasjoner, så det blir synlig hva
 * kolonnene i krafttabellen betyr og NÅR momentet gir en egen kraft:
 *
 *  1. Snitt i felt — skjærstrømmen q fra V virker langs hele skjøten, og
 *     N_G i den nye delen er summen av q fra enden og fram til snittet.
 *  2. Forsterkningsende der M ≠ 0 — hele N_G må føres inn over den korte
 *     lengden L: N_G/L kommer i tillegg til q.
 *  3. Forsterkningsende i et momentnullpunkt — N_G = 0 der, så det er
 *     ingenting å forankre; bare q.
 *
 * Skissen er fast (proporsjonene skaleres ikke), men etikettene får
 * brukerens tall når de finnes. Ren funksjon, ingen DOM — gir en SVG-streng.
 */

const C = {
  text: '#cbd5e1',
  soft: '#94a3b8',
  existing: '#93c5fd',
  fresh: '#fb923c',
  joint: '#2dd4bf',
  q: '#60a5fa',
  anchor: '#e879f9',
  ng: '#f8fafc',
  moment: '#a78bfa',
};

const W = 520;
const PH = 158; // høyde per panel
const X0 = 30; // venstre opplegg
const X1 = 490; // høyre opplegg
const Y = { title: 13, mBase: 32, mDepth: 20, beamTop: 60, beamBot: 86, newBot: 98, support: 108, l1: 128, l2: 144 };

const nf1 = new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format;
const nf0 = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format;

/** Tall til etikett, eller «…» når verdien mangler. */
function val(v, fmt = nf1) {
  return Number.isFinite(v) ? fmt(v) : '…';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function text(x, y, s, { fill = C.text, size = 11, anchor = 'start', weight = 400 } = {}) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${s}</text>`;
}

function arrow(x1, y1, x2, y2, color, marker, width = 1.4) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" marker-end="url(#${marker})" />`;
}

/** Momentkurven for en fritt opplagt bjelke: null over oppleggene, størst midt i. */
function momentAt(x) {
  const t = (x - X0) / (X1 - X0);
  return 4 * t * (1 - t);
}

function momentDiagram() {
  let d = `M ${X0} ${Y.mBase}`;
  for (let i = 0; i <= 40; i++) {
    const x = X0 + ((X1 - X0) * i) / 40;
    d += ` L ${x.toFixed(1)} ${(Y.mBase + Y.mDepth * momentAt(x)).toFixed(1)}`;
  }
  d += ` L ${X1} ${Y.mBase} Z`;
  return (
    `<path d="${d}" fill="${C.moment}" fill-opacity="0.12" stroke="${C.moment}" stroke-width="1" />` +
    text(X1 + 4, Y.mBase + 4, 'M', { fill: C.moment, size: 10 })
  );
}

/** Prikk på momentkurven der den nye delen slutter, med «M = 0» / «M ≠ 0». */
function momentMark(x, label) {
  const y = Y.mBase + Y.mDepth * momentAt(x);
  return (
    `<line x1="${x}" y1="${Y.mBase}" x2="${x}" y2="${Y.newBot}" stroke="${C.soft}" stroke-width="0.8" stroke-dasharray="2 2" />` +
    `<circle cx="${x}" cy="${y}" r="3" fill="${C.moment}" />` +
    // Over kurven ved et momentnullpunkt (der kurven er flat), under den ellers.
    text(x + 7, y > Y.mBase + 6 ? y + 12 : Y.mBase - 5, label, { fill: C.moment, size: 10 })
  );
}

function supports() {
  const tri = (x) =>
    `<path d="M ${x} ${Y.newBot} L ${x - 6} ${Y.support} L ${x + 6} ${Y.support} Z" fill="none" stroke="${C.soft}" stroke-width="1" />`;
  return tri(X0) + tri(X1);
}

function beam(xa, xb) {
  return (
    `<rect x="${X0 - 10}" y="${Y.beamTop}" width="${X1 - X0 + 20}" height="${Y.beamBot - Y.beamTop}" fill="${C.existing}" fill-opacity="0.22" stroke="${C.existing}" stroke-width="1" />` +
    `<rect x="${xa}" y="${Y.beamBot}" width="${xb - xa}" height="${Y.newBot - Y.beamBot}" fill="${C.fresh}" fill-opacity="0.45" stroke="${C.fresh}" stroke-width="1" />` +
    `<line x1="${xa}" y1="${Y.beamBot}" x2="${xb}" y2="${Y.beamBot}" stroke="${C.joint}" stroke-width="2" />` +
    text(X0 - 6, Y.beamTop + 18, 'eksisterende', { fill: C.soft, size: 9 }) +
    text(xa - 4, Y.newBot - 2, 'ny', { fill: C.fresh, size: 9, anchor: 'end' })
  );
}

/**
 * Skjærstrømmen langs skjøten, som små piler. På den nye delen peker de mot
 * midten av spennet — der er strekket størst, og det er dit kraften samles.
 */
function shearArrows(xa, xb, skipA = 0, skipB = 0) {
  const out = [];
  const mid = (X0 + X1) / 2;
  const y = Y.beamBot + 4;
  for (let x = xa + 14 + skipA; x < xb - 10 - skipB; x += 26) {
    const dir = x < mid ? 1 : -1;
    out.push(arrow(x, y, x + 9 * dir, y, C.q, 'jf-q', 1.2));
  }
  return out.join('');
}

/** Konsentrert forankring i enden, over lengden L: tette magenta piler. */
function anchorZone(xa, len, dir) {
  const out = [];
  const y = Y.beamBot + 4;
  const x0 = dir > 0 ? xa : xa - len;
  for (let x = x0 + 4; x < x0 + len - 4; x += 8) out.push(arrow(x, y, x + 6 * dir, y, C.anchor, 'jf-a', 1.6));
  const by = Y.newBot + 6;
  out.push(
    `<path d="M ${x0} ${by} L ${x0} ${by + 4} L ${x0 + len} ${by + 4} L ${x0 + len} ${by}" fill="none" stroke="${C.anchor}" stroke-width="1" />`,
    text(x0 + len / 2, by + 14, 'L', { fill: C.anchor, size: 10, anchor: 'middle', weight: 600 })
  );
  return out.join('');
}

function panel(i, title, body) {
  return `<g transform="translate(0 ${i * PH})">
    ${text(8, Y.title, title, { weight: 600, size: 12 })}
    ${body}
  </g>`;
}

/**
 * @param {object} v  verdiene til etikettene, alle valgfrie
 * @param {number} [v.q]     skjærstrøm langs skjøten fra V [kN/m]
 * @param {number} [v.NG]    kraft i ny del fra M [kN]
 * @param {number} [v.qReq]  N_G/L [kN/m]
 * @param {number} [v.L]     forankringslengde [mm]
 * @param {string} [v.name]  skjøten tallene gjelder
 * @returns {string} SVG
 */
export function jointForceFigureSvg(v = {}) {
  const q = `q = ${val(v.q)} kN/m`;
  const ng = `N_G = ${val(v.NG)} kN`;
  const ngl = `N_G/L = ${val(v.qReq)} kN/m over L = ${val(v.L, nf0)} mm`;

  // 1. Snitt i felt
  const cut = 330;
  const p1 = panel(
    0,
    '1 · Snitt i felt',
    momentDiagram() +
      beam(X0, X1) +
      supports() +
      shearArrows(X0, X1) +
      `<line x1="${cut}" y1="${Y.mBase - 6}" x2="${cut}" y2="${Y.support + 2}" stroke="${C.ng}" stroke-width="1" stroke-dasharray="4 3" />` +
      arrow(cut - 30, Y.beamBot + 6, cut - 2, Y.beamBot + 6, C.ng, 'jf-n', 2) +
      text(cut + 4, Y.support + 2, 'snitt', { fill: C.soft, size: 9 }) +
      text(8, Y.l1, `<tspan fill="${C.q}">${q}</tspan> langs hele skjøten — fra V.`) +
      text(8, Y.l2, `<tspan fill="${C.ng}">${ng}</tspan> i ny del = summen av q fra enden og hit.`)
  );

  // 2. Forsterkningsende der M ≠ 0
  const ea = 150;
  const eb = 370;
  const len = 46;
  const p2 = panel(
    1,
    '2 · Forsterkningen slutter der M ≠ 0',
    momentDiagram() +
      beam(ea, eb) +
      supports() +
      momentMark(ea, 'M ≠ 0') +
      shearArrows(ea, eb, len, len) +
      anchorZone(ea, len, 1) +
      anchorZone(eb, len, -1) +
      text(8, Y.l1, `Hele N_G må inn over L: <tspan fill="${C.anchor}">${ngl}</tspan>`) +
      text(8, Y.l2, `— i tillegg til <tspan fill="${C.q}">q</tspan>. Ofte den største kraften i skjøten.`)
  );

  // 3. Forsterkningsende i et momentnullpunkt
  const p3 = panel(
    2,
    '3 · Forsterkningen går til et momentnullpunkt (M = 0)',
    momentDiagram() +
      beam(X0, X1) +
      supports() +
      momentMark(X0, 'M = 0') +
      shearArrows(X0, X1) +
      text(8, Y.l1, `N_G = 0 i enden — ingenting å forankre, bare <tspan fill="${C.q}">q</tspan>.`) +
      text(8, Y.l2, 'Fritt opplegg eller vendepunkt — ikke innspenning eller midtopplegg.', { fill: C.soft })
  );

  const marker = (id, color) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">` +
    `<path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" /></marker>`;

  const H = PH * 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img"
      aria-label="Kreftene i skjøten i tre situasjoner: snitt i felt, forsterkningsende der M ≠ 0, og forsterkningsende i et momentnullpunkt"
      font-family="ui-sans-serif, system-ui, sans-serif">
    <defs>${marker('jf-q', C.q)}${marker('jf-a', C.anchor)}${marker('jf-n', C.ng)}</defs>
    ${v.name ? text(W - 8, Y.title, `tall for ${esc(v.name)}`, { fill: C.soft, size: 10, anchor: 'end' }) : ''}
    ${p1}${p2}${p3}
  </svg>`;
}
