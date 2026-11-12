/**
 * joint-extension.js — skjøten som utvidelse av cad2d-editoren (#93).
 *
 * Skjøten er geometry_workspace sin egen entitetstype (registrert i
 * `Store`). Her ligger resten av det motoren trenger for å vise og redigere
 * den: verktøyet «Skjøt» (G), treffet som lar en tynn skjøtelinje vinne over
 * formen under, og tegnelaget.
 */

import { centroidOfPoints } from '../../cad2d/js/geometry/polygon.js';
import { thickPolylinePositions, dashedPolylinePositions, buildLineMesh, leftNormal, Z } from '../../cad2d/js/view/viewport.js';
import { twoPointTool } from '../../cad2d/js/input/tools.js';
import { buildGraph, jointGroup } from './joints.js';
import { JOINT_COLOR } from './store.js';

const fmt = (v) => (Math.abs(v) >= 1000 ? v.toFixed(0) : v.toFixed(1));

/** Avstand fra punkt til linjestykke a–b. */
function distToSegment(world, a, b) {
  const [x1, y1] = a;
  const [x2, y2] = b;
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return Math.hypot(world[0] - x1, world[1] - y1);
  let t = ((world[0] - x1) * vx + (world[1] - y1) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(world[0] - (x1 + vx * t), world[1] - (y1 + vy * t));
}

/**
 * Nærmeste skjøt innenfor pikseltoleranse. Automatiske skjøter (#61) følger
 * geometrien og kan ikke dras; de tas bare med der et klikk bare VELGER
 * (Forsterkning-fanen, låst lerret).
 */
export function hitJoint(store, viewport, world, tolPx = 8, includeAuto = false) {
  const tol = tolPx * viewport.unitsPerPixel;
  let best = null;
  let bestD = tol;
  for (const j of includeAuto ? store.allJoints() : store.state.joints) {
    if (!j.a || !j.b) continue;
    const d = distToSegment(world, j.a, j.b);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

/**
 * Skjøtene (§6.1 i joints-planen): en tydelig linje med endemarkører, i
 * `JOINT_COLOR` — en farge som ikke finnes i `PALETTE`, så en skjøt aldri
 * kan forveksles med en formfarge. INGEN piler, og INGEN sidevalg: hvilken
 * komponent grafen regner som «gruppa» (`jointGroup` fra joints.js — §8.3,
 * kun ΔN-ruting/advarsler, IKKE ES*) vises bare som en dempet, liten prikk —
 * ren informasjon, ikke noe å klikke på eller snu.
 */
export function drawJoints(g, upp, vp) {
  const list = vp.data.joints || [];
  if (!list.length) return;
  const shapes = vp.data.shapes || [];

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
  const selection = new Set(vp.data.selection || []);

  list.forEach((f) => {
    const a = f && f.a;
    const b = f && f.b;
    if (!a || !b) return;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-12) return;

    const isSel = selection.has(f.id);
    const isHover = vp.hoverOf('joint') === f.id;
    const color = isSel || isHover ? '#ffffff' : JOINT_COLOR;
    const widthPx = isSel ? 5.0 : isHover ? 4.4 : 3.2;

    // Automatiske skjøter (#61) stiplet: de er utledet, ikke tegnet.
    g.add(
      buildLineMesh(
        f.auto
          ? dashedPolylinePositions([a, b], false, (widthPx * upp) / 2, Z.joint, 9 * upp, 5 * upp)
          : thickPolylinePositions([a, b], false, (widthPx * upp) / 2, Z.joint),
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

    const sprite = vp.label(f.name || '', color);
    sprite.position.set(
      (a[0] + b[0]) / 2 + nrm[0] * 34 * upp,
      (a[1] + b[1]) / 2 + nrm[1] * 34 * upp,
      Z.joint + 0.02
    );
    sprite.scale.set(sprite.userData.w * upp * 0.5, sprite.userData.h * upp * 0.5, 1);
    g.add(sprite);
  });
}

/**
 * Legger skjøten på editoren: verktøy, treff og tegnelag.
 *
 * @param {{store, viewport, tools}} editor
 * @returns {{hit: Function, onPicked: ((id) => void)|null, onHover: ((id) => void)|null}}
 *   GW setter `onPicked`/`onHover` (skjøtelista i panelet følger lerretet).
 */
export function installJoints({ store, viewport, tools }) {
  const ext = {
    onPicked: null,
    onHover: null,
    hit: (world, tolPx = 8, includeAuto = false) => hitJoint(store, viewport, world, tolPx, includeAuto),
  };
  tools.registerTool(
    'joint',
    twoPointTool({
      hint: 'Skjøt: klikk to punkt langs skjøtelinja. Navnes automatisk etter delene den skiller. Esc avbryter.',
      second: 'Skjøt: klikk det andre punktet. Snapping og orto virker som ellers.',
      color: JOINT_COLOR,
      status: (d) => `Skjøt: heftbredde ${fmt(d)} (linjas lengde, med mindre en annen er satt). Klikk for å fullføre.`,
      // Ingen side å gjette (§8.1): navnet autogenereres av `store.addJoint`
      // fra delene linja skiller, og status bekrefter hva den ble kalt.
      finish(a, b, ctl) {
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) {
          ctl.onStatus('Skjøtelinja har null lengde — avbrutt.');
          return;
        }
        const j = store.addJoint(a, b);
        ctl.onStatus(`${j.name} lagt inn.`);
      },
    })
  );
  tools.registerPicker({
    kind: 'joint',
    vertexLabel: 'Skjøteende',
    vertexDeleteMessage: 'En skjøt har bare to endepunkt — de kan ikke fjernes. Slett hele skjøten med Del.',
    hit: (world, tolPx) => hitJoint(store, viewport, world, tolPx, false),
    status: (j) => `${j.name}: dra for å flytte, dra et endepunkt for å endre linja, Del for å slette.`,
    onPick: (id) => ext.onPicked?.(id),
    onHover: (id) => ext.onHover?.(id),
  });
  viewport.addLayer({ key: 'joint', draw: drawJoints });
  return ext;
}
