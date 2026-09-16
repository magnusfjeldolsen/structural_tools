# concrete_section_calculator — implementasjonsplan (v2)

> v2 etter kritisk gjennomgang og tre forskningsrunder. Alt her er KONTRAKTEN parallelle
> agenter koder mot. Avvik fra denne fila er en feil, ikke en forbedring.
> Er noe uklart: spør, ikke gjett.
>
> Bakgrunnsdokumentene ligger i `concrete_section_calculator/docs/` og er alle verifisert
> ved kjøring. **Les dem, ikke rediger dem.**

## 1. Mål og omfang

Én modul som erstatter og overgår `concrete_beam_design` + `concrete_slab_design` ved å
kjøre fib `structuralcodes` 0.7.2 i nettleseren. **ULS bare.**

Tre analyser:
- **Bøyekapasitet** — M_Rd ved gitt N_Ed og retning, nøytralakse, tøyninger, bruddform.
- **Moment–krumning** — M(κ) ved gitt N_Ed, med M_Ed inntegnet.
- **M–N-diagram** — full kapasitetsomhylling med lastpunktet inntegnet.

To tverrsnittstyper:
- **Bjelke** — b × h, armeringslag = `antall × Ø`.
- **Plate** — alltid 1000 mm bred (per meter), armeringslag = `Ø c/c s`. Tegningen viser
  jern i faktisk senteravstand; motoren får en ekvivalent utsmurt stripe (§4.3).

**Begge momentretninger**: feltmoment (θ = 0, trykk oppe) og støttemoment (θ = π).

### 1.1 Uttrykkelig UTE av omfang
Skjær, riss/SLS, nedbøyning, torsjon, forankring/omfaring, biaksiell bøying utover fast θ,
forspenning, skallsnitt, eksponeringsklasse/overdekningskrav, brann.

### 1.2 Uttrykkelig KUTTET, med grunn — ikke «glemt», ikke legg det inn igjen
- **`fiber`-integratoren, `options.meshSize`, `triangle_shim.py`.** Kan ikke virke med
  stubbet `triangle`, og et ukjent integratornavn faller **stille** tilbake til marin
  (`_factory.py`, verifisert) — vi ville sendt en kontroll som enten krasjer eller lyver.
  Marin er dessuten bedre på merittene: fiber gir spuriøst `m_z` på symmetriske tverrsnitt
  og et **feil siste punkt** i moment–krumning (−194,7 mot −214 MNmm, verifisert).
- **`law: 'sargin'`.** Bygger på `fcm` = 38 MPa, ikke `fcd` = 17 MPa (`docs/…api-reference`
  §4.1). Å tilby den i et ULS-verktøy er et stille, omtrent dobbelt usikkert resultat.
  Sikkerhetskutt.
- **`smear_mode: 'bars'`.** Stripa er verifisert innenfor 0,17 % (§4.3).
- **Lagring/serialisering av tilstand.** Ingen lagringsplass, ingen UI-affordanse, ingen
  akseptkriterium. `setInputs`/`getInputs` i §9 dekker arbeidsflytbehovet.
- **Service worker og selvhosting av Pyodide-kjernen.** Dokumentert i §3.10 som neste
  optimalisering, ikke i v1.

## 2. Filstruktur og eierskap

Alt i `concrete_section_calculator/`. **Ingen agent redigerer en fil den ikke eier.**

```
concrete_section_calculator/
  index.html                  A4a   UI-skall, GA-tag, MODULE_CONFIG, ModuleAPI
  print.css                   A4b   A4-rapport (skjerm-overlegg + @media print)
  README.md                   A4a   modul-doks + hvordan oppgradere structuralcodes
  js/
    meta.js                   A2    MODULE_VERSION/ID/NAME (importerbar av alle)
    store.js                  A2    tilstand + subscribe/notify
    materials.js              A2    kvaliteter, faktorer, avledede materialverdier
    section.js                A2    geometrimodell, avledede størrelser, validering
    rebar.js                  A2    armeringslag, barPositions, utsmurt stripe
    payload.js                A2    modell -> motor-payload (§5)
    numeric-input.js          A2    uttrykksfelt (mønster: geometry_workspace)
    section-draw.js           A3    tverrsnitts-SVG (skjerm + rapport)
    charts.js                 A3    M–κ- og M–N-SVG, lastpunkt, radiell λ
    solver-client.js          A4a   worker-håndtak: init/run/cancel/progress
    results.js                A4b   resultatformatering, norske statustekster
    report.js                 A4b   A4-rapportbygger
    ui.js                     A4a   DOM-binding
    main.js                   A4a   oppstart
  workers/
    solver-worker.mjs         A1    MODULWORKER. Pyodide-oppsett + protokoll.
  python/
    engine.py                 A1    run(payload, progress=None). Eneste sc-kode.
    wasm_stubs.py             A1    install_stubs() — triangle + scipy (§3.4)
  vendor/
    structuralcodes-0.7.2-py3-none-any.whl     (ligger der allerede)
  docs/                       les, ikke rediger
  tests/
    fixtures/*.json           frosne kontraktdata, se §2.2
    rebar.test.mjs            A2
    section.test.mjs          A2
    payload.test.mjs          A2
    materials.test.mjs        A2
    section-draw.test.mjs     A3
    charts.test.mjs           A3
    results.test.mjs          A4b
    report.test.mjs           A4b
    python/test_engine.py     A1
    python/test_stub_equivalence.py   A1   (§3.4 — den viktigste testen i modulen)
```

### 2.1 Testkonvensjon
`node:test` + `node:assert/strict`, filnavn `*.test.mjs`. Kjøres med
`npm run test:concrete-section`.

**Felle, målt her (Node 24.14.0, Windows):** `node --test <mappe>` feiler med
`Cannot find module <sti>\tests` — Node prøver å laste mappa som en modul. Kommandoen må
bruke glob-formen, som er den som ligger i `package.json`:
```
node --test "concrete_section_calculator/tests/*.test.mjs"
```
Ikke «fiks» den tilbake til mappeformen.

Python-testene kjøres manuelt: `python -m pytest concrete_section_calculator/tests/python/`.
CI (`pr-checks.yml`) dekker bare 2dfea og skal ikke røres.

### 2.2 Fixturene er kontrakten, ikke teststøtte
`tests/fixtures/` inneholder ekte målte data fra `docs/structuralcodes-api-reference.md`
§8.2/§8.3:

| fil | innhold |
|---|---|
| `payload-beam-300x600.json` | ferdig payload for referansebjelken |
| `payload-slab-1000x200.json` | ferdig payload for referanseplata |
| `result-bending-beam.json` | forventet resultat, bøyekapasitet |
| `result-mc-beam.json` | alle 20 målte (κ, M)-punkter |
| `result-nmdomain-beam.json` | omhylling |

Dette er det som lar A3, A4b og UX-agenten jobbe **uten å vente på A1**, og det er det som
avdekker drift: `payload.test.mjs` skal påstå at `payload.js` produserer
`payload-beam-300x600.json` **eksakt**, og `test_engine.py` skal bruke den **samme** fila
som inndata. Da er §12 sitt «samme M_Rd i CPython som i nettleseren» faktisk etterprøvbart.

### 2.3 Designkrav som gjør modulen testbar og agent-vennlig
1. `python/engine.py` skal kunne kjøres av vanlig skrivebords-CPython. **Ingen `js`- eller
   `pyodide`-import, ikke engang for framdrift** — derav `run(payload, progress=None)`.
2. Alle `js/`-moduler unntatt `ui.js` og `main.js` er DOM-frie og rene.
3. Én JSON-kontrakt (§5) mellom JS og Python, versjonert med `schema`.
4. `section-draw.js` og `charts.js` bruker **bare presentasjonsattributter** i SVG-en —
   ingen avhengighet til ekstern CSS. Ellers styrer to agenter samme figur.
5. `print.css`, `charts.js` og `section-draw.js` åpner med «hvorfor, ikke hva»-hodekommentar
   etter mønsteret i `geometry_workspace/print.css` og `js/report.js`. For `print.css`
   spesielt: skriv ned *hvorfor den ikke er `assets/css/report-print.css`*, ellers
   konsoliderer neste agent den hjelpsomt bort.

## 3. Motor

### 3.1 Prinsipp
`structuralcodes` 0.7.2 brukes **uendret**, fra det vendored hjulet i `vendor/`.
Oppgradering senere = legg inn nytt hjul, bump `SC_WHEEL`, kjør stub-ekvivalenstesten.
**Ingen byggesteg, ingen kjøretidsavhengighet til PyPI.**

### 3.2 Runtime og lasting — VERIFISERT OPPSKRIFT

```js
// workers/solver-worker.mjs  — MÅ lastes som new Worker(url, { type: 'module' })
const PYODIDE_VERSION = '314.0.7';     // siste stabile, 2026-09-14, Python 3.14.2
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const SC_WHEEL = './vendor/structuralcodes-0.7.2-py3-none-any.whl';
```

**Pyodide 314 drepte klassiske workers.** `pyodide.asm.js` ble `pyodide.asm.mjs`; Pyodide er
nå en ES-modul. Worker **må** opprettes med `{ type: 'module' }`. Mønsteret i
`2dfea/public/workers/solverWorker.js` og `cable_designer/worker.js` kan **ikke** kopieres
direkte — de kjører eldre Pyodide.

Rekkefølge i `initialize()`:
1. `import { loadPyodide } from PYODIDE_BASE + 'pyodide.mjs'` → `loadPyodide({ indexURL })`
2. `await pyodide.loadPackage(['numpy', 'shapely'])` — fra Pyodides egen lockfile
3. `await pyodide.loadPackage(SC_WHEEL_URL, { checkIntegrity: false })` — vendored hjul,
   samme opphav. **Filnavnet må være et gyldig wheel-navn** (`InvalidWheelFilename` ellers).
   `application/octet-stream` er verifisert greit; Pyodide ser ikke på `Content-Type`.
4. Kjør `wasm_stubs.install_stubs()` — **før** `import structuralcodes`
5. `import structuralcodes` + varm opp `engine.py`

**Ingen `micropip`.** Vi installerer ingenting etter navn og trenger ingen
avhengighetsoppløsning, så `micropip` (111 kB) + `packaging` (94 kB) droppes. Pyodides egne
dokumenter anbefaler nettopp `loadPackage` «when you are optimizing for size».

Målt budsjett (verifisert med `Content-Length` og `Accept-Encoding: br` i dag):

| | over nettet |
|---|---|
| Pyodide-kjerne (mjs + asm.mjs + asm.wasm + stdlib + lockfile) | 6,21 MB |
| numpy 2.4.6 | 2,93 MB |
| shapely 2.1.2 | 0,85 MB |
| structuralcodes (vendored) | 0,21 MB |
| **sum** | **≈ 10,2 MB, ~7 forespørsler** |

Uten scipy-stubben (§3.4) ville dette vært **24,3 MB og 4 185 ms CPU**. Med: **≈1 960 ms
CPU**. Forventet veggklokke: ~2,6 s på 100 Mbit, ~4,7 s på 25 Mbit, ~9 s på 10 Mbit — og
warm start ~1,0–1,4 s, som er gulvet fordi numpy/shapely sine `.so`-filer kompileres via
ArrayBuffer-API-et og **aldri** havner i nettleserens wasm-kodecache (bare
`instantiateStreaming` caches, og det er bare hovedmodulen).

**Hvorfor jsdelivr og ikke selvhosting:** GitHub Pages gzip-er wasm, men mangler brotli, så
selvhosting sparer bare ~220 kB (2 %) — mot å legge ~13 MB binærfiler i git for alltid.
jsdelivr gir dessuten `Cache-Control: max-age=31536000` mot GitHub Pages sine 600 s. Og
avgjørende for brukerens hovedkrav: med `loadPackage` av et hjul er oppgradering av
`structuralcodes` å bytte **én fil** — et forhåndsbygget tarball-bunt ville krevd et
byggesteg hver gang.

### 3.3 Meldingsprotokoll (FROSSET — A1 og A4a eier hver sin side)

`{ type, msgId, payload }` i begge retninger, som `cable_designer/worker.js`.

**Inn (solver-client → worker)**
```
{ type: 'init',   msgId }
{ type: 'run',    msgId, payload: <payload, §5.1> }
{ type: 'cancel', msgId }
```
**Ut (worker → solver-client)**
```
{ type: 'ready',    msgId, payload: { runtime, structuralcodes_version } }
{ type: 'progress', msgId, payload: { phase, pct, done, total, message, bytes } }
{ type: 'result',   msgId, payload: <result, §5.2> }
{ type: 'error',    msgId, payload: { code, message, detail } }
```
- `phase` ∈ `'runtime' | 'packages' | 'engine' | 'section' | 'solve'`
- **`pct` er et heltall 0–100.** Ikke 0–1.
- `done`/`total` er integrasjonsteller når kjent, ellers `null`.
- `bytes` er nedlastet mengde når kjent, ellers `null` (§3.9 krav 1).
- `msgId` lages av klienten; worker ekkoer den alltid.
- Worker svarer **alltid**; en feil er en `error`-melding, aldri et uhåndtert unntak.

### 3.4 Stubbene: `triangle` og `scipy` — dette er modulens mest kritiske valg

**`triangle`** importeres på toppnivå i `geometry/_geometry.py:10` og
`sections/section_integrators/_fiber_integrator.py:8`, begge nås fra pakkens `__init__`.
Derfor feiler `import structuralcodes` uten den. Men den **brukes** bare av
`fiber`-integratoren og `SurfaceGeometry.random_points_within()`. Marin rører den aldri.
Ingen emscripten-hjul finnes noe sted, og PyPIs nyeste `triangle` (20250106) har **ingen
cp314-hjul i det hele tatt**. Stubben er ikke en snarvei — den er eneste mulighet.

**`scipy`** er 13,87 MB over nettet og **2 176 ms CPU per last** (1 057 ms utpakking +
1 119 ms `dlopen`), varm som kald, fordi `.so`-filer aldri kodecaches. `structuralcodes`
0.7.2 bruker nøyaktig **tre** funksjoner:

| sted | bruk |
|---|---|
| `sections/_beam_section.py:11,1841,1851` | `lu_factor` / `lu_solve`, alltid som par |
| `sections/_shell_section.py:9` | samme par (vi bruker ikke skallsnitt) |
| `codes/ec2_2004/_section_7_3_crack_control.py` | `interp1d`, `griddata` — SLS, utenfor omfang |
| `codes/ec2_2023/_section5_materials.py` | `interp1d`, `griddata` — ikke vår kodeutgave |

Med ekte scipy trekker `import structuralcodes` inn **355 scipy-undermoduler**. Med stubben:
**3**. Verifisert bit-identisk (`0.000e+00` relativt avvik) på bøyekapasitet ved n=0 og
n=−500 kN, alle 20 moment–krumningspunkter, `gross_properties.ea` og hele N–M-diagrammet.

`lu_factor`/`lu_solve` brukes utelukkende som ett lineært løs, og `np.linalg.solve`
(LAPACK `gesv`, samme LU med delvis pivotering) reproduserer det eksakt.
`griddata` skal **kaste**, ikke tilnærme — høylytt svikt slår et stille galt tall.

`python/wasm_stubs.py` eksponerer **én** funksjon, `install_stubs()`, som injiserer i
`sys.modules`. Samme fil brukes i nettleseren og i skrivebordstesten. Den skal **ikke**
bruke `micropip.add_mock_package` — den krever micropip, og den ødelegger
`micropip.freeze()`.

**`tests/python/test_stub_equivalence.py` er den viktigste testen i modulen.** Den kjører
referansetilfellet i to underprosesser — én med ekte scipy, én med `install_stubs()` — og
påstår identiske tall. Den skal i tillegg granske installert `structuralcodes` for
scipy-importer og **feile** hvis settet avviker fra de fire stedene over. Da oppdages en
oppstrøms utvidelse av scipy-bruk høylytt i test, i stedet for stille i nettleseren.

Emscripten-sporet er forkastet: unødvendig, ikke gjørbart her (ingen `emcc`, Docker nede,
WSL uten pip/DNS, `pyodide-build` støtter ikke Windows), ingen publisert hjul, og Shewchuks
Triangle er bare fri for ikke-kommersiell bruk.

### 3.5 Advarsler er unntak i structuralcodes

`structuralcodes/__init__.py` avslutter med
`warnings.filterwarnings(action='error', category=StructuralCodesWarning)`, så manglende
konvergens kommer som **exception**. `engine.py` nedgraderer:
```python
warnings.filterwarnings('always', category=StructuralCodesWarning)
```
og pakker hver analyse i `warnings.catch_warnings(record=True)`. Teksten er engelsk
pakketekst og skal **ikke** vises rå i et norsk UI — den går i `detail`, mens `results.js`
mapper `code` til norsk (§5.3).

`calculate_moment_curvature` **avkorter arrayene** ved manglende konvergens og bryter. Bruk
alltid `len(res.chi_y)`.

### 3.6 Eksakt API (verifisert mot 0.7.2)

```python
ConcreteEC2_2004(fck=30, gamma_c=1.5, alpha_cc=0.85)      # fck er TALL, ikke 'C30/37'
ReinforcementEC2_2004(fyk=500, Es=200000, ftk=540, epsuk=0.075,
                      gamma_s=1.15, gamma_eps=0.9)
SurfaceGeometry(poly, material)        # material kan være BÅDE betong OG armering
PointGeometry(point, diameter, material)   # areal ALLTID π·d²/4 — ingen area=
BeamSection(geometry, integrator='marin')  # 'marin' er standard
```

**`constitutive_law` er et KONSTRUKTØR-argument, ikke en settbar egenskap.**
`conc.constitutive_law = '...'` gir `AttributeError: property ... has no setter`. Lovvalget
må sendes inn i konstruktøren. Lovlige verdier, verifisert:
betong `'elastic' | 'parabolarectangle' | 'bilinearcompression' | 'sargin' | 'popovics'`,
arméring `'elastic' | 'elasticperfectlyplastic' | 'elasticplastic'`.

**Metode eller egenskap — verifisert, og lett å ta feil av:**
`fcd()`, `fyd()`, `ftd()`, `epsud()` er **metoder** (skal kalles).
`epsyd`, `eps_c2`, `eps_cu2`, `eps_c3`, `eps_cu3`, `Ecm`, `fcm`, `fctm`, `fck`, `fyk`,
`ftk`, `Es`, `epsuk` er **egenskaper** (skal ikke kalles).

**`ec2_2004.As_min` er IKKE bøyeminimum.** Signaturen er
`As_min(A_ct, sigma_s, fct_eff, k, kc)` — det er rissviddeminimum etter EC2 7.3.2.
Bøyeminimum etter 9.2.1.1 finnes ikke i pakken og regnes selv:
`A_s,min = max(0.26 · f_ctm/f_yk · b_t · d, 0.0013 · b_t · d)`, med `f_ctm` fra
`conc.fctm` (egenskap). `A_s,max = 0.04 · A_c`.

**`ftk` og `epsuk` har ingen standardverdi og er påkrevd** — for **begge** arbeidsdiagram,
ikke bare det med fasthetsøkning: `ftk` mater `n_max`, og `check_axial_load` kjøres **før**
hver `calculate_bending_strength` og `calculate_moment_curvature`. `payload.js` regner
`ftk = k · fyk` med `k` alltid satt (standard 1,08).

**`epsud() = epsuk · gamma_eps`, `gamma_eps` standard 0,9.** Skal ligge i tilstanden og i
payloaden, ellers bruker motoren stille 0,9 mens rapporten trykker noe annet.

**`alpha_cc` og `gamma_c` kan ikke være 0**: egenskapene er `self._x or default`, så 0 gir
stille 1,0 / 1,5. `payload.js` avviser 0 og tomt felt.

**Aksesystem.** Y horisontalt, Z vertikalt. Shapely-koordinaten `(x, y)` betyr `(Y, Z)`.
Payloaden bruker derfor `y`/`z`, **ikke** `x`/`y`. Konsekvent i JS også: funksjoner heter
`...Z` når de gir den vertikale koordinaten.

**Fortegn.** `n > 0` = STREKK, `n < 0` = TRYKK. `theta = 0` gir trykksone ØVERST, så en
bjelke med underkantarmering får **negativ `m_y`** for feltmoment. Se §5.2.

**Nullpunkt.** `eps_a`, `N` og `M` refereres til globalt `(0,0)`. `payload.js` sentrerer
tverrsnittet om origo.

**Tøyningsgrensene er lovavhengige.** `parabolarectangle` → `eps_c2`/`eps_cu2`;
`bilinearcompression` → `eps_c3 = 0.00175` / `eps_cu3 = 0.0035`. Resultatet bærer derfor
**både verdien og navnet** (§5.2), ellers trykker rapporten feil grense.

**Stålarealet trekkes IKKE fra betongen.** Se §3.8.

#### Regresjonsgrunnlag (bjelke 300×600, C30/37, **α_cc = 1,0**, 3Ø20, overdekning 40)
```
As = 942.4778 mm²   d = 550 mm   fcd = 20.0 MPa   fyd = 434.783 MPa   ftd = 469.565 MPa
n_min = -4 010 438.41 N      n_max = +442 554.79 N
M_Rd (θ=0, n=0)       = -215 006 759.19 Nmm   eps_a = 0.00869668  chi_y = -4.065559e-05
M_Rd (θ=0, n=-500 kN) = -305 396 903.0  Nmm
moment-krumning: 20 punkter, flyt på indeks 9 (κ=-5.704253e-06, M=-201.2 kNm),
                 siste punkt = -2.150068e+08, identisk med bøyekapasiteten
N-M-diagram θ=0, standard: (35,3); |m_y| topper på 364.25 kNm ved n = -1 238 119.8 N
```
Merk **α_cc = 1,0** her. UI-standarden er 0,85 (norsk NA), så §12 sitt akseptkriterium
gjelder mot α_cc = 1,0.

Referanseplate 1000×200, Ø12 c/c 113 (A_s = 1000 mm²/m), overdekning 25:
`M_Rd = -69 864 525.0 Nmm/m`, mot −69 745 for diskrete jern → **0,17 % avvik**.

### 3.7 Ytelse, framdrift og avbrudd

| operasjon | integrasjoner | native | forventet Pyodide |
|---|---|---|---|
| `calculate_bending_strength` | 33 | 14 ms | 30–70 ms (målt 54 ms) |
| `calculate_nm_interaction_domain` (69 pkt) | **1 per punkt** | 28 ms | 60–140 ms |
| `calculate_moment_curvature` (20 pkt) | ~32 per punkt | 231 ms | 0,5–1,2 s |

**Bøyekapasitet og N–M-diagram er praktisk talt momentane.** Framdriftslinje der er
kosmetikk, og **«Avbryt» skal være deaktivert** for dem — å tilby et avbrudd som koster en
omstart av en 10 MB runtime for å angre en 50 ms jobb er et dårlig bytte.

**Moment–krumning drives fra JS, ett punkt om gangen.** `engine.py` holder den forberedte
seksjonen som modulglobal og regner **ett** krumningspunkt per kall via `mc_chi`. Det gir
determinat framdrift, ekte avbrytbarhet (send bare ikke neste bit) og ingen omstart.
`worker.terminate()` + ny worker beholdes kun som nødutgang hvis Python henger.

`progress` er en vanlig callable, `progress(phase, done, total)`. Skrivebordstesten sender
`None` eller en liste-appender; `solver-worker.mjs` sender en lambda som `postMessage`-er.
**`engine.py` importerer aldri `js`.**

### 3.8 `subtract_bar_area`

Begge integratorer legger `π·d²/4` på som et ekstra ledd uten å punsjere hull i
betongpolygonet — stålet dobbelttelles med betongen det fortrenger.

Standard **`false`** = oppstrøms oppførsel, og det §3.6 er målt mot. `true` som standard
ville gitt tall som ikke stemmer med `structuralcodes` selv, og det er et dårlig bytte for
en modul hvis poeng er å følge oppstrøms pakke. `true` punsjerer hull — **både for punktjern
og for den utsmurte stripa**.

Uansett innstilling: når et jernsenter ligger i **trykksonen ved brudd**, legger `engine.py`
en advarsel med kode `bar_in_compression_zone` og et **kvantitativt** anslag. Feilen er
eksakt `Σ A_s,trykk · σ_c(ε_jern)`, fem linjer fra tøyningsplanet motoren alt har:
`ε(z) = eps_a + chi_y·z`, negativ = trykk. «Kapasiteten er ca. 2,1 kNm på usikker side» er
handlingsbart; «marginalt på usikker side» er ikke.

### 3.9 Oppvarming ved sidelast

Motoren initialiseres ved sidelast, parallelt med at brukeren fyller ut skjemaet — brukeren
bruker 10–30 sekunder på skjemaet, og det skjuler hele kaldstarten. Dette er verdt mer enn
alle byte-optimaliseringene til sammen. Tverrsnittstegningen er ren JS og venter aldri.

Tre krav A4a må dekke:
1. Statuspillen viser fase **og** nedlastet mengde — 10 MB uanmeldt er uhøflig.
2. `navigator.connection?.saveData` ⇒ ikke forhåndslast; vent på første «Beregn».
3. **Feilet oppvarming må ikke låse siden.** CDN blokkert, offline eller bedriftsproxy skal
   gi en klikkbar «Prøv igjen», ikke en død knapp.

`index.html` får `<link rel="modulepreload">` på `pyodide.mjs` og `rel="preload" as="fetch"`
på `pyodide.asm.wasm`, `python_stdlib.zip` og det vendored hjulet, slik at de store hentene
overlapper med worker-oppstart.

### 3.10 Dokumenterte senere optimaliseringer (ikke v1)
Service worker med cache-first på versjonsstemplede URL-er (gir 0 nettforespørsler ved
gjenbesøk og slår GitHub Pages sine `max-age=600`), og selvhosting av Pyodide-kjernen.
Til sammen verdt ~1 s warm start og litt båndbredde, mot en ekstra fil og ~13 MB i git.

## 4. Modellen

### 4.1 Tilstand (`store.js`)
```js
{
  schema: 1,
  sectionType: 'beam' | 'slab',
  geometry: { b: 300, h: 600 },            // slab: b låst til 1000
  concrete: {
    fck: 30,                               // TALL
    gamma_c: 1.5, alpha_cc: 0.85,
    law: 'parabolarectangle' | 'bilinearcompression',
  },
  steel: {
    fyk: 500, Es: 200000,
    k: 1.08,                               // ALLTID satt -> ftk = k*fyk
    epsuk: 0.075, gamma_eps: 0.9,
    gamma_s: 1.15,
    law: 'elasticperfectlyplastic' | 'elasticplastic',
  },
  cover: 35,          // overdekning til jernets YTTERKANT, for nye lag
  stirrup_dia: 8,     // bøylediameter, brukes av UI-hjelperen og barPositions
  cover_side: 35,     // sidekant-overdekning, bjelke
  layers: [ Layer, ... ],
  loads: { N_Ed: 0, M_Ed: 0 },   // kN / kNm. TRYKK NEGATIV N. M_Ed er en STØRRELSE.
  direction: 'sagging' | 'hogging',        // -> theta 0 / π
  analysis: 'bending' | 'moment_curvature' | 'nm_domain',
  options: { subtract_bar_area: false, mc_pre_yield: 10, mc_post_yield: 10 },
  doc: { project: '', title: '', author: '', date: '', note: '' },
  result: null,       // siste resultat (§5.2)
}
```
`M_Ed` er en **størrelse** i retningen `direction` angir. Ingen fortegn å tolke.
Det finnes **ingen** `options.integrator` — marin er hardkodet i `payload.js`.

### 4.2 Armeringslag (`rebar.js`)
```js
{ id: 'L1', mode: 'bars',    dia: 20, count: 3,     edge: 'bottom', dc: 50 }   // bjelke
{ id: 'L2', mode: 'spacing', dia: 12, spacing: 113, edge: 'bottom', dc: 31 }   // plate
```
- `edge` — kanten `dc` måles fra: `'bottom'` | `'top'`
- `dc` — avstand fra kanten til **jernets senter** (mm)
- UI-hjelper: `dc = cover + stirrup_dia + dia/2`

```js
layerArea(layer)                       // mm² (per meter for 'spacing')
layerBarCount(layer)                   // antall jern som TEGNES — Math.round, minimum 1
layerCentroidZ(layer, h)               // vertikal koordinat, z=0 i senter, +opp
layerDepth(layer, h, theta)            // d fra trykkant. theta ER påkrevd.
barPositions(layer, geometry, opts)    // -> [{y, z, dia}]  ENESTE kilde til koordinater
equivalentStrip(layer, h)              // -> {width, height, z}
totalArea(layers)                      // mm²
effectiveDepth(layers, h, theta)       // arealvektet d for FLERE lag
reinforcementRatio(layers, geometry, theta)   // ρ = As/(b_t·d), EC2-definisjonen
```

**`barPositions` er den viktigste funksjonen i planen.** Eneste kilde til hvor jern ligger
horisontalt, og både `payload.js` og `section-draw.js` **skal** bruke den. Regnet hver for
seg ville tegningen vært uenig med tallet **uten at noe feiler** — den verste sviktformen
som finnes. `payload.test.mjs` skal påstå at `payload.section.rebar[i].bars` er dypt lik
`barPositions(...)`.

- Bjelke: jern fordeles jevnt mellom `±(b/2 − cover_side − stirrup_dia − dia/2)`, `count`
  stykker; `count === 1` ⇒ ett jern i `y = 0`.
- Plate: `Math.round(1000/spacing)` jern, **minimum 1**, sentrert om `y = 0` med faktisk
  senteravstand. Uten minimum blir armeringen usynlig i tegningen for stor senteravstand
  selv om arealet regnes riktig.

### 4.3 Utsmurt platearmering
Per meter: `As = (1000/s) · π·Ø²/4`. Stripa: `høyde = Ø`, `bredde = As/Ø`, senter i
`layerCentroidZ`. Verifisert innenfor **0,17 %** mot diskrete jern — standardmodellen, ikke
en tilnærming som skal unnskyldes.

Stripa kan aldri bli bredere enn plata: `bredde ≥ 1000` krever `s ≤ 0,785·Ø`, fysisk umulig
(Ø32 c/c 40 gir 628 mm). **Ikke skriv en vakt mot det.**

`gross_properties.area_reinforcement` rapporterer **0** for en utsmurt flate — A_s spores på
JS-siden.

### 4.4 Validering (`section.js`) — norsk melding, ikke exception
```js
validate(state) -> [{ code, severity: 'error'|'warning', message, field }]
```
1. `dc + dia/2 < h` per lag — et jern utenfor tverrsnittet integreres glad med stålspenning
   og uten omkringliggende betong, og gir tøvete kapasitet uten noen feil.
2. Bjelke: laget får plass i bredden —
   `b ≥ 2(cover_side + stirrup_dia) + count·dia + (count−1)·s_fri`, `s_fri ≥ max(dia, 20)`
   (EC2 8.2).
3. `alpha_cc > 0`, `gamma_c > 0`, `gamma_s > 0`, `k ≥ 1`.
4. `h > 0`, `b > 0`, minst ett armeringslag.
5. Overlappende lag (`h − dc_top − dc_bottom < (Ø_t+Ø_b)/2`) ⇒ `warning`: arealene
   integreres uavhengig, så ULS-momentet er riktig — men inndataen er nesten alltid feil.

`N_Ed` mot `n_min`/`n_max` kan først sjekkes når motoren har regnet dem, og gjøres i
`engine.py` (§5.3) — `check_axial_load` kaster ellers en rå engelsk `ValueError`.

## 5. JSON-kontrakten JS ↔ Python

### 5.1 Inn (`payload`)
Lengder **mm**, krefter **N**, momenter **Nmm**, spenninger **MPa**. `payload.js`
konverterer fra kN/kNm. Trykk negativ. `theta` i **radianer**.

```json
{
  "schema": 1,
  "analysis": "bending" | "moment_curvature" | "nm_domain",
  "section": {
    "type": "beam" | "slab",
    "b": 300.0, "h": 600.0,
    "concrete": { "fck": 30.0, "gamma_c": 1.5, "alpha_cc": 0.85,
                  "law": "parabolarectangle" },
    "steel": { "fyk": 500.0, "Es": 200000.0, "ftk": 540.0, "k": 1.08,
               "epsuk": 0.075, "gamma_eps": 0.9, "gamma_s": 1.15,
               "law": "elasticperfectlyplastic" },
    "rebar": [
      { "id": "L1", "kind": "bars", "area": 942.4778,
        "bars": [ {"y": -100.0, "z": -250.0, "dia": 20.0} ] },
      { "id": "L2", "kind": "strip", "area": 1000.0,
        "strip": {"width": 83.333, "height": 12.0, "z": -69.0} }
    ]
  },
  "loads": { "N_Ed": -200000.0, "M_Ed": 250000000.0 },
  "options": {
    "theta": 0.0, "integrator": "marin",
    "subtract_bar_area": false, "complete_domain": true,
    "mc_pre_yield": 10, "mc_post_yield": 10, "mc_chi": null
  }
}
```
`payload.js` gjør **all** geometriregning og sender ferdige koordinater — motoren kjenner
ikke «senteravstand». `mc_chi` settes når JS driver moment–krumning ett punkt om gangen.
`complete_domain` er **alltid `true`**: 69 punkter, 28 ms, og uten den finnes ingen
omhylling å treffe for et støttemoment.

### 5.2 Ut (`result`)

**Fortegnsregelen, den viktigste enkeltsetningen i denne fila:**
`moment_curvature.kappa`, `moment_curvature.moment` og `nm_domain.m` krysser JSON-grensa som
**størrelser i den analyserte retningen** (`abs`). `nm_domain.n` forblir **fortegnsatt**
(trykk negativ). `meta.moment_sign` bærer motorens rå fortegn.

Uten dette ville `radialUtilisation` sendt en stråle inn i +M-halvplanet mot en omhylling som
ligger helt i −M: tomt diagram, `eta = 0` eller `NaN`. A1 og A3 ser ikke hverandres kode.

```json
{
  "ok": true, "schema": 1, "analysis": "bending",
  "meta": {
    "structuralcodes_version": "0.7.2", "engine_version": "1.0.0",
    "runtime": "pyodide 314.0.7", "integrator": "marin", "scipy": "stub",
    "moment_sign": -1, "theta": 0.0, "direction": "sagging",
    "subtract_bar_area": false, "wall_time_ms": 412
  },
  "materials": {
    "fck": 30.0, "fcd": 17.0, "alpha_cc": 0.85, "gamma_c": 1.5, "Ecm": 32837.0,
    "fctm": 2.896, "law_concrete": "parabolarectangle",
    "eps_c": 0.002, "eps_cu": 0.0035, "eps_c_name": "eps_c2", "eps_cu_name": "eps_cu2",
    "fyk": 500.0, "ftk": 540.0, "k": 1.08, "Es": 200000.0,
    "gamma_s": 1.15, "gamma_eps": 0.9, "law_steel": "elasticperfectlyplastic",
    "fyd": 434.783, "ftd": 469.565, "eps_yd": 0.002174,
    "eps_uk": 0.075, "eps_ud": 0.0675
  },
  "section_props": {
    "Ag": 180000.0, "As_total": 942.478, "rho": 0.005712,
    "b_t": 300.0, "d_eff": 550.0,
    "As_min": 234.5, "As_max": 7200.0,
    "n_min": -4010438.41, "n_max": 442554.79
  },

  "bending": {
    "N_Ed": 0.0, "M_Rd": 215006759.19,
    "eps_a": 0.00869668, "chi_y": -4.065559e-05,
    "x": 85.4, "x_over_d": 0.155,
    "eps_c_top": -0.0035, "eps_s_max": 0.01488,
    "failure_mode": "steel_rupture",
    "layers": [ { "id": "L1", "z": -250.0, "eps": 0.01488, "sigma": 447.2,
                  "utilisation": 0.952, "compression": false } ],
    "M_Ed": 200000000.0, "utilisation": 0.930
  },

  "moment_curvature": {
    "N_Ed": 0.0,
    "kappa": [ ], "moment": [ ],                // STØRRELSER, 1/mm og Nmm
    "yield_index": 9,                            // = mc_pre_yield - 1, eller null
    "M_Rd": 215006759.19, "M_Ed": 200000000.0, "utilisation": 0.930,
    "truncated": false
  },

  "nm_domain": {
    "n": [ ],                                    // N, FORTEGNSATT
    "m": [ ],                                    // Nmm, STØRRELSER
    "field_num": [ ],
    "N_Ed": -200000.0, "M_Ed": 250000000.0,
    "M_Rd_at_N": 251300000.0,                    // eget bending-kall ved N_Ed
    "utilisation": 0.995,                        // VERTIKAL — hovedtallet
    "N_min": -4010438.41, "N_max": 442554.79
  },

  "checks": {
    "as_min_ok": true, "as_max_ok": true, "ductility_ok": true,
    "axial_ok": true, "geometry_ok": true, "all_ok": true
  },
  "warnings": [ { "code": "bar_in_compression_zone", "severity": "warning",
                  "message": "...", "detail": "..." } ]
}
```

Ved feil: `{ "ok": false, "schema": 1, "error": { "code", "message", "detail" } }`.

> Tallene over er **illustrative**, ikke en fixtur. Sannheten ligger i
> `tests/fixtures/`. Ikke bak dem inn i tester.

**`x` utledes eksplisitt:** `z_na = -eps_a/chi_y`, `x = h/2 - z_na` for θ = 0. Ved
`chi_y ≈ 0` (N nær `n_min`, EC2-felt 1, rent trykk) blir dette `±Infinity` — se §5.4.

**`failure_mode`** ∈ `'concrete_crushing' | 'steel_rupture' | 'over_reinforced' |
'compression_no_tension'`. Klassifisering, i denne rekkefølgen:
1. `eps_s_max < eps_yd` og hele tverrsnittet i trykk ⇒ `compression_no_tension`
2. `eps_s_max ≥ eps_ud·(1−1e−3)` ⇒ `steel_rupture`
3. `eps_c_top ≤ −eps_cu·(1−1e−3)` og `eps_s_max ≥ eps_yd` ⇒ `concrete_crushing`
4. ellers ⇒ `over_reinforced`

**`utilisation` er alltid den vertikale**, `M_Ed / M_Rd(N_Ed)` — samme definisjon i alle tre
analysene. `M_Ed = 0` ⇒ `utilisation: 0`. Radiell λ regnes i `charts.js` og er et
**sekundært** «lastvei»-tall som skal merkes som det. Samme snitt og last skal ikke kunne
vise to ulike η i to faner.

### 5.3 `warnings` og feilkoder
Objekter, ikke strenger: `{ code, severity: 'info'|'warning'|'error', message, detail }`.
`message` er norsk, fra `results.js` sin kodetabell. `detail` er rå pakketekst for den som
vil grave. Minimumssett av koder:
`no_convergence`, `mc_truncated`, `bar_in_compression_zone`, `axial_out_of_range`,
`as_min_not_met`, `as_max_exceeded`, `ductility_limit`, `bar_outside_section`.

`axial_out_of_range` sjekkes **før** noe regnes, mot `n_min`/`n_max`, fordi
`check_axial_load` ellers kaster en rå engelsk `ValueError`.

### 5.4 Tall som ikke krysser JSON
`Infinity` og `NaN` er ikke gyldig JSON og `JSON.parse` kaster. `numpy.float64` og `ndarray`
kan `json.dumps` **ikke** serialisere i det hele tatt — og hvert array i resultatet er en
`ndarray`.

`engine.py` skal derfor ha, og bruke overalt:
```python
def _num(v):
    v = float(v)
    return v if math.isfinite(v) else None
```
`.tolist()` på hvert array, og `json.dumps(..., allow_nan=False)` som siste sikring.
**Alle numeriske felt kan være `null`; UI-en tegner «–».** Regresjonstest med `chi_y = 0`.

## 6. Tegning og plott

Rene funksjoner som returnerer **SVG-strenger**, rot-`<svg>` med både `width` i forespurt
enhet og `viewBox`. Samme funksjon på skjerm og papir. **Bare presentasjonsattributter**,
ingen ekstern CSS.

```js
// section-draw.js — tar HELE state, ikke en delmengde
drawSection(state, opts) -> string
//   opts: {width, unit:'mm'|'px', showDims, showLabels, theme:'dark'|'print',
//          overlay:{x, theta}|null}
sectionViewBox(state, opts) -> {minY, minZ, w, h, scale}   // testbar uten SVG-parsing

// charts.js
momentCurvatureSvg(mc, opts) -> string   // tegner SELV M_Ed-linja og flytpunktet
nmDomainSvg(dom, opts) -> string         // tegner SELV omhylling, lastpunkt og stråle
radialUtilisation(dom, N_Ed, M_Ed) -> {eta, lambda, hitN, hitM}
```
`opts` for begge plott: `{width, unit, height, theme}`. Aksene merkes i **kN og kNm**;
funksjonene konverterer fra payload-enhetene selv.

**`radialUtilisation` — fullstendig spesifikasjon.** Argumentene er i **kN og kNm**.
Omhyllingen lukkes langs `M = 0` fra `(N_min, 0)` til `(N_max, 0)`. Stråle fra origo, og
**minste positive λ** velges: omhyllingen *er* ikke-konveks rundt balansepunktet (§3.6 viser
`|m|` som vokser mens `n` faller), så en stråle kan krysse flere ganger, og origo ligger inne
i domenet. `eta = 1/λ`. Punktrekkefølgen i arrayene følger EC2-feltene 1→6 og har **ingen**
sammenheng med strålegeometri — ikke bruk «første treff i arrayet».
Degenerert: lastpunkt i origo ⇒ `{eta: 0, lambda: Infinity, hitN: null, hitM: null}`, ingen
stråle tegnes. Egne tester for: punkt utenfor, punkt i origo, ren aksial last, ikke-konveks
kryssing.

## 7. UI

Norsk, mørkt tema, Tailwind via CDN. Struktur følger UX-porten (§11.1). Alle tallfelt er
uttrykksfelt (`200+50`, `20*5^2/8`) etter `geometry_workspace/js/numeric-input.js`.

Faste krav uansett valgt layout:
- Seksjoner i denne rekkefølgen: **materiale → geometri → armering → last → beregn →
  resultat**, og «Beregn» innen rekkevidde fra alle.
- Tastatursnarvei for beregning.
- Armeringslag er der gjentakelsen ligger: rad med `antall × Ø` / `Ø c/c s`, kant, `dc`,
  avledet `As` og `d` i grått, og ⧉ dupliser / ✕ slett per rad.
- Retningsvalg (felt/støtte) synlig, ikke gjemt i avanserte valg.
- Resultatet skal kunne **inspiseres**: x, x/d, tøyninger per lag, bruddform, A_s,min, og
  hvor lastvirkningen ligger mot kapasiteten.
- Tverrsnittstegningen oppdateres live uten motor.
- Utnyttelsesterskler for farge/status defineres **ett** sted, i `results.js`, og brukes av
  både statuspillen og rapporten.

Resultatet lagres i `store.js` (`state.result`) og speiles til
`window.lastCalculationResults` / `window.lastCalculationInputs` for §9.

## 8. A4-rapport (`report.js` + `print.css`)

Mønsteret fra `geometry_workspace`: bygges **på forespørsel** i `#report-overlay`, klones
rett før utskrift inn i `#cscPrintRoot` som direkte barn av `<body>`. Egen `print.css` med
hodekommentar som forklarer hvorfor den ikke er den delte `assets/css/report-print.css`.
Figurbredde fast 174 mm.

1. Topptekst — prosjekt, tittel, utført av, dato, modulnavn + versjon (fra `js/meta.js`,
   **ikke** fra `MODULE_CONFIG`, som A4b ikke kan importere)
2. Tverrsnitt — figur først, så geometri- og materialtabell med alle faktorer og avledede
   verdier, med **lovavhengige** tøyningsnavn fra `materials.eps_cu_name`
3. Armering — lagtabell (n, Ø, A_s, d, per meter for plate), ΣA_s, ρ, A_s,min, A_s,max
4. Lastvirkning — N_Ed, M_Ed, retning, og det tillatte aksialintervallet `[n_min, n_max]`
5. Resultat — stor boks: M_Rd, x, x/d, tøyninger per lag, bruddform, η, kontrolltabell
6. Plott — M–κ eller M–N med lastpunkt
7. Forutsetninger og metode — arbeidsdiagram, integrator (marin), utsmurt stripe,
   `subtract_bar_area`, **at `scipy` er erstattet av en verifisert numpy-ekvivalent**,
   `structuralcodes`-versjon, EC2-referanser, og **alle advarsler**

## 9. Arbeidsflyt-API — avvik fra `plan_IO-structure_for_modules.md`

`index.html` får `MODULE_CONFIG` og `window.ModuleAPI` med
`getConfig/getInputs/setInputs/calculate/getLastResults/getOutput/getAllOutputs/hasResults`,
**pluss `ready(): Promise<void>`**.

Fire avvik som **skal** stå i `README.md`:
1. `calculate()` er **asynkron** og returnerer et `Promise`. En eksisterende konsument som
   gjør `const r = ModuleAPI.calculate(x); if (r.success)` ser et sant Promise og leser
   `undefined`. `calculate()` venter selv på initialisering i stedet for å avvise.
2. **Resultatformen er §5.2**, ikke spesifikasjonens `{success, inputs,
   intermediate_calculations, results, status, _metadata}`. `MODULE_CONFIG.outputs[].path`
   peker derfor inn i §5.2 (`bending.M_Rd`, `section_props.d_eff`, …).
3. `calculate()` er **ikke** en ren funksjon av argumentet — den avhenger av worker-tilstand
   og kan feile av grunner som ikke ligger i inndataen.
4. Spesifikasjonens «returner ALLE mellomverdier» er **ikke oppnåelig** fra
   `structuralcodes`, som ikke eksponerer sine indre trinn. §5.2 gir alt pakken faktisk gir:
   tøyningsplan, nøytralakse, spenninger per lag.

## 10. Distribusjon

- **Gjort allerede:** `concrete_section_calculator` lagt i kopi-løkka i
  `deploy-all-modules.yml`. `paths:`-filteret traff den allerede via `concrete_*/**`, men
  uten løkke-oppføringen blir siden 404 selv om alt er kommitert. **Ikke trim dette bort.**
- `module-registry.json` genereres automatisk — ikke rediger. Modulen trenger `<title>`,
  `<meta name="description">` og `<meta name="keywords">`.
- GA-tag rett etter `<head>`, eksakt som i `CLAUDE.md`.
- Kort i rot-`index.html` med «Under Development»-banner, som `geometry_workspace`.
- `.whl` serveres som `application/octet-stream` (fallback i `scripts/dev-server.js:39`) —
  verifisert greit for `loadPackage`.

## 11. Bølger

- **Bølge 1, parallelt:** A1 motor · A2 modell · A3 tegning+plott · UX to mockups
- **Bølge 2, parallelt:** A4a skall+UI etter valgt design · A4b rapport+resultat
- **Bølge 3:** integrasjon, nettleserverifisering, rot-kort, README

UX-agenten kjører **parallelt** med bølge 1, mot fixturene i §2.2. Kurveformene er allerede
kjent fra de 20 målte punktene, så det er ikke gjetning — og bølge 1 sin ekte utdata
erstatter fixturene som verifikasjonssteg etterpå.

### 11.1 UX-brief — premisser, ikke forslag
Gitt av brukeren, skal ikke «foreslås bort»: seksjonsrekkefølgen i §7, tastatursnarvei,
**minst mulig klikking, lesing og småbokser**, og at resultatet skal kunne inspiseres.
Armeringslag er stedet det avgjøres — der ligger all gjentakelsen.

Leveranse: **to** komplette, klikkbare statiske HTML-mockups med fixtur-SVG-ene inlinet, som
skiller seg i **struktur**, ikke i farge. Samme utfylte eksempel i begge.

## 12. Aksept

- [ ] `npm run test:concrete-section` grønn
- [ ] `payload.js` produserer `tests/fixtures/payload-beam-300x600.json` eksakt
- [ ] `test_engine.py` leser samme fil og treffer §3.6 (**α_cc = 1,0**):
      `M_Rd = -215 006 759.19 Nmm` ved θ=0, n=0
- [ ] **`test_stub_equivalence.py` grønn** — stubbet scipy gir identiske tall som ekte scipy,
      og scipy-importsettet i `structuralcodes` er uendret
- [ ] Plate 1000×200 Ø12 c/c 113 gir `As = 1000 mm²/m` og `M_Rd ≈ -69,865 kNm/m`
- [ ] `barPositions` er eneste kilde til jernkoordinater, påstått i test
- [ ] Alle tre analysene kjører uten å låse UI; moment–krumning har determinat framdrift og
      fungerende avbrudd
- [ ] `chi_y = 0` gir `null`, ikke `Infinity`, og UI-en tegner «–»
- [ ] Støttemoment (θ = π) gir riktig kapasitet med overkantarmering
- [ ] A_s,min, A_s,max og x/d rapporteres og inngår i `checks.all_ok`
- [ ] Rapporten skriver ut på A4 uten avkuttet innhold, med figur og plott
- [ ] `window.ModuleAPI` svarer, og de fire avvikene i §9 står i `README.md`
