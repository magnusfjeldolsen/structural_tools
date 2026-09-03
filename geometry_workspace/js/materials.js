/**
 * materials.js — materialpresets for forsterkningsberegningen.
 *
 * Ingen DOM, ingen store. Modulen inneholder bare tall og oppslag.
 *
 * ENHETER
 *  - `E` er elastisitetsmodulen i **N/mm² (MPa)**. Hele mekanikken i
 *    `reinforcement.js` regner i N og mm, så E skal ALDRI oppgis i GPa her.
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
 */

/**
 * @typedef {Object} Material
 * @property {string} name     Unik nøkkel, brukes i lagret modell (`shape.material.name`)
 * @property {string} label    Kort etikett til nedtrekkslista
 * @property {number} E        Elastisitetsmodul [N/mm²]
 * @property {string} group    Gruppering i UI ('Stål' | 'Betong' | 'Tre' | 'Annet')
 */

/** @type {ReadonlyArray<Material>} */
export const MATERIALS = Object.freeze([
  { name: 'S355', label: 'Stål S355', E: 210000, group: 'Stål' },
  { name: 'S235', label: 'Stål S235', E: 210000, group: 'Stål' },
  { name: 'C25/30', label: 'Betong C25/30', E: 31000, group: 'Betong' },
  { name: 'C30/37', label: 'Betong C30/37', E: 33000, group: 'Betong' },
  { name: 'C35/45', label: 'Betong C35/45', E: 34000, group: 'Betong' },
  { name: 'GL30c', label: 'Limtre GL30c', E: 13000, group: 'Tre' },
  { name: 'C24', label: 'Konstruksjonsvirke C24', E: 11000, group: 'Tre' },
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
