/**
 * rebar.js — armeringslag: areal, dybde, og HVOR jernene ligger.
 *
 * HVORFOR DENNE FILA ER MODULENS VIKTIGSTE
 * `barPositions()` er den ENESTE kilden til jernkoordinater. Både `payload.js`
 * (som sender dem til motoren) og `section-draw.js` (som tegner dem) SKAL kalle
 * den. Regnet de hver for seg, ville tegningen kunne være uenig med tallet uten
 * at noen test feilet og uten at noe krasjet — den verste sviktformen som
 * finnes, fordi den ser helt riktig ut. `payload.test.mjs` påstår derfor
 * eksplisitt at `payload.section.rebar[i].bars` er dypt lik `barPositions(...)`.
 *
 * AKSESYSTEMET
 * `y` er horisontalt, `z` er VERTIKALT og positivt oppover, med origo i
 * tverrsnittets senter (plan §3.6). Shapely-koordinaten `(x, y)` betyr `(Y, Z)`.
 * Derfor heter funksjonen som gir vertikal koordinat `layerCentroidZ` — en
 * y/z-forveksling her er usynlig og katastrofal, så navnet bærer aksen.
 *
 * TO REGNEMÅTER, ETT AREAL
 * `mode: 'bars'` (bjelke) er `antall × Ø`. `mode: 'spacing'` (plate) er
 * `Ø c/c s` og gir areal PER METER: `A_s = (1000/s)·π·Ø²/4`. Antallet jern som
 * TEGNES er `Math.round(1000/s)` med minimum 1 — arealet regnes eksakt, men
 * tegningen må vise noe. Uten minimumet blir armeringen usynlig ved stor
 * senteravstand selv om kapasiteten er riktig (plan §4.2).
 *
 * DOM-fri og ren (plan §2.3 punkt 2).
 */

/** Sikker tallkonvertering: tomt felt blir `NaN`, ikke 0. */
function num(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Arealet av ETT jern, `π·d²/4`. Motoren regner alltid slik for `PointGeometry`. */
export function barArea(dia) {
  const d = num(dia);
  return (Math.PI * d * d) / 4;
}

/**
 * Lagets armeringsareal [mm²]. For `mode: 'spacing'` er det PER METER, fordi
 * plata alltid er 1000 mm bred.
 *
 * @param {object} layer
 * @returns {number}
 */
export function layerArea(layer = {}) {
  const a = barArea(layer.dia);
  if (layer.mode === 'spacing') return (1000 / num(layer.spacing)) * a;
  return num(layer.count) * a;
}

/**
 * Antall jern som TEGNES. `Math.round`, minimum 1 — se hodekommentaren.
 * Merk at arealet IKKE regnes fra dette tallet: `layerArea` bruker den eksakte
 * brøken `1000/s`, så avrundingen påvirker bare figuren.
 *
 * @param {object} layer
 * @returns {number}
 */
export function layerBarCount(layer = {}) {
  const raw = layer.mode === 'spacing' ? 1000 / num(layer.spacing) : num(layer.count);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.round(raw));
}

/**
 * Jernsenterets vertikale koordinat, med z = 0 i tverrsnittssenteret og
 * z positiv OPPOVER. `dc` måles fra kanten `edge` peker på.
 *
 * @param {object} layer
 * @param {number} h  tverrsnittshøyde [mm]
 * @returns {number} z [mm]
 */
export function layerCentroidZ(layer = {}, h) {
  const H = num(h);
  const dc = num(layer.dc);
  return layer.edge === 'top' ? H / 2 - dc : -H / 2 + dc;
}

/**
 * Lagets effektive høyde `d` — avstanden fra TRYKKANTEN til jernsenteret.
 *
 * `theta` ER PÅKREVD og har ingen standardverdi med vilje: θ = 0 gir trykksone
 * ØVERST (feltmoment), θ = π gir trykksone NEDERST (støttemoment). Et defaultet
 * θ ville gitt et stille feil `d` for støttemoment, som er nøyaktig den feilen
 * ingen oppdager.
 *
 * @param {object} layer
 * @param {number} h
 * @param {number} theta  0 eller Math.PI [rad]
 * @returns {number} d [mm]
 */
export function layerDepth(layer, h, theta) {
  if (!Number.isFinite(num(theta))) {
    throw new Error('layerDepth: theta er påkrevd (0 = feltmoment, π = støttemoment).');
  }
  const H = num(h);
  const z = layerCentroidZ(layer, H);
  // cos(θ) = +1 ved θ = 0 (trykk oppe), −1 ved θ = π (trykk nede).
  return Math.cos(num(theta)) >= 0 ? H / 2 - z : H / 2 + z;
}

/**
 * ENESTE kilde til jernkoordinater. Se hodekommentaren.
 *
 * Bjelke: `count` jern fordeles jevnt mellom `±(b/2 − cover_side −
 * stirrup_dia − dia/2)`. `count === 1` gir ett jern i `y = 0` — ikke i
 * ytterkant, som en naiv «fordel jevnt» ville gitt.
 *
 * Plate: `Math.round(1000/s)` jern, minimum 1, sentrert om `y = 0` med FAKTISK
 * senteravstand `s` (ikke utsmurt) — tegningen skal vise virkeligheten selv om
 * motoren får stripa fra `equivalentStrip()`.
 *
 * @param {object} layer
 * @param {{b:number, h:number}} geometry
 * @param {{cover_side?:number, stirrup_dia?:number}} [opts] hele `state` kan sendes inn
 * @returns {Array<{y:number, z:number, dia:number}>} sortert stigende på y
 */
export function barPositions(layer = {}, geometry = {}, opts = {}) {
  const b = num(geometry.b);
  const h = num(geometry.h);
  const dia = num(layer.dia);
  const z = layerCentroidZ(layer, h);
  const n = layerBarCount(layer);

  if (layer.mode === 'spacing') {
    const s = num(layer.spacing);
    const out = [];
    for (let i = 0; i < n; i++) {
      // Sentrert om y = 0: for n = 1 gir dette eksakt 0, ikke s/2.
      out.push({ y: (i - (n - 1) / 2) * s, z, dia });
    }
    return out;
  }

  const coverSide = num(opts.cover_side) || 0;
  const stirrup = num(opts.stirrup_dia) || 0;
  const yMax = b / 2 - coverSide - stirrup - dia / 2;
  if (n === 1) return [{ y: 0, z, dia }];
  const step = (2 * yMax) / (n - 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push({ y: -yMax + i * step, z, dia });
  return out;
}

/**
 * Utsmurt platearmering (plan §4.3). Stripa har `høyde = Ø` og
 * `bredde = A_s/Ø`, slik at arealet blir eksakt `A_s` og tyngdepunktet havner i
 * `layerCentroidZ`. Verifisert innenfor 0,17 % mot diskrete jern — dette ER
 * platemodellen, ikke en tilnærming som skal unnskyldes.
 *
 * Stripa kan aldri bli bredere enn plata (`bredde ≥ 1000` krever
 * `s ≤ 0,785·Ø`, fysisk umulig), så det er BEVISST ingen vakt mot det.
 *
 * @param {object} layer
 * @param {number} h
 * @returns {{width:number, height:number, z:number}}
 */
export function equivalentStrip(layer = {}, h) {
  const dia = num(layer.dia);
  return {
    width: layerArea(layer) / dia,
    height: dia,
    z: layerCentroidZ(layer, h),
  };
}

/**
 * Sum armeringsareal [mm²] (per meter for plate).
 * @param {Array<object>} layers
 */
export function totalArea(layers = []) {
  return layers.reduce((sum, l) => sum + layerArea(l), 0);
}

/**
 * Arealvektet dybde over ALLE lag: `d = Σ(A_i·d_i) / ΣA_i`.
 *
 * DETTE ER MOTORENS `d_eff_all`, IKKE EC2 SIN `d`.
 * EC2 9.2.1.1 definerer `d` til tyngdepunktet i STREKKARMERINGEN, og hvilke
 * lag som står i strekk avgjøres av TØYNINGSPLANET ved brudd — ikke av
 * geometrien. Ligger nøytralaksen under begge lagene, står begge i strekk, og
 * EC2-`d` er tyngdepunktet av begge. JS-siden har ikke tøyningsplanet før
 * motoren har kjørt, så denne funksjonen kan og skal ikke prøve å gjengi
 * motorens `d_eff`. Etter en kjøring er `result.section_props.d_eff` fasiten.
 *
 * Navnet er beholdt fordi det er det `derived()`, `reinforcementRatio()` og
 * A3 allerede kaller. `effectiveDepthGeometric()` under er estimatet.
 *
 * @returns {number} d [mm], `NaN` uten armering
 */
export function effectiveDepth(layers = [], h, theta) {
  let sumA = 0;
  let sumAd = 0;
  for (const l of layers) {
    const a = layerArea(l);
    sumA += a;
    sumAd += a * layerDepth(l, h, theta);
  }
  return sumA > 0 ? sumAd / sumA : NaN;
}

/**
 * Lagene på den GEOMETRISKE strekksiden: θ = 0 (trykk oppe) ⇒ `z < 0`,
 * θ = π (trykk nede) ⇒ `z > 0`.
 *
 * Dette er et ESTIMAT, ikke motorens utvalg, og det er IKKE eksakt — heller
 * ikke for normalarmerte snitt. Motoren leser strekksiden av tøyningsplanet ved
 * brudd. Ligger nøytralaksen under BEGGE armeringslagene står begge i strekk,
 * og EC2-`d` blir tyngdepunktet av begge: A1 har målt 146,8 mm i et tilfelle
 * der denne geometriske regelen sier 550. Ikke «forbedre» JS-siden til å tro at
 * den er autoritativ — den kan ikke bli det uten tøyningsplanet.
 *
 * DEGENERERT TILFELLE: ligger ALLE lag på trykksiden (eller nøyaktig i `z = 0`)
 * faller vi tilbake på alle lagene i stedet for å svare `NaN`. Et `NaN` som
 * forplanter seg til ρ og `A_s,min` er vanskeligere å tolke enn et tall som
 * åpenbart er rart.
 *
 * @param {Array<object>} layers
 * @param {number} h
 * @param {number} theta 0 eller Math.PI [rad] — PÅKREVD
 * @returns {Array<object>}
 */
export function tensionLayers(layers = [], h, theta) {
  if (!Number.isFinite(num(theta))) {
    throw new Error('tensionLayers: theta er påkrevd (0 = feltmoment, π = støttemoment).');
  }
  const compressionOnTop = Math.cos(num(theta)) >= 0;
  const picked = layers.filter((l) => {
    const z = layerCentroidZ(l, h);
    return compressionOnTop ? z < 0 : z > 0;
  });
  return picked.length ? picked : layers;
}

/** Armeringsareal på den geometriske strekksiden [mm²]. Estimat, se over. */
export function tensionArea(layers = [], h, theta) {
  return totalArea(tensionLayers(layers, h, theta));
}

/**
 * ESTIMAT av EC2-`d`: arealvektet over den geometriske strekksiden.
 *
 * HVA DEN ER TIL
 * `A_s,min` og ρ skal kunne vises i skjemaet FØR første beregning — ellers står
 * feltet tomt helt til brukeren har trykket «Beregn», og armeringsvalget gjøres
 * i blinde. Vektet over alle lag ville trykkarmeringen trukket `d` ned og gitt
 * et for lite minimum, altså på usikker side, så et rent `effectiveDepth()` er
 * ikke brukbart til dette.
 *
 * HVA DEN IKKE ER
 * Den er ikke motorens `d_eff` og skal ikke sammenlignes med den. Etter en
 * kjøring bruker UI og rapport `result.section_props.d_eff`, aldri dette tallet.
 *
 * Med bare ett lag er alle tre tallene like — derfor fanger referansefixturene
 * ingen av forskjellene, og derfor finnes det en egen test med to lag.
 *
 * @returns {number} d [mm], `NaN` uten armering
 */
export function effectiveDepthGeometric(layers = [], h, theta) {
  return effectiveDepth(tensionLayers(layers, h, theta), h, theta);
}

/**
 * EC2 sin ρ_l: `ρ = A_s,strekk/(b_t·d)`, der `b_t` er strekksonens bredde. For
 * et rektangulært snitt er `b_t = b`; for plata er `b_t = 1000` fordi alt
 * regnes per meter.
 *
 * TELLER OG NEVNER MÅ KOMME FRA SAMME UTVALG. Total armering delt på en dybde
 * som bare gjelder strekkarmeringen er innbyrdes inkonsistent og betyr
 * ingenting for et dobbeltarmert snitt — derfor `tensionArea` over
 * `effectiveDepthGeometric`, begge fra den geometriske strekksiden.
 *
 * Som alt annet her er dette et ESTIMAT før første kjøring. Etter en kjøring
 * gjelder `result.section_props.rho` fra motoren.
 *
 * @param {Array<object>} layers
 * @param {{b:number, h:number}} geometry
 * @param {number} theta
 */
export function reinforcementRatio(layers = [], geometry = {}, theta) {
  const d = effectiveDepthGeometric(layers, geometry.h, theta);
  return tensionArea(layers, geometry.h, theta) / (num(geometry.b) * d);
}

/**
 * UI-hjelperen for `dc`: `overdekning + bøyle + Ø/2`. Ligger her og ikke i
 * `ui.js` fordi den definerer hva `dc` BETYR (avstand til jernets SENTER), og
 * den definisjonen hører sammen med `layerCentroidZ`.
 *
 * @param {{cover:number, stirrup_dia:number}} state
 * @param {number} dia
 */
export function suggestedDc(state = {}, dia) {
  return num(state.cover) + num(state.stirrup_dia) + num(dia) / 2;
}

/**
 * Nytt armeringslag med fornuftige verdier for gjeldende tverrsnittstype.
 * Plate får `spacing`-modus, bjelke får `bars` — det er tverrsnittstypen, ikke
 * brukeren, som avgjør hvilken regnemåte som gir mening.
 *
 * @param {object} state
 * @param {object} [patch]
 */
export function createLayer(state = {}, patch = {}) {
  const isSlab = state.sectionType === 'slab';
  const dia = patch.dia !== undefined ? num(patch.dia) : isSlab ? 12 : 20;
  const base = isSlab
    ? { mode: 'spacing', dia, spacing: 150 }
    : { mode: 'bars', dia, count: 3 };
  return {
    id: patch.id || 'L1',
    ...base,
    edge: 'bottom',
    dc: suggestedDc(state, dia),
    ...patch,
    dia,
  };
}
