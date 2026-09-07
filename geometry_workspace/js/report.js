/**
 * report.js — dokumentasjonsrapporten for Geometry Workspace.
 *
 * Bygger et A4-dokument fra `computeReinforcement(state)` og `analyze()`.
 * Side 1 er oppgaven på ett blikk: tegningen, materialdata per del, lastene,
 * virkningen av forsterkningen, og skjøtekreftene. Side 2 og utover er den
 * fullstendige beregningen (bølge D).
 *
 * SIDE 1 SIN REKKEFØLGE ER IKKE TILFELDIG
 * Figuren står FØRST, før alt annet, fordi et tverrsnitt er det leseren må se
 * for å forstå resten. Det er også derfor siden ikke har noen <h1>: figuren ER
 * tittelen, og en overskrift over den ville bare skjøvet den nedover.
 *
 * KOBLINGEN FIGUR ↔ TABELL
 * Skjøtene nummereres ETT sted — `jointLabels()` under — og den samme lista
 * sendes både til figuren og til skjøtetabellen. Det er dette som gjør at
 * «J2» i tabellen alltid er den samme linja som «J2» i tegningen. Nummererte
 * man dem hver for seg, ville de kunne komme i utakt uten at noe varslet, og
 * en rapport der merkelappene lyver er verre enn ingen rapport.
 *
 * FARGEPRØVEN
 * Deletabellens fargeprøve er den andre koblingen mellom tabell og tegning, og
 * den er grunnen til at `print.css` gir `.swatch` eksplisitt bakgrunn: den ene
 * fargeflaten i rapporten som bærer informasjon i seg selv.
 *
 * UTSKRIFT
 * Rapporten bygges PÅ FORESPØRSEL, når overlegget åpnes eller ved
 * `beforeprint` — aldri i `scheduleRender()`-løkka i `main.js`. Den er for tung
 * til å bygges på hver store-oppdatering, og ingenting ved den trenger å være
 * ferskt før noen faktisk ser på den.
 */

import { computeReinforcement, n, q, sci } from './reinforcement-ui.js';
import { buildFigureSvg } from './report-figure.js';
import { materialByName } from './materials.js';

/* ------------------------------------------------------------------ *
 * Formatering
 * ------------------------------------------------------------------ */

function esc(s) {
  return String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/** Tall til en tabellcelle. `null`/NaN blir en tankestrek, ikke «NaN». */
function cell(v, dec = 2) {
  return Number.isFinite(v) ? n(v, dec) : '–';
}

/** Prosent med fortegn, til endringskolonnen. */
function delta(v, dec = 1) {
  if (!Number.isFinite(v)) return '–';
  const s = v > 0 ? '+' : '';
  return `${s}${n(v, dec)} %`;
}

function today() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/* ------------------------------------------------------------------ *
 * Overflytsreglene (§4.1)
 *
 * Faste tall, ikke måling — de er faste NETTOPP fordi de skal kunne testes;
 * en måling ville gitt et svar som varierte med nettleser og skriftvalg.
 *
 * MEN de er valgt ETTER måling, ikke før. Målt i Chrome, med figuren på 72 mm:
 *
 *     2 deler / 1 skjøt   221 mm    holder, 38 mm slakk
 *     3 deler / 2 skjøter 235 mm    holder, 24 mm slakk
 *     4 deler / 3 skjøter 249 mm    holder, 10 mm slakk
 *     5 deler / 4 skjøter 263 mm    over med  4 mm
 *     6 deler / 5 skjøter 277 mm    over med 18 mm
 *
 * altså ca. 14 mm per ekstra del+skjøt-par. En bjelke med opptil tre påforinger
 * — som dekker de fleste virkelige forsterkningene — får plass på én side. Det ærlige svaret er derfor at
 * side 1 er ÉN side for små modeller, ikke for enhver modell. Det opprinnelige
 * målet («nøyaktig én side for enhver modell verktøyet aksepterer») lot seg
 * ikke forene med innholdet brukeren har bedt om, og å nå det ville krevd å
 * fjerne tall han faktisk trenger.
 *
 * Grensene under er derfor IKKE satt for å garantere én side — det klarer de
 * ikke. De er satt for at en lang liste ikke skal skyve resten av oppslaget
 * vekk fra første side. Renner side 1 over, blir rapporten to sider, som er
 * helt i orden: innholdet er det samme og står i samme rekkefølge. `audit()`
 * sier fra, og forteller hvor mange millimeter det står på.
 * ------------------------------------------------------------------ */

const MAX_PART_ROWS = 6;
const MAX_JOINT_ROWS = 6;

/**
 * Klipper en liste til `max` rader. Ved overflyt vises `max - 1` rader, og
 * den siste raden er en henvisning — aldri en avkortet liste uten at det
 * står at den er avkortet.
 */
function clip(list, max) {
  if (list.length <= max) return { rows: list, hidden: 0 };
  return { rows: list.slice(0, max - 1), hidden: list.length - (max - 1) };
}

/* ------------------------------------------------------------------ *
 * Skjøtemerkingen — ETT sted (se toppkommentaren)
 * ------------------------------------------------------------------ */

/**
 * @returns {Map<string, string>} skjøte-id → «J1», «J2», …
 */
export function jointLabels(res) {
  const m = new Map();
  (res && res.joints ? res.joints : []).forEach((jt, i) => m.set(jt.id, `J${i + 1}`));
  return m;
}

/**
 * Typen skjøt, som tekst. Avledet av nøyaktig de samme feltene som avgjør om
 * skjøten har en «før»-tilstand, slik at tabellens venstre og høyre halvdel
 * ikke kan komme i utakt.
 */
function jointType(jt) {
  if (!jt.hasNeighbor) return { text: 'treffer ingen former', cls: 'warn' };
  if (jt.existingOnly) return { text: 'eksisterende ↔ eksisterende', cls: '' };
  return { text: 'mot ny del', cls: '' };
}

const CONNECTOR_SHORT = { screw: 'Skruer', glue: 'Lim', weld: 'Sveis' };

/* ------------------------------------------------------------------ *
 * Side 1
 * ------------------------------------------------------------------ */

function headBlock(state) {
  const title = (state.title || '').trim() || 'Geometri-workspace';
  return `<div class="print-head">
    <b>${esc(title)}</b>
    <span>Tverrsnitt og skjøtekrefter · NS-EN 1995-1-1 · ${today()}</span>
  </div>`;
}

function figureBlock(state, analysis, res) {
  const labels = jointLabels(res);
  const svg = buildFigureSvg({
    unit: state.unit || 'mm',
    mode: state.mode,
    shapes: state.shapes || [],
    joints: state.joints || [],
    reference: state.reference || null,
    analysis,
    res,
    jointLabels: labels,
  });
  return `<figure class="atomic report-figure-wrap">${svg}</figure>`;
}

/**
 * Deletabellen — materialdata per del.
 *
 * `E` og `ρ_m` er de to tallene som avgjør henholdsvis kraftfordelingen og
 * festemiddelstivheten. Står de ikke i rapporten, kan ingen etterprøve den.
 * Summeringsraden er hele poenget: den sier på én linje hvor stor
 * forsterkningen faktisk er.
 */
function partsBlock(state, res) {
  const parts = res.parts || [];
  if (!parts.length) {
    return `<section class="atomic"><h3>Deler og materialdata</h3>
      <p class="muted">Ingen former i modellen.</p></section>`;
  }

  const shapeById = new Map((state.shapes || []).map((s) => [s.id, s]));
  const rowsAll = parts.map((p) => {
    const shape = shapeById.get(p.id) || {};
    const mat = shape.material || {};
    const preset = materialByName(mat.name || '');
    // Presetets etikett når navnet treffer et preset, ellers navnet slik det
    // står — et håndredigert materialnavn skal vises som brukeren skrev det.
    const label = preset ? preset.label : (mat.name || '–');
    const rho = Number.isFinite(mat.rho) && mat.rho > 0
      ? mat.rho
      : (preset && Number.isFinite(preset.rho) ? preset.rho : null);
    return { p, label, rho, A: p.props ? p.props.A : NaN };
  });

  // ρ_m-kolonnen vises bare når minst én del har en verdi. En tom kolonne i en
  // stålrapport er støy; i en trerapport er den nødvendig.
  const anyRho = rowsAll.some((r) => Number.isFinite(r.rho));
  const EAtot = res.section && Number.isFinite(res.section.EA) ? res.section.EA : 0;
  const Atot = rowsAll.reduce((s, r) => s + (Number.isFinite(r.A) ? r.A : 0), 0);
  const EAnew = parts.filter((p) => p.stage === 'new').reduce((s, p) => s + p.EA, 0);
  const newPct = EAtot > 0 ? (EAnew / EAtot) * 100 : 0;

  const { rows, hidden } = clip(rowsAll, MAX_PART_ROWS);

  const body = rows
    .map(({ p, label, rho, A }) => {
      const share = EAtot > 0 ? (p.EA / EAtot) * 100 : NaN;
      const stage = p.stage === 'new'
        ? '<b>Ny</b>'
        : 'Eksisterende';
      return `<tr>
        <td><span class="swatch" style="background:${esc(p.color)}"></span></td>
        <td>${esc(p.name)}</td>
        <td>${stage}</td>
        <td>${esc(label)}</td>
        <td class="num">${cell(p.E, 0)}</td>
        ${anyRho ? `<td class="num">${Number.isFinite(rho) ? cell(rho, 0) : '–'}</td>` : ''}
        <td class="num">${cell(A, 0)}</td>
        <td class="num">${sci(p.EA)}</td>
        <td class="num">${cell(share, 1)} %</td>
      </tr>`;
    })
    .join('');

  const more = hidden
    ? `<tr><td colspan="${anyRho ? 9 : 8}" class="muted">… og ${hidden} flere deler — se side 2</td></tr>`
    : '';

  return `<section class="keep-with-next">
    <h3>Deler og materialdata</h3>
    <table>
      <thead><tr>
        <th></th><th>Del</th><th>Tilstand</th><th>Materiale</th>
        <th class="num">E [N/mm²]</th>
        ${anyRho ? '<th class="num">ρ_m [kg/m³]</th>' : ''}
        <th class="num">A [mm²]</th><th class="num">EA [N]</th><th class="num">Andel</th>
      </tr></thead>
      <tbody>${body}${more}</tbody>
      <tfoot><tr>
        <td colspan="${anyRho ? 6 : 5}"><b>Sum</b></td>
        <td class="num"><b>${cell(Atot, 0)}</b></td>
        <td class="num"><b>${sci(EAtot)}</b></td>
        <td class="num"><b>${res.allExisting ? '–' : `herav ny: ${n(newPct, 1)} %`}</b></td>
      </tr></tfoot>
    </table>
  </section>`;
}

/**
 * Lasttabellen. Rekkefølgen N → V → M er den samme som feltene i
 * «Forsterkning»-fanen, slik at man kan lese av skjermen og kontrollere
 * rapporten linje for linje uten å lete.
 */
function loadsBlock(res) {
  const L = res.loads.before;
  const A = res.loads.after;
  const rows = [
    ['N', 'kN', L.N_kN, A.N_kN],
    ['V_y', 'kN', L.Vy_kN, A.Vy_kN],
    ['V_x', 'kN', L.Vx_kN, A.Vx_kN],
    ['M_x', 'kNm', L.Mx_kNm, A.Mx_kNm],
    ['M_y', 'kNm', L.My_kNm, A.My_kNm],
  ];

  const body = rows
    .map(
      ([sym, unit, b, a]) => `<tr>
        <td class="font-mono">${sym}</td><td>[${unit}]</td>
        <td class="num">${cell(b)}</td>
        ${res.allExisting ? '' : `<td class="num">${cell(a)}</td>`}
      </tr>`
    )
    .join('');

  // Forklaringen på superposisjonen hører hjemme i beregningsdelen. Side 1 har
  // 259 mm, og hver setning her fortrenger en tabellrad — så her står bare
  // konklusjonen, og begrunnelsen står på side 2 der den kan få plassen den
  // trenger. (Det er også der en kontrollør leter etter den.)
  const note = res.allExisting
    ? `<p class="muted">Alle former er eksisterende — en kontroll av dagens konstruksjon.</p>`
    : `<p class="muted"><span class="font-mono">q_V,tot = |q_før| + |q_etter|</span>
       — de to tilstandene superponeres.</p>`;

  return `<section class="keep-with-next">
    <h3>Laster</h3>
    <table>
      <thead><tr>
        <th></th><th></th>
        <th class="num">Før forsterkning<br><span class="muted">på eksisterende alene</span></th>
        ${res.allExisting ? '' : '<th class="num">Etter forsterkning<br><span class="muted">tillegg på sammensatt</span></th>'}
      </tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p><span class="font-mono">L = ${cell(res.loads.L, 0)} mm</span> forankringslengde.</p>
    ${note}
  </section>`;
}

/**
 * Virkningen av forsterkningen, kondensert. Utledningen står på side 2; her er
 * bare tallene, fordi det er dette man vil kunne legge fram.
 */
function effectBlock(res) {
  if (res.allExisting) return '';
  const c = res.comparison;
  const ax = res.axes;
  if (!c || !ax) return '';

  const r = (label, v0, v1, dPct, dec = 2) => `<tr>
    <td>${label}</td>
    <td class="num">${cell(v0, dec)}</td>
    <td class="num">${cell(v1, dec)}</td>
    <td class="num">${dPct === null ? '–' : delta(dPct)}</td>
  </tr>`;

  const pctOf = (v0, v1) => (Number.isFinite(v0) && v0 !== 0 ? ((v1 - v0) / v0) * 100 : null);

  // Skjevbøyning er den virkningen som er lettest å overse, fordi den ikke
  // vises i noe enkelttall man er vant til å se etter. Derfor står den som
  // egen tekst under tabellen, ikke bare som en θ-rad i den.
  let skew = '';
  if (ax.introducedSkew) {
    const pct = ax.lateralPercent;
    skew = `<p class="warn"><b>Forsterkningen innfører skjev bøyning.</b> Tverrsnittet
      var tilnærmet symmetrisk før, men er det ikke etter: hovedaksene er dreid
      ${n(Math.abs(ax.dThetaDeg), 2)}° i forhold til x og y.
      ${Number.isFinite(pct)
        ? `En last i y-retning gir nå også en sidevegs nedbøyning på
           ${n(Math.abs(pct), 1)} % av den loddrette.`
        : ''}
      Det betyr at bjelken vil bevege seg sidelengs under en rent loddrett last.</p>`;
  }

  return `<section class="keep-with-next">
    <h3>Effekt av forsterkningen</h3>
    <table>
      <thead><tr>
        <th></th><th class="num">Eksisterende</th>
        <th class="num">Sammensatt</th><th class="num">Endring</th>
      </tr></thead>
      <tbody>
        ${r('EA [N]', c.EA0, c.EA1, pctOf(c.EA0, c.EA1))}
        ${r('EI_x [Nmm²]', c.EIx0, c.EIx1, pctOf(c.EIx0, c.EIx1))}
        ${r('EI_y [Nmm²]', c.EIy0, c.EIy1, pctOf(c.EIy0, c.EIy1))}
        ${r('y_c [mm]', ax.before.yc, ax.after.yc, null)}
        ${r('x_c [mm]', ax.before.xc, ax.after.xc, null)}
        ${r('θ [°]', ax.before.thetaDeg, ax.after.thetaDeg, null)}
      </tbody>
    </table>
    <p class="muted">Tyngdepunktet flyttet seg
      <span class="font-mono">Δy_c = ${cell(ax.dyc)} mm</span>,
      <span class="font-mono">Δx_c = ${cell(ax.dxc)} mm</span>.</p>
    ${skew}
  </section>`;
}

/**
 * Skjøtekreftene — tallene brukeren tar med videre til festemiddelberegningen.
 * Dette er rapportens formål; alt over er kontekst for denne tabellen.
 */
function jointsBlock(res) {
  const labels = jointLabels(res);
  const all = res.joints || [];
  if (!all.length) {
    return `<section class="atomic"><h3>Skjøtekrefter</h3>
      <p class="muted">Ingen skjøter definert.</p></section>`;
  }

  const { rows, hidden } = clip(all, MAX_JOINT_ROWS);
  const ae = res.allExisting;

  const body = rows
    .map((jt) => {
      const t = jointType(jt);
      const conn = CONNECTOR_SHORT[(jt.connector || {}).kind] || '–';
      const sides = `${jt.aNames.join(', ') || '–'} ↔ ${jt.bNames.join(', ') || '–'}`;
      return `<tr>
        <td class="font-mono"><b>${labels.get(jt.id)}</b></td>
        <td>${esc(jt.name)}<br><span class="muted">${esc(sides)}</span></td>
        <td class="${t.cls}">${t.text}</td>
        <td>${conn}</td>
        <td class="num">${cell(jt.b, 0)}</td>
        <td class="num">${cell(jt.qBefore)}</td>
        ${ae ? '' : `<td class="num">${cell(jt.qAfter)}</td><td class="num">${cell(jt.qN)}</td>`}
        <td class="num"><b>${cell(jt.qTot)}</b></td>
        <td class="num">${cell(jt.tau, 3)}</td>
      </tr>`;
    })
    .join('');

  const cols = ae ? 8 : 10;
  const more = hidden
    ? `<tr><td colspan="${cols}" class="muted">… og ${hidden} flere skjøter — se «Per skjøt», side 2</td></tr>`
    : '';

  // Fotnoten står bare når den er relevant. En generell forklaring på noe som
  // ikke forekommer i denne modellen er bare noe å lese forbi.
  const anyNew = all.some((jt) => jt.hasNeighbor && !jt.existingOnly);
  const foot = anyNew
    ? ` En skjøt <b>mot ny del</b> har ingen «før»-tilstand — den nye delen fantes
       ikke da, så <span class="font-mono">V_før</span> gir ingen skjærstrøm der.`
    : '';

  return `<section class="keep-with-next">
    <h3>Skjøtekrefter</h3>
    <table>
      <thead><tr>
        <th>#</th><th>Skjøt</th><th>Type</th><th>Forbindelse</th>
        <th class="num">b [mm]</th>
        <th class="num">q_før</th>
        ${ae ? '' : '<th class="num">q_etter</th><th class="num">q_N</th>'}
        <th class="num">q_tot [N/mm]</th>
        <th class="num">τ [N/mm²]</th>
      </tr></thead>
      <tbody>${body}${more}</tbody>
    </table>
    <p class="muted">Merkingen <span class="font-mono">J1</span>,
      <span class="font-mono">J2</span> … er den samme i tegningen øverst.${foot}</p>
  </section>`;
}

/**
 * Avgrensningen. NORMATIV — se §5.4 i planen.
 *
 * Denne står der fordi det er den vanligste måten et beregningsverktøy blir
 * misbrukt på: noen leser «q_tot = 250 N/mm» som om det var en ferdig
 * forbindelse. Rapporten skal si hva den ikke svarer på, ikke bare la være å
 * svare på det.
 */
function scopeBlock() {
  return `<section class="atomic scope-note">
    <p><b>Verktøyet sier hvor sterk forbindelsen må være, ikke hvordan den skal
      utføres.</b> Festemiddel, kant- og senteravstander og de materialspesifikke
      kontrollene hører hjemme i andre verktøy — tallene over er <b>inndata</b> til
      den jobben.</p>
  </section>`;
}

/**
 * To blokker side om side.
 *
 * Lastene og «Effekt av forsterkningen» er begge smale (4 kolonner) og brukte
 * hver sin halvdel av de 174 mm. Stablet kostet de 137 mm av side 1 sine 259;
 * side om side koster de 71. Det var forskjellen på at siden fikk plass og
 * ikke — og to tabeller man leser mot hverandre hører uansett hjemme ved siden
 * av hverandre.
 *
 * Er den ene tom (ren-eksisterende-modus har ingen «effekt»), faller
 * to-kolonnen bort og den andre får full bredde. En tom kolonne ville bare
 * vært et hull.
 */
function twoCol(a, b) {
  if (!a || !a.trim()) return b || '';
  if (!b || !b.trim()) return a;
  return `<div class="two-col atomic">${a}${b}</div>`;
}

/* ------------------------------------------------------------------ *
 * Dokumentet
 * ------------------------------------------------------------------ */

/**
 * Bygger hele rapporten som en HTML-streng, klar til å legges i
 * `.report-content`.
 *
 * @param {Object} state      store-tilstanden
 * @param {Object} analysis   resultatet av `analyze(state.shapes, state.mode)`
 * @returns {string}
 */
export function buildReportHtml(state, analysis) {
  const res = computeReinforcement(state);
  if (!res) {
    return `${headBlock(state || {})}<p class="muted">Ingen modell å rapportere.</p>`;
  }

  const page1 = [
    headBlock(state),
    figureBlock(state, analysis, res),
    partsBlock(state, res),
    twoCol(loadsBlock(res), effectBlock(res)),
    jointsBlock(res),
    scopeBlock(),
  ].join('\n');

  // Side 2 fylles i bølge D. Stubben står med vilje synlig i stedet for å
  // utelates: en rapport som stille mangler beregningsdelen ser ferdig ut.
  const page2 = `<section class="page-2">
    <h2>Beregning</h2>
    <p class="muted">Den fullstendige utregningen kommer i neste versjon av rapporten.
      Inntil da står tallene i «Forsterkning»-fanen med full utledning.</p>
  </section>`;

  return `<section class="page-1">${page1}</section>\n${page2}`;
}

/* ------------------------------------------------------------------ *
 * Utskriftsriggen
 * ------------------------------------------------------------------ */

const PRINT_ROOT_ID = 'gwPrintRoot';

/**
 * Kloner rapporten inn i `#gwPrintRoot`, som er et direkte barn av <body>.
 *
 * KLONE, ikke flytte: avbrytes utskriften, skal skjermvisningen stå urørt.
 * Det er også grunnen til at `clearPrintStage()` bare tømmer roten og aldri
 * rører overlegget.
 */
export function stageReportForPrint() {
  const root = document.getElementById(PRINT_ROOT_ID);
  const content = document.querySelector('#report-overlay .report-content');
  if (!root || !content) return false;
  root.innerHTML = '';
  const clone = content.cloneNode(true);
  clone.removeAttribute('data-page-guides');   // sidegrensene er en skjermting
  root.appendChild(clone);
  root.hidden = false;
  return true;
}

export function clearPrintStage() {
  const root = document.getElementById(PRINT_ROOT_ID);
  if (!root) return;
  root.innerHTML = '';
  root.hidden = true;
}

/* ------------------------------------------------------------------ *
 * audit() — måling i siden
 * ------------------------------------------------------------------ */

/**
 * Måler om noe kommer til å splittes over et sideskift.
 *
 * TO FEILTYPER, MED HELT ULIK STATUS:
 *
 *  - `oversize`: blokken er høyere enn én A4-side. Den KOMMER til å splittes
 *    uansett hva CSS sier, fordi ingen utskriftsmotor kan gjøre noe annet.
 *    Dette er den eneste sjekken som er 100 % sann uavhengig av motoren, og
 *    den viktigste. Godkjent = tom.
 *
 *  - `straddle`: under antakelsen om kontinuerlig flyt ville blokken krysset
 *    et sideskift. En ekte utskriftsmotor skyver den ned i stedet, så dette er
 *    en INDIKASJON på at margene er trange — ikke en feil. Rapporteres som
 *    advarsel, og skal ikke behandles som noe å «fikse».
 *
 * Piksler per mm KALIBRERES ved å måle et element på 100 mm. Å anta 96 dpi
 * ville gitt feil svar ved zoom og på HiDPI-skjermer, og feilen ville vært
 * usynlig — tallene ser rimelige ut uansett.
 *
 * @param {{mark?: boolean}} [opts]
 */
export function audit(opts = {}) {
  const content = document.querySelector('#report-overlay .report-content');
  if (!content) return { error: 'Rapporten er ikke bygget.' };

  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;height:100mm;width:1px;';
  content.appendChild(probe);
  const pxPerMm = probe.getBoundingClientRect().height / 100;
  probe.remove();

  const PAGE_MM = 259;
  const pageH = PAGE_MM * pxPerMm;
  const base = content.getBoundingClientRect().top;

  const oversize = [];
  const straddle = [];
  const blocks = [...content.querySelectorAll('.atomic, table, figure, .keep-with-next')];

  blocks.forEach((el) => {
    const r = el.getBoundingClientRect();
    const top = r.top - base;
    const bottom = r.bottom - base;
    const h = bottom - top;
    const label = (el.tagName + '.' + (el.className || '')).slice(0, 60);
    if (h > pageH) {
      oversize.push({ el, label, heightMm: h / pxPerMm });
      if (opts.mark) el.style.outline = '2px solid #ef4444';
    } else if (Math.floor(top / pageH) !== Math.floor((bottom - 0.5) / pageH)) {
      straddle.push({ el, label, topMm: top / pxPerMm, bottomMm: bottom / pxPerMm });
    }
  });

  const p1 = content.querySelector('.page-1');
  const page1Mm = p1 ? p1.getBoundingClientRect().height / pxPerMm : null;

  return {
    pxPerMm,
    pageHeightMm: PAGE_MM,
    blocks: blocks.length,
    oversize,
    straddle,
    page1Mm,
    // M1: side 1 skal være nøyaktig én side.
    page1Ok: page1Mm === null ? null : page1Mm <= PAGE_MM,
  };
}
