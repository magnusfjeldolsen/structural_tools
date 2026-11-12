# cad2d — felles 2D CAD-motor

Egenutviklet 2D CAD for structural_tools (#93): former med hull, linjearbeid,
DXF inn, tverrsnitt ut. Brukes av `geometry_workspace` (hele vinduet, egne
paneler) og `concrete_section_calculator` (overlegg), og står alene på
`cad2d/index.html`. Design og begrunnelser: `global-devspecs/cad2d-design.md`.

Rene ES-moduler, ingen byggesteg, ingen avhengigheter utover det som er vendoret
(`vendor/polygon-clipping.umd.js`) og three.js fra CDN.

## Montere editoren

```html
<script src="../cad2d/vendor/polygon-clipping.umd.js"></script>
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>
<script type="module">
  import { mountCadEditor } from '../cad2d/js/editor/editor.js';
  const ed = mountCadEditor(document.getElementById('host'), { lang: 'en' });
  ed.on('change', () => console.log(ed.getSection()));
</script>
```

| Håndtak | |
|---|---|
| `getDocument()` | `CadDocument` (CRUD, angre, JSON) |
| `setDocument(jsonOrObjOrDoc)` | erstatter innholdet, tømmer historikken |
| `on(event, fn)` | `'change'`, en endringsgrunn (`'add'`, `'undo'` …), `'status'`, `'tool'` |
| `getSection()` | `{ok, section, props, error, warnings}` på `structural-tools-section` v1 (mm) |
| `importDxf(text, {mode})` | `'auto'` (former og hull) eller `'lines'` |
| `destroy()` | fjerner lyttere, lerret og DOM |

Viktige valg: `chrome` (verktøylinje/statuslinje, standard på), `toolbar`
(knappene), `keyboard: 'focus' | 'page'`, `lang: 'no' | 'en'`, `style`,
`extensions`, `keyHooks`. Se kommentaren øverst i `js/editor/editor.js`.

## Lagene

| Mappe | Innhold | DOM |
|---|---|---|
| `js/core/` | `document.js` (CadDocument), `units.js` | nei |
| `js/geometry/` | `polygon.js` (A, S, I, boolske operasjoner, `analyze` med hullregelen), `params.js`, `curves.js`, `stitch.js`, `linework.js` | nei |
| `js/view/` | `viewport.js` (three.js, pan/zoom, tegnelag) | ja |
| `js/input/` | `tools.js`, `snapping.js`, `keymap.js`, `numeric-input.js` | bare `numeric-input` |
| `js/io/` | `dxf.js`, `section-export.js`, `project.js` | nei |
| `js/editor/` | `editor.js` (`mountCadEditor`) | ja |

## Utvide

- Egen entitetstype: `doc.registerKind('dim', {collection, prefix, toPoints, fromPoints})`.
  CRUD, flytt/kopi/roter/speil, vindusutvalg og angre virker da uten mer kode.
- Eget verktøy: `editor.tools.registerTool(name, twoPointTool({...}))`.
- Tynne entiteter som skal vinne over formene ved klikk: `editor.tools.registerPicker({...})`.
- Eget tegnelag: `editor.viewport.addLayer({key, draw(group, upp, viewport)})`.

`geometry_workspace/js/joint-extension.js` (skjøtene) er eksempelet på alle fire.

## Taster

Samme som geometry_workspace: `V M C R B S P O N G X L`, `H` hull, `F` zoom,
`F8`/`Alt+0` orto, `Alt+1…6` snap, `Alt+9` alle snap, `Del`, `Ctrl+Z/Y`,
`Ctrl+Shift+Z`, `Ctrl+D`, `Ctrl+A`, `Enter`, `Esc`. Tall skrevet mens et
verktøy venter på et punkt går til tallinntastingen (`300 200`, `D 300 0`).

## Tester

```bash
node cad2d/tests/document.test.mjs   # dokumentmodell, CRUD, batch, angre, JSON
node cad2d/tests/geometry.test.mjs   # hullregelen, søm, arealer
node cad2d/tests/input-io.test.mjs   # tastaturkart, utvidelsespunkt, DXF -> tverrsnitt
```

geometry_workspace sine suiter tester motoren gjennom domenet; alle kjøres i
CI-jobben «cad2d + geometry_workspace — node tests».
