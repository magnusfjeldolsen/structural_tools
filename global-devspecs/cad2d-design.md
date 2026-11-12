# cad2d — felles 2D CAD-motor (sak #93)

Motoren trekkes ut av `geometry_workspace` (GW) og brukes av GW,
`concrete_section_calculator` (csc) og senere andre moduler. Dette dokumentet
står for valgene; koden står for detaljene.

## 1. Rammer

- Rene ES-moduler i `cad2d/js/`, ingen byggesteg, ingen nye avhengigheter.
- `polygon-clipping` flyttes fra `geometry_workspace/vendor/` til
  `cad2d/vendor/` (én kopi). Den lastes som `<script>` og leses fra
  `window.polygonClipping`, som før.
- three.js er fortsatt eneste ytre avhengighet. Den hentes med bart navn
  (`import * as THREE from 'three'`), så siden som monterer editoren må ha
  `importmap` for `three` (samme versjon som GW: 0.160.0). Bare `view` og
  `editor` importerer three; `core`, `geometry`, `io` og det meste av `input`
  kan kjøres i Node.
- **three.js vendoreres ikke** (vurdert etter review av #94). `three.module.js`
  0.160.0 er 1 272 972 byte (målt fra jsDelivr); i repoet ville den vært den klart største
  fila i begge modulene, og hver oppgradering et megabyte-diff. Versjonen er
  låst i importmap, jsDelivr er samme kilde geometry_workspace har brukt hele
  tiden, og en CDN-svikt er nå håndtert: i csc lastes editoren først ved
  åpning, `open()` fanger feilen og viser en melding ved figuren, og
  beregningen virker som før (test: `cad-editor.test.mjs`). `polygon-clipping`
  (92 kB) er vendoret fordi tallene avhenger av den; three tegner bare.
  Vurder på nytt hvis verktøyene skal virke offline.
- Kryssmappe-import (`../cad2d/js/...`) virker på GitHub Pages fordi `cad2d/`
  ligger i kopilista og `paths:` i `deploy-all-modules.yml`.

## 2. Lagene (avhengigheter bare nedover)

| Lag | Filer | Ansvar | DOM |
|---|---|---|---|
| `core` | `core/document.js`, `core/units.js` | dokumentmodell, CRUD, angre/gjør om, hendelser, JSON | nei |
| `geometry` | `geometry/polygon.js`, `params.js`, `curves.js`, `stitch.js`, `linework.js` | ringer, A/S/I, boolske operasjoner, hullregelen, parametriske former, søm av linjer | nei |
| `view` | `view/viewport.js` | kamera, pan/zoom, tegning (three.js), tegnelag for utvidelser | ja |
| `input` | `input/tools.js`, `snapping.js`, `numeric-input.js`, `keymap.js` | verktøy, snapping, utvalg, tallinntasting, ETT tastaturkart | `tools`/`snapping`/`keymap`: nei. `numeric-input`: ja |
| `io` | `io/dxf.js`, `io/section-export.js`, `io/project.js` | DXF inn, `structural-tools-section` ut, dokument-JSON | nei |
| `editor` | `editor/editor.js` | `mountCadEditor(container, options)` | ja |

`core` importerer `geometry` (CRUD som «lag geometri av linjer» og «del med
linje» trenger matematikken), og det er den eneste unntaket fra «core nederst».
`geometry` importerer ingenting fra `core`. Rekkefølgen er da
`geometry → core → view/input/io → editor`.

## 3. Entitetsmodellen

Alle entiteter har stabil `id` (prefiks per type, løpenummer per dokument) og
ligger i en samling i `doc.state`:

| type | samling | prefiks | punkter | merknad |
|---|---|---|---|---|
| `shape` | `shapes` | `s` | lukket ring | `role: 'solid'|'void'`. Parametriske former (rektangel, sirkel, skall) har `meta: {kind, ...}` og punktene som diskretisering — slik GW allerede gjør. |
| `line` | `lines` | `l` | polylinje, `closed` | linjearbeid. Buer og sirkler fra DXF «Bare linjer» er linjer med punktene diskretisert. |
| utvidelse | valgfri | valgfritt | `toPoints`/`fromPoints` | `doc.registerKind(...)`. GW registrerer `joint` (`joints`, `j`, `[a, b]`). |

Buer og sirkler er bevisst *ikke* egne geometriske entiteter i denne runden:
alt som teller i areal er polygoner, og en parametrisk sirkel er en `shape`
med `meta.kind = 'circle'` (`params.detectCircle` gjenkjenner den). Det er
modellen GW har, og å endre den ville endret tall. En ekte buesegment-entitet
kan legges til senere gjennom samme `registerKind`.

Utvalget er én flat liste med id-er på tvers av typene (`state.selection`).

## 4. Det offentlige API-et

### core

```js
const doc = new CadDocument({ storageKey?, kinds? });
doc.add(kind, data, {select}) → entitet      // CRUD
doc.get(id) / doc.list(kind?) / doc.update(id, patch) / doc.remove(idOrIds)
doc.batch(fn, {reason})                       // alt i fn = ETT angresteg
doc.undo() / doc.redo() / doc.canUndo / doc.canRedo
doc.on('change'|'undo'|'redo'|'selection'|..., fn) → off   // og subscribe(fn)
doc.toJSON() / doc.fromJSON(text)             // {format:'cad2d.document', version:1}
doc.registerKind('joint', {collection, prefix, toPoints, fromPoints, insert})
```

Lavnivå-API-et GW bygger på (`mutate`, `commit`, `rollback`, `isTransient`,
`addShape`, `addShapes`, `addLines`, `setManyEntityPoints`, `moveEntities`,
`copyEntities`, `removeEntities`, `makeShapesFromLines`, `splitByLine`,
`select`, `setUnit`, …) flytter med uendret signatur. Tre krokmetoder er
utvidelsespunkt for domenet: `withFollowing(ids)` (GW: skjøter som følger med),
`followNote(n)`/`followedNoun(n)` (statustekst), og `_snapshotKeys()`/
`_migrate(data)` (domenets egne tilstandsfelt i angrehistorikken).

### geometry

`analyze(shapes, mode)` — hullregelen: et hull skjærer alt fast areal det
overlapper, uansett rekkefølge og modus. `ringProps`, `multiProps`,
`unionMulti`, `differenceMulti`, `contoursFromLines`, `stitchPaths`,
`nestRings` — uendret fra GW.

### view

`new Viewport(container, handlers, {style, background})`, `setData`,
`setPreview`, `zoomToFit`, `worldToScreen`, `snap`, `addLayer({key, draw})`
(utvidelseslag, tegnes mellom nettet og markørene), `setHoverOf(kind, id)`.
Tegnehjelperne (`thickPolylinePositions`, `buildLineMesh`, …) eksporteres så
et utvidelseslag tegner som kjernen. Lerretet følger containerens størrelse
(`ResizeObserver`), også når den starter skjult.

### input

`new ToolController(doc, viewport, opts)` med `registerTool(name, def)` og
`registerPicker(def)` (treff som vinner over formene, slik skjøtene gjør i GW).
`createKeyHandler(ctx)` er tastaturkartet, identisk med GW sitt:
`V M C R B S P O N G X L`, `H` hull, `F` zoom, `F8` orto, `Alt+1…9/0` snap,
`Del`, `Ctrl+Z/Y/Shift+Z`, `Ctrl+D`, `Ctrl+A`, `Esc`-kaskaden, Enter, og
tallinntasting før hurtigtastene.

### io

`importDxf`, `importDxfLines`, `exportSection(shapes, {unit})`,
`sectionProps`, `sectionToJSON` — uendret. `io/project.js`: `documentFromSection`
(et `structural-tools-section`-polygon inn som former og hull).

### editor

```js
const ed = mountCadEditor(container, {
  document?,                 // CadDocument (GW sender sin Store)
  chrome: true,              // false: bare lerret (GW har egne paneler)
  tools: ['select','line','rect','circle','polygon','void','move',...],
  keyboard: 'focus'|'page',  // se §6
  style?, extensions?: [fn(editor)], onStatus?,
});
ed.getDocument() / ed.setDocument(docOrJson) / ed.on(event, fn)
ed.getSection()  → {section, messages} på structural-tools-section v1
ed.destroy()
ed.viewport / ed.tools / ed.numeric   // for verter som GW som har egne paneler
```

Ingen globale variabler, ingen faste element-id-er: alt editoren lager har
klasser med prefiks `cad2d-`, og to editorer på samme side er uavhengige
(egne id-tellere, eget dokument, egen lytter).

## 5. Hva flyttes, hva blir igjen

| Fra `geometry_workspace/js/` | Til `cad2d/js/` |
|---|---|
| `geometry.js` | `geometry/polygon.js` |
| `shapes.js` | `geometry/params.js` |
| `linework.js` | `geometry/linework.js` |
| buer/sirkler, søm og nøsting i `dxf.js` | `geometry/curves.js`, `geometry/stitch.js` |
| resten av `dxf.js` | `io/dxf.js` (re-eksporterer det som flyttet, så API-et er likt) |
| `section-export.js` | `io/section-export.js` |
| `units.js` | `core/units.js` |
| `snapping.js`, `numeric-input.js` | `input/` |
| historikk, CRUD og utvalg i `store.js` | `core/document.js` (`CadDocument`) |
| verktøyene i `tools.js` (unntatt skjøt) | `input/tools.js` |
| tastaturdelen av `main.js` | `input/keymap.js` |
| det generelle i `viewport.js` | `view/viewport.js` |
| `vendor/polygon-clipping.umd.js` | `cad2d/vendor/` |

Blir igjen i GW (domenet, oppå motoren): `store.js` (nå
`class Store extends CadDocument` med skjøter, laster, linjeberegning,
automatiske skjøter og prosjektformatet v4), `joint-extension.js` (ny: skjøt
som entitetstype, verktøy, treff og tegnelag), `joints.js`, `reinforcement*`,
`line-*`, `connection-stiffness.js`, `derivation.js`, `materials.js`,
`shape-style.js` (fargene etter tilstand/materiale, sendt inn som `style`),
`report*`, `underlay.js`, `ui.js` (panelene) og `main.js` (montering).

## 6. Tastatur og fokus

`keyboard: 'focus'` (standard): lytteren sitter på editorens rot, som er
fokuserbar (`tabindex=0`) og tar fokus ved pekertrykk. Taster som editoren
bruker, stoppes (`stopPropagation`), så vertens egne snarveier (csc:
`Ctrl+Space`, `Ctrl+Enter`, `Alt`-merker) ikke utløses inne i editoren, og
editoren reagerer ikke på taster utenfor seg.

`keyboard: 'page'` (GW): lytteren sitter på `window`, som før — GW er én
editor i hele vinduet, og hurtigtastene skal virke uansett hvor fokus står.
Den hopper over hendelser fra en *annen* cad2d-editor. Avvik fra «bare når
editoren har fokus»: nødvendig for at GW skal oppføre seg som før.

## 7. csc

- Klikk på figuren (`#draw-geo`) eller knappen «Edit geometry…» åpner
  editoren i et overlegg — bare for `Custom`. For Beam/Slab gjør klikket
  ingenting (rektangelveien er urørt); man velger «Custom» først, og editoren
  starter da med standardsnittet som former. Figuren får ikke `tabindex`
  (csc-regel, `form-structure.test.mjs`); tastaturveien er knappen.
- OK → `ed.getSection()` → samme `setCustomPolygon` som fil/innliming (#83),
  pluss `geometry.cad` = dokumentets JSON. Avbryt → ingenting endres.
- `geometry.cad` er tegningen, ikke tallene. Polygonet (`outer`/`holes`) er
  fortsatt den ENE kilden for beregningen. `setCustomPolygon` uten tegning
  (fil, innliming) nullstiller `geometry.cad`, så en gammel tegning aldri kan
  vises ved siden av et annet polygon. Åpnes editoren uten `cad`, bygges
  dokumentet fra polygonet (`documentFromSection`).
- Rektangel/plate-veien er urørt.

## 8. Migreringssteg

0. Dette dokumentet.
1. `core` + `geometry` med Node-tester. GW importerer fra `cad2d`; `Store`
   arver `CadDocument`. Alle GW-suiter grønne med samme tall.
2. `view`, `input`, `io`, `editor`. GW monterer editoren (`chrome: false`,
   `keyboard: 'page'`) og legger skjøtene på som utvidelse.
3. `cad2d/index.html` — fullvindu.
4. csc-integrasjonen.
5. Nettleserverifisering.
