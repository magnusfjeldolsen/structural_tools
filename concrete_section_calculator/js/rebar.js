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

// Ligger her, ikke i `section.js`: `minClearDistance` under er selve
// forbrukeren, og `section.js` importerer FRA denne fila — å legge
// konstanten der ville laget en sirkel som i dag bare virker fordi den leses
// inne i funksjonskropper. `section.js` re-eksporterer den for at det
// offentlige API-et (og `MIN_CLEAR_SPACING`-navnet valideringen kjenner) skal
// stå uendret.
/** Minste fri avstand mellom jern i et lag, EC2 8.2. */
export const MIN_CLEAR_SPACING = 20;

/*
 * TO SENTERAVSTANDER SOM TILFELDIGVIS HADDE SAMME TALL.
 * Et nytt PLATELAG og en ny BØYLERAD sto begge med en naken `spacing: 150`, og
 * `store.js:setSectionType` bar en TREDJE kopi av platas tall. Tre steder sa
 * det samme uten å vite om hverandre, så da platas standard skulle bli 200
 * fantes det ingen måte å endre den ene uten å måtte lete opp alle kopiene av
 * den andre — og ingen test ville sagt fra om man glemte én. Nå er de to ulike
 * fysiske tingene to navngitte tall, og `store.js` har ingen kopi i det hele
 * tatt: `setSectionType` bygger et ferskt platesnitt gjennom `createLayer` i
 * stedet for å regne om lagene med sitt eget tall.
 *
 * Ø12 c/c 200 er valgt fordi det er en svært vanlig dekkearmering, og det er
 * tallene regresjonsfixturene `payload-slab-1000x200*.json` er målt med.
 * Bøylenes c/c 150 er UENDRET — den hører til en annen fysisk ting.
 */
/** Standard senteravstand for et nytt lag i en plate [mm]. */
const DEFAULT_SLAB_BAR_SPACING = 200;
/** Standard senteravstand for en ny bøylerad [mm]. */
const DEFAULT_STIRRUP_SPACING = 150;
/** Standard stangdiameter i en plate [mm] — bjelkens er Ø20. */
const DEFAULT_SLAB_BAR_DIA = 12;
/**
 * Standard bøylediameter [mm]. Bor HER, hos bøylefabrikken, fordi bøyla nå
 * bare finnes ett sted: i `shear.stirrups`. `store.js` importerer den for å
 * bygge standardbjelkens bøylerad og dens `dc`.
 */
export const DEFAULT_STIRRUP_DIA = 12;

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
 * Bøylediameteren som faktisk ligger MELLOM overdekningen og hovedarmeringen
 * [mm]. 0 når tverrsnittet ikke har bøyler.
 *
 * HVORFOR DETTE IKKE ER `state.stirrup_dia` DIREKTE
 * `dc` er avstanden til jernets SENTER, og bøyla teller bare fordi den fysisk
 * ligger utenpå hovedarmeringen. Plata har ingen bøyle — men `stirrup_dia`
 * står likevel med sin standardverdi (12 mm), og feltet er SKJULT for plata i
 * `ui.js`, så tallet spiste høyde uten at brukeren kunne se det. Målt på
 * 1000×200 med overdekning 35 og Ø12: `dc = 53` (35+12+6) ga `d = 147 mm` der
 * riktig er `dc = 41` (35+6) og `d = 159 mm`. 12 mm er 7,5 % av den indre
 * momentarmen, og feilen går BEGGE veier: en for liten `d` er konservativ for
 * `M_Rd`, men `A_s,min ∝ d`, så minstearmeringen ble for liten.
 *
 * ÉN KILDE: BØYLERADEN. `state.stirrup_dia` finnes ikke lenger.
 * Diameteren sto tidligere BÅDE i geometripanelet og i bøyleraden, holdt i takt
 * av en `syncStirrupDia`. To felt for ett fysisk jern er nøyaktig den feilformen
 * som har gitt gale tall i denne modulen runde etter runde, og synkroniseringen
 * er ikke en løsning — den er et vedlikeholdskrav.
 *
 * Innvendingen mot å fjerne geometrifeltet var at `dc` ville hoppet 12 mm i det
 * øyeblikket brukeren la inn den første bøyleraden. Svaret er at bjelken nå har
 * en bøylerad FRA START: den har alltid bøyler (EC2 9.2.2 krever
 * minimumsskjærarmering i bjelker), så en bjelke uten rad var en tilstand som
 * ikke finnes i virkeligheten. Plata har ingen rad, og får derfor 0 — som er
 * riktig, og som er det `section-draw.js:stirrupGeometry` allerede bruker for å
 * avgjøre om bøyla i det hele tatt skal tegnes.
 *
 * @param {{shear?:{stirrups?:Array<{dia?:number}>}}} state
 * @returns {number} Ø_bøyle [mm], 0 uten bøyle
 */
export function stirrupCoverDia(state = {}) {
  // STOERSTE diameter blant boeyleradene. Har raden med den groveste boeyla
  // kontakt med jernet, er det DEN som bestemmer hvor langt inn jernet ligger.
  // Med flere rader i framtida er «stoerst» dessuten den konservative lesningen:
  // forskjellen mellom boeyletykkelser er typisk 4-6 mm, og aa regne alle jern
  // etter den groveste koster lite og kan ikke bomme paa usikker side.
  const rows = (state.shear || {}).stirrups || [];
  let max = 0;
  for (const st of rows) {
    const d = num(st && st.dia);
    // NaN forplanter seg med vilje: en uleselig diameter skal naa valideringen
    // som NaN, ikke bli stille borte i en `Math.max`.
    if (Number.isNaN(d)) return NaN;
    if (d > max) max = d;
  }
  return max;
}


/**
 * UI-hjelperen for `dc`: `overdekning + bøyle + Ø/2`, der bøyla bare teller når
 * tverrsnittet har en (se `stirrupCoverDia`). Ligger her og ikke i `ui.js`
 * fordi den definerer hva `dc` BETYR (avstand til jernets SENTER), og den
 * definisjonen hører sammen med `layerCentroidZ`.
 *
 * Brukes som STARTVERDI for et lag uten nabo på samme kant. Har laget en
 * nabo, er det `stackedDc` under som gjelder — se den for hvorfor.
 *
 * @param {{cover:number, stirrup_dia:number}} state
 * @param {number} dia
 */
export function suggestedDc(state = {}, dia) {
  return num(state.cover) + stirrupCoverDia(state) + num(dia) / 2;
}

/**
 * Minste fri avstand mellom parallelle stenger/lag, EC2 8.2(2): den STØRSTE av
 * `k1·Ø`, `(d_g + k2)` og et gulv på 20 mm. Gulvet er `MIN_CLEAR_SPACING` fra
 * `section.js` — samme konstant som validerer bredden, ikke et nytt magisk
 * tall. `k1`/`k2` er NA-parametere (anbefalt 1 og 5); `d_g` er ikke det, men
 * inngår i samme formel.
 *
 * Fri avstand er OVERFLATE TIL OVERFLATE — senteravstand er dette pluss
 * halve summen av de to diametrene (§0, plan-notatet). Det er her det er
 * lettest å ta feil i hele runden.
 *
 * @param {number} dia stangdiameter [mm]
 * @param {{k1?:number, k2?:number, d_g?:number}} [spacing]
 * @returns {number} fri avstand [mm]
 */
export function minClearDistance(dia, spacing = {}) {
  const k1 = Number(spacing.k1 ?? 1);
  const k2 = Number(spacing.k2 ?? 5);
  const dg = Number(spacing.d_g ?? 16);
  return Math.max(k1 * Number(dia || 0), dg + k2, MIN_CLEAR_SPACING);
}

/** To lag med ulik diameter: den STØRSTE styrer. EC2 sier ikke hvilken; den
 *  største er den konservative og eneste entydige lesningen. */
export function minClearBetween(diaA, diaB, spacing = {}) {
  return minClearDistance(Math.max(Number(diaA || 0), Number(diaB || 0)), spacing);
}

/** Lagene på `edge`, sortert etter STIGENDE dc (ytterst først). Ikke-endelige
 *  dc behandles som Infinity, så de havner sist og blir aldri referanse. */
export function layersOnEdge(layers = [], edge) {
  return layers
    .filter((l) => l && l.edge === edge)
    .slice()
    .sort((a, b) => (Number.isFinite(a.dc) ? a.dc : Infinity)
                  - (Number.isFinite(b.dc) ? b.dc : Infinity));
}

/** Laget lengst INN fra kanten (størst endelig dc), eller null. */
export function innermostLayer(layers = [], edge) {
  const on = layersOnEdge(layers, edge).filter((l) => Number.isFinite(l.dc));
  return on.length ? on[on.length - 1] : null;
}

/**
 * `dc` for et NYTT lag på `edge` med diameter `dia`, stablet UTENFOR det
 * lengste inn liggende laget på samme kant (bestillingens punkt 2 og 7). Uten
 * nabo faller den tilbake på `suggestedDc` — det opprinnelige, enkle tilfellet.
 *
 * @param {object} state
 * @param {string} edge `'bottom'` eller `'top'`
 * @param {number} dia
 */
export function stackedDc(state = {}, edge, dia) {
  const inner = innermostLayer(state.layers, edge);
  if (!inner) return suggestedDc(state, dia);
  return inner.dc + (inner.dia + dia) / 2
       + minClearBetween(inner.dia, dia, state.spacing);
}

/**
 * Regner `dc` på nytt for alle lag som IKKE er låst (`dc_auto: true`),
 * kant for kant, ytterst-til-innerst-uavhengig — sorteringen skjer på `dc`,
 * ikke arrayrekkefølge (§3.2). Et låst lag (`dc_auto: false`) beholder sin
 * `dc` urørt, men fungerer FORTSATT som referanse for det neste laget: en
 * bruker som har overstyrt ett lag skal ikke se de andre stable seg oppå det.
 *
 * Ren funksjon: returnerer en NY array og bevarer rekkefølgen fra
 * `state.layers` — kalleren (`store.js`) trenger ikke vite at det har skjedd
 * en sortering underveis.
 *
 * @param {object} state
 * @returns {Array<object>}
 */
export function recomputeAutoDc(state = {}) {
  const layers = (state.layers || []).map((l) => ({ ...l }));
  for (const edge of ['bottom', 'top']) {
    let prev = null;
    for (const layer of layersOnEdge(layers, edge)) {
      if (layer.dc_auto) {
        layer.dc = prev
          ? prev.dc + (prev.dia + layer.dia) / 2
                    + minClearBetween(prev.dia, layer.dia, state.spacing)
          : suggestedDc(state, layer.dia);
      }
      prev = layer; // også når dc_auto er false — et låst lag er referanse.
    }
  }
  return layers;
}

/**
 * Nytt armeringslag med fornuftige verdier for gjeldende tverrsnittstype.
 * Plate får `spacing`-modus, bjelke får `bars` — det er tverrsnittstypen, ikke
 * brukeren, som avgjør hvilken regnemåte som gir mening.
 *
 * `dc_auto: true` med vilje: et nytt lag skal flytte seg når diameteren
 * endres, helt til brukeren selv skriver en verdi i `d_c`-feltet (§3.1).
 *
 * @param {object} state
 * @param {object} [patch]
 */
export function createLayer(state = {}, patch = {}) {
  const isSlab = state.sectionType === 'slab';
  const dia = patch.dia !== undefined ? num(patch.dia) : isSlab ? DEFAULT_SLAB_BAR_DIA : 20;
  const base = isSlab
    ? { mode: 'spacing', dia, spacing: DEFAULT_SLAB_BAR_SPACING }
    : { mode: 'bars', dia, count: 3 };
  return {
    id: patch.id || 'L1',
    ...base,
    edge: 'bottom',
    dc: suggestedDc(state, dia),
    dc_auto: true,
    ...patch,
    dia,
  };
}

/**
 * De tre lastkombinasjonstypene. `uls` er den eneste som kontrolleres mot
 * KAPASITET; `characteristic` og `quasi_permanent` er bruksgrensetyper og går
 * til SLS-kapittelet i stedet (`engine.py:_compute_sls`). En SLS-rad får
 * `checked: false` i bruddgrensedelen og vises nedtonet der.
 */
export const COMBO_TYPES = Object.freeze(['uls', 'characteristic', 'quasi_permanent']);

/**
 * De to typene som går til bruksgrensekapittelet. EGEN liste, avledet av
 * ingenting: `COMBO_TYPES.filter(t => t !== 'uls')` ville bundet SLS-utvalget
 * til at ULS for alltid er den ene resten — en ny bruddgrensetype (f.eks. en
 * ulykkeslast) ville da havnet i SLS uten at noen skrev det.
 */
export const SLS_COMBO_TYPES = Object.freeze(['characteristic', 'quasi_permanent']);

/** Er raden en bruksgrenserad? ÉN kilde til spørsmålet, slik at UI, nyttelast
 * og rapport ikke kan svare hver sitt. */
export function isSlsCombo(combo) {
  return SLS_COMBO_TYPES.includes(combo?.type);
}

/** Finnes det en bruksgrenserad i det hele tatt? Styrer BÅDE om SLS-boksen i
 * skjemaet vises og om motoren i det hele tatt bygger `result.sls` — de to
 * skal dukke opp og forsvinne sammen, ellers finnes det en rubrikk uten svar
 * eller et svar uten rubrikk. */
export function hasSlsCombo(state) {
  return (state?.combos || []).some(isSlsCombo);
}

/**
 * Ny lastkombinasjon. Ligger her, ved siden av `createLayer`, av samme grunn:
 * begge er per-rad-fabrikker som `store.js` (nye rader) og `serialize.js`
 * (normalisering av lastede filer, §5) kaller på samme måte.
 *
 * INGEN `direction` LENGER (endringsrunde 4 §1.2): retningen ER fortegnet på
 * `M_Ed`. `M_Ed <= 0` er feltmoment, `M_Ed > 0` er støttemoment — se
 * `section.js:thetaFor`. En rad uten eget valg er `M_Ed: 0`, som per regelen
 * betyr feltmoment, akkurat som den gamle default-retningen gjorde.
 *
 * `V_Ed` er nytt (§3.4/§4.1c): en STØRRELSE, fortegnet betyr ingenting for
 * skjærkapasiteten.
 *
 * `type` (STEG 2): normaliseres til en av `COMBO_TYPES`, ELLERS `'uls'` — den
 * konservative retningen, siden en `uls`-rad BLIR kontrollert. Normaliseringen
 * MÅ stå ETTER `...patch`: fabrikken har ingen egen notat-kanal (den som
 * kaller melder fra, se `serialize.js`), men skal likevel aldri slippe gjennom
 * en ukjent/manglende type fra en fil eller et API-kall.
 *
 * @param {object} state
 * @param {object} [patch]
 */
export function createCombo(state = {}, patch = {}) {
  const id = patch.id || 'C1';
  // Navnet settes automatisk av id-en: «C3» blir «ULS 3». En rad uten navn er
  // ubrukelig i rapportens kombinasjonstabell og i advarslene, som navngir den
  // dimensjonerende raden — og å kreve at brukeren finner på et navn for hver
  // rad er nettopp den friksjonen som ikke skal finnes. Brukeren kan overskrive.
  const nr = /^C(\d+)$/.exec(id);
  const out = {
    id,
    name: nr ? `ULS ${nr[1]}` : '',
    type: 'uls',
    N_Ed: 0,
    M_Ed: 0,
    V_Ed: 0,
    ...patch,
  };
  out.type = COMBO_TYPES.includes(out.type) ? out.type : 'uls';
  return out;
}

/**
 * Ny bøylerad. Ligger her, sammen med `createLayer` og `createCombo`, av samme
 * grunn: alle tre er per-rad-fabrikker som `store.js` (nye rader) og
 * `serialize.js`/`replaceState` (normalisering av en lastet fil) kaller likt,
 * slik at en rad fra en fil ikke kan ha en annen form enn en rad fra UI-en.
 *
 * `dia` KOMMER FRA KONSTANTEN, IKKE FRA TILSTANDEN.
 * Feltet «Stirrup Ø» i geometriseksjonen og bøylas `dia` var to uavhengige
 * verdier: det første styrte jernenes plassering og `dc` (`suggestedDc`), det
 * andre skjærkapasiteten og bøyletegningen. Ingen validering bandt dem, så
 * Ø10 i skjærraden ga jern regnet med Ø8 og en bøyle tegnet 2 mm inn i
 * armeringen. Så ble de bundet med en synkronisering — men to felt for ett
 * fysisk jern er ikke løst ved å holde dem i takt; synkroniseringen er bare et
 * vedlikeholdskrav. Geometrifeltet er nå borte, og raden er eneste kilde:
 * `stirrupCoverDia` leser den groveste diameteren blant radene.
 *
 * `alpha: 90` er PÅKREVD, ikke pynt: `section.js` sin `stirrup_alpha_unsupported`
 * avviser alt annet enn nøyaktig 90 i v1, og en rad uten feltet ville gitt
 * «α = undefined°» på hver eneste kjøring.
 *
 * `fywk` arves fra hovedarmeringens `fyk` — bøyler kommer i praksis fra samme
 * stålkvalitet, og et nytt felt som starter på 500 mens brukeren har valgt
 * B400 er en felle. Brukeren kan overskrive.
 *
 * @param {object} state
 * @param {object} [patch]
 */
export function createStirrup(state = {}, patch = {}) {
  const fyk = num((state.steel || {}).fyk);
  return {
    id: patch.id || 'S1',
    dia: DEFAULT_STIRRUP_DIA,
    spacing: DEFAULT_STIRRUP_SPACING,
    legs: 2,
    fywk: fyk > 0 ? fyk : 500,
    alpha: 90,
    ...patch,
  };
}

/**
 * Bøylens tverrsnittsareal, `legs · π·Ø²/4` [mm²]. EC2 6.2.3: alle ben i
 * samme skjæresnitt bidrar. Egen funksjon, ikke bare `legs * barArea(dia)`
 * inline — `payload.js` og `section.js` skal begge lese DENNE, ikke regne sin
 * egen kopi (samme begrunnelse som `barPositions`, se hodekommentaren).
 *
 * @param {{dia:number, legs:number}} st
 * @returns {number} A_sw [mm²]
 */
export function stirrupArea(st = {}) {
  return num(st.legs) * barArea(st.dia);
}

/**
 * Én bøylerads `A_sw/s` [mm²/mm] — det VRds og Asw_s_required faktisk bruker.
 *
 * @param {{dia:number, legs:number, spacing:number}} st
 */
export function aswPerSpacing(st = {}) {
  return stirrupArea(st) / num(st.spacing);
}

/**
 * Summen av `A_sw/s` over ALLE bøylerader [mm²/mm]. Riktig for parallelle
 * bøylesett med ulik senteravstand — det er derfor `shear.stirrups` er en
 * LISTE fra dag én, selv om UI-en i v1 bare tilbyr én rad (plan v3 §3.2).
 *
 * @param {Array<object>} list
 */
export function totalAswPerSpacing(list = []) {
  return list.reduce((sum, st) => sum + aswPerSpacing(st), 0);
}
