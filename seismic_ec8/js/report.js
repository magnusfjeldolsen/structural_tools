/**
 * report.js — de to rapportene som HTML-strenger, én stående A4-side hver.
 *
 *   'spectrum'  — dimensjonerende spekter med alle parametere og tabellreferanser
 *   'avoidance' — full vurdering av utelatelseskriteriene i NA.3.2.1(5)
 *
 * Alt leses fra resultatet til compute(); rapporten regner ingenting selv
 * utover å slå opp Sd i noen faste perioder for tabellen.
 */
import { designSd } from './ec8-core.js';
import { STANDARD, REFS, EN_SPECTRUM, EN_BETA, EN_CT } from './ec8-data.js';
import { PROJECT_FIELDS } from './project-info.js';
import { spectrumSvg } from './spectrum-svg.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const num = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '–');

const SD_METHOD_TEXT = {
  none: 'Ikke vurdert',
  simplified: 'Forenklet periodeestimat, lign. (4.6)',
  modalT1: 'Periode T₁ fra modalanalyse',
  modalSd: 'S<sub>d,maks</sub> fra modalanalyse'
};

const STATUS_TEXT = {
  met: 'Ja',
  not_met: 'Nei',
  not_evaluated: 'Ikke vurdert',
  not_applicable: 'Gjelder ikke'
};

/**
 * ctx = { result, place, project, notes, generatedAt }
 */
export function buildReport(kind, ctx) {
  if (ctx.result.conclusion === 'invalid') {
    return page(ctx, 'Rapport kan ikke lages', `<div class="rp-error">${ctx.result.errors.map(esc).join('<br>')}</div>`);
  }
  return kind === 'spectrum' ? spectrumReport(ctx) : avoidanceReport(ctx);
}

// ---------------------------------------------------------------- felles

function page(ctx, title, body, subtitle = '') {
  const p = ctx.project || {};
  const cells = PROJECT_FIELDS
    .map(f => `<div class="rp-pi${f.wide ? ' wide' : ''}"><span>${f.label}</span><b>${esc(p[f.key]) || '&nbsp;'}</b></div>`)
    .join('');
  const generated = (ctx.generatedAt || new Date()).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });
  return `
  <article class="report-page">
    <header class="rp-head">
      <div class="rp-title">
        <h1>${title}</h1>
        <div class="rp-sub">${subtitle || STANDARD}</div>
      </div>
      <div class="rp-project">${cells}</div>
    </header>
    <div class="rp-body">${body}</div>
    <footer class="rp-foot">
      <span>structural_tools · seismic_ec8 · generert ${esc(generated)}</span>
      <span>Side 1 av 1</span>
    </footer>
  </article>`;
}

function section(title, html) {
  return `<section class="rp-sec"><h2>${title}</h2>${html}</section>`;
}

function paramTable(rows) {
  return `<table class="rp-table rp-params">
    <thead><tr><th>Parameter</th><th>Verdi</th><th>Grunnlag / referanse</th></tr></thead>
    <tbody>${rows.map(([p, v, r]) => `<tr><td>${p}</td><td class="rp-num">${v}</td><td>${r}</td></tr>`).join('')}</tbody>
  </table>`;
}

// Verdiene er tastet inn fra brukerens eget eksemplar av standarden.
const given = ref => `Oppgitt, jf. ${ref}`;

const SOURCE_LINE = `<p class="rp-source">Verdier fra det nasjonale tillegget (NA) er oppgitt av brukeren fra ${STANDARD}. Anbefalte verdier er fra EN 1998-1.</p>`;

function spectrumRef(i) {
  return i.spectrumSource === 'en' ? EN_SPECTRUM[i.spectrumType].ref : given(REFS.spectrum);
}

function betaRef(beta) {
  return Math.abs(beta - EN_BETA) < 1e-9 ? `${REFS.beta}, anbefalt verdi` : given(REFS.beta);
}

function basisRows(ctx) {
  const r = ctx.result;
  const s = r.spectrum;
  const i = r.inputs;
  return [
    ['Sted', esc(ctx.place) || '–', ''],
    ['a<sub>gR</sub>', `${num(i.agR)} m/s²`, given(REFS.agR)],
    ['Seismisk klasse', r.seismicClass, given(REFS.seismicClass)],
    ['γ<sub>I</sub>', num(r.gammaI), given(REFS.gammaI)],
    ['a<sub>g</sub> = γ<sub>I</sub>·a<sub>gR</sub>', `${num(r.ag)} m/s²`, '3.2.1(3)'],
    ['Grunntype', i.groundType, given(REFS.groundType)],
    ['Spektertype', `Type ${i.spectrumType}`, given(REFS.spectrumType)],
    ['S', num(s.S), spectrumRef(i)],
    ['T<sub>B</sub> / T<sub>C</sub> / T<sub>D</sub>', `${num(s.TB)} / ${num(s.TC)} / ${num(s.TD)} s`, spectrumRef(i)],
    ['q', num(s.q, 2), `${REFS.q} — konstruksjonsfaktor`],
    ['β', num(s.beta), `${betaRef(s.beta)} — nedre grense`]
  ];
}

function formulas() {
  return `<div class="rp-eqs">
    <div><span>0 ≤ T ≤ T<sub>B</sub>:</span><span class="f">S<sub>d</sub>(T) = a<sub>g</sub>·S·[2/3 + T/T<sub>B</sub>·(2,5/q − 2/3)]</span><em>(3.13)</em></div>
    <div><span>T<sub>B</sub> ≤ T ≤ T<sub>C</sub>:</span><span class="f">S<sub>d</sub>(T) = a<sub>g</sub>·S·2,5/q</span><em>(3.14)</em></div>
    <div><span>T<sub>C</sub> ≤ T ≤ T<sub>D</sub>:</span><span class="f">S<sub>d</sub>(T) = a<sub>g</sub>·S·2,5/q·T<sub>C</sub>/T ≥ β·a<sub>g</sub></span><em>(3.15)</em></div>
    <div><span>T<sub>D</sub> ≤ T:</span><span class="f">S<sub>d</sub>(T) = a<sub>g</sub>·S·2,5/q·T<sub>C</sub>T<sub>D</sub>/T² ≥ β·a<sub>g</sub></span><em>(3.16)</em></div>
  </div>`;
}

function notesSection(ctx) {
  const notes = (ctx.notes || '').trim();
  return notes ? section('Forutsetninger og kommentarer', `<p class="rp-notes">${esc(notes)}</p>`) : '';
}

// ---------------------------------------------------------------- designspekter

function spectrumReport(ctx) {
  const r = ctx.result;
  const s = r.spectrum;

  const periods = [0, s.TB, s.TC, 0.5, 1.0, s.TD, 2.0, 3.0, 4.0]
    .filter((T, i, a) => a.findIndex(u => Math.abs(u - T) < 1e-9) === i)
    .sort((a, b) => a - b);
  const sdRow = periods.map(T => `<td>${num(designSd(T, s).Sd)}</td>`).join('');
  const tRow = periods.map(T => `<th>${num(T)}</th>`).join('');

  const keyValues = `
    <table class="rp-table rp-key">
      <tbody>
        <tr><td>a<sub>g</sub>·S</td><td class="rp-num">${num(s.agS)} m/s²</td>
            <td>Platå S<sub>d</sub> = a<sub>g</sub>·S·2,5/q</td><td class="rp-num">${num(s.plateau)} m/s²</td></tr>
        <tr><td>S<sub>d</sub>(0) = a<sub>g</sub>·S·2/3</td><td class="rp-num">${num(s.Sd0)} m/s²</td>
            <td>Nedre grense β·a<sub>g</sub></td><td class="rp-num">${num(s.floor)} m/s²</td></tr>
      </tbody>
    </table>
    <table class="rp-table rp-periods">
      <thead><tr><th>T [s]</th>${tRow}</tr></thead>
      <tbody><tr><th>S<sub>d</sub> [m/s²]</th>${sdRow}</tr></tbody>
    </table>`;

  const body = [
    section('Grunnlag', paramTable(basisRows(ctx))),
    section('Dimensjonerende spekter for elastisk analyse, 3.2.2.5', formulas()),
    section('Spekter', `<div class="rp-plot">${spectrumSvg(s, { width: 720, height: 270, theme: 'print', fontSize: 11 })}</div>`),
    section('Nøkkelverdier', keyValues),
    notesSection(ctx),
    SOURCE_LINE
  ].join('');

  return page(ctx, 'Dimensjonerende responsspekter', body, `${STANDARD} — horisontal komponent`);
}

// ---------------------------------------------------------------- utelatelseskriterie

function sdSection(r) {
  const sd = r.sd;
  const rows = [['Metode', SD_METHOD_TEXT[sd.method], '']];
  if (sd.method === 'simplified' && Number.isFinite(sd.T1)) {
    const ct = EN_CT[r.inputs.ctMethod];
    rows.push(['C<sub>t</sub>', num(sd.Ct, 3), ct ? `${REFS.Ct}, ${ct.label}` : given(REFS.Ct)]);
    rows.push(['h', `${num(sd.h, 1)} m`, 'Høyde over fundament / stiv kjeller']);
    rows.push(['T<sub>1</sub> = C<sub>t</sub>·h<sup>3/4</sup>', `${num(sd.T1, 3)} s`, 'Lign. (4.6)']);
  }
  if (sd.method === 'modalT1' && Number.isFinite(sd.T1)) {
    rows.push(['T<sub>1</sub>', `${num(sd.T1, 3)} s`, 'Fra modalanalyse']);
  }
  if (Number.isFinite(sd.Sd)) {
    rows.push(sd.method === 'modalSd'
      ? ['S<sub>d,maks</sub>', `${num(sd.Sd)} m/s²`, 'Fra modalanalyse']
      : ['S<sub>d</sub>(T<sub>1</sub>)', `${num(sd.Sd)} m/s²`, `Lign. (${sd.eq})`]);
  }
  let html = paramTable(rows);
  if (sd.conditions?.length) {
    html += `<ul class="rp-conds">${sd.conditions.map(c =>
      `<li class="${c.ok ? 'ok' : 'nok'}">${c.ok ? '☑' : '☐'} ${esc(c.text)}</li>`).join('')}</ul>`;
  }
  if (sd.notes.length) html += `<p class="rp-warn">${sd.notes.map(esc).join(' ')}</p>`;
  if (sd.method !== 'none' && !sd.valid) {
    html += '<p class="rp-warn">Betingelsene for S<sub>d</sub>-kriteriet er ikke oppfylt — kriterium 5 er ikke tatt med i vurderingen.</p>';
  }
  return html;
}

function criteriaTable(r) {
  const rows = r.criteria.map(c => `
    <tr class="st-${c.status}">
      <td>${c.id}</td><td>${c.text}</td><td class="rp-num">${c.value}</td>
      <td class="rp-num">${c.limit}</td><td class="rp-status">${STATUS_TEXT[c.status]}</td>
    </tr>`).join('');
  return `<table class="rp-table rp-crit">
    <thead><tr><th>#</th><th>Kriterium</th><th>Verdi</th><th>Grense</th><th>Oppfylt</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function conclusionBox(r) {
  if (!r.classInfo.avoidanceAllowed) {
    return `<div class="rp-concl required"><b>Påvisning av seismisk påvirkning kreves.</b>
      Seismisk klasse ${r.seismicClass}: ${REFS.avoidance} gjelder bare klasse I–IIIa.</div>`;
  }
  if (r.conclusion === 'avoided') {
    const met = r.criteria.filter(c => c.status === 'met').map(c => c.id).join(', ');
    return `<div class="rp-concl avoided"><b>Utelatelseskriteriet er oppfylt.</b>
      Påvisning av motstand mot seismisk påvirkning etter NS-EN 1998 kan utelates (kriterium ${met}).</div>`;
  }
  return `<div class="rp-concl required"><b>Utelatelseskriteriet er ikke oppfylt.</b>
    Konstruksjonen skal påvises for seismisk påvirkning etter NS-EN 1998.</div>`;
}

function avoidanceReport(ctx) {
  const r = ctx.result;
  const s = r.spectrum;
  const i = r.inputs;

  const inputRows = [
    ...basisRows(ctx).filter(([p]) => !p.startsWith('T<sub>B') && p !== 'β' && p !== 'Spektertype'),
    ['Dimensjonerende brukstid', Number.isFinite(i.life) ? `${i.life} år` : '–', 'NS-EN 1990, 2.3']
  ];

  const plotPoint = Number.isFinite(r.sd.Sd) ? { T: r.sd.T1, Sd: r.sd.Sd } : null;
  const limit = Number.isFinite(i.limits?.Sd) ? i.limits.Sd : null;
  const plot = spectrumSvg(s, { width: 720, height: 145, theme: 'print', point: plotPoint, limit, fontSize: 11 });

  const body = [
    section('Inngangsdata', paramTable(inputRows)),
    section('Dimensjonerende akselerasjon S<sub>d</sub>', sdSection(r)),
    section(`Kriterier, ${REFS.avoidance} <small>— påvisning kan utelates for klasse I–IIIa når minst ett er oppfylt</small>`,
      criteriaTable(r)),
    conclusionBox(r),
    section(`Spekter — type ${i.spectrumType}, grunntype ${i.groundType}, q = ${num(s.q, 1)}`, `<div class="rp-plot">${plot}</div>`),
    notesSection(ctx),
    SOURCE_LINE
  ].join('');

  return page(ctx, 'Utelatelseskriterie for jordskjelv', body, `${STANDARD}, ${REFS.avoidance}`);
}
