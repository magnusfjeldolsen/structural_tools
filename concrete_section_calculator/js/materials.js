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

/** Armeringskvaliteter. `k = f_tk/f_yk` er duktilitetsklassen (EC2 tillegg C). */
export const STEEL_GRADES = [
  { label: 'B500NC (k = 1,08)', fyk: 500, k: 1.08, epsuk: 0.075 },
  { label: 'B500NB (k = 1,08)', fyk: 500, k: 1.08, epsuk: 0.05 },
  { label: 'B500NA (k = 1,05)', fyk: 500, k: 1.05, epsuk: 0.025 },
];

/**
 * Arbeidsdiagram for betong. `sargin` og `popovics` finnes i pakken, men
 * tilbys ikke — se hodekommentaren.
 */
export const CONCRETE_LAWS = [
  { value: 'parabolarectangle', label: 'Parabel–rektangel (EC2 3.1.7(1))' },
  { value: 'bilinearcompression', label: 'Bilineær (EC2 3.1.7(2))' },
];

/** Arbeidsdiagram for armering. `elasticplastic` = med fasthetsøkning. */
export const STEEL_LAWS = [
  { value: 'elasticperfectlyplastic', label: 'Ideelt elastoplastisk (horisontal gren)' },
  { value: 'elasticplastic', label: 'Med fasthetsøkning (stigende gren til ε_ud)' },
];

/** Standarddiameter for armering [mm]. */
export const BAR_DIAMETERS = [6, 8, 10, 12, 16, 20, 25, 32];

/** Sikker tallkonvertering: tomt felt og søppel blir `NaN`, ikke 0. */
function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
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
