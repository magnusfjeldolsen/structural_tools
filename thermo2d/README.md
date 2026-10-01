# thermo2d — 2D varmeanalyse av tverrsnitt

Stasjonær og transient 2D varmeledning i vilkårlige tverrsnitt: brann i betong-,
stål- og trekonstruksjoner, brannmotstand for lettvegger, U-verdi, kuldebroer
(ψ) og overflatetemperatur (f_Rsi). Én TypeScript-kjerne bak tre skall:

| Skall | Hva | Hvor |
|---|---|---|
| Web-app | Tegn snittet, velg materialer, velg brann- eller klimakurve, kjør, les temperaturer | https://magnusfjeldolsen.github.io/structural_tools/thermo2d/ |
| MCP-server (eksperimentell) | Claude Desktop/Code bygger, kjører og forklarer modeller på prompt. Beholdt for batch og regresjonstest; i appen bruker agenter heller `window.thermo2d`. | `packages/server/dist/mcp.mjs` |
| CLI | Batchkjøring og regresjonstester | `packages/server/dist/cli.mjs` |

Alt kjører lokalt og offline etter installasjon. Ingen kontoer, ingen nettverk.

## Kom i gang (Windows 11, ingen administratorrettigheter)

```powershell
cd C:\Python\structural_tools\thermo2d
npm install          # én gang
npm run dev          # web-app på http://localhost:5180
npm run build        # dist/ (web-app) + packages/server/dist/{mcp,cli}.mjs
npm test             # hele testpakken, inkl. valideringstilfellene i spec §14
npm run type-check
npm run bench        # ytelsesmåling av løseren (spec §10)
```

### MCP-server i Claude Desktop / Claude Code

Etter `npm run build`, legg til i `claude_desktop_config.json` (eller `claude mcp add`):

```json
{
  "mcpServers": {
    "thermo2d": {
      "command": "node",
      "args": ["C:\\Python\\structural_tools\\thermo2d\\packages\\server\\dist\\mcp.mjs", "--workspace", "C:\\Users\\<deg>\\thermo2d-workspace"]
    }
  }
}
```

Serveren leser og skriver bare i arbeidsmappen. Egne materialbiblioteker legges
som JSON eller CSV i `<workspace>\library\`. Se `packages/server/README.md`.

Eksempelprompt: «Bjelke 300 × 500, fire Ø20 i bunn, overdekning 35, C35/45,
ISO 834 i 90 minutter på sidene og under, vis temperaturen i hver stang.»
Forventet verktøysekvens: `create_from_template` → `apply_commands` →
`validate` → `run_analysis` → `query_results` → `make_figure` → `explain_results`.

### CLI

```powershell
node packages\server\dist\cli.mjs run prosjekt.thermo.json --out resultater\
node packages\server\dist\cli.mjs validate prosjekt.thermo.json
```

## Arkitektur

```
thermo2d/
  src/                 web-app (React 18 + zustand, Vite; mesh og løser i en Web Worker)
  packages/core/       modell (zod-skjema), geometri, mesher, materialbibliotek, FEM-løser,
                       etterprosessering, kommandolag, prosjekt-IO — ingen UI/fs/nettverk
  packages/figures/    figurkit: SVG, interaktiv HTML, CSV, rapport (delt av app og server)
  packages/server/     MCP-server (stdio) og CLI, bundlet til én fil med esbuild
```

- **Én sannhet:** `Project`-dokumentet (`.thermo.json`). Editor, mesher og løser er funksjoner av det.
- **Ett kommandolag:** alt UI-et kan gjøre er en `Command`; MCP-serveren kaller det samme laget.
- **Løser:** lineære trekanter, lumped kapasitet via entalpi (fuktpeaken kan ikke hoppes over),
  Newton med analytisk lineærisert stråling, backward Euler / Crank–Nicolson, adaptivt tidssteg,
  Jacobi-PCG eller skyline-Cholesky (RCM) valgt per kjøring.
- **Mesher:** størrelsesfelt (fint langs eksponerte kanter, ringer rundt armering, geometrisk vekst
  innover) → constrained Delaunay (`cdt2d`) → glatting. Nestede regioner tillates; armering er egne regioner.

Avvik fra spesifikasjonen og begrunnelser står i [DECISIONS.md](DECISIONS.md).

## Validering

Testene i `packages/core/test/validation` dekker tilfellene i spec §14 med de
oppgitte toleransene (analytiske løsninger, EN ISO 6946/10211, EN 1992-1-2
Annex A). `npm test` kjører alt; CI kjører det samme på hver PR og hver deploy.

## Bibliotek

Tre kilder slås sammen ved oppstart: innebygd (kjernen, med siteringer),
**firmabibliotek** (`thermo2d/library/*.json|csv`, bundles inn i appen og leses
av serveren; se `library/README.md` for format og PR-regel) og **mitt bibliotek**
(lagret i nettleseren). Et egendefinert materiale kan lagres i mitt bibliotek
eller eksporteres som JSON-fil til firmabiblioteket.

## Armering og mesh

- Overdekning måles til lengdearmeringens overflate (eller senter, prosjektvalg).
  Bøyler og fordelingsarmering oppgis som «Ø tverrarmering» og legges til som
  avstand; de regnes ikke termisk.
- Stenger meshes som stål. Settes stangmaterialet til betong, leses
  betongtemperaturen ved stangsenter slik EN 1992-1-2 tillegg A gjør.
- Ueksponert side: 4 W/m²K som standard (EN 1991-1-2 §3.1(5)), 9 W/m²K med ett
  klikk (§3.1(6)), eller egen verdi.
- Store snitt får automatisk grovere *indre* mesh (√(areal/0,15 m²), maks 4×);
  kanter med brann/klima og stenger beholder fin oppløsning. Sett indre
  elementstørrelse manuelt for å skru det av.

## Filformater

- `*.thermo.json` — prosjekt (modell), lesbar JSON med `schemaVersion` og migrering.
- `*.thermo.results` — resultater (binære Float32-øyeblikksbilder + JSON-indeks).
- Bibliotek: JSON/CSV i en mappe du styrer (Git eller SharePoint).
