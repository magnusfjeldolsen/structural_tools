/**
 * joints.js — skjøtelinjer: naboskap, halvplan-avskjæring og grafen.
 *
 * Erstatter `interfaces.js` (slettet). En «skjøt» er en linje tegnet i
 * tverrsnittsplanet — se §4 i planen for datamodellen (`{id, a, b, bondWidth,
 * share, connector}`). Denne fila er ren geometri/grafteori: ingen DOM, ingen
 * store, ingen three.js. Selve mekanikken (q_V, q_N, ...) ligger i
 * `reinforcement.js`.
 *
 * ------------------------------------------------------------------
 * VIKTIG DESIGNBESLUTNING — §8 i planen (TILLEGG, skrevet etter §2/§5.2)
 * ------------------------------------------------------------------
 * `ES*` (og dermed `q_V`) regnes IKKE ut fra grafen lenger. Et snitt er en
 * rett linje; forlenget uendelig deler den planet i to halvplan, og gruppa er
 * ALT som ligger på den ene siden — akkurat som i klassisk bjelketeori
 * (Q = statisk moment av arealet på den ene siden av snittet). Vi klipper
 * hele geometrien mot halvplanet med `intersectionMulti` og integrerer med
 * `multiProps`. Se `halfPlaneParts` / `fullSectionParts` nedenfor.
 *
 * Fordelen: det virker på ett sammensatt polygon (en importert profil) uten
 * at brukeren må dele den opp i flere former for å kunne snitte i den, og det
 * treffer alle firetilfellene i §2-tabellen uten noen komponentsøk i det hele
 * tatt — kjeden fordi halvplanet inneholder både A og B, I-profilen fordi
 * halvplanet over sveisen ER overflensen.
 *
 * Grafen (`buildGraph`/`jointGroup`) er beholdt, men KRAFTIG nedskalert — den
 * brukes bare til to ting nå (§8.3):
 *   1. Aksialleddet: hvilken ny dels `ΔN` som må gjennom hvilken skjøt
 *      (`jointGroup(...).groupIds`, matet inn i `axialTransfer` i
 *      reinforcement.js).
 *   2. Advarsler: nye former uten noen skjøt (`danglingShapes`), og deler
 *      festet med flere skjøter samtidig — statisk ubestemt (`overConstrained`).
 * IKKE bruk grafen til å velge `groupParts` for `shearFlow` — bruk
 * `halfPlaneParts`.
 *
 * ------------------------------------------------------------------
 * FORMDATA denne fila forventer
 * ------------------------------------------------------------------
 * Et element i `shapes` kan ha: `id`, `points` ([[x,y],...]), `stage`
 * (`'existing'|'new'`, default `'existing'`), `role` (`'solid'|'void'`,
 * default solid), `include` (default `true`), og `material: {E}` (E i N/mm²,
 * brukt av halvplan-funksjonene — grafen bryr seg ikke om E).
 *
 * Et element i `joints` har minst `id`, `a: [x,y]`, `b: [x,y]`.
 */

import {
  EPS as GEOM_EPS,
  boundsOfShapes,
  pointsToMulti,
  intersectionMulti,
  multiProps,
  scaleProps,
} from './geometry.js';

export const EPS = GEOM_EPS;

/* ==================================================================== *
 * §5.1 / §8.3 — geometrisk naboskap
 * ==================================================================== */

/** Punktdifferanse, prikkprodukt — små 2D-hjelpere for segmentavstanden. */
function sub(p, q) {
  return [p[0] - q[0], p[1] - q[1]];
}
function dot(p, q) {
  return p[0] * q[0] + p[1] * q[1];
}
function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Korteste avstand mellom to linjesegment [p1,p2] og [p3,p4]. 0 hvis de
 * krysser eller berører hverandre. Standardalgoritmen for nærmeste punkt
 * mellom to segment (closest-point, se f.eks. Ericson, "Real-Time Collision
 * Detection" §5.1.9) — robust for parallelle og degenererte (punktformede)
 * segment.
 */
function segSegDistance(p1, p2, p3, p4) {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const r = sub(p1, p3);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);

  let s;
  let t;
  if (a <= EPS && e <= EPS) {
    // Begge segment er egentlig punkt.
    return Math.hypot(p1[0] - p3[0], p1[1] - p3[1]);
  }
  if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = Math.abs(denom) > EPS ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1x = p1[0] + d1[0] * s;
  const c1y = p1[1] + d1[1] * s;
  const c2x = p3[0] + d2[0] * t;
  const c2y = p3[1] + d2[1] * t;
  return Math.hypot(c1x - c2x, c1y - c2y);
}

/** Åpen ring (ingen duplisert sluttnode) — vi styrer lukkingen selv i løkkene. */
function openPts(points) {
  if (!points || points.length < 2) return points || [];
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  if (Math.abs(x0 - xn) < 1e-12 && Math.abs(y0 - yn) < 1e-12) return points.slice(0, -1);
  return points;
}

/** Punkt-i-ring (ray casting), lokal kopi så fila ikke må importere hele geometry.js sin API for dette. */
function pointInRingLocal(pt, points) {
  const r = openPts(points);
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    const cross = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi;
    if (cross) inside = !inside;
  }
  return inside;
}

/**
 * Sant hvis to former berører eller overlapper hverandre: enten ligger en
 * kant i A nærmere enn `tol` fra en kant i B (segment–segment-avstand — dette
 * fanger både delt kant og «nesten møtes»), eller ett polygon inneholder et
 * hjørne av det andre (fanger full overlapp/innkapsling, der ingen kanter
 * krysser). `tol` settes av kallende kode, typisk en liten brøkdel av
 * modellens utstrekning.
 *
 * @param {{points: Array<[number,number]>}} shapeA
 * @param {{points: Array<[number,number]>}} shapeB
 * @param {number} [tol]
 * @returns {boolean}
 */
export function shapesTouch(shapeA, shapeB, tol = 1e-6) {
  const A = openPts(shapeA && shapeA.points);
  const B = openPts(shapeB && shapeB.points);
  if (A.length < 2 || B.length < 2) return false;
  const t = Math.max(tol, 0);

  for (let i = 0; i < A.length; i++) {
    const a1 = A[i];
    const a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b1 = B[j];
      const b2 = B[(j + 1) % B.length];
      if (segSegDistance(a1, a2, b1, b2) <= t) return true;
    }
  }
  if (A.length >= 3 && B.length >= 3) {
    for (const v of A) if (pointInRingLocal(v, B)) return true;
    for (const v of B) if (pointInRingLocal(v, A)) return true;
  }
  return false;
}

/** Enhetsnormalen som peker mot venstre side av linja a→b (kryssprodukt > 0). Null lengde ⟹ [0,0]. */
function leftNormal(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return [0, 0];
  return [-dy / len, dx / len];
}

const ACTIVE_SOLID = (s) => s && s.include !== false && Array.isArray(s.points) && s.points.length >= 3 && s.role !== 'void';

/**
 * Hvilke former som ligger inntil skjøtelinja, på hver side. Robust metode
 * (§5.1): sampler punkt langs linja, forskyver dem `tol` langs normalen begge
 * veier, og ser hvilke former punktene faller inni — IKKE tyngdepunkt (som
 * bommer på L-formede/hulle tverrsnitt, se planen).
 *
 * MERK etter §8: dette brukes IKKE lenger til å bygge ES*-gruppa (se
 * `halfPlaneParts`). Bruken nå er å avgjøre hva som er de UMIDDELBARE naboene
 * — «ligger skjøten helt i eksisterende materiale, eller mot en ny del» (§3),
 * og som byggestein for grafen (`buildGraph`).
 *
 * `aSide` = venstre for retningen a→b, `bSide` = høyre. Navnene har ingen
 * fysisk betydning (ikke «ny» vs. «gammel») — bare hvilken side av linja.
 *
 * @param {{a:[number,number], b:[number,number]}} joint
 * @param {Array} shapes
 * @param {number} [tol] Brukes også som forskyvningsavstand langs normalen —
 *   må være mindre enn tykkelsen på den tynneste tilstøtende formen (f.eks.
 *   et steg), ellers hopper samplingen forbi den og inn i neste form.
 * @returns {{aSide: Array<string|number>, bSide: Array<string|number>}}
 */
export function sidesOfJoint(joint, shapes, tol = 1e-6) {
  const a = joint && joint.a;
  const b = joint && joint.b;
  const empty = { aSide: [], bSide: [] };
  if (!a || !b) return empty;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return empty;

  const n = leftNormal(a, b);
  const off = Math.max(Math.abs(tol), 1e-9);
  const active = (shapes || []).filter(ACTIVE_SOLID);

  const N_SAMPLES = 9; // interne samplepunkt, strengt inni linja (unngår hjørne-tvetydighet i endene)
  const aSet = new Set();
  const bSet = new Set();
  for (let k = 1; k <= N_SAMPLES; k++) {
    const t = k / (N_SAMPLES + 1);
    const bx = a[0] + t * dx;
    const by = a[1] + t * dy;
    const pA = [bx + n[0] * off, by + n[1] * off];
    const pB = [bx - n[0] * off, by - n[1] * off];
    for (const s of active) {
      if (pointInRingLocal(pA, s.points)) aSet.add(s.id);
      if (pointInRingLocal(pB, s.points)) bSet.add(s.id);
    }
  }
  return { aSide: [...aSet].sort(), bSide: [...bSet].sort() };
}

/* ==================================================================== *
 * §5.2 / §8.3 — grafen (kraftig nedskalert: bare ΔN-ruting og advarsler)
 * ==================================================================== */

function unionFind(nodes) {
  const parent = new Map(nodes.map((id) => [id, id]));
  function find(x) {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) {
      const next = parent.get(x);
      parent.set(x, r);
      x = next;
    }
    return r;
  }
  function union(x, y) {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }
  return { find, union };
}

/** id → rot-id i komponenten, gitt en kantliste `{a,b}`. Kanter som refererer noder utenfor `nodes` ignoreres. */
function componentOf(nodes, edges) {
  const nodeSet = new Set(nodes);
  const uf = unionFind(nodes);
  for (const e of edges) {
    if (nodeSet.has(e.a) && nodeSet.has(e.b)) uf.union(e.a, e.b);
  }
  const map = new Map();
  for (const id of nodes) map.set(id, uf.find(id));
  return map;
}

function groupByRoot(nodes, rootOf) {
  const out = new Map();
  for (const id of nodes) {
    const r = rootOf.get(id);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(id);
  }
  return out;
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Bygger koblingsgrafen: noder er de aktive, faste (ikke-hull) formene.
 * Kanter er enten EKSPLISITTE (én pr. skjøt, mellom alt på `aSide` og alt på
 * `bSide` av den skjøten) eller IMPLISITTE (par av former som berører
 * hverandre — `shapesTouch` — og som ingen skjøt allerede binder sammen).
 *
 * Grafen brukes ikke lenger til ES* (§8) — se filhodet. Den er beholdt for
 * ΔN-ruting (`jointGroup`) og advarslene (`danglingShapes`, `overConstrained`).
 *
 * @param {Array} shapes
 * @param {Array} joints
 * @param {number} [tol]
 * @returns {{nodes: Array<string|number>, edges: Array<{a,b,jointId}>, implicitEdges: Array<{a,b}>, jointSides: Object, shapesById: Map}}
 */
export function buildGraph(shapes, joints, tol = 1e-6) {
  const active = (shapes || []).filter(ACTIVE_SOLID);
  const nodes = active.map((s) => s.id);
  const shapesById = new Map(active.map((s) => [s.id, s]));

  const jointSides = {};
  const edges = [];
  const explicitPairs = new Set();
  for (const joint of joints || []) {
    const sides = sidesOfJoint(joint, active, tol);
    jointSides[joint.id] = sides;
    for (const a of sides.aSide) {
      for (const b of sides.bSide) {
        if (a === b) continue;
        edges.push({ a, b, jointId: joint.id });
        explicitPairs.add(pairKey(a, b));
      }
    }
  }

  const implicitEdges = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const idA = active[i].id;
      const idB = active[j].id;
      if (explicitPairs.has(pairKey(idA, idB))) continue; // en skjøt binder dem allerede sammen — se §2
      if (shapesTouch(active[i], active[j], tol)) implicitEdges.push({ a: idA, b: idB });
    }
  }

  return { nodes, edges, implicitEdges, jointSides, shapesById };
}

/** `groupA`/`groupB` er id-lister for de to komponentene et kutt splitter grafen i. Velger den som IKKE inneholder eksisterende former; er begge (eller ingen) det, den minste — deterministisk ved uavgjort (§2, §5.2). */
function chooseGroup(groupA, groupB, shapesById) {
  if (groupA.length === 0 && groupB.length > 0) return groupB;
  if (groupB.length === 0 && groupA.length > 0) return groupA;
  const hasExisting = (ids) => ids.some((id) => {
    const s = shapesById.get(id);
    return !s || s.stage !== 'new';
  });
  const exA = hasExisting(groupA);
  const exB = hasExisting(groupB);
  if (exA && !exB) return groupB;
  if (exB && !exA) return groupA;
  if (groupA.length !== groupB.length) return groupA.length < groupB.length ? groupA : groupB;
  const sa = [...groupA].sort().join(',');
  const sb = [...groupB].sort().join(',');
  return sa <= sb ? groupA : groupB;
}

/**
 * Fjerner én skjøts kant(er) fra grafen og finner komponentene. Brukes til
 * ΔN-ruting (§8.3): `groupIds` er formene på den siden av skjøten som (per
 * §2) IKKE inneholder eksisterende former — filtrert til `stage: 'new'` gir
 * nettopp de `groupIds` som skal inn i `axialTransfer` i reinforcement.js.
 *
 * `determinate: false` når kuttet IKKE splitter grafen — altså at det finnes
 * en annen vei (via andre skjøter/implisitte kanter) mellom de to sidene selv
 * med denne skjøtens kant fjernet. Det er nøyaktig definisjonen av en
 * «bridge»-kant i grafteorien, og fysisk: statisk ubestemt (§2), fordi det da
 * finnes minst to uavhengige lastveier og fordelingen avhenger av
 * forbindelsesstivhetene.
 *
 * IKKE bruk `groupIds` herfra som `groupParts` til `shearFlow` — det er
 * `halfPlaneParts` sin jobb (§8).
 *
 * @param {{id: string|number}} joint
 * @param {ReturnType<typeof buildGraph>} graph
 * @returns {{groupIds: Array<string|number>, otherIds: Array<string|number>, determinate: boolean}}
 */
export function jointGroup(joint, graph) {
  const sides = graph && graph.jointSides ? graph.jointSides[joint.id] : undefined;
  if (!sides) return { groupIds: [], otherIds: (graph && graph.nodes.slice()) || [], determinate: false };

  const { aSide, bSide } = sides;
  if (aSide.length === 0 && bSide.length === 0) {
    return { groupIds: [], otherIds: graph.nodes.slice(), determinate: false };
  }

  const otherEdges = [];
  for (const [jid, s] of Object.entries(graph.jointSides)) {
    if (String(jid) === String(joint.id)) continue;
    for (const a of s.aSide) for (const b of s.bSide) if (a !== b) otherEdges.push({ a, b });
  }
  const edgesForComponents = otherEdges.concat(graph.implicitEdges);
  const compOf = componentOf(graph.nodes, edgesForComponents);

  const compsA = new Set(aSide.map((id) => compOf.get(id)));
  const compsB = new Set(bSide.map((id) => compOf.get(id)));
  const overlaps = [...compsA].some((c) => compsB.has(c));

  if (overlaps || aSide.length === 0 || bSide.length === 0) {
    // Ikke en bro: kuttet splitter ikke grafen (statisk ubestemt), eller én
    // side er tom. Faller tilbake på de DIREKTE naboene til skjøten — det er
    // det nærmeste vi kommer et svar når komponenten er delt (§2, U-profilen).
    const groupIds = chooseGroup(aSide, bSide, graph.shapesById);
    const otherIds = graph.nodes.filter((id) => !groupIds.includes(id));
    return { groupIds, otherIds, determinate: false };
  }

  const bodies = groupByRoot(graph.nodes, compOf);
  const groupAFull = (bodies.get([...compsA][0]) || []).slice();
  const groupBFull = (bodies.get([...compsB][0]) || []).slice();
  const groupIds = chooseGroup(groupAFull, groupBFull, graph.shapesById);
  const otherIds = graph.nodes.filter((id) => !groupIds.includes(id));
  return { groupIds, otherIds, determinate: true };
}

/**
 * Nye (`stage: 'new'`) former som ikke er endepunkt for NOEN skjøt — de
 * «henger i løse lufta» (§6.4), selv om de skulle berøre en eksisterende form
 * geometrisk (den implisitte naboskapskanten gir dem en stiv forbindelse i
 * grafen, men ingen dokumentert, kontrollerbar forbinder).
 *
 * @param {Array} shapes
 * @param {Array} joints
 * @param {ReturnType<typeof buildGraph>} graph
 * @returns {Array<string|number>} sortert
 */
export function danglingShapes(shapes, joints, graph) {
  const touched = new Set();
  for (const joint of joints || []) {
    const sides = graph && graph.jointSides && graph.jointSides[joint.id];
    if (!sides) continue;
    for (const id of sides.aSide) touched.add(id);
    for (const id of sides.bSide) touched.add(id);
  }
  const nodes = (graph && graph.nodes) || [];
  const shapesById = (graph && graph.shapesById) || new Map();
  return nodes
    .filter((id) => {
      const s = shapesById.get(id);
      return s && s.stage === 'new' && !touched.has(id);
    })
    .sort();
}

/**
 * Deler festet med to eller flere skjøter samtidig — statisk ubestemt (§2:
 * «en U-profil skrudd til begge flenser»). Vi finner først de RIGIDE
 * kroppene (former bundet sammen bare av IMPLISITTE kanter, altså uten at
 * noen skjøt er involvert), og teller så hvor mange skjøter som binder hver
 * kropp til en ANNEN kropp. To eller flere ⟹ redundant — verktøyet kan ikke
 * gjette fordelingen (bruk `share`-feltet på skjøten til å overstyre, §2).
 *
 * @param {Array} shapes
 * @param {Array} joints
 * @param {ReturnType<typeof buildGraph>} graph
 * @returns {Array<{shapeIds: Array<string|number>, jointIds: Array<string|number>}>} sortert på shapeIds
 */
export function overConstrained(shapes, joints, graph) {
  if (!graph) return [];
  const rigidOf = componentOf(graph.nodes, graph.implicitEdges);
  const bodies = groupByRoot(graph.nodes, rigidOf);

  const incident = new Map(); // rot -> Set(jointId)
  for (const joint of joints || []) {
    const sides = graph.jointSides[joint.id];
    if (!sides) continue;
    const rootsA = new Set(sides.aSide.map((id) => rigidOf.get(id)));
    const rootsB = new Set(sides.bSide.map((id) => rigidOf.get(id)));
    for (const ra of rootsA) {
      for (const rb of rootsB) {
        if (ra === rb || ra === undefined || rb === undefined) continue;
        if (!incident.has(ra)) incident.set(ra, new Set());
        if (!incident.has(rb)) incident.set(rb, new Set());
        incident.get(ra).add(joint.id);
        incident.get(rb).add(joint.id);
      }
    }
  }

  const result = [];
  for (const [root, jointIdSet] of incident) {
    if (jointIdSet.size >= 2) {
      result.push({
        shapeIds: (bodies.get(root) || []).slice().sort(),
        jointIds: [...jointIdSet].sort(),
      });
    }
  }
  result.sort((x, y) => (x.shapeIds.join(',') < y.shapeIds.join(',') ? -1 : 1));
  return result;
}

/* ==================================================================== *
 * §8 — halvplanet: ES*-grunnlaget (Part[] til reinforcement.js sin sectionEA/shearFlow)
 * ==================================================================== */

/** Aktive former for beregning — MED hull (`role: 'void'`), i motsetning til `ACTIVE_SOLID` som er for grafnoder. Hull skal fortsatt trekkes fra i halvplanet de faller i. */
const ACTIVE_CALC = (s) => s && s.include !== false && Array.isArray(s.points) && s.points.length >= 3;

/**
 * Stor margin rundt modellen, så halvplan-rektangelet garantert dekker all
 * geometri langt utenfor selve formene (§8.1: «blåst opp med god margin»).
 */
function bigMargin(shapes) {
  const b = boundsOfShapes(shapes);
  if (!b) return 1e6;
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) || 1;
  return diag * 10 + 1000;
}

/**
 * Ring for et rektangel som dekker HELE modellen (+ margin) på den ene siden
 * av den uendelig forlengede linja a→b.
 *
 * @param {{a:[number,number], b:[number,number]}} joint
 * @param {Array} shapes Brukes bare til å måle opp hvor stor marginen må være.
 * @param {number} side  > 0 ⟹ venstre for a→b, ≤ 0 ⟹ høyre. |q| er
 *   uavhengig av hvilken side du velger (§1) — dette er bare hvilken halvdel
 *   du får egenskapene FOR.
 * @returns {Array<[number,number]>|null} null hvis linja er degenerert (a≈b)
 */
export function halfPlaneRing(joint, shapes, side) {
  const a = joint && joint.a;
  const b = joint && joint.b;
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  const dir = [dx / len, dy / len];
  const nLeft = leftNormal(a, b);
  const n = side > 0 ? nLeft : [-nLeft[0], -nLeft[1]];
  const M = bigMargin(shapes);

  const p1 = [a[0] - dir[0] * M, a[1] - dir[1] * M];
  const p2 = [b[0] + dir[0] * M, b[1] + dir[1] * M];
  const far2 = [p2[0] + n[0] * M, p2[1] + n[1] * M];
  const far1 = [p1[0] + n[0] * M, p1[1] + n[1] * M];
  return [p1, p2, far2, far1];
}

/**
 * Bygger `Part[]` (til `sectionEA`/`shearFlow` i reinforcement.js) fra en
 * liste former, eventuelt klippet mot en gitt multipolygon. `clipMulti: null`
 * betyr «ingen klipping» — hele formen brukes. Delt av `fullSectionParts` og
 * `halfPlaneParts` slik at det er ÉN vei gjennom utledningen av `props`, ikke
 * to parallelle.
 */
function partsFromShapes(activeShapes, clipMulti) {
  const parts = [];
  for (const s of activeShapes) {
    const own = pointsToMulti(s.points);
    const eff = clipMulti ? intersectionMulti(own, clipMulti) : own;
    if (!eff.length) continue;
    const raw = multiProps(eff);
    if (Math.abs(raw.A) < EPS) continue;
    const weight = s.role === 'void' ? -1 : 1;
    const E = s.material && Number.isFinite(s.material.E)
      ? s.material.E
      : (Number.isFinite(s.E) ? s.E : NaN);
    parts.push({ id: s.id, props: scaleProps(raw, weight), E });
  }
  return parts;
}

/**
 * `Part[]` for HELE det sammensatte tverrsnittet (ingen klipping) — det som
 * skal inn som `section` i `shearFlow`, og som `existing`/`combined` i
 * `compareStates`.
 *
 * @param {Array} shapes
 * @returns {Array<{id, props, E}>}
 */
export function fullSectionParts(shapes) {
  return partsFromShapes((shapes || []).filter(ACTIVE_CALC), null);
}

/**
 * `Part[]` for materialet på ÉN side av en skjøtelinje — halvplan-metoden fra
 * §8. Dette er `groupParts` til `shearFlow`. Virker uendret på en importert,
 * udelt profil (§8.2): brukeren trenger ikke splitte geometrien for å kunne
 * regne på et snitt i den.
 *
 * UTLEDNING/KONTROLL: siden nøytralaksen er definert av at ES* for HELE
 * tverrsnittet er null, og halvplanparts(side=+1) ∪ halvplanparts(side=-1) =
 * hele tverrsnittet (opp til klippe-toleranse), er
 * `ES*(side=+1) = −ES*(side=-1)`, og dermed `|q|` uavhengig av hvilken side
 * som velges. Se test 3 i `tests/joints.test.mjs`.
 *
 * @param {{a:[number,number], b:[number,number]}} joint
 * @param {Array} shapes
 * @param {number} side  > 0 ⟹ venstre for a→b, ≤ 0 ⟹ høyre (se `halfPlaneRing`)
 * @returns {Array<{id, props, E}>}
 */
export function halfPlaneParts(joint, shapes, side) {
  const active = (shapes || []).filter(ACTIVE_CALC);
  const ring = halfPlaneRing(joint, active, side);
  if (!ring) return [];
  const clipMulti = [[[...ring, ring[0]]]]; // én polygon, én ring, lukket
  return partsFromShapes(active, clipMulti);
}
