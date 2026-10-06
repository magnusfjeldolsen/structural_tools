# Agentveiledning – bruke Knutepunkt via nettleser

Verktøyet er laget for at en agent (Claude i Chrome, Playwright, o.l.) skal kunne betjene det uten
kjennskap til koden.

## Navigasjon
- Steg velges i venstre kolonne: `[data-testid="step-1"]` … `step-5`, eller knappene `prev`/`next`.
- Alle inndatafelt har `data-testid` lik tilstandsstien, f.eks. `members.m1.t`, `fastener.d`,
  `pattern.a1`, `loads.0.Fx`, `serviceClass`.
- Forbindelsestype: `kind-tt-single`, `kind-tt-double`, `kind-st-single`, `kind-st-double-central`, `kind-st-double-outer`.
- Festemiddeltype: `ftype-screw`, `ftype-nail`, `ftype-bolt`, `ftype-dowel`. Forvalg: `fastener.preset`.
- Laster: `add-load`, `loads.<i>.delete`.
- Resultat: `utilization` (sidepanel), tabeller `results`, `modes`, `spacing`, `trace`.
- Rapport: `preview-report`, `print-report`, `close-report`.
- Feil og advarsler i sidepanelet: `[data-testid="error"]`, `[data-testid="warning"]`.

## Tilstand i URL
Hele beregningen er JSON i `location.hash` (URL-kodet). En agent kan konstruere en fullstendig
beregning ved å åpne `index.html#<encodeURIComponent(JSON)>`.

## JavaScript-API (raskere enn klikking)
```js
knutepunkt.getState()                 // full tilstand
knutepunkt.setState({ pattern: { n1: 3 }, loads: [...] })   // dyp sammenslåing, rerender, returnerer resultat
knutepunkt.getResult()                // { util, status, worst: {combo, Fd_kN, Rd_kN, mode}, errors, warnings, spacing, trace }
knutepunkt.goTo(5); knutepunkt.openReport(); knutepunkt.reset()
knutepunkt.kinds, knutepunkt.timber, knutepunkt.presets, knutepunkt.loadCategories
```

## Tilstandsskjema
```json
{
  "step": 1,
  "project": { "name": "", "part": "", "author": "", "date": "2026-09-08" },
  "connection": { "kind": "tt-single", "theta": 90 },
  "members": { "m1": { "grade": "C24", "t": 48, "h": 198 }, "m2": { "grade": "GL30c", "t": 140, "h": 315 }, "steel": { "grade": "S355", "t_s": 8 } },
  "fastener": { "type": "screw", "presetId": "skrue_8", "d": 8, "d1": 5.2, "d_head": 15, "f_u": 800, "f_tensk": 20000, "l": 160, "predrilled": true, "fullyThreaded": true, "M_yRk_override": null, "eta": "" },
  "pattern": { "n1": 2, "n2": 3, "a1": 60, "a2": 40, "a3": 100, "a4": 60 },
  "serviceClass": 1,
  "loads": [ { "name": "G", "category": "G", "Fx": 0, "Fy": 2 } ]
}
```
Lastkategorier: `G, Q_A, Q_B, Q_C, Q_E, S, W`. Fx = langs fiber i del 1, Fy = på tvers (kN, karakteristisk).

## Typisk agentflyt
1. Åpne siden, `reset()`.
2. `setState({...})` med geometri, festemiddel, laster.
3. Les `getResult()`. Hvis `errors` ikke er tom: rett avstander (`spacing` viser `min` vs `actual`).
4. Iterér `pattern` til `util ≤ 1` og `errors = []`.
5. `openReport()` → nettleserens «Lagre som PDF» (A4).
