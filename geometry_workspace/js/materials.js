/**
 * materials.js — materialpresets for forsterkningsberegningen.
 *
 * Ingen DOM, ingen store. Modulen inneholder bare tall og oppslag.
 *
 * ENHETER
 *  - `E` er elastisitetsmodulen i **N/mm² (MPa)**. Hele mekanikken i
 *    `reinforcement.js` regner i N og mm, så E skal ALDRI oppgis i GPa her.
 *  - `rho` er densiteten i **kg/m³**, og bare der den betyr noe: EC5 tabell 7.1
 *    (`ec5Kser()` i `connection-stiffness.js`) er den eneste forbrukeren.
 *    Derfor har bare trevirket `rho`; stål, betong, CFRP og aluminium lar den
 *    stå `undefined` framfor å bære et tall ingen formel her bruker.
 *
 * ρ_m, IKKE ρ_k — og hvorfor det er viktig
 * ----------------------------------------
 * `rho` er **middeldensiteten `ρ_mean`** fra NS-EN 338 (konstruksjonsvirke) og
 * NS-EN 14080 (limtre) — ikke den karakteristiske `ρ_k`. EC5 (7.1) er skrevet
 * med `ρ_m`, og `ec5Kser()` heter allerede `rhoMean` internt. Blander man inn
 * `ρ_k` går det ikke i stykker noe sted; man får bare en `K_ser` som er rundt
 * 20 % for lav, uten at noe varsler om det — og dermed for lav samvirkegrad,
 * for stor beregnet nedbøyning og for lav `(EI)_ef`. Feilen er stille, og det
 * er nettopp derfor den må stå eksplisitt her.
 *
 * MERK: `E` er noe helt annet enn formens `factor` i store.js. `factor` er en
 * generell vektfaktor for tyngdepunktsfanen; forsterkningsberegningen bruker
 * utelukkende `material.E`. De to påvirker ikke hverandre — det er derfor de
 * ligger i hvert sitt felt, og det skal stå i hjelpeteksten.
 *
 * Verdiene er nominelle korttidsverdier fra Eurokodene. For betong er `E`
 * sekantmodulen `E_cm`; skal man regne på langtidslast må brukeren selv sette
 * inn `E_cm/(1+φ)` i det frie E-feltet. For trevirke er `E` middelverdien
 * `E_0,mean` parallelt fiber. Derfor er det frie E-feltet i UI-et ikke en
 * bekvemmelighet, men nødvendig.
 *
 * TO STEDER MED TREDENSITETER — og hvorfor de må stemme overens
 * -------------------------------------------------------------
 * `connection-stiffness.js` har `TIMBER_DENSITIES`, en fyldigere liste
 * (C14…C30, GL24h…GL32h) som brukeren kan slå opp i direkte i skjøtefeltene.
 * Presetene her dekker bare de to kvalitetene som også har en E-verdi, og
 * `rho` her SKAL være samme tall som i den lista. Skulle de sprike, er det
 * `TIMBER_DENSITIES` som er fasit — den ble skrevet først og er fullstendig.
 *
 * Dette er ikke en teoretisk bekymring: første utkast satte C24 til 350, som
 * er `ρ_k`, ikke `ρ_mean` (NS-EN 338 gir C24 `ρ_k = 350`, `ρ_mean = 420`).
 * Feilen var stille — 350 er en fullt plausibel densitet, og ingenting hadde
 * varslet — og ga nøyaktig de ~20 % for lave `K_ser` avsnittet over advarer
 * mot. Endrer man et tall her, kontroller `TIMBER_DENSITIES` i samme slengen.
 */

/**
 * @typedef {Object} Material
 * @property {string} name     Unik nøkkel, brukes i lagret modell (`shape.material.name`)
 * @property {string} label    Kort etikett til nedtrekkslista
 * @property {number} E        Elastisitetsmodul [N/mm²]
 * @property {number} [rho]    Middeldensitet ρ_m [kg/m³] — kun trevirke, se toppen
 * @property {string} group    Gruppering i UI ('Stål' | 'Betong' | 'Tre' | 'Annet')
 */

/** @type {ReadonlyArray<Material>} */
export const MATERIALS = Object.freeze([
  { name: 'S355', label: 'Stål S355', E: 210000, group: 'Stål' },
  { name: 'S235', label: 'Stål S235', E: 210000, group: 'Stål' },
  { name: 'C25/30', label: 'Betong C25/30', E: 31000, group: 'Betong' },
  { name: 'C30/37', label: 'Betong C30/37', E: 33000, group: 'Betong' },
  { name: 'C35/45', label: 'Betong C35/45', E: 34000, group: 'Betong' },
  { name: 'GL30c', label: 'Limtre GL30c', E: 13000, rho: 430, group: 'Tre' },
  { name: 'C24', label: 'Konstruksjonsvirke C24', E: 11000, rho: 420, group: 'Tre' },
  { name: 'CFRP', label: 'CFRP-lamell', E: 165000, group: 'Annet' },
  { name: 'EN AW-6082', label: 'Aluminium EN AW-6082', E: 70000, group: 'Annet' },
].map((m) => Object.freeze(m)));

/**
 * Standardmaterialet nye former får. Samme verdi som §3 i planen krever, slik
 * at migrering av gamle modeller ikke endrer noe tallresultat.
 * @type {Material}
 */
export const DEFAULT_MATERIAL = MATERIALS[0];

const BY_NAME = new Map(MATERIALS.map((m) => [m.name.toLowerCase(), m]));

/**
 * Slår opp et preset på navn.
 *
 * Oppslaget er bevisst tolerant (trimmer og ignorerer store/små bokstaver),
 * fordi navnet kommer fra lagret JSON som kan være håndredigert. Ukjent navn
 * gir `null` — kallende kode skal da beholde den lagrede E-verdien i stedet
 * for å stilltiende bytte materiale under brukeren.
 *
 * @param {string} name
 * @returns {Material|null}
 */
export function materialByName(name) {
  if (typeof name !== 'string') return null;
  return BY_NAME.get(name.trim().toLowerCase()) || null;
}

/**
 * E-modul [N/mm²] for et materialobjekt slik det ligger i store.js
 * (`{ name, E }`). Egen `E` vinner over presetet, slik at et fritt inntastet
 * E-felt ikke overstyres av navnet det tilfeldigvis ble lagret med.
 *
 * @param {{name?: string, E?: number}|null|undefined} material
 * @returns {number} E [N/mm²], `DEFAULT_MATERIAL.E` hvis ingenting er brukbart
 */
export function materialE(material) {
  if (material && Number.isFinite(material.E) && material.E > 0) return material.E;
  const preset = material ? materialByName(material.name) : null;
  return preset ? preset.E : DEFAULT_MATERIAL.E;
}

/**
 * Middeldensitet `ρ_m` [kg/m³] for et materialobjekt slik det ligger i
 * store.js (`{ name, E, rho }`). Samme mønster som `materialE()`: en egen
 * `rho` vinner over presetet, slik at et fritt inntastet felt ikke overstyres
 * av navnet det tilfeldigvis ble lagret med.
 *
 * MEN med én vesentlig forskjell fra `materialE()`: her finnes ingen fornuftig
 * standardverdi. `materialE()` faller tilbake på `DEFAULT_MATERIAL.E` fordi
 * hver form MÅ ha en E for at mekanikken skal kunne regne. Densiteten brukes
 * bare av EC5 tabell 7.1, og for stål og betong finnes den ikke — å gjette
 * ville vært å oppfinne inndata til en formel som ikke gjelder. Derfor
 * `undefined` når ingen kilde har den: kallende kode skal da la brukerens eget
 * felt være tomt, ikke fylle det med noe.
 *
 * @param {{name?: string, E?: number, rho?: number}|null|undefined} material
 * @returns {number|undefined} ρ_m [kg/m³], `undefined` når ingen kilde har den
 */
export function materialRho(material) {
  if (material && Number.isFinite(material.rho) && material.rho > 0) return material.rho;
  const preset = material ? materialByName(material.name) : null;
  return preset && Number.isFinite(preset.rho) && preset.rho > 0 ? preset.rho : undefined;
}
