/**
 * Spec §14 case 6: the user's FEM-Design section 17. The reference numbers are another tool's
 * output and are NOT committed: they live in thermo2d/local/fem-design-section-17.json
 * (gitignored). Without the file the test is skipped with a message.
 *
 * Model: 1200 × 550 beam, 14 Ø25 at the FEM-Design coordinates, bars read as CONCRETE
 * temperature at the bar centre (the EN 1992-1-2 Annex A / FEM-Design convention; steel bars
 * come out 20–40 K cooler at the corners), ISO 834 on bottom and both sides, αc = 4 on top.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCommands, createEmptyProject, rebarTable, runProject, type Command } from '../../src/index.js';

interface Section17 {
  section: { b: number; h: number };
  cover: number;
  transverseDiameter: number;
  barDiameter: number;
  fire: { curve: string; alphaC: number; phi: number; epsM: number; epsF: number; unexposedAlpha: number; dt: number };
  bars: [number, number, number][];
}

const file = resolve(__dirname, '../../../../local/fem-design-section-17.json');
const data: Section17 | null = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Section17) : null;

describe('case 6 — FEM-Design section 17 (local data)', () => {
  if (!data) {
    it.skip('skipped: thermo2d/local/fem-design-section-17.json is missing (private reference data, see DECISIONS.md)', () => {});
    return;
  }

  it('matches the FEM-Design rebar temperatures: mean |Δ| < 10 K, max |Δ| < 25 K', () => {
    const { b, h } = data.section;
    const cmds: Command[] = [
      { type: 'material.addFromLibrary', libraryId: 'concrete-siliceous', id: 'concrete' },
      { type: 'template.create', templateId: 'rect-beam', params: { b, h }, materialId: 'concrete', id: 'beam' },
    ];
    data.bars.forEach(([x, y], i) => cmds.push({ type: 'rebar.add', rebar: { id: `fd${i}`, name: `FD${i + 1}`, centre: [x + b / 2, y + h / 2], diameter: data.barDiameter, materialId: 'concrete' } }));
    cmds.push({
      type: 'exposure.apply',
      fireCurve: data.fire.curve,
      faces: [
        { side: 'bottom', kind: 'fire', params: { alphaC: data.fire.alphaC, phi: data.fire.phi, epsM: data.fire.epsM, epsF: data.fire.epsF } },
        { side: 'left', kind: 'fire', params: { alphaC: data.fire.alphaC, phi: data.fire.phi, epsM: data.fire.epsM, epsF: data.fire.epsF } },
        { side: 'right', kind: 'fire', params: { alphaC: data.fire.alphaC, phi: data.fire.phi, epsM: data.fire.epsM, epsF: data.fire.epsF } },
        { side: 'top', kind: 'fire-unexposed', params: { alpha: data.fire.unexposedAlpha } },
      ],
    });
    cmds.push({ type: 'analysis.update', id: 'an_main', patch: { duration: 5400, dt: data.fire.dt, outputInterval: 600 } });
    cmds.push({ type: 'project.setMesh', patch: { preset: 'normal' } });
    const project = applyCommands(createEmptyProject('Section 17'), cmds).project;

    const result = runProject(project);
    const rows = rebarTable(project, result, [5400]);
    const table = data.bars.map(([x, y, fd]) => {
      const row = rows.find((r) => Math.abs(r.x - (x + b / 2)) < 0.5 && Math.abs(r.y - (y + h / 2)) < 0.5)!;
      return { pos: `(${x}, ${y})`, femDesign: fd, thermo2d: Number(row.temps[0].toFixed(0)), delta: Number((row.temps[0] - fd).toFixed(0)) };
    });
    console.table(table);
    const abs = table.map((r) => Math.abs(r.delta));
    const mean = abs.reduce((s, v) => s + v, 0) / abs.length;
    console.log(`mesh ${result.mesh.stats.nodeCount} nodes; mean |Δ| = ${mean.toFixed(1)} K, max |Δ| = ${Math.max(...abs)} K`);
    expect(mean).toBeLessThan(10);
    expect(Math.max(...abs)).toBeLessThan(25);
  }, 180000);
});
