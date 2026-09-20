/**
 * materials.js — betong- og armeringskvaliteter med AVLEDEDE verdier.
 *
 * HVORFOR DENNE FILA FINNES
 * Motoren (`structuralcodes`) regner selv ut `fcd`, `fyd`, `ftd`, `epsyd`,
 * `epsud` og tøyningsgrensene. Gjør UI-en og rapporten det samme på egen hånd,
 * står vi med to tallsett som kan sprike uten at noe feiler — brukeren leser
 * `fcd = 17,0` i skjemaet mens motoren regner med 20,0. Denne fila er derfor
 * den ENE JS-siden kilden til de avledede verdiene, og formlene er EC2-2004
 * tabell 3.1 / 3.2 — nøyaktig de `structuralcodes` bruker (verifisert mot
 * `docs/structuralcodes-api-reference.md` §4 og resultatfixturene).
 *
 * INVARIANTEN SOM BESKYTTES HER
 * Tøyningsgrensene er LOVAVHENGIGE (plan §3.6): `parabolarectangle` bruker
 * `eps_c2`/`eps_cu2`, `bilinearcompression` bruker `eps_c3`/`eps_cu3`. Derfor
 * returneres både VERDIEN og NAVNET. Uten navnet trykker rapporten «ε_cu2 =
 * 0,0035» selv når motoren faktisk brukte ε_cu3 — riktig tall, feil merkelapp,
 * og ingen måte å oppdage det på.
 *
 * `sargin` er bevisst IKKE tilbudt (plan §1.2): den bygger på `fcm`, ikke
 * `fcd`, og hører ikke hjemme i et ULS-verktøy. Ikke legg den inn igjen.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

/** Standard EC2-fasthetsklasser. `fck` er et TALL — aldri strengen 'C30/37'. */
export const CONCRETE_GRADES = [
  { label: 'C12/15', fck: 12 },
  { label: 'C16/20', fck: 16 },
  { label: 'C20/25', fck: 20 },
  { label: 'C25/30', fck: 25 },
  { label: 'C30/37', fck: 30 },
  { label: 'C35/45', fck: 35 },
  { label: 'C40/50', fck: 40 },
  { label: 'C45/55', fck: 45 },
  { label: 'C50/60', fck: 50 },
  { label: 'C55/67', fck: 55 },
  { label: 'C60/75', fck: 60 },
  { label: 'C70/85', fck: 70 },
  { label: 'C80/95', fck: 80 },
  { label: 'C90/105', fck: 90 },
];

/**
 * Rissviddegrense per eksponeringsklasse [mm], for slakkarmert betong under
 * tilnærmet permanent last, med den verdien EC2 7.3.1(5) anbefaler DER den
 * anbefaler en (global-devspecs/concrete_section_calculator-sls.md §11).
 * Dette er VÅR egen parameterliste med egne etiketter og en punktreferanse —
 * ingen kolonneoverskrift, fotnote eller merknad er kopiert fra standarden.
 *
 * `w_max: null` betyr at EC2 IKKE anbefaler noen verdi for den klassen (i dag
 * bare XD3 — se §11 for hvorfor den likevel blir stående i lista i stedet for
 * å fjernes). Kontrollen blir da ubesvart (`null`), ikke bestått.
 *
 * `longitudinal_crack_check` merker klassene EC2 7.2(2) krever
 * betongtrykkspenningskontroll for (XD/XF/XS-familien).
 */
export const EXPOSURE_CLASSES = Object.freeze([
  { value: 'X0',  w_max: 0.40, appearance_only: true,  longitudinal_crack_check: false },
  { value: 'XC1', w_max: 0.40, appearance_only: true,  longitudinal_crack_check: false },
  { value: 'XC2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XC3', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XC4', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XD1', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XD2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  // EC2 anbefaler INGEN rissviddegrense for XD3 for slakkarmert betong (§11).
  { value: 'XD3', w_max: null, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS1', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS3', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
]);

/**
 * STANDARDVERDIENE FOR BRUKSGRENSE — ÉN kilde (spec §4/§6.1).
 *
 * Disse fire tallene sto tidligere skrevet ut i FIRE filer: `defaultState()` og
 * `enforceSlsParams()` i `store.js`, `slsLimits()` her, og `_compute_sls()` i
 * `engine.py`. Fire kopier av det samme tallet er den feilformen modulen har
 * blitt bitt av i hver eneste runde: den som retter 0,45 til noe annet retter
 * to av dem, og de to andre står igjen og motsier resultatet uten å feile.
 *
 * Nå leser JS-siden dem herfra. `engine.py` har sin egen mirror med en
 * kommentar som sier hva den er til for — den er BARE en livline for den som
 * kaller motoren direkte, for `payload.js` sender alltid alle fire.
 *
 * Faktorene er EC2 7.2 sine anbefalte verdier (k1 = 0,6, k2 = 0,45, k3 = 0,8);
 * `phi_ef = 2.0` er et vanlig utgangspunkt for innendørs betong, ikke en
 * standardverdi fra noen tabell, og skal derfor kunne endres.
 */
export const SLS_DEFAULTS = Object.freeze({
  // Livlina når φ IKKE lar seg utlede. Den skal aldri nås i produktet:
  // `enforceSlsParams` holder krypinndataene gyldige, og `validate()` stopper
  // en geometri som ikke gir en `h₀`. Den står som siste skanse, og `engine.py`
  // speiler den for den som kaller motoren direkte.
  phi_ef: 2.0,
  sigma_c_char_factor: 0.6,
  sigma_c_qp_factor: 0.45,
  sigma_s_char_factor: 0.8,
});

/**
 * Standardene for krypberegningen (EC2 tillegg B).
 *
 * RH 50 % er innendørs, som er der de fleste bjelker og dekker står. t₀ = 28
 * døgn er den vanlige referansealderen. Levetiden er 50 år — brukskategorien i
 * EN 1990 tabell 2.1 for bygninger — oppgitt i DØGN, fordi det er enheten hele
 * tillegg B regner i og en omregning på veien er et sted å ta feil.
 *
 * Disse gir φ ≈ 2,35 for en bjelke 300×600 i C30/37. Den gamle FASTE
 * standarden var 2,0, altså litt på usikker side for nettopp det snittet — og
 * det er hele grunnen til at tallet nå utledes i stedet for å gjettes.
 */
export const CREEP_DEFAULTS = Object.freeze({
  RH: 50,
  t0: 28,
  t_life: 50 * 365,
  cement: 'N',
});

/**
 * Kryptallet som SKAL BRUKES, og hvor det kom fra.
 *
 * ÉN kilde. `payload.js` sender tallet herfra til motoren, og `ui.js` viser
 * nøyaktig det samme tallet i skjemaet — det finnes altså ingen vei der
 * skjermen kan vise 2,35 mens beregningen bruker 2,0. Samme grep som
 * `slsLimits()` er for `w_max`.
 *
 * `source: 'manual'` når brukeren har skrevet sitt eget φ. Overstyringen er
 * IKKE en nødløsning: kryptall fra en rapport eller et prosjektkrav er et helt
 * legitimt utgangspunkt, og et verktøy som insisterer på sin egen utledning er
 * et verktøy man forlater.
 *
 * @returns {{phi:number|null, source:'manual'|'derived'|null, reason:string|null, chain:object|null}}
 */
export function resolveCreep(state = {}) {
  const sls = state.sls || {};
  const override = num(sls.phi_ef);
  if (Number.isFinite(override) && override >= 0) {
    return { phi: override, source: 'manual', reason: null, chain: null };
  }
  const h0 = Number.isFinite(num(sls.h0_override)) && num(sls.h0_override) > 0
    ? num(sls.h0_override)
    : notionalSize(state);
  const chain = creepCoefficient({
    fck: num(state.concrete?.fck),
    h0,
    RH: num(sls.RH),
    t0: num(sls.t0),
    t: num(sls.t_life),
    cement: sls.cement,
  });
  if (chain.phi === null) return { phi: null, source: null, reason: chain.reason, chain: null };
  return { phi: chain.phi, source: 'derived', reason: null, chain: { ...chain, h0 } };
}

/** Armeringskvaliteter. `k = f_tk/f_yk` er duktilitetsklassen (EC2 tillegg C). */
export const STEEL_GRADES = [
  { label: 'B500NC (k = 1.08)', fyk: 500, k: 1.08, epsuk: 0.075 },
  { label: 'B500NB (k = 1.08)', fyk: 500, k: 1.08, epsuk: 0.05 },
  { label: 'B500NA (k = 1.05)', fyk: 500, k: 1.05, epsuk: 0.025 },
];

/**
 * Arbeidsdiagram for betong. `sargin` og `popovics` finnes i pakken, men
 * tilbys ikke — se hodekommentaren.
 */
export const CONCRETE_LAWS = [
  { value: 'parabolarectangle', label: 'Parabola–rectangle (EC2 3.1.7(1))' },
  { value: 'bilinearcompression', label: 'Bilinear (EC2 3.1.7(2))' },
];

/** Arbeidsdiagram for armering. `elasticplastic` = med fasthetsøkning. */
export const STEEL_LAWS = [
  { value: 'elasticperfectlyplastic', label: 'Ideally elastoplastic (horizontal branch)' },
  { value: 'elasticplastic', label: 'With strain hardening (rising branch to ε_ud)' },
];

/* ================================================================== *
 * KRYPTALLET — EC2 tillegg B
 *
 * HVORFOR DETTE ER SKREVET I JS NÅR `structuralcodes` HAR DET I PYTHON
 * `φ` må vises LEVENDE mens brukeren skriver RH og t₀ — altså før motoren
 * har kjørt én gang. Et tall som først dukker opp etter en Pyodide-runde er
 * ikke et felt man kan justere seg fram med; det er en gjetning etterfulgt av
 * en venting.
 *
 * Det er den samme arbeidsdelingen resten av modulen allerede har:
 * `payload.js` gjør ALT av utledning, `engine.py` gjør INGENTING. `w_max` og
 * `sigma_c_char_required` utledes her, av nøyaktig samme grunn.
 *
 * MEN DA EIER VI FORMLENE, og noe må holde dem i takt med pakka. Det noe er
 * `tests/fixtures/creep-ec2-annexb.json`: 120 punkter regnet av
 * `structuralcodes` selv, frosset, og prøvd mot denne koden i hvert punkt
 * (`tests/materials.test.mjs`). Flytter et tall seg der, er det en regresjon
 * og ikke en oppdatering. Det er samme grep som `engine.py` bruker for
 * lign. 7.9, som også er skrevet ut for hånd og låst mot pakkens orakel.
 * ================================================================== */

/**
 * Sementklassen, og eksponenten den gir i EC2 (B.9). Den flytter BARE den
 * justerte belastningsalderen `t₀,adj` — ingenting annet i kjeden.
 */
export const CEMENT_CLASSES = Object.freeze([
  { value: 'S', alpha: -1, label: 'S — slow (CEM 32.5 N)' },
  { value: 'N', alpha: 0, label: 'N — normal (CEM 32.5 R, 42.5 N)' },
  { value: 'R', alpha: 1, label: 'R — rapid (CEM 42.5 R, 52.5 N/R)' },
]);

/**
 * Den effektive tykkelsen h₀ = 2·A_c/u [mm] (EC2 3.1.4(5)).
 *
 * `u` er omkretsen som TØRKER, ikke hele omkretsen — og det er en
 * modellvurdering, ikke en avledning. Standardene her:
 *
 *   bjelke: alle fire flater, u = 2(b + h). En fritt eksponert bjelke.
 *   plate:  over og under, u = 2·1000 per meter. Kantene er ikke med, fordi
 *           en plate per meter ikke HAR kanter — den er et utsnitt av noe
 *           bredere. Det gir h₀ = h eksakt, som er den vanlige forenklingen.
 *
 * Er dekket over av en membran eller støpt mot grunn, tørker færre flater og
 * h₀ blir større; derfor kan tallet overstyres i skjemaet.
 */
export function notionalSize(state = {}) {
  const geometry = state.geometry || {};
  const h = num(geometry.h);
  if (!Number.isFinite(h) || h <= 0) return NaN;
  if (state.sectionType === 'slab') return h;
  const b = num(geometry.b);
  if (!Number.isFinite(b) || b <= 0) return NaN;
  return (2 * b * h) / (2 * (b + h));
}

/**
 * Kryptallet φ(t, t₀) etter EC2 tillegg B, med hele kjeden ut.
 *
 * Returnerer `{ phi: null, reason }` når inndataene ikke gir en beregning —
 * ALDRI et tall som later som. `reason` er en kode `results.js` oversetter,
 * samme tre-verdi-regel som resten av bruksgrensekapittelet.
 *
 * DEN ENE KANTEN SOM MÅ VOKTES: `t = t₀` gir β_c = 0 og dermed φ = 0, altså
 * en beregning uten kryp i det hele tatt. Det er matematisk riktig — ved
 * påføringsøyeblikket har ingenting krøpet — men som INNDATA er det nesten
 * alltid en skrivefeil, og et stille φ = 0 ville gjort en tilnærmet permanent
 * kontroll om til en korttidskontroll uten å si fra. Derfor er `t > t₀` et
 * krav her, ikke en advarsel.
 *
 * @param {{fck:number,h0:number,RH:number,t0:number,t:number,cement:string}} o
 */
export function creepCoefficient(o = {}) {
  const fck = num(o.fck);
  const h0 = num(o.h0);
  const RH = num(o.RH);
  const t0 = num(o.t0);
  const t = num(o.t);
  const cls = CEMENT_CLASSES.find((c) => c.value === String(o.cement || '').toUpperCase());

  const bad = (reason) => ({ phi: null, reason });
  if (!Number.isFinite(fck) || fck <= 0) return bad('creep_invalid_fck');
  if (!Number.isFinite(h0) || h0 <= 0) return bad('creep_invalid_h0');
  // RH = 100 % gir (1 − RH/100) = 0 og et φ_RH som ikke betyr noe fysisk;
  // under vann kryper betong etter en annen modell enn tillegg B.
  if (!Number.isFinite(RH) || RH <= 0 || RH >= 100) return bad('creep_invalid_rh');
  if (!Number.isFinite(t0) || t0 <= 0) return bad('creep_invalid_t0');
  if (!Number.isFinite(t) || t <= t0) return bad('creep_life_not_after_loading');
  if (!cls) return bad('creep_invalid_cement');

  const fcm = fck + 8;
  // (B.9). Gulvet på 0,5 døgn er pakkens og standardens: en betong lastet
  // tidligere enn et halvt døgn er utenfor modellen, ikke inne i den.
  const t0adj = Math.max(t0 * Math.pow(9 / (2 + Math.pow(t0, 1.2)) + 1, cls.alpha), 0.5);

  const alpha1 = Math.pow(35 / fcm, 0.7);
  const alpha2 = Math.pow(35 / fcm, 0.2);
  const alpha3 = Math.pow(35 / fcm, 0.5);

  // (B.3). GRENVALGET på f_cm = 35 er ekte: over den grensa kommer α₁ og α₂
  // inn, under den er de ikke med i det hele tatt.
  const rhTerm = (1 - RH / 100) / (0.1 * Math.pow(h0, 1 / 3));
  const phi_RH = fcm <= 35 ? 1 + rhTerm : (1 + rhTerm * alpha1) * alpha2;

  const beta_fcm = 16.8 / Math.sqrt(fcm);          // (B.4)
  const beta_t0 = 1 / (0.1 + Math.pow(t0adj, 0.2)); // (B.5)
  const phi_0 = phi_RH * beta_fcm * beta_t0;        // (B.2)

  // (B.8a/b), samme gren på f_cm = 35, og samme tak på 1500 (·α₃ over grensa).
  const rhAge = 1.5 * (1 + Math.pow(0.012 * RH, 18)) * h0;
  const beta_H = fcm <= 35
    ? Math.min(rhAge + 250, 1500)
    : Math.min(rhAge + 250 * alpha3, 1500 * alpha3);

  const tLoad = Math.max(t - t0adj, 0);
  const beta_c = Math.pow(tLoad / (beta_H + tLoad), 0.3);  // (B.7)

  return {
    phi: phi_0 * beta_c,                                    // (B.1)
    reason: null,
    fcm, t0_adj: t0adj, alpha_1: alpha1, alpha_2: alpha2, alpha_3: alpha3,
    phi_RH, beta_fcm, beta_t0, phi_0, beta_H, beta_c,
  };
}

/** Standarddiameter for armering [mm]. */
export const BAR_DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32];

/** Sikker tallkonvertering: tomt felt og søppel blir `NaN`, ikke 0. */
function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/* ================================================================== *
 * Å KJENNE IGJEN EN KVALITET (runde 6 §2.2)
 * ================================================================== */

/**
 * RELATIV toleranse, ikke absolutt: `fyk` er 500 og `epsuk` er 0,075 — fire
 * tierpotenser fra hverandre. En absolutt toleranse måtte enten vært for
 * slapp for tøyningen eller for stram for fastheten.
 *
 * 1e-9 ligger sju tierpotenser over flyttallsstøyen (~1e-16 relativt) og seks
 * under den minste ekte forskjellen i tabellene (k = 1,05 mot 1,08, altså
 * ~3 %). Ingen ekte kvalitetsforskjell kan gjemme seg under den, og ingen
 * JSON-tur kan sprenge den.
 */
export const GRADE_MATCH_TOL = 1e-9;

/** Er `a` den samme verdien som referansen `b`, sett bort fra flyttallsstøy? */
function nearly(a, b) {
  const x = num(a);
  if (!Number.isFinite(x)) return false;
  // `Math.max(1, |b|)` gjør at et referansetall nær null ikke gir en toleranse
  // nær null. Ingen av dagens tall er det, men regelen skal tåle at en
  // kvalitet med en verdi nær 0 en dag legges inn i tabellen.
  return Math.abs(x - b) <= GRADE_MATCH_TOL * Math.max(1, Math.abs(b));
}

/**
 * Hvilken armeringskvalitet tilstanden TILSVARER — eller `null` for «Custom».
 *
 * HVORFOR DENNE FINNES
 * Brikkeraden skrev `fyk`, `k` og `epsuk` samtidig som `k` og `ε_uk` hadde
 * sine EGNE felt rett under. To skrivere til samme verdi: valgte man B500NA
 * ble `ε_uk` stille flyttet fra 7,5 % til 2,5 % uten at noe sa det, og skrev
 * man et eget `k` i feltet sto brikken igjen og påsto en kvalitet tilstanden
 * ikke lenger hadde.
 *
 * Her snus forholdet: TILSTANDEN er kilden, kvaliteten er en AVLEDNING av
 * den. Nedtrekket viser det denne funksjonen finner. Da finnes det ingenting
 * å holde synkronisert, og ingen tilstand der de to påstår hver sin ting.
 *
 * SAMMENLIKNINGEN ER IKKE `===`. Verdiene tar en tur gjennom JSON ved lagring
 * og lasting, og gjennom uttrykksfeltene (`0.075` skrevet som `7.5/100`), og
 * kommer da fort tilbake som 0.07500000000000001. Med `===` ville en lagret
 * fil av B500NC blitt lest tilbake som «Custom» — nøyaktig den formen for feil
 * ingen oppdager før noen lurer på hvorfor nedtrekket «glemte» seg.
 *
 * @param {{fyk:number, k:number, epsuk:number}} steel
 * @returns {{label:string, fyk:number, k:number, epsuk:number}|null}
 */
export function matchSteelGrade(steel = {}) {
  return STEEL_GRADES.find(
    (g) => nearly(steel.fyk, g.fyk) && nearly(steel.k, g.k) && nearly(steel.epsuk, g.epsuk)
  ) || null;
}

/**
 * Hvilken fasthetsklasse `fck` tilsvarer, eller `null`.
 *
 * Samme rolle som `matchSteelGrade`, og den står her av samme grunn: både
 * nedtrekket og sammendragslinja over materialseksjonen trenger navnet på
 * klassen, og to `CONCRETE_GRADES.find(...)` i to filer er to steder regelen
 * kan bli endret bare det ene stedet.
 *
 * @param {number} fck
 * @returns {{label:string, fck:number}|null}
 */
export function matchConcreteGrade(fck) {
  return CONCRETE_GRADES.find((g) => nearly(fck, g.fck)) || null;
}

/** EC2 tabell 3.1: `f_cm = f_ck + 8` [MPa]. */
export function fcm(fck) {
  return num(fck) + 8;
}

/** EC2 tabell 3.1: middelverdi av strekkfastheten [MPa]. */
export function fctm(fck) {
  const f = num(fck);
  // Over C50/60 flater kurven ut — logaritmisk uttrykk, ikke potensen.
  return f <= 50 ? 0.3 * Math.pow(f, 2 / 3) : 2.12 * Math.log(1 + fcm(f) / 10);
}

/** EC2 tabell 3.1: sekantmodul [MPa]. */
export function Ecm(fck) {
  return 22000 * Math.pow(fcm(fck) / 10, 0.3);
}

/**
 * Tøyningsgrensene for valgt betonglov. Returnerer NAVNENE også — se
 * hodekommentaren for hvorfor det ikke er pynt.
 *
 * @param {number} fck
 * @param {'parabolarectangle'|'bilinearcompression'} law
 * @returns {{eps_c: number, eps_cu: number, eps_c_name: string, eps_cu_name: string}}
 */
export function concreteStrainLimits(fck, law) {
  const f = num(fck);
  // EC2 tabell 3.1. Under C50/60 er alle fire konstante; formlene under gir
  // nøyaktig de konstantene der, så ingen grenfeil på vanlige kvaliteter.
  const eps_cu_high = f <= 50 ? 0.0035 : (2.6 + 35 * Math.pow((90 - f) / 100, 4)) / 1000;
  if (law === 'bilinearcompression') {
    return {
      eps_c: f <= 50 ? 0.00175 : (1.75 + 0.55 * ((f - 50) / 40)) / 1000,
      eps_cu: eps_cu_high,
      eps_c_name: 'eps_c3',
      eps_cu_name: 'eps_cu3',
    };
  }
  return {
    eps_c: f <= 50 ? 0.002 : (2.0 + 0.085 * Math.pow(f - 50, 0.53)) / 1000,
    eps_cu: eps_cu_high,
    eps_c_name: 'eps_c2',
    eps_cu_name: 'eps_cu2',
  };
}

/**
 * Avledede betongverdier.
 * @param {{fck:number, gamma_c:number, alpha_cc:number, law:string}} concrete
 */
export function concreteProps(concrete = {}) {
  const fck = num(concrete.fck);
  const gamma_c = num(concrete.gamma_c);
  const alpha_cc = num(concrete.alpha_cc);
  const law = concrete.law || 'parabolarectangle';
  const limits = concreteStrainLimits(fck, law);
  return {
    fck,
    fcm: fcm(fck),
    fctm: fctm(fck),
    Ecm: Ecm(fck),
    alpha_cc,
    gamma_c,
    // `structuralcodes`: fcd() = alpha_cc * fck / gamma_c. Verifisert 20,0 MPa
    // for C30/37 med alpha_cc = 1,0 (fixturene).
    fcd: (alpha_cc * fck) / gamma_c,
    law_concrete: law,
    ...limits,
  };
}

/**
 * `f_tk = k · f_yk`. `k` er ALLTID satt (plan §3.6): `ftk` har ingen
 * standardverdi i `ReinforcementEC2_2004`, og `check_axial_load` — som kjøres
 * før hver bøyeberegning — bruker den til `n_max`. Er den ikke med, krasjer
 * motoren for BEGGE arbeidsdiagram, ikke bare det med fasthetsøkning.
 */
export function ftkOf(steel = {}) {
  return num(steel.k) * num(steel.fyk);
}

/**
 * Avledede armeringsverdier.
 * @param {{fyk:number, Es:number, k:number, epsuk:number, gamma_eps:number, gamma_s:number, law:string}} steel
 */
export function steelProps(steel = {}) {
  const fyk = num(steel.fyk);
  const Es = num(steel.Es);
  const k = num(steel.k);
  const epsuk = num(steel.epsuk);
  const gamma_eps = num(steel.gamma_eps);
  const gamma_s = num(steel.gamma_s);
  const ftk = k * fyk;
  const fyd = fyk / gamma_s;
  return {
    fyk,
    ftk,
    k,
    Es,
    gamma_s,
    gamma_eps,
    law_steel: steel.law || 'elasticperfectlyplastic',
    fyd,
    ftd: ftk / gamma_s,
    // `epsyd` er en EGENSKAP i pakken og er definert som fyd()/Es.
    eps_yd: fyd / Es,
    eps_uk: epsuk,
    // `epsud() = epsuk * gamma_eps`. gamma_eps må ligge i tilstanden, ellers
    // bruker motoren stille 0,9 mens rapporten trykker noe annet (plan §3.6).
    eps_ud: epsuk * gamma_eps,
  };
}

/**
 * Alle materialverdier samlet, med SAMME feltnavn som `result.materials`
 * (plan §5.2). Rapporten kan dermed bruke samme kode før og etter en kjøring,
 * og en drift mellom JS-siden og motoren blir synlig som en tallforskjell i
 * ett og samme felt i stedet for å gjemme seg i to ulike strukturer.
 *
 * @param {object} state
 */
export function derivedMaterials(state = {}) {
  return {
    ...concreteProps(state.concrete),
    ...steelProps(state.steel),
  };
}

/**
 * Avleder `w_max` og de tre 7.2-grensene fra `state.sls`, SAMME mønster som
 * `f_cd`/`f_yd`: brukeren ser tallet før en kjøring, og override vinner over
 * klassen (§11, §5). Motoren slår ALDRI opp en klasse — den får bare tallene
 * herfra, via `payload.sls` (§4) — dette er derfor den ENE JS-siden kilden
 * til hvilken klasse som gir hvilken grense.
 *
 * Override vinner over klassen, OGSÅ over en klasse med `w_max: null`
 * (XD3). Uten klasse: `w_max_reason: 'no_exposure_class'`. Med en klasse som
 * IKKE har noen anbefalt grense og ingen override: `w_max_reason:
 * 'no_crack_width_limit'` (AC14 — de to grunnene skal IKKE forveksles).
 *
 * `sigma_c_char_required` er TREVERDIG (§2.1, §4): `null` uten klasse, ellers
 * klassens `longitudinal_crack_check`.
 *
 * @param {object} state
 */
export function slsLimits(state = {}) {
  const sls = state.sls || {};
  const cls = EXPOSURE_CLASSES.find((c) => c.value === sls.exposure_class) || null;
  const override = Number(sls.w_max_override);
  const hasOverride = Number.isFinite(override) && override > 0;

  let w_max = null;
  let w_max_source = null;
  let w_max_reason = null;
  if (hasOverride) {
    w_max = override;
    w_max_source = 'manual';
  } else if (cls && cls.w_max != null) {
    w_max = cls.w_max;
    w_max_source = 'class';
  } else if (cls) {
    w_max_reason = 'no_crack_width_limit';
  } else {
    w_max_reason = 'no_exposure_class';
  }

  // INGEN SPENNINGSGRENSER HER. Funksjonen regnet tidligere ut `0.6·f_ck`,
  // `0.45·f_ck` og `0.8·f_yk` — og ingen leste dem: `payload.js` sender
  // FAKTORENE, og motoren ganger dem med sine egne `f_ck`/`f_yk`. Tre tall
  // som så ut som beregningens tall, men ikke var det, er nøyaktig den
  // dobbeltkilden som har bitt modulen i hver runde. De er borte; grensene
  // finnes ett sted, i `result.sls.limits`, regnet av motoren.
  return {
    w_max,
    w_max_source,
    w_max_reason,
    // `null` når ingen klasse er valgt — 7.2(2) er da ubesvart, ikke
    // «gjelder ikke» (§4, §5).
    sigma_c_char_required: cls ? cls.longitudinal_crack_check : null,
  };
}
