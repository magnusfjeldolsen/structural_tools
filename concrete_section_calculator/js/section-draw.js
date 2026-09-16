/**
 * section-draw.js — tverrsnittstegningen, som SVG-streng.
 *
 * Seks ting som er verdt å lese før noe endres her:
 *
 *  1. **`barPositions()` fra `rebar.js` er eneste kilde til jernkoordinater.**
 *     Denne fila regner dem ALDRI selv. Regnet tegningen og `payload.js` ut
 *     posisjonene hver for seg, ville figuren kunne vise noe annet enn det
 *     motoren faktisk integrerte — uten at en eneste test feilet. Det er den
 *     verste sviktformen som finnes, og planen §4.2 sier derfor rett ut at
 *     `barPositions` er den viktigste funksjonen i modulen.
 *
 *  2. **Ingen ekstern CSS, bare presentasjonsattributter** (planen §2.3 krav 4).
 *     `print.css` eies av en annen agent. Delte to filer kontrollen over
 *     figuren, ville en uskyldig regel i stilarket kunne gjøre armeringen
 *     usynlig på papir uten at noen så det før etter utskrift. Alt som avgjør
 *     hvordan figuren ser ut står derfor i selve SVG-strengen.
 *
 *  3. **`viewBox` er i «rapport-millimeter», ikke i tverrsnittets millimeter.**
 *     Samme grep som `geometry_workspace/js/report-figure.js`: én brukerenhet i
 *     viewBox ER én millimeter på papiret når `width="174mm"`. Derfor blir
 *     `stroke-width="0.25"` en ekte 0,25 mm strek og `font-size="2.5"` en
 *     2,5 mm skrift — uansett om tverrsnittet er 200 eller 2000 mm høyt.
 *     Modellkoordinater transformeres i JavaScript, ett punkt om gangen, av
 *     `toPaper()`. Det finnes **ingen** `transform="scale()"` her: skalerer man
 *     gruppa, skaleres strekbredder og skrift med, og en slank plate blir
 *     hårtynn og uleselig.
 *
 *  4. **`unit: 'px'` bruker samme tallrom som `'mm'`.** Alle strekbredder og
 *     skriftstørrelser ganges med `u = width / 174`, slik at en 600 px bred
 *     skjermfigur får ~0,9 px streker og ~8,6 px skrift i stedet for 0,25 px
 *     og 2,5 px. Rapportbredden 174 mm er altså referansen for *alle* mål, og
 *     figuren ser lik ut på skjerm og papir.
 *
 *  5. **`sectionViewBox()` er skilt ut fordi den kan testes uten å parse SVG.**
 *     Den er den eneste stedet utsnitt og målestokk bestemmes; `drawSection()`
 *     spør den og tegner. Endres marginene, endres begge samtidig.
 *
 *  6. **Bøyler (endringsrunde 4, §5.3) er bevisst NEDTONET og bruker bare
 *     `stirrups[0]`.** `state.shear.stirrups` er en liste fordi ulike rader
 *     langs bjelkens lengde kan ha ulik senneavstand (se `rebar.js`), men én
 *     tverrsnittstegning kan bare vise ÉN fysisk bøyle om gangen — radene er
 *     alternative soner, ikke bøyler som eksisterer samtidig i samme snitt.
 *     `stirrupGeometry()` er skilt ut av samme grunn som `sectionViewBox()`:
 *     radiusklemmen (`min(2·dia, halve korteste innersiden)`) skal kunne
 *     testes som rene tall, ikke gjettes fra en tegnet figur.
 *
 * Aksesystemet er planens (§3.6): `y` er horisontalt, `z` er vertikalt og peker
 * OPP, og tverrsnittet er sentrert om origo — samme nullpunkt som motoren
 * refererer `N` og `M` til. SVG har y nedover, så `toPaper()` snur z.
 */

import { barPositions } from './rebar.js';
// `sectionWidth` og ALDRI `state.geometry.b`: plata regnes per meter, og for
// `sectionType === 'slab'` returnerer `sectionWidth` 1000 uansett hva som ligger
// igjen i `geometry.b` fra en bjelke. Leste figuren `geometry.b` direkte, kunne
// en plate lastet inn via `setInputs`/dokumentlasting bli TEGNET 300 mm bred
// mens motoren regnet 1000 mm — figur og tall ville vist to ulike tverrsnitt
// uten at noen test feilet. Samme prinsipp som punkt 1 over.
import { sectionWidth } from './section.js';

/* ------------------------------------------------------------------ *
 * Papir: referansebredden og marginene
 * ------------------------------------------------------------------ */

/**
 * Rapportens figurbredde (planen §8). Alt annet er relativt til denne, slik at
 * en figur på 87 mm (to i bredden) eller 600 px (skjerm) får proporsjonalt
 * tynnere/tykkere streker i stedet for å arve 174-millimetersverdiene rått.
 */
const REPORT_WIDTH = 174;

/** Marginer i rapport-mm. Mål- og merkelappsonene koster plass bare når de brukes. */
const MARGIN = Object.freeze({
  top: 6,
  bottom: { on: 15, off: 4 },   // b-målet ligger under tverrsnittet
  left: { on: 16, off: 4 },     // h-målet ligger til venstre
  right: { on: 34, off: 4 },    // armeringsmerkelappene ligger til høyre
});

/** Standard maksimal papirhøyde. En høy bjelke skal ikke sprenge en A4-side. */
const DEFAULT_MAX_HEIGHT = 110;

/* ------------------------------------------------------------------ *
 * Farger — presentasjonsattributter, ett sted
 * ------------------------------------------------------------------ */

const THEMES = Object.freeze({
  print: {
    bg: '#ffffff',
    concreteFill: '#f4f4f5',
    concreteStroke: '#18181b',
    rebar: '#18181b',
    dim: '#52525b',
    text: '#18181b',
    na: '#b91c1c',
    compression: '#93c5fd',
    stirrup: '#71717a',    // nedtonet med vilje (planen §5.3) — ikke like mørk som omrisset
  },
  dark: {
    bg: '#0f172a',
    concreteFill: '#334155',
    concreteStroke: '#cbd5e1',
    rebar: '#f8fafc',
    dim: '#94a3b8',
    text: '#e2e8f0',
    na: '#f87171',
    compression: '#38bdf8',
    stirrup: '#94a3b8',
  },
});

const FONT = 'Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------------ *
 * Småting
 * ------------------------------------------------------------------ */

/** Engelsk desimalpunktum, som resten av siden. */
export function fmt(value, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return value.toFixed(decimals);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tre desimaler er nok for et koordinat i mm; mer bare blåser opp strengen. */
function r(v) {
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '0';
}

function resolveOpts(opts = {}) {
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : REPORT_WIDTH;
  return {
    width,
    unit: opts.unit === 'px' ? 'px' : 'mm',
    maxHeight: Number.isFinite(opts.height) && opts.height > 0 ? opts.height : DEFAULT_MAX_HEIGHT,
    showDims: opts.showDims !== false,
    showLabels: opts.showLabels !== false,
    theme: opts.theme === 'dark' ? 'dark' : 'print',
    overlay: opts.overlay || null,
    u: width / REPORT_WIDTH,
  };
}

/* ------------------------------------------------------------------ *
 * Utsnitt og målestokk
 * ------------------------------------------------------------------ */

/**
 * `sectionViewBox(state, opts) -> {minY, minZ, w, h, scale}`
 *
 * `minY`/`minZ`/`w`/`h` er i TVERRSNITTETS millimeter og beskriver hele flaten
 * figuren dekker, marginene inkludert. `scale` er papirenheter per millimeter
 * tverrsnitt. Papirbredden er dermed alltid `w * scale === opts.width`, og
 * papirhøyden `h * scale`.
 *
 * Målestokken er `min(bredde-begrensning, høyde-begrensning)`: en 300×600-bjelke
 * begrenses av høyden, en 1000×200-plate av bredden. Blir det plass til overs i
 * bredden, fordeles den likt på begge sider — tverrsnittet står da midt i
 * tegneflaten i stedet for å klistre seg til venstremargen.
 */
export function sectionViewBox(state, opts = {}) {
  const o = resolveOpts(opts);
  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);

  const mLeft = (o.showDims ? MARGIN.left.on : MARGIN.left.off) * o.u;
  const mRight = (o.showLabels ? MARGIN.right.on : MARGIN.right.off) * o.u;
  const mBottom = (o.showDims ? MARGIN.bottom.on : MARGIN.bottom.off) * o.u;
  const mTop = MARGIN.top * o.u;

  const availW = Math.max(1e-6, o.width - mLeft - mRight);
  const availH = Math.max(1e-6, o.maxHeight * o.u - mTop - mBottom);

  const scale = Math.min(availW / b, availH / h);

  // Overskuddsbredde fordeles likt, slik at tverrsnittet sentreres i tegneflaten.
  const slack = (availW - b * scale) / 2;
  const padLeft = mLeft + slack;
  const padBottom = mBottom;

  const paperH = mTop + mBottom + h * scale;

  return {
    minY: -b / 2 - padLeft / scale,
    minZ: -h / 2 - padBottom / scale,
    w: o.width / scale,
    h: paperH / scale,
    scale,
  };
}

/* ------------------------------------------------------------------ *
 * Bøyler (skjærarmering) — rene tall, skilt ut av samme grunn som
 * `sectionViewBox`: radiusklemmen og bengeometrien skal kunne påstås uten å
 * parse SVG.
 * ------------------------------------------------------------------ */

/**
 * `stirrupGeometry(state) -> {y0, y1, z0, z1, radius, dia, legs, legY, label} | null`
 *
 * Planen (§5.3): avrundet rektangel innenfor overdekningen. `y0`/`y1`/`z0`/`z1`
 * er INNERSIDEN av bøylen i tverrsnittets millimeter — `inset = cover_side +
 * dia/2` horisontalt (langs `b`), `cover + dia/2` vertikalt (langs `h`).
 *
 * **`radius = min(2·dia, halve korteste innersiden)`.** Uten klemmen ville en
 * tynn plate (liten `h`, altså liten `innerH`) fått en hjørneradius som er
 * større enn halve platetykkelsen — et rektangel som «sprekker», med negative
 * eller selvoverlappende sider. Klemmen er ikke kosmetikk; uten den blir
 * `<rect rx=...>` udefinert for enkelte tynne plater.
 *
 * `state.shear.stirrups` er en LISTE (flere rader med ulik senneavstand kan
 * tenkes langs bjelkens lengde, se `rebar.js`), men én tverrsnittstegning kan
 * bare vise ÉN fysisk bøyle om gangen — radene representerer alternative
 * soner langs spennet, ikke bøyler som eksisterer samtidig i samme snitt.
 * Derfor brukes bare `stirrups[0]`, den som også er «S1»-eksempelet i planen.
 *
 * `legs > 2` gir `legY`: y-koordinatene til de INDRE bena, jevnt fordelt
 * mellom de to ytterbena med samme `leg_pitch`-formel som skjærmotoren
 * (planen §3.3): `(innerW) / (legs - 1)`.
 *
 * Returnerer `null` når lista er tom — «tegnes bare når lista er ikke-tom»
 * (§5.3) blir dermed en enkel `if (stirrup)` hos kalleren.
 */
export function stirrupGeometry(state) {
  const list = Array.isArray(state?.shear?.stirrups) ? state.shear.stirrups : [];
  if (!list.length) return null;
  const st = list[0];

  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);
  const dia = Math.max(0, Number(st?.dia) || 0);
  const legs = Math.max(2, Math.round(Number(st?.legs) || 2));
  const spacing = Number(st?.spacing) || 0;
  const coverSide = Number(state?.cover_side) || 0;
  const cover = Number(state?.cover) || 0;

  const insetY = coverSide + dia / 2;
  const insetZ = cover + dia / 2;
  const y0 = -b / 2 + insetY;
  const y1 = b / 2 - insetY;
  const z0 = -h / 2 + insetZ;
  const z1 = h / 2 - insetZ;
  const innerW = Math.max(0, y1 - y0);
  const innerH = Math.max(0, z1 - z0);

  // Klemmen (§5.3): uten `Math.min` mot halve korteste innerside ville en
  // tynn plate fått en hjørneradius figuren ikke kan tegne.
  const radius = Math.max(0, Math.min(2 * dia, Math.min(innerW, innerH) / 2));

  const legY = [];
  if (legs > 2 && innerW > 0) {
    const pitch = innerW / (legs - 1);
    for (let i = 1; i < legs - 1; i++) legY.push(y0 + i * pitch);
  }

  return {
    y0, y1, z0, z1, radius, dia, legs, spacing, legY,
    label: `Ø${fmt(dia, 0)} c/c ${fmt(spacing, 0)} (${legs} legs)`,
  };
}

/* ------------------------------------------------------------------ *
 * Tegning
 * ------------------------------------------------------------------ */

/**
 * `drawSection(state, opts) -> string`
 *
 * Tar HELE tilstanden (planen §6), ikke en delmengde: `barPositions` trenger
 * `cover_side` og `stirrup_dia`, merkelappene trenger `sectionType`, og en
 * delmengde ville bare blitt en ny kontrakt å holde i synk.
 *
 * `opts.overlay = {x, theta}` tegner nøytralaksen og skygger trykksonen.
 * `x` er trykksonehøyden fra TRYKKANTEN, som i `result.bending.x`, og `theta`
 * avgjør hvilken kant det er: 0 ⇒ trykk oppe (feltmoment), π ⇒ trykk nede.
 */
export function drawSection(state, opts = {}) {
  const o = resolveOpts(opts);
  const c = THEMES[o.theme];
  const vb = sectionViewBox(state, opts);
  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);
  const s = vb.scale;
  const paperW = vb.w * s;
  const paperH = vb.h * s;

  // Modell -> papir. z peker opp, SVG-y peker ned.
  const px = (y) => (y - vb.minY) * s;
  const py = (z) => (vb.minZ + vb.h - z) * s;

  const sw = 0.25 * o.u;          // grunnstrek, 0,25 mm på papir
  const swThick = 0.45 * o.u;     // tverrsnittets omriss
  const fsLabel = 2.6 * o.u;
  const fsDim = 2.2 * o.u;

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${r(paperW)}" height="${r(paperH)}" fill="${c.bg}"/>`);

  /* --- Betongtverrsnittet ------------------------------------------ */
  parts.push(
    `<g data-role="concrete">` +
    `<rect x="${r(px(-b / 2))}" y="${r(py(h / 2))}" width="${r(b * s)}" height="${r(h * s)}" ` +
    `fill="${c.concreteFill}" stroke="${c.concreteStroke}" stroke-width="${r(swThick)}"/>` +
    `</g>`
  );

  /* --- Trykksone og nøytralakse ------------------------------------ */
  // Ligger FØR armeringen, slik at jernene aldri havner under skyggen.
  if (o.overlay && Number.isFinite(Number(o.overlay.x))) {
    const x = Number(o.overlay.x);
    const compTop = Math.abs(Number(o.overlay.theta) || 0) < Math.PI / 2;
    const zNa = compTop ? h / 2 - x : -h / 2 + x;
    const zTop = compTop ? h / 2 : zNa;
    const zBot = compTop ? zNa : -h / 2;
    const over = 5 * o.u;

    let g = `<g data-role="na">`;
    if (zTop > zBot) {
      g += `<rect x="${r(px(-b / 2))}" y="${r(py(zTop))}" width="${r(b * s)}" ` +
           `height="${r((zTop - zBot) * s)}" fill="${c.compression}" fill-opacity="0.28"/>`;
    }
    g += `<line x1="${r(px(-b / 2) - over)}" y1="${r(py(zNa))}" ` +
         `x2="${r(px(b / 2) + over)}" y2="${r(py(zNa))}" ` +
         `stroke="${c.na}" stroke-width="${r(sw * 1.6)}" ` +
         `stroke-dasharray="${r(3 * o.u)} ${r(1.5 * o.u)}"/>`;
    g += `<text x="${r(px(-b / 2) - over)}" y="${r(py(zNa) - 1.1 * o.u)}" ` +
         `font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.na}">` +
         `x = ${esc(fmt(x, 1))} mm</text>`;
    parts.push(g + `</g>`);
  }

  /* --- Bøyler (skjærarmering), nedtonet ------------------------------ *
   * FØR armeringen (samme grunn som trykksoneskyggen over): jernene skal
   * aldri havne under bøyleomrisset. Tegnes bare når lista er ikke-tom
   * (§5.3) — `stirrupGeometry` returnerer `null` ellers.
   */
  const stirrup = stirrupGeometry(state);
  if (stirrup && stirrup.y1 > stirrup.y0 && stirrup.z1 > stirrup.z0) {
    const swStirrup = 0.18 * o.u;   // tynnere enn omrisset (swThick) OG grunnstreken (sw)
    const rx = stirrup.radius * s;
    let g = `<g data-role="stirrup" stroke="${c.stirrup}" stroke-width="${r(swStirrup)}" fill="none">`;
    g += `<rect x="${r(px(stirrup.y0))}" y="${r(py(stirrup.z1))}" ` +
         `width="${r((stirrup.y1 - stirrup.y0) * s)}" height="${r((stirrup.z1 - stirrup.z0) * s)}" ` +
         `rx="${r(rx)}" ry="${r(rx)}"/>`;
    // Ekstra ben (legs > 2): loddrette streker jevnt fordelt mellom ytterbena.
    for (const ly of stirrup.legY) {
      g += `<line x1="${r(px(ly))}" y1="${r(py(stirrup.z1))}" ` +
           `x2="${r(px(ly))}" y2="${r(py(stirrup.z0))}"/>`;
    }
    g += `</g>`;
    // Én liten etikett, ingen kotering (§5.3 — bevisst nedtonet). Plassert
    // MIDT i bøylen, både vannrett og loddrett: der er tverrsnittet nesten
    // alltid tomt. Den lå før rett over det nedre indre hjørnet — altså
    // nøyaktig oppå underkantarmeringen, som tegnes ETTER bøylen og dermed
    // malte over teksten, og for et smalt tverrsnitt stakk den ut av kanten.
    g += `<text x="${r((px(stirrup.y0) + px(stirrup.y1)) / 2)}" ` +
         `y="${r((py(stirrup.z0) + py(stirrup.z1)) / 2)}" text-anchor="middle" ` +
         `font-family="${FONT}" font-size="${r(fsDim * 0.9)}" fill="${c.stirrup}">` +
         `${esc(stirrup.label)}</text>`;
    parts.push(g);
  }

  /* --- Armering ----------------------------------------------------- */
  const layers = Array.isArray(state?.layers) ? state.layers : [];
  const barOpts = {
    sectionType: state?.sectionType,
    cover: state?.cover,
    cover_side: state?.cover_side,
    stirrup_dia: state?.stirrup_dia,
  };

  const drawn = [];   // {layer, bars}
  let bars = `<g data-role="rebar" fill="${c.rebar}">`;
  for (const layer of layers) {
    const pos = barPositions(layer, state.geometry, barOpts) || [];
    drawn.push({ layer, bars: pos });
    for (const p of pos) {
      // Minsteradius: et Ø10-jern i en 1000 mm plate blir under en halv
      // rapport-millimeter og forsvinner i streken uten dette gulvet.
      const rad = Math.max((Number(p.dia) || 0) / 2 * s, 0.5 * o.u);
      bars += `<circle cx="${r(px(Number(p.y) || 0))}" cy="${r(py(Number(p.z) || 0))}" r="${r(rad)}"/>`;
    }
  }
  parts.push(bars + `</g>`);

  /* --- Mål ---------------------------------------------------------- */
  if (o.showDims) {
    let g = `<g data-role="dims" stroke="${c.dim}" stroke-width="${r(sw)}" fill="none">`;
    const off = 8 * o.u;
    const tick = 1.4 * o.u;

    // Bredde, under tverrsnittet
    const yDim = py(-h / 2) + off;
    g += `<line x1="${r(px(-b / 2))}" y1="${r(py(-h / 2))}" x2="${r(px(-b / 2))}" y2="${r(yDim + tick)}"/>`;
    g += `<line x1="${r(px(b / 2))}" y1="${r(py(-h / 2))}" x2="${r(px(b / 2))}" y2="${r(yDim + tick)}"/>`;
    g += `<line x1="${r(px(-b / 2))}" y1="${r(yDim)}" x2="${r(px(b / 2))}" y2="${r(yDim)}"/>`;
    g += `<line x1="${r(px(-b / 2) - tick)}" y1="${r(yDim + tick)}" x2="${r(px(-b / 2) + tick)}" y2="${r(yDim - tick)}"/>`;
    g += `<line x1="${r(px(b / 2) - tick)}" y1="${r(yDim + tick)}" x2="${r(px(b / 2) + tick)}" y2="${r(yDim - tick)}"/>`;
    g += `</g>`;
    g += `<text x="${r((px(-b / 2) + px(b / 2)) / 2)}" y="${r(yDim + 4 * o.u)}" ` +
         `text-anchor="middle" font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.text}">` +
         `b = ${esc(fmt(b, 0))} mm${state?.sectionType === 'slab' ? ' (per metre)' : ''}</text>`;

    // Høyde, til venstre
    const xDim = px(-b / 2) - off;
    let g2 = `<g data-role="dims" stroke="${c.dim}" stroke-width="${r(sw)}" fill="none">`;
    g2 += `<line x1="${r(px(-b / 2))}" y1="${r(py(h / 2))}" x2="${r(xDim - tick)}" y2="${r(py(h / 2))}"/>`;
    g2 += `<line x1="${r(px(-b / 2))}" y1="${r(py(-h / 2))}" x2="${r(xDim - tick)}" y2="${r(py(-h / 2))}"/>`;
    g2 += `<line x1="${r(xDim)}" y1="${r(py(h / 2))}" x2="${r(xDim)}" y2="${r(py(-h / 2))}"/>`;
    g2 += `<line x1="${r(xDim - tick)}" y1="${r(py(h / 2) + tick)}" x2="${r(xDim + tick)}" y2="${r(py(h / 2) - tick)}"/>`;
    g2 += `<line x1="${r(xDim - tick)}" y1="${r(py(-h / 2) + tick)}" x2="${r(xDim + tick)}" y2="${r(py(-h / 2) - tick)}"/>`;
    g2 += `</g>`;
    const my = (py(h / 2) + py(-h / 2)) / 2;
    g2 += `<text x="${r(xDim - 1.5 * o.u)}" y="${r(my)}" text-anchor="middle" ` +
          `transform="rotate(-90 ${r(xDim - 1.5 * o.u)} ${r(my)})" ` +
          `font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.text}">` +
          `h = ${esc(fmt(h, 0))} mm</text>`;

    parts.push(g + g2);
  }

  /* --- Merkelapper --------------------------------------------------- */
  if (o.showLabels) {
    let g = `<g data-role="labels">`;
    const xEnd = px(b / 2);
    const xText = xEnd + 6 * o.u;
    for (const { layer, bars: pos } of drawn) {
      if (!pos.length) continue;
      const z = pos.reduce((a, p) => a + (Number(p.z) || 0), 0) / pos.length;
      const yRight = Math.max(...pos.map((p) => Number(p.y) || 0));
      g += `<line x1="${r(px(yRight))}" y1="${r(py(z))}" x2="${r(xText - 1 * o.u)}" y2="${r(py(z))}" ` +
           `stroke="${c.dim}" stroke-width="${r(sw)}" stroke-dasharray="${r(1.2 * o.u)} ${r(1.2 * o.u)}"/>`;
      g += `<text x="${r(xText)}" y="${r(py(z) + fsLabel * 0.35)}" font-family="${FONT}" ` +
           `font-size="${r(fsLabel)}" fill="${c.text}">${esc(layerLabel(layer))}</text>`;
      g += `<text x="${r(xText)}" y="${r(py(z) + fsLabel * 0.35 + fsDim * 1.25)}" font-family="${FONT}" ` +
           `font-size="${r(fsDim)}" fill="${c.dim}">${esc(`dc = ${fmt(Number(layer?.dc) || 0, 0)} mm`)}</text>`;
    }
    parts.push(g + `</g>`);
  }

  const widthAttr = o.unit === 'px' ? `${r(o.width)}px` : `${r(o.width)}mm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" ` +
         `viewBox="0 0 ${r(paperW)} ${r(paperH)}" role="img" ` +
         `aria-label="Cross-section ${esc(fmt(b, 0))} x ${esc(fmt(h, 0))} mm">` +
         parts.join('') + `</svg>`;
}

/**
 * Merkelappteksten for ett lag. Bjelke og plate beskrives med hver sin
 * bransjevante notasjon — `3Ø20` og `Ø12 c/c 113` — fordi det er slik laget
 * legges inn i UI-et (§7), og en figur som bruker andre ord enn skjemaet
 * tvinger leseren til å oversette.
 */
export function layerLabel(layer) {
  const dia = Number(layer?.dia) || 0;
  if (layer?.mode === 'spacing') {
    return `Ø${fmt(dia, 0)} c/c ${fmt(Number(layer?.spacing) || 0, 0)}`;
  }
  return `${fmt(Number(layer?.count) || 0, 0)}Ø${fmt(dia, 0)}`;
}
