/**
 * keyboard.test.mjs — tastaturmodellen (runde 6 §2.3).
 *
 * HVORFOR DENNE FILA FINNES
 * Brukerens krav er én setning: «kan styres med keyboard uten å løfte hånda fra
 * musa». Høyre hånd blir på musa, altså må hver hurtigtast slås med VENSTRE
 * hånd alene. Det er et krav ingen kan se om er oppfylt ved å lese koden — det
 * må stå som en påstand et sted som feiler.
 *
 * Den forrige modellen brøt kravet på tre måter samtidig, og ingen av dem
 * feilet noe sted:
 *   * `P` for plate ligger under høyre hånd.
 *   * `AltGr` setter BÅDE `ctrlKey` og `altKey` på Windows, og den gamle
 *     testen `e.altKey && e.key === 'd'` fyrte derfor «dupliser siste lag»
 *     midt i en innskriving på norsk tastatur.
 *   * Sifrene ble lest med `e.key`, så et layout der «1» gir et annet tegn
 *     hadde ingen analysetaster i det hele tatt.
 *
 * `shortcutFor` er REN med vilje: den tar en hendelseslignende verdi og svarer
 * hvilken handling den utløser. Det er det som gjør at spørsmålene over har
 * svar i `node --test` og ikke bare i en rapport.
 *
 * Den andre halvdelen av fila handler om noe annet: at merket på kontrollen,
 * hjelpelista og handleren leser SAMME KILDE. Så lenge de gjør det, kan en
 * snarvei verken bli udokumentert eller feildokumentert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SHORTCUTS, comboKeys, comboShort, hintCombo, markKey, parseCombo, shortcutFor } from '../js/ui.js';

const HTML = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
  // Kommentarene siterer id-ene og tastene testene leter etter («lovet `B` og
  // `P`»), så begrunnelsen ville ellers vært det som ble målt.
  .replace(/<!--[\s\S]*?-->/g, '');

/** En tastehendelse slik nettleseren gir den. `code` defaulter til noe som
 *  IKKE er en `Digit`, så en test som mener å måle `e.code` må si det selv. */
const ev = (patch = {}) => ({
  key: '', code: 'Unidentified', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
  ...patch,
});

/** Handlingen en hendelse utløser, eller `null`. */
const act = (e, ctx) => (shortcutFor(e, ctx) || {}).action ?? null;

/* ================================================================== *
 * Venstre hånd alene
 * ================================================================== */

/**
 * Tastene venstre hånd når uten å flytte seg, på et vanlig ISO/ANSI-layout.
 * Sifferraden 1–4 og bokstavene til og med `T`/`G`/`B`. `Escape` og `?` står
 * ikke her: `Escape` er venstre lillefinger uansett, og `?` er hjelpelista —
 * den som trenger den har allerede sluppet musa.
 */
const LEFT_HAND = new Set([
  '1', '2', '3', '4', '5',
  'Q', 'W', 'E', 'R', 'T',
  'A', 'S', 'D', 'F', 'G',
  'Z', 'X', 'C', 'V', 'B',
  'Space', 'Esc', '⏎', '↑', '?',
]);

test('hver eneste hurtigtast kan slås med VENSTRE hånd alene', () => {
  // KRAVET, ORDRETT: høyre hånd blir på musa. `P` for plate brøt det, og
  // ingenting sa fra. Denne linja er stedet som sier fra.
  for (const s of SHORTCUTS) {
    for (const combo of s.combos) {
      const keys = comboKeys(combo);
      const main = keys[keys.length - 1];
      assert.ok(LEFT_HAND.has(main),
        `«${combo}» krever høyre hånd — tasten «${main}» ligger ikke i venstre hånds rekkevidde`);
    }
  }
});

test('P og B er ikke lenger snarveier — T er den ene veksleren', () => {
  // Ville feilet før: den gamle handleren hadde `k === 'b'` → bjelke og
  // `k === 'p'` → plate, og INGEN `t`.
  assert.equal(act(ev({ key: 'p' })), null);
  assert.equal(act(ev({ key: 'b' })), null);
  assert.equal(act(ev({ key: 't' })), 'toggleType');
  assert.equal(act(ev({ key: 'T' })), 'toggleType', 'Shift+T er samme tast');
});

/* ================================================================== *
 * Modifikatorene
 * ================================================================== */

test('AltGr duplikerer IKKE et lag', () => {
  // AltGr på Windows = ctrlKey + altKey. Den gamle regelen var `e.altKey &&
  // e.key === 'd'`, og den fyrte her — midt i en innskriving, på et norsk
  // tastatur, uten at noe var trykket feil.
  assert.equal(act(ev({ key: 'd', altKey: true, ctrlKey: true })), null);
  assert.equal(act(ev({ key: 'd', altKey: true })), 'duplicate');
});

test('Ctrl+Shift+Mellomrom er «kjør alle», ikke «kjør»', () => {
  // Ville feilet før: den gamle grenen var `(e.ctrlKey || e.metaKey) &&
  // e.key === ' '` UTEN å se på Shift, så aliaset ville kjørt den aktive
  // analysen i stedet for alle.
  assert.equal(act(ev({ code: 'Space', ctrlKey: true, shiftKey: true })), 'runAll');
  assert.equal(act(ev({ code: 'Space', altKey: true })), 'runAll');
  assert.equal(act(ev({ code: 'Space', ctrlKey: true })), 'calc');
  assert.equal(act(ev({ key: 'Enter', ctrlKey: true })), 'calc');
  assert.equal(act(ev({ key: 'Enter', metaKey: true })), 'calc', 'Cmd er Ctrl på Mac');
});

test('mellomrom uten modifikator er ikke en snarvei', () => {
  // Mellomrom ruller sida og aktiverer knapper. Fanget vi det bart, ville vi
  // tatt fra brukeren en tast nettleseren allerede har en jobb til.
  assert.equal(act(ev({ code: 'Space' })), null);
});

/* ================================================================== *
 * Vakten
 * ================================================================== */

test('en snarvei UTEN modifikator er blokkert i et tekstfelt', () => {
  const inField = { inField: true };
  for (const key of ['t', 'a', 'f', 'e', 'd', 'r', '?']) {
    assert.equal(act(ev({ key }), inField), null, `«${key}» fyrte fra et tekstfelt`);
  }
  assert.equal(act(ev({ code: 'Digit2' }), inField), null);
});

test('en snarvei MED modifikator virker også fra et tekstfelt', () => {
  const inField = { inField: true };
  assert.equal(act(ev({ code: 'Space', ctrlKey: true }), inField), 'calc');
  assert.equal(act(ev({ code: 'Space', altKey: true }), inField), 'runAll');
  assert.equal(act(ev({ key: 'd', altKey: true }), inField), 'duplicate');
  assert.equal(act(ev({ key: 'e', altKey: true }), inField), 'advancedAll');
  // `Escape` er det ene unntaket fra «modifikator = virker i felt»: den
  // skriver ingen bokstav, og et overlegg man ikke kan lukke fordi fokus står
  // i et felt INNE i det, er ikke et overlegg, det er en felle.
  assert.equal(act(ev({ key: 'Escape' }), inField), 'closeOverlay');
});

test('en blokkert bar tast stenger ikke for den samme tasten MED Alt', () => {
  // `D` og `Alt+D` er samme oppføring. Var vakten skrevet som `return null`
  // i stedet for `continue`, ville den bare tasten blokkert hele oppføringen,
  // og `Alt+D` — som er det som virker fra et felt — vært død.
  assert.equal(act(ev({ key: 'd' }), { inField: true }), null);
  assert.equal(act(ev({ key: 'd', altKey: true }), { inField: true }), 'duplicate');
});

/* ================================================================== *
 * Sifrene leses med e.code
 * ================================================================== */

test('analysetastene leses av e.code, ikke av tegnet', () => {
  // AZERTY gir `&` på den tasten som er merket `1`. Den gamle koden regnet
  // `Number('&')` = NaN og gjorde ingenting — modulen hadde ingen
  // analysetaster i det hele tatt på et fransk tastatur.
  assert.deepEqual(shortcutFor(ev({ key: '&', code: 'Digit1' })), { action: 'analysis', combo: 'Digit1', index: 0 });
  assert.deepEqual(shortcutFor(ev({ key: '2', code: 'Digit2' })), { action: 'analysis', combo: 'Digit2', index: 1 });
});

test('det numeriske tastaturet svarer som sifferraden', () => {
  assert.deepEqual(shortcutFor(ev({ key: '4', code: 'Numpad4' })), { action: 'analysis', combo: 'Digit4', index: 3 });
});

test('Shift+1 velger ikke analyse', () => {
  // `e.code` er den samme tasten, men `Shift+1` er `!` — et tegn, ikke en
  // kommando. Her MÅ Shift sammenliknes strengt, i motsetning til for
  // bokstavene.
  assert.equal(act(ev({ key: '!', code: 'Digit1', shiftKey: true })), null);
});

test('sifrene følger ANALYSES, de er ikke skrevet av', () => {
  // En femte analyse skal ikke kunne havne i chipraden uten å få tasten sin —
  // og heller ikke uten å få linja si i hjelpen.
  const digits = SHORTCUTS.filter((s) => s.action === 'analysis');
  assert.equal(digits.length, 4);
  assert.deepEqual(digits.map((s) => s.index), [0, 1, 2, 3]);
  assert.deepEqual(digits.map((s) => s.combos[0]), ['Digit1', 'Digit2', 'Digit3', 'Digit4']);
});

/* ================================================================== *
 * ÉN KILDE: handler, merke og hjelp
 * ================================================================== */

test('hver oppføring har en hjelpetekst — ingen udokumentert snarvei', () => {
  for (const s of SHORTCUTS) {
    assert.ok(s.help && s.help.trim(), `«${s.combos.join('/')}» har ingen hjelpetekst`);
    assert.ok(s.combos.length, 'en oppføring uten kombinasjoner er en hjelperad uten tast');
  }
});

test('hver oppføring med en handling har en handling som finnes', () => {
  // Handlingene er navn, og et navn kan stavefeiles. Denne leser `ui.js` som
  // tekst og krever at navnet står i `ACTIONS`-tabellen. Uten den ville en
  // snarvei kunne stå i hjelpen, få merke på kontrollen, og ikke gjøre noe.
  const UI = readFileSync(fileURLToPath(new URL('../js/ui.js', import.meta.url)), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
  const body = UI.slice(UI.indexOf('const ACTIONS = {'));
  for (const s of SHORTCUTS) {
    if (!s.action) continue;
    assert.match(body, new RegExp(`\\n\\s{4}${s.action}:`), `ACTIONS mangler «${s.action}»`);
  }
});

test('hvert merke viser ÉN bar tast', () => {
  // Et merke er en invitasjon til å trykke én tast. Sto det «Ctrl+Space» på en
  // knapp, var det ikke lenger et merke, men en fotnote — og en fotnote som
  // dessuten lover noe annet enn den bare tasten merket ser ut til å være.
  for (const s of SHORTCUTS) {
    if (!s.mark) continue;
    const key = markKey(s);
    assert.ok(key && key.length === 1, `«${s.mark}» ville fått merket «${key}»`);
  }
});

test('hvert merke peker på en id som finnes i index.html', () => {
  // `document.querySelector('#btn-repport')` svarer `null` uten å klage.
  // Merket ville da uteblitt, tasten virket, og ingenting sagt fra.
  const ids = new Set(Array.from(HTML.matchAll(/\bid="([^"]+)"/g), (m) => m[1]));
  for (const s of SHORTCUTS) {
    if (!s.mark) continue;
    const id = (s.mark.match(/^#([\w-]+)/) || [])[1];
    assert.ok(id && ids.has(id), `merket «${s.mark}» peker på en id som ikke finnes`);
  }
});

test('hvert knappehint peker på en TOM kbd i index.html', () => {
  // Tom med vilje. Sto tasten skrevet i markupen som «reserve», ville den vært
  // en andre kilde — og den stille varianten: skrev noen om tabellen, ville
  // knappen vist den gamle tasten helt til noen kom på å lese markupen igjen.
  // Tom `<kbd>` kan ikke lyve; den kan bare være tom, og det ser man.
  const ids = new Set(Array.from(HTML.matchAll(/\bid="([^"]+)"/g), (m) => m[1]));
  for (const s of SHORTCUTS) {
    if (!s.kbd) continue;
    const id = s.kbd.slice(1);
    assert.ok(ids.has(id), `hintet «${s.kbd}» finnes ikke i markupen`);
    const m = HTML.match(new RegExp(`<kbd id="${id}"[^>]*>([\\s\\S]*?)</kbd>`));
    assert.ok(m, `fant ikke <kbd id="${id}">`);
    assert.equal(m[1].trim(), '', `<kbd id="${id}"> har en tast skrevet i markupen`);
  }
});

test('hjelpelista i index.html er TOM — den bygges av tabellen', () => {
  // Dette er den ene testen som gjør resten av fila verdt noe. Står det rader
  // i markupen, finnes det to kilder til hvilke taster som gjelder, og den
  // håndskrevne av dem er den som råtner: den lovet `B`/`P` lenge etter at
  // begge var omdiskutert, og tidde om `Alt+E`.
  const help = HTML.slice(HTML.indexOf('id="help"'), HTML.indexOf('id="report-overlay"'));
  assert.match(help, /id="help-rows"[^>]*><\/tbody>/, 'hjelpetabellen har fått innhold i markupen igjen');
  assert.ok(!/<tr>/.test(help), 'hjelpeoverlegget har håndskrevne rader');
});

/* ================================================================== *
 * Skrivemåtene
 * ================================================================== */

test('comboKeys deler kombinasjonen i tastenavn', () => {
  assert.deepEqual(comboKeys('Ctrl+Space'), ['Ctrl', 'Space']);
  assert.deepEqual(comboKeys('Ctrl+Shift+Space'), ['Ctrl', 'Shift', 'Space']);
  assert.deepEqual(comboKeys('Digit3'), ['3']);
  assert.deepEqual(comboKeys('t'), ['T']);
  assert.deepEqual(comboKeys('Escape'), ['Esc']);
  assert.deepEqual(comboKeys('Enter'), ['⏎']);
});

test('hintet i bunnlinja er fortsatt «⌃Space»', () => {
  // Bunnlinja er målt opp til siste piksel (§2.4) med nøyaktig denne teksten.
  // `Ctrl+Space` er fire tegn bredere og ville dyttet inspeksjonsstripa.
  assert.equal(comboShort('Ctrl+Space'), '⌃Space');
  assert.equal(comboShort('Alt+D'), 'Alt+D');
  assert.equal(comboShort('Enter'), '⏎');
});

test('hintet på en knapp viser kombinasjonen som virker OGSÅ fra et felt', () => {
  // Merket og hintet svarer på to ulike spørsmål. Merket dukker opp mens `Alt`
  // holdes, altså utenfor et felt, og skal vise den korteste veien: `D`.
  // Hintet står permanent på knappen og leses også med markøren i et felt, der
  // `D` ikke virker — det må vise `Alt+D`. Uten denne regelen trykte hintet
  // «D» på en knapp som ikke svarte på `D` i halvparten av tilfellene.
  const dup = SHORTCUTS.find((s) => s.action === 'duplicate');
  assert.equal(markKey(dup), 'D');
  assert.equal(comboShort(hintCombo(dup)), 'Alt+D');
  const calc = SHORTCUTS.find((s) => s.action === 'calc');
  assert.equal(comboShort(hintCombo(calc)), '⌃Space');
  // Alle hint er modifiserte, ELLER tilhører en rad som ikke har noen
  // modifisert form i det hele tatt (`⏎` i korthåndslinja).
  for (const s of SHORTCUTS) {
    if (!s.kbd) continue;
    assert.ok(hintCombo(s), `«${s.kbd}» har ingen kombinasjon å trykke`);
  }
});

test('parseCombo skiller modifikatorer fra tasten', () => {
  assert.deepEqual(parseCombo('Ctrl+Shift+Space'), { ctrl: true, alt: false, shift: true, key: 'Space' });
  assert.deepEqual(parseCombo('T'), { ctrl: false, alt: false, shift: false, key: 'T' });
});
