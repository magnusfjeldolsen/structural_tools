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

const TOOL_HINTS = {
  select: 'Velg: klikk for å markere, dra for å flytte. Dra et hjørnepunkt for å redigere. Alt+klikk på punkt sletter det, dobbeltklikk på en kant setter inn nytt.',
  rect: 'Rektangel: klikk første hjørne, deretter motstående hjørne. Esc avbryter.',
  shell: 'Skallelement: klikk start og slutt på senterlinja. Tykkelsen tas fra feltet til venstre.',
  polygon: 'Polygon: klikk hjørner. Enter eller dobbeltklikk avslutter, Esc avbryter.',
  circle: 'Sirkel: klikk sentrum, deretter et punkt på omkretsen.',
  reference: 'Referansepunkt: klikk der nullpunktet skal ligge.',
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

  snap(world, exclude = null) {
    return this.viewport.snap(world, {
      grid: this.store.state.grid,
      snapVertices: true,
      exclude,
    });
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
    const snapped = this.snap(e.world);
    const p = snapped.point;

    switch (this.tool) {
      case 'reference':
        this.store.setReference(p);
        this.setTool('select');
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
    const snapped = this.snap(e.world, exclude);
    const p = snapped.point;
    this.onCursor?.(p, snapped.type);

    if (this.drag) {
      if (this.drag.kind === 'move') {
        let dx = p[0] - this.drag.start[0];
        let dy = p[1] - this.drag.start[1];
        if (e.shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
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
      }
    } else {
      this.viewport.setPreview({ points: [], cursor: p, cursorColor: snapColor(snapped.type) });
      if (this.tool === 'select') {
        const hit = this.hitShape(e.world);
        this.viewport.setHover(hit ? hit.id : null);
      }
    }
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
      this.store.commit('drag');
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
        ring.splice(edge.index + 1, 0, this.snap(e.world, new Set([edge.shape.id])).point);
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
  if (type === 'vertex') return '#22c55e';
  if (type === 'midpoint') return '#eab308';
  if (type === 'grid') return '#38bdf8';
  return '#f8fafc';
}
