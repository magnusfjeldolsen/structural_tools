import { describe, expect, it } from 'vitest';
import {
  BUILTIN_LIBRARY,
  compileMaterial,
  getLibraryItem,
  kcConcrete,
  ksSteel,
  libraryHash,
  lookupReduction,
  materialFromLibrary,
  mergeLibraries,
  parseLibraryFile,
  REDUCTION_TABLES,
  searchLibrary,
} from '../../src/library/index.js';

describe('built-in library integrity', () => {
  it('every item has a citation, tags, hash, and every material compiles with a valid range', () => {
    expect(BUILTIN_LIBRARY.length).toBeGreaterThan(50);
    const ids = new Set<string>();
    for (const item of BUILTIN_LIBRARY) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);
      expect(item.source.text.length).toBeGreaterThan(8);
      expect(item.tags.length).toBeGreaterThan(0);
      expect(item.hash).toBe(libraryHash(item));
      expect(item.origin).toBe('builtin');
      if (item.category === 'material') {
        const m = materialFromLibrary(item);
        expect(m.validRange[0]).toBeLessThan(m.validRange[1]);
        expect(m.emissivity).toBeGreaterThan(0);
        expect(m.emissivity).toBeLessThanOrEqual(1);
        const ev = compileMaterial(m);
        for (const t of [m.validRange[0], 20, m.validRange[1]]) {
          expect(ev.lambda(t)).toBeGreaterThan(0);
          expect(ev.rhoCp(t)).toBeGreaterThan(0);
          expect(Number.isFinite(ev.enthalpy(t))).toBe(true);
        }
        expect(ev.enthalpy(100)).toBeGreaterThan(ev.enthalpy(0));
        expect(m.libraryHash).toBe(item.hash);
      } else {
        expect(item.curve).toBeDefined();
      }
    }
  });

  it('covers every seed category of spec §7', () => {
    const cats = new Set(BUILTIN_LIBRARY.filter((i) => i.material).map((i) => i.material!.category));
    for (const c of ['concrete', 'insulation', 'wood', 'gypsum', 'metal', 'masonry', 'air', 'ground', 'membrane']) expect(cats.has(c as never)).toBe(true);
  });

  it('typical values are flagged and standard values cite a clause', () => {
    const typical = BUILTIN_LIBRARY.filter((i) => i.quality === 'typical');
    expect(typical.length).toBeGreaterThan(5);
    for (const i of BUILTIN_LIBRARY.filter((x) => x.quality === 'standard' && x.category === 'material')) {
      expect(/EN|ISO|ASTM/.test(i.source.text)).toBe(true);
    }
  });
});

describe('reduction tables', () => {
  it('k_s hot-rolled (Table 3.2a) and k_c (Table 3.1)', () => {
    expect(ksSteel('hot-rolled', 20)).toBe(1);
    expect(ksSteel('hot-rolled', 500)).toBe(0.78);
    expect(ksSteel('hot-rolled', 550)).toBeCloseTo(0.625, 9);
    expect(ksSteel('hot-rolled', 1200)).toBe(0);
    expect(ksSteel('cold-worked', 400)).toBe(0.94);
    expect(ksSteel('compression', 300)).toBe(0.8);
    expect(kcConcrete(500)).toBe(0.6);
    expect(kcConcrete(500, 'calcareous')).toBe(0.74);
    expect(kcConcrete(1300)).toBe(0);
    expect(() => ksSteel('nope', 100)).toThrow(/Unknown steel class/);
    for (const t of REDUCTION_TABLES) {
      expect(t.points[0][1]).toBe(1);
      expect(t.points[t.points.length - 1][1]).toBe(0);
      for (let i = 1; i < t.points.length; i++) expect(t.points[i][1]).toBeLessThanOrEqual(t.points[i - 1][1]);
    }
  });
  it('rebar material carries the k_s tables', () => {
    const rebar = materialFromLibrary(getLibraryItem('reinforcing-steel')!);
    const ks = rebar.strength!.find((t) => t.id === 'hot-rolled')!;
    expect(lookupReduction(ks, 600)).toBe(0.47);
    const concrete = materialFromLibrary(getLibraryItem('concrete-siliceous')!);
    expect(lookupReduction(concrete.strength![0], 700)).toBe(0.3);
  });
});

describe('searchLibrary', () => {
  it('finds by Norwegian and English words, category and ranges', () => {
    expect(searchLibrary({ text: 'steinull' })[0].id).toBe('mineral-wool-stone');
    expect(searchLibrary({ text: 'concrete siliceous' })[0].id).toBe('concrete-siliceous');
    expect(searchLibrary({ text: 'brann', category: 'fire-curve' }).map((i) => i.id)).toContain('iso834');
    const ins = searchLibrary({ materialCategory: 'insulation', lambdaRange: [0, 0.03] });
    expect(ins.map((i) => i.id).sort()).toEqual(['aerogel', 'pir']);
    expect(searchLibrary({ densityRange: [7000, 8000] }).every((i) => i.material?.category === 'metal')).toBe(true);
    expect(searchLibrary({ tags: ['rebar'] })[0].id).toBe('reinforcing-steel');
    expect(searchLibrary({ text: 'xyzzy' })).toEqual([]);
    expect(searchLibrary({ limit: 3 }).length).toBe(3);
  });
});

describe('user libraries', () => {
  it('parses CSV with decimal comma and merges with id collision handling', () => {
    const csv = 'name;category;lambda;cp;rho;emissivity;source\nMin isolasjon;insulation;0,036;1030;70;0,9;Datablad X 2025\nEPS;insulation;0,04;1450;25;;\n';
    const items = parseLibraryFile(csv, 'firma.csv');
    expect(items.length).toBe(2);
    expect(items[0].id).toBe('user-min-isolasjon');
    expect(items[0].material?.model).toEqual({ kind: 'constant', lambda: 0.036, cp: 1030, rho: 70 });
    expect(items[0].source.text).toBe('Datablad X 2025');
    expect(items[1].material?.emissivity).toBe(0.9);
    expect(items[0].hash).toBeDefined();
    const merged = mergeLibraries(BUILTIN_LIBRARY, [items, [{ ...items[0] }], [{ ...items[0], id: 'eps' }]]);
    expect(merged.length).toBe(BUILTIN_LIBRARY.length + 4);
    expect(merged.filter((i) => i.id.startsWith('user:')).map((i) => i.id).sort()).toEqual(['user:eps', 'user:user-min-isolasjon']);
    expect(getLibraryItem('eps', merged)!.origin).toBe('builtin');
  });

  it('parses JSON items and validates them', () => {
    const json = JSON.stringify({
      items: [
        { name: 'Firmabetong', material: { model: { kind: 'concrete-en1992-1-2', aggregate: 'siliceous', moisture: 3, conductivity: 'upper', rho20: 2400 } } },
        { id: 'my-curve', name: 'Min kurve', category: 'climate-series', curve: { generator: 'constant', params: { value: 18 }, unit: '°C' } },
      ],
    });
    const items = parseLibraryFile(json, 'lib.json');
    expect(items.map((i) => i.id)).toEqual(['user-firmabetong', 'my-curve']);
    expect(items[0].material?.emissivity).toBe(0.9);
    expect(items[0].quality).toBe('user');
    expect(() => parseLibraryFile('[{"name":"x"}]')).toThrow(/needs a 'material' or a 'curve'/);
  });
});
