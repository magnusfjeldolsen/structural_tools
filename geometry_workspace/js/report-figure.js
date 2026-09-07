/**
 * report-figure.js — måltegningen av tverrsnittet til rapporten (§7 i
 * `global-devspecs/geometry_workspace-report-plan.md`).
 *
 * `buildFigureSvg(model)` returnerer en **SVG-streng**. Ingen DOM, ingen
 * three.js, ingen `canvas.toDataURL()`. Funksjonen er ren: samme modell inn gir
 * alltid nøyaktig samme streng ut, og den kan derfor enhetstestes i Node.
 *
 * Fire ting det er verdt å lese før man endrer noe her:
 *
 *  1. **`viewBox` er i millimeter.** `width="174mm"` og `viewBox="0 0 174 95"`
 *     gjør at én brukerenhet ER én millimeter på papiret. Derfor blir
 *     `stroke-width="0.25"` en ekte 0,25 mm strek og `font-size="2.5"` en
 *     2,5 mm (≈7 pt) skrift — uansett hvilken målestokk tegningen havner i.
 *
 *  2. **Ingen `transform="scale()"`.** Skalerer man gruppa, skaleres
 *     strekbredder og skrift med, og ved 1:100 blir alt hårtynt og uleselig.
 *     All transformasjon skjer i JavaScript: `toPaper([x_mm, y_mm])` kalles på
 *     hvert eneste punkt før `d`-strengen bygges, og y snus der (SVG har y
 *     nedover, tverrsnittet har y oppover).
 *
 *  3. **Enheter.** `model.shapes[].points` og `model.joints[].a/.b` er i
 *     ARBEIDSENHET (`model.unit` ∈ `mm|cm|m`), mens alt som kommer fra
 *     `computeReinforcement()` (`res.section.xc`, `res.axes` …) er i
 *     MILLIMETER. Geometrien skaleres derfor til mm med
 *     `k = unitInfo(unit).toMillimetres` FØRST, og resten av fila jobber i mm.
 *     Blandes de to, havner tyngdepunktskorset et helt annet sted enn
 *     tverrsnittet — en feil som ser plausibel ut i mm-modus og bare dukker
 *     opp når noen jobber i meter.
 *
 *  4. **Hull.** En form har én ring. Hull lages som egne former med
 *     `role: 'void'`. De tegnes ALDRI som egne fylte flater; de blir subpaths
 *     i den formen de ligger inni, og `fill-rule="evenodd"` gjør resten.
 *
 * Utsnittet regnes ut på nytt hver gang, deterministisk («zoom alt», §7.5).
 * `buildFigureSvg` tar bevisst IKKE imot lerretets zoom/pan — en rapport som
 * ser ulik ut avhengig av hvor brukeren sist zoomet, er ikke en rapport.
 */

import { unitInfo } from './units.js';

/* ================================================================== *
 * Papir og romfordeling — alle mål i mm, målt i figurens eget viewBox
 * ================================================================== */

/**
 * Figurflaten. Trykkflaten på A4 med margene i §4 er 174 mm bred; §4.1 gir
 * figuren 95 mm av de 259 mm høye. (§7.4 skrev 112 mm før §4.1 ble revidert —
 * 95 er det som gjelder.)
 */
export const PAPER = Object.freeze({ w: 174, h: 72 });

/**
 * Romfordelingen i figuren. Tegneflaten er det som blir igjen når
 * tegnforklaringen har fått sin kolonne til høyre.
 *
 * Tegnforklaringen ligger i en egen høyrekolonne i stedet for å flyte oppå
 * tegningen nede til høyre. Det er den samme plasseringen visuelt, men den er
 * DETERMINISTISK: tegneflaten kan aldri kollidere med forklaringsboksen,
 * uansett hvor mange deler modellen har.
 */
export const LAYOUT = Object.freeze({
  pad: 2.5, // luft mot papirkanten
  headerH: 5, // stripa øverst med målestokkteksten
  marginLeft: 3, // luft mot venstre kant
  marginBottom: 3, // luft mot nedre kant
  gap: 2.5, // luft mellom tegneflaten og høyrekolonnen
  rightW: 44, // høyrekolonnen: tegnforklaringen
});

/** Tegneflaten, utledet av `LAYOUT`. `x`/`y` er øvre venstre hjørne. */
export const DRAW_BOX = Object.freeze({
  x: LAYOUT.pad + LAYOUT.marginLeft, //                     5.5
  y: LAYOUT.pad + LAYOUT.headerH, //                      7.5
  w: PAPER.w - LAYOUT.pad - LAYOUT.rightW - LAYOUT.gap - (LAYOUT.pad + LAYOUT.marginLeft), // 119.5
  h: PAPER.h - LAYOUT.pad - LAYOUT.marginBottom - (LAYOUT.pad + LAYOUT.headerH), //          59
});

/** Målestokkene en tegning får lov å ha. Samme liste som §7.4. */
export const SCALES = Object.freeze([1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]);

/** Maks antall rader i tegnforklaringen (§4.1 sin overflytsregel). */
export const MAX_LEGEND_ROWS = 8;

const INK = '#334155'; // konturstrek
const INK_SOFT = '#64748b'; // hjelpelinjer, skravur
const INK_FAINT = '#94a3b8'; // ramme
const JOINT_INK = '#0d9488'; // JOINT_COLOR (#2dd4bf) mørknet til trykk
const TEXT = '#0f172a';
const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

/* ================================================================== *
 * Små hjelpere — bevisst lokale, så fila ikke drar inn DOM-avhengigheter
 * ================================================================== */

/** Tall til SVG-attributt: 3 desimaler, uten etterslepende nuller. */
function n3(v) {
  if (!Number.isFinite(v)) return '0';
  const s = (Math.round(v * 1000) / 1000).toFixed(3);
  return s.replace(/\.?0+$/, '') || '0';
}

/** Tall til lesbar norsk tekst (komma som desimalskilletegn). */
function fmt(v, decimals = 0) {
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(decimals).replace('.', ',');
}

/** Målsettingstall: hele mm når det er stort, én desimal når det er lite. */
function fmtMm(v) {
  const a = Math.abs(v);
  if (a >= 100) return fmt(v, 0);
  if (a >= 10) return fmt(v, 1);
  return fmt(v, 2);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Kutter en tekst som ikke får plass, med ellipse. */
function trunc(s, maxChars) {
  const t = String(s == null ? '' : s);
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

/**
 * Lys, OPAK variant av formens farge, regnet mot hvitt i JS. Vi bruker ikke
 * `fill-opacity`, som blir upålitelig når `print-color-adjust` ikke slår
 * gjennom i nettleserens PDF-eksport.
 */
function tint(hex, amount = 0.76) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#e2e8f0';
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const hh = (c) => mix(c).toString(16).padStart(2, '0');
  return `#${hh(r)}${hh(g)}${hh(b)}`;
}

/** Åpner en ring (fjerner det duplikate sluttpunktet) — lokal kopi, uten import. */
function openRing(ring) {
  if (!ring || ring.length < 2) return (ring || []).slice();
  const [x0, y0] = ring[0];
  const [xn, yn] = ring[ring.length - 1];
  if (Math.abs(x0 - xn) < 1e-9 && Math.abs(y0 - yn) < 1e-9) return ring.slice(0, -1);
  return ring.slice();
}

/** `points` → MultiPolygon med én lukket ytterring. Fallback når `analyze()` mangler. */
function pointsToMulti(points) {
  if (!points || points.length < 3) return [];
  return [[points.map((p) => [p[0], p[1]])]];
}

function scaleMulti(multi, k) {
  if (k === 1) return multi;
  return (multi || []).map((poly) => poly.map((ring) => ring.map(([x, y]) => [x * k, y * k])));
}

function growBounds(b, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return b;
  if (!b) return { minX: x, minY: y, maxX: x, maxY: y };
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
  return b;
}

function boundsOfMulti(multi, seed = null) {
  let b = seed;
  for (const poly of multi || []) {
    for (const ring of poly || []) {
      for (const [x, y] of ring || []) b = growBounds(b, x, y);
    }
  }
  return b;
}

function ringBounds(ring) {
  let b = null;
  for (const [x, y] of ring || []) b = growBounds(b, x, y);
  return b;
}

/** Punkt-i-ring (ray casting). Lokal kopi — fila skal ikke importere geometry.js. */
function pointInRing(pt, ring) {
  const r = openRing(ring);
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    const hits = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hits) inside = !inside;
  }
  return inside;
}

/* ================================================================== *
 * Utsnitt og målestokk (§7.5)
 * ================================================================== */

/**
 * Minste målestokk i `SCALES` som gjør at `w × h` (modellmål i mm, luft
 * inkludert) får plass i `box` (papirmål i mm). Faller tilbake på den groveste
 * målestokken hvis ingenting rekker — da er modellen større enn 110,5 m, og en
 * beskåret tegning er et bedre svar enn ingen tegning.
 */
export function chooseScale(w, h, box = DRAW_BOX) {
  for (const S of SCALES) {
    if (w / S <= box.w + 1e-9 && h / S <= box.h + 1e-9) return S;
  }
  return SCALES[SCALES.length - 1];
}

/**
 * Legger 6 % luft på hver side, minst 10 mm i modellkoordinater (§7.5, punkt 2).
 * En degenerert boks (én linje, ett punkt) får en minstestørrelse, slik at
 * målestokkvalget ikke deler på null.
 */
function padBounds(b) {
  const w = Math.max(b.maxX - b.minX, 0);
  const h = Math.max(b.maxY - b.minY, 0);
  const px = Math.max(0.06 * w, 10);
  const py = Math.max(0.06 * h, 10);
  return { minX: b.minX - px, minY: b.minY - py, maxX: b.maxX + px, maxY: b.maxY + py };
}

/* ================================================================== *
 * Modellen → tegnbare data (alt i mm)
 * ================================================================== */

function prepare(model) {
  const m = model || {};
  const unit = m.unit || 'mm';
  const k = unitInfo(unit).toMillimetres;
  const res = m.res || null;
  const analysis = m.analysis || null;

  const partById = new Map();
  for (const p of (analysis && analysis.parts) || []) partById.set(p.id, p);
  const resPartById = new Map();
  for (const p of (res && res.parts) || []) resPartById.set(p.id, p);

  const active = (m.shapes || []).filter(
    (s) => s && s.include !== false && Array.isArray(s.points) && s.points.length >= 3
  );

  /** Alle formene, med sin effektive MultiPolygon i mm. */
  const entries = active.map((s) => {
    const ap = partById.get(s.id);
    const raw = ap && ap.multi && ap.multi.length ? ap.multi : pointsToMulti(s.points);
    const rp = resPartById.get(s.id);
    const E = rp && Number.isFinite(rp.E) ? rp.E : s.material && Number.isFinite(s.material.E) ? s.material.E : null;
    return {
      shape: s,
      isVoid: s.role === 'void',
      isNew: s.stage === 'new',
      multi: scaleMulti(raw, k),
      E,
    };
  });

  const solids = entries.filter((e) => !e.isVoid);
  const voids = entries.filter((e) => e.isVoid);

  const netMulti = scaleMulti((analysis && analysis.netMulti) || [], k);

  // Merkingen er ÉN kilde. `report.js` sin `jointLabels()` nummererer fra
  // `res.joints`, og sender kartet hit. Figuren nummererer bare selv når den
  // brukes frittstående (konsollet, testene).
  //
  // Hvorfor det er nødvendig: lista under FILTRERER bort skjøter med ugyldig
  // geometri, mens `res.joints` beholder dem. Nummererte figuren og tabellen
  // hver for seg, ville én ødelagt skjøtelinje forskjøvet alle merkelappene
  // etter den — slik at «J3» i tabellen pekte på «J2» i tegningen, uten at noe
  // varslet. En rapport der merkelappene lyver er verre enn ingen rapport.
  const labelMap = m.jointLabels instanceof Map ? m.jointLabels : null;
  const joints = (m.joints || [])
    .filter((j) => j && Array.isArray(j.a) && Array.isArray(j.b))
    .map((j, i) => {
      const rj = res && res.joints ? res.joints.find((x) => x.id === j.id) : null;
      const mapped = labelMap ? labelMap.get(j.id) : null;
      return {
        id: j.id,
        index: i + 1,
        label: mapped || `J${i + 1}`,
        a: [j.a[0] * k, j.a[1] * k],
        b: [j.b[0] * k, j.b[1] * k],
        // Typen kodes i MERKELAPPEN, ikke i strekens utseende (§7.4, punkt 5).
        kind: rj ? (rj.existingOnly ? 'ᴇ–ᴇ' : 'ᴇ–ɴ') : null,
      };
    });

  const reference = Array.isArray(m.reference) ? [m.reference[0] * k, m.reference[1] * k] : null;

  const allExisting = res ? !!res.allExisting : solids.length > 0 && solids.every((e) => !e.isNew);
  const tpAfter =
    res && res.section && res.section.valid ? [res.section.xc, res.section.yc] : null;
  const tpBefore =
    res && res.existingSection && res.existingSection.valid && !allExisting
      ? [res.existingSection.xc, res.existingSection.yc]
      : null;
  const theta =
    res && res.axes && res.axes.after && res.axes.after.valid ? res.axes.after.theta : null;
  const EI1 = res && res.axes && res.axes.after ? res.axes.after.EI1 : null;
  const EI2 = res && res.axes && res.axes.after ? res.axes.after.EI2 : null;

  return { unit, k, entries, solids, voids, netMulti, joints, reference, tpAfter, tpBefore, theta, EI1, EI2, allExisting };
}

/* ================================================================== *
 * Path-bygging
 * ================================================================== */

/**
 * Alle ringene i en MultiPolygon som ETT `d`, med én subpath per ring.
 * Sammen med `fill-rule="evenodd"` gir det hull gratis.
 */
function multiPath(multi, toPaper) {
  const out = [];
  for (const poly of multi || []) {
    for (const ring of poly || []) {
      const pts = openRing(ring);
      if (pts.length < 3) continue;
      const seg = pts.map(toPaper).map(([x, y]) => `${n3(x)},${n3(y)}`);
      out.push(`M${seg[0]}L${seg.slice(1).join('L')}Z`);
    }
  }
  return out.join('');
}

/**
 * Formens egen MultiPolygon, pluss ringene til de `role: 'void'`-formene som
 * ligger INNE i den. Det er slik hull kommer inn i tegningen: som ekstra
 * subpaths i den formen de går gjennom, ikke som egne fylte flater.
 *
 * `analyze()` kan allerede ha trukket hullet fra (det skjer i `priority`-modus,
 * og i `sum`-modus når polygon-clipping er tilgjengelig). Da har formen
 * innerringer fra før, og vi må ikke legge til den samme ringen én gang til —
 * to sammenfallende ringer ville med `evenodd` fylt hullet igjen. Derfor
 * sammenlignes omsluttende bokser før en void-ring legges til.
 */
function multiWithVoids(entry, voids) {
  const own = entry.multi || [];
  if (!voids.length || !own.length) return own;

  const existingHoles = [];
  for (const poly of own) for (let i = 1; i < poly.length; i++) existingHoles.push(ringBounds(poly[i]));

  const sameBox = (a, b) => {
    if (!a || !b) return false;
    const tol = Math.max(1e-6, 1e-3 * Math.max(a.maxX - a.minX, a.maxY - a.minY, 1));
    return (
      Math.abs(a.minX - b.minX) < tol &&
      Math.abs(a.minY - b.minY) < tol &&
      Math.abs(a.maxX - b.maxX) < tol &&
      Math.abs(a.maxY - b.maxY) < tol
    );
  };

  return own.map((poly) => {
    const outer = poly[0];
    const extra = [];
    for (const v of voids) {
      for (const vPoly of v.multi || []) {
        const vRing = vPoly[0];
        const pts = openRing(vRing);
        if (pts.length < 3) continue;
        if (!pointInRing(pts[0], outer)) continue;
        const vb = ringBounds(vRing);
        if (existingHoles.some((hb) => sameBox(hb, vb))) continue;
        extra.push(vRing);
      }
    }
    return extra.length ? [...poly, ...extra] : poly;
  });
}

/* ================================================================== *
 * Tegneelementer
 * ================================================================== */

function textEl(x, y, s, { size = 2.4, fill = TEXT, anchor = 'start', weight = 'normal', style = '', rotate = null } = {}) {
  const t = rotate === null ? '' : ` transform="rotate(${n3(rotate)} ${n3(x)} ${n3(y)})"`;
  const st = style ? ` font-style="${style}"` : '';
  return `<text x="${n3(x)}" y="${n3(y)}" font-family="${FONT}" font-size="${n3(size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${st}${t}>${esc(s)}</text>`;
}

function line(x1, y1, x2, y2, stroke, width, dash = null) {
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<line x1="${n3(x1)}" y1="${n3(y1)}" x2="${n3(x2)}" y2="${n3(y2)}" stroke="${stroke}" stroke-width="${n3(width)}"${d} />`;
}

/* ------------------------------------------------------------------ *
 * Tegnforklaring (§7.4, punkt 8)
 * ------------------------------------------------------------------ */

function legend(solids, x, bottomY, width) {
  const rows = solids.slice(0, MAX_LEGEND_ROWS);
  const rest = solids.length - rows.length;
  const rowH = 5.2;
  const headH = 4.4;
  const extraH = rest > 0 ? 3.4 : 0;
  const h = headH + rows.length * rowH + extraH + 1.6;
  const y = bottomY - h;

  const out = [];
  out.push(`<rect x="${n3(x)}" y="${n3(y)}" width="${n3(width)}" height="${n3(h)}" rx="0.8" fill="#ffffff" stroke="${INK_FAINT}" stroke-width="0.2" />`);
  out.push(textEl(x + 1.6, y + 3.2, 'Deler og materialdata', { size: 2.3, weight: '600' }));

  rows.forEach((e, i) => {
    const ry = y + headH + i * rowH;
    out.push(
      `<rect x="${n3(x + 1.6)}" y="${n3(ry + 0.4)}" width="3.2" height="2.4" fill="${tint(e.shape.color)}" stroke="${INK}" stroke-width="0.2"${e.isNew ? ' stroke-dasharray="0.8 0.6"' : ''} />`
    );
    out.push(textEl(x + 6, ry + 2.5, trunc(e.shape.name || 'Form', 24), { size: 2.3 }));
    const E = Number.isFinite(e.E) ? `E = ${fmt(e.E, 0)} N/mm²` : 'E ukjent';
    out.push(textEl(x + 6, ry + 4.9, `${E} · ${e.isNew ? 'ny' : 'eksisterende'}`, { size: 2, fill: INK_SOFT }));
  });

  if (rest > 0) {
    out.push(textEl(x + 1.6, y + headH + rows.length * rowH + 2.6, `… og ${rest} flere — se tabellen`, { size: 2, fill: INK_SOFT }));
  }
  return { svg: `<g id="fig-legend">${out.join('')}</g>`, top: y };
}

/* ================================================================== *
 * Hovedfunksjonen
 * ================================================================== */

/**
 * Bygger måltegningen av tverrsnittet som en SVG-streng.
 *
 * @param {Object} model
 * @param {string} [model.unit]      Arbeidsenhet, `'mm' | 'cm' | 'm'`.
 * @param {Array}  [model.shapes]    `state.shapes` — punkt i ARBEIDSENHET.
 * @param {Array}  [model.joints]    `state.joints` — punkt i ARBEIDSENHET.
 * @param {Array}  [model.reference] Nullpunktet, i arbeidsenhet.
 * @param {Object} [model.analysis]  `analyze(state.shapes, state.mode)`. Gir
 *   ekte innerringer der clipperen har vært i sving; utelates den, faller vi
 *   tilbake på `shape.points`.
 * @param {Object} [model.res]       `computeReinforcement(state)` — i MILLIMETER.
 * @param {string} [model.idPrefix]  Prefiks for interne SVG-id-er, slik at to
 *   figurer på samme side ikke deler `<pattern>`-id.
 * @returns {string} SVG-dokument som streng.
 *
 * Merk hva som IKKE står i signaturen: lerretets zoom eller pan. Utsnittet
 * regnes ut her, hver gang, av modellen alene (§7.5).
 */
export function buildFigureSvg(model) {
  const p = prepare(model);
  const idp = (model && model.idPrefix) || 'fig';
  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.w}mm" height="${PAPER.h}mm" ` +
    `viewBox="0 0 ${PAPER.w} ${PAPER.h}" role="img" ` +
    `aria-label="Tverrsnittet med skjøter, tyngdepunkt og hovedakser" ` +
    `style="print-color-adjust:exact;-webkit-print-color-adjust:exact">`;
  const paper = `<rect x="0" y="0" width="${PAPER.w}" height="${PAPER.h}" fill="#ffffff" />`;
  const frame = `<rect x="0.2" y="0.2" width="${n3(PAPER.w - 0.4)}" height="${n3(PAPER.h - 0.4)}" fill="none" stroke="${INK_FAINT}" stroke-width="0.2" />`;

  /* ---- tomtilfelle: rapporten skal fortsatt kunne skrives ut ---- */
  if (!p.solids.length) {
    return (
      open +
      paper +
      frame +
      textEl(PAPER.w / 2, PAPER.h / 2, 'Ingen geometri i modellen', { size: 4, anchor: 'middle', fill: INK_SOFT }) +
      '</svg>'
    );
  }

  /* ---- 1. Utsnittet: omsluttende boks av ALT som skal tegnes (§7.5) ---- */
  let shapeBounds = null;
  for (const e of p.entries) shapeBounds = boundsOfMulti(e.multi, shapeBounds);
  let content = shapeBounds ? { ...shapeBounds } : null;
  content = boundsOfMulti(p.netMulti, content);
  for (const j of p.joints) {
    content = growBounds(content, j.a[0], j.a[1]);
    content = growBounds(content, j.b[0], j.b[1]);
  }
  if (p.tpAfter) content = growBounds(content, p.tpAfter[0], p.tpAfter[1]);
  if (p.tpBefore) content = growBounds(content, p.tpBefore[0], p.tpBefore[1]);
  if (p.reference) content = growBounds(content, p.reference[0], p.reference[1]);

  const view = padBounds(content);
  const S = chooseScale(view.maxX - view.minX, view.maxY - view.minY, DRAW_BOX);

  /* ---- 2. toPaper: transformasjonen skjer HER, ikke i et SVG-transform ---- */
  const wPaper = (view.maxX - view.minX) / S;
  const hPaper = (view.maxY - view.minY) / S;
  const ox = DRAW_BOX.x + (DRAW_BOX.w - wPaper) / 2;
  const originY = DRAW_BOX.y + (DRAW_BOX.h - hPaper) / 2 + hPaper; // nedre kant
  /** @param {[number,number]} pt mm i modellen → mm på papiret */
  const toPaper = (pt) => [ox + (pt[0] - view.minX) / S, originY - (pt[1] - view.minY) / S];

  const body = [];
  const defs = [];

  /* ---- 3. Nettokonturen som fasit, tegnet under fyllene ---- */
  if (p.netMulti.length) {
    const d = multiPath(p.netMulti, toPaper);
    if (d) body.push(`<path d="${d}" fill="none" fill-rule="evenodd" stroke="${INK}" stroke-width="0.35" />`);
  }

  /* ---- 4. Formene. Én <path> per form, hull som subpaths ---- */
  const parts = [];
  p.solids.forEach((e, i) => {
    const d = multiPath(multiWithVoids(e, p.voids), toPaper);
    if (!d) return;
    const base = tint(e.shape.color);
    let fill = base;
    if (e.isNew) {
      // Nye deler: skravur OG stiplet kontur. Skravuren ligger i et
      // <pattern> med den lyse fargen som bunn, slik at formen fortsatt blir
      // ÉN <path> — hullet i den er fortsatt et hull.
      const pid = `${idp}-hatch-${i}`;
      defs.push(
        `<pattern id="${pid}" width="1.8" height="1.8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          `<rect width="1.8" height="1.8" fill="${base}" />` +
          `<line x1="0" y1="0" x2="0" y2="1.8" stroke="${INK_SOFT}" stroke-width="0.18" />` +
          `</pattern>`
      );
      fill = `url(#${pid})`;
    }
    const dash = e.isNew ? ' stroke-dasharray="1.5 1"' : '';
    parts.push(
      `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${INK}" stroke-width="0.25"${dash} />`
    );
  });
  body.push(`<g id="fig-parts">${parts.join('')}</g>`);

  /* ---- 6. Tyngdepunkt før og etter ---- */
  const tpSvg = [];
  if (p.tpAfter) {
    const [cx, cy] = toPaper(p.tpAfter);
    tpSvg.push(`<circle cx="${n3(cx)}" cy="${n3(cy)}" r="1.5" fill="#ffffff" stroke="${TEXT}" stroke-width="0.25" />`);
    tpSvg.push(`<path d="M${n3(cx)},${n3(cy - 1.5)}A1.5 1.5 0 0 1 ${n3(cx + 1.5)},${n3(cy)}L${n3(cx)},${n3(cy)}Z" fill="${TEXT}" />`);
    tpSvg.push(`<path d="M${n3(cx)},${n3(cy + 1.5)}A1.5 1.5 0 0 1 ${n3(cx - 1.5)},${n3(cy)}L${n3(cx)},${n3(cy)}Z" fill="${TEXT}" />`);
    tpSvg.push(line(cx - 2.6, cy, cx + 2.6, cy, TEXT, 0.2));
    tpSvg.push(line(cx, cy - 2.6, cx, cy + 2.6, TEXT, 0.2));
    tpSvg.push(
      textEl(cx + 3, cy - 0.6, `TP (${fmtMm(p.tpAfter[0])}; ${fmtMm(p.tpAfter[1])})`, { size: 2.2, weight: '600' })
    );
  }
  if (tpSvg.length) body.push(`<g id="fig-centroid">${tpSvg.join('')}</g>`);

  /* ---- 7. Skjøter, med merkelapp J1, J2 … ---- */
  if (p.joints.length) {
    const js = [];
    // Merkelappene skyves ut FORBI tverrsnittet, ikke bare et fast stykke fra
    // skjøten — en skjøt inne i en 60 mm tykk påføring ville ellers fått
    // merkelappen sin liggende oppå den delen den peker på.
    const bb = shapeBounds
      ? (() => {
          const a = toPaper([shapeBounds.minX, shapeBounds.minY]);
          const b = toPaper([shapeBounds.maxX, shapeBounds.maxY]);
          return [
            [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
            [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
            [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
            [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
          ];
        })()
      : null;
    const cx = DRAW_BOX.x + DRAW_BOX.w / 2;
    const cy = DRAW_BOX.y + DRAW_BOX.h / 2;
    for (const j of p.joints) {
      const a = toPaper(j.a);
      const b = toPaper(j.b);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) continue;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;
      js.push(line(a[0], a[1], b[0], b[1], JOINT_INK, 0.6));
      js.push(line(a[0] - nx * 0.8, a[1] - ny * 0.8, a[0] + nx * 0.8, a[1] + ny * 0.8, JOINT_INK, 0.3));
      js.push(line(b[0] - nx * 0.8, b[1] - ny * 0.8, b[0] + nx * 0.8, b[1] + ny * 0.8, JOINT_INK, 0.3));

      // Merkelappen legges på den siden av skjøten som peker ut av tegningen.
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const sign = (mx - cx) * nx + (my - cy) * ny >= 0 ? 1 : -1;
      let reach = 5.5;
      if (bb) {
        const t = Math.max(...bb.map((c) => (c[0] - mx) * nx * sign + (c[1] - my) * ny * sign));
        reach = Math.max(5.5, t + 4);
      }
      const lx = mx + sign * nx * reach;
      const ly = my + sign * ny * reach;
      const txt = j.kind ? `${j.label} ${j.kind}` : j.label;
      const bw = 2.2 + txt.length * 1.32;
      const bh = 3.6;
      // Merkelappen klemmes til tegneflaten (med litt overheng), IKKE til hele
      // arket — ellers kan en skjøt ute i høyre kant skyve merkelappen sin oppå
      // tegnforklaringen.
      const bx = Math.min(Math.max(lx - bw / 2, LAYOUT.pad), DRAW_BOX.x + DRAW_BOX.w + 1 - bw);
      const by = Math.min(Math.max(ly - bh / 2, LAYOUT.pad), DRAW_BOX.y + DRAW_BOX.h + 2 - bh);
      js.push(line(mx, my, bx + bw / 2, by + bh / 2, JOINT_INK, 0.15));
      js.push(`<rect x="${n3(bx)}" y="${n3(by)}" width="${n3(bw)}" height="${n3(bh)}" rx="0.5" fill="#ffffff" stroke="${JOINT_INK}" stroke-width="0.2" />`);
      js.push(textEl(bx + bw / 2, by + 2.6, txt, { size: 2.3, anchor: 'middle', fill: JOINT_INK, weight: '600' }));
    }
    body.push(`<g id="fig-joints">${js.join('')}</g>`);
  }

  /* ---- 8. Nullpunktsmarkør ---- */
  if (p.reference) {
    const [rx, ry] = toPaper(p.reference);
    if (rx >= DRAW_BOX.x && rx <= DRAW_BOX.x + DRAW_BOX.w && ry >= DRAW_BOX.y && ry <= DRAW_BOX.y + DRAW_BOX.h) {
      body.push(
        `<g id="fig-ref">${line(rx - 1.8, ry, rx + 1.8, ry, INK_SOFT, 0.18)}${line(rx, ry - 1.8, rx, ry + 1.8, INK_SOFT, 0.18)}` +
          textEl(rx + 2.2, ry + 2.4, '0', { size: 2, fill: INK_SOFT }) +
          '</g>'
      );
    }
  }

  /* ---- 9. Tegnforklaring ---- */
  body.push(legend(p.solids, PAPER.w - LAYOUT.pad - LAYOUT.rightW,
                   PAPER.h - LAYOUT.pad, LAYOUT.rightW).svg);

  /* ---- 10. Målestokk ---- */
  const scaleTxt = `Målestokk 1:${fmt(S, Number.isInteger(S) ? 0 : 1)} · mål i mm`;
  body.push(textEl(LAYOUT.pad, LAYOUT.pad + 2.6, scaleTxt, { size: 2.5, weight: '600' }));

  const defsSvg = defs.length ? `<defs>${defs.join('')}</defs>` : '';
  return open + defsSvg + paper + frame + body.join('') + '</svg>';
}

export default buildFigureSvg;
