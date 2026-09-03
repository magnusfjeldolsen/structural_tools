/**
 * interfaces.js — grensesnittene mellom eksisterende og ny del.
 *
 * Et grensesnitt er en linje tegnet i tverrsnittsplanet, sammen med
 * opplysningen om HVILKEN side av linja som er den nye delen. Det er den sidens
 * aksialkraft som må leveres gjennom forbindelsen, og dermed den som bestemmer
 * skjærstrømmen.
 *
 * Ren geometri og datamodell — ingen DOM, ingen three.js. Selve mekanikken
 * ligger i `reinforcement.js`, og panelet i `reinforcement-ui.js`.
 *
 * ENHETER — dette er lett å bomme på:
 *  - `a` og `b` er koordinater i **arbeidsenheten** (mm/cm/m), som all annen
 *    geometri. `store.setUnit` regner dem om når enheten byttes.
 *  - `connector`-feltene er i **absolutte enheter**, uavhengig av arbeidsenheten:
 *    `FRd` [kN], `spacing` [mm], `Kser` [N/mm], `tauRd` [N/mm²], `Ga` [N/mm²],
 *    `ta` [mm]. Det samme gjelder `bondWidth` [mm]. Grunnen er at mekanikken
 *    alltid regnes i N og mm; hadde forbinderdataene fulgt arbeidsenheten,
 *    ville et bytte fra mm til m ha endret skruekapasiteten.
 */

import { centroidOfPoints } from './geometry.js';
import { unitInfo } from './units.js';

/** Fargen grensesnittene tegnes i, både i lerretet og i panelet. */
export const INTERFACE_COLOR = '#f472b6';

/** Fargestikket former merket «ny» får i lerretet. */
export const NEW_STAGE_COLOR = '#34d399';

/**
 * Standard forbinderdata. Verdiene er de samme som §3 i planen bruker som
 * eksempel — de er startpunkt for brukeren, ikke en anbefaling.
 */
export function defaultConnector() {
  return {
    kind: 'screw',
    // skrue
    FRd: 8.0, // kapasitet per forbinder [kN]
    rows: 1, // antall rader på tvers
    spacing: 200, // senteravstand langs bjelkeaksen [mm]
    Kser: 5000, // stivhet per forbinder [N/mm]
    // lim
    tauRd: 4.0, // dimensjonerende heftfasthet [N/mm²]
    Ga: 700, // limets skjærmodul [N/mm²]
    ta: 2, // limtykkelse [mm]
  };
}

/** Neste ledige id i lista. Egen teller, slik at formenes `sN` ikke kolliderer. */
export function nextInterfaceId(list) {
  let max = 0;
  for (const f of list || []) {
    const n = parseInt(String(f && f.id).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `if${max + 1}`;
}

/**
 * Fyller ut manglende felt i et grensesnitt. Lista kan komme fra håndredigert
 * JSON eller fra en eldre fil, så ingenting kan forutsettes.
 */
export function normalizeInterface(f, i = 0) {
  const a = Array.isArray(f && f.a) ? [Number(f.a[0]) || 0, Number(f.a[1]) || 0] : [0, 0];
  const b = Array.isArray(f && f.b) ? [Number(f.b[0]) || 0, Number(f.b[1]) || 0] : [0, 0];
  const bw = Number(f && f.bondWidth);
  return {
    id: (f && f.id) || `if${i + 1}`,
    name: (f && f.name) || `Grensesnitt ${i + 1}`,
    a,
    b,
    groupIds: Array.isArray(f && f.groupIds) ? f.groupIds.slice() : [],
    bondWidth: Number.isFinite(bw) && bw > 0 ? bw : null,
    connector: { ...defaultConnector(), ...((f && f.connector) || {}) },
  };
}

/* ------------------------------------------------------------------ *
 * Geometri
 * ------------------------------------------------------------------ */

/**
 * Hvilken side av linja a→b ligger punktet p på?
 *
 *   kryss = (b−a) × (p−a) = (bx−ax)(py−ay) − (by−ay)(px−ax)
 *
 * Positivt kryssprodukt betyr til **venstre** for retningen a→b (samme
 * konvensjon som mot klokka er positiv omløpsretning i geometry.js).
 * Returnerer den signerte størrelsen, ikke bare fortegnet, slik at kallende
 * kode kan sammenligne hvor langt fra linja punktene ligger.
 *
 * @returns {number} > 0 venstre, < 0 høyre, ≈ 0 på linja
 */
export function sideOfLine(p, a, b) {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

/** Enhetsnormalen som peker mot venstre side av a→b. Null lengde ⟹ [0, 0]. */
export function leftNormal(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return [0, 0];
  return [-dy / len, dx / len];
}

/**
 * Gjetter hvilke former som ligger på «ny»-siden av en nytegnet linje.
 *
 * Regelen er §7 C1 i planen: formene hvis tyngdepunkt ligger til venstre for
 * a→b, og av dem bare de som er merket `stage: 'new'` dersom det gir et
 * ikke-tomt sett. Gjettet er ment å treffe det vanlige tilfellet — brukeren kan
 * alltid snu siden etterpå.
 */
export function guessGroupIds(shapes, a, b) {
  const left = [];
  for (const s of shapes || []) {
    if (!s || s.include === false || !s.points || s.points.length < 3) continue;
    const c = centroidOfPoints(s.points);
    if (sideOfLine(c, a, b) > 0) left.push(s);
  }
  const isNew = left.filter((s) => s.stage === 'new');
  return (isNew.length ? isNew : left).map((s) => s.id);
}

/** Grensesnittlinjas lengde i arbeidsenheten. */
export function lineLength(f) {
  return Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
}

/**
 * Heftbredden `b` [mm] — lengden i tverrsnittsplanet som skjærspenningen
 * fordeles over. Er `bondWidth` satt, vinner den; ellers brukes linjas lengde,
 * regnet om fra arbeidsenheten til mm.
 */
export function bondWidthMm(f, unit) {
  if (Number.isFinite(f.bondWidth) && f.bondWidth > 0) return f.bondWidth;
  return lineLength(f) * unitInfo(unit).toMillimetres;
}

/**
 * Hvilken vei pilene i lerretet skal peke: +1 hvis gruppa ligger til venstre
 * for a→b, −1 hvis den ligger til høyre, 0 hvis gruppa er tom eller ligger
 * på begge sider (da sier vi ikke noe).
 */
export function groupSideSign(f, shapes) {
  const want = new Set(f.groupIds || []);
  let sum = 0;
  let n = 0;
  for (const s of shapes || []) {
    if (!want.has(s.id) || !s.points || s.points.length < 3) continue;
    const c = centroidOfPoints(s.points);
    const side = sideOfLine(c, f.a, f.b);
    if (Math.abs(side) < 1e-12) continue;
    sum += Math.sign(side);
    n++;
  }
  if (!n || sum === 0) return 0;
  return sum > 0 ? 1 : -1;
}

/**
 * Formene på den andre siden av grensesnittet enn gruppa — altså den delen
 * som blir stående igjen. Brukes til Volkersen, der begge stavenes
 * aksialstivhet trengs.
 */
export function complementIds(f, shapes) {
  const want = new Set(f.groupIds || []);
  return (shapes || [])
    .filter((s) => s.include !== false && s.points && s.points.length >= 3 && !want.has(s.id))
    .map((s) => s.id);
}

/* ------------------------------------------------------------------ *
 * CRUD mot store
 *
 * Grensesnittene ligger i `state.interfaces` (lagt inn av agent A sammen med
 * migreringen). Vi går gjennom `store.mutate`, slik at hver endring blir ett
 * undo-steg og havner i localStorage som alt annet.
 * ------------------------------------------------------------------ */

export function addInterface(store, a, b, opts = {}) {
  const st = store.state;
  const id = nextInterfaceId(st.interfaces);
  const created = normalizeInterface({
    id,
    name: opts.name || `Grensesnitt ${(st.interfaces || []).length + 1}`,
    a: [a[0], a[1]],
    b: [b[0], b[1]],
    groupIds: opts.groupIds || guessGroupIds(st.shapes, a, b),
    connector: opts.connector || defaultConnector(),
  });
  store.mutate((s) => {
    s.interfaces = [...(s.interfaces || []), created];
  }, { reason: 'interface-add' });
  return created;
}

export function updateInterface(store, id, patch, opts = {}) {
  store.mutate((s) => {
    s.interfaces = (s.interfaces || []).map((f) => (f.id === id ? { ...f, ...patch } : f));
  }, { reason: 'interface', ...opts });
}

/** Patcher forbinderdataene uten å røre resten av grensesnittet. */
export function updateConnector(store, id, patch, opts = {}) {
  store.mutate((s) => {
    s.interfaces = (s.interfaces || []).map((f) =>
      f.id === id ? { ...f, connector: { ...defaultConnector(), ...f.connector, ...patch } } : f
    );
  }, { reason: 'interface', ...opts });
}

export function removeInterface(store, id) {
  store.mutate((s) => {
    s.interfaces = (s.interfaces || []).filter((f) => f.id !== id);
  }, { reason: 'interface-remove' });
}

/**
 * Snur gruppesiden: gruppa blir formene som ikke var med, blant dem som
 * faktisk ligger på den andre siden av linja. Dette er den raskeste rettelsen
 * når gjettet i C1 bommet.
 */
export function flipGroup(store, id) {
  const st = store.state;
  const f = (st.interfaces || []).find((x) => x.id === id);
  if (!f) return;
  const sign = groupSideSign(f, st.shapes) || 1;
  const next = [];
  for (const s of st.shapes) {
    if (s.include === false || !s.points || s.points.length < 3) continue;
    const side = sideOfLine(centroidOfPoints(s.points), f.a, f.b);
    if (Math.abs(side) < 1e-12) continue;
    // Ny gruppe = formene på motsatt side av der gruppa lå
    if (Math.sign(side) === -sign) next.push(s.id);
  }
  updateInterface(store, id, { groupIds: next });
}
