/**
 * store.js — geometry_workspace sin tilstand: cad2d-dokumentet pluss domenet.
 *
 * `Store` arver `CadDocument` (cad2d/js/core/document.js, #93), som eier
 * historikken, CRUD for former og linjearbeid, utvalget og enhetsbyttet. Her
 * ligger det som bare geometry_workspace har: skjøtene (registrert som egen
 * entitetstype), lastene, linjeberegningen, automatiske skjøter, materialer
 * og prosjektformatet `structural_tools.geometry_workspace` v4.
 *
 * Ingen DOM-avhengigheter utover localStorage.
 */

import { neighborTolerance } from '../../cad2d/js/geometry/polygon.js';
import { CadDocument, migrateCore, PALETTE } from '../../cad2d/js/core/document.js';
import { sidesOfJoint, autoJoints } from './joints.js';
import { materialByName } from './materials.js';

export { PALETTE };

const STORAGE_KEY = 'geometry_workspace_v1';

/**
 * Fargen skjøtelinjer tegnes i. Bevisst IKKE en `PALETTE`-farge — det gamle
 * grensesnittfargen (`#f472b6`) kolliderte med `PALETTE[1]`, som gjorde en
 * skjøt vanskelig å skille fra en rosa form (§6.1 i joints-planen).
 */
export const JOINT_COLOR = '#2dd4bf';

/**
 * Standard skjøtedata for en ny skjøt: det som bestemmer skjøtestivheten
 * k = rader·K/s (se CONTEXT.md). Ingen kapasitet — verktøyet gir kraften
 * skjøten må ta, ikke om et festemiddel holder. Feltene for K_ser-kilden
 * (EC5 tabell 7.1) og γ-metoden legges på av panelet når de brukes.
 */
export function defaultConnector() {
  return {
    rows: 1, // antall rader på tvers
    spacing: 200, // senteravstand langs bjelkeaksen [mm]
    Kser: 5000, // glidningsmodul per forbinder [N/mm], fritt innlagt
  };
}

/** Felt som hørte til forbindelsestype og kapasitet (før #58/#59) — lest og forkastet. */
const DROPPED_CONNECTOR_FIELDS = [
  'kind', 'FRd', 'shearPlanes', 'tauRd', 'Ga', 'ta', 'qRd', 'a_weld', 'fvwd', 'nWelds', 'anchorN', 'anchorFRd',
];

/**
 * Standardmateriale for en form. E er i N/mm², uavhengig av arbeidsenheten,
 * fordi mekanikken alltid regnes i N og mm.
 *
 * MERK: dette er en innebygd standard slik at datamodellen står støtt alene.
 * Presetlista og materialvelgeren hører hjemme i `js/materials.js` — agent C
 * kobler dette feltet mot den modulen.
 *
 * `shape.material` kan i tillegg bære et VALGFRITT `rho` [kg/m³] —
 * middeldensiteten `ρ_m` som EC5 tabell 7.1 trenger for skruede skjøter.
 * Feltet er bevisst valgfritt og gir INGEN versjonsbump: fravær betyr «ikke
 * oppgitt», som er nøyaktig det alle eksisterende modeller allerede sier.
 * S355 har ingen `rho`, fordi EC5-formelen ikke gjelder stål.
 */
export const DEFAULT_MATERIAL = { name: 'S355', E: 210000 };

/**
 * Normaliserer et `material`-objekt fra en lagret modell eller fra UI-et.
 *
 * `rho` tas bare med når den faktisk er et positivt, endelig tall. Fella her
 * er `Number(null) === 0` og `Number('') === 0`: en tom eller manglende verdi
 * ville ellers blitt lagret som densiteten 0, som verken er «ikke oppgitt»
 * eller et brukbart tall — `meanDensity()` ville avvist den som ugyldig, men
 * UI-et ville vist «0 kg/m³» som om noen hadde ment det. Derfor
 * `Number.isFinite` + `> 0`, og feltet utelates helt ellers.
 *
 * NAVNET SLÅS OPP NÅR TALLET MANGLER — og hvorfor det må gjøres
 * ------------------------------------------------------------
 * Mangler `E`, hentes den fra presetet navnet peker på, og først hvis navnet
 * er ukjent brukes `DEFAULT_MATERIAL`. Det samme for `rho`.
 *
 * Uten oppslaget fikk `{ name: 'C24' }` stålets `E = 210000` bakt fast på seg.
 * Og siden en egen `E` med vilje vinner over presetet ved lesing (`materialE()`
 * — et fritt inntastet E-felt skal ikke overstyres av navnet det tilfeldigvis
 * ble lagret med), ble det gale tallet stående for godt. Utslaget er ikke
 * subtilt: en C24-bjelke regnes 19 ganger for stiv, hele kraftfordelingen blir
 * feil, og nedtrekkslista viser fortsatt «C24».
 *
 * Utløseren er ikke hypotetisk: en importert modell som navngir materialet men
 * mangler `E` — håndredigert JSON, eller en fil laget før `E` ble persistert —
 * treffer nøyaktig dette. Ingenting hadde varslet.
 */
function normalizeMaterial(mat) {
  const name = mat && mat.name ? String(mat.name) : DEFAULT_MATERIAL.name;
  const preset = materialByName(name);
  const out = {
    name,
    E: mat && Number.isFinite(mat.E) && mat.E > 0
      ? mat.E
      : (preset ? preset.E : DEFAULT_MATERIAL.E),
  };
  const rho = mat ? Number(mat.rho) : NaN;
  if (Number.isFinite(rho) && rho > 0) out.rho = rho;
  else if (preset && Number.isFinite(preset.rho) && preset.rho > 0) out.rho = preset.rho;
  return out;
}

/**
 * Standard lastdata (v4, §1 i samvirkeplanen — biaksiell last). To
 * lasttilstander — superposisjon: `before` virker på tverrsnittet av bare
 * `existing`-formene, `after` på det sammensatte tverrsnittet. Hver tilstand
 * er `{Vy, Vx, N, Mx, My}` — `Vy`/`N` i kN, `Mx`/`My` i kNm — se
 * fortegnskonvensjonene i `reinforcement.js` (§9 i samvirkeplanen: `M_y` er
 * her `∫σx dA`, IKKE den vanlige `−∫σx dA`). `L` (forankringslengden ΔN skal
 * innføres over) er i arbeidsenheten.
 */
export function defaultLoads() {
  return {
    before: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 },
    after: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 },
    L: 1000,
  };
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Én lasttilstand (`before` eller `after`) oppgradert til v4 sitt biaksielle
 * `{Vy, Vx, N, Mx, My}`. To eldre former gjenkjennes:
 *  - v4 selv (har allerede `Vy`, `Vx`, `Mx` eller `My`) — fyller bare ut det
 *    som mangler.
 *  - v3, enakslet `{V, N, M}` — gammel `V` blir `Vy`, gammel `M` blir `Mx`,
 *    og `Vx`/`My` settes til 0 (ingen skjev bøyning fantes i den modellen).
 */
/**
 * Linjeberegningen (#63). Lastetabellen lagres som teksten brukeren limte
 * inn, så den kan redigeres og limes på nytt; `za`/`zb` er i METER, som
 * tabellen, og regnes ikke om ved enhetsbytte. `nAt` og `restraint` har
 * bevisst ingen standard — valget kan endre resultatet med en faktor 2.
 */
export function defaultLine() {
  return {
    table: '',
    za: null,
    zb: null,
    endA: 'loose',
    endB: 'loose',
    nAt: null, // 'existing' | 'composite'
    restraint: null, // 'free' | 'x' | 'y' | 'xy' — aksene som er fastholdt
    epsExisting: 0, // fri tøyning, ‰
    epsNew: 0,
    // Skruesoner (#71): hver sone slutter i `zEnd` [m] (den siste i z_b, `null`).
    // Tom liste = én sone med skjøtens rader og a. Soner lagres som grenser,
    // så de kan aldri overlappe eller la hull stå igjen.
    zones: [],
    // Endeavstand fra enden til første skrue [mm] (#75). 0 = skruer helt ut.
    a3a: 0,
    a3b: 0,
    // Innstillingene for «Foreslå soner» (#73), så de huskes mellom forsøk.
    suggest: { target: null, spacings: '50 75 100 150 200', minLen: 0.5 },
  };
}

function migrateSuggest(v) {
  const d = defaultLine().suggest;
  const src = v && typeof v === 'object' ? v : {};
  const t = Number(src.target);
  const m = Number(src.minLen);
  return {
    target: Number.isFinite(t) && t > 0 ? t : null,
    spacings: typeof src.spacings === 'string' && src.spacings.trim() ? src.spacings : d.spacings,
    minLen: Number.isFinite(m) && m > 0 ? m : d.minLen,
  };
}

function migrateZone(z) {
  const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const pos = (v) => { const x = num(v); return x != null && x > 0 ? x : null; };
  return { zEnd: num(z && z.zEnd), rows: pos(z && z.rows), a: pos(z && z.a), Kser: pos(z && z.Kser), d: pos(z && z.d) };
}

function migrateLine(l) {
  const d = defaultLine();
  const src = l && typeof l === 'object' ? l : {};
  const numOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    table: typeof src.table === 'string' ? src.table : d.table,
    za: numOrNull(src.za),
    zb: numOrNull(src.zb),
    endA: src.endA === 'fixed' ? 'fixed' : 'loose',
    endB: src.endB === 'fixed' ? 'fixed' : 'loose',
    nAt: src.nAt === 'existing' || src.nAt === 'composite' ? src.nAt : null,
    restraint: ['free', 'x', 'y', 'xy'].includes(src.restraint) ? src.restraint : null,
    epsExisting: Number.isFinite(Number(src.epsExisting)) ? Number(src.epsExisting) : 0,
    epsNew: Number.isFinite(Number(src.epsNew)) ? Number(src.epsNew) : 0,
    zones: Array.isArray(src.zones) ? src.zones.map(migrateZone) : [],
    a3a: Number(src.a3a) > 0 ? Number(src.a3a) : 0,
    a3b: Number(src.a3b) > 0 ? Number(src.a3b) : 0,
    suggest: migrateSuggest(src.suggest),
  };
}

function migrateAutoJointData(d) {
  const out = {};
  if (!d || typeof d !== 'object') return out;
  for (const [id, v] of Object.entries(d)) {
    if (!String(id).startsWith('auto:') || !v || typeof v !== 'object') continue;
    out[id] = {
      ...(typeof v.name === 'string' && v.name ? { name: v.name } : {}),
      ...(Number.isFinite(v.share) ? { share: v.share } : {}),
      ...(Number.isFinite(v.qT) ? { qT: v.qT } : {}),
      connector: connectorFrom(v.connector),
    };
  }
  return out;
}

function migrateLoadState(s) {
  const src = s || {};
  const isBiaxial = src.Vy !== undefined || src.Vx !== undefined || src.Mx !== undefined || src.My !== undefined;
  if (isBiaxial) {
    return { Vy: num(src.Vy), Vx: num(src.Vx), N: num(src.N), Mx: num(src.Mx), My: num(src.My) };
  }
  return { Vy: num(src.V), Vx: 0, N: num(src.N), Mx: num(src.M), My: 0 };
}

/**
 * Oppgraderer lastdata fra det flate v1/v2-formatet `{V,N,M,L}`, eller v3 sine
 * enakslede `{before,after}`, til v4 sine biaksielle lasttilstander. Gammel
 * flat `V`/`N`/`M` (v1/v2) legges i `after` — det er den tolkningen som
 * stemmer med hva feltene betydde før: last som virker på HELE (sammensatte)
 * tverrsnittet var alt verktøyet kjente til den gangen. `before` blir 0.
 */
function migrateLoads(loads) {
  const l = loads || {};
  if (l.before || l.after) {
    return {
      before: migrateLoadState(l.before),
      after: migrateLoadState(l.after),
      L: Number.isFinite(l.L) ? l.L : 1000,
    };
  }
  return {
    before: { Vy: 0, Vx: 0, N: 0, Mx: 0, My: 0 },
    after: migrateLoadState(l),
    L: Number.isFinite(l.L) ? l.L : 1000,
  };
}

/**
 * Oppgraderer én skjøt til v3 (§4). Gamle grensesnitt (v1/v2) beholder `a`,
 * `b` og `connector`; `groupIds` forkastes bevisst — gruppa utledes nå fra
 * halvplanet/grafen (§8) i stedet for å ligge lagret på skjøten. `share` er nytt
 * (null = automatisk etter skjøtestivhet k ved et statisk ubestemt oppsett, §2).
 */
function migrateJoint(f, i, newJointId = (k) => `j${k + 1}`) {
  const a = Array.isArray(f && f.a) ? [num(f.a[0]), num(f.a[1])] : [0, 0];
  const b = Array.isArray(f && f.b) ? [num(f.b[0]), num(f.b[1])] : [0, 0];
  const shareRaw = f && f.share;
  const share = shareRaw === null || shareRaw === undefined ? NaN : Number(shareRaw);
  return {
    id: (f && f.id) || newJointId(i),
    name: (f && f.name) || `Skjøt ${i + 1}`,
    a,
    b,
    share: Number.isFinite(share) && share >= 0 && share <= 1 ? share : null,
    qT: Number.isFinite(Number(f && f.qT)) ? Number(f.qT) : 0,
    connector: connectorFrom(f && f.connector),
  };
}

function connectorFrom(raw) {
  const c = { ...defaultConnector(), ...(raw || {}) };
  for (const key of DROPPED_CONNECTOR_FIELDS) delete c[key];
  return c;
}

/**
 * Alle skjøtene modellen regner med: de tegnede, og de automatiske langs
 * felles kanter mellom eksisterende og ny del (#61, `autoJoints`). En
 * automatisk skjøt lagres ikke som objekt — den utledes fra geometrien — men
 * det brukeren har lagt inn på den (navn, q_T, andel, skjøtedata) lagres i
 * `state.autoJointData` under skjøtens id, som er bygd av delparet. Da følger
 * innstillingene med når delene flyttes sammen.
 *
 * Geometridelen huskes mellom kall med samme geometri: den kalles ofte
 * (hver tegning, hver musebevegelse i lerretet).
 */
let autoCache = { key: null, result: null };
export function effectiveJoints(state) {
  const shapes = (state && state.shapes) || [];
  const drawn = (state && state.joints) || [];
  const key = JSON.stringify([
    shapes.map((x) => [x.id, x.stage, x.include, x.role, x.points]),
    drawn.map((j) => [j.a, j.b]),
  ]);
  if (autoCache.key !== key) {
    autoCache = { key, result: autoJoints(shapes, drawn, neighborTolerance(shapes)) };
  }
  const data = (state && state.autoJointData) || {};
  const autos = autoCache.result.joints.map((j) => {
    const d = data[j.id] || {};
    return {
      ...j,
      name: d.name || autoJointName(j.a, j.b, shapes),
      share: Number.isFinite(d.share) ? d.share : null,
      qT: Number.isFinite(d.qT) ? d.qT : 0,
      connector: connectorFrom(d.connector),
    };
  });
  return [...drawn, ...autos];
}

/** Overlappene `autoJoints` fant (ny del tegnet inn i eksisterende). */
export function autoJointOverlaps(state) {
  effectiveJoints(state);
  return autoCache.result ? autoCache.result.overlaps : [];
}

/**
 * Autonavn for en ny skjøt (§6.2): «<former på den ene siden> ↔ <former på den
 * andre siden>», utledet fra `sidesOfJoint` i joints.js. Faller tilbake på et
 * nøytralt «Skjøt» der en side ikke treffer noen form (f.eks. midt i tomrom,
 * før brukeren har tegnet det den skal feste).
 */
function jointSideLabel(ids, shapes) {
  const names = ids
    .map((id) => {
      const s = shapes.find((x) => x.id === id);
      return s ? s.name : null;
    })
    .filter(Boolean);
  if (!names.length) return null;
  // Flere former på én side er vanlig (steg + underflens mot overflens). Vi
  // navngir de to første og teller resten, ellers blir navnet en hel setning.
  if (names.length <= 2) return names.join(' + ');
  return `${names.slice(0, 2).join(' + ')} + ${names.length - 2} til`;
}

/** Er det nøyaktig de samme formene på begge sider? Sammenlignes på id. */
function sameSides(aIds, bIds) {
  if (!aIds.length || aIds.length !== bIds.length) return false;
  return aIds.every((id, i) => id === bIds[i]); // sidesOfJoint sorterer allerede
}

export function autoJointName(a, b, shapes) {
  const tol = neighborTolerance(shapes);
  const sides = sidesOfJoint({ a, b }, shapes, tol);
  const aLabel = jointSideLabel(sides.aSide, shapes);
  const bLabel = jointSideLabel(sides.bSide, shapes);

  // Går snittet gjennom én og samme form (eller nøyaktig samme sett former),
  // er «A ↔ A» meningsløst — det er ikke en fuge mellom to deler, men et snitt
  // i én. Det er nettopp dette tilfellet halvplanet gjør mulig: man kan regne
  // på et snitt i en udelt, importert profil uten å dele den opp først.
  //
  // Sammenligningen går på ID, ikke på navnet: to ulike former som begge heter
  // «Form» er IKKE den samme formen, og skal fortsatt hete «Form ↔ Form».
  if (sameSides(sides.aSide, sides.bSide)) return `Snitt i ${aLabel}`;
  if (aLabel && bLabel) return `${aLabel} ↔ ${bLabel}`;
  // Bare den ene siden treffer materiale: snittet ligger i ytterkant, eller
  // brukeren har ennå ikke tegnet den delen skjøten skal feste.
  if (aLabel || bLabel) return `Skjøt ved ${aLabel || bLabel}`;
  return 'Skjøt';
}

/**
 * Oppgraderer én form til gjeldende datamodell. `stage` skiller eksisterende
 * tverrsnitt fra den nye delen som limes eller skrus på, og `material.E`
 * brukes av forsterkningsberegningen. `factor` er fortsatt bare en vektfaktor
 * for tyngdepunktsberegningen — de to er uavhengige.
 */
function migrateShape(s) {
  return {
    ...s,
    stage: s && s.stage === 'new' ? 'new' : 'existing',
    material: normalizeMaterial(s && s.material),
  };
}

/**
 * Oppgraderer lagret tilstand fra eldre versjoner. Håndterer v1, v2 og v3 —
 * alle tre skal lastes uten feil, både fra localStorage og fra importert JSON.
 * Kjernens del (snap, orto, underlag, linjearbeid) gjør `migrateCore`.
 *
 *  - v1: ingen `snap`-brytere per type (ett flagg på rutenettet), ingen
 *    `stage`/`material` på formene, ingen grensesnitt/skjøter.
 *  - v2: `interfaces` (flat `groupIds`-modell) og flat `loads` {V,N,M,L}.
 *  - v3: `joints` (§4 — `a`,`b`,`bondWidth`,`share`,`connector`, INGEN
 *    `groupIds`) og lastdata med to tilstander, `{before,after,L}`, ENAKSLET
 *    `{V,N,M}` per tilstand (§3 i joints-planen).
 *  - v4: lastdata er BIAKSIELL — hver tilstand er `{Vy,Vx,N,Mx,My}` i stedet
 *    for `{V,N,M}` (§1 i samvirkeplanen). Gammel `V` → `Vy`, gammel `M` → `Mx`.
 *
 * @param {object} data
 * @param {() => string} [newJointId] id til en skjøt som mangler id
 */
function migrate(data, newJointId = (i) => `j${i + 1}`) {
  const out = migrateCore(data);
  if (Array.isArray(out.shapes)) out.shapes = out.shapes.map(migrateShape);

  // `interfaces` (v1/v2) -> `joints` (v3). Er begge fraværende, tomt.
  const jointsSrc = Array.isArray(out.joints) ? out.joints : Array.isArray(out.interfaces) ? out.interfaces : [];
  out.joints = jointsSrc.map((f, i) => migrateJoint(f, i, newJointId));
  delete out.interfaces;

  out.loads = migrateLoads(out.loads);
  out.line = migrateLine(out.line);
  out.autoJointData = migrateAutoJointData(out.autoJointData);
  out.analysis = out.analysis === 'line' ? 'line' : 'section';
  out.version = 4;
  return out;
}

/** Feltene i historikken og i localStorage, i rekkefølgen de alltid har hatt. */
const SNAPSHOT_KEYS = [
  'shapes', 'reference', 'mode', 'unit', 'grid', 'snaps', 'ortho', 'underlay', 'title',
  'joints', 'loads', 'analysis', 'line', 'autoJointData', 'lines', 'linesVisible',
];

/** Skjøten som cad2d-entitet: to endepunkt `a` og `b`. */
const JOINT_KIND = {
  collection: 'joints',
  prefix: 'j',
  order: 10, // mellom former (0) og linjearbeid (20), som før
  insert: 'back',
  copyName: true,
  toPoints: (j) => [[j.a[0], j.a[1]], [j.b[0], j.b[1]]],
  fromPoints: (j, pts) => {
    j.a = [pts[0][0], pts[0][1]];
    j.b = [pts[1][0], pts[1][1]];
  },
};

export class Store extends CadDocument {
  constructor(opts = {}) {
    super({ storageKey: STORAGE_KEY, ...opts });
    this.registerKind('joint', JOINT_KIND);
  }

  _defaultState() {
    return {
      ...super._defaultState(),
      // Skjøtelinjer mellom deler av tverrsnittet (v3, §4 i joints-planen).
      joints: [],
      loads: defaultLoads(),
      // «Snitt» (ett snitt, full samvirkning) eller «Linje» (langs hele delen, #63)
      analysis: 'section',
      line: defaultLine(),
      // Det brukeren har lagt inn på automatiske skjøter, under skjøtens id (#61).
      autoJointData: {},
    };
  }

  _snapshotKeys() {
    return SNAPSHOT_KEYS;
  }

  _migrate(data) {
    return migrate(data, () => this.nextId('j'));
  }

  /**
   * Nytt tegnet materiale hører som standard til det eksisterende
   * tverrsnittet; brukeren merker selv av hva som er ny del.
   */
  _decorateShape(shape, opts = {}) {
    shape.stage = opts.stage === 'new' ? 'new' : 'existing';
    shape.material = opts.material ? normalizeMaterial(opts.material) : { ...DEFAULT_MATERIAL };
    return shape;
  }

  /** Skjøtelinjene er geometri, og L er en lengde i arbeidsenheten. */
  _scaleExtra(st, k) {
    // Skjøtedataene (rader, s, K) er absolutte og regnes IKKE om.
    st.joints = st.joints.map((f) => ({
      ...f,
      a: [f.a[0] * k, f.a[1] * k],
      b: [f.b[0] * k, f.b[1] * k],
    }));
    if (Number.isFinite(st.loads.L)) st.loads.L = st.loads.L * k;
  }

  _clearExtra(st) {
    st.joints = [];
  }

  /* ---------------- entiteter: former OG skjøter (§1) ---------------- */

  /**
   * Som i kjernen, pluss automatiske skjøter: de kan velges og redigeres, men
   * ikke flyttes eller slettes — de følger geometrien. `auto: true` sier fra.
   *
   * @returns {{kind: 'shape'|'joint'|'line', obj: object, auto?: boolean}|null}
   */
  entityById(id) {
    const e = super.entityById(id);
    if (e) return e;
    const a = this.allJoints().find((x) => x.id === id && x.auto);
    if (a) return { kind: 'joint', obj: a, auto: true };
    return null;
  }

  /** Tegnede og automatiske skjøter (#61). */
  allJoints() {
    return effectiveJoints(this.state);
  }

  /** Bare skjøtene i utvalget. Motstykket til `selectedShapes()`. */
  selectedJoints() {
    const set = new Set(this.state.selection);
    return this.state.joints.filter((j) => set.has(j.id));
  }

  /**
   * Skjøtene som skal FØLGE MED når `ids` flyttes, uten selv å være markert.
   *
   * En skjøt er en fuge mellom materiale, ikke en fritt svevende strek. Blir
   * den liggende igjen når geometrien flyttes, glir modellen og skjøtene fra
   * hverandre — og resultatet blir stille feil, ikke synlig feil. Samtidig må
   * det fortsatt gå an å flytte en skjøt alene, og å flytte én del bort fra en
   * annen (da endrer fugen seg reelt). Regelen som balanserer dette:
   *
   *  - Er skjøten selv markert, er den allerede med i utvalget — ikke her.
   *  - Ligger ALT materialet på BEGGE sider av linja i `ids`, følger skjøten
   *    med. Dette dekker både «flytt hele tverrsnittet» og «snitt i én udelt
   *    form» (der begge sider er samme form).
   *  - Er bare den ene siden med, blir skjøten stående: fugen endrer seg da
   *    reelt, og verktøyet skal ikke gjette hvor den nye fugen havner.
   *  - En side uten materiale (linja stikker ut i lufta) teller som «med»,
   *    slik at en skjøt i ytterkant følger delen den faktisk ligger inntil.
   *    Ligger BEGGE sider i tomrom, hører skjøten ingen steder og blir stående.
   *
   * @param {Array<string>} ids
   * @returns {Array<string>} skjøte-id-er
   */
  jointsFollowing(ids) {
    const set = new Set(ids);
    const candidates = this.state.joints.filter((j) => !set.has(j.id));
    if (!candidates.length) return [];
    const shapes = this.state.shapes;
    const tol = neighborTolerance(shapes);
    const out = [];
    for (const j of candidates) {
      const { aSide, bSide } = sidesOfJoint(j, shapes, tol);
      // null = ingen former på denne siden, true/false = flyttes hele siden?
      const moves = (side) => (side.length ? side.every((id) => set.has(id)) : null);
      const a = moves(aSide);
      const b = moves(bSide);
      if (a === null && b === null) continue; // ligger i rent tomrom
      if (a === false || b === false) continue; // en side blir stående igjen
      out.push(j.id);
    }
    return out;
  }

  /** `ids` pluss skjøtene som følger med dem (se `jointsFollowing`). */
  withFollowingJoints(ids) {
    return [...ids, ...this.jointsFollowing(ids)];
  }

  /** cad2d-kroken: det som følger med en flytting er skjøtene. */
  withFollowing(ids) {
    return this.withFollowingJoints(ids);
  }

  followedNoun(n) {
    return n === 1 ? 'skjøt' : 'skjøter';
  }

  /* ---------------- skjøter (§4, §6.2) ---------------- */

  getJoint(id) {
    return this.allJoints().find((j) => j.id === id) || null;
  }

  /**
   * Legger inn en ny skjøt. Autonavnes etter delene den skiller (§6.2), med
   * mindre `opts.name` er gitt eksplisitt — brukeren skal aldri få navnet sitt
   * overskrevet av en senere geometriendring (det er `updateJoint` sin jobb å
   * la stå urørt, ikke denne).
   */
  addJoint(a, b, opts = {}) {
    const shapes = this.state.shapes;
    const joint = {
      id: this.nextId('j'),
      name: opts.name || autoJointName(a, b, shapes),
      a: [a[0], a[1]],
      b: [b[0], b[1]],
      share: null,
      qT: 0,
      connector: defaultConnector(),
    };
    this.mutate((st) => {
      st.joints.push(joint);
    }, { reason: 'joint' });
    return joint;
  }

  updateJoint(id, patch, opts = {}) {
    this.mutate((st) => {
      const j = st.joints.find((x) => x.id === id);
      if (j) {
        Object.assign(j, patch);
        return;
      }
      // Automatisk skjøt: bare det brukeren kan endre, lagret under id-en.
      if (String(id).startsWith('auto:')) {
        if (!st.autoJointData) st.autoJointData = {};
        const cur = st.autoJointData[id] || {};
        const keep = {};
        for (const k of ['name', 'share', 'qT', 'connector']) if (k in patch) keep[k] = patch[k];
        st.autoJointData[id] = { ...cur, ...keep };
      }
    }, opts);
  }

  removeJoint(id) {
    if (String(id).startsWith('auto:')) return; // følger geometrien, kan ikke slettes
    this.mutate((st) => {
      st.joints = st.joints.filter((j) => j.id !== id);
    }, { reason: 'joint' });
  }

  /* ---------------- beregningsinnstillinger ---------------- */

  /** «Snitt» eller «Linje» i Forsterkning-fanen. */
  setAnalysis(mode) {
    this.mutate((st) => {
      st.analysis = mode === 'line' ? 'line' : 'section';
    }, { reason: 'analysis' });
  }

  /** Flettes inn i `state.line`, som `setLoads`. */
  setLine(patch) {
    this.mutate((st) => {
      st.line = migrateLine({ ...(st.line || defaultLine()), ...(patch || {}) });
    }, { reason: 'line' });
  }

  /**
   * Globale lastdata for forsterkningsberegningen (v4, biaksiell — §1 i
   * samvirkeplanen). `patch.before` og `patch.after` slås sammen felt-for-felt
   * inn i den eksisterende lasttilstanden `{Vy,Vx,N,Mx,My}`, slik at
   * `setLoads({ after: { Vy: 100 } })` ikke nullstiller `after.N`/`after.Mx`.
   */
  setLoads(patch) {
    this.mutate((st) => {
      if (patch && patch.before) Object.assign(st.loads.before, patch.before);
      if (patch && patch.after) Object.assign(st.loads.after, patch.after);
      if (patch && patch.L !== undefined) st.loads.L = patch.L;
    }, { reason: 'loads', transient: true });
    this.commit('loads');
  }

  /* ---------------- prosjektfila ---------------- */

  toJSON() {
    return JSON.stringify(
      {
        format: 'structural_tools.geometry_workspace',
        version: 4,
        title: this.state.title,
        unit: this.state.unit,
        mode: this.state.mode,
        reference: this.state.reference,
        grid: this.state.grid,
        snaps: this.state.snaps,
        ortho: this.state.ortho,
        underlay: this.state.underlay,
        shapes: this.state.shapes,
        joints: this.state.joints,
        loads: this.state.loads,
        analysis: this.state.analysis,
        line: this.state.line,
        autoJointData: this.state.autoJointData,
        lines: this.state.lines,
        linesVisible: this.state.linesVisible,
      },
      null,
      2
    );
  }

  fromJSON(text) {
    const data = typeof text === 'string' ? JSON.parse(text) : structuredClone(text);
    if (!data || !Array.isArray(data.shapes)) throw new Error('Ugyldig fil: mangler "shapes"');
    this.mutate((st) => {
      st.shapes = data.shapes.map((s, i) =>
        // migrateShape fyller inn stage og material for filer fra versjon 1
        migrateShape({
          id: s.id || `s${i + 1}`,
          name: s.name || `Form ${i + 1}`,
          points: (s.points || []).map((p) => [Number(p[0]), Number(p[1])]),
          role: s.role === 'void' ? 'void' : 'solid',
          factor: Number.isFinite(s.factor) ? s.factor : 1,
          include: s.include !== false,
          color: s.color || PALETTE[i % PALETTE.length],
          meta: s.meta || null,
          stage: s.stage,
          material: s.material,
        })
      );
      st.selection = [];
      st.reference = data.reference || [0, 0];
      st.mode = data.mode === 'priority' ? 'priority' : 'sum';
      st.unit = data.unit || 'mm';
      st.title = data.title || '';
      const m = this._migrate(data);
      if (m.grid) Object.assign(st.grid, m.grid);
      if (m.snaps) Object.assign(st.snaps, m.snaps);
      st.ortho = !!m.ortho;
      st.underlay = m.underlay || null;
      st.joints = m.joints;
      st.loads = m.loads;
      st.analysis = m.analysis;
      st.line = m.line;
      st.autoJointData = m.autoJointData;
      st.lines = m.lines;
      st.linesVisible = m.linesVisible;
    }, { reason: 'import' });
    this.syncUid();
  }
}

export const store = new Store();
