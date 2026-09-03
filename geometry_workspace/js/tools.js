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
  rotatePoints,
  mirrorPointsAboutLine,
} from './geometry.js';
import { applyOrtho, snapColor as engineSnapColor } from './snapping.js';
import { addInterface, INTERFACE_COLOR } from './interfaces.js';

const TOOL_HINTS = {
  select: 'Velg: klikk for å markere, dra for å flytte. Dra et hjørnepunkt for å redigere. Alt+klikk på punkt sletter det, dobbeltklikk på en kant setter inn nytt.',
  rect: 'Rektangel: klikk første hjørne, deretter motstående hjørne. Esc avbryter.',
  shell: 'Skallelement: klikk start og slutt på senterlinja. Tykkelsen tas fra menyen.',
  polygon: 'Polygon: klikk hjørner. Enter eller dobbeltklikk avslutter, Esc avbryter.',
  circle: 'Sirkel: klikk sentrum, deretter et punkt på omkretsen.',
  reference: 'Referansepunkt: klikk der nullpunktet skal ligge.',
  calibrate: 'Kalibrer: klikk to punkt i bildet du vet avstanden mellom, og skriv inn den virkelige lengden.',
  move: 'Flytt: klikk basispunkt, deretter sluttpunkt. Virker på utvalget. Esc avbryter.',
  copy: 'Kopi: klikk basispunkt, deretter der kopien skal ligge. Verktøyet blir stående, så du kan sette flere. Esc avslutter.',
  rotate: 'Roter: klikk rotasjonssenter, så et referansepunkt, og til slutt der det skal ende. Shift låser til 15°. Esc avbryter.',
  mirror: 'Speil: klikk to punkt som definerer speilaksen. Esc avbryter.',
  interface: 'Grensesnitt: klikk to punkt i skjøten mellom eksisterende og ny del. Verktøyet gjetter hvilken side som er den nye. Esc avbryter.',
};

/** Verktøyene som transformerer et eksisterende utvalg i stedet for å tegne. */
const TRANSFORM_TOOLS = new Set(['move', 'copy', 'rotate', 'mirror']);

/** Verbet som brukes når utvalget er tomt. */
const TRANSFORM_VERB = { move: 'flytte', copy: 'kopiere', rotate: 'rotere', mirror: 'speile' };

/** Trinnet Shift låser rotasjonsvinkelen til. */
const ANGLE_STEP_DEG = 15;

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
    /**
     * Innstillinger for transformasjonsverktøyene, satt fra menyene i ui.js.
     * `copies` er antall kopier i en rekke-kopi, `keepOriginal` gjelder
     * speiling, og `rotateCenter` sier hvor roteringen skal skje om når man
     * kjører den fra menyen i stedet for å klikke senteret.
     */
    this.options = { copies: 1, keepOriginal: true, rotateCenter: 'pick' };
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
    // Er en transformasjon halvveis, settes geometrien tilbake dit den sto
    // da kommandoen startet — Esc skal ikke legge igjen spor.
    if (this.draft && this.draft.origin) this.store.rollback('cancel');
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
    // Under rotasjon er det vinkelen som styrer, ikke aksene — orto ville
    // bare låst markøren til et kryss om senteret.
    if (this.draft.stage === 'angle') return null;
    return this.draft.base || this.draft.start || null;
  }

  /**
   * Formene som er i bevegelse under en transformasjon skal ikke snappe mot
   * seg selv — samme regel som drag følger. Ved kopiering, og ved speiling
   * der originalen beholdes, står originalen stille, og da vil man tvert imot
   * gjerne kunne snappe mot den.
   */
  transformExclude() {
    if (!this.draft || !this.draft.origin) return null;
    if (this.tool === 'copy') return null;
    if (this.tool === 'mirror' && this.options.keepOriginal) return null;
    return new Set(this.draft.origin.map((o) => o.id));
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
    const snapped = this.snap(e.world, {
      exclude: this.transformExclude(),
      from: this.orthoOrigin(),
      shift: e.shift,
    });
    const p = snapped.point;

    if (TRANSFORM_TOOLS.has(this.tool)) {
      this._transformPointerDown(p, e);
      return;
    }

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

      case 'interface':
        // To klikk, som rektangelet — men resultatet er en linje i lista over
        // grensesnitt, ikke en form i geometrien.
        if (!this.draft) {
          this.draft = { start: p };
          this.onStatus('Grensesnitt: klikk det andre punktet. Snapping og orto virker som ellers.');
        } else {
          this._finishInterface(this.draft.start, p);
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
    let exclude = this.transformExclude();
    if (this.drag && this.drag.kind === 'vertex') {
      exclude = new Set([this.drag.shapeId]);
    } else if (this.drag && this.drag.kind === 'move') {
      exclude = new Set(this.drag.origin.map((o) => o.id));
    }
    const from = this.drag && this.drag.kind === 'move' ? this.drag.start : this.orthoOrigin();
    const snapped = this.snap(e.world, { exclude, from, shift: e.shift });
    const p = snapped.point;
    this.onCursor?.(p, snapped.type);

    // Transformasjonsverktøyene har ingen drag — de styres av klikkene, og
    // følger markøren mellom dem.
    if (TRANSFORM_TOOLS.has(this.tool)) {
      if (this.draft) this._transformPreview(p, e);
      else this.viewport.setPreview({ points: [], cursor: p, cursorColor: snapColor(snapped.type) });
      return;
    }

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
      } else if (this.tool === 'interface') {
        this.viewport.setPreview({ points: [this.draft.start, p], color: INTERFACE_COLOR, cursor: p });
        const d = Math.hypot(p[0] - this.draft.start[0], p[1] - this.draft.start[1]);
        this.onStatus(`Grensesnitt: heftbredde ${fmt(d)} (linjas lengde). Klikk for å fullføre.`);
      }
    } else {
      this.viewport.setPreview({ points: [], cursor: p, cursorColor: snapColor(snapped.type) });
      if (this.tool === 'select') {
        const hit = this.hitShape(e.world);
        this.viewport.setHover(hit ? hit.id : null);
      }
    }
  }

  /* ---------------- flytt / kopi / roter / speil ---------------- */

  /**
   * Utvalget slik det står nå. Punktene tas vare på, slik at
   * forhåndsvisningen alltid regnes fra utgangspunktet og ikke akkumulerer,
   * og slik at Esc kan sette alt tilbake.
   */
  _captureSelection() {
    const shapes = this.store.selectedShapes();
    if (!shapes.length) return null;
    return shapes.map((s) => ({ id: s.id, points: s.points.map((q) => [q[0], q[1]]) }));
  }

  /** Ider til formene kommandoen virker på. */
  _transformIds() {
    return this.draft && this.draft.origin ? this.draft.origin.map((o) => o.id) : [];
  }

  /**
   * Klikkene i flytt/kopi/roter/speil. Alle fire følger samme mønster:
   * først et punkt som definerer utgangspunktet, så ett som definerer
   * resultatet — rotasjonen har ett klikk ekstra, siden både senteret og
   * startvinkelen må pekes ut.
   */
  _transformPointerDown(p, e) {
    const tool = this.tool;

    if (!this.draft) {
      const origin = this._captureSelection();
      if (!origin) {
        this.onStatus(`Ingen form er markert — marker det du vil ${TRANSFORM_VERB[tool]} først.`);
        return;
      }
      // Avslutt et hengende transient steg (typisk modellnavnet som skrives),
      // slik at Esc bare ruller tilbake vår egen kommando.
      this.store.commit('edit');

      if (tool === 'rotate') {
        this.draft = { stage: 'reference', origin, center: p };
        this.onStatus('Roter: klikk et referansepunkt som gir startvinkelen.');
      } else {
        this.draft = { stage: 'target', origin, base: p };
        this.onStatus(
          tool === 'mirror'
            ? 'Speil: klikk det andre punktet på speilaksen.'
            : `${tool === 'copy' ? 'Kopi' : 'Flytt'}: klikk sluttpunktet.`
        );
      }
      return;
    }

    if (tool === 'rotate' && this.draft.stage === 'reference') {
      const c = this.draft.center;
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) < 1e-9) {
        this.onStatus('Referansepunktet kan ikke ligge i senteret — klikk et punkt utenfor.');
        return;
      }
      this.draft.stage = 'angle';
      this.draft.base = p;
      this.draft.startAngle = Math.atan2(p[1] - c[1], p[0] - c[0]);
      this.onStatus('Roter: beveg markøren og klikk der det skal ende. Shift låser til 15°.');
      return;
    }

    this._finishTransform(p, e);
  }

  /** Vinkelen rotasjonen står i akkurat nå, i radianer. */
  _rotationAngle(p, shift) {
    const d = this.draft;
    const now = Math.atan2(p[1] - d.center[1], p[0] - d.center[0]);
    let ang = now - d.startAngle;
    if (shift) {
      const step = (ANGLE_STEP_DEG * Math.PI) / 180;
      ang = Math.round(ang / step) * step;
    }
    return ang;
  }

  /** Punktene utvalget skal ha for gjeldende markørposisjon. */
  _transformedPoints(p, shift) {
    const d = this.draft;
    if (this.tool === 'rotate') {
      const ang = this._rotationAngle(p, shift);
      return d.origin.map((o) => ({ id: o.id, points: rotatePoints(o.points, ang, d.center) }));
    }
    if (this.tool === 'mirror') {
      return d.origin.map((o) => ({ id: o.id, points: mirrorPointsAboutLine(o.points, d.base, p) }));
    }
    const dx = p[0] - d.base[0];
    const dy = p[1] - d.base[1];
    return d.origin.map((o) => ({ id: o.id, points: translatePoints(o.points, dx, dy) }));
  }

  /**
   * Forhåndsvisningen. Flytt og rotasjon endrer geometrien transient, slik
   * at tyngdepunktet oppdaterer seg mens man drar, og originalplasseringen
   * tegnes som spøkelseskontur. Kopi og speiling lar geometrien stå og viser
   * resultatet som spøkelse i stedet.
   */
  _transformPreview(p, e) {
    const d = this.draft;
    const tool = this.tool;

    if (d.stage === 'reference') {
      this.viewport.setPreview({
        points: [],
        cursor: p,
        cursorColor: '#f97316',
        cross: d.center,
        line: [d.center, p],
      });
      this.onStatus('Roter: klikk et referansepunkt som gir startvinkelen.');
      return;
    }

    const next = this._transformedPoints(p, e.shift);

    if (tool === 'move' || tool === 'rotate') {
      this.store.setManyPoints(next, { transient: true, reason: 'transform' });
      this.viewport.setPreview({
        points: [],
        cursor: p,
        cursorColor: '#f97316',
        ghosts: d.origin.map((o) => o.points),
        cross: tool === 'rotate' ? d.center : null,
        line: [tool === 'rotate' ? d.center : d.base, p],
      });
    } else {
      this.viewport.setPreview({
        points: [],
        cursor: p,
        cursorColor: '#f97316',
        ghosts: next.map((o) => o.points),
        line: [d.base, p],
      });
    }

    if (tool === 'rotate') {
      const deg = (this._rotationAngle(p, e.shift) * 180) / Math.PI;
      this.onStatus(`Roterer: ${deg.toFixed(2)}°${e.shift ? ' (låst til 15°)' : ''}`);
    } else if (tool === 'mirror') {
      const ang = (Math.atan2(p[1] - d.base[1], p[0] - d.base[0]) * 180) / Math.PI;
      this.onStatus(
        `Speilakse: ${ang.toFixed(2)}°${this.options.keepOriginal ? ' — originalen beholdes' : ''}`
      );
    } else {
      const dx = p[0] - d.base[0];
      const dy = p[1] - d.base[1];
      const label = tool === 'copy' ? 'Kopi' : 'Flytter';
      this.onStatus(`${label}: Δx = ${fmt(dx)}, Δy = ${fmt(dy)}, lengde ${fmt(Math.hypot(dx, dy))}`);
    }
  }

  /** Siste klikk: gjør transformasjonen om til ett undo-steg. */
  _finishTransform(p, e) {
    const d = this.draft;
    const ids = this._transformIds();
    const tool = this.tool;

    if (tool === 'copy') {
      const dx = p[0] - d.base[0];
      const dy = p[1] - d.base[1];
      if (Math.hypot(dx, dy) < 1e-9) {
        this.onStatus('Kopien ville havnet oppå originalen — klikk et annet punkt.');
        return;
      }
      // Rekke-kopi: n kopier med jevn avstand langs den samme vektoren
      const n = Math.max(1, Math.round(this.options.copies || 1));
      const offsets = [];
      for (let i = 1; i <= n; i++) offsets.push([dx * i, dy * i]);
      // Originalen blir stående markert, så neste klikk kopierer den samme
      this.store.copyShapes(ids, offsets, { select: false, reason: 'copy' });
      this.viewport.setPreview(null);
      this.onStatus(
        `${n === 1 ? 'Kopi satt' : `${n} kopier satt`}. Klikk for én til, eller Esc for å avslutte.`
      );
      return;
    }

    const next = this._transformedPoints(p, e.shift);

    if (tool === 'mirror' && this.options.keepOriginal) {
      const byId = new Map(next.map((o) => [o.id, o.points]));
      this.store.copyShapes(ids, [(pts, s) => byId.get(s.id) || pts], { reason: 'mirror' });
    } else if (tool === 'mirror') {
      this.store.setManyPoints(next, { reason: 'mirror' });
    } else {
      // Flytt og roter ligger allerede transient på plass; siste posisjon
      // settes på nytt fordi klikkpunktet kan avvike litt fra siste bevegelse
      this.store.setManyPoints(next, { transient: true, reason: 'transform' });
      this.store.commit(tool);
    }

    this.draft = null;
    this.viewport.setPreview(null);
    this.onStatus(TOOL_HINTS[tool]);
  }

  /* ---------------- transformasjon fra menyene ---------------- */

  /**
   * Flytter utvalget et gitt stykke. Brukes av tallfeltene i menyen og av
   * transformasjonspanelet i venstre panel.
   */
  moveSelection(dx, dy) {
    const ids = this.store.state.selection;
    if (!ids.length) return { ok: false, msg: 'Ingen form er markert.' };
    if (!dx && !dy) return { ok: false, msg: 'Δx og Δy er begge null.' };
    this.store.moveShapes(ids, dx, dy, { reason: 'move' });
    return { ok: true, msg: `Flyttet ${ids.length} form(er): Δx = ${fmt(dx)}, Δy = ${fmt(dy)}.` };
  }

  /** Roterer utvalget om et punkt. Vinkelen er i grader. */
  rotateSelection(deg, center) {
    const ids = this.store.state.selection;
    if (!ids.length) return { ok: false, msg: 'Ingen form er markert.' };
    if (!deg) return { ok: false, msg: 'Vinkelen er null.' };
    const ang = (deg * Math.PI) / 180;
    const entries = this.store
      .selectedShapes()
      .map((s) => ({ id: s.id, points: rotatePoints(s.points, ang, center) }));
    this.store.setManyPoints(entries, { transient: true, reason: 'rotate' });
    this.store.commit('rotate');
    return { ok: true, msg: `Rotert ${ids.length} form(er) ${fmt(deg)}° om (${fmt(center[0])}, ${fmt(center[1])}).` };
  }

  /** Speiler utvalget om linja gjennom a og b. */
  mirrorSelection(a, b, { keepOriginal = false } = {}) {
    const ids = this.store.state.selection;
    if (!ids.length) return { ok: false, msg: 'Ingen form er markert.' };
    const entries = this.store
      .selectedShapes()
      .map((s) => ({ id: s.id, points: mirrorPointsAboutLine(s.points, a, b) }));
    if (keepOriginal) {
      const byId = new Map(entries.map((o) => [o.id, o.points]));
      this.store.copyShapes(ids, [(pts, s) => byId.get(s.id) || pts], { reason: 'mirror' });
    } else {
      this.store.setManyPoints(entries, { reason: 'mirror' });
    }
    return { ok: true, msg: `Speilet ${ids.length} form(er).` };
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

  /**
   * Fullfører grensesnittet. Gruppesiden gjettes i `addInterface` — formene
   * hvis tyngdepunkt ligger til venstre for a→b, og av dem bare de som er
   * merket «ny» dersom det gir et ikke-tomt sett. Statuslinja sier fra hva
   * gjettet ble, slik at en feil oppdages med en gang og ikke først når
   * tallene ser rare ut.
   */
  _finishInterface(a, b) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) {
      this.onStatus('Grensesnittlinja har null lengde — avbrutt.');
      return;
    }
    const f = addInterface(this.store, a, b);
    const names = this.store.state.shapes
      .filter((s) => f.groupIds.includes(s.id))
      .map((s) => s.name)
      .join(', ');
    this.onStatus(
      names
        ? `${f.name} lagt inn. Gruppesiden ble gjettet til: ${names}. Pilene i lerretet peker den veien — snu den i «Forsterkning» om det ble feil.`
        : `${f.name} lagt inn, men ingen former havnet på gruppesiden. Bruk «Snu siden» i «Forsterkning».`
    );
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
