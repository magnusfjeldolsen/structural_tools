/**
 * Parametric section templates. A template is only a starting shape: after
 * creation the result is an ordinary polygon that the parameter panel can still
 * drive through `template.update`. Origin at the bottom-left of the bounding
 * box; outer rings CCW.
 */
import type { MaterialCategory, Polygon, Ring } from '../model/types.js';
import { normalizePolygon } from '../geometry/ring.js';
import { rectRing, circleRing } from '../geometry/primitives.js';
import { CommandError } from '../commands/types.js';

export type TemplateParams = Record<string, number | string | boolean>;

export interface ParamDef {
  key: string;
  label: string;
  labelNb: string;
  default: number | string | boolean;
  min?: number;
  max?: number;
  unit?: string;
  kind: 'number' | 'select' | 'boolean' | 'text';
  options?: string[];
}

export interface TemplateRegionOut {
  name: string;
  nameNb?: string;
  polygon: Polygon;
  materialHint?: MaterialCategory;
}

export interface TemplateDef {
  id: string;
  name: string;
  nameNb: string;
  group: 'beam' | 'column' | 'slab' | 'wall' | 'junction';
  params: ParamDef[];
  build(params: TemplateParams): { regions: TemplateRegionOut[] };
}

const num = (p: TemplateParams, k: string, d: number): number => {
  const v = p[k];
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : d;
};
const P = (key: string, label: string, labelNb: string, def: number, unit = 'mm', min = 1, max = 20000): ParamDef => ({ key, label, labelNb, default: def, min, max, unit, kind: 'number' });
const poly = (ring: Ring, holes: Ring[] = []): Polygon => normalizePolygon({ outer: ring, holes });
const one = (name: string, nameNb: string, polygon: Polygon, materialHint: MaterialCategory = 'concrete'): TemplateRegionOut => ({ name, nameNb, polygon, materialHint });

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'rect-beam',
    name: 'Rectangular beam',
    nameNb: 'Rektangulær bjelke',
    group: 'beam',
    params: [P('b', 'Width b', 'Bredde b', 300), P('h', 'Height h', 'Høyde h', 500)],
    build: (p) => ({ regions: [one('Beam', 'Bjelke', poly(rectRing(0, 0, num(p, 'b', 300), num(p, 'h', 500))))] }),
  },
  {
    id: 't-beam',
    name: 'T-beam',
    nameNb: 'T-bjelke',
    group: 'beam',
    params: [P('b', 'Web width b', 'Stegbredde b', 300), P('h', 'Total height h', 'Total høyde h', 600), P('bf', 'Flange width', 'Flensbredde', 800), P('hf', 'Flange thickness', 'Flenstykkelse', 150)],
    build: (p) => {
      const b = num(p, 'b', 300);
      const h = num(p, 'h', 600);
      const bf = Math.max(b, num(p, 'bf', 800));
      const hf = Math.min(h, num(p, 'hf', 150));
      const x0 = (bf - b) / 2;
      const ring: Ring = [[x0, 0], [x0 + b, 0], [x0 + b, h - hf], [bf, h - hf], [bf, h], [0, h], [0, h - hf], [x0, h - hf]];
      return { regions: [one('T-beam', 'T-bjelke', poly(ring))] };
    },
  },
  {
    id: 'inverted-t',
    name: 'Inverted T-beam',
    nameNb: 'Omvendt T-bjelke',
    group: 'beam',
    params: [P('b', 'Web width b', 'Stegbredde b', 300), P('h', 'Total height h', 'Total høyde h', 600), P('bf', 'Flange width', 'Flensbredde', 800), P('hf', 'Flange thickness', 'Flenstykkelse', 200)],
    build: (p) => {
      const b = num(p, 'b', 300);
      const h = num(p, 'h', 600);
      const bf = Math.max(b, num(p, 'bf', 800));
      const hf = Math.min(h, num(p, 'hf', 200));
      const x0 = (bf - b) / 2;
      const ring: Ring = [[0, 0], [bf, 0], [bf, hf], [x0 + b, hf], [x0 + b, h], [x0, h], [x0, hf], [0, hf]];
      return { regions: [one('Inverted T', 'Omvendt T', poly(ring))] };
    },
  },
  {
    id: 'l-section',
    name: 'L-section',
    nameNb: 'L-tverrsnitt',
    group: 'beam',
    params: [P('b', 'Width b', 'Bredde b', 400), P('h', 'Height h', 'Høyde h', 500), P('tw', 'Web thickness', 'Stegtykkelse', 200), P('tf', 'Flange thickness', 'Flenstykkelse', 150)],
    build: (p) => {
      const b = num(p, 'b', 400);
      const h = num(p, 'h', 500);
      const tw = Math.min(b, num(p, 'tw', 200));
      const tf = Math.min(h, num(p, 'tf', 150));
      return { regions: [one('L-section', 'L-tverrsnitt', poly([[0, 0], [b, 0], [b, tf], [tw, tf], [tw, h], [0, h]]))] };
    },
  },
  {
    id: 'i-section',
    name: 'I/H-section',
    nameNb: 'I/H-tverrsnitt',
    group: 'beam',
    params: [P('b', 'Flange width b', 'Flensbredde b', 300), P('h', 'Height h', 'Høyde h', 600), P('tw', 'Web thickness', 'Stegtykkelse', 150), P('tf', 'Flange thickness', 'Flenstykkelse', 120)],
    build: (p) => {
      const b = num(p, 'b', 300);
      const h = num(p, 'h', 600);
      const tw = Math.min(b, num(p, 'tw', 150));
      const tf = Math.min(h / 2, num(p, 'tf', 120));
      const x0 = (b - tw) / 2;
      const ring: Ring = [[0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf], [b, h], [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf]];
      return { regions: [one('I-section', 'I-tverrsnitt', poly(ring), 'metal')] };
    },
  },
  {
    id: 'box',
    name: 'Box section',
    nameNb: 'Kassetverrsnitt',
    group: 'beam',
    params: [P('b', 'Width b', 'Bredde b', 600), P('h', 'Height h', 'Høyde h', 800), P('tw', 'Wall thickness (sides)', 'Veggtykkelse (sider)', 150), P('tf', 'Wall thickness (top/bottom)', 'Veggtykkelse (topp/bunn)', 150)],
    build: (p) => {
      const b = num(p, 'b', 600);
      const h = num(p, 'h', 800);
      const tw = Math.min(b / 2 - 1, num(p, 'tw', 150));
      const tf = Math.min(h / 2 - 1, num(p, 'tf', 150));
      return { regions: [one('Box', 'Kasse', poly(rectRing(0, 0, b, h), [rectRing(tw, tf, b - 2 * tw, h - 2 * tf)]))] };
    },
  },
  {
    id: 'circle-column',
    name: 'Circular column',
    nameNb: 'Sirkulær søyle',
    group: 'column',
    params: [P('d', 'Diameter d', 'Diameter d', 400)],
    build: (p) => {
      const d = num(p, 'd', 400);
      return { regions: [one('Column', 'Søyle', { outer: circleRing(d / 2, d / 2, d / 2), holes: [] })] };
    },
  },
  {
    id: 'hollow-core-strip',
    name: 'Hollow-core slab strip',
    nameNb: 'Hulldekke-stripe',
    group: 'slab',
    params: [P('b', 'Strip width b', 'Stripebredde b', 1200), P('h', 'Thickness h', 'Tykkelse h', 265), P('nCores', 'Number of cores', 'Antall kanaler', 5, '', 1, 20), P('coreD', 'Core diameter', 'Kanaldiameter', 180)],
    build: (p) => {
      const b = num(p, 'b', 1200);
      const h = num(p, 'h', 265);
      const n = Math.max(1, Math.round(num(p, 'nCores', 5)));
      const d = Math.min(h - 20, num(p, 'coreD', 180));
      const holes: Ring[] = [];
      for (let i = 0; i < n; i++) {
        const cx = (b * (i + 0.5)) / n;
        holes.push(circleRing(cx, h / 2, d / 2));
      }
      return { regions: [one('Hollow-core strip', 'Hulldekke', poly(rectRing(0, 0, b, h), holes))] };
    },
  },
  {
    id: 'layered-wall',
    name: 'Layered wall',
    nameNb: 'Lagdelt vegg',
    group: 'wall',
    params: [
      { key: 'layers', label: 'Layers "thickness material|…" from left', labelNb: 'Lag «tykkelse materiale|…» fra venstre', default: '150 concrete|200 insulation|13 gypsum', kind: 'text' },
      P('width', 'Section height (along the wall)', 'Snitthøyde (langs veggen)', 1000),
    ],
    build: (p) => {
      const width = num(p, 'width', 1000);
      const spec = String(p.layers ?? '150 concrete|200 insulation|13 gypsum');
      const regions: TemplateRegionOut[] = [];
      let x = 0;
      spec.split('|').forEach((part, i) => {
        const m = part.trim().match(/^([\d.,]+)\s*(.*)$/);
        if (!m) return;
        const t = parseFloat(m[1].replace(',', '.'));
        if (!(t > 0)) return;
        const mat = (m[2] || 'custom').trim().toLowerCase();
        const hint = (['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane'].includes(mat) ? mat : 'custom') as MaterialCategory;
        regions.push({ name: `Layer ${i + 1} (${mat})`, nameNb: `Lag ${i + 1} (${mat})`, polygon: poly(rectRing(x, 0, t, width)), materialHint: hint });
        x += t;
      });
      return { regions };
    },
  },
  {
    id: 'wall-corner',
    name: 'Wall corner',
    nameNb: 'Vegghjørne',
    group: 'junction',
    params: [P('t1', 'Inner leaf thickness', 'Innvendig vange', 150), P('ti', 'Insulation thickness', 'Isolasjonstykkelse', 200), P('t2', 'Outer leaf thickness', 'Utvendig vange', 100), P('len', 'Leg length', 'Benlengde', 1000)],
    build: (p) => {
      const t1 = num(p, 't1', 150);
      const ti = num(p, 'ti', 200);
      const t2 = num(p, 't2', 100);
      const L = num(p, 'len', 1000);
      const T = t1 + ti + t2;
      // Three L-shaped layers; the (0,0) corner is the exterior corner.
      const layer = (inner: number, outer: number): Ring => [[inner, inner], [L, inner], [L, outer], [outer, outer], [outer, L], [inner, L]];
      return {
        regions: [
          { name: 'Outer leaf', nameNb: 'Utvendig vange', polygon: poly(layer(0, t2)), materialHint: 'masonry' },
          { name: 'Insulation', nameNb: 'Isolasjon', polygon: poly(layer(t2, t2 + ti)), materialHint: 'insulation' },
          { name: 'Inner leaf', nameNb: 'Innvendig vange', polygon: poly(layer(t2 + ti, T)), materialHint: 'concrete' },
        ],
      };
    },
  },
  {
    id: 'floor-junction',
    name: 'Wall–floor junction',
    nameNb: 'Vegg–dekke-overgang',
    group: 'junction',
    params: [P('tw', 'Wall thickness', 'Veggtykkelse', 200), P('ti', 'Insulation thickness', 'Isolasjonstykkelse', 200), P('hs', 'Slab thickness', 'Dekketykkelse', 250), P('len', 'Leg length', 'Benlengde', 1000)],
    build: (p) => {
      const tw = num(p, 'tw', 200);
      const ti = num(p, 'ti', 200);
      const hs = num(p, 'hs', 250);
      const L = num(p, 'len', 1000);
      const y0 = L; // slab mid-height
      return {
        regions: [
          { name: 'Insulation', nameNb: 'Isolasjon', polygon: poly(rectRing(0, 0, ti, 2 * L)), materialHint: 'insulation' },
          { name: 'Wall below', nameNb: 'Vegg under', polygon: poly(rectRing(ti, 0, tw, y0 - hs / 2)), materialHint: 'concrete' },
          { name: 'Slab', nameNb: 'Dekke', polygon: poly(rectRing(ti, y0 - hs / 2, tw + L, hs)), materialHint: 'concrete' },
          { name: 'Wall above', nameNb: 'Vegg over', polygon: poly(rectRing(ti, y0 + hs / 2, tw, 2 * L - (y0 + hs / 2))), materialHint: 'concrete' },
        ],
      };
    },
  },
  {
    id: 'ground-foundation',
    name: 'Ground and foundation',
    nameNb: 'Grunn og fundament',
    group: 'junction',
    params: [P('bf', 'Footing width', 'Fundamentbredde', 600), P('hf', 'Footing height', 'Fundamenthøyde', 300), P('tw', 'Wall thickness', 'Veggtykkelse', 200), P('hw', 'Wall height', 'Vegghøyde', 600), P('ground', 'Ground block size', 'Grunnblokk', 1500), P('ti', 'Floor insulation', 'Gulvisolasjon', 200)],
    build: (p) => {
      const bf = num(p, 'bf', 600);
      const hf = num(p, 'hf', 300);
      const tw = Math.min(bf, num(p, 'tw', 200));
      const hw = num(p, 'hw', 600);
      const G = num(p, 'ground', 1500);
      const ti = num(p, 'ti', 200);
      const xf = G - bf / 2; // footing centred at x = G
      const ground = poly(rectRing(0, 0, 2 * G, G), [rectRing(xf, G - hf, bf, hf)]);
      return {
        regions: [
          { name: 'Ground', nameNb: 'Grunn', polygon: ground, materialHint: 'ground' },
          { name: 'Footing', nameNb: 'Såle', polygon: poly(rectRing(xf, G - hf, bf, hf)), materialHint: 'concrete' },
          { name: 'Wall', nameNb: 'Ringmur', polygon: poly(rectRing(G - tw / 2, G, tw, hw)), materialHint: 'concrete' },
          { name: 'Floor insulation', nameNb: 'Gulvisolasjon', polygon: poly(rectRing(0, G, G - tw / 2, ti)), materialHint: 'insulation' },
        ],
      };
    },
  },
];

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Build a template with defaults filled in for missing parameters. Throws on unknown id. */
export function buildTemplate(id: string, params: TemplateParams = {}): { regions: TemplateRegionOut[]; params: TemplateParams } {
  const t = getTemplate(id);
  if (!t) {
    throw new CommandError('not-found', `Unknown template "${id}".`, { field: 'templateId', value: id, options: TEMPLATES.map((x) => x.id), suggestion: 'Pick one of the listed template ids.' });
  }
  const full: TemplateParams = {};
  for (const d of t.params) {
    const v = params[d.key] ?? d.default;
    if (d.kind === 'number') {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || (d.min !== undefined && n < d.min) || (d.max !== undefined && n > d.max)) {
        throw new CommandError('bad-value', `Parameter "${d.key}" of template "${id}" must be a number${d.min !== undefined ? ` between ${d.min} and ${d.max}` : ''} (${d.unit || ''}).`, { field: d.key, value: v, suggestion: `Default is ${d.default}.` });
      }
      full[d.key] = n;
    } else full[d.key] = v;
  }
  return { regions: t.build(full).regions, params: full };
}
