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
import { createCombo, createLayer, recomputeAutoDc, stackedDc } from './rebar.js';
import { allowedAnalyses, SLAB_WIDTH } from './section.js';

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
    cover: 35,
    stirrup_dia: 8,
    cover_side: 35,
    // EC2 8.2(2). k1/k2 er NA-parametere (anbefalt 1 og 5); d_g er ikke det,
    // men inngår i samme formel. 16 mm er vanlig, 8/22/32 forekommer.
    spacing: { k1: 1.0, k2: 5.0, d_g: 16 },
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 35 + 8 + 10, dc_auto: true },
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
 * Lager en ny store.
 *
 * @param {object} [initial] slås sammen med `defaultState()`
 */
export function createStore(initial) {
  let state = enforceSlabWidth(enforceAnalysis(cloneState({ ...defaultState(), ...(initial || {}) })));
  const listeners = new Set();
  // Løpenummer for lag-id-er. Teller ALDRI ned når et lag slettes: «L2» skal
  // ikke kunne bety to ulike lag i samme økt, ellers peker en gammel
  // feilmelding på feil rad.
  let layerSeq = state.layers.length;
  // Samme prinsipp for kombinasjons-id-er, se `nextLayerId`.
  let comboSeq = state.combos.length;

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
      if ('cover' in patch || 'stirrup_dia' in patch) {
        applyAutoDc();
      }
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
      if (group === 'spacing') {
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
      layerSeq = Math.max(layerSeq, state.layers.length);
      comboSeq = Math.max(comboSeq, state.combos.length);
      notify();
      return state;
    },
  };

  return store;
}
