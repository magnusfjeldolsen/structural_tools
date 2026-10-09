/**
 * reinforcement-ui.js — «Forsterkning»-fanen: lastene i venstre panel,
 * kreftene i skjøtene og effekten på tverrsnittet i høyre.
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
  axialInGroup,
  shearFlowBiaxial,
  axesComparison,
  gammaMethod,
  fastenerForce,
  anchorFlow,
  volkersen,
  connectorStiffness,
  connectorCheck,
  kNtoN,
  kNmToNmm,
  NtokN,
} from './reinforcement.js';
import { slipModulus, interfaceStiffness } from './connection-stiffness.js';
import { materialRho } from './materials.js';
import { derivationModel, DERIVATION_ASSUMPTIONS, sci, n, q, pct } from './derivation.js';
import {
  sidesOfJoint,
  buildGraph,
  jointGroup,
  danglingShapes,
  overConstrained,
  fullSectionParts,
  halfPlaneParts,
  jointContactLength,
} from './joints.js';
import { JOINT_COLOR } from './store.js';

/* ------------------------------------------------------------------ *
 * Tallformatering
 * ------------------------------------------------------------------ */

/*
 * Formatererne bor i `derivation.js`, ikke her. Grunnen er at utledningen må
 * kunne lastes uten importer (testriggen laster moduler som `data:`-URL), og
 * da må tallformateringen ligge i den fila som ikke importerer noe. De
 * re-eksporteres herfra slik at panelets offentlige API er uendret.
 */
export { sci, n, q };

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ *
 * §14.1 — ρ_m per del, ikke per skjøt
 * ------------------------------------------------------------------ *
 * Densiteten er en egenskap ved TREET, ikke ved skjøten. Den skulle derfor
 * ikke skrives inn på nytt for hver eneste skjøt. `shape.material.rho` er
 * kilden; skjøtens egne ρ-felt er overstyringen.
 *
 * DEN UKRENKELIGE REGELEN: et tall brukeren har skrevet inn vinner ALLTID.
 * Auto-utledningen fyller bare tomme felt, og den skriver alltid fra seg hvor
 * tallet kom fra — et tall som dukker opp av seg selv i en beregning som skal
 * signeres, må kunne spores tilbake til noe.
 */

/** Er dette et tall brukeren faktisk har oppgitt? Tomt felt gir `''` ⟹ nei. */
function givenNumber(v) {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : null;
}

/**
 * Laveste ρ_m blant formene på én side av skjøten.
 *
 * Er det flere former med ulik densitet på samme side, velges den LAVESTE.
 * Det er konservativt for `K_ser` (som går som ρ^1,5), altså gir lavere
 * samvirkegrad og større beregnet nedbøyning — den trygge veien når verktøyet
 * må gjette. At det ble gjettet, står i `multi`, og skrives ut i fanen.
 *
 * @param {string[]} ids Formene på siden (`sides.aSide` / `sides.bSide`)
 * @param {Map<string, Object>} byId
 * @returns {{rho: number, label: string, shape: string, multi: boolean}|null}
 */
function sideRho(ids, byId) {
  const found = [];
  for (const id of ids || []) {
    const s = byId.get(id);
    if (!s) continue;
    const r = materialRho(s.material);
    if (r === undefined) continue;
    found.push({ rho: r, label: (s.material && s.material.name) || '', shape: s.name || String(id) });
  }
  if (!found.length) return null;
  let best = found[0];
  for (const f of found) if (f.rho < best.rho) best = f;
  const multi = found.some((f) => Math.abs(f.rho - best.rho) > 1e-9);
  return { ...best, multi };
}

function num(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}


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
  // §1 — nøytralakse og hovedakser, eksisterende → sammensatt, med
  // skjevbøyningsadvarselen (§1.2). Ett kall gir hele tabellen.
  const axes = axesComparison({ existing: existingSection, combined: section });

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

  // Biaksiell lastmodell (§1 i samvirkeplanen): hver tilstand er
  // {Vy, Vx, N, Mx, My}. `Vy_kN` osv. er visningsverdiene (kN/kNm, det
  // brukeren taster inn); de umerkede feltene er N/Nmm, det mekanikken vil ha.
  const rawLoads = state.loads || {};
  const beforeRaw = rawLoads.before || {};
  const afterRaw = rawLoads.after || {};
  const bridgeLoadState = (raw) => ({
    Vy_kN: num(raw.Vy), Vx_kN: num(raw.Vx), N_kN: num(raw.N), Mx_kNm: num(raw.Mx), My_kNm: num(raw.My),
    Vy: kNtoN(num(raw.Vy)), Vx: kNtoN(num(raw.Vx)), N: kNtoN(num(raw.N)),
    Mx: kNmToNmm(num(raw.Mx)), My: kNmToNmm(num(raw.My)),
  });
  const loads = {
    before: bridgeLoadState(beforeRaw),
    after: bridgeLoadState(afterRaw),
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
      flowBefore = shearFlowBiaxial({ Vy: loads.before.Vy, Vx: loads.before.Vx, groupParts: halfBefore, section: existingSection });
      qBefore = flowBefore.valid ? flowBefore.qAbs : 0;
    }

    let flowAfter = null;
    let qAfter = 0;
    let halfAfterParts = null;
    if (!allExisting) {
      halfAfterParts = halfPlaneParts(jm, shapesMm, 1);
      flowAfter = shearFlowBiaxial({ Vy: loads.after.Vy, Vx: loads.after.Vx, groupParts: halfAfterParts, section });
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

    // Standard heftbredde er lengden av linjas SNITT med tverrsnittet, ikke
    // lengden av den tegnede linja — se `jointContactLength`. Et overheng
    // gjorde ellers τ = q/b for lav, alltid til gunst for konstruksjonen.
    const contactMm = jointContactLength(jm, shapesMm);
    const bMm = Number.isFinite(raw.bondWidth) && raw.bondWidth > 0
      ? raw.bondWidth
      : (contactMm > 0 ? contactMm : lenMm);
    const connector = raw.connector || {};
    const check = connectorCheck({ q: qTot, bondWidth: bMm, connector });

    // §3 — festemiddelstivheten K_ser: EC5 tabell 7.1 og «fritt innlagt»
    // (ETA/produktgodkjenning) er likestilte kilder (kun aktuelt for skruer/
    // mekaniske forbindere — lim har sin egen formel, sveis regnes stiv).
    // `stiffSource` mangler på gamle/nye skjøter ⟹ 'eta', som er nøyaktig det
    // det rå `Kser`-feltet alltid har betydd — ingen stille atferdsendring.
    const stiffState = connector.state === 'ULS' ? 'ULS' : 'SLS';

    // §14.1 — ρ_m hentes fra delene skjøten faktisk treffer, men BARE inn i
    // felt brukeren har latt stå tomme. `sides.aSide`/`sides.bSide` er samme
    // kilde som `aNames`/`bNames`, så det som står i «fra materialet X i Y» er
    // nøyaktig den formen skjøten ligger inntil.
    let rhoSource = null;
    let rho1 = givenNumber(connector.ec5Rho1);
    let rho2 = givenNumber(connector.ec5Rho2);
    if (connector.kind === 'screw') {
      const derA = rho1 == null ? sideRho(sides.aSide, shapeByIdMm) : null;
      const derB = rho2 == null ? sideRho(sides.bSide, shapeByIdMm) : null;
      const a = { kind: rho1 != null ? 'input' : derA ? 'material' : 'none', value: rho1 != null ? rho1 : derA ? derA.rho : null,
        label: derA ? derA.label : '', shape: derA ? derA.shape : '', multi: !!(derA && derA.multi) };
      const b = { kind: rho2 != null ? 'input' : derB ? 'material' : 'none', value: rho2 != null ? rho2 : derB ? derB.rho : null,
        label: derB ? derB.label : '', shape: derB ? derB.shape : '', multi: !!(derB && derB.multi) };
      rho1 = a.value;
      rho2 = b.value;
      // `meanDensity()` krever at ρ₁ finnes: den regner √(ρ₁·ρ₂) og gir NaN
      // uten den første. Har bare B-siden en densitet (A er stål, eller linja
      // stikker ut i lufta), er det riktige ett treslag med B sin verdi — ikke
      // et ugyldig geometrisk middel av «ingenting» og 350.
      if (rho1 == null && rho2 != null) {
        rhoSource = { a: b.kind, aValue: b.value, aLabel: b.label, aShape: b.shape, aMulti: b.multi,
          b: 'none', bValue: null, bLabel: '', bShape: '', bMulti: false, swapped: true };
        rho1 = rho2;
        rho2 = null;
      } else {
        rhoSource = { a: a.kind, aValue: a.value, aLabel: a.label, aShape: a.shape, aMulti: a.multi,
          b: b.kind, bValue: b.value, bLabel: b.label, bShape: b.shape, bMulti: b.multi, swapped: false };
      }
    }

    const slip = connector.kind === 'screw'
      ? slipModulus(
          connector.stiffSource === 'ec5'
            ? {
                source: 'ec5',
                fastener: connector.ec5Fastener || 'dowel',
                rho1: rho1 == null ? undefined : rho1,
                rho2: rho2 == null ? undefined : rho2,
                d: connector.ec5D,
                dc: connector.ec5Dc,
                contact: connector.ec5Contact || 'timber-timber',
                state: stiffState,
              }
            : { source: 'eta', Kser: connector.Kser, state: stiffState }
        )
      : null;
    // Én stivhet inn i BÅDE Volkersen og γ-metoden (§3.3) — ikke to ulike K.
    const ifStiff = interfaceStiffness({ connector, bondWidth: bMm, slip });
    const kConn =
      connector.kind === 'screw' && slip && slip.valid
        ? connectorStiffness({ ...connector, Kser: slip.K }, bMm)
        : connectorStiffness(connector, bMm);
    const tau = bMm > 0 ? qTot / bMm : null;

    const groupNewParts = sectionParts.filter((p) => groupNewIds.includes(p.id));
    const groupSection = sectionEA(groupNewParts);
    const EA_group = groupSection.EA;
    const EA_other = section.EA - EA_group;
    const vol =
      !allExisting && Math.abs(dN) > 0 && loads.L > 0 && EA_group > 0 && EA_other > 0 && kConn > 0
        ? volkersen({ P: Math.abs(dN), L: loads.L, k: kConn, EA1: EA_other, EA2: EA_group, samples: 201 })
        : null;

    // §4 — samvirkegrad, γ-metoden, topartstilfellet: [resten av tverrsnittet,
    // den nye gruppa akkurat denne skjøten fører kraft til]. Enakslet (y):
    // gammaMethod er utledet for én akse, og verktøyet er skjevt bevisst om
    // det — se advarselen i «Effekt av forsterkningen» når EI_xy ≠ 0.
    let gamma = null;
    if (!allExisting && groupNewIds.length && ifStiff.valid) {
      const otherParts = sectionParts.filter((p) => !groupNewIds.includes(p.id));
      gamma = gammaMethod({
        groups: [otherParts, groupNewParts],
        ids: ['eksisterende', 'ny'],
        k: ifStiff.k,
        span: connector.span,
        system: connector.system || 'simple',
        axis: 'y',
        V: loads.after.Vy,
      });
    }

    // §4.1 — kraft per festemiddel: full samvirkning (standard) VED SIDEN AV
    // γ-resultatet, aldri en stille erstatning. Bare meningsfullt for
    // diskrete festemidler (skruer) — lim/sveis har sine egne q_Rd-kontroller.
    const fastenerFull =
      connector.kind === 'screw'
        ? fastenerForce({ q: qTot, spacing: connector.spacing, rows: connector.rows, shearPlanes: connector.shearPlanes, FRd: connector.FRd })
        : null;
    const fastenerGamma =
      fastenerFull && gamma && gamma.applicable && gamma.valid
        ? fastenerForce({ q: gamma.q, spacing: connector.spacing, rows: connector.rows, shearPlanes: connector.shearPlanes, FRd: connector.FRd })
        : null;

    // §8.2, snudd — forankring i enden gir NØDVENDIG kapasitet, ikke en
    // kontroll mot en antatt kapasitet: verktøyets jobb er å si hvor sterk
    // forbindelsen må være, ikke om en gjettet skjøtekapasitet holder.
    // To UAVHENGIGE kriterier, aldri lagt sammen (§4 i tilbakemeldingen):
    //   - q_tot   — den lokale skjærstrømmen (over): V + den løpende
    //     aksialfordelingen ΔN_i/L. Momentet gir INGEN eget ledd her —
    //     q = dN_G/dz = V·ES*/EI ER allerede momentets virkning.
    //   - q_req = N_G/L — middelverdien N_G (fra BIAKSIELL bøyning via
    //     `axialInGroup`, ikke den gamle M·ES*/EI som bare var riktig når
    //     EI_xy = 0) må leveres over HELE forankringssonen L.
    // Det STØRSTE av de to styrer nødvendig forbinderkraft F_Ed = q·L/n,
    // fordelt på `n` forbindere brukeren oppgir (bare et antall — rader,
    // senteravstand og kantavstander er brukerens jobb, ikke dette verktøyets).
    // Dimensjonerende kapasitet F_Rd er VALGFRI: oppgitt viser vi utnyttelse,
    // tom viser vi bare F_Ed — det normale, ikke et unntak.
    let anchorReq = null;
    if (!allExisting && halfAfterParts) {
      const ng = axialInGroup({ Mx: loads.after.Mx, My: loads.after.My, groupParts: halfAfterParts, section });
      const reqFlow = ng.valid ? anchorFlow({ dN: ng.NG, L: loads.L }) : null;
      const qReq = reqFlow && reqFlow.valid ? Math.abs(reqFlow.q) : null;
      const qGoverning = Math.max(qTot, qReq || 0);
      const governedByMoment = qReq != null && qReq > qTot;
      const nRaw = Number(connector.anchorN);
      const n_ = Number.isFinite(nRaw) && nRaw > 0 ? nRaw : null;
      const FEd = n_ && loads.L > 0 ? NtokN((qGoverning * loads.L) / n_) : null;
      const capRaw = Number(connector.anchorFRd);
      const FRdCap = Number.isFinite(capRaw) && capRaw > 0 ? capRaw : null;
      const util = FEd != null && FRdCap ? FEd / FRdCap : null;
      anchorReq = {
        NG: ng.valid ? ng.NG : 0,
        NG_kN: ng.valid ? ng.NG / 1000 : 0,
        qTot,
        qReq,
        qGoverning,
        governedByMoment,
        L: loads.L,
        n: n_,
        FEd,
        FRdCap,
        util,
        valid: ng.valid,
      };
    }

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
      slip,
      rhoSource,
      ifStiff,
      gamma,
      fastenerFull,
      fastenerGamma,
      anchorReq,
      EA_group,
      EA_other,
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
      text: 'Sammensatt EIₓ er tilnærmet null. Skjærstrømmen kan ikke regnes ut; sjekk geometrien.',
    });
  }
  if (axes.introducedSkew) {
    warnings.push({
      level: 'warn',
      short: 'Skjev bøyning innført — kontroller lasten i begge plan.',
      text:
        'Forsterkningen har innført SKJEV BØYNING som ikke fantes før (EI_xy ≈ 0 før, tydelig ' +
        'forskjellig fra null etter) — se «Effekt av forsterkningen». Et rent M_x gir nå også ' +
        'utbøyning sidevegs; lasten må kontrolleres i begge plan.',
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
    // En skjøt mot ny del har ingen «før»-tilstand: før forsterkningen ble
    // montert fantes ikke den nye delen, og ingen skjærstrøm krysset fugen.
    // Det er riktig å se bort fra V_før her — men brukeren har tastet inn en
    // skjærkraft, og skal ikke måtte gjette hvorfor den ikke dukker opp noe
    // sted. Uten denne meldingen forsvinner den i en grå merknad, og man
    // sitter igjen med bare aksialbidraget uten å skjønne hvorfor.
    if (!jt.existingOnly && (Math.abs(loads.before.Vy) > 0 || Math.abs(loads.before.Vx) > 0)) {
      warnings.push({
        level: 'warn',
        short: `${escapeHtml(jt.name)}: V_før gir ingen skjærstrøm mot en ny del.`,
        text:
          `${escapeHtml(jt.name)}: V_y,før = ${q(NtokN(loads.before.Vy), 'kN')}, V_x,før = ` +
          `${q(NtokN(loads.before.Vx), 'kN')} gir ingen skjærstrøm her, fordi den nye delen ikke ` +
          'fantes da den lasten sto på. Virker skjærkraften på det forsterkede tverrsnittet, hører ' +
          'den hjemme i «etter».',
      });
    }
  }
  // Motsatt felle: alt er tastet inn under «etter», men ingen skjærkraft der,
  // så q_V blir null overalt selv om brukeren tror skjærkraften er med.
  const noShearBefore = Math.abs(loads.before.Vy) === 0 && Math.abs(loads.before.Vx) === 0;
  const noShearAfter = Math.abs(loads.after.Vy) === 0 && Math.abs(loads.after.Vx) === 0;
  if (!allExisting && noShearAfter && noShearBefore && joints.length) {
    warnings.push({
      level: 'info',
      text: 'Ingen skjærkraft er lagt inn, så skjøtene får bare aksialbidraget q_N = ΔN/L.',
    });
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
      short: `«${escapeHtml(names)}» er festet med flere skjøter — statisk ubestemt, lik fordeling.`,
      text:
        `«${escapeHtml(names)}» er festet med flere skjøter samtidig (${escapeHtml(jn)}) — statisk ubestemt. ` +
        'Fordelingen er satt lik mellom dem som utgangspunkt; overstyr med «Andel» på hver skjøt i skjøtelista om nødvendig.',
    });
  }
  if (!allExisting && loads.L <= 0 && (Math.abs(loads.after.N) > 0 || joints.length)) {
    warnings.push({
      level: 'warn',
      short: 'L ≤ 0 — q_N settes til null.',
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
    axes,
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

/** Ren tekst til `title`-attributtet: advarslene kan inneholde <strong> o.l. */
function stripTags(html) {
  return String(html).replace(/<[^>]*>/g, '');
}

function row(label, value, cls = 'text-slate-200') {
  return `<div class="flex justify-between gap-2">
    <span class="text-slate-400">${label}</span>
    <span class="${cls} num">${value}</span>
  </div>`;
}

/**
 * §14.1 — hvor hver ρ_m kom fra, skrevet ut.
 *
 * «ρ₁ = 350 kg/m³ (fra materialet C24 i Steg)» mot «ρ₁ = 380 kg/m³ (oppgitt)».
 * Poenget er ikke pynt: en verdi verktøyet fant selv, i en beregning som skal
 * signeres, må kunne spores tilbake til den delen den kom fra. Uten denne
 * linja ville brukeren ikke kunne se forskjell på et tall han selv skrev og et
 * tall programmet gjettet.
 */
function rhoSourceHtml(rs) {
  if (!rs) return '';
  const line = (sym, kind, value, label, shape, multi) => {
    if (kind === 'none') return '';
    const origin =
      kind === 'input'
        ? 'oppgitt'
        : `fra materialet ${escapeHtml(label || '—')} i ${escapeHtml(shape || '—')}`;
    const warn = multi
      ? ' <span class="text-amber-300">Flere deler på denne siden har ulik ρ_m — den laveste er brukt (konservativt for K_ser).</span>'
      : '';
    return `<p class="text-[10px] text-slate-500 leading-snug">${sym} = ${n(value, 0)} kg/m³ (${origin})${warn}</p>`;
  };
  return (
    line('ρ₁', rs.a, rs.aValue, rs.aLabel, rs.aShape, rs.aMulti) +
    line('ρ₂', rs.b, rs.bValue, rs.bLabel, rs.bShape, rs.bMulti)
  );
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

/**
 * Et lastfelt (§9.2 punkt 4): etiketten skal si hva størrelsen BETYR, ikke
 * bare symbolet — «M_x,etter [kNm] — om x-aksen, positiv gir strekk i
 * overkant», ikke bare «M_x». `desc` er den korte forklaringen.
 */
function loadField(path, sym, unit, desc, value, attrs = '') {
  const id = `rf-${path.replace(/[^\w-]/g, '_')}`;
  return `<div>
    <label class="block mb-0.5" for="${id}">
      <span class="text-[11px] text-slate-300">${sym} <span class="text-slate-500">[${unit}]</span></span>
      <span class="block text-[9px] text-slate-500 leading-snug">${desc}</span>
    </label>
    <input id="${id}" data-rf="${path}" data-focus-key="${id}" type="number" ${attrs}
           value="${Number.isFinite(value) ? value : ''}" />
  </div>`;
}

/**
 * §9 — akse- og fortegnskonvensjonene, som inline SVG + tabell. Brukt BÅDE i
 * den sammenleggbare seksjonen i «Forsterkning»-fanen og i hjelpedialogen
 * (ui.js injiserer denne samme HTML-en der), slik at innholdet ikke skrives
 * to ganger og kan gli fra hverandre.
 *
 * Figuren viser tverrsnittsplanet (x mot høyre, y opp), bjelkeaksen z ut av
 * planet (ring med prikk — N virker samme vei), og positiv retning for
 * V_y, V_x, M_x (kurvet pil ved overkant) og M_y (kurvet pil ved høyre kant).
 * Fargevalget er bevisst distinkt fra JOINT_COLOR (#2dd4bf), så figuren ikke
 * kan forveksles med en skjøtelinje.
 */
export function axisConventionHtml() {
  return `
    <div class="space-y-2">
      <svg viewBox="0 0 300 210" class="w-full h-auto" role="img"
           aria-label="Akse- og fortegnskonvensjoner: tverrsnittsplanet med x mot høyre, y opp, bjelkeaksen z ut av planet, og positive retninger for N, V_y, V_x, M_x og M_y">
        <rect x="0" y="0" width="300" height="210" fill="#0f172a" rx="6" />
        <rect x="60" y="30" width="180" height="150" rx="4" fill="#1e293b" stroke="#475569" stroke-width="1" />

        <!-- x-akse -->
        <line x1="30" y1="105" x2="262" y2="105" stroke="#94a3b8" stroke-width="1.4" />
        <polygon points="266,105 257,101 257,109" fill="#94a3b8" />
        <text x="271" y="109" fill="#cbd5e1" font-size="13" font-style="italic">x</text>

        <!-- y-akse -->
        <line x1="150" y1="192" x2="150" y2="23" stroke="#94a3b8" stroke-width="1.4" />
        <polygon points="150,19 146,28 154,28" fill="#94a3b8" />
        <text x="155" y="17" fill="#cbd5e1" font-size="13" font-style="italic">y</text>

        <!-- z ut av planet (mot betrakteren) -- N virker samme vei -->
        <circle cx="150" cy="105" r="6" fill="none" stroke="#e2e8f0" stroke-width="1.4" />
        <circle cx="150" cy="105" r="1.6" fill="#e2e8f0" />
        <text x="160" y="98" fill="#e2e8f0" font-size="10">z, N (+ = strekk)</text>

        <!-- V_y: loddrett tverrkraft -->
        <line x1="205" y1="150" x2="205" y2="76" stroke="#38bdf8" stroke-width="2" />
        <polygon points="205,72 200,81 210,81" fill="#38bdf8" />
        <text x="210" y="86" fill="#38bdf8" font-size="11">V_y</text>

        <!-- V_x: vannrett tverrkraft -->
        <line x1="103" y1="58" x2="177" y2="58" stroke="#fbbf24" stroke-width="2" />
        <polygon points="181,58 172,53 172,63" fill="#fbbf24" />
        <text x="180" y="52" fill="#fbbf24" font-size="11">V_x</text>

        <!-- M_x: kurvet pil ved overkant (positiv gir strekk i overkant) -->
        <path d="M 88,46 Q 130,22 172,46" fill="none" stroke="#34d399" stroke-width="2" />
        <polygon points="176,49 166,46 170,55" fill="#34d399" />
        <text x="116" y="17" fill="#34d399" font-size="11">M_x</text>

        <!-- M_y: kurvet pil ved høyre kant (positiv gir strekk på høyre side) -->
        <path d="M 252,64 Q 275,105 252,146" fill="none" stroke="#e879f9" stroke-width="2" />
        <polygon points="248,150 253,140 259,148" fill="#e879f9" />
        <text x="260" y="108" fill="#e879f9" font-size="11">M_y</text>
      </svg>
      <p class="text-[10px] text-slate-500 leading-snug">
        Tverrsnittsplanet sett langs bjelken, mot deg: x mot høyre, y opp, z (bjelkeaksen) ut av
        skjermen. Pilene viser <strong>positiv</strong> retning for hver størrelse.
      </p>
      <div class="overflow-x-auto">
        <table class="w-full text-[11px]">
          <thead><tr class="text-slate-500">
            <th class="text-left font-normal py-1 pr-2">Størrelse</th>
            <th class="text-left font-normal py-1">Definisjon</th>
          </tr></thead>
          <tbody class="text-slate-300">
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400 whitespace-nowrap">Tverrsnittsplanet</td><td class="py-1">x mot høyre, y opp</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400 whitespace-nowrap">Bjelkeaksen</td><td class="py-1">z, ut av skjermen, mot betrakteren</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">N</td><td class="py-1">positiv = <strong>strekk</strong></td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">M_x</td><td class="py-1">∫σ·y dA — positiv gir strekk i <strong>overkant</strong> (y &gt; 0)</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">M_y</td><td class="py-1">∫σ·x dA — positiv gir strekk på <strong>høyre side</strong> (x &gt; 0)</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">V_y</td><td class="py-1">hører sammen med M_x: dM_x/dz = V_y</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">V_x</td><td class="py-1">hører sammen med M_y: dM_y/dz = V_x</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">q</td><td class="py-1">fortegn viser bare hvilken vei kraften går; kapasitet kontrolleres mot |q|</td></tr>
            <tr class="border-t border-slate-700/60"><td class="py-1 pr-2 text-slate-400">θ</td><td class="py-1">mot klokka fra x-aksen til hovedaksen med størst stivhet, i (−90°, 90°]</td></tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-amber-200 leading-snug">
        <strong>Merk avviket for M_y:</strong> definisjonen over er ∫σ·x dA — <em>ikke</em> −∫σ·x dA,
        som er den vanlige bjelkekonvensjonen. Valget gjør stivhetsmatrisen symmetrisk,
        [M_x; M_y] = [[EI_x, EI_xy], [EI_xy, EI_y]]·[κ_x; κ_y], og fjerner en fortegnsfelle i
        utledningen (se reinforcement.js). Henter du M_y fra et rammeprogram med motsatt
        konvensjon, <strong>må du snu fortegnet</strong> før du taster det inn her.
      </p>
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
    /** Lastene står i venstre panel — input til venstre, output til høyre. */
    this.inputHostId = deps.inputHostId || 'rf-inputs';
    /** Siste utregning — også nyttig for feilsøking via `window.__gw`. */
    this.result = null;
    /** Åpne «Utregning»-grupper, nøkkel = skjøt-id eller 'section'. */
    this.openCalc = new Set(['section']);
    /** Om «Detaljer» står åpen — overlever at panelet tegnes på nytt. */
    this.detailsOpen = false;
    /** Musepekeren over en rad lyser opp skjøten i lerretet. */
    this.onHoverJoint = deps.onHoverJoint || (() => {});
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
      const input = document.getElementById(this.inputHostId);
      if (input) input.innerHTML = '';
      return;
    }

    // Ingen løpende tekst her: tabeller med tall, advarsler på én linje
    // (full forklaring i `title`), og alt som er bakgrunn sammenlagt under
    // «Detaljer». Forklaringene står i hjelpedialogen.
    const details = [
      !res.allExisting && H('Aksialfordeling', this._axialBody(res)),
      !res.allExisting && H('Shear lag (Volkersen)', this._shearLagBody(res)),
      this._slipBody(res),
      H('Utregning', this._derivationBody(res)),
      this._notes(res),
    ]
      .filter(Boolean)
      .join('');

    host.innerHTML = [
      H(
        'Krefter i skjøtene',
        this._warnings(res) + this._forcesTable(res),
        `<button data-rf-act="copy"
                 class="px-2 py-0.5 text-[11px] bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 shrink-0">
           Kopier
         </button>`
      ),
      !res.allExisting && H('Tverrsnitt før → etter', this._sectionTable(res)),
      `<details class="rounded border border-slate-700 bg-slate-900/60" data-rf-details ${this.detailsOpen ? 'open' : ''}>
         <summary class="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
           <span class="chev text-slate-500" style="display:inline-block">›</span>
           Detaljer: ${res.allExisting ? '' : 'aksialfordeling · Volkersen · '}utregning
         </summary>
         <div class="px-2.5 pb-2.5 pt-1 space-y-3">${details}</div>
       </details>`,
    ]
      .filter(Boolean)
      .join('');

    const input = document.getElementById(this.inputHostId);
    if (input) input.innerHTML = H('Last', this._loadsBody(res));

    this._bind();
  }

  /* ---------------- seksjonene ---------------- */

  _warnings(res) {
    const list = (res && res.warnings ? res.warnings : []).filter((w) => w.level === 'warn');
    if (!list.length) return '';
    return `<div class="space-y-1 mb-2">${list
      .map(
        (w) => `<div class="flex items-start gap-1.5 text-[11px] text-amber-200 leading-snug" title="${escapeHtml(stripTags(w.text))}">
            <span class="shrink-0">⚠</span><span>${w.short || w.text}</span>
          </div>`
      )
      .join('')}</div>`;
  }

  /** Merknadene (nivå «info») — bakgrunn, ikke advarsler, så de står under «Detaljer». */
  _notes(res) {
    const list = res.warnings.filter((w) => w.level !== 'warn');
    if (!list.length) return '';
    return H(
      'Merknader',
      `<ul class="list-disc list-inside space-y-1 text-[11px] text-slate-400 leading-snug">${list
        .map((w) => `<li>${w.text}</li>`)
        .join('')}</ul>`
    );
  }

  /**
   * Alle skjøtene i én tabell — én rad per skjøt, ingen å velge mellom.
   * q i N/mm, som er det samme tallet som kN/m. Raden lyser opp skjøten i
   * lerretet når musa står over den.
   */
  _forcesTable(res) {
    const list = res.joints;
    if (!list.length) {
      return `<p class="text-[11px] text-slate-500 italic">Ingen skjøter — tegn dem i «Geometri» (<kbd class="px-1 bg-slate-700 rounded">G</kbd>).</p>`;
    }
    const v = (x, dec = 1) => (x == null || !Number.isFinite(x) ? '–' : n(x, dec));
    const anyGamma = list.some((jt) => jt.gamma && jt.gamma.applicable);
    const th = (t, title = '') =>
      `<th class="text-right font-normal py-1 pl-2 whitespace-nowrap" ${title ? `title="${title}"` : ''}>${t}</th>`;

    const head = res.allExisting
      ? `${th('q', 'q = V·ES*/EI')}`
      : `${th('q_før', 'Fra V før, på det eksisterende tverrsnittet. – = mot ny del (fantes ikke da)')}
         ${th('q_etter', 'Fra V etter, på det sammensatte tverrsnittet')}
         ${th('q_N', 'ΔN/L — aksialandelen inn i ny del, middel over L')}
         ${th('Σq', 'q_før + q_etter + q_N')}
         ${th('N_G', 'Kraft i ny del fra M etter [kN] — må forankres over L')}
         ${th('N_G/L', 'Middel over forankringslengden L')}
         ${anyGamma ? th('γ', 'Samvirkegrad, γ-metoden') : ''}`;

    const rows = list
      .map((jt) => {
        const a = jt.anchorReq;
        const cells = res.allExisting
          ? `<td class="py-1 pl-2 text-right num text-white font-semibold">${v(jt.qBefore)}</td>`
          : `<td class="py-1 pl-2 text-right num text-slate-300">${jt.flowBefore ? v(jt.qBefore) : '–'}</td>
             <td class="py-1 pl-2 text-right num text-slate-300">${v(jt.qAfter)}</td>
             <td class="py-1 pl-2 text-right num text-slate-300">${v(jt.qN)}</td>
             <td class="py-1 pl-2 text-right num text-white font-semibold">${v(jt.qTot)}</td>
             <td class="py-1 pl-2 text-right num text-slate-300">${a ? v(a.NG_kN) : '–'}</td>
             <td class="py-1 pl-2 text-right num text-slate-300">${a ? v(a.qReq) : '–'}</td>
             ${anyGamma ? `<td class="py-1 pl-2 text-right num text-slate-300">${jt.gamma && jt.gamma.applicable ? n(jt.gamma.gammaEff, 2) : '–'}</td>` : ''}`;
        return `<tr class="border-t border-slate-700/60 hover:bg-slate-700/40" data-rf-joint="${jt.id}">
            <td class="py-1 pr-1 max-w-0 w-full">
              <span class="flex items-center gap-1.5 min-w-0">
                <span class="w-2 h-2 rounded-sm shrink-0" style="background:${JOINT_COLOR}"></span>
                <span class="truncate text-slate-200">${escapeHtml(jt.name)}</span>
              </span>
            </td>
            ${cells}
          </tr>`;
      })
      .join('');

    return `<table class="w-full text-[11px]">
        <thead><tr class="text-slate-500">
          <th class="text-left font-normal py-1">Skjøt</th>
          ${head}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="text-[10px] text-slate-500 mt-1">q i kN/m (= N/mm) · N_G i kN · hold musa over en kolonne for forklaring</p>`;
  }

  /** Tverrsnittsegenskapene før og etter — tall, ingen tekst. */
  _sectionTable(res) {
    const c = res.comparison;
    const ax = res.axes;
    const v = (x, dec) => n(x, dec);
    const ratio = (r) => {
      if (r == null || !Number.isFinite(r)) return '<span class="text-slate-500">–</span>';
      const inc = (r - 1) * 100;
      return `<span class="${inc >= 0 ? 'text-emerald-300' : 'text-rose-300'}">${inc >= 0 ? '+' : ''}${pct(inc)}</span>`;
    };
    const delta = (d, unit) =>
      `<span class="text-amber-300">${d >= 0 ? '+' : ''}${n(d, 1)} ${unit}</span>`;
    const r = (label, before, after, change) => `<tr class="border-t border-slate-700/60">
        <td class="py-1 pr-2 text-slate-400 whitespace-nowrap">${label}</td>
        <td class="py-1 pl-2 text-right num text-slate-300">${before}</td>
        <td class="py-1 pl-2 text-right num text-white">${after}</td>
        <td class="py-1 pl-2 text-right num">${change}</td>
      </tr>`;
    return `<table class="w-full text-[11px]">
        <thead><tr class="text-slate-500">
          <th class="text-left font-normal py-1"></th>
          <th class="text-right font-normal py-1 pl-2">før</th>
          <th class="text-right font-normal py-1 pl-2">etter</th>
          <th class="text-right font-normal py-1 pl-2">endring</th>
        </tr></thead>
        <tbody>
          ${r('EA [N]', v(c.EA0, 0), v(c.EA1, 0), ratio(c.ratios.EA))}
          ${r('EI_x [Nmm²]', v(c.EIx0, 0), v(c.EIx1, 0), ratio(c.ratios.EIx))}
          ${r('EI_y [Nmm²]', v(c.EIy0, 0), v(c.EIy1, 0), ratio(c.ratios.EIy))}
          ${r('y_c [mm]', v(c.yc0, 1), v(c.yc1, 1), delta(c.dyc, 'mm'))}
          ${r('x_c [mm]', v(ax.before.xc, 1), v(ax.after.xc, 1), delta(ax.dxc, 'mm'))}
          ${r('θ [°]', v(ax.before.thetaDeg, 1), v(ax.after.thetaDeg, 1), delta(ax.dThetaDeg, '°'))}
        </tbody>
      </table>`;
  }

  /**
   * Delvis samvirke per skjøt: hvor K_ser kom fra (og ρ_m, §14.1 — en verdi
   * verktøyet fant selv må kunne spores til delen den kom fra), og
   * γ-metodens resultat. Bare skjøter der noe er satt opp.
   */
  _slipBody(res) {
    const list = res.joints.filter((jt) => jt.slip || (jt.gamma && jt.gamma.applicable));
    if (!list.length) return '';
    const cards = list
      .map((jt) => {
        const g = jt.gamma && jt.gamma.applicable ? jt.gamma : null;
        const sl = jt.slip;
        return `<div class="rounded border border-slate-700 bg-slate-900 p-2 space-y-0.5 text-[11px]">
            <div class="text-slate-300">${escapeHtml(jt.name)}</div>
            ${
              sl
                ? row(
                    `K (${sl.state}) — ${sl.source === 'ec5' ? `EC5 tabell 7.1, ${escapeHtml(sl.label)}` : 'fritt innlagt (ETA)'}`,
                    sl.valid ? q(sl.K, 'N/mm', 0) : '–'
                  ) + (sl.source === 'ec5' ? rhoSourceHtml(jt.rhoSource) : '')
                : ''
            }
            ${
              g
                ? row('γ_eff', n(g.gammaEff, 3)) +
                  row(`(EI)_ef / EI_full, L_ef = ${n(g.Lef, 0)} mm`, `${n(g.EI_ef, 0)} / ${n(g.EI_full, 0)}`)
                : ''
            }
          </div>`;
      })
      .join('');
    return H('Delvis samvirke', `<div class="space-y-1.5">${cards}</div>`);
  }

  /**
   * Lyser opp raden for skjøten musepekeren står over i lerretet — uten å
   * tegne panelet på nytt.
   */
  highlightJoint(id) {
    const host = document.getElementById(this.hostId);
    if (!host) return;
    host.querySelectorAll('[data-rf-joint]').forEach((tr) => {
      tr.classList.toggle('bg-slate-700/60', tr.dataset.rfJoint === id);
    });
  }

  /**
   * De fem biaksielle lastfeltene for én tilstand («før» eller «etter»),
   * i FAST rekkefølge N → V → M (§9.2 punkt 1) og på ett kompakt rutenett i
   * stedet for én rad per felt. Etikettene er korte — den fulle forklaringen
   * ligger i den sammenleggbare konvensjonsseksjonen rett under.
   */
  _loadStateFields(prefix, state) {
    return `<div class="grid grid-cols-3 gap-x-2 gap-y-1.5">
       ${loadField(`loads.${prefix}.N`, `N`, 'kN', 'positiv = strekk', state.N_kN, 'step="1"')}
       ${loadField(`loads.${prefix}.Vy`, `V_y`, 'kN', 'loddrett, hører til M_x', state.Vy_kN, 'step="1"')}
       ${loadField(`loads.${prefix}.Vx`, `V_x`, 'kN', 'vannrett, hører til M_y', state.Vx_kN, 'step="1"')}
       ${loadField(`loads.${prefix}.Mx`, `M_x`, 'kNm', 'strekk i overkant', state.Mx_kNm, 'step="1"')}
       ${loadField(`loads.${prefix}.My`, `M_y`, 'kNm', 'strekk på høyre side', state.My_kNm, 'step="1"')}
     </div>`;
  }

  /** §9.2: sammenleggbar seksjon med figur og tabell, lukket som standard. */
  _conventionDetails() {
    return `
      <details class="mt-3 rounded border border-slate-700 bg-slate-900/60">
        <summary class="px-2.5 py-1.5 text-xs text-slate-300 hover:text-white flex items-center gap-1.5">
          <span class="chev text-slate-500" style="display:inline-block">›</span>
          Akse- og fortegnskonvensjoner
        </summary>
        <div class="px-2.5 pb-2.5 pt-1">${axisConventionHtml()}</div>
      </details>`;
  }

  _loadsBody(res) {
    const u = lengthLabel(res.unit);
    const beforeFields = this._loadStateFields('before', res.loads.before);

    if (res.allExisting) {
      return (
        `<p class="text-[11px] text-slate-400 mb-1">Last på det eksisterende tverrsnittet</p>` +
        beforeFields +
        `<p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
           Alle former er merket «eksisterende» — dette er en kontroll av en eksisterende konstruksjon.
           Lasten virker på tverrsnittet slik det står i dag; det finnes ingen «etter»-tilstand å legge til.
         </p>` +
        this._conventionDetails()
      );
    }

    const afterFields = this._loadStateFields('after', res.loads.after);

    return `
       <div class="rounded border border-slate-700/60 p-2">
         <p class="text-[11px] text-slate-400 mb-1">Før — på det <strong>eksisterende</strong> tverrsnittet alene</p>
         ${beforeFields}
       </div>
       <div class="rounded border border-slate-700/60 p-2 mt-1.5">
         <p class="text-[11px] text-slate-400 mb-1">Etter — tillegg på det <strong>sammensatte</strong> tverrsnittet</p>
         ${afterFields}
       </div>
       <div class="mt-1.5">${numField('loads.L', `Forankringslengde L [${u}]`, res.loads.L_unit, 'step="10" min="0"')}</div>
       <p class="text-[11px] text-slate-500 mt-1.5 leading-snug">
         Den eksisterende bjelken bærer allerede «før»-lasten idet forsterkningen monteres — bare
         tilleggslasten «etter» virker på det sammensatte tverrsnittet. De to superponeres:
         q_V,tot = |q_før| + |q_etter|.
       </p>
       ${this._conventionDetails()}`;
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
             (K_ser, rader og senteravstand under «Avansert: delvis samvirke» i skjøtelista).
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

  /**
   * Ren rendrer over `derivationModel(res)`. Metoden formulerer INGENTING
   * selv — den legger bare HTML rundt `sym`/`formula`/`subst`/`result`/`note`
   * og husker hvilke grupper brukeren har slått ut (`this.openCalc`).
   *
   * Det er hele poenget: formlene finnes ett sted, i `js/derivation.js`, slik
   * at rapporten kan rendre fra samme kilde uten at de to kan gli fra
   * hverandre. Skal en formel endres, endres den der — ikke her.
   */
  _derivationBody(res) {
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

    return (
      derivationModel(res)
        .map((g) => group(g.key, escapeHtml(g.title), g.steps.map(calc).join('')))
        .join('') +
      `<div class="rounded border border-slate-700 bg-slate-900 p-2.5 text-[11px] text-slate-400 leading-snug space-y-1.5">
           <div class="text-slate-300 font-medium">Forutsetninger</div>
           <ul class="list-disc list-inside space-y-1">
             ${DERIVATION_ASSUMPTIONS.map((t) => `<li>${t}</li>`).join('\n             ')}
           </ul>
         </div>`
    );
  }

  /* ---------------- hendelser ---------------- */

  _bind() {
    const host = document.getElementById(this.hostId);
    if (!host) return;
    const store = this.store;
    const input = document.getElementById(this.inputHostId);

    (input || host).querySelectorAll('[data-rf]').forEach((el) => {
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

    const det = host.querySelector('[data-rf-details]');
    if (det) det.addEventListener('toggle', () => (this.detailsOpen = det.open));

    host.querySelectorAll('[data-rf-joint]').forEach((tr) => {
      tr.addEventListener('mouseenter', () => this.onHoverJoint(tr.dataset.rfJoint));
      tr.addEventListener('mouseleave', () => this.onHoverJoint(null));
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
      lines.push(
        `Last: Vy_foer = ${res.loads.before.Vy_kN} kN, Vx_foer = ${res.loads.before.Vx_kN} kN, ` +
        `N_foer = ${res.loads.before.N_kN} kN, Mx_foer = ${res.loads.before.Mx_kNm} kNm, My_foer = ${res.loads.before.My_kNm} kNm`
      );
    } else {
      const c = res.comparison;
      const ax = res.axes;
      lines.push(
        `Foer:  Vy=${res.loads.before.Vy_kN} kN, Vx=${res.loads.before.Vx_kN} kN, N=${res.loads.before.N_kN} kN, Mx=${res.loads.before.Mx_kNm} kNm, My=${res.loads.before.My_kNm} kNm`,
        `Etter: Vy=${res.loads.after.Vy_kN} kN, Vx=${res.loads.after.Vx_kN} kN, N=${res.loads.after.N_kN} kN, Mx=${res.loads.after.Mx_kNm} kNm, My=${res.loads.after.My_kNm} kNm, L=${n(res.loads.L, 0)} mm`,
        '',
        'Effekt av forsterkningen',
        `  EA:    ${n(c.EA0, 0)} N  ->  ${n(c.EA1, 0)} N   (${c.ratios.EA == null ? '–' : pct((c.ratios.EA - 1) * 100)})`,
        `  EI_x:  ${n(c.EIx0, 0)} Nmm2  ->  ${n(c.EIx1, 0)} Nmm2   (${c.ratios.EIx == null ? '–' : pct((c.ratios.EIx - 1) * 100)})`,
        `  y_c:   ${n(c.yc0)} mm  ->  ${n(c.yc1)} mm`,
        `  theta: ${n(ax.before.thetaDeg, 2)} deg -> ${n(ax.after.thetaDeg, 2)} deg` +
          (ax.introducedSkew ? '   ADVARSEL: skjev boyning innfoert av forsterkningen' : ''),
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
      if (jt.volkersen && jt.volkersen.valid) {
        lines.push(
          `  Volkersen: lambda = ${n(jt.volkersen.lambda, 6)} 1/mm, q_max = ${n(jt.volkersen.qMax)} N/mm, toppfaktor ${n(jt.volkersen.peakFactor, 3)}`
        );
      }
      if (jt.gamma && jt.gamma.applicable) {
        lines.push(`  gamma_eff = ${n(jt.gamma.gammaEff, 4)}   EI_ef = ${n(jt.gamma.EI_ef, 0)} Nmm2   EI_full = ${n(jt.gamma.EI_full, 0)} Nmm2`);
      }
      if (jt.anchorReq) {
        const a = jt.anchorReq;
        lines.push(
          `  Forankring i enden: N_G = ${n(a.NG_kN)} kN   q_tot = ${n(a.qTot)} N/mm   q_req = ${a.qReq == null ? '-' : n(a.qReq) + ' N/mm'}   q_gov = ${n(a.qGoverning)} N/mm`
        );
      }
    }
    lines.push('');
    lines.push('Forutsetninger: full samvirkning, lineaer elastisitet. Naboskap uten skjot regnes stivt forbundet.');
    lines.push('Beregningen er iterativ i praksis - ny geometri gir ny stivhet og nye krefter.');
    return lines.join('\n');
  }
}
