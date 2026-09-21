/**
 * store.js — tilstanden (plan §4.1) med subscribe/notify.
 *
 * HVORFOR EN STORE OG IKKE BARE ET OBJEKT
 * Tre ting skal reagere på hver eneste endring: tverrsnittstegningen (som
 * oppdateres LIVE uten motor, plan §7), de avledede gråtallene i
 * armeringstabellen, og «Beregn»-knappens tilstand. Uten ett varslingspunkt
 * måtte hver av dem kalles for hånd fra hvert felt, og den som ble glemt ville
 * bare tegnet noe gammelt — uten feilmelding.
 *
 * INVARIANTEN SOM BESKYTTES HER
 * Tilstanden er FLAT og serialiserbar (bare tall, strenger, lister). Ingen
 * DOM-noder, ingen funksjoner, ingen klasser. Det er det som gjør at
 * `payload.js` kan være en ren funksjon av `state`, og at `setInputs`/
 * `getInputs` i arbeidsflyt-API-et (plan §9) kan være en ren kopi.
 *
 * `state.result` er det ENESTE feltet motoren skriver til. Alt annet eies av
 * brukeren.
 *
 * Lagring/serialisering til localStorage er bevisst KUTTET (plan §1.2) — ingen
 * akseptkriterium, ingen UI-affordanse. Ikke legg det inn «mens du er i gang».
 *
 * DOM-fri og ren (plan §2.3 punkt 2): ingen `document`, ingen `window`,
 * ingen `localStorage`.
 */

import { SCHEMA_VERSION } from './meta.js';
import {
  createCombo, createLayer, createStirrup, DEFAULT_STIRRUP_DIA,
  COMBO_TYPES, recomputeAutoDc, stackedDc, stirrupCoverDia,
  autoComboName,
  isAutoComboName,
} from './rebar.js';
import { allowedAnalyses, SLAB_WIDTH } from './section.js';
import { CEMENT_CLASSES, CREEP_DEFAULTS, EXPOSURE_CLASSES, SLS_DEFAULTS } from './materials.js';

/**
 * «Kjør alle» (endringsrunde 5 §D). Er ALLTID lovlig: den kjører nettopp de
 * analysene `allowedAnalyses` slipper gjennom, så auto-N–M-regelen (§2) kan
 * ikke brytes av å velge den.
 *
 * ⚠ REGELEN BOR EGENTLIG I `section.js:allowedAnalyses`, som er den ENE kilden
 * til hvilke analyser som er lovlige. Den fila eies av en annen arbeidsstrøm
 * denne runden, så unntaket står her og i `ui.js` inntil `'all'` kan legges
 * inn der. Til da vil `serialize.js` ikke kjenne verdien heller — den
 * normaliserer riktignok bare `'bending'`, så en lagret fil runder likevel
 * tilbake uendret.
 */
export const RUN_ALL = 'all';

/*
 * Standardoverdekningen og standard bøylediameter STÅR ETT STED. `dc` for
 * standardlaget sto tidligere som `35 + 8 + 10` — en tredje kopi av de samme
 * tallene, og da bøylediameteren ble endret til 12 mm ble jernene stående
 * igjen på en overdekning ingen bøyle lenger har. Regnestykket er
 * `suggestedDc` sitt: cover + bøylediameter + dia/2.
 */
const DEFAULT_COVER = 35;
// `DEFAULT_STIRRUP_DIA` importeres fra `rebar.js`: bøyla finnes bare ett sted nå,
// og konstanten hører hjemme hos fabrikken som lager raden.

/*
 * Platas standardhøyde. Bjelkens står i `defaultState().geometry.h`, men plata
 * hadde ingen hjemplass i det hele tatt — den ARVET bjelkens 600 ved typebytte,
 * og en 1000×600 «plate» er et dekke ingen har bygget. 200 mm er en svært
 * vanlig dekketykkelse, og det er tykkelsen regresjonsfixturene
 * `payload-slab-1000x200*.json` allerede er målt med, så standarden og
 * regresjonsgrunnlaget kommer i takt.
 *
 * Bredden har ingen konstant her med vilje: den er `SLAB_WIDTH` i `section.js`,
 * som er den ene kilden `sectionWidth` og `enforceSlabWidth` begge leser.
 */
const DEFAULT_SLAB_HEIGHT = 200;

/**
 * Standardbøylerada. Bygges ikke gjennom `createStirrup`, fordi den trenger en
 * `state` som ennå ikke finnes når `defaultState()` kjører — og fordi de to
 * ville vært to kilder til den samme raden. `createStirrup` bruker de samme
 * konstantene.
 */
function defaultStirrup() {
  return { id: 'S1', dia: DEFAULT_STIRRUP_DIA, spacing: 150, legs: 2, fywk: 500, alpha: 90 };
}

/**
 * Standardtilstand. Tallene er norsk praksis: α_cc = 0,85 (NA), γ_c = 1,5,
 * γ_s = 1,15, B500NC med k = 1,08 og ε_uk = 7,5 %.
 *
 * MERK at regresjonsgrunnlaget i plan §3.6 er målt med α_cc = 1,0. Fixturene
 * bærer derfor 1,0, ikke standarden her — det er ikke en uoverensstemmelse,
 * det er to ulike inndatasett.
 */
export function defaultState() {
  return {
    schema: SCHEMA_VERSION,
    sectionType: 'beam',
    geometry: { b: 300, h: 600 },
    concrete: {
      fck: 30,
      gamma_c: 1.5,
      alpha_cc: 0.85,
      law: 'parabolarectangle',
    },
    steel: {
      fyk: 500,
      Es: 200000,
      k: 1.08,
      epsuk: 0.075,
      gamma_eps: 0.9,
      gamma_s: 1.15,
      law: 'elasticperfectlyplastic',
    },
    cover: DEFAULT_COVER,
    cover_side: DEFAULT_COVER,
    // EC2 8.2(2). k1/k2 er NA-parametere (anbefalt 1 og 5); d_g er ikke det,
    // men inngår i samme formel. 16 mm er vanlig, 8/22/32 forekommer.
    spacing: { k1: 1.0, k2: 5.0, d_g: 16 },
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom',
        dc: DEFAULT_COVER + DEFAULT_STIRRUP_DIA + 20 / 2, dc_auto: true },
    ],
    // kN, kNm og kN. TRYKK er NEGATIV N. `M_Ed` er SIGNERT etter
    // `structuralcodes` sin egen konvensjon: sagging er NEGATIV, IKKE norsk
    // praksis (endringsrunde 4 §1). `direction` finnes ikke lenger — retningen
    // ER fortegnet, se `section.js:thetaFor`. `V_Ed` er en STØRRELSE: fortegnet
    // på skjærkraften betyr ingenting for kapasiteten (§4.1c).
    combos: [{ id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
    activeCombo: 'C1',
    analysis: 'bending',
    // Skjær (endringsrunde 4 §3.4). Tom `stirrups`-liste = ingen
    // skjærarmering ⇒ V_Rd,c-veien — standard for både plate og en fersk
    // bjelke, helt til brukeren legger inn bøyler. `strut_angle_deg`, IKKE
    // `theta`: det navnet betyr bøyeretning i radianer overalt ellers i denne
    // kodebasen, og en strøket 45 ville lest som feltmoment uten feilmelding.
    //
    // Bøylediameteren finnes BARE her. Lista forblir en LISTE selv om UI-et
    // i v1 bare tilbyr én rad: veikartet lover flere soner, og radformen skal
    // ikke låses til nøyaktig én.
    // BJELKEN HAR EN BØYLERAD FRA START. EC2 9.2.2 krever
    // minimumsskjærarmering i bjelker, så en bjelke uten bøyler er en tilstand
    // som ikke finnes i virkeligheten — og det var nettopp derfor
    // `stirrup_dia` sto som et eget felt i geometripanelet: for å beskrive en
    // bøyle før raden fantes. Nå finnes raden, og bøyla har ÉN kilde.
    // Plata får ingen rad; `stirrupCoverDia` gir da 0, som er riktig.
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [defaultStirrup()] },
    // Det finnes BEVISST ingen `options.integrator`: marin er hardkodet i
    // `payload.js`, og `fiber` er kuttet med begrunnelse i plan §1.2.
    options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
    // SLS (concrete_section_calculator-sls.md §5). `exposure_class: null` og
    // `w_max_override: null` er BEVISST: uten en valgt klasse finnes ingen
    // anbefalt grense, og vi finner ALDRI på en — en ubesvart kontroll med en
    // grunn er tryggere enn en stille gjetning. `phi_ef = 2,0` er en INNDATA
    // med en fornuftig standard, på linje med `gamma_c`/`alpha_cc` over — ikke
    // en avledning (§5). De tre faktorene er EC2 7.2(2)/(3)/(5).
    // De fire tallene kommer fra `SLS_DEFAULTS` (materials.js) og står ikke
    // skrevet ut her: standarden og gjenopprettingen i `enforceSlsParams`
    // skal ALDRI kunne bli to ulike tall.
    sls: {
      exposure_class: null,
      w_max_override: null,
      // `phi_ef: null` betyr UTLED, ikke «mangler». Tallet kommer av
      // krypinndataene under, gjennom `resolveCreep` (materials.js). Skriver
      // brukeren et eget tall her, vinner det — og en gammel lagret fil, som
      // bærer `phi_ef: 2.0` fra den gang tallet var fast, blir dermed lest som
      // en overstyring på 2,0 og gir NØYAKTIG samme svar som den gjorde da.
      phi_ef: null,
      h0_override: null,
      ...CREEP_DEFAULTS,
      sigma_c_char_factor: SLS_DEFAULTS.sigma_c_char_factor,
      sigma_c_qp_factor: SLS_DEFAULTS.sigma_c_qp_factor,
      sigma_s_char_factor: SLS_DEFAULTS.sigma_s_char_factor,
    },
    doc: { project: '', title: '', author: '', date: '', note: '' },
    /*
     * BJELKEN OG PLATA ER TO UAVHENGIGE SNITT (runde 8 §1).
     *
     * `state.geometry`/`layers`/`shear`/`cover`/`cover_side`
     * beskriver ALLTID det AKTIVE snittet, med nøyaktig samme betydning som
     * før. Det er derfor `payload.js`, `report.js`, `section-draw.js` og de 14
     * rå leserne av `geometry.b`/`geometry.h` ikke måtte røres: de ser fortsatt
     * én geometri. `sectionWidth` er fortsatt den ene porten.
     *
     * Her ligger det INAKTIVE snittet, urørt til brukeren kommer tilbake til
     * det. Før dette var geometrien delt: `setSectionType` satte `b = 1000` på
     * vei inn til plata og rørte den ikke på vei ut, så bjelkens 300 kom aldri
     * tilbake, og høyden lakk begge veier. Lagene ble konvertert destruktivt
     * (målt: 5 jern ble til 3), og bøylene fulgte med over på plata der de
     * ikke hører hjemme og forskjøv platas `dc` med 12 mm.
     *
     * NØYAKTIG ÉN AV DE TRE ER LEVENDE: den typen som er aktiv, står i
     * toppnivåfeltene og har `null` her. To kopier av samme snitt ville vært
     * to kilder til samme tall — den feilformen denne modulen har blitt bitt
     * av i hver eneste runde.
     *
     * Stashet når ALDRI motoren: `payload.js` bygger fra det aktive snittet.
     */
    stash: { beam: null, slab: null },
    result: null,
  };
}

/**
 * Feltene som utgjør ETT tverrsnitt, kopiert ut av (eller inn i) tilstanden.
 * Alt som IKKE står her — materialer, lastkombinasjoner, EC2-parameterne i
 * `spacing`, `analysis`, `options`, `doc` — beskriver oppgaven og ikke snittet,
 * og skal derfor være felles for bjelke og plate. `spacing` er det som er
 * lettest å ta feil på: k1/k2/d_g er NA-parametere for betongen på byggeplassen,
 * ikke en egenskap ved snittformen.
 *
 * Kopiene er DYPE på samme nivåer som `cloneState`, slik at et stashet snitt
 * ikke kan deles med den aktive tilstanden. Deles `layers`-arrayen, ville
 * `applyAutoDc` på det aktive snittet flyttet jernene i det parkerte også.
 *
 * FELT SOM IKKE FINNES, FINNES IKKE ETTERPÅ HELLER. Funksjonen fyller ikke inn
 * standardverdier, og den finner ikke på `cover: undefined` for et stash som
 * mangler `cover`. Gjorde den det, ville `setSectionType` ikke lenger kunne se
 * forskjell på «fila sa ingenting» og «fila sa dette», og et halvt stash fra en
 * håndredigert fil ville blitt gjenopprettet med hull i stedet for standarder.
 * Tilstanden fra `defaultState`/`cloneState` har alltid alle seks, så et snitt
 * VI parkerer blir like fullt komplett.
 *
 * Ukjente felt tas IKKE med: et stash kommer fra en fil, og `fromDocument`
 * renser ikke innmaten i `stash`. Uten silen her ville et fremmed felt blitt
 * spredt rett inn i toppnivåtilstanden ved neste typebytte.
 *
 * Lista over feltene står ETT sted: her. En `SECTION_KEYS`-array ved siden av
 * ville vært en andre kilde til den samme lista, og den som ble glemt ville
 * lekket stille.
 */
function captureSection(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  if (s.geometry) out.geometry = { ...s.geometry };
  if (Array.isArray(s.layers)) out.layers = s.layers.map((l) => ({ ...l }));
  if (s.shear) out.shear = { ...s.shear, stirrups: (s.shear.stirrups || []).map((st) => ({ ...st })) };
  for (const key of ['cover', 'cover_side']) {
    if (key in s) out[key] = s[key];
  }
  return out;
}

/** `stash` med begge halvdelene kopiert — se `captureSection`. */
function cloneStash(stash) {
  const src = stash || {};
  return { beam: captureSection(src.beam), slab: captureSection(src.slab) };
}

/**
 * Et FERSKT snitt av `type`, for første gang brukeren går dit (eller etter at
 * en fil uten stash er lastet). Bjelken ER standardtilstanden; plata er den
 * samme med `SLAB_WIDTH × DEFAULT_SLAB_HEIGHT` og uten bøyler.
 *
 * Laget lages gjennom `createLayer`, ikke skrevet ut for hånd: den fabrikken
 * vet allerede at plata regnes som `Ø c/c s` og bjelken som `antall × Ø`, og
 * den eier platas Ø12 c/c 200. Skrev vi lagene her, ville modulen hatt to
 * steder å lese platas standardarmering fra — og det var nøyaktig den
 * duplikatet `setSectionType` bar på før denne runden.
 *
 * @param {'beam'|'slab'} type
 * @param {object} spacing EC2-parameterne, som er felles og derfor arves
 * @param {string} layerId id fra `nextLayerId()`, se kallstedet
 */
function freshSection(type, spacing, layerId) {
  const d = defaultState();
  // `shell` er nok tilstand til at `createLayer`/`suggestedDc` kan regne `dc`:
  // de leser `sectionType`, `cover` og `shear.stirrups`.
  const shell = {
    sectionType: type,
    geometry: type === 'slab' ? { b: SLAB_WIDTH, h: DEFAULT_SLAB_HEIGHT } : { ...d.geometry },
    // Bjelken har bøyler, plata ikke. Se `defaultState`.
    shear: { ...d.shear, stirrups: type === 'slab' ? [] : [defaultStirrup()] },
    cover: d.cover,
    cover_side: d.cover_side,
    spacing,
  };
  return { ...captureSection(shell), layers: [createLayer(shell, { id: layerId })] };
}

/**
 * Høyeste løpenummer blant id-ene `L1`, `C1`, `S1` … i en liste.
 *
 * Løpenumrene ble tidligere utledet av ANTALL rader. Det holdt så lenge alle
 * lag i økten lå i én liste, men med `stash` finnes det lag i tre lister
 * samtidig (det aktive snittet og de to parkerte), og et antall sier da
 * ingenting om hvilke id-er som er i bruk: en bjelke med L1–L5 parkert og én
 * plate aktiv ville gitt `L2` til neste lag, og «L2» ville betydd to ulike lag
 * i samme økt — nøyaktig det `nextLayerId` er skrevet for å hindre.
 *
 * @param {Array<object>} list
 * @param {string} prefix `'L'`, `'C'` eller `'S'`
 */
function maxSeq(list = [], prefix) {
  let max = 0;
  for (const row of list || []) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(String((row || {}).id ?? ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

/** Alle lag i økten: det aktive snittet og begge de parkerte. */
function allLayers(s = {}) {
  const stash = s.stash || {};
  return [...(s.layers || []), ...((stash.beam || {}).layers || []), ...((stash.slab || {}).layers || [])];
}

/** Alle bøylerader i økten — samme begrunnelse som `allLayers`. */
function allStirrups(s = {}) {
  const stash = s.stash || {};
  const rows = (sec) => ((sec || {}).shear || {}).stirrups || [];
  return [...rows(s), ...rows(stash.beam), ...rows(stash.slab)];
}

/**
 * Grunn klone av tilstanden. Nok, fordi tilstanden er flat og serialiserbar.
 *
 * `combos` MÅ klones som array, ikke spres inn i et objekt. `{ ...s.combos }`
 * ville gjort `[{...}, {...}]` om til `{0: {...}, 1: {...}}` — stille, uten at
 * noe kaster — og det er nøyaktig slik denne feilen så ut før den ble rettet.
 */
function cloneState(s) {
  return {
    ...s,
    geometry: { ...s.geometry },
    concrete: { ...s.concrete },
    steel: { ...s.steel },
    spacing: { ...s.spacing },
    sls: { ...s.sls },
    // `stirrups` klones som ARRAY av nye objekter, av samme grunn som
    // `combos` under: `{ ...s.shear }` ville kopiert selve arrayen ved
    // REFERANSE, og en bøylerad endret utenfra ville mutert tilstanden.
    shear: { ...s.shear, stirrups: (s.shear?.stirrups || []).map((st) => ({ ...st })) },
    options: { ...s.options },
    doc: { ...s.doc },
    layers: (s.layers || []).map((l) => ({ ...l })),
    combos: (s.combos || []).map((c) => ({ ...c })),
    // Det parkerte snittet klones av samme grunn som `layers` over: uten dette
    // ville `{ ...s }` delt lag-arrayen med stashet, og `applyAutoDc` på det
    // aktive snittet ville flyttet jernene i det parkerte med seg — usynlig,
    // helt til brukeren byttet tilbake.
    stash: cloneStash(s.stash),
  };
}

/**
 * Tvinger `analysis` innenfor `allowedAnalyses(state)` (endringsrunde 4 §2,
 * hullet D3 fant). Planen navnga tre «dører» inn til `analysis: 'bending'`
 * med aksialkraft — chippen, tasten `1`, en lagret fil — men velger brukeren
 * «Bending resistance» FØR aksialkraften kommer inn, blir chippen nedtonet
 * ETTERPÅ mens `state.analysis` står urørt på `'bending'`, og `calculate()`
 * kjører den likevel. UI-dører er feil sted å lukke det: REGELEN GJELDER
 * TILSTANDEN, ikke inngangen til den. Kalles derfor etter ALT som kan gjøre
 * `analysis` ulovlig — i praksis alt som rører `combos`
 * (`addCombo`/`updateCombo`/`removeCombo`) og `setInputs` (`replaceState`),
 * som planen feilaktig kalte en bevisst tillatt omgåelse.
 *
 * KUN ÉN VEI: retter bare når `analysis` faktisk ER ulovlig. Går `N_Ed`
 * tilbake til 0 igjen, skal `analysis` IKKE hoppe tilbake til `'bending'` av
 * seg selv — å flytte brukeren to ganger er verre enn å flytte hen én gang.
 * `moment_curvature` er aldri ulovlig (`allowedAnalyses` fjerner bare
 * `'bending'`), så den berøres aldri av denne funksjonen.
 */
function enforceAnalysis(s) {
  if (s.analysis === RUN_ALL) return s;
  return allowedAnalyses(s).includes(s.analysis) ? s : { ...s, analysis: 'nm_domain' };
}

/**
 * Plata er ALLTID 1000 mm bred. `setSectionType` setter den, men `setInputs`
 * (`replaceState`) og et innlastet dokument er egne dører inn i staten, og en
 * plate med `geometry.b = 300` liggende igjen fra en bjelke ga tidligere en
 * stat der `sectionWidth()` sa 1000 til motoren mens `geometry.b` sa 300.
 * Normaliseringen her gjør at et lagret dokument runder tilbake til NØYAKTIG
 * samme stat. Samme énveis-prinsipp som `enforceAnalysis`: retter bare når
 * verdien faktisk er feil.
 */
function enforceSlabWidth(s) {
  if (s.sectionType !== 'slab') return s;
  if (Number(s.geometry?.b) === SLAB_WIDTH) return s;
  return { ...s, geometry: { ...s.geometry, b: SLAB_WIDTH } };
}

/**
 * Plata får ALDRI bøyler. EC2 6.2.3 (V_Rd,s/V_Rd,max) og 9.2.2 (A_sw/s-minimum,
 * s_l,max, s_t,max) er BJELKEregler, og 9.3.2 tillater ikke skjærarmering i
 * plater tynnere enn 200 mm. V_Rd,c etter 6.2.2 gjelder derimot nettopp
 * «members not requiring shear reinforcement», og er gyldig per meter
 * platebredde — derfor fjernes BØYLENE her, ikke skjærberegningen: en tom
 * `stirrups`-liste er signalet motoren allerede bruker for å ta V_Rd,c-veien
 * (`engine.py` sin `governing_mode = 'no_stirrups'`), og `section.shear` skal
 * fortsatt sendes som et objekt — bare med tom liste — se `payload.js`.
 * Samme énveis-prinsipp som `enforceSlabWidth`: retter bare når det faktisk
 * står en bøylerad på en plate.
 */
function enforceSlabStirrups(s) {
  if (s.sectionType !== 'slab') return s;
  if (!(s.shear?.stirrups || []).length) return s;
  return { ...s, shear: { ...s.shear, stirrups: [] } };
}

/**
 * `activeCombo` skal peke på en ULS-rad når det finnes en. Alt UI som viser
 * «resultatet for aktiv rad» (M–N-diagrammet, moment–krumning) er bygget på
 * BRUDDGRENSE-kapasitet og gir ingen mening for en SLS-rad
 * (`characteristic`/`quasi_permanent`). SLS er implementert, men det er en
 * egen vurdering med egne tall: den bor i `result.sls` og har sin egen
 * seksjon i resultatet, ikke i disse to diagrammene.
 *
 * ÉNVEIS, akkurat som `enforceSlabWidth`/`enforceSlabStirrups`: flytter bare
 * når den aktive raden IKKE allerede er `uls`. Finnes det ingen `uls`-rad i
 * det hele tatt, står `activeCombo` URØRT — det er da motorens
 * `no_uls_combination`-feilboks som skal si det, ikke en stille omplassering
 * til en rad som likevel ikke blir kontrollert (planens B1).
 */
/**
 * Ugyldig `type` faller tilbake til `uls`, i ENHVER dør inn i staten.
 *
 * `createCombo` normaliserte, men `updateCombo`, `setState` og `replaceState`
 * gjorde det ikke. Målt: `updateCombo('C2', {type: 'søppel'})` ga `'søppel'`
 * både i staten og i payloaden — og da sa de tre lagene hver sin ting om samme
 * rad: motoren normaliserte til `uls` og satte `checked: true`, `ui.js` leste
 * `type === 'uls'` som false og tonet raden ned med «Not checked», og
 * `<select>`-en viste «ULS» fordi ingen `<option>` matchet.
 *
 * Kjøres FØR `enforceActiveCombo`: den leter etter første `uls`-rad, og en rad
 * med en ugyldig type skal telle som `uls` i den letingen — ikke hoppes over.
 */
/**
 * ET AUTOMATISK NAVN SKAL FØLGE TYPEN.
 *
 * Navnet ble laget av id-en alene (`C3` → «ULS 3»), så en kvasi-permanent rad
 * sto som «ULS 3» — i kombinasjonstabellen, i SLS-kortet («ULS 3
 * Quasi-permanent») og i advarslene som navngir den dimensjonerende raden.
 * Etiketten sa altså det motsatte av radens egen type, på de tre stedene
 * leseren stoler mest på den.
 *
 * ET NAVN BRUKEREN HAR SKREVET RØRES ALDRI. `isAutoComboName` spør om navnet er
 * ett modulen fant på selv — mot ALLE typene, ikke bare mot den raden har nå,
 * for det er nettopp i det øyeblikket typen endres at navnet henger igjen.
 * «Egenvekt + snø» står; «ULS 3» på en rad som akkurat ble kvasi-permanent
 * gjør det ikke.
 *
 * Her, i `normalise`, og ikke i `updateCombo`: en type kommer også inn gjennom
 * `replaceState`, en lastet fil og en delt lenke. Én regel ved alle dørene.
 * Kjøres ETTER `enforceComboTypes`, som er den som gjør en ugyldig type til
 * `uls` — ellers ville navnet blitt satt etter en type som ikke overlever.
 */
function enforceComboNames(s) {
  const combos = (s.combos || []).map((c) => (
    isAutoComboName(c.name, c.id) && c.name !== autoComboName(c.id, c.type)
      ? { ...c, name: autoComboName(c.id, c.type) }
      : c
  ));
  return combos.some((c, i) => c !== s.combos[i]) ? { ...s, combos } : s;
}

function enforceComboTypes(s) {
  const combos = s.combos || [];
  if (combos.every((c) => COMBO_TYPES.includes(c.type))) return s;
  return { ...s, combos: combos.map((c) => (COMBO_TYPES.includes(c.type) ? c : { ...c, type: 'uls' })) };
}

/**
 * Retter `state.sls` (§5) — ÉNVEIS, akkurat som `enforceComboTypes`: bytter
 * bare et felt når det faktisk ER ulovlig, aldri en gjetning der brukeren
 * ikke har lagt inn noe.
 *
 * `exposure_class` som ikke finnes i `EXPOSURE_CLASSES` ⇒ `null` — IKKE en
 * nærmeste-klasse-gjetning. Det er nøyaktig den stille feil-selekteringen
 * §11 advarer mot for XD3, ført videre til hele feltet: en ukjent klasse skal
 * lese som «ikke valgt», ikke som «valgt til noe tilfeldig».
 *
 * `w_max_override` som ikke er et TALL > 0 ⇒ `null` (bruk den avledede
 * grensa). `phi_ef` som ikke er et endelig tall ≥ 0 ⇒ 2,0. De tre faktorene:
 * ikke et endelig tall > 0 ⇒ standardverdien (§5).
 */
function enforceSlsParams(s) {
  const sls = s.sls || {};
  const validClass = EXPOSURE_CLASSES.some((c) => c.value === sls.exposure_class);
  const exposure_class = validClass ? sls.exposure_class : null;

  const overrideNum = Number(sls.w_max_override);
  const w_max_override = Number.isFinite(overrideNum) && overrideNum > 0 ? overrideNum : null;

  // `phi_ef` er en OVERSTYRING nå, ikke en verdi: `null` betyr «utled av
  // krypinndataene». Derfor legges den IKKE tilbake til en standard når den er
  // tom — et tomt felt er brukerens valg, ikke en feil.
  const phiNum = Number(sls.phi_ef);
  const phi_ef = sls.phi_ef === null || sls.phi_ef === undefined || sls.phi_ef === ''
    ? null
    : (Number.isFinite(phiNum) && phiNum >= 0 ? phiNum : null);

  const h0Num = Number(sls.h0_override);
  const h0_override = Number.isFinite(h0Num) && h0Num > 0 ? h0Num : null;

  // Krypinndataene. Alle fire holdes GYLDIGE her, slik at `resolveCreep` aldri
  // møter noe den må avvise: en levetid som ikke er større enn belastnings-
  // alderen ville gitt phi = 0, altså en tilnærmet permanent kontroll uten kryp
  // i det hele tatt — stille.
  const rhNum = Number(sls.RH);
  const RH = Number.isFinite(rhNum) && rhNum > 0 && rhNum < 100 ? rhNum : CREEP_DEFAULTS.RH;
  const t0Num = Number(sls.t0);
  const t0 = Number.isFinite(t0Num) && t0Num > 0 ? t0Num : CREEP_DEFAULTS.t0;
  const tNum = Number(sls.t_life);
  const t_life = Number.isFinite(tNum) && tNum > t0 ? tNum : Math.max(CREEP_DEFAULTS.t_life, t0 + 1);
  const cement = CEMENT_CLASSES.some((c) => c.value === sls.cement)
    ? sls.cement : CREEP_DEFAULTS.cement;

  const fixFactor = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const sigma_c_char_factor = fixFactor(sls.sigma_c_char_factor, SLS_DEFAULTS.sigma_c_char_factor);
  const sigma_c_qp_factor = fixFactor(sls.sigma_c_qp_factor, SLS_DEFAULTS.sigma_c_qp_factor);
  const sigma_s_char_factor = fixFactor(sls.sigma_s_char_factor, SLS_DEFAULTS.sigma_s_char_factor);

  if (
    exposure_class === sls.exposure_class
    && w_max_override === sls.w_max_override
    && phi_ef === sls.phi_ef
    && h0_override === sls.h0_override
    && RH === sls.RH
    && t0 === sls.t0
    && t_life === sls.t_life
    && cement === sls.cement
    && sigma_c_char_factor === sls.sigma_c_char_factor
    && sigma_c_qp_factor === sls.sigma_c_qp_factor
    && sigma_s_char_factor === sls.sigma_s_char_factor
  ) {
    return s;
  }
  return {
    ...s,
    sls: {
      ...sls,
      exposure_class,
      w_max_override,
      phi_ef,
      h0_override,
      RH,
      t0,
      t_life,
      cement,
      sigma_c_char_factor,
      sigma_c_qp_factor,
      sigma_s_char_factor,
    },
  };
}

function enforceActiveCombo(s) {
  const active = (s.combos || []).find((c) => c.id === s.activeCombo);
  if (active && active.type === 'uls') return s;
  const firstUls = (s.combos || []).find((c) => c.type === 'uls');
  if (!firstUls || firstUls.id === s.activeCombo) return s;
  return { ...s, activeCombo: firstUls.id };
}

/**
 * Lager en ny store.
 *
 * @param {object} [initial] slås sammen med `defaultState()`
 */
/**
 * ALLE INVARIANTENE, ÉN GANG, I FAST REKKEFØLGE.
 *
 * ⚠ HVER MUTERENDE METODE SKAL KALLE DENNE. Det var ikke slik før: hver dør
 * plukket sitt eget utvalg av enforcere, og da ble det som alltid blir av en
 * håndholdt liste — tre av dørene gikk klar av noe. MÅLT:
 *
 *   setState({sectionType: 'slab'})      → geometry.b = 300, sectionWidth() = 1000
 *   patch('geometry', {b: 300}) på plate → geometry.b = 300, sectionWidth() = 1000
 *
 * Den første er ORDRETT tilstanden `enforceSlabWidth` sin egen doc-kommentar
 * beskriver som umulig. Og den er forutsetningen figurfeilen trengte for å bli
 * synlig: `section-draw.js` leste `geometry.b` rått og tegnet jernene på
 * ±105 mm der motoren regnet ±455.
 *
 * Rekkefølgen er den `replaceState` allerede hadde, og den er ikke tilfeldig:
 * `enforceAnalysis` først (den leser `combos`), `enforceSlsParams` sist (den
 * leser `concrete`). Alle seks er ENVEIS og IDEMPOTENTE — de returnerer `s`
 * uendret når det ikke er noe å rette — så det koster ingenting å kjøre alle
 * seks hver gang, og det er nettopp derfor det er trygt å gjøre det.
 */
function normalise(s) {
  return enforceSlsParams(enforceActiveCombo(enforceComboNames(enforceComboTypes(
    enforceSlabStirrups(enforceSlabWidth(enforceAnalysis(s)))
  ))));
}

export function createStore(initial) {
  let state = normalise(cloneState({ ...defaultState(), ...(initial || {}) }));
  const listeners = new Set();
  // Løpenummer for lag-id-er. Teller ALDRI ned når et lag slettes: «L2» skal
  // ikke kunne bety to ulike lag i samme økt, ellers peker en gammel
  // feilmelding på feil rad. Utledes av ID-ENE og ikke av antallet (`maxSeq`),
  // fordi lagene nå ligger i tre lister samtidig — det aktive snittet og de to
  // parkerte.
  let layerSeq = maxSeq(allLayers(state), 'L');
  // Samme prinsipp for kombinasjons-id-er, se `nextLayerId`. Kombinasjonene er
  // felles for begge snittene og finnes derfor bare i én liste.
  let comboSeq = maxSeq(state.combos, 'C');
  // …og for bøylerader. `shear.stirrups` er en LISTE fra dag én (veikartet
  // lover flere soner), så id-ene må være unike i hele økten på samme måte.
  let stirrupSeq = maxSeq(allStirrups(state), 'S');

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function nextLayerId() {
    layerSeq += 1;
    return `L${layerSeq}`;
  }

  function nextComboId() {
    comboSeq += 1;
    return `C${comboSeq}`;
  }

  function nextStirrupId() {
    stirrupSeq += 1;
    return `S${stirrupSeq}`;
  }

  /** Kjører `recomputeAutoDc` og skriver resultatet inn i `state.layers`. */
  function applyAutoDc() {
    state = { ...state, layers: recomputeAutoDc(state) };
  }

  const store = {
    getState() {
      return state;
    },

    /** Kopi ut — brukes av `getInputs()` i arbeidsflyt-API-et (plan §9). */
    snapshot() {
      return cloneState(state);
    },

    /**
     * @param {(s: object) => void} fn kalles ved hver endring
     * @returns {() => void} avmelding
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    /**
     * Grunn sammenslåing på toppnivå. `cover` er inndata til `suggestedDc`, så
     * en endring her flytter ethvert `dc_auto`-lag som ikke er eksplisitt låst
     * (§3.4) — ellers viser tegningen en overdekning brukeren nettopp endret,
     * mens jernet står igjen på gammel plass.
     *
     * Bøylediameteren står IKKE lenger her: den finnes bare i `shear.stirrups`,
     * og `updateStirrup` er veien inn.
     */
    setState(patch) {
      // `normalise` og ikke et utvalg: dette var én av de tre dørene som gikk
      // klar av `enforceSlabWidth`, og `setState({sectionType:'slab'})` lot
      // `geometry.b` stå på 300 mens `sectionWidth()` sa 1000.
      state = normalise(cloneState({ ...state, ...patch }));
      if ('cover' in patch) applyAutoDc();
      notify();
      return state;
    },

    /**
     * Ny bøylerad. Bøyla er nå ENESTE kilde til diameteren, så en ny rad kan
     * flytte jernene: `stirrupCoverDia` tar den STØRSTE diameteren blant radene,
     * og `applyAutoDc` regner `dc` på nytt.
     */
    addStirrup(patch = {}) {
      // Plata får aldri bøyler (§A1) — knappen er skjult i UI-et (ui.js), men
      // dette er sperra for programmatiske kall (workflow-API, tester).
      // Eneste kallsted (`setupShear` i ui.js) ignorerer `null`.
      if (state.sectionType === 'slab') return null;
      const row = createStirrup(state, { id: nextStirrupId(), ...patch });
      state = cloneState({
        ...state,
        shear: { ...state.shear, stirrups: [...(state.shear.stirrups || []), row] },
      });
      applyAutoDc();
      notify();
      return state.shear.stirrups.find((st) => st.id === row.id);
    },

    /**
     * Én feltendring i en bøylerad. `dia` flytter ethvert `dc_auto`-lag: bøyla
     * ligger fysisk mellom overdekningen og hovedarmeringen, og raden er
     * eneste kilde til diameteren.
     */
    updateStirrup(id, values) {
      state = cloneState({
        ...state,
        shear: {
          ...state.shear,
          stirrups: (state.shear.stirrups || []).map((st) => (st.id === id ? { ...st, ...values } : st)),
        },
      });
      if ('dia' in values) applyAutoDc();
      notify();
      return state;
    },

    /**
     * Fjerner en bøylerad. Fjernes den SISTE, faller `stirrupCoverDia` til 0 og
     * jernene flytter seg UT til `cover + Ø/2`. Det er riktig: uten bøyle er
     * det ingen bøyle å ligge innenfor. At tallet synlig endrer seg er dessuten
     * den ærlige tilbakemeldingen — før sto en usynlig diameter igjen og spiste
     * høyde ingen kunne se.
     */
    removeStirrup(id) {
      state = cloneState({
        ...state,
        shear: { ...state.shear, stirrups: (state.shear.stirrups || []).filter((st) => st.id !== id) },
      });
      applyAutoDc();
      notify();
      return state;
    },

    /**
     * Sammenslåing inne i én undergruppe (`geometry`, `concrete`, `steel`,
     * `spacing`, `options`, `doc`). Skrevet ut som egen metode fordi
     * `setState({concrete: {...}})` ellers ville slettet feltene man ikke nevnte.
     *
     * `spacing` går ALLTID via `recomputeAutoDc`: k1/k2/d_g styrer plasseringen
     * av ethvert `dc_auto`-lag, så en endring her er identisk i virkning med å
     * endre overdekningen.
     */
    patch(group, values) {
      const beforeDia = stirrupCoverDia(state);
      // `normalise` FØR `applyAutoDc`: `enforceSlabStirrups` kan fjerne en
      // bøylerad, og `dc` regnet med en bøylediameter som ikke finnes lenger ga
      // målt d = 543 der 555 er riktig (runde 8). `patch('geometry', {b})` på en
      // plate gikk dessuten klar av `enforceSlabWidth` helt til runde 11.
      state = normalise(cloneState({ ...state, [group]: { ...state[group], ...values } }));
      // `patch('shear', {stirrups})` er en lovlig, om enn uvanlig, vei inn, og
      // den kan flytte bøylediameteren like reelt som `updateStirrup`.
      // Sammenlikningen er på den AVLEDEDE diameteren, ikke på et felt: da kan
      // ingen ny vei inn i `shear` gå klar av omregningen.
      if (group === 'spacing' || stirrupCoverDia(state) !== beforeDia) {
        applyAutoDc();
      }
      notify();
      return state;
    },

    /**
     * Bytter tverrsnittstype: PARKERER snittet du forlater og PLUKKER OPP det
     * du går til, helt (geometri, lag, bøyler, overdekninger). Se `stash` i
     * `defaultState` for hvorfor.
     *
     * Lagene konverteres IKKE lenger mellom `bars` og `spacing`. Konverteringen
     * var destruktiv i begge retninger — «3Ø20» ble «Ø20 c/c 150» og tilbake
     * igjen ble det «3Ø20» uansett hva brukeren hadde skrevet (målt: 5 jern ble
     * til 3) — og den var uansett feil premiss: en plate er ikke bjelken din
     * regnet om, det er et annet snitt. Går du til en type du aldri har vært
     * på, får du et FERSKT snitt (`freshSection`), ikke en oversettelse.
     */
    setSectionType(type) {
      const to = type === 'slab' ? 'slab' : 'beam';
      const from = state.sectionType === 'slab' ? 'slab' : 'beam';
      // Samme type som nå: ingenting å parkere og ingenting å hente. Den
      // gamle koden kjørte `applyAutoDc` + `notify` også her, men det var en
      // bivirkning av at den alltid konverterte lagene — ikke noe noen kaller
      // seg avhengig av: `renderSegment('#type-seg', …)` i `ui.js` returnerer
      // selv når verdien er uendret, og kaller aldri hit.
      if (to === from) {
        // MEN NORMALISER FOERST. `from` klemmes til 'beam' for alt som ikke er
        // 'slab', saa en fil med "sectionType": "Slab" (stor S — `fromDocument`
        // validerer ikke strengen) ville blitt staaende paa "Slab" for alltid:
        // brukeren trykker «Beam», `to === from === 'beam'`, og verdien settes
        // aldri. Alt leser `=== 'slab'`, saa snittet OPPFOERER seg som en bjelke
        // — men typevelgeren viser ingen valgt knapp, og verdien setter seg fast.
        // Den gamle koden normaliserte den som en bivirkning av at den alltid
        // skrev `sectionType`.
        if (state.sectionType !== to) {
          state = cloneState({ ...state, sectionType: to });
          notify();
        }
        return state;
      }

      const parked = captureSection(state);
      const stashed = (state.stash || {})[to];
      // Et stash kan være HALVT — det kommer fra en fil, og `fromDocument`
      // erstatter `stash` i sin helhet uten å normalisere innmaten. Feltene det
      // mangler skal komme fra et FERSKT snitt av riktig type, ikke bli stående
      // igjen fra typen du forlot: et platestash uten `layers` ville ellers
      // beholdt bjelkens `bars`-lag, og «3Ø20» ville blitt regnet som armering
      // PER METER — en A_s som er feil med en faktor, helt uten feilmelding.
      //
      // `nextLayerId()` kalles bare når det faktisk lages et lag, fordi
      // løpenummeret aldri teller ned.
      const blank = freshSection(to, state.spacing, Array.isArray((stashed || {}).layers) ? '' : nextLayerId());
      const restored = { ...blank, ...stashed };
      state = cloneState({
        ...state,
        ...restored,
        sectionType: to,
        // Snittet vi plukker opp SKAL nulles her: det lever nå i toppnivå-
        // feltene. Lot vi kopien ligge, ville modulen hatt to kilder til samme
        // geometri, og den som ikke ble oppdatert ville dukket opp ved neste
        // bytte som en stille tilbakerulling av brukerens arbeid.
        stash: { ...(state.stash || {}), [from]: parked, [to]: null },
      });
      // LAGENE NORMALISERES FØR BØYLENE, og av nøyaktig samme grunn.
      //
      // `{ ...blank, ...stashed }` slipper lagene RÅTT inn i toppnivåtilstanden.
      // Alle andre dører inn i `layers` går gjennom `createLayer`: `serialize.js`
      // gjør det for en lastet fil, og `addLayer` for et nytt lag. Denne gjorde
      // det ikke, og et stash kan komme fra en lagret fil som er håndredigert
      // eller skrevet av en eldre versjon.
      //
      // MÅLT: et platestash-lag uten `mode` — Ø12 c/c 200, altså 565 mm²/m —
      // nådde motoren som ETT jern med `area: null`, uten en eneste advarsel.
      // `validate()` sa ingenting, fordi den leser felt den forventer finnes.
      state.layers = (state.layers || []).map((l) => createLayer(state, { ...l }));
      // Bøyleradene normaliseres gjennom samme fabrikk som `addStirrup` og
      // `replaceState` bruker: et stash kan ha kommet inn med en lagret fil, og
      // en rad uten `alpha` ville gitt «kun α = 90° støttes. Har α = undefined°»
      // på hver eneste kjøring.
      state.shear = {
        ...state.shear,
        stirrups: (state.shear.stirrups || []).map((st) => createStirrup(state, { ...st })),
      };
      // INVARIANTENE KJØRES ETTER GJENOPPRETTING. Stashet er tilstand, ikke en
      // omgåelse av reglene: en plate er 1000 mm bred uansett hvilken dør den
      // kom inn gjennom.
      state = normalise(state);
      // `suggestedDc` er ikke uavhengig av tverrsnittstypen: plata har ingen
      // bøyle, så `dc = cover + dia/2` der bjelken har `cover + Ø_bøyle + dia/2`.
      // Uten denne omregningen blir `dc` stående fra den forrige typen — 12 mm feil
      // med Ø12. Målt: bjelke → plate ga d = 543 der 555 er riktig, og plate → bjelke
      // ga d 12 mm FOR STOR, altså M_Rd og A_s,min overvurdert. Det er den retningen
      // som er på usikker side, og den ville stått til brukeren tilfeldigvis rørte
      // `cover`, en diameter eller la til et lag — `h` og senteravstand utløser den ikke.
      //
      // Den er FORTSATT nødvendig med stash: et gjenopprettet snitt har riktig
      // `dc` allerede, men `spacing` (k1/k2/d_g) er FELLES, og er den endret mens
      // du var på den andre typen, skal jernene flytte seg med den.
      applyAutoDc();
      layerSeq = Math.max(layerSeq, maxSeq(allLayers(state), 'L'));
      stirrupSeq = Math.max(stirrupSeq, maxSeq(allStirrups(state), 'S'));
      notify();
      return state;
    },

    /** Nytt lag stables UTENFOR det ytterste på samme kant (EC2 8.2, §3.4). */
    addLayer(patch = {}) {
      const created = createLayer(state, { id: nextLayerId(), ...patch });
      const layer = { ...created, dc: stackedDc(state, created.edge, created.dia), dc_auto: true };
      state = cloneState({ ...state, layers: [...state.layers, layer] });
      applyAutoDc();
      notify();
      return state.layers.find((l) => l.id === layer.id);
    },

    /**
     * `dia`/`edge` flytter et `dc_auto`-lag (og alt som stables på det).
     * En eksplisitt `dc` i patchen er brukerens egen formulering (§3.1): den
     * låser laget FØRST, så `recomputeAutoDc` ikke overskriver den med det
     * samme.
     */
    updateLayer(id, values) {
      const touchesDc = 'dc' in values;
      state = cloneState({
        ...state,
        layers: state.layers.map((l) => {
          if (l.id !== id) return l;
          const next = { ...l, ...values };
          if (touchesDc) next.dc_auto = false;
          return next;
        }),
      });
      if (touchesDc || 'dia' in values || 'edge' in values || 'dc_auto' in values) {
        applyAutoDc();
      }
      notify();
      return state;
    },

    /**
     * ⧉-knappen. Dupliserer ALT unntatt id-en — der ligger gjentakelsen (plan
     * §7) — MEN kopien får ALLTID `dc_auto: true` og en frisk `dc` fra
     * `stackedDc`, uansett om kilden var låst. En kopi som arvet en låst `dc`
     * ville landet oppå originalen (bestillingens punkt 2).
     */
    duplicateLayer(id) {
      const src = state.layers.find((l) => l.id === id);
      if (!src) return null;
      const copy = {
        ...src,
        id: nextLayerId(),
        dc_auto: true,
        dc: stackedDc(state, src.edge, src.dia),
      };
      const at = state.layers.indexOf(src) + 1;
      const layers = state.layers.slice();
      layers.splice(at, 0, copy);
      state = cloneState({ ...state, layers });
      notify();
      return copy;
    },

    removeLayer(id) {
      state = cloneState({ ...state, layers: state.layers.filter((l) => l.id !== id) });
      applyAutoDc();
      notify();
      return state;
    },

    /** Motorens svar (plan §5.2). Eneste feltet motoren eier. */
    setResult(result) {
      state = { ...state, result };
      notify();
      return state;
    },

    /** Ny rad i lastkombinasjonstabellen. Retningen arves fra `createCombo`. */
    addCombo(patch = {}) {
      const combo = createCombo(state, { id: nextComboId(), ...patch });
      state = normalise(cloneState({ ...state, combos: [...state.combos, combo] }));
      notify();
      return combo;
    },

    updateCombo(id, values) {
      state = normalise(
          cloneState({
            ...state,
            combos: state.combos.map((c) => (c.id === id ? { ...c, ...values } : c)),
          })
      );
      notify();
      return state;
    },

    /**
     * Den SISTE kombinasjonen kan ikke fjernes — det finnes alltid minst én
     * lastvirkning å regne på. Fjernes den AKTIVE, flytter aktiv til den
     * første gjenværende, ellers ville `activeCombo` pekt på et slettet id.
     */
    removeCombo(id) {
      if (state.combos.length <= 1) return state;
      const combos = state.combos.filter((c) => c.id !== id);
      const activeCombo = state.activeCombo === id ? combos[0].id : state.activeCombo;
      state = normalise(cloneState({ ...state, combos, activeCombo }));
      notify();
      return state;
    },

    setActiveCombo(id) {
      state = cloneState({ ...state, activeCombo: id });
      // STEG 2, B2: `setActiveCombo` var DET ANDRE hullet v5 §2.4 navnga.
      // Klikker brukeren en SLS-rad til aktiv, skal håndhevingen umiddelbart
      // flytte den videre til første ULS-rad — IKKE la den ukontrollerte
      // raden stå som «aktiv» og drive M–N-diagrammet.
      state = normalise(state);
      notify();
      return state;
    },

    /**
     * `setInputs()` i arbeidsflyt-API-et. Nullstiller resultatet: det gjelder
     * gamle tall. Planen (§2) kalte dette en BEVISST tillatt omgåelse av
     * auto-N–M-regelen — det var feil (D3 fant hullet som viste hvorfor): en
     * `M_Rd` ved én aksialkraft er like misvisende uansett hvordan tilstanden
     * kom dit, så `enforceAnalysis` gjelder her akkurat som for combo-endringer.
     */
    replaceState(next) {
      state = normalise(cloneState({ ...defaultState(), ...next, result: null }));
      // Bøyleradene normaliseres gjennom SAMME fabrikk som `addStirrup` bruker
      // — `serialize.js` gjør dette for `layers` og `combos`, men ikke for
      // `stirrups`, så en fil uten `alpha` ville ellers fått
      // «kun α = 90° støttes. Har α = undefined°» på hver eneste kjøring.
      state.shear = {
        ...state.shear,
        stirrups: (state.shear.stirrups || []).map((st) => createStirrup(state, { ...st })),
      };
      // En lastet fil skal runde tilbake til NØYAKTIG samme tilstand, så `dc`
      // røres ikke her. Bøyla er eneste kilde til diameteren nå, så fila kan
      // ikke lenger være uenig med seg selv om hvilken bøyle jernene ligger
      // etter — den uenigheten var hele grunnen til at dette sto her.
      // Et lag med `dc_auto: true` MEN uten `dc` har ingen plassering i det hele
      // tatt. `layerCentroidZ` gir da `null`, tegningen forkaster jernet fra
      // snappingen OG plasserer det i `py(z || 0)` — altså midt i tverrsnittet,
      // stille. Målt: seks jern havnet i midthøyden i stedet for i under- og
      // overkant. En lagret fil har alltid `dc`, så dette rører ikke rundturen;
      // det er `setInputs()` fra et arbeidsflyt-kall som kan komme uten.
      // `l.dc == null` FØRST: `Number(null)` er 0, og 0 er et endelig tall, så
      // `Number.isFinite(Number(l.dc))` alene sier «har en verdi» om et lag som
      // ikke har noen.
      if (state.layers.some((l) => l.dc_auto
        && (l.dc == null || !Number.isFinite(Number(l.dc))))) {
        applyAutoDc();
      }
      // Løpenumrene leses av ID-ENE, og lagene/bøylene TELLES OGSÅ I STASHET:
      // en fil med bjelken L1–L5 parkert og én plate aktiv ville ellers gitt
      // `L2` til neste lag, og «L2» ville betydd to ulike lag i samme økt.
      layerSeq = Math.max(layerSeq, maxSeq(allLayers(state), 'L'));
      comboSeq = Math.max(comboSeq, maxSeq(state.combos, 'C'));
      stirrupSeq = Math.max(stirrupSeq, maxSeq(allStirrups(state), 'S'));
      notify();
      return state;
    },
  };

  return store;
}
