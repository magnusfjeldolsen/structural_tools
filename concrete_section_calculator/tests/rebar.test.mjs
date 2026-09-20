/**
 * rebar.test.mjs — tester for modulens viktigste fil.
 *
 * Tyngdepunktet ligger på `barPositions()`, fordi den er eneste kilde til
 * jernkoordinater og fordi en feil der ikke krasjer noe — den gir bare et
 * tverrsnitt som er litt annerledes enn det brukeren tegnet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  aswPerSpacing,
  barArea,
  barPositions,
  COMBO_TYPES,
  createCombo,
  createLayer,
  DEFAULT_STIRRUP_DIA,
  effectiveDepth,
  effectiveDepthGeometric,
  equivalentStrip,
  innermostLayer,
  layerArea,
  layerBarCount,
  layerCentroidZ,
  layerDepth,
  layersOnEdge,
  minClearBetween,
  minClearDistance,
  reinforcementRatio,
  recomputeAutoDc,
  stackedDc,
  createStirrup,
  stirrupArea,
  stirrupCoverDia,
  suggestedDc,
  tensionArea,
  tensionLayers,
  totalArea,
  totalAswPerSpacing,
} from '../js/rebar.js';

/** Standardtilstanden for §2.3/§3.3 i endringsrunde 2 — brukes gjennomgående. */
const STD = { k1: 1, k2: 5, d_g: 16 };

/**
 * `shear` med én bøylerad per oppgitt diameter.
 *
 * `state.stirrup_dia` FINNES IKKE LENGER: bøylediameteren har ÉN kilde, og den
 * er bøyleraden. En test som trenger en bøyle må derfor gi tilstanden en RAD,
 * ikke et tall i geometrien. Helperen tar flere diametre fordi
 * `stirrupCoverDia` skal svare med den STØRSTE av dem.
 */
const shearWith = (...dias) => ({
  strut_angle_deg: 45,
  z_factor: 0.9,
  stirrups: dias.map((dia, i) => ({
    id: `S${i + 1}`, dia, spacing: 150, legs: 2, fywk: 500, alpha: 90,
  })),
});

/** `shear` uten bøyler — platas tilstand, og en bjelke brukeren har tømt. */
const noShear = () => ({ strut_angle_deg: 45, z_factor: 0.9, stirrups: [] });

const stdState = (patch = {}) => ({
  cover: 35,
  // Ø8-bøyla sto før i `state.stirrup_dia`. Alle tallene i §2.3/§3.3 nedenfor
  // (53, 94, 110, …) er UENDRET: `dc = 35 + 8 + Ø/2` er samme regnestykke,
  // bare med diameteren lest fra raden i stedet for fra geometripanelet.
  shear: shearWith(8),
  cover_side: 35,
  spacing: STD,
  layers: [],
  ...patch,
});

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const BEAM_GEOM = { b: 300, h: 600 };
// `barPositions` sin `opts` er FORTSATT `{cover_side, stirrup_dia}` — det er
// funksjonens egen parameter, ikke et tilstandsfelt. Kalleren (`payload.js`,
// `section-draw.js`) skal fylle `stirrup_dia` med `stirrupCoverDia(state)`.
const BEAM_OPTS = { cover_side: 40, stirrup_dia: 0 };
const beamLayer = (patch = {}) => ({
  id: 'L1',
  mode: 'bars',
  dia: 20,
  count: 3,
  edge: 'bottom',
  dc: 50,
  ...patch,
});
const slabLayer = (patch = {}) => ({
  id: 'L1',
  mode: 'spacing',
  dia: 12,
  spacing: 113,
  edge: 'bottom',
  dc: 31,
  ...patch,
});

test('barArea er π·d²/4 — samme formel som PointGeometry bruker', () => {
  assert.equal(barArea(20), (Math.PI * 400) / 4);
  assert.equal(barArea(12), (Math.PI * 144) / 4);
});

test('layerArea: bjelkelag er antall × Ø, eksakt som referansebjelken', () => {
  assert.equal(layerArea(beamLayer()), 942.4777960769379);
});

test('layerArea: platelag regnes PER METER, ikke per jern', () => {
  // Ø12 c/c 113 skal gi ~1000 mm²/m — det er hele poenget med referanseplata.
  const As = layerArea(slabLayer());
  assert.equal(As, fixture('payload-slab-1000x200').section.rebar[0].area);
  assert.ok(Math.abs(As - 1000) < 1, `A_s = ${As} skal ligge like ved 1000 mm²/m`);
  // Halvert senteravstand skal doble arealet — fanger en feilvendt brøk.
  assert.ok(Math.abs(layerArea(slabLayer({ spacing: 56.5 })) - 2 * As) < 1e-9);
});

test('layerBarCount avrunder og har minimum 1', () => {
  assert.equal(layerBarCount(slabLayer({ spacing: 113 })), 9); // 8,85 -> 9
  assert.equal(layerBarCount(slabLayer({ spacing: 150 })), 7); // 6,67 -> 7
  // Stor senteravstand: uten minimumet ville tegningen vist NULL jern selv om
  // arealet regnes helt riktig.
  assert.equal(layerBarCount(slabLayer({ spacing: 3000 })), 1);
  assert.equal(layerBarCount(slabLayer({ spacing: 1200 })), 1);
  assert.equal(layerBarCount(beamLayer({ count: 4 })), 4);
});

test('layerCentroidZ måler fra riktig kant, z positiv oppover', () => {
  assert.equal(layerCentroidZ(beamLayer({ edge: 'bottom', dc: 50 }), 600), -250);
  assert.equal(layerCentroidZ(beamLayer({ edge: 'top', dc: 50 }), 600), 250);
  assert.equal(layerCentroidZ(slabLayer(), 200), -69);
});

test('layerDepth snur med theta — feltmoment og støttemoment', () => {
  const bottom = beamLayer({ edge: 'bottom', dc: 50 });
  // θ = 0: trykk oppe, underkantjernet er 550 mm fra trykkanten.
  assert.equal(layerDepth(bottom, 600, 0), 550);
  // θ = π: trykk nede, SAMME jern er nå bare 50 mm fra trykkanten.
  assert.equal(layerDepth(bottom, 600, Math.PI), 50);

  const top = beamLayer({ edge: 'top', dc: 50 });
  assert.equal(layerDepth(top, 600, 0), 50);
  assert.equal(layerDepth(top, 600, Math.PI), 550);
});

test('layerDepth krever theta — et defaultet θ ville gitt stille feil d', () => {
  assert.throws(() => layerDepth(beamLayer(), 600), /theta/);
  assert.throws(() => layerDepth(beamLayer(), 600, null), /theta/);
});

test('DOBBELTARMERT: effectiveDepth vekter over ALLE lag, geometrisk over strekksiden', () => {
  // Tilfellet fixturene ikke dekker, fordi de har ett lag: 3Ø20 i UK
  // (z = −250, d = 550) + 2Ø12 i OK (z = +250, d = 50).
  const layers = [
    beamLayer({ id: 'L1', dia: 20, count: 3, edge: 'bottom', dc: 50 }),
    beamLayer({ id: 'L2', dia: 12, count: 2, edge: 'top', dc: 50 }),
  ];
  const asBottom = 3 * barArea(20);
  const asTop = 2 * barArea(12);

  // `effectiveDepth` = motorens `d_eff_all`: hele armeringsmengdens tyngdepunkt.
  const all = (asBottom * 550 + asTop * 50) / (asBottom + asTop);
  assert.ok(Math.abs(effectiveDepth(layers, 600, 0) - all) < 1e-9);
  assert.ok(
    Math.abs(effectiveDepth(layers, 600, 0) - 453.23) < 0.01,
    `d_eff_all = ${effectiveDepth(layers, 600, 0)}, ventet ≈ 453,23`
  );

  // `effectiveDepthGeometric` = estimatet: bare lagene under nøytralaksen slik
  // geometrien antyder. Brukes til A_s,min og ρ FØR første beregning.
  assert.equal(effectiveDepthGeometric(layers, 600, 0), 550);
  assert.equal(tensionArea(layers, 600, 0), asBottom);
  assert.deepEqual(tensionLayers(layers, 600, 0), [layers[0]]);

  // De to MÅ være forskjellige her — ellers tester vi ingenting.
  assert.notEqual(effectiveDepth(layers, 600, 0), effectiveDepthGeometric(layers, 600, 0));

  // Ingen av dem er motorens `d_eff`: den leser strekksiden av tøyningsplanet
  // ved brudd, og kan svare noe helt annet (A1 har målt 146,8 mm i et tilfelle
  // der den geometriske regelen sier 550). Derfor står det INGEN påstand her om
  // hva motoren ville sagt.

  // Støttemoment snur hvilket lag estimatet regner som strekkarmering.
  assert.equal(effectiveDepthGeometric(layers, 600, Math.PI), 550);
  assert.equal(tensionArea(layers, 600, Math.PI), asTop);
  // …mens vektingen over alle lag er symmetrisk speilvendt.
  const allHog = (asBottom * 50 + asTop * 550) / (asBottom + asTop);
  assert.ok(Math.abs(effectiveDepth(layers, 600, Math.PI) - allHog) < 1e-9);
});

test('effectiveDepth er arealvektet — arealet, ikke antallet, styrer', () => {
  const mixed = [
    beamLayer({ id: 'L1', count: 1, dia: 32, edge: 'bottom', dc: 50 }),
    beamLayer({ id: 'L2', count: 1, dia: 8, edge: 'top', dc: 50 }),
  ];
  const a32 = barArea(32);
  const a8 = barArea(8);
  const expected = (a32 * 550 + a8 * 50) / (a32 + a8);
  assert.ok(Math.abs(effectiveDepth(mixed, 600, 0) - expected) < 1e-9);
  // Et UVEKTET snitt ville gitt 300 — sjekk at vi ikke er der.
  assert.ok(effectiveDepth(mixed, 600, 0) > 500);
  // …og at det faktisk er arealvekting, ikke bare «ta det nederste laget».
  assert.notEqual(effectiveDepth(mixed, 600, 0), 550);
});

test('ett lag: alle tre tallene er like — derfor fanger fixturene ingen forskjell', () => {
  const one = [beamLayer()];
  assert.equal(effectiveDepth(one, 600, 0), 550);
  assert.equal(effectiveDepthGeometric(one, 600, 0), 550);
  assert.equal(tensionArea(one, 600, 0), totalArea(one));
});

test('tensionLayers: TOM liste når ingen ligger i strekk — ingen reservegren', () => {
  assert.throws(() => tensionLayers([beamLayer()], 600), /theta/);

  // RETTET i runde 11. Her sto `picked.length ? picked : layers`, med
  // begrunnelsen «alternativet er NaN, som er verre å lese enn et åpenbart rart
  // tall». Den begrunnelsen holdt ikke:
  //
  //  * Motoren fjernet den tilsvarende grenen i `_effective_depth` og bruker 18
  //    linjer på hvorfor — reserven ga `d = 50 mm` og ρ = 6,28 % for et snitt
  //    uten ett eneste jern på strekksiden.
  //  * MÅLT på det som sto igjen her: standardbjelken 300×600 med bare
  //    underkantarmering og STØTTEMOMENT ga `d = 57 mm`, altså trykkjernet lest
  //    som strekkarmering, og dermed `s_l,max = 42,8 mm` — som `validate()`
  //    reiste som en HARD FEIL og BLOKKERTE hele kjøringen med.
  //
  // Et åpenbart rart tall er ikke ufarlig når noe regner videre på det. `NaN`
  // forplanter seg og tvinger hver kaller til å ta stilling; 57 gjør ikke det.
  const onlyTop = [beamLayer({ edge: 'top', dc: 50 }), beamLayer({ id: 'L2', edge: 'top', dc: 100 })];
  assert.deepEqual(tensionLayers(onlyTop, 600, 0), [], 'feltmoment, alle lag i overkant');
  assert.ok(Number.isNaN(effectiveDepthGeometric(onlyTop, 600, 0)));
  // Og motsatt vei er de samme lagene hele strekksiden.
  assert.equal(tensionLayers(onlyTop, 600, Math.PI).length, 2);
  assert.ok(Number.isFinite(effectiveDepthGeometric(onlyTop, 600, Math.PI)));
});

test('effectiveDepth uten armering er NaN, ikke 0', () => {
  // 0 ville gitt ρ = ∞ og en As_min på 0 — begge deler ser ut som tall.
  assert.ok(Number.isNaN(effectiveDepth([], 600, 0)));
  assert.ok(Number.isNaN(effectiveDepthGeometric([], 600, 0)));
  assert.equal(tensionArea([], 600, 0), 0);
});

test('reinforcementRatio: teller og nevner fra SAMME utvalg', () => {
  const layers = [
    beamLayer({ id: 'L1', dia: 20, count: 3, edge: 'bottom', dc: 50 }),
    beamLayer({ id: 'L2', dia: 12, count: 2, edge: 'top', dc: 50 }),
  ];
  // EC2 ρ_l: strekkarmeringen over b_t·d, ikke TOTAL armering over samme d.
  const expected = 3 * barArea(20) / (300 * 550);
  assert.ok(Math.abs(reinforcementRatio(layers, BEAM_GEOM, 0) - expected) < 1e-15);
  // Den gamle, inkonsistente formen ville tatt trykkarmeringen med i telleren.
  assert.notEqual(reinforcementRatio(layers, BEAM_GEOM, 0), totalArea(layers) / (300 * 550));
});

test('barPositions bjelke: jevnt fordelt mellom bøylens innerkant', () => {
  const bars = barPositions(beamLayer(), BEAM_GEOM, BEAM_OPTS);
  assert.deepEqual(bars, [
    { y: -100, z: -250, dia: 20 },
    { y: 0, z: -250, dia: 20 },
    { y: 100, z: -250, dia: 20 },
  ]);
  // …og nøyaktig det referansebjelkens fixtur bærer.
  assert.deepEqual(bars, fixture('payload-beam-300x600').section.rebar[0].bars);
});

test('barPositions bjelke: ett jern står i y = 0, ikke i ytterkant', () => {
  assert.deepEqual(barPositions(beamLayer({ count: 1 }), BEAM_GEOM, BEAM_OPTS), [
    { y: 0, z: -250, dia: 20 },
  ]);
});

test('barPositions bjelke: to jern står i hver sin ytterkant', () => {
  const bars = barPositions(beamLayer({ count: 2 }), BEAM_GEOM, BEAM_OPTS);
  assert.deepEqual(bars.map((b) => b.y), [-100, 100]);
});

test('barPositions bjelke: bøyle og sideoverdekning krymper utstrekningen', () => {
  const bars = barPositions(beamLayer({ count: 2 }), BEAM_GEOM, {
    cover_side: 35,
    stirrup_dia: 8,
  });
  // 150 − 35 − 8 − 10 = 97
  assert.deepEqual(bars.map((b) => b.y), [-97, 97]);
});

test('barPositions plate: faktisk senteravstand, sentrert om y = 0', () => {
  const bars = barPositions(slabLayer(), { b: 1000, h: 200 }, {});
  assert.equal(bars.length, 9);
  assert.equal(bars[0].y, -4 * 113);
  assert.equal(bars[8].y, 4 * 113);
  // Midterste jern står i senter, og alle ligger i samme høyde.
  assert.equal(bars[4].y, 0);
  assert.ok(bars.every((b) => b.z === -69 && b.dia === 12));
  // Senteravstanden i tegningen er den FAKTISKE, ikke 1000/n.
  assert.equal(bars[1].y - bars[0].y, 113);
});

test('barPositions plate: ett jern ved stor senteravstand står i y = 0', () => {
  const bars = barPositions(slabLayer({ spacing: 3000 }), { b: 1000, h: 200 }, {});
  assert.deepEqual(bars, [{ y: 0, z: -69, dia: 12 }]);
});

test('equivalentStrip: høyde = Ø, bredde = As/Ø, senter i layerCentroidZ', () => {
  const strip = equivalentStrip(slabLayer(), 200);
  assert.deepEqual(strip, fixture('payload-slab-1000x200').section.rebar[0].strip);
  assert.equal(strip.height, 12);
  assert.equal(strip.z, -69);
  // Arealidentiteten er hele grunnlaget for utsmøringen.
  assert.ok(Math.abs(strip.width * strip.height - layerArea(slabLayer())) < 1e-9);
});

test('totalArea og reinforcementRatio bruker EC2-definisjonen ρ = As/(b_t·d)', () => {
  const layers = [beamLayer()];
  assert.equal(totalArea(layers), 942.4777960769379);
  const rho = reinforcementRatio(layers, BEAM_GEOM, 0);
  assert.ok(Math.abs(rho - 942.4777960769379 / (300 * 550)) < 1e-15);
  // Støttemoment: det ENE laget ligger i underkant, altså i TRYKK. Da finnes
  // det ingen strekkside, og ρ er `NaN` — ikke et stort tall regnet av
  // trykkarmeringen. Før runde 11 ga reservegrenen i `tensionLayers` ρ = 6,28 %
  // her, som ser ut som en overarmert bjelke og ikke som et manglende svar.
  assert.ok(Number.isNaN(reinforcementRatio(layers, BEAM_GEOM, Math.PI)),
    'ingen strekkside ⇒ ingen ρ');
});

test('suggestedDc = overdekning + bøyle + Ø/2', () => {
  // 35 + 8 + 20/2 = 53
  assert.equal(suggestedDc({ cover: 35, shear: shearWith(8) }, 20), 53);
  // 25 + 0 + 12/2 = 31 — ingen bøylerad, altså ingen bøyle å ligge innenfor.
  assert.equal(suggestedDc({ cover: 25, shear: noShear() }, 12), 31);
});

/* ---------------- Runde 6 §1.6 — bøylediameteren i `dc` ---------------- */
/*
 * ÉN KILDE. `state.stirrup_dia` er borte, og `stirrupCoverDia` leser BARE
 * `shear.stirrups`. Testene under er skrevet mot nettopp det: et etterlatt
 * `stirrup_dia` i tilstanden skal ikke kunne påvirke noe som helst, og
 * `sectionType` er ikke lenger en del av regnestykket — det er RADEN som
 * avgjør, ikke hva snittet heter.
 */

test('stirrupCoverDia: uten bøylerad er det ingen bøyle å legge til', () => {
  // Plata: ingen rad ⇒ 0. Dette er hele runde 6 §1.6 — før spiste et usynlig
  // tall 12 mm av høyden.
  assert.equal(stirrupCoverDia({ sectionType: 'slab', shear: noShear() }), 0);
  // Ingen `shear`-nøkkel i det hele tatt (halvferdig tilstand, eldre fil).
  assert.equal(stirrupCoverDia({ sectionType: 'slab' }), 0);
  assert.equal(stirrupCoverDia({}), 0);
  assert.equal(stirrupCoverDia(), 0);
  // BJELKE UTEN RAD ER OGSÅ 0. Før svarte den 12 på sitt eget `stirrup_dia`;
  // nå finnes det ingen bøyle å svare med. Bjelken er ikke i den tilstanden i
  // praksis — `defaultState()` gir den en rad — men sletter brukeren den
  // siste raden, er 0 det ærlige svaret.
  assert.equal(stirrupCoverDia({ sectionType: 'beam', shear: noShear() }), 0);
});

test('stirrupCoverDia: raden er ENESTE kilde — et etterlatt stirrup_dia teller ikke', () => {
  // En håndredigert eller eldre fil kan fortsatt bære feltet. Det skal være
  // like dødt som om det ikke sto der: to felt for ett fysisk jern er nøyaktig
  // feilformen denne runden fjernet.
  assert.equal(stirrupCoverDia({ stirrup_dia: 12, shear: noShear() }), 0);
  assert.equal(stirrupCoverDia({ stirrup_dia: 25, shear: shearWith(8) }), 8);
  assert.equal(suggestedDc({ cover: 35, stirrup_dia: 25, shear: shearWith(8) }, 20), 53);
});

test('stirrupCoverDia: med flere rader gjelder den STØRSTE diameteren', () => {
  // Har raden med den groveste bøyla kontakt med jernet, er det DEN som
  // bestemmer hvor langt inn jernet ligger. Med ulike bøyletykkelser i samme
  // snitt er «størst» dessuten den konservative lesningen: forskjellen er
  // typisk 4–6 mm, og å regne alle jern etter den groveste kan ikke bomme på
  // usikker side.
  assert.equal(stirrupCoverDia({ shear: shearWith(8, 12) }), 12);
  assert.equal(stirrupCoverDia({ shear: shearWith(12, 8) }), 12, 'rekkefølgen skal ikke bety noe');
  assert.equal(stirrupCoverDia({ shear: shearWith(10, 10) }), 10);
  assert.equal(stirrupCoverDia({ shear: shearWith(6, 8, 16, 10) }), 16);
  // Og `dc` følger med: 35 + 16 + 20/2 = 61.
  assert.equal(suggestedDc({ cover: 35, shear: shearWith(8, 16) }, 20), 61);
});

test('stirrupCoverDia: en uleselig diameter blir NaN, ikke stille borte', () => {
  // `Math.max` ville gjort et tomt felt til 0 og gitt jernene en plassering
  // som ser riktig ut. NaN forplanter seg til `dc` og når valideringen.
  assert.ok(Number.isNaN(stirrupCoverDia({ shear: shearWith('') })));
  assert.ok(Number.isNaN(stirrupCoverDia({ shear: shearWith(12, null) })));
  assert.ok(Number.isNaN(suggestedDc({ cover: 35, shear: shearWith('') }, 20)));
});

test('suggestedDc: plata får IKKE bøylediameteren lagt til (runde 6 §1.6)', () => {
  // Brukerens målte tilfelle: 1000×200, overdekning 35, Ø12.
  //   før:    35 + 12 + 6 = 53  ⇒ d = 147 mm
  //   riktig: 35 +  0 + 6 = 41  ⇒ d = 159 mm  (12 mm, 7,5 % av momentarmen)
  const slab = { sectionType: 'slab', cover: 35, shear: noShear() };
  assert.equal(suggestedDc(slab, 12), 41);
  // Samme overdekning på en bjelke MED Ø12-bøyle: 35 + 12 + 6 = 53, uendret.
  assert.equal(suggestedDc({ sectionType: 'beam', cover: 35, shear: shearWith(12) }, 12), 53);
});

test('fjernes den SISTE bøyleraden, faller dc til overdekning + Ø/2', () => {
  // Den innvendingen mot å fjerne geometrifeltet som måtte besvares: `dc`
  // endrer seg synlig når bøyla kommer og går. Det ER svaret — uten bøyle er
  // det ingen bøyle å ligge innenfor, og at tallet flytter seg er den ærlige
  // tilbakemeldingen. Før sto en usynlig diameter igjen og spiste høyde.
  const med = { cover: 35, shear: shearWith(12) };
  const uten = { cover: 35, shear: noShear() };
  assert.equal(suggestedDc(med, 20), 57);  // 35 + 12 + 10
  assert.equal(suggestedDc(uten, 20), 45); // 35 +  0 + 10
  assert.equal(suggestedDc(med, 20) - suggestedDc(uten, 20), 12, 'nøyaktig bøylediameteren');
});

test('stackedDc og recomputeAutoDc arver platas dc — ett sted regner det', () => {
  const slab = {
    sectionType: 'slab',
    cover: 35,
    spacing: STD,
    shear: noShear(),
    layers: [],
  };
  // Uten nabo: samme tall som `suggestedDc`.
  assert.equal(stackedDc(slab, 'bottom', 12), 41);
  // Med nabo: stablingen bygger på det RETTEDE tallet, ikke på 53.
  //   41 + (12+12)/2 + max(1·12, 16+5, 20) = 41 + 12 + 21 = 74
  const withL1 = { ...slab, layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 150, edge: 'bottom', dc: 41, dc_auto: true }] };
  assert.equal(stackedDc(withL1, 'bottom', 12), 74);
  const recomputed = recomputeAutoDc({
    ...slab,
    layers: [
      { id: 'L1', mode: 'spacing', dia: 12, spacing: 150, edge: 'bottom', dc: 999, dc_auto: true },
      { id: 'L2', mode: 'spacing', dia: 12, spacing: 150, edge: 'bottom', dc: 999, dc_auto: true },
    ],
  });
  assert.deepEqual(recomputed.map((l) => l.dc), [41, 74]);
});

test('createLayer: et nytt platelag starter på dc uten bøyle', () => {
  const slab = createLayer({ sectionType: 'slab', cover: 35, shear: noShear() });
  assert.equal(slab.dc, 41); // 35 + 0 + 12/2 — plata har ingen bøylerad
  const beam = createLayer({ sectionType: 'beam', cover: 35, shear: shearWith(12) });
  assert.equal(beam.dc, 57); // 35 + 12 + 20/2 — bjelkens Ø12-bøyle teller
});

test('createLayer velger regnemåte etter tverrsnittstype', () => {
  const beam = createLayer({ sectionType: 'beam', cover: 35, shear: shearWith(8) });
  assert.equal(beam.mode, 'bars');
  assert.equal(beam.dc, 53); // 35 + 8 + 20/2
  const slab = createLayer({ sectionType: 'slab', cover: 25, shear: noShear() });
  assert.equal(slab.mode, 'spacing');
  assert.equal(slab.dia, 12);
  assert.equal(slab.dc, 31); // 25 + 0 + 12/2
});

test('createLayer setter dc_auto: true — et nytt lag skal flytte seg med diameteren', () => {
  assert.equal(createLayer({ sectionType: 'beam' }).dc_auto, true);
  // Eksplisitt overstyring (t.d. fra `serialize.js` sin normalisering) skal slå gjennom.
  assert.equal(createLayer({ sectionType: 'beam' }, { dc_auto: false }).dc_auto, false);
});

test('createCombo: ingen direction lenger — N_Ed/M_Ed/V_Ed er 0 som standard (endringsrunde 4 §1.2)', () => {
  const c = createCombo({}, {});
  assert.equal(c.N_Ed, 0);
  assert.equal(c.M_Ed, 0);
  assert.equal(c.V_Ed, 0);
  assert.ok(!('direction' in c), 'direction skal ikke finnes — retningen ER fortegnet på M_Ed');
  // Patch vinner over standardverdiene, akkurat som for createLayer.
  assert.equal(createCombo({}, { M_Ed: -250 }).M_Ed, -250);
  assert.equal(createCombo({}, { id: 'C3', name: 'ULS 3' }).id, 'C3');
});

/*
 * ===========================================================================
 * STEG 2 — R1/R2: `createCombo` sin `type`-normalisering
 * ===========================================================================
 * Normaliseringen MÅ stå ETTER `...patch` (rebar.js §A2/felle 9): en fil med
 * `type: null` eller `type: ''` skal IKKE slå ut defaulten `'uls'`.
 */
test('R1 — createCombo: ukjent/manglende/tom type gir alle "uls" (normalisering ETTER ...patch)', () => {
  assert.equal(createCombo({}, {}).type, 'uls');
  assert.equal(createCombo({}, { type: null }).type, 'uls');
  assert.equal(createCombo({}, { type: '' }).type, 'uls');
  assert.equal(createCombo({}, { type: 'tull' }).type, 'uls');
});

test('R2 — createCombo: en gyldig type overlever normaliseringen', () => {
  assert.equal(createCombo({}, { type: 'quasi_permanent' }).type, 'quasi_permanent');
  assert.equal(createCombo({}, { type: 'characteristic' }).type, 'characteristic');
  assert.equal(createCombo({}, { type: 'uls' }).type, 'uls');
  assert.deepEqual(COMBO_TYPES, ['uls', 'characteristic', 'quasi_permanent']);
});

/* ---------------- §2 — EC2 8.2, fri avstand ---------------- */

test('minClearDistance — §2.3 testtall, eksakte', () => {
  assert.equal(minClearDistance(20, STD), 21);
  assert.equal(minClearDistance(8, STD), 21);
  assert.equal(minClearDistance(32, STD), 32);
  assert.equal(minClearDistance(20, { k1: 1, k2: 5, d_g: 32 }), 37);
  assert.equal(minClearDistance(20, { k1: 1.5, k2: 5, d_g: 16 }), 30);
});

test('minClearBetween — den STØRSTE diameteren styrer', () => {
  assert.equal(minClearBetween(20, 25, STD), 25);
});

test('suggestedDc — §2.3', () => {
  assert.equal(suggestedDc(stdState(), 20), 53);
});

test('layersOnEdge sorterer stigende på dc, og ikke-endelige dc havner sist', () => {
  const layers = [
    { id: 'L3', edge: 'bottom', dc: NaN, dia: 20 },
    { id: 'L1', edge: 'bottom', dc: 53, dia: 20 },
    { id: 'L2', edge: 'bottom', dc: 94, dia: 20 },
    { id: 'T1', edge: 'top', dc: 50, dia: 20 },
  ];
  assert.deepEqual(layersOnEdge(layers, 'bottom').map((l) => l.id), ['L1', 'L2', 'L3']);
  assert.deepEqual(layersOnEdge(layers, 'top').map((l) => l.id), ['T1']);
  assert.deepEqual(layersOnEdge(layers, 'nonexistent'), []);
});

test('innermostLayer: laget med størst endelig dc, eller null uten noen', () => {
  const layers = [
    { id: 'L1', edge: 'bottom', dc: 53, dia: 20 },
    { id: 'L2', edge: 'bottom', dc: 94, dia: 20 },
  ];
  assert.equal(innermostLayer(layers, 'bottom').id, 'L2');
  assert.equal(innermostLayer(layers, 'top'), null);
});

test('stackedDc — §2.3: L2 og L3 stables utenfor det forrige laget', () => {
  const s1 = stdState({ layers: [] });
  const l1dc = stackedDc(s1, 'bottom', 20);
  assert.equal(l1dc, 53); // ingen nabo ennå: samme som suggestedDc

  const s2 = stdState({ layers: [{ id: 'L1', edge: 'bottom', dia: 20, dc: 53 }] });
  const l2dc = stackedDc(s2, 'bottom', 20);
  assert.equal(l2dc, 94);

  const s3 = stdState({
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc: 94 },
    ],
  });
  assert.equal(stackedDc(s3, 'bottom', 25), 141.5);

  // Samme L2 (Ø20 etter L1 Ø20@53), men med andre spacing-parametere —
  // §2.3-tabellens to siste rader.
  const afterL1 = { layers: [{ id: 'L1', edge: 'bottom', dia: 20, dc: 53 }] };
  assert.equal(stackedDc(stdState({ ...afterL1, spacing: { k1: 1, k2: 5, d_g: 32 } }), 'bottom', 20), 110);
  assert.equal(stackedDc(stdState({ ...afterL1, spacing: { k1: 1.5, k2: 5, d_g: 16 } }), 'bottom', 20), 103);
});

/* ---------------- §3 — automatisk dc, recomputeAutoDc ---------------- */

test('recomputeAutoDc — START: to nye Ø20-lag i bunn, begge dc_auto', () => {
  const state = stdState({
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc_auto: true },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: true },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 94);
  // Ren funksjon: input er urørt, rekkefølgen i state.layers er bevart.
  assert.equal(state.layers[0].dc, undefined);
  assert.deepEqual(layers.map((l) => l.id), ['L1', 'L2']);
});

test('recomputeAutoDc — §3.3: L1 → Ø32 flytter begge lag', () => {
  const state = stdState({
    layers: [
      { id: 'L1', edge: 'bottom', dia: 32, dc_auto: true, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: true, dc: 94 },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 59);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 117);
});

test('recomputeAutoDc — §3.3: L2 låst holder seg, L1 flytter fortsatt', () => {
  const state = stdState({
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc_auto: true, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: false, dc: 120 },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53);
  // Låst lag: urørt, MEN fortsatt referanse for neste (her er det ingen neste).
  assert.equal(layers.find((l) => l.id === 'L2').dc, 120);
});

test('recomputeAutoDc — §3.3: cover 35 → 45 flytter begge auto-lag', () => {
  const state = stdState({
    cover: 45,
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc_auto: true, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: true, dc: 94 },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 63);
  assert.equal(layers.find((l) => l.id === 'L2').dc, 104);
});

// De to neste er §2.3 sine «samme, d_g = 32»/«samme, k1 = 1,5»-rader — de
// gjelder stackedDc (og dermed recomputeAutoDc, som bruker samme formel) for
// L2 stablet etter L1 Ø20@53, IKKE §3.3-scenariet med diameterbytte.
test('recomputeAutoDc — §2.3: d_g = 32 gir L2 = 110, L1 uendret', () => {
  const state = stdState({
    spacing: { k1: 1, k2: 5, d_g: 32 },
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc_auto: true, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: true, dc: 94 },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53); // suggestedDc uendret av d_g
  assert.equal(layers.find((l) => l.id === 'L2').dc, 110);
});

test('recomputeAutoDc — §2.3: k1 = 1,5 gir L2 = 103, L1 uendret', () => {
  const state = stdState({
    spacing: { k1: 1.5, k2: 5, d_g: 16 },
    layers: [
      { id: 'L1', edge: 'bottom', dia: 20, dc_auto: true, dc: 53 },
      { id: 'L2', edge: 'bottom', dia: 20, dc_auto: true, dc: 94 },
    ],
  });
  const layers = recomputeAutoDc(state);
  assert.equal(layers.find((l) => l.id === 'L1').dc, 53); // suggestedDc uendret av k1
  assert.equal(layers.find((l) => l.id === 'L2').dc, 103);
});

/* ---------------- §3.2/§3.4 — skjærarmering (endringsrunde 4) ---------------- */

// Målt i plan v4 §4.2: Ø8, 2 ben, c/c 150.
const stirrup = (patch = {}) => ({
  id: 'S1',
  dia: 8,
  spacing: 150,
  legs: 2,
  fywk: 500,
  alpha: 90,
  ...patch,
});

test('stirrupArea: legs · π·Ø²/4 — §4.2 sitt målte A_sw = 100,5310 mm²', () => {
  const a = stirrupArea(stirrup());
  assert.ok(Math.abs(a - 2 * barArea(8)) < 1e-9);
  assert.ok(Math.abs(a - 100.53096491487338) < 1e-9, `A_sw = ${a}`);
});

test('aswPerSpacing: A_sw/s — §4.2 sitt målte 0,670206 mm²/mm', () => {
  const asws = aswPerSpacing(stirrup());
  assert.ok(Math.abs(asws - 0.670206) < 1e-5, `A_sw/s = ${asws}`);
});

test('totalAswPerSpacing summerer flere bøylesett, ikke bare tar det siste', () => {
  const one = aswPerSpacing(stirrup());
  const list = [stirrup(), stirrup({ id: 'S2', dia: 6, spacing: 300, legs: 2 })];
  const total = totalAswPerSpacing(list);
  assert.ok(Math.abs(total - (one + aswPerSpacing(list[1]))) < 1e-12);
  assert.ok(total > one, 'summen skal være større enn ett enkelt sett');
  assert.equal(totalAswPerSpacing([]), 0);
});

/* ---------------- endringsrunde 5 §B — createStirrup ---------------- */

test('createStirrup arver INGEN diameter fra tilstanden — raden ER kilden', () => {
  // Var: `dia` ble arvet fra `state.stirrup_dia`, og en `syncStirrupDia` holdt
  // de to i takt etterpå. Nå finnes det ikke noe å arve fra, og fabrikken
  // starter på `DEFAULT_STIRRUP_DIA`. Et etterlatt felt i tilstanden skal ikke
  // kunne snike seg inn igjen som en andre kilde.
  const row = createStirrup({ stirrup_dia: 10, steel: { fyk: 500 } });
  assert.equal(row.dia, DEFAULT_STIRRUP_DIA);
  assert.equal(row.dia, 12, 'DEFAULT_STIRRUP_DIA er 12 — samme bøyle standardbjelken har');
  assert.equal(row.id, 'S1');
  assert.equal(row.spacing, 150);
  assert.equal(row.legs, 2);
  // Brukerens egen verdi slår fortsatt gjennom: det er den ENE veien inn.
  assert.equal(createStirrup({}, { dia: 16 }).dia, 16);
});

test('createStirrup gir ALLTID alpha = 90 — section.js avviser alt annet i v1', () => {
  // Uten feltet ville valideringen svart «kun α = 90° støttes. Har α =
  // undefined°» på hver eneste kjøring med bøyler.
  assert.equal(createStirrup({}).alpha, 90);
  assert.equal(createStirrup({}, { spacing: 200 }).alpha, 90);
});

test('createStirrup arver fywk fra hovedarmeringens fyk, med 500 som reserve', () => {
  assert.equal(createStirrup({ steel: { fyk: 400 } }).fywk, 400);
  assert.equal(createStirrup({}).fywk, 500);
  assert.equal(createStirrup({ steel: { fyk: 500 } }, { fywk: 350 }).fywk, 350, 'patchen vinner');
});

test('DEFAULT_STIRRUP_DIA er standardbjelkens bøyle — ETT tall, ikke to som må holdes i takt', () => {
  // Konstanten bor i `rebar.js`, hos fabrikken som lager raden, og `store.js`
  // importerer den for å bygge standardbjelkens bøylerad OG dens `dc`. Sto
  // den to steder, ville en ny rad flyttet jernene i det man la den inn —
  // nettopp det `syncStirrupDia` fantes for å lappe over.
  assert.equal(DEFAULT_STIRRUP_DIA, 12);
  assert.equal(createStirrup({}).dia, DEFAULT_STIRRUP_DIA);
  // Standardbjelkens dc = 35 + DEFAULT_STIRRUP_DIA + 20/2 = 57.
  assert.equal(suggestedDc({ cover: 35, shear: shearWith(DEFAULT_STIRRUP_DIA) }, 20), 57);
});

/* ---------------- runde 8 §1 — platas standardarmering ---------------- */

test('createLayer: platas standard er Ø12 c/c 200 — bøylenes c/c 150 er et ANNET tall', () => {
  // Tallet 150 sto i TRE uavhengige kopier før denne runden: her, i
  // `createStirrup` og i `store.js:setSectionType`. To av dem beskrev platas
  // armering, den tredje bøylene — og ingen test sa fra hvis man endret én og
  // glemte de andre. Denne testen er vakten mot at de blir slått sammen igjen.
  const slab = createLayer({ sectionType: 'slab', cover: 35, shear: noShear() });
  assert.equal(slab.mode, 'spacing');
  assert.equal(slab.dia, 12);
  assert.equal(slab.spacing, 200, 'Ø12 c/c 200 — en svært vanlig dekkearmering');

  assert.equal(createStirrup({}).spacing, 150, 'bøylenes c/c er UENDRET');

  // Og en eksplisitt senteravstand slår fortsatt gjennom.
  assert.equal(createLayer({ sectionType: 'slab' }, { spacing: 125 }).spacing, 125);
});
