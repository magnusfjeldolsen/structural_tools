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
import { barPositions, stirrupCoverDia, suggestedDc } from '../js/rebar.js';

/** Referansebjelkens bøyle: Ø8 c/c 150, 2 ben — «S1»-eksempelet i planen. */
const STIRRUP_S1 = { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 };

/**
 * Referansebjelken fra planen §3.6. `cover_side = 32` og bøylas Ø8 er valgt
 * slik at jernene havner på y = -100 / 0 / +100 — nøyaktig koordinatene i
 * `tests/fixtures/payload-beam-300x600.json`. Tegningen testes dermed mot den
 * samme geometrien motoren faktisk får.
 *
 * BØYLERADEN ER ENESTE KILDE til de 8 mm. Feltet `stirrup_dia` sto her før,
 * og hver test som trengte en bøyle la en rad oppå — to tall for ett fysisk
 * jern, der det ene kunne endres uten det andre. `stirrupCoverDia(BEAM)` er
 * nå 8 fordi RADEN sier 8, og både den vannrette innrykkingen i
 * `barPositions` og den loddrette i `dc` leser den samme bøyla. Bjelken har
 * uansett bøyler i virkeligheten (EC2 9.2.2), så raden hører hjemme her.
 */
const BEAM = {
  sectionType: 'beam',
  geometry: { b: 300, h: 600 },
  cover: 22, cover_side: 32,
  shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [STIRRUP_S1] },
  layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 50 }],
};

/** Samme bjelke UTEN `shear`-nøkkel — for testene som handler om at bøyla mangler. */
const { shear: _beamShear, ...BEAM_UTEN_BØYLE } = BEAM;

/** Referanseplata: Ø12 c/c 113, dc = 31 ⇒ z = -69, som i plate-payloaden.
 *  Ingen `shear`: en plate har ingen bøyler, og `stirrupCoverDia` gir da 0. */
const SLAB = {
  sectionType: 'slab',
  geometry: { b: 1000, h: 200 },
  cover: 25, cover_side: 25,
  layers: [{ id: 'L1', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }],
};

/**
 * `barPositions` sin `opts`, bygget slik PRODUKSJONSKODEN bygger den.
 *
 * `opts.stirrup_dia` er `barPositions` sin egen parameter, og den skal fylles
 * med `stirrupCoverDia(state)`. Det var nettopp her de to kildene sto mot
 * hverandre: tegningen bøyde seg om bøyleraden mens jernene ble rykket inn
 * etter geometrifeltet. Testene går derfor gjennom denne ene helperen, slik at
 * ingen av dem kan gjenopplive en andre kilde ved å plukke et felt selv.
 */
const barOpts = (state) => ({
  sectionType: state.sectionType,
  cover: state.cover,
  cover_side: state.cover_side,
  stirrup_dia: stirrupCoverDia(state),
});

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

/**
 * Merkelappsonen ER IKKE LENGER 34 mm fast — den måles fra merkelappene som
 * faktisk skal tegnes: `LABEL_GAP(6) + lengste tekstlinje · skrift · GLYPH_W`,
 * klemt til [4, 34]. Formelen skrives ut i ren aritmetikk her, ikke importeres,
 * nettopp for å fange at DEN i `section-draw.js` endres.
 *
 * `labelLines` er de to linjene én merkelapp består av, med skriftstørrelsen sin.
 */
const GLYPH_W = 0.62;
const LABEL_GAP = 6;
function labelLines(layer) {
  return [
    { text: layerLabel(layer), size: 2.6 },
    { text: `dc = ${layer.dc} mm`, size: 2.2 },
  ];
}
function expectedLabelZone(state) {
  let widest = 0;
  for (const layer of state.layers) {
    for (const l of labelLines(layer)) widest = Math.max(widest, l.text.length * l.size * GLYPH_W);
  }
  if (widest <= 0) return 4;
  return Math.max(4, Math.min(34, LABEL_GAP + widest));
}

test('sectionViewBox: målestokken er den strengeste av bredde og høyde', () => {
  // Bjelken 300x600 er høy og smal -> høyden bestemmer.
  const beam = sectionViewBox(BEAM, { width: 174, height: 110 });
  assert.ok(Math.abs(beam.scale - 89 / 600) < 1e-12, `scale = ${beam.scale}`);
  assert.ok(Math.abs(beam.h * beam.scale - 110) < 1e-9, 'papirhøyden fyller rammen');

  // Plata 1000x200 er bred og lav -> bredden bestemmer, og figuren blir lav.
  // Merkelappene er «Ø12 c/c 113» (11 tegn à 2,6) og «dc = 31 mm» (10 à 2,2);
  // den første er bredest, så sonen er 6 + 11·2,6·0,62 = 23,732 mm og
  // tegneflaten 174 - 16 - 23,732 = 134,268 mm. Før den ble målt kostet den
  // 34 mm fast, og plata måtte nøye seg med 124 mm.
  const slab = sectionViewBox(SLAB, { width: 174, height: 110 });
  assert.equal(expectedLabelZone(SLAB), 23.732);
  assert.ok(Math.abs(slab.scale - 134.268 / 1000) < 1e-12, `scale = ${slab.scale}`);
  assert.ok(slab.scale > 124 / 1000, 'den målte sonen skal gi plata MER plass enn de faste 34 mm');
  assert.ok(slab.h * slab.scale < 110, 'plata skal ikke blåses opp til full høyde');
});

test('sectionViewBox: tverrsnittet sentreres når det blir bredde til overs', () => {
  const vb = sectionViewBox(BEAM, { width: 174, height: 110 });
  const left = (-BEAM.geometry.b / 2 - vb.minY) * vb.scale;
  const right = 174 - (BEAM.geometry.b / 2 - vb.minY) * vb.scale;
  // Merkelappmargen er større enn målmargen (16 mm); overskuddet fordeles likt,
  // så differansen skal være nøyaktig `sone - 16`. For bjelken er den bredeste
  // linja «dc = 50 mm» (10 tegn à 2,2), altså 6 + 13,64 = 19,64 mm.
  assert.equal(expectedLabelZone(BEAM), 19.64);
  assert.ok(Math.abs((right - left) - 3.64) < 1e-9, `venstre ${left}, høyre ${right}`);
});

test('sectionViewBox: utsnittets STØRRELSE og målestokk er uavhengig av enheten', () => {
  // 600 px og 174 mm skal dekke like MYE av tverrsnittet og forstørre det like
  // mye; det er dette som gjør at skjermfiguren og rapportfiguren ser like ut.
  const mm = sectionViewBox(BEAM, { width: 174, unit: 'mm' });
  const px = sectionViewBox(BEAM, { width: 600, unit: 'px' });
  for (const key of ['minZ', 'w', 'h']) {
    assert.ok(Math.abs(mm[key] - px[key]) < 1e-9, `${key}: ${mm[key]} mot ${px[key]}`);
  }
  assert.ok(Math.abs(px.scale / mm.scale - 600 / 174) < 1e-12);

  // `minY` — den VANNRETTE plasseringen — får derimot avvike, og skal det.
  // Skjermen har et GULV på merkelappskriften (`MIN_LABEL_PX`, 11 px mot 6,0
  // px før): 2,6 rapport-mm er lesbart på et A4-ark man holder i hånda, men
  // ikke i en 476 px boks på en skjerm. En større skrift trenger en bredere
  // merkelappsone, og da flytter tverrsnittet seg til venstre INNI det samme
  // utsnittet.
  //
  // Det er nettopp derfor `labelZone()` får skriftfaktoren som argument: sonen
  // som RESERVERES og skriften som SETTES må komme fra samme tall, ellers
  // stikker merkelappen ut over figurkanten.
  assert.ok(px.minY > mm.minY,
    'skjermen skal gi merkelappene MER plass enn papiret, ikke mindre');
  assert.ok(Math.abs(px.minY - mm.minY) < 0.05 * mm.w,
    'men forskjellen skal være en marg, ikke et annet utsnitt');
});

/* ------------------------------------------------------------------ *
 * `height` er i KALLERENS enhet — enhetslekkasjen, planen §3 punkt 1
 * ------------------------------------------------------------------ */

/** Papirhøyden figuren faktisk opptar, i kallerens enhet. */
function paperHeight(state, opts) {
  const vb = sectionViewBox(state, opts);
  return vb.h * vb.scale;
}

/**
 * REGRESJON — `height` ble tolket i et ANNET TALLROM enn `width`.
 *
 * `availH` het `o.maxHeight * o.u - mTop - mBottom`, altså ble den oppgitte
 * høyden ganget med `u = width / 174` sammen med marginene. For en skjermkaller
 * med `{width: 300, unit: 'px'}` er `u = 1,724`, så `height: 247` betydde i
 * praksis 425,9 px. MÅLT FØR RETTELSEN: figuren ble 300 × 425,9 px — 72 % for
 * høy for boksen kalleren nettopp hadde beskrevet — uten en feilmelding noe
 * sted. Den rant bare ut av kortet sitt.
 *
 * Dette er hele grunnen til at «send en generøs høyde fra `ui.js`» ikke virket:
 * tallet betydde ikke det det sa.
 */
test('sectionViewBox: height måles i samme enhet som width, ikke i rapport-mm', () => {
  // Skjermtilfellet, med det målte tallet fra før rettelsen.
  const px247 = paperHeight(BEAM, { width: 300, unit: 'px', height: 247 });
  assert.ok(Math.abs(px247 - 247) < 1e-9,
    `en boks på 247 px skal gi en figur på 247 px, ikke ${px247.toFixed(1)} (før: 425,9)`);

  // Og i mm, ved en annen bredde enn de 174 der u = 1 skjuler feilen. To i
  // bredden (87 mm) med 60 mm å gå på ga før 30 mm — nøyaktig halvparten, som
  // er `u`-faktoren i ren form.
  const mm60 = paperHeight(BEAM, { width: 87, unit: 'mm', height: 60 });
  assert.ok(Math.abs(mm60 - 60) < 1e-9, `87 mm bred, 60 mm høy: ${mm60} (før: 30)`);

  // Standarden er uendret: uten `height` gjelder A4-regelen 110 rapport-mm,
  // skalert med bredden, akkurat som før.
  assert.ok(Math.abs(paperHeight(BEAM, { width: 174 }) - 110) < 1e-9);
  assert.ok(Math.abs(paperHeight(BEAM, { width: 87 }) - 55) < 1e-9);
  assert.ok(Math.abs(paperHeight(BEAM, { width: 300, unit: 'px' }) - 110 * (300 / 174)) < 1e-9);
});

/**
 * En generøs høyde skal gi en STOR figur, og det skal kunne måles.
 *
 * Tallene er de målte utgangspunktene fra planen §3: bjelken 300×600 i en boks
 * på 300 px bredde fylte 25,6 % av bredden fordi den arvet papirets 110
 * rapport-mm. Den er høy og smal, så høyden vil alltid binde i en boks som er
 * bredere enn den er høy — men hvor mye den binder, er kallerens valg, ikke
 * papirets.
 */
test('sectionViewBox: en generøs høyde forstørrer figuren, målbart', () => {
  const box = { width: 300, unit: 'px' };
  const fill = (h) => {
    const vb = sectionViewBox(BEAM, h === null ? box : { ...box, height: h });
    return (BEAM.geometry.b * vb.scale) / box.width;
  };

  // Uten `height`: papirets tak, og planens målte 25,6 %.
  assert.ok(Math.abs(fill(null) - 0.2557) < 5e-4, `arvet papirhøyde: ${fill(null)}`);

  // Med kortets egen høyde: figuren vokser med 37 %.
  assert.ok(Math.abs(fill(247) - 0.3513) < 5e-4, `height = 247: ${fill(247)}`);
  assert.ok(fill(247) > fill(null) * 1.35);

  // STRENGT VOKSENDE helt til bredden overtar. Uten dette kunne en «generøs»
  // høyde i prinsippet bli sluppet på gulvet uten at noe feilet.
  let forrige = 0;
  for (const h of [120, 180, 247, 320, 400, 460]) {
    const f = fill(h);
    assert.ok(f > forrige, `height = ${h} ga ikke en større figur enn forrige (${f} mot ${forrige})`);
    forrige = f;
  }
  // Og så slutter den å vokse: bredden binder, og mer høyde er bortkastet.
  assert.ok(Math.abs(fill(2000) - fill(1000)) < 1e-9, 'bredden skal ta over som begrensning');
});

/**
 * A4-GARANTIEN, skrevet som en test i stedet for som en forhåpning.
 *
 * `scale = min(availW/b, availH/h)` og `paperH = mTop + mBottom + h·scale`, så
 * `paperH <= mTop + mBottom + availH = maxHeight` ALLTID — uansett hvor bred
 * merkelappsonen blir. Det er denne ulikheten som gjør at en smalere
 * merkelappsone bare kan gi en BREDERE figur, aldri en side som sprenges.
 */
test('sectionViewBox: papirhøyden overskrider aldri taket, med eller uten height', () => {
  const former = [
    { b: 300, h: 600 }, { b: 1000, h: 200 }, { b: 250, h: 2000 },
    { b: 3000, h: 6000 }, { b: 5000, h: 100 }, { b: 200, h: 200 },
  ];
  for (const geometry of former) {
    for (const opts of [{ width: 174 }, { width: 87 }, { width: 174, height: 60 },
      { width: 300, unit: 'px' }, { width: 300, unit: 'px', height: 247 }]) {
      const state = { ...BEAM, geometry };
      const tak = opts.height ?? 110 * (opts.width / 174);
      const paperH = paperHeight(state, opts);
      assert.ok(paperH <= tak + 1e-9,
        `${geometry.b}x${geometry.h} @ ${JSON.stringify(opts)}: ${paperH} over taket ${tak}`);
    }
  }
});

/* ------------------------------------------------------------------ *
 * Merkelappsonen — målt, ikke fast
 * ------------------------------------------------------------------ */

/**
 * REGRESJON — 34 rapport-mm ble reservert til merkelapper som ikke fantes.
 *
 * `MARGIN.right.on` var en fast kostnad: 19,5 % av figurbredden, permanent, helt
 * uavhengig av hva merkelappene sa og av om det i det hele tatt var noen. Et
 * tverrsnitt uten armering betalte full pris for en tom sone.
 */
test('sectionViewBox: merkelappsonen måles fra merkelappene, ikke fastsatt', () => {
  // Plata er breddebundet, så `scale` ER tegneflaten delt på 1000 — sonen kan
  // leses rett ut av målestokken uten å eksportere noe nytt fra modulen.
  const kort = { ...SLAB, layers: [{ ...SLAB.layers[0], mode: 'bars', count: 4, dc: 31 }] };
  const lang = { ...SLAB, layers: [{ ...SLAB.layers[0], mode: 'spacing', spacing: 1000, dc: 31 }] };
  const ingen = { ...SLAB, layers: [] };

  const sKort = sectionViewBox(kort, { width: 174, height: 110 }).scale;
  const sLang = sectionViewBox(lang, { width: 174, height: 110 }).scale;
  const sIngen = sectionViewBox(ingen, { width: 174, height: 110 }).scale;

  // «4Ø12» er kortere enn «Ø12 c/c 1000», så den korte merkelappen skal gi den
  // største figuren av de to som HAR merkelapper.
  assert.ok(sKort > sLang, `kort merkelapp ga ikke større figur: ${sKort} mot ${sLang}`);
  // Og uten merkelapper i det hele tatt skal sonen falle til minstemålet.
  assert.ok(sIngen > sKort, `ingen merkelapper ga ingen gevinst: ${sIngen} mot ${sKort}`);
  assert.ok(Math.abs(sIngen - (174 - 16 - 4) / 1000) < 1e-12,
    `uten lag skal sonen være MARGIN.right.off = 4 mm: ${sIngen}`);

  // Taket holder: en absurd lang merkelapp skal ikke spise mer enn de 34 mm
  // sonen kostet før. Rapporten er den harde kunden, og den skal aldri bli
  // dårligere enn den var.
  const absurd = { ...SLAB, layers: [{ ...SLAB.layers[0], dia: 12, spacing: 1234567890, dc: 31 }] };
  const sAbsurd = sectionViewBox(absurd, { width: 174, height: 110 }).scale;
  assert.ok(Math.abs(sAbsurd - (174 - 16 - 34) / 1000) < 1e-12,
    `sonen skal klemmes til 34 mm: ${sAbsurd}`);
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

    const forventet = state.layers.flatMap((l) => barPositions(l, state.geometry, barOpts(state)));
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
  /*
   * TOLERANSEN ER AVLEDET, IKKE GJETTET. `r()` runder hvert koordinat til tre
   * desimaler, så hver `cx` bærer opptil 5e-4 papir-mm, som tilbakeregnet blir
   * `5e-4 / scale` modell-mm — og en DIFFERANSE mellom to av dem det dobbelte.
   *
   * Her sto det 1e-6, og det gikk bare fordi målestokken tilfeldigvis var
   * 0,124: 113 · 0,124 = 14,012, som er eksakt i tre desimaler. Første gang
   * målestokken endret seg — her fordi merkelappsonen ble målt i stedet for
   * fast — feilet testen på avrundingsstøy, ikke på en feil i tegningen. En
   * toleranse som avhenger av at et produkt går opp, tester ikke det den sier.
   */
  const tol = 1e-3 / vs.scale;
  assert.ok(Math.abs(sy[4]) < tol / 2, `midterste jern på y = 0: ${sy[4]}`);
  assert.ok(Math.abs((sy[1] - sy[0]) - 113) < tol, `faktisk senteravstand: ${sy[1] - sy[0]}`);
});

/**
 * ÉN BØYLE I BEGGE RETNINGER.
 *
 * Jernet rykkes VANNRETT inn av `barPositions` (`b/2 − cover_side − Ø_bøyle −
 * dia/2`) og LODDRETT ned av `dc` (`cover + Ø_bøyle + dia/2`). Før leste de to
 * hvert sitt tall: den vannrette geometrifeltet `stirrup_dia`, den loddrette
 * det samme feltet, mens bøyla som ble TEGNET kom fra `shear.stirrups[0]`.
 * Ø10 i skjærraden ga da en bøyle tegnet 2 mm inn i armeringen.
 *
 * Testen endrer ÉN ting — radens `dia` — og krever at BEGGE forskyvningene
 * flytter seg nøyaktig like mye. En gjenoppstått andre kilde ville holdt den
 * ene i ro.
 */
test('drawSection: samme bøyle styrer både den vannrette og den loddrette innrykkingen', () => {
  for (const dia of [8, 12, 16]) {
    const base = { ...BEAM, cover: 35, cover_side: 35,
      shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ ...STIRRUP_S1, dia }] } };
    const state = { ...base, layers: [{ id: 'L1', mode: 'bars', dia: 20, count: 3,
      edge: 'bottom', dc: suggestedDc(base, 20), dc_auto: true }] };

    const vb = sectionViewBox(state, { width: 174 });
    const circles = rebarCircles(drawSection(state, { width: 174 }));
    const ys = circles.map((c) => c.cx / vb.scale + vb.minY);
    const zs = circles.map((c) => vb.minZ + vb.h - c.cy / vb.scale);

    // Vannrett: 300/2 − 35 − Ø_bøyle − 20/2
    assert.ok(Math.abs(ys[2] - (150 - 35 - dia - 10)) < 5e-3, `Ø${dia}: y = ${ys[2]}`);
    // Loddrett: −600/2 + (35 + Ø_bøyle + 20/2)
    assert.ok(Math.abs(zs[0] - (-300 + 35 + dia + 10)) < 5e-3, `Ø${dia}: z = ${zs[0]}`);
  }
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

/**
 * VOKTEREN OVER MERKELAPPSONEN — den ene tingen som kan gå galt når sonen måles
 * i stedet for å være fast.
 *
 * `section-draw.js` er DOM-fri med vilje (§2.3 punkt 2) og kan derfor ikke måle
 * tekst; den anslår med `GLYPH_W = 0,62` middelbredde per tegn. Slår anslaget
 * feil vei, skrives merkelappen ut over kanten av arket, og det ser man først
 * etter utskrift.
 *
 * Denne testen anslår IKKE. Den bruker de ekte tegnbreddene fra Helvetica
 * (AFM, tusendels em) for de tegnene merkelappene faktisk består av, og krever
 * at hver eneste merkelapp ender innenfor figurens papirbredde. Den er
 * uavhengig av `GLYPH_W` og vil derfor fange at konstanten settes for lavt.
 */
const HELVETICA = { ' ': 278, '=': 584, '/': 278, '.': 278, '–': 556, 'Ø': 778,
  c: 500, d: 556, m: 833, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556,
  '5': 556, '6': 556, '7': 556, '8': 556, '9': 556 };

/** Ekte tekstbredde i papirenheter. Ukjente tegn får den bredeste glyffen. */
function helveticaWidth(text, fontSize) {
  let em = 0;
  for (const ch of text) em += (HELVETICA[ch] ?? 833) / 1000;
  return em * fontSize;
}

test('drawSection: ingen merkelapp stikker ut over figurkanten', () => {
  const stater = [
    BEAM,
    SLAB,
    { ...SLAB, layers: [{ ...SLAB.layers[0], spacing: 1000, dc: 199 }] },
    { ...SLAB, layers: [{ ...SLAB.layers[0], dia: 32, spacing: 987, dc: 188 }] },
    { ...BEAM, layers: [{ ...BEAM.layers[0], count: 12, dia: 32, dc: 123 }] },
    // Taket på 34 mm slår inn her; merkelappen skal fortsatt få plass, og det
    // er nettopp den klemmen som gjør taket forsvarlig.
    { ...SLAB, layers: [{ ...SLAB.layers[0], spacing: 1234567890, dc: 31 }] },
  ];

  for (const width of [174, 87, 300]) {
    for (const state of stater) {
      const svg = drawSection(state, { width, unit: width === 300 ? 'px' : 'mm' });
      const vb = sectionViewBox(state, { width, unit: width === 300 ? 'px' : 'mm' });
      const paperW = vb.w * vb.scale;
      const g = /<g data-role="labels">([\s\S]*?)<\/g>/.exec(svg);
      assert.ok(g, 'mangler merkelappgruppa');
      const tekster = [...g[1].matchAll(
        /<text x="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
      assert.ok(tekster.length > 0, 'fant ingen merkelapper å måle');
      for (const [, x, fs, text] of tekster) {
        const slutt = Number(x) + helveticaWidth(text, Number(fs));
        assert.ok(slutt <= paperW + 1e-6,
          `«${text}» ender i ${slutt.toFixed(2)} av ${paperW.toFixed(2)} ` +
          `(${state.sectionType} @ ${width})`);
      }
    }
  }

  // Og anslaget skal ha margin, ikke bare så vidt gå opp: det er den marginen
  // som gjør at en merkelapp vi ikke har tenkt på også får plass.
  const svg = drawSection(SLAB, { width: 174 });
  const t = /<text x="([-\d.]+)"[^>]*font-size="([\d.]+)"[^>]*>(Ø12[^<]*)<\/text>/.exec(svg);
  assert.ok(t, 'fant ikke plate-merkelappen');
  const ekte = helveticaWidth(t[3], Number(t[2]));
  const anslag = t[3].length * Number(t[2]) * 0.62;
  assert.ok(anslag > ekte * 1.1, `anslaget (${anslag.toFixed(2)}) har for lite margin mot ${ekte.toFixed(2)}`);
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

test('stirrupGeometry: null uten skjærarmering, uansett hvordan fraværet uttrykkes', () => {
  assert.equal(stirrupGeometry({ ...BEAM, shear: { stirrups: [] } }), null);
  assert.equal(stirrupGeometry({ ...BEAM, shear: undefined }), null);
  assert.equal(stirrupGeometry(BEAM_UTEN_BØYLE), null, 'ingen shear-nøkkel i det hele tatt');
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
  const uten = drawSection(BEAM_UTEN_BØYLE, {});
  assert.ok(!/data-role="stirrup"/.test(uten), 'ingen shear -> ingen bøyletegning');

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
    const bars = barPositions(state.layers[0], state.geometry, barOpts(state));
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
    const m = / A ([\d.]+) ([\d.]+) 0 0 [01] ([-\d.]+) /.exec(d);
    assert.ok(m, `buen skal ha lik rx og ry: ${d}`);
    const vb = sectionViewBox(BEAM, { width: 174 });
    const rp = 14 * vb.scale;   // (20 + 8)/2 mm i papirenheter
    assert.ok(Math.abs(Number(m[1]) - rp) < 1e-3, `radius = ${m[1]}`);
    assert.equal(m[1], m[2], 'rx og ry skal være like — det er en sirkelbue');

    // INGEN KNEKK. Benet står en radius TIL SIDEN for jernet, altså tangent til
    // det, og møter derfor bøyen tangent. Lå benet i jernets senterlinje, ville
    // halvsirkelens tangent vært VANNRETT der den møter et loddrett ben — en
    // 90°-knekk rett over jernet, som er nøyaktig det figuren ikke skal ha.
    // Beviset er at buen ender 2·r unna der benet startet.
    const xStart = Number(/^M ([-\d.]+) /.exec(d)[1]);
    assert.ok(Math.abs(Math.abs(Number(m[3]) - xStart) - 2 * rp) < 1e-2,
      `buen skal ende 2·r fra benet (${2 * rp}), ikke i samme x: ${d}`);

    // Og benet skal være RETT hele veien ned til bøyen: nøyaktig ett `L`-ledd
    // før `A`, med samme x som starten.
    const rett = /^M ([-\d.]+) [-\d.]+ L ([-\d.]+) [-\d.]+ A /.exec(d);
    assert.ok(rett, `benet skal være rett fram til bøyen: ${d}`);
    assert.equal(rett[1], rett[2], 'det rette benet skal ikke forskyve seg underveis');
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
  // Ø8-bøyla står i RADEN — `suggestedDc` leser den derfra. Tallet er det
  // samme som før (35 + 8 + 10 = 53); det er kilden som er blitt én.
  const base = { ...BEAM, cover: 35, cover_side: 35,
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [{ ...STIRRUP_S1, legs: 4 }] } };
  const dc = suggestedDc(base, dia);
  assert.equal(dc, 53, 'dc = 35 + 8 + 20/2 — bøyla lest fra raden');
  const state = {
    ...base,
    layers: [{ id: 'L1', mode: 'bars', dia, count: 4, edge: 'bottom', dc, dc_auto: true }],
  };
  const g = stirrupGeometry(state);

  // Forutsetningen: dette ER tangeringstilfellet, ellers tester vi noe annet.
  // SAMME bøyle i begge retninger: `dc` over og innrykkingen her leser nå én
  // og samme rad, der de før leste hvert sitt felt.
  const bar = barPositions(state.layers[0], state.geometry, barOpts(state))[0];
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
  const state = {
    ...BEAM, cover: 35, cover_side: 35,
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
