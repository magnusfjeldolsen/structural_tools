/**
 * viewport.js — three.js-basert 2D-visning i XY-planet.
 *
 * Kameraet er ortografisk og ser rett ned på XY-planet (z mot betrakteren),
 * så all interaksjonsmatematikk kan gjøres direkte i verdenskoordinater —
 * ingen raycasting nødvendig.
 *
 * Linjer tegnes som triangelbånd med konstant bredde i piksler, fordi
 * WebGL sin `linewidth` ignoreres på de fleste plattformer.
 */

import * as THREE from 'three';
import { openRing, centroidOfPoints } from './geometry.js';
import { findSnap } from './snapping.js';
import { buildGraph, jointGroup } from './joints.js';
import { JOINT_COLOR } from './store.js';

/** Fargestikket former merket «ny» får i lerretet (kontur under den stiplede). Ren tegneparameter — hører ikke til datamodellen, derfor ikke i store.js. */
const NEW_STAGE_COLOR = '#34d399';

const Z = {
  underlay: -0.5,
  grid: 0,
  axis: 0.05,
  fill: 0.1,
  outline: 0.2,
  net: 0.3,
  joint: 0.35,
  preview: 0.4,
  marker: 0.5,
  handle: 0.6,
};

/* ------------------------------------------------------------------ *
 * Tykke linjer
 * ------------------------------------------------------------------ */

/** Bygger triangler for en polylinje med halvbredde `hw` i verdensenheter. */
function thickPolylinePositions(points, closed, hw, z) {
  const pos = [];
  const pts = points;
  const n = pts.length;
  if (n < 2) return pos;
  const last = closed ? n : n - 1;

  const quad = (ax, ay, bx, by, cx, cy, dx, dy) => {
    pos.push(ax, ay, z, bx, by, z, cx, cy, z);
    pos.push(ax, ay, z, cx, cy, z, dx, dy, z);
  };

  for (let i = 0; i < last; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-12) continue;
    const nx = (-dy / len) * hw;
    const ny = (dx / len) * hw;
    quad(x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny);
  }

  // Firkantede skjøter i hvert knekkpunkt, slik at hjørner ikke får hakk
  const jointStart = closed ? 0 : 1;
  const jointEnd = closed ? n : n - 1;
  for (let i = jointStart; i < jointEnd; i++) {
    const [x, y] = pts[i];
    quad(x - hw, y - hw, x + hw, y - hw, x + hw, y + hw, x - hw, y + hw);
  }
  return pos;
}

function buildLineMesh(positions, color, opacity = 1) {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geom, mat);
}

function buildFillMesh(points, color, opacity, z) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.z = z;
  return mesh;
}

/**
 * Stiplet variant av samme polylinje. Brukes til former merket «ny», slik at
 * de skiller seg fra det eksisterende tverrsnittet uten å miste sin egen farge.
 * Dashen måles i verdensenheter, og kallende kode ganger med `unitsPerPixel`,
 * så mønsteret holder seg like tett uansett zoom.
 */
function dashedPolylinePositions(points, closed, hw, z, dashLen, gapLen) {
  const pos = [];
  const n = points.length;
  if (n < 2 || dashLen <= 0) return pos;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const total = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (total < 1e-12) continue;
    const ux = (b[0] - a[0]) / total;
    const uy = (b[1] - a[1]) / total;
    for (let d = 0; d < total; d += dashLen + gapLen) {
      const e = Math.min(d + dashLen, total);
      pos.push(
        ...thickPolylinePositions(
          [[a[0] + ux * d, a[1] + uy * d], [a[0] + ux * e, a[1] + uy * e]],
          false,
          hw,
          z
        )
      );
    }
  }
  return pos;
}

/**
 * Tekst som en canvas-tekstur. three.js har ingen tekstgjengivelse innebygd,
 * og et helt fontbibliotek for å skrive «Grensesnitt 1» ville vært ute av
 * proporsjon. Teksturen bufres av Viewport, siden lerretet tegnes på nytt for
 * hver musebevegelse.
 */
function makeLabelTexture(text, color) {
  const font = '600 28px ui-sans-serif, system-ui, sans-serif';
  const pad = 8;
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  measure.font = font;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = 40;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2 + 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return { texture, w, h };
}

/** Enhetsnormalen som peker mot venstre side av linja a→b. Null lengde ⟹ [0, 0]. Lokal kopi — samme lille utledning som i joints.js/store.js, for tegning her. */
function leftNormal(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-12) return [0, 0];
  return [-dy / len, dx / len];
}

function disposeGroup(group) {
  for (let i = group.children.length - 1; i >= 0; i--) {
    const child = group.children[i];
    if (child.geometry) child.geometry.dispose();
    // Teksturer eies av Viewport (bildeunderlaget og etikettbufferet), ikke av
    // materialet — de skal derfor ikke frigis her.
    if (child.material) child.material.dispose();
    group.remove(child);
  }
}

/* ------------------------------------------------------------------ *
 * Viewport
 * ------------------------------------------------------------------ */

export class Viewport {
  constructor(container, handlers = {}) {
    this.container = container;
    this.handlers = handlers;

    this.center = new THREE.Vector2(0, 0);
    this.viewHeight = 4000; // verdensenheter synlig vertikalt
    this.width = 1;
    this.height = 1;

    this.data = {
      shapes: [],
      selection: [],
      analysis: null,
      reference: [0, 0],
      grid: null,
      underlay: null,
      joints: [],
    };
    this.underlayTexture = null;
    /** Buffer for tekstetiketter, nøkkel `farge|tekst`. */
    this._labelCache = new Map();
    this.preview = null;
    this.hover = null;
    /** Skjøten som er fremhevet (hover), fra lerretet ELLER fra skjøtelista i panelet (§6.2 — se `setHoverJoint`). */
    this.hoverJoint = null;
    this.showNet = true;
    this.showPrincipal = true;
    this.showOverlap = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f172a');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(0, 0, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.cursor = 'crosshair';

    this.groups = {};
    for (const key of ['underlay', 'grid', 'fill', 'outline', 'net', 'joint', 'marker', 'preview', 'handle']) {
      const g = new THREE.Group();
      this.scene.add(g);
      this.groups[key] = g;
    }

    this._resizeObserver = new ResizeObserver(() => this.resize());
    this._resizeObserver.observe(container);
    this.resize();
    this._bindInput();
    this._loop();
  }

  dispose() {
    this._resizeObserver.disconnect();
    cancelAnimationFrame(this._raf);
    Object.values(this.groups).forEach(disposeGroup);
    this._clearLabelCache();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  /* ---------------- kamera ---------------- */

  get aspect() {
    return this.width / Math.max(this.height, 1);
  }

  get viewWidth() {
    return this.viewHeight * this.aspect;
  }

  /** Verdensenheter per skjermpiksel. */
  get unitsPerPixel() {
    return this.viewHeight / Math.max(this.height, 1);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    this.width = Math.max(rect.width, 1);
    this.height = Math.max(rect.height, 1);
    // updateStyle må stå på: uten den får canvaset CSS-størrelse lik
    // bufferstørrelsen (width × devicePixelRatio), og på en skjerm med
    // DPI-skalering blir lerretet da for stort. Da flyter rutenettet ut over
    // panelene, og getBoundingClientRect gir feil museposisjon.
    this.renderer.setSize(this.width, this.height, true);
    this._syncCamera();
    this.refresh();
  }

  _syncCamera() {
    const hw = this.viewWidth / 2;
    const hh = this.viewHeight / 2;
    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = hh;
    this.camera.bottom = -hh;
    this.camera.position.x = this.center.x;
    this.camera.position.y = this.center.y;
    this.camera.updateProjectionMatrix();
  }

  screenToWorld(px, py) {
    const x = this.center.x + (px / this.width - 0.5) * this.viewWidth;
    const y = this.center.y - (py / this.height - 0.5) * this.viewHeight;
    return [x, y];
  }

  worldToScreen(x, y) {
    const px = ((x - this.center.x) / this.viewWidth + 0.5) * this.width;
    const py = (0.5 - (y - this.center.y) / this.viewHeight) * this.height;
    return [px, py];
  }

  zoomToFit(bounds, padding = 0.15) {
    if (!bounds) {
      this.center.set(0, 0);
      this.viewHeight = 4000;
    } else {
      const w = Math.max(bounds.maxX - bounds.minX, 1);
      const h = Math.max(bounds.maxY - bounds.minY, 1);
      this.center.set((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
      this.viewHeight = Math.max(h, w / this.aspect) * (1 + 2 * padding);
    }
    this._syncCamera();
    this.refresh();
  }

  zoomBy(factor, anchorPx) {
    const before = anchorPx ? this.screenToWorld(anchorPx[0], anchorPx[1]) : null;
    this.viewHeight = THREE.MathUtils.clamp(this.viewHeight * factor, 1e-3, 1e9);
    this._syncCamera();
    if (before) {
      const after = this.screenToWorld(anchorPx[0], anchorPx[1]);
      this.center.x += before[0] - after[0];
      this.center.y += before[1] - after[1];
      this._syncCamera();
    }
    this.refresh();
  }

  /* ---------------- input ---------------- */

  _bindInput() {
    const el = this.renderer.domElement;
    const pos = (e) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener('pointerdown', (e) => {
      const p = pos(e);
      try {
        el.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ingen fysisk peker (f.eks. syntetiske hendelser) */
      }
      // Midtre/høyre knapp, eller mellomrom, panorerer
      if (e.button === 1 || e.button === 2 || this._spaceDown) {
        this._panning = { start: p, center: this.center.clone() };
        el.style.cursor = 'grabbing';
        return;
      }
      this._emit('pointerdown', e, p);
    });

    el.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (this._panning) {
        const dx = (p[0] - this._panning.start[0]) * this.unitsPerPixel;
        const dy = (p[1] - this._panning.start[1]) * this.unitsPerPixel;
        this.center.set(this._panning.center.x - dx, this._panning.center.y + dy);
        this._syncCamera();
        this.refresh();
        return;
      }
      this._emit('pointermove', e, p);
    });

    const endPointer = (e) => {
      const p = pos(e);
      if (this._panning) {
        this._panning = null;
        el.style.cursor = 'crosshair';
        return;
      }
      this._emit('pointerup', e, p);
    };
    el.addEventListener('pointerup', endPointer);
    el.addEventListener('pointercancel', endPointer);
    el.addEventListener('dblclick', (e) => this._emit('dblclick', e, pos(e)));

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = Math.exp(e.deltaY * 0.0015);
        this.zoomBy(factor, pos(e));
        this._emit('pointermove', e, pos(e));
      },
      { passive: false }
    );

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this._spaceDown = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._spaceDown = false;
    });
  }

  _emit(type, event, px) {
    const fn = this.handlers[type];
    if (!fn) return;
    fn({
      type,
      world: this.screenToWorld(px[0], px[1]),
      px,
      button: event.button,
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
      alt: event.altKey,
      event,
    });
  }

  /* ---------------- snapping ---------------- */

  /**
   * Snapper et verdenspunkt. Selve logikken ligger i snapping.js; her legges
   * bare pikseltoleransen om til verdensenheter.
   */
  snap(world, { snaps = null, gridStep = 0, exclude = null, tolPx = 12 } = {}) {
    return findSnap(world, {
      shapes: this.data.shapes || [],
      snaps: snaps || {},
      gridStep,
      tol: tolPx * this.unitsPerPixel,
      exclude,
    });
  }

  /* ---------------- data inn ---------------- */

  setData(data) {
    Object.assign(this.data, data);
    this.refresh();
  }

  setPreview(preview) {
    this.preview = preview;
    this.refresh();
  }

  /** Bytter selve bildet i underlaget. Transformen kommer via setData. */
  setUnderlayImage(image) {
    if (this.underlayTexture) {
      this.underlayTexture.dispose();
      this.underlayTexture = null;
    }
    if (image) {
      const tex = new THREE.Texture(image);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      this.underlayTexture = tex;
      this.underlayAspect = image.naturalWidth / Math.max(image.naturalHeight, 1);
    }
    this.refresh();
  }

  setHover(id) {
    if (this.hover === id) return;
    this.hover = id;
    this.refresh();
  }

  /**
   * Fremhever én skjøt i lerretet — kalt fra tools.js når musa er over en
   * skjøtelinje, og ment å kunne kalles fra panelet (agent 2B) når musa er
   * over raden i skjøtelista, slik at fremhevingen virker begge veier (§6.2).
   */
  setHoverJoint(id) {
    if (this.hoverJoint === id) return;
    this.hoverJoint = id;
    this.refresh();
  }

  setOverlays({ showNet, showPrincipal, showOverlap }) {
    if (showNet !== undefined) this.showNet = showNet;
    if (showPrincipal !== undefined) this.showPrincipal = showPrincipal;
    if (showOverlap !== undefined) this.showOverlap = showOverlap;
    this.refresh();
  }

  refresh() {
    this._dirty = true;
  }

  /* ---------------- tegning ---------------- */

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop);
    if (this._dirty) {
      this._dirty = false;
      this._rebuild();
      this.renderer.render(this.scene, this.camera);
    }
  };

  _rebuild() {
    const upp = this.unitsPerPixel;
    this._drawUnderlay();
    this._drawGrid(upp);
    this._drawShapes(upp);
    this._drawNet(upp);
    this._drawJoints(upp);
    this._drawMarkers(upp);
    this._drawPreview(upp);
  }

  _drawUnderlay() {
    const g = this.groups.underlay;
    disposeGroup(g);
    const u = this.data.underlay;
    if (!u || !u.visible || !this.underlayTexture) return;

    const geom = new THREE.PlaneGeometry(u.width, u.height);
    const mat = new THREE.MeshBasicMaterial({
      map: this.underlayTexture,
      transparent: true,
      opacity: u.opacity != null ? u.opacity : 0.65,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(u.x, u.y, Z.underlay);
    mesh.rotation.z = u.rotation || 0;
    g.add(mesh);
  }

  _drawGrid(upp) {
    const g = this.groups.grid;
    disposeGroup(g);
    const grid = this.data.grid;
    const x0 = this.center.x - this.viewWidth / 2;
    const x1 = this.center.x + this.viewWidth / 2;
    const y0 = this.center.y - this.viewHeight / 2;
    const y1 = this.center.y + this.viewHeight / 2;

    if (grid && grid.visible && grid.step > 0) {
      // Hopp til grovere rutenett hvis det blir tettere enn ~8 px
      let step = grid.step;
      while (step / upp < 8) step *= 5;
      const major = step * 5;
      const minor = [];
      const majorPts = [];
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const isMajor = Math.abs(x / major - Math.round(x / major)) < 1e-6;
        (isMajor ? majorPts : minor).push(x, y0, Z.grid, x, y1, Z.grid);
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const isMajor = Math.abs(y / major - Math.round(y / major)) < 1e-6;
        (isMajor ? majorPts : minor).push(x0, y, Z.grid, x1, y, Z.grid);
      }
      const add = (arr, color, opacity) => {
        if (!arr.length) return;
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        g.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color, transparent: true, opacity })));
      };
      add(minor, '#1e293b', 1);
      add(majorPts, '#334155', 1);
      this.gridStep = step;
    } else {
      this.gridStep = grid ? grid.step : 0;
    }

    // Globale akser
    const axis = [x0, 0, Z.axis, x1, 0, Z.axis, 0, y0, Z.axis, 0, y1, Z.axis];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(axis, 3));
    g.add(new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: '#475569' })));
  }

  _drawShapes(upp) {
    const fills = this.groups.fill;
    const outlines = this.groups.outline;
    const handles = this.groups.handle;
    disposeGroup(fills);
    disposeGroup(outlines);
    disposeGroup(handles);

    const selection = new Set(this.data.selection || []);
    const shapes = this.data.shapes || [];

    // Bakerst i lista = lavest prioritet, tegnes først
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (!s.points || s.points.length < 3) continue;
      const isSel = selection.has(s.id);
      const isHover = this.hover === s.id;
      const isVoid = s.role === 'void';
      const off = s.include === false;

      const color = off ? '#64748b' : s.color;
      const fillOpacity = off ? 0.05 : isVoid ? 0.1 : isSel ? 0.32 : 0.2;
      fills.add(buildFillMesh(openRing(s.points), color, fillOpacity, Z.fill + i * 1e-4));

      const widthPx = isSel ? 2.6 : isHover ? 2.0 : 1.4;
      const ring = openRing(s.points);
      const z = Z.outline + i * 1e-4;

      if (s.stage === 'new') {
        // Ny del: stiplet kontur i formens egen farge, med et dempet
        // fargestikk under. Skillet skal være tydelig selv når to former
        // tilfeldigvis har liknende farge, uten at fargen forsvinner.
        const dash = 10 * upp;
        const gap = 6 * upp;
        outlines.add(
          buildLineMesh(
            dashedPolylinePositions(ring, true, ((widthPx + 2.6) * upp) / 2, z - 5e-5, dash, gap),
            NEW_STAGE_COLOR,
            off ? 0.2 : 0.45
          )
        );
        outlines.add(
          buildLineMesh(
            dashedPolylinePositions(ring, true, (widthPx * upp) / 2, z, dash, gap),
            isSel ? '#ffffff' : color,
            off ? 0.4 : 1
          )
        );
      } else {
        outlines.add(
          buildLineMesh(
            thickPolylinePositions(ring, true, (widthPx * upp) / 2, z),
            isSel ? '#ffffff' : color,
            off ? 0.4 : 1
          )
        );
      }

      if (isSel) {
        const hw = 4 * upp;
        const hpos = [];
        for (const [x, y] of openRing(s.points)) {
          hpos.push(
            x - hw, y - hw, Z.handle, x + hw, y - hw, Z.handle, x + hw, y + hw, Z.handle,
            x - hw, y - hw, Z.handle, x + hw, y + hw, Z.handle, x - hw, y + hw, Z.handle
          );
        }
        handles.add(buildLineMesh(hpos, '#ffffff', 0.95));
      }
    }
  }

  _drawNet(upp) {
    const g = this.groups.net;
    disposeGroup(g);
    const analysis = this.data.analysis;
    if (!analysis) return;

    // Overlappsonen: der to eller flere skall dekker hverandre. I 'sum'-modus
    // teller materialet her to ganger, og det er nettopp dette som trekker
    // tyngdepunktet mot overlappet.
    if (this.showOverlap && analysis.overlapMulti && analysis.overlapMulti.length) {
      const doubled = analysis.mode === 'sum';
      for (const poly of analysis.overlapMulti) {
        g.add(buildFillMesh(openRing(poly[0]), doubled ? '#f59e0b' : '#64748b', doubled ? 0.28 : 0.14, Z.net - 0.02));
        const pos = [];
        for (const ring of poly) {
          pos.push(...thickPolylinePositions(openRing(ring), true, (1.4 * upp) / 2, Z.net - 0.01));
        }
        g.add(buildLineMesh(pos, doubled ? '#f59e0b' : '#64748b', 0.9));
      }
    }

    if (!this.showNet || !analysis.netMulti) return;
    const pos = [];
    for (const poly of analysis.netMulti) {
      for (const ring of poly) {
        pos.push(...thickPolylinePositions(openRing(ring), true, (2.2 * upp) / 2, Z.net));
      }
    }
    if (pos.length) g.add(buildLineMesh(pos, '#22d3ee', 0.95));
  }

  /** Henter (eller lager) en tekstetikett som sprite. */
  _label(text, color) {
    const key = `${color}|${text}`;
    let entry = this._labelCache.get(key);
    if (!entry) {
      // Bufferet vokser bare med antall grensesnittnavn, men et navn som
      // skrives om bokstav for bokstav legger igjen én tekstur per tastetrykk.
      if (this._labelCache.size > 48) this._clearLabelCache();
      entry = makeLabelTexture(text, color);
      this._labelCache.set(key, entry);
    }
    const material = new THREE.SpriteMaterial({ map: entry.texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(material);
    sprite.userData.w = entry.w;
    sprite.userData.h = entry.h;
    return sprite;
  }

  _clearLabelCache() {
    for (const entry of this._labelCache.values()) entry.texture.dispose();
    this._labelCache.clear();
  }

  /**
   * Skjøtene (§6.1 i joints-planen): en tydelig linje med endemarkører, i
   * `JOINT_COLOR` — en farge som ikke finnes i `PALETTE`, så en skjøt aldri
   * kan forveksles med en formfarge. INGEN piler, og INGEN sidevalg: hvilken
   * komponent grafen regner som «gruppa» (`jointGroup` fra joints.js — §8.3,
   * kun ΔN-ruting/advarsler, IKKE ES*) vises bare som en dempet, liten prikk —
   * ren informasjon, ikke noe å klikke på eller snu.
   */
  _drawJoints(upp) {
    const g = this.groups.joint;
    disposeGroup(g);
    const list = this.data.joints || [];
    if (!list.length) return;
    const shapes = this.data.shapes || [];

    // Grafen bygges ÉN gang for alle skjøtene, ikke per skjøt — buildGraph er
    // O(n²) i antall former (implisitte kanter), og det er ingen grunn til å
    // gjenta det arbeidet for hver linje som skal tegnes.
    const tol = (() => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const s of shapes) for (const [x, y] of s.points || []) {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
      }
      if (!Number.isFinite(minX)) return 1e-3;
      return Math.max(Math.hypot(maxX - minX, maxY - minY), 1) / 2000;
    })();
    const graph = buildGraph(shapes, list, tol);
    // Skjøter kan nå være med i utvalget (§1), på lik linje med formene.
    const selection = new Set(this.data.selection || []);

    list.forEach((f) => {
      const a = f && f.a;
      const b = f && f.b;
      if (!a || !b) return;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 1e-12) return;

      const isSel = selection.has(f.id);
      const isHover = this.hoverJoint === f.id;
      const color = isSel || isHover ? '#ffffff' : JOINT_COLOR;
      const widthPx = isSel ? 5.0 : isHover ? 4.4 : 3.2;

      g.add(
        buildLineMesh(
          thickPolylinePositions([a, b], false, (widthPx * upp) / 2, Z.joint),
          color,
          0.95
        )
      );

      const nrm = leftNormal(a, b);

      // Endestreker på tvers, så det er tydelig hvor skjøten slutter
      const tick = 6 * upp;
      const ends = [];
      for (const p of [a, b]) {
        ends.push(
          ...thickPolylinePositions(
            [[p[0] - nrm[0] * tick, p[1] - nrm[1] * tick], [p[0] + nrm[0] * tick, p[1] + nrm[1] * tick]],
            false,
            upp * 0.9,
            Z.joint
          )
        );
      }
      g.add(buildLineMesh(ends, color, 0.9));

      // Er skjøten markert, får endepunktene håndtak — samme firkanter som
      // formenes hjørnepunkt, og de kan dras på samme måte (§1).
      if (isSel) {
        const hw = 4 * upp;
        const hpos = [];
        for (const [x, y] of [a, b]) {
          hpos.push(
            x - hw, y - hw, Z.handle, x + hw, y - hw, Z.handle, x + hw, y + hw, Z.handle,
            x - hw, y - hw, Z.handle, x + hw, y + hw, Z.handle, x - hw, y + hw, Z.handle
          );
        }
        g.add(buildLineMesh(hpos, '#ffffff', 0.95));
      }

      // Dempet gruppemarkering — INFORMASJON, ikke et valg (§6.1): en liten
      // prikk midt på linja, forskjøvet et lite stykke mot komponenten
      // `jointGroup` regner som gruppa.
      try {
        const { groupIds } = jointGroup(f, graph);
        if (groupIds && groupIds.length) {
          const centroids = groupIds
            .map((id) => {
              const s = shapes.find((x) => x.id === id);
              return s && s.points && s.points.length >= 3 ? centroidOfPoints(s.points) : null;
            })
            .filter(Boolean);
          if (centroids.length) {
            const gx = centroids.reduce((sum, c) => sum + c[0], 0) / centroids.length;
            const gy = centroids.reduce((sum, c) => sum + c[1], 0) / centroids.length;
            const mx = (a[0] + b[0]) / 2;
            const my = (a[1] + b[1]) / 2;
            const dx = gx - mx;
            const dy = gy - my;
            const dlen = Math.hypot(dx, dy) || 1;
            const nudge = 10 * upp;
            const dot = { x: mx + (dx / dlen) * nudge, y: my + (dy / dlen) * nudge };
            const r = 2.4 * upp;
            const disc = [];
            for (let i = 0; i < 16; i++) {
              const a1 = (i / 16) * Math.PI * 2;
              const a2 = ((i + 1) / 16) * Math.PI * 2;
              disc.push(
                dot.x, dot.y, Z.joint + 0.01,
                dot.x + r * Math.cos(a1), dot.y + r * Math.sin(a1), Z.joint + 0.01,
                dot.x + r * Math.cos(a2), dot.y + r * Math.sin(a2), Z.joint + 0.01
              );
            }
            g.add(buildLineMesh(disc, color, 0.5));
          }
        }
      } catch (err) {
        // Gruppemarkeringen er ren pynt — en feil her skal aldri ta ned
        // resten av lerretstegningen.
        console.warn('[viewport] gruppemarkering feilet for skjøt', f.id, err);
      }

      const sprite = this._label(f.name || '', color);
      sprite.position.set(
        (a[0] + b[0]) / 2 + nrm[0] * 34 * upp,
        (a[1] + b[1]) / 2 + nrm[1] * 34 * upp,
        Z.joint + 0.02
      );
      sprite.scale.set(sprite.userData.w * upp * 0.5, sprite.userData.h * upp * 0.5, 1);
      g.add(sprite);
    });
  }

  _drawMarkers(upp) {
    const g = this.groups.marker;
    disposeGroup(g);
    const analysis = this.data.analysis;
    const ref = this.data.reference || [0, 0];

    // Referansepunkt (nullpunktet brukeren måler fra)
    const r = 7 * upp;
    g.add(
      buildLineMesh(
        [
          ...thickPolylinePositions([[ref[0] - r, ref[1]], [ref[0] + r, ref[1]]], false, upp, Z.marker),
          ...thickPolylinePositions([[ref[0], ref[1] - r], [ref[0], ref[1] + r]], false, upp, Z.marker),
        ],
        '#f59e0b',
        1
      )
    );
    const circle = [];
    const rr = 10 * upp;
    for (let i = 0; i <= 32; i++) circle.push([ref[0] + rr * Math.cos((i / 32) * Math.PI * 2), ref[1] + rr * Math.sin((i / 32) * Math.PI * 2)]);
    g.add(buildLineMesh(thickPolylinePositions(circle, false, upp * 0.8, Z.marker), '#f59e0b', 0.8));

    if (!analysis || !analysis.result.valid) return;
    const { cx, cy, theta } = analysis.result;

    // Tyngdepunkt: fylt sirkel + kryss
    const cr = 6 * upp;
    const disc = [];
    for (let i = 0; i < 28; i++) {
      const a1 = (i / 28) * Math.PI * 2;
      const a2 = ((i + 1) / 28) * Math.PI * 2;
      disc.push(
        cx, cy, Z.marker,
        cx + cr * Math.cos(a1), cy + cr * Math.sin(a1), Z.marker,
        cx + cr * Math.cos(a2), cy + cr * Math.sin(a2), Z.marker
      );
    }
    g.add(buildLineMesh(disc, '#ef4444', 1));

    const arm = 22 * upp;
    g.add(
      buildLineMesh(
        [
          ...thickPolylinePositions([[cx - arm, cy], [cx + arm, cy]], false, upp * 0.9, Z.marker),
          ...thickPolylinePositions([[cx, cy - arm], [cx, cy + arm]], false, upp * 0.9, Z.marker),
        ],
        '#ef4444',
        0.9
      )
    );

    // Stiplet målelinje fra referansepunkt til tyngdepunkt
    if (Math.hypot(cx - ref[0], cy - ref[1]) > 1e-6) {
      const dashes = [];
      const dashLen = 8 * upp;
      const total = Math.hypot(cx - ref[0], cy - ref[1]);
      const ux = (cx - ref[0]) / total;
      const uy = (cy - ref[1]) / total;
      for (let d = 0; d < total; d += dashLen * 2) {
        const e = Math.min(d + dashLen, total);
        dashes.push(
          ...thickPolylinePositions(
            [[ref[0] + ux * d, ref[1] + uy * d], [ref[0] + ux * e, ref[1] + uy * e]],
            false,
            upp * 0.6,
            Z.marker
          )
        );
      }
      g.add(buildLineMesh(dashes, '#fbbf24', 0.7));
    }

    // Hovedakser gjennom tyngdepunktet
    if (this.showPrincipal) {
      const L = Math.max(this.viewWidth, this.viewHeight) * 0.6;
      const dirs = [
        { a: theta, color: '#a78bfa' },
        { a: theta + Math.PI / 2, color: '#818cf8' },
      ];
      for (const { a, color } of dirs) {
        const dx = Math.cos(a) * L;
        const dy = Math.sin(a) * L;
        g.add(
          buildLineMesh(
            thickPolylinePositions([[cx - dx, cy - dy], [cx + dx, cy + dy]], false, upp * 0.6, Z.marker - 0.01),
            color,
            0.55
          )
        );
      }
    }
  }

  _drawPreview(upp) {
    const g = this.groups.preview;
    disposeGroup(g);
    const p = this.preview;
    if (!p) return;

    // Spøkelseskonturer: hvor geometrien kommer fra under flytt og rotasjon,
    // og hvor kopien havner under kopiering og speiling.
    if (p.ghosts && p.ghosts.length) {
      const pos = [];
      for (const ring of p.ghosts) {
        if (!ring || ring.length < 2) continue;
        pos.push(...thickPolylinePositions(openRing(ring), true, (1.4 * upp) / 2, Z.preview - 0.02));
      }
      if (pos.length) g.add(buildLineMesh(pos, p.ghostColor || '#94a3b8', 0.55));
    }

    // Stiplet linje fra basispunkt (eller rotasjonssenter) til markøren
    if (p.line) {
      const [a, b] = p.line;
      const total = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (total > 1e-9) {
        const dashLen = 8 * upp;
        const ux = (b[0] - a[0]) / total;
        const uy = (b[1] - a[1]) / total;
        const dashes = [];
        for (let d = 0; d < total; d += dashLen * 2) {
          const e = Math.min(d + dashLen, total);
          dashes.push(
            ...thickPolylinePositions(
              [[a[0] + ux * d, a[1] + uy * d], [a[0] + ux * e, a[1] + uy * e]],
              false,
              upp * 0.6,
              Z.preview - 0.01
            )
          );
        }
        g.add(buildLineMesh(dashes, p.lineColor || '#94a3b8', 0.8));
      }
    }

    // Rotasjonssenteret som et lite kryss
    if (p.cross) {
      const [x, y] = p.cross;
      const arm = 9 * upp;
      g.add(
        buildLineMesh(
          [
            ...thickPolylinePositions([[x - arm, y], [x + arm, y]], false, upp * 0.9, Z.preview),
            ...thickPolylinePositions([[x, y - arm], [x, y + arm]], false, upp * 0.9, Z.preview),
          ],
          p.crossColor || '#f97316',
          1
        )
      );
    }

    if (p.points && p.points.length >= 2) {
      const closed = !!p.closed;
      g.add(
        buildLineMesh(
          thickPolylinePositions(p.points, closed, (1.8 * upp) / 2, Z.preview),
          p.color || '#22d3ee',
          0.95
        )
      );
      if (closed && p.points.length >= 3) {
        g.add(buildFillMesh(p.points, p.color || '#22d3ee', 0.15, Z.preview - 0.01));
      }
    }
    if (p.cursor) {
      const hw = 5 * upp;
      const [x, y] = p.cursor;
      g.add(
        buildLineMesh(
          [
            ...thickPolylinePositions([[x - hw, y - hw], [x + hw, y + hw]], false, upp, Z.preview),
            ...thickPolylinePositions([[x - hw, y + hw], [x + hw, y - hw]], false, upp, Z.preview),
          ],
          p.cursorColor || '#f8fafc',
          1
        )
      );
    }
  }
}
