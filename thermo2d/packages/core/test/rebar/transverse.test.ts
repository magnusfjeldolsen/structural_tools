import { describe, expect, it } from 'vitest';
import { applyCommands, createEmptyProject, parseProject, serializeProject } from '../../src/index.js';

describe('transverse reinforcement diameter', () => {
  const base = applyCommands(createEmptyProject('t'), [
    { type: 'material.addFromLibrary', libraryId: 'concrete-siliceous', id: 'concrete' },
    { type: 'material.addFromLibrary', libraryId: 'reinforcing-steel', id: 'steel' },
    { type: 'template.create', templateId: 'rect-beam', params: { b: 1200, h: 550 }, materialId: 'concrete', id: 'beam' },
  ]).project;

  it('adds the transverse diameter as distance only: cover 20 + Ø12 + Ø25/2 → centre at 44.5 mm', () => {
    const { project } = applyCommands(base, [
      { type: 'rebarSet.add', set: { id: 'rs', name: 'Bunn', kind: 'edge', regionId: 'beam', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, diameter: 25, materialId: 'steel', cover: 20, transverseDiameter: 12, count: 9 } },
    ]);
    expect(project.rebars).toHaveLength(9);
    for (const b of project.rebars) expect(b.centre[1]).toBeCloseTo(44.5, 6);
    const xs = project.rebars.map((b) => b.centre[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(44.5, 6);
    expect(xs[8]).toBeCloseTo(1155.5, 6);
    // nothing is meshed for the stirrup: only bar regions exist
    expect(project.rebarSets.find((s) => s.id === 'rs')!.meshed).toBeUndefined();
  });

  it('applies with cover to centre as well, and survives a save/load round trip', () => {
    const { project } = applyCommands(base, [
      { type: 'project.setSettings', patch: { coverReference: 'centre' } },
      { type: 'rebarSet.add', set: { id: 'rs', name: 'Bunn', kind: 'edge', regionId: 'beam', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, diameter: 25, materialId: 'steel', cover: 40, transverseDiameter: 10, count: 2 } },
    ]);
    for (const b of project.rebars) expect(b.centre[1]).toBeCloseTo(50, 6);
    const back = parseProject(serializeProject(project));
    expect(back.rebarSets[0].transverseDiameter).toBe(10);
  });
});
