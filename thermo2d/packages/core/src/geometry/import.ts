/**
 * Geometry importers: geometry_workspace export (this repo), coordinate CSV and DXF polylines.
 * All return normalised polygons in mm.
 */
import type { Polygon, Ring, Vec2 } from '../model/types.js';
import { cleanRing, normalizePolygon, ringArea } from './ring.js';

export interface ImportedRegion {
  name: string;
  polygon: Polygon;
  /** Material name or id hint from the source, if any. */
  materialHint?: string;
}

export interface GeometryImportResult {
  regions: ImportedRegion[];
  notes: string[];
}

function toRing(raw: unknown): Ring | null {
  if (!Array.isArray(raw)) return null;
  const ring: Ring = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])) ring.push([+p[0], +p[1]]);
    else if (p && typeof p === 'object' && 'x' in p && 'y' in p) {
      const q = p as { x: unknown; y: unknown };
      if (Number.isFinite(+(q.x as number)) && Number.isFinite(+(q.y as number))) ring.push([+(q.x as number), +(q.y as number)]);
    }
  }
  const c = cleanRing(ring);
  return c.length >= 3 ? c : null;
}

/**
 * Reads the `resolved` block of a geometry_workspace JSON export:
 * `resolved.regions[].rings[].{outer, holes}` in mm, rings closed, outer CCW / holes CW.
 * Falls back to `shapes[].points` when `resolved` is absent (holes ignored, noted).
 */
export function parseGeometryWorkspaceDetailed(json: unknown): GeometryImportResult {
  const notes: string[] = [];
  const regions: ImportedRegion[] = [];
  const doc = (typeof json === 'string' ? JSON.parse(json) : json) as Record<string, unknown> | null;
  if (!doc || typeof doc !== 'object') throw new Error('Not a geometry_workspace file.');
  const resolved = doc.resolved as Record<string, unknown> | undefined;
  if (resolved && Array.isArray(resolved.regions)) {
    if (resolved.unit && resolved.unit !== 'mm') notes.push(`Unit "${resolved.unit}" reported; values are treated as mm.`);
    if (Array.isArray(resolved.notes)) notes.push(...(resolved.notes as unknown[]).map(String));
    if (Array.isArray(resolved.voidsIgnored) && resolved.voidsIgnored.length) notes.push(`Voids ignored by the source: ${(resolved.voidsIgnored as unknown[]).join(', ')}`);
    for (const r of resolved.regions as Record<string, unknown>[]) {
      const rings = Array.isArray(r.rings) ? (r.rings as Record<string, unknown>[]) : [];
      rings.forEach((rg, k) => {
        const outer = toRing(rg.outer);
        if (!outer) return;
        const holes = Array.isArray(rg.holes) ? (rg.holes as unknown[]).map(toRing).filter((h): h is Ring => !!h) : [];
        regions.push({
          name: rings.length > 1 ? `${String(r.name ?? r.id ?? 'region')} (${k + 1})` : String(r.name ?? r.id ?? 'region'),
          polygon: normalizePolygon({ outer, holes }),
          materialHint: typeof r.material === 'string' ? r.material : undefined,
        });
      });
    }
    return { regions, notes };
  }
  const shapes = Array.isArray(doc.shapes) ? (doc.shapes as Record<string, unknown>[]) : [];
  for (const s of shapes) {
    if (s.role === 'void') {
      notes.push(`Void "${String(s.name ?? s.id ?? '')}" skipped: export the file with a "resolved" block to keep holes.`);
      continue;
    }
    const outer = toRing(s.points);
    if (!outer) continue;
    regions.push({ name: String(s.name ?? s.id ?? 'shape'), polygon: normalizePolygon({ outer, holes: [] }), materialHint: typeof s.material === 'string' ? s.material : undefined });
  }
  if (!regions.length) throw new Error('No closed shapes found in the file.');
  return { regions, notes };
}

/** Parse "x;y" / "x,y" / "x<tab>y" lines (decimal comma allowed) into one ring. Blank line separates rings (first = outer, rest = holes). */
export function parsePolygonCsvDetailed(text: string): GeometryImportResult {
  const rings: Ring[] = [];
  let cur: Ring = [];
  const flush = () => {
    const c = cleanRing(cur);
    if (c.length >= 3) rings.push(c);
    cur = [];
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (/^[a-zA-Z#]/.test(line)) continue; // header or comment
    const parts = line.includes(';') ? line.split(';') : line.includes('\t') ? line.split('\t') : line.split(',');
    let xs: string;
    let ys: string;
    if (parts.length >= 2 && (line.includes(';') || line.includes('\t'))) {
      [xs, ys] = parts;
    } else if (parts.length === 2) {
      [xs, ys] = parts;
    } else if (parts.length === 4) {
      // "1,5,2,5" = decimal-comma pairs
      xs = `${parts[0]}.${parts[1]}`;
      ys = `${parts[2]}.${parts[3]}`;
    } else continue;
    const x = parseFloat(xs.trim().replace(',', '.'));
    const y = parseFloat(ys.trim().replace(',', '.'));
    if (Number.isFinite(x) && Number.isFinite(y)) cur.push([x, y]);
  }
  flush();
  if (!rings.length) throw new Error('No coordinate pairs found. Use one "x;y" pair per line.');
  return { regions: [{ name: 'Imported polygon', polygon: normalizePolygon({ outer: rings[0], holes: rings.slice(1) }) }], notes: [] };
}

/** Closed LWPOLYLINE / POLYLINE entities from a DXF text file. Bulges are discretised into arcs. */
export function parseDxfDetailed(text: string): GeometryImportResult {
  const lines = text.split(/\r?\n/);
  const rings: { ring: Ring; layer: string }[] = [];
  const notes: string[] = [];
  let i = 0;
  const next = (): [number, string] | null => {
    if (i + 1 >= lines.length) return null;
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    i += 2;
    return [code, value];
  };
  let pair = next();
  while (pair) {
    if (pair[0] === 0 && pair[1] === 'LWPOLYLINE') {
      const pts: { x: number; y: number; bulge: number }[] = [];
      let closed = false;
      let layer = '0';
      let curX: number | null = null;
      let p = next();
      while (p && p[0] !== 0) {
        if (p[0] === 8) layer = p[1];
        else if (p[0] === 70) closed = (parseInt(p[1], 10) & 1) === 1;
        else if (p[0] === 10) curX = parseFloat(p[1]);
        else if (p[0] === 20 && curX !== null) {
          pts.push({ x: curX, y: parseFloat(p[1]), bulge: 0 });
          curX = null;
        } else if (p[0] === 42 && pts.length) pts[pts.length - 1].bulge = parseFloat(p[1]);
        p = next();
      }
      pair = p;
      if (closed && pts.length >= 3) rings.push({ ring: bulgeRing(pts), layer });
      else if (pts.length >= 3) notes.push(`Open polyline on layer ${layer} skipped (only closed polylines are imported).`);
      continue;
    }
    if (pair[0] === 0 && pair[1] === 'POLYLINE') {
      const pts: { x: number; y: number; bulge: number }[] = [];
      let closed = false;
      let layer = '0';
      let p = next();
      while (p && !(p[0] === 0 && p[1] === 'SEQEND')) {
        if (p[0] === 8 && !pts.length) layer = p[1];
        else if (p[0] === 70 && !pts.length) closed = (parseInt(p[1], 10) & 1) === 1;
        else if (p[0] === 0 && p[1] === 'VERTEX') {
          let x = 0;
          let y = 0;
          let bulge = 0;
          let q = next();
          while (q && q[0] !== 0) {
            if (q[0] === 10) x = parseFloat(q[1]);
            else if (q[0] === 20) y = parseFloat(q[1]);
            else if (q[0] === 42) bulge = parseFloat(q[1]);
            q = next();
          }
          pts.push({ x, y, bulge });
          p = q;
          continue;
        }
        p = next();
      }
      pair = next();
      if (closed && pts.length >= 3) rings.push({ ring: bulgeRing(pts), layer });
      continue;
    }
    pair = next();
  }
  if (!rings.length) throw new Error('No closed polylines found in the DXF file.');
  // Largest ring is the outline; rings inside it become holes; the rest are separate regions.
  const sorted = rings.map((r) => ({ ...r, area: Math.abs(ringArea(r.ring)) })).sort((a, b) => b.area - a.area);
  const regions: ImportedRegion[] = [];
  const used = new Set<number>();
  sorted.forEach((r, idx) => {
    if (used.has(idx)) return;
    const holes: Ring[] = [];
    for (let j = idx + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const inner = sorted[j].ring;
      const c = inner[0];
      if (pointInRingSimple(c, r.ring)) {
        holes.push(inner);
        used.add(j);
      }
    }
    regions.push({ name: `DXF ${r.layer}${regions.length ? ' ' + (regions.length + 1) : ''}`, polygon: normalizePolygon({ outer: r.ring, holes }) });
  });
  return { regions, notes };
}

function pointInRingSimple(pt: Vec2, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bulgeRing(pts: { x: number; y: number; bulge: number }[]): Ring {
  const ring: Ring = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    ring.push([a.x, a.y]);
    if (Math.abs(a.bulge) > 1e-9) {
      const theta = 4 * Math.atan(a.bulge); // included angle
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      const r = chord / (2 * Math.sin(Math.abs(theta) / 2));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const d = Math.sqrt(Math.max(0, r * r - (chord / 2) ** 2));
      const s = theta > 0 ? 1 : -1;
      const cx = mx - (s * d * (b.y - a.y)) / chord;
      const cy = my + (s * d * (b.x - a.x)) / chord;
      const a0 = Math.atan2(a.y - cy, a.x - cx);
      const segs = Math.max(2, Math.ceil((Math.abs(theta) / (Math.PI / 2)) * 8));
      for (let q = 1; q < segs; q++) {
        const ang = a0 + (theta * q) / segs;
        ring.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
      }
    }
  }
  return ring;
}

/** geometry_workspace export -> regions (see parseGeometryWorkspaceDetailed for notes). */
export function parseGeometryWorkspace(json: unknown): { name: string; polygon: Polygon; materialHint?: string }[] {
  return parseGeometryWorkspaceDetailed(json).regions;
}

/** Coordinate CSV -> the outer ring (first block of lines). */
export function parsePolygonCsv(text: string): Ring {
  return parsePolygonCsvDetailed(text).regions[0].polygon.outer;
}

/** DXF -> one ring per closed polyline (largest first; holes reversed to CCW). */
export function parseDxf(text: string): Ring[] {
  const out: Ring[] = [];
  for (const r of parseDxfDetailed(text).regions) {
    out.push(r.polygon.outer);
    for (const h of r.polygon.holes) out.push(h.slice().reverse());
  }
  return out;
}
