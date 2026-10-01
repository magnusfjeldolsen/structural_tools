/**
 * Command layer: the only way the editor and the MCP server change a project.
 * `applyCommands` is atomic (all commands or none), pure (returns a new
 * Project; the input is never mutated) and finishes with the housekeeping every
 * edit needs: regenerate rebar sets, sync automatic rebar probes, refresh edge
 * fingerprints on boundary conditions and bump `meta.modified`.
 */
import type {
  BoundaryCondition,
  EdgeRef,
  Material,
  Polygon,
  Project,
  Rebar,
  Region,
  Ring,
  TimeSeries,
  Vec2,
} from '../model/types.js';
import { newId, nowIso } from '../model/defaults.js';
import type { Change, Command, CommandResult, ExposureFace, Issue, PrimitiveShape, Transform, WithOptionalId } from './types.js';
import { CommandError } from './types.js';
import {
  booleanOp,
  chamferVertex,
  edgeFingerprint,
  edgeMidpoint,
  edgeOutwardNormal,
  filletVertex,
  mergeCollinear,
  normalizePolygon,
  offsetPolygon,
  parseDxf,
  parseGeometryWorkspace,
  parsePolygonCsv,
  pointInPolygon,
  polygonArea,
  primitiveToPolygon,
  regionsOverlap,
  resolveEdgeRef,
  splitPolygon,
  transformPolygon,
  validatePolygon,
} from '../geometry/index.js';
import { getLibraryItem, materialFromLibrary, seriesFromLibrary, generateCurve } from '../library/index.js';
import { buildTemplate } from '../templates/index.js';
import { checkRebars, regenerateRebars } from '../rebar/index.js';

export * from './describe.js';

type Collections = Exclude<Change['collection'], 'settings' | 'mesh' | 'project'>;

interface Ctx {
  project: Project;
  changes: Change[];
  created: string[];
  warnings: Issue[];
  index: number;
  geometryTouched: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function applyCommands(project: Project, commands: Command[]): CommandResult {
  let current: Project = { ...project };
  const changes: Change[] = [];
  const createdIds: string[][] = [];
  const warnings: Issue[] = [];
  let geometryTouched = false;

  commands.forEach((cmd, index) => {
    const ctx: Ctx = { project: current, changes, created: [], warnings, index, geometryTouched: false };
    try {
      handle(ctx, cmd);
    } catch (e) {
      if (e instanceof CommandError) {
        e.detail.commandIndex = index;
        throw e;
      }
      throw new CommandError('internal', `Command ${index} (${cmd.type}) failed: ${(e as Error).message}`, { commandIndex: index });
    }
    current = ctx.project;
    createdIds.push(ctx.created);
    geometryTouched = geometryTouched || ctx.geometryTouched;
  });

  current = finish(current, geometryTouched, warnings);
  return { project: current, changes, createdIds, warnings };
}

/** Apply a scenario's overrides to a copy of the project (shallow merge per entity), rebuild templated regions and rebars. */
export function resolveScenario(project: Project, scenarioId: string | null | undefined): Project {
  if (!scenarioId) return project;
  const scenario = project.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new CommandError('not-found', `Scenario "${scenarioId}" does not exist.`, { field: 'scenarioId', options: project.scenarios.map((s) => s.id) });
  let p: Project = { ...project };
  for (const o of scenario.overrides) {
    if (o.collection === 'settings') {
      p = { ...p, settings: { ...p.settings, ...(o.patch as Partial<Project['settings']>) } };
    } else if (o.collection === 'mesh') {
      p = { ...p, mesh: { ...p.mesh, ...(o.patch as Partial<Project['mesh']>) } };
    } else {
      const list = p[o.collection] as { id: string }[];
      const idx = list.findIndex((e) => e.id === o.id);
      if (idx < 0) throw new CommandError('not-found', `Scenario "${scenario.name}" overrides ${o.collection} "${o.id}", which does not exist.`, { field: 'id', options: list.map((e) => e.id) });
      let entity: Record<string, unknown> = { ...list[idx], ...o.patch };
      if (o.collection === 'regions') {
        const r = entity as unknown as Region;
        if (o.patch.template || (o.patch as { params?: unknown }).params) {
          const params = { ...(r.template?.params ?? {}), ...((o.patch as { params?: Record<string, number | string | boolean> }).params ?? {}) };
          if (r.template) {
            const built = buildTemplate(r.template.templateId, params);
            entity = { ...r, template: { templateId: r.template.templateId, params }, polygon: built.regions[0].polygon };
          }
        }
      }
      const copy = list.slice();
      copy[idx] = entity as { id: string };
      p = { ...p, [o.collection]: copy } as Project;
    }
  }
  return regenerateRebars(syncRebarProbes(p));
}

/** Every problem that would block or discolour a run, in plain words, pointing at the entity. */
export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];
  const materialIds = new Set(project.materials.map((m) => m.id));
  const seriesIds = new Set(project.timeSeries.map((s) => s.id));

  for (const r of project.regions) {
    for (const i of validatePolygon(r.polygon)) issues.push({ ...i, entity: { collection: 'regions', id: r.id } });
    if (!r.materialId) {
      issues.push(issue('error', 'no-material', `"${r.name}" has no material.`, `"${r.name}" mangler materiale.`, 'regions', r.id, 'Pick a material in the properties panel.'));
    } else if (!materialIds.has(r.materialId)) {
      issues.push(issue('error', 'missing-material', `"${r.name}" refers to a material that is not in the project.`, `"${r.name}" viser til et materiale som ikke finnes i prosjektet.`, 'regions', r.id));
    }
  }
  for (let i = 0; i < project.regions.length; i++) {
    for (let j = i + 1; j < project.regions.length; j++) {
      const a = project.regions[i];
      const b = project.regions[j];
      if (regionsOverlap(a.polygon, b.polygon) === 'overlap') {
        issues.push(issue('error', 'overlap', `"${a.name}" and "${b.name}" overlap each other. Use subtract or union so each point has one material.`, `"${a.name}" og "${b.name}" overlapper hverandre. Bruk trekk fra eller slå sammen slik at hvert punkt har ett materiale.`, 'regions', b.id));
      }
    }
  }
  for (const r of project.rebars) {
    if (!materialIds.has(r.materialId)) issues.push(issue('error', 'missing-material', `Bar ${r.name} refers to a material that is not in the project.`, `Stang ${r.name} viser til et materiale som ikke finnes.`, 'rebars', r.id));
  }
  issues.push(...checkRebars(project));

  const edgeOwner = new Map<string, string>();
  let exposed = 0;
  for (const bc of project.boundaryConditions) {
    const needed = seriesOf(bc);
    for (const sid of needed) {
      if (!seriesIds.has(sid)) issues.push(issue('error', 'missing-series', `Boundary condition "${bc.name}" uses a time series that does not exist.`, `Randbetingelsen "${bc.name}" bruker en tidsserie som ikke finnes.`, 'boundaryConditions', bc.id));
    }
    if (bc.type === 'convection' && bc.alpha == null && bc.surfaceResistance == null) {
      issues.push(issue('error', 'no-film', `"${bc.name}" needs a film coefficient or a surface resistance.`, `"${bc.name}" trenger varmeovergangstall eller overgangsmotstand.`, 'boundaryConditions', bc.id));
    }
    if (bc.type !== 'insulated' && bc.edgeRefs.length > 0) exposed++;
    for (const ref of bc.edgeRefs) {
      const region = project.regions.find((r) => r.id === ref.regionId);
      if (!region || !resolveEdgeRef(project, ref)) {
        issues.push(issue('warning', 'dangling-edge', `"${bc.name}" is assigned to an edge that no longer exists.`, `"${bc.name}" er satt på en kant som ikke finnes lenger.`, 'boundaryConditions', bc.id));
        continue;
      }
      const key = `${ref.regionId}/${ref.ring}/${ref.edgeIndex}`;
      const prev = edgeOwner.get(key);
      if (prev && prev !== bc.id) issues.push(issue('error', 'double-edge', `One edge has two boundary conditions ("${bc.name}" and another). Each edge can carry only one.`, `Én kant har to randbetingelser ("${bc.name}" og en til). Hver kant kan bare ha én.`, 'boundaryConditions', bc.id));
      edgeOwner.set(key, bc.id);
    }
  }
  if (project.regions.length > 0 && exposed === 0) {
    issues.push(issue('warning', 'no-exposure', 'No edge has a fire, air or fixed-temperature condition; the whole section is insulated and nothing will change.', 'Ingen kant har brann-, luft- eller temperaturbetingelse; hele snittet er isolert og ingenting vil skje.', 'project', project.id, 'Use "Exposure" to set fire or climate on the faces.'));
  }
  for (const hs of project.heatSources) {
    if (!project.regions.some((r) => r.id === hs.regionId)) issues.push(issue('error', 'missing-region', `Heat source "${hs.name}" points to a region that does not exist.`, `Varmekilden "${hs.name}" peker på et område som ikke finnes.`, 'heatSources', hs.id));
    if (hs.seriesId && !seriesIds.has(hs.seriesId)) issues.push(issue('error', 'missing-series', `Heat source "${hs.name}" uses a time series that does not exist.`, `Varmekilden "${hs.name}" bruker en tidsserie som ikke finnes.`, 'heatSources', hs.id));
  }
  for (const a of project.analyses) {
    if (!(a.dt > 0)) issues.push(issue('error', 'bad-dt', `Analysis "${a.name}": the time step must be positive.`, `Analyse "${a.name}": tidssteget må være positivt.`, 'analyses', a.id));
    if (a.mode !== 'steady' && !(a.duration > 0)) issues.push(issue('error', 'bad-duration', `Analysis "${a.name}": the duration must be positive.`, `Analyse "${a.name}": varigheten må være positiv.`, 'analyses', a.id));
    if (a.mode !== 'steady' && a.outputInterval < a.dt) issues.push(issue('warning', 'output-interval', `Analysis "${a.name}": the output interval is shorter than the time step; snapshots are stored every step.`, `Analyse "${a.name}": utdataintervallet er kortere enn tidssteget.`, 'analyses', a.id));
  }
  for (const p of project.probes) {
    if (p.enabled === false) continue;
    if (!project.regions.some((r) => pointInPolygon(r.polygon, p.position))) {
      issues.push(issue('warning', 'probe-outside', `Probe "${p.name}" lies outside the section and will read nothing.`, `Målepunkt "${p.name}" ligger utenfor snittet og vil ikke gi noe.`, 'probes', p.id, 'Move it inside a region.', p.position));
    }
  }
  if (project.analyses.length === 0) issues.push(issue('error', 'no-analysis', 'The project has no analysis.', 'Prosjektet har ingen analyse.', 'project', project.id));
  return issues;
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

function handle(ctx: Ctx, cmd: Command): void {
  switch (cmd.type) {
    case 'project.rename':
      ctx.project = { ...ctx.project, name: requireString(cmd.name, 'name') };
      note(ctx, 'project', undefined, 'updated');
      return;
    case 'project.setSettings':
      ctx.project = { ...ctx.project, settings: { ...ctx.project.settings, ...cmd.patch } };
      note(ctx, 'settings', undefined, 'updated');
      ctx.geometryTouched = 'coverReference' in cmd.patch || 'meshStirrups' in cmd.patch;
      return;
    case 'project.setMesh':
      ctx.project = { ...ctx.project, mesh: { ...ctx.project.mesh, ...cmd.patch } };
      note(ctx, 'mesh', undefined, 'updated');
      return;

    // ----- regions ---------------------------------------------------------
    case 'region.addPrimitive': {
      const polygon = safePolygon(primitiveToPolygon(cmd.shape), 'shape');
      addRegion(ctx, { id: cmd.id, name: cmd.name ?? defaultRegionName(ctx.project, cmd.shape), polygon, materialId: cmd.materialId ?? firstMaterial(ctx.project, 'concrete'), source: 'drawn' });
      return;
    }
    case 'region.add':
      addRegion(ctx, { ...cmd.region, polygon: safePolygon(cmd.region.polygon, 'region.polygon') });
      return;
    case 'region.update': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const patch = { ...cmd.patch };
      if (patch.polygon) patch.polygon = safePolygon(patch.polygon, 'patch.polygon');
      if (patch.materialId) requireMaterial(ctx.project, patch.materialId);
      replaceRegion(ctx, { ...r, ...patch, id: r.id });
      return;
    }
    case 'region.setVertex': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const ring = ringOf(r.polygon, cmd.ring).slice();
      if (cmd.index < 0 || cmd.index >= ring.length) throw new CommandError('bad-index', `Vertex ${cmd.index} does not exist (the ring has ${ring.length} points).`, { field: 'index' });
      ring[cmd.index] = [cmd.point[0], cmd.point[1]];
      replaceRegion(ctx, { ...r, polygon: withRing(r.polygon, cmd.ring, ring), template: undefined });
      return;
    }
    case 'region.insertVertex': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const ring = ringOf(r.polygon, cmd.ring).slice();
      const i = cmd.edgeIndex;
      if (i < 0 || i >= ring.length) throw new CommandError('bad-index', `Edge ${i} does not exist.`, { field: 'edgeIndex' });
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const p: Vec2 = cmd.point ?? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      ring.splice(i + 1, 0, p);
      replaceRegion(ctx, { ...r, polygon: withRing(r.polygon, cmd.ring, ring), template: undefined });
      shiftEdgeRefs(ctx, r.id, cmd.ring, i + 1, +1);
      return;
    }
    case 'region.deleteVertex': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const ring = ringOf(r.polygon, cmd.ring).slice();
      if (ring.length <= 3) throw new CommandError('too-few-vertices', 'A region needs at least three corners.', { suggestion: 'Delete the region instead.' });
      ring.splice(cmd.index, 1);
      replaceRegion(ctx, { ...r, polygon: withRing(r.polygon, cmd.ring, ring), template: undefined });
      shiftEdgeRefs(ctx, r.id, cmd.ring, cmd.index, -1);
      return;
    }
    case 'region.setMaterial': {
      if (cmd.materialId) requireMaterial(ctx.project, cmd.materialId);
      for (const id of cmd.ids) {
        const r = getEntity(ctx.project, 'regions', id);
        replaceRegion(ctx, { ...r, materialId: cmd.materialId }, false);
      }
      return;
    }
    case 'region.boolean': {
      const target = getEntity(ctx.project, 'regions', cmd.targetId);
      const tools = cmd.toolIds.map((id) => getEntity(ctx.project, 'regions', id));
      if (tools.some((t) => t.id === target.id)) throw new CommandError('same-region', 'A region cannot be combined with itself.', { field: 'toolIds' });
      const out = booleanOp(cmd.op, [target.polygon], tools.map((t) => t.polygon));
      if (out.length === 0) throw new CommandError('empty-result', `${cmd.op} of "${target.name}" leaves nothing.`, { suggestion: 'Check that the shapes overlap the way you expect.' });
      replaceRegion(ctx, { ...target, polygon: out[0], source: 'derived', template: undefined });
      for (let i = 1; i < out.length; i++) {
        addRegion(ctx, { name: `${target.name} (${i + 1})`, polygon: out[i], materialId: target.materialId, source: 'derived' });
      }
      if (!cmd.keepTools) deleteRegions(ctx, tools.map((t) => t.id), 'delete');
      return;
    }
    case 'region.subtractShape': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const tool = safePolygon(primitiveToPolygon(cmd.shape), 'shape');
      const out = booleanOp('subtract', [r.polygon], [tool]);
      if (out.length === 0) throw new CommandError('empty-result', `The shape removes all of "${r.name}".`);
      replaceRegion(ctx, { ...r, polygon: out[0], source: 'derived', template: undefined });
      for (let i = 1; i < out.length; i++) addRegion(ctx, { name: `${r.name} (${i + 1})`, polygon: out[i], materialId: r.materialId, source: 'derived' });
      return;
    }
    case 'region.addHole': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const out = booleanOp('subtract', [r.polygon], [{ outer: cmd.ring, holes: [] }]);
      if (out.length !== 1) throw new CommandError('bad-hole', 'The hole must lie fully inside the region and not split it.', { suggestion: 'Use "Split" if you want two pieces.' });
      replaceRegion(ctx, { ...r, polygon: out[0], source: 'derived', template: undefined });
      return;
    }
    case 'region.offset': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const out = offsetPolygon(r.polygon, cmd.distance);
      if (out.length === 0) throw new CommandError('empty-result', `An offset of ${cmd.distance} mm makes "${r.name}" disappear.`, { suggestion: 'Use a smaller inward distance.' });
      if (cmd.asNew) {
        for (const [i, poly] of out.entries()) addRegion(ctx, { name: cmd.name ?? `${r.name} offset ${cmd.distance}${i ? ` (${i + 1})` : ''}`, polygon: poly, materialId: r.materialId, source: 'derived' });
      } else {
        replaceRegion(ctx, { ...r, polygon: out[0], source: 'derived', template: undefined });
        for (let i = 1; i < out.length; i++) addRegion(ctx, { name: `${r.name} (${i + 1})`, polygon: out[i], materialId: r.materialId, source: 'derived' });
      }
      return;
    }
    case 'region.split': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const parts = splitPolygon(r.polygon, cmd.line);
      if (parts.length < 2) throw new CommandError('no-split', 'The line does not cut the region into two.', { suggestion: 'Draw the line across the whole region.' });
      replaceRegion(ctx, { ...r, polygon: parts[0], source: 'derived', template: undefined });
      for (let i = 1; i < parts.length; i++) addRegion(ctx, { name: `${r.name} (${i + 1})`, polygon: parts[i], materialId: r.materialId, source: 'derived' });
      return;
    }
    case 'region.fillet':
    case 'region.chamfer': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      const ringIdx = cmd.ring ?? 0;
      const ring = ringOf(r.polygon, ringIdx);
      const newRing = cmd.type === 'region.fillet' ? filletVertex(ring, cmd.vertexIndex, cmd.radius, cmd.segments) : chamferVertex(ring, cmd.vertexIndex, cmd.distance);
      replaceRegion(ctx, { ...r, polygon: withRing(r.polygon, ringIdx, newRing), source: 'derived', template: undefined });
      shiftEdgeRefs(ctx, r.id, ringIdx, cmd.vertexIndex, newRing.length - ring.length);
      return;
    }
    case 'region.mergeCollinear': {
      const r = getEntity(ctx.project, 'regions', cmd.id);
      replaceRegion(ctx, { ...r, polygon: mergeCollinear(r.polygon, cmd.toleranceDeg ?? 0.5) });
      return;
    }
    case 'region.delete':
      deleteRegions(ctx, cmd.ids, cmd.dependents ?? 'delete');
      return;

    // ----- generic entity ops ---------------------------------------------
    case 'entities.transform':
      transformEntities(ctx, cmd.ids, cmd.transform);
      return;
    case 'entities.copy': {
      const n = Math.max(1, Math.floor(cmd.count ?? 1));
      for (let k = 1; k <= n; k++) copyEntities(ctx, cmd.ids, { kind: 'move', dx: cmd.dx * k, dy: cmd.dy * k });
      return;
    }
    case 'entities.polarArray': {
      const n = Math.max(2, Math.floor(cmd.count));
      for (let k = 1; k < n; k++) copyEntities(ctx, cmd.ids, { kind: 'rotate', cx: cmd.cx, cy: cmd.cy, angleDeg: (cmd.angleDeg * k) / (cmd.angleDeg >= 360 ? n : n - 1) });
      return;
    }
    case 'entities.delete':
      deleteAny(ctx, cmd.ids);
      return;

    // ----- templates -------------------------------------------------------
    case 'template.create': {
      const built = buildTemplate(cmd.templateId, cmd.params);
      built.regions.forEach((br, i) => {
        const materialId = cmd.materialId !== undefined ? cmd.materialId : firstMaterial(ctx.project, br.materialHint ?? 'concrete');
        addRegion(ctx, {
          id: i === 0 ? cmd.id : undefined,
          name: cmd.name && built.regions.length === 1 ? cmd.name : br.name,
          polygon: safePolygon(br.polygon, 'template'),
          materialId,
          source: 'template',
          template: i === 0 || built.regions.length > 1 ? { templateId: cmd.templateId, params: { ...cmd.params } } : undefined,
        });
      });
      return;
    }
    case 'template.update': {
      const r = getEntity(ctx.project, 'regions', cmd.regionId);
      if (!r.template) throw new CommandError('not-template', `"${r.name}" is no longer driven by a template.`, { suggestion: 'Edit its vertices directly.' });
      const params = { ...r.template.params, ...cmd.params };
      const built = buildTemplate(r.template.templateId, params);
      // Sibling regions created by the same multi-region template share templateId+params; update them all in order.
      const siblings = ctx.project.regions.filter((x) => x.template && x.template.templateId === r.template!.templateId && sameParams(x.template.params, r.template!.params));
      siblings.forEach((s, i) => {
        const br = built.regions[Math.min(i, built.regions.length - 1)];
        replaceRegion(ctx, { ...s, polygon: br.polygon, template: { templateId: r.template!.templateId, params } });
      });
      return;
    }

    // ----- materials -------------------------------------------------------
    case 'material.add': {
      const m: Material = { ...cmd.material, id: cmd.material.id ?? newId('mat') };
      ensureUnique(ctx.project, 'materials', m.id);
      ctx.project = { ...ctx.project, materials: [...ctx.project.materials, m] };
      note(ctx, 'materials', m.id, 'added');
      return;
    }
    case 'material.addFromLibrary': {
      const item = getLibraryItem(cmd.libraryId);
      if (!item || item.category !== 'material') throw new CommandError('not-found', `No material "${cmd.libraryId}" in the library.`, { field: 'libraryId', suggestion: 'Use search_library to find the id.' });
      const m = { ...materialFromLibrary(item, cmd.id), ...(cmd.patch ?? {}) } as Material;
      if (ctx.project.materials.some((x) => x.id === m.id)) {
        ctx.created.push(m.id);
        return; // already there: idempotent
      }
      ctx.project = { ...ctx.project, materials: [...ctx.project.materials, m] };
      note(ctx, 'materials', m.id, 'added');
      return;
    }
    case 'material.update': {
      const m = getEntity(ctx.project, 'materials', cmd.id);
      updateEntity(ctx, 'materials', { ...m, ...cmd.patch, id: m.id, origin: 'user' as const });
      return;
    }
    case 'material.delete': {
      getEntity(ctx.project, 'materials', cmd.id);
      const used = ctx.project.regions.filter((r) => r.materialId === cmd.id).length + ctx.project.rebars.filter((r) => r.materialId === cmd.id).length;
      if (used > 0) throw new CommandError('in-use', `The material is used by ${used} object(s).`, { suggestion: 'Assign another material first.' });
      removeEntity(ctx, 'materials', cmd.id);
      return;
    }

    // ----- reinforcement ---------------------------------------------------
    case 'rebarSet.add': {
      getEntity(ctx.project, 'regions', cmd.set.regionId);
      requireMaterial(ctx.project, cmd.set.materialId);
      if (!(cmd.set.diameter > 0)) throw new CommandError('bad-value', 'Bar diameter must be positive.', { field: 'diameter' });
      if (cmd.set.kind === 'edge' && !cmd.set.edgeRef) throw new CommandError('missing-field', 'Edge bars need an edgeRef (regionId, ring, edgeIndex).', { field: 'edgeRef' });
      if (cmd.set.kind === 'edge' && cmd.set.count == null && cmd.set.spacing == null) throw new CommandError('missing-field', 'Edge bars need a count or a spacing.', { field: 'count' });
      const set = { ...cmd.set, id: cmd.set.id ?? newId('rs'), edgeRef: cmd.set.edgeRef ? withFingerprint(ctx.project, cmd.set.edgeRef) : undefined };
      ensureUnique(ctx.project, 'rebarSets', set.id);
      ctx.project = { ...ctx.project, rebarSets: [...ctx.project.rebarSets, set] };
      note(ctx, 'rebarSets', set.id, 'added');
      ctx.geometryTouched = true;
      return;
    }
    case 'rebarSet.update': {
      const s = getEntity(ctx.project, 'rebarSets', cmd.id);
      if (cmd.patch.materialId) requireMaterial(ctx.project, cmd.patch.materialId);
      updateEntity(ctx, 'rebarSets', { ...s, ...cmd.patch, id: s.id });
      ctx.geometryTouched = true;
      return;
    }
    case 'rebarSet.delete': {
      getEntity(ctx.project, 'rebarSets', cmd.id);
      removeEntity(ctx, 'rebarSets', cmd.id);
      if (cmd.keepBars) {
        ctx.project = { ...ctx.project, rebars: ctx.project.rebars.map((b) => (b.setId === cmd.id ? { ...b, setId: undefined, setIndex: undefined } : b)) };
      } else {
        const gone = ctx.project.rebars.filter((b) => b.setId === cmd.id).map((b) => b.id);
        ctx.project = { ...ctx.project, rebars: ctx.project.rebars.filter((b) => b.setId !== cmd.id) };
        gone.forEach((id) => note(ctx, 'rebars', id, 'deleted'));
      }
      ctx.geometryTouched = true;
      return;
    }
    case 'rebar.add': {
      requireMaterial(ctx.project, cmd.rebar.materialId);
      const bar: Rebar = { ...cmd.rebar, id: cmd.rebar.id ?? newId('bar'), setId: undefined, setIndex: undefined };
      ensureUnique(ctx.project, 'rebars', bar.id);
      ctx.project = { ...ctx.project, rebars: [...ctx.project.rebars, bar] };
      note(ctx, 'rebars', bar.id, 'added');
      ctx.geometryTouched = true;
      return;
    }
    case 'rebar.update': {
      const b = getEntity(ctx.project, 'rebars', cmd.id);
      const patch = { ...cmd.patch };
      // Moving or resizing a generated bar detaches it from its set.
      const detach = ('centre' in patch || 'diameter' in patch) && b.setId;
      updateEntity(ctx, 'rebars', { ...b, ...patch, id: b.id, ...(detach ? { setId: undefined, setIndex: undefined } : {}) });
      ctx.geometryTouched = true;
      return;
    }
    case 'rebar.detach':
      for (const id of cmd.ids) {
        const b = getEntity(ctx.project, 'rebars', id);
        updateEntity(ctx, 'rebars', { ...b, setId: undefined, setIndex: undefined });
      }
      return;
    case 'rebar.delete':
      for (const id of cmd.ids) {
        getEntity(ctx.project, 'rebars', id);
        removeEntity(ctx, 'rebars', id);
      }
      ctx.geometryTouched = true;
      return;

    // ----- time series -----------------------------------------------------
    case 'series.add': {
      const s: TimeSeries = { ...cmd.series, id: cmd.series.id ?? newId('ts') };
      checkSeriesPoints(s.points);
      ensureUnique(ctx.project, 'timeSeries', s.id);
      ctx.project = { ...ctx.project, timeSeries: [...ctx.project.timeSeries, s] };
      note(ctx, 'timeSeries', s.id, 'added');
      return;
    }
    case 'series.addFromLibrary': {
      const item = getLibraryItem(cmd.libraryId);
      if (!item || !item.curve) throw new CommandError('not-found', `No curve "${cmd.libraryId}" in the library.`, { field: 'libraryId', suggestion: 'Use search_library with category "fire-curve" or "climate-series".' });
      const s = seriesFromLibrary(item, cmd.params, cmd.duration);
      const series: TimeSeries = { ...s, id: cmd.id ?? s.id ?? newId('ts'), name: cmd.name ?? s.name };
      if (ctx.project.timeSeries.some((x) => x.id === series.id)) {
        ctx.created.push(series.id);
        return;
      }
      ctx.project = { ...ctx.project, timeSeries: [...ctx.project.timeSeries, series] };
      note(ctx, 'timeSeries', series.id, 'added');
      return;
    }
    case 'series.generate': {
      const points = generateCurve(cmd.generator, cmd.params);
      const series: TimeSeries = {
        id: cmd.id ?? newId('ts'),
        name: cmd.name,
        points,
        interpolation: 'linear',
        afterEnd: cmd.generator === 'sinusoid' || cmd.generator === 'repeat' ? 'repeat' : 'hold',
        unit: cmd.unit ?? '°C',
        source: { kind: 'generated', ref: cmd.generator, params: cmd.params },
      };
      ensureUnique(ctx.project, 'timeSeries', series.id);
      ctx.project = { ...ctx.project, timeSeries: [...ctx.project.timeSeries, series] };
      note(ctx, 'timeSeries', series.id, 'added');
      return;
    }
    case 'series.update': {
      const s = getEntity(ctx.project, 'timeSeries', cmd.id);
      if (cmd.patch.points) checkSeriesPoints(cmd.patch.points);
      updateEntity(ctx, 'timeSeries', { ...s, ...cmd.patch, id: s.id });
      return;
    }
    case 'series.delete': {
      getEntity(ctx.project, 'timeSeries', cmd.id);
      const users = ctx.project.boundaryConditions.filter((bc) => seriesOf(bc).includes(cmd.id));
      if (users.length) throw new CommandError('in-use', `The series is used by ${users.map((u) => `"${u.name}"`).join(', ')}.`, { suggestion: 'Point those boundary conditions to another series first.' });
      removeEntity(ctx, 'timeSeries', cmd.id);
      return;
    }

    // ----- boundary conditions --------------------------------------------
    case 'bc.add': {
      const bc = { ...cmd.bc, id: cmd.bc.id ?? newId('bc'), edgeRefs: (cmd.bc.edgeRefs ?? []).map((r) => withFingerprint(ctx.project, r)) } as BoundaryCondition;
      checkBc(ctx.project, bc);
      ensureUnique(ctx.project, 'boundaryConditions', bc.id);
      ctx.project = { ...ctx.project, boundaryConditions: [...ctx.project.boundaryConditions, bc] };
      claimEdges(ctx, bc.id, bc.edgeRefs);
      note(ctx, 'boundaryConditions', bc.id, 'added');
      return;
    }
    case 'bc.update': {
      const bc = getEntity(ctx.project, 'boundaryConditions', cmd.id);
      const next = { ...bc, ...cmd.patch, id: bc.id } as BoundaryCondition;
      if (cmd.patch.edgeRefs) next.edgeRefs = (cmd.patch.edgeRefs as EdgeRef[]).map((r) => withFingerprint(ctx.project, r));
      checkBc(ctx.project, next);
      updateEntity(ctx, 'boundaryConditions', next);
      if (cmd.patch.edgeRefs) claimEdges(ctx, bc.id, next.edgeRefs);
      return;
    }
    case 'bc.assignEdges': {
      const bc = getEntity(ctx.project, 'boundaryConditions', cmd.id);
      const refs = cmd.edgeRefs.map((r) => withFingerprint(ctx.project, r));
      const mode = cmd.mode ?? 'set';
      let edgeRefs: EdgeRef[];
      if (mode === 'set') edgeRefs = refs;
      else if (mode === 'add') edgeRefs = dedupeEdges([...bc.edgeRefs, ...refs]);
      else edgeRefs = bc.edgeRefs.filter((e) => !refs.some((r) => sameEdge(e, r)));
      updateEntity(ctx, 'boundaryConditions', { ...bc, edgeRefs });
      if (mode !== 'remove') claimEdges(ctx, bc.id, refs);
      return;
    }
    case 'bc.delete':
      getEntity(ctx.project, 'boundaryConditions', cmd.id);
      removeEntity(ctx, 'boundaryConditions', cmd.id);
      return;
    case 'exposure.apply':
      applyExposure(ctx, cmd.regionIds, cmd.faces, cmd.fireCurve, cmd.fireDuration);
      return;

    // ----- heat sources ----------------------------------------------------
    case 'heatSource.add': {
      getEntity(ctx.project, 'regions', cmd.source.regionId);
      const hs = { ...cmd.source, id: cmd.source.id ?? newId('hs') };
      ensureUnique(ctx.project, 'heatSources', hs.id);
      ctx.project = { ...ctx.project, heatSources: [...ctx.project.heatSources, hs] };
      note(ctx, 'heatSources', hs.id, 'added');
      return;
    }
    case 'heatSource.update': {
      const hs = getEntity(ctx.project, 'heatSources', cmd.id);
      updateEntity(ctx, 'heatSources', { ...hs, ...cmd.patch, id: hs.id });
      return;
    }
    case 'heatSource.delete':
      getEntity(ctx.project, 'heatSources', cmd.id);
      removeEntity(ctx, 'heatSources', cmd.id);
      return;

    // ----- probes ----------------------------------------------------------
    case 'probe.add': {
      const p = { ...cmd.probe, id: cmd.probe.id ?? newId('pr'), name: cmd.probe.name || nextProbeName(ctx.project) };
      ensureUnique(ctx.project, 'probes', p.id);
      ctx.project = { ...ctx.project, probes: [...ctx.project.probes, p] };
      note(ctx, 'probes', p.id, 'added');
      return;
    }
    case 'probe.addAtDepth': {
      const resolved = resolveEdgeRef(ctx.project, cmd.edgeRef);
      const region = getEntity(ctx.project, 'regions', cmd.edgeRef.regionId);
      if (!resolved) throw new CommandError('not-found', 'That edge does not exist.', { field: 'edgeRef' });
      const ring = ringOf(region.polygon, resolved.ring);
      const along = cmd.along ?? 0.5;
      const a = ring[resolved.index];
      const b = ring[(resolved.index + 1) % ring.length];
      const n = edgeOutwardNormal(ring, resolved.index, resolved.ring > 0);
      const pos: Vec2 = [a[0] + (b[0] - a[0]) * along - n[0] * cmd.depth, a[1] + (b[1] - a[1]) * along - n[1] * cmd.depth];
      const p = { id: cmd.id ?? newId('pr'), name: cmd.name ?? `${cmd.depth} mm`, position: pos, kind: 'depth' as const, depth: { edgeRef: withFingerprint(ctx.project, cmd.edgeRef), depth: cmd.depth, along } };
      ctx.project = { ...ctx.project, probes: [...ctx.project.probes, p] };
      note(ctx, 'probes', p.id, 'added');
      return;
    }
    case 'probe.addForRebars': {
      const ids = cmd.rebarIds ?? ctx.project.rebars.map((b) => b.id);
      ctx.project = { ...ctx.project, rebars: ctx.project.rebars.map((b) => (ids.includes(b.id) ? { ...b, probe: true } : b)) };
      ctx.geometryTouched = true;
      return;
    }
    case 'probe.update': {
      const p = getEntity(ctx.project, 'probes', cmd.id);
      const next = { ...p, ...cmd.patch, id: p.id };
      if (cmd.patch.position && p.kind !== 'manual' && p.kind !== 'click') next.kind = 'manual';
      if (cmd.patch.position) {
        next.linkedRebarId = undefined;
        next.depth = undefined;
      }
      updateEntity(ctx, 'probes', next);
      return;
    }
    case 'probe.delete':
      for (const id of cmd.ids) {
        const p = getEntity(ctx.project, 'probes', id);
        if (p.linkedRebarId) {
          // Deleting a rebar probe switches the bar's automatic probe off.
          ctx.project = { ...ctx.project, rebars: ctx.project.rebars.map((b) => (b.id === p.linkedRebarId ? { ...b, probe: false } : b)) };
        }
        removeEntity(ctx, 'probes', id);
      }
      return;
    case 'lineProbe.add': {
      const lp = { ...cmd.lineProbe, id: cmd.lineProbe.id ?? newId('lp') };
      ensureUnique(ctx.project, 'lineProbes', lp.id);
      ctx.project = { ...ctx.project, lineProbes: [...ctx.project.lineProbes, lp] };
      note(ctx, 'lineProbes', lp.id, 'added');
      return;
    }
    case 'lineProbe.update': {
      const lp = getEntity(ctx.project, 'lineProbes', cmd.id);
      updateEntity(ctx, 'lineProbes', { ...lp, ...cmd.patch, id: lp.id });
      return;
    }
    case 'lineProbe.delete':
      for (const id of cmd.ids) {
        getEntity(ctx.project, 'lineProbes', id);
        removeEntity(ctx, 'lineProbes', id);
      }
      return;

    // ----- analyses, scenarios, metrics -----------------------------------
    case 'analysis.add': {
      const a = { ...cmd.analysis, id: cmd.analysis.id ?? newId('an') };
      ensureUnique(ctx.project, 'analyses', a.id);
      ctx.project = { ...ctx.project, analyses: [...ctx.project.analyses, a] };
      note(ctx, 'analyses', a.id, 'added');
      return;
    }
    case 'analysis.update': {
      const a = getEntity(ctx.project, 'analyses', cmd.id);
      updateEntity(ctx, 'analyses', { ...a, ...cmd.patch, id: a.id });
      return;
    }
    case 'analysis.delete':
      getEntity(ctx.project, 'analyses', cmd.id);
      if (ctx.project.analyses.length === 1) throw new CommandError('last-analysis', 'A project needs at least one analysis.');
      removeEntity(ctx, 'analyses', cmd.id);
      return;
    case 'scenario.add': {
      const s = { ...cmd.scenario, id: cmd.scenario.id ?? newId('sc') };
      ensureUnique(ctx.project, 'scenarios', s.id);
      // Validate that overrides point at real entities.
      const probe = { ...ctx.project, scenarios: [...ctx.project.scenarios, s] };
      resolveScenario(probe, s.id);
      ctx.project = probe;
      note(ctx, 'scenarios', s.id, 'added');
      return;
    }
    case 'scenario.update': {
      const s = getEntity(ctx.project, 'scenarios', cmd.id);
      updateEntity(ctx, 'scenarios', { ...s, ...cmd.patch, id: s.id });
      resolveScenario(ctx.project, s.id);
      return;
    }
    case 'scenario.delete':
      getEntity(ctx.project, 'scenarios', cmd.id);
      removeEntity(ctx, 'scenarios', cmd.id);
      return;
    case 'metric.add': {
      const m = { ...cmd.metric, id: cmd.metric.id ?? newId('mt') };
      ensureUnique(ctx.project, 'metrics', m.id);
      ctx.project = { ...ctx.project, metrics: [...ctx.project.metrics, m] };
      note(ctx, 'metrics', m.id, 'added');
      return;
    }
    case 'metric.update': {
      const m = getEntity(ctx.project, 'metrics', cmd.id);
      updateEntity(ctx, 'metrics', { ...m, ...cmd.patch, id: m.id });
      return;
    }
    case 'metric.delete':
      getEntity(ctx.project, 'metrics', cmd.id);
      removeEntity(ctx, 'metrics', cmd.id);
      return;

    // ----- import ----------------------------------------------------------
    case 'import.geometryWorkspace': {
      const regions = parseGeometryWorkspace(cmd.json);
      if (regions.length === 0) throw new CommandError('empty-import', 'The file holds no regions.');
      for (const r of regions) addRegion(ctx, { name: r.name, polygon: safePolygon(r.polygon, 'import'), materialId: cmd.materialId ?? firstMaterial(ctx.project, 'concrete'), source: 'imported' });
      return;
    }
    case 'import.polygonCsv': {
      const ring = parsePolygonCsv(cmd.text);
      addRegion(ctx, { name: cmd.name ?? 'Importert', polygon: safePolygon({ outer: ring, holes: [] }, 'import'), materialId: cmd.materialId ?? firstMaterial(ctx.project, 'concrete'), source: 'imported' });
      return;
    }
    case 'import.dxf': {
      const rings = parseDxf(cmd.text);
      if (rings.length === 0) throw new CommandError('empty-import', 'No closed polylines found in the DXF.');
      rings.forEach((ring, i) => addRegion(ctx, { name: `DXF ${i + 1}`, polygon: safePolygon({ outer: ring, holes: [] }, 'import'), materialId: cmd.materialId ?? firstMaterial(ctx.project, 'concrete'), source: 'imported' }));
      return;
    }
    default: {
      const t = (cmd as { type: string }).type;
      throw new CommandError('unknown-command', `Unknown command "${t}".`, { field: 'type', suggestion: 'Call describe_capabilities for the list of commands.' });
    }
  }
}

// ---------------------------------------------------------------------------
// Housekeeping after a batch
// ---------------------------------------------------------------------------

function finish(project: Project, geometryTouched: boolean, warnings: Issue[]): Project {
  let p = project;
  if (geometryTouched) p = regenerateRebars(p);
  p = syncRebarProbes(p);
  p = refreshFingerprints(p);
  for (const w of checkRebars(p)) warnings.push(w);
  return { ...p, meta: { ...p.meta, modified: nowIso() } };
}

/** One automatic probe per rebar with probe !== false; removed when the bar goes. */
export function syncRebarProbes(project: Project): Project {
  const bars = new Map(project.rebars.map((b) => [b.id, b]));
  const probes = project.probes.filter((p) => !p.linkedRebarId || (bars.has(p.linkedRebarId) && bars.get(p.linkedRebarId)!.probe !== false));
  const have = new Set(probes.filter((p) => p.linkedRebarId).map((p) => p.linkedRebarId));
  let changed = probes.length !== project.probes.length;
  const next = probes.map((p) => {
    if (!p.linkedRebarId) return p;
    const b = bars.get(p.linkedRebarId)!;
    if (p.position[0] !== b.centre[0] || p.position[1] !== b.centre[1] || p.name !== b.name) {
      changed = true;
      return { ...p, position: [b.centre[0], b.centre[1]] as Vec2, name: b.name };
    }
    return p;
  });
  for (const b of project.rebars) {
    if (b.probe === false || have.has(b.id)) continue;
    changed = true;
    next.push({ id: `pr_${b.id}`, name: b.name, position: [b.centre[0], b.centre[1]], kind: 'rebar', linkedRebarId: b.id });
  }
  return changed ? { ...project, probes: next } : project;
}

function refreshFingerprints(project: Project): Project {
  const fix = (ref: EdgeRef): EdgeRef => {
    const resolved = resolveEdgeRef(project, ref);
    if (!resolved) return ref;
    const region = project.regions.find((r) => r.id === ref.regionId)!;
    const ring = ringOf(region.polygon, resolved.ring);
    return { regionId: ref.regionId, ring: resolved.ring, edgeIndex: resolved.index, fingerprint: edgeFingerprint(ring, resolved.index) };
  };
  return {
    ...project,
    boundaryConditions: project.boundaryConditions.map((bc) => ({ ...bc, edgeRefs: bc.edgeRefs.map(fix) })),
    rebarSets: project.rebarSets.map((s) => (s.edgeRef ? { ...s, edgeRef: fix(s.edgeRef) } : s)),
  };
}

// ---------------------------------------------------------------------------
// Exposure shortcut
// ---------------------------------------------------------------------------

function applyExposure(ctx: Ctx, regionIds: string[] | undefined, faces: ExposureFace[], fireCurve: string | undefined, fireDuration: number | undefined): void {
  const regions = regionIds ? regionIds.map((id) => getEntity(ctx.project, 'regions', id)) : ctx.project.regions;
  if (regions.length === 0) throw new CommandError('empty', 'There is no region to expose yet.', { suggestion: 'Draw or create the section first.' });
  const exterior = exteriorEdges(ctx.project, regions);
  const ambient = ctx.project.settings.ambientTemperature;

  const ensureConstant = (name: string, value: number): string => {
    const id = `ts_const_${String(value).replace('-', 'm').replace('.', '_')}`;
    if (!ctx.project.timeSeries.some((s) => s.id === id)) {
      handle(ctx, { type: 'series.add', series: { id, name, points: [[0, value], [1e9, value]], interpolation: 'linear', afterEnd: 'hold', unit: '°C', source: { kind: 'generated', ref: 'constant', params: { value } } } });
    }
    return id;
  };
  const ensureFire = (): string => {
    const lib = fireCurve ?? 'iso834';
    const id = `ts_${lib}`;
    if (!ctx.project.timeSeries.some((s) => s.id === id)) {
      handle(ctx, { type: 'series.addFromLibrary', libraryId: lib, id, duration: fireDuration ?? Math.max(...ctx.project.analyses.map((a) => a.duration), 7200) });
    }
    return id;
  };

  for (const face of faces) {
    const refs = exterior.filter((e) => matchesSide(e.normal, face.side)).map((e) => e.ref);
    if (refs.length === 0) {
      ctx.warnings.push(issue('warning', 'no-face', `No exterior edge faces "${face.side}".`, `Ingen ytterkant vender "${face.side}".`, 'project', ctx.project.id));
      continue;
    }
    const p = face.params ?? {};
    let bc: WithOptionalId<BoundaryCondition>;
    switch (face.kind) {
      case 'fire':
        bc = { name: nameFor(face, 'Brann', 'Fire'), edgeRefs: refs, type: 'convection-radiation', gasSeriesId: face.seriesId ?? ensureFire(), alphaC: p.alphaC ?? 25, phi: p.phi ?? 1, epsM: p.epsM, epsF: p.epsF ?? 1, color: '#e3342f' };
        break;
      case 'fire-unexposed':
      case 'ambient':
        bc = { name: nameFor(face, 'Ueksponert', 'Unexposed'), edgeRefs: refs, type: 'convection', airSeriesId: face.seriesId ?? ensureConstant(`Omgivelser ${ambient} °C`, ambient), alpha: p.alpha ?? 4, color: '#3490dc' };
        break;
      case 'insulated':
        bc = { name: nameFor(face, 'Isolert', 'Insulated'), edgeRefs: refs, type: 'insulated', color: '#8795a1' };
        break;
      case 'indoor':
        bc = { name: nameFor(face, 'Inne', 'Indoor'), edgeRefs: refs, type: 'convection', airSeriesId: face.seriesId ?? ensureConstant('Inne 20 °C', 20), surfaceResistance: p.surfaceResistance ?? (face.side === 'top' ? 0.1 : face.side === 'bottom' ? 0.17 : 0.13), alpha: p.alpha, color: '#f6993f' };
        break;
      case 'outdoor':
        bc = { name: nameFor(face, 'Ute', 'Outdoor'), edgeRefs: refs, type: 'convection', airSeriesId: face.seriesId ?? ensureConstant('Ute 0 °C', 0), surfaceResistance: p.surfaceResistance ?? 0.04, alpha: p.alpha, color: '#6cb2eb' };
        break;
    }
    handle(ctx, { type: 'bc.add', bc });
  }
}

function nameFor(face: ExposureFace, nb: string, en: string): string {
  const side: Record<string, string> = { bottom: 'under', top: 'topp', left: 'venstre', right: 'høyre', all: 'alle sider', exterior: 'ytterkanter' };
  return `${nb} (${side[face.side] ?? face.side})`.replace('()', '') || en;
}

function matchesSide(n: Vec2, side: ExposureFace['side']): boolean {
  switch (side) {
    case 'all':
    case 'exterior':
      return true;
    case 'bottom':
      return n[1] < -0.7;
    case 'top':
      return n[1] > 0.7;
    case 'left':
      return n[0] < -0.7;
    case 'right':
      return n[0] > 0.7;
  }
}

/** Exterior edges of the given regions: not coincident with an edge of another region, and not inside another region. */
export function exteriorEdges(project: Project, regions: Region[]): { ref: EdgeRef; normal: Vec2; mid: Vec2; length: number }[] {
  const out: { ref: EdgeRef; normal: Vec2; mid: Vec2; length: number }[] = [];
  const others = project.regions;
  for (const r of regions) {
    const rings = [r.polygon.outer, ...r.polygon.holes];
    rings.forEach((ring, ringIdx) => {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const mid = edgeMidpoint(ring, i);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1e-9) continue;
        let shared = false;
        for (const o of others) {
          if (o.id === r.id) continue;
          if (pointInPolygon(o.polygon, mid) && !onBoundary(o.polygon, mid)) {
            shared = true;
            break;
          }
          if (hasCoincidentEdge(o.polygon, a, b)) {
            shared = true;
            break;
          }
        }
        if (shared) continue;
        out.push({ ref: { regionId: r.id, ring: ringIdx, edgeIndex: i, fingerprint: edgeFingerprint(ring, i) }, normal: edgeOutwardNormal(ring, i, ringIdx > 0), mid, length: len });
      }
    });
  }
  return out;
}

function hasCoincidentEdge(poly: Polygon, a: Vec2, b: Vec2): boolean {
  const tol = 1e-6;
  const same = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < tol && Math.abs(p[1] - q[1]) < tol;
  for (const ring of [poly.outer, ...poly.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const c = ring[i];
      const d = ring[(i + 1) % ring.length];
      if ((same(a, c) && same(b, d)) || (same(a, d) && same(b, c))) return true;
    }
  }
  return false;
}

function onBoundary(poly: Polygon, p: Vec2): boolean {
  const tol = 1e-6;
  for (const ring of [poly.outer, ...poly.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      if (l2 < tol) continue;
      const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
      if (t < -tol || t > 1 + tol) continue;
      const px = a[0] + t * dx - p[0];
      const py = a[1] + t * dy - p[1];
      if (px * px + py * py < tol) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

function addRegion(ctx: Ctx, region: Omit<Region, 'id'> & { id?: string }): Region {
  const r: Region = { ...region, id: region.id ?? newId('reg') };
  ensureUnique(ctx.project, 'regions', r.id);
  if (r.materialId) requireMaterial(ctx.project, r.materialId);
  ctx.project = { ...ctx.project, regions: [...ctx.project.regions, r] };
  note(ctx, 'regions', r.id, 'added');
  ctx.geometryTouched = true;
  return r;
}

function replaceRegion(ctx: Ctx, region: Region, geometry = true): void {
  ctx.project = { ...ctx.project, regions: ctx.project.regions.map((r) => (r.id === region.id ? region : r)) };
  note(ctx, 'regions', region.id, 'updated');
  if (geometry) ctx.geometryTouched = true;
}

function deleteRegions(ctx: Ctx, ids: string[], dependents: 'delete' | 'detach'): void {
  for (const id of ids) getEntity(ctx.project, 'regions', id);
  const gone = new Set(ids);
  const p = ctx.project;
  const sets = p.rebarSets.filter((s) => gone.has(s.regionId));
  const setIds = new Set(sets.map((s) => s.id));
  const next: Project = {
    ...p,
    regions: p.regions.filter((r) => !gone.has(r.id)),
    rebarSets: p.rebarSets.filter((s) => !setIds.has(s.id)),
    rebars: dependents === 'delete' ? p.rebars.filter((b) => !(b.setId && setIds.has(b.setId)) && !p.regions.some((r) => gone.has(r.id) && pointInPolygon(r.polygon, b.centre))) : p.rebars.map((b) => (b.setId && setIds.has(b.setId) ? { ...b, setId: undefined, setIndex: undefined } : b)),
    boundaryConditions: p.boundaryConditions.map((bc) => ({ ...bc, edgeRefs: bc.edgeRefs.filter((e) => !gone.has(e.regionId)) })),
    heatSources: p.heatSources.filter((h) => !gone.has(h.regionId)),
    probes: dependents === 'delete' ? p.probes.filter((pr) => !(pr.depth && gone.has(pr.depth.edgeRef.regionId))) : p.probes.map((pr) => (pr.depth && gone.has(pr.depth.edgeRef.regionId) ? { ...pr, kind: 'manual' as const, depth: undefined } : pr)),
  };
  ctx.project = next;
  ids.forEach((id) => note(ctx, 'regions', id, 'deleted'));
  sets.forEach((s) => note(ctx, 'rebarSets', s.id, 'deleted'));
  ctx.geometryTouched = true;
}

function transformEntities(ctx: Ctx, ids: string[], t: Transform): void {
  const idSet = new Set(ids);
  let hit = 0;
  const p = ctx.project;
  const regions = p.regions.map((r) => {
    if (!idSet.has(r.id)) return r;
    hit++;
    note(ctx, 'regions', r.id, 'updated');
    return { ...r, polygon: normalizePolygon(transformPolygon(r.polygon, t)), template: t.kind === 'move' ? r.template : undefined };
  });
  const rebars = p.rebars.map((b) => {
    if (!idSet.has(b.id)) return b;
    hit++;
    note(ctx, 'rebars', b.id, 'updated');
    return { ...b, centre: transformPoint(b.centre, t), setId: undefined, setIndex: undefined };
  });
  const probes = p.probes.map((pr) => {
    if (!idSet.has(pr.id)) return pr;
    hit++;
    note(ctx, 'probes', pr.id, 'updated');
    return { ...pr, position: transformPoint(pr.position, t), kind: pr.kind === 'rebar' ? ('manual' as const) : pr.kind, linkedRebarId: undefined, depth: undefined };
  });
  const lineProbes = p.lineProbes.map((lp) => {
    if (!idSet.has(lp.id)) return lp;
    hit++;
    note(ctx, 'lineProbes', lp.id, 'updated');
    return { ...lp, from: transformPoint(lp.from, t), to: transformPoint(lp.to, t) };
  });
  if (hit === 0) throw new CommandError('not-found', 'None of the ids exist.', { field: 'ids' });
  ctx.project = { ...p, regions, rebars, probes, lineProbes };
  ctx.geometryTouched = true;
}

function copyEntities(ctx: Ctx, ids: string[], t: Transform): void {
  const p = ctx.project;
  let hit = 0;
  for (const id of ids) {
    const r = p.regions.find((x) => x.id === id);
    if (r) {
      hit++;
      addRegion(ctx, { ...r, id: undefined, name: `${r.name} kopi`, polygon: normalizePolygon(transformPolygon(r.polygon, t)), template: undefined, source: 'derived' });
      continue;
    }
    const b = p.rebars.find((x) => x.id === id);
    if (b) {
      hit++;
      handle(ctx, { type: 'rebar.add', rebar: { ...b, id: undefined, name: b.name, centre: transformPoint(b.centre, t), setId: undefined, setIndex: undefined } });
      continue;
    }
    const pr = p.probes.find((x) => x.id === id);
    if (pr) {
      hit++;
      handle(ctx, { type: 'probe.add', probe: { ...pr, id: undefined, name: `${pr.name} kopi`, position: transformPoint(pr.position, t), kind: 'manual', linkedRebarId: undefined, depth: undefined } });
    }
  }
  if (hit === 0) throw new CommandError('not-found', 'None of the ids exist.', { field: 'ids' });
}

function deleteAny(ctx: Ctx, ids: string[]): void {
  const regionIds = ids.filter((id) => ctx.project.regions.some((r) => r.id === id));
  if (regionIds.length) deleteRegions(ctx, regionIds, 'delete');
  const rest = ids.filter((id) => !regionIds.includes(id));
  for (const id of rest) {
    if (ctx.project.rebars.some((b) => b.id === id)) handle(ctx, { type: 'rebar.delete', ids: [id] });
    else if (ctx.project.rebarSets.some((s) => s.id === id)) handle(ctx, { type: 'rebarSet.delete', id });
    else if (ctx.project.probes.some((p) => p.id === id)) handle(ctx, { type: 'probe.delete', ids: [id] });
    else if (ctx.project.lineProbes.some((p) => p.id === id)) handle(ctx, { type: 'lineProbe.delete', ids: [id] });
    else if (ctx.project.boundaryConditions.some((b) => b.id === id)) handle(ctx, { type: 'bc.delete', id });
    else if (ctx.project.heatSources.some((h) => h.id === id)) handle(ctx, { type: 'heatSource.delete', id });
    else if (ctx.project.materials.some((m) => m.id === id)) handle(ctx, { type: 'material.delete', id });
    else if (ctx.project.timeSeries.some((s) => s.id === id)) handle(ctx, { type: 'series.delete', id });
    else if (ctx.project.scenarios.some((s) => s.id === id)) handle(ctx, { type: 'scenario.delete', id });
    else if (ctx.project.metrics.some((m) => m.id === id)) handle(ctx, { type: 'metric.delete', id });
    else throw new CommandError('not-found', `Nothing has the id "${id}".`, { field: 'ids' });
  }
}

function transformPoint(p: Vec2, t: Transform): Vec2 {
  const poly = transformPolygon({ outer: [p, [p[0] + 1, p[1]], [p[0], p[1] + 1]], holes: [] }, t);
  return poly.outer[0];
}

function updateEntity<K extends Collections>(ctx: Ctx, collection: K, entity: Project[K][number]): void {
  const list = (ctx.project[collection] as { id: string }[]).map((e) => (e.id === (entity as { id: string }).id ? entity : e));
  ctx.project = { ...ctx.project, [collection]: list } as Project;
  note(ctx, collection, (entity as { id: string }).id, 'updated');
}

function removeEntity(ctx: Ctx, collection: Collections, id: string): void {
  const list = (ctx.project[collection] as { id: string }[]).filter((e) => e.id !== id);
  ctx.project = { ...ctx.project, [collection]: list } as Project;
  note(ctx, collection, id, 'deleted');
}

function getEntity<K extends Collections>(project: Project, collection: K, id: string): Project[K][number] {
  const e = (project[collection] as { id: string }[]).find((x) => x.id === id);
  if (!e) {
    throw new CommandError('not-found', `No ${singular(collection)} with id "${id}".`, {
      field: 'id',
      value: id,
      options: (project[collection] as { id: string; name?: string }[]).map((x) => (x.name ? `${x.id} (${x.name})` : x.id)),
    });
  }
  return e as Project[K][number];
}

function ensureUnique(project: Project, collection: Collections, id: string): void {
  if ((project[collection] as { id: string }[]).some((e) => e.id === id)) {
    throw new CommandError('duplicate-id', `A ${singular(collection)} with id "${id}" already exists.`, { field: 'id', value: id, suggestion: 'Leave the id out to get a new one.' });
  }
}

function requireMaterial(project: Project, id: string): Material {
  const m = project.materials.find((x) => x.id === id);
  if (!m) throw new CommandError('not-found', `Material "${id}" is not in the project.`, { field: 'materialId', value: id, options: project.materials.map((x) => `${x.id} (${x.name})`), suggestion: 'Add it first with material.addFromLibrary.' });
  return m;
}

function firstMaterial(project: Project, category: string): string | null {
  return project.materials.find((m) => m.category === category)?.id ?? project.materials[0]?.id ?? null;
}

function note(ctx: Ctx, collection: Change['collection'], id: string | undefined, kind: Change['kind']): void {
  ctx.changes.push({ collection, id, kind });
  if (kind === 'added' && id) ctx.created.push(id);
}

function singular(c: string): string {
  return c === 'timeSeries' ? 'time series' : c.replace(/s$/, '').replace(/([A-Z])/g, ' $1').toLowerCase();
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new CommandError('bad-value', `"${field}" must be a non-empty text.`, { field });
  return v;
}

function safePolygon(polygon: Polygon, field: string): Polygon {
  const normalized = normalizePolygon(polygon);
  const problems = validatePolygon(normalized).filter((i) => i.severity === 'error');
  if (problems.length) throw new CommandError('bad-polygon', problems[0].message, { field, suggestion: problems[0].suggestion });
  if (polygonArea(normalized) <= 0) throw new CommandError('bad-polygon', 'The shape has no area.', { field });
  return normalized;
}

function ringOf(polygon: Polygon, ring: number): Ring {
  if (ring === 0) return polygon.outer;
  const h = polygon.holes[ring - 1];
  if (!h) throw new CommandError('bad-index', `Ring ${ring} does not exist (the region has ${polygon.holes.length} hole(s)).`, { field: 'ring' });
  return h;
}

function withRing(polygon: Polygon, ring: number, newRing: Ring): Polygon {
  if (ring === 0) return { ...polygon, outer: newRing };
  const holes = polygon.holes.slice();
  holes[ring - 1] = newRing;
  return { ...polygon, holes };
}

/** After inserting (+k) or deleting (−k) vertices at `from`, keep edge indices of BCs and sets pointing at the same physical edges. */
function shiftEdgeRefs(ctx: Ctx, regionId: string, ring: number, from: number, delta: number): void {
  const shift = (ref: EdgeRef): EdgeRef => {
    if (ref.regionId !== regionId || ref.ring !== ring) return ref;
    if (delta > 0 && ref.edgeIndex >= from) return { ...ref, edgeIndex: ref.edgeIndex + delta };
    if (delta < 0 && ref.edgeIndex > from) return { ...ref, edgeIndex: Math.max(0, ref.edgeIndex + delta) };
    return ref;
  };
  ctx.project = {
    ...ctx.project,
    boundaryConditions: ctx.project.boundaryConditions.map((bc) => ({ ...bc, edgeRefs: dedupeEdges(bc.edgeRefs.map(shift)) })),
    rebarSets: ctx.project.rebarSets.map((s) => (s.edgeRef ? { ...s, edgeRef: shift(s.edgeRef) } : s)),
  };
}

function withFingerprint(project: Project, ref: EdgeRef): EdgeRef {
  const region = project.regions.find((r) => r.id === ref.regionId);
  if (!region) throw new CommandError('not-found', `Edge refers to region "${ref.regionId}", which does not exist.`, { field: 'edgeRefs', options: project.regions.map((r) => `${r.id} (${r.name})`) });
  const ring = ringOf(region.polygon, ref.ring ?? 0);
  if (ref.edgeIndex < 0 || ref.edgeIndex >= ring.length) throw new CommandError('bad-index', `Edge ${ref.edgeIndex} does not exist on "${region.name}" (it has ${ring.length} edges, numbered from 0).`, { field: 'edgeIndex', options: ring.map((_, i) => i) });
  return { regionId: ref.regionId, ring: ref.ring ?? 0, edgeIndex: ref.edgeIndex, fingerprint: edgeFingerprint(ring, ref.edgeIndex) };
}

function sameEdge(a: EdgeRef, b: EdgeRef): boolean {
  return a.regionId === b.regionId && (a.ring ?? 0) === (b.ring ?? 0) && a.edgeIndex === b.edgeIndex;
}

function dedupeEdges(refs: EdgeRef[]): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (const r of refs) if (!out.some((o) => sameEdge(o, r))) out.push(r);
  return out;
}

/** Every edge carries exactly one boundary condition: assigning it to one removes it from the others. */
function claimEdges(ctx: Ctx, bcId: string, refs: EdgeRef[]): void {
  ctx.project = {
    ...ctx.project,
    boundaryConditions: ctx.project.boundaryConditions.map((bc) => {
      if (bc.id === bcId) return bc;
      const kept = bc.edgeRefs.filter((e) => !refs.some((r) => sameEdge(e, r)));
      return kept.length === bc.edgeRefs.length ? bc : { ...bc, edgeRefs: kept };
    }),
  };
}

function checkBc(project: Project, bc: BoundaryCondition): void {
  for (const sid of seriesOf(bc)) {
    if (!project.timeSeries.some((s) => s.id === sid)) throw new CommandError('not-found', `Time series "${sid}" is not in the project.`, { field: 'seriesId', value: sid, options: project.timeSeries.map((s) => `${s.id} (${s.name})`), suggestion: 'Add it with series.addFromLibrary or series.generate.' });
  }
  if (bc.type === 'convection' && bc.alpha == null && bc.surfaceResistance == null) throw new CommandError('missing-field', 'A convection boundary needs alpha (W/m²K) or surfaceResistance (m²K/W).', { field: 'alpha' });
  if (bc.type === 'convection-radiation') {
    for (const [k, v] of Object.entries({ alphaC: bc.alphaC, phi: bc.phi, epsF: bc.epsF })) {
      if (typeof v !== 'number' || !(v >= 0)) throw new CommandError('bad-value', `"${k}" must be a number ≥ 0.`, { field: k, value: v });
    }
  }
}

function seriesOf(bc: BoundaryCondition): string[] {
  switch (bc.type) {
    case 'fixed':
      return [bc.temperatureSeriesId];
    case 'convection':
      return [bc.airSeriesId];
    case 'convection-radiation':
      return bc.radiationSeriesId ? [bc.gasSeriesId, bc.radiationSeriesId] : [bc.gasSeriesId];
    case 'flux':
      return [bc.fluxSeriesId];
    default:
      return [];
  }
}

function checkSeriesPoints(points: [number, number][]): void {
  if (!Array.isArray(points) || points.length < 1) throw new CommandError('bad-value', 'A time series needs at least one point.', { field: 'points' });
  for (let i = 1; i < points.length; i++) {
    if (!(points[i][0] > points[i - 1][0])) throw new CommandError('bad-value', `Time must increase: point ${i} (t = ${points[i][0]}) is not after point ${i - 1} (t = ${points[i - 1][0]}).`, { field: 'points' });
  }
}

function defaultRegionName(project: Project, shape: PrimitiveShape): string {
  const base: Record<PrimitiveShape['kind'], string> = { rect: 'Rektangel', circle: 'Sirkel', ellipse: 'Ellipse', regularPolygon: 'Mangekant', polygon: 'Område', polygonWithHoles: 'Område' };
  const n = project.regions.length + 1;
  return `${base[shape.kind]} ${n}`;
}

function nextProbeName(project: Project): string {
  let n = project.probes.filter((p) => !p.linkedRebarId).length + 1;
  while (project.probes.some((p) => p.name === `P${n}`)) n++;
  return `P${n}`;
}

function sameParams(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => a[k] === b[k]);
}

function issue(severity: Issue['severity'], code: string, message: string, messageNb: string, collection: Change['collection'], id: string, suggestion?: string, point?: Vec2): Issue {
  return { severity, code, message, messageNb, entity: { collection, id }, suggestion, point };
}
