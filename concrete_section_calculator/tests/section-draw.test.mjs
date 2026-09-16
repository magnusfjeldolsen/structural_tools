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

import { drawSection, sectionViewBox, layerLabel, stirrupGeometry } from '../js/section-draw.js';
import { barPositions, suggestedDc } from '../js/rebar.js';

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

  assert.match(drawSection(SLAB, {}), />b = 1000 mm \(per metre\)</);
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
  assert.match(felt, />x = 86\.1 mm</);

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

/* ================================================================== *
 * Bøyler (skjærarmering) — endringsrunde 4, §5.3
 * ================================================================== */

/** Referansebjelkens bøyle: Ø8 c/c 150, 2 ben — «S1»-eksempelet i planen. */
const STIRRUP_S1 = { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 };

test('stirrupGeometry: null uten skjærarmering, uansett hvordan fraværet uttrykkes', () => {
  assert.equal(stirrupGeometry({ ...BEAM, shear: { stirrups: [] } }), null);
  assert.equal(stirrupGeometry({ ...BEAM, shear: undefined }), null);
  assert.equal(stirrupGeometry(BEAM), null, 'BEAM har ingen shear-nøkkel i det hele tatt');
});

test('stirrupGeometry: inset = cover_side/cover + dia/2, målt mot referansebjelken', () => {
  const g = stirrupGeometry({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } });
  assert.ok(g, 'skal returnere geometri når lista ikke er tom');
  // insetY = cover_side(32) + dia/2(4) = 36 -> y0/y1 = ±(150-36)
  assert.ok(Math.abs(g.y0 - -114) < 1e-9, `y0 = ${g.y0}`);
  assert.ok(Math.abs(g.y1 - 114) < 1e-9, `y1 = ${g.y1}`);
  // insetZ = cover(22) + dia/2(4) = 26 -> z0/z1 = ±(300-26)
  assert.ok(Math.abs(g.z0 - -274) < 1e-9, `z0 = ${g.z0}`);
  assert.ok(Math.abs(g.z1 - 274) < 1e-9, `z1 = ${g.z1}`);
  assert.equal(g.label, 'Ø8 c/c 150 (2 legs)');
});

/**
 * Endret i denne runden (planen A2): radien var før `min(2·dia, …)` uansett
 * hva som lå i hjørnet. En bøyle bøyes rundt HJØRNEJERNET, og senterlinjen
 * tangerer det i `(dia_jern + dia_bøyle)/2`. Uten hjørnejern finnes det
 * ingenting å bøye rundt, og dorradien `2·dia` gjelder som før.
 */
test('stirrupGeometry: hjørneradius tangerer hjørnejernet når det finnes et', () => {
  const g = stirrupGeometry({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } });
  // Hjørnejernet er Ø20 (3Ø20, ytterjernene i y = ±100, z = -250):
  // (20 + 8)/2 = 14, ikke 2*8 = 16.
  assert.equal(g.radius, 14);
});

test('stirrupGeometry: uten hjørnejern gjelder dorradien 2*dia', () => {
  // innerW = 228, innerH = 548 -> korteste er 228, halvparten er 114 > 2*8 = 16.
  const g = stirrupGeometry({ ...BEAM, layers: [], shear: { stirrups: [STIRRUP_S1] } });
  assert.equal(g.radius, 16);

  // Et jern som ligger langt inne i tverrsnittet er ikke i bøyen. dc = 300 gir
  // z = 0, altså midt i snittet — vinduet (dia_jern + dia_bøyle = 28 fra begge
  // innersidene) skal ikke strekke seg dit.
  const midt = stirrupGeometry({
    ...BEAM,
    layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 300 }],
    shear: { stirrups: [STIRRUP_S1] },
  });
  assert.equal(midt.radius, 16);
});

test('stirrupGeometry: radiusklemmen hindrer at en tynn plate sprekker', () => {
  // En 60 mm plate med cover 25 og dia 8: innerH = 60 - 2*(25+4) = 2 mm.
  // Uten klemmen ville radius blitt 2*8 = 16 — over SEKS ganger for stor for
  // en 2 mm høy innerside. Med klemmen skal radius aldri overstige innerH/2.
  const thin = { geometry: { b: 1000, h: 60 }, cover: 25, cover_side: 25,
    shear: { stirrups: [STIRRUP_S1] } };
  const g = stirrupGeometry(thin);
  assert.ok(g.z1 > g.z0, 'innersiden skal fortsatt ha positiv høyde');
  assert.ok(g.radius <= (g.z1 - g.z0) / 2 + 1e-9, `radius = ${g.radius} sprekker figuren`);
  assert.ok(g.radius < 2 * 8, 'klemmen skal faktisk ha grepet inn her');
  assert.ok(g.radius >= 0, 'radius skal aldri bli negativ');
});

test('stirrupGeometry: legs > 2 fordeler indre ben jevnt mellom ytterbena', () => {
  const g = stirrupGeometry({
    ...BEAM,
    shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  });
  // innerW = 228, leg_pitch = 228 / (4-1) = 76 -> indre ben ved y0+76 og y0+152.
  assert.equal(g.legY.length, 2, 'legs=4 gir 2 indre ben');
  assert.ok(Math.abs(g.legY[0] - -38) < 1e-9, `legY[0] = ${g.legY[0]}`);
  assert.ok(Math.abs(g.legY[1] - 38) < 1e-9, `legY[1] = ${g.legY[1]}`);
  assert.equal(g.label, 'Ø8 c/c 150 (4 legs)');

  const two = stirrupGeometry({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } });
  assert.equal(two.legY.length, 0, 'legs=2 skal ikke gi noen indre ben');
});

/**
 * Figuren og `s_t,max`-kontrollen MÅ vise samme benavstand.
 *
 * `section.js` regner `legPitch = (b_w − 2·(cover_side + dia/2)) / (legs − 1)`
 * i valideringen og advarer når den overskrider `s_t,max`. Skulle figuren
 * fordele bena etter en annen formel, ville brukeren fått en advarsel om en
 * avstand han ikke kan se, eller — verre — ingen advarsel om en avstand
 * figuren viser. Formelen er skrevet ut i ren aritmetikk her, ikke importert,
 * nettopp for å fange at DEN i `section.js` endres.
 */
test('stirrupGeometry: benavstanden er den samme formelen som s_t,max-kontrollen', () => {
  for (const legs of [3, 4, 5, 6]) {
    // Uten armering skjer ingen snapping, så den jevne fordelingen står igjen rå.
    const g = stirrupGeometry({
      ...BEAM, layers: [], shear: { stirrups: [{ ...STIRRUP_S1, legs }] },
    });
    const pitch = (BEAM.geometry.b - 2 * (BEAM.cover_side + STIRRUP_S1.dia / 2)) / (legs - 1);
    assert.equal(g.legY.length, legs - 2, `legs=${legs}`);
    g.legY.forEach((y, i) => {
      assert.ok(Math.abs(y - (g.y0 + (i + 1) * pitch)) < 1e-9, `legs=${legs}, ben ${i}: ${y}`);
    });
  }
});

test('drawSection: bøylene tegnes bare når lista ikke er tom, og nedtonet', () => {
  const uten = drawSection(BEAM, {});
  assert.ok(!/data-role="stirrup"/.test(uten), 'BEAM har ingen shear -> ingen bøyletegning');

  const med = drawSection({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } }, {});
  assert.match(med, /data-role="stirrup"/);
  assert.match(med, /<rect[^>]*rx="[\d.]+"/, 'avrundet rektangel');
  assert.match(med, />Ø8 c\/c 150 \(2 legs\)</);

  // Nedtonet er nå en FARGE, ikke en tykkelse: strekbredden er bøylas ekte
  // diameter (se testen under), og den er bredere enn omrisset for en vanlig
  // bjelke. Nedtoningen ligger i `THEMES.print.stirrup`, som er lysere enn
  // omrissfargen `concreteStroke`.
  const stirrupFill = /data-role="stirrup" stroke="([^"]+)"/.exec(med)[1];
  const outlineFill = /<g data-role="concrete">[\s\S]*?stroke="([^"]+)"/.exec(med)[1];
  assert.notEqual(stirrupFill, outlineFill, 'bøylen skal ha sin egen, nedtonede farge');
});

/**
 * Regresjon, planen A1: strekbredden var `0,18 · o.u` — en fast brøkdel av
 * tegneenheten, helt frikoblet fra `dia`. For referansebjelken på 174 mm papir
 * er `scale = 89/600 ≈ 0,14833`, så en Ø8-bøyle skal være `8 · 0,14833 ≈ 1,187`
 * rapport-mm bred. Den ble tegnet 0,18 — 6,6 ganger for tynn. Jernene gjorde
 * det riktig hele tiden, så figuren viste en bøyle som var tynnere enn
 * armeringen den binder.
 */
test('drawSection: bøylas strekbredde ER dia * scale, ikke en fast brøkdel', () => {
  for (const [width, dia] of [[174, 8], [174, 12], [87, 8], [600, 10]]) {
    const vb = sectionViewBox(BEAM, { width });
    const svg = drawSection(
      { ...BEAM, shear: { stirrups: [{ ...STIRRUP_S1, dia }] } },
      { width, unit: width === 600 ? 'px' : 'mm' }
    );
    const sw = Number(/data-role="stirrup" stroke="[^"]+" stroke-width="([\d.]+)"/.exec(svg)[1]);
    // r() runder til tre desimaler, derfor 1e-3 og ikke maskinepsilon.
    assert.ok(Math.abs(sw - dia * vb.scale) < 1e-3,
      `Ø${dia} @ ${width}: ${sw} mot ${dia * vb.scale}`);
  }
  // Eksakt tall for referansebjelken, så en endring i målestokken ikke kan
  // gjemme seg bak en beregnet forventning.
  const svg = drawSection({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } }, { width: 174 });
  assert.match(svg, /data-role="stirrup" stroke="[^"]+" stroke-width="1\.187"/);
});

test('drawSection: strekbredden har et gulv, så bøylen ikke forsvinner i et svært snitt', () => {
  // h = 6000 mm gir scale = 89/6000 ≈ 0,014833 og dermed 8 · scale ≈ 0,119 —
  // under gulvet på 0,18 · o.u, som da skal gripe inn.
  const svg = drawSection(
    { ...BEAM, geometry: { b: 3000, h: 6000 }, shear: { stirrups: [STIRRUP_S1] } },
    { width: 174 }
  );
  const sw = Number(/data-role="stirrup" stroke="[^"]+" stroke-width="([\d.]+)"/.exec(svg)[1]);
  assert.ok(Math.abs(sw - 0.18) < 1e-9, `strekbredde = ${sw}`);
});

/** Bena tegnes som `<path>` etter denne runden — en `<line>` kan ikke bøye seg. */
function stirrupLegPaths(svg) {
  const g = /<g data-role="stirrup"[^>]*>([\s\S]*?)<\/g>/.exec(svg);
  assert.ok(g, 'mangler bøylegruppa');
  return [...g[1].matchAll(/<path d="([^"]+)"\/>/g)].map((m) => m[1]);
}

test('drawSection: legs > 2 tegner ekstra ben inne i bøylerektangelet', () => {
  const svg = drawSection({ ...BEAM, shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] } }, {});
  assert.equal(stirrupLegPaths(svg).length, 2, 'legs=4 skal gi nøyaktig 2 indre ben');

  const svgTwo = drawSection({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } }, {});
  assert.equal(stirrupLegPaths(svgTwo).length, 0, 'legs=2 skal ikke gi noen indre ben');
});

/* ------------------------------------------------------------------ *
 * Jernet i bøyen (planen A2)
 * ------------------------------------------------------------------ */

/**
 * MÅLT KOLLISJON, og grunnen til at hele A2 finnes.
 *
 * Referansebjelken med `count = 4` gir jern i y = ±33,33 (`yMax = 100`,
 * `step = 200/3`), mens fire ben jevnt fordelt havner i y = ±38. Det er 4,67 mm
 * mellom senterlinjene der tangering krever `(20 + 8)/2 = 14` — benet ble
 * tegnet tvers gjennom jernet. Etter snappingen skal hvert ben enten stå
 * NØYAKTIG i et jernsenter (det ligger da i bøyen) eller være minst 14 mm unna.
 */
test('drawSection: ingen bøyleben ligger inntil et jern uten å være snappet til det', () => {
  const states = [
    { count: 4, legs: 4 },
    { count: 4, legs: 3 },
    { count: 5, legs: 4 },
    { count: 3, legs: 5 },
    { count: 6, legs: 6 },
  ].map(({ count, legs }) => ({
    ...BEAM,
    layers: [{ ...BEAM.layers[0], count }],
    shear: { stirrups: [{ ...STIRRUP_S1, legs }] },
  }));

  for (const state of states) {
    const g = stirrupGeometry(state);
    const bars = barPositions(state.layers[0], state.geometry, {
      sectionType: state.sectionType,
      cover: state.cover,
      cover_side: state.cover_side,
      stirrup_dia: state.stirrup_dia,
    });
    for (const y of g.legY) {
      for (const bar of bars) {
        const d = Math.abs(y - bar.y);
        const tangent = (bar.dia + g.dia) / 2;
        assert.ok(d < 1e-9 || d >= tangent - 1e-9,
          `ben i y = ${y} ligger ${d.toFixed(2)} mm fra et Ø${bar.dia}-jern ` +
          `(krever ${tangent} mm eller snapping) — ${state.layers[0].count} jern, ${g.legs} ben`);
      }
    }
    assert.equal(new Set(g.legY.map((y) => y.toFixed(6))).size, g.legY.length,
      'to ben skal aldri havne i samme y');
  }
});

test('drawSection: buen finnes der benet er snappet, og ikke der det ikke er noe jern', () => {
  // count = 4: benene snappes til jernene i y = ±33,33, og skal da ha en bue.
  const snappet = drawSection({
    ...BEAM,
    layers: [{ ...BEAM.layers[0], count: 4 }],
    shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  }, { width: 174 });
  const paths = stirrupLegPaths(snappet);
  assert.equal(paths.length, 2);
  for (const d of paths) {
    assert.match(d, / A /, `benet skal bøye seg rundt jernet: ${d}`);
    // Halvsirkel om jernets senter: buen starter og slutter i samme x, og
    // radien er (20 + 8)/2 = 14 mm ganget med målestokken.
    const m = / A ([\d.]+) ([\d.]+) 0 0 [01] ([-\d.]+) /.exec(d);
    assert.ok(m, `buen skal ha lik rx og ry: ${d}`);
    const vb = sectionViewBox(BEAM, { width: 174 });
    assert.ok(Math.abs(Number(m[1]) - 14 * vb.scale) < 1e-3, `radius = ${m[1]}`);
    assert.equal(m[1], m[2], 'rx og ry skal være like — det er en sirkelbue');
    assert.equal(Number(m[3]), Number(/^M ([-\d.]+) /.exec(d)[1]),
      'buen skal ende i samme x som benet — ellers er den ikke en halvsirkel');
  }
  // De to bena speiler hverandre: motsatt sweep-flag om y = 0.
  assert.notEqual(/ A [\d.]+ [\d.]+ 0 0 ([01]) /.exec(paths[0])[1],
                  / A [\d.]+ [\d.]+ 0 0 ([01]) /.exec(paths[1])[1]);

  // Uten armering er det ingenting å bøye seg rundt — da er en bue løgn.
  const rett = drawSection({
    ...BEAM, layers: [], shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  }, { width: 174 });
  for (const d of stirrupLegPaths(rett)) {
    assert.ok(!/A/.test(d), `benet skal være rett uten jern å bøye rundt: ${d}`);
    assert.match(d, /^M [-\d.]+ [-\d.]+ L [-\d.]+ [-\d.]+$/, 'rett ben: topp til bunn, uten bue');
  }

  // count = 3 gir jern i y = 0, nøyaktig pitch/2 = 38 fra begge bena. Vinduet
  // er strengt, så ingen av dem trekkes dit — symmetrien beholdes.
  const uavgjort = drawSection({
    ...BEAM, shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  }, { width: 174 });
  for (const d of stirrupLegPaths(uavgjort)) {
    assert.ok(!/A/.test(d), `uavgjort skal ikke snappes: ${d}`);
  }
});

test('drawSection: bøylene ligger innenfor betongomrisset, ikke utenfor', () => {
  const vb = sectionViewBox(BEAM, { width: 174 });
  const svg = drawSection({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } }, { width: 174 });
  const rect = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="[\d.]+"/.exec(svg);
  assert.ok(rect, 'mangler bøylerektangelet');
  const [x, y, w, h] = rect.slice(1).map(Number);
  // Papirkoordinat -> modell-y for venstre og høyre kant.
  const yLeft = x / vb.scale + vb.minY;
  const yRight = (x + w) / vb.scale + vb.minY;
  assert.ok(yLeft > -BEAM.geometry.b / 2 && yRight < BEAM.geometry.b / 2,
    `bøylen skal ligge innenfor b: [${yLeft}, ${yRight}]`);
});

/**
 * Regresjon: figuren og motoren MÅ vise samme tverrsnitt.
 *
 * `sectionWidth()` gir 1000 for enhver plate, mens `geometry.b` kan ligge
 * igjen på bjelkens bredde når staten kommer inn via `setInputs` eller et
 * innlastet dokument. Leste tegningen `geometry.b` direkte — slik den gjorde
 * før endringsrunde 4 — ble plata TEGNET 300 mm bred og målsatt «b = 300 mm
 * (per metre)» under en rapport der geometritabellen sa 1000. Ingen test
 * feilet; feilen ble bare synlig i et skjermbilde.
 */
test('drawSection: plata tegnes 1000 mm bred selv med en bjelkebredde i geometry.b', () => {
  const stale = { ...SLAB, geometry: { b: 300, h: 200 } };
  const vb = sectionViewBox(stale, { width: 174 });
  const vbRef = sectionViewBox(SLAB, { width: 174 });
  assert.deepEqual(vb, vbRef, 'utsnittet skal være uavhengig av den utdaterte geometry.b');

  const svg = drawSection(stale, { width: 174 });
  assert.match(svg, /b = 1000 mm \(per metre\)/, 'målsettingen skal si 1000, ikke 300');
  assert.ok(!/b = 300 mm/.test(svg), 'bjelkebredden skal ikke stå noe sted i plate-figuren');
});

test('drawSection: bjelken bruker fortsatt sin egen geometry.b', () => {
  const svg = drawSection(BEAM, { width: 174 });
  assert.match(svg, /b = 300 mm/, 'bjelken skal målsettes med den oppgitte bredden');
  assert.ok(!/per metre/.test(svg), 'bjelken skal ikke merkes per meter');
});

/**
 * Regresjon: bøylemerkelappen skal ikke havne oppå armeringen.
 *
 * Den lå før rett over bøylens nedre indre hjørne — altså nøyaktig der
 * underkantjernene tegnes. Siden armeringsgruppa kommer ETTER bøylegruppa i
 * SVG-en, malte jernene rett og slett over teksten, og for et smalt tverrsnitt
 * stakk den i tillegg ut av betongkanten. Ingen test så det; det ble bare
 * synlig i et skjermbilde.
 */
test('drawSection: bøylemerkelappen kolliderer ikke med jernene', () => {
  const svg = drawSection({ ...BEAM, shear: { stirrups: [STIRRUP_S1] } }, { width: 174 });
  const g = /<g data-role="stirrup"[\s\S]*?<\/g>\s*(<text[^>]*>[^<]*<\/text>)/.exec(svg);
  assert.ok(g, 'fant ikke bøylemerkelappen');
  const label = g[1];
  assert.match(label, /text-anchor="middle"/, 'merkelappen skal være sentrert');
  const ly = Number(/ y="([-\d.]+)"/.exec(label)[1]);

  const bars = [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ cy: Number(m[2]), r: Number(m[3]) }));
  assert.ok(bars.length > 0, 'fant ingen jern å sammenlikne med');
  for (const bar of bars) {
    assert.ok(Math.abs(ly - bar.cy) > bar.r * 2,
      `merkelappen (y=${ly}) ligger oppå et jern (cy=${bar.cy}, r=${bar.r})`);
  }
});

/**
 * REGRESJON — buen forsvant i nøyaktig standardtilfellet.
 *
 * `dc` for et `dc_auto`-lag er `suggestedDc = cover + stirrup_dia + dia/2`
 * (`rebar.js:309`). Setter man det inn, blir
 *   bar.z − (dia + dia_bøyle)/2  =  −h/2 + cover + dia_bøyle/2  =  z0
 * EKSAKT, for enhver overdekning og enhver diameter. Betingelsen het
 * `bar.z − rad <= z0`, så buen ble hoppet over for hvert eneste automatisk
 * plasserte lag — altså alltid, i appen. Tangering ER at jernet ligger i
 * bøyen; det er ikke overlapp.
 *
 * Testen som fantes brukte et HÅNDSKREVET `dc: 50` der avledet verdi er 40,
 * og traff derfor aldri tangeringen. Denne bygger `dc` slik appen gjør.
 */
test('stirrupGeometry: jernet ligger i bøyen også når dc er den AVLEDEDE verdien', () => {
  const dia = 20;
  const base = { ...BEAM, cover: 35, cover_side: 35, stirrup_dia: 8 };
  const dc = suggestedDc(base, dia);
  const state = {
    ...base,
    layers: [{ id: 'L1', mode: 'bars', dia, count: 4, edge: 'bottom', dc, dc_auto: true }],
    shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  };
  const g = stirrupGeometry(state);

  // Forutsetningen: dette ER tangeringstilfellet, ellers tester vi noe annet.
  const bar = barPositions(state.layers[0], state.geometry,
    { cover_side: state.cover_side, stirrup_dia: state.stirrup_dia })[0];
  const rad = (dia + STIRRUP_S1.dia) / 2;
  assert.ok(Math.abs((bar.z - rad) - g.z0) < 1e-9,
    `forutsetningen: jernet skal tangere bøylas underside (${bar.z - rad} mot ${g.z0})`);

  assert.equal(g.legBends.length, 2, 'legs = 4 gir to indre ben');
  for (const bends of g.legBends) {
    assert.equal(bends.length, 1, 'hvert snappet ben skal ha NØYAKTIG én bue');
    assert.ok(Math.abs(bends[0].radius - rad) < 1e-9,
      `radius skal være (Ø_jern + Ø_bøyle)/2 = ${rad}, ikke ${bends[0].radius}`);
  }
  // Og den skal faktisk komme ut i SVG-en, ikke bare i geometrien.
  const svg = drawSection(state, { width: 174 });
  const paths = [...svg.matchAll(/<path d="([^"]*)"/g)].map((m) => m[1]);
  const legPaths = paths.filter((d) => /^M [-\d.]+ [-\d.]+ L/.test(d));
  assert.ok(legPaths.length >= 2, 'fant ikke bena i SVG-en');
  for (const d of legPaths) {
    assert.match(d, /A /, `benet skal ha en bue, ikke være en rett strek: ${d}`);
  }
});

/**
 * Følgefeil av den samme betingelsen: med TO underkantlag bøyde figuren rundt
 * det INDRE jernet — det som henger fritt — og tegnet en rett strek gjennom det
 * ytre, som er det som faktisk er bundet i bøylen.
 */
test('stirrupGeometry: med to underkantlag bøyes benet rundt det YTRE jernet', () => {
  const base = { ...BEAM, cover: 35, cover_side: 35, stirrup_dia: 8 };
  const state = {
    ...base,
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 4, edge: 'bottom', dc: 53, dc_auto: true },
      { id: 'L2', mode: 'bars', dia: 20, count: 4, edge: 'bottom', dc: 94, dc_auto: true },
    ],
    shear: { stirrups: [{ ...STIRRUP_S1, legs: 4 }] },
  };
  const g = stirrupGeometry(state);
  const zOuter = -state.geometry.h / 2 + 53;
  for (const bends of g.legBends) {
    assert.equal(bends.length, 1, 'bare det ytre jernet ligger i en bøy');
    assert.ok(Math.abs(bends[0].z - zOuter) < 1e-9,
      `buen skal ligge om det ytre jernet (z = ${zOuter}), ikke om det indre (${bends[0].z})`);
  }
});
