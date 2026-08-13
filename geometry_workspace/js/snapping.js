/**
 * snapping.js — snap-motoren.
 *
 * Ren geometri: tar inn formene, hvilke snap-typer som er på, og en toleranse
 * i verdensenheter, og gir tilbake punktet markøren skal låses til.
 *
 * Typene sjekkes i prioritert rekkefølge, ikke bare etter avstand. Det gjør
 * oppførselen forutsigbar: ligger både et endepunkt og en linje innenfor
 * toleransen, vinner endepunktet — slik man er vant til fra CAD.
 */

import { openRing, signedArea } from './geometry.js';

/**
 * Snap-typene, i den rekkefølgen de prøves.
 *
 * Hurtigtastene er Alt + siffer. Alt-kombinasjoner er valgt fordi de er blant
 * de få som er ledige i en nettleser: F-tastene, Ctrl+tall og Ctrl+bokstav er
 * i stor grad opptatt av nettleseren selv.
 */
export const SNAP_TYPES = [
  { key: 'endpoint', label: 'Endepunkt', short: 'End', color: '#22c55e', code: 'Digit1', hint: 'Alt+1' },
  { key: 'intersection', label: 'Skjæringspunkt', short: 'Skj', color: '#f472b6', code: 'Digit2', hint: 'Alt+2' },
  { key: 'midpoint', label: 'Midtpunkt', short: 'Mid', color: '#eab308', code: 'Digit3', hint: 'Alt+3' },
  { key: 'center', label: 'Senter', short: 'Sen', color: '#a78bfa', code: 'Digit4', hint: 'Alt+4' },
  { key: 'edge', label: 'På linje', short: 'Lin', color: '#38bdf8', code: 'Digit5', hint: 'Alt+5' },
  { key: 'grid', label: 'Rutenett', short: 'Rut', color: '#94a3b8', code: 'Digit6', hint: 'Alt+6' },
];

/** Slår av og på alle snap under ett. */
export const SNAP_ALL = { code: 'Digit9', hint: 'Alt+9' };

/** Orto er ikke en snap-type, men hører hjemme i samme kontroll. */
export const ORTHO = { label: 'Orto', short: 'Orto', color: '#f97316', code: 'Digit0', hint: 'Alt+0' };

export const SNAP_KEYS = SNAP_TYPES.map((t) => t.key);

export function snapColor(type) {
  const t = SNAP_TYPES.find((s) => s.key === type);
  return t ? t.color : '#f8fafc';
}

export function snapLabel(type) {
  const t = SNAP_TYPES.find((s) => s.key === type);
  return t ? t.label : '';
}

/** Alle kanter i de aktuelle formene, som [[x1,y1],[x2,y2]]. */
function collectSegments(shapes, exclude) {
  const segs = [];
  for (const s of shapes) {
    if (s.include === false || (exclude && exclude.has(s.id))) continue;
    const ring = openRing(s.points);
    for (let i = 0; i < ring.length; i++) {
      segs.push([ring[i], ring[(i + 1) % ring.length]]);
    }
  }
  return segs;
}

function nearestOnSegment(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-18) return [a[0], a[1]];
  let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return [a[0] + vx * t, a[1] + vy * t];
}

/** Skjæringspunkt mellom to linjestykker, eller null. */
function segmentIntersection(a1, a2, b1, b2) {
  const d1x = a2[0] - a1[0];
  const d1y = a2[1] - a1[1];
  const d2x = b2[0] - b1[0];
  const d2y = b2[1] - b1[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null; // parallelle
  const ux = b1[0] - a1[0];
  const uy = b1[1] - a1[1];
  const t = (ux * d2y - uy * d2x) / den;
  const u = (ux * d1y - uy * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a1[0] + d1x * t, a1[1] + d1y * t];
}

/**
 * Finner snap-punktet for markørposisjonen `world`.
 *
 * opts:
 *   shapes    — formene det kan snappes mot
 *   snaps     — { endpoint, midpoint, edge, intersection, center, grid }
 *   gridStep  — rutenettets steglengde
 *   tol       — toleranse i verdensenheter (typisk 12 px omregnet)
 *   exclude   — Set med id-er som ikke skal snappes mot (f.eks. det som dras)
 *
 * Returnerer { point, type }. Type 'free' betyr ingen snap.
 */
export function findSnap(world, { shapes = [], snaps = {}, gridStep = 0, tol = 0, exclude = null } = {}) {
  const active = shapes.filter((s) => s.include !== false && !(exclude && exclude.has(s.id)));

  let best = null;
  let bestD = Infinity;
  const consider = (p) => {
    const d = Math.hypot(p[0] - world[0], p[1] - world[1]);
    if (d <= tol && d < bestD) {
      bestD = d;
      best = [p[0], p[1]];
    }
  };
  const take = (type) => {
    if (!best) return null;
    const res = { point: best, type };
    best = null;
    bestD = Infinity;
    return res;
  };

  if (snaps.endpoint) {
    for (const s of active) for (const p of openRing(s.points)) consider(p);
    const hit = take('endpoint');
    if (hit) return hit;
  }

  if (snaps.intersection) {
    // Bare kanter i nærheten av markøren, så dette ikke blir O(n²) over alt
    const near = collectSegments(active, null).filter(
      ([a, b]) =>
        Math.min(a[0], b[0]) - tol <= world[0] &&
        Math.max(a[0], b[0]) + tol >= world[0] &&
        Math.min(a[1], b[1]) - tol <= world[1] &&
        Math.max(a[1], b[1]) + tol >= world[1]
    );
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        const x = segmentIntersection(near[i][0], near[i][1], near[j][0], near[j][1]);
        if (x) consider(x);
      }
    }
    const hit = take('intersection');
    if (hit) return hit;
  }

  if (snaps.midpoint) {
    for (const s of active) {
      const ring = openRing(s.points);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        consider([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
    }
    const hit = take('midpoint');
    if (hit) return hit;
  }

  if (snaps.center) {
    for (const s of active) {
      const ring = openRing(s.points);
      const A = signedArea(ring);
      if (Math.abs(A) < 1e-12) continue;
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        const cr = x1 * y2 - x2 * y1;
        cx += (x1 + x2) * cr;
        cy += (y1 + y2) * cr;
      }
      consider([cx / (6 * A), cy / (6 * A)]);
    }
    const hit = take('center');
    if (hit) return hit;
  }

  if (snaps.edge) {
    for (const [a, b] of collectSegments(active, null)) consider(nearestOnSegment(world, a, b));
    const hit = take('edge');
    if (hit) return hit;
  }

  if (snaps.grid && gridStep > 0) {
    return {
      point: [Math.round(world[0] / gridStep) * gridStep, Math.round(world[1] / gridStep) * gridStep],
      type: 'grid',
    };
  }

  return { point: [world[0], world[1]], type: 'free' };
}

/**
 * Låser punktet til vannrett, loddrett eller 45° fra et referansepunkt.
 * Brukes når orto er på under tegning.
 */
export function applyOrtho(point, from, { allowDiagonal = false } = {}) {
  if (!from) return point;
  const dx = point[0] - from[0];
  const dy = point[1] - from[1];
  if (allowDiagonal) {
    const ang = Math.atan2(dy, dx);
    const step = Math.PI / 4;
    const snapped = Math.round(ang / step) * step;
    const len = Math.hypot(dx, dy) * Math.abs(Math.cos(ang - snapped));
    return [from[0] + Math.cos(snapped) * len, from[1] + Math.sin(snapped) * len];
  }
  return Math.abs(dx) >= Math.abs(dy) ? [point[0], from[1]] : [from[0], point[1]];
}
