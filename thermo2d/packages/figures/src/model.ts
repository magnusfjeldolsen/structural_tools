import type { Mesh, Project, Vec2 } from '@thermo2d/core';
import { BC_COLORS, CATEGORY_FILL, type Theme } from './theme.js';
import { esc, fmt, legend, n, svgDocument, textTitle, themeColors } from './svg.js';
import { boxOfPolygons, fitBox, polygonPath, unionBox, type Box } from './geom.js';

export interface ModelFigureOptions {
  project: Project;
  mesh?: Mesh;
  title?: string;
  width?: number;
  height?: number;
  theme?: Theme;
  /** Which labels to show (all on by default). */
  labels?: { regions?: boolean; rebars?: boolean; boundaryConditions?: boolean; probes?: boolean; dimensions?: boolean };
  lang?: 'nb' | 'en';
}

/** Labelled model preview: regions with material names, rebar numbers, colour-coded boundary edges, probes and overall dimensions. */
export function modelFigure(o: ModelFigureOptions): string {
  const c = themeColors(o.theme);
  const p = o.project;
  const W = o.width ?? 800;
  const H = o.height ?? 600;
  const lang = o.lang ?? p.settings.language ?? 'nb';
  const L = o.labels ?? {};
  const show = (k: keyof NonNullable<ModelFigureOptions['labels']>) => L[k] !== false;
  const top = o.title ? 36 : 12;
  const legendH = 70;
  const plot = { left: 40, top: top + 4, width: W - 80, height: H - top - legendH - 40 };
  let box: Box = boxOfPolygons(p.regions.map((r) => r.polygon));
  if (!p.regions.length && p.rebars.length) {
    box = { minX: Math.min(...p.rebars.map((b) => b.centre[0])), maxX: Math.max(...p.rebars.map((b) => b.centre[0])), minY: Math.min(...p.rebars.map((b) => b.centre[1])), maxY: Math.max(...p.rebars.map((b) => b.centre[1])) };
  }
  if (p.probes.length) box = unionBox(box, { minX: Math.min(...p.probes.map((q) => q.position[0])), maxX: Math.max(...p.probes.map((q) => q.position[0])), minY: Math.min(...p.probes.map((q) => q.position[1])), maxY: Math.max(...p.probes.map((q) => q.position[1])) });
  const fit = fitBox(box, plot, 0.08);
  const mat = new Map(p.materials.map((m) => [m.id, m]));
  let body = '';
  if (o.title) body += textTitle(16, 22, o.title, c);

  // Regions (larger first so nested ones draw on top)
  const regions = [...p.regions].sort((a, b) => area(b.polygon.outer) - area(a.polygon.outer));
  for (const r of regions) {
    const m = r.materialId ? mat.get(r.materialId) : undefined;
    const fill = r.color ?? m?.color ?? CATEGORY_FILL[m?.category ?? 'none'] ?? CATEGORY_FILL.none;
    body += `<path d="${polygonPath(r.polygon, fit)}" fill="${fill}" fill-rule="evenodd" stroke="${c.outline}" stroke-width="1.2" data-region="${esc(r.id)}"/>`;
  }
  // Mesh overlay (light)
  if (o.mesh) {
    let d = '';
    const t = o.mesh.triangles, nd = o.mesh.nodes;
    for (let e = 0; e < t.length; e += 3) {
      d += `M${n(fit.x(nd[2 * t[e]]))} ${n(fit.y(nd[2 * t[e] + 1]))}L${n(fit.x(nd[2 * t[e + 1]]))} ${n(fit.y(nd[2 * t[e + 1] + 1]))}L${n(fit.x(nd[2 * t[e + 2]]))} ${n(fit.y(nd[2 * t[e + 2] + 1]))}Z`;
    }
    body += `<path d="${d}" fill="none" stroke="${c.outline}" stroke-opacity="0.25" stroke-width="0.4"/>`;
  }
  // Region labels
  if (show('regions')) {
    for (const r of regions) {
      const m = r.materialId ? mat.get(r.materialId) : undefined;
      const [cx, cy] = centroid(r.polygon.outer);
      const label = `${r.name}${m ? ` – ${m.name}` : lang === 'nb' ? ' – (uten materiale)' : ' – (no material)'}`;
      body += `<text x="${n(fit.x(cx))}" y="${n(fit.y(cy))}" text-anchor="middle" font-size="11" fill="${c.fg}" stroke="${c.bg}" stroke-width="3" paint-order="stroke">${esc(label)}</text>`;
    }
  }
  // Boundary conditions: colour-coded edges
  const bcItems: { label: string; color: string }[] = [];
  if (show('boundaryConditions')) {
    for (const bc of p.boundaryConditions) {
      const color = bc.color ?? BC_COLORS[bc.type] ?? c.accent;
      let d = '';
      for (const ref of bc.edgeRefs) {
        const r = p.regions.find((x) => x.id === ref.regionId);
        if (!r) continue;
        const ring = ref.ring === 0 ? r.polygon.outer : r.polygon.holes[ref.ring - 1];
        if (!ring || !ring.length) continue;
        const a = ring[ref.edgeIndex % ring.length], b = ring[(ref.edgeIndex + 1) % ring.length];
        if (!a || !b) continue;
        d += `M${n(fit.x(a[0]))} ${n(fit.y(a[1]))}L${n(fit.x(b[0]))} ${n(fit.y(b[1]))}`;
      }
      if (d) body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-opacity="0.85" data-bc="${esc(bc.id)}"/>`;
      bcItems.push({ label: `${bc.name} (${bcTypeLabel(bc.type, lang)})`, color });
    }
  }
  // Rebars
  for (const b of p.rebars) {
    const r = (b.diameter / 2) * fit.scale;
    body += `<circle cx="${n(fit.x(b.centre[0]))}" cy="${n(fit.y(b.centre[1]))}" r="${n(Math.max(2, r))}" fill="#475569" stroke="${c.outline}" stroke-width="0.8" data-rebar="${esc(b.id)}"/>`;
    if (show('rebars')) body += `<text x="${n(fit.x(b.centre[0]) + Math.max(2, r) + 2)}" y="${n(fit.y(b.centre[1]) - Math.max(2, r) - 1)}" font-size="9" fill="${c.fg}" stroke="${c.bg}" stroke-width="2.5" paint-order="stroke">${esc(`${b.name} Ø${fmt(b.diameter, 0)}`)}</text>`;
  }
  // Probes
  if (show('probes')) {
    for (const q of p.probes) {
      if (q.kind === 'rebar') continue; // drawn with the bar
      const px = fit.x(q.position[0]), py = fit.y(q.position[1]);
      body += `<path d="M${n(px - 4)} ${n(py)}L${n(px + 4)} ${n(py)}M${n(px)} ${n(py - 4)}L${n(px)} ${n(py + 4)}" stroke="${c.accent}" stroke-width="1.5"/>`;
      body += `<text x="${n(px + 5)}" y="${n(py - 4)}" font-size="9" fill="${c.accent}" stroke="${c.bg}" stroke-width="2.5" paint-order="stroke">${esc(q.name)}</text>`;
    }
  }
  // Dimensions
  if (show('dimensions')) {
    const w = box.maxX - box.minX, h = box.maxY - box.minY;
    const yb = fit.y(box.minY) + 18;
    body += `<line x1="${n(fit.x(box.minX))}" y1="${n(yb)}" x2="${n(fit.x(box.maxX))}" y2="${n(yb)}" stroke="${c.axis}" stroke-width="1" marker-start="url(#dimA)" marker-end="url(#dimA)"/>`;
    body += `<text x="${n((fit.x(box.minX) + fit.x(box.maxX)) / 2)}" y="${n(yb + 12)}" text-anchor="middle" font-size="10" fill="${c.fg}">${fmt(w, 0)} mm</text>`;
    const xr = fit.x(box.maxX) + 18;
    body += `<line x1="${n(xr)}" y1="${n(fit.y(box.minY))}" x2="${n(xr)}" y2="${n(fit.y(box.maxY))}" stroke="${c.axis}" stroke-width="1"/>`;
    body += `<text transform="translate(${n(xr + 12)},${n((fit.y(box.minY) + fit.y(box.maxY)) / 2)}) rotate(-90)" text-anchor="middle" font-size="10" fill="${c.fg}">${fmt(h, 0)} mm</text>`;
    body += `<text x="${n(fit.x(box.minX))}" y="${n(fit.y(box.minY) + 34)}" font-size="9" fill="${c.muted}">${esc(lang === 'nb' ? 'origo' : 'origin')} (${fmt(box.minX, 0)}, ${fmt(box.minY, 0)})</text>`;
  }
  // Legend
  const items = [
    ...bcItems,
    ...(p.rebars.length ? [{ label: lang === 'nb' ? `Armering (${p.rebars.length} stk)` : `Rebar (${p.rebars.length})`, color: '#475569', swatch: 'box' as const }] : []),
    ...(p.probes.length ? [{ label: lang === 'nb' ? `Målepunkter (${p.probes.length})` : `Probes (${p.probes.length})`, color: c.accent }] : []),
  ];
  body += legend(40, H - legendH + 14, items, c, Math.max(1, Math.floor((W - 80) / 200)), 200);
  body += `<defs><marker id="dimA" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 3L6 0L6 6Z" fill="${c.axis}"/></marker></defs>`;
  return svgDocument(W, H, c, body, o.title);
}

function bcTypeLabel(t: string, lang: 'nb' | 'en'): string {
  const nb: Record<string, string> = { fixed: 'fast temperatur', convection: 'konveksjon', 'convection-radiation': 'konveksjon + stråling', flux: 'varmestrøm', insulated: 'isolert' };
  const en: Record<string, string> = { fixed: 'fixed temperature', convection: 'convection', 'convection-radiation': 'convection + radiation', flux: 'heat flux', insulated: 'insulated' };
  return (lang === 'nb' ? nb : en)[t] ?? t;
}

export function area(r: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

export function centroid(r: Vec2[]): Vec2 {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const m = r.reduce((s, q) => [s[0] + q[0], s[1] + q[1]], [0, 0]);
    return [m[0] / Math.max(1, r.length), m[1] / Math.max(1, r.length)];
  }
  return [cx / (3 * a), cy / (3 * a)];
}
