import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Project, RunResult, Vec2 } from '@thermo2d/core';
import { isotherm } from '@thermo2d/core';
import { bandColors, bandEdges, divergingBandColors, type BandScale } from './colorScale.js';
import { buildBandPaths, divergingEdges, temperatureEdges } from './isobands.js';
import { boundsOfNodes, fitViewport, hitMarker, niceGridSpacing, pan, toModel, toScreen, zoomAt, type Viewport } from './viewport.js';
import type { ElementLocator } from './fieldUtils.js';
import type { TFn } from './i18n.js';
import { formatTemp } from './format.js';

export interface ProbeMarker {
  id: string;
  name: string;
  x: number;
  y: number;
  value: number | null;
  isRebar?: boolean;
}

export interface ContourCanvasProps {
  project: Project;
  result: RunResult;
  /** Nodal values to draw (temperature, or a difference field). */
  field: Float32Array;
  mode: 'temperature' | 'difference';
  bands: BandScale;
  /** Symmetric limit for the difference mode. */
  diffLimit?: number;
  /** 'isobands' = exact linear variation inside each element (default); 'element' = one colour per triangle. */
  fill: 'isobands' | 'element';
  showIsolines: boolean;
  showMesh: boolean;
  show500: boolean;
  locator: ElementLocator;
  probes: ProbeMarker[];
  t: TFn;
  lineMode: boolean;
  onLineDone: (from: Vec2, to: Vec2) => void;
  onLineCancel: () => void;
  onPin: (p: { position: Vec2; name?: string }) => void;
  onProbeMove: (id: string, position: Vec2) => void;
  /** Selected line probes to draw. */
  lines: { id: string; from: Vec2; to: Vec2 }[];
}

export interface ContourCanvasHandle {
  toBlob(): Promise<Blob | null>;
  fit(): void;
}

interface DragState {
  kind: 'pan' | 'probe';
  id?: string;
  lastX: number;
  lastY: number;
  moved: boolean;
}

/** Canvas-2D temperature field with pan/zoom, hover readout, click probes, draggable probes and line-probe drawing. */
export const ContourCanvas = forwardRef<ContourCanvasHandle, ContourCanvasProps>(function ContourCanvas(props, ref) {
  const { project, result, field, mode, bands, diffLimit = 1, fill, showIsolines, showMesh, show500, locator, probes, t, lineMode, onLineDone, onLineCancel, onPin, onProbeMove, lines } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [vp, setVp] = useState<Viewport | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; v: number | null } | null>(null);
  const [tempProbe, setTempProbe] = useState<{ x: number; y: number } | null>(null);
  const [lineStart, setLineStart] = useState<Vec2 | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; pos: Vec2 } | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const bounds = useMemo(() => boundsOfNodes(result.mesh.nodes), [result.mesh.nodes]);

  // Resize observer keeps the canvas crisp.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(50, Math.floor(r.width)), h: Math.max(50, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => setVp(fitViewport(bounds, size.w, size.h)), [bounds, size.w, size.h]);
  useEffect(() => {
    if (!vp) fit();
  }, [vp, fit]);
  useEffect(() => {
    setVp(null);
  }, [result.mesh]);

  useImperativeHandle(
    ref,
    () => ({
      fit,
      toBlob: () => new Promise<Blob | null>((resolve) => canvasRef.current?.toBlob((b) => resolve(b), 'image/png') ?? resolve(null)),
    }),
    [fit],
  );

  // Band membership per triangle (or sub-triangle) is what makes drawing fast: one path per band.
  const colors = useMemo(() => (mode === 'difference' ? divergingBandColors(10) : bandColors(bands)), [mode, bands]);
  // Band geometry is built once per (field, scale) in model coordinates; pan/zoom only changes the canvas transform.
  const bandPaths = useMemo(() => {
    const edges = mode === 'difference' ? divergingEdges(diffLimit, 10) : temperatureEdges(bands.min, bands.max, bands.step);
    return buildBandPaths(result.mesh.nodes, result.mesh.triangles, field, edges, fill);
  }, [result.mesh, field, mode, bands, diffLimit, fill]);
  const isoSegments = useMemo(() => {
    if (mode !== 'temperature') return [] as { theta: number; segs: [Vec2, Vec2][] }[];
    const out: { theta: number; segs: [Vec2, Vec2][] }[] = [];
    const edges = showIsolines ? bandEdges(bands).slice(1, -1) : [];
    if (show500 && !edges.includes(500)) edges.push(500);
    for (const theta of edges) {
      try {
        // Core returns a flat [x1,y1,x2,y2,...] array; unpack into segment pairs.
        const flat = isotherm(result.mesh, field, theta);
        const segs: [Vec2, Vec2][] = [];
        for (let i = 0; i + 3 < flat.length; i += 4) segs.push([[flat[i], flat[i + 1]], [flat[i + 2], flat[i + 3]]]);
        out.push({ theta, segs });
      } catch {
        /* core not available: skip isolines */
      }
    }
    return out;
  }, [mode, showIsolines, show500, bands, result.mesh, field]);

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !vp) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    drawGrid(ctx, vp, size.w, size.h);
    drawField(ctx, vp, result, bandPaths, colors, showMesh, dpr);
    drawOutlines(ctx, vp, project);
    for (const iso of isoSegments) drawIso(ctx, vp, iso.theta, iso.segs, iso.theta === 500 && show500);
    for (const ln of lines) drawLine(ctx, vp, ln.from, ln.to, '#7c3aed');
    if (lineStart && hover) drawLine(ctx, vp, lineStart, [hover.x, hover.y], '#7c3aed', true);
    drawProbes(ctx, vp, probes, dragPos);
    if (tempProbe) {
      const [sx, sy] = toScreen(vp, tempProbe.x, tempProbe.y);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [vp, size, result, field, mode, bands, diffLimit, colors, bandPaths, showMesh, isoSegments, show500, project, probes, lines, lineStart, hover, tempProbe, dragPos]);

  const modelAt = (e: React.PointerEvent): Vec2 | null => {
    if (!vp) return null;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return toModel(vp, e.clientX - r.left, e.clientY - r.top);
  };
  const screenAt = (e: React.PointerEvent): [number, number] => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!vp) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [sx, sy] = screenAt(e);
    if (e.button === 0 && !lineMode) {
      const hit = hitMarker(vp, probes, sx, sy, 9);
      if (hit >= 0 && !probes[hit].isRebar) {
        dragRef.current = { kind: 'probe', id: probes[hit].id, lastX: sx, lastY: sy, moved: false };
        return;
      }
    }
    dragRef.current = { kind: 'pan', lastX: sx, lastY: sy, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!vp) return;
    const [sx, sy] = screenAt(e);
    const m = modelAt(e);
    const d = dragRef.current;
    if (d) {
      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      if (d.kind === 'pan' && d.moved) {
        setVp(pan(vp, dx, dy));
        d.lastX = sx;
        d.lastY = sy;
      } else if (d.kind === 'probe' && m && d.id) {
        setDragPos({ id: d.id, pos: m });
      }
    }
    if (m) setHover({ x: m[0], y: m[1], v: locator.value(field, m[0], m[1]) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    const m = modelAt(e);
    if (!d || !m) return;
    if (d.kind === 'probe' && d.id) {
      if (d.moved) onProbeMove(d.id, [round1(m[0]), round1(m[1])]);
      setDragPos(null);
      return;
    }
    if (d.moved || e.button !== 0) return;
    // A click.
    if (lineMode) {
      if (!lineStart) setLineStart([round1(m[0]), round1(m[1])]);
      else {
        onLineDone(lineStart, [round1(m[0]), round1(m[1])]);
        setLineStart(null);
      }
      return;
    }
    if (locator.locate(m[0], m[1])) setTempProbe({ x: round1(m[0]), y: round1(m[1]) });
    else setTempProbe(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!vp) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setVp(zoomAt(vp, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)));
  };

  useEffect(() => {
    if (!lineMode) setLineStart(null);
  }, [lineMode]);

  const tempValue = tempProbe ? locator.value(field, tempProbe.x, tempProbe.y) : null;
  const tempScreen = tempProbe && vp ? toScreen(vp, tempProbe.x, tempProbe.y) : null;
  const edges = mode === 'temperature' ? bandEdges(bands) : Array.from({ length: 11 }, (_, i) => -diffLimit + (2 * diffLimit * i) / 10);

  return (
    <div ref={wrapRef} className="t2d-canvas-wrap">
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          setHover(null);
          dragRef.current = null;
          setDragPos(null);
        }}
        onWheel={onWheel}
        onDoubleClick={fit}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: lineMode ? 'crosshair' : dragRef.current?.kind === 'pan' ? 'grabbing' : 'default' }}
      />
      <div className="t2d-colorbar">
        <div className="t2d-colorbar-title">{mode === 'temperature' ? '°C' : 'Δ°C'}</div>
        <div className="t2d-colorbar-bands">
          {colors.map((c, i) => (
            <div key={i} className="t2d-colorbar-band">
              <i style={{ background: c }} />
              <span>{fmtEdge(edges[i])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="t2d-readout">
        {lineMode ? (
          <span>{t('lineProbeHint')}</span>
        ) : hover ? (
          <span>{t('hoverReadout', { x: hover.x.toFixed(1), y: hover.y.toFixed(1), v: hover.v === null ? '–' : hover.v.toFixed(1) })}</span>
        ) : (
          <span className="t2d-hint">{t('hover')} · {t('clickProbe')}</span>
        )}
      </div>
      {tempProbe && tempScreen && (
        <div className="t2d-temp-probe" style={{ left: tempScreen[0], top: tempScreen[1] }}>
          <span>
            {t('tempProbe')}: ({tempProbe.x}, {tempProbe.y}) <b>{formatTemp(tempValue)} °C</b>
          </span>
          <button
            onClick={() => {
              onPin({ position: [tempProbe.x, tempProbe.y] });
              setTempProbe(null);
            }}
          >
            {t('pin')}
          </button>
          <button onClick={() => setTempProbe(null)}>×</button>
        </div>
      )}
      {lineMode && lineStart && (
        <div className="t2d-temp-probe" style={{ left: 8, top: 44, transform: 'none' }}>
          <span>
            ({lineStart[0]}, {lineStart[1]}) → …
          </span>
          <button
            onClick={() => {
              setLineStart(null);
              onLineCancel();
            }}
          >
            {t('cancel')}
          </button>
        </div>
      )}
    </div>
  );
});

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fmtEdge(v: number): string {
  if (!isFinite(v)) return '';
  return Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toFixed(2)).toString();
}

function drawGrid(ctx: CanvasRenderingContext2D, vp: Viewport, w: number, h: number): void {
  const sp = niceGridSpacing(vp.scale);
  const [x0, y1] = toModel(vp, 0, 0);
  const [x1, y0] = toModel(vp, w, h);
  ctx.strokeStyle = 'rgba(128,128,128,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(x0 / sp) * sp; x <= x1; x += sp) {
    const [sx] = toScreen(vp, x, 0);
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, h);
  }
  for (let y = Math.floor(y0 / sp) * sp; y <= y1; y += sp) {
    const [, sy] = toScreen(vp, 0, y);
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(w, Math.round(sy) + 0.5);
  }
  ctx.stroke();
}

function drawField(ctx: CanvasRenderingContext2D, vp: Viewport, result: RunResult, bandPaths: Path2D[], colors: string[], showMesh: boolean, dpr: number): void {
  const { nodes, triangles } = result.mesh;
  // Model → screen: x' = ox + x·s, y' = oy − y·s (y up in the model, down on the canvas).
  ctx.save();
  ctx.setTransform(dpr * vp.scale, 0, 0, -dpr * vp.scale, dpr * vp.ox, dpr * vp.oy);
  for (let i = 0; i < bandPaths.length; i++) {
    ctx.fillStyle = colors[i];
    ctx.fill(bandPaths[i]);
    // Hairline stroke in the same colour hides anti-aliasing seams between pieces.
    ctx.strokeStyle = colors[i];
    ctx.lineWidth = 0.6 / vp.scale;
    ctx.stroke(bandPaths[i]);
  }
  if (showMesh) {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 0.5 / vp.scale;
    const p = new Path2D();
    const m = triangles.length / 3;
    for (let e = 0; e < m; e++) {
      const a = triangles[3 * e];
      const b = triangles[3 * e + 1];
      const c = triangles[3 * e + 2];
      p.moveTo(nodes[2 * a], nodes[2 * a + 1]);
      p.lineTo(nodes[2 * b], nodes[2 * b + 1]);
      p.lineTo(nodes[2 * c], nodes[2 * c + 1]);
      p.closePath();
    }
    ctx.stroke(p);
  }
  ctx.restore();
}

function drawOutlines(ctx: CanvasRenderingContext2D, vp: Viewport, project: Project): void {
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.2;
  for (const r of project.regions) {
    for (const ring of [r.polygon.outer, ...r.polygon.holes]) {
      if (ring.length < 2) continue;
      ctx.beginPath();
      ring.forEach((p, i) => {
        const [sx, sy] = toScreen(vp, p[0], p[1]);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.font = '11px Segoe UI, Arial, sans-serif';
  for (const b of project.rebars) {
    const [sx, sy] = toScreen(vp, b.centre[0], b.centre[1]);
    const r = (b.diameter / 2) * vp.scale;
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(r, 2), 0, Math.PI * 2);
    ctx.stroke();
    if (r > 6) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name, sx, sy);
    }
  }
}

function drawIso(ctx: CanvasRenderingContext2D, vp: Viewport, theta: number, segs: [Vec2, Vec2][], highlight: boolean): void {
  if (!segs.length) return;
  ctx.strokeStyle = highlight ? '#111' : 'rgba(0,0,0,0.45)';
  ctx.lineWidth = highlight ? 2 : 0.8;
  ctx.beginPath();
  for (const [a, b] of segs) {
    const [ax, ay] = toScreen(vp, a[0], a[1]);
    const [bx, by] = toScreen(vp, b[0], b[1]);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  // Label the longest segment.
  let best = 0;
  let bl = -1;
  for (let i = 0; i < segs.length; i++) {
    const l = Math.hypot(segs[i][1][0] - segs[i][0][0], segs[i][1][1] - segs[i][0][1]);
    if (l > bl) {
      bl = l;
      best = i;
    }
  }
  const [a, b] = segs[best];
  const [mx, my] = toScreen(vp, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  ctx.font = `${highlight ? 'bold ' : ''}10px Segoe UI, Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  const label = `${theta}`;
  const w = ctx.measureText(label).width + 4;
  ctx.fillRect(mx - w / 2, my - 7, w, 13);
  ctx.fillStyle = '#111';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, mx, my);
}

function drawLine(ctx: CanvasRenderingContext2D, vp: Viewport, from: Vec2, to: Vec2, color: string, dashed = false): void {
  const [ax, ay] = toScreen(vp, from[0], from[1]);
  const [bx, by] = toScreen(vp, to[0], to[1]);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (dashed) ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
}

function drawProbes(ctx: CanvasRenderingContext2D, vp: Viewport, probes: ProbeMarker[], dragPos: { id: string; pos: Vec2 } | null): void {
  ctx.font = '11px Segoe UI, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  for (const p of probes) {
    const pos = dragPos && dragPos.id === p.id ? dragPos.pos : [p.x, p.y];
    const [sx, sy] = toScreen(vp, pos[0], pos[1]);
    ctx.beginPath();
    ctx.arc(sx, sy, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.isRebar ? '#dc2626' : '#2563eb';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const label = `${p.name}${p.value === null ? '' : ` ${p.value.toFixed(0)}°`}`;
    const w = ctx.measureText(label).width + 6;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(sx + 6, sy - 8, w, 15);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'left';
    ctx.fillText(label, sx + 9, sy);
  }
}
