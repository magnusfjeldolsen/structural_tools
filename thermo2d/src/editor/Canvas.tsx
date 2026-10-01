/**
 * The editable 2D canvas (SVG). Geometry is drawn inside a y-flipped group in
 * model mm with non-scaling strokes; labels are placed in screen space.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type WheelEvent as RWheelEvent } from 'react';
import type { EdgeRef, Mesh, Polygon, Project, Region, Ring, Vec2 } from '@thermo2d/core';
import { stirrupPath } from '@thermo2d/core';
import { useStore, type Selection, type Tool } from '../state/store.js';
import { useT } from '../i18n/useT.js';
import { fitBounds, formatMm, gridSpacing, pan, toModel, toScreen, visibleBounds, zoomAt, type Viewport } from './viewport.js';
import { snapPoint, orthoConstrain, type SnapResult } from './snapping.js';
import { allRings, arcThrough, circleRingAt, nearestEdge, parseDims, parseSegmentEntry, pointAt, pointInPolygonSimple, polygonAreaOf, rectFromCorners, rectFromSize, ringBoundsOf, ringCentroidOf } from './geometryTools.js';
import { Button } from '../components/ui.js';

type Draft =
  | { kind: 'rect'; start: Vec2 }
  | { kind: 'circle'; centre: Vec2 }
  | { kind: 'polygon'; points: Vec2[]; arc?: { start: Vec2; mid?: Vec2 } }
  | { kind: 'split'; start: Vec2 }
  | { kind: 'lineProbe'; start: Vec2 }
  | { kind: 'void'; start: Vec2 };

type Drag =
  | { kind: 'pan'; last: Vec2 }
  | { kind: 'box'; start: Vec2; current: Vec2; additive: boolean }
  | { kind: 'vertex'; regionId: string; ring: number; index: number; current: Vec2 }
  | { kind: 'entities'; ids: string[]; start: Vec2; current: Vec2 }
  | { kind: 'probe'; id: string; current: Vec2 };

const HIT_PX = 8;

function ringPath(r: Ring): string {
  if (!r.length) return '';
  return r.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ') + ' Z';
}
function polygonPath(p: Polygon): string {
  return [p.outer, ...p.holes].map(ringPath).join(' ');
}

export function Canvas(props: { svgRef: (el: SVGSVGElement | null) => void }) {
  const t = useT();
  const project = useStore((s) => s.project);
  const ui = useStore((s) => s.ui);
  const meshPreview = useStore((s) => s.meshPreview);
  const messages = useStore((s) => s.messages);
  const { dispatch, select, selectEdges, setTool, setUi } = useStore.getState();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgEl = useRef<SVGSVGElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [vp, setVp] = useState<Viewport>({ scale: 1, ox: 100, oy: 500 });
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [snap, setSnap] = useState<SnapResult | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [typed, setTyped] = useState('');
  const [hoverEdge, setHoverEdge] = useState<EdgeRef | null>(null);
  const spaceDown = useRef(false);
  const fittedFor = useRef<string | null>(null);

  // size tracking
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => ringBoundsOf(project.regions.flatMap((r) => allRings(r.polygon))), [project.regions]);
  const fit = useCallback(() => setVp(fitBounds(bounds, size.w, size.h)), [bounds, size]);
  // fit once per project (first time regions appear)
  useEffect(() => {
    if (fittedFor.current !== project.id && project.regions.length) {
      fittedFor.current = project.id;
      fit();
    }
  }, [project.id, project.regions.length, fit]);

  const visible = project.regions.filter((r) => r.visible !== false);
  const materialColor = (r: Region) => project.materials.find((m) => m.id === r.materialId)?.color ?? r.color ?? (r.materialId ? '#a3a3a3' : '#d4d4d8');
  const tol = HIT_PX / vp.scale;
  const grid = gridSpacing(vp.scale);

  const modelPoint = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgEl.current!.getBoundingClientRect();
    return toModel(vp, [e.clientX - rect.left, e.clientY - rect.top]);
  };
  const screenPoint = (e: { clientX: number; clientY: number }): Vec2 => {
    const rect = svgEl.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const snapCtx = useMemo(
    () => ({
      rings: visible.flatMap((r) => allRings(r.polygon)),
      centres: visible.map((r) => ringCentroidOf(r.polygon.outer)).concat(project.rebars.map((b) => b.centre)),
      gridSpacing: grid,
      options: ui.snap,
    }),
    [visible, project.rebars, grid, ui.snap],
  );

  const draftReference = (): Vec2 | undefined => {
    if (!draft) return undefined;
    if (draft.kind === 'polygon') return draft.arc?.start ?? draft.points[draft.points.length - 1];
    if (draft.kind === 'rect' || draft.kind === 'split' || draft.kind === 'lineProbe' || draft.kind === 'void') return draft.start;
    if (draft.kind === 'circle') return draft.centre;
    return undefined;
  };

  const snapped = (raw: Vec2, shift: boolean): Vec2 => {
    const ref = draftReference();
    let p = raw;
    if (shift && ref) p = orthoConstrain(p, ref);
    const s = snapPoint(p, { ...snapCtx, tolerance: tol * 1.5, reference: ref });
    setSnap(s);
    return s ? s.point : p;
  };

  // --- hit testing --------------------------------------------------------
  const hitProbe = (p: Vec2): string | null => {
    for (const pr of project.probes) if (Math.hypot(pr.position[0] - p[0], pr.position[1] - p[1]) <= tol) return pr.id;
    return null;
  };
  const hitRebar = (p: Vec2): string | null => {
    for (const b of project.rebars) if (Math.hypot(b.centre[0] - p[0], b.centre[1] - p[1]) <= Math.max(tol, b.diameter / 2)) return b.id;
    return null;
  };
  const hitVertex = (p: Vec2, regionIds: string[]): { regionId: string; ring: number; index: number } | null => {
    for (const id of regionIds) {
      const r = project.regions.find((x) => x.id === id);
      if (!r || r.locked) continue;
      const rings = allRings(r.polygon);
      for (let ri = 0; ri < rings.length; ri++)
        for (let i = 0; i < rings[ri].length; i++) if (Math.hypot(rings[ri][i][0] - p[0], rings[ri][i][1] - p[1]) <= tol) return { regionId: id, ring: ri, index: i };
    }
    return null;
  };
  const hitRegion = (p: Vec2): Region | null => {
    let best: Region | null = null;
    let bestArea = Infinity;
    for (const r of visible) {
      if (pointInPolygonSimple(p, r.polygon)) {
        const a = polygonAreaOf(r.polygon);
        if (a < bestArea) {
          best = r;
          bestArea = a;
        }
      }
    }
    return best;
  };
  const hitEdge = (p: Vec2): EdgeRef | null => {
    let best: EdgeRef | null = null;
    let bestD = tol;
    for (const r of visible) {
      const rings = allRings(r.polygon);
      for (let ri = 0; ri < rings.length; ri++) {
        const ne = nearestEdge(p, rings[ri]);
        if (ne.distance <= bestD) {
          bestD = ne.distance;
          best = { regionId: r.id, ring: ri, edgeIndex: ne.index };
        }
      }
    }
    return best;
  };

  // --- creation helpers ---------------------------------------------------
  const addRegion = (ring: Ring, name?: string) => {
    if (ring.length < 3) return;
    const res = dispatch([{ type: 'region.addPrimitive', shape: { kind: 'polygon', points: ring }, name }]);
    const id = res?.createdIds[0]?.[0];
    if (id) select([{ collection: 'regions', id }]);
  };
  const finishVoid = (a: Vec2, b: Vec2) => {
    const ring = rectFromCorners(a, b);
    const c = ringCentroidOf(ring);
    const host = hitRegion(c) ?? hitRegion(a);
    if (host) dispatch([{ type: 'region.subtractShape', id: host.id, shape: { kind: 'polygon', points: ring } }]);
  };
  const finishPolygon = (pts: Vec2[]) => {
    setDraft(null);
    setTyped('');
    if (pts.length >= 3) addRegion(pts);
  };

  // --- typed entry --------------------------------------------------------
  const applyTyped = () => {
    if (!draft) return;
    if (draft.kind === 'rect' || draft.kind === 'void') {
      const d = parseDims(typed);
      if (d.length >= 1) {
        const w = d[0];
        const h = d[1] ?? d[0];
        if (draft.kind === 'rect') addRegion(rectFromSize(draft.start, w, h));
        else finishVoid(draft.start, [draft.start[0] + w, draft.start[1] + h]);
        setDraft(null);
        setTyped('');
      }
    } else if (draft.kind === 'circle') {
      const d = parseDims(typed);
      if (d.length >= 1 && d[0] > 0) {
        addRegion(circleRingAt(draft.centre, d[0]));
        setDraft(null);
        setTyped('');
      }
    } else if (draft.kind === 'polygon') {
      const e = parseSegmentEntry(typed);
      if (!e) return;
      const last = draft.points[draft.points.length - 1];
      let ang = e.angleDeg;
      if (ang === undefined && cursor) ang = (Math.atan2(cursor[1] - last[1], cursor[0] - last[0]) * 180) / Math.PI;
      const snappedAng = e.angleDeg === undefined ? Math.round((ang ?? 0) / 45) * 45 : ang!;
      setDraft({ kind: 'polygon', points: [...draft.points, pointAt(last, e.length, snappedAng)] });
      setTyped('');
    }
  };

  // --- mouse --------------------------------------------------------------
  const onWheel = (e: RWheelEvent) => {
    const f = Math.exp(-e.deltaY * 0.0015);
    setVp((v) => zoomAt(v, screenPoint(e), f));
  };

  const onMouseDown = (e: RMouseEvent) => {
    if (!svgEl.current) return;
    const sp = screenPoint(e);
    const raw = modelPoint(e);
    if (e.button === 1 || ui.tool === 'pan' || spaceDown.current) {
      setDrag({ kind: 'pan', last: sp });
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const p = snapped(raw, e.shiftKey);
    const tool: Tool = ui.tool;
    const additive = e.shiftKey;

    switch (tool) {
      case 'select': {
        const probeId = hitProbe(raw);
        if (probeId) {
          select([{ collection: 'probes', id: probeId }], additive);
          setDrag({ kind: 'probe', id: probeId, current: raw });
          return;
        }
        const rebarId = hitRebar(raw);
        if (rebarId) {
          select([{ collection: 'rebars', id: rebarId }], additive);
          setDrag({ kind: 'entities', ids: [rebarId], start: raw, current: raw });
          return;
        }
        const selRegions = ui.selection.filter((s) => s.collection === 'regions').map((s) => s.id);
        const v = hitVertex(raw, selRegions);
        if (v) {
          setUi({ vertexSelection: v });
          setDrag({ kind: 'vertex', ...v, current: raw });
          return;
        }
        const region = hitRegion(raw);
        if (region) {
          const already = ui.selection.some((s) => s.collection === 'regions' && s.id === region.id);
          if (!already || additive) select([{ collection: 'regions', id: region.id }], additive);
          const ids = (already && !additive ? ui.selection : [{ collection: 'regions', id: region.id } as Selection]).filter((s) => s.collection === 'regions' || s.collection === 'rebars' || s.collection === 'probes').map((s) => s.id);
          if (!region.locked) setDrag({ kind: 'entities', ids, start: raw, current: raw });
          return;
        }
        setDrag({ kind: 'box', start: raw, current: raw, additive });
        return;
      }
      case 'edge': {
        const er = hitEdge(raw);
        if (er && ui.paintBcId) {
          // Paint mode: the clicked edge gets the selected boundary condition at once (shift removes).
          dispatch([{ type: 'bc.assignEdges', id: ui.paintBcId, edgeRefs: [er], mode: additive ? 'remove' : 'add' }]);
          selectEdges([er]);
          return;
        }
        if (er) selectEdges([er], additive);
        else if (!additive) selectEdges([]);
        return;
      }
      case 'rect':
      case 'void': {
        if (!draft) setDraft({ kind: tool, start: p });
        else if (draft.kind === tool) {
          if (tool === 'rect') addRegion(rectFromCorners(draft.start, p));
          else finishVoid(draft.start, p);
          setDraft(null);
          setTyped('');
        }
        return;
      }
      case 'circle': {
        if (!draft) setDraft({ kind: 'circle', centre: p });
        else if (draft.kind === 'circle') {
          const r = Math.hypot(p[0] - draft.centre[0], p[1] - draft.centre[1]);
          if (r > 0) addRegion(circleRingAt(draft.centre, r));
          setDraft(null);
          setTyped('');
        }
        return;
      }
      case 'polygon': {
        if (!draft || draft.kind !== 'polygon') {
          setDraft({ kind: 'polygon', points: [p] });
          return;
        }
        if (draft.arc) {
          if (!draft.arc.mid) setDraft({ ...draft, arc: { start: draft.arc.start, mid: p } });
          else setDraft({ kind: 'polygon', points: [...draft.points, ...arcThrough(draft.arc.start, draft.arc.mid, p)] });
          return;
        }
        const first = draft.points[0];
        if (draft.points.length >= 3 && Math.hypot(first[0] - p[0], first[1] - p[1]) <= tol) finishPolygon(draft.points);
        else setDraft({ kind: 'polygon', points: [...draft.points, p] });
        return;
      }
      case 'split': {
        if (!draft) setDraft({ kind: 'split', start: p });
        else if (draft.kind === 'split') {
          const targets = ui.selection.filter((s) => s.collection === 'regions').map((s) => s.id);
          const ids = targets.length ? targets : visible.map((r) => r.id);
          dispatch(ids.map((id) => ({ type: 'region.split' as const, id, line: [draft.start, p] as [Vec2, Vec2] })));
          setDraft(null);
        }
        return;
      }
      case 'probe': {
        const res = dispatch([{ type: 'probe.add', probe: { name: `P${project.probes.length + 1}`, position: p, kind: 'click' } }]);
        const id = res?.createdIds[0]?.[0];
        if (id) select([{ collection: 'probes', id }]);
        return;
      }
      case 'lineProbe': {
        if (!draft) setDraft({ kind: 'lineProbe', start: p });
        else if (draft.kind === 'lineProbe') {
          dispatch([{ type: 'lineProbe.add', lineProbe: { name: `L${project.lineProbes.length + 1}`, from: draft.start, to: p, samples: 50 } }]);
          setDraft(null);
        }
        return;
      }
    }
  };

  const onMouseMove = (e: RMouseEvent) => {
    if (!svgEl.current) return;
    const raw = modelPoint(e);
    if (drag) {
      if (drag.kind === 'pan') {
        const sp = screenPoint(e);
        setVp((v) => pan(v, sp[0] - drag.last[0], sp[1] - drag.last[1]));
        setDrag({ kind: 'pan', last: sp });
        return;
      }
      const p = drag.kind === 'box' ? raw : snapped(raw, e.shiftKey);
      setDrag({ ...drag, current: p } as Drag);
      setCursor(raw);
      return;
    }
    setCursor(raw);
    if (draft || ui.tool === 'probe' || ui.tool === 'rect' || ui.tool === 'circle' || ui.tool === 'polygon' || ui.tool === 'void' || ui.tool === 'split' || ui.tool === 'lineProbe') snapped(raw, e.shiftKey);
    else setSnap(null);
    if (ui.tool === 'edge') setHoverEdge(hitEdge(raw));
    else if (hoverEdge) setHoverEdge(null);
  };

  const onMouseUp = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (d.kind === 'pan') return;
    if (d.kind === 'box') {
      const x0 = Math.min(d.start[0], d.current[0]), x1 = Math.max(d.start[0], d.current[0]);
      const y0 = Math.min(d.start[1], d.current[1]), y1 = Math.max(d.start[1], d.current[1]);
      if (x1 - x0 < tol && y1 - y0 < tol) {
        if (!d.additive) select([]);
        return;
      }
      const inside = (p: Vec2) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
      const items: Selection[] = [];
      for (const r of visible) if (r.polygon.outer.every(inside)) items.push({ collection: 'regions', id: r.id });
      for (const b of project.rebars) if (inside(b.centre)) items.push({ collection: 'rebars', id: b.id });
      for (const p of project.probes) if (inside(p.position)) items.push({ collection: 'probes', id: p.id });
      select(items, d.additive);
      return;
    }
    if (d.kind === 'vertex') {
      dispatch([{ type: 'region.setVertex', id: d.regionId, ring: d.ring, index: d.index, point: d.current }]);
      return;
    }
    if (d.kind === 'entities') {
      const dx = d.current[0] - d.start[0], dy = d.current[1] - d.start[1];
      if (Math.hypot(dx, dy) >= 1e-6) dispatch([{ type: 'entities.transform', ids: d.ids, transform: { kind: 'move', dx, dy } }]);
      return;
    }
    if (d.kind === 'probe') {
      const pr = project.probes.find((p) => p.id === d.id);
      if (pr && Math.hypot(pr.position[0] - d.current[0], pr.position[1] - d.current[1]) >= 1e-6) dispatch([{ type: 'probe.update', id: d.id, patch: { position: d.current, kind: 'manual', linkedRebarId: undefined } }]);
    }
  };

  const onDoubleClick = (e: RMouseEvent) => {
    if (ui.tool !== 'select') return;
    const raw = modelPoint(e);
    const selRegions = ui.selection.filter((s) => s.collection === 'regions').map((s) => s.id);
    for (const id of selRegions) {
      const r = project.regions.find((x) => x.id === id);
      if (!r || r.locked) continue;
      const rings = allRings(r.polygon);
      for (let ri = 0; ri < rings.length; ri++) {
        const ne = nearestEdge(raw, rings[ri]);
        if (ne.distance <= tol) {
          dispatch([{ type: 'region.insertVertex', id, ring: ri, edgeIndex: ne.index, point: snapped(raw, false) }]);
          return;
        }
      }
    }
  };

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
      if (e.key === ' ' && !typing) spaceDown.current = true;
      if (e.key === 'Escape') {
        if (draft) {
          setDraft(null);
          setTyped('');
        } else if (drag) setDrag(null);
        else if (ui.tool !== 'select') setTool('select');
        else select([]);
        return;
      }
      if (e.key === 'Enter' && draft?.kind === 'polygon' && !typing) {
        finishPolygon(draft.points);
        return;
      }
      if (typing) return;
      if (e.key === 'a' && draft?.kind === 'polygon' && !draft.arc) {
        setDraft({ ...draft, arc: { start: draft.points[draft.points.length - 1] } });
        return;
      }
      const map: Record<string, Tool> = { v: 'select', h: 'pan', r: 'rect', c: 'circle', p: 'polygon', e: 'edge', m: 'probe' };
      if (!e.ctrlKey && !e.metaKey && map[e.key.toLowerCase()]) setTool(map[e.key.toLowerCase()]);
      if (e.key === 'f' && !e.ctrlKey) fit();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceDown.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [draft, drag, ui.tool, fit, select, setTool]);

  // reset draft when the tool changes
  useEffect(() => {
    setDraft(null);
    setTyped('');
  }, [ui.tool]);

  // --- rendering ----------------------------------------------------------
  const vb = visibleBounds(vp, size.w, size.h);
  const gridLines = useMemo(() => {
    const lines: { x?: number; y?: number; major: boolean }[] = [];
    const major = grid * 5;
    const x0 = Math.floor(vb.minX / grid) * grid;
    const y0 = Math.floor(vb.minY / grid) * grid;
    const maxLines = 400;
    for (let x = x0, n = 0; x <= vb.maxX && n < maxLines; x += grid, n++) lines.push({ x, major: Math.abs(x / major - Math.round(x / major)) < 1e-6 });
    for (let y = y0, n = 0; y <= vb.maxY && n < maxLines; y += grid, n++) lines.push({ y, major: Math.abs(y / major - Math.round(y / major)) < 1e-6 });
    return lines;
  }, [vb.minX, vb.maxX, vb.minY, vb.maxY, grid]);

  const previewMoved = (ids: string[], dx: number, dy: number, poly: Polygon): Polygon => ({ outer: poly.outer.map((p) => [p[0] + dx, p[1] + dy] as Vec2), holes: poly.holes.map((h) => h.map((p) => [p[0] + dx, p[1] + dy] as Vec2)) });

  const regionPolygon = (r: Region): Polygon => {
    if (drag?.kind === 'vertex' && drag.regionId === r.id) {
      const rings = allRings(r.polygon).map((ring, ri) => (ri === drag.ring ? ring.map((p, i) => (i === drag.index ? drag.current : p)) : ring));
      return { outer: rings[0], holes: rings.slice(1) };
    }
    if (drag?.kind === 'entities' && drag.ids.includes(r.id)) return previewMoved(drag.ids, drag.current[0] - drag.start[0], drag.current[1] - drag.start[1], r.polygon);
    return r.polygon;
  };

  const bcOfEdge = useMemo(() => {
    const map = new Map<string, { color: string; name: string }>();
    project.boundaryConditions.forEach((bc, i) => {
      const color = bc.color ?? BC_COLORS[i % BC_COLORS.length];
      for (const e of bc.edgeRefs) map.set(`${e.regionId}/${e.ring}/${e.edgeIndex}`, { color, name: bc.name });
    });
    return map;
  }, [project.boundaryConditions]);

  const edgeSelected = (e: EdgeRef) => ui.edgeSelection.some((x) => x.regionId === e.regionId && x.ring === e.ring && x.edgeIndex === e.edgeIndex);

  const meshPath = useMemo(() => {
    if (!meshPreview || !ui.showMesh) return '';
    const m: Mesh = meshPreview;
    const parts: string[] = [];
    const n = m.triangles.length / 3;
    for (let e = 0; e < n; e++) {
      const a = m.triangles[3 * e], b = m.triangles[3 * e + 1], c = m.triangles[3 * e + 2];
      parts.push(`M${m.nodes[2 * a]} ${m.nodes[2 * a + 1]}L${m.nodes[2 * b]} ${m.nodes[2 * b + 1]}L${m.nodes[2 * c]} ${m.nodes[2 * c + 1]}Z`);
    }
    return parts.join('');
  }, [meshPreview, ui.showMesh]);

  const stirrups = useMemo(() => {
    const out: { id: string; ring: Ring }[] = [];
    for (const s of project.rebarSets) {
      if (s.kind !== 'stirrup') continue;
      try {
        const ring = stirrupPath(s, project) as Ring | null;
        if (ring && ring.length) out.push({ id: s.id, ring });
      } catch {
        /* geometry not ready */
      }
    }
    return out;
  }, [project]);

  const originOffset: Vec2 = useMemo(() => {
    const o = project.settings.origin;
    if (Array.isArray(o)) return o;
    if (o === 'centroid' && bounds) return [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2];
    return bounds ? [bounds.minX, bounds.minY] : [0, 0];
  }, [project.settings.origin, bounds]);

  const hint = (() => {
    if (draft?.kind === 'polygon' && draft.arc) return t('arcHint');
    switch (ui.tool) {
      case 'polygon':
        return `${t('polygonHint')} (A = ${t('toolArc')})`;
      case 'rect':
        return t('rectHint');
      case 'circle':
        return t('circleHint');
      case 'split':
        return t('splitHint');
      case 'void':
        return t('voidHint');
      case 'probe':
        return t('probeHint');
      case 'lineProbe':
        return t('lineProbeHint');
      case 'edge':
        return t('edgeHint');
      default:
        return null;
    }
  })();
  const typedVisible = draft && (draft.kind === 'rect' || draft.kind === 'circle' || draft.kind === 'polygon' || draft.kind === 'void');
  const typedPos = (() => {
    const ref = draftReference();
    if (!ref) return null;
    const s = toScreen(vp, ref);
    return { left: Math.min(size.w - 180, s[0] + 12), top: Math.min(size.h - 40, s[1] + 12) };
  })();
  const problemPoints = messages.filter((m) => m.point).map((m) => ({ point: m.point!, text: ui.lang === 'nb' && m.messageNb ? m.messageNb : m.message, error: m.severity === 'error' }));

  const flip = `matrix(${vp.scale} 0 0 ${-vp.scale} ${vp.ox} ${vp.oy})`;
  const draftPreview = (): JSX.Element | null => {
    if (!draft || !cursor) return null;
    const c = snap ? snap.point : cursor;
    if (draft.kind === 'rect' || draft.kind === 'void') return <path d={ringPath(rectFromCorners(draft.start, c))} className="draft" fill={draft.kind === 'void' ? 'rgba(220,38,38,0.15)' : 'rgba(37,99,235,0.1)'} stroke={draft.kind === 'void' ? '#dc2626' : '#2563eb'} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />;
    if (draft.kind === 'circle') {
      const r = Math.hypot(c[0] - draft.centre[0], c[1] - draft.centre[1]);
      return <circle cx={draft.centre[0]} cy={draft.centre[1]} r={r} fill="rgba(37,99,235,0.1)" stroke="#2563eb" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />;
    }
    if (draft.kind === 'polygon') {
      const pts = draft.arc?.mid ? [...draft.points, ...arcThrough(draft.arc.start, draft.arc.mid, c)] : [...draft.points, c];
      return <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')} fill="rgba(37,99,235,0.08)" stroke="#2563eb" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />;
    }
    if (draft.kind === 'split' || draft.kind === 'lineProbe') return <line x1={draft.start[0]} y1={draft.start[1]} x2={c[0]} y2={c[1]} stroke={draft.kind === 'split' ? '#dc2626' : '#7c3aed'} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />;
    return null;
  };

  const labelPos = (p: Vec2) => toScreen(vp, p);

  return (
    <div className="canvas-area" ref={containerRef}>
      <svg
        className="canvas"
        ref={(el) => {
          svgEl.current = el;
          props.svgRef(el);
        }}
        width={size.w}
        height={size.h}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => (setCursor(null), setSnap(null))}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: drag?.kind === 'pan' || ui.tool === 'pan' ? 'grab' : ui.tool === 'select' ? 'default' : 'crosshair' }}
      >
        <rect width={size.w} height={size.h} fill="var(--canvas)" />
        <g transform={flip}>
          {/* grid */}
          {gridLines.map((l, i) =>
            l.x !== undefined ? (
              <line key={`gx${i}`} x1={l.x} y1={vb.minY} x2={l.x} y2={vb.maxY} stroke={l.major ? 'var(--grid-major)' : 'var(--grid)'} vectorEffect="non-scaling-stroke" />
            ) : (
              <line key={`gy${i}`} x1={vb.minX} y1={l.y} x2={vb.maxX} y2={l.y} stroke={l.major ? 'var(--grid-major)' : 'var(--grid)'} vectorEffect="non-scaling-stroke" />
            ),
          )}
          <line x1={vb.minX} y1={0} x2={vb.maxX} y2={0} stroke="var(--text-2)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />
          <line x1={0} y1={vb.minY} x2={0} y2={vb.maxY} stroke="var(--text-2)" strokeOpacity={0.5} vectorEffect="non-scaling-stroke" />

          {/* regions */}
          {visible.map((r) => {
            const sel = ui.selection.some((s) => s.collection === 'regions' && s.id === r.id);
            return (
              <path
                key={r.id}
                d={polygonPath(regionPolygon(r))}
                fillRule="evenodd"
                fill={materialColor(r)}
                fillOpacity={0.55}
                stroke={sel ? 'var(--sel)' : 'var(--text)'}
                strokeWidth={sel ? 2 : 1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {/* mesh */}
          {meshPath && <path d={meshPath} fill="none" stroke="var(--text-2)" strokeOpacity={0.35} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />}
          {/* boundary conditions + edge selection */}
          {visible.map((r) =>
            allRings(regionPolygon(r)).map((ring, ri) =>
              ring.map((a, i) => {
                const b = ring[(i + 1) % ring.length];
                const key = `${r.id}/${ri}/${i}`;
                const bc = bcOfEdge.get(key);
                const selE = edgeSelected({ regionId: r.id, ring: ri, edgeIndex: i });
                const hov = hoverEdge && hoverEdge.regionId === r.id && hoverEdge.ring === ri && hoverEdge.edgeIndex === i;
                if (!bc && !selE && !hov) return null;
                return <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={selE ? 'var(--sel)' : hov ? 'var(--hover)' : bc!.color} strokeWidth={selE || hov ? 5 : 4} strokeOpacity={0.85} vectorEffect="non-scaling-stroke" strokeLinecap="round" />;
              }),
            ),
          )}
          {/* stirrups */}
          {stirrups.map((s) => (
            <path key={s.id} d={ringPath(s.ring)} fill="none" stroke="#525252" strokeWidth={1.5} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
          ))}
          {/* rebars */}
          {project.rebars.map((b) => {
            const sel = ui.selection.some((s) => s.collection === 'rebars' && s.id === b.id);
            const off = drag?.kind === 'entities' && drag.ids.includes(b.id) ? [drag.current[0] - drag.start[0], drag.current[1] - drag.start[1]] : [0, 0];
            return <circle key={b.id} cx={b.centre[0] + off[0]} cy={b.centre[1] + off[1]} r={b.diameter / 2} fill="#404040" stroke={sel ? 'var(--sel)' : '#171717'} strokeWidth={sel ? 2 : 1} vectorEffect="non-scaling-stroke" />;
          })}
          {/* line probes */}
          {project.lineProbes.map((lp) => {
            const sel = ui.selection.some((s) => s.collection === 'lineProbes' && s.id === lp.id);
            return <line key={lp.id} x1={lp.from[0]} y1={lp.from[1]} x2={lp.to[0]} y2={lp.to[1]} stroke={sel ? 'var(--sel)' : '#7c3aed'} strokeWidth={sel ? 2.5 : 1.5} strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />;
          })}
          {/* probes */}
          {project.probes.map((p) => {
            const sel = ui.selection.some((s) => s.collection === 'probes' && s.id === p.id);
            const pos = drag?.kind === 'probe' && drag.id === p.id ? drag.current : drag?.kind === 'entities' && drag.ids.includes(p.id) ? ([p.position[0] + drag.current[0] - drag.start[0], p.position[1] + drag.current[1] - drag.start[1]] as Vec2) : p.position;
            return (
              <g key={p.id}>
                <circle cx={pos[0]} cy={pos[1]} r={4 / vp.scale} fill="#fff" stroke={sel ? 'var(--sel)' : '#b91c1c'} strokeWidth={sel ? 2.5 : 1.5} vectorEffect="non-scaling-stroke" />
                <line x1={pos[0] - 7 / vp.scale} y1={pos[1]} x2={pos[0] + 7 / vp.scale} y2={pos[1]} stroke="#b91c1c" vectorEffect="non-scaling-stroke" />
                <line x1={pos[0]} y1={pos[1] - 7 / vp.scale} x2={pos[0]} y2={pos[1] + 7 / vp.scale} stroke="#b91c1c" vectorEffect="non-scaling-stroke" />
              </g>
            );
          })}
          {/* vertex handles for selected regions */}
          {ui.selection
            .filter((s) => s.collection === 'regions')
            .map((s) => project.regions.find((r) => r.id === s.id))
            .filter((r): r is Region => !!r && !r.locked)
            .map((r) =>
              allRings(regionPolygon(r)).map((ring, ri) =>
                ring.map((p, i) => {
                  const active = ui.vertexSelection && ui.vertexSelection.regionId === r.id && ui.vertexSelection.ring === ri && ui.vertexSelection.index === i;
                  return <rect key={`${r.id}-${ri}-${i}`} x={p[0] - 3.5 / vp.scale} y={p[1] - 3.5 / vp.scale} width={7 / vp.scale} height={7 / vp.scale} fill={active ? 'var(--sel)' : '#fff'} stroke="var(--sel)" vectorEffect="non-scaling-stroke" />;
                }),
              ),
            )}
          {/* problems */}
          {problemPoints.map((p, i) => (
            <circle key={i} cx={p.point[0]} cy={p.point[1]} r={6 / vp.scale} fill="none" stroke={p.error ? 'var(--danger)' : 'var(--warn)'} strokeWidth={2} vectorEffect="non-scaling-stroke">
              <title>{p.text}</title>
            </circle>
          ))}
          {/* draft, box select, snap */}
          {draftPreview()}
          {drag?.kind === 'box' && <path d={ringPath(rectFromCorners(drag.start, drag.current))} fill="rgba(37,99,235,0.08)" stroke="var(--sel)" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />}
          {snap && <SnapMarker snap={snap} scale={vp.scale} />}
        </g>
        {/* labels in screen space */}
        {project.rebars.map((b) => {
          const s = labelPos(b.centre);
          return (
            <text key={`l${b.id}`} x={s[0] + Math.max(6, (b.diameter / 2) * vp.scale + 2)} y={s[1] - 2} fontSize={10} fill="var(--text)" pointerEvents="none">
              {b.name} Ø{b.diameter}
            </text>
          );
        })}
        {project.probes.map((p) => {
          const s = labelPos(p.position);
          return (
            <text key={`l${p.id}`} x={s[0] + 8} y={s[1] + 12} fontSize={10} fill="#b91c1c" pointerEvents="none">
              {p.name}
            </text>
          );
        })}
        {project.lineProbes.map((lp) => {
          const s = labelPos(lp.to);
          return (
            <text key={`l${lp.id}`} x={s[0] + 4} y={s[1] - 4} fontSize={10} fill="#7c3aed" pointerEvents="none">
              {lp.name}
            </text>
          );
        })}
        {visible.map((r) => {
          const c = labelPos(ringCentroidOf(r.polygon.outer));
          const mat = project.materials.find((m) => m.id === r.materialId);
          return (
            <text key={`l${r.id}`} x={c[0]} y={c[1]} fontSize={11} textAnchor="middle" fill="var(--text)" fillOpacity={0.8} pointerEvents="none">
              {r.name}
              {mat ? ` · ${mat.name}` : ''}
            </text>
          );
        })}
        {project.boundaryConditions.map((bc, i) => {
          const e = bc.edgeRefs[0];
          const r = e && project.regions.find((x) => x.id === e.regionId);
          if (!r) return null;
          const ring = allRings(r.polygon)[e.ring];
          if (!ring) return null;
          const a = ring[e.edgeIndex % ring.length];
          const b = ring[(e.edgeIndex + 1) % ring.length];
          const m = labelPos([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          return (
            <text key={`bc${bc.id}`} x={m[0]} y={m[1] + 4} fontSize={10} textAnchor="middle" fill={bc.color ?? BC_COLORS[i % BC_COLORS.length]} pointerEvents="none" style={{ paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3 }}>
              {bc.name}
            </text>
          );
        })}
      </svg>
      <div className="canvas-tools">
        <Button small onClick={fit} title="F">
          ⤢ {t('zoomFit')}
        </Button>
        <Button small active={ui.snap.grid} onClick={() => setUi({ snap: { ...ui.snap, grid: !ui.snap.grid } })}>
          {t('snapGrid')}
        </Button>
        <Button small active={ui.snap.vertex} onClick={() => setUi({ snap: { ...ui.snap, vertex: !ui.snap.vertex, midpoint: !ui.snap.vertex, intersection: !ui.snap.vertex, centre: !ui.snap.vertex, perpendicular: !ui.snap.vertex } })}>
          {t('snapVertex')}
        </Button>
        <Button small active={ui.showMesh} onClick={() => (setUi({ showMesh: !ui.showMesh, meshPreviewOn: !ui.showMesh }), !ui.showMesh && void useStore.getState().refreshMeshPreview())}>
          {t('showMesh')}
        </Button>
        <Button small onClick={() => setUi({ dialog: { kind: 'importGeometry' } })}>
          {t('importGeometry')}
        </Button>
      </div>
      {hint && <div className="canvas-hint">{hint}</div>}
      {typedVisible && typedPos && (
        <div className="typed-entry" style={typedPos}>
          <input
            autoFocus
            value={typed}
            placeholder={draft?.kind === 'polygon' ? 'L@°' : draft?.kind === 'circle' ? 'r' : 'b x h'}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (draft?.kind === 'polygon' && !typed.trim()) finishPolygon(draft.points);
                else applyTyped();
              }
              if (e.key === 'Escape') {
                setDraft(null);
                setTyped('');
              }
              e.stopPropagation();
            }}
          />
          <span className="hint">{t('typedEntryHint')}</span>
        </div>
      )}
      <div className="canvas-hud">
        {cursor && (
          <span>
            x {formatMm((snap?.point ?? cursor)[0] - originOffset[0])} · y {formatMm((snap?.point ?? cursor)[1] - originOffset[1])} mm
          </span>
        )}
        {snap && <span>· {t(SNAP_KEY[snap.kind])}</span>}
        <span>· {grid} mm</span>
        {meshPreview && ui.showMesh && (
          <span>
            · {meshPreview.stats.elementCount} {t('elements')}
          </span>
        )}
      </div>
    </div>
  );
}

const SNAP_KEY = { vertex: 'snapVertex', intersection: 'snapIntersection', midpoint: 'snapMid', centre: 'snapCentre', perpendicular: 'snapPerp', edge: 'snapVertex', grid: 'snapGrid' } as const;
export const BC_COLORS = ['#dc2626', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];

function SnapMarker(props: { snap: SnapResult; scale: number }) {
  const [x, y] = props.snap.point;
  const r = 6 / props.scale;
  const color = '#16a34a';
  switch (props.snap.kind) {
    case 'vertex':
      return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
    case 'midpoint':
      return <path d={`M${x} ${y + r}L${x - r} ${y - r}L${x + r} ${y - r}Z`} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
    case 'intersection':
      return <path d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x - r} ${y + r}L${x + r} ${y - r}`} stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
    case 'centre':
      return <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
    case 'perpendicular':
      return <path d={`M${x - r} ${y - r}L${x - r} ${y + r}L${x + r} ${y + r}`} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
    default:
      return <circle cx={x} cy={y} r={r / 2} fill={color} />;
  }
}

/** Exposed for the App's PNG export: serialise the SVG at its current size. */
export function svgToPngBlob(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const w = svg.clientWidth || Number(svg.getAttribute('width')) || 800;
  const h = svg.clientHeight || Number(svg.getAttribute('height')) || 600;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  // resolve CSS variables to concrete colours for the export
  const css = getComputedStyle(document.documentElement);
  const vars = ['--canvas', '--grid', '--grid-major', '--text', '--text-2', '--sel', '--hover', '--danger', '--warn'];
  let xml = new XMLSerializer().serializeToString(clone);
  for (const v of vars) xml = xml.split(`var(${v})`).join(css.getPropertyValue(v).trim() || '#000');
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w * scale;
      c.height = h * scale;
      const ctx = c.getContext('2d')!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error('SVG rasterisation failed'));
    img.src = url;
  });
}
