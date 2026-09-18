/**
 * layer-row.test.mjs — armeringsraden som ÉN knapp (runde 8 §2).
 *
 * HVORFOR DENNE FILA FINNES
 * Klagen var målt: raden er 940 × 47,5 px, og blyanten som åpnet den var
 * 29 × 27,5 px — 1,8 % av flaten — og `.lact { opacity: 0 }` gjorde den
 * usynlig helt til musa var over raden. Rettelsen er å gjøre hele raden til
 * målet, og da er det FORMEN på markupen som er hele rettelsen:
 *
 *   • et ekte `<button>`, fordi `tabindex` er forbudt i modulen og en
 *     `<div role="button">` derfor ikke ville vært tastaturnåbar;
 *   • BOT/TOP, dupliser og slett som SØSKEN, fordi nestede knapper er ugyldig
 *     HTML — og fordi de da beholder sine egne tab-stopp;
 *   • blyanten nedgradert til `<span>`, slik at «åpne» fortsatt koster
 *     nøyaktig ETT tab-stopp og raden fortsatt har fire til sammen.
 *
 * Alle tre er påstander om en streng, ikke om en kjørende side. Derfor ligger
 * `layerRowHtml` på modulnivå og er ren — samme grep som `bottomBarStripHtml`
 * — og derfor kan de testes i `node --test` uten DOM-emulator.
 *
 * Testene under leser markupen STRUKTURELT, ikke med `includes`: spørsmålet
 * «ligger slett-knappen inne i eller ved siden av radknappen?» kan ikke
 * besvares av et delstrengsøk, og det er nøyaktig det spørsmålet som skiller
 * gyldig HTML fra ugyldig her.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { layerRowHtml } from '../js/ui.js';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/**
 * Kommentarene siterer selv `.lact`, `opacity` og `data-open`; uten dette
 * ville testene målt begrunnelsen i stedet for koden. Samme grep som
 * `form-structure.test.mjs` — men med ÉN forskjell som betyr alt her:
 * regelen som skal bort står i `<style>`, og begrunnelsen for at den ble
 * borte står i en CSS-kommentar rett over. `<!-- -->` alene er derfor ikke
 * nok; `/* *\/` må vekk også, ellers feiler testen på sin egen forklaring.
 */
const HTML = src('../index.html')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const UI = src('../js/ui.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** En rad slik `renderLayers` ville bygget den for `3Ø20` nederst. `label`,
 *  `dc` og `facts` er ferdig formatert HTML derfra — akkurat som i drift. */
const VIEW = {
  id: 'L1',
  edge: 'bottom',
  label: '<b class="text-amber-300">3</b> × <b class="text-amber-300">Ø20.0</b>',
  dc: 'd<sub>c</sub> 50.0 <span title="Derived automatically (EC2 8.2 stacking)">🔒</span>',
  facts: 'A<sub>s</sub> 942 mm² · d 550 mm · 3 bars',
};

/* ---------------------------------------------------------------- *
 * En liten strukturleser
 * ---------------------------------------------------------------- */

/**
 * Alle `<button>`-ene i markupen, med attributtstrengen, innmaten og
 * NESTEDYBDEN. Dybden er poenget: `1` for hver knapp betyr at ingen knapp
 * ligger inne i en annen, og det er den ene HTML-regelen som bestemte formen
 * på raden. En regex over hele strengen kunne ikke svart på det.
 */
function buttons(html) {
  const found = [];
  const stack = [];
  const re = /<button\b([^>]*)>|<\/button>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[1] !== undefined) {
      stack.push({ attrs: m[1], from: re.lastIndex, depth: stack.length + 1 });
    } else {
      const open = stack.pop();
      assert.ok(open, 'markupen har en </button> uten <button>');
      found.push({ attrs: open.attrs, depth: open.depth, inner: html.slice(open.from, m.index) });
    }
  }
  assert.equal(stack.length, 0, 'markupen har en <button> som aldri lukkes');
  return found;
}

/** Knappen som bærer `data-open` — den som åpner radeditoren. */
const opener = (html) => {
  const hit = buttons(html).filter((b) => /\bdata-open=/.test(b.attrs));
  assert.equal(hit.length, 1, `fant ${hit.length} knapper med data-open, forventet nøyaktig én`);
  return hit[0];
};

/** Alt som tar imot fokus i en rad, i dokumentrekkefølge. */
const tabStops = (html) =>
  Array.from(html.matchAll(/<(button|input|select|textarea|a)\b([^>]*)>/g), (m) => m[2]);

/* ---------------------------------------------------------------- *
 * Treffområdet
 * ---------------------------------------------------------------- */

test('radknappen dekker id, etikett, d_c og arealteksten — ikke bare en blyant', () => {
  // DETTE er hele bestillingen. Før endringen bar blyanten `data-open`, og
  // innmaten dens var ett enkelt tegn («✎») — 1,8 % av radflaten. Alle fire
  // påstandene under ville feilet da.
  const btn = opener(layerRowHtml(VIEW));
  assert.ok(btn.inner.includes('L1'), 'lag-id-en ligger utenfor radknappen');
  assert.ok(btn.inner.includes('Ø20.0'), 'etiketten ligger utenfor radknappen');
  assert.ok(btn.inner.includes('d<sub>c</sub> 50.0'), 'd_c ligger utenfor radknappen');
  assert.ok(btn.inner.includes('942 mm²'), 'arealteksten ligger utenfor radknappen');
});

test('radknappen VOKSER, så den fyller raden i stedet for å sitte i et hjørne', () => {
  // `flex-1` er forskjellen mellom «hele raden er klikkbar» og «knappen er
  // like bred som teksten i den». Uten den ville testen over vært sann og
  // brukeren likevel hatt et lite mål å sikte på.
  const btn = opener(layerRowHtml(VIEW));
  assert.match(btn.attrs, /\bclass="[^"]*\bflex-1\b/, 'radknappen har ingen flex-1 og vokser ikke');
});

test('radknappen er et EKTE button — ikke en div med role="button"', () => {
  // `tests/form-structure.test.mjs` forbyr `tabindex` i hele modulen, og en
  // `<div role="button">` uten `tabindex` er usynlig for Tab. Skranken velger
  // formen, og den velger riktig: Tab og Enter følger med en ekte knapp.
  const html = layerRowHtml(VIEW);
  assert.match(opener(html).attrs, /\btype="button"/, 'radknappen mangler type="button"');
  assert.ok(!/role="button"/.test(html), 'raden bruker role="button" i stedet for en ekte knapp');
  assert.ok(!/\btabindex\b/.test(html), 'radmarkupen har fått et tabindex');
});

/* ---------------------------------------------------------------- *
 * De tre som IKKE skal åpne editoren
 * ---------------------------------------------------------------- */

test('BOT/TOP, dupliser og slett ligger som SØSKEN, ikke inne i radknappen', () => {
  // Ville de ligget inne i radknappen, var markupen ugyldig HTML — og et klikk
  // på «slett» ville dessuten boblet opp og åpnet editoren for raden det
  // nettopp slettet. Søskenformen er det som gjør at de tre klikkene
  // fortsatt gjør nøyaktig én ting hver.
  const btn = opener(layerRowHtml(VIEW));
  for (const attr of ['data-edge', 'data-dup', 'data-del']) {
    assert.ok(!btn.inner.includes(attr), `${attr} ligger INNE i radknappen`);
  }
});

test('ingen knapp ligger inne i en annen knapp — verken lukket eller åpen rad', () => {
  // Radeditoren har sine egne knapper (Ø-brikkene, låsen, Bottom/Top, Close).
  // Kom den til å havne inne i radknappen, ville nettleseren splittet markupen
  // på egen hånd og resten av raden endt utenfor knappen.
  for (const editor of ['', '<div class="px-3"><button type="button" class="chip" data-close="1">Close</button></div>']) {
    for (const b of buttons(layerRowHtml({ ...VIEW, open: !!editor, editor }))) {
      assert.equal(b.depth, 1, `en knapp ligger på dybde ${b.depth}: ${b.attrs}`);
    }
  }
});

/* ---------------------------------------------------------------- *
 * Tastaturet
 * ---------------------------------------------------------------- */

test('en lukket rad har nøyaktig FIRE tab-stopp, og det første åpner editoren', () => {
  // Før endringen var de fire: BOT/TOP, blyant, dupliser, slett — og det
  // FØRSTE var BOT/TOP. Nå er de fortsatt fire, fordi blyanten er nedgradert
  // fra knapp til `<span>` samtidig som raden ble en knapp. Hadde den fått
  // stå, ville «åpne» kostet to stopp og raden hatt fem.
  const stops = tabStops(layerRowHtml(VIEW));
  assert.equal(stops.length, 4, `raden har ${stops.length} tab-stopp, forventet 4`);
  assert.match(stops[0], /\bdata-open=/, 'det første tab-stoppet i raden åpner ikke editoren');
  assert.deepEqual(
    stops.slice(1).map((a) => (a.match(/\bdata-(edge|dup|del)=/) || [])[1]),
    ['edge', 'dup', 'del'],
    'rekkefølgen på de tre søskenknappene har endret seg');
});

test('blyanten er et merke, ikke en knapp', () => {
  // Den er beholdt fordi den er den ENESTE synlige beskjeden om at raden kan
  // åpnes — men som `<button>` ville den vært et femte tab-stopp som gjør
  // nøyaktig det samme som raden rundt seg.
  const html = layerRowHtml(VIEW);
  assert.ok(html.includes('✎'), 'åpne-affordansen er borte fra den lukkede raden');
  assert.ok(layerRowHtml({ ...VIEW, open: true }).includes('▾'), 'den åpne raden viser ikke ▾');
  for (const b of buttons(html)) {
    assert.ok(!b.inner.trim().match(/^[✎▾]$/), 'blyanten er fortsatt en egen knapp');
  }
});

test('radknappen melder om editoren er åpen', () => {
  // `aria-expanded` er den eneste måten en skjermleser kan få vite at knappen
  // folder ut noe under seg. Den fantes ikke før — blyanten sa ingenting.
  assert.match(opener(layerRowHtml(VIEW)).attrs, /aria-expanded="false"/);
  assert.match(opener(layerRowHtml({ ...VIEW, open: true })).attrs, /aria-expanded="true"/);
});

/* ---------------------------------------------------------------- *
 * Raden og resten av modulen
 * ---------------------------------------------------------------- */

test('editoren ligger inne i .lrow, UNDER radknappen', () => {
  // Lå den utenfor `.lrow`, ville `divide-y` på `#layers` tegnet en skillelinje
  // mellom raden og dens egen editor, og en åpen rad sett ut som to rader.
  const html = layerRowHtml({ ...VIEW, open: true, editor: '<div id="ed"></div>' });
  assert.ok(html.indexOf('<div id="ed">') > html.indexOf('data-open='), 'editoren kommer før radknappen');
  assert.ok(html.trimEnd().endsWith('</div>'), '.lrow lukkes ikke rundt editoren');
  assert.ok(html.slice(html.indexOf('<div id="ed">')).includes('</div>'), 'editoren ligger utenfor .lrow');
});

test('lag-id-en eskapes på vei inn i attributtene', () => {
  // Id-en er brukerdata så snart en fil lastes inn. Den står i fire attributter
  // i hver rad; slipper et anførselstegn gjennom, er raden en annen rad.
  const html = layerRowHtml({ ...VIEW, id: 'L"1' });
  assert.ok(!/data-open="L"1"/.test(html), 'id-en brøt ut av data-open');
  assert.ok(html.includes('data-open="L&quot;1"'), 'id-en eskapes ikke');
});

test('`data-open` er fortsatt den ENE kroken bindLayerRows fester åpningen i', () => {
  // Radknappen arver bindingen blyanten hadde, og det er hele poenget:
  // `render()` bygger `#layers` med `innerHTML`, og `bindLayerRows` kjøres på
  // nytt etterpå. Ingen NY lytter ble lagt til, så ingen ny lytter kan dø ved
  // neste omtegning — og fokusfella `stirrupEditInFlight` finnes for, arves
  // ikke hit.
  const body = UI.slice(UI.indexOf('function bindLayerRows(host)'), UI.indexOf('function setLayerValue('));
  assert.ok(body.includes("host.querySelectorAll('[data-open]')"), 'bindLayerRows binder ikke [data-open] lenger');
  const render = UI.slice(UI.indexOf('function renderLayers()'), UI.indexOf('function rowEditor('));
  assert.ok(render.includes('bindLayerRows(host)'), 'renderLayers binder ikke radene etter innerHTML');
  assert.ok(render.includes('layerRowHtml('), 'renderLayers bygger ikke raden med layerRowHtml');
});

test('BARE armeringsradene er klikkbare — bøyle- og kombinasjonsradene er urørt', () => {
  // De to andre radlistene har alle feltene synlige inline (`data-sf`,
  // `data-cf`). En radknapp rundt dem ville lagt et klikkmål oppå et
  // `<input>` — og et input inne i en knapp er dessuten ugyldig HTML.
  const stirrups = UI.slice(UI.indexOf('function renderStirrups()'), UI.indexOf('function bindStirrupRows('));
  const combos = UI.slice(UI.indexOf('function renderCombos()'), UI.indexOf('function bindComboRows('));
  for (const [name, body] of [['renderStirrups', stirrups], ['renderCombos', combos]]) {
    assert.ok(body.length > 200, `fant ikke kroppen til ${name} — slicen har råtnet`);
    assert.ok(!body.includes('layerRowHtml'), `${name} har fått armeringsradens knapp`);
    assert.ok(!body.includes('data-open'), `${name} har fått en radknapp`);
  }
});

/* ---------------------------------------------------------------- *
 * Stilarket
 * ---------------------------------------------------------------- */

test('.lact er ikke lenger usynlig til musa er over raden', () => {
  // `.lact { opacity: 0 }` var halvparten av klagen: dupliser og slett fantes
  // ikke for øyet før pekeren tilfeldigvis traff raden. Når hele raden er
  // klikkbar, er det ingen grunn igjen til å gjemme dem.
  const rules = HTML.match(/\.lact\s*\{[^}]*\}/g) || [];
  for (const rule of rules) {
    assert.ok(!/opacity\s*:\s*0\b/.test(rule), `.lact skjules fortsatt: ${rule}`);
  }
  assert.ok(!/\.lrow:hover\s+\.lact/.test(HTML), 'hover-avsløringen av .lact står igjen');
});

test('radknappen har både hover og en synlig fokusring', () => {
  // Hover er det som forteller musebrukeren at raden ER et mål;
  // `:focus-visible` er det samme for tastaturet. Uten den andre er raden
  // nåbar med Tab uten at noe viser hvor man er.
  assert.match(HTML, /\.lmain:hover\s*\{[^}]*background/, '.lmain har ingen hover-tilbakemelding');
  assert.match(HTML, /\.lmain:focus-visible\s*\{[^}]*outline/, '.lmain har ingen fokusring');
});
