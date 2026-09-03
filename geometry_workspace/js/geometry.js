/**
 * geometry.js — ren 2D-polygongeometri. Ingen DOM, ingen three.js.
 *
 * Konvensjoner
 *  - Punkt      : [x, y]
 *  - Ring       : [[x,y], ...] lukket (første punkt == siste punkt)
 *  - Polygon    : [ytterRing, ...hullRinger]
 *  - MultiPoly  : [Polygon, ...]   (samme format som polygon-clipping bruker)
 *
 * Alle arealmomenter regnes med x mot høyre og y oppover:
 *      A    = ∫ dA
 *      Sx   = ∫ y dA      (1. arealmoment om x-aksen)
 *      Sy   = ∫ x dA
 *      Ix0  = ∫ y² dA     (om global origo)
 *      Iy0  = ∫ x² dA
 *      Ixy0 = ∫ x y dA
 */

const pc = (typeof window !== 'undefined' && window.polygonClipping) || null;

export const EPS = 1e-9;

/* ------------------------------------------------------------------ *
 * Ring-hjelpere
 * ------------------------------------------------------------------ */

/** Lukker en ring (dupliserer første punkt til slutt) hvis den er åpen. */
export function closeRing(points) {
  if (points.length < 3) return points.slice();
  const [x0, y0] = points[0];
  const [xn, yn] = points[points.length - 1];
  if (Math.abs(x0 - xn) < EPS && Math.abs(y0 - yn) < EPS) return points.slice();
  return [...points.map((p) => [p[0], p[1]]), [x0, y0]];
}

/** Fjerner det duplikate sluttpunktet — nyttig for tegning/redigering. */
export function openRing(ring) {
  if (ring.length < 2) return ring.slice();
  const [x0, y0] = ring[0];
  const [xn, yn] = ring[ring.length - 1];
  if (Math.abs(x0 - xn) < EPS && Math.abs(y0 - yn) < EPS) return ring.slice(0, -1);
  return ring.slice();
}

/** Signert areal (positivt = mot klokka). */
export function signedArea(points) {
  const r = closeRing(points);
  let s = 0;
  for (let i = 0; i < r.length - 1; i++) {
    s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  }
  return s / 2;
}

/** Punkt-i-polygon (ray casting) for en enkelt ring. */
export function pointInRing(pt, points) {
  const r = openRing(points);
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Punkt-i-polygon der hull (ring 2..n) trekkes fra. */
export function pointInPolygon(pt, polygon) {
  if (!polygon || !polygon.length) return false;
  if (!pointInRing(pt, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(pt, polygon[i])) return false;
  }
  return true;
}

export function pointInMulti(pt, multi) {
  return (multi || []).some((poly) => pointInPolygon(pt, poly));
}

/* ------------------------------------------------------------------ *
 * Arealegenskaper
 * ------------------------------------------------------------------ */

export function zeroProps() {
  return { A: 0, Sx: 0, Sy: 0, Ix0: 0, Iy0: 0, Ixy0: 0 };
}

/**
 * Rå (signerte) integraler for én ring. Fortegnet følger omløpsretningen,
 * så en ring med klokka gir negativt bidrag — det er slik hull håndteres.
 */
export function ringProps(points) {
  const r = closeRing(points);
  const p = zeroProps();
  for (let i = 0; i < r.length - 1; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[i + 1];
    const cr = x1 * y2 - x2 * y1;
    p.A += cr;
    p.Sy += (x1 + x2) * cr;
    p.Sx += (y1 + y2) * cr;
    p.Iy0 += (x1 * x1 + x1 * x2 + x2 * x2) * cr;
    p.Ix0 += (y1 * y1 + y1 * y2 + y2 * y2) * cr;
    p.Ixy0 += (x1 * y2 + 2 * x1 * y1 + 2 * x2 * y2 + x2 * y1) * cr;
  }
  p.A /= 2;
  p.Sx /= 6;
  p.Sy /= 6;
  p.Ix0 /= 12;
  p.Iy0 /= 12;
  p.Ixy0 /= 24;
  return p;
}

export function scaleProps(p, k) {
  return { A: p.A * k, Sx: p.Sx * k, Sy: p.Sy * k, Ix0: p.Ix0 * k, Iy0: p.Iy0 * k, Ixy0: p.Ixy0 * k };
}

export function addProps(a, b) {
  return {
    A: a.A + b.A,
    Sx: a.Sx + b.Sx,
    Sy: a.Sy + b.Sy,
    Ix0: a.Ix0 + b.Ix0,
    Iy0: a.Iy0 + b.Iy0,
    Ixy0: a.Ixy0 + b.Ixy0,
  };
}

export function sumProps(list) {
  return list.reduce((acc, p) => addProps(acc, p), zeroProps());
}

/**
 * Egenskaper for ett polygon. Vi tvinger fortegnet eksplisitt (ytre ring
 * positiv, hull negative) i stedet for å stole på at klippebiblioteket
 * leverer en bestemt omløpsretning.
 */
export function polygonProps(polygon) {
  let out = zeroProps();
  polygon.forEach((ring, i) => {
    const raw = ringProps(ring);
    const wantPositive = i === 0;
    const isPositive = raw.A >= 0;
    const flip = wantPositive !== isPositive ? -1 : 1;
    out = addProps(out, scaleProps(raw, flip));
  });
  return out;
}

export function multiProps(multi) {
  return sumProps((multi || []).map(polygonProps));
}

/**
 * Utleder de størrelsene brukeren faktisk leser av: tyngdepunkt,
 * arealmomenter om tyngdepunktet og hovedakser.
 */
export function derive(p) {
  const A = p.A;
  const ok = Math.abs(A) > EPS;
  const cx = ok ? p.Sy / A : 0;
  const cy = ok ? p.Sx / A : 0;
  // Steiners sats, tilbake til tyngdepunktsakser
  const Ix = p.Ix0 - A * cy * cy;
  const Iy = p.Iy0 - A * cx * cx;
  const Ixy = p.Ixy0 - A * cx * cy;

  const avg = (Ix + Iy) / 2;
  const dif = (Ix - Iy) / 2;
  const rad = Math.sqrt(dif * dif + Ixy * Ixy);
  const I1 = avg + rad;
  const I2 = avg - rad;
  // Vinkel fra x-aksen (mot klokka) til hovedaksen med størst treghetsmoment,
  // normalisert til (-90°, 90°]
  let theta = Math.abs(Ixy) < EPS && Math.abs(dif) < EPS ? 0 : 0.5 * Math.atan2(-2 * Ixy, Ix - Iy);
  if (theta <= -Math.PI / 2) theta += Math.PI;
  if (theta > Math.PI / 2) theta -= Math.PI;

  return { A, cx, cy, Ix, Iy, Ixy, I1, I2, theta, valid: ok };
}

/* ------------------------------------------------------------------ *
 * Boolske operasjoner (polygon-clipping)
 * ------------------------------------------------------------------ */

export function hasClipper() {
  return !!pc;
}

/** Gjør en punktliste om til en MultiPolygon med én lukket ytre ring. */
export function pointsToMulti(points) {
  if (!points || points.length < 3) return [];
  return [[closeRing(points)]];
}

function safe(op, args, fallback) {
  if (!pc) return fallback;
  try {
    const res = op.apply(pc, args);
    return Array.isArray(res) ? res : fallback;
  } catch (err) {
    console.warn('[geometry] boolsk operasjon feilet, faller tilbake:', err);
    return fallback;
  }
}

export function unionMulti(multis) {
  const parts = (multis || []).filter((m) => m && m.length);
  if (parts.length === 0) return [];
  if (parts.length === 1) return parts[0];
  return safe(pc.union, [parts[0], ...parts.slice(1)], parts.flat());
}

export function differenceMulti(a, b) {
  if (!a || !a.length) return [];
  if (!b || !b.length) return a;
  return safe(pc.difference, [a, b], a);
}

export function intersectionMulti(a, b) {
  if (!a || !a.length || !b || !b.length) return [];
  return safe(pc.intersection, [a, b], []);
}

/* ------------------------------------------------------------------ *
 * Sammensatt tverrsnitt
 * ------------------------------------------------------------------ */

/**
 * Regner ut effektiv geometri for en liste med former.
 *
 * shapes: [{ id, points, role: 'solid'|'void', factor, include }]
 *   Rekkefølgen i lista er prioritet: første element er øverst.
 *
 * mode:
 *   'sum'      — hver form bidrar med hele sitt areal, også der formene
 *                overlapper. Dette er standard, fordi det er slik en
 *                skallmodell faktisk er: både vegg- og plateelementet
 *                finnes i overlappsonen, og materialet der teller to
 *                ganger i modellens tverrsnitt. Hull trekkes fra.
 *   'priority' — hver form får kun det arealet ingen form foran den
 *                allerede har krevd. Overlapp telles altså nøyaktig én
 *                gang, slik den støpte betongen fysisk er.
 *
 * Returnerer per form den effektive MultiPolygon-en, samt totalene.
 */
export function analyze(shapes, mode = 'sum') {
  const active = (shapes || []).filter((s) => s.include !== false && s.points && s.points.length >= 3);
  const parts = [];
  let claimed = [];
  // Området som dekkes av to eller flere faste former — det er dette som
  // teller dobbelt i 'sum'-modus, og som flytter tyngdepunktet.
  let solidSeen = [];
  let overlapMulti = [];

  for (const s of active) {
    const own = pointsToMulti(s.points);
    let eff = own;
    if (mode === 'priority' && claimed.length) {
      eff = differenceMulti(own, claimed);
    }
    if (mode === 'priority') {
      claimed = claimed.length ? unionMulti([claimed, own]) : own;
    }

    if (s.role !== 'void') {
      if (solidSeen.length) {
        const inter = intersectionMulti(own, solidSeen);
        if (inter.length) overlapMulti = overlapMulti.length ? unionMulti([overlapMulti, inter]) : inter;
      }
      solidSeen = solidSeen.length ? unionMulti([solidSeen, own]) : own;
    }

    const isVoid = s.role === 'void';
    const raw = multiProps(eff);
    const ownArea = Math.abs(multiProps(own).A);
    const factor = Number.isFinite(s.factor) ? s.factor : 1;
    // I 'sum'-modus bidrar hull negativt. I 'priority'-modus har hullet
    // allerede spist opp arealet sitt via prioriteten, så det bidrar med 0.
    let weight = factor;
    if (isVoid) weight = mode === 'sum' ? -factor : 0;

    parts.push({
      id: s.id,
      shape: s,
      multi: eff,
      area: raw.A,
      ownArea,
      props: scaleProps(raw, weight),
      weight,
      isVoid,
    });
  }

  const total = sumProps(parts.map((p) => p.props));
  const solidMulti = unionMulti(
    parts.filter((p) => !p.isVoid).map((p) => p.multi)
  );
  const voidMulti = unionMulti(parts.filter((p) => p.isVoid).map((p) => p.multi));
  const netMulti = voidMulti.length ? differenceMulti(solidMulti, voidMulti) : solidMulti;

  const weighted = parts.some((p) => Math.abs(Math.abs(p.weight) - 1) > EPS && p.weight !== 0);

  // Området som dekkes av flere former, uten hullene trukket fra ennå
  const overlapNet = voidMulti.length ? differenceMulti(overlapMulti, voidMulti) : overlapMulti;

  return {
    mode,
    parts,
    netMulti,
    // Selve overlappsonen, til opptegning
    overlapMulti: overlapNet,
    // Summen av formenes egne arealer, altså skallmodellens areal der
    // overlappet er med to ganger.
    grossArea: parts.filter((p) => !p.isVoid).reduce((a, p) => a + p.ownArea, 0),
    // Rent geometrisk nettoareal (uten vektfaktorer), altså arealet av netMulti.
    netArea: Math.abs(multiProps(netMulti).A),
    // Arealet av selve overlappsonen. Merk at dette er mindre enn
    // grossArea − netArea dersom tre eller flere former dekker samme punkt.
    overlapArea: Math.abs(multiProps(overlapNet).A),
    weighted,
    total,
    result: derive(total),
  };
}

/* ------------------------------------------------------------------ *
 * Formgeneratorer
 * ------------------------------------------------------------------ */

/** Rektangel fra hjørne (x, y) med bredde b og høyde h (kan være negative). */
export function rectPoints(x, y, b, h) {
  const x1 = b >= 0 ? x : x + b;
  const y1 = h >= 0 ? y : y + h;
  const bb = Math.abs(b);
  const hh = Math.abs(h);
  return [
    [x1, y1],
    [x1 + bb, y1],
    [x1 + bb, y1 + hh],
    [x1, y1 + hh],
  ];
}

export function rectFromCorners(p1, p2) {
  return rectPoints(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
}

/**
 * Skallelement modellert i senterflaten: et rektangel med tykkelse t
 * sentrert om linja p1→p2. Dette er formen et FEM-skall faktisk
 * representerer, og er grunnen til at vegg og plate overlapper i hjørnet.
 */
export function shellPoints(p1, p2, t) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const nx = (-dy / len) * (t / 2);
  const ny = (dx / len) * (t / 2);
  return [
    [p1[0] + nx, p1[1] + ny],
    [p2[0] + nx, p2[1] + ny],
    [p2[0] - nx, p2[1] - ny],
    [p1[0] - nx, p1[1] - ny],
  ];
}

/** Regulær n-kant / sirkeltilnærming. */
export function circlePoints(cx, cy, r, segments = 48) {
  const pts = [];
  const n = Math.max(3, Math.round(segments));
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 * Transformasjoner
 * ------------------------------------------------------------------ */

export function translatePoints(points, dx, dy) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

export function rotatePoints(points, angleRad, about = [0, 0]) {
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  return points.map(([x, y]) => {
    const dx = x - about[0];
    const dy = y - about[1];
    return [about[0] + dx * c - dy * s, about[1] + dx * s + dy * c];
  });
}

export function mirrorPoints(points, axis = 'x', at = 0) {
  return points.map(([x, y]) =>
    axis === 'x' ? [x, 2 * at - y] : [2 * at - x, y]
  );
}

/**
 * Speiler punktene om linja gjennom a og b — den generelle varianten, der
 * aksen kan ligge hvor som helst og ha hvilken som helst retning.
 * Har linja null lengde, returneres punktene uendret.
 */
export function mirrorPointsAboutLine(points, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS * EPS) return points.map((p) => [p[0], p[1]]);
  // Speiling om en linje gjennom origo med retning (dx, dy), skrevet ut:
  //   [cos2φ  sin2φ; sin2φ  −cos2φ]   der φ er linjas vinkel
  const c = (dx * dx - dy * dy) / len2;
  const s = (2 * dx * dy) / len2;
  return points.map(([x, y]) => {
    const ux = x - a[0];
    const uy = y - a[1];
    return [a[0] + ux * c + uy * s, a[1] + ux * s - uy * c];
  });
}

/**
 * Arealtyngdepunktet til én ring. Er ringen degenerert (null areal), faller
 * vi tilbake på punktmiddelet, slik at et basispunkt alltid kan oppgis.
 */
export function centroidOfPoints(points) {
  const ring = openRing(points || []);
  if (!ring.length) return [0, 0];
  const p = ringProps(ring);
  if (Math.abs(p.A) > EPS) return [p.Sy / p.A, p.Sx / p.A];
  const n = ring.length;
  return [ring.reduce((a, q) => a + q[0], 0) / n, ring.reduce((a, q) => a + q[1], 0) / n];
}

/**
 * Arealvektet tyngdepunkt for et sett former, uten vektfaktorer og uten
 * overlappbehandling. Dette er «hvor ligger disse formene», altså det
 * sentreringsverktøyet og relative koordinater måler fra — ikke det
 * sammensatte tverrsnittets nøytralakse, som analyze() gir.
 */
export function centroidOfShapes(shapes) {
  const list = (shapes || []).filter((s) => s.points && s.points.length >= 3);
  if (!list.length) return null;
  // Fortegnet på ringPropsene følger omløpsretningen, så hver form tvinges
  // positiv før de summeres — ellers ville en ring tegnet med klokka
  // trekke tyngdepunktet feil vei.
  const total = sumProps(
    list.map((s) => {
      const raw = ringProps(closeRing(s.points));
      return raw.A >= 0 ? raw : scaleProps(raw, -1);
    })
  );
  if (Math.abs(total.A) > EPS) return [total.Sy / total.A, total.Sx / total.A];
  // Alle formene er degenererte — bruk midtpunktet av utstrekningen
  const b = boundsOfShapes(list);
  return b ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : null;
}

export function boundsOfPoints(points) {
  if (!points || !points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOfShapes(shapes) {
  const all = (shapes || []).flatMap((s) => s.points || []);
  return boundsOfPoints(all);
}

/* ------------------------------------------------------------------ *
 * Skjøter (§4/§6.2/§8.5 i geometry_workspace-joints-plan.md)
 * ------------------------------------------------------------------ */

/**
 * Liten, geometribasert toleranse for naboskapstester — en brøkdel av
 * modellens utstrekning, slik at den skalerer med arbeidsenheten (mm/cm/m)
 * i stedet for å være en hardkodet mm-verdi. Brukt både av skjøteverktøyet
 * (autonavn via `sidesOfJoint` i joints.js) og av den dempede
 * gruppemarkeringen i viewport.js (`buildGraph`).
 *
 * @param {Array} shapes
 * @returns {number}
 */
export function neighborTolerance(shapes) {
  const b = boundsOfShapes(shapes);
  if (!b) return 1e-3;
  const diag = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) || 1;
  return diag / 2000;
}

/**
 * Deler ett polygon i to halvdeler langs en (uendelig forlenget) linje a→b,
 * ved å klippe det mot halvplanet på hver side med `intersectionMulti` — samme
 * halvplan-teknikk som `joints.js` bruker for ES* (§8.1), men her brukt til å
 * faktisk KUTTE geometrien, ikke bare integrere over den. En konkav form kan gi
 * flere biter per side (klippingen mot en konveks halvplan-firkant bevarer alle
 * bitene) — det MultiPolygon-formatet fanger naturlig, uten særtilfelle.
 *
 * Brukes av «Del med linje»-verktøyet (§8.5). Formen som IKKE krysses av linja
 * gir en tom MultiPolygon på den ene siden — kallende kode lar den da stå urørt.
 *
 * @param {Array<[number,number]>} points Formens ring (åpen eller lukket)
 * @param {[number,number]} a
 * @param {[number,number]} b
 * @returns {{posMulti: Array, negMulti: Array}} tomme lister hvis linja er
 *   degenerert eller formen har for få punkt.
 */
export function splitPointsByLine(points, a, b) {
  const empty = { posMulti: [], negMulti: [] };
  if (!points || points.length < 3) return empty;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return empty;
  const dir = [dx / len, dy / len];
  const nrm = [-dir[1], dir[0]]; // venstre normal

  const own = pointsToMulti(points);
  if (!own.length) return empty;

  const bnds = boundsOfPoints(points);
  const diag = Math.hypot(bnds.maxX - bnds.minX, bnds.maxY - bnds.minY) || 1;
  const M = diag * 4 + 1000; // god margin — dekker hele formen uansett hvor linja krysser

  const halfPolygon = (side) => {
    const n = [nrm[0] * side, nrm[1] * side];
    const p1 = [a[0] - dir[0] * M, a[1] - dir[1] * M];
    const p2 = [b[0] + dir[0] * M, b[1] + dir[1] * M];
    const far2 = [p2[0] + n[0] * M, p2[1] + n[1] * M];
    const far1 = [p1[0] + n[0] * M, p1[1] + n[1] * M];
    return [[p1, p2, far2, far1, p1]]; // Polygon = [ring] (ingen hull)
  };

  return {
    posMulti: intersectionMulti(own, [halfPolygon(1)]),
    negMulti: intersectionMulti(own, [halfPolygon(-1)]),
  };
}
