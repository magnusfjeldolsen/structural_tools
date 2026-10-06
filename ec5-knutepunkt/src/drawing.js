// Tegning av forbindelsen.
// - Normal visning (opts.compact ikke satt): drawConnection() returnerer HTML med en tom
//   container-div + en "Nullstill visning"-knapp. App.js kaller deretter initDrawing3D(containerId,
//   state, result) RETT ETTER at HTML-en er satt inn i DOM-en, som starter en ekte interaktiv
//   3D-scene (Three.js/WebGL) med OrbitControls, lastet on-demand fra CDN via import-map ("three").
//   Ved påfølgende endringer av mønster/mål/vinkel kaller app.js i stedet updateDrawing3D(state,
//   result), som oppdaterer geometri, mål og redigerbare felt i den SAMME scenen uten å ødelegge
//   canvas/inputs — det er dette som gjør at man kan skrive i mål-feltene i 3D-visningen uten å
//   miste fokus for hvert tastetrykk.
// - Utskrift/rapport (opts.compact: true): drawConnection() returnerer en statisk SVG-tegning
//   (plan + snitt), akkurat som før – WebGL gir ikke mening på papir/PDF.
//
// Eksporterte funksjonsnavn drawConnection, sectionLayers, fastenerLabel beholdes uendret siden
// report.js og app.js importerer disse spesifikt. initDrawing3D/updateDrawing3D/disposeDrawing3D
// er nye.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let hostCounter = 0;

export function drawConnection(state, result, opts = {}) {
  if (opts.compact) return drawConnectionSVG(state, result);
  const id = `drawing3d-${Date.now().toString(36)}-${(hostCounter++).toString(36)}`;
  return `<div class="drawing-3d-wrap">
    <div class="drawing-3d" id="${id}" data-testid="drawing3d" role="img" aria-label="Interaktiv 3D-visualisering av forbindelsen">
      <div class="drawing-3d-toolbar">
        <button type="button" class="btn-recenter-3d" data-testid="recenter-3d" title="Nullstill visning" aria-label="Nullstill kameravisning">⤾ Nullstill visning</button>
        <button type="button" class="btn-recenter-3d" data-testid="toggle-wood-transparency" title="Gjør treverket gjennomsiktig" aria-label="Gjør treverket gjennomsiktig" aria-pressed="false">◱ Se gjennom treverket</button>
      </div>
    </div>
    <p class="drawing-3d-hint">Dra for å rotere (også under) · rull/knip for å zoome · klikk i mål-feltene for å endre direkte</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Statisk SVG (kompakt / utskrift) – plan (festemiddelmønster i del 1) og snitt (lagoppbygging).
// ---------------------------------------------------------------------------
function drawConnectionSVG(state, result) {
  const p = state.pattern, m = state.members, kind = state.connection.kind;
  const n1 = p.n1, n2 = p.n2;
  const isSteel = kind.startsWith('st');
  const W = 520, H = 322; // ekstra høyde til høyde-mål (h₁/h₂) under snittet
  const bad = new Set((result?.spacingCheck || []).filter((c) => !c.ok).map((c) => c.key));
  const col = (k) => (bad.has(k) ? '#b5372e' : '#4a5852');

  // Del 1 i plan: bredde h1 (høyde av tverrsnitt), lengde langs fiber
  const patW = (n1 - 1) * p.a1, patH = (n2 - 1) * p.a2;
  const h1 = m.m1.h || (patH + 2 * p.a4);
  const len = patW + p.a3 + Math.max(p.a3, 60);
  const scale = Math.min(300 / Math.max(len, 120), 150 / Math.max(h1, 60));
  const ox = 70, oy = 44;
  const S = (v) => v * scale;

  let g = '';
  // Del 2 (bak) – vist som lysere felt rotert theta
  const theta = state.connection.theta ?? 0;
  const h2 = m.m2.h || h1;
  if (!isSteel || kind !== 'st-single') {
    const cx = ox + S(p.a3 + patW / 2), cy = oy + S(h1 / 2);
    const L2 = S(Math.max(len, h2 * 1.4));
    g += `<g transform="rotate(${theta} ${cx} ${cy})"><rect x="${cx - L2 / 2}" y="${cy - S(h2) / 2}" width="${L2}" height="${S(h2)}" fill="#ece7dc" stroke="#c9c1b1" stroke-dasharray="4 3"/>${grain(cx - L2 / 2, cy - S(h2) / 2, L2, S(h2), '#d8d0bf')}</g>`;
  }
  // Stålplate
  if (isSteel) {
    g += `<rect x="${ox + S(p.a3) - S(30)}" y="${oy - 6}" width="${S(patW + 60)}" height="${S(h1) + 12}" fill="#c9d3dc" stroke="#7c8b99"/>`;
  }
  // Del 1 – forgrunn
  g += `<rect x="${ox}" y="${oy}" width="${S(len)}" height="${S(h1)}" fill="#e6d6b8" stroke="#8a6e3f" stroke-width="1.2"/>${grain(ox, oy, S(len), S(h1), '#cfb98f')}`;
  // Festemidler
  const fx0 = ox + S(p.a3), fy0 = oy + S(p.a4);
  const r = Math.max(3, S(state.fastener.d) / 2);
  for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
    const x = fx0 + S(i * p.a1), y = fy0 + S(j * p.a2);
    g += `<circle cx="${x}" cy="${y}" r="${r}" fill="#2f5d8a" stroke="#fff" stroke-width="1"/>`;
  }
  // Kraftpil
  const F = result?.force;
  if (F && F.F > 0) {
    const ang = Math.atan2(-F.Fy, F.Fx);
    const cx = fx0 + S(patW / 2), cy = fy0 + S(patH / 2), L = 55;
    const x2 = cx + Math.cos(ang) * L, y2 = cy + Math.sin(ang) * L;
    g += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#b5372e" stroke-width="2.2" marker-end="url(#arr)"/>`;
    g += `<text x="${x2 + 8}" y="${y2 + 4}" font-size="11" font-weight="600" fill="#b5372e" text-anchor="start">F_d = ${F.F.toFixed(1)} kN</text>`;
  }
  // Mål
  g += dim(ox, oy + S(h1) + 14, ox + S(p.a3), oy + S(h1) + 14, `a₃ ${p.a3}`, col('a3t'));
  if (n1 > 1) g += dim(fx0, oy + S(h1) + 14, fx0 + S(p.a1), oy + S(h1) + 14, `a₁ ${p.a1}`, col('a1'));
  g += vdim(ox - 12, oy, ox - 12, fy0, `a₄ ${p.a4}`, col('a4t'));
  if (n2 > 1) g += vdim(ox - 12, fy0, ox - 12, fy0 + S(p.a2), `a₂ ${p.a2}`, col('a2'));
  g += `<text x="${ox + S(len) + 6}" y="${oy + S(h1) / 2 + 4}" font-size="11" fill="#4a5852">h₁ = ${h1}</text>`;
  g += `<text x="${ox}" y="${oy - 26}" font-size="11" fill="#4a5852">Del 1 (t₁ = ${m.m1.t} mm, ${esc(m.m1.grade)}), fiber →</text>`;

  // Snitt nederst
  const sy = oy + S(h1) + 48, sx = ox;
  const layers = sectionLayers(state);
  const tot = layers.reduce((s, l) => s + l.t, 0);
  const sc = Math.min(1.6, 360 / tot);
  let x = sx;
  layers.forEach((l) => {
    const w = l.t * sc;
    g += `<rect x="${x}" y="${sy}" width="${w}" height="34" fill="${l.fill}" stroke="${l.stroke}"/>`;
    g += `<text x="${x + w / 2}" y="${sy + 48}" font-size="10.5" text-anchor="middle" fill="#4a5852">${esc(l.label)}</text>`;
    if (l.h != null) g += `<text x="${x + w / 2}" y="${sy + 62}" font-size="10.5" text-anchor="middle" fill="#7b877f">h ${l.h}</text>`;
    x += w;
  });
  // festemiddel i snitt
  const fl = state.fastener.l ?? tot;
  const start = layers[0].head ? sx : sx + (tot - fl) * sc;
  g += `<line x1="${start}" y1="${sy + 17}" x2="${start + Math.min(fl, tot) * sc}" y2="${sy + 17}" stroke="#2f5d8a" stroke-width="3" stroke-linecap="round"/>`;
  g += `<text x="${sx}" y="${sy - 6}" font-size="11" fill="#4a5852">Snitt · ${esc(fastenerLabel(state.fastener))}</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Source Sans 3, Segoe UI, sans-serif" role="img" aria-label="Tegning av forbindelse">
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#b5372e"/></marker></defs>${g}</svg>`;
}

function grain(x, y, w, h, color) {
  let s = '';
  for (let i = 1; i < 6; i++) s += `<line x1="${x}" y1="${y + (h * i) / 6}" x2="${x + w}" y2="${y + (h * i) / 6}" stroke="${color}" stroke-width="0.7"/>`;
  return s;
}
function dim(x1, y1, x2, y2, label, color) {
  return `<g stroke="${color}" fill="${color}" font-size="10.5"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1}" y1="${y1 - 4}" x2="${x1}" y2="${y1 + 4}"/><line x1="${x2}" y1="${y2 - 4}" x2="${x2}" y2="${y2 + 4}"/><text x="${(x1 + x2) / 2}" y="${y1 + 13}" text-anchor="middle" stroke="none">${label}</text></g>`;
}
function vdim(x1, y1, x2, y2, label, color) {
  return `<g stroke="${color}" fill="${color}" font-size="10.5"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><line x1="${x1 - 4}" y1="${y1}" x2="${x1 + 4}" y2="${y1}"/><line x1="${x2 - 4}" y1="${y2}" x2="${x2 + 4}" y2="${y2}"/><text x="${x1 - 6}" y="${(y1 + y2) / 2 + 4}" text-anchor="end" stroke="none">${label}</text></g>`;
}

export function sectionLayers(state) {
  const { kind } = state.connection, m = state.members;
  const wood = (label, t, h) => ({ label, t, h, fill: '#e6d6b8', stroke: '#8a6e3f' });
  const steel = (t) => ({ label: `Stål ${t}`, t, fill: '#c9d3dc', stroke: '#7c8b99' });
  switch (kind) {
    case 'tt-single': return [{ ...wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h), head: true }, wood(`t₂ ${m.m2.t}`, m.m2.t, m.m2.h)];
    case 'tt-double': return [{ ...wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h), head: true }, wood(`t₂ ${m.m2.t}`, m.m2.t, m.m2.h), wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h)];
    case 'st-single': return [{ ...steel(m.steel.t_s), head: true }, wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h)];
    case 'st-double-central': return [{ ...wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h), head: true }, steel(m.steel.t_s), wood(`t₁ ${m.m1.t}`, m.m1.t, m.m1.h)];
    case 'st-double-outer': return [{ ...steel(m.steel.t_s), head: true }, wood(`t₂ ${m.m2.t}`, m.m2.t, m.m2.h), steel(m.steel.t_s)];
  }
  return [];
}

export function fastenerLabel(f) {
  const t = { screw: 'Treskrue', nail: 'Spiker', bolt: 'Bolt', dowel: 'Dybel' }[f.type];
  return `${t} Ø${f.d}${f.l ? `×${f.l}` : ''}`;
}

// ---------------------------------------------------------------------------
// Skjematiske bruddform-skisser (Johansen-uttrykk, EC5 8.2.2/8.2.3) – brukt i hjelpevinduet
// "Bruddformer" og i rapporten. Dette er en forenklet, illustrativ tegning (fast boksbredde,
// ikke skalert til virkelige mål) – hensikten er å vise MEKANISMEN (hullkanttrykk/knusing,
// stiv rotasjon, ett eller to flyteledd og hvor de sitter), ikke en presis skalategning.
// ---------------------------------------------------------------------------
const MODE_LAYERS = {
  'tt-single': [{ tag: 't1', kind: 'wood' }, { tag: 't2', kind: 'wood' }],
  'tt-double': [{ tag: 't1', kind: 'wood' }, { tag: 't2', kind: 'wood' }, { tag: 't1', kind: 'wood' }],
  'st-single': [{ tag: 'plate', kind: 'steel' }, { tag: 't1', kind: 'wood' }],
  'st-double-central': [{ tag: 't1', kind: 'wood' }, { tag: 'plate', kind: 'steel' }, { tag: 't1', kind: 'wood' }],
  'st-double-outer': [{ tag: 'plate', kind: 'steel' }, { tag: 't2', kind: 'wood' }, { tag: 'plate', kind: 'steel' }],
};

function classifyMode(label) {
  if (/interpolert/i.test(label)) return { type: 'interp' };
  if (/rotasjon/i.test(label)) return { type: 'rotate' };
  const hinges = /to flyteledd/i.test(label) ? 2 : /ett flyteledd/i.test(label) ? 1 : 0;
  const target = label.includes('t₁') ? 't1' : label.includes('t₂') ? 't2' : null;
  return { type: hinges ? 'hinge' : 'embed', hinges, target };
}

function crushArrows(cx, y0, boxH) {
  const len = 7, tip = y0 + 3 + len * 0.6, tipB = y0 + boxH - 3 - len * 0.6;
  return `<path d="M${cx - len},${y0 + 3} L${cx},${tip} L${cx + len},${y0 + 3}" fill="none" stroke="#b5372e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M${cx - len},${y0 + boxH - 3} L${cx},${tipB} L${cx + len},${y0 + boxH - 3}" fill="none" stroke="#b5372e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function wrapSvg(W, H, g) {
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Skisse av bruddform">${g}</svg>`;
}

export function drawModeSketch(kind, mode) {
  const layers = MODE_LAYERS[kind] || MODE_LAYERS['tt-single'];
  const info = classifyMode(mode.label);
  const boxW = 34, boxH = 30;
  const totW = layers.length * boxW;
  const W = totW + 40, H = boxH + 40;
  const x0 = (W - totW) / 2, y0 = (H - boxH) / 2, midY = y0 + boxH / 2;
  const boxes = layers.map((l, i) => ({ ...l, x: x0 + i * boxW, w: boxW, i }));
  const lineColor = '#2f5d8a', overhang = 8;

  let g = '';
  boxes.forEach((b) => {
    const fill = b.kind === 'steel' ? '#c9d3dc' : (b.tag === 't2' ? '#dccba0' : '#e6d6b8');
    const stroke = b.kind === 'steel' ? '#7c8b99' : '#8a6e3f';
    g += `<rect x="${b.x}" y="${y0}" width="${b.w}" height="${boxH}" fill="${fill}" stroke="${stroke}"/>`;
  });

  if (info.type === 'interp') {
    g += `<text x="${W / 2}" y="${midY + 4}" font-size="10.5" text-anchor="middle" fill="#7b877f">≈ interpolert</text>`;
    return wrapSvg(W, H, g);
  }

  if (info.type === 'rotate') {
    const angle = (12 * Math.PI) / 180;
    const half = totW / 2 + overhang;
    const cx0 = x0 + totW / 2;
    g += `<line x1="${(cx0 - Math.cos(angle) * half).toFixed(1)}" y1="${(midY - Math.sin(angle) * half).toFixed(1)}" x2="${(cx0 + Math.cos(angle) * half).toFixed(1)}" y2="${(midY + Math.sin(angle) * half).toFixed(1)}" stroke="${lineColor}" stroke-width="3" stroke-linecap="round"/>`;
    return wrapSvg(W, H, g);
  }

  // Hvilke bokser gjelder mønsteret? Uten eksplisitt t-indeks i teksten (f.eks. "To flyteledd"
  // uten "t₁"/"t₂") gjelder det symmetrisk de to ytterste delene (typisk dobbeltsnitt) – med
  // mindre det bare finnes ett trelag, da gjelder det det laget.
  let matchBoxes = info.target ? boxes.filter((b) => b.tag === info.target) : null;
  if (!matchBoxes || !matchBoxes.length) {
    const wood = boxes.filter((b) => b.kind === 'wood');
    matchBoxes = wood.length > 2 ? [wood[0], wood[wood.length - 1]] : wood;
  }

  if (info.type === 'embed') {
    g += `<line x1="${x0 - overhang}" y1="${midY}" x2="${x0 + totW + overhang}" y2="${midY}" stroke="${lineColor}" stroke-width="3" stroke-linecap="round"/>`;
    matchBoxes.forEach((b) => { g += crushArrows(b.x + b.w / 2, y0, boxH); });
    return wrapSvg(W, H, g);
  }

  // hinge: bøyd festemiddellinje med flyteledd (rød prikk) i de aktuelle boksene
  const hingeFracs = info.hinges === 2 ? [0.3, 0.7] : [0.5];
  const pts = [[x0 - overhang, midY]];
  const dots = [];
  boxes.forEach((b) => {
    if (matchBoxes.includes(b)) {
      hingeFracs.forEach((f, idx) => {
        const bend = (idx % 2 === 0 ? 1 : -1) * 5;
        const pt = [b.x + b.w * f, midY + bend];
        pts.push(pt); dots.push(pt);
      });
    } else {
      pts.push([b.x + b.w / 2, midY]);
    }
  });
  pts.push([x0 + totW + overhang, midY]);
  const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt[0].toFixed(1)},${pt[1].toFixed(1)}`).join(' ');
  g += `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  dots.forEach(([px, py]) => { g += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.4" fill="#b5372e"/>`; });
  return wrapSvg(W, H, g);
}

// ---------------------------------------------------------------------------
// Interaktiv 3D (Three.js, lastet on-demand fra CDN via import-map).
// ---------------------------------------------------------------------------

// Fargepalett hentet fra style.css sine CSS-variabler (--ink, --steel, --spruce, --amber, --signal).
const COLOR = {
  wood1: 0xe6d6b8,
  wood2: 0xdccba0,
  woodEdge: 0x8a6e3f,
  grain: 0x5a4626,
  steel: 0xc9d3dc,
  steelEdge: 0x7c8b99,
  fastener: 0x2f5d8a, // --steel
  fiber: 0x2f5d8a, // --steel
  force: 0xb5372e, // --signal
  ok: 0x2e6b4e, // --spruce
  bad: 0xb5372e, // --signal
  theta: 0xb9821a, // --amber
  ink: 0x1c2622, // --ink
  bg: 0xf3f1e9,
};

const SCALE = 1 / 40; // mm -> Three.js-enheter
const U = (mm) => mm * SCALE;

function layerPlan(state) {
  const { kind } = state.connection, m = state.members;
  switch (kind) {
    case 'tt-single': return [{ mem: 'm1', t: m.m1.t, head: true }, { mem: 'm2', t: m.m2.t }];
    case 'tt-double': return [{ mem: 'm1', t: m.m1.t, head: true }, { mem: 'm2', t: m.m2.t }, { mem: 'm1', t: m.m1.t }];
    case 'st-single': return [{ mem: 'steel', t: m.steel.t_s, head: true }, { mem: 'm1', t: m.m1.t }];
    case 'st-double-central': return [{ mem: 'm1', t: m.m1.t, head: true }, { mem: 'steel', t: m.steel.t_s }, { mem: 'm1', t: m.m1.t }];
    case 'st-double-outer': return [{ mem: 'steel', t: m.steel.t_s, head: true }, { mem: 'm2', t: m.m2.t }, { mem: 'steel', t: m.steel.t_s }];
  }
  return [];
}

let active3D = null;

export function disposeDrawing3D() {
  if (!active3D) return;
  try { active3D.dispose(); } catch (e) { console.warn('Kunne ikke rydde opp gammel 3D-scene', e); }
  active3D = null;
}

// Kalles av app.js ved live redigering (mønster/mål/vinkel/festemiddel) for å oppdatere den
// EKSISTERENDE 3D-scenen uten å røre canvas/kamera/inputs. Returnerer true hvis en aktiv scene
// ble oppdatert, false hvis det ikke finnes noen (da må app.js falle tilbake til initDrawing3D).
export function updateDrawing3D(state, result) {
  if (!active3D) return false;
  active3D.buildGeometry(state, result);
  return true;
}

export async function initDrawing3D(elementId, state, result) {
  disposeDrawing3D();
  const container = document.getElementById(elementId);
  if (!container) return;
  const recenterBtn = container.querySelector('[data-testid="recenter-3d"]');
  const transparencyBtn = container.querySelector('[data-testid="toggle-wood-transparency"]');
  let woodTransparent = false;

  let THREE, OrbitControls, CSS2DRenderer, CSS2DObject;
  try {
    const [threeMod, controlsMod, labelMod] = await Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/renderers/CSS2DRenderer.js'),
    ]);
    THREE = threeMod;
    OrbitControls = controlsMod.OrbitControls;
    CSS2DRenderer = labelMod.CSS2DRenderer;
    CSS2DObject = labelMod.CSS2DObject;
  } catch (e) {
    console.error('Klarte ikke å laste Three.js fra CDN', e);
    container.innerHTML = '<p class="drawing-3d-error">Kunne ikke laste 3D-visning (Three.js fra CDN). Sjekk nettforbindelsen og prøv å laste siden på nytt.</p>';
    return;
  }
  // innerHTML-feilmeldingen over rydder bort recenter-knappen hvis lasting feiler; ved suksess
  // beholder vi den knappen som allerede ligger i containeren (satt inn av drawConnection()).

  // -- scene / kamera / renderer (bygges én gang, gjenbrukes av updateDrawing3D) --------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLOR.bg);

  const getSize = () => ({ w: container.clientWidth || 600, h: container.clientHeight || 420 });
  let { w: W0, h: H0 } = getSize();

  const camera = new THREE.PerspectiveCamera(42, W0 / H0, 0.05, 500);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W0, H0);
  container.style.position = 'relative';
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W0, H0);
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
  container.appendChild(labelRenderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  // Ingen polvinkel-begrensning – man skal kunne rotere helt rundt og se konstruksjonen nedenfra også.
  controls.minPolarAngle = 0.02;
  controls.maxPolarAngle = Math.PI - 0.02;

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xf3f1e9, 0x3a332a, 0.35));

  // Én gruppe for alt som gjenskapes ved hver buildGeometry()-kjøring (bokser, sylindre,
  // fiberpiler, målelinjer, vinkelbue, kraftpil). Redigerbare mål-chips (a1-a4, θ) legges
  // direkte i `scene` og holdes utenfor denne gruppen, slik at input-elementene aldri
  // fjernes/gjenskapes og dermed aldri mister fokus mens man skriver.
  const dynamicGroup = new THREE.Group();
  scene.add(dynamicGroup);

  function disposePart(obj) {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) { const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach((mt) => mt.dispose()); }
    if (obj.isCSS2DObject && obj.element) obj.element.remove();
  }
  function clearDynamic() {
    for (let i = dynamicGroup.children.length - 1; i >= 0; i--) {
      const child = dynamicGroup.children[i];
      child.traverse(disposePart);
      dynamicGroup.remove(child);
    }
  }

  // -- redigerbare mål-chips (a1, a2, a3, a4, θ) — persistente DOM-elementer -------------------
  const dimInputs = {}; // key -> { obj (CSS2DObject), input, chip, offsetWrap }
  const repelEntries = []; // { el } samlet på nytt hver buildGeometry()-kjøring, brukt til anti-overlapp

  function editableChip(key, path, label, unit, opts = {}) {
    let entry = dimInputs[key];
    if (!entry) {
      const anchor = document.createElement('div');
      const offsetWrap = document.createElement('div');
      offsetWrap.className = 'label-offset';
      const chip = document.createElement('label');
      chip.className = 'dim-input-chip';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'dim-input-name';
      const input = document.createElement('input');
      input.type = 'number';
      input.dataset.path = path;
      input.dataset.testid = `${path}-3d`; // eget testid enn skjemafeltet, samme data-path (samme tilstand)
      input.setAttribute('data-num', '');
      input.step = opts.step ?? '1';
      input.min = String(opts.min ?? 0);
      const unitSpan = document.createElement('span');
      unitSpan.className = 'dim-input-unit';
      unitSpan.textContent = unit;
      chip.append(nameSpan, input, unitSpan);
      offsetWrap.appendChild(chip);
      anchor.appendChild(offsetWrap);
      const obj = new CSS2DObject(anchor);
      scene.add(obj);
      entry = dimInputs[key] = { obj, input, chip, nameSpan, offsetWrap, visible: false };
    }
    entry.nameSpan.textContent = label;
    if (document.activeElement !== entry.input) entry.input.value = String(opts.value);
    entry.chip.classList.toggle('bad', !!opts.bad);
    if (!entry.visible) { scene.add(entry.obj); entry.obj.element.style.display = ''; entry.visible = true; }
    entry.obj.position.copy(opts.pos);
    repelEntries.push({ el: entry.offsetWrap });
    return entry;
  }
  function hideChip(key) {
    const entry = dimInputs[key];
    // scene.remove() alene fjerner IKKE DOM-elementet CSS2DRenderer allerede har satt inn
    // (den rydder kun opp objekter den selv besøker under rendering) – skjul det eksplisitt.
    if (entry && entry.visible) { scene.remove(entry.obj); entry.obj.element.style.display = 'none'; entry.visible = false; }
  }

  function plainLabel(text, pos, cls = 'dim-label') {
    const anchor = document.createElement('div');
    const offsetWrap = document.createElement('div');
    offsetWrap.className = 'label-offset';
    const div = document.createElement('div');
    div.className = cls;
    div.textContent = text;
    offsetWrap.appendChild(div);
    anchor.appendChild(offsetWrap);
    const obj = new CSS2DObject(anchor);
    obj.position.copy(pos);
    dynamicGroup.add(obj);
    repelEntries.push({ el: offsetWrap });
    return obj;
  }

  // Regner om et lokalt punkt i en boks (som kan være rotert theta om Y) til verdenskoordinater.
  // Brukes til å plassere tykkelse/høyde-chipsene riktig selv når del 2 er rotert – uten å måtte
  // gjøre dem til faktiske Three.js-barn av boksen (som ville krevd re-parenting og fått dem
  // ødelagt av clearDynamic() sin generiske opprydding, siden boksen lages på nytt hver gang).
  function localToWorld(box, lx, ly, lz) {
    const c = Math.cos(box.rotation.y), s = Math.sin(box.rotation.y);
    return new THREE.Vector3(box.position.x + lx * c + lz * s, box.position.y + ly, box.position.z - lx * s + lz * c);
  }

  function dimLine(pt1, pt2, color, tick = U(6)) {
    const geo = new THREE.BufferGeometry().setFromPoints([pt1, pt2]);
    dynamicGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
    [pt1, pt2].forEach((p0) => {
      const tGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p0.x, p0.y - tick, p0.z), new THREE.Vector3(p0.x, p0.y + tick, p0.z)]);
      dynamicGroup.add(new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color })));
    });
  }

  function addGrain(box, width, thickness, depth) {
    const n = 5;
    const mat = new THREE.LineBasicMaterial({ color: COLOR.grain, transparent: true, opacity: 0.22 });
    for (let i = 1; i < n; i++) {
      const z = -depth / 2 + (depth * i) / n;
      const pts = [new THREE.Vector3(-width / 2, thickness / 2 + 0.003, z), new THREE.Vector3(width / 2, thickness / 2 + 0.003, z)];
      box.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  }
  // Endeved: bølgete "årringer" på begge endeflater (x = ±bredde/2). Dette er den viktigste
  // visuelle pekepinnen på fiberretning når man ser rett inn i enden av et emne – der forsvinner
  // de lange kornstripene på oversiden fra synsvinkelen, så uten dette kan enden feiltolkes som
  // en kappet/tverrgående flate uten retning.
  function addEndGrain(box, width, thickness, depth) {
    // Fibrene går langs lokal X (inn i enden). Årringene ligger DERFOR på tvers av tykkelsen
    // (lokal Y, hele veien topp-bunn av emnet) og er spredt utover høyden/bredden (lokal Z) –
    // altså stort sett loddrette streker sett fra enden, IKKE vannrette langs Z (det ville sett ut
    // som stripene lå 90° på fiberretningen, som var feilen i forrige versjon).
    const mat = new THREE.LineBasicMaterial({ color: COLOR.grain, transparent: true, opacity: 0.32 });
    const rings = 5, steps = 10;
    [-1, 1].forEach((side) => {
      const x = (side * width) / 2 + side * 0.003;
      for (let i = 1; i <= rings; i++) {
        const z0 = -depth / 2 + (depth * i) / (rings + 1);
        const pts = [];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const y = -thickness / 2 + thickness * t;
          const wobble = Math.sin(t * Math.PI * 2.4 + i * 1.7) * depth * 0.035;
          pts.push(new THREE.Vector3(x, y, z0 + wobble));
        }
        box.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      }
    });
  }
  function addFiberArrow(box, width, thickness, partLabel) {
    const len = Math.min(width * 0.4, U(90));
    const dir = new THREE.Vector3(1, 0, 0);
    const origin = new THREE.Vector3(-len / 2, thickness / 2 + 0.01, 0);
    const arrow = new THREE.ArrowHelper(dir, origin, len, COLOR.fiber, len * 0.3, len * 0.5);
    box.add(arrow);
    // Samme anker->offset->innhold-struktur som plainLabel()/editableChip(): CSS2DRenderer eier
    // kun ankerets transform, anti-overlapp-logikken eier kun .label-offset sin transform – de må
    // aldri dele element, ellers overskriver de hverandres posisjonering.
    const anchor = document.createElement('div');
    const offsetWrap = document.createElement('div');
    offsetWrap.className = 'label-offset';
    const div = document.createElement('div');
    div.className = 'fiber-label';
    div.textContent = `${partLabel} · fiber →`;
    offsetWrap.appendChild(div);
    anchor.appendChild(offsetWrap);
    const obj = new CSS2DObject(anchor);
    obj.position.set(len * 0.55, thickness / 2 + 0.01, 0);
    box.add(obj);
    repelEntries.push({ el: offsetWrap });
  }

  // -- geometribygging: kalles ved init og ved hver live-oppdatering --------------------------
  let lastState = state, lastResult = result;
  function buildGeometry(state, result) {
    lastState = state; lastResult = result;
    clearDynamic();
    repelEntries.length = 0;

    const p = state.pattern, m = state.members, f = state.fastener, kind = state.connection.kind;
    const isSteel = kind.startsWith('st');
    const theta = isSteel ? 0 : (state.connection.theta ?? 0);
    const thetaRad = (theta * Math.PI) / 180;
    const n1 = p.n1, n2 = p.n2;
    const bad = new Set((result?.spacingCheck || []).filter((c) => !c.ok).map((c) => c.key));
    const dimColor = (k) => (bad.has(k) ? COLOR.bad : COLOR.ok);

    const patW = (n1 - 1) * p.a1, patH = (n2 - 1) * p.a2;
    const h1 = m.m1.h || (patH + 2 * p.a4);
    const h2 = m.m2.h || h1;
    const len1 = patW + p.a3 + Math.max(p.a3, 60);
    const cx = p.a3 + patW / 2, cz = p.a4 + patH / 2; // mønsterets senter (mm), i del-1-rammen

    const layers = layerPlan(state);
    const totT = layers.reduce((s, l) => s + l.t, 0);
    let cum = 0;
    const layerY = layers.map((l) => { const top = cum; cum += l.t; return { ...l, top, bottom: cum }; });
    // Skjul tykkelse/høyde-chips for deler som ikke finnes i den valgte forbindelsestypen (f.eks.
    // t2/h2 uten m2, ts uten stålplate) – ellers henger de igjen fra forrige valgte type.
    const presentMembers = new Set(layers.map((l) => l.mem));
    if (!presentMembers.has('m1')) { hideChip('t1'); hideChip('h1'); }
    if (!presentMembers.has('m2')) { hideChip('t2'); hideChip('h2'); }
    if (!presentMembers.has('steel')) hideChip('ts');

    // kamera-mål (brukes kun ved første init, se lenger ned – buildGeometry endrer ikke kameraet)
    const target = new THREE.Vector3(U(cx), -U(totT) / 2, U(cz));
    const dist = U(Math.max(len1, h1, 220));

    // -- bokser for hvert lag, med treverkskorn og fiberpil på trelagene ----------------------
    // Treverket kan gjøres gjennomsiktig (knapp) for å se hvor langt festemidlene går inn i de
    // to ulike tredelene – stålplater holdes alltid ugjennomsiktige (ikke relevant der).
    const boxMat = (color) => new THREE.MeshStandardMaterial({
      color, roughness: 0.85, metalness: 0.05,
      transparent: woodTransparent, opacity: woodTransparent ? 0.28 : 1, depthWrite: !woodTransparent,
    });
    const steelMat = () => new THREE.MeshStandardMaterial({ color: COLOR.steel, roughness: 0.4, metalness: 0.55 });
    const labeledMembers = new Set();
    const memberTitle = { m1: 'Del 1', m2: 'Del 2' };

    layerY.forEach((l) => {
      const isM2 = l.mem === 'm2' && !isSteel;
      let width, depth, rot, ccx, ccz;
      if (isM2) {
        width = Math.max(len1, h2 * 1.4);
        depth = h2;
        rot = thetaRad;
        ccx = cx; ccz = cz;
      } else {
        width = len1; depth = h1; rot = 0; ccx = len1 / 2; ccz = h1 / 2;
      }
      const thickness = U(l.t);
      const geo = new THREE.BoxGeometry(U(width), thickness, U(depth));
      const mat = l.mem === 'steel' ? steelMat() : boxMat(l.mem === 'm2' ? COLOR.wood2 : COLOR.wood1);
      const box = new THREE.Mesh(geo, mat);
      const yCenter = -U(l.top) - thickness / 2;
      box.position.set(U(ccx), yCenter, U(ccz));
      box.rotation.y = -rot; // rotasjon om vertikal akse gjennom mønstersenteret
      dynamicGroup.add(box);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: COLOR.ink, transparent: true, opacity: 0.35 }));
      edges.position.copy(box.position); edges.rotation.copy(box.rotation);
      dynamicGroup.add(edges);
      if (l.mem !== 'steel') {
        addGrain(box, U(width), thickness, U(depth));
        addEndGrain(box, U(width), thickness, U(depth));
      }
      if (!labeledMembers.has(l.mem)) {
        labeledMembers.add(l.mem);
        if (l.mem !== 'steel') addFiberArrow(box, U(width), thickness, memberTitle[l.mem] || 'Del');

        // Redigerbare chips for tykkelse (og høyde for trelag) – samme corner (nær-venstre
        // hjørne av boksen, foran og bak) for alle deler, plassert med localToWorld() slik at de
        // følger rotasjonen til del 2 riktig.
        const nearX = -U(width) / 2 - U(14);
        if (l.mem === 'steel') {
          editableChip('ts', 'members.steel.t_s', 't_s', 'mm', { value: m.steel.t_s, min: 1, bad: false, pos: localToWorld(box, nearX, 0, -U(depth) / 2 - U(14)) });
        } else {
          const mm = l.mem === 'm2' ? m.m2 : m.m1;
          const tKey = l.mem === 'm2' ? 't2' : 't1', hKey = l.mem === 'm2' ? 'h2' : 'h1';
          const tLabel = l.mem === 'm2' ? 't₂' : 't₁', hLabel = l.mem === 'm2' ? 'h₂' : 'h₁';
          editableChip(tKey, `members.${l.mem}.t`, tLabel, 'mm', { value: mm.t, min: 10, pos: localToWorld(box, nearX, 0, -U(depth) / 2 - U(14)) });
          editableChip(hKey, `members.${l.mem}.h`, hLabel, 'mm', { value: mm.h, min: 20, pos: localToWorld(box, nearX, 0, U(depth) / 2 + U(14)) });
        }
      }
    });

    // -- festemidler (sylindre gjennom hele lagoppbygningen) ---------------------------------
    const fl = Math.min(f.l ?? totT, totT);
    const radius = Math.max(U(f.d) / 2, U(2));
    const cylGeo = new THREE.CylinderGeometry(radius, radius, U(fl), 14);
    const cylMat = new THREE.MeshStandardMaterial({ color: COLOR.fastener, roughness: 0.35, metalness: 0.5 });
    for (let i = 0; i < n1; i++) {
      for (let j = 0; j < n2; j++) {
        const x = p.a3 + i * p.a1, z = p.a4 + j * p.a2;
        const cyl = new THREE.Mesh(cylGeo, cylMat);
        cyl.position.set(U(x), -U(fl) / 2, U(z));
        dynamicGroup.add(cyl);
      }
    }

    // -- mål (a1..a4) som 3D-dimensjonslinjer med redigerbare felt ---------------------------
    const dimY = U(6);
    const gap = U(28);

    const zFar = U(h1) + gap;
    {
      const c = dimColor('a3t');
      const y0 = new THREE.Vector3(0, dimY, zFar), y1 = new THREE.Vector3(U(p.a3), dimY, zFar);
      dimLine(y0, y1, c);
      editableChip('a3', 'pattern.a3', 'a₃', 'mm', { value: p.a3, bad: bad.has('a3t'), pos: y0.clone().lerp(y1, 0.5).add(new THREE.Vector3(0, U(16), 0)) });
    }
    if (n1 > 1) {
      const c = dimColor('a1');
      const y0 = new THREE.Vector3(U(p.a3), dimY, zFar), y1 = new THREE.Vector3(U(p.a3 + p.a1), dimY, zFar);
      dimLine(y0, y1, c);
      editableChip('a1', 'pattern.a1', 'a₁', 'mm', { value: p.a1, bad: bad.has('a1'), pos: y0.clone().lerp(y1, 0.5).add(new THREE.Vector3(0, U(16), 0)) });
    } else hideChip('a1');
    const xNear = -gap;
    {
      const c = dimColor('a4t');
      const y0 = new THREE.Vector3(xNear, dimY, 0), y1 = new THREE.Vector3(xNear, dimY, U(p.a4));
      dimLine(y0, y1, c);
      editableChip('a4', 'pattern.a4', 'a₄', 'mm', { value: p.a4, bad: bad.has('a4t'), pos: y0.clone().lerp(y1, 0.5).add(new THREE.Vector3(-U(24), 0, 0)) });
    }
    if (n2 > 1) {
      const c = dimColor('a2');
      const y0 = new THREE.Vector3(xNear, dimY, U(p.a4)), y1 = new THREE.Vector3(xNear, dimY, U(p.a4 + p.a2));
      dimLine(y0, y1, c);
      editableChip('a2', 'pattern.a2', 'a₂', 'mm', { value: p.a2, bad: bad.has('a2'), pos: y0.clone().lerp(y1, 0.5).add(new THREE.Vector3(-U(24), 0, 0)) });
    } else hideChip('a2');

    // -- vinkel θ mellom fiberretningene: bue + redigerbart felt (kun tre-tre) ---------------
    if (!isSteel) {
      const center = new THREE.Vector3(U(cx), U(4), U(cz));
      const radiusArc = U(Math.min(h1, h2, 90) * 0.6 + 30);
      const steps = 24;
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const a = (thetaRad * i) / steps;
        pts.push(new THREE.Vector3(center.x + radiusArc * Math.cos(a), center.y, center.z + radiusArc * Math.sin(a)));
      }
      dynamicGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: COLOR.theta })));
      const mid = thetaRad / 2;
      const labelPos = new THREE.Vector3(center.x + (radiusArc + U(24)) * Math.cos(mid), center.y + U(10), center.z + (radiusArc + U(24)) * Math.sin(mid));
      editableChip('theta', 'connection.theta', 'θ', '°', { value: theta, min: 0, step: 1, pos: labelPos });
    } else hideChip('theta');

    // -- kraftpil -----------------------------------------------------------------------------
    const F = result?.force;
    if (F && F.F > 0) {
      const dir = new THREE.Vector3(F.Fx, 0, F.Fy);
      if (dir.lengthSq() > 0) {
        dir.normalize();
        const origin = new THREE.Vector3(U(cx), U(10), U(cz));
        const arrowLen = Math.min(U(Math.max(len1, h1)) * 0.55, U(220));
        const arrow = new THREE.ArrowHelper(dir, origin, arrowLen, COLOR.force, arrowLen * 0.28, arrowLen * 0.16);
        dynamicGroup.add(arrow);
        plainLabel(`F_d = ${F.F.toFixed(1)} kN`, origin.clone().add(dir.clone().multiplyScalar(arrowLen)).add(new THREE.Vector3(0, U(16), 0)), 'force-label');
      }
    }

    // Husk siste utstrekning slik at "Nullstill visning" alltid rammer inn HELE strukturen slik
    // den er NÅ – ikke slik den var da siden ble lastet (buildGeometry kalles på nytt for hver
    // endring av mål/tykkelse/høyde, så disse må oppdateres hver gang, ikke bare ved første kall).
    camTarget.copy(target);
    camDist = dist;
  }

  let camTarget = new THREE.Vector3();
  let camDist = 1;
  buildGeometry(state, result);
  recenter();

  function recenter() {
    camera.position.set(camTarget.x + camDist * 0.85, camTarget.y + camDist * 0.75, camTarget.z + camDist * 0.95);
    sun.position.set(camTarget.x + camDist * 0.6, camDist * 1.2, camTarget.z + camDist * 0.4);
    controls.target.copy(camTarget);
    controls.minDistance = camDist * 0.25;
    controls.maxDistance = camDist * 3.5;
    controls.update();
  }
  recenterBtn?.addEventListener('click', () => active3D?.recenter());
  transparencyBtn?.addEventListener('click', () => {
    woodTransparent = !woodTransparent;
    transparencyBtn.classList.toggle('active', woodTransparent);
    transparencyBtn.setAttribute('aria-pressed', String(woodTransparent));
    active3D?.buildGeometry(lastState, lastResult);
  });

  // -- anti-overlapp for tekst-/input-etiketter (kjøres hvert bilde) --------------------------
  function resolveLabelOverlaps() {
    const entries = repelEntries;
    if (!entries.length) return;
    entries.forEach((e) => { e.el.style.transform = 'translate(0px, 0px)'; });
    if (entries.length < 2) return;
    const off = entries.map(() => ({ x: 0, y: 0 }));
    for (let iter = 0; iter < 3; iter++) {
      const rects = entries.map((e) => e.el.getBoundingClientRect());
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          const a = rects[i], b = rects[j];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 0 && oy > 0) {
            const acx = (a.left + a.right) / 2, acy = (a.top + a.bottom) / 2;
            const bcx = (b.left + b.right) / 2, bcy = (b.top + b.bottom) / 2;
            let dx = acx - bcx, dy = acy - bcy;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;
            const push = Math.min(ox, oy) / 2 + 2;
            off[i].x += dx * push; off[i].y += dy * push;
            off[j].x -= dx * push; off[j].y -= dy * push;
          }
        }
      }
      entries.forEach((e, i) => { e.el.style.transform = `translate(${off[i].x.toFixed(1)}px, ${off[i].y.toFixed(1)}px)`; });
    }
  }

  // -- render-løkke + opprydding ---------------------------------------------------------------
  let rafId;
  function animate() {
    rafId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    resolveLabelOverlaps();
  }
  animate();

  const resizeObserver = new ResizeObserver(() => {
    const { w, h } = getSize();
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
  });
  resizeObserver.observe(container);

  active3D = {
    buildGeometry,
    recenter,
    dispose() {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      clearDynamic();
      Object.values(dimInputs).forEach((e) => { e.obj.element?.remove?.(); });
      scene.traverse((obj) => {
        obj.geometry?.dispose?.();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((mt) => mt.dispose?.());
      });
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
