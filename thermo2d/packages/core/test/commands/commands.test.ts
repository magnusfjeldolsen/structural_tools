import { describe, expect, it } from 'vitest';
import { applyCommands, createEmptyProject, resolveScenario, validateProject, CommandError, type Project } from '../../src/index.js';

function beamProject(): Project {
  const empty = createEmptyProject('Bjelke');
  const { project } = applyCommands(empty, [
    { type: 'material.addFromLibrary', libraryId: 'concrete-siliceous', id: 'concrete' },
    { type: 'material.addFromLibrary', libraryId: 'reinforcing-steel', id: 'steel' },
    { type: 'template.create', templateId: 'rect-beam', params: { b: 300, h: 500 }, materialId: 'concrete', id: 'beam' },
  ]);
  return project;
}

describe('applyCommands', () => {
  it('creates a beam from a template with a concrete material', () => {
    const p = beamProject();
    expect(p.regions).toHaveLength(1);
    expect(p.regions[0].id).toBe('beam');
    expect(p.regions[0].materialId).toBe('concrete');
    expect(p.regions[0].polygon.outer.length).toBeGreaterThanOrEqual(4);
  });

  it('is atomic: a failing command leaves the input untouched and reports the index', () => {
    const p = beamProject();
    let err: CommandError | null = null;
    try {
      applyCommands(p, [
        { type: 'project.rename', name: 'x' },
        { type: 'region.update', id: 'nope', patch: { name: 'y' } },
      ]);
    } catch (e) {
      err = e as CommandError;
    }
    expect(err).toBeInstanceOf(CommandError);
    expect(err!.detail.commandIndex).toBe(1);
    expect(err!.detail.options).toContain('beam (Beam)');
    expect(p.name).toBe('Bjelke');
  });

  it('adds edge bars, regenerates them and syncs automatic probes', () => {
    const p = beamProject();
    const { project, createdIds } = applyCommands(p, [
      { type: 'rebarSet.add', set: { name: 'Bunn', kind: 'edge', regionId: 'beam', edgeRef: { regionId: 'beam', ring: 0, edgeIndex: 0 }, diameter: 20, materialId: 'steel', cover: 35, count: 4 } },
    ]);
    expect(createdIds[0]).toHaveLength(1);
    expect(project.rebars).toHaveLength(4);
    // bottom edge, cover to surface 35 + Ø/2 → centre at y = 45
    for (const b of project.rebars) expect(b.centre[1]).toBeCloseTo(45, 6);
    const xs = project.rebars.map((b) => b.centre[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(45, 6);
    expect(xs[3]).toBeCloseTo(255, 6);
    expect(project.probes.filter((pr) => pr.kind === 'rebar')).toHaveLength(4);
    expect(project.probes[0].name).toBe(project.rebars[0].name);

    // Changing cover moves bars and probes together.
    const next = applyCommands(project, [{ type: 'rebarSet.update', id: createdIds[0][0], patch: { cover: 45 } }]).project;
    for (const b of next.rebars) expect(b.centre[1]).toBeCloseTo(55, 6);
    for (const pr of next.probes) expect(pr.position[1]).toBeCloseTo(55, 6);
    expect(next.rebars.map((b) => b.id)).toEqual(project.rebars.map((b) => b.id));
  });

  it('applies a guided exposure: fire on three sides, unexposed on top', () => {
    const p = beamProject();
    const { project } = applyCommands(p, [
      { type: 'exposure.apply', faces: [{ side: 'bottom', kind: 'fire' }, { side: 'left', kind: 'fire' }, { side: 'right', kind: 'fire' }, { side: 'top', kind: 'fire-unexposed' }] },
    ]);
    expect(project.timeSeries.some((s) => s.id === 'ts_iso834')).toBe(true);
    const fire = project.boundaryConditions.filter((b) => b.type === 'convection-radiation');
    expect(fire).toHaveLength(3);
    const top = project.boundaryConditions.find((b) => b.type === 'convection');
    expect(top?.edgeRefs.map((e) => e.edgeIndex)).toEqual([2]);
    expect(validateProject(project).filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('keeps one boundary condition per edge', () => {
    const p = beamProject();
    const a = applyCommands(p, [{ type: 'exposure.apply', faces: [{ side: 'all', kind: 'fire' }] }]).project;
    const b = applyCommands(a, [{ type: 'exposure.apply', faces: [{ side: 'top', kind: 'insulated' }] }]).project;
    const fire = b.boundaryConditions.find((x) => x.type === 'convection-radiation')!;
    expect(fire.edgeRefs.map((e) => e.edgeIndex).sort()).toEqual([0, 1, 3]);
  });

  it('subtracts a hole and reports the change', () => {
    const p = beamProject();
    const res = applyCommands(p, [{ type: 'region.subtractShape', id: 'beam', shape: { kind: 'circle', cx: 150, cy: 250, r: 50 } }]);
    expect(res.project.regions[0].polygon.holes).toHaveLength(1);
    expect(res.changes.some((c) => c.collection === 'regions' && c.kind === 'updated')).toBe(true);
  });

  it('validates a project with plain messages', () => {
    const empty = createEmptyProject('x');
    const { project } = applyCommands(empty, [{ type: 'region.addPrimitive', shape: { kind: 'rect', x: 0, y: 0, width: 100, height: 100 } }]);
    const issues = validateProject(project);
    expect(issues.some((i) => i.code === 'no-material')).toBe(true);
    expect(issues.find((i) => i.code === 'no-material')!.messageNb).toMatch(/materiale/);
  });

  it('resolves scenarios by shallow patches and template params', () => {
    const p = beamProject();
    const { project } = applyCommands(p, [
      { type: 'scenario.add', scenario: { id: 'sc1', name: 'Bredere', overrides: [{ collection: 'regions', id: 'beam', patch: { params: { b: 400 } } }] } },
    ]);
    const resolved = resolveScenario(project, 'sc1');
    const xs = resolved.regions[0].polygon.outer.map((v) => v[0]);
    expect(Math.max(...xs)).toBeCloseTo(400, 6);
    // base untouched
    expect(Math.max(...project.regions[0].polygon.outer.map((v) => v[0]))).toBeCloseTo(300, 6);
  });

  it('inserting a vertex keeps boundary conditions on the same physical edges', () => {
    const p = beamProject();
    const a = applyCommands(p, [{ type: 'exposure.apply', faces: [{ side: 'top', kind: 'fire' }] }]).project;
    const before = a.boundaryConditions[0].edgeRefs[0];
    const b = applyCommands(a, [{ type: 'region.insertVertex', id: 'beam', ring: 0, edgeIndex: 0 }]).project;
    const after = b.boundaryConditions[0].edgeRefs[0];
    expect(after.edgeIndex).toBe(before.edgeIndex + 1);
    expect(after.fingerprint).toBe(before.fingerprint);
  });
});
