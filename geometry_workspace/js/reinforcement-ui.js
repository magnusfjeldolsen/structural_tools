/**
 * reinforcement-ui.js — «Forsterkning»-fanen i høyre panel.
 *
 * To ansvar, holdt fra hverandre:
 *   1. `computeReinforcement()` — broen fra modellen (store + analyse) til den
 *      rene mekanikken i `reinforcement.js`. All enhetsomregning skjer her, ett
 *      sted, slik at panelet aldri regner selv.
 *   2. `ReinforcementPanel` — rendering og hendelser. Panelet regner ingenting.
 *
 * ------------------------------------------------------------------
 * ENHETER — den eneste omregningsplassen i UI-laget
 * ------------------------------------------------------------------
 * Geometrien ligger i arbeidsenheten (mm/cm/m). Mekanikken regnes i N og mm.
 * Derfor skaleres arealegenskapene her, med k = mm per arbeidsenhet:
 *
 *      A   [mm²]  = A_arb  · k²
 *      Sx  [mm³]  = Sx_arb · k³
 *      Ix0 [mm⁴]  = Ix0_arb· k⁴
 *
 * Lastene ligger i kN/kNm og går gjennom `kNtoN`/`kNmToNmm` før de sendes
 * videre. Forankringslengden `L` er i arbeidsenheten og ganges med k.
 * Forbinderdataene er allerede i N/mm/kN (se `interfaces.js`) og røres ikke.
 *
 * ------------------------------------------------------------------
 * HVA SOM IKKE BRUKES
 * ------------------------------------------------------------------
 * `shape.factor` er vektfaktoren for tyngdepunktsfanen og har ingenting her å
 * gjøre — forsterkningsberegningen bruker utelukkende `material.E`. Derfor
 * regnes arealegenskapene på nytt fra `part.multi` i stedet for å bruke
 * `part.props`, som allerede er ganget med `factor`. Overlapp og hull er
 * derimot håndtert av `analyze()`, og det arver vi.
 */

import { multiProps } from './geometry.js';
import { unitInfo, lengthLabel } from './units.js';
import { MATERIALS, materialE, materialByName } from './materials.js';
import {
  sectionEA,
  compareStates,
  axialSplit,
  axialTransfer,
  shearFlow,
  anchorFlow,
  volkersen,
  connectorStiffness,
  connectorCheck,
  kNtoN,
  kNmToNmm,
  NtokN,
} from './reinforcement.js';
import {
  normalizeInterface,
  bondWidthMm,
  lineLength,
  updateInterface,
  updateConnector,
  removeInterface,
  flipGroup,
  INTERFACE_COLOR,
} from './interfaces.js';

/* ------------------------------------------------------------------ *
 * Tallformatering
 *
 * Egne formaterere her i stedet for å importere fra ui.js: ui.js importerer
 * denne fila, og en gjensidig import er noe man ikke skal måtte tenke på når
 * man leser koden.
 * ------------------------------------------------------------------ */

const nf = (dec) =>
  new Intl.NumberFormat('nb-NO', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format;

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

function sup(v) {
  return String(v).split('').map((c) => SUP[c] || c).join('');
}

/** Tierpotens med mantisse, som resten av repoet skriver store tall. */
export function sci(v, digits = 4) {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const exp = Math.floor(Math.log10(Math.abs(v)));
  const mant = v / 10 ** exp;
  return `${nf(digits - 1)(mant)}·10${sup(exp)}`;
}

/** Tall uten enhet. Går over til tierpotens der desimalform blir uleselig. */
export function n(v, dec = 2) {
  if (v === Infinity) return '∞';
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e5 || a < 1e-3) return sci(v, 4);
  return nf(dec)(v);
}

/** Tall MED enhet. Ingen størrelse i denne fanen skal vises uten. */
export function q(v, unit, dec = 2) {
  if (v === Infinity) return `∞ ${unit}`;
  if (!Number.isFinite(v)) return `– ${unit}`;
  return `${n(v, dec)} ${unit}`;
}

function pct(v, dec = 1) {
  if (!Number.isFinite(v)) return '–';
  return `${nf(dec)(v)} %`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ *
 * 1. Broen: modell → mekanikk
 * ------------------------------------------------------------------ */

/**
 * @typedef {Object} RfPart
 * @property {string} id
 * @property {string} name
 * @property {string} color
 * @property {'existing'|'new'} stage
 * @property {number} E      [N/mm²]
 * @property {Object} props  Arealegenskaper i mm, om globalt origo
 * @property {number} EA     [N]
 * @property {boolean} isVoid
 */

/**
 * Regner ut alt «Forsterkning»-fanen viser.
 *
 * @param {Object} state  store.state
 * @param {Object} analysis  fra `analyze()` i geometry.js
 * @returns {Object|null} null hvis det ikke finnes noe å regne på
 */
export function computeReinforcement(state, analysis) {
  if (!state) return null;
  const unit = state.unit || 'mm';
  const k = unitInfo(unit).toMillimetres;
  const k2 = k * k;
  const k3 = k2 * k;
  const k4 = k2 * k2;

  /** @type {RfPart[]} */
  const parts = [];
  for (const p of (analysis && analysis.parts) || []) {
    const shape = p.shape;
    // Vekten her er BARE overlapp-/hullhåndtering, ikke `factor`. Samme regel
    // som analyze() bruker, med factor satt til 1.
    const weight = p.isVoid ? (analysis.mode === 'sum' ? -1 : 0) : 1;
    const raw = multiProps(p.multi);
    const props = {
      A: raw.A * weight * k2,
      Sx: raw.Sx * weight * k3,
      Sy: raw.Sy * weight * k3,
      Ix0: raw.Ix0 * weight * k4,
      Iy0: raw.Iy0 * weight * k4,
      Ixy0: raw.Ixy0 * weight * k4,
    };
    const E = materialE(shape.material);
    parts.push({
      id: p.id,
      name: shape.name,
      color: shape.color,
      stage: shape.stage === 'new' ? 'new' : 'existing',
      isVoid: !!p.isVoid,
      factor: Number.isFinite(shape.factor) ? shape.factor : 1,
      E,
      materialName: (shape.material && shape.material.name) || '',
      props,
      EA: E * props.A,
    });
  }

  const newParts = parts.filter((p) => p.stage === 'new');
  const existingParts = parts.filter((p) => p.stage !== 'new');

  // ÉN gang, og den sendes videre til shearFlow — ES* skal regnes om DEN
  // sammensatte nøytralaksen, ikke om gruppas egen.
  const section = sectionEA(parts);
  const existingSection = sectionEA(existingParts);
  const comparison = compareStates({ existing: existingSection, combined: section });

  const rawLoads = state.loads || { V: 0, N: 0, M: 0, L: 0 };
  const loads = {
    V_kN: Number(rawLoads.V) || 0,
    N_kN: Number(rawLoads.N) || 0,
    M_kNm: Number(rawLoads.M) || 0,
    L_unit: Number(rawLoads.L) || 0,
    V: kNtoN(Number(rawLoads.V) || 0),
    N: kNtoN(Number(rawLoads.N) || 0),
    M: kNmToNmm(Number(rawLoads.M) || 0),
    L: (Number(rawLoads.L) || 0) * k,
  };

  // Aksialfordelingen over hele tverrsnittet, og hvor mye som må inn i den nye
  // delen. Dette er tallet §7 C3.3 kaller ΔN.
  const split = axialSplit({ N: loads.N, parts });
  const transferNew = axialTransfer({ N: loads.N, parts, groupIds: newParts.map((p) => p.id) });
  const anchorNew = anchorFlow({ dN: transferNew.dN, L: loads.L });

  const interfaces = (state.interfaces || []).map((raw, i) => {
    const f = normalizeInterface(raw, i);
    const wanted = new Set(f.groupIds);
    const groupParts = parts.filter((p) => wanted.has(p.id));
    const group = sectionEA(groupParts);

    const flow = shearFlow({ V: loads.V, groupParts, section });
    // Aksialkraften som må gjennom NETTOPP denne fugen: andelen av N som havner
    // i formene på gruppesiden. Det er ikke nødvendigvis den samme som ΔN over,
    // som gjelder alt som er merket «ny».
    const transfer = axialTransfer({ N: loads.N, parts, groupIds: f.groupIds });
    const anchor = anchorFlow({ dN: transfer.dN, L: loads.L });

    const qV = flow.valid ? flow.qAbs : 0;
    const qN = anchor.valid ? Math.abs(anchor.q) : 0;
    // |q_V| + |q_N|: de to bidragene kan ikke regnes med fortegn mot hverandre,
    // fordi de hører til to forskjellige lasttilfeller langs bjelken.
    const qTot = qV + qN;

    const b = bondWidthMm(f, unit);
    const check = connectorCheck({ q: qTot, bondWidth: b, connector: f.connector });
    const kConn = connectorStiffness(f.connector, b);
    const tau = b > 0 ? qTot / b : null;

    // Aksialkraften i gruppa fra bøyemomentet, N_G = M·ES*/EI. Det er den
    // eneste rollen M_Ed spiller: den sier hvor stor kraft forbindelsen
    // allerede har levert fram til snittet.
    const NG = flow.valid && Math.abs(loads.M) > 0 ? (loads.M * flow.EStar) / flow.EI : null;

    const EA_group = group.EA;
    const EA_other = section.EA - EA_group;
    const vol =
      Math.abs(transfer.dN) > 0 && loads.L > 0 && EA_group > 0 && EA_other > 0 && kConn > 0
        ? volkersen({ P: Math.abs(transfer.dN), L: loads.L, k: kConn, EA1: EA_other, EA2: EA_group, samples: 201 })
        : null;

    return {
      def: f,
      lineLenUnit: lineLength(f),
      groupParts,
      group,
      flow,
      transfer,
      anchor,
      qV,
      qN,
      qTot,
      b,
      tau,
      check,
      kConn,
      NG,
      EA_group,
      EA_other,
      volkersen: vol,
      valid: flow.valid,
    };
  });

  /* ---- advarsler (§7 C4) ---- */
  const warnings = [];
  if (!parts.length) {
    warnings.push({ level: 'warn', text: 'Ingen geometri er med i beregningen. Tegn tverrsnittet først.' });
  } else if (!newParts.length) {
    warnings.push({
      level: 'warn',
      text:
        'Ingen former er merket som «ny». Da er det ikke noe å forsterke, og alle forskjellene mellom ' +
        'eksisterende og sammensatt tverrsnitt blir null. Merk den nye delen under «Stadium» i geometrilista.',
    });
  }
  if (parts.length && !section.valid) {
    warnings.push({
      level: 'warn',
      text: 'Sammensatt EA er null — det finnes ikke noe materiale å regne på. Nøytralaksen er udefinert.',
    });
  } else if (parts.length && Math.abs(section.EIx) < 1e-9) {
    warnings.push({
      level: 'warn',
      text: 'Sammensatt EIₓ er tilnærmet null. Skjærstrømmen q = V·ES*/EI kan ikke regnes ut; sjekk geometrien.',
    });
  }
  for (const it of interfaces) {
    if (!it.groupParts.length) {
      warnings.push({
        level: 'warn',
        text: `${escapeHtml(it.def.name)}: ingen former er valgt på gruppesiden, så ES* = 0 og q kan ikke regnes ut. Bruk «Snu siden», eller tegn grensesnittet på nytt.`,
      });
    } else if (!it.flow.valid) {
      warnings.push({
        level: 'warn',
        text: `${escapeHtml(it.def.name)}: skjærstrømmen kunne ikke regnes ut (EI ≈ 0 eller tom gruppe).`,
      });
    }
    if (it.b <= 0) {
      warnings.push({
        level: 'warn',
        text: `${escapeHtml(it.def.name)}: heftbredden er null, så τ = q/b kan ikke regnes ut.`,
      });
    }
  }
  if (loads.L <= 0 && (Math.abs(loads.N) > 0 || interfaces.length)) {
    warnings.push({
      level: 'warn',
      text: 'Forankringslengden L er null eller negativ. q_N = ΔN/L er da udefinert og settes til null.',
    });
  }
  // `factor` mot ulik E — de to er uavhengige, og det er verdt å si fra om
  const eValues = new Set(parts.map((p) => p.E));
  const anyFactor = parts.some((p) => Math.abs(p.factor - 1) > 1e-9);
  if (anyFactor && eValues.size > 1) {
    warnings.push({
      level: 'info',
      text:
        'Minst én form har vektfaktor ≠ 1 samtidig som materialene har ulik E. Vektfaktoren påvirker BARE ' +
        'tyngdepunktsfanen; forsterkningsberegningen bruker utelukkende material.E. De to er uavhengige.',
    });
  }
  warnings.push({
    level: 'info',
    text:
      'Beregningen er iterativ i praksis: endrer du geometrien, endrer stivheten seg, og dermed også kreftene. ' +
      'Verktøyet regner for de kreftene du taster inn — de skal normalt hentes fra en modell av det ferdig ' +
      'forsterkede tverrsnittet, ikke fra den eksisterende bjelken alene.',
  });

  return {
    unit,
    k,
    parts,
    newParts,
    existingParts,
    section,
    existingSection,
    comparison,
    loads,
    split,
    transferNew,
    anchorNew,
    interfaces,
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Rendering
 * ------------------------------------------------------------------ */

const H = (title, body, extra = '') => `
  <div>
    <div class="flex items-center justify-between mb-1.5">
      <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-400">${title}</h3>
      ${extra}
    </div>
    ${body}
  </div>`;

function row(label, value, cls = 'text-slate-200') {
  return `<div class="flex justify-between gap-2">
    <span class="text-slate-400">${label}</span>
    <span class="${cls} num">${value}</span>
  </div>`;
}

/**
 * Formel → innsatte tall → resultat. Dette er formen alle tall i fanen vises
 * på, slik de andre modulene i repoet gjør det: man skal kunne kontrollregne
 * uten å åpne kildekoden.
 */
function calc({ sym, formula, subst, result, note = '' }) {
  return `
    <div class="py-1.5 border-b border-slate-700/60 last:border-b-0">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-semibold text-sky-300">${sym}</span>
        <span class="text-sm font-semibold num text-white text-right">${result}</span>
      </div>
      <div class="text-[11px] text-slate-500 leading-snug break-words">${formula}</div>
      <div class="text-[11px] text-slate-300 leading-snug break-words num">= ${subst}</div>
      ${note ? `<p class="text-[10px] text-slate-500 mt-0.5 leading-snug">${note}</p>` : ''}
    </div>`;
}

/** Liten inline-SVG av skjærfordelingen langs skjøten. */
function volkersenSvg(vol) {
  const prof = vol.profile;
  if (!prof || prof.length < 2) return '';
  const W = 252;
  const Hh = 64;
  const pad = 6;
  const L = prof[prof.length - 1].x || 1;
  const qMax = Math.max(...prof.map((p) => Math.abs(p.q))) || 1;
  const step = Math.max(1, Math.floor(prof.length / 80));
  const pts = [];
  for (let i = 0; i < prof.length; i += step) {
    const x = pad + (prof[i].x / L) * (W - 2 * pad);
    const y = Hh - pad - (Math.abs(prof[i].q) / qMax) * (Hh - 2 * pad - 8);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const yAvg = Hh - pad - (Math.abs(vol.qAvg) / qMax) * (Hh - 2 * pad - 8);
  return `
    <svg viewBox="0 0 ${W} ${Hh}" class="w-full h-16" role="img"
         aria-label="Skjærstrøm langs skjøten, med topper i endene">
      <rect x="0" y="0" width="${W}" height="${Hh}" fill="#0f172a" rx="4" />
      <line x1="${pad}" y1="${yAvg.toFixed(1)}" x2="${W - pad}" y2="${yAvg.toFixed(1)}"
            stroke="#64748b" stroke-width="1" stroke-dasharray="3 3" />
      <polyline points="${pts.join(' ')}" fill="none" stroke="${INTERFACE_COLOR}" stroke-width="1.6" />
      <text x="${pad + 1}" y="${Hh - 1}" fill="#64748b" font-size="8">x = 0</text>
      <text x="${W - pad - 24}" y="${Hh - 1}" fill="#64748b" font-size="8">x = L</text>
    </svg>
    <p class="text-[10px] text-slate-500 leading-snug">
      Heltrukket: |q(x)| langs skjøten. Stiplet: middelverdien ΔN/L.
    </p>`;
}

/** Et tallfelt i fanen. `path` er nøkkelen hendelsesbindingen ser etter. */
function numField(path, label, value, attrs = '') {
  const id = `rf-${path.replace(/[^\w-]/g, '_')}`;
  return `<div>
    <label class="field-label" for="${id}">${label}</label>
    <input id="${id}" data-rf="${path}" data-focus-key="${id}" type="number" ${attrs}
           value="${Number.isFinite(value) ? value : ''}" />
  </div>`;
}

export class ReinforcementPanel {
  /**
   * @param {Object} store
   * @param {{toast: (m: string) => void, host: () => HTMLElement}} deps
   */
  constructor(store, deps = {}) {
    this.store = store;
    this.toast = deps.toast || (() => {});
    this.onCopy = deps.onCopy || (() => {});
    this.hostId = deps.hostId || 'tab-reinforcement';
    /** Siste utregning — også nyttig for feilsøking via `window.__gw`. */
    this.result = null;
    /** Åpne «Utregning»-grupper, nøkkel = grensesnitt-id eller 'section'. */
    this.openCalc = new Set(['section']);
  }

  render(analysis) {
    const host = document.getElementById(this.hostId);
    if (!host) return;
    // Tas vare på slik at et klikk på en «Utregning»-gruppe kan tegne fanen på
    // nytt uten å vente på neste beregningsrunde.
    this._lastAnalysis = analysis;
    const state = this.store.state;
    const res = computeReinforcement(state, analysis);
    this.result = res;

    host.innerHTML = [
      `<div class="flex items-center justify-between gap-2">
         <span class="text-[11px] text-slate-500 leading-snug">
           Skjærstrøm i forbindelsen mellom eksisterende og ny del.
         </span>
         <button data-rf-act="copy"
                 class="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0">
           Kopier resultat
         </button>
       </div>`,
      this._warnings(res),
      this._loads(res),
      this._effect(res),
      this._axial(res),
      this._interfaces(res),
      this._shearLag(res),
      this._derivation(res),
    ].join('');

    this._bind();
  }

  /* ---------------- seksjonene ---------------- */

  _warnings(res) {
    if (!res || !res.warnings.length) return '';
    const box = (w) => {
      const cls =
        w.level === 'warn'
          ? 'border-amber-600/60 bg-amber-950/40 text-amber-200'
          : 'border-slate-600 bg-slate-900 text-slate-400';
      return `<div class="rounded border ${cls} px-2 py-1.5 text-[11px] leading-snug">${w.text}</div>`;
    };
    return `<div class="space-y-1.5">${res.warnings.map(box).join('')}</div>`;
  }

  _loads(res) {
    const u = lengthLabel(res.unit);
    const l = res.loads;
    return H(
      '1. Laster',
      `<div class="grid grid-cols-2 gap-2">
         ${numField('loads.V', 'V_Ed [kN]', l.V_kN, 'step="1"')}
         ${numField('loads.N', 'N_Ed [kN]', l.N_kN, 'step="1"')}
         ${numField('loads.M', 'M_Ed [kNm]', l.M_kNm, 'step="1"')}
         ${numField('loads.L', `Forankringslengde L [${u}]`, l.L_unit, 'step="10" min="0"')}
       </div>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Dette er kreftene som virker på det <strong>sammensatte</strong> tverrsnittet. Last som
         allerede står på den eksisterende delen når forsterkningen monteres, tas ikke av det nye
         profilet — den skal ikke med her.
       </p>
       <p class="text-[11px] text-slate-500 mt-1 leading-snug num">
         Internt regnes alt i N og mm: V = ${q(l.V, 'N', 0)}, N = ${q(l.N, 'N', 0)},
         M = ${q(l.M, 'Nmm', 0)}, L = ${q(l.L, 'mm', 0)}.
       </p>`
    );
  }

  _effect(res) {
    const c = res.comparison;
    const line = (label, before, after, ratio, unit, dec = 2) => {
      const inc = ratio == null ? null : (ratio - 1) * 100;
      return `<tr class="border-t border-slate-700/60">
        <td class="py-1 pr-2 text-slate-400">${label}</td>
        <td class="py-1 pr-2 text-right num text-slate-300">${q(before, unit, dec)}</td>
        <td class="py-1 pr-2 text-right num text-white">${q(after, unit, dec)}</td>
        <td class="py-1 text-right num ${inc == null ? 'text-slate-500' : inc >= 0 ? 'text-emerald-300' : 'text-rose-300'}">
          ${inc == null ? '–' : `${inc >= 0 ? '+' : ''}${pct(inc)}`}
        </td>
      </tr>`;
    };
    const dyc = c.dyc;
    return H(
      '2. Effekt av forsterkningen',
      `<table class="w-full text-[11px]">
         <thead><tr class="text-slate-500">
           <th class="text-left font-normal py-1">Størrelse</th>
           <th class="text-right font-normal py-1">Eksisterende</th>
           <th class="text-right font-normal py-1">Sammensatt</th>
           <th class="text-right font-normal py-1">Økning</th>
         </tr></thead>
         <tbody>
           ${line('EA', c.EA0, c.EA1, c.ratios.EA, 'N', 0)}
           ${line('EI_x', c.EIx0, c.EIx1, c.ratios.EIx, 'Nmm²', 0)}
           ${line('EI_y', c.EIy0, c.EIy1, c.ratios.EIy, 'Nmm²', 0)}
           <tr class="border-t border-slate-700/60">
             <td class="py-1 pr-2 text-slate-400">Nøytralakse y_c</td>
             <td class="py-1 pr-2 text-right num text-slate-300">${q(c.yc0, 'mm')}</td>
             <td class="py-1 pr-2 text-right num text-white">${q(c.yc1, 'mm')}</td>
             <td class="py-1 text-right num text-amber-300">${dyc >= 0 ? '+' : ''}${q(dyc, 'mm')}</td>
           </tr>
         </tbody>
       </table>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Begge stivhetene er regnet om <em>sin egen</em> nøytralakse: før forsterkningen bøyer den
         eksisterende delen seg om sin akse, etterpå om den felles aksen. y_c måles i det globale
         koordinatsystemet, ikke fra underkant.
       </p>`
    );
  }

  _axial(res) {
    const shareById = new Map(res.split.shares.map((s) => [s.id, s]));
    const rows = res.parts
      .map((p) => {
        const s = shareById.get(p.id);
        return `<tr class="border-t border-slate-700/60">
          <td class="py-1 pr-2">
            <span class="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style="background:${p.color}"></span>
            <span class="text-slate-300">${escapeHtml(p.name)}</span>
            ${p.stage === 'new' ? '<span class="ml-1 text-[9px] px-1 rounded bg-emerald-900 text-emerald-300">ny</span>' : ''}
          </td>
          <td class="py-1 pr-2 text-right num text-slate-300">${q(p.E, 'N/mm²', 0)}</td>
          <td class="py-1 pr-2 text-right num text-slate-300">${q(s ? s.EA_i : 0, 'N', 0)}</td>
          <td class="py-1 pr-2 text-right num text-slate-400">${pct(s ? s.share * 100 : 0)}</td>
          <td class="py-1 text-right num text-white">${q(s ? NtokN(s.N_i) : 0, 'kN')}</td>
        </tr>`;
      })
      .join('');

    const dN = res.transferNew.dN;
    return H(
      '3. Aksialfordeling',
      `<table class="w-full text-[11px]">
         <thead><tr class="text-slate-500">
           <th class="text-left font-normal py-1">Form</th>
           <th class="text-right font-normal py-1">E</th>
           <th class="text-right font-normal py-1">E·A</th>
           <th class="text-right font-normal py-1">Andel</th>
           <th class="text-right font-normal py-1">N_i</th>
         </tr></thead>
         <tbody>${rows || '<tr><td class="py-1 text-slate-500 italic">Ingen former.</td></tr>'}</tbody>
       </table>
       <div class="mt-2 space-y-1 text-[11px] num">
         ${row('ΣE·A (sammensatt)', q(res.section.EA, 'N', 0))}
         ${row('Andel til ny del', pct(res.transferNew.share * 100), 'text-emerald-300')}
         ${row('ΔN inn i ny del', q(NtokN(dN), 'kN'), 'text-white')}
         ${row('q_N = ΔN/L', q(res.anchorNew.valid ? res.anchorNew.q : NaN, 'N/mm'), 'text-white')}
       </div>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Fordelingen forutsetter at aksialkraften allerede er innført i begge deler, altså at snittet
         ligger utenfor forankringssonen. ΔN er nettopp kraften som må gjennom fugen for å få det til.
         q_N = ΔN/L er en <strong>middelverdi</strong> — se punkt 5.
       </p>`
    );
  }

  _interfaces(res) {
    const list = res.interfaces;
    const body = list.length
      ? list.map((it) => this._interfaceCard(it, res)).join('')
      : `<p class="text-[11px] text-slate-500 italic leading-snug">
           Ingen grensesnitt ennå. Velg grensesnittverktøyet (<kbd class="px-1 bg-slate-700 rounded">G</kbd>)
           og klikk to punkt i lerretet — typisk på skjøten mellom eksisterende og ny del.
         </p>`;
    return H('4. Per grensesnitt', body);
  }

  _interfaceCard(it, res) {
    const f = it.def;
    const c = f.connector;
    const u = lengthLabel(res.unit);
    const groupNames = it.groupParts.map((p) => escapeHtml(p.name)).join(', ') || '—';

    const connectorFields =
      c.kind === 'glue'
        ? `<div class="grid grid-cols-3 gap-1.5">
             ${numField(`conn.${f.id}.tauRd`, 'τ_Rd [N/mm²]', c.tauRd, 'step="0.1"')}
             ${numField(`conn.${f.id}.Ga`, 'G_a [N/mm²]', c.Ga, 'step="10"')}
             ${numField(`conn.${f.id}.ta`, 't_a [mm]', c.ta, 'step="0.1"')}
           </div>`
        : `<div class="grid grid-cols-2 gap-1.5">
             ${numField(`conn.${f.id}.FRd`, 'F_Rd per forbinder [kN]', c.FRd, 'step="0.5"')}
             ${numField(`conn.${f.id}.rows`, 'Rader på tvers', c.rows, 'step="1" min="1"')}
             ${numField(`conn.${f.id}.spacing`, 'Senteravstand s [mm]', c.spacing, 'step="10"')}
             ${numField(`conn.${f.id}.Kser`, 'K_ser [N/mm]', c.Kser, 'step="100"')}
           </div>`;

    const checkLine =
      it.check.kind === 'screw'
        ? row(
            'Nødvendig senteravstand s_req',
            it.check.sReq === Infinity
              ? 'ingen krav (q = 0)'
              : it.check.sReq == null
              ? '–'
              : q(it.check.sReq, 'mm', 1),
            'text-white'
          ) +
          row(
            `Utnyttelse ved s = ${q(c.spacing, 'mm', 0)}`,
            it.check.util == null ? '–' : pct(it.check.util * 100),
            it.check.util != null && it.check.util > 1 ? 'text-rose-300' : 'text-emerald-300'
          )
        : row('τ = q_tot/b', q(it.check.tau, 'N/mm²'), 'text-white') +
          row(
            `Utnyttelse mot τ_Rd = ${q(c.tauRd, 'N/mm²')}`,
            it.check.util == null ? '–' : pct(it.check.util * 100),
            it.check.util != null && it.check.util > 1 ? 'text-rose-300' : 'text-emerald-300'
          );

    return `
      <div class="rounded border border-slate-700 bg-slate-900 p-2.5 space-y-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${INTERFACE_COLOR}"></span>
          <input data-rf="if.${f.id}.name" data-focus-key="rf-name-${f.id}" type="text"
                 value="${escapeHtml(f.name)}" class="flex-1 text-xs" />
          <button data-rf-act="remove" data-id="${f.id}"
                  class="px-1 text-slate-500 hover:text-red-400 shrink-0" title="Slett grensesnittet">×</button>
        </div>

        <div class="text-[11px] text-slate-400 leading-snug">
          Gruppeside (den nye delen): <span class="text-slate-200">${groupNames}</span>
          <button data-rf-act="flip" data-id="${f.id}"
                  class="ml-1 px-1.5 py-0.5 text-[10px] rounded border border-slate-600 bg-slate-700 hover:bg-slate-600">
            Snu siden
          </button>
        </div>
        <div class="text-[11px] text-slate-500 num leading-snug">
          Linje (${n(f.a[0])}, ${n(f.a[1])}) → (${n(f.b[0])}, ${n(f.b[1])}) ${u},
          lengde ${q(it.lineLenUnit, u)}
        </div>

        <div class="grid grid-cols-2 gap-1.5">
          <div>
            <label class="field-label" for="rf-kind-${f.id}">Forbindelse</label>
            <select id="rf-kind-${f.id}" data-rf="conn.${f.id}.kind" data-focus-key="rf-kind-${f.id}">
              <option value="screw" ${c.kind !== 'glue' ? 'selected' : ''}>Skruer / mekaniske forbindere</option>
              <option value="glue" ${c.kind === 'glue' ? 'selected' : ''}>Lim</option>
            </select>
          </div>
          ${numField(`if.${f.id}.bondWidth`, 'Heftbredde b [mm], tom = linjelengden', f.bondWidth, 'step="1" min="0"')}
        </div>
        ${connectorFields}

        <div class="pt-1.5 border-t border-slate-700 space-y-1 text-[11px]">
          ${row('ES* (gruppa, om y_c)', q(it.flow.EStar, 'Nmm', 0))}
          ${row('EI_x (sammensatt)', q(it.flow.EI, 'Nmm²', 0))}
          ${row('q_V = V·ES*/EI', q(it.qV, 'N/mm'), 'text-white')}
          ${row('q_N = ΔN_i/L', q(it.qN, 'N/mm'), 'text-white')}
          ${row('q_tot = |q_V| + |q_N|', q(it.qTot, 'N/mm'), 'text-sky-300')}
          ${row('Heftbredde b', q(it.b, 'mm', 1))}
          ${row('τ = q_tot/b', it.tau == null ? '–' : q(it.tau, 'N/mm²'))}
          ${it.NG != null ? row('N_G = M·ES*/EI (kraft i gruppa)', q(NtokN(it.NG), 'kN')) : ''}
          ${checkLine}
        </div>
      </div>`;
  }

  _shearLag(res) {
    const withVol = res.interfaces.filter((it) => it.volkersen && it.volkersen.valid);
    const intro = `
      <p class="text-[11px] text-slate-500 leading-snug mb-2">
        q_N = ΔN/L er en <strong>middelverdi</strong>. Virkeligheten har topper i skjøteendene, fordi
        tøyningsforskjellen mellom de to delene er størst der. Volkersen-modellen kobler dem med et
        kontinuerlig skjærlag med stivhet k og gir fordelingen under.
      </p>`;
    if (!withVol.length) {
      return H(
        '5. Shear lag (Volkersen)',
        intro +
          `<p class="text-[11px] text-slate-500 italic leading-snug">
             Ingen fordeling å vise: det kreves aksialkraft å forankre (N_Ed ≠ 0 med former på begge
             sider av fugen), en forankringslengde L &gt; 0, og en forbindelsesstivhet k &gt; 0
             (K_ser og senteravstand for skruer, G_a og t_a for lim).
           </p>`
      );
    }
    const cards = withVol
      .map((it) => {
        const v = it.volkersen;
        return `
        <div class="rounded border border-slate-700 bg-slate-900 p-2.5 space-y-1 mb-2">
          <div class="text-xs text-slate-300">${escapeHtml(it.def.name)}</div>
          <div class="space-y-1 text-[11px]">
            ${row('Forbindelsesstivhet k', q(it.kConn, 'N/mm²'))}
            ${row('λ = √(k(1/α + 1/β))', q(v.lambda, '1/mm', 6))}
            ${row('λ·L', n(v.lambdaL, 3))}
            ${row('q_avg = ΔN/L', q(v.qAvg, 'N/mm'))}
            ${row('q_max', q(v.qMax, 'N/mm'), 'text-amber-300')}
            ${row('Toppfaktor q_max/q_avg', n(v.peakFactor, 3), 'text-amber-300')}
          </div>
          ${volkersenSvg(v)}
        </div>`;
      })
      .join('');
    return H('5. Shear lag (Volkersen)', intro + cards);
  }

  _derivation(res) {
    const s = res.section;
    const l = res.loads;

    const group = (key, title, inner) => {
      const open = this.openCalc.has(key);
      return `
        <div class="rounded border border-slate-700 bg-slate-900 mb-2">
          <button data-rf-calc="${key}" class="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-slate-300 hover:text-white">
            <span class="chev text-slate-500 ${open ? 'rotate-90' : ''}" style="display:inline-block">›</span>
            ${title}
          </button>
          ${open ? `<div class="px-2.5 pb-2">${inner}</div>` : ''}
        </div>`;
    };

    // --- tverrsnittet
    const sectionCalc =
      calc({
        sym: 'EA',
        formula: 'EA = Σ Eᵢ·Aᵢ',
        subst: res.parts.length
          ? res.parts.map((p) => `${n(p.E, 0)}·${n(p.props.A, 0)}`).join(' + ')
          : '0',
        result: q(s.EA, 'N', 0),
        note: 'Aksialstivheten til hele det sammensatte tverrsnittet. E i N/mm², A i mm².',
      }) +
      calc({
        sym: 'y_c',
        formula: 'y_c = ESx / EA = Σ Eᵢ·Sxᵢ / Σ Eᵢ·Aᵢ',
        subst: `${n(s.ESx, 0)} Nmm / ${n(s.EA, 0)} N`,
        result: q(s.yc, 'mm'),
        note:
          'Den E-vektede nøytralaksen. Den er identisk med tyngdepunktet i det transformerte ' +
          'tverrsnittet, der bredden skaleres med Eᵢ/E_ref — referansemodulen forkorter bort.',
      }) +
      calc({
        sym: 'EI_x',
        formula: 'EI_x = Σ Eᵢ·Ix0ᵢ − EA·y_c²  (Steiners sats, om nøytralaksen)',
        subst: `${n(s.EIx0, 0)} − ${n(s.EA, 0)}·${n(s.yc)}²`,
        result: q(s.EIx, 'Nmm²', 0),
        note: 'Ix0 er integrert om globalt origo; leddet EA·y_c² flytter stivheten til nøytralaksen.',
      }) +
      calc({
        sym: 'ΔN',
        formula: 'ΔN = N · Σ_ny(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)',
        subst: `${n(l.N, 0)} N · ${n(res.transferNew.EA_group, 0)} / ${n(s.EA, 0)}`,
        result: q(NtokN(res.transferNew.dN), 'kN'),
        note: 'Aksialkraften fordeles etter aksialstivhet, fordi tøyningen er felles over tverrsnittet.',
      }) +
      calc({
        sym: 'q_N',
        formula: 'q_N = ΔN / L',
        subst: `${n(res.transferNew.dN, 0)} N / ${n(l.L, 0)} mm`,
        result: q(res.anchorNew.valid ? res.anchorNew.q : NaN, 'N/mm'),
        note: 'Middelverdi over forankringslengden. Toppene i endene ligger over — se punkt 5.',
      });

    const interfaceCalcs = res.interfaces
      .map((it) => {
        const c = it.def.connector;
        let inner =
          calc({
            sym: 'ES*',
            formula: 'ES* = Σ_gruppe Eᵢ·Aᵢ·(yᵢ − y_c) = Σ_gruppe Eᵢ·Sxᵢ − y_c·Σ_gruppe Eᵢ·Aᵢ',
            subst: `${n(it.group.ESx, 0)} − ${n(s.yc)}·${n(it.group.EA, 0)}`,
            result: q(it.flow.EStar, 'Nmm', 0),
            note:
              'Regnet om den SAMMENSATTE nøytralaksen, ikke om gruppas egen. Fortegnet sier bare ' +
              'hvilken vei kraften går; kapasitetskontrollen bruker tallverdien.',
          }) +
          calc({
            sym: 'q_V',
            formula: 'q_V = V · ES* / EI_x     (følger av q = dN/dx og dM/dx = V)',
            subst: `${n(l.V, 0)} N · ${n(it.flow.EStar, 0)} Nmm / ${n(it.flow.EI, 0)} Nmm²`,
            result: q(it.qV, 'N/mm'),
            note: 'Med samme E i hele tverrsnittet forkorter E bort, og dette er den klassiske q = VQ/I.',
          }) +
          calc({
            sym: 'ΔN_i',
            formula: 'ΔN_i = N · Σ_gruppe(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)',
            subst: `${n(l.N, 0)} N · ${n(it.transfer.EA_group, 0)} / ${n(s.EA, 0)}`,
            result: q(NtokN(it.transfer.dN), 'kN'),
            note: 'Aksialkraften som må gjennom nettopp denne fugen — gruppesiden, ikke alt som er merket «ny».',
          }) +
          calc({
            sym: 'q_N',
            formula: 'q_N = ΔN_i / L',
            subst: `${n(it.transfer.dN, 0)} N / ${n(l.L, 0)} mm`,
            result: q(it.qN, 'N/mm'),
          }) +
          calc({
            sym: 'q_tot',
            formula: 'q_tot = |q_V| + |q_N|',
            subst: `${n(it.qV)} + ${n(it.qN)}`,
            result: q(it.qTot, 'N/mm'),
            note: 'Absoluttverdier legges sammen: de to bidragene kan ikke regnes til fradrag mot hverandre.',
          }) +
          calc({
            sym: 'τ',
            formula: 'τ = q_tot / b',
            subst: `${n(it.qTot)} N/mm / ${n(it.b, 1)} mm`,
            result: it.tau == null ? '–' : q(it.tau, 'N/mm²'),
            note: 'b er heftbredden, altså grensesnittets lengde i tverrsnittsplanet.',
          });

        if (it.check.kind === 'screw') {
          inner +=
            calc({
              sym: 's_req',
              formula: 's_req = rader · F_Rd · 1000 / q_tot     (F_Rd i kN, q i N/mm)',
              subst: `${n(c.rows, 0)} · ${n(c.FRd)} · 1000 / ${n(it.qTot)}`,
              result:
                it.check.sReq === Infinity
                  ? 'ingen krav (q_tot = 0)'
                  : it.check.sReq == null
                  ? '–'
                  : q(it.check.sReq, 'mm', 1),
            }) +
            calc({
              sym: 'utnyttelse',
              formula: 'util = q_tot · s / (rader · F_Rd · 1000)',
              subst: `${n(it.qTot)} · ${n(c.spacing, 0)} / (${n(c.rows, 0)} · ${n(c.FRd)} · 1000)`,
              result: it.check.util == null ? '–' : pct(it.check.util * 100),
            });
        } else {
          inner += calc({
            sym: 'utnyttelse',
            formula: 'util = τ / τ_Rd',
            subst: `${n(it.tau)} / ${n(c.tauRd)}`,
            result: it.check.util == null ? '–' : pct(it.check.util * 100),
          });
        }

        if (it.volkersen && it.volkersen.valid) {
          const v = it.volkersen;
          inner +=
            calc({
              sym: 'k',
              formula:
                c.kind === 'glue'
                  ? 'k = G_a · b / t_a     [(N/mm²)·mm/mm = N/mm²]'
                  : 'k = K_ser · rader / s     [(N/mm)·(1/mm) = N/mm²]',
              subst:
                c.kind === 'glue'
                  ? `${n(c.Ga, 0)} · ${n(it.b, 1)} / ${n(c.ta)}`
                  : `${n(c.Kser, 0)} · ${n(c.rows, 0)} / ${n(c.spacing, 0)}`,
              result: q(it.kConn, 'N/mm²'),
            }) +
            calc({
              sym: 'λ',
              formula: 'λ = √( k · (1/α + 1/β) ),  α = (EA)_eks, β = (EA)_ny',
              subst: `√(${n(it.kConn)} · (1/${n(it.EA_other, 0)} + 1/${n(it.EA_group, 0)}))`,
              result: q(v.lambda, '1/mm', 6),
            }) +
            calc({
              sym: 'q_max',
              formula: 'q(x) = (P·λ/2)·[cosh(λx′)/sinh(λL/2) + ((α−β)/(α+β))·sinh(λx′)/cosh(λL/2)],  x′ = x − L/2',
              subst: `maks |q| over x ∈ [0, ${n(l.L, 0)} mm], med P = ${n(Math.abs(it.transfer.dN), 0)} N`,
              result: q(v.qMax, 'N/mm'),
              note: `Toppfaktor q_max/q_avg = ${n(v.peakFactor, 3)}. Integralet av q over skjøten er per konstruksjon lik P.`,
            });
        }

        return group(it.def.id, escapeHtml(it.def.name), inner);
      })
      .join('');

    return H(
      '6. Utregning',
      group('section', 'Tverrsnittet og aksialkraften', sectionCalc) +
        interfaceCalcs +
        `<div class="rounded border border-slate-700 bg-slate-900 p-2.5 text-[11px] text-slate-400 leading-snug space-y-1.5">
           <div class="text-slate-300 font-medium">Forutsetninger</div>
           <ul class="list-disc list-inside space-y-1">
             <li><strong>Full samvirkning</strong> mellom delene: tverrsnittet forblir plant, og det er
               ingen glidning i fugen. Skjærstrømmen er nettopp den kraften forbindelsen må ta for at
               dette skal holde.</li>
             <li><strong>Lineær elastisitet</strong>: σ = E·ε i alle deler, med E fra materialvalget.
               Ingen riss, ingen flyt, ingen kryp — skal du regne langtid, sett inn en redusert E selv.</li>
             <li>Kreftene V_Ed, N_Ed og M_Ed gjelder det <strong>sammensatte</strong> tverrsnittet.
               Last som allerede sto på den eksisterende delen før montasje, bæres av den alene.</li>
             <li>Vektfaktoren <code>factor</code> påvirker bare tyngdepunktsfanen. Her brukes bare
               <code>material.E</code>.</li>
             <li>Overlapp og hull er håndtert av geometrien slik fanen «Tverrsnitt» viser
               (skallmodell eller fysisk tverrsnitt).</li>
             <li>Beregningen er <strong>iterativ i praksis</strong>: ny geometri gir ny stivhet, som gir
               nye krefter. Tallene her gjelder de kreftene som er tastet inn.</li>
           </ul>
         </div>`
    );
  }

  /* ---------------- hendelser ---------------- */

  _bind() {
    const host = document.getElementById(this.hostId);
    if (!host) return;
    const store = this.store;

    host.querySelectorAll('[data-rf]').forEach((el) => {
      const path = el.dataset.rf;
      const evt = el.tagName === 'SELECT' ? 'change' : el.type === 'text' ? 'input' : 'change';
      el.addEventListener(evt, () => {
        const parts = path.split('.');
        if (parts[0] === 'loads') {
          const v = Number(el.value);
          store.setLoads({ [parts[1]]: Number.isFinite(v) ? v : 0 });
          return;
        }
        if (parts[0] === 'if') {
          const id = parts[1];
          const key = parts[2];
          if (key === 'name') {
            updateInterface(store, id, { name: el.value }, { transient: true });
            return;
          }
          if (key === 'bondWidth') {
            const v = Number(el.value);
            updateInterface(store, id, { bondWidth: Number.isFinite(v) && v > 0 ? v : null });
            return;
          }
        }
        if (parts[0] === 'conn') {
          const id = parts[1];
          const key = parts[2];
          if (key === 'kind') {
            updateConnector(store, id, { kind: el.value === 'glue' ? 'glue' : 'screw' });
            return;
          }
          const v = Number(el.value);
          updateConnector(store, id, { [key]: Number.isFinite(v) ? v : 0 });
        }
      });
      // Navnefeltet skrives transient; ett undo-steg når feltet forlates.
      if (path.endsWith('.name')) {
        el.addEventListener('change', () => store.commit('interface-rename'));
      }
    });

    host.querySelectorAll('[data-rf-act]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        if (el.dataset.rfAct === 'copy') {
          this.onCopy();
        } else if (el.dataset.rfAct === 'remove') {
          removeInterface(store, id);
          this.toast('Grensesnittet er slettet.');
        } else if (el.dataset.rfAct === 'flip') {
          flipGroup(store, id);
          this.toast('Gruppesiden er snudd — pilene i lerretet peker nå motsatt vei.');
        }
      });
    });

    host.querySelectorAll('[data-rf-calc]').forEach((el) => {
      el.addEventListener('click', () => {
        const key = el.dataset.rfCalc;
        if (this.openCalc.has(key)) this.openCalc.delete(key);
        else this.openCalc.add(key);
        this.render(this._lastAnalysis);
      });
    });
  }

  /**
   * Teksten «Kopier resultat» legger på utklippstavla når fanen er aktiv.
   * Samme tall som panelet viser, men flat tekst som kan limes i en rapport.
   */
  clipboardText() {
    const res = this.result;
    if (!res) return '';
    const c = res.comparison;
    const lines = [
      'FORSTERKNING — sammensatt tverrsnitt',
      `Laster: V_Ed = ${res.loads.V_kN} kN, N_Ed = ${res.loads.N_kN} kN, M_Ed = ${res.loads.M_kNm} kNm, L = ${n(res.loads.L, 0)} mm`,
      '',
      'Effekt av forsterkningen',
      `  EA:    ${n(c.EA0, 0)} N  ->  ${n(c.EA1, 0)} N   (${c.ratios.EA == null ? '–' : pct((c.ratios.EA - 1) * 100)})`,
      `  EI_x:  ${n(c.EIx0, 0)} Nmm2  ->  ${n(c.EIx1, 0)} Nmm2   (${c.ratios.EIx == null ? '–' : pct((c.ratios.EIx - 1) * 100)})`,
      `  y_c:   ${n(c.yc0)} mm  ->  ${n(c.yc1)} mm`,
      '',
      `Aksialfordeling: DeltaN til ny del = ${n(NtokN(res.transferNew.dN))} kN, q_N = ${n(res.anchorNew.q)} N/mm`,
    ];
    for (const it of res.interfaces) {
      lines.push('');
      lines.push(`${it.def.name}`);
      lines.push(`  ES*   = ${n(it.flow.EStar, 0)} Nmm     EI_x = ${n(it.flow.EI, 0)} Nmm2`);
      lines.push(`  q_V   = ${n(it.qV)} N/mm   q_N = ${n(it.qN)} N/mm   q_tot = ${n(it.qTot)} N/mm`);
      lines.push(`  b     = ${n(it.b, 1)} mm    tau = ${it.tau == null ? '-' : n(it.tau)} N/mm2`);
      if (it.check.kind === 'screw') {
        lines.push(
          `  s_req = ${it.check.sReq === Infinity ? 'ingen krav' : n(it.check.sReq, 1) + ' mm'}` +
            `   utnyttelse ved s = ${n(it.def.connector.spacing, 0)} mm: ${it.check.util == null ? '-' : pct(it.check.util * 100)}`
        );
      } else {
        lines.push(`  utnyttelse mot tau_Rd: ${it.check.util == null ? '-' : pct(it.check.util * 100)}`);
      }
      if (it.volkersen && it.volkersen.valid) {
        lines.push(`  Volkersen: lambda = ${n(it.volkersen.lambda, 6)} 1/mm, q_max = ${n(it.volkersen.qMax)} N/mm, toppfaktor ${n(it.volkersen.peakFactor, 3)}`);
      }
    }
    lines.push('');
    lines.push('Forutsetninger: full samvirkning, lineaer elastisitet, kreftene gjelder det sammensatte');
    lines.push('tverrsnittet. Beregningen er iterativ i praksis - ny geometri gir ny stivhet og nye krefter.');
    return lines.join('\n');
  }
}

/** Materialpresetene, gjort tilgjengelig for geometrilista i ui.js. */
export { MATERIALS, materialByName };
