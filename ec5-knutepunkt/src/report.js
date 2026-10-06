// Rapport i A4-format. Ren HTML som skrives ut via nettleserens «Lagre som PDF».
// Alle tall spores til beregningsgangen (trace) med referanse til standardens punkt.
import { TIMBER, GAMMA_M, KMOD_REF, DURATION_LABEL, LOAD_CATEGORIES, STEEL_PLATE } from './engine/materials.js';
import { CONNECTION_KINDS } from './app.js';
import { fastenerLabel, drawModeSketch } from './drawing.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n0 = (x) => Math.round(x).toLocaleString('nb-NO');
const n1 = (x) => x.toLocaleString('nb-NO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const n2 = (x) => x.toLocaleString('nb-NO', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const pct = (x) => `${Math.round(x * 100)} %`;
const fmtVal = (v) => (typeof v === 'number' ? (Math.abs(v) >= 100 ? n0(v) : n2(v)) : esc(v));

export const REFERENCES = [
  ['EC5', 'NS-EN 1995-1-1:2004+A1:2008+NA:2010 Eurokode 5: Prosjektering av trekonstruksjoner – Del 1-1: Allmenne regler og regler for bygninger. Standard Norge.'],
  ['EC0', 'NS-EN 1990:2002+A1:2005+NA:2016 Eurokode: Grunnlag for prosjektering av konstruksjoner. Standard Norge.'],
  ['EN338', 'NS-EN 338:2016 Konstruksjonstrevirke – Styrkeklasser.'],
  ['EN14080', 'NS-EN 14080:2013 Trekonstruksjoner – Limtre og limt laminert heltre – Krav.'],
  ['EN14592', 'NS-EN 14592:2008+A1:2012 Trekonstruksjoner – Dybeltype festemidler – Krav.'],
  ['EC3', 'NS-EN 1993-1-8:2005+NA:2009 Eurokode 3: Prosjektering av stålkonstruksjoner – Del 1-8: Knutepunkter og forbindelser.'],
  ['EN10025', 'NS-EN 10025-2:2019 Varmvalsede produkter av konstruksjonsstål – Del 2.'],
  ['ETA', 'Produsentens europeiske tekniske bedømmelse (ETA) for det aktuelle festemiddelet (skal oppgis i prosjektet).'],
];

export function renderReport(state, R, draw) {
  const w = R.worst, r = w.r, m = state.members, f = state.fastener;
  const kind = CONNECTION_KINDS.find((k) => k.id === state.connection.kind);
  const isSteel = state.connection.kind.startsWith('st');
  const date = state.project.date || new Date().toISOString().slice(0, 10);
  const foot = (p, tot) => `<div class="foot"><span>${esc(state.project.name || 'Knutepunktberegning')} · ${esc(state.project.part || '')}</span><span>Knutepunkt v0.1 · NS-EN 1995-1-1 · ${esc(date)}</span><span>Side ${p} av ${tot}</span></div>`;
  const tot = 3;

  const status = R.util <= 1 && !R.errors.length;
  const page1 = `<section class="page">
    <h1>Knutepunktberegning – ${esc(kind.title)}</h1>
    <div class="meta">
      <span><b>Prosjekt</b> ${esc(state.project.name || '–')}</span><span><b>Konstruksjonsdel</b> ${esc(state.project.part || '–')}</span>
      <span><b>Utført av</b> ${esc(state.project.author || '–')}</span><span><b>Dato</b> ${esc(date)}</span>
      <span><b>Regelverk</b> NS-EN 1995-1-1:2004+A1:2008+NA:2010, NS-EN 1990 NA</span><span><b>Verktøy</b> Knutepunkt v0.1 (prototype)</span>
    </div>
    <div class="sum ${status ? '' : 'bad'}">${status ? 'Forbindelsen har tilstrekkelig kapasitet.' : 'Forbindelsen har IKKE tilstrekkelig kapasitet eller har geometrifeil.'} Største utnyttelse ${pct(R.util)} (${esc(w.combo.id)}, ${esc(w.combo.label)}).</div>
    <h2>1 Geometri og oppbygging</h2>
    ${draw(state, { spacingCheck: R.spacingCheck, force: R.force }, { compact: true })}
    <table><tbody>
      <tr><th>Forbindelsestype</th><td>${esc(kind.title)} – ${esc(kind.ref)}</td></tr>
      ${state.connection.kind !== 'st-double-outer' ? `<tr><th>Del 1 (t₁)</th><td>${esc(m.m1.grade)}, t₁ = ${m.m1.t} mm, h₁ = ${m.m1.h} mm (ρ_k = ${TIMBER[m.m1.grade].rho_k} kg/m³, ${esc(TIMBER[m.m1.grade].ref)})</td></tr>` : ''}
      ${state.connection.kind !== 'st-single' && state.connection.kind !== 'st-double-central' ? `<tr><th>Del 2 (t₂)</th><td>${esc(m.m2.grade)}, t₂ = ${m.m2.t} mm, h₂ = ${m.m2.h} mm (ρ_k = ${TIMBER[m.m2.grade].rho_k} kg/m³, ${esc(TIMBER[m.m2.grade].ref)})</td></tr>` : ''}
      ${isSteel ? `<tr><th>Stålplate</th><td>${esc(m.steel.grade)}, t_s = ${m.steel.t_s} mm (${esc(STEEL_PLATE[m.steel.grade].ref)})</td></tr>` : `<tr><th>Vinkel mellom fiberretninger</th><td>θ = ${state.connection.theta}°</td></tr>`}
      <tr><th>Festemiddel</th><td>${esc(fastenerLabel(f))}${f.type === 'screw' ? `, d₁ = ${f.d1} mm, d_h = ${f.d_head} mm, ${f.fullyThreaded ? 'helgjenget' : 'delgjenget'}` : ''}, f_u = ${f.f_u} N/mm²${f.f_tensk ? `, f_tens,k = ${n0(f.f_tensk)} N` : ''}${f.eta ? ` – ${esc(f.eta)}` : ' – typiske verdier, ETA må oppgis'}</td></tr>
      <tr><th>Mønster</th><td>${state.pattern.n1} i rad × ${state.pattern.n2} rader = ${r.n} stk. a₁ = ${state.pattern.a1}, a₂ = ${state.pattern.a2}, a₃ = ${state.pattern.a3}, a₄ = ${state.pattern.a4} mm. ${f.predrilled ? 'Forboret.' : 'Ikke forboret.'}</td></tr>
      <tr><th>Klimaklasse</th><td>${state.serviceClass} (EC5 2.3.1.3); γ_M = ${r.gammaM} (${esc(r.gammaMRef)})</td></tr>
    </tbody></table>
    <h2>2 Laster og lastkombinasjoner</h2>
    <table><thead><tr><th>Last</th><th>Kategori</th><th class="num">F_x [kN]</th><th class="num">F_y [kN]</th><th>Varighet</th><th class="num">ψ₀</th><th>Ref.</th></tr></thead><tbody>
    ${state.loads.map((l) => `<tr><td>${esc(l.name)}</td><td>${esc(LOAD_CATEGORIES[l.category].label)}</td><td class="num">${n1(l.Fx)}</td><td class="num">${n1(l.Fy)}</td><td>${DURATION_LABEL[LOAD_CATEGORIES[l.category].duration]}</td><td class="num">${LOAD_CATEGORIES[l.category].psi0}</td><td>${esc(LOAD_CATEGORIES[l.category].ref)}</td></tr>`).join('')}
    </tbody></table>
    <p>F_x virker langs fiberretningen i del 1, F_y på tvers. Kombinasjoner etter NS-EN 1990 (6.10a) og (6.10b) med γ_G = 1,35, ξ = 0,89 og γ_Q = 1,5 (tabell NA.A1.2(B)). Lastvarighetsklasse for kombinasjonen settes lik korteste varighet blant bidragende laster (EC5 3.1.3(2)).</p>
    <table><thead><tr><th>Nr</th><th>Lign.</th><th>Uttrykk</th><th class="num">F_d [kN]</th><th class="num">α₁ / α₂</th><th>Varighet</th><th class="num">k_mod</th></tr></thead><tbody>
    ${R.cases.map((k) => `<tr><td>${k.combo.id}</td><td>${k.combo.eq}</td><td>${esc(k.combo.terms.join(' + '))}</td><td class="num">${n1(k.combo.F)}</td><td class="num">${k.alpha1}° / ${k.alpha2}°</td><td>${DURATION_LABEL[k.combo.duration]}</td><td class="num">${n2(k.dc.kmod)}</td></tr>`).join('')}
    </tbody></table>
    <p>k_mod etter ${esc(KMOD_REF)} for klimaklasse ${state.serviceClass}.</p>
    ${foot(1, tot)}
  </section>`;

  const page2 = `<section class="page">
    <h2>3 Kapasitet per festemiddel – dimensjonerende kombinasjon ${esc(w.combo.id)}</h2>
    <p>Regelsett: ${esc(r.rules.ref)}. Beregningsdiameter d = ${n2(r.d)} mm.</p>
    <table class="trace-t"><thead><tr><th>Størrelse</th><th>Formel</th><th>Innsatte verdier</th><th class="num">Verdi</th><th>Referanse</th></tr></thead><tbody>
    ${r.trace.filter((s) => !['nef', 'nef0', 'kef', 'nef_tot', 'RkTot', 'Kser', 'Ku'].includes(s.id) && !s.id.startsWith('F90')).map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.formula)}</td><td>${esc(s.subs)}</td><td class="num">${fmtVal(s.value)} ${esc(s.unit)}</td><td>${esc(s.ref)}</td></tr>`).join('')}
    </tbody></table>
    <h3>Bruddformer (${esc(r.modes[0]?.id && jref(r))})</h3>
    <div class="gov-mode">
      <div class="gov-mode-sketch">${drawModeSketch(state.connection.kind, r.governing)}</div>
      <p class="gov-mode-text"><b>Dimensjonerende bruddform: ${esc(r.governing.label)}</b><br>F_v,Rk = ${n0(r.governing.value)} N per festemiddel per snitt${r.governing.rope ? ` (Johansen ${n0(r.governing.johansen)} N + taueffekt ${n0(r.governing.rope)} N)` : ''}.</p>
    </div>
    <table><thead><tr><th>Bruddform</th><th class="num">Johansen-del [N]</th><th class="num">Taueffekt [N]</th><th class="num">F_v,Rk [N]</th></tr></thead><tbody>
    ${r.modes.map((mo) => `<tr class="${mo.id === r.governing.id ? 'gov' : ''}"><td>${esc(mo.label)}${mo.id === r.governing.id ? ' – dimensjonerende' : ''}</td><td class="num">${n0(mo.johansen)}</td><td class="num">${mo.rope ? n0(mo.rope) : '–'}</td><td class="num">${n0(mo.value)}</td></tr>`).join('')}
    </tbody></table>
    <p>Taueffekt F_ax,Rk/4 begrenset til ${Math.round(ropeLimitOf(f) * 100)} % av Johansen-delen (EC5 8.2.2(2)).</p>
    ${foot(2, tot)}
  </section>`;

  const page3 = `<section class="page">
    <h2>4 Kapasitet for forbindelsen og kontroll</h2>
    <table class="trace-t"><thead><tr><th>Størrelse</th><th>Formel</th><th>Innsatte verdier</th><th class="num">Verdi</th><th>Referanse</th></tr></thead><tbody>
    ${r.trace.filter((s) => ['nef', 'nef0', 'kef', 'nef_tot', 'RkTot'].includes(s.id)).map((s) => `<tr><td>${esc(s.title)}</td><td>${esc(s.formula)}</td><td>${esc(s.subs)}</td><td class="num">${fmtVal(s.value)} ${esc(s.unit)}</td><td>${esc(s.ref)}</td></tr>`).join('')}
    <tr><td>Dimensjonerende kapasitet</td><td>F_v,Rd = k_mod·F_v,Rk,tot/γ_M</td><td>${n2(w.dc.kmod)}·${n0(r.RkTot)}/${r.gammaM}</td><td class="num">${n0(w.dc.Rd)} N</td><td>EC5 lign. (2.17), ${esc(KMOD_REF)}</td></tr>
    </tbody></table>
    <table><thead><tr><th>Nr</th><th>Kombinasjon</th><th class="num">F_d [kN]</th><th class="num">F_v,Rd [kN]</th><th class="num">Utnyttelse</th><th>Status</th></tr></thead><tbody>
    ${R.cases.map((k) => `<tr class="${k === w ? 'gov' : ''}"><td>${k.combo.id}</td><td>${esc(k.combo.label)}</td><td class="num">${n1(k.combo.F)}</td><td class="num">${n1(k.dc.Rd / 1000)}</td><td class="num">${pct(k.util)}</td><td>${k.util <= 1 ? 'OK' : 'IKKE OK'}</td></tr>`).join('')}
    </tbody></table>
    <h3>Minsteavstander (${esc(r.spacing.ref)})</h3>
    <table><thead><tr><th>Avstand</th><th class="num">Minste [mm]</th><th class="num">Valgt [mm]</th><th>Status</th></tr></thead><tbody>
    ${r.spacingCheck.map((c) => `<tr><td>${esc(c.label)}</td><td class="num">${c.na ? '–' : n1(c.min)}</td><td class="num">${c.actual}</td><td>${c.na ? 'ikke aktuell' : c.ok ? 'OK' : 'IKKE OK'}</td></tr>`).join('')}
    </tbody></table>
    ${w.split.length ? `<h3>Oppsprekking på tvers av fiberretningen (EC5 8.1.4)</h3><table><thead><tr><th>Del</th><th>Formel</th><th class="num">F₉₀,Rk [kN]</th><th class="num">F₉₀,Rd [kN]</th><th class="num">F₉₀,Ed [kN]</th><th class="num">Utnyttelse</th></tr></thead><tbody>${w.split.map((s) => `<tr><td>${s.tag}</td><td>14·b·w·√(h_e/(1−h_e/h)), h_e = ${s.he}, h = ${s.h}</td><td class="num">${n1(s.F90Rk / 1000)}</td><td class="num">${n1(s.F90Rd / 1000)}</td><td class="num">${n1(s.F90Ed / 1000)}</td><td class="num">${pct(s.util)} ${s.util <= 1 ? 'OK' : 'IKKE OK'}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3>Stivhet (informasjon)</h3>
    <p>K_ser = ${n0(r.Kser)} N/mm per festemiddel og snitt (EC5 tabell 7.1); K_ser,tot = ${n0(r.KserTot)} N/mm; K_u = ${n0(r.Ku)} N/mm (lign. (2.1)). Karakteristisk kombinasjon F = ${n1(R.sls.F)} kN gir forskyvning ≈ ${n2(R.slip)} mm.</p>
    ${R.errors.length || R.warnings.length ? `<h3>Merknader</h3><ul>${R.errors.map((e) => `<li><b>Feil:</b> ${esc(e.text)} [${esc(e.ref)}]</li>`).join('')}${R.warnings.map((e) => `<li>${esc(e.text)} [${esc(e.ref)}]</li>`).join('')}</ul>` : ''}
    <h3>Forutsetninger</h3>
    <ul>
      <li>Kraften antas å virke i forbindelsens plan og fordeles likt på festemidlene; eksentrisitet/moment i knutepunktet er ikke inkludert.</li>
      <li>Alle egenlaster er behandlet som ugunstige (γ_G,sup). Gunstig egenlast (γ_G,inf = 1,0) er ikke vurdert.</li>
      <li>Skruers spiss antas lik 1·d og trekkes fra effektiv gjengelengde. f_head,k = 10,5 N/mm² der ikke annet er oppgitt.</li>
      <li>Verdier for festemiddel uten oppgitt ETA er typiske og skal erstattes med produsentens dokumentasjon.</li>
      <li>Blokkskjær (EC5 tillegg A), stålplatens kapasitet (NS-EN 1993-1-8) og kombinert aksial-/skjærkraft (8.7.3) er ikke kontrollert i denne versjonen.</li>
    </ul>
    <h3>Referanser</h3>
    <ol class="refs">${REFERENCES.map(([k, t]) => `<li>[${k}] ${esc(t)}</li>`).join('')}</ol>
    <div class="sign"><div>Utført: ${esc(state.project.author || '')}</div><div>Kontrollert:</div></div>
    ${foot(3, tot)}
  </section>`;

  return `<div class="print-foot"><span>${esc(state.project.name || 'Knutepunktberegning')} · ${esc(state.project.part || '')}</span><span>Knutepunkt v0.1 · NS-EN 1995-1-1 · ${esc(date)}</span></div>` + page1 + page2 + page3;
}

function jref(r) { return r.trace.find((s) => s.id === 'FvRk')?.ref || ''; }
function ropeLimitOf(f) { return { nail: 0.15, screw: 1.0, bolt: 0.25, dowel: 0 }[f.type]; }
export { GAMMA_M };
