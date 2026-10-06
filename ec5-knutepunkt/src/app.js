// Knutepunkt – applikasjonslogikk. Ingen rammeverk, ES-moduler, tilstand i URL-hash.
import { TIMBER, STEEL_PLATE, FASTENER_PRESETS, LOAD_CATEGORIES, DURATION_LABEL, KMOD, GAMMA_M } from './engine/materials.js';
import { calculateConnection } from './engine/ec5.js';
import { ulsCombinations, slsCharacteristic, angleToGrain } from './engine/combos.js';
import { drawConnection, fastenerLabel, initDrawing3D, updateDrawing3D, drawModeSketch } from './drawing.js';
import { renderReport } from './report.js';

// ---------------------------------------------------------------------------
// Tilstand
// ---------------------------------------------------------------------------
export const CONNECTION_KINDS = [
  { id: 'tt-single', title: 'Tre–tre, ett snitt', desc: 'To tredeler, festemiddel gjennom begge', ref: 'EC5 8.2.2, lign. (8.6)' },
  { id: 'tt-double', title: 'Tre–tre, to snitt', desc: 'Tre tredeler, symmetrisk (t₁–t₂–t₁)', ref: 'EC5 8.2.2, lign. (8.7)' },
  { id: 'st-single', title: 'Stålplate–tre, ett snitt', desc: 'Utenpåliggende plate på én side', ref: 'EC5 8.2.3, lign. (8.9)–(8.10)' },
  { id: 'st-double-central', title: 'Innslisset stålplate', desc: 'Plate i midten, to tredeler', ref: 'EC5 8.2.3, lign. (8.11)' },
  { id: 'st-double-outer', title: 'Stålplater på begge sider', desc: 'Én tredel mellom to plater', ref: 'EC5 8.2.3, lign. (8.12)–(8.13)' },
];

const DEFAULT = () => ({
  step: 1,
  project: { name: '', part: '', author: '', date: new Date().toISOString().slice(0, 10) },
  connection: { kind: 'tt-single', theta: 0 },
  members: { m1: { grade: 'C24', t: 48, h: 198 }, m2: { grade: 'GL30c', t: 140, h: 315 }, steel: { grade: 'S355', t_s: 8 } },
  fastener: { type: 'screw', presetId: 'skrue_8', d: 8, d1: 5.2, d_head: 15, f_u: 800, f_tensk: 20000, l: 160, predrilled: true, fullyThreaded: true, M_yRk_override: null, eta: '' },
  pattern: { n1: 2, n2: 3, a1: 60, a2: 40, a3: 100, a4: 60 },
  serviceClass: 1,
  loads: [{ name: 'G', category: 'G', Fx: 0, Fy: 2 }, { name: 'S', category: 'S', Fx: 0, Fy: 4 }],
});

const EXAMPLE = () => ({
  ...DEFAULT(), step: 5,
  project: { name: 'Eksempel: bjelke mot søyle', part: 'Akse 3 / B', author: 'Knutepunkt (demo)', date: new Date().toISOString().slice(0, 10) },
});

let state = load() || DEFAULT();
let result = null;

function load() {
  try { const h = location.hash.slice(1); return h ? JSON.parse(decodeURIComponent(h)) : null; } catch { return null; }
}
function persist() { history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(state))); }

function setPath(obj, path, value) {
  const keys = path.split('.'); let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys.at(-1)] = value;
}
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }

// ---------------------------------------------------------------------------
// Orkestrering av beregning
// ---------------------------------------------------------------------------
export function compute(st = state) {
  const isSteel = st.connection.kind.startsWith('st');
  const theta = isSteel ? 0 : (st.connection.theta ?? 0);
  const rot = (Fx, Fy) => {
    const t = (theta * Math.PI) / 180;
    return [Fx * Math.cos(t) + Fy * Math.sin(t), -Fx * Math.sin(t) + Fy * Math.cos(t)];
  };
  const combos = ulsCombinations(st.loads);
  const cases = (combos.length ? combos : [{ id: '–', label: 'Ingen laster (kapasitet vises for mellomlang varighet)', Fx: 0, Fy: 0, F: 0, alpha: 0, duration: 'medium', terms: [], eq: '', ref: '' }]).map((c) => {
    const [fx2, fy2] = rot(c.Fx, c.Fy);
    const alpha1 = c.alpha, alpha2 = angleToGrain(fx2, fy2);
    const pattern = { ...st.pattern, a3t: st.pattern.a3, a3c: st.pattern.a3, a4t: st.pattern.a4, a4c: st.pattern.a4, alpha1, alpha2 };
    const r = calculateConnection({ ...st, pattern });
    const dc = r.designCapacity(c.duration);
    const util = c.F > 0 ? (c.F * 1000) / dc.Rd : 0;
    // Oppsprekking per tredel
    const split = r.splitting.map((s) => {
      const F90Ed = s.tag === 't₁' ? Math.abs(c.Fy) * 1000 : Math.abs(fy2) * 1000;
      const F90Rd = (dc.kmod * s.F90Rk) / r.gammaM;
      return { ...s, F90Ed, F90Rd, util: F90Ed / F90Rd };
    });
    return { combo: c, r, dc, util, alpha1, alpha2, split, force: { Fx: c.Fx, Fy: c.Fy, F: c.F } };
  });
  const worst = cases.reduce((a, b) => (b.util > a.util ? b : a));
  const worstSplit = Math.max(0, ...cases.flatMap((k) => k.split.map((s) => s.util)));
  const sls = slsCharacteristic(st.loads);
  const slip = sls.F > 0 ? (sls.F * 1000) / worst.r.KserTot : 0;
  const errors = worst.r.errors, warnings = worst.r.warnings;
  const util = Math.max(worst.util, worstSplit);
  const governs = worstSplit > worst.util ? 'split' : 'shear';
  const status = errors.length || util > 1 ? 'bad' : warnings.length ? 'warn' : 'ok';
  return { cases, worst, worstSplit, util, governs, sls, slip, status, force: worst.force, spacingCheck: worst.r.spacingCheck, errors, warnings, combos };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = (x) => Math.round(x).toLocaleString('nb-NO');
const n1 = (x) => x.toLocaleString('nb-NO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n2 = (x) => x.toLocaleString('nb-NO', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (x) => `${Math.round(x * 100)} %`;

const STEPS = [
  { n: 1, t: 'Forbindelse', sub: (s) => CONNECTION_KINDS.find((k) => k.id === s.connection.kind)?.title },
  { n: 2, t: 'Materialer', sub: (s) => `${s.members.m1.grade}${s.connection.kind === 'st-double-outer' ? '' : ''} · KK${s.serviceClass}` },
  { n: 3, t: 'Festemiddel og mønster', sub: (s) => `${fastenerLabel(s.fastener)} · ${s.pattern.n1}×${s.pattern.n2}` },
  { n: 4, t: 'Laster', sub: (s) => `${s.loads.length} laster` },
  { n: 5, t: 'Resultat og rapport', sub: () => (result ? pct(result.util) + ' utnyttelse' : '') },
];

function field(label, path, opts = {}) {
  const v = getPath(state, path);
  const id = 'f-' + path.replace(/\./g, '-');
  const ref = opts.ref ? `<span class="ref">${esc(opts.ref)}</span>` : '';
  if (opts.options) {
    return `<label class="f" for="${id}"><span>${esc(label)}${ref}</span><select id="${id}" data-path="${path}" data-testid="${path}" ${opts.type === 'number' ? 'data-num' : ''}>${opts.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
  }
  if (opts.type === 'checkbox') {
    return `<label class="f chk" for="${id}"><input type="checkbox" id="${id}" data-path="${path}" data-testid="${path}" ${v ? 'checked' : ''}><span>${esc(opts.text || label)} ${ref}</span></label>`;
  }
  const unit = opts.unit ? `class="unit" data-unit="${esc(opts.unit)}"` : '';
  return `<label class="f" for="${id}"><span>${esc(label)}${ref}</span><span ${unit}><input id="${id}" data-path="${path}" data-testid="${path}" type="${opts.type || 'text'}" ${opts.type === 'number' ? `data-num step="${opts.step ?? 'any'}" ${opts.min != null ? `min="${opts.min}"` : ''}` : ''} value="${esc(v ?? '')}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}></span>${opts.hint ? `<span class="hint">${opts.hint}</span>` : ''}</label>`;
}

const timberOptions = Object.values(TIMBER).map((t) => ({ value: t.name, label: `${t.name} (ρk ${t.rho_k})` }));

function renderStepper() {
  $('#stepper').innerHTML = STEPS.map((s) => `<li class="${s.n === state.step ? 'active' : ''} ${s.n < state.step ? 'done' : ''}" data-step="${s.n}" data-testid="step-${s.n}" role="button" tabindex="0"><span class="num">${s.n}</span><span>${s.t}</span><span class="sub">${esc(s.sub(state) || '')}</span></li>`).join('');
}

function renderPane() {
  const k = state.connection.kind, isSteel = k.startsWith('st');
  let html = '';
  if (state.step === 1) {
    html = `<header><h1>Hva slags forbindelse?</h1><p>Velg oppbygging. Kapasiteten regnes etter Johansen-uttrykkene i NS-EN 1995-1-1 kap. 8.2.</p></header>
    <div class="choices" data-testid="connection-kinds">${CONNECTION_KINDS.map((c) => `<button type="button" class="choice ${c.id === k ? 'on' : ''}" data-kind="${c.id}" data-testid="kind-${c.id}">${kindIcon(c.id)}<span class="t">${c.title}</span><span class="d">${c.desc}</span><span class="d">${c.ref}</span></button>`).join('')}</div>
    <div class="rule"></div>
    <fieldset><legend>Prosjekt (til rapporten)</legend><div class="grid two">${field('Prosjekt', 'project.name', { placeholder: 'Prosjektnavn' })}${field('Konstruksjonsdel', 'project.part', { placeholder: 'f.eks. Bjelke B3 mot søyle' })}${field('Utført av', 'project.author')}${field('Dato', 'project.date', { type: 'date' })}</div></fieldset>`;
  } else if (state.step === 2) {
    const m1Label = k === 'st-double-outer' ? 'Tredel mellom platene (t₂)' : 'Del 1 – hodeside (t₁)';
    html = `<header><h1>Materialer</h1><p>Fasthetsklasser etter NS-EN 338 / NS-EN 14080. Klimaklasse styrer k_mod (tabell 3.1).</p></header>`;
    if (k !== 'st-double-outer') html += `<fieldset><legend>${m1Label}</legend><div class="grid three">${field('Fasthetsklasse', 'members.m1.grade', { options: timberOptions })}${field('Tykkelse t₁', 'members.m1.t', { type: 'number', unit: 'mm', min: 10 })}${field('Høyde h₁', 'members.m1.h', { type: 'number', unit: 'mm', min: 20, ref: 'til oppsprekking 8.1.4' })}</div></fieldset>`;
    if (k !== 'st-single' && k !== 'st-double-central') html += `<fieldset><legend>${k === 'st-double-outer' ? 'Tredel (t₂)' : 'Del 2 – spisside (t₂)'}</legend><div class="grid three">${field('Fasthetsklasse', 'members.m2.grade', { options: timberOptions })}${field('Tykkelse t₂', 'members.m2.t', { type: 'number', unit: 'mm', min: 10 })}${field('Høyde h₂', 'members.m2.h', { type: 'number', unit: 'mm', min: 20, ref: 'til oppsprekking 8.1.4' })}</div></fieldset>`;
    if (isSteel) html += `<fieldset><legend>Stålplate</legend><div class="grid three">${field('Stålsort', 'members.steel.grade', { options: Object.keys(STEEL_PLATE).map((s) => ({ value: s, label: s })) })}${field('Platetykkelse t_s', 'members.steel.t_s', { type: 'number', unit: 'mm', min: 1, ref: 'tynn ≤ 0,5d, tykk ≥ d (8.2.3)' })}</div></fieldset>`;
    else html += `<fieldset><legend>Geometri</legend><div class="grid two">${field('Vinkel mellom fiberretningene θ', 'connection.theta', { type: 'number', unit: '°', min: 0, hint: '0° = parallelle deler, 90° = bjelke mot søyle' })}</div></fieldset>`;
    html += `<fieldset><legend>Klima</legend><div class="grid two">${field('Klimaklasse', 'serviceClass', { type: 'number', options: [1, 2, 3].map((c) => ({ value: c, label: `Klimaklasse ${c}` })), ref: 'EC5 2.3.1.3' })}</div></fieldset>`;
  } else if (state.step === 3) {
    const f = state.fastener;
    const presets = FASTENER_PRESETS[f.type];
    const types = [['screw', 'Treskrue'], ['nail', 'Spiker'], ['bolt', 'Bolt'], ['dowel', 'Stålstavdybel']];
    html = `<header><h1>Festemiddel og mønster</h1><p>Standardverdier er typiske. Bruk produsentens ETA i prosjekter og oppgi referansen.</p></header>
    <fieldset><legend>Type</legend><div class="choices" data-testid="fastener-types">${types.map(([id, t]) => `<button type="button" class="choice ${f.type === id ? 'on' : ''}" data-ftype="${id}" data-testid="ftype-${id}"><span class="t">${t}</span><span class="d">${{ screw: 'EC5 8.7', nail: 'EC5 8.3', bolt: 'EC5 8.5', dowel: 'EC5 8.6' }[id]}</span></button>`).join('')}</div></fieldset>
    <fieldset><legend>Dimensjon</legend><div class="grid three">
      <label class="f"><span>Forvalg</span><select data-preset data-testid="fastener.preset">${presets.map((p) => `<option value="${p.id}" ${p.id === f.presetId ? 'selected' : ''}>${p.label}</option>`).join('')}<option value="custom" ${f.presetId === 'custom' ? 'selected' : ''}>Egendefinert (ETA)</option></select></label>
      ${field('Diameter d', 'fastener.d', { type: 'number', unit: 'mm', min: 1 })}
      ${f.type === 'screw' ? field('Kjernediameter d₁', 'fastener.d1', { type: 'number', unit: 'mm', min: 1, ref: 'd_ef = 1,1·d₁' }) : ''}
      ${f.type !== 'bolt' && f.type !== 'dowel' ? field('Lengde l', 'fastener.l', { type: 'number', unit: 'mm', min: 10 }) : ''}
      ${f.type === 'screw' ? field('Hodediameter d_h', 'fastener.d_head', { type: 'number', unit: 'mm', min: 1 }) : ''}
      ${field('Strekkfasthet f_u', 'fastener.f_u', { type: 'number', unit: 'N/mm²', min: 100, ref: 'til M_y,Rk (8.14)/(8.30)' })}
      ${f.type === 'screw' ? field('Strekkapasitet f_tens,k', 'fastener.f_tensk', { type: 'number', unit: 'N', min: 0, ref: 'ETA' }) : ''}
      ${f.type === 'bolt' ? field('Skivediameter', 'fastener.washer', { type: 'number', unit: 'mm', min: 10, ref: '8.5.2(2)' }) : ''}
      ${field('M_y,Rk fra ETA (valgfritt)', 'fastener.M_yRk_override', { type: 'number', unit: 'Nmm', min: 0, hint: 'Tom = beregnes fra f_u' })}
      ${field('ETA / kilde', 'fastener.eta', { placeholder: 'f.eks. ETA-11/0190' })}
    </div>
    <div class="grid two" style="margin-top:.6rem">
      ${f.type === 'nail' || f.type === 'screw' ? field('Forboring', 'fastener.predrilled', { type: 'checkbox', text: 'Forboret', ref: '8.3.1.1' }) : ''}
      ${f.type === 'screw' ? field('Gjenger', 'fastener.fullyThreaded', { type: 'checkbox', text: 'Helgjenget (uttrekk på hodesiden)', ref: '8.7.2' }) : ''}
    </div></fieldset>
    <fieldset><legend>Mønster</legend>
    <p class="hint">Rader ligger langs fiberretningen i del 1. Minsteavstander etter ${esc(result?.worst.r.spacing.ref || '')} (for dimensjonerende vinkel) vises til høyre for feltene.</p>
    <div class="grid three">
      ${field('Antall i rad n₁', 'pattern.n1', { type: 'number', min: 1, step: 1 })}
      ${field('Antall rader n₂', 'pattern.n2', { type: 'number', min: 1, step: 1 })}
      <span></span>
      ${spField('a₁ i rad', 'pattern.a1', 'a1')}${spField('a₂ mellom rader', 'pattern.a2', 'a2')}<span></span>
      ${spField('a₃ til ende', 'pattern.a3', 'a3t', 'a3c')}${spField('a₄ til kant', 'pattern.a4', 'a4t', 'a4c')}
      <label class="f"><span>&nbsp;</span><button type="button" class="btn quiet sm" data-testid="set-min-spacing" id="btn-minsp">Sett alle til minste</button></label>
    </div></fieldset>`;
  } else if (state.step === 4) {
    const cats = Object.entries(LOAD_CATEGORIES).map(([id, c]) => ({ value: id, label: c.label }));
    html = `<header><h1>Laster på knutepunktet</h1><p>Karakteristiske krefter i kN. F<sub>x</sub> er langs fiberretningen i del 1, F<sub>y</sub> på tvers. Kombinasjoner etter NS-EN 1990 (6.10a)/(6.10b) med norsk NA lages automatisk.</p></header>
    <table class="loads-table" data-testid="loads"><thead><tr><th class="name">Navn</th><th>Kategori</th><th class="num">F<sub>x</sub> [kN]</th><th class="num">F<sub>y</sub> [kN]</th><th>Varighet</th><th></th></tr></thead><tbody>
    ${state.loads.map((l, i) => `<tr><td><input data-path="loads.${i}.name" data-testid="loads.${i}.name" value="${esc(l.name)}"></td>
      <td><select data-path="loads.${i}.category" data-testid="loads.${i}.category">${cats.map((c) => `<option value="${c.value}" ${c.value === l.category ? 'selected' : ''}>${c.label}</option>`).join('')}</select></td>
      <td><input type="number" step="any" data-num data-path="loads.${i}.Fx" data-testid="loads.${i}.Fx" value="${l.Fx}"></td>
      <td><input type="number" step="any" data-num data-path="loads.${i}.Fy" data-testid="loads.${i}.Fy" value="${l.Fy}"></td>
      <td class="hint">${DURATION_LABEL[LOAD_CATEGORIES[l.category].duration]}</td>
      <td><button type="button" class="btn quiet sm" data-del="${i}" data-testid="loads.${i}.delete" aria-label="Slett last">✕</button></td></tr>`).join('')}
    </tbody></table>
    <p><button type="button" class="btn quiet sm" id="btn-addload" data-testid="add-load">+ Legg til last</button></p>
    <div class="rule"></div>
    <h2>Kombinasjoner (bruddgrense STR)</h2>
    <table data-testid="combos"><thead><tr><th>Nr</th><th>Ligning</th><th>Uttrykk</th><th class="num">F<sub>d</sub> [kN]</th><th class="num">α₁</th><th>k_mod-varighet</th></tr></thead><tbody>
    ${result.combos.map((c) => `<tr><td>${c.id}</td><td>${c.eq}</td><td class="hint">${esc(c.terms.join(' + '))}</td><td class="num">${n1(c.F)}</td><td class="num">${c.alpha}°</td><td>${DURATION_LABEL[c.duration]}</td></tr>`).join('') || '<tr><td colspan="6" class="hint">Legg til minst én last.</td></tr>'}
    </tbody></table>
    <p class="hint">γ_G = 1,35 (6.10a), ξ·γ_G = 1,20 (6.10b), γ_Q = 1,5 – NS-EN 1990 tabell NA.A1.2(B). ψ₀ fra tabell NA.A1.1. Lastvarighet for kombinasjonen = korteste varighet blant lastene (EC5 3.1.3(2)).</p>`;
  } else {
    html = renderResults();
  }
  const prev = state.step > 1 ? `<button type="button" class="btn quiet" data-nav="-1" data-testid="prev">← Tilbake</button>` : '<span></span>';
  const next = state.step < 5 ? `<button type="button" class="btn" data-nav="1" data-testid="next">${state.step === 4 ? 'Vis resultat' : 'Neste'} →</button>` : `<span style="display:flex;gap:.5rem"><button type="button" class="btn ghost" id="btn-preview" data-testid="preview-report">Forhåndsvis rapport</button><button type="button" class="btn" id="btn-print" data-testid="print-report">Skriv ut / lagre PDF</button></span>`;
  $('#pane').innerHTML = html + `<div class="actions">${prev}${next}</div>`;
}

function spField(label, path, minKey, minKey2) {
  const sp = result?.worst.r.spacing;
  const min = sp ? Math.max(sp[minKey], minKey2 ? sp[minKey2] : 0) : null;
  const v = getPath(state, path);
  const check = result?.spacingCheck.find((c) => c.key === minKey);
  const bad = check && !check.ok;
  return `<label class="f" for="f-${path.replace('.', '-')}"><span>${label}<span class="ref">${min != null ? `min ${n1(min)}` : ''}</span></span><span class="unit" data-unit="mm"><input id="f-${path.replace('.', '-')}" data-path="${path}" data-testid="${path}" type="number" data-num step="1" min="0" value="${v}" class="${bad ? 'bad' : ''}"></span></label>`;
}

function kindIcon(id) {
  const w = (x, wd, c = '#e6d6b8') => `<rect x="${x}" y="8" width="${wd}" height="40" fill="${c}" stroke="#8a6e3f" stroke-width="1"/>`;
  const s = (x, wd) => `<rect x="${x}" y="4" width="${wd}" height="48" fill="#c9d3dc" stroke="#7c8b99"/>`;
  const f = `<line x1="0" y1="28" x2="120" y2="28" stroke="#2f5d8a" stroke-width="3"/>`;
  const map = {
    'tt-single': w(20, 34) + w(54, 46),
    'tt-double': w(14, 26) + w(40, 40) + w(80, 26),
    'st-single': s(30, 8) + w(38, 52),
    'st-double-central': w(14, 40) + s(54, 8) + w(62, 40),
    'st-double-outer': s(26, 8) + w(34, 52) + s(86, 8),
  };
  return `<svg viewBox="0 0 120 56">${map[id]}${f}</svg>`;
}

function renderResults() {
  const R = result, w = R.worst, r = w.r;
  const rows = R.cases.map((k) => `<tr class="${k === w ? 'gov' : ''}" data-testid="case-${k.combo.id}"><td>${k.combo.id}</td><td>${esc(k.combo.label)}</td><td class="num">${n1(k.combo.F)}</td><td class="num">${k.alpha1}° / ${k.alpha2}°</td><td class="num">${n2(k.dc.kmod)}</td><td class="num">${n1(k.dc.Rd / 1000)}</td><td class="num">${pct(k.util)} <span class="pill ${k.util > 1 ? 'bad' : 'ok'}">${k.util > 1 ? 'Ikke OK' : 'OK'}</span></td></tr>`).join('');
  const modes = r.modes.map((m) => `<tr class="${m.id === r.governing.id ? 'gov' : ''} ${m.info ? 'info' : ''}"><td>${esc(m.label)}</td><td class="num">${n0(m.johansen)}</td><td class="num">${m.rope ? n0(m.rope) : '–'}</td><td class="num">${n0(m.value)}</td></tr>`).join('');
  const sp = r.spacingCheck.map((c) => `<tr><td>${c.label}</td><td class="num">${c.na ? '–' : n1(c.min)}</td><td class="num">${c.actual}</td><td>${c.na ? '<span class="hint">ikke aktuell</span>' : `<span class="pill ${c.ok ? 'ok' : 'bad'}">${c.ok ? 'OK' : 'For liten'}</span>`}</td></tr>`).join('');
  const split = w.split.length ? `<h3>Oppsprekking på tvers av fiber (EC5 8.1.4)</h3><table><thead><tr><th>Del</th><th class="num">h_e [mm]</th><th class="num">F₉₀,Rk [kN]</th><th class="num">F₉₀,Rd [kN]</th><th class="num">F₉₀,Ed [kN]</th><th class="num">Utnyttelse</th></tr></thead><tbody>${w.split.map((s) => `<tr><td>${s.tag}</td><td class="num">${s.he}</td><td class="num">${n1(s.F90Rk / 1000)}</td><td class="num">${n1(s.F90Rd / 1000)}</td><td class="num">${n1(s.F90Ed / 1000)}</td><td class="num">${pct(s.util)} <span class="pill ${s.util > 1 ? 'bad' : 'ok'}">${s.util > 1 ? 'Ikke OK' : 'OK'}</span></td></tr>`).join('')}</tbody></table>` : '';
  const trace = `<details class="trace" data-testid="trace"><summary>Vis full beregningsgang (${r.trace.length} steg, dimensjonerende kombinasjon ${w.combo.id})</summary><table><thead><tr><th>Størrelse</th><th>Formel</th><th>Innsatt</th><th class="num">Verdi</th><th>Referanse</th></tr></thead><tbody>${r.trace.map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.formula)}</td><td class="hint">${esc(s.subs)}</td><td class="num">${fmtVal(s.value)} ${esc(s.unit)}</td><td class="hint">${esc(s.ref)}</td></tr>`).join('')}</tbody></table></details>`;
  return `<header><h1>Resultat</h1><p>Dimensjonerende kombinasjon ${w.combo.id}: F_d = ${n1(w.combo.F)} kN, kapasitet ${n1(w.dc.Rd / 1000)} kN, utnyttelse <b>${pct(w.util)}</b>.</p></header>
  <h2>Lastkombinasjoner</h2>
  <table data-testid="results"><thead><tr><th>Nr</th><th>Kombinasjon</th><th class="num">F_d [kN]</th><th class="num">α₁ / α₂</th><th class="num">k_mod</th><th class="num">F_v,Rd [kN]</th><th class="num">Utnyttelse</th></tr></thead><tbody>${rows}</tbody></table>
  <p class="hint">F_v,Rd = k_mod · n_ef,tot · snitt · F_v,Rk / γ_M, γ_M = ${r.gammaM} (${esc(r.gammaMRef)}). n_ef,tot = ${n2(r.nef)} av ${r.n}, ${r.planes} snitt.</p>
  <h2>Bruddformer per festemiddel og snitt (${esc(w.combo.id)})</h2>
  <table data-testid="modes"><thead><tr><th>Bruddform</th><th class="num">Johansen [N]</th><th class="num">Taueffekt [N]</th><th class="num">F_v,Rk [N]</th></tr></thead><tbody>${modes}</tbody></table>
  <p class="hint">f_h,1,k = ${r.fh1 ? n2(r.fh1) : '–'} N/mm², f_h,2,k = ${r.fh2 ? n2(r.fh2) : '–'} N/mm², M_y,Rk = ${n0(r.My)} Nmm, F_ax,Rk = ${n0(r.Fax)} N.</p>
  <h2>Avstander</h2>
  <table data-testid="spacing"><thead><tr><th>Avstand</th><th class="num">Minste [mm]</th><th class="num">Valgt [mm]</th><th></th></tr></thead><tbody>${sp}</tbody></table>
  <p class="hint">${esc(r.spacing.ref)}. a₃ og a₄ kontrolleres mot det strengeste av belastet/ubelastet ende og kant.</p>
  ${split}
  <h3>Stivhet (bruksgrense, informasjon)</h3>
  <p class="hint">K_ser = ${n0(r.Kser)} N/mm per festemiddel og snitt (tabell 7.1) → K_ser,tot = ${n0(r.KserTot)} N/mm. Karakteristisk kombinasjon F = ${n1(R.sls.F)} kN gir forskyvning ≈ ${n2(R.slip)} mm.</p>
  ${trace}`;
}
const fmtVal = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? n0(v) : n2(v)) : esc(v));

function renderSide(opts = {}) {
  const R = result, w = R.worst;
  const v = $('#verdict');
  v.className = 'verdict ' + R.status;
  const hasLoads = R.combos.length > 0;
  v.innerHTML = `<span class="lbl">${hasLoads ? `Utnyttelse, ${esc(w.combo.id)} (${esc(w.combo.label)})` : 'Kapasitet, mellomlang varighet'}</span>
    <span class="big" data-testid="utilization">${hasLoads ? pct(R.util) : n1(w.dc.Rd / 1000) + ' kN'}</span>
    <span class="row"><span>F_d ${n1(w.combo.F)} kN</span><span>F_v,Rd ${n1(w.dc.Rd / 1000)} kN (${pct(w.util)})</span></span>
    ${R.governs === 'split' ? `<span class="row"><span>Oppsprekking på tvers av fiber styrer (EC5 8.1.4)</span><span>${pct(R.worstSplit)}</span></span>` : ''}
    <span class="row"><span>${w.r.n} × ${esc(fastenerLabel(state.fastener))}, ${w.r.planes} snitt</span><span>bruddform ${esc(w.r.governing.id)}</span></span>
    ${R.errors.length ? `<span class="row" style="color:var(--signal)"><span>${R.errors.length} feil må rettes</span></span>` : ''}`;
  // Ved live redigering (skriving i et tallfelt, inkl. mål-feltene inne i selve 3D-visningen)
  // oppdaterer vi den eksisterende 3D-scenen i stedet for å bytte ut #drawing sitt innhold –
  // det ville ødelagt canvas/inputs og gjort det umulig å skrive mer enn ett tegn av gangen.
  const updatedInPlace = opts.liveEdit && updateDrawing3D(state, { spacingCheck: R.spacingCheck, force: R.force });
  if (!updatedInPlace) {
    const drawingEl = $('#drawing');
    drawingEl.innerHTML = drawConnection(state, { spacingCheck: R.spacingCheck, force: R.force });
    const host3d = drawingEl.querySelector('.drawing-3d');
    if (host3d) initDrawing3D(host3d.id, state, { spacingCheck: R.spacingCheck, force: R.force });
  }
  $('#side-notes').innerHTML = [...R.errors.map((e) => `<div class="note err" data-testid="error">${esc(e.text)} <span class="ref">[${esc(e.ref)}]</span></div>`), ...R.warnings.map((e) => `<div class="note" data-testid="warning">${esc(e.text)} <span class="ref">[${esc(e.ref)}]</span></div>`)].join('');
}

function renderAll() {
  try { result = compute(); } catch (e) { console.error(e); result = null; }
  persist();
  renderStepper();
  if (result) { renderPane(); renderSide(); }
  else { $('#pane').innerHTML = `<header><h1>Kunne ikke beregne</h1><p>Kontroller at alle tall er gyldige. Åpne konsollen for detaljer, eller trykk «Nullstill».</p></header>`; }
}

// ---------------------------------------------------------------------------
// Hendelser
// ---------------------------------------------------------------------------
function applyPreset(id) {
  const f = state.fastener;
  const p = FASTENER_PRESETS[f.type].find((x) => x.id === id);
  f.presetId = id;
  if (!p) return;
  Object.assign(f, { d: p.d, d1: p.d1 ?? f.d1, d_head: p.d_head ?? f.d_head, f_u: p.f_u, f_tensk: p.f_tensk ?? null, washer: p.washer ?? f.washer });
  if (p.l_options) { const t = totalThickness(); f.l = p.l_options.find((l) => l >= t * 0.8) ?? p.l_options.at(-1); }
  if (f.type === 'nail') f.predrilled = false; else f.predrilled = true;
}
function totalThickness() {
  const m = state.members, k = state.connection.kind;
  return { 'tt-single': m.m1.t + m.m2.t, 'tt-double': 2 * m.m1.t + m.m2.t, 'st-single': m.m1.t + m.steel.t_s, 'st-double-central': 2 * m.m1.t + m.steel.t_s, 'st-double-outer': m.m2.t + 2 * m.steel.t_s }[k];
}

document.addEventListener('input', (e) => {
  const el = e.target; const path = el.dataset.path;
  if (!path) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (el.hasAttribute('data-num') || el.type === 'number') v = v === '' ? null : Number(v);
  setPath(state, path, v);
  // Samme verdi kan redigeres to steder (skjemaet i midten og mål-feltene i 3D-visningen) –
  // hold dem i sync uten å ta fokus fra feltet brukeren faktisk skriver i.
  document.querySelectorAll(`[data-path="${path}"]`).forEach((other) => {
    if (other !== el && document.activeElement !== other) other.value = el.value;
  });
  if (path.startsWith('loads.')) { // laster: unngå å re-rendre skjemaet mens en skriver
    result = compute(); persist(); renderSide(); renderStepper();
    const tb = $('[data-testid="combos"] tbody'); if (tb) { const tmp = document.createElement('div'); tmp.innerHTML = renderPaneCombosOnly(); tb.innerHTML = tmp.innerHTML; }
    return;
  }
  if (path.startsWith('pattern.') || path.startsWith('members.') || path.startsWith('fastener.') || path === 'serviceClass' || path === 'connection.theta') {
    result = compute(); persist(); renderSide({ liveEdit: true }); renderStepper();
    // oppdater minste-avstander og feilmarkering uten å miste fokus
    document.querySelectorAll('.pane .f input[data-path^="pattern.a"]').forEach((inp) => {
      const key = inp.dataset.path.split('.')[1];
      const c = result.spacingCheck.find((x) => x.key === key || (key === 'a3' && x.key === 'a3t') || (key === 'a4' && x.key === 'a4t'));
      inp.classList.toggle('bad', !!(c && !c.ok));
      const sp = result.worst.r.spacing; const ref = inp.closest('label').querySelector('.ref');
      if (ref) ref.textContent = `min ${n1(Math.max(sp[key] ?? sp[key + 't'] ?? 0, sp[key + 'c'] ?? 0))}`;
    });
    return;
  }
  result = compute(); persist(); renderStepper();
});
function renderPaneCombosOnly() {
  return result.combos.map((c) => `<tr><td>${c.id}</td><td>${c.eq}</td><td class="hint">${esc(c.terms.join(' + '))}</td><td class="num">${n1(c.F)}</td><td class="num">${c.alpha}°</td><td>${DURATION_LABEL[c.duration]}</td></tr>`).join('');
}

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches('select[data-path]')) { renderAll(); return; }
  if (el.matches('[data-preset]')) { applyPreset(el.value); renderAll(); }
});

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-step],[data-nav],[data-kind],[data-ftype],[data-del],#btn-addload,#btn-minsp,#btn-example,#btn-reset,#btn-preview,#btn-print,#btn-close-report,#btn-modes-help,#btn-modes-close,#modes-modal');
  if (!t) return;
  if (t.dataset.step) { state.step = Number(t.dataset.step); renderAll(); }
  else if (t.dataset.nav) { state.step = Math.min(5, Math.max(1, state.step + Number(t.dataset.nav))); renderAll(); window.scrollTo({ top: 0 }); }
  else if (t.dataset.kind) { state.connection.kind = t.dataset.kind; renderAll(); }
  else if (t.dataset.ftype) { state.fastener.type = t.dataset.ftype; applyPreset(FASTENER_PRESETS[t.dataset.ftype][0].id); renderAll(); }
  else if (t.dataset.del != null) { state.loads.splice(Number(t.dataset.del), 1); renderAll(); }
  else if (t.id === 'btn-addload') { state.loads.push({ name: `Q${state.loads.length}`, category: 'Q_A', Fx: 0, Fy: 0 }); renderAll(); }
  else if (t.id === 'btn-minsp') { const sp = result.worst.r.spacing; Object.assign(state.pattern, { a1: Math.ceil(sp.a1), a2: Math.ceil(sp.a2), a3: Math.ceil(Math.max(sp.a3t, sp.a3c)), a4: Math.ceil(Math.max(sp.a4t, sp.a4c)) }); renderAll(); }
  else if (t.id === 'btn-example') { state = EXAMPLE(); renderAll(); }
  else if (t.id === 'btn-reset') { state = DEFAULT(); renderAll(); }
  else if (t.id === 'btn-preview') { showReport(false); }
  else if (t.id === 'btn-print') { showReport(true); }
  else if (t.id === 'btn-close-report') { $('#report').classList.remove('preview'); $('#report').hidden = true; }
  else if (t.id === 'btn-modes-help') { openModesModal(); }
  else if (t.id === 'btn-modes-close') { closeModesModal(); }
  else if (t.id === 'modes-modal' && e.target === t) { closeModesModal(); } // klikk på bakgrunn utenfor kortet
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-step]')) e.target.click();
  if (e.key === 'Escape') { if (!$('#modes-modal').hidden) closeModesModal(); else $('#btn-close-report')?.click(); }
});

function openModesModal() {
  if (!result) return;
  const r = result.worst.r;
  const kind = CONNECTION_KINDS.find((k) => k.id === state.connection.kind);
  const eqRef = r.trace.find((s) => s.id === 'FvRk')?.ref || '';
  $('#modes-modal-body').innerHTML = `<p class="hint">Bruddformer for <b>${esc(kind.title)}</b> (${esc(eqRef)}). Den dimensjonerende (laveste) formen er markert. Skissene er forenklede og viser mekanismen – hullkanttrykk/knusing, stiv rotasjon eller ett/to flyteledd i festemiddelet – ikke geometrien i målestokk.</p>
    <div class="modes-grid">${r.modes.map((mo) => `<div class="mode-card ${mo.id === r.governing.id ? 'gov' : ''}">
      ${drawModeSketch(state.connection.kind, mo)}
      <div class="mode-card-label">${esc(mo.label)}${mo.id === r.governing.id ? ' <span class="mode-card-tag">dimensjonerende</span>' : ''}</div>
      <div class="mode-card-value">F_v,Rk = ${Math.round(mo.value)} N${mo.rope ? ` (Johansen ${Math.round(mo.johansen)} + taueffekt ${Math.round(mo.rope)})` : ''}</div>
    </div>`).join('')}</div>`;
  $('#modes-modal').hidden = false;
}
function closeModesModal() { $('#modes-modal').hidden = true; }

function showReport(print) {
  const rep = $('#report');
  rep.innerHTML = `<div class="report-toolbar"><button type="button" class="btn" id="btn-print" data-testid="print-now">Skriv ut / lagre PDF</button><button type="button" class="btn quiet" id="btn-close-report" data-testid="close-report">Lukk</button></div>` + renderReport(state, result, drawConnection);
  rep.hidden = false; rep.classList.add('preview');
  if (print) setTimeout(() => window.print(), 150);
}

// ---------------------------------------------------------------------------
// Agent-API: window.knutepunkt (stabilt grensesnitt for automatisert bruk)
// ---------------------------------------------------------------------------
window.knutepunkt = {
  version: '0.1.0',
  getState: () => structuredClone(state),
  setState: (partial) => { deepMerge(state, partial); renderAll(); return window.knutepunkt.getResult(); },
  reset: () => { state = DEFAULT(); renderAll(); },
  goTo: (step) => { state.step = step; renderAll(); },
  getResult: () => result && { util: result.util, status: result.status, worst: { combo: result.worst.combo.id, Fd_kN: result.worst.combo.F, Rd_kN: result.worst.dc.Rd / 1000, mode: result.worst.r.governing.id }, errors: result.errors, warnings: result.warnings, spacing: result.spacingCheck, trace: result.worst.r.trace },
  openReport: () => showReport(false),
  kinds: CONNECTION_KINDS.map((k) => k.id), timber: Object.keys(TIMBER), presets: FASTENER_PRESETS, loadCategories: Object.keys(LOAD_CATEGORIES),
};
function deepMerge(a, b) { for (const k of Object.keys(b)) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) { a[k] ??= {}; deepMerge(a[k], b[k]); } else a[k] = b[k]; } }

export { KMOD, GAMMA_M };
renderAll();
