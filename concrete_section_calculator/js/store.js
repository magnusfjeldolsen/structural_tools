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
import { createCombo, createLayer, createStirrup, recomputeAutoDc, stackedDc } from './rebar.js';
import { allowedAnalyses, SLAB_WIDTH } from './section.js';

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
 * `suggestedDc` sitt: cover + stirrup_dia + dia/2.
 */
const DEFAULT_COVER = 35;
const DEFAULT_STIRRUP_DIA = 12;

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
    stirrup_dia: DEFAULT_STIRRUP_DIA,
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
    combos: [{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0 }],
    activeCombo: 'C1',
    analysis: 'bending',
    // Skjær (endringsrunde 4 §3.4). Tom `stirrups`-liste = ingen
    // skjærarmering ⇒ V_Rd,c-veien — standard for både plate og en fersk
    // bjelke, helt til brukeren legger inn bøyler. `strut_angle_deg`, IKKE
    // `theta`: det navnet betyr bøyeretning i radianer overalt ellers i denne
    // kodebasen, og en strøket 45 ville lest som feltmoment uten feilmelding.
    //
    // `stirrups[0].dia` og `stirrup_dia` over er SAMME fysiske bøyle og holdes
    // like av `syncStirrupDia` — se den. Lista forblir en LISTE selv om UI-et
    // i v1 bare tilbyr én rad: veikartet lover flere soner, og radformen skal
    // ikke låses til nøyaktig én.
    shear: { strut_angle_deg: 45, z_factor: 0.9, stirrups: [] },
    // Det finnes BEVISST ingen `options.integrator`: marin er hardkodet i
    // `payload.js`, og `fiber` er kuttet med begrunnelse i plan §1.2.
    options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
    doc: { project: '', title: '', author: '', date: '', note: '' },
    result: null,
  };
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
    // `stirrups` klones som ARRAY av nye objekter, av samme grunn som
    // `combos` under: `{ ...s.shear }` ville kopiert selve arrayen ved
    // REFERANSE, og en bøylerad endret utenfra ville mutert tilstanden.
    shear: { ...s.shear, stirrups: (s.shear?.stirrups || []).map((st) => ({ ...st })) },
    options: { ...s.options },
    doc: { ...s.doc },
    layers: (s.layers || []).map((l) => ({ ...l })),
    combos: (s.combos || []).map((c) => ({ ...c })),
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
 * ÉN fysisk bøyle, ETT tall.
 *
 * `state.stirrup_dia` (feltet «Stirrup Ø» i geometriseksjonen) styrer jernenes
 * plassering og `dc` via `suggestedDc`; `shear.stirrups[0].dia` styrer
 * skjærkapasiteten og bøyletegningen. De var to uavhengige tall, uten noen
 * validering som bandt dem: Ø10 i skjærraden ga jern som fortsatt ble regnet
 * med Ø8, og en bøyle tegnet tvers gjennom armeringen.
 *
 * RETNINGEN ER GITT: finnes det en bøylerad, er DEN fasit, og `stirrup_dia`
 * følger etter. Motsatt vei ville en lastet fil med Ø10-bøyler blitt stille
 * regnet om til Ø8 fordi geometrifeltet lå igjen på standarden. Uten bøyler
 * (plate, eller en bjelke før brukeren har lagt inn skjærarmering) står feltet
 * som før — da finnes det ingen bøyle å være uenig med.
 *
 * Samme énveis-prinsipp som `enforceAnalysis`/`enforceSlabWidth`: retter bare
 * når verdiene FAKTISK spriker, slik at et `setState` som skriver begge deler
 * blir en no-op her og ikke en ny runde med omregning.
 */
function syncStirrupDia(s) {
  const row = (s.shear?.stirrups || [])[0];
  if (!row) return s;
  const dia = Number(row.dia);
  if (!Number.isFinite(dia) || dia === Number(s.stirrup_dia)) return s;
  return { ...s, stirrup_dia: dia };
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
 * Lager en ny store.
 *
 * @param {object} [initial] slås sammen med `defaultState()`
 */
export function createStore(initial) {
  let state = syncStirrupDia(
    enforceSlabWidth(enforceAnalysis(cloneState({ ...defaultState(), ...(initial || {}) })))
  );
  const listeners = new Set();
  // Løpenummer for lag-id-er. Teller ALDRI ned når et lag slettes: «L2» skal
  // ikke kunne bety to ulike lag i samme økt, ellers peker en gammel
  // feilmelding på feil rad.
  let layerSeq = state.layers.length;
  // Samme prinsipp for kombinasjons-id-er, se `nextLayerId`.
  let comboSeq = state.combos.length;
  // …og for bøylerader. `shear.stirrups` er en LISTE fra dag én (veikartet
  // lover flere soner), så id-ene må være unike i hele økten på samme måte.
  let stirrupSeq = (state.shear?.stirrups || []).length;

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
     * Grunn sammenslåing på toppnivå. `cover`/`stirrup_dia` er inndata til
     * `suggestedDc`, så en endring her flytter ethvert `dc_auto`-lag som ikke
     * er eksplisitt låst (§3.4) — ellers viser tegningen en overdekning
     * brukeren nettopp endret, men jernet står igjen på gammel plass.
     */
    setState(patch) {
      state = cloneState({ ...state, ...patch });
      if ('stirrup_dia' in patch) {
        // GJENNOMSKRIVING, ikke en ny verdi ved siden av: geometrifeltet og
        // bøyleradens Ø er samme fysiske bøyle (`syncStirrupDia`). Uten dette
        // ville `syncStirrupDia` under bare kastet brukerens tastetrykk
        // tilbake til radens gamle verdi, og feltet ville sett ut som om det
        // ikke virket.
        state.shear = {
          ...state.shear,
          stirrups: (state.shear.stirrups || []).map((st) => ({ ...st, dia: state.stirrup_dia })),
        };
      }
      state = syncStirrupDia(state);
      if ('cover' in patch || 'stirrup_dia' in patch) {
        applyAutoDc();
      }
      notify();
      return state;
    },

    /**
     * Ny bøylerad. Arver `dia` fra `state.stirrup_dia` (`createStirrup`), så
     * det å legge inn skjærarmering ALDRI flytter jernene av seg selv — den
     * bøyla var det allerede regnet med plass til.
     */
    addStirrup(patch = {}) {
      const row = createStirrup(state, { id: nextStirrupId(), ...patch });
      state = syncStirrupDia(
        cloneState({ ...state, shear: { ...state.shear, stirrups: [...(state.shear.stirrups || []), row] } })
      );
      applyAutoDc();
      notify();
      return state.shear.stirrups.find((st) => st.id === row.id);
    },

    /**
     * Én feltendring i en bøylerad. `dia` på den FØRSTE raden er den samme
     * bøyla som `state.stirrup_dia`, så den flytter ethvert `dc_auto`-lag —
     * det er hele poenget med bindingen (§B).
     */
    updateStirrup(id, values) {
      state = syncStirrupDia(
        cloneState({
          ...state,
          shear: {
            ...state.shear,
            stirrups: (state.shear.stirrups || []).map((st) => (st.id === id ? { ...st, ...values } : st)),
          },
        })
      );
      if ('dia' in values) applyAutoDc();
      notify();
      return state;
    },

    /**
     * Fjerner en bøylerad. Fjernes den SISTE, står `stirrup_dia` igjen med
     * verdien den hadde — det er fortsatt bøyla jernene er plassert etter, og
     * et snitt uten skjærarmering har like fullt en overdekning å regne fra.
     */
    removeStirrup(id) {
      state = syncStirrupDia(
        cloneState({
          ...state,
          shear: { ...state.shear, stirrups: (state.shear.stirrups || []).filter((st) => st.id !== id) },
        })
      );
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
      state = cloneState({ ...state, [group]: { ...state[group], ...values } });
      const beforeDia = state.stirrup_dia;
      // `patch('shear', {stirrups})` er en lovlig, om enn uvanlig, vei inn —
      // og den kan flytte bøylediameteren like reelt som `updateStirrup`.
      // Bindingen skal ikke kunne omgås av hvilken metode kalleren valgte.
      state = syncStirrupDia(state);
      if (group === 'spacing' || state.stirrup_dia !== beforeDia) {
        applyAutoDc();
      }
      notify();
      return state;
    },

    /**
     * Bytter tverrsnittstype. Plata låser `b` til 1000 og regner per meter, så
     * eksisterende `bars`-lag konverteres til `spacing` — et «3Ø20» per meter
     * ville vært en annen armering enn brukeren tegnet.
     */
    setSectionType(type) {
      const isSlab = type === 'slab';
      const next = cloneState(state);
      next.sectionType = isSlab ? 'slab' : 'beam';
      // `dc_auto` MÅ med i feltlista: uten den ville hvert bjelke/plate-bytte
      // stille nullstilt låsen på ethvert lag (plan §3.4).
      if (isSlab) {
        next.geometry = { ...next.geometry, b: SLAB_WIDTH };
        next.layers = next.layers.map((l) =>
          l.mode === 'spacing'
            ? l
            : { id: l.id, mode: 'spacing', dia: l.dia, spacing: 150, edge: l.edge, dc: l.dc, dc_auto: l.dc_auto }
        );
      } else {
        next.layers = next.layers.map((l) =>
          l.mode === 'bars'
            ? l
            : { id: l.id, mode: 'bars', dia: l.dia, count: 3, edge: l.edge, dc: l.dc, dc_auto: l.dc_auto }
        );
      }
      state = next;
      // `suggestedDc` er ikke lenger uavhengig av tverrsnittstypen: plata har ingen
      // bøyle, så `dc = cover + dia/2` der bjelken har `cover + stirrup_dia + dia/2`.
      // Uten denne omregningen blir `dc` stående fra den forrige typen — 12 mm feil
      // med Ø12. Målt: bjelke → plate ga d = 543 der 555 er riktig, og plate → bjelke
      // ga d 12 mm FOR STOR, altså M_Rd og A_s,min overvurdert. Det er den retningen
      // som er på usikker side, og den ville stått til brukeren tilfeldigvis rørte
      // `cover`, en diameter eller la til et lag — `h` og senteravstand utløser den ikke.
      applyAutoDc();
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
      state = enforceAnalysis(cloneState({ ...state, combos: [...state.combos, combo] }));
      notify();
      return combo;
    },

    updateCombo(id, values) {
      state = enforceAnalysis(
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
      state = enforceAnalysis(cloneState({ ...state, combos, activeCombo }));
      notify();
      return state;
    },

    setActiveCombo(id) {
      state = cloneState({ ...state, activeCombo: id });
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
      state = enforceSlabWidth(enforceAnalysis(cloneState({ ...defaultState(), ...next, result: null })));
      // Bøyleradene normaliseres gjennom SAMME fabrikk som `addStirrup` bruker
      // — `serialize.js` gjør dette for `layers` og `combos`, men ikke for
      // `stirrups`, så en fil uten `alpha` ville ellers fått
      // «kun α = 90° støttes. Har α = undefined°» på hver eneste kjøring.
      state.shear = {
        ...state.shear,
        stirrups: (state.shear.stirrups || []).map((st) => createStirrup(state, { ...st })),
      };
      const beforeDia = state.stirrup_dia;
      state = syncStirrupDia(state);
      // Bare når filen faktisk var uenig med seg selv: da er jernene plassert
      // etter en annen bøyle enn den som ligger i skjærraden, og de må flytte
      // seg. Ellers røres ikke `dc` — en lastet fil skal runde tilbake til
      // NØYAKTIG samme tilstand.
      if (state.stirrup_dia !== beforeDia) applyAutoDc();
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
      layerSeq = Math.max(layerSeq, state.layers.length);
      comboSeq = Math.max(comboSeq, state.combos.length);
      stirrupSeq = Math.max(stirrupSeq, state.shear.stirrups.length);
      notify();
      return state;
    },
  };

  return store;
}
