/**
 * curves.js — buer og sirkler som punktlister (areallik diskretisering).
 *
 * Flyttet fra geometry_workspace/js/dxf.js (#93). Ren matematikk, ingen DOM,
 * ingen importer.
 */

const TAU = 2 * Math.PI;

/** Hjørner per hel sirkel — samme som `circlePoints` i polygon.js. */
export const DEFAULT_SEGMENTS = 48;

/**
 * Radien hjørnene i en hel, regulær n-kant må ligge på for at n-kanten skal ha
 * samme areal som sirkelen med radius r:  n·R²·sin(2π/n)/2 = π·r².
 */
export function areaEqualRadius(r, n) {
  return r * Math.sqrt(TAU / (n * Math.sin(TAU / n)));
}

/** Antall korder en bue med vinkel `sweep` deles i (minst 2, så arealet kan justeres). */
function chordCount(sweep, segments) {
  return Math.max(2, Math.ceil((Math.abs(sweep) / TAU) * segments - 1e-9));
}

/**
 * Punktene langs en bue fra vinkel a0, med fortegnet vinkel `sweep`, UTEN
 * startpunktet og MED sluttpunktet. Endepunktene ligger på r; de m−1 punktene
 * mellom ligger på en radius ρ valgt slik at viftearealet om sentrum er lik
 * sektorarealet r²·θ/2:
 *
 *   (sin φ / 2)·(2·r·ρ + (m−2)·ρ²) = r²·θ/2,   φ = θ/m
 *
 * Siden arealet av en lukket ring kan summeres som vifter om et vilkårlig
 * punkt, gir det samme areal som den eksakte buen uansett hva resten av ringen
 * er (rett linje = sirkelsegment, andre buer, osv.).
 */
export function arcPoints(c, r, a0, sweep, segments = DEFAULT_SEGMENTS) {
  const m = chordCount(sweep, segments);
  const th = Math.abs(sweep);
  const phi = th / m;
  const s = Math.sin(phi);
  let rho;
  if (m === 2) rho = (r * th) / (2 * s);
  else {
    // (m−2)ρ² + 2rρ − r²θ/sinφ = 0, positiv rot
    const A = m - 2;
    const B = 2 * r;
    const C = (-r * r * th) / s;
    rho = (-B + Math.sqrt(B * B - 4 * A * C)) / (2 * A);
  }
  const out = [];
  const dir = sweep >= 0 ? 1 : -1;
  for (let k = 1; k <= m; k++) {
    const a = a0 + dir * phi * k;
    const rr = k === m ? r : rho;
    out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]);
  }
  return out;
}

/** Hel sirkel som areallik regulær n-kant. */
export function circleRing(c, r, segments = DEFAULT_SEGMENTS) {
  const n = Math.max(3, Math.round(segments));
  const R = areaEqualRadius(r, n);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = (TAU * k) / n;
    pts.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]);
  }
  return pts;
}

/**
 * Bulge-segmentet fra p1 til p2: bulge = tan(θ/4), positiv = mot klokka.
 * Returnerer punktene uten p1, med p2.
 */
export function bulgePoints(p1, p2, bulge, segments = DEFAULT_SEGMENTS) {
  if (Math.abs(bulge) < 1e-12) return [[p2[0], p2[1]]];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const d = Math.hypot(dx, dy);
  if (d < 1e-12) return [[p2[0], p2[1]]];
  const theta = 4 * Math.atan(bulge); // fortegnet sveipevinkel
  const r = d / (2 * Math.abs(Math.sin(theta / 2)));
  // Sentrum ligger på venstre normal (for θ > 0) i avstand (d/2)/tan(θ/2)
  const off = d / 2 / Math.tan(theta / 2);
  const c = [(p1[0] + p2[0]) / 2 + (-dy / d) * off, (p1[1] + p2[1]) / 2 + (dx / d) * off];
  const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]);
  const pts = arcPoints(c, r, a0, theta, segments);
  pts[pts.length - 1] = [p2[0], p2[1]]; // nøyaktig endepunkt, ikke cos/sin-støy
  return pts;
}
