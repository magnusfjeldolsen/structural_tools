/**
 * section-draw.test.mjs — tverrsnittstegningen.
 *
 * To ting testes hardt, resten lett:
 *
 *  1. **`sectionViewBox` som rene tall.** Den er skilt ut fra SVG-strengen
 *     nettopp for at utsnitt og målestokk skal kunne påstås uten å parse XML.
 *
 *  2. **At jernene i tegningen ER `barPositions()`.** Testen regner
 *     papirkoordinatene tilbake til modellkoordinater og sammenlikner med
 *     `rebar.js`. Uten den kunne tegningen og payloaden drive fra hverandre
 *     uten at noe feilet — planen §4.2 sin verste sviktform.
 *
 * Alt annet påstås som STRUKTUR (rot-element, viewBox-tall, at merkelapper og
 * nøytralakse finnes), ikke som pikselnøyaktige strenger.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { drawSection, sectionViewBox, layerLabel } from '../js/section-draw.js';
import { barPositions } from '../js/rebar.js';

/**
 * Referansebjelken fra planen §3.6. `cover_side = 32` og `stirrup_dia = 8` er
 * valgt slik at jernene havner på y = -100 / 0 / +100 — nøyaktig koordinatene i
 * `tests/fixtures/payload-beam-300x600.json`. Tegningen testes dermed mot den
 * samme geometrien motoren faktisk får.
 */
const BEAM = {
  sectionType: 'beam',
  geometry: { b: 300, h: 600 },
  cover: 22, cover_side: 32, stirrup_dia: 8,
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
};

/** Referanseplata: Ø12 c/c 113, dc = 31 ⇒ z = -69, som i plate-payloaden. */
const SLAB = {
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25, cover_side: 25, stirrup_dia: 0,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
};

function viewBoxOf(svg) {
  const m = /viewBox="([^"]+)"/.exec(svg);
  assert.ok(m, 'mangler viewBox');
  return m[1].trim().split(/\s+/).map(Number);
}

/** Alle `<circle>` i armeringsgruppa, som {cx, cy, r}. */
function rebarCircles(svg) {
  const g = /<g data-role="rebar"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  assert.ok(g, 'mangler armeringsgruppe');
  return [...g[1].matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"\/>/g)]
    .map((m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }));
}

/* ================================================================== *
 * sectionViewBox — rene tall
 * ================================================================== */

test('sectionViewBox: papirbredden er alltid w * scale', () => {
  for (const [state, width] of [[BEAM, 174], [SLAB, 174], [BEAM, 87], [SLAB, 600]]) {
    const vb = sectionViewBox(state, { width });
    assert.ok(Math.abs(vb.w * vb.scale - width) < 1e-9, `${state.sectionType} @ ${width}`);
    assert.ok(vb.scale > 0 && Number.isFinite(vb.scale));
    assert.ok(vb.h > 0);
  }
});

test('sectionViewBox: målestokken er den strengeste av bredde og høyde', () => {
  // Bjelken 300x600 er høy og smal -> høyden bestemmer.
  const beam = sectionViewBox(BEAM, { width: 174, height: 110 });
  assert.ok(Math.abs(beam.scale - 89 / 600) < 1e-12, `scale = ${beam.scale}`);
  assert.ok(Math.abs(beam.h * beam.scale - 110) < 1e-9, 'papirhøyden fyller rammen');

  // Plata 1000x200 er bred og lav -> bredden bestemmer, og figuren blir lav.
  const slab = sectionViewBox(SLAB, { width: 174, height: 110 });
  assert.ok(Math.abs(slab.scale - 124 / 1000) < 1e-12, `scale = ${slab.scale}`);
  assert.ok(slab.h * slab.scale < 110, 'plata skal ikke blåses opp til full høyde');
});

test('sectionViewBox: tverrsnittet sentreres når det blir bredde til overs', () => {
  const vb = sectionViewBox(BEAM, { width: 174, height: 110 });
  const left = (-BEAM.geometry.b / 2 - vb.minY) * vb.scale;
  const right = 174 - (BEAM.geometry.b / 2 - vb.minY) * vb.scale;
  // Merkelappmargen (34 mm) er større enn målmargen (16 mm); overskuddet
  // fordeles likt, så differansen skal være nøyaktig 34 - 16.
  assert.ok(Math.abs((right - left) - 18) < 1e-9, `venstre ${left}, høyre ${right}`);
});

test('sectionViewBox: modellutsnittet er uavhengig av enheten', () => {
  // 600 px og 174 mm skal dekke NØYAKTIG samme del av tverrsnittet; bare
  // målestokken (papirenheter per mm) skiller. Det er dette som gjør at
  // skjermfiguren og rapportfiguren ser like ut.
  const mm = sectionViewBox(BEAM, { width: 174, unit: 'mm' });
  const px = sectionViewBox(BEAM, { width: 600, unit: 'px' });
  for (const key of ['minY', 'minZ', 'w', 'h']) {
    assert.ok(Math.abs(mm[key] - px[key]) < 1e-9, `${key}: ${mm[key]} mot ${px[key]}`);
  }
  assert.ok(Math.abs(px.scale / mm.scale - 600 / 174) < 1e-12);
});

test('sectionViewBox: uten mål og merkelapper blir tegningen større', () => {
  const med = sectionViewBox(SLAB, { width: 174 });
  const uten = sectionViewBox(SLAB, { width: 174, showDims: false, showLabels: false });
  assert.ok(uten.scale > med.scale);
  assert.ok(uten.w < med.w, 'mindre modellflate dekkes av samme papirbredde');
});

/* ================================================================== *
 * drawSection — struktur
 * ================================================================== */

test('drawSection: rot-svg med width i forespurt enhet og viewBox', () => {
  const mm = drawSection(BEAM, { width: 174, unit: 'mm' });
  assert.ok(mm.startsWith('<svg '));
  assert.ok(mm.trimEnd().endsWith('</svg>'));
  assert.match(mm, /width="174mm"/);
  const vb = viewBoxOf(mm);
  assert.deepEqual(vb.slice(0, 3), [0, 0, 174]);
  assert.ok(Math.abs(vb[3] - 110) < 1e-6);

  const px = drawSection(BEAM, { width: 600, unit: 'px' });
  assert.match(px, /width="600px"/);
  assert.equal(viewBoxOf(px)[2], 600);
});

test('drawSection: bare presentasjonsattributter', () => {
  for (const svg of [
    drawSection(BEAM, {}),
    drawSection(SLAB, { theme: 'dark' }),
    drawSection(BEAM, { overlay: { x: 86.089, theta: 0 } }),
  ]) {
    assert.ok(!/<style/.test(svg), 'ingen <style>');
    assert.ok(!/ class="/.test(svg), 'ingen class-attributter');
    assert.ok(!/<link/.test(svg), 'ingen <link>');
    assert.ok(/fill="/.test(svg) && /stroke="/.test(svg), 'farger som attributter');
  }
});

/* ------------------------------------------------------------------ *
 * Den viktigste testen i fila
 * ------------------------------------------------------------------ */

test('drawSection: jernene i tegningen ER barPositions(), ikke egne tall', () => {
  for (const state of [BEAM, SLAB]) {
    const opts = { width: 174 };
    const vb = sectionViewBox(state, opts);
    const svg = drawSection(state, opts);
    const circles = rebarCircles(svg);

    const forventet = state.layers.flatMap((l) => barPositions(l, state.geometry, {
      sectionType: state.sectionType,
      cover: state.cover,
      cover_side: state.cover_side,
      stirrup_dia: state.stirrup_dia,
    }));
    assert.equal(circles.length, forventet.length,
      `${state.sectionType}: ${circles.length} sirkler mot ${forventet.length} jern`);

    // Papirkoordinat -> modellkoordinat, og tilbake til rebar.js sitt svar.
    circles.forEach((c, i) => {
      const y = c.cx / vb.scale + vb.minY;
      const z = vb.minZ + vb.h - c.cy / vb.scale;
      assert.ok(Math.abs(y - forventet[i].y) < 5e-3, `y: ${y} mot ${forventet[i].y}`);
      assert.ok(Math.abs(z - forventet[i].z) < 5e-3, `z: ${z} mot ${forventet[i].z}`);
    });
  }
});

test('drawSection: jernene havner der payload-fixturen sier', () => {
  // Bjelken: y = -100 / 0 / +100, z = -250 (payload-beam-300x600.json).
  const vb = sectionViewBox(BEAM, { width: 174 });
  const ys = rebarCircles(drawSection(BEAM, { width: 174 }))
    .map((c) => Math.round((c.cx / vb.scale + vb.minY) * 100) / 100);
  assert.deepEqual(ys, [-100, 0, 100]);

  // Plata: 1000/113 -> 9 jern, sentrert, i faktisk senteravstand.
  const vs = sectionViewBox(SLAB, { width: 174 });
  const sy = rebarCircles(drawSection(SLAB, { width: 174 }))
    .map((c) => c.cx / vs.scale + vs.minY);
  assert.equal(sy.length, 9);
  assert.ok(Math.abs(sy[4]) < 1e-6, 'midterste jern på y = 0');
  assert.ok(Math.abs((sy[1] - sy[0]) - 113) < 1e-6, 'faktisk senteravstand');
});

test('drawSection: små jern i en bred plate får en synlig minsteradius', () => {
  // Ø12 i en 1000 mm plate blir 12/2 * 0.124 = 0,74 rapport-mm i ekte
  // målestokk — men i en 60 mm bred figur blir det 0,26 mm og forsvinner.
  const r = rebarCircles(drawSection(SLAB, { width: 60 }))[0].r;
  assert.ok(r >= 0.5 * (60 / 174) - 1e-9, `radius = ${r}`);
});

/* ------------------------------------------------------------------ *
 * Mål, merkelapper, nøytralakse
 * ------------------------------------------------------------------ */

test('drawSection: mål skrus av og på, og plata merkes per meter', () => {
  const med = drawSection(BEAM, {});
  assert.match(med, /data-role="dims"/);
  assert.match(med, />b = 300 mm</);
  assert.match(med, />h = 600 mm</);

  const uten = drawSection(BEAM, { showDims: false });
  assert.ok(!/data-role="dims"/.test(uten));

  assert.match(drawSection(SLAB, {}), />b = 1000 mm \(per meter\)</);
});

test('drawSection: merkelappene bruker bransjenotasjonen fra UI-et', () => {
  assert.equal(layerLabel(BEAM.layers[0]), '3Ø20');
  assert.equal(layerLabel(SLAB.layers[0]), 'Ø12 c/c 113');

  const beam = drawSection(BEAM, {});
  assert.match(beam, /data-role="labels"/);
  assert.match(beam, />3Ø20</);
  assert.match(beam, />dc = 50 mm</);
  assert.match(drawSection(SLAB, {}), />Ø12 c\/c 113</);

  assert.ok(!/data-role="labels"/.test(drawSection(BEAM, { showLabels: false })));
});

test('drawSection: nøytralaksen legges etter theta, ikke etter håp', () => {
  const uten = drawSection(BEAM, {});
  assert.ok(!/data-role="na"/.test(uten));

  const felt = drawSection(BEAM, { overlay: { x: 86.089, theta: 0 } });
  const stotte = drawSection(BEAM, { overlay: { x: 86.089, theta: Math.PI } });
  assert.match(felt, /data-role="na"/);
  assert.match(felt, />x = 86,1 mm</);

  const yOf = (svg) => Number(/<line x1="[-\d.]+" y1="([-\d.]+)"[^>]*stroke-dasharray/.exec(svg)[1]);
  const vb = sectionViewBox(BEAM, {});
  const zOf = (svg) => vb.minZ + vb.h - yOf(svg) / vb.scale;
  // theta = 0 gir trykk OPPE: z_na = h/2 - x. theta = pi speilvender.
  assert.ok(Math.abs(zOf(felt) - (300 - 86.089)) < 5e-3, `z = ${zOf(felt)}`);
  assert.ok(Math.abs(zOf(stotte) - (-300 + 86.089)) < 5e-3, `z = ${zOf(stotte)}`);
});

test('drawSection: temaene bytter farge, ikke struktur', () => {
  const lys = drawSection(BEAM, { theme: 'print' });
  const mork = drawSection(BEAM, { theme: 'dark' });
  assert.notEqual(lys, mork);
  for (const role of ['concrete', 'rebar', 'dims', 'labels']) {
    assert.match(lys, new RegExp(`data-role="${role}"`));
    assert.match(mork, new RegExp(`data-role="${role}"`));
  }
  assert.equal(rebarCircles(lys).length, rebarCircles(mork).length);
});

test('drawSection: flere lag tegnes og merkes hver for seg', () => {
  const to = {
    ...BEAM,
    layers: [
      BEAM.layers[0],
      { id: 'L2', mode: 'bars', dia: 12, count: 2, edge: 'top', dc: 40 },
    ],
  };
  const svg = drawSection(to, {});
  assert.equal(rebarCircles(svg).length, 5);
  assert.match(svg, />3Ø20</);
  assert.match(svg, />2Ø12</);
  assert.match(svg, />dc = 40 mm</);
});

test('drawSection: tverrsnitt uten armering gir fortsatt en gyldig figur', () => {
  const svg = drawSection({ ...BEAM, layers: [] }, {});
  assert.ok(svg.startsWith('<svg '));
  assert.equal(rebarCircles(svg).length, 0);
  assert.match(svg, /data-role="concrete"/);
});
