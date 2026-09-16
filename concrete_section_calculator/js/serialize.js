/**
 * serialize.js — lagre og laste hele oppsettet som JSON (bestillingens punkt 6).
 *
 * HVORFOR EGEN FIL
 * `toDocument`/`fromDocument` er DOM-frie og rene, akkurat som `store.js` og
 * `payload.js` — filvalg og `Blob`/`URL.createObjectURL` hører hjemme i
 * `ui.js` (B3), ikke her. Denne fila vet bare hvordan en tilstand blir en fil
 * og tilbake, ikke hvordan filen havner på disk.
 *
 * TO VERSJONSTALL, TO FORMÅL — IKKE SLÅ DEM SAMMEN
 * `DOCUMENT_SCHEMA` er FILFORMATETS egen versjon og starter på 1. Den er IKKE
 * `SCHEMA_VERSION` fra `meta.js`, som versjonerer payload/resultat-kontrakten
 * mot Python-motoren. En fil kan trenge en ny lese-regel lenge før kontrakten
 * mot motoren endres, og omvendt.
 *
 * INGEN MIGRERINGSKODE
 * Lagring er NY funksjonalitet i denne runden — ingen har noensinne lagret en
 * fil ennå. `fromDocument` skal derfor bare forstå `DOCUMENT_SCHEMA` 1, som er
 * den eneste versjonen som finnes. Skriv ikke kode for en versjon 0 som aldri
 * har eksistert.
 *
 * `fromDocument` KASTER ALDRI. En feilvalgt eller korrupt fil er en
 * hverdagslig brukerfeil, ikke en programfeil, og skal kunne vises som et
 * notat i samme liste som andre advarsler — akkurat som `validate()` i
 * `section.js` svarer med en liste i stedet for å kaste.
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

import { MODULE_VERSION } from './meta.js';
import { defaultState } from './store.js';
import { createCombo, createLayer } from './rebar.js';

export const DOCUMENT_FORMAT = 'concrete-section-calculator';
export const DOCUMENT_SCHEMA = 1;

/**
 * Undergruppene som fylles FELT FOR FELT mot standarden, ikke erstattes hel.
 * En fil som mangler `spacing.k2` skal få standardverdien 5, ikke `undefined`
 * — det er forskjellen på en NA-parameter som ikke ble lagret, og en som
 * eksplisitt er satt til noe ugyldig.
 */
const NESTED_GROUPS = ['geometry', 'concrete', 'steel', 'spacing', 'doc'];

/**
 * Tilstanden → en fil. `result` er ALDRI med: det er motorens svar på tall
 * som gjaldt DA filen ble lagret, og en lastet fil skal alltid regnes på
 * nytt før noen stoler på et tall.
 *
 * @param {object} state
 * @returns {object} dokumentet, klart for `JSON.stringify`
 */
export function toDocument(state = {}) {
  const { result, ...rest } = state;
  return {
    format: DOCUMENT_FORMAT,
    doc_schema: DOCUMENT_SCHEMA,
    app_version: MODULE_VERSION,
    saved_at: new Date().toISOString(),
    state: rest,
  };
}

/**
 * En fil → tilstand. Se hodekommentaren for hvorfor denne aldri kaster.
 *
 * @param {*} doc rått innhold fra `JSON.parse`, kan være hva som helst
 * @returns {{state: object|null, notes: Array<{code:string, severity:string, field?:string}>}}
 */
export function fromDocument(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== DOCUMENT_FORMAT) {
    return { state: null, notes: [{ code: 'document_not_recognised', severity: 'error' }] };
  }

  const base = defaultState();
  const incoming = doc.state && typeof doc.state === 'object' ? doc.state : {};
  const notes = [];
  const merged = { ...base };

  // Toppnivå: kjente nøkler beholdes (nøstede grupper felt for felt), ukjente
  // droppes, manglende fylles fra standarden. `result` holdes UTENFOR denne
  // runden — dokumentet bærer den aldri med vilje, så et fravær der er ikke
  // et brukerfeil å varsle om, se linja under løkka.
  for (const key of Object.keys(base)) {
    if (key === 'result') continue;
    if (key in incoming) {
      merged[key] = NESTED_GROUPS.includes(key)
        ? { ...base[key], ...incoming[key] }
        : incoming[key];
    } else {
      notes.push({ code: 'document_field_defaulted', severity: 'info', field: key });
    }
  }
  for (const key of Object.keys(incoming)) {
    if (!(key in base)) {
      notes.push({ code: 'document_field_ignored', severity: 'info', field: key });
    }
  }

  // `layers[i]` og `combos[i]` renses IKKE feltvis: `mode:'bars'` mangler
  // legitimt `spacing`, og en fil med `mode:'spacing'` mangler like legitimt
  // `count` — en feltvis rens ville slettet gyldig data i begge retninger.
  // Normaliser i stedet hvert element gjennom samme fabrikk resten av appen
  // bruker, slik at et lag/en kombinasjon fra en fil ikke kan avvike fra det
  // et lag laget i UI-en ser ut som.
  merged.layers = (Array.isArray(merged.layers) ? merged.layers : []).map((layer) =>
    createLayer(merged, { ...layer })
  );
  merged.combos = (Array.isArray(merged.combos) ? merged.combos : []).map((combo) =>
    createCombo(merged, { ...combo })
  );

  // Motorens svar gjelder ALDRI en lastet fil — se `toDocument`.
  merged.result = null;

  return { state: merged, notes };
}
