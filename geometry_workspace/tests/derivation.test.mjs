/**
 * derivation.test.mjs — fasit for `derivationModel(res)` i `js/derivation.js`.
 *
 *   node geometry_workspace/tests/derivation.test.mjs
 *
 * Ingen avhengigheter. Exit-kode 0 når alt består, 1 ellers.
 *
 * Dekker §8.4 i `global-devspecs/geometry_workspace-report-plan.md`:
 *  - gruppene kommer i fast rekkefølge, for `allExisting` og for forsterket
 *  - hver post har ikke-tomme `{sym, formula, subst, result}`
 *  - REGRESJONSTESTEN PÅ §5.3: kraftdelen i hver skjøtegruppe har nøyaktig
 *    postene `q_før`, `q_etter`, `q_V,tot`, `q_N`, `q_tot` — aldri en sjette
 *    post «fra M» eller «q_M» — og `q_tot`-postens formel er nøyaktig
 *    `q_tot = q_V,tot + q_N`
 *
 * HVORFOR DEN SISTE TESTEN FINNES (§5.3, normativ):
 * Momentet gir IKKE et eget bidrag til skjærstrømmen. Skjærstrømmen er
 * `q = dN/dz = V · ES* / EI`, og det ER momentets virkning, sett fra
 * skjærkraftsiden — `N_G = M · ES* / EI` er den samme kraften sett fra den
 * andre siden. Legger noen til en «q_M»-post, telles den samme kraften to
 * ganger, og skjøten blir overdimensjonert uten at noen ser hvorfor. `N_G`
 * hører derfor hjemme i FORANKRINGSdelen, som et uavhengig krav til hva som
 * må innføres over `L` — aldri som et ledd i `q_tot`. Denne testen skal feile
 * hvis noen legger til en sjette post.
 *
 * FIKSTURENE ER HÅNDLAGDE. `derivationModel()` er en ren funksjon av
 * resultatobjektet fra `computeReinforcement()`, og testen bygger det objektet
 * for hånd i stedet for å kjøre hele geometri- og mekanikkjeden. Det gjør
 * testen uavhengig av `polygon-clipping` (som bare finnes i nettleseren), og
 * det gjør hver forventet streng etterprøvbar uten å regne på polygoner.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/* ------------------------------------------------------------------ *
 * Modullasting — samme data-URL-triks som de tre andre testfilene.
 * `derivation.js` importerer med vilje ingenting, så ingen omskriving av
 * relative specifiers trengs.
 * ------------------------------------------------------------------ */

async function loadModule(relPath) {
  const url = new URL(relPath, import.meta.url);
  const src = await readFile(fileURLToPath(url), 'utf8');
  return import('data:text/javascript;charset=utf-8;base64,' + Buffer.from(src, 'utf8').toString('base64'));
}

const dv = await loadModule('../js/derivation.js');
const { derivationModel, DERIVATION_ASSUMPTIONS, n, q, pct, sci } = dv;

/* ------------------------------------------------------------------ *
 * Minimal testløper — identisk med den i de tre andre testfilene
 * ------------------------------------------------------------------ */

const tests = [];
let lines = [];
let failedInCurrent = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function deviation(actual, expected) {
  const d = Math.abs(actual - expected);
  return Math.abs(expected) > 1e-12 ? d / Math.abs(expected) : d;
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  return a >= 1e6 || a < 1e-3 ? v.toExponential(6) : v.toFixed(6);
}

/** Tallsjekk mot fasit. `tol` er relativt avvik. */
function close(label, actual, expected, tol = 1e-9) {
  const dev = deviation(actual, expected);
  const okNow = Number.isFinite(actual) && dev <= tol;
  if (!okNow) failedInCurrent++;
  lines.push(
    `      ${okNow ? 'ok  ' : 'FEIL'} ${label.padEnd(38)} = ${fmt(actual).padStart(15)}` +
    `  (fasit ${fmt(expected)}, avvik ${dev.toExponential(1)})`
  );
}

/** Sannhetssjekk for det som ikke er tall. */
function ok(label, cond, note = '') {
  if (!cond) failedInCurrent++;
  lines.push(`      ${cond ? 'ok  ' : 'FEIL'} ${label}${note ? '  (' + note + ')' : ''}`);
}

/** Strengsjekk med begge sider skrevet ut, slik at et avvik kan leses direkte. */
function eq(label, actual, expected) {
  const okNow = actual === expected;
  if (!okNow) failedInCurrent++;
  lines.push(
    `      ${okNow ? 'ok  ' : 'FEIL'} ${label}` +
    (okNow ? `  = «${actual}»` : `\n           fikk    «${actual}»\n           ventet  «${expected}»`)
  );
}

/** Mengdesammenligning, rekkefølgeuavhengig, med begge mengder skrevet ut. */
function sameSet(label, actual, expected) {
  const a = [...new Set(actual)].sort();
  const b = [...new Set(expected)].sort();
  const okNow = a.length === b.length && a.every((v, i) => v === b[i]);
  if (!okNow) failedInCurrent++;
  lines.push(
    `      ${okNow ? 'ok  ' : 'FEIL'} ${label}` +
    (okNow ? `  = {${a.join(', ')}}` : `\n           fikk    {${a.join(', ')}}\n           ventet  {${b.join(', ')}}`)
  );
}

/* ------------------------------------------------------------------ *
 * Hjelpere for fiksturene
 * ------------------------------------------------------------------ */

/**
 * Symbolet en post «egentlig» heter. Flere poster bærer en kort utledning i
 * selve symbolet (`q_før = q_y + q_x`), fordi den formen står i panelet i
 * dag. §5.3-sjekken gjelder hvilke STØRRELSER som finnes, ikke hvordan de er
 * skrevet, så alt fra og med det første likhetstegnet klippes bort.
 */
const leadSym = (s) => String(s.sym).split('=')[0].trim();

const partsOf = (group, part) => group.steps.filter((s) => s.part === part);
const symsOf = (group, part) => partsOf(group, part).map(leadSym);

/**
 * Et komplett `computeReinforcement()`-resultat, håndlagd.
 *
 * Tallene er valgt slik at hver formatert streng kan kontrolleres i hodet:
 *   q_før  = 12,50   q_etter = 30,25   ⟹  q_V,tot = 42,75 N/mm
 *   q_N    =  7,25                     ⟹  q_tot   = 50,00 N/mm
 *   ΔN_i   = 8 700 N                   ⟹  8,70 kN
 * Ingen av dem trenger tusenskille i en post testen sammenligner som streng —
 * tusenskille i nb-NO er et hardt mellomrom, og det ville gjort testen
 * avhengig av hvilken ICU-versjon noden er bygd med.
 */
function makeRes(opts = {}) {
  const allExisting = !!opts.allExisting;
  const section = { EA: 2.2e6, ESx: 3.3e8, ESy: 0, xc: 0, yc: 150, EIx0: 5.5e12, EIx: 4.5e12 };
  const existingSection = { EA: 1.8e6, ESx: 1.8e8, ESy: 0, xc: 0, yc: 100, EIx0: 3.0e12, EIx: 2.2e12 };
  const flow = (qy, qx, coupled) => ({ ESx: 6.6e9, ESy: 0, qy, qx, coupled: !!coupled, valid: true, qAbs: qy + qx });

  const joint = (o = {}) => ({
    id: o.id || 'j1',
    name: o.name || 'Skjøt A',
    flowBefore: o.noBefore ? null : flow(12.5, 0, false),
    flowAfter: allExisting ? null : flow(30.25, 0, false),
    qBefore: o.noBefore ? 0 : 12.5,
    qAfter: allExisting ? 0 : 30.25,
    qVtot: allExisting ? 12.5 : (o.noBefore ? 0 : 12.5) + 30.25,
    qN: allExisting ? 0 : 7.25,
    qTot: allExisting ? 12.5 : (o.noBefore ? 0 : 12.5) + 30.25 + 7.25,
    dN: allExisting ? 0 : 8700,
    shareApplied: o.shareApplied != null ? o.shareApplied : null,
    b: 120,
    tau: 0.4,
    EA_group: 4.0e5,
    EA_other: 1.8e6,
    kConn: 45.5,
    connector: Object.assign(
      { kind: 'screw', rows: 2, spacing: 100, FRd: 5, Kser: 3000, tauRd: 2, Ga: 700, ta: 2, nWelds: 2, a_weld: 4, fvwd: 207, qRd: null },
      o.connector || {}
    ),
    check: Object.assign({ sReq: 200, util: 0.5, qRd: 1656, tau: 0.4 }, o.check || {}),
    slip: o.slip === undefined ? { source: 'ec5', valid: true, K: 2278, state: 'SLS' } : o.slip,
    volkersen: o.volkersen === undefined ? { valid: true, lambda: 0.0021, qMax: 61.2, peakFactor: 1.34 } : o.volkersen,
    anchorReq:
      o.anchorReq === undefined
        ? allExisting
          ? null
          : { NG: 32000, NG_kN: 32, qTot: 50, qReq: 26.6667, qGoverning: 50, governedByMoment: false, L: 1200, n: 8, FEd: 7.5, FRdCap: 9, util: 0.8333, valid: true }
        : o.anchorReq,
  });

  return {
    unit: 'mm',
    k: 1,
    allExisting,
    parts: [
      { id: 's1', name: 'Steg', E: 11000, props: { A: 20000 }, EA: 2.2e8, stage: 'existing' },
      { id: 's2', name: 'Påføring', E: 11000, props: { A: 6000 }, EA: 6.6e7, stage: 'new' },
    ],
    section,
    existingSection,
    loads: { before: { N: 0 }, after: { N: 60000 }, L: 1200 },
    transferNew: { dN: 8700, EA_group: 4.0e5, share: 0.18 },
    anchorNew: { valid: true, q: 7.25 },
    joints: (opts.joints || [{}]).map(joint),
  };
}

/* ================================================================== *
 * 0. Forutsetning om formateringen
 * ================================================================== */

test('0. Tallformatereren er nb-NO — testen sammenligner formaterte strenger', () => {
  // HÅNDREGNING: nb-NO bruker komma som desimalskille og to desimaler som
  // standard. Er ICU bygd uten nb-NO, faller Intl tilbake på en annen locale
  // og HELE denne fila ville feilet på uforståelige måter. Derfor står
  // antakelsen først, eksplisitt.
  eq('n(50)', n(50), '50,00');
  eq('n(42.75)', n(42.75), '42,75');
  eq('q(8.7, kN)', q(8.7, 'kN'), '8,70 kN');
  eq('pct(83.33)', pct(83.33), '83,3 %');
  // sci: 4,5·10¹² skrives med tre desimaler i mantissen og hevet eksponent
  eq('sci(4.5e12)', sci(4.5e12), '4,500·10¹²');
});

/* ================================================================== *
 * 1. Gruppene og rekkefølgen deres
 * ================================================================== */

test('1. Fast rekkefølge: tverrsnittsgruppa først, så én gruppe per skjøt', () => {
  const model = derivationModel(makeRes({ joints: [{ id: 'j1', name: 'Skjøt A' }, { id: 'j2', name: 'Skjøt B' }] }));
  ok('tre grupper', model.length === 3, `fikk ${model.length}`);
  eq('gruppe 0 key', model[0].key, 'section');
  eq('gruppe 0 tittel', model[0].title, 'Tverrsnittet og aksialkraften');
  eq('gruppe 1 key', model[1].key, 'j1');
  eq('gruppe 1 tittel', model[1].title, 'Skjøt A');
  eq('gruppe 2 key', model[2].key, 'j2');
  eq('gruppe 2 tittel', model[2].title, 'Skjøt B');

  // Tverrsnittsgruppa i forsterket modus: EA → y_c → EI_x → ΔN → q_N.
  // Rekkefølgen er ikke tilfeldig — hver post bruker resultatet fra den over.
  const secSyms = model[0].steps.map(leadSym);
  ok('tverrsnittsgruppa har 5 poster', secSyms.length === 5, secSyms.join(', '));
  eq('tverrsnittspostene i rekkefølge', secSyms.join(' → '), 'EA → y_c → EI_x → ΔN → q_N');
});

test('2. allExisting: egen tittel, og ingen ΔN/q_N (det finnes ikke noe å forankre)', () => {
  const model = derivationModel(makeRes({ allExisting: true }));
  eq('gruppe 0 tittel', model[0].title, 'Tverrsnittet (eksisterende)');
  const secSyms = model[0].steps.map(leadSym);
  eq('tverrsnittspostene i rekkefølge', secSyms.join(' → '), 'EA → y_c → EI_x');
  ok('ingen ΔN-post', !secSyms.includes('ΔN'), secSyms.join(', '));
  ok('ingen q_N-post', !secSyms.includes('q_N'), secSyms.join(', '));
});

test('3. Tom/manglende inndata gir en tom modell, ikke et unntak', () => {
  ok('derivationModel(null) === []', Array.isArray(derivationModel(null)) && derivationModel(null).length === 0);
  const noJoints = derivationModel(makeRes({ joints: [] }));
  ok('uten skjøter står bare tverrsnittsgruppa igjen', noJoints.length === 1, `fikk ${noJoints.length}`);
});

/* ================================================================== *
 * 2. Hver post er komplett
 * ================================================================== */

test('4. Hver post har ikke-tomme {sym, formula, subst, result}', () => {
  const models = [
    ['forsterket, skruer', derivationModel(makeRes({}))],
    ['forsterket, lim', derivationModel(makeRes({ joints: [{ connector: { kind: 'glue' } }] }))],
    ['forsterket, sveis', derivationModel(makeRes({ joints: [{ connector: { kind: 'weld' } }] }))],
    ['alt eksisterende', derivationModel(makeRes({ allExisting: true }))],
  ];
  for (const [label, model] of models) {
    let bad = 0;
    let count = 0;
    for (const g of model) {
      for (const s of g.steps) {
        count++;
        for (const field of ['sym', 'formula', 'subst', 'result']) {
          if (typeof s[field] !== 'string' || s[field].trim() === '') {
            bad++;
            lines.push(`           tom «${field}» i ${g.key}/${s.sym}`);
          }
        }
        if (typeof s.note !== 'string') {
          bad++;
          lines.push(`           «note» er ikke en streng i ${g.key}/${s.sym}`);
        }
      }
    }
    ok(`${label}: alle ${count} poster komplette`, bad === 0, `${bad} tomme felt`);
  }
});

test('5. Titlene er RÅ tekst — rendreren escaper, ikke modellen', () => {
  // En modell som lager HTML selv kan ikke brukes av en rendrer som ikke vil
  // ha HTML (rapportens tekstuttrekk, en fremtidig PDF-generator). Derfor skal
  // et skjøtenavn med spesialtegn komme UENDRET ut.
  const model = derivationModel(makeRes({ joints: [{ id: 'j1', name: 'Steg <b> & "flens"' }] }));
  eq('tittelen er uendret', model[1].title, 'Steg <b> & "flens"');
});

/* ================================================================== *
 * 3. §5.3 — REGRESJONSTESTEN. Momentet gir ikke et eget ledd.
 * ================================================================== */

test('6. §5.3: kraftdelen er NØYAKTIG {q_før, q_etter, q_V,tot, q_N, q_tot}', () => {
  const model = derivationModel(makeRes({ joints: [{ id: 'j1' }, { id: 'j2' }] }));
  for (const g of model.slice(1)) {
    sameSet(`${g.key}: kraftpostene`, symsOf(g, 'force'), ['q_før', 'q_etter', 'q_V,tot', 'q_N', 'q_tot']);
    ok(`${g.key}: fem kraftposter, ingen dubletter`, partsOf(g, 'force').length === 5,
      `fikk ${partsOf(g, 'force').length}`);
  }
});

test('7. §5.3: allExisting har bare {q_før} i kraftdelen', () => {
  const model = derivationModel(makeRes({ allExisting: true }));
  sameSet('kraftpostene', symsOf(model[1], 'force'), ['q_før']);
  ok('nøyaktig én kraftpost', partsOf(model[1], 'force').length === 1);
});

test('8. §5.3: en skjøt mot ny del har ingen «før» — men fortsatt ingen sjette post', () => {
  // «En skjøt mot en ny del har ingen «før»-tilstand»: før forsterkningen ble
  // montert fantes ikke den nye delen, og ingen skjærstrøm krysset fugen.
  // q_før faller da bort — men det er den ENESTE posten som faller bort.
  const model = derivationModel(makeRes({ joints: [{ noBefore: true }] }));
  sameSet('kraftpostene', symsOf(model[1], 'force'), ['q_etter', 'q_V,tot', 'q_N', 'q_tot']);
});

test('9. §5.3: q_tot-postens formel er nøyaktig «q_tot = q_V,tot + q_N» — ingen + q_M', () => {
  const model = derivationModel(makeRes({}));
  const qTot = model[1].steps.find((s) => leadSym(s) === 'q_tot');
  ok('q_tot-posten finnes', !!qTot);
  eq('q_tot.formula', qTot.formula, 'q_tot = q_V,tot + q_N');
  // HÅNDREGNING: q_V,tot = 12,50 + 30,25 = 42,75 og q_N = 7,25
  //           ⟹ q_tot   = 42,75 + 7,25  = 50,00 N/mm
  eq('q_tot.subst', qTot.subst, '42,75 + 7,25');
  eq('q_tot.result', qTot.result, '50,00 N/mm');
  const qV = model[1].steps.find((s) => leadSym(s) === 'q_V,tot');
  eq('q_V,tot.formula', qV.formula, 'q_V,tot = |q_før| + |q_etter|');
  eq('q_V,tot.result', qV.result, '42,75 N/mm');
});

test('10. §5.3: ingen post noe sted heter q_M, «fra M» eller lignende', () => {
  // Sjekken går på `sym` og `formula` — altså på hva en post ER og hvordan den
  // regnes, ikke på forklarende `note`-tekst (der ordet «momentet» skal
  // forekomme, nettopp for å si at det IKKE gir et eget ledd).
  const models = [
    derivationModel(makeRes({})),
    derivationModel(makeRes({ allExisting: true })),
    derivationModel(makeRes({ joints: [{ noBefore: true }, { connector: { kind: 'glue' } }, { connector: { kind: 'weld' } }] })),
  ];
  const forbidden = /q[_ ]?M\b|fra\s+M\b|moment.*bidrag|bidrag.*moment/i;
  let hits = 0;
  for (const model of models) {
    for (const g of model) {
      for (const s of g.steps) {
        for (const field of ['sym', 'formula']) {
          if (forbidden.test(s[field])) {
            hits++;
            lines.push(`           TREFF i ${g.key}/${s.sym}.${field}: «${s[field]}»`);
          }
        }
      }
    }
  }
  ok('ingen momentpost i skjærstrømmen', hits === 0, `${hits} treff`);

  // Og motsatt: N_G SKAL finnes, men i forankringsdelen — som et uavhengig
  // krav til hva som må innføres over L, aldri som et ledd i q_tot.
  const g = derivationModel(makeRes({}))[1];
  ok('N_G finnes', g.steps.some((s) => s.sym === 'N_G'));
  eq('N_G ligger i forankringsdelen', g.steps.find((s) => s.sym === 'N_G').part, 'anchor');
  ok('N_G ligger IKKE i kraftdelen', !symsOf(g, 'force').includes('N_G'));
  const qGov = g.steps.find((s) => s.sym === 'q_gov');
  eq('q_gov er et maksimum, ikke en sum', qGov.formula, 'q_gov = max(q_tot, q_req)');
});

/* ================================================================== *
 * 4. Delene av en skjøtegruppe
 * ================================================================== */

test('11. Skjøtegruppa er delt i navngitte deler, i fast rekkefølge', () => {
  const g = derivationModel(makeRes({}))[1];
  const order = [];
  for (const s of g.steps) if (order[order.length - 1] !== s.part) order.push(s.part);
  eq('delene i rekkefølge', order.join(' → '), 'es → force → es → force → axial → force → check → volkersen → anchor');
});

test('12. Kapasitetskontrollen følger forbindelsestypen', () => {
  const screw = derivationModel(makeRes({}))[1];
  sameSet('skruer', symsOf(screw, 'check'), ['s_req', 'utnyttelse']);

  const glue = derivationModel(makeRes({ joints: [{ connector: { kind: 'glue' } }] }))[1];
  sameSet('lim', symsOf(glue, 'check'), ['τ', 'utnyttelse']);
  eq('lim: τ-formelen', partsOf(glue, 'check')[0].formula, 'τ = q_tot / b');

  const weld = derivationModel(makeRes({ joints: [{ connector: { kind: 'weld' } }] }))[1];
  sameSet('sveis', symsOf(weld, 'check'), ['q_Rd', 'utnyttelse']);
  // HÅNDREGNING, sveis uten satt q_Rd: n_sveiser · a · f_vw,d = 2 · 4 · 207
  eq('sveis: innsatte tall', partsOf(weld, 'check')[0].subst, '2 · 4,00 · 207,00');

  // Satt q_Rd overstyrer utledningen, og det skal STÅ at den er satt — ellers
  // kan ikke en kontrollør se hvor tallet kom fra.
  const weldSet = derivationModel(makeRes({ joints: [{ connector: { kind: 'weld', qRd: 900 } }] }))[1];
  eq('sveis: satt q_Rd', partsOf(weldSet, 'check')[0].subst, 'satt direkte = 900,00 N/mm');
});

test('13. Volkersen og forankring faller bort når de ikke er anvendelige', () => {
  const uten = derivationModel(makeRes({ joints: [{ volkersen: null, anchorReq: null }] }))[1];
  ok('ingen Volkersen-poster', partsOf(uten, 'volkersen').length === 0);
  ok('ingen forankringsposter', partsOf(uten, 'anchor').length === 0);
  // Kraftdelen er den samme uansett — den avhenger ikke av hva som kommer etter.
  sameSet('kraftdelen er uendret', symsOf(uten, 'force'), ['q_før', 'q_etter', 'q_V,tot', 'q_N', 'q_tot']);

  const ugyldigVol = derivationModel(makeRes({ joints: [{ volkersen: { valid: false } }] }))[1];
  ok('ugyldig Volkersen gir ingen poster', partsOf(ugyldigVol, 'volkersen').length === 0);
});

test('14. F_Ed står bare når brukeren har oppgitt antall forbindere', () => {
  const medN = derivationModel(makeRes({}))[1];
  sameSet('med n', symsOf(medN, 'anchor'), ['N_G', 'q_req', 'q_gov', 'F_Ed']);
  // HÅNDREGNING: F_Ed = q_gov · L / n = 50 N/mm · 1200 mm / 8 = 7500 N = 7,50 kN
  const fEd = medN.steps.find((s) => s.sym === 'F_Ed');
  eq('F_Ed.formula', fEd.formula, 'F_Ed = q_gov · L / n');
  eq('F_Ed.result', fEd.result, '7,50 kN');
  // Utnyttelse mot F_Rd = 9 kN: 7,5/9 = 0,8333 ⟹ 83,3 %
  ok('utnyttelsen står i merknaden', /83,3 %/.test(fEd.note), fEd.note);

  const utenN = derivationModel(makeRes({
    joints: [{ anchorReq: { NG: 32000, NG_kN: 32, qTot: 50, qReq: 26.6667, qGoverning: 50, L: 1200, n: null, FEd: null, FRdCap: null, util: null, valid: true } }],
  }))[1];
  sameSet('uten n', symsOf(utenN, 'anchor'), ['N_G', 'q_req', 'q_gov']);
});

test('15. Andel («share») står i ΔN_i når skjøten er statisk ubestemt', () => {
  const uten = derivationModel(makeRes({}))[1].steps.find((s) => s.sym === 'ΔN_i');
  ok('ingen andel når fordelingen er entydig', !/andel/.test(uten.subst), uten.subst);
  const med = derivationModel(makeRes({ joints: [{ shareApplied: 0.5 }] }))[1].steps.find((s) => s.sym === 'ΔN_i');
  ok('andelen står når den er brukt', /· andel 0,500$/.test(med.subst), med.subst);
});

/* ================================================================== *
 * 5. Forutsetningene
 * ================================================================== */

test('16. Forutsetningene ligger i modellen, ikke i rendreren', () => {
  // Rapporten skal kunne skrive de samme forbeholdene som panelet, fra samme
  // kilde. Ligger de i HTML-en, må de skrives om — og da kan de gli fra
  // hverandre uten at noe varsler.
  ok('lista finnes', Array.isArray(DERIVATION_ASSUMPTIONS));
  ok('seks punkter', DERIVATION_ASSUMPTIONS.length === 6, `fikk ${DERIVATION_ASSUMPTIONS.length}`);
  ok('lista er frosset', Object.isFrozen(DERIVATION_ASSUMPTIONS));
  ok('full samvirkning er nevnt', DERIVATION_ASSUMPTIONS.some((t) => /Full samvirkning/.test(t)));
  ok('lineær elastisitet er nevnt', DERIVATION_ASSUMPTIONS.some((t) => /Lineær elastisitet/.test(t)));
  ok('vektfaktoren er avgrenset mot material.E',
    DERIVATION_ASSUMPTIONS.some((t) => /factor/.test(t) && /material\.E/.test(t)));
  ok('ingen punkter er tomme', DERIVATION_ASSUMPTIONS.every((t) => typeof t === 'string' && t.trim().length > 20));
});

/* ================================================================== *
 * Kjøring
 * ================================================================== */

let failures = 0;
console.log('\nderivation.test.mjs — utledningen som data, og §5.3-regresjonen\n');
for (const t of tests) {
  lines = [];
  failedInCurrent = 0;
  try {
    t.fn();
  } catch (err) {
    failedInCurrent++;
    lines.push(`      FEIL unntak: ${err && err.stack ? err.stack.split('\n').slice(0, 3).join('\n      ') : err}`);
  }
  const bad = failedInCurrent > 0;
  if (bad) failures++;
  console.log(`  ${bad ? '[FEIL]' : '[ OK ]'} ${t.name}`);
  for (const l of lines) console.log(l);
  console.log('');
}

console.log(`  ${tests.length - failures} av ${tests.length} tester bestått.\n`);
process.exit(failures > 0 ? 1 : 0);
