/**
 * app.js — kobler skjemaet til beregningskjernen, plottet og rapportene.
 *
 * Flyten er én vei: readInputs() → compute() → render(). Alt som vises,
 * også rapporten, tegnes fra det siste resultatet; ingenting leses tilbake
 * fra visningsfeltene.
 */
import { compute, designSd } from './ec8-core.js';
import { SEISMIC_CLASSES, SPECTRUM_TABLES, CT_VALUES, LIMITS } from './ec8-data.js';
import { AGR_NORWAY } from './agr-norway.js';
import { spectrumSvg } from './spectrum-svg.js';
import { buildReport } from './report.js';
import { PROJECT_FIELDS, loadProjectInfo, saveProjectInfo } from './project-info.js';

const $ = id => document.getElementById(id);
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '–');
const parse = id => {
  const v = $(id).value.trim();
  return v === '' ? null : Number(v);
};

const NOTES_KEY = 'structural_tools.seismic_ec8.notes';

let lastResult = null;
let lastReportKind = 'avoidance';

// ---------------------------------------------------------------- input

function readLocation() {
  if ($('country').value === 'norway') {
    const fylke = $('fylke').value;
    const kommune = $('kommune').value;
    const row = AGR_NORWAY.find(r => r.fylke === fylke && r.kommune === kommune);
    return row
      ? { fromTable: true, kommune: row.kommune, nr: row.nr, fylke, agR: row.agR }
      : { fromTable: false, place: '', agR: null };
  }
  return { fromTable: false, place: $('place').value.trim(), agR: parse('agr') };
}

function readInputs() {
  const ctMethod = $('ct_method').value;
  return {
    seismicClass: $('seismic_class').value,
    gammaI: parse('gamma_I'),
    agR: readLocation().agR,
    spectrumType: $('spectrum_type').value,
    groundType: $('ground_type').value,
    q: parse('q'),
    life: parse('structure_life'),
    sdMethod: $('sd_method').value,
    ctMethod,
    Ct: ctMethod === 'custom' ? parse('ct') : CT_VALUES[ctMethod].Ct,
    h: parse('h'),
    T1Modal: parse('t1_modal'),
    SdModal: parse('sd_modal'),
    noStiffnessReduction: $('cond_stiffness').checked,
    soilStiffnessBounds: $('cond_soil').checked
  };
}

// ---------------------------------------------------------------- visning

const STATUS_STYLE = {
  met: ['bg-green-900/30 border-green-600', 'text-green-400', 'Met'],
  not_met: ['bg-red-900/20 border-red-700', 'text-red-300', 'Not met'],
  not_evaluated: ['bg-yellow-900/20 border-yellow-700', 'text-yellow-300', 'Not evaluated'],
  not_applicable: ['bg-gray-800 border-gray-600', 'text-gray-400', 'Not applicable']
};

function update() {
  const inputs = readInputs();
  const r = compute(inputs);
  lastResult = r;

  const s = r.spectrum;
  $('sp_display').textContent = `S = ${num(s.S)},  TB = ${num(s.TB)} s,  TC = ${num(s.TC)} s,  TD = ${num(s.TD)} s`;
  $('sp_ref').textContent = SPECTRUM_TABLES[inputs.spectrumType].ref.replace('EN 1998-1 ', '');
  $('ag_display').textContent = num(r.ag);
  $('ags_display').textContent = num(s.agS);
  $('t1_display').textContent = num(r.sd.T1, 3);
  $('sd_display').textContent = num(r.sd.Sd);

  const qTooHigh = Number.isFinite(inputs.q) && inputs.q > LIMITS.qMax;
  $('q_note').className = qTooHigh ? 'warn' : 'hint';

  const tableG = SEISMIC_CLASSES[inputs.seismicClass].gammaI;
  $('gamma_note').textContent = tableG === null
    ? 'Class IV has no table value (Tabell NA.4(901) note a) — enter γI from a separate assessment.'
    : r.gammaIFromTable
      ? `Tabell NA.4(901): γI = ${tableG.toFixed(2)}`
      : `User value — Tabell NA.4(901) gives ${tableG.toFixed(2)} for class ${inputs.seismicClass}.`;

  const notes = [...r.errors, ...r.sd.notes];
  if (r.sd.method !== 'none' && !r.sd.valid && r.sd.conditions?.some(c => !c.ok)) {
    notes.push('Conditions for criterion 5 not satisfied — it is not counted.');
  }
  $('sd_notes').textContent = notes.join(' ');

  renderConclusion(r);
  renderCriteria(r);
  renderPlot(r);
}

function renderConclusion(r) {
  const el = $('conclusion');
  if (r.conclusion === 'invalid') {
    el.className = 'p-4 rounded border text-lg font-bold bg-yellow-900/30 border-yellow-600 text-yellow-300';
    el.textContent = r.inputs.agR === null
      ? ($('country').value === 'norway' ? 'Select fylke and kommune to get agR from Tabell NA.3.2.' : 'Enter agR.')
      : r.errors.join(' ');
  } else if (r.conclusion === 'avoided') {
    el.className = 'p-4 rounded border text-lg font-bold bg-green-900/30 border-green-500 text-green-400';
    el.textContent = '✅ Avoidance criterion met — seismic design not required (NA.3.2.1(5))';
  } else {
    el.className = 'p-4 rounded border text-lg font-bold bg-red-900/30 border-red-500 text-red-400';
    el.textContent = r.classInfo.avoidanceAllowed
      ? '⚠️ Seismic design required — no avoidance criterion met'
      : `⚠️ Seismic design required — class ${r.seismicClass} is outside NA.3.2.1(5) (classes I–IIIa only)`;
  }
}

function renderCriteria(r) {
  $('criteria').innerHTML = r.criteria.map(c => {
    const [box, txt, label] = STATUS_STYLE[c.status];
    return `<div class="flex flex-wrap justify-between gap-2 p-2 rounded border ${box}">
      <span>${c.id}. ${c.text}</span>
      <span class="font-mono">${c.value} <span class="text-gray-400">(${c.limit})</span> <b class="${txt}">${label}</b></span>
    </div>`;
  }).join('');
}

function renderPlot(r) {
  const container = $('spectrum-plot');
  const readout = $('spectrum-readout');
  container.querySelector('svg')?.remove();
  if (r.conclusion === 'invalid') return;

  const point = Number.isFinite(r.sd.Sd) ? { T: r.sd.T1, Sd: r.sd.Sd } : null;
  container.insertAdjacentHTML('afterbegin', spectrumSvg(r.spectrum, { width: 900, height: 340, theme: 'screen', point, limit: LIMITS.Sd }));
  const svg = container.querySelector('svg');
  const d = svg.dataset;
  const hover = svg.querySelector('g.hover');

  svg.addEventListener('mousemove', ev => {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x0 = +d.x0, x1 = +d.x1, y0 = +d.y0, y1 = +d.y1;
    if (p.x < x0 || p.x > x1) {
      hover.innerHTML = '';
      readout.hidden = true;
      return;
    }
    const T = (p.x - x0) / (x1 - x0) * +d.tmax;
    const Sd = designSd(T, r.spectrum).Sd;
    const y = y1 - (Sd / +d.ytop) * (y1 - y0);
    hover.innerHTML = `<line x1="${p.x}" x2="${p.x}" y1="${y0}" y2="${y1}" stroke="#9ca3af" stroke-width="0.6"/>`
      + `<circle cx="${p.x}" cy="${y}" r="3.5" fill="#60a5fa"/>`;
    readout.hidden = false;
    readout.textContent = `T = ${T.toFixed(2)} s   Sd = ${Sd.toFixed(3)} m/s²`;
  });
  svg.addEventListener('mouseleave', () => {
    hover.innerHTML = '';
    readout.hidden = true;
  });
}

// ---------------------------------------------------------------- rapport

function reportContext() {
  const project = {};
  for (const f of PROJECT_FIELDS) project[f.key] = $(`pi_${f.key}`).value.trim();
  return {
    result: lastResult,
    location: readLocation(),
    project,
    notes: $('notes').value,
    generatedAt: new Date()
  };
}

function renderReportInto(kind) {
  lastReportKind = kind;
  const html = buildReport(kind, reportContext());
  $('report-root').innerHTML = html;
  return html;
}

function openPreview(kind) {
  const html = renderReportInto(kind);
  const sheet = $('report-sheet');
  sheet.innerHTML = html;
  $('report-preview').hidden = false;

  // Skaler arket ned på smale skjermer; 210 mm ≈ 794 px.
  const avail = Math.min(window.innerWidth - 32, 900);
  const scale = Math.min(1, avail / 794);
  sheet.style.transform = scale < 1 ? `scale(${scale})` : '';
  sheet.style.marginBottom = scale < 1 ? `${-(1 - scale) * 1123}px` : '';

  const body = sheet.querySelector('.rp-body');
  const overflow = body && body.scrollHeight > body.clientHeight + 1;
  $('report-warning').textContent = overflow
    ? 'Content does not fit on one page — shorten the comments or project fields.'
    : '';
}

function closePreview() {
  $('report-preview').hidden = true;
  $('report-sheet').innerHTML = '';
}

// ---------------------------------------------------------------- oppsett

function populateProjectFields() {
  const saved = loadProjectInfo();
  $('project-fields').innerHTML = PROJECT_FIELDS.map(f => `
    <div class="flex flex-col gap-1">
      <label for="pi_${f.key}" class="text-sm font-medium">${f.label}</label>
      <input id="pi_${f.key}" type="${f.key === 'date' ? 'date' : 'text'}" class="inp">
    </div>`).join('');
  for (const f of PROJECT_FIELDS) {
    const el = $(`pi_${f.key}`);
    el.value = saved[f.key] ?? '';
    el.addEventListener('input', () => {
      const info = {};
      for (const g of PROJECT_FIELDS) info[g.key] = $(`pi_${g.key}`).value;
      saveProjectInfo(info);
    });
  }
  try {
    $('notes').value = localStorage.getItem(NOTES_KEY) ?? '';
  } catch { /* lagring blokkert */ }
  $('notes').addEventListener('input', () => {
    try { localStorage.setItem(NOTES_KEY, $('notes').value); } catch { /* lagring blokkert */ }
  });
}

function populateFylker() {
  const fylker = [...new Set(AGR_NORWAY.map(r => r.fylke))].sort((a, b) => a.localeCompare(b, 'nb'));
  $('fylke').innerHTML = '<option value="">Select fylke…</option>'
    + fylker.map(f => `<option>${f}</option>`).join('');
}

function populateKommuner() {
  const fylke = $('fylke').value;
  const kommuner = AGR_NORWAY.filter(r => r.fylke === fylke).sort((a, b) => a.kommune.localeCompare(b.kommune, 'nb'));
  $('kommune').innerHTML = '<option value="">Select kommune…</option>'
    + kommuner.map(r => `<option value="${r.kommune}">${r.kommune} (${r.nr})</option>`).join('');
  updateNorwayDisplay();
}

function updateNorwayDisplay() {
  const loc = readLocation();
  $('agr_norway_display').textContent = loc.fromTable ? loc.agR.toFixed(2) : '–';
}

function toggleCountry() {
  const norway = $('country').value === 'norway';
  $('norway_location').hidden = !norway;
  $('custom_place_input').hidden = norway;
}

function toggleSdMethod() {
  const m = $('sd_method').value;
  $('simplified_inputs').hidden = m !== 'simplified';
  $('modal_t1_input').hidden = m !== 'modalT1';
  $('modal_sd_input').hidden = m !== 'modalSd';
  $('modal_conditions').hidden = !(m === 'modalT1' || m === 'modalSd');
}

function syncCt() {
  const m = $('ct_method').value;
  const ct = $('ct');
  ct.disabled = m !== 'custom';
  if (m !== 'custom') ct.value = CT_VALUES[m].Ct;
}

function syncGammaI() {
  const g = SEISMIC_CLASSES[$('seismic_class').value].gammaI;
  $('gamma_I').value = g === null ? '' : g.toFixed(2);
}

document.addEventListener('DOMContentLoaded', () => {
  populateProjectFields();
  populateFylker();
  syncGammaI();
  syncCt();
  toggleCountry();
  toggleSdMethod();

  const on = (id, ev, fn) => $(id).addEventListener(ev, () => { fn?.(); update(); });
  on('country', 'change', toggleCountry);
  on('fylke', 'change', populateKommuner);
  on('kommune', 'change', updateNorwayDisplay);
  on('seismic_class', 'change', syncGammaI);
  on('ct_method', 'change', syncCt);
  on('sd_method', 'change', toggleSdMethod);
  for (const id of ['spectrum_type', 'ground_type', 'cond_stiffness', 'cond_soil']) on(id, 'change');
  for (const id of ['place', 'agr', 'gamma_I', 'structure_life', 'q', 'h', 'ct', 't1_modal', 'sd_modal']) on(id, 'input');

  document.querySelectorAll('[data-report]').forEach(btn =>
    btn.addEventListener('click', () => openPreview(btn.dataset.report)));
  $('report-close').addEventListener('click', closePreview);
  $('report-print').addEventListener('click', () => window.print());
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('report-preview').hidden) closePreview();
  });
  // Ctrl+P uten forhåndsvisning skal også gi en rapport, ikke en tom side.
  window.addEventListener('beforeprint', () => {
    if ($('report-preview').hidden) renderReportInto(lastReportKind);
  });

  update();
});
