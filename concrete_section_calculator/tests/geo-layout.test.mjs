/**
 * geo-layout.test.mjs — seksjon 2 sitt grid, feltraden og figurkallet (runde 8 §3).
 *
 * HVORFOR DENNE FILA FINNES
 * Det som gikk galt her var ikke en gal linje, men en MANGEL: `ui.js` kalte
 * `drawSection` uten `height`, og arvet dermed stille `DEFAULT_MAX_HEIGHT = 110`
 * rapport-mm — en regel som finnes for at en figur ikke skal sprenge en A4-side.
 * Skjermen har ingen sidebrytning å ta hensyn til, men betalte for den likevel:
 * målt ble betongen 75 × 150 px og fylte 25,6 % av figurbredden.
 *
 * Et utelatt argument har ingen linje å peke på, så ingen av de eksisterende
 * testene kunne nå det. Testene her REGNER i stedet: de leser tallene `ui.js`
 * faktisk sender, kjører dem gjennom den ekte `sectionViewBox`, og påstår at
 * resultatet er bedre enn det man får uten dem. Da er det umulig å «rette»
 * kallet tilbake til å utelate høyden uten at noe blir rødt.
 *
 * TO KILDER: tallene hentes ut av `js/ui.js` med regex i stedet for å stå som
 * kopier her. En kopi ville gjort testen grønn på sine egne tall den dagen
 * kallet ble endret — som er nøyaktig den svikten den skal fange.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { sectionViewBox } from '../js/section-draw.js';

const src = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

/** Kommentarene må vekk først — de siterer både klassenavn og `height:`. */
const HTML = src('../index.html').replace(/<!--[\s\S]*?-->/g, '');
const UI = src('../js/ui.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '');

/** De to standardsnittene planen måler på. De har med vilje motsatt sideforhold:
 *  bjelken er 1:2 og plata 5:1, og en rettelse som bare hjelper det ene er ingen
 *  rettelse. Feltene er dem `barPositions` og merkelappsonen faktisk leser. */
const BEAM = {
  sectionType: 'beam', geometry: { b: 300, h: 600 },
  cover: 35, cover_side: 35,
  // Bøyla bor i RADEN, ikke i et geometrifelt. dc = 35 + 12 + 20/2 = 57.
  shear: { strut_angle_deg: 45, z_factor: 0.9,
    stirrups: [{ id: 'S1', dia: 12, spacing: 150, legs: 2, fywk: 500, alpha: 90 }] },
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 57 }],
};
const SLAB = {
  sectionType: 'slab', geometry: { b: 1000, h: 200 },
  cover: 35, cover_side: 35,
  // Ingen bøylerad: dc = 35 + 0 + 12/2 = 41.
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 200, edge: 'bottom', dc: 41 }],
};

/** Tallene `ui.js` sender, lest ut av kilden. */
function geoDrawOpts() {
  const num = (name) => {
    const m = UI.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)`));
    assert.ok(m, `fant ikke konstanten ${name} i ui.js — regexen eller navnet har råtnet`);
    return Number(m[1]);
  };
  return { width: num('GEO_DRAW_WIDTH'), height: num('GEO_DRAW_HEIGHT'), unit: 'px' };
}

/** Andelen av figurbredden tverrsnittet dekker. Det er tallet brukeren klaget på. */
function widthFill(state, opts) {
  const vb = sectionViewBox(state, opts);
  const b = state.sectionType === 'slab' ? 1000 : state.geometry.b;
  return (b * vb.scale) / (vb.w * vb.scale);
}

/* ---------------------------------------------------------------- *
 * Figurkallet
 * ---------------------------------------------------------------- */

test('#draw-geo-kallet sender en eksplisitt height, ikke bare width', () => {
  // Uten `height` arver skjermen A4-regelen. Påstanden er på KALLET og ikke
  // bare på at konstanten finnes: en konstant ingen sender er død kode.
  // ANKRET på `drawGeo.innerHTML`: `ui.js` har FIRE drawSection-kall (#draw-geo,
  // #draw-result, #bar-thumb og rapportens), og et uankret regex plukket det
  // første i fila — som er resultatfigurens. En test som måler feil kall er
  // verre enn ingen test.
  const call = UI.match(/drawGeo\.innerHTML\s*=\s*drawSection\(s,\s*\{[\s\S]*?\}\)/);
  assert.ok(call, 'fant ikke drawSection-kallet for #draw-geo');
  assert.match(call[0], /width:\s*GEO_DRAW_WIDTH/, 'kallet sender ikke GEO_DRAW_WIDTH');
  assert.match(call[0], /height:\s*GEO_DRAW_HEIGHT/, 'kallet sender ikke GEO_DRAW_HEIGHT');
});

test('høyden som sendes gjør bjelkefiguren større, ikke mindre', () => {
  // Den harde påstanden: MED tallene fra ui.js skal bjelken fylle mer av
  // bredden enn den gjør når høyden utelates. Utelates den igjen, faller
  // `etter` tilbake på `foer` og forskjellen forsvinner.
  const opts = geoDrawOpts();
  const foer = widthFill(BEAM, { width: opts.width, unit: 'px' });
  const etter = widthFill(BEAM, opts);
  assert.ok(foer < 0.30, `utgangspunktet var 25,6 % — fikk ${(foer * 100).toFixed(1)} %`);
  assert.ok(etter > 0.40,
    `bjelken fyller bare ${(etter * 100).toFixed(1)} % av figurbredden; høyden binder fortsatt for hardt`);
  assert.ok(etter > foer * 1.5, 'høyden ga ingen reell forbedring for bjelken');
});

test('høyden rører ikke plata — den er breddebundet', () => {
  // Plata er 5:1 og begrenses av bredden uansett hva høyden sier. Testen står
  // her fordi det er den eneste måten å vise at forbedringen for bjelken ikke
  // er betalt av plata: et tak som var for lavt ville klemt plata flat.
  const opts = geoDrawOpts();
  const foer = sectionViewBox(SLAB, { width: opts.width, unit: 'px' }).scale;
  const etter = sectionViewBox(SLAB, opts).scale;
  assert.equal(etter, foer, 'platas målestokk endret seg — høyden binder der den ikke skal');
  assert.ok(widthFill(SLAB, opts) > 0.70, 'plata fyller ikke lenger bredden sin');
});

test('tegneflata er aldri høyere enn den er bred', () => {
  // Regelen bak tallet, ikke tallet: den samme boksen må bære et stående og et
  // liggende snitt, og et kvadrat favoriserer ingen av dem. Skrur noen høyden
  // opp for å få bjelken enda større, vokser kortet ut av seksjonen.
  const opts = geoDrawOpts();
  assert.ok(opts.height <= opts.width,
    `tegneflata er ${opts.width} × ${opts.height} — høyere enn den er bred`);
  for (const [navn, st] of [['bjelke', BEAM], ['plate', SLAB]]) {
    const vb = sectionViewBox(st, opts);
    assert.ok(vb.h * vb.scale <= opts.width + 1e-6,
      `${navn}-figuren ble ${(vb.h * vb.scale).toFixed(1)} papirenheter høy`);
  }
});

/* ---------------------------------------------------------------- *
 * Griddet og feltraden i index.html
 * ---------------------------------------------------------------- */

/** Seksjon 2 fra `<section id="s-geo"` til og med figurkortet. */
const GEO = (() => {
  const i = HTML.indexOf('id="s-geo"');
  assert.ok(i > 0, 'fant ikke seksjon 2 i index.html');
  const j = HTML.indexOf('id="draw-geo"', i);
  assert.ok(j > i, 'fant ikke figurkortet i seksjon 2');
  return HTML.slice(i, j);
})();

test('seksjon 2-griddet gir figuren resten, ikke skjemaet', () => {
  // Før: `md:grid-cols-[1fr_320px]` — skjemaet fikk all overskuddsbredden og
  // figuren en fast, liten spalte. Målt ga det 598 px skjema mot 320 px figur.
  // Påstanden er retningen: `1fr` skal ikke lenger stå FØRST i sporlista.
  const m = GEO.match(/md:grid-cols-\[([^\]]+)\]/);
  assert.ok(m, 'seksjon 2 har ikke lenger et eksplisitt kolonneoppsett');
  const spor = m[1];
  assert.ok(!/^1fr_/.test(spor), `skjemasporet er fortsatt 1fr: ${spor}`);
  assert.ok(/1fr\)?\]?$/.test(spor) || /1fr/.test(spor.split('_').slice(1).join('_')),
    `figursporet er ikke det elastiske: ${spor}`);
  assert.ok(!/_320px\]/.test(m[0]), 'figuren står fortsatt på faste 320 px');
});

test('figurkortet strekkes ikke til skjemaets høyde', () => {
  // `items-start`. Uten den arvet kortet radhøyden fra skjemaet og sto med
  // dødplass under tegningen — målt 194 av 271 px for plata, som er hele
  // forskjellen mellom «figuren er liten» og «figuren har luft rundt seg».
  const rad = GEO.match(/<div class="[^"]*grid md:grid-cols-\[[^"]*"/);
  assert.ok(rad, 'fant ikke griddets klasseliste');
  assert.match(rad[0], /\bitems-start\b/, 'griddet strekker fortsatt begge kolonnene like høye');
});

test('b, h og cover står i ÉN rad med tre kolonner', () => {
  // Raden var firedelt så lenge «Stirrup Ø» sto her. Feltet er fjernet —
  // bøylediameteren har ÉN kilde, og den er bøyleraden under Skjærarmering —
  // så tre felt skal dele raden. Påstanden er at de tre ligger i SAMME
  // grid-beholder: ligger de i hver sin, er den brede formen tilbake uansett
  // hva klassen sier.
  const rader = Array.from(GEO.matchAll(/<div class="([^"]*grid[^"]*)">([\s\S]*?)<\/div>\s*(?=<)/g));
  const feltrad = rader.find((r) => r[2].includes('id="i-b"'));
  assert.ok(feltrad, 'fant ikke raden som inneholder #i-b');
  for (const id of ['i-b', 'i-h', 'i-cover']) {
    assert.ok(feltrad[2].includes(`id="${id}"`), `#${id} ligger ikke i samme feltrad som #i-b`);
  }
  assert.match(feltrad[1], /\bgrid-cols-3\b/, `feltraden er ikke tredelt: ${feltrad[1]}`);
});

test('geometrifeltet for bøylediameteren finnes ikke lenger — bøyla har ÉN kilde', () => {
  // To felt for ett fysisk jern, holdt i takt av en `syncStirrupDia`: det er
  // feilformen som har gitt gale tall i denne modulen runde etter runde. Både
  // inputen og wrapperen `ui.js` skjulte for plata skal være borte, ellers kan
  // et felt uten binding stå igjen og se ut som om det styrer noe.
  assert.ok(!/id="i-stirrup"/.test(HTML), '#i-stirrup står fortsatt i markupen');
  assert.ok(!/id="w-stirrup"/.test(HTML), '#w-stirrup står fortsatt i markupen');
  assert.ok(!/id="i-stirrup"/.test(UI), 'ui.js binder fortsatt et geometrifelt for bøyla');
  assert.ok(!/w-stirrup/.test(UI), 'ui.js skjuler fortsatt en wrapper som ikke finnes');
});

test('geometrifeltene står i rekkefølgen b, h, cover', () => {
  // Rekkefølgen er den brukeren leser tverrsnittet i, og den er lik for
  // bjelke og plate: ingen av de tre skjules, så ingen av dem bytter plass
  // når man bytter tverrsnittstype.
  const rekkefolge = ['i-b', 'i-h', 'i-cover'].map((id) => GEO.indexOf(`id="${id}"`));
  assert.ok(rekkefolge.every((p) => p > 0), 'et av geometrifeltene mangler');
  for (let i = 1; i < rekkefolge.length; i++) {
    assert.ok(rekkefolge[i] > rekkefolge[i - 1], 'geometrifeltene står i feil rekkefølge');
  }
});
