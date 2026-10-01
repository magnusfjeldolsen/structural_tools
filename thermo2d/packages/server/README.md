# @thermo2d/server — MCP server and CLI

The MCP server lets Claude (Claude Desktop, Claude Code or any MCP client) build a
2D thermal model, run it and get numbers, figures, explanations and reports back,
using the same core and `.thermo.json` files as the web app. The CLI runs the same
core headless for batch and regression work. Both are single-file ESM bundles that
run with plain `node` on Windows 11 — no tsx, no npx, no admin rights.

## Build

```powershell
cd C:\Python\structural_tools\thermo2d
npm install
npm run build:server        # → packages\server\dist\mcp.mjs, cli.mjs, resvg.wasm
```

## Claude Desktop / Claude Code (Windows)

`%APPDATA%\Claude\claude_desktop_config.json` (Claude Desktop) or `claude mcp add-json` (Claude Code):

```json
{
  "mcpServers": {
    "thermo2d": {
      "command": "node",
      "args": [
        "C:\\Python\\structural_tools\\thermo2d\\packages\\server\\dist\\mcp.mjs",
        "--workspace",
        "C:\\Users\\<you>\\Documents\\thermo-workspace"
      ]
    }
  }
}
```

Claude Code one-liner:

```powershell
claude mcp add thermo2d -- node "C:\Python\structural_tools\thermo2d\packages\server\dist\mcp.mjs" --workspace "C:\Users\<you>\Documents\thermo-workspace"
```

- The workspace folder is created if missing. The server only reads and writes
  inside it (`*.thermo.json` projects, `results/`, `figures/`, `reports/`,
  `library/`). Paths that escape it are rejected.
- `THERMO2D_WORKSPACE` can replace `--workspace`. Default: `<cwd>\workspace`.
- Company/user libraries: drop `*.json` or `*.csv` files in `<workspace>\library\`
  (same format as `parseLibraryFile`); they are merged with the built-ins on
  start, and built-ins stay read-only.
- No network calls; logs go to stderr only.

## Tools

`describe_capabilities` (call first) · `search_library` · `get_library_item` ·
`create_project` · `open_project` · `save_project` · `list_projects` ·
`create_from_template` · `apply_commands` (atomic batch, `dry_run`) · `get_model` ·
`get_model_image` (PNG/SVG) · `import_time_series` (CSV / Excel paste / EPW) ·
`validate` · `run_analysis` (job id, or `wait: true`) · `get_run_status` ·
`cancel_run` · `query_results` · `make_figure` (svg / png / interactive html) ·
`explain_results` · `compare_scenarios` · `run_sweep` · `make_report` ·
`open_in_app`.

Resources: `thermo2d://projects/{name}`, `thermo2d://library/{id}`,
`thermo2d://figures/{file}`, `thermo2d://reports/{file}`.
Prompts: `fire-check-rc-section`, `wall-thermal-bridge-check`,
`compare-insulation`, `import-and-run-climate`.

Every failure returns `isError` with `error`, `code`, the offending `field`/`value`,
valid `options` when known and a `hint`, so the client can correct itself.

## Example (spec §12)

> Beam 300 by 500, four Ø20 at the bottom, cover 35, C35/45, ISO 834 for 90
> minutes on the sides and bottom, show the temperature of each bar.

Expected tool sequence:

1. `describe_capabilities`
2. `create_project` → `create_from_template` (`rect-beam`, b=300, h=500, `libraryMaterialId` = a siliceous normal-weight concrete)
3. `apply_commands`: `material.addFromLibrary` (reinforcing steel), `rebarSet.add` (edge, bottom edge, Ø20, count 4, cover 35), `exposure.apply` (bottom/left/right `fire` with `fireCurve: "iso834"`, top `fire-unexposed`), `probe.addForRebars`
4. `validate`
5. `run_analysis` (`wait: true`)
6. `query_results` (`rebar_table`, times 1800/3600/5400)
7. `make_figure` (`time-series`, png) and `make_figure` (`field`, png, isotherm 500)
8. `explain_results`, `save_project`

A follow-up "now with 45 mm cover" is one `compare_scenarios` call with an
override `{ collection: "rebarSets", id: "<set id>", patch: { cover: 45 } }`.

## CLI

```powershell
node packages\server\dist\cli.mjs run "C:\path\beam.thermo.json" --out "C:\path\out" [--analysis an_main] [--scenario sc_1] [--csv-locale nb|en] [--html] [--report]
node packages\server\dist\cli.mjs validate "C:\path\beam.thermo.json"
node packages\server\dist\cli.mjs mesh "C:\path\beam.thermo.json"
node packages\server\dist\cli.mjs figure "C:\path\beam.thermo.json" "C:\path\out\beam.an_main.thermo.results" --kind field --out field.png --time 5400
```

`run` writes probe histories (`*.probes.csv`), a probes × times table, a rebar
table (when reinforced), the binary `*.thermo.results`, a `*.summary.json` with
the stamp (project hash, core version), and optionally the interactive HTML and
the report. CSV defaults to the project's locale (`;` and decimal comma for
Norwegian Excel). Exit code 0 on success, 1 on failure.

## Development

```powershell
npm run mcp --workspace=@thermo2d/server      # tsx src/mcp.ts (dev)
npx vitest run --project server               # in-process MCP client tests + case 15
```
