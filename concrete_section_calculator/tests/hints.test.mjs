/**
 * hints.test.mjs — spørsmålstegnet og boblen bak det (runde 8 §4).
 *
 * HVORFOR DENNE FILA FINNES
 * Bestillingen er en ATFERD, ikke en streng: hover åpner, klikk låser så man
 * kan lese i ro eller merke teksten, Escape lukker, klikk utenfor lukker, Tab
 * pluss Enter åpner. Ingen av de fem kan påstås med et tekstsøk i kilden — et
 * søk etter «addEventListener('click'» sier at det finnes en lytter, ikke hva
 * den gjør, og «klikk utenfor lukker» er nettopp det den IKKE gjør hvis
 * betingelsen inni er snudd.
 *
 * Modulen har ingen DOM-emulator og skal ikke få en (ingen avhengigheter er
 * hele grunnen til at `node --test` kjører på under et sekund). Så `attachHints`
 * henter dokumentet og vinduet fra VERTEN sin — `host.ownerDocument` og
 * `.defaultView` — i stedet for fra globalene, og da holder den lille stubben
 * nederst i denne kommentarblokka. Den er ~70 linjer og kan bare det hints.js
 * faktisk bruker; alt annet kaster med vilje, slik at stubben ikke stille kan
 * begynne å svare feil den dagen fila tar i bruk noe nytt.
 *
 * Resten av testene leser markupen og registeret som TEKST, og de svarer på
 * det ene spørsmålet stubben ikke kan: står forklaringen ETT sted nå? Teksten
 * skulle FLYTTES, ikke slettes — og en tekst som ble flyttet uten å bli
 * fjernet fra der den sto, er ikke flyttet, den er kopiert.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { attachHints, hintPosition } from '../js/hints.js';
import { HINTS } from '../js/ui.js';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Kommentarene siterer selv `data-hint`, `HINTS` og de flyttede setningene —
 *  uten dette ville testene målt begrunnelsen i stedet for koden. */
const HTML = src('../index.html').replace(/<!--[\s\S]*?-->/g, '');
const UI = src('../js/ui.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');
const HINTS_JS = src('../js/hints.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/**
 * `ui.js` UTEN selve registeret.
 *
 * Registeret BOR i `ui.js`, så et rått søk etter en flyttet setning i `UI`
 * finner den alltid — i sitt nye hjem — og testen under ville vært grønn
 * uansett om den gamle kopien sto igjen eller ikke. Det er nøyaktig den
 * blindheten testen finnes for å unngå, så registerblokka klippes bort før vi
 * spør om teksten står noe ANNET sted i fila.
 */
const UI_UTEN_REGISTER = (() => {
  const i = UI.indexOf('export const HINTS = {');
  assert.ok(i > 0, 'fant ikke HINTS i ui.js');
  const j = UI.indexOf('\n};', i);
  assert.ok(j > i, 'fant ikke slutten på HINTS');
  return UI.slice(0, i) + UI.slice(j + 3);
})();

/* ================================================================== *
 * En DOM så liten som `hints.js` tillater
 * ================================================================== */

class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.innerHTML = '';
    this.listeners = new Map();
    /** Klientrektangelet. Settes av testen der plasseringen betyr noe. */
    this.rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  }

  appendChild(el) { el.parentNode = this; this.children.push(el); return el; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  getBoundingClientRect() { return this.rect; }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }

  /** Bare `[attributt]`. Alt annet kaster — se kommentaren øverst. */
  closest(sel) {
    const attr = (String(sel).match(/^\[([\w-]+)\]$/) || [])[1];
    assert.ok(attr, `teststubben kan bare [attributt]-selektorer, hints.js ba om «${sel}»`);
    const key = attr.replace(/^data-/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
    for (let n = this; n; n = n.parentNode) if (n.dataset && key in n.dataset) return n;
    return null;
  }
}

/** Én hendelse, sendt oppover som i en nettleser. Returnerer hendelsen, slik
 *  at testen kan spørre om `preventDefault` faktisk ble kalt. */
function fire(target, type) {
  const ev = {
    type,
    target,
    defaultPrevented: false,
    stopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  for (let n = target; n && !ev.stopped; n = n.parentNode) {
    for (const fn of n.listeners.get(type) || []) {
      fn(ev);
      if (ev.stopped) break;
    }
  }
  return ev;
}

/**
 * En side med to merker, ett av dem inne i en `<summary>` (som i `adv-spacing`),
 * ett merke med en nøkkel registeret ikke har, og noe å klikke UTENFOR.
 */
function page(texts = HINTS) {
  const win = {
    innerWidth: 1200,
    innerHeight: 800,
    listeners: new Map(),
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, []);
      this.listeners.get(type).push(fn);
    },
    emit(type) { for (const fn of this.listeners.get(type) || []) fn(); },
  };
  const doc = { defaultView: win, createElement: null, body: null };
  doc.createElement = (tag) => new El(tag, doc);
  doc.body = new El('body', doc);

  const make = (key, top) => {
    const el = doc.createElement('button');
    if (key !== null) el.dataset.hint = key;
    el.attrs['aria-expanded'] = 'false';
    el.rect = { top, bottom: top + 17, left: 300, right: 317, width: 17, height: 17 };
    return el;
  };

  const loads = doc.body.appendChild(make('loads', 100));
  const summary = doc.body.appendChild(doc.createElement('summary'));
  const spacing = summary.appendChild(make('bar-spacing', 200));
  const unknown = doc.body.appendChild(make('no-such-key', 300));
  const outside = doc.body.appendChild(make(null, 400));

  const handle = attachHints(doc.body, texts);
  const bubble = () => doc.body.children.find((c) => c.attrs.role === 'tooltip') || null;
  // Boblen lages først ved første åpning, så «ingen boble» og «skjult boble»
  // er det SAMME svaret her: lukket.
  const open = () => { const b = bubble(); return Boolean(b) && b.style.display === 'block'; };
  return { doc, win, handle, loads, spacing, summary, unknown, outside, bubble, open };
}

/* ================================================================== *
 * Plasseringen — den delen som kan gå galt uten at det synes
 * ================================================================== */

test('boblen står UNDER merket når det er plass', () => {
  const p = hintPosition({ top: 100, bottom: 117, left: 300 }, { width: 400, height: 90 },
    { width: 1200, height: 800 });
  assert.equal(p.placement, 'below');
  assert.ok(p.top > 117, 'boblen dekker merket den hører til');
  assert.equal(p.left, 300, 'boblen står ikke i flukt med merket');
});

test('boblen flyttes OVER merket når det ikke er plass under', () => {
  // Merket nederst på skjermen. Uten dette ville boblen blitt dyttet ned under
  // vindusranden og vært borte uten en eneste feilmelding.
  const p = hintPosition({ top: 700, bottom: 717, left: 300 }, { width: 400, height: 200 },
    { width: 1200, height: 800 });
  assert.equal(p.placement, 'above');
  assert.ok(p.top + 200 < 700, 'boblen dekker merket den hører til');
});

test('under vinner når det ikke er plass NOEN av stedene', () => {
  // En boble høyere enn vinduet. «Over» ville gitt en negativ topp, altså
  // teksten avkortet ovenfra; under ser man i det minste begynnelsen.
  const p = hintPosition({ top: 300, bottom: 317, left: 300 }, { width: 400, height: 900 },
    { width: 1200, height: 800 });
  assert.equal(p.placement, 'below');
  assert.ok(p.top >= 8, 'boblen ble plassert oppå vindusranden');
});

test('boblen klemmes inn fra høyre rand, og aldri ut til venstre', () => {
  // Merkene står i høyremarger og i `ml-auto`-sammendrag. Uten klemmingen
  // ville en 30rem bred boble der ligget delvis utenfor skjermen.
  const hoyre = hintPosition({ top: 100, bottom: 117, left: 1150 }, { width: 400, height: 90 },
    { width: 1200, height: 800 });
  assert.equal(hoyre.left, 1200 - 400 - 8, 'boblen stikker ut til høyre');
  const smalt = hintPosition({ top: 100, bottom: 117, left: 10 }, { width: 900, height: 90 },
    { width: 400, height: 800 });
  assert.ok(smalt.left >= 8, `boblen begynte på ${smalt.left} — utenfor venstre rand`);
});

/* ================================================================== *
 * De fem tingene brukeren ba om
 * ================================================================== */

test('hover åpner, og boblen viser registerets tekst', () => {
  const p = page();
  assert.equal(p.open(), false, 'boblen sto åpen før noen pekte på noe');
  fire(p.loads, 'pointerover');
  assert.equal(p.open(), true, 'hover åpnet ikke hintet');
  assert.equal(p.bubble().innerHTML, HINTS.loads, 'boblen viser ikke registerets tekst');
  assert.equal(p.loads.getAttribute('aria-expanded'), 'true');
});

test('pekeren forlater merket, og en ULÅST boble lukker seg', () => {
  const p = page();
  fire(p.loads, 'pointerover');
  fire(p.outside, 'pointerover');
  assert.equal(p.open(), false, 'boblen ble stående etter at pekeren forlot merket');
  assert.equal(p.loads.getAttribute('aria-expanded'), 'false');
});

test('klikk LÅSER — hover et annet sted river den ikke bort', () => {
  // Dette er hele forskjellen på «se» og «lese». Uten låsen kan man verken
  // lese i ro eller dra en markering gjennom teksten.
  const p = page();
  fire(p.loads, 'click');
  assert.equal(p.open(), true, 'klikk åpnet ikke hintet');
  fire(p.outside, 'pointerover');
  assert.equal(p.open(), true, 'et låst hint lot seg lukke av at musa gled forbi');
  fire(p.spacing, 'pointerover');
  assert.equal(p.bubble().innerHTML, HINTS.loads, 'et låst hint byttet tekst ved hover');
});

test('en LÅST boble tar imot musa, en ulåst slipper den gjennom', () => {
  // `pointer-events` er ikke pynt her: en markering kan ikke dras gjennom noe
  // som ikke tar imot pekeren, og en ULÅST boble som tok imot ville lukket seg
  // selv i det den la seg under musa.
  const p = page();
  fire(p.loads, 'pointerover');
  assert.equal(p.bubble().style.pointerEvents, 'none', 'hover-boblen stjeler pekeren');
  fire(p.loads, 'click');
  assert.equal(p.bubble().style.pointerEvents, 'auto', 'den låste boblen kan ikke merkes');
  assert.equal(p.bubble().style.userSelect, 'text');
});

test('klikk på det SAMME merket igjen lukker — merket er en bryter', () => {
  const p = page();
  fire(p.loads, 'click');
  fire(p.loads, 'click');
  assert.equal(p.open(), false, 'andre klikk lukket ikke hintet');
});

test('klikk utenfor lukker, men et klikk INNE i boblen gjør ikke', () => {
  // Et klikk inne i teksten er begynnelsen på en markering, ikke et ønske om
  // å lukke. Snus betingelsen, forsvinner teksten i det man tar tak i den.
  const p = page();
  fire(p.loads, 'click');
  const bubble = p.bubble();
  fire(bubble, 'click');
  assert.equal(p.open(), true, 'boblen lukket seg da man klikket i teksten sin egen');
  fire(p.outside, 'click');
  assert.equal(p.open(), false, 'klikk utenfor lukket ikke');
});

test('klikket på merket avlyses, så ETT trykk gir ÉN virkning', () => {
  // Merket i `adv-spacing` ligger inne i en `<summary>`, og merket ved
  // «Stirrup Ø» inne i en `<label>`. Uten `preventDefault` ville det samme
  // trykket åpnet hintet OG foldet ut boksen / flyttet fokus til feltet.
  const p = page();
  const ev = fire(p.spacing, 'click');
  assert.equal(ev.defaultPrevented, true, 'klikket folder fortsatt ut <details>/fokuserer feltet');
  assert.equal(p.open(), true, 'hintet åpnet seg ikke fra et merke inne i en <summary>');
  assert.equal(p.bubble().innerHTML, HINTS['bar-spacing']);
});

test('Escape-døra: `isOpen` og `close` er det `topOverlay` trenger', () => {
  const p = page();
  assert.equal(p.handle.isOpen(), false);
  fire(p.loads, 'click');
  assert.equal(p.handle.isOpen(), true, 'håndtaket ser ikke et åpent hint');
  p.handle.close();
  assert.equal(p.handle.isOpen(), false);
  assert.equal(p.open(), false, 'håndtakets close() lukket ikke boblen');
  assert.equal(p.loads.getAttribute('aria-expanded'), 'false');
});

/* ================================================================== *
 * Det som IKKE skal skje
 * ================================================================== */

test('et merke med en nøkkel registeret ikke har, åpner INGENTING', () => {
  // En tom boks under merket ville sett ut som en forklaring som var blank.
  // Ingen boble er et savn man ser; en tom boble er et savn man tror er svaret.
  const p = page();
  fire(p.unknown, 'pointerover');
  assert.equal(p.open(), false, 'en ukjent nøkkel ga en tom boble');
  fire(p.unknown, 'click');
  assert.equal(p.open(), false, 'en ukjent nøkkel ga en tom boble ved klikk');
});

test('merket som ruller ut av syne tar boblen med seg', () => {
  // Boblen er `position: fixed` og ville ellers blitt stående klemt mot randen
  // og pekt på et merke som ikke var på skjermen lenger.
  const p = page();
  fire(p.loads, 'click');
  p.loads.rect = { ...p.loads.rect, top: -60, bottom: -43 };
  p.win.emit('scroll');
  assert.equal(p.open(), false, 'boblen ble stående etter at merket rullet vekk');
});

test('to kall på samme vert gir ikke to sett lyttere', () => {
  // `mount()` kalles én gang i dag, men en dobbel oppkobling ville gitt to
  // `open` per hover og en bryter som lukket og åpnet i samme klikk.
  const p = page();
  const foer = p.doc.body.listeners.get('click').length;
  attachHints(p.doc.body, HINTS);
  assert.equal(p.doc.body.listeners.get('click').length, foer, 'verten fikk lyttere to ganger');
});

test('lytterne er DELEGERT på verten — ingen henger på merkene', () => {
  // Skranke 3: `render()` bygger radlistene med `innerHTML`, og merket ved
  // bøyleradens Ø bygges om ved hvert tastetrykk. En lytter hengt på merket
  // ville dødd ved første omtegning, stille.
  const p = page();
  for (const [navn, el] of [['loads', p.loads], ['bar-spacing', p.spacing]]) {
    assert.equal(el.listeners.size, 0, `merket «${navn}» fikk sin egen lytter`);
  }
  assert.ok(p.doc.body.listeners.has('pointerover'), 'verten lytter ikke på pointerover');
  assert.ok(p.doc.body.listeners.has('click'), 'verten lytter ikke på click');
  assert.ok(!/querySelectorAll/.test(HINTS_JS), 'hints.js leter opp merkene og binder dem enkeltvis');
});

/* ================================================================== *
 * Registeret, markupen og de flyttede tekstene
 * ================================================================== */

/** Hver `data-hint="…"` i markupen — både den statiske og den `ui.js` bygger. */
const marks = (text) => Array.from(text.matchAll(/data-hint="([^"]+)"/g), (m) => m[1]);
const ALL_MARKS = marks(HTML).concat(marks(UI));

test('hvert merke peker på en nøkkel som FINNES i HINTS', () => {
  // Samme svikt som `form-structure.test.mjs` er bygget rundt: et oppslag som
  // bommer svarer `undefined` uten å klage, og merket blir et spørsmålstegn
  // som ikke gjør noe når man trykker på det.
  assert.ok(ALL_MARKS.length >= 6, `fant bare ${ALL_MARKS.length} merker — regexen har råtnet`);
  for (const key of ALL_MARKS) {
    assert.ok(key in HINTS, `et merke peker på «${key}», men HINTS har ingen slik nøkkel`);
  }
});

test('hver nøkkel i HINTS har minst ETT merke — ingen tekst uten dør', () => {
  // Den motsatte veien. En forklaring ingen kan nå er verre enn ingen
  // forklaring: den ser ut som om den er levert.
  for (const key of Object.keys(HINTS)) {
    assert.ok(ALL_MARKS.includes(key), `HINTS har «${key}», men ingen markup peker på den`);
  }
});

test('bøylediameteren har ÉTT felt og dermed ÉTT merke', () => {
  // TRE UTGAVER FØR: linja under den første bøyleraden, `title` på bøyleradens
  // Ø, og `title` på geometrifeltet — tre litt ulike setninger om ett faktum.
  // De ble til ETT hint med TO merker, ett ved hvert av de to feltene.
  //
  // NÅ ER DET ETT FELT. Geometrifeltet «Stirrup Ø» er slettet: to felt for ett
  // fysisk jern er selve feilformen, og en synkronisering mellom dem er ikke
  // en løsning, den er et vedlikeholdskrav. Bøyleraden er eneste kilde, og
  // merket står der verdien står. To merker nå ville betydd at feltet er
  // tilbake et sted.
  assert.equal(ALL_MARKS.filter((k) => k === 'stirrup-dia').length, 1,
    'bøylediameteren skal ha nøyaktig ett merke — i bøyleraden');
  assert.ok(!/id="i-stirrup"/.test(HTML),
    'geometrifeltet for bøylediameteren er tilbake — da er det to kilder igjen');
  assert.ok(!/one physical stirrup/.test(UI_UTEN_REGISTER),
    'linja under den første bøyleraden står igjen');
  assert.ok(!/The same physical stirrup as/.test(UI_UTEN_REGISTER),
    'bøyleradens Ø har fortsatt sin egen utgave av setningen i et title');
  assert.ok(!/The same physical stirrup as/.test(HTML),
    'en egen utgave av setningen står igjen i et title i markupen');
});

test('hver flyttet tekst er BORTE fra der den sto — flyttet, ikke kopiert', () => {
  // Hele kravet i én test. Ble teksten stående igjen, har vi to kilder til den
  // samme forklaringen, og den dagen den ene rettes begynner de å si hver sitt.
  const FLYTTET = [
    ['loads', 'Every combination is checked', HTML, 'seksjon 4'],
    ['material-factors', 'cannot be 0: the calculation engine', HTML, 'adv-material'],
    ['strut-angle', 'variable strut inclination method', HTML, 'adv-shear'],
    ['bar-spacing', 'Minimum clear distance between parallel bars', HTML, 'adv-spacing'],
    ['analysis', 'run every combination and report the governing one',
      UI_UTEN_REGISTER, '#ana-active-combo'],
  ];
  for (const [key, frase, hvor, sted] of FLYTTET) {
    assert.ok(HINTS[key].includes(frase.split(':')[0].trim()) || HINTS[key].includes(frase),
      `HINTS.${key} bærer ikke lenger teksten fra ${sted}`);
    assert.ok(!hvor.includes(frase), `teksten står fortsatt i ${sted} — den ble kopiert, ikke flyttet`);
  }
});

test('det LEVENDE blir stående — navnet på den aktive kombinasjonen', () => {
  // Skillet er ikke lengde, men levetid. Navnet endrer seg når brukeren bytter
  // kombinasjon; regelen bak det gjør ikke. Samme grunn til at `data-m-interp`
  // ikke ble rørt i det hele tatt.
  assert.match(UI, /Active combination: \$\{label\}/,
    'den aktive kombinasjonen forsvant sammen med regelen bak den');
  assert.match(UI, /data-m-interp/, 'momenttolkningen per rad er borte — den skulle ikke røres');
  assert.match(UI, /anaDesc\.textContent/, '#ana-desc er borte — den bærer de MÅLTE kostnadene');
});

test('hvert merke er et EKTE button, uten tabindex', () => {
  // Samme skranke som valgte formen på armeringsraden: `tabindex` er forbudt i
  // modulen, og noe uten et er ikke tastaturnåbart. «Tab til tegnet, Enter
  // åpner» følger dermed med formen — Enter på en knapp ER et klikk.
  for (const kilde of [HTML, UI]) {
    for (const m of kilde.matchAll(/<([a-z]+)\b([^>]*\bdata-hint="[^"]*"[^>]*)>/g)) {
      assert.equal(m[1], 'button', `et merke er en <${m[1]}> og kan ikke nås med Tab`);
      assert.match(m[2], /\btype="button"/, 'et merke mangler type="button" og kan sende skjemaet');
      assert.match(m[2], /\baria-label="/, 'et merke har ingen aria-label — «?» leses som «?»');
      assert.match(m[2], /\baria-expanded="false"/, 'et merke starter ikke i lukket tilstand');
    }
  }
  assert.ok(!/\btabindex\b/.test(HINTS_JS), 'hints.js setter tabindex');
});

test('markupen har en .hint-regel med både hover og fokusring', () => {
  // Ringen rundt tegnet er hele affordansen — det er den som gjør merket til
  // noe annet enn et `title`, som ikke synes i det hele tatt.
  assert.match(HTML, /\.hint\s*\{[^}]*border-radius/, '.hint er ikke tegnet som et merke');
  assert.match(HTML, /\.hint:hover[^{]*\{/, '.hint svarer ikke på hover');
  assert.match(HTML, /\.hint:focus-visible\s*\{[^}]*outline/, '.hint har ingen fokusring');
  assert.match(HTML, /\.hint\[aria-expanded="true"\]/,
    'et LÅST merke ser ikke låst ut når musa har forlatt det');
});

/* ================================================================== *
 * Escape, uten en fjerde tastelytter
 * ================================================================== */

test('topOverlay spør hintet FØRST, og ingen ny tastelytter kom til', () => {
  // Escape lukker ETT overlegg om gangen, og hintet er det øverste — det er
  // det siste brukeren åpnet. Sto sjekken under hjelpelista, ville Escape
  // lukket rapporten UNDER en boble som ble stående igjen.
  const body = UI.slice(UI.indexOf('function topOverlay()'), UI.indexOf('const ACTIONS = {'));
  assert.ok(body.length > 60, 'fant ikke topOverlay — slicen har råtnet');
  assert.ok(body.indexOf('hints.isOpen()') >= 0, 'topOverlay spør ikke om et hint står åpent');
  assert.ok(body.indexOf('hints.isOpen()') < body.indexOf("$('#help')"),
    'hjelpelista lukkes før hintet');
  // ÉN snarveislytter på dokumentet. (Korthåndsfeltet har sin egen `keydown`
  // for ↑ i historikken; den er lokal og teller ikke her.) En egen
  // Escape-lytter for hintene ville vært en andre kilde til «hva lukker hva»,
  // og de to ville drevet fra hverandre ved første nye overlegg.
  assert.equal((UI.match(/document\.addEventListener\('keydown'/g) || []).length, 1,
    'ui.js har fått en global tastelytter til');
  assert.ok(!/addEventListener\('keydown'/.test(HINTS_JS), 'hints.js har sin egen tastelytter');
});

test('hintene kobles opp i mount(), på document.body', () => {
  // På `body`, ikke på en seksjon: «klikk utenfor lukker» krever at et klikk
  // hvor som helst på sida når fram, og et merke inne i en radliste skal
  // overleve at `render()` bygger lista på nytt.
  assert.match(UI, /hints\s*=\s*attachHints\(document\.body,\s*HINTS\)/,
    'mount() kobler ikke hintene til document.body');
});
