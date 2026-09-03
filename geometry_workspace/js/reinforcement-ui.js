/**
 * reinforcement-ui.js — «Forsterkning»-fanen i høyre panel.
 *
 * To ansvar, holdt fra hverandre:
 *   1. `computeReinforcement()` — broen fra modellen (store) til den rene
 *      mekanikken i `joints.js`/`reinforcement.js`. All enhetsomregning skjer
 *      her, ett sted, slik at panelet aldri regner selv.
 *   2. `ReinforcementPanel` — rendering og hendelser. Panelet regner ingenting.
 *
 * Skjøtene REDIGERES i venstre panel (skjøtelista, se `ui.js` §5 i
 * interaksjonsplanen) — denne fanen er lese/resultat-visning pluss de
 * globale lastfeltene, som ikke hører til noen enkelt skjøt eller form.
 *
 * ------------------------------------------------------------------
 * VIKTIG — ES* kommer fra HALVPLANET, ikke grafen (§8 i joints-planen)
 * ------------------------------------------------------------------
 * `halfPlaneParts(joint, shapes, side)` er `groupParts` til `shearFlow`, og
 * `fullSectionParts(shapes)` er `section`. Grafen (`buildGraph`/`jointGroup`
 * fra joints.js) brukes KUN til å rute aksialleddet ΔN og til advarsler
 * (former uten skjøt, statisk ubestemte oppsett) — ALDRI til ES*.
 *
 * ------------------------------------------------------------------
 * TO LASTTILSTANDER — superposisjon (§3)
 * ------------------------------------------------------------------
 * `loads.before` virker på tverrsnittet av bare `existing`-formene,
 * `loads.after` på det sammensatte. Per skjøt: q_før (bare hvis skjøten
 * ligger helt inne i eksisterende materiale), q_etter, q_V,tot = |q_før| +
 * |q_etter|, q_N (fra grafen/ΔN), q_tot = q_V,tot + q_N. Er ALLE former
 * `existing`, er dette en ren kontroll av en eksisterende konstruksjon:
 * «etter»-tilstanden, aksialfordelingen, ΔN/L og Volkersen skjules, og bare
 * «før» og skjærstrømmen vises (`allExisting` under).
 *
 * ------------------------------------------------------------------
 * ENHETER — den eneste omregningsplassen i UI-laget
 * ------------------------------------------------------------------
 * Geometrien (former OG skjøter) ligger i arbeidsenheten (mm/cm/m).
 * Mekanikken i joints.js/reinforcement.js regner i N og mm. Derfor bygges
 * `shapesMm`/`jointsMm` her — punktene skalert med k = mm per arbeidsenhet —
 * ÉN gang, og alt av `halfPlaneParts`/`fullSectionParts`/`buildGraph` regner
 * på de skalerte kopiene. `bondWidth` og forbinderfeltene er allerede
 * absolutte mm/kN/N-mm² (se `store.js`) og skal IKKE skaleres.
 */

import { unitInfo, lengthLabel } from './units.js';
import { neighborTolerance } from './geometry.js';
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
  sidesOfJoint,
  buildGraph,
  jointGroup,
  danglingShapes,
  overConstrained,
  fullSectionParts,
  halfPlaneParts,
} from './joints.js';
import { JOINT_COLOR } from './store.js';

/* ------------------------------------------------------------------ *
 * Tallformatering
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

function num(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

export const CONNECTOR_LABELS = { screw: 'Skruer / mekaniske forbindere', glue: 'Lim', weld: 'Sveis' };

/* ------------------------------------------------------------------ *
 * 1. Broen: modell → mekanikk
 * ------------------------------------------------------------------ */

/**
 * Regner ut alt «Forsterkning»-fanen (og skjøtelista i venstre panel) viser.
 *
 * @param {Object} state  store.state
 * @returns {Object|null} null hvis det ikke finnes noe å regne på
 */
export function computeReinforcement(state) {
  if (!state) return null;
  const unit = state.unit || 'mm';
  const k = unitInfo(unit).toMillimetres;

  const shapesRaw = (state.shapes || []).filter(
    (s) => s && s.include !== false && Array.isArray(s.points) && s.points.length >= 3
  );
  const jointsRaw = state.joints || [];

  const scalePts = (pts) => pts.map(([x, y]) => [x * k, y * k]);
  const shapesMm = shapesRaw.map((s) => ({ ...s, points: scalePts(s.points) }));
  const jointsMm = jointsRaw.map((j) => ({
    ...j,
    a: [j.a[0] * k, j.a[1] * k],
    b: [j.b[0] * k, j.b[1] * k],
  }));
  const tol = neighborTolerance(shapesMm);

  const shapeByIdRaw = new Map(shapesRaw.map((s) => [s.id, s]));
  const shapeByIdMm = new Map(shapesMm.map((s) => [s.id, s]));
  const newIds = new Set(shapesRaw.filter((s) => s.stage === 'new').map((s) => s.id));
  const existingShapesMm = shapesMm.filter((s) => !newIds.has(s.id));
  const allExisting = shapesRaw.length > 0 && newIds.size === 0;

  // §8: hele det sammensatte tverrsnittet og bare-eksisterende, som Part[]
  // (per form — mates inn i axialSplit/axialTransfer) og som SectionEA
  // (nøytralakse + EI — mates inn i shearFlow som `section`).
  const sectionParts = fullSectionParts(shapesMm);
  const existingParts = fullSectionParts(existingShapesMm);
  const section = sectionEA(sectionParts);
  const existingSection = sectionEA(existingParts);
  const comparison = compareStates({ existing: existingSection, combined: section });

  /** @type {Array<{id, name, color, stage, E, props, EA}>} — visningslista, §3-tabellen. */
  const parts = sectionParts.map((p) => {
    const s = shapeByIdRaw.get(p.id);
    return {
      id: p.id,
      name: s ? s.name : String(p.id),
      color: s ? s.color : '#94a3b8',
      stage: s && s.stage === 'new' ? 'new' : 'existing',
      E: p.E,
      props: p.props,
      EA: p.E * p.props.A,
    };
  });
  const newParts = parts.filter((p) => p.stage === 'new');
  const existingPartsDisplay = parts.filter((p) => p.stage !== 'new');

  const rawLoads = state.loads || {};
  const beforeRaw = rawLoads.before || {};
  const afterRaw = rawLoads.after || {};
  const loads = {
    before: {
      V_kN: num(beforeRaw.V), N_kN: num(beforeRaw.N), M_kNm: num(beforeRaw.M),
      V: kNtoN(num(beforeRaw.V)), N: kNtoN(num(beforeRaw.N)), M: kNmToNmm(num(beforeRaw.M)),
    },
    after: {
      V_kN: num(afterRaw.V), N_kN: num(afterRaw.N), M_kNm: num(afterRaw.M),
      V: kNtoN(num(afterRaw.V)), N: kNtoN(num(afterRaw.N)), M: kNmToNmm(num(afterRaw.M)),
    },
    L_unit: num(rawLoads.L),
    L: num(rawLoads.L) * k,
  };

  // Aksialfordeling over HELE det sammensatte tverrsnittet (§3): hvor mye av
  // N_etter som havner i de nye delene samlet. Udefinert/uinteressant i
  // ren-eksisterende-modus, siden det da ikke finnes noe å forankre.
  const split = allExisting ? null : axialSplit({ N: loads.after.N, parts: sectionParts });
  const transferNew = allExisting
    ? { dN: 0, EA_group: 0, share: 0 }
    : axialTransfer({ N: loads.after.N, parts: sectionParts, groupIds: [...newIds] });
  const anchorNew = anchorFlow({ dN: transferNew.dN, L: loads.L });

  // Grafen (§8.3): KUN til ΔN-ruting og advarsler. ALDRI til ES*.
  const graph = buildGraph(shapesMm, jointsMm, tol);
  const dangling = danglingShapes(shapesMm, jointsMm, graph).map((id) => {
    const s = shapeByIdMm.get(id);
    return s ? s.name : String(id);
  });
  const overC = overConstrained(shapesMm, jointsMm, graph);

  const joints = jointsRaw.map((raw, i) => {
    const jm = jointsMm[i];
    const lineLenUnit = Math.hypot(raw.b[0] - raw.a[0], raw.b[1] - raw.a[1]);
    const lenMm = Math.hypot(jm.b[0] - jm.a[0], jm.b[1] - jm.a[1]);

    const sides = sidesOfJoint(jm, shapesMm, tol);
    const aNames = sides.aSide.map((id) => (shapeByIdMm.get(id) || {}).name || String(id));
    const bNames = sides.bSide.map((id) => (shapeByIdMm.get(id) || {}).name || String(id));
    const touchingIds = [...sides.aSide, ...sides.bSide];
    const hasNeighbor = touchingIds.length > 0;
    const hasNewNeighbor = touchingIds.some((id) => newIds.has(id));
    // §3: «en skjøt mot en ny del har ingen «før»-tilstand» — den må ligge
    // HELT inne i eksisterende materiale, altså ingen nabo som er «ny».
    const existingOnly = hasNeighbor && !hasNewNeighbor;

    let flowBefore = null;
    let qBefore = 0;
    if (existingOnly) {
      const halfBefore = halfPlaneParts(jm, existingShapesMm, 1);
      flowBefore = shearFlow({ V: loads.before.V, groupParts: halfBefore, section: existingSection });
      qBefore = flowBefore.valid ? flowBefore.qAbs : 0;
    }

    let flowAfter = null;
    let qAfter = 0;
    if (!allExisting) {
      const halfAfter = halfPlaneParts(jm, shapesMm, 1);
      flowAfter = shearFlow({ V: loads.after.V, groupParts: halfAfter, section });
      qAfter = flowAfter.valid ? flowAfter.qAbs : 0;
    }

    const qVtot = allExisting ? qBefore : qBefore + qAfter;

    // Aksialleddet (§8.3): grafen, IKKE halvplanet. `share` overstyrer bare her.
    const jg = jointGroup(jm, graph);
    const groupNewIds = jg.groupIds.filter((id) => newIds.has(id));
    const ocEntry = overC.find((e) => e.jointIds.includes(jm.id));

    let dN = 0;
    let shareApplied = null;
    if (!allExisting) {
      if (ocEntry) {
        const bodyNewIds = ocEntry.shapeIds.filter((id) => newIds.has(id));
        if (bodyNewIds.length) {
          const totalT = axialTransfer({ N: loads.after.N, parts: sectionParts, groupIds: bodyNewIds });
          shareApplied =
            Number.isFinite(raw.share) && raw.share >= 0 && raw.share <= 1
              ? raw.share
              : 1 / ocEntry.jointIds.length;
          dN = totalT.dN * shareApplied;
        }
      } else if (groupNewIds.length) {
        dN = axialTransfer({ N: loads.after.N, parts: sectionParts, groupIds: groupNewIds }).dN;
      }
    }
    const anchor = anchorFlow({ dN, L: loads.L });
    const qN = allExisting ? 0 : anchor.valid ? Math.abs(anchor.q) : 0;
    const qTot = qVtot + qN;

    const bMm = Number.isFinite(raw.bondWidth) && raw.bondWidth > 0 ? raw.bondWidth : lenMm;
    const connector = raw.connector || {};
    const check = connectorCheck({ q: qTot, bondWidth: bMm, connector });
    const kConn = connectorStiffness(connector, bMm);
    const tau = bMm > 0 ? qTot / bMm : null;

    const groupNewParts = sectionParts.filter((p) => groupNewIds.includes(p.id));
    const groupSection = sectionEA(groupNewParts);
    const EA_group = groupSection.EA;
    const EA_other = section.EA - EA_group;
    const vol =
      !allExisting && Math.abs(dN) > 0 && loads.L > 0 && EA_group > 0 && EA_other > 0 && kConn > 0
        ? volkersen({ P: Math.abs(dN), L: loads.L, k: kConn, EA1: EA_other, EA2: EA_group, samples: 201 })
        : null;

    const NG =
      flowAfter && flowAfter.valid && Math.abs(loads.after.M) > 0
        ? (loads.after.M * flowAfter.EStar) / flowAfter.EI
        : null;

    return {
      id: raw.id,
      name: raw.name,
      raw,
      lineLenUnit,
      lenMm,
      aNames,
      bNames,
      hasNeighbor,
      existingOnly,
      determinate: jg.determinate,
      overConstrained: !!ocEntry,
      ocJointIds: ocEntry ? ocEntry.jointIds : null,
      shareApplied,
      flowBefore,
      flowAfter,
      qBefore,
      qAfter,
      qVtot,
      qN,
      qTot,
      dN,
      anchor,
      b: bMm,
      tau,
      check,
      kConn,
      EA_group,
      EA_other,
      NG,
      volkersen: vol,
      connector,
      valid: allExisting ? !!(flowBefore && flowBefore.valid) : !!(flowAfter && flowAfter.valid),
    };
  });

  /* ---- advarsler (§6.4) ---- */
  const warnings = [];
  if (!shapesRaw.length) {
    warnings.push({ level: 'warn', text: 'Ingen geometri er med i beregningen. Tegn tverrsnittet først.' });
  }
  if (shapesRaw.length && !section.valid) {
    warnings.push({
      level: 'warn',
      text: 'Sammensatt EA er null — det finnes ikke noe materiale å regne på. Nøytralaksen er udefinert.',
    });
  } else if (shapesRaw.length && Math.abs(section.EIx) < 1e-9) {
    warnings.push({
      level: 'warn',
      text: 'Sammensatt EIₓ er tilnærmet null. Skjærstrømmen q = V·ES*/EI kan ikke regnes ut; sjekk geometrien.',
    });
  }
  for (const jt of joints) {
    if (!jt.hasNeighbor) {
      warnings.push({
        level: 'warn',
        text: `${escapeHtml(jt.name)}: linja treffer ingen former på noen side, så q kan ikke regnes ut.`,
      });
    } else if (!jt.valid) {
      warnings.push({ level: 'warn', text: `${escapeHtml(jt.name)}: skjærstrømmen kunne ikke regnes ut (EI ≈ 0).` });
    }
    if (jt.b <= 0) {
      warnings.push({ level: 'warn', text: `${escapeHtml(jt.name)}: heftbredden er null, så τ = q/b kan ikke regnes ut.` });
    }
  }
  for (const name of dangling) {
    warnings.push({ level: 'warn', text: `«${escapeHtml(name)}» henger i løse lufta — tegn skjøten som fester den.` });
  }
  for (const entry of overC) {
    const names = entry.shapeIds.map((id) => (shapeByIdMm.get(id) || {}).name || id).join(' + ');
    const jn = entry.jointIds
      .map((id) => {
        const j = joints.find((x) => x.id === id);
        return j ? j.name : id;
      })
      .join(', ');
    warnings.push({
      level: 'warn',
      text:
        `«${escapeHtml(names)}» er festet med flere skjøter samtidig (${escapeHtml(jn)}) — statisk ubestemt. ` +
        'Fordelingen er satt lik mellom dem som utgangspunkt; overstyr med «Andel» på hver skjøt i skjøtelista om nødvendig.',
    });
  }
  if (!allExisting && loads.L <= 0 && (Math.abs(loads.after.N) > 0 || joints.length)) {
    warnings.push({
      level: 'warn',
      text: 'Forankringslengden L er null eller negativ. q_N = ΔN/L er da udefinert og settes til null.',
    });
  }
  const eValues = new Set(parts.map((p) => p.E));
  const anyFactor = shapesRaw.some((s) => Number.isFinite(s.factor) && Math.abs(s.factor - 1) > 1e-9);
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
    allExisting,
    parts,
    newParts,
    existingParts: existingPartsDisplay,
    section,
    existingSection,
    comparison,
    loads,
    split,
    transferNew,
    anchorNew,
    joints,
    dangling,
    overC,
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
      <polyline points="${pts.join(' ')}" fill="none" stroke="${JOINT_COLOR}" stroke-width="1.6" />
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
    /** Åpne «Utregning»-grupper, nøkkel = skjøt-id eller 'section'. */
    this.openCalc = new Set(['section']);
  }

  render(analysis) {
    const host = document.getElementById(this.hostId);
    if (!host) return;
    // Tas vare på slik at et klikk på en «Utregning»-gruppe kan tegne fanen på
    // nytt uten å vente på neste beregningsrunde.
    this._lastAnalysis = analysis;
    const state = this.store.state;
    const res = computeReinforcement(state);
    this.result = res;
    if (!res) {
      host.innerHTML = '';
      return;
    }

    const sections = [
      { title: 'Last', body: this._loadsBody(res) },
      !res.allExisting && { title: 'Effekt av forsterkningen', body: this._effectBody(res) },
      !res.allExisting && { title: 'Aksialfordeling', body: this._axialBody(res) },
      { title: 'Per skjøt', body: this._jointsBody(res) },
      !res.allExisting && { title: 'Shear lag (Volkersen)', body: this._shearLagBody(res) },
      { title: 'Utregning', body: this._derivationBody(res) },
    ].filter(Boolean);

    const intro = res.allExisting
      ? 'Kontroll av eksisterende konstruksjon: skjærstrøm per skjøt i dagens tverrsnitt — «hvor mye går ' +
        'det i sveisen mellom flens og steg».'
      : 'Skjærstrøm og aksialoverføring i skjøtene mellom eksisterende og ny del.';

    host.innerHTML = [
      `<div class="flex items-center justify-between gap-2">
         <span class="text-[11px] text-slate-500 leading-snug">${intro}</span>
         <button data-rf-act="copy"
                 class="px-2 py-1 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0">
           Kopier resultat
         </button>
       </div>`,
      this._warnings(res),
      ...sections.map((s, i) => H(`${i + 1}. ${s.title}`, s.body)),
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

  _loadsBody(res) {
    const u = lengthLabel(res.unit);
    const b = res.loads.before;
    const beforeFields = `<div class="grid grid-cols-3 gap-2">
       ${numField('loads.before.V', 'V_Ed,før [kN]', b.V_kN, 'step="1"')}
       ${numField('loads.before.N', 'N_Ed,før [kN]', b.N_kN, 'step="1"')}
       ${numField('loads.before.M', 'M_Ed,før [kNm]', b.M_kNm, 'step="1"')}
     </div>`;

    if (res.allExisting) {
      return (
        beforeFields +
        `<p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
           Alle former er merket «eksisterende» — dette er en kontroll av en eksisterende konstruksjon.
           Lasten virker på tverrsnittet slik det står i dag; det finnes ingen «etter»-tilstand å legge til.
         </p>`
      );
    }

    const a = res.loads.after;
    const afterFields = `<div class="grid grid-cols-3 gap-2">
       ${numField('loads.after.V', 'V_Ed,etter [kN]', a.V_kN, 'step="1"')}
       ${numField('loads.after.N', 'N_Ed,etter [kN]', a.N_kN, 'step="1"')}
       ${numField('loads.after.M', 'M_Ed,etter [kNm]', a.M_kNm, 'step="1"')}
     </div>`;

    return `
       <p class="text-[11px] text-slate-400 mb-1">
         Før forsterkning — virker på det <strong>eksisterende</strong> tverrsnittet alene
       </p>
       ${beforeFields}
       <p class="text-[11px] text-slate-400 mt-2.5 mb-1">
         Etter forsterkning — tilleggslast på det <strong>sammensatte</strong> tverrsnittet
       </p>
       ${afterFields}
       <div class="mt-2">${numField('loads.L', `Forankringslengde L [${u}]`, res.loads.L_unit, 'step="10" min="0"')}</div>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Den eksisterende bjelken bærer allerede «før»-lasten idet forsterkningen monteres — bare
         tilleggslasten «etter» virker på det sammensatte tverrsnittet. De to superponeres:
         q_V,tot = |q_før| + |q_etter|.
       </p>
       <p class="text-[11px] text-slate-500 mt-1 leading-snug num">
         Internt: V_før = ${q(res.loads.before.V, 'N', 0)}, V_etter = ${q(res.loads.after.V, 'N', 0)},
         N_etter = ${q(res.loads.after.N, 'N', 0)}, L = ${q(res.loads.L, 'mm', 0)}.
       </p>`;
  }

  _effectBody(res) {
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
    return `
       <table class="w-full text-[11px]">
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
       </p>`;
  }

  _axialBody(res) {
    const shareById = res.split ? new Map(res.split.shares.map((s) => [s.id, s])) : new Map();
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
    return `
       <table class="w-full text-[11px]">
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
         ${row('Andel til nye deler', pct(res.transferNew.share * 100), 'text-emerald-300')}
         ${row('ΔN inn i nye deler', q(NtokN(dN), 'kN'), 'text-white')}
         ${row('q_N = ΔN/L', q(res.anchorNew.valid ? res.anchorNew.q : NaN, 'N/mm'), 'text-white')}
       </div>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Fordelingen forutsetter at aksialkraften N_etter allerede er innført i begge deler, altså at
         snittet ligger utenfor forankringssonen. ΔN er kraften som må gjennom fugene for å få det til —
         per skjøt, se punkt under. q_N = ΔN/L er en <strong>middelverdi</strong>, se Volkersen-avsnittet.
       </p>`;
  }

  _jointsBody(res) {
    const list = res.joints;
    if (!list.length) {
      return `<p class="text-[11px] text-slate-500 italic leading-snug">
           Ingen skjøter ennå. Velg skjøteverktøyet (<kbd class="px-1 bg-slate-700 rounded">G</kbd>) og
           klikk to punkt i lerretet — typisk der to deler møtes, eller langs et snitt du vil kontrollere
           (verktøyet trenger ikke at geometrien er delt opp der). Skjøtelista i venstre panel lar deg
           redigere navn, forbindelsestype, heftbredde og andel.
         </p>`;
    }
    return list.map((jt) => this._jointCard(jt, res)).join('');
  }

  _jointCard(jt, res) {
    const c = jt.connector;
    const kindLabel = CONNECTOR_LABELS[c.kind] || CONNECTOR_LABELS.screw;
    const sidesText = `${jt.aNames.join(' + ') || '—'} ↔ ${jt.bNames.join(' + ') || '—'}`;

    const checkLine =
      c.kind === 'weld'
        ? row('q_Rd (sveis)', jt.check.qRd == null ? '–' : q(jt.check.qRd, 'N/mm'), 'text-white') +
          row(
            'Utnyttelse',
            jt.check.util == null ? '–' : pct(jt.check.util * 100),
            jt.check.util != null && jt.check.util > 1 ? 'text-rose-300' : 'text-emerald-300'
          )
        : c.kind === 'glue'
        ? row('τ = q_tot/b', q(jt.check.tau, 'N/mm²'), 'text-white') +
          row(
            `Utnyttelse mot τ_Rd = ${q(c.tauRd, 'N/mm²')}`,
            jt.check.util == null ? '–' : pct(jt.check.util * 100),
            jt.check.util != null && jt.check.util > 1 ? 'text-rose-300' : 'text-emerald-300'
          )
        : row(
            'Nødvendig senteravstand s_req',
            jt.check.sReq === Infinity ? 'ingen krav (q = 0)' : jt.check.sReq == null ? '–' : q(jt.check.sReq, 'mm', 1),
            'text-white'
          ) +
          row(
            `Utnyttelse ved s = ${q(c.spacing, 'mm', 0)}`,
            jt.check.util == null ? '–' : pct(jt.check.util * 100),
            jt.check.util != null && jt.check.util > 1 ? 'text-rose-300' : 'text-emerald-300'
          );

    return `
      <div class="rounded border border-slate-700 bg-slate-900 p-2.5 space-y-2 mb-2">
        <div class="flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:${JOINT_COLOR}"></span>
          <span class="flex-1 text-xs text-slate-200 truncate">${escapeHtml(jt.name)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 bg-slate-800 text-slate-300 shrink-0">${kindLabel}</span>
        </div>
        <div class="text-[11px] text-slate-400 leading-snug">${sidesText}</div>
        ${
          !jt.determinate
            ? `<div class="rounded border border-amber-600/60 bg-amber-950/40 text-amber-200 px-2 py-1 text-[10px] leading-snug">
                 Statisk ubestemt${jt.shareApplied != null ? ` — andel satt til ${pct(jt.shareApplied * 100)}` : ''}.
                 Rediger «Andel» i skjøtelista til venstre for å overstyre den automatiske like fordelingen.
               </div>`
            : ''
        }
        <div class="space-y-1 text-[11px]">
          ${
            res.allExisting
              ? row('q_før = V_før·ES*/EI', q(jt.qBefore, 'N/mm'), 'text-sky-300')
              : `${jt.flowBefore ? row('q_før', q(jt.qBefore, 'N/mm')) : row('q_før', 'ingen «før»-tilstand (mot ny del)', 'text-slate-500')}
                 ${row('q_etter', q(jt.qAfter, 'N/mm'))}
                 ${row('q_V,tot = |q_før| + |q_etter|', q(jt.qVtot, 'N/mm'), 'text-sky-300')}
                 ${row('q_N = ΔN/L', q(jt.qN, 'N/mm'))}
                 ${row('q_tot = q_V,tot + q_N', q(jt.qTot, 'N/mm'), 'text-white')}`
          }
          ${row('Heftbredde b', q(jt.b, 'mm', 1))}
          ${jt.tau != null ? row('τ = q_tot/b', q(jt.tau, 'N/mm²')) : ''}
          ${jt.NG != null ? row('N_G = M_etter·ES*/EI (kraft i gruppa)', q(NtokN(jt.NG), 'kN')) : ''}
          ${checkLine}
        </div>
      </div>`;
  }

  _shearLagBody(res) {
    const withVol = res.joints.filter((jt) => jt.volkersen && jt.volkersen.valid);
    const intro = `
      <p class="text-[11px] text-slate-500 leading-snug mb-2">
        q_N = ΔN/L er en <strong>middelverdi</strong>. Virkeligheten har topper i skjøteendene, fordi
        tøyningsforskjellen mellom de to delene er størst der. Volkersen-modellen kobler dem med et
        kontinuerlig skjærlag med stivhet k og gir fordelingen under.
      </p>`;
    if (!withVol.length) {
      return (
        intro +
        `<p class="text-[11px] text-slate-500 italic leading-snug">
             Ingen fordeling å vise: det kreves aksialkraft å forankre (ΔN ≠ 0, altså former på begge sider
             av skjøten der minst én er ny), en forankringslengde L &gt; 0, og en forbindelsesstivhet k &gt; 0
             (K_ser og senteravstand for skruer, G_a og t_a for lim — sveis har ingen kontinuerlig stivhet i
             denne modellen).
           </p>`
      );
    }
    const cards = withVol
      .map((jt) => {
        const v = jt.volkersen;
        return `
        <div class="rounded border border-slate-700 bg-slate-900 p-2.5 space-y-1 mb-2">
          <div class="text-xs text-slate-300">${escapeHtml(jt.name)}</div>
          <div class="space-y-1 text-[11px]">
            ${row('Forbindelsesstivhet k', q(jt.kConn, 'N/mm²'))}
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
    return intro + cards;
  }

  _derivationBody(res) {
    const s = res.section;
    const es = res.existingSection;
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

    let sectionCalc;
    if (res.allExisting) {
      sectionCalc =
        calc({
          sym: 'EA',
          formula: 'EA = Σ Eᵢ·Aᵢ',
          subst: res.parts.length ? res.parts.map((p) => `${n(p.E, 0)}·${n(p.props.A, 0)}`).join(' + ') : '0',
          result: q(es.EA, 'N', 0),
          note: 'Aksialstivheten til det eksisterende tverrsnittet (= hele tverrsnittet her, siden alt er eksisterende).',
        }) +
        calc({
          sym: 'y_c',
          formula: 'y_c = ESx / EA',
          subst: `${n(es.ESx, 0)} Nmm / ${n(es.EA, 0)} N`,
          result: q(es.yc, 'mm'),
        }) +
        calc({
          sym: 'EI_x',
          formula: 'EI_x = Σ Eᵢ·Ix0ᵢ − EA·y_c²  (Steiners sats, om nøytralaksen)',
          subst: `${n(es.EIx0, 0)} − ${n(es.EA, 0)}·${n(es.yc)}²`,
          result: q(es.EIx, 'Nmm²', 0),
        });
    } else {
      sectionCalc =
        calc({
          sym: 'EA',
          formula: 'EA = Σ Eᵢ·Aᵢ',
          subst: res.parts.length ? res.parts.map((p) => `${n(p.E, 0)}·${n(p.props.A, 0)}`).join(' + ') : '0',
          result: q(s.EA, 'N', 0),
          note: 'Aksialstivheten til hele det sammensatte tverrsnittet. E i N/mm², A i mm².',
        }) +
        calc({
          sym: 'y_c',
          formula: 'y_c = ESx / EA = Σ Eᵢ·Sxᵢ / Σ Eᵢ·Aᵢ',
          subst: `${n(s.ESx, 0)} Nmm / ${n(s.EA, 0)} N`,
          result: q(s.yc, 'mm'),
          note: 'Den E-vektede nøytralaksen — identisk med tyngdepunktet i det transformerte tverrsnittet.',
        }) +
        calc({
          sym: 'EI_x',
          formula: 'EI_x = Σ Eᵢ·Ix0ᵢ − EA·y_c²  (Steiners sats, om nøytralaksen)',
          subst: `${n(s.EIx0, 0)} − ${n(s.EA, 0)}·${n(s.yc)}²`,
          result: q(s.EIx, 'Nmm²', 0),
        }) +
        calc({
          sym: 'ΔN',
          formula: 'ΔN = N_etter · Σ_ny(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)',
          subst: `${n(l.after.N, 0)} N · ${n(res.transferNew.EA_group, 0)} / ${n(s.EA, 0)}`,
          result: q(NtokN(res.transferNew.dN), 'kN'),
          note: 'Aksialkraften fordeles etter aksialstivhet, fordi tøyningen er felles over tverrsnittet.',
        }) +
        calc({
          sym: 'q_N',
          formula: 'q_N = ΔN / L',
          subst: `${n(res.transferNew.dN, 0)} N / ${n(l.L, 0)} mm`,
          result: q(res.anchorNew.valid ? res.anchorNew.q : NaN, 'N/mm'),
          note: 'Middelverdi over forankringslengden, for HELE den nye delen samlet. Per-skjøt ΔN kan avvike — se under.',
        });
    }

    const jointCalcs = res.joints
      .map((jt) => {
        const c = jt.connector;
        let inner = '';

        if (res.allExisting) {
          inner +=
            calc({
              sym: 'ES*',
              formula: 'ES* = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c)  — halvplanet snittlinja definerer (§8), IKKE grafen',
              subst: jt.flowBefore ? `klippet mot y_c = ${n(es.yc)} mm` : '–',
              result: jt.flowBefore ? q(jt.flowBefore.EStar, 'Nmm', 0) : '–',
              note:
                'Halvplanet virker uendret på en udelt, importert profil — du trenger ikke splitte ' +
                'geometrien for å snitte i den.',
            }) +
            calc({
              sym: 'q_før',
              formula: 'q_før = V_før · ES* / EI_x     (q = dN/dx, dM/dx = V — klassisk q = VQ/I når E er lik overalt)',
              subst: jt.flowBefore
                ? `${n(l.before.V, 0)} N · ${n(jt.flowBefore.EStar, 0)} Nmm / ${n(jt.flowBefore.EI, 0)} Nmm²`
                : '–',
              result: q(jt.qBefore, 'N/mm'),
            });
        } else {
          if (jt.flowBefore) {
            inner +=
              calc({
                sym: 'ES*_før',
                formula: 'ES* = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c,eks)  — halvplanet mot KUN eksisterende geometri',
                subst: `klippet mot y_c,eks = ${n(es.yc)} mm`,
                result: q(jt.flowBefore.EStar, 'Nmm', 0),
              }) +
              calc({
                sym: 'q_før',
                formula: 'q_før = V_før · ES*_før / EI_x,eks',
                subst: `${n(l.before.V, 0)} N · ${n(jt.flowBefore.EStar, 0)} Nmm / ${n(jt.flowBefore.EI, 0)} Nmm²`,
                result: q(jt.qBefore, 'N/mm'),
              });
          }
          inner +=
            calc({
              sym: 'ES*_etter',
              formula: 'ES* = Σ_side Eᵢ·Aᵢ·(yᵢ − y_c)  — halvplanet mot HELE det sammensatte tverrsnittet',
              subst: `klippet mot y_c = ${n(s.yc)} mm`,
              result: q(jt.flowAfter.EStar, 'Nmm', 0),
            }) +
            calc({
              sym: 'q_etter',
              formula: 'q_etter = V_etter · ES*_etter / EI_x',
              subst: `${n(l.after.V, 0)} N · ${n(jt.flowAfter.EStar, 0)} Nmm / ${n(jt.flowAfter.EI, 0)} Nmm²`,
              result: q(jt.qAfter, 'N/mm'),
            }) +
            calc({
              sym: 'q_V,tot',
              formula: 'q_V,tot = |q_før| + |q_etter|',
              subst: `${n(jt.qBefore)} + ${n(jt.qAfter)}`,
              result: q(jt.qVtot, 'N/mm'),
              note: 'Superposisjon (§3): de to lasttilstandene virker på ulike tverrsnitt, og legges sammen i tallverdi.',
            }) +
            calc({
              sym: 'ΔN_i',
              formula:
                'ΔN_i = N_etter · Σ_gruppe(Eᵢ·Aᵢ) / Σ(Eⱼ·Aⱼ)   (gruppa fra GRAFEN, §8.3 — ikke halvplanet)',
              subst: `${n(l.after.N, 0)} N · ${n(jt.EA_group, 0)} / ${n(s.EA, 0)}${
                jt.shareApplied != null ? ` · andel ${n(jt.shareApplied, 3)}` : ''
              }`,
              result: q(NtokN(jt.dN), 'kN'),
              note: 'Aksialkraften som må gjennom nettopp denne skjøten — ikke nødvendigvis alt som er «ny».',
            }) +
            calc({
              sym: 'q_N',
              formula: 'q_N = ΔN_i / L',
              subst: `${n(jt.dN, 0)} N / ${n(l.L, 0)} mm`,
              result: q(jt.qN, 'N/mm'),
            }) +
            calc({
              sym: 'q_tot',
              formula: 'q_tot = q_V,tot + q_N',
              subst: `${n(jt.qVtot)} + ${n(jt.qN)}`,
              result: q(jt.qTot, 'N/mm'),
            });
        }

        if (c.kind === 'weld') {
          const explicitQrd = Number(c.qRd) > 0;
          inner +=
            calc({
              sym: 'q_Rd',
              formula: 'q_Rd = n_sveiser · a · f_vw,d     (f_vw,d hentes fra modulen weld_capacity/, regnes ikke ut her)',
              subst: explicitQrd ? `satt direkte = ${n(c.qRd)} N/mm` : `${n(c.nWelds, 0)} · ${n(c.a_weld)} · ${n(c.fvwd)}`,
              result: jt.check.qRd == null ? '–' : q(jt.check.qRd, 'N/mm'),
            }) +
            calc({
              sym: 'utnyttelse',
              formula: 'util = q_tot / q_Rd',
              subst: `${n(jt.qTot)} / ${jt.check.qRd == null ? '–' : n(jt.check.qRd)}`,
              result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
            });
        } else if (c.kind === 'glue') {
          inner +=
            calc({
              sym: 'τ',
              formula: 'τ = q_tot / b',
              subst: `${n(jt.qTot)} N/mm / ${n(jt.b, 1)} mm`,
              result: jt.tau == null ? '–' : q(jt.tau, 'N/mm²'),
            }) +
            calc({
              sym: 'utnyttelse',
              formula: 'util = τ / τ_Rd',
              subst: `${n(jt.tau)} / ${n(c.tauRd)}`,
              result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
            });
        } else {
          inner +=
            calc({
              sym: 's_req',
              formula: 's_req = rader · F_Rd · 1000 / q_tot     (F_Rd i kN, q i N/mm)',
              subst: `${n(c.rows, 0)} · ${n(c.FRd)} · 1000 / ${n(jt.qTot)}`,
              result:
                jt.check.sReq === Infinity ? 'ingen krav (q_tot = 0)' : jt.check.sReq == null ? '–' : q(jt.check.sReq, 'mm', 1),
            }) +
            calc({
              sym: 'utnyttelse',
              formula: 'util = q_tot · s / (rader · F_Rd · 1000)',
              subst: `${n(jt.qTot)} · ${n(c.spacing, 0)} / (${n(c.rows, 0)} · ${n(c.FRd)} · 1000)`,
              result: jt.check.util == null ? '–' : pct(jt.check.util * 100),
            });
        }

        if (jt.volkersen && jt.volkersen.valid) {
          const v = jt.volkersen;
          inner +=
            calc({
              sym: 'k',
              formula:
                c.kind === 'glue'
                  ? 'k = G_a · b / t_a     [(N/mm²)·mm/mm = N/mm²]'
                  : 'k = K_ser · rader / s     [(N/mm)·(1/mm) = N/mm²]',
              subst:
                c.kind === 'glue'
                  ? `${n(c.Ga, 0)} · ${n(jt.b, 1)} / ${n(c.ta)}`
                  : `${n(c.Kser, 0)} · ${n(c.rows, 0)} / ${n(c.spacing, 0)}`,
              result: q(jt.kConn, 'N/mm²'),
            }) +
            calc({
              sym: 'λ',
              formula: 'λ = √( k · (1/α + 1/β) ),  α = (EA)_øvrig, β = (EA)_gruppe',
              subst: `√(${n(jt.kConn)} · (1/${n(jt.EA_other, 0)} + 1/${n(jt.EA_group, 0)}))`,
              result: q(v.lambda, '1/mm', 6),
            }) +
            calc({
              sym: 'q_max',
              formula: 'q(x) = (P·λ/2)·[cosh(λx′)/sinh(λL/2) + ((α−β)/(α+β))·sinh(λx′)/cosh(λL/2)],  x′ = x − L/2',
              subst: `maks |q| over x ∈ [0, ${n(l.L, 0)} mm], med P = ${n(Math.abs(jt.dN), 0)} N`,
              result: q(v.qMax, 'N/mm'),
              note: `Toppfaktor q_max/q_avg = ${n(v.peakFactor, 3)}. Integralet av q over skjøten er per konstruksjon lik P.`,
            });
        }

        return group(jt.id, escapeHtml(jt.name), inner);
      })
      .join('');

    return (
      group('section', res.allExisting ? 'Tverrsnittet (eksisterende)' : 'Tverrsnittet og aksialkraften', sectionCalc) +
      jointCalcs +
      `<div class="rounded border border-slate-700 bg-slate-900 p-2.5 text-[11px] text-slate-400 leading-snug space-y-1.5">
           <div class="text-slate-300 font-medium">Forutsetninger</div>
           <ul class="list-disc list-inside space-y-1">
             <li><strong>Full samvirkning</strong> mellom delene: tverrsnittet forblir plant, og det er
               ingen glidning i skjøten. Skjærstrømmen er nettopp den kraften forbindelsen må ta for at
               dette skal holde.</li>
             <li><strong>Lineær elastisitet</strong>: σ = E·ε i alle deler, med E fra materialvalget.
               Ingen riss, ingen flyt, ingen kryp — skal du regne langtid, sett inn en redusert E selv.</li>
             <li>«Før»-kreftene gjelder det <strong>eksisterende</strong> tverrsnittet alene, «etter»-
               kreftene det <strong>sammensatte</strong>. Er alt merket eksisterende, finnes bare «før».</li>
             <li>Naboskap uten en skjøt regnes som stivt forbundet: former som berører eller overlapper
               hverandre og ikke har en skjøt mellom seg, oppfører seg som støpt sammen.</li>
             <li>Vektfaktoren <code>factor</code> påvirker bare tyngdepunktsfanen. Her brukes bare
               <code>material.E</code>.</li>
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
      el.addEventListener('change', () => {
        const parts = path.split('.');
        if (parts[0] !== 'loads') return;
        const v = Number(el.value);
        const val = Number.isFinite(v) ? v : 0;
        if (parts[1] === 'L') {
          store.setLoads({ L: val });
        } else if (parts[1] === 'before' || parts[1] === 'after') {
          store.setLoads({ [parts[1]]: { [parts[2]]: val } });
        }
      });
    });

    host.querySelectorAll('[data-rf-act]').forEach((el) => {
      el.addEventListener('click', () => {
        if (el.dataset.rfAct === 'copy') this.onCopy();
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
    const lines = [res.allExisting ? 'KONTROLL AV EKSISTERENDE KONSTRUKSJON' : 'FORSTERKNING — to lasttilstander'];
    if (res.allExisting) {
      lines.push(`Last: V_før = ${res.loads.before.V_kN} kN, N_før = ${res.loads.before.N_kN} kN, M_før = ${res.loads.before.M_kNm} kNm`);
    } else {
      const c = res.comparison;
      lines.push(
        `Før:   V = ${res.loads.before.V_kN} kN, N = ${res.loads.before.N_kN} kN, M = ${res.loads.before.M_kNm} kNm`,
        `Etter: V = ${res.loads.after.V_kN} kN, N = ${res.loads.after.N_kN} kN, M = ${res.loads.after.M_kNm} kNm, L = ${n(res.loads.L, 0)} mm`,
        '',
        'Effekt av forsterkningen',
        `  EA:    ${n(c.EA0, 0)} N  ->  ${n(c.EA1, 0)} N   (${c.ratios.EA == null ? '–' : pct((c.ratios.EA - 1) * 100)})`,
        `  EI_x:  ${n(c.EIx0, 0)} Nmm2  ->  ${n(c.EIx1, 0)} Nmm2   (${c.ratios.EIx == null ? '–' : pct((c.ratios.EIx - 1) * 100)})`,
        `  y_c:   ${n(c.yc0)} mm  ->  ${n(c.yc1)} mm`,
        '',
        `Aksialfordeling: DeltaN til nye deler = ${n(NtokN(res.transferNew.dN))} kN, q_N (middel) = ${n(res.anchorNew.q)} N/mm`
      );
    }
    for (const jt of res.joints) {
      lines.push('');
      lines.push(`${jt.name}`);
      if (res.allExisting) {
        lines.push(`  q_foer = ${n(jt.qBefore)} N/mm`);
      } else {
        lines.push(`  q_foer = ${n(jt.qBefore)} N/mm   q_etter = ${n(jt.qAfter)} N/mm   q_V,tot = ${n(jt.qVtot)} N/mm`);
        lines.push(`  q_N = ${n(jt.qN)} N/mm   q_tot = ${n(jt.qTot)} N/mm`);
      }
      lines.push(`  b = ${n(jt.b, 1)} mm    tau = ${jt.tau == null ? '-' : n(jt.tau)} N/mm2   forbindelse: ${jt.connector.kind}`);
      if (jt.check.kind === 'screw') {
        lines.push(
          `  s_req = ${jt.check.sReq === Infinity ? 'ingen krav' : n(jt.check.sReq, 1) + ' mm'}` +
            `   utnyttelse ved s = ${n(jt.connector.spacing, 0)} mm: ${jt.check.util == null ? '-' : pct(jt.check.util * 100)}`
        );
      } else {
        lines.push(`  utnyttelse: ${jt.check.util == null ? '-' : pct(jt.check.util * 100)}`);
      }
      if (jt.volkersen && jt.volkersen.valid) {
        lines.push(
          `  Volkersen: lambda = ${n(jt.volkersen.lambda, 6)} 1/mm, q_max = ${n(jt.volkersen.qMax)} N/mm, toppfaktor ${n(jt.volkersen.peakFactor, 3)}`
        );
      }
    }
    lines.push('');
    lines.push('Forutsetninger: full samvirkning, lineaer elastisitet. Naboskap uten skjot regnes stivt forbundet.');
    lines.push('Beregningen er iterativ i praksis - ny geometri gir ny stivhet og nye krefter.');
    return lines.join('\n');
  }
}
