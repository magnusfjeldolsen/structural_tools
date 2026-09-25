/**
 * section-draw.js — tverrsnittstegningen, som SVG-streng.
 *
 * Seks ting som er verdt å lese før noe endres her:
 *
 *  1. **`barPositions()` fra `rebar.js` er eneste kilde til jernkoordinater.**
 *     Denne fila regner dem ALDRI selv. Regnet tegningen og `payload.js` ut
 *     posisjonene hver for seg, ville figuren kunne vise noe annet enn det
 *     motoren faktisk integrerte — uten at en eneste test feilet. Det er den
 *     verste sviktformen som finnes, og planen §4.2 sier derfor rett ut at
 *     `barPositions` er den viktigste funksjonen i modulen.
 *
 *  2. **Ingen ekstern CSS, bare presentasjonsattributter** (planen §2.3 krav 4).
 *     `print.css` eies av en annen agent. Delte to filer kontrollen over
 *     figuren, ville en uskyldig regel i stilarket kunne gjøre armeringen
 *     usynlig på papir uten at noen så det før etter utskrift. Alt som avgjør
 *     hvordan figuren ser ut står derfor i selve SVG-strengen.
 *
 *  3. **`viewBox` er i «rapport-millimeter», ikke i tverrsnittets millimeter.**
 *     Samme grep som `geometry_workspace/js/report-figure.js`: én brukerenhet i
 *     viewBox ER én millimeter på papiret når `width="174mm"`. Derfor blir
 *     `stroke-width="0.25"` en ekte 0,25 mm strek og `font-size="2.5"` en
 *     2,5 mm skrift — uansett om tverrsnittet er 200 eller 2000 mm høyt.
 *     Modellkoordinater transformeres i JavaScript, ett punkt om gangen, av
 *     `toPaper()`. Det finnes **ingen** `transform="scale()"` her: skalerer man
 *     gruppa, skaleres strekbredder og skrift med, og en slank plate blir
 *     hårtynn og uleselig.
 *
 *  4. **`unit: 'px'` bruker samme tallrom som `'mm'`.** Alle strekbredder og
 *     skriftstørrelser ganges med `u = width / 174`, slik at en 600 px bred
 *     skjermfigur får ~0,9 px streker og ~8,6 px skrift i stedet for 0,25 px
 *     og 2,5 px. Rapportbredden 174 mm er altså referansen for *alle* mål, og
 *     figuren ser lik ut på skjerm og papir.
 *
 *  5. **`sectionViewBox()` er skilt ut fordi den kan testes uten å parse SVG.**
 *     Den er den eneste stedet utsnitt og målestokk bestemmes; `drawSection()`
 *     spør den og tegner. Endres marginene, endres begge samtidig.
 *
 *  6. **Bøyler (endringsrunde 4, §5.3) er bevisst NEDTONET og bruker bare
 *     `stirrups[0]`.** `state.shear.stirrups` er en liste fordi ulike rader
 *     langs bjelkens lengde kan ha ulik senneavstand (se `rebar.js`), men én
 *     tverrsnittstegning kan bare vise ÉN fysisk bøyle om gangen — radene er
 *     alternative soner, ikke bøyler som eksisterer samtidig i samme snitt.
 *     `stirrupGeometry()` er skilt ut av samme grunn som `sectionViewBox()`:
 *     radiusklemmen, bensnappingen og bøyeradiene skal kunne testes som rene
 *     tall, ikke gjettes fra en tegnet figur.
 *
 * Aksesystemet er planens (§3.6): `y` er horisontalt, `z` er vertikalt og peker
 * OPP, og tverrsnittet er sentrert om origo — samme nullpunkt som motoren
 * refererer `N` og `M` til. SVG har y nedover, så `toPaper()` snur z.
 */

import { barPositions, stirrupCoverDia } from './rebar.js';
// `sectionWidth` og ALDRI `state.geometry.b`: plata regnes per meter, og for
// `sectionType === 'slab'` returnerer `sectionWidth` 1000 uansett hva som ligger
// igjen i `geometry.b` fra en bjelke. Leste figuren `geometry.b` direkte, kunne
// en plate lastet inn via `setInputs`/dokumentlasting bli TEGNET 300 mm bred
// mens motoren regnet 1000 mm — figur og tall ville vist to ulike tverrsnitt
// uten at noen test feilet. Samme prinsipp som punkt 1 over.
import { sectionHeight, sectionWidth } from './section.js';

/* ------------------------------------------------------------------ *
 * Papir: referansebredden og marginene
 * ------------------------------------------------------------------ */

/**
 * Rapportens figurbredde (planen §8). Alt annet er relativt til denne, slik at
 * en figur på 87 mm (to i bredden) eller 600 px (skjerm) får proporsjonalt
 * tynnere/tykkere streker i stedet for å arve 174-millimetersverdiene rått.
 */
const REPORT_WIDTH = 174;

/** Marginer i rapport-mm. Mål- og merkelappsonene koster plass bare når de brukes. */
const MARGIN = Object.freeze({
  top: 6,
  bottom: { on: 15, off: 4 },   // b-målet ligger under tverrsnittet
  left: { on: 16, off: 4 },     // h-målet ligger til venstre
  // `right.on` er TAKET for merkelappsonen, ikke lenger den faste kostnaden:
  // `labelZone()` måler hva merkelappene faktisk trenger og klemmer mot dette.
  // Taket beholdes slik at sonen aldri blir STØRRE enn den var før, uansett hvor
  // galt et anslag skulle slå ut på et lag ingen har sett ennå.
  right: { on: 34, off: 4 },    // armeringsmerkelappene ligger til høyre
});

/**
 * Standard maksimal papirhøyde i RAPPORT-mm. En høy bjelke skal ikke sprenge en
 * A4-side. Den gjelder bare når kalleren ikke sier noe selv; se `resolveOpts`
 * for hvorfor en eksplisitt `height` måles i kallerens egen enhet i stedet.
 */
const DEFAULT_MAX_HEIGHT = 110;

/**
 * Luft mellom tverrsnittets høyrekant og merkelappteksten, i rapport-mm.
 * ÉN kilde: `labelZone()` reserverer plass med den, og tegneløkka setter
 * teksten med den. Sto tallet to steder, kunne sonen bli reservert 6 mm fra
 * kanten og teksten satt 9 mm ut, og merkelappen ville stukket ut av figuren
 * uten at noen test så det — først synlig på et utskrevet ark.
 */
const LABEL_GAP = 6;

/**
 * Skriftstørrelsene i rapport-mm. Konstanter fordi merkelappsonen må regne på
 * NØYAKTIG den skriften teksten settes med; to tall som skal være like er den
 * feilformen denne modulen har blitt bitt av i hver eneste runde.
 */
const FS_LABEL = 2.6;   // lagets bransjenotasjon, «3Ø20»
const FS_DIM = 2.2;     // måltall og «dc = 50 mm»

/**
 * SKJERMEN ER IKKE PAPIR, OG SKRIFTEN KAN IKKE VÆRE DET SAMME TALLET.
 *
 * 2,6 rapport-mm er riktig på et A4-ark: det er en lesbar merkelapp ved siden
 * av en figur man holder i hånda. På skjermen ganges den bare med
 * `u = bredde/174`, og MÅLT i en 476 px bred figur ble `b = 300 mm` rendret på
 * **6,0 px** — mot 13 px for brødteksten rundt. Figuren er sidas STØRSTE
 * objekt og samtidig den med minst lesbar tekst.
 *
 * Grunnen er at `u` er et FORSTØRRELSESTALL for geometri, ikke for typografi.
 * En figur som blir dobbelt så bred skal ha dobbelt så tykke streker — men
 * skriften skal bli lesbar, ikke proporsjonal.
 *
 * Derfor et GULV, ikke en fast størrelse: skriften får vokse med figuren som
 * før når figuren er stor nok, men aldri falle under det man kan lese. Et fast
 * tall ville gjort miniatyren i bunnlinja (48 px) til ren tekst.
 *
 * Gjelder BARE `unit: 'px'`. Papiret er urørt — der er 2,6 mm fortsatt 2,6 mm,
 * og en rapport som endret seg av en skjermrettelse ville vært en regresjon.
 */
const MIN_LABEL_PX = 11;
const MIN_DIM_PX = 10;

/**
 * Anslått middelbredde per tegn, som andel av skriftstørrelsen.
 *
 * SVG kan ikke måle tekst uten et DOM, og denne fila er DOM-fri med vilje
 * (§2.3 punkt 2). Anslaget er derfor bevisst RAUST: de faktiske middelbreddene
 * i Helvetica for tegnene som forekommer i disse merkelappene ligger på
 * 0,49–0,53 em («Ø12 c/c 113» er 0,490, «dc = 50 mm» er 0,525), så 0,62 gir
 * ca. 20 % margin. Retningen på feilen er det som betyr noe: reserverer vi for
 * mye, taper figuren noen piksler; reserverer vi for lite, skrives
 * merkelappen ut over kanten av arket.
 */
const GLYPH_W = 0.62;

/* ------------------------------------------------------------------ *
 * Farger — presentasjonsattributter, ett sted
 * ------------------------------------------------------------------ */

const THEMES = Object.freeze({
  print: {
    bg: '#ffffff',
    concreteFill: '#f4f4f5',
    concreteStroke: '#18181b',
    rebar: '#18181b',
    dim: '#52525b',
    text: '#18181b',
    na: '#b91c1c',
    compression: '#93c5fd',
    stirrup: '#71717a',    // nedtonet med vilje (planen §5.3) — ikke like mørk som omrisset
  },
  dark: {
    bg: '#0f172a',
    concreteFill: '#334155',
    concreteStroke: '#cbd5e1',
    rebar: '#f8fafc',
    dim: '#94a3b8',
    text: '#e2e8f0',
    na: '#f87171',
    compression: '#38bdf8',
    stirrup: '#94a3b8',
  },
});

const FONT = 'Helvetica, Arial, sans-serif';

/* ------------------------------------------------------------------ *
 * Småting
 * ------------------------------------------------------------------ */

/** Engelsk desimalpunktum, som resten av siden. */
export function fmt(value, decimals = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '–';
  return value.toFixed(decimals);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tre desimaler er nok for et koordinat i mm; mer bare blåser opp strengen. */
function r(v) {
  return Number.isFinite(v) ? String(Math.round(v * 1000) / 1000) : '0';
}

function resolveOpts(opts = {}) {
  const width = Number.isFinite(opts.width) && opts.width > 0 ? opts.width : REPORT_WIDTH;
  const u = width / REPORT_WIDTH;
  return {
    width,
    unit: opts.unit === 'px' ? 'px' : 'mm',
    /*
     * `fs` er den EKSTRA faktoren skriften får utover `u` — se `MIN_LABEL_PX`.
     *
     * ÉN kilde, og den må være det: `labelZone()` reserverer bredden til
     * merkelappene av de samme `FS_*`-tallene som tegneløkka setter teksten
     * med. Ganget bare den ene av dem opp, ville sonen blitt reservert for en
     * liten skrift og teksten satt med en stor — og merkelappen stukket ut over
     * figurkanten. Det er nøyaktig punkt 1 i hodekommentaren, og det er denne
     * ene linja som hindrer det.
     *
     * Faktoren styres av den STRENGESTE av de to kravene, slik at begge
     * gulvene holder.
     */
    fs: opts.unit === 'px'
      ? Math.max(1, MIN_LABEL_PX / (FS_LABEL * u), MIN_DIM_PX / (FS_DIM * u))
      : 1,
    /*
     * `maxHeight` er i KALLERENS enhet, den samme som `width` — ikke i
     * rapport-mm.
     *
     * Dette var en enhetslekkasje, og den var av den lumske sorten: høyden ble
     * ganget med `u = width / 174` sammen med marginene, så en skjermkaller som
     * ba om `{width: 300, unit: 'px', height: 247}` fikk en figur på
     * 300 × 425,9 px. Tallet 247 betydde i praksis 247 · 1,724 = 425,9 px.
     * Kalleren ba om å få plass i 247 piksler og fikk noe 72 % for høyt, uten
     * en feilmelding noe sted — figuren bare rant ut av boksen sin.
     *
     * Ingen kaller sender `height` i dag (`ui.js` og `report.js` lar den stå),
     * så rettelsen endrer ingenting som finnes; den gjør bare at en `height`
     * som SENDES betyr det den sier. `width` og `height` er nå i samme tallrom,
     * som en hvilken som helst annen boks.
     *
     * STANDARDEN er fortsatt 110 rapport-mm og skaleres med `u`, slik at en
     * halvbreddefigur (87 mm) får halv høyde og ser ut som en nedskalert utgave
     * av den fulle. Det er den A4-regelen kommentaren over `DEFAULT_MAX_HEIGHT`
     * beskriver, og den står urørt.
     */
    maxHeight: Number.isFinite(opts.height) && opts.height > 0
      ? opts.height
      : DEFAULT_MAX_HEIGHT * u,
    showDims: opts.showDims !== false,
    showLabels: opts.showLabels !== false,
    theme: opts.theme === 'dark' ? 'dark' : 'print',
    overlay: opts.overlay || null,
    u,
  };
}

/* ------------------------------------------------------------------ *
 * Merkelappene: én kilde til teksten, og til plassen den trenger
 * ------------------------------------------------------------------ */

/**
 * De tekstlinjene ÉN merkelapp består av, med skriftstørrelsen sin i rapport-mm.
 *
 * Skilt ut fordi TO steder trenger nøyaktig de samme strengene: `labelZone()`
 * som reserverer bredde til dem, og tegneløkka som setter dem. Bygde de to
 * strengene hver for seg, ville en endring i formatet — «dc = 50 mm» til
 * «d_c = 50 mm», si — flyttet teksten uten å flytte plassen, og merkelappen
 * ville stukket ut over figurkanten. Det er nøyaktig samme prinsipp som punkt 1
 * i hodekommentaren: to uavhengige regnestykker over det samme tallet er den
 * sviktformen ingen test fanger.
 */
function layerLabelLines(layer) {
  return [
    { text: layerLabel(layer), size: FS_LABEL },
    { text: `dc = ${fmt(Number(layer?.dc) || 0, 0)} mm`, size: FS_DIM },
  ];
}

/**
 * GEOMETRIEN JERNENE SKAL PLASSERES I — gjennom PORTEN, aldri rå.
 *
 * Hodekommentarens punkt 1 sier at `barPositions()` er eneste kilde til
 * jernkoordinater, og fila leser derfor aldri `geometry.b` direkte. Den
 * REGELEN ble fulgt; ARGUMENTET ble det ikke: begge kallene sendte
 * `state.geometry` rått, mens `payload.js` sender
 * `{b: sectionWidth(state), h: sectionHeight(state)}`.
 *
 * MÅLT, plate med en utdatert `geometry.b = 300` liggende igjen:
 *
 *     TEGNET  (rå geometri):   -105,0    0,0   +105,0
 *     REGNET  (sectionWidth):  -455,0    0,0   +455,0
 *
 * Å kalle samme funksjon var ikke nok — argumentene må komme fra samme sted.
 * `payload.js` lærte nøyaktig dette for `stirrup_dia` («payloaden ga y = 105
 * der tegningen ga 93») og lot samme klasse overleve for `b`.
 *
 * `sectionViewBox()` brukte `sectionWidth()` hele tiden, så RAMMA ble 1000 mm
 * bred mens jernene ikke ble det.
 */
function drawGeometry(state) {
  return { b: sectionWidth(state), h: sectionHeight(state) };
}

/**
 * Bredden merkelappsonen faktisk trenger, i rapport-mm.
 *
 * FØR var dette et fast tall: 34 rapport-mm, uansett hva merkelappene sa —
 * 19,5 % av figurbredden, permanent, også for et tverrsnitt UTEN armering der
 * det ikke tegnes en eneste merkelapp. På skjermen, der den samme figuren
 * allerede taper 28,7 % av bredden til marginer, er det den største enkeltposten
 * som ikke er tverrsnitt.
 *
 * Nå måles behovet: lengste tekstlinje pluss luften ut fra betongkanten.
 *
 * TO KLEMMER, begge med en begrunnelse som gjelder PAPIRET og ikke skjermen:
 *
 *  - **Aldri over `MARGIN.right.on` (34).** Rapporten er den harde kunden her;
 *    der trenger merkelappene plassen sin. Taket gjør at sonen aldri kan bli
 *    større enn den var før denne endringen, så en A4-side kan i verste fall
 *    bli som i dag — aldri verre.
 *  - **Aldri under `MARGIN.right.off` (4).**
 *
 * At A4-figuren ikke kan sprenge siden på høyden følger av `sectionViewBox`
 * uansett hva denne funksjonen returnerer: `scale = min(availW/b, availH/h)`,
 * og `availH` avhenger bare av `maxHeight` og de loddrette marginene. Derfor er
 * `paperH = mTop + mBottom + h·scale <= mTop + mBottom + availH = maxHeight`
 * ALLTID. En smalere merkelappsone gir en bredere figur, aldri en høyere side.
 *
 * Lag UTEN jern tegner ingen merkelapp, men får plass reservert her. Det er med
 * vilje: `sectionViewBox` kaller ikke `barPositions()` og skal ikke begynne med
 * det for en marg. Å reservere litt for mye koster noen piksler; å reservere for
 * lite setter tekst utenfor arket.
 */
function widestLabel(state) {
  const layers = Array.isArray(state?.layers) ? state.layers : [];
  let widest = 0;
  for (const layer of layers) {
    for (const line of layerLabelLines(layer)) {
      widest = Math.max(widest, line.text.length * line.size * GLYPH_W);
    }
  }
  return widest;
}

/**
 * SKRIFTFAKTOREN SOM FAKTISK FÅR PLASS.
 *
 * `o.fs` er ØNSKET (gulvet i `MIN_LABEL_PX`). Her klemmes det mot budsjettet
 * merkelappsonen har: `MARGIN.right.on` minus luften ut fra betongkanten.
 *
 * HVORFOR KLEMMEN MÅTTE INN: uten den vokste sonen med hele faktoren, og MÅLT
 * falt platas fyllingsgrad fra 77 % til 61 % av bredden — plata er
 * breddebundet, så hver millimeter merkelappsonen tar, tar den rett fra
 * tverrsnittet. Lesbar skrift som er betalt med en mindre figur er ikke en
 * forbedring, det er en byttehandel ingen ba om.
 *
 * ÉN funksjon, og både sonen og teksten leser den. Det er hele poenget:
 * reserverer man plass med ett tall og setter tekst med et annet, stikker
 * merkelappen ut over figurkanten — punkt 1 i hodekommentaren.
 */
function fontScale(state, o) {
  if (!(o.fs > 1)) return 1;
  const widest = widestLabel(state);
  if (widest <= 0) return o.fs;
  return Math.max(1, Math.min(o.fs, (MARGIN.right.on - LABEL_GAP) / widest));
}

function labelZone(state, fs = 1) {
  const widest = widestLabel(state) * fs;
  if (widest <= 0) return MARGIN.right.off;
  return Math.max(MARGIN.right.off, Math.min(MARGIN.right.on, LABEL_GAP + widest));
}

/* ------------------------------------------------------------------ *
 * Utsnitt og målestokk
 * ------------------------------------------------------------------ */

/**
 * `sectionViewBox(state, opts) -> {minY, minZ, w, h, scale}`
 *
 * `minY`/`minZ`/`w`/`h` er i TVERRSNITTETS millimeter og beskriver hele flaten
 * figuren dekker, marginene inkludert. `scale` er papirenheter per millimeter
 * tverrsnitt. Papirbredden er dermed alltid `w * scale === opts.width`, og
 * papirhøyden `h * scale`.
 *
 * Målestokken er `min(bredde-begrensning, høyde-begrensning)`: en 300×600-bjelke
 * begrenses av høyden, en 1000×200-plate av bredden. Blir det plass til overs i
 * bredden, fordeles den likt på begge sider — tverrsnittet står da midt i
 * tegneflaten i stedet for å klistre seg til venstremargen.
 *
 * `opts.height` er taket på papirhøyden, I SAMME ENHET SOM `opts.width`. Sender
 * en skjermkaller `{width: 300, unit: 'px', height: 247}`, blir figuren nøyaktig
 * 300 × 247 px når høyden binder — ikke 300 × 425,9, som den ble da høyden
 * feilaktig ble tolket i rapport-mm. Uten `height` gjelder A4-regelen
 * `DEFAULT_MAX_HEIGHT`, skalert med figurbredden.
 *
 * Høydebegrensningen binder derfor bare så lenge kalleren faktisk har en høyde å
 * begrense mot. En skjermkaller som ikke sender noen, arver papirets tak og får
 * en figur som er liten uten grunn — det er den fella `ui.js` sto i.
 */
export function sectionViewBox(state, opts = {}) {
  const o = resolveOpts(opts);
  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);

  const mLeft = (o.showDims ? MARGIN.left.on : MARGIN.left.off) * o.u;
  const mRight = (o.showLabels ? labelZone(state, fontScale(state, o)) : MARGIN.right.off) * o.u;
  const mBottom = (o.showDims ? MARGIN.bottom.on : MARGIN.bottom.off) * o.u;
  const mTop = MARGIN.top * o.u;

  const availW = Math.max(1e-6, o.width - mLeft - mRight);
  // `maxHeight` er allerede i kallerens enhet (se `resolveOpts`), mens
  // marginene er rapport-mm og må ganges med `u`. Sto det `o.maxHeight * o.u`
  // her, ville en eksplisitt høyde blitt tolket i et annet tallrom enn bredden.
  const availH = Math.max(1e-6, o.maxHeight - mTop - mBottom);

  const scale = Math.min(availW / b, availH / h);

  // Overskuddsbredde fordeles likt, slik at tverrsnittet sentreres i tegneflaten.
  const slack = (availW - b * scale) / 2;
  const padLeft = mLeft + slack;
  const padBottom = mBottom;

  const paperH = mTop + mBottom + h * scale;

  return {
    minY: -b / 2 - padLeft / scale,
    minZ: -h / 2 - padBottom / scale,
    w: o.width / scale,
    h: paperH / scale,
    scale,
  };
}

/* ------------------------------------------------------------------ *
 * Bøyler (skjærarmering) — rene tall, skilt ut av samme grunn som
 * `sectionViewBox`: radiusklemmen og bengeometrien skal kunne påstås uten å
 * parse SVG.
 * ------------------------------------------------------------------ */

/**
 * Alle jernkoordinatene i tverrsnittet, i ÉN liste.
 *
 * Kaller `barPositions()` med nøyaktig samme argumenter som `drawSection()`
 * gjør lenger nede — bøylegeometrien må se de SAMME jernene som blir tegnet,
 * ellers bøyer bøylen seg rundt et jern figuren viser et annet sted. Punkt 1 i
 * hodekommentaren gjelder også her: koordinatene regnes aldri lokalt.
 */
function allBars(state) {
  const layers = Array.isArray(state?.layers) ? state.layers : [];
  const opts = {
    sectionType: state?.sectionType,
    cover: state?.cover,
    cover_side: state?.cover_side,
    // Boeyla finnes bare i `shear.stirrups` naa. `stirrupCoverDia` tar den
    // stoerste blant radene, saa den VANNRETTE innrykkingen her og den
    // loddrette i `dc` bruker noeyaktig samme tall.
    stirrup_dia: stirrupCoverDia(state || {}),
  };
  const out = [];
  for (const layer of layers) {
    for (const p of barPositions(layer, drawGeometry(state), opts) || []) {
      const y = Number(p.y);
      const z = Number(p.z);
      const d = Number(p.dia);
      if (Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(d)) out.push({ y, z, dia: d });
    }
  }
  return out;
}

/**
 * Diameteren på det største jernet som ligger i et HJØRNE av bøylen, eller 0.
 *
 * «I hjørnet» er avgjort av en boks på `dia_jern + dia_bøyle` fra begge de to
 * innersidene som møtes der. Tangering — jernet som faktisk ligger i bøyen —
 * er `(dia_jern + dia_bøyle)/2` fra hver side, så vinduet er nøyaktig det
 * dobbelte av tangeringsavstanden. Et jern som ligger lenger inne enn det er
 * ikke i bøyen i det hele tatt (det sitter i et indre lag, eller «svever» fordi
 * brukeren har skrevet en stor `dc`), og da er det EC2-minsteradien som gjelder.
 *
 * Det STØRSTE hjørnejernet vinner fordi `<rect rx>` bare har ÉN radius for alle
 * fire hjørnene. Har hjørnene ulike diametre, er den største bøyen den eneste
 * som ikke ville sett for trang ut.
 */
function cornerBarDia(bars, y0, y1, z0, z1, stirrupDia) {
  let best = 0;
  for (const bar of bars) {
    const window = bar.dia + stirrupDia;
    const dy = Math.min(Math.abs(bar.y - y0), Math.abs(y1 - bar.y));
    const dz = Math.min(Math.abs(bar.z - z0), Math.abs(z1 - bar.z));
    if (dy <= window && dz <= window && bar.dia > best) best = bar.dia;
  }
  return best;
}

/**
 * `stirrupGeometry(state) -> {y0, y1, z0, z1, radius, dia, legs, legY, legBends, label} | null`
 *
 * Planen (§5.3): avrundet rektangel innenfor overdekningen. `y0`/`y1`/`z0`/`z1`
 * er INNERSIDEN av bøylen i tverrsnittets millimeter — `inset = cover_side +
 * dia/2` horisontalt (langs `b`), `cover + dia/2` vertikalt (langs `h`).
 *
 * **`radius`**: ligger det et jern i hjørnet, er det jernet bøylen bøyes RUNDT,
 * og bøylens senterlinje tangerer det i `(dia_hjørnejern + dia_bøyle)/2`. Uten
 * hjørnejern finnes det ingenting å bøye rundt, og da gjelder dorradien
 * `2·dia` (EC2 tabell 8.1N: dordiameter ≥ 4Ø for Ø ≤ 16 mm).
 *
 * **Klemmen mot `halve korteste innersiden` beholdes uansett.** Uten den ville
 * en tynn plate (liten `h`, altså liten `innerH`) fått en hjørneradius som er
 * større enn halve platetykkelsen — et rektangel som «sprekker», med negative
 * eller selvoverlappende sider. Klemmen er ikke kosmetikk; uten den blir
 * `<rect rx=...>` udefinert for enkelte tynne plater.
 *
 * `state.shear.stirrups` er en LISTE (flere rader med ulik senneavstand kan
 * tenkes langs bjelkens lengde, se `rebar.js`), men én tverrsnittstegning kan
 * bare vise ÉN fysisk bøyle om gangen — radene representerer alternative
 * soner langs spennet, ikke bøyler som eksisterer samtidig i samme snitt.
 * Derfor brukes bare `stirrups[0]`, den som også er «S1»-eksempelet i planen.
 *
 * `legs > 2` gir `legY`: y-koordinatene til de INDRE bena, og `legBends`: én
 * liste per ben med de jernene benet skal bøye seg rundt. Tre trinn:
 *
 *  1. **Jevn fordeling først**, med samme `leg_pitch`-formel som
 *     `s_t,max`-kontrollen i `section.js` (planen §3.3): `innerW / (legs - 1)`.
 *     DE TO FORMLENE MÅ FORBLI IDENTISKE — kontrollen advarer om benavstanden,
 *     og figuren skal vise den avstanden kontrollen snakker om.
 *  2. **Snapp til nærmeste jern** innenfor `pitch/2`. Et ben som står
 *     millimeter fra et lengdejern er ikke bare stygt, det er umulig å binde;
 *     i virkeligheten flyttes benet til jernet. Vinduet er STRENGT (`<`, ikke
 *     `<=`): et jern nøyaktig `pitch/2` unna ligger midt mellom to jevnt
 *     fordelte ben, og å la det trekke ett av dem til seg ville brutt
 *     symmetrien i figuren uten at noen kollisjon var løst.
 *  3. **Jernet ligger i bøyen.** For hvert jern benet treffer, bøyes
 *     senterlinjen rundt jernet med radius `(dia_jern + dia_bøyle)/2` — samme
 *     tangeringsregel som i hjørnene. Bena som IKKE er snappet har tom
 *     `legBends` og tegnes rett: da er det ingenting å bøye rundt, og en bue
 *     ville vært løgn.
 *
 * Returnerer `null` når lista er tom — «tegnes bare når lista er ikke-tom»
 * (§5.3) blir dermed en enkel `if (stirrup)` hos kalleren.
 */
export function stirrupGeometry(state) {
  const list = Array.isArray(state?.shear?.stirrups) ? state.shear.stirrups : [];
  if (!list.length) return null;
  const st = list[0];

  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);
  const dia = Math.max(0, Number(st?.dia) || 0);
  const legs = Math.max(2, Math.round(Number(st?.legs) || 2));
  const spacing = Number(st?.spacing) || 0;
  const coverSide = Number(state?.cover_side) || 0;
  const cover = Number(state?.cover) || 0;

  const insetY = coverSide + dia / 2;
  const insetZ = cover + dia / 2;
  const y0 = -b / 2 + insetY;
  const y1 = b / 2 - insetY;
  const z0 = -h / 2 + insetZ;
  const z1 = h / 2 - insetZ;
  const innerW = Math.max(0, y1 - y0);
  const innerH = Math.max(0, z1 - z0);

  const bars = allBars(state);

  // Hjørnejernet styrer bøyen; finnes det ikke, gjelder dorradien 2·dia.
  // Klemmen (§5.3) gjelder uansett: uten `Math.min` mot halve korteste
  // innerside ville en tynn plate fått en hjørneradius figuren ikke kan tegne.
  const cornerDia = cornerBarDia(bars, y0, y1, z0, z1, dia);
  const cornerR = cornerDia > 0 ? (cornerDia + dia) / 2 : 2 * dia;
  const radius = Math.max(0, Math.min(cornerR, Math.min(innerW, innerH) / 2));

  const legY = [];
  const legBends = [];
  if (legs > 2 && innerW > 0) {
    const pitch = innerW / (legs - 1);
    for (let i = 1; i < legs - 1; i++) {
      const even = y0 + i * pitch;

      // Nærmeste jern innenfor det strenge vinduet, og ALDRI et jern et
      // tidligere ben allerede har tatt: to ben i samme y er ett ben i
      // figuren, og da hadde brukeren sett færre avskjæringssnitt enn han la inn.
      // KANDIDATENE ER STREKKARMERINGEN, ikke et hvilket som helst jern. Et
      // flerbens bøylesett bindes til det ytterste laget; et jern i et indre
      // lag ligger ikke i noen bøy. Uten dette kunne benet snappe til et
      // overkantjern 0,67 mm unna et underkantjern og bomme på begge — det
      // NÆR-BOMMET er nettopp det som ser klumsete ut.
      const hookZ = bars.reduce((lo, b) => (lo === null || b.z < lo ? b.z : lo), null);
      const hookable = bars.filter((b) => hookZ !== null && Math.abs(b.z - hookZ) < 1e-9);

      // VINDUET ER KOLLISJONSSONEN, ikke et halvt spenn. Snapper man alltid til
      // nærmeste jern, flyttes benet selv når den jevne posisjonen står fritt:
      // med 3 ben og 4 jern havnet det midtre benet 32 mm ut av midten uten at
      // noe var i veien. Brukeren ba om at benet skal søke til jernet NÅR det
      // ellers ville kollidert — ikke bestandig. `1.5 ·` gir litt margin, så et
      // ben som nesten treffer (det som ser klumsete ut) også blir dratt helt
      // inn i bøyen i stedet for å bli stående og gnisse mot jernet.
      const touch = hookable.reduce((m, b) => Math.max(m, (b.dia + dia) / 2), 0);
      let snap = null;
      let best = Math.min(pitch / 2, 1.5 * touch);
      for (const bar of hookable) {
        const d = Math.abs(bar.y - even);
        if (d < best && !legY.some((y) => Math.abs(y - bar.y) < 1e-9)) {
          best = d;
          snap = bar.y;
        }
      }
      const y = snap === null ? even : snap;
      legY.push(y);

      const bends = [];
      if (snap !== null) {
        /*
         * Benet BØYER BARE DER DET SNUR — nederst og øverst. Et jern i et indre
         * lag ligger ikke i noen bøy; benet passerer det.
         *
         * To feil ble rettet her, begge funnet ved å måle på det tverrsnittet
         * appen faktisk lager:
         *
         *  1. Betingelsen var `bar.z - rad <= z0`, altså «hopp over hvis jernet
         *     stikker under bøylas senterlinje». For et lag med AVLEDET `dc`
         *     (`suggestedDc = cover + stirrup_dia + dia/2`) er
         *       bar.z - rad = -h/2 + cover + stirrup_dia + dia/2 - (dia + stirrup_dia)/2
         *                   = -h/2 + cover + stirrup_dia/2 = z0
         *     EKSAKT, for enhver overdekning og enhver diameter. `<=` slo derfor
         *     ut buen i nøyaktig standardtilfellet — hvert eneste `dc_auto`-lag.
         *     Målt: dc = 53 ga ingen bue, dc = 53,0001 ga bue. Tangering ER at
         *     jernet ligger i bøyen; det er ikke overlapp.
         *  2. Løkka gikk ovenfra og ned med en `cursor`, og med to underkantlag
         *     bøyde den derfor rundt det INDRE jernet — det som svever fritt —
         *     og tegnet en rett strek gjennom det YTRE, som er det som faktisk
         *     er bundet i bøylen.
         *
         * Tålegrensen er 1e-6 mm og finnes bare for flyttallsstøy; den slipper
         * ikke gjennom et jern som reelt ligger utenfor bøylen.
         */
        const TOL = 1e-6;
        const onLeg = bars.filter((bar) => Math.abs(bar.y - y) < 1e-9);
        const side = y < 0 ? -1 : 1;
        const lowest = onLeg.reduce((a, b) => (a === null || b.z < a.z ? b : a), null);
        const highest = onLeg.reduce((a, b) => (a === null || b.z > a.z ? b : a), null);

        const bottomR = lowest ? (lowest.dia + dia) / 2 : 0;
        if (lowest && bottomR > 0 && lowest.z < 0
            && lowest.z - bottomR >= z0 - TOL && lowest.z + bottomR < z1) {
          bends.push({ z: lowest.z, radius: bottomR, side });
        }
        // `highest.z > 0` skiller et OVERKANTJERN fra et indre underkantlag.
        // Uten det ville to underkantlag gitt en «toppbøy» rundt det indre
        // jernet, som henger fritt midt i tverrsnittet.
        const topR = highest ? (highest.dia + dia) / 2 : 0;
        if (highest && highest !== lowest && topR > 0 && highest.z > 0
            && highest.z + topR <= z1 + TOL && highest.z - topR > z0) {
          // Øverst først i lista: pathen tegnes ovenfra og ned.
          bends.unshift({ z: highest.z, radius: topR, side });
        }
      }
      legBends.push(bends);
    }
  }

  return {
    y0, y1, z0, z1, radius, dia, legs, spacing, legY, legBends,
    label: `Ø${fmt(dia, 0)} c/c ${fmt(spacing, 0)} (${legs} legs)`,
  };
}

/* ------------------------------------------------------------------ *
 * Tegning
 * ------------------------------------------------------------------ */

/**
 * `drawSection(state, opts) -> string`
 *
 * Tar HELE tilstanden (planen §6), ikke en delmengde: `barPositions` trenger
 * `cover_side` og `stirrup_dia`, merkelappene trenger `sectionType`, og en
 * delmengde ville bare blitt en ny kontrakt å holde i synk.
 *
 * `opts.overlay = {x, theta}` tegner nøytralaksen og skygger trykksonen.
 * `x` er trykksonehøyden fra TRYKKANTEN, som i `result.bending.x`, og `theta`
 * avgjør hvilken kant det er: 0 ⇒ trykk oppe (feltmoment), π ⇒ trykk nede.
 */
export function drawSection(state, opts = {}) {
  const o = resolveOpts(opts);
  const c = THEMES[o.theme];
  const vb = sectionViewBox(state, opts);
  const b = Math.max(1e-9, Number(sectionWidth(state || {})) || 0);
  const h = Math.max(1e-9, Number(state?.geometry?.h) || 0);
  const s = vb.scale;
  const paperW = vb.w * s;
  const paperH = vb.h * s;

  // Modell -> papir. z peker opp, SVG-y peker ned.
  const px = (y) => (y - vb.minY) * s;
  const py = (z) => (vb.minZ + vb.h - z) * s;

  const sw = 0.25 * o.u;          // grunnstrek, 0,25 mm på papir
  const swThick = 0.45 * o.u;     // tverrsnittets omriss
  // Den KLEMTE faktoren, samme funksjon som sonen ble reservert med.
  const fs = fontScale(state, o);
  const fsLabel = FS_LABEL * o.u * fs;
  const fsDim = FS_DIM * o.u * fs;

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${r(paperW)}" height="${r(paperH)}" fill="${c.bg}"/>`);

  /* --- Betongtverrsnittet ------------------------------------------ */
  parts.push(
    `<g data-role="concrete">` +
    `<rect x="${r(px(-b / 2))}" y="${r(py(h / 2))}" width="${r(b * s)}" height="${r(h * s)}" ` +
    `fill="${c.concreteFill}" stroke="${c.concreteStroke}" stroke-width="${r(swThick)}"/>` +
    `</g>`
  );

  /* --- Trykksone og nøytralakse ------------------------------------ */
  // Ligger FØR armeringen, slik at jernene aldri havner under skyggen.
  if (o.overlay && Number.isFinite(Number(o.overlay.x))) {
    const x = Number(o.overlay.x);
    const compTop = Math.abs(Number(o.overlay.theta) || 0) < Math.PI / 2;
    const zNa = compTop ? h / 2 - x : -h / 2 + x;
    const zTop = compTop ? h / 2 : zNa;
    const zBot = compTop ? zNa : -h / 2;
    const over = 5 * o.u;

    let g = `<g data-role="na">`;
    if (zTop > zBot) {
      g += `<rect x="${r(px(-b / 2))}" y="${r(py(zTop))}" width="${r(b * s)}" ` +
           `height="${r((zTop - zBot) * s)}" fill="${c.compression}" fill-opacity="0.28"/>`;
    }
    g += `<line x1="${r(px(-b / 2) - over)}" y1="${r(py(zNa))}" ` +
         `x2="${r(px(b / 2) + over)}" y2="${r(py(zNa))}" ` +
         `stroke="${c.na}" stroke-width="${r(sw * 1.6)}" ` +
         `stroke-dasharray="${r(3 * o.u)} ${r(1.5 * o.u)}"/>`;
    g += `<text x="${r(px(-b / 2) - over)}" y="${r(py(zNa) - 1.1 * o.u)}" ` +
         `font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.na}">` +
         `x = ${esc(fmt(x, 1))} mm</text>`;
    parts.push(g + `</g>`);
  }

  /* --- Bøyler (skjærarmering), nedtonet ------------------------------ *
   * FØR armeringen (samme grunn som trykksoneskyggen over): jernene skal
   * aldri havne under bøyleomrisset. Tegnes bare når lista er ikke-tom
   * (§5.3) — `stirrupGeometry` returnerer `null` ellers.
   */
  const stirrup = stirrupGeometry(state);
  if (stirrup && stirrup.y1 > stirrup.y0 && stirrup.z1 > stirrup.z0) {
    // EKTE diameter, akkurat som jernene tegnes (se armeringsløkka under).
    // Før tegnet bøylen seg med en fast brøkdel av tegneenheten, helt frikoblet
    // fra `dia`: en Ø8-bøyle i referansebjelken ble 0,18 mm bred der den skulle
    // vært 8 · 0,1483 ≈ 1,19 mm — 6,6 ganger for tynn, og figuren løy om
    // hvor mye plass bøylen faktisk tar. Gulvet er det gamle tallet, så en
    // bøyle i et svært tverrsnitt ikke forsvinner i ingenting.
    const swStirrup = Math.max(stirrup.dia * s, 0.18 * o.u);
    const rx = stirrup.radius * s;
    let g = `<g data-role="stirrup" stroke="${c.stirrup}" stroke-width="${r(swStirrup)}" fill="none">`;
    g += `<rect x="${r(px(stirrup.y0))}" y="${r(py(stirrup.z1))}" ` +
         `width="${r((stirrup.y1 - stirrup.y0) * s)}" height="${r((stirrup.z1 - stirrup.z0) * s)}" ` +
         `rx="${r(rx)}" ry="${r(rx)}"/>`;
    // Ekstra ben (legs > 2). `path`, ikke `line`: der benet er snappet til et
    // lengdejern skal jernet ligge i BØYEN, og en bue kan ikke uttrykkes med
    // `<line>`. Buen er en halvsirkel om jernets senter — start- og
    // sluttpunktet har samme x, så radien alene bestemmer utslaget, og
    // senterlinjen tangerer jernet hele veien rundt.
    //
    // `sweep-flag` 1 er med klokka i SVG (y peker ned), altså utslag mot
    // STØRRE x. `px` er monotont voksende i y, så `side = +1` (bort fra
    // senteret på høyre side) er sweep 1 og `side = -1` er sweep 0.
    stirrup.legY.forEach((ly, i) => {
      const bend = (stirrup.legBends[i] || [])[0];
      if (!bend) {
        // Ingenting å bøye rundt: rett ben fra kant til kant.
        const x = r(px(ly));
        g += `<path d="M ${x} ${r(py(stirrup.z1))} L ${x} ${r(py(stirrup.z0))}"/>`;
        return;
      }
      /*
       * RETT BEN, FORSKJØVET, MED EN LITEN BØY RUNDT JERNET.
       *
       * Den forrige figuren la benet i jernets senterlinje og slo en halvsirkel
       * om jernet. Tangenten til den halvsirkelen er VANNRETT der den møter et
       * loddrett ben, så figuren fikk en 90°-knekk rett over jernet — en
       * retningsendring ingen bøyle har.
       *
       * Nå står benet en radius TIL SIDEN for jernet, altså tangent til det, og
       * bøyen er en halvsirkel rundt jernet som benet møter TANGENT. Ingen
       * knekk noe sted. At benet dermed ikke ligger i jernets senterlinje er
       * den lille eksentrisiteten mot skjærkraften — bevisst akseptert.
       *
       * Benet slutter i bøyen; det fortsetter ikke ned til bøylas underkant.
       * `sweep-flag` 1 er med klokka i SVG (y peker ned).
       */
      const rp = bend.radius * s;
      const xIn = r(px(ly) + (bend.side > 0 ? rp : -rp));
      const xOut = r(px(ly) - (bend.side > 0 ? rp : -rp));
      const zBar = r(py(bend.z));
      const d = `M ${xIn} ${r(py(stirrup.z1))} L ${xIn} ${zBar}` +
                ` A ${r(rp)} ${r(rp)} 0 0 ${bend.side > 0 ? 1 : 0} ${xOut} ${zBar}`;
      g += `<path d="${d}"/>`;
    });
    g += `</g>`;
    // Én liten etikett, ingen kotering (§5.3 — bevisst nedtonet). Plassert
    // MIDT i bøylen, både vannrett og loddrett: der er tverrsnittet nesten
    // alltid tomt. Den lå før rett over det nedre indre hjørnet — altså
    // nøyaktig oppå underkantarmeringen, som tegnes ETTER bøylen og dermed
    // malte over teksten, og for et smalt tverrsnitt stakk den ut av kanten.
    // MED MASKE BAK. De indre bena går gjennom hele høyden, så uansett hvor
    // teksten står loddrett vil de krysse den så snart `legs > 2`. En liten
    // flate i betongfargen bak teksten er standard tegnepraksis og virker
    // uavhengig av hvor mange ben det er. Bredden er et ANSLAG fra
    // tegnlengden — SVG kan ikke måle tekst uten et DOM, og denne fila er
    // DOM-fri med vilje (§2.3 punkt 2).
    const labelFs = fsDim * 0.9;
    // SAMME tegnbreddeanslag som merkelappsonen bruker (`GLYPH_W`). Sto tallet
    // to steder, kunne det ene bli justert og det andre ikke, og da ville enten
    // masken bli for smal (bena skinner gjennom teksten) eller sonen for trang.
    const labelW = stirrup.label.length * labelFs * GLYPH_W;
    const labelX = (px(stirrup.y0) + px(stirrup.y1)) / 2;
    const labelY = (py(stirrup.z0) + py(stirrup.z1)) / 2;
    g += `<rect x="${r(labelX - labelW / 2)}" y="${r(labelY - labelFs * 0.95)}" ` +
         `width="${r(labelW)}" height="${r(labelFs * 1.35)}" fill="${c.concreteFill}" stroke="none"/>`;
    g += `<text x="${r(labelX)}" y="${r(labelY)}" text-anchor="middle" ` +
         `font-family="${FONT}" font-size="${r(labelFs)}" fill="${c.stirrup}">` +
         `${esc(stirrup.label)}</text>`;
    parts.push(g);
  }

  /* --- Armering ----------------------------------------------------- */
  const layers = Array.isArray(state?.layers) ? state.layers : [];
  const barOpts = {
    sectionType: state?.sectionType,
    cover: state?.cover,
    cover_side: state?.cover_side,
    // Boeyla finnes bare i `shear.stirrups` naa. `stirrupCoverDia` tar den
    // stoerste blant radene, saa den VANNRETTE innrykkingen her og den
    // loddrette i `dc` bruker noeyaktig samme tall.
    stirrup_dia: stirrupCoverDia(state || {}),
  };

  const drawn = [];   // {layer, bars}
  let bars = `<g data-role="rebar" fill="${c.rebar}">`;
  for (const layer of layers) {
    const pos = barPositions(layer, drawGeometry(state), barOpts) || [];
    drawn.push({ layer, bars: pos });
    for (const p of pos) {
      // Minsteradius: et Ø10-jern i en 1000 mm plate blir under en halv
      // rapport-millimeter og forsvinner i streken uten dette gulvet.
      const rad = Math.max((Number(p.dia) || 0) / 2 * s, 0.5 * o.u);
      // `|| 0` ville tegnet et jern med ukjent z MIDT i tverrsnittet, stille.
      // Et jern vi ikke vet hvor er, skal ikke tegnes — en manglende sirkel er
      // synlig, en sirkel på feil sted er det ikke.
      const pz = Number(p.z);
      const py_ = Number(p.y);
      if (!Number.isFinite(pz) || !Number.isFinite(py_)) continue;
      bars += `<circle cx="${r(px(py_))}" cy="${r(py(pz))}" r="${r(rad)}"/>`;
    }
  }
  parts.push(bars + `</g>`);

  /* --- Mål ---------------------------------------------------------- */
  if (o.showDims) {
    let g = `<g data-role="dims" stroke="${c.dim}" stroke-width="${r(sw)}" fill="none">`;
    const off = 8 * o.u;
    const tick = 1.4 * o.u;

    // Bredde, under tverrsnittet
    const yDim = py(-h / 2) + off;
    g += `<line x1="${r(px(-b / 2))}" y1="${r(py(-h / 2))}" x2="${r(px(-b / 2))}" y2="${r(yDim + tick)}"/>`;
    g += `<line x1="${r(px(b / 2))}" y1="${r(py(-h / 2))}" x2="${r(px(b / 2))}" y2="${r(yDim + tick)}"/>`;
    g += `<line x1="${r(px(-b / 2))}" y1="${r(yDim)}" x2="${r(px(b / 2))}" y2="${r(yDim)}"/>`;
    g += `<line x1="${r(px(-b / 2) - tick)}" y1="${r(yDim + tick)}" x2="${r(px(-b / 2) + tick)}" y2="${r(yDim - tick)}"/>`;
    g += `<line x1="${r(px(b / 2) - tick)}" y1="${r(yDim + tick)}" x2="${r(px(b / 2) + tick)}" y2="${r(yDim - tick)}"/>`;
    g += `</g>`;
    g += `<text x="${r((px(-b / 2) + px(b / 2)) / 2)}" y="${r(yDim + 4 * o.u)}" ` +
         `text-anchor="middle" font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.text}">` +
         `b = ${esc(fmt(b, 0))} mm${state?.sectionType === 'slab' ? ' (per metre)' : ''}</text>`;

    // Høyde, til venstre
    const xDim = px(-b / 2) - off;
    let g2 = `<g data-role="dims" stroke="${c.dim}" stroke-width="${r(sw)}" fill="none">`;
    g2 += `<line x1="${r(px(-b / 2))}" y1="${r(py(h / 2))}" x2="${r(xDim - tick)}" y2="${r(py(h / 2))}"/>`;
    g2 += `<line x1="${r(px(-b / 2))}" y1="${r(py(-h / 2))}" x2="${r(xDim - tick)}" y2="${r(py(-h / 2))}"/>`;
    g2 += `<line x1="${r(xDim)}" y1="${r(py(h / 2))}" x2="${r(xDim)}" y2="${r(py(-h / 2))}"/>`;
    g2 += `<line x1="${r(xDim - tick)}" y1="${r(py(h / 2) + tick)}" x2="${r(xDim + tick)}" y2="${r(py(h / 2) - tick)}"/>`;
    g2 += `<line x1="${r(xDim - tick)}" y1="${r(py(-h / 2) + tick)}" x2="${r(xDim + tick)}" y2="${r(py(-h / 2) - tick)}"/>`;
    g2 += `</g>`;
    const my = (py(h / 2) + py(-h / 2)) / 2;
    g2 += `<text x="${r(xDim - 1.5 * o.u)}" y="${r(my)}" text-anchor="middle" ` +
          `transform="rotate(-90 ${r(xDim - 1.5 * o.u)} ${r(my)})" ` +
          `font-family="${FONT}" font-size="${r(fsDim)}" fill="${c.text}">` +
          `h = ${esc(fmt(h, 0))} mm</text>`;

    parts.push(g + g2);
  }

  /* --- Merkelapper --------------------------------------------------- */
  if (o.showLabels) {
    let g = `<g data-role="labels">`;
    const xEnd = px(b / 2);
    // SAMME `LABEL_GAP` som `labelZone()` reserverte plass etter. Teksten skal
    // starte der marginregnestykket sa at den skulle starte.
    const xText = xEnd + LABEL_GAP * o.u;
    for (const { layer, bars: pos } of drawn) {
      if (!pos.length) continue;
      const z = pos.reduce((a, p) => a + (Number(p.z) || 0), 0) / pos.length;
      const yRight = Math.max(...pos.map((p) => Number(p.y) || 0));
      const lines = layerLabelLines(layer);
      g += `<line x1="${r(px(yRight))}" y1="${r(py(z))}" x2="${r(xText - 1 * o.u)}" y2="${r(py(z))}" ` +
           `stroke="${c.dim}" stroke-width="${r(sw)}" stroke-dasharray="${r(1.2 * o.u)} ${r(1.2 * o.u)}"/>`;
      g += `<text x="${r(xText)}" y="${r(py(z) + fsLabel * 0.35)}" font-family="${FONT}" ` +
           // `o.fs` OGSÅ her. `labelZone()` reserverer bredden med den, så
           // uten den ville sonen vært reservert for en stor skrift og teksten
           // satt med en liten — samme tall, to steder, og det ene glemt.
           // MÅLT da nettopp det skjedde: «dc = 57 mm» ble stående på 3,79 px
           // mens måltallene rundt gikk til 10.
           `font-size="${r(lines[0].size * o.u * fs)}" fill="${c.text}">${esc(lines[0].text)}</text>`;
      g += `<text x="${r(xText)}" y="${r(py(z) + fsLabel * 0.35 + fsDim * 1.25)}" font-family="${FONT}" ` +
           `font-size="${r(lines[1].size * o.u * fs)}" fill="${c.dim}">${esc(lines[1].text)}</text>`;
    }
    parts.push(g + `</g>`);
  }

  const widthAttr = o.unit === 'px' ? `${r(o.width)}px` : `${r(o.width)}mm`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" ` +
         `viewBox="0 0 ${r(paperW)} ${r(paperH)}" role="img" ` +
         `aria-label="Cross-section ${esc(fmt(b, 0))} x ${esc(fmt(h, 0))} mm">` +
         parts.join('') + `</svg>`;
}

/**
 * Merkelappteksten for ett lag. Bjelke og plate beskrives med hver sin
 * bransjevante notasjon — `3Ø20` og `Ø12 c/c 113` — fordi det er slik laget
 * legges inn i UI-et (§7), og en figur som bruker andre ord enn skjemaet
 * tvinger leseren til å oversette.
 */
export function layerLabel(layer) {
  const dia = Number(layer?.dia) || 0;
  if (layer?.mode === 'spacing') {
    return `Ø${fmt(dia, 0)} c/c ${fmt(Number(layer?.spacing) || 0, 0)}`;
  }
  return `${fmt(Number(layer?.count) || 0, 0)}Ø${fmt(dia, 0)}`;
}
