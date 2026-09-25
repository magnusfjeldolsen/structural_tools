/**
 * share-link.js — hele oppsettet som en delbar lenke.
 *
 * HVA DENNE FILA ER: EN KONVOLUTT, INGENTING MER
 * `toLink` bygger ALDRI sitt eget dokument — den spør `toDocument()`. `fromLink`
 * fletter ALDRI selv — den gir det den pakket ut til `fromDocument()`. Denne
 * fila vet bare hvordan et dokument blir tegn i en adresselinje og tilbake.
 *
 * Det er ikke en stilregel, det er hele grunnen til at fila finnes i denne
 * formen. Alternativet — en «kort form» med bare de feltene en lenke trenger —
 * ville vært en ANDRE serialiseringskilde ved siden av `serialize.js`, og da
 * ville et nytt felt i `defaultState()` måttet skrives inn to steder. Det ene
 * ville sakket etter uten at noen test merket det.
 *
 * ⚠ ENHVER `if (key === ...)` I DENNE FILA ER ET VARSEL. Da har lenka begynt å
 * ha sin egen felthåndtering, og den vil drive fra fila.
 *
 * KONVOLUTTFORMEN: `d1.` + deflate-raw + base64url
 * MÅLT på ekte tilstand, 2026-09-21 (`tests/share-link.test.mjs` er
 * STØRRELSESBUDSJETTET som holder tallene nede — legger noen et felt i
 * `defaultState()` som sprenger det, blir testen rød med én gang):
 *   - standardsnittet:  1 161 B kompakt JSON →   ~853 tegn (budsjett < 1 000)
 *   - tungt snitt (6 lag, 8 kombinasjoner, 3 bøylerader, full dokumenttekst):
 *                       2 866 B kompakt JSON → ~1 610 tegn (budsjett < 2 000)
 *   - uten komprimering ville det tunge snittet blitt 3 840 tegn.
 * («~» fordi `saved_at` er et nytt klokkeslett hver gang og komprimerer litt
 * ulikt — utslaget er målt til noen få tegn, ikke titalls.)
 * Komprimeringen er altså ikke pynt: den er forskjellen på en lenke som
 * overlever et e-postfelt og en som blir brutt i to.
 *
 * ÉN KONVOLUTTFORM, IKKE TO
 * Mangler `CompressionStream` (under Safari 16.4 / Chrome 103 / Firefox 113),
 * gir `toLink` `null` og knappen sier fra i klartekst. Det er FRISTENDE å falle
 * stille tilbake til ukomprimert base64 — men da ville den gamle nettleseren
 * produsert en lenke ingen annen nettleser kan lese, og feilen dukket opp hos
 * MOTTAKEREN, som ikke har gjort noe galt.
 *
 * `fromLink` KASTER ALDRI — samme regel som `fromDocument`. En lenke som er
 * kappet i et e-postfelt er en hverdagslig brukerfeil, ikke en programfeil, og
 * skal vises som et notat i samme liste som notene fra en fil.
 *
 * DOM-fri og ren: her finnes verken `location`, `history` eller `navigator`.
 * Adresselinja eies av `ui.js` og `main.js`.
 */

import { fromDocument, toDocument } from './serialize.js';

/**
 * Formatmerket. `d` for «document», `1` for konvoluttversjonen — den er IKKE
 * `DOCUMENT_SCHEMA` (som versjonerer innholdet) og IKKE `SCHEMA_VERSION` (som
 * versjonerer kontrakten mot motoren). Denne teller bare hvordan bytene er
 * pakket, og endres bare hvis komprimering eller koding byttes ut.
 *
 * Punktumet er med vilje: det er ikke et base64url-tegn, så grensa mellom
 * prefiks og last kan aldri bli tvetydig.
 */
export const LINK_PREFIX = 'd1.';

/** Én byte-runde gjennom en strøm. */
async function pipe(bytes, stream) {
  const blob = new Blob([bytes]);
  const piped = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

/** base64url: `+`→`-`, `/`→`_`, padding strippet. Tåler en adresselinje rått. */
function toBase64Url(bytes) {
  let binary = '';
  // Blokkvis, ikke `String.fromCharCode(...bytes)`: en spredning av flere tusen
  // argumenter treffer argumentgrensa i motoren, og et tungt snitt er allerede
  // over 1 000 byte komprimert.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Tilstanden → fragmentet, UTEN `#`.
 *
 * `result` er ikke med, av samme grunn som i en lagret fil: `toDocument` legger
 * det aldri ved. En mottatt lenke skal alltid regnes på nytt før noen stoler på
 * et tall.
 *
 * @param {object} state
 * @returns {Promise<string|null>} `null` når nettleseren mangler
 *          `CompressionStream` — se hodekommentaren for hvorfor det ikke er en
 *          stille reservevei
 */
export async function toLink(state) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const json = JSON.stringify(toDocument(state));
    const packed = await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw'));
    return LINK_PREFIX + toBase64Url(packed);
  } catch {
    // Alt som kan svikte her — en `Blob` uten minne, en strøm som avbrytes —
    // er svikt i konvolutten, ikke i tilstanden. Svaret er det samme som for en
    // for gammel nettleser: ingen lenke, og en knapp som sier fra.
    return null;
  }
}

/**
 * Fragmentet → tilstand. Kaster ALDRI.
 *
 * Tåler et ledende `#`, slik at både `location.hash` og et rent fragment kan
 * sendes inn — grensesnittet skal ikke være et sted der man kan ta feil.
 *
 * @param {string} fragment
 * @returns {Promise<{state: object|null, notes: Array<{code:string, severity:string, field?:string}>}>}
 */
export async function fromLink(fragment) {
  const raw = typeof fragment === 'string' ? fragment : '';
  const body = raw.startsWith('#') ? raw.slice(1) : raw;
  if (!body.startsWith(LINK_PREFIX)) return unsupported();
  try {
    const packed = fromBase64Url(body.slice(LINK_PREFIX.length));
    const bytes = await pipe(packed, new DecompressionStream('deflate-raw'));
    // `fromDocument` eier resten: fletting mot standarden, notene om felt som
    // manglet eller var ukjente, og normaliseringen av lag og kombinasjoner.
    return fromDocument(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    // Ukjent prefiks, ødelagt base64, en lenke kappet i et e-postfelt, eller en
    // nettleser uten `DecompressionStream`: for brukeren er alt dette den samme
    // opplysningen — denne lenka kan ikke leses her.
    return unsupported();
  }
}

function unsupported() {
  return { state: null, notes: [{ code: 'link_format_unsupported', severity: 'error' }] };
}
