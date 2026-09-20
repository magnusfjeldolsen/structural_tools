/**
 * form-structure.test.mjs — koblingen mellom `index.html` og `js/ui.js`.
 *
 * HVORFOR DENNE FILA FINNES
 * Skjemaet er delt i to filer som ikke kan se hverandre: markupen i
 * `index.html` og bindingene i `ui.js`. Alt som holder dem sammen er en
 * id-streng, og `document.querySelector('#i-es')` svarer `null` uten å klage.
 * Det er nøyaktig slik `steel.Es` klarte å ligge i tilstanden, gå inn i
 * `ε_yd = f_yd/E_s`, bli trykket i rapporten — og likevel ikke ha noen
 * kontroll noe sted (runde 6 §2.2 punkt 3). Ingen test kunne nå det, fordi det
 * ikke fantes noe å teste: feilen var en MANGEL, ikke en gal linje.
 *
 * Testene her leser de to filene som TEKST og sammenlikner dem mot hverandre
 * og mot `defaultState()`. Det er grovt, men det er den eneste måten å fange
 * et felt som mangler helt uten å dra inn en DOM-emulator.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { DISCLOSURE_BOXES } from '../js/ui.js';
import { defaultState } from '../js/store.js';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * KOMMENTARENE MÅ VEKK FØRST. Begge filene er tett kommentert, og
 * kommentarene siterer nettopp de id-ene og taggene testene under leter etter
 * — «`#fck-chips` er borte» inneholder strengen `fck-chips`, og «ingen
 * `<details>` inne i en `<details>`» inneholder `<details`. Uten dette måler
 * testene begrunnelsen i stedet for koden, og den mest omhyggelig forklarte
 * endringen blir den som feiler.
 */
const HTML = src('../index.html').replace(/<!--[\s\S]*?-->/g, '');
const UI = src('../js/ui.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** Alle id-er markupen faktisk tilbyr. */
const htmlIds = new Set(Array.from(HTML.matchAll(/\bid="([^"]+)"/g), (m) => m[1]));

/* ---------------------------------------------------------------- *
 * Hver kontroll peker på noe som finnes
 * ---------------------------------------------------------------- */

test('hver bindField-selektor finnes som id i index.html', () => {
  // Et felt som bindes til en id som ikke finnes er en stille no-op: verdien
  // står i tilstanden, går inn i beregningen, og kan ikke endres.
  const bound = Array.from(UI.matchAll(/bindField\('#([\w-]+)'/g), (m) => m[1]);
  assert.ok(bound.length >= 15, `fant bare ${bound.length} bindField-kall — regexen har råtnet`);
  for (const id of bound) {
    assert.ok(htmlIds.has(id), `ui.js binder #${id}, men index.html har ingen slik id`);
  }
});

test('hvert inndatafelt i skjemaet er bundet til tilstanden', () => {
  // Den motsatte veien: et `<input id="i-…">` uten binding ser redigerbart ut,
  // tar imot tastetrykk, og kaster dem. `#i-law-c`/`#i-law-s`, de to
  // kvalitetsnedtrekkene og `#i-exposure` er `<select>` og bindes for hånd,
  // ikke med `bindField` — de står derfor oppført her.
  //
  // `#i-wmax`, `#i-phi-ef` og `#i-h0` er vanlige `<input>` og likevel
  // håndbundet, av én grunn: hos alle tre er TOMT et ekte valg — «bruk den
  // avledede verdien». `bindField` legger tilbake den gjeldende verdien når
  // uttrykket ikke lar seg lese, og ville dermed gjort dem umulige å tømme.
  // De deler én liten binder (`optional` i `setupFields`), ikke tre lyttere.
  const BOUND_BY_HAND = ['i-law-c', 'i-law-s', 'i-fck', 'i-steel-grade', 'i-exposure',
    'i-cement', 'i-wmax', 'i-phi-ef', 'i-h0'];
  const fields = Array.from(HTML.matchAll(/<input id="(i-[\w-]+)"/g), (m) => m[1]);
  assert.ok(fields.length >= 15, `fant bare ${fields.length} i-felt — regexen har råtnet`);
  for (const id of fields) {
    if (BOUND_BY_HAND.includes(id)) continue;
    assert.ok(
      UI.includes(`bindField('#${id}'`),
      `index.html har feltet #${id}, men ui.js binder det ikke`
    );
  }
  for (const id of BOUND_BY_HAND) {
    assert.ok(htmlIds.has(id), `#${id} mangler i index.html`);
    // `'#id'` og ikke `$('#id')`: de tre valgfrie feltene deler én binder
    // (`optional`), så oppslaget skjer inne i den og med selektoren som
    // ARGUMENT. Påstanden er fortsatt den samme — at ui.js i det hele tatt
    // nevner feltet — men den tvinger ikke lenger fram tre kopier av samme
    // lytter bare for å bli oppfylt.
    assert.ok(UI.includes(`'#${id}'`), `#${id} nevnes ikke i ui.js`);
  }
});

/* ---------------------------------------------------------------- *
 * Hvert materialtall kan nås
 * ---------------------------------------------------------------- */

test('hvert TALL i concrete/steel har en kontroll som skriver det', () => {
  // DETTE er testen `steel.Es` ville feilet på før runde 6: tallet lå i
  // tilstanden, rapporten trykket det, og ingen skriver fantes.
  // Vi leser hvilke nøkler `ui.js` faktisk patcher, ikke en liste noen har
  // skrevet ned — en liste ville vært den andre kilden, og den som ble glemt.
  const written = new Set();
  for (const m of UI.matchAll(/store\.patch\('(concrete|steel)',\s*\{([^}]*)\}/g)) {
    const group = m[1];
    for (const key of m[2].matchAll(/([A-Za-z_]\w*)\s*(?::|[,}]|$)/g)) {
      written.add(`${group}.${key[1]}`);
    }
  }
  const s = defaultState();
  const numeric = [
    ...Object.entries(s.concrete).filter(([, v]) => typeof v === 'number').map(([k]) => `concrete.${k}`),
    ...Object.entries(s.steel).filter(([, v]) => typeof v === 'number').map(([k]) => `steel.${k}`),
  ];
  assert.ok(numeric.length >= 9, `fant bare ${numeric.length} materialtall — sjekk defaultState()`);
  for (const path of numeric) {
    assert.ok(written.has(path), `${path} kan ikke endres fra skjemaet — ingen store.patch skriver den`);
  }
});

/* ---------------------------------------------------------------- *
 * Avdekkingsboksene
 * ---------------------------------------------------------------- */

test('hver boks i DISCLOSURE_BOXES finnes som <details> i index.html', () => {
  // Tabellen i `ui.js` er det eneste som kobler en feltsti til en boks. Peker
  // den på en id markupen ikke har, feiler regel §2.6 nr. 1 i stillhet: feltet
  // `validate()` klager på blir liggende sammenfoldet.
  for (const box of DISCLOSURE_BOXES) {
    assert.ok(
      new RegExp(`<details id="${box.id}"`).test(HTML),
      `DISCLOSURE_BOXES har «${box.id}», men index.html har ingen <details> med den id-en`
    );
  }
});

test('hver sammenfoldbar boks trykker verdiene sine i summary', () => {
  // §2.6: forskjellen på å skjule og å skjule bort. En boks uten et
  // verdisammendrag er en boks man må åpne for å vite om man må åpne den.
  const SUMMARY_OF = {
    'adv-material': 'fac-summary',
    'adv-shear': 'shear-summary',
    'adv-spacing': 'spacing-summary',
  };
  for (const box of DISCLOSURE_BOXES) {
    const id = SUMMARY_OF[box.id];
    assert.ok(id, `boksen «${box.id}» mangler en oppføring i denne testen — legg til sammendraget`);
    assert.ok(htmlIds.has(id), `#${id} mangler i index.html`);
    // Sammendraget må STÅ i summary-en til sin egen boks, ikke et vilkårlig
    // sted på sida.
    const boxHtml = HTML.slice(HTML.indexOf(`<details id="${box.id}"`));
    const summary = boxHtml.slice(0, boxHtml.indexOf('</summary>'));
    assert.ok(summary.includes(`id="${id}"`), `#${id} står ikke i <summary> til ${box.id}`);
    assert.ok(UI.includes(`$('#${id}')`), `ui.js fyller ikke #${id}`);
  }
});

test('ingen <details> inne i en <details> i skjemaet', () => {
  // Plan §2.1: to klikk for γ_c er verre enn én rad ekstra. En nestet boks gjør
  // dessuten auto-åpningen tvetydig — hvilken av de to skal åpnes?
  // «Advanced — strut angle» var en slik nestet boks før runde 6.
  for (const box of DISCLOSURE_BOXES) {
    const start = HTML.indexOf(`<details id="${box.id}"`);
    const end = HTML.indexOf('</details>', start);
    assert.ok(end > start, `fant ikke slutten på ${box.id}`);
    assert.ok(
      !HTML.slice(start + 1, end).includes('<details'),
      `${box.id} inneholder en nestet <details>`
    );
  }
});

/* ---------------------------------------------------------------- *
 * Det som skal være BORTE
 * ---------------------------------------------------------------- */

test('kvalitetsbrikkene er erstattet av nedtrekk, ikke doblet av dem', () => {
  // Så lenge brikkeraden står igjen, står de to skriverne der også: brikken
  // skrev `k` og `ε_uk`, som har egne felt. Halvveis er verre enn ingenting.
  assert.ok(!HTML.includes('fck-chips'), 'betongbrikkene står fortsatt i index.html');
  assert.ok(!HTML.includes('fyk-chips'), 'stålbrikkene står fortsatt i index.html');
  assert.ok(!UI.includes('fck-chips'), 'ui.js tegner fortsatt betongbrikkene');
  assert.ok(!UI.includes('fyk-chips'), 'ui.js tegner fortsatt stålbrikkene');
});

test('ingen tabindex noe sted', () => {
  // Plan §2.6: ett eneste POSITIVT tabindex deler dokumentet i to tab-ringer
  // der alle positive kommer først — og da er hele tastaturmodellen i §2.3
  // bygget på en rekkefølge som ikke stemmer. Riktig rettelse var å fjerne
  // brikkene, og den er gjort; regelen står her så den ikke blir «rettet»
  // tilbake av en som lurer på hvorfor tab-rekkefølgen er lang.
  assert.ok(!/\btabindex\s*=/.test(HTML), 'index.html har fått et tabindex');
  assert.ok(!/\btabindex\b/.test(UI), 'ui.js setter tabindex');
});

test('nedtrekkenes <option>-er fylles i setupFields, aldri på veien gjennom render', () => {
  // ⚠ Fella §2.7 peker på: `select.innerHTML = …` river ut og bygger opp igjen
  // hvert eneste `<option>`. Skjer det i opptegningen — som kjøres fra hvert
  // eneste felt i skjemaet — mister nedtrekket fokus, og en liste som står
  // åpen lukker seg under fingeren på brukeren. Samme felle som
  // `comboEditInFlight` og `stirrupEditInFlight` finnes for, med `<option>`
  // i stedet for radene.
  const between = (from, to) => UI.slice(UI.indexOf(from), UI.indexOf(to));
  const setup = between('function setupFields()', 'function syncFields()');
  const sync = between('function syncFields()', 'function renderSegment(');
  const render = between('\n  function render() {', 'function readDisclosure()');

  for (const id of ['i-fck', 'i-steel-grade', 'i-law-c', 'i-law-s']) {
    assert.ok(setup.includes(`$('#${id}')`), `#${id} fylles ikke i setupFields`);
  }
  // `syncFields()` er det ENESTE stedet i opptegningsveien som rører
  // nedtrekkene, og det skal den gjøre ved å sette `.value` — aldri innholdet.
  assert.ok(!sync.includes('innerHTML'), 'syncFields() skriver innerHTML — da ryker fokus i nedtrekkene');
  assert.ok(sync.includes('.value ='), 'syncFields() setter ikke .value på nedtrekkene');
  // `render()` selv skal ikke slå opp nedtrekkene i det hele tatt.
  for (const id of ['i-fck', 'i-steel-grade', 'i-law-c', 'i-law-s']) {
    assert.ok(!render.includes(`$('#${id}')`), `render() rører #${id} — se fella i setupFields`);
  }
});
