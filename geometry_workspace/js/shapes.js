/**
 * shapes.js — kjenner igjen parametriske former i en punktliste.
 *
 * Et rektangel i modellen er bare fire punkter. Skal man kunne endre en
 * bjelkehøyde uten å regne ut hjørnekoordinater for hånd, må verktøyet
 * kunne se at de fire punktene *er* et rektangel, og hva b, h og rotasjonen
 * er. Det er nettopp det denne modulen gjør.
 *
 * Prinsippet er at parameterne alltid utledes på nytt fra punktene, aldri
 * leses fra `meta`. Har brukeren dratt i et hjørne slik at formen ikke lenger
 * er et rektangel, mister den rektangel-statusen med det samme — den viser
 * altså aldri tall som ikke stemmer med geometrien. `meta` brukes bare til å
 * huske hva formen var *ment* som (skall kontra vanlig rektangel) og hvilket
 * ankerpunkt brukeren sist redigerte fra.
 *
 * Ren geometri: ingen DOM, ingen store.
 */

import { openRing, circlePoints, EPS } from './geometry.js';

/** Relativ toleranse for «rett vinkel» og «like lange sider». */
const REL_TOL = 1e-6;

const DEG = 180 / Math.PI;

/** Normaliserer en vinkel i grader til intervallet (−90, 90]. */
function norm90(deg) {
  let a = deg % 180;
  if (a <= -90) a += 180;
  if (a > 90) a -= 180;
  return a;
}

/* ------------------------------------------------------------------ *
 * Rektangel
 * ------------------------------------------------------------------ */

/**
 * Kjenner igjen et rektangel — aksejustert eller rotert. Kantvektorene
 * brukes direkte, ikke omskrevet boks, slik at et rotert rektangel også blir
 * gjenkjent med sin virkelige b og h.
 *
 * Returnerer `{ b, h, angle, center }` med vinkelen i grader i (−90, 90],
 * eller null hvis punktene ikke danner et rektangel.
 */
export function detectRect(points) {
  const r = openRing(points || []);
  if (r.length !== 4) return null;

  const e = [];
  const len = [];
  for (let i = 0; i < 4; i++) {
    const v = [r[(i + 1) % 4][0] - r[i][0], r[(i + 1) % 4][1] - r[i][1]];
    e.push(v);
    len.push(Math.hypot(v[0], v[1]));
  }
  const scale = Math.max(...len);
  if (scale < EPS) return null;

  // Motstående sider må være like lange …
  if (Math.abs(len[0] - len[2]) > scale * REL_TOL) return null;
  if (Math.abs(len[1] - len[3]) > scale * REL_TOL) return null;
  // … og hjørnene rette. Skalarproduktet har enhet lengde², derav scale².
  for (let i = 0; i < 4; i++) {
    const a = e[i];
    const b = e[(i + 1) % 4];
    if (Math.abs(a[0] * b[0] + a[1] * b[1]) > scale * scale * REL_TOL) return null;
  }

  // Et rektangel har to kantretninger, 90° fra hverandre. Vi kaller den som
  // ligger nærmest x-aksen for b-retningen, slik at et uendret, aksejustert
  // rektangel får rotasjon 0 og b langs x.
  const dir0 = Math.atan2(e[0][1], e[0][0]) * DEG;
  const a0 = norm90(dir0);
  const a1 = norm90(dir0 + 90);
  const useFirst = Math.abs(a0) <= Math.abs(a1);

  return {
    b: useFirst ? len[0] : len[1],
    h: useFirst ? len[1] : len[0],
    angle: useFirst ? a0 : a1,
    center: [
      (r[0][0] + r[1][0] + r[2][0] + r[3][0]) / 4,
      (r[0][1] + r[1][1] + r[2][1] + r[3][1]) / 4,
    ],
  };
}

/** Ankerpunktene et rektangel kan plasseres og skaleres fra. */
export const RECT_ANCHORS = [
  { key: 'center', label: 'senter' },
  { key: 'bottom-left', label: 'nedre venstre' },
  { key: 'bottom-center', label: 'midt på underkant' },
];

export function isRectAnchor(key) {
  return RECT_ANCHORS.some((a) => a.key === key);
}

/**
 * Vektoren fra rektangelets senter til ankerpunktet, i rektangelets eget
 * (roterte) system. «Nedre» følger rotasjonen: er rektangelet snudd 30°, er
 * underkanten også snudd 30°.
 */
function anchorOffset(b, h, angleDeg, anchor) {
  const t = angleDeg / DEG;
  const ux = Math.cos(t);
  const uy = Math.sin(t);
  const vx = -Math.sin(t);
  const vy = Math.cos(t);
  if (anchor === 'bottom-left') return [-(ux * b) / 2 - (vx * h) / 2, -(uy * b) / 2 - (vy * h) / 2];
  if (anchor === 'bottom-center') return [-(vx * h) / 2, -(vy * h) / 2];
  return [0, 0];
}

/** Ankerpunktets posisjon for et gjenkjent rektangel. */
export function rectAnchorPoint(rect, anchor) {
  const [ox, oy] = anchorOffset(rect.b, rect.h, rect.angle, anchor);
  return [rect.center[0] + ox, rect.center[1] + oy];
}

/**
 * Bygger punktene til et rektangel ut fra parameterne. `x, y` er posisjonen
 * til det valgte ankerpunktet — endres b eller h, står altså ankeret stille
 * og rektangelet vokser fra det, ikke fra origo.
 */
export function rectPointsFromParams({ b, h, angle = 0, anchor = 'center', x = 0, y = 0 }) {
  const bb = Math.abs(b);
  const hh = Math.abs(h);
  if (bb < EPS || hh < EPS) return null;
  const [ox, oy] = anchorOffset(bb, hh, angle, anchor);
  const cx = x - ox;
  const cy = y - oy;
  const t = angle / DEG;
  const ux = (Math.cos(t) * bb) / 2;
  const uy = (Math.sin(t) * bb) / 2;
  const vx = (-Math.sin(t) * hh) / 2;
  const vy = (Math.cos(t) * hh) / 2;
  return [
    [cx - ux - vx, cy - uy - vy],
    [cx + ux - vx, cy + uy - vy],
    [cx + ux + vx, cy + uy + vy],
    [cx - ux + vx, cy - uy + vy],
  ];
}

/* ------------------------------------------------------------------ *
 * Sirkel
 * ------------------------------------------------------------------ */

/**
 * Kjenner igjen en regulær mangekant som en sirkel: alle punktene like langt
 * fra midtpunktet. Kravet om minst tolv punkt holder vanlige polygoner unna.
 */
export function detectCircle(points) {
  const r = openRing(points || []);
  if (r.length < 12) return null;
  const cx = r.reduce((a, p) => a + p[0], 0) / r.length;
  const cy = r.reduce((a, p) => a + p[1], 0) / r.length;
  const radii = r.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const rMax = Math.max(...radii);
  const rMin = Math.min(...radii);
  if (rMax < EPS) return null;
  if (rMax - rMin > rMax * 1e-6) return null;
  return { c: [cx, cy], r: (rMax + rMin) / 2, segments: r.length };
}

export function circlePointsFromParams({ x = 0, y = 0, r, segments = 48 }) {
  const rr = Math.abs(r);
  if (rr < EPS) return null;
  return circlePoints(x, y, rr, segments);
}

/* ------------------------------------------------------------------ *
 * Skallelement
 * ------------------------------------------------------------------ */

/**
 * Et skall er også et rektangel, men brukeren tenker på det som en
 * senterlinje med en tykkelse. Hvilken av de to sideretningene som er
 * senterlinja kan geometrien alene ikke svare på, så retningen hentes fra
 * `meta.p1/p2` — men lengdene utledes fra punktene, som ellers.
 */
export function detectShell(points, meta) {
  const rect = detectRect(points);
  if (!rect || !meta || meta.kind !== 'shell' || !meta.p1 || !meta.p2) return null;
  const dx = meta.p2[0] - meta.p1[0];
  const dy = meta.p2[1] - meta.p1[1];
  if (Math.hypot(dx, dy) < EPS) return null;

  // Ligger senterlinja langs b-retningen, eller på tvers av den?
  const t = rect.angle / DEG;
  const along = Math.abs(Math.cos(t) * dx + Math.sin(t) * dy);
  const across = Math.abs(-Math.sin(t) * dx + Math.cos(t) * dy);
  const alongB = along >= across;

  const length = alongB ? rect.b : rect.h;
  const thickness = alongB ? rect.h : rect.b;
  const ang = alongB ? rect.angle : rect.angle + 90;
  const ux = Math.cos(ang / DEG) * (length / 2);
  const uy = Math.sin(ang / DEG) * (length / 2);
  // Behold retningen brukeren tegnet i, så p1 ikke hopper til motsatt ende
  const flip = ux * dx + uy * dy < 0 ? -1 : 1;
  return {
    p1: [rect.center[0] - ux * flip, rect.center[1] - uy * flip],
    p2: [rect.center[0] + ux * flip, rect.center[1] + uy * flip],
    t: thickness,
    length,
  };
}

/* ------------------------------------------------------------------ *
 * Oppslag
 * ------------------------------------------------------------------ */

/**
 * Hva er denne formen, parametrisk sett? Returnerer
 *   { kind: 'shell' | 'rect' | 'circle', ... }
 * eller null når formen ikke lar seg beskrive med noen parametre.
 */
export function describeShape(shape) {
  if (!shape || !shape.points) return null;
  const meta = shape.meta || null;

  const shell = detectShell(shape.points, meta);
  if (shell) return { kind: 'shell', ...shell };

  const circle = detectCircle(shape.points);
  if (circle && (!meta || meta.kind !== 'rect')) return { kind: 'circle', ...circle };

  const rect = detectRect(shape.points);
  if (rect) return { kind: 'rect', ...rect };

  return null;
}
