import type { Mesh, Vec2 } from '@thermo2d/core';
import { bandColor, bandEdges, DEFAULT_BANDS, divergingColor, sequentialColor, type Bands, type Theme } from './theme.js';
import { esc, fmt, n, svgDocument, textTitle, themeColors } from './svg.js';
import { boxOfPoints, fitBox, interfaceEdges, isothermSegments, type Fit } from './geom.js';

export interface FieldProbeMark {
  name: string;
  x: number;
  y: number;
  value?: number;
}

export interface FieldFigureOptions {
  mesh: Mesh;
  field: ArrayLike<number>;
  bands?: Bands;
  /** Per-vertex gradient shading instead of flat bands. */
  smooth?: boolean;
  isotherms?: number[];
  showMesh?: boolean;
  probes?: FieldProbeMark[];
  title?: string;
  /** Text under the title, e.g. "t = 90 min". */
  subtitle?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  /** 'sequential' (temperatures) or 'diverging' (difference fields, symmetric around 0). */
  palette?: 'sequential' | 'diverging';
  unitLabel?: string;
  colorbar?: boolean;
}

/** Temperature field on the section: banded triangle fill, region outlines, isotherms, probes and a colour bar. */
export function fieldFigure(o: FieldFigureOptions): string {
  const c = themeColors(o.theme);
  const W = o.width ?? 720;
  const H = o.height ?? 560;
  const bands = o.bands ?? DEFAULT_BANDS;
  const palette = o.palette ?? 'sequential';
  const colorbarW = o.colorbar === false ? 0 : 80;
  const top = o.title ? (o.subtitle ? 52 : 36) : 12;
  const plot = { left: 12, top, width: W - 24 - colorbarW, height: H - top - 12 };
  const mesh = o.mesh;
  const fit = fitBox(boxOfPoints(mesh.nodes), plot);
  let body = '';
  if (o.title) body += textTitle(16, 22, o.title, c);
  if (o.subtitle) body += `<text x="16" y="40" font-size="12" fill="${c.muted}">${esc(o.subtitle)}</text>`;

  const colorOf = (v: number) => {
    if (palette === 'diverging') {
      const m = Math.max(Math.abs(bands.min), Math.abs(bands.max), 1e-9);
      return divergingColor(v / m);
    }
    return o.smooth ? sequentialColor((v - bands.min) / Math.max(1e-9, bands.max - bands.min)) : bandColor(v, bands);
  };

  // Triangles
  const tri = mesh.triangles;
  const nd = mesh.nodes;
  const strokeMesh = o.showMesh ? ` stroke="${c.outline}" stroke-opacity="0.35" stroke-width="0.4"` : ' stroke-width="0.3"';
  let tris = '';
  for (let e = 0; e < tri.length; e += 3) {
    const a = tri[e], b = tri[e + 1], d = tri[e + 2];
    const v = (o.field[a] + o.field[b] + o.field[d]) / 3;
    const col = colorOf(v);
    const pts = `${n(fit.x(nd[2 * a]))},${n(fit.y(nd[2 * a + 1]))} ${n(fit.x(nd[2 * b]))},${n(fit.y(nd[2 * b + 1]))} ${n(fit.x(nd[2 * d]))},${n(fit.y(nd[2 * d + 1]))}`;
    // Stroke with the fill colour to hide anti-aliasing seams unless the mesh is shown.
    tris += `<polygon points="${pts}" fill="${col}"${o.showMesh ? strokeMesh : ` stroke="${col}"${strokeMesh}`}/>`;
  }
  body += `<g data-layer="field">${tris}</g>`;

  // Outlines: exterior boundary and material interfaces.
  let outline = '';
  for (const s of mesh.boundary) outline += seg(fit, nd, s.a, s.b);
  for (const [a, b] of interfaceEdges(mesh)) outline += seg(fit, nd, a, b);
  body += `<path d="${outline}" fill="none" stroke="${c.outline}" stroke-width="1"/>`;

  // Isotherms
  for (const theta of o.isotherms ?? []) {
    const segs = isothermSegments(mesh, o.field, theta);
    if (!segs.length) continue;
    let d = '';
    for (const [p, q] of segs) d += `M${n(fit.x(p[0]))} ${n(fit.y(p[1]))}L${n(fit.x(q[0]))} ${n(fit.y(q[1]))}`;
    body += `<path d="${d}" fill="none" stroke="${c.outline}" stroke-width="1.4" data-isotherm="${theta}"/>`;
    const [p] = segs[Math.floor(segs.length / 2)];
    body += `<text x="${n(fit.x(p[0]) + 3)}" y="${n(fit.y(p[1]) - 3)}" font-size="10" fill="${c.fg}" stroke="${c.bg}" stroke-width="3" paint-order="stroke">${fmt(theta, 0)} °C</text>`;
  }

  // Probes
  for (const p of o.probes ?? []) {
    const px = fit.x(p.x), py = fit.y(p.y);
    body += `<circle cx="${n(px)}" cy="${n(py)}" r="3.5" fill="${c.bg}" stroke="${c.outline}" stroke-width="1.2"/>`;
    const label = p.value !== undefined && Number.isFinite(p.value) ? `${p.name}: ${fmt(p.value, 0)} °C` : p.name;
    body += `<text x="${n(px + 6)}" y="${n(py - 5)}" font-size="10" fill="${c.fg}" stroke="${c.bg}" stroke-width="3" paint-order="stroke">${esc(label)}</text>`;
  }

  if (colorbarW) body += colorbar(W - colorbarW + 16, top + 8, 16, plot.height - 24, bands, palette, c, o.unitLabel ?? '°C');
  body += scaleBar(fit, plot.left + 8, H - 18, c);
  return svgDocument(W, H, c, body, o.title);
}

function seg(fit: Fit, nd: ArrayLike<number>, a: number, b: number): string {
  return `M${n(fit.x(nd[2 * a]))} ${n(fit.y(nd[2 * a + 1]))}L${n(fit.x(nd[2 * b]))} ${n(fit.y(nd[2 * b + 1]))}`;
}

export function colorbar(x: number, y: number, w: number, h: number, bands: Bands, palette: 'sequential' | 'diverging', c: { fg: string; axis: string }, unit: string): string {
  const edges = bandEdges(bands);
  const nb = edges.length - 1;
  let s = '';
  for (let k = 0; k < nb; k++) {
    const y0 = y + h - ((k + 1) / nb) * h;
    const mid = (edges[k] + edges[k + 1]) / 2;
    const col = palette === 'diverging' ? divergingColor(mid / Math.max(Math.abs(bands.min), Math.abs(bands.max), 1e-9)) : bandColor(mid, bands);
    s += `<rect x="${n(x)}" y="${n(y0)}" width="${n(w)}" height="${n(h / nb)}" fill="${col}" stroke="${c.axis}" stroke-width="0.3"/>`;
  }
  const every = nb > 12 ? Math.ceil(nb / 12) : 1;
  edges.forEach((v, k) => {
    if (k % every !== 0 && k !== nb) return;
    const yy = y + h - (k / nb) * h;
    s += `<text x="${n(x + w + 4)}" y="${n(yy + 4)}" font-size="10" fill="${c.fg}">${fmt(v, 0)}</text>`;
  });
  s += `<text x="${n(x)}" y="${n(y - 6)}" font-size="10" fill="${c.fg}">${esc(unit)}</text>`;
  return s;
}

/** Small scale bar in mm. */
function scaleBar(fit: Fit, x: number, y: number, c: { fg: string; axis: string }): string {
  const target = 80 / fit.scale; // mm for ~80 px
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-9))));
  const nice = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= target) ?? mag;
  const px = nice * fit.scale;
  return `<line x1="${n(x)}" y1="${n(y)}" x2="${n(x + px)}" y2="${n(y)}" stroke="${c.axis}" stroke-width="2"/><text x="${n(x + px / 2)}" y="${n(y - 4)}" text-anchor="middle" font-size="10" fill="${c.fg}">${fmt(nice, 0)} mm</text>`;
}

export function pointsToVec2(pts: ArrayLike<number>): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i + 1 < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
}
