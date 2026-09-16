# concrete_section_calculator — endringsrunde 2

> Tillegg til `concrete_section_calculator-plan.md`. Hovedplanen beskriver det som står og
> er verifisert; denne fila er kontrakten for endringene. Der de er i konflikt, gjelder
> denne.
>
> **Skrevet for å kunne følges uten å ta designbeslutninger.** Alle signaturer, strenger,
> testtall og kallsteder er ferdig bestemt. Er noe likevel uklart: spør, ikke gjett.
> Ikke «forbedre» noe som står her.
>
> **§10 er en trinnvis oppgaveliste per agent. Start der.** Resten er oppslagsverk.

## 0. Bestillingen

1. Siden skal være på **engelsk**.
2. Nye og **dupliserte** lag plasseres etter **EC2 8.2** med riktig fri avstand.
3. **k1 og k2** som brukerstyrte parametere, anbefalt 1 og 5.
4. Brukeren velger **analyse** — finnes, flyttes til eget steg (§6).
5. **Lastkombinasjoner** for kapasitetssjekken.
6. **Serialiserbart** oppsett — lagre og laste JSON.
7. **Endret diameter oppdaterer plasseringen**, med mindre `d_c` er satt manuelt.

## 0.1 Testkonvensjon — gjelder overalt

Motorderiverte tall er flyttall og skal **aldri** sammenliknes med `assert.equal`. Legg
denne hjelperen i hver testfil som trenger den:

```js
function assertClose(actual, expected, rel = 1e-9, msg = '') {
  const a = Number(actual), e = Number(expected);
  assert.ok(Number.isFinite(a), `${msg} ikke et tall: ${actual}`);
  assert.ok(Math.abs(a - e) <= Math.abs(e) * rel + 1e-12,
    `${msg} ${a} != ${e}`);
}
```
`assert.equal` brukes **bare** for heltall, strenger, booleans og geometri regnet i JS
(§2.3 og §3.3 — de er eksakte).

---

## 1. Språk

Alt **brukersynlig** blir engelsk. **Kodekommentarer forblir norske** — husstilen i denne
modulen og i `geometry_workspace`; en halvveis oversettelse er verre enn ingen.

### 1.1 Ordliste — bruk disse, ikke synonymer

| norsk | engelsk |
|---|---|
| tverrsnitt | cross-section |
| bjelke / plate | beam / slab |
| armering, armeringslag | reinforcement, reinforcement layer |
| overdekning | cover |
| bøyle | stirrup |
| senteravstand (c/c) | spacing |
| fri avstand | clear distance |
| største tilslagsstørrelse | maximum aggregate size |
| strekk / trykk | tension / compression |
| feltmoment / støttemoment | sagging / hogging |
| bøyekapasitet | bending resistance |
| moment–krumning | moment–curvature |
| kapasitetsomhylling, M–N-diagram | interaction domain |
| lastvirkning | applied action |
| lastkombinasjon | load combination |
| utnyttelse | utilisation |
| nøytralakse | neutral axis |
| trykksone | compression zone |
| trykkant | compression face |
| tøyning / spenning | strain / stress |
| bruddform | failure mode |
| trykkbrudd i betongen | concrete crushing |
| strekkbrudd i armeringen | steel rupture |
| minimumsarmering | minimum reinforcement |
| advarsel / merknad / feil | warning / note / error |
| lastvei | load path |

### 1.2 Hvor norsk tekst faktisk finnes — uttømmende, med eier

Hentet med grep over hele modulen. Dekker også filer et tidligere utkast feilaktig
erklærte urørt.

| fil | hva | eier |
|---|---|---|
| `js/results.js` | alle tabellene i §1.3, og `fmtNumber()` sin `replace('.', ',')` | **B4** |
| `js/report.js` | ~129 linjer prosa, hele kapittel 7 «Forutsetninger og metode» | **B4** |
| `index.html` | ~51 linjer synlig tekst, knapper, hjelpetekst, `<title>`/`<meta>` | **B3** |
| `js/ui.js` | ~40 linjer, inkl. `ANALYSIS`-beskrivelsene | **B3** |
| `js/charts.js` | `N [kN] (trykk negativ)`, `flyt:`, `lastvei (sekundær)`, `replace('.', ',')` | **B5** |
| `js/section-draw.js` | lagetiketter, `aria-label="Tverrsnitt …"`, `replace('.', ',')` | **B5** |
| `js/numeric-input.js` | `replace('.', ',')` i `formatNumber` | **B5** |
| `python/engine.py` | ~157 linjer advarsels- og feiltekst som når rapporten via `detail` | **B2** |

**Desimalskilletegnet skal endres alle fire steder** (`results.js`, `charts.js`,
`section-draw.js`, `numeric-input.js`). Ellers trykker rapporten `M_Rd = 215006759.19` ved
siden av en figur merket `dc = 141,5 mm`.

### 1.3 Tabeller i `results.js` — oversett verdiene, aldri nøklene

`CODE_MESSAGES`, motorkoder: `no_convergence`, `mc_truncated`, `mc_endpoint_mismatch`,
`bar_in_compression_zone`, `axial_out_of_range`, `as_min_not_met`, `as_max_exceeded`,
`ductility_limit`, `bar_outside_section`

`CODE_MESSAGES`, valideringskoder: `invalid_height`, `invalid_width`, `no_reinforcement`,
`invalid_alpha_cc`, `invalid_gamma_c`, `invalid_gamma_s`, `invalid_k`, `layer_too_wide`,
`layers_overlap`, **`insufficient_layer_spacing`** (ny, §2.4)

`CODE_MESSAGES`, kjøretidskoder: `runtime_load_failed`, `engine_error`, `worker_error`,
`cancelled`, `invalid_payload`, `schema_mismatch`, **`document_not_recognised`**,
**`document_field_ignored`**, **`document_field_defaulted`** (nye, §5)

`SEVERITY_LABELS`, `FAILURE_MODES`, `CHECK_LABELS`, `DIRECTION_LABELS`, `ANALYSIS_LABELS`,
`SECTION_TYPE_LABELS` — alle verdier.

### 1.4 Ordrette oversettelser der presisjonen betyr noe

| nøkkel | engelsk verdi |
|---|---|
| `DIRECTION_LABELS.sagging` | `Sagging — compression at the top face (θ = 0)` |
| `DIRECTION_LABELS.hogging` | `Hogging — compression at the bottom face (θ = π)` |
| `ANALYSIS_LABELS.bending` | `Bending resistance` |
| `ANALYSIS_LABELS.moment_curvature` | `Moment–curvature` |
| `ANALYSIS_LABELS.nm_domain` | `N–M interaction domain` |
| `SECTION_TYPE_LABELS.slab` | `Slab (per metre width)` |
| `CHECK_LABELS.as_min_ok` | `Minimum reinforcement A_s,min (EC2 9.2.1.1)` |
| `CHECK_LABELS.ductility_ok` | `Ductility — tension reinforcement yields at failure` |
| `FAILURE_MODES.concrete_crushing.name` | `Concrete crushing` |
| `FAILURE_MODES.steel_rupture.name` | `Steel rupture` |
| `FAILURE_MODES.over_reinforced.name` | `Over-reinforced — steel does not yield` |
| `FAILURE_MODES.compression_no_tension.name` | `Compression only — no tension zone` |
| `HEADLINE_UTILISATION_LABEL` | `η = M_Ed / M_Rd(N_Ed)` |
| `RADIAL_UTILISATION_LABEL` | `λ (load path — secondary)` |
| `CODE_MESSAGES.layers_overlap` | `Reinforcement layers overlap. The calculation is still valid, but the input is almost certainly wrong.` |
| `CODE_MESSAGES.axial_out_of_range` | `N_Ed is outside the section's axial capacity [N_min, N_max].` |
| `CODE_MESSAGES.insufficient_layer_spacing` | `Clear distance between reinforcement layers is below the EC2 8.2(2) minimum.` |
| `CODE_MESSAGES.document_not_recognised` | `This is not a concrete section calculator file.` |
| `CODE_MESSAGES.document_field_ignored` | `An unknown field in the file was ignored.` |
| `CODE_MESSAGES.document_field_defaulted` | `A missing field in the file was filled with its default.` |

`<title>`: `Concrete section ULS — bending resistance, M–κ and N–M to EC2`.
`<meta name="description">` og `keywords` oversettes tilsvarende — registeret og
søkemotorer leser dem.

### 1.5 Mekanisk kontroll — påkrevd, og stor `Ø` er unntatt

```js
// Stor `Ø` er IKKE med: det er diametersymbolet, og står i helt korrekt engelsk
// utdata som «3Ø20» og «Ø12 c/c 113». Tas den med, kan testen aldri bli grønn.
const NORDIC = /[æåÆÅø]/;
```
**Liten `ø` er med, stor `Ø` er ikke.** Diametersymbolet skrives alltid med stor Ø; finner
du liten `ø` i et diameteruttrykk, er det en skrivefeil som skal rettes.

```js
// Kun ord som er norske og IKKE også engelske. «last», «tall», «lag» og «plate»
// er bevisst UTE — de er engelske ord og ville gitt falske treff på korrekt
// engelsk tekst som «the last point» eller «tall section».
const NORWEGIAN_WORDS = new RegExp(
  '\\b(' + [
    'ikke', 'kapasitet', 'armering', 'tverrsnitt', 'beregning', 'utnyttelse',
    'advarsel', 'merknad', 'bjelke', 'krumning', 'overdekning', 'lastvirkning',
    'avstand', 'bredde', 'verdi', 'tverrsnittet', 'armeringen',
  ].join('|') + ')\\b',
  'i',
);
```

Verifisert ved kjøring: treffer «Kapasiteten er ikke tilstrekkelig» og «Armering i
underkant», og lar «Bending resistance of the cross-section», «The last point is tall and
the plate lags» og «Minimum reinforcement A_s,min (EC2 9.2.1.1)» passere.

**Hvor den kjøres:**
- `tests/results.test.mjs` (B4): rekursivt over alle tabellene i §1.3.
- `tests/report.test.mjs` (B4): mot hele `buildReportHtml()` for alle tre analysene.
- `tests/charts.test.mjs` (B5): mot alle tre SVG-funksjonenes utdata.
- `index.html` og `ui.js` (B3): ingen automatisk test. B3 kjører
  `grep -nE "[æåÆÅø]" index.html js/ui.js`, går gjennom hvert treff, og **rapporterer i
  sluttmeldingen hvilke som er kommentarer og dermed skal stå.**

---

## 2. EC2 8.2 — fri avstand

EC2 8.2(2): fri avstand (horisontalt og vertikalt) mellom parallelle stenger eller
horisontale lag skal ikke være mindre enn den største av **k1·stangdiameter**,
**(d_g + k2 mm)** og **20 mm**. Anbefalt k1 = 1, k2 = 5.

Fri avstand er **overflate til overflate**. Senteravstand = fri avstand + Ø_a/2 + Ø_b/2.
Dette er det enkleste stedet i hele runden å ta feil.

### 2.1 Ny tilstand — `store.js`
```js
spacing: { k1: 1.0, k2: 5.0, d_g: 16 },   // EC2 8.2(2). k1/k2 er NA-parametere.
```
Toppnivå, ved siden av `cover`. `d_g` er ikke en NA-parameter, men inngår i samme formel;
16 mm er vanlig, 8/22/32 forekommer.

`section.js` eksporterer i dag `MIN_CLEAR_SPACING = 20`. **Behold den**, og bruk den som
20-leddet inne i `minClearDistance` — ikke skriv 20 som magisk tall.

### 2.2 Nye funksjoner i `rebar.js` — fullstendige

```js
export function minClearDistance(dia, spacing = {}) {
  const k1 = Number(spacing.k1 ?? 1);
  const k2 = Number(spacing.k2 ?? 5);
  const dg = Number(spacing.d_g ?? 16);
  return Math.max(k1 * Number(dia || 0), dg + k2, MIN_CLEAR_SPACING);
}

/** To lag med ulik diameter: den STØRSTE styrer. EC2 sier ikke hvilken; den
 *  største er den konservative og eneste entydige lesningen. */
export function minClearBetween(diaA, diaB, spacing = {}) {
  return minClearDistance(Math.max(Number(diaA || 0), Number(diaB || 0)), spacing);
}

/** Lagene på `edge`, sortert etter STIGENDE dc (ytterst først). Ikke-endelige
 *  dc behandles som Infinity, så de havner sist og blir aldri referanse. */
export function layersOnEdge(layers = [], edge) {
  return layers
    .filter((l) => l && l.edge === edge)
    .slice()
    .sort((a, b) => (Number.isFinite(a.dc) ? a.dc : Infinity)
                  - (Number.isFinite(b.dc) ? b.dc : Infinity));
}

/** Laget lengst INN fra kanten (størst endelig dc), eller null. */
export function innermostLayer(layers = [], edge) {
  const on = layersOnEdge(layers, edge).filter((l) => Number.isFinite(l.dc));
  return on.length ? on[on.length - 1] : null;
}

/** dc for et NYTT lag på `edge` med diameter `dia`. */
export function stackedDc(state = {}, edge, dia) {
  const inner = innermostLayer(state.layers, edge);
  if (!inner) return suggestedDc(state, dia);
  return inner.dc + (inner.dia + dia) / 2
       + minClearBetween(inner.dia, dia, state.spacing);
}
```

### 2.3 Testtall — eksakte, `assert.equal` er riktig her

Standardtilstand: `cover 35`, `stirrup_dia 8`, `cover_side 35`,
`spacing {k1:1, k2:5, d_g:16}`.

| uttrykk | svar |
|---|---|
| `minClearDistance(20, std)` | `21` |
| `minClearDistance(8, std)` | `21` |
| `minClearDistance(32, std)` | `32` |
| `minClearDistance(20, {k1:1,k2:5,d_g:32})` | `37` |
| `minClearDistance(20, {k1:1.5,k2:5,d_g:16})` | `30` |
| `minClearBetween(20, 25, std)` | `25` |
| `suggestedDc(std, 20)` | `53` |
| `stackedDc` L2 Ø20 etter L1 Ø20@53 | `94` |
| `stackedDc` L3 Ø25 etter L2 Ø20@94 | `141.5` |
| samme, `d_g = 32` → L2 | `110` |
| samme, `k1 = 1.5` → L2 | `103` |

### 2.4 Validering — `section.js`

Regel 2 (bjelke, plass i bredden) bruker i dag `s_fri ≥ max(dia, 20)`. Skal bruke
`minClearDistance(dia, state.spacing)`. Forblir **`error`**.

Krav: `b ≥ 2·(cover_side + stirrup_dia) + count·dia + (count − 1)·clear`

| tilfelle | regnestykke | utfall |
|---|---|---|
| 3Ø20, b = 300 | 2·43 + 60 + 2·21 = 188 | OK |
| 10Ø8, b = 300 | 2·43 + 80 + 9·21 = 355 | `layer_too_wide` |

**Eksisterende tester i `tests/section.test.mjs:175–197` endrer ikke utfall**, men tallene
i kommentarene blir gale (10Ø8 går fra 340 til 349). **Oppdater kommentarene.**

**Ny regel `insufficient_layer_spacing`, severity `warning`.** For hvert nabopar i
`layersOnEdge(layers, edge)` — altså **sortert etter dc**, ikke arrayrekkefølge:
```
fri = Math.abs(b.dc - a.dc) - (a.dia + b.dia) / 2;
hvis fri < minClearBetween(a.dia, b.dia, spacing)  ->  warning
```
Advarsel, ikke feil: beregningen er gyldig, det er et utførbarhetsproblem, og brukeren kan
ha overstyrt `d_c` bevisst.

---

## 3. Automatisk `d_c` (bestillingens punkt 7)

### 3.1 Lagobjektet får ett felt
```js
{ id, mode, dia, count|spacing, edge, dc, dc_auto: true }
```

**Når flippes `dc_auto` til `false`?** Når brukeren **skriver en verdi i `d_c`-feltet**.
Det er brukerens egen formulering, og det er regelen som gjelder. Hengelåsen i UI er
*visningen* av flagget pluss veien tilbake: klikk på en åpen lås setter `dc_auto: true` og
regner `dc` på nytt umiddelbart. Begge veier skal virke.

`createLayer()` i `rebar.js` setter `dc_auto: true`.
`payload.js` sender **ikke** `dc_auto` videre.

### 3.2 `recomputeAutoDc(state) -> layers`
Ren funksjon i `rebar.js`. Returnerer en **ny** array, muterer ikke inndata, og bevarer
rekkefølgen i `state.layers`.

```
for hver kant i ['bottom', 'top']:
    prev = null
    for hvert lag i layersOnEdge(state.layers, edge):     // sortert etter dc
        hvis lag.dc_auto:
            lag.dc = prev
                ? prev.dc + (prev.dia + lag.dia)/2
                          + minClearBetween(prev.dia, lag.dia, state.spacing)
                : suggestedDc(state, lag.dia)
        prev = lag        // ogsaa naar dc_auto er false — et laast lag er referanse
```

### 3.3 Testtall — hver rad starter fra START, ikke fra forrige rad
START: L1 Ø20 bunn `dc_auto:true`, L2 Ø20 bunn `dc_auto:true` ⇒ `dc` = 53 og 94.

| endring fra START | L1 | L2 |
|---|---|---|
| L1 → Ø32 | `59` | `117` |
| L2 låst (`dc_auto:false`, `dc:120`), L1 → Ø20 | `53` | `120` |
| `cover` 35 → 45 | `63` | `104` |

### 3.4 `store.js` — eksakt hvor `recomputeAutoDc` hektes på

Eksisterende metoder: `setState`, `patch(group, values)`, `setSectionType`, `addLayer`,
`updateLayer`, `duplicateLayer`, `removeLayer`, `resyncCover`, `setResult`, `replaceState`.

| metode | endring |
|---|---|
| `setState` | etter oppdatering: hvis `cover` eller `stirrup_dia` endret ⇒ `recomputeAutoDc` |
| `patch('spacing', …)` | alltid `recomputeAutoDc` |
| `addLayer` | nytt lag får `dc = stackedDc(state, edge, dia)` og `dc_auto: true`, deretter `recomputeAutoDc` |
| `updateLayer` | `dia` eller `edge` i patchen ⇒ `recomputeAutoDc`. `dc` i patchen ⇒ sett `dc_auto: false` på det laget **først**, så `recomputeAutoDc` |
| `duplicateLayer` | kopien får **alltid `dc_auto: true`** og ny `dc` fra `stackedDc`, uansett kilden. Dette er bestillingens punkt 2 — en kopi som arvet en låst `dc` ville landet oppå originalen |
| `removeLayer` | etter fjerning: `recomputeAutoDc` |
| `setSectionType` | felt-lista som bygger om lagene **må få med `dc_auto`**; i dag er den `{id, mode, dia, spacing, edge, dc}` og ville nullstilt låsen ved hvert bjelke/plate-bytte |
| `resyncCover` | **slettes.** Den gjør `dc_auto`-blind omregning og ville overskrevet låste lag. `recomputeAutoDc` erstatter den fullt ut. Fjern også kallstedet i `ui.js` (B3) |
| `cloneState` | `loads: { ...s.loads }` **erstattes** av dyp klone av `combos`-arrayet, og `spacing` må legges til. En array spredd inn i et objekt blir `{0:…,1:…}` — slik viser denne feilen seg |
| `replaceState` | bumper `layerSeq` fra `layers.length`; gjør det samme for en ny `comboSeq` fra `combos.length` |

Nye metoder: `addCombo`, `updateCombo`, `removeCombo`, `setActiveCombo`. `removeCombo` av
den aktive flytter `activeCombo` til første gjenværende; den siste kombinasjonen kan ikke
fjernes.

---

## 4. Lastkombinasjoner

### 4.1 Tilstand — `loads` erstattes av `combos`
```js
combos: [ { id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, direction: 'sagging' } ],
activeCombo: 'C1',
```
kN og kNm. **Trykk er negativ N.** `M_Ed` er en **størrelse** i retningen kombinasjonen
angir.

**Retning per kombinasjon.** Et støttesnitt har ofte både felt- og støttemoment, og siden
M–N-omhyllingen allerede dekker begge grener (`complete_domain: true`, fortegnsatt `m`) er
dette nesten gratis. Nye rader arver tilstandens `direction` som standard. Tilstandens
`direction` beholdes og styrer tverrsnittstegningens trykksone, som etter en kjøring viser
**governing** kombinasjonens retning.

Id-er lages som lagene: `C1`, `C2`, … fra en `comboSeq` som aldri teller ned.

### 4.2 Payload
```json
"loads": {
  "combinations": [
    { "id": "C1", "name": "ULS 1", "N_Ed": 0.0, "M_Ed": 0.0, "theta": 0.0 }
  ],
  "active": "C1"
}
```
N og Nmm; `payload.js` konverterer fra kN/kNm og oversetter `direction` → `theta`
(`sagging` → 0, `hogging` → π).

**Motoren skal ALSO godta den gamle formen** `{"N_Ed": …, "M_Ed": …}` og behandle den som
én kombinasjon `{id:'C1', name:'', theta: options.theta}`. Det er dette som holder de
committede fixturene og `tests/python/test_engine.py` gyldige.

`options.theta` beholdes som standardretning for kombinasjoner uten egen `theta`.

### 4.3 Resultat — hele konvolutten, ikke bare analyseblokka

```json
"combinations": [
  { "id": "C1", "name": "ULS 1", "N_Ed": -500000.0, "M_Ed": 250000000.0,
    "theta": 0.0, "M_Rd": 305396902.98483205, "utilisation": 0.818606860634787,
    "x": 187.78, "x_over_d": 0.3414, "eps_a": …, "chi_y": …,
    "eps_c_top": -0.0035, "eps_s_max": 0.00675,
    "failure_mode": "concrete_crushing", "layers": [ … ],
    "within_limits": true }
],
"governing": "C2"
```

Feltet heter **`within_limits`**, ikke `ok` — resultatet har allerede et `ok` på toppnivå,
og to `ok` med ulik betydning i samme dokument er en felle.

**`governing` bestemmes slik, i denne rekkefølgen:**
1. Bare kombinasjoner med `within_limits: true` er kandidater.
2. Blant dem: størst `utilisation`.
3. **Uavgjort, inkludert når alle er 0** — og det er ikke hypotetisk, den committede
   fixturen har `M_Ed = 0` — ⇒ **første i `combinations`-rekkefølgen vinner.**
4. Ingen kandidater ⇒ `governing: null`, og toppnivåfeltene beholder verdiene fra den
   **første** kombinasjonen, slik at figurer og tabeller har noe å vise.

**Disse skal alle speile GOVERNING kombinasjonen:**
- analyseblokkas egne felt: `M_Rd`, `N_Ed`, `M_Ed`, `x`, `x_over_d`, `eps_a`, `chi_y`,
  `eps_c_top`, `eps_s_max`, `failure_mode`, `layers`, `utilisation`
- `section_props.d_eff`, `d_eff_all`, `As_tension`, `rho`, `As_min`
- `checks.ductility_ok`, `checks.as_min_ok`, `checks.all_ok`
- `meta.moment_sign`, `meta.theta`, `meta.direction`

Det er **dette** som gjør at `charts.js`, `results.js` sin `failureState()` og hele
rapporten fortsetter å virke uendret. Uten det ville de lest et tilfeldig lastkall.

`nm_domain` beholder **`M_Rd_at_N`** som i dag (`results.js:606` leser den), og får i
tillegg `M_Rd` med **samme verdi**. Ikke fjern `M_Rd_at_N`.

`moment_curvature` får `combinations` med **ett** element (den aktive), og
`meta.mc_active_combo` med id-en. De andre analysene setter ikke det feltet.

### 4.4 Aksialsjekken per kombinasjon

`n_min ≤ N_Ed ≤ n_max` sjekkes per kombinasjon. Utenfor ⇒ `within_limits: false`,
`M_Rd: null`, `utilisation: null`, og en `axial_out_of_range`-advarsel. Den skal **ikke**
stoppe de øvrige.

`checks.axial_ok` er `true` **bare hvis alle** er innenfor. Toppnivå-`ok` forblir `true`
så lenge minst én kombinasjon lot seg regne; er ingen det, `ok: false` med
`error.code = 'axial_out_of_range'`.

**Å navngi kombinasjonen i advarselen:** `results.js` sin `normaliseWarning` kaster
motorens `message` for kjente koder og bruker `CODE_MESSAGES[code]`. Motoren skal derfor
legge id og navn i **egne felt**:
```json
{ "code": "axial_out_of_range", "severity": "warning",
  "combo": "C3", "combo_name": "ULS 3", "message": "…", "detail": "…" }
```
`results.js` setter `combo_name` (eller `combo`) foran den engelske teksten når feltet
finnes. Da overlever navnet kodetabellen.

### 4.5 Framdrift — én skriver, ikke to

`bending` og `nm_domain`: `progress('solve', i, antall_kombinasjoner)`.

`moment_curvature` har allerede en indre løkke over 20 punkter, og kjører per §4.3 **én**
kombinasjon. Dagens `progress('solve', i, n_points)` beholdes uendret. Det er ingen
konflikt så lenge M–κ er begrenset til én kombinasjon — og det er den.

### 4.6 Testtall — full presisjon, bruk `assertClose`

Fixturens materialer (`payload-beam-300x600.json`, **α_cc = 1,0**, stål `elasticplastic`),
kjørt mot ekte motor:

| kombinasjon | N_Ed | M_Ed | M_Rd [Nmm] | utilisation |
|---|---|---|---|---|
| C1 | 0 kN | 150 kNm | `215006759.18601915` | `0.6976524857538235` |
| C2 | −500 kN | 250 kNm | `305396902.98483205` | `0.818606860634787` |

`governing` = `C2`. Toppnivå-`M_Rd` skal da være C2 sin.
`n_min = -4010438.409731036`, så en C3 med `N_Ed = -5000 kN` gir `within_limits: false`
uten å påvirke C1 og C2.

### 4.7 Hvert kallsted for `state.loads` — uttømmende

| fil:linje | i dag | skal bli | eier |
|---|---|---|---|
| `js/store.js:66` | `defaultState().loads` | `combos` + `activeCombo` | B1 |
| `js/store.js:84` | `cloneState` `loads: {...s.loads}` | dyp klone av `combos` | B1 |
| `js/payload.js:110` | `const loads = state.loads` | les `state.combos` | B1 |
| `js/payload.js:149` | `loads: { N_Ed, M_Ed }` | §4.2-formen | B1 |
| `js/report.js:424,427` | reserve `state.loads.N_Ed/M_Ed` | reserve til governing/aktiv kombinasjon | B4 |
| `js/ui.js:282,283` | `bindField('#i-n-ed'/'#i-m-ed')` | rad i kombinasjonstabellen | B3 |
| `js/ui.js:325,326` | `put('#i-n-ed', …)` | samme | B3 |
| `js/ui.js:727` | live η-omregning fra `state.loads.M_Ed` | **utgår** | B3 |
| `js/ui.js:777` | banneret «M_Ed er endret …» | **utgår** | B3 |
| `js/ui.js:184,240–259,280–283` | `markLoadChange()`-heuristikken | **utgår** | B3 |
| `index.html:435–438` | `MODULE_CONFIG.inputs['loads.N_Ed'/'loads.M_Ed']` | §4.8 | B3 |
| `tests/payload.test.mjs:48,128–140` | fire påstander | skriv om til `combos` | B1 |
| `tests/report.test.mjs:57`, `tests/section.test.mjs:48` | testtilstander | oppdater | B4 / B1 |

**`markLoadChange()`-heuristikken utgår.** I dag er `M_Ed` det eneste som ikke ugyldiggjør
resultatet. Med kombinasjoner holder det ikke: `governing` kan bytte rad når en `M_Ed`
endres, og da er både toppnivåfeltene og plottet feil. **Enhver endring i `combos`
ugyldiggjør `state.result`.** Det fjerner et særtilfelle og forenkler `invalidate()`.

### 4.8 `MODULE_CONFIG` og `ModuleAPI`

`MODULE_CONFIG.inputs['loads.N_Ed']` og `['loads.M_Ed']` fjernes og erstattes av `combos`
(type `array`, kategori `loads`) og `activeCombo` (type `string`). `README.md` sin liste
over avvik fra `plan_IO-structure_for_modules.md` får et **femte punkt**: lastvirkningen er
nå en liste, ikke to skalarer, og en konsument som satte `loads.N_Ed` må sette `combos`.
Å la et brutt felt stå udokumentert ville vært verre enn bruddet.

---

## 5. Serialisering

Ny fil **`js/serialize.js`**, ren og DOM-fri.

```js
export const DOCUMENT_FORMAT = 'concrete-section-calculator';
export const DOCUMENT_SCHEMA = 1;
export function toDocument(state) { … }
export function fromDocument(doc) { … }   // -> { state, notes }
```

**Det finnes ingen gamle filer.** Lagring og lasting er ny funksjonalitet i denne runden,
så ingen har noensinne lagret noe. **Ikke skriv migreringskode.** `DOCUMENT_SCHEMA` er
filformatets egen versjon og starter på 1 — den er **ikke** `SCHEMA_VERSION` i `meta.js`,
som versjonerer payload/resultat-kontrakten mot motoren. To tall, to formål; ikke slå dem
sammen.

`toDocument(state)`:
```json
{ "format": "concrete-section-calculator", "doc_schema": 1,
  "app_version": "<MODULE_VERSION fra meta.js>",
  "saved_at": "<new Date().toISOString()>",
  "state": { … uten `result` … } }
```

`fromDocument(doc)` returnerer `{ state, notes }`:
- `doc` ikke et objekt, eller `doc.format !== DOCUMENT_FORMAT` ⇒
  `{ state: null, notes: [{code:'document_not_recognised', severity:'error'}] }`.
  **Kaster aldri.**
- Bygg `{ ...defaultState(), ...doc.state }`, og deretter felt for felt for de nøstede
  gruppene (`geometry`, `concrete`, `steel`, `spacing`, `doc`), slik at en fil som mangler
  `spacing.k2` får standardverdien og ikke `undefined`.
- Ukjente **toppnivå**nøkler droppes med én `{code:'document_field_ignored', severity:'info'}`
  per nøkkel. Manglende toppnivånøkler fylles med én `{code:'document_field_defaulted'}`
  per nøkkel.
- **Ukjente nøkler inne i `layers[i]` og `combos[i]` droppes IKKE** feltvis — `mode:'bars'`
  mangler legitimt `spacing` og omvendt, så feltvis rensing der ville slettet gyldige data.
  Normaliser i stedet hvert lag gjennom `createLayer()` og hver kombinasjon gjennom et
  tilsvarende `createCombo()`.
- `state.result` settes **alltid** til `null`.

### 5.1 Test
- Rundtur: `fromDocument(toDocument(s)).state` skal `deepEqual` `{...s, result: null}`.
  Sett `s.result = null` i testtilstanden, så er begge sider like uten særtilfeller.
- `fromDocument(null)`, `fromDocument({})`, `fromDocument({format:'annet'})` ⇒
  `state === null`, én `document_not_recognised`, ingen kast.
- Fil uten `spacing` ⇒ standard `{k1:1,k2:5,d_g:16}` og én `document_field_defaulted`.
- Fil med `state.tullefelt` ⇒ én `document_field_ignored`, resten uendret.

### 5.2 UI
Knappene **«Save JSON»** og **«Load JSON»** i dokumentasjonsseksjonen. Lagring via `Blob`
+ `URL.createObjectURL`, filnavn `<doc.title eller 'section'>.csc.json` med alt utenom
`[A-Za-z0-9_-]` erstattet av `-`. Lasting via skjult `<input type="file" accept=".json">`.
Notene fra `fromDocument` vises i samme liste som andre advarsler.

---

## 6. Analysevalget

Flyttes fra lastseksjonen til eget steg **«5 · Analysis»** rett før beregningen:

| valg | engelsk undertekst |
|---|---|
| Bending resistance | `M_Rd for every load combination. About 55 ms per combination.` |
| Moment–curvature | `M(κ) for the active load combination only. 20 points, about 1.8 s.` |
| N–M interaction domain | `Full capacity envelope with every load combination plotted. About 125 ms plus 55 ms per combination.` |

Tidene er de **målte** fra hovedplan §3.7 (54 ms per bøyekall), ikke anslag.

«Calculate»-knappen sier hva den kjører: `Calculate bending resistance` osv.

Seksjonsnummereringen forskyves, og `IntersectionObserver`-navigasjonen og
`data-section`-attributtene må følge med. Dette er en flytting, ikke ny funksjonalitet.

**M–κ skal ikke kunne leses som «for alle kombinasjoner»** — kortet sier «active load
combination only», og UI viser hvilken som er aktiv.

---

## 7. `charts.js` — flere lastpunkter

Ny oppførsel i `nmDomainSvg` når `dom.combinations` finnes og er ikke-tom:
- ett punkt per kombinasjon med `within_limits: true`
- **governing**: fylt markør, etikett med `name` (eller `id`),
  `data-role="load-point-governing"`
- **øvrige**: markør uten fyll (`fill="none"`, samme `stroke`), ingen etikett,
  `data-role="load-point"`
- strålen tegnes **bare** for governing, som i dag
- **autoskaleringen må inkludere alle punktene.** `charts.js:465–467` bygger i dag
  min/maks fra omhyllingen pluss det ene lastpunktet; alle kombinasjonspunktene skal inn i
  de samme arrayene, ellers havner en kombinasjon utenfor omhyllingen off-canvas uten at
  noe sier fra.
- enheter: `combinations[i].N_Ed`/`M_Ed` er **N og Nmm** som resten av `dom`. Samme
  `/1000` og `/1e6` som linje 461–462.

Mangler `dom.combinations`, oppfører funksjonen seg **nøyaktig som i dag** — den gamle
`N_Ed`/`M_Ed`-veien beholdes som reserve, så de committede fixturene fortsatt tegner.

---

## 8. Fixturene

Eies av **koordinator**, ikke av noen agent. Etter bølge 1 regenereres de og **diffes mot
de gamle**: samme fysiske tilfelle skal gi nøyaktig samme `M_Rd`, `x`, `kappa`, `moment`,
`n`, `m`. Endrer et av dem seg, er det en feil.

De **får** nye nøkler (`combinations`, `governing`, `within_limits`). `tests/charts.test.mjs`
og `tests/report.test.mjs` kan derfor trenge oppdaterte forventninger — B5 og B4 eier hver
sine og skal sjekke det eksplisitt.

---

## 9. Aksept

- [ ] §1.5-testene grønne i `results`, `report` og `charts`; B3 har rapportert grep-treffene
      for `index.html` og `ui.js` og bekreftet at bare kommentarer står igjen
- [ ] Desimalskilletegnet endret i **alle fire** filene
- [ ] `npm run test:concrete-section` og `pytest tests/python/` grønne
- [ ] Fixturene regenerert, og `M_Rd`/`x`/`kappa`/`moment`/`n`/`m` **numerisk uendret**
- [ ] Alle testtallene i §2.3, §3.3 og §4.6 påstått, med `assertClose` der §0.1 krever det
- [ ] Duplisering av et låst lag gir en kopi med `dc_auto: true`, stablet etter EC2 8.2
- [ ] Diameterendring flytter et `dc_auto`-lag; `dc_auto: false` står urørt
- [ ] `setSectionType` mister ikke `dc_auto`; `resyncCover` er borte
- [ ] k1, k2 og d_g har felt i UI og slår gjennom i plassering og validering
- [ ] Tre kombinasjoner gir tre rader, riktig `governing`, og én utenfor `[n_min, n_max]`
      velter ikke de to andre
- [ ] `section_props`, `checks` og `meta` speiler governing (§4.3)
- [ ] Alle utnyttelser 0 gir `governing` = første kombinasjon, ikke `null`
- [ ] Retning per kombinasjon virker; en hogging-rad plottes på negativ m i M–N
- [ ] Lagre/laste gir identisk tilstand; `fromDocument(null)` kaster ikke
- [ ] Analysevalget er eget steg; «Calculate» sier hva den kjører
- [ ] M–N tegner alle kombinasjoner, governing markert, ingen punkter off-canvas
- [ ] `README.md` har det femte avvikspunktet om `combos` (§4.8)
- [ ] Nettleserverifisering bestått på nytt

---

## 10. Oppgaveliste per agent — start her

### B1 — modell
Eier: `js/rebar.js`, `js/section.js`, `js/store.js`, `js/payload.js`, `js/serialize.js` (ny),
`tests/rebar.test.mjs`, `tests/section.test.mjs`, `tests/payload.test.mjs`,
`tests/serialize.test.mjs` (ny).

1. `rebar.js`: `minClearDistance`, `minClearBetween`, `layersOnEdge`, `innermostLayer`,
   `stackedDc`, `recomputeAutoDc` (§2.2, §3.2). `createLayer` setter `dc_auto: true`.
   Legg til `createCombo`.
2. `store.js`: `spacing`, `combos`, `activeCombo` i `defaultState()`; rett `cloneState`;
   hekt `recomputeAutoDc` på alle metodene i §3.4; slett `resyncCover`; legg til
   `addCombo`, `updateCombo`, `removeCombo`, `setActiveCombo` og `comboSeq`.
3. `section.js`: `validate` regel 2 bruker `minClearDistance`; ny regel
   `insufficient_layer_spacing` (§2.4); oppdater de utdaterte kommentarene i
   `tests/section.test.mjs`.
4. `payload.js`: `loads` → §4.2-formen, `direction` → `theta` per kombinasjon.
5. `serialize.js`: §5. **Ingen migreringskode.**
6. Tester: alle tall i §2.3 og §3.3 (`assert.equal`), §5.1, og payload-testene omskrevet.

### B2 — motor
Eier: `python/engine.py`, `tests/python/test_engine.py`.

1. Godta begge `loads`-former (§4.2). Gammel form ⇒ én kombinasjon.
2. Løkke over kombinasjoner i `bending` og `nm_domain`; bygg `combinations` (§4.3).
3. `governing` etter regelen i §4.3, **inkludert uavgjort-regelen**.
4. Speil governing i blokka, `section_props`, `checks` og `meta` (§4.3).
5. `within_limits` og aksialsjekk per kombinasjon (§4.4); `combo`/`combo_name` på
   advarselen.
6. `nm_domain`: behold `M_Rd_at_N`, legg til `M_Rd` med samme verdi.
7. `moment_curvature`: én kombinasjon, `meta.mc_active_combo`.
8. Oversett alle norske advarsels- og feiltekster til engelsk (§1.2).
9. Tester: §4.6-tallene, én kombinasjon utenfor grensene, alle-null-uavgjort, og at gammel
   `loads`-form fortsatt gir dagens fixturtall.

### B3 — UI
Eier: `index.html`, `js/ui.js`, `js/main.js`, `js/solver-client.js`, `README.md`.

1. Oversett all synlig tekst, `<title>` og `<meta>` (§1.2, §1.4).
2. Felt for `k1`, `k2`, `d_g`.
3. Kombinasjonstabell: navn, N_Ed, M_Ed, retning; legg til / fjern / velg aktiv. Erstatt
   alle `loads`-kallstedene i §4.7. Fjern `markLoadChange()`-heuristikken og
   `resyncCover`-kallet.
4. Hengelåsen for `d_c` leser og skriver `layer.dc_auto` (§3.1) i stedet for sin egen `Map`.
5. Analysevalget som eget steg (§6), med seksjonsnummerering og observer.
6. «Save JSON» / «Load JSON» (§5.2).
7. `MODULE_CONFIG` og det femte avvikspunktet i `README.md` (§4.8).
8. Kjør grep-kontrollen i §1.5 og rapporter treffene.

### B4 — rapport
Eier: `js/report.js`, `js/results.js`, `print.css`, `tests/results.test.mjs`,
`tests/report.test.mjs`.

1. Oversett alle tabellene i §1.3 med de ordrette verdiene i §1.4; fjern
   `replace('.', ',')` i `fmtNumber`.
2. Nye koder: `insufficient_layer_spacing`, `document_*`.
3. `normaliseWarning` setter `combo_name`/`combo` foran teksten når feltet finnes (§4.4).
4. Rapporten får en **kombinasjonstabell** i kapittel 4, og kapittel 5 sier hvilken
   kombinasjon tallene gjelder — i dag står det «ved N_Ed = X kN» som om det var ett
   lasttilfelle.
5. Reserven på `state.loads` i `report.js:424,427` peker til governing/aktiv kombinasjon.
6. §1.5-testene, og oppdaterte forventninger etter nye fixturnøkler (§8).

### B5 — plott og tegning
Eier: `js/charts.js`, `js/section-draw.js`, `js/numeric-input.js`,
`tests/charts.test.mjs`, `tests/section-draw.test.mjs`.

1. `nmDomainSvg` tegner alle kombinasjoner (§7), inkludert autoskalering.
2. Oversett akseetiketter og lagetiketter; rett `aria-label="Tverrsnitt …"`.
3. Fjern `replace('.', ',')` i alle tre filene.
4. §1.5-testen mot SVG-utdata, og oppdaterte forventninger etter nye fixturnøkler.

**Bølge 1:** B1 og B2 parallelt. **Bølge 2:** B3, B4 og B5 parallelt.
