# thermo2d — API for agenter / agent API

thermo2d er en nettleser-app for 2D varmeanalyse av tverrsnitt (brann og klima).
Appen eksponerer et lite API på siden, `window.thermo2d`, som alltid er på.
Det bruker samme kommandolag som knappene i appen, så alt du gjør vises i
editoren mens det skjer. Beskrivelsen under er på engelsk fordi den leses av
verktøy; appen selv er på bokmål og engelsk.

## Open the app

- Live: https://magnusfjeldolsen.github.io/structural_tools/thermo2d/
- Local: `npm run dev` in `thermo2d/` → http://localhost:5180/

The API works from the browser console or from any tool that can run
JavaScript on the page (for example Claude in Chrome's `javascript_tool`).
Every call returns plain JSON. Errors are JSON too: `{ error: true, code,
message, field?, options?, suggestion? }` — the message says which field was
wrong and lists the valid options, so you can correct without guessing.

## Discover

```js
const api = window.thermo2d;
api.describe();          // { name, version, tools: [{ name, description, inputSchema }], help }
api.help('nb');          // short Norwegian explanation
```

`tools` are in MCP shape (name, description, JSON Schema). Call a tool with
either form:

```js
await api.call('list_templates');
await api.tools.list_templates();
```

## Tools

| Tool | What it does |
|---|---|
| `get_project` | The whole project document |
| `describe_commands` | Catalogue of editing commands for `apply_commands` (fields, units) |
| `list_templates` | Parametric sections with parameters and defaults |
| `create_from_template` | `{ templateId, params, withDefaults? }` — new project from a template; adds concrete, ISO 834 and three-sided fire unless `withDefaults: false` |
| `apply_commands` | `{ commands: Command[], dry_run? }` — atomic batch of edits |
| `validate` | Problems in plain words |
| `search_library` | `{ text?, category? }` — materials and curves with citations |
| `run_analysis` | `{ analysisId?, scenarioId? }` — runs in the app's worker and resolves with a summary |
| `get_result_summary` | Times, probes with final values, mesh and solver stats |
| `query_results` | `{ kind: 'point' \| 'probe' \| 'rebar-table' \| 'extremes' \| 'time-to-threshold' \| 'metrics', ... }` |

Units: mm, °C, s. Edge indices on a rectangle created from a bottom-left
origin: 0 = bottom, 1 = right, 2 = top, 3 = left.

## Worked example: 300 × 500 beam, 4 Ø20, 90 min ISO 834 on three sides

```js
const api = window.thermo2d;

// 1. Section with concrete, ISO 834 and fire on bottom/left/right (top unexposed)
const { regionIds } = await api.call('create_from_template', { templateId: 'rect-beam', params: { b: 300, h: 500 } });
const beam = regionIds[0];

// 2. Reinforcement: steel material, bottom edge row, Ø20, 4 bars, cover 35 mm to the bar surface
const steel = (await api.call('search_library', { text: 'reinforcing steel', category: 'material' }))[0].id;
await api.call('apply_commands', {
  commands: [
    { type: 'material.addFromLibrary', libraryId: steel, id: 'steel' },
    { type: 'rebarSet.add', set: { name: 'Bottom', kind: 'edge', regionId: beam, edgeRef: { regionId: beam, ring: 0, edgeIndex: 0 }, diameter: 20, materialId: 'steel', cover: 35, count: 4 } },
    { type: 'probe.addAtDepth', edgeRef: { regionId: beam, ring: 0, edgeIndex: 0 }, depth: 25, name: 'd25' },
    { type: 'analysis.update', id: 'an_main', patch: { duration: 5400, dt: 5 } },
  ],
});

// 3. Check and run
await api.call('validate');          // [] when nothing blocks the run
await api.call('run_analysis');      // resolves when the worker is done (a few seconds)

// 4. Read
await api.call('query_results', { kind: 'rebar-table', times: [1800, 3600, 5400] });
await api.call('query_results', { kind: 'point', x: 150, y: 25 });
```

Every bar gets a probe at its centre automatically, so `query_results` with
`kind: 'probe'` returns all bar temperatures at a time.

## Notes for agents

- Bars are meshed as steel by default. Set the bar material to concrete to
  read the concrete temperature at the bar centre instead (what EN 1992-1-2
  Annex A charts show); the difference is 20–40 K at corner bars.
- The unexposed face uses 4 W/m²K by default (EN 1991-1-2 §3.1(5)); pass
  `params: { alpha: 9 }` on the exposure face for §3.1(6).
- Results become stale when the model changes; call `run_analysis` again.
- A badge "Agent aktiv" appears in the app for a few seconds after each call.
