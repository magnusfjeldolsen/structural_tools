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
  barArea,
  barPositions,
  createLayer,
  effectiveDepth,
  effectiveDepthGeometric,
  equivalentStrip,
  layerArea,
  layerBarCount,
  layerCentroidZ,
  layerDepth,
  reinforcementRatio,
  suggestedDc,
  tensionArea,
  tensionLayers,
  totalArea,
} from '../js/rebar.js';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

const BEAM_GEOM = { b: 300, h: 600 };
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

test('tensionLayers krever theta og faller tilbake når ingen ligger i strekk', () => {
  assert.throws(() => tensionLayers([beamLayer()], 600), /theta/);
  // Alle lag i øvre halvdel + feltmoment: ingen geometrisk strekkarmering.
  // Da er alternativet NaN, som er verre å lese enn et åpenbart rart tall.
  const onlyTop = [beamLayer({ edge: 'top', dc: 50 }), beamLayer({ id: 'L2', edge: 'top', dc: 100 })];
  assert.deepEqual(tensionLayers(onlyTop, 600, 0), onlyTop);
  assert.ok(Number.isFinite(effectiveDepthGeometric(onlyTop, 600, 0)));
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
  // Støttemoment gir et helt annet ρ for det samme laget — d er 50, ikke 550.
  assert.ok(reinforcementRatio(layers, BEAM_GEOM, Math.PI) > 10 * rho);
});

test('suggestedDc = overdekning + bøyle + Ø/2', () => {
  assert.equal(suggestedDc({ cover: 35, stirrup_dia: 8 }, 20), 53);
  assert.equal(suggestedDc({ cover: 25, stirrup_dia: 0 }, 12), 31);
});

test('createLayer velger regnemåte etter tverrsnittstype', () => {
  const beam = createLayer({ sectionType: 'beam', cover: 35, stirrup_dia: 8 });
  assert.equal(beam.mode, 'bars');
  assert.equal(beam.dc, 53);
  const slab = createLayer({ sectionType: 'slab', cover: 25, stirrup_dia: 0 });
  assert.equal(slab.mode, 'spacing');
  assert.equal(slab.dia, 12);
  assert.equal(slab.dc, 31);
});
