/**
 * tools.js — interaksjonsverktøy for lerretet.
 *
 * Kontrolleren tar imot pekerhendelser fra Viewport i verdenskoordinater,
 * og gjør CRUD mot Store. Den eier ingen DOM.
 */

import {
  rectFromCorners,
  shellPoints,
  circlePoints,
  openRing,
  pointInRing,
  translatePoints,
} from './geometry.js';
import { applyOrtho, snapColor as engineSnapColor } from './snapping.js';

const TOOL_HINTS = {
  select: 'Velg: klikk for å markere, dra for å flytte. Dra et hjørnepunkt for å redigere. Alt+klikk på punkt sletter det, dobbeltklikk på en kant setter inn nytt.',
  rect: 'Rektangel: klikk første hjørne, deretter motstående hjørne. Esc avbryter.',
  shell: 'Skallelement: klikk start og slutt på senterlinja. Tykkelsen tas fra menyen.',
  polygon: 'Polygon: klikk hjørner. Enter eller dobbeltklikk avslutter, Esc avbryter.',
  circle: 'Sirkel: klikk sentrum, deretter et punkt på omkretsen.',
  reference: 'Referansepunkt: klikk der nullpunktet skal ligge.',
  calibrate: 'Kalibrer: klikk to punkt i bildet du vet avstanden mellom, og skriv inn den virkelige lengden.',
};

export class ToolController {
  constructor(store, viewport, opts = {}) {
    this.store = store;
    this.viewport = viewport;
    this.getThickness = opts.getThickness || (() => 200);
    this.onStatus = opts.onStatus || (() => {});
    this.onToolChange = opts.onToolChange || (() => {});
    this.tool = 'select';
    this.draft = null;
    this.drag = null;
  }

  setTool(name) {
    if (!TOOL_HINTS[name]) return;
    this.cancel();
    this.tool = name;
    this.onToolChange(name);
    this.onStatus(TOOL_HINTS[name]);
  }

  hint() {
    return TOOL_HINTS[this.tool];
  }

  cancel() {
    this.draft = null;
    this.drag = null;
    this.viewport.setPreview(null);
    this.onStatus(TOOL_HINTS[this.tool]);
  }

  /* ---------------- hjelpere ---------------- */

  /**
   * Snapper et punkt. `from` er referansepunktet orto måles fra — settes når
   * man er midt i å tegne. Shift snur orto av og på midlertidig.
   */
  snap(world, { exclude = null, from = null, shift = false } = {}) {
    const st = this.store.state;
    const ortho = !!st.ortho !== !!shift;
    let target = world;
    if (ortho && from) target = applyOrtho(world, from);

    const hit = this.viewport.snap(target, {
      snaps: st.snaps,
      gridStep: st.grid.step,
      exclude,
    });

    // Orto skal ikke kunne brytes av et snap som ligger utenfor aksen
    if (ortho && from && hit.type !== 'free') {
      const onAxis = applyOrtho(hit.point, from);
      const drift = Math.hypot(onAxis[0] - hit.point[0], onAxis[1] - hit.point[1]);
      if (drift > 1e-9) return { point: target, type: 'ortho' };
    }
    if (ortho && from && hit.type === 'free') return { point: target, type: 'ortho' };
    return hit;
  }

  /** Punktet en pågående tegning måler orto fra. */
  orthoOrigin() {
    if (!this.draft) return null;
    if (this.draft.points) return this.draft.points[this.draft.points.length - 1];
    return this.draft.start || null;
  }

  /** Topp-prioriterte form under punktet. */
  hitShape(world) {
    for (const s of this.store.state.shapes) {
      if (s.include === false) continue;
      if (pointInRing(world, s.points)) return s;
    }
    return null;
  }

  /** Nærmeste hjørnepunkt i markerte former innenfor pikseltoleranse. */
  hitVertex(world, tolPx = 10) {
    const tol = tolPx * this.viewport.unitsPerPixel;
    let best = null;
    let bestD = tol;
    for (const s of this.store.selectedShapes()) {
      const ring = openRing(s.points);
      for (let i = 0; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - world[0], ring[i][1] - world[1]);
        if (d < bestD) {
          bestD = d;
          best = { shape: s, index: i };
        }
      }
    }
    return best;
  }

  /** Nærmeste kant i markerte former (for innsetting av punkt). */
  hitEdge(world, tolPx = 8) {
    const tol = tolPx * this.viewport.unitsPerPixel;
    let best = null;
    let bestD = tol;
    for (const s of this.store.selectedShapes()) {
      const ring = openRing(s.points);
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const vx = b[0] - a[0];
        const vy = b[1] - a[1];
        const len2 = vx * vx + vy * vy;
        if (len2 < 1e-12) continue;
        let t = ((world[0] - a[0]) * vx + (world[1] - a[1]) * vy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a[0] + vx * t;
        const py = a[1] + vy * t;
        const d = Math.hypot(px - world[0], py - world[1]);
        if (d < bestD) {
          bestD = d;
          best = { shape: s, index: i, point: [px, py] };
        }
      }
    }
    return best;
  }

  /* ---------------- hendelser ---------------- */

  pointerdown(e) {
    const snapped = this.snap(e.world, { from: this.orthoOrigin(), shift: e.shift });
    const p = snapped.point;

    switch (this.tool) {
      case 'reference':
        this.store.setReference(p);
        this.setTool('select');
        return;

      case 'calibrate':
        if (!this.draft) {
          this.draft = { start: p };
          this.onStatus('Kalibrer: klikk det andre punktet.');
        } else {
          const a = this.draft.start;
          this.draft = null;
          this.viewport.setPreview(null);
          const measured = Math.hypot(p[0] - a[0], p[1] - a[1]);
          if (measured < 1e-9) {
            this.onStatus('De to punktene er like — prøv igjen.');
            return;
          }
          this.onCalibrated?.({ a, b: p, measured });
        }
        return;

      case 'rect':
      case 'shell':
      case 'circle':
        if (!this.draft) {
          this.draft = { start: p };
        } else {
          this._finishTwoPoint(this.draft.start, p);
          this.draft = null;
          this.viewport.setPreview(null);
        }
        return;

      case 'polygon':
        if (!this.draft) {
          this.draft = { points: [p] };
        } else {
          const first = this.draft.points[0];
          const closeTol = 10 * this.viewport.unitsPerPixel;
          if (this.draft.points.length >= 3 && Math.hypot(p[0] - first[0], p[1] - first[1]) < closeTol) {
            this._finishPolygon();
          } else {
            this.draft.points.push(p);
          }
        }
        this.onStatus(`Polygon: ${this.draft ? this.draft.points.length : 0} punkt. Enter eller dobbeltklikk avslutter.`);
        return;

      default:
        this._selectPointerDown(e, snapped);
    }
  }

  _selectPointerDown(e, snapped) {
    const vertex = this.hitVertex(e.world);
    if (vertex) {
      if (e.alt) {
        const ring = openRing(vertex.shape.points);
        if (ring.length > 3) {
          ring.splice(vertex.index, 1);
          this.store.setPoints(vertex.shape.id, ring, { reason: 'vertex-delete' });
        } else {
          this.onStatus('Kan ikke slette punkt: et polygon må ha minst tre hjørner.');
        }
        return;
      }
      this.drag = {
        kind: 'vertex',
        shapeId: vertex.shape.id,
        index: vertex.index,
        origin: openRing(vertex.shape.points).map((q) => [q[0], q[1]]),
      };
      return;
    }

    const hit = this.hitShape(e.world);
    if (!hit) {
      // Er bildeunderlaget låst opp, tar et klikk i bildet tak i bildet
      const u = this.store.state.underlay;
      if (u && u.visible && !u.locked && this._inUnderlay(e.world, u)) {
        this.store.select([]);
        this.drag = { kind: 'underlay', start: e.world, origin: { x: u.x, y: u.y } };
        this.onStatus('Flytter bildet. Lås det når det ligger riktig.');
        return;
      }
      if (!e.shift) this.store.select([]);
      this.drag = { kind: 'marquee', start: e.world, current: e.world };
      return;
    }

    if (e.shift) {
      this.store.toggleSelect(hit.id);
    } else if (!this.store.state.selection.includes(hit.id)) {
      this.store.select([hit.id]);
    }

    this.drag = {
      kind: 'move',
      start: snapped.point,
      raw: e.world,
      origin: this.store.selectedShapes().map((s) => ({ id: s.id, points: s.points.map((q) => [q[0], q[1]]) })),
    };
  }

  pointermove(e) {
    // Geometri som er i bevegelse skal ikke snappe mot seg selv. Grepet
    // (pointerdown) snapper mot alt, slik at man kan ta tak i et eksakt
    // hjørne; selve slippunktet snapper bare mot det som står stille.
    let exclude = null;
    if (this.drag && this.drag.kind === 'vertex') {
      exclude = new Set([this.drag.shapeId]);
    } else if (this.drag && this.drag.kind === 'move') {
      exclude = new Set(this.drag.origin.map((o) => o.id));
    }
    const from = this.drag && this.drag.kind === 'move' ? this.drag.start : this.orthoOrigin();
    const snapped = this.snap(e.world, { exclude, from, shift: e.shift });
    const p = snapped.point;
    this.onCursor?.(p, snapped.type);

    if (this.drag) {
      if (this.drag.kind === 'underlay') {
        const u = this.store.state.underlay;
        this.store.setUnderlay(
          {
            x: this.drag.origin.x + (e.world[0] - this.drag.start[0]),
            y: this.drag.origin.y + (e.world[1] - this.drag.start[1]),
          },
          { transient: true }
        );
        this.onStatus(`Bilde: x = ${fmt(u.x)}, y = ${fmt(u.y)}`);
      } else if (this.drag.kind === 'move') {
        const dx = p[0] - this.drag.start[0];
        const dy = p[1] - this.drag.start[1];
        for (const o of this.drag.origin) {
          this.store.setPoints(o.id, translatePoints(o.points, dx, dy), { transient: true, reason: 'drag' });
        }
        this.onStatus(`Flytter: Δx = ${fmt(dx)}, Δy = ${fmt(dy)}`);
      } else if (this.drag.kind === 'vertex') {
        const pts = this.drag.origin.map((q) => [q[0], q[1]]);
        pts[this.drag.index] = p;
        this.store.setPoints(this.drag.shapeId, pts, { transient: true, reason: 'drag' });
        this.onStatus(`Hjørne: x = ${fmt(p[0])}, y = ${fmt(p[1])}`);
      } else if (this.drag.kind === 'marquee') {
        this.drag.current = e.world;
        const [a, b] = [this.drag.start, this.drag.current];
        this.viewport.setPreview({ points: rectFromCorners(a, b), closed: true, color: '#94a3b8' });
      }
      return;
    }

    // Forhåndsvisning under tegning
    if (this.draft) {
      if (this.tool === 'rect') {
        this.viewport.setPreview({ points: rectFromCorners(this.draft.start, p), closed: true, cursor: p });
      } else if (this.tool === 'shell') {
        const pts = shellPoints(this.draft.start, p, Math.abs(this.getThickness()) || 1);
        this.viewport.setPreview(pts ? { points: pts, closed: true, cursor: p } : { points: [this.draft.start, p], cursor: p });
      } else if (this.tool === 'circle') {
        const r = Math.hypot(p[0] - this.draft.start[0], p[1] - this.draft.start[1]);
        this.viewport.setPreview({ points: circlePoints(this.draft.start[0], this.draft.start[1], r), closed: true, cursor: p });
      } else if (this.tool === 'polygon') {
        this.viewport.setPreview({ points: [...this.draft.points, p], closed: this.draft.points.length >= 2, cursor: p });
      } else if (this.tool === 'calibrate') {
        this.viewport.setPreview({ points: [this.draft.start, p], color: '#f59e0b', cursor: p });
        this.onStatus(`Kalibrer: målt lengde ${fmt(Math.hypot(p[0] - this.draft.start[0], p[1] - this.draft.start[1]))}`);
      }
    } else {
      this.viewport.setPreview({ points: [], cursor: p, cursorColor: snapColor(snapped.type) });
      if (this.tool === 'select') {
        const hit = this.hitShape(e.world);
        this.viewport.setHover(hit ? hit.id : null);
      }
    }
  }

  /** Ligger punktet innenfor bildeunderlaget? */
  _inUnderlay(world, u) {
    const c = Math.cos(-(u.rotation || 0));
    const s = Math.sin(-(u.rotation || 0));
    const dx = world[0] - u.x;
    const dy = world[1] - u.y;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    return Math.abs(lx) <= u.width / 2 && Math.abs(ly) <= u.height / 2;
  }

  pointerup(e) {
    if (!this.drag) return;
    if (this.drag.kind === 'marquee') {
      const [a, b] = [this.drag.start, this.drag.current];
      const minX = Math.min(a[0], b[0]);
      const maxX = Math.max(a[0], b[0]);
      const minY = Math.min(a[1], b[1]);
      const maxY = Math.max(a[1], b[1]);
      const inside = this.store.state.shapes.filter((s) =>
        s.points.every(([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY)
      );
      if (Math.abs(maxX - minX) > 1e-9 || Math.abs(maxY - minY) > 1e-9) {
        this.store.select(inside.map((s) => s.id), e.shift);
      }
      this.viewport.setPreview(null);
    } else {
      this.store.commit(this.drag.kind === 'underlay' ? 'underlay' : 'drag');
    }
    this.drag = null;
    this.onStatus(TOOL_HINTS[this.tool]);
  }

  dblclick(e) {
    if (this.tool === 'polygon' && this.draft) {
      this._finishPolygon();
      return;
    }
    if (this.tool === 'select') {
      const edge = this.hitEdge(e.world);
      if (edge) {
        const ring = openRing(edge.shape.points);
        ring.splice(edge.index + 1, 0, this.snap(e.world, { exclude: new Set([edge.shape.id]) }).point);
        this.store.setPoints(edge.shape.id, ring, { reason: 'vertex-insert' });
      }
    }
  }

  keydown(e) {
    if (e.key === 'Escape') {
      this.cancel();
      return true;
    }
    if (e.key === 'Enter' && this.tool === 'polygon' && this.draft) {
      this._finishPolygon();
      return true;
    }
    return false;
  }

  /* ---------------- ferdigstilling ---------------- */

  _finishTwoPoint(a, b) {
    if (this.tool === 'rect') {
      if (Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9) {
        this.onStatus('Rektangelet har null utstrekning — avbrutt.');
        return;
      }
      this.store.addShape(rectFromCorners(a, b), { name: 'Rektangel' });
    } else if (this.tool === 'shell') {
      const t = Math.abs(this.getThickness());
      const pts = shellPoints(a, b, t);
      if (!pts) {
        this.onStatus('Senterlinja har null lengde — avbrutt.');
        return;
      }
      this.store.addShape(pts, {
        name: 'Skall',
        meta: { kind: 'shell', p1: a, p2: b, t },
      });
    } else if (this.tool === 'circle') {
      const r = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (r < 1e-9) return;
      this.store.addShape(circlePoints(a[0], a[1], r), { name: 'Sirkel', meta: { kind: 'circle', c: a, r } });
    }
    this.onStatus(TOOL_HINTS[this.tool]);
  }

  _finishPolygon() {
    const pts = this.draft ? this.draft.points : [];
    this.draft = null;
    this.viewport.setPreview(null);
    if (pts.length < 3) {
      this.onStatus('Polygonet trenger minst tre punkt — avbrutt.');
      return;
    }
    this.store.addShape(pts, { name: 'Polygon' });
    this.onStatus(TOOL_HINTS[this.tool]);
  }
}

function fmt(v) {
  return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1);
}

function snapColor(type) {
  if (type === 'ortho') return '#f97316';
  return engineSnapColor(type);
}
