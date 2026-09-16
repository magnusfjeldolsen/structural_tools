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
import { createLayer, suggestedDc } from './rebar.js';

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
    layers: [
      { id: 'L1', mode: 'bars', dia: 20, count: 3, edge: 'bottom', dc: 35 + 8 + 10 },
    ],
    // kN og kNm. TRYKK er NEGATIV N. `M_Ed` er en STØRRELSE i retningen
    // `direction` angir — det finnes ingen fortegn å tolke her.
    loads: { N_Ed: 0, M_Ed: 0 },
    direction: 'sagging',
    analysis: 'bending',
    // Det finnes BEVISST ingen `options.integrator`: marin er hardkodet i
    // `payload.js`, og `fiber` er kuttet med begrunnelse i plan §1.2.
    options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
    doc: { project: '', title: '', author: '', date: '', note: '' },
    result: null,
  };
}

/** Grunn klone av tilstanden. Nok, fordi tilstanden er flat og serialiserbar. */
function cloneState(s) {
  return {
    ...s,
    geometry: { ...s.geometry },
    concrete: { ...s.concrete },
    steel: { ...s.steel },
    loads: { ...s.loads },
    options: { ...s.options },
    doc: { ...s.doc },
    layers: (s.layers || []).map((l) => ({ ...l })),
  };
}

/**
 * Lager en ny store.
 *
 * @param {object} [initial] slås sammen med `defaultState()`
 */
export function createStore(initial) {
  let state = cloneState({ ...defaultState(), ...(initial || {}) });
  const listeners = new Set();
  // Løpenummer for lag-id-er. Teller ALDRI ned når et lag slettes: «L2» skal
  // ikke kunne bety to ulike lag i samme økt, ellers peker en gammel
  // feilmelding på feil rad.
  let layerSeq = state.layers.length;

  function notify() {
    for (const fn of listeners) fn(state);
  }

  function nextLayerId() {
    layerSeq += 1;
    return `L${layerSeq}`;
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

    /** Grunn sammenslåing på toppnivå. */
    setState(patch) {
      state = cloneState({ ...state, ...patch });
      notify();
      return state;
    },

    /**
     * Sammenslåing inne i én undergruppe (`geometry`, `concrete`, `steel`,
     * `loads`, `options`, `doc`). Skrevet ut som egen metode fordi
     * `setState({concrete: {...}})` ellers ville slettet feltene man ikke nevnte.
     */
    patch(group, values) {
      state = cloneState({ ...state, [group]: { ...state[group], ...values } });
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
      if (isSlab) {
        next.geometry = { ...next.geometry, b: 1000 };
        next.layers = next.layers.map((l) =>
          l.mode === 'spacing' ? l : { id: l.id, mode: 'spacing', dia: l.dia, spacing: 150, edge: l.edge, dc: l.dc }
        );
      } else {
        next.layers = next.layers.map((l) =>
          l.mode === 'bars' ? l : { id: l.id, mode: 'bars', dia: l.dia, count: 3, edge: l.edge, dc: l.dc }
        );
      }
      state = next;
      notify();
      return state;
    },

    addLayer(patch = {}) {
      const layer = createLayer(state, { id: nextLayerId(), ...patch });
      state = cloneState({ ...state, layers: [...state.layers, layer] });
      notify();
      return layer;
    },

    updateLayer(id, values) {
      state = cloneState({
        ...state,
        layers: state.layers.map((l) => (l.id === id ? { ...l, ...values } : l)),
      });
      notify();
      return state;
    },

    /** ⧉-knappen. Dupliserer ALT unntatt id-en — der ligger gjentakelsen (plan §7). */
    duplicateLayer(id) {
      const src = state.layers.find((l) => l.id === id);
      if (!src) return null;
      const copy = { ...src, id: nextLayerId() };
      const at = state.layers.indexOf(src) + 1;
      const layers = state.layers.slice();
      layers.splice(at, 0, copy);
      state = cloneState({ ...state, layers });
      notify();
      return copy;
    },

    removeLayer(id) {
      state = cloneState({ ...state, layers: state.layers.filter((l) => l.id !== id) });
      notify();
      return state;
    },

    /**
     * Setter `dc` på nytt fra overdekning og bøylediameter for alle lag.
     * Kalles når `cover` eller `stirrup_dia` endres — ellers står `dc` igjen
     * med gamle tall og tegningen viser en overdekning brukeren nettopp endret.
     */
    resyncCover() {
      state = cloneState({
        ...state,
        layers: state.layers.map((l) => ({ ...l, dc: suggestedDc(state, l.dia) })),
      });
      notify();
      return state;
    },

    /** Motorens svar (plan §5.2). Eneste feltet motoren eier. */
    setResult(result) {
      state = { ...state, result };
      notify();
      return state;
    },

    /** `setInputs()` i arbeidsflyt-API-et. Nullstiller resultatet: det gjelder gamle tall. */
    replaceState(next) {
      state = cloneState({ ...defaultState(), ...next, result: null });
      layerSeq = Math.max(layerSeq, state.layers.length);
      notify();
      return state;
    },
  };

  return store;
}
