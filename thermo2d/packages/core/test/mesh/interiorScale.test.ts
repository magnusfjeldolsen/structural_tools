import { describe, expect, it } from 'vitest';
import { applyCommands, buildMeshInput, createEmptyProject, interiorScale, mesh, resolveMeshSettings } from '../../src/index.js';

function beam(b: number, h: number) {
  return applyCommands(createEmptyProject('m'), [
    { type: 'material.addFromLibrary', libraryId: 'concrete-siliceous', id: 'concrete' },
    { type: 'template.create', templateId: 'rect-beam', params: { b, h }, materialId: 'concrete', id: 'beam' },
    { type: 'exposure.apply', faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'fire-unexposed' }] },
  ]).project;
}

describe('interior size scaling by section area', () => {
  it('leaves a 300×500 section unchanged and coarsens the interior of a 1200×550 section', () => {
    const small = beam(300, 500);
    const large = beam(1200, 550);
    expect(interiorScale(small)).toBe(1);
    expect(interiorScale(large)).toBeCloseTo(Math.sqrt(660000 / 150000), 6);
    const preset = resolveMeshSettings(large.mesh);
    const input = buildMeshInput(large);
    expect(input.size.boundarySize).toBe(preset.boundarySize);
    expect(input.size.interiorSize).toBeCloseTo(preset.interiorSize * interiorScale(large), 6);
    const m = mesh(input);
    expect(m.stats.nodeCount).toBeLessThan(8000);
    expect(m.stats.nodeCount).toBeGreaterThan(2000);
  });

  it('an explicit interiorSize switches the scaling off', () => {
    const large = applyCommands(beam(1200, 550), [{ type: 'project.setMesh', patch: { interiorSize: 12 } }]).project;
    expect(buildMeshInput(large).size.interiorSize).toBe(12);
  });
});
