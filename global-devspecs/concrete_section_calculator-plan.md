# concrete_section_calculator — implementasjonsplan (UTKAST)

> STATUS: §3.2 (runtime/laster) og §3.4 (triangle) fylles inn når forskningen er inne.
> Alt annet er ferdig og er KONTRAKTEN parallelle agenter koder mot.

## 1. Mål

Én modul som erstatter og overgår `concrete_beam_design` + `concrete_slab_design` ved å
kjøre fib `structuralcodes` i nettleseren. ULS bare, i første omgang.

Tre analyser:
- **Bøyekapasitet** — M_Rd ved gitt N_Ed, nøytralakse, tøyninger, bruddform, utnyttelse.
- **Moment–krumning** — M(κ)-kurve ved gitt N_Ed, med M_Ed inntegnet.
- **M–N-diagram** — kapasitetsomhylling i (N, M)-planet, med lastpunktet inntegnet og
  radiell utnyttelse.

To tverrsnittstyper:
- **Bjelke** — b × h, armeringslag = `antall × Ø`.
- **Plate** — alltid 1000 mm bred (per meter), armeringslag = `Ø c/c s`. Tegningen viser
  jern i faktisk senteravstand; motoren får en ekvivalent utsmurt armering (§4.3).

Ikke i omfang nå: skjærkapasitet, riss/SLS, torsjon, skallsnitt, biaksiell bøying
utover M–N ved fast θ, forspenning.

## 2. Filstruktur og eierskap

Alt ligger i `concrete_section_calculator/`. Eierskap-kolonnen er hvilken agent som
skriver fila — **ingen agent redigerer en fil den ikke eier**.

```
concrete_section_calculator/
  index.html                  A4a   UI-skall, GA-tag, MODULE_CONFIG, ModuleAPI
  print.css                   A4b   A4-rapport (skjerm-overlegg + @media print)
  README.md                   A4a   modul-doks, inkl. hvordan oppgradere structuralcodes
  js/
    store.js                  A2    tilstand + subscribe/notify + serialisering
    materials.js              A2    betong-/stålkvaliteter, faktorer, arbeidsdiagram
    section.js                A2    geometrimodell (bjelke/plate), avledede størrelser
    rebar.js                  A2    armeringslag: As, d, ekvivalent utsmurt armering
    payload.js                A2    modell -> motor-payload (JSON-kontrakten i §5)
    numeric-input.js          A2    uttrykksfelt (mønster: geometry_workspace)
    section-draw.js           A3    tverrsnitts-SVG (skjerm + rapport)
    charts.js                 A3    M–κ- og M–N-plott som SVG, lastpunkt, utnyttelse
    solver-client.js          A4a   worker-håndtak: init/progress/run/cancel
    results.js               A4b   resultatformatering, utnyttelse, statustekster
    report.js                 A4b   A4-rapportbygger
    ui.js                     A4a   DOM-binding
    main.js                   A4a   oppstart
  workers/
    solver-worker.js          A1    Pyodide-oppsett + meldingsprotokoll
  python/
    engine.py                 A1    run(payload)->result. Eneste structuralcodes-kode.
    triangle_shim.py          A1    (bare hvis §3.4 krever det)
  vendor/
    *.whl                     A1    vendored hjul (structuralcodes m.m.)
  tests/
    rebar.test.mjs            A2
    section.test.mjs          A2
    payload.test.mjs          A2
    store.test.mjs            A2
    section-draw.test.mjs     A3
    charts.test.mjs           A3
    results.test.mjs          A4b
    report.test.mjs           A4b
    python/test_engine.py     A1    regresjonstest mot skrivebords-CPython
```

Kjøres med `node --test concrete_section_calculator/tests/` (rot-`package.json` får
`"test:concrete-section"`). Python-testene kjøres manuelt lokalt — CI dekker bare 2dfea.

**Designkrav som gjør modulen agent-vennlig og testbar:**
1. `python/engine.py` må kunne kjøres av vanlig skrivebords-CPython, ikke bare Pyodide.
   Ingen `js`/`pyodide`-import på toppnivå. Da kan samme kodevei regresjonstestes lokalt
   med ekte `structuralcodes` og ekte `triangle`.
2. Alle `js/`-moduler unntatt `ui.js`/`main.js` er DOM-frie og rene — inn: objekt, ut:
   objekt eller SVG-streng. Det er derfor de kan testes med `node --test`.
3. Én JSON-kontrakt (§5) mellom JS og Python, versjonert med `schema`.

## 3. Motor (fylles ut etter forskning)

### 3.1 Prinsipp
`structuralcodes` brukes uendret, hentet inn som vendored hjul i `vendor/`. Oppgradering
senere = bytt hjulfil + bump versjonskonstant i `solver-worker.js`. Ingen kjøretids-
avhengighet til PyPI.

### 3.2 Runtime og lasting
TBD — avventer runtime-forskning. Målt nedlastingsbudsjett (verifisert, Pyodide 0.27.7):

| fil | størrelse |
|---|---|
| `pyodide.asm.wasm` | 9,64 MB |
| `scipy` | 12,85 MB |
| `openblas` (scipy-avhengighet) | 5,83 MB |
| `numpy` | 2,92 MB |
| `python_stdlib.zip` | 2,25 MB |
| `pyodide.asm.js` | 1,20 MB |
| `shapely` | 0,79 MB |
| `micropip` + `packaging` | 0,18 MB |
| `structuralcodes` | 0,20 MB |
| **sum kald last** | **≈ 36 MB** |

`scipy` kan **ikke** unngås: `structuralcodes/sections/_beam_section.py:11` gjør
`from scipy.linalg import lu_factor, lu_solve` på modulnivå. Scipy + openblas er altså
18,7 MB vi må bære. Oppstart + installasjon målt til ~2,0 s med alt varmt i cache.

Det er derfor §3.3 sin «start motoren ved sidelast» ikke er en finesse, men det som
avgjør om modulen føles rask.

### 3.3 Progresjon og avbrudd
Worker -> hovedtråd: `{type:'progress', payload:{phase, pct, message}}`.
Faser: `runtime` -> `packages` -> `engine` -> `section` -> `solve` -> `done`.
`solve` rapporterer per beregningspunkt der analysen har naturlige punkter (M–N-diagram,
moment–krumning), ellers bare start/slutt.

Motoren initialiseres **med én gang ved sidelast**, parallelt med at brukeren fyller ut
skjemaet, slik at «Beregn» normalt treffer en varm motor. Statuspille i UI viser
motortilstand.

Avbrudd: Pyodide kan ikke avbrytes midt i et Python-kall uten SharedArrayBuffer (som
krever COOP/COEP — utilgjengelig på GitHub Pages). «Avbryt» gjør derfor
`worker.terminate()` + ny worker, og UI sier «starter motoren på nytt». Alternativt kan
progress-callbacken reise et unntak — avgjøres i §3.2.

### 3.4 triangle-avhengigheten — LØST, ingen WebAssembly trengs

Verifisert ved å kjøre `structuralcodes` 0.7.2 under ekte Pyodide (0.27.7 og 314.0.7):

`triangle` importeres på **toppnivå** to steder —
`structuralcodes/geometry/_geometry.py:10` og
`structuralcodes/sections/section_integrators/_fiber_integrator.py:8` — og begge nås fra
`structuralcodes/__init__.py`. Derfor feiler `import structuralcodes` uten den. Men den
**brukes** bare av:
1. `fiber`-integratoren, og
2. `SurfaceGeometry.random_points_within()` (og dens eneste bruker, en tøynings/spennings-
   scatter-tabell i `core/_section_results.py:539`).

Standardintegratoren er `marin` (`_beam_section.py:53`, `integrator: Literal['marin',
'fiber'] = 'marin'`), som er analytisk og polygonbasert og aldri rører `triangle`. Alle
analysene vi vil ha — `calculate_bending_strength`, `calculate_moment_curvature`,
`calculate_nm_interaction_domain`, `calculate_mm_interaction_domain`,
`calculate_nmm_interaction_domain` — er integrator-agnostiske og kjørte til ende med
`marin` på rektangel, ikke-konvekst T-tverrsnitt og hulprofil med hull.

**Løsningen er to linjer:**
```python
import micropip
micropip.add_mock_package('triangle', '20250106')
await micropip.install('./vendor/structuralcodes-0.7.2-py3-none-any.whl', deps=False)
```
`add_mock_package(name, version, *, modules=None, persistent=False)` finnes i micropip
0.9.0 og gjør at avhengigheten hoppes over i oppløsningen *og* at `import triangle`
lykkes. `deps=False` er trygt fordi numpy/scipy/shapely lastes med `loadPackage` først.

Felle: `modules` er keyword-only. Å sende den posisjonelt fra JavaScript
(`micropip.add_mock_package("triangle","1.0",{...})`) **krasjer interpreteren**. All
registrering skjer derfor inne i `runPythonAsync`.

**Ikke i første leveranse, men klar:** en ren Python-`triangle.triangulate` bygget på
`scipy.spatial.Delaunay` + `shapely` (~120 linjer, allerede skrevet og testet i
scratchpad) gir `fiber`-integratoren tilbake innenfor 0,006–1,0 % av `marin` ved
`mesh_size ≤ 0.002`, og gjenoppretter `random_points_within`. Den legges inn som
`python/triangle_shim.py` først når vi faktisk trenger fiber-integrasjon — og da med et
tak på `mesh_size` for tverrsnitt med hull, der den målte −7,2 % avvik ved grov nettverk.

Emscripten-sporet er **forkastet**, og ikke bare fordi vi ikke trenger det: Docker-daemonen
er nede på denne maskinen, WSL mangler både pip og DNS, `emcc` finnes ikke, og
`pyodide-build` støtter ikke Windows. Ingen har publisert et emscripten-hjul for
`triangle` (PyPI har bare cp37–cp311 for win/mac/manylinux). Dessuten er Shewchuks
Triangle bare fri for ikke-kommersiell bruk, noe som ville krevd en lisensavklaring før
vi kunne distribuert et wasm-bygg.

### 3.5 Feller i structuralcodes som må håndteres

1. **Advarsler er unntak.** `structuralcodes/__init__.py` avslutter med
   `warnings.filterwarnings(action='error', category=StructuralCodesWarning)`, så
   manglende konvergens kommer som `NoConvergenceWarning`-*exception*. `engine.py` må
   nedgradere dem og rapportere dem som resultat:
   ```python
   import warnings
   from structuralcodes.core.errors import StructuralCodesWarning
   warnings.filterwarnings('always', category=StructuralCodesWarning)
   ```
   og fange dem med `warnings.catch_warnings(record=True)` rundt hver analyse, slik at
   teksten havner i `result.warnings` og vises i UI. Å svelge dem ville skjult et ekte
   «tverrsnittet kunne ikke likevektes»-resultat.
2. **API-navnene** er `BeamSection`, `create_concrete`, `create_reinforcement`,
   `set_design_code('ec2_2004')`, `SurfaceGeometry`, `add_reinforcement` — ikke
   `GenericSection`. Eksakte signaturer: se §3.6.
3. **Fortegn.** `calculate_bending_strength().m_y` kom ut negativ for et tverrsnitt med
   armering i underkant. Fortegnskonvensjonen må fastslås og dekkes av en regresjonstest
   før UI tolker tallet — se §3.6.

### 3.6 Eksakt API (verifisert mot structuralcodes 0.7.2, kjørt lokalt)

```python
from shapely import Polygon
from structuralcodes.materials.concrete import ConcreteEC2_2004
from structuralcodes.materials.reinforcement import ReinforcementEC2_2004
from structuralcodes.geometry import SurfaceGeometry, CompoundGeometry, add_reinforcement
from structuralcodes.sections import BeamSection

ConcreteEC2_2004(fck=30, gamma_c=1.5, alpha_cc=0.85)     # fck er TALL, ikke 'C30/37'
ReinforcementEC2_2004(fyk=500, Es=200000, ftk=540, epsuk=0.075, gamma_s=1.15)
SurfaceGeometry(poly, material)                          # material kan være BÅDE betong OG stål
PointGeometry(point, diameter, material)                 # areal ALLTID π·d²/4, ingen area=
BeamSection(geometry, integrator='marin')                # 'marin' er standard
```

**Aksesystem.** `BeamSection` bruker Y horisontalt og Z vertikalt. Shapely-koordinaten
`(x, y)` betyr altså `(Y, Z)` = (horisontal, vertikal). Payloaden i §5 bruker derfor
`y`/`z`, ikke `x`/`y`, for å matche Python-siden. Tegnekoden i `section-draw.js` bruker
sine egne skjerm-koordinater og gjør konverteringen selv.

**Fortegn.** `n > 0` er STREKK, `n < 0` er TRYKK. `theta = 0` gir trykksone ØVERST, så en
bjelke med underkantarmering får **negativ `m_y`** for feltmoment. `engine.py` returnerer
derfor `abs(m_y)` som `M_Rd` sammen med et eksplisitt `sign`-felt, slik at UI aldri må
gjette.

**Nullpunkt.** `eps_a`, `N` og `M` refereres til globalt `(0,0)`, ikke til tyngdepunktet.
Tverrsnittet må derfor sentreres om origo. `payload.js` gjør det.

#### Utsmurt platearmering — brukerens spesifikasjon er VERIFISERT
`SurfaceGeometry(strip_polygon, reinforcement_material)` godtas: konstruktøren krever bare
`isinstance(material, Material)`, og `Reinforcement` er en `Material`. Integratoren bruker
stålets arbeidsdiagram på flata. Målt på plate 1000×200, Ø12, A_s = 1000 mm²/m,
overdekning 25:

| modell | M_Rd |
|---|---|
| stripe (høyde 12 mm, bredde 83,33 mm) | **−69,865 kNm/m** |
| 9 diskrete Ø12 skalert til A_s = 1000 | −69,745 kNm/m |

**0,17 % avvik.** Stripa er altså en gyldig modell, akkurat som du beskrev. Reserve-
løsningen med punktjern er ikke nødvendig, men `engine.py` beholder den bak
`options.smear_mode` fordi `gross_properties.area_reinforcement` rapporterer **0** for en
utsmurt flate — A_s må spores på JS-siden uansett.

#### Regresjonsgrunnlag (bjelke 300×600, C30/37 α_cc=1.0, 3Ø20, overdekning 40)
```
As = 942.4778 mm²,  d = 550 mm,  fcd = 20.0 MPa,  fyd = 434.783 MPa
n_min = -4 010 438.41 N      n_max = +442 554.79 N
M_Rd (theta=0, n=0)      = -215 006 759.19 Nmm  = -215.007 kNm
M_Rd (theta=0, n=-500kN) = -305 396 903.0  Nmm  = -305.397 kNm
eps_a = 0.00869668   chi_y = -4.065559e-05
moment-krumning: 20 punkter, flyt på indeks 9 (chi=-5.704253e-06, m=-201.2 kNm),
                 siste punkt = -2.150068e+08 (identisk med bøyekapasiteten)
N-M-diagram theta=0: (35,3), |m_y| topper på 364.25 kNm ved n = -1 238 119.8 N
```
Disse tallene er akseptkriteriet i `tests/python/test_engine.py`.

### 3.7 Ytelse og framdrift (målt, CPython 3.11)

| operasjon | integrasjoner | tid (native) | forventet i Pyodide |
|---|---|---|---|
| `calculate_bending_strength` | 33 | 14 ms | 30–70 ms |
| `calculate_nm_interaction_domain` (35 pkt) | **1 per punkt** | 15 ms | 30–75 ms |
| `calculate_moment_curvature` (20 pkt) | ~32 per punkt | 231 ms | 0,5–1,2 s |
| `calculate_mm_interaction_domain` (33 θ) | ~32 per θ | 453 ms | 1–2,5 s |

Bøyekapasitet og N-M-diagram er altså praktisk talt momentane — framdriftslinja der er
kosmetikk. Moment–krumning er den eneste som virkelig trenger den.

**Framdrift har ingen callback i API-et.** Løsningen er å telle integrasjoner ved å bytte
ut integratormetoden:
```python
_orig = MarinIntegrator.integrate_strain_response_on_geometry
def _counting(self, *a, **k):
    _tick()                      # poster til JS hver N-te gang
    return _orig(self, *a, **k)
MarinIntegrator.integrate_strain_response_on_geometry = _counting
```
Antall integrasjoner er kjent på forhånd for alle tre analysene (tabellen over), så
framdriftslinja blir **determinat**, ikke en udefinert spinner. For moment–krumning kan vi
alternativt drive løkka selv ved å sende inn `chi=`-array og kalle ett punkt om gangen —
det gir også avbrytbarhet. Velges av A1 ut fra hva som er enklest å holde korrekt.

### 3.8 Merk: stålarealet trekkes IKKE fra betongen

Både marin- og fiber-integratoren legger `π·d²/4` til som et ekstra ledd uten å punsjere
hull i betongpolygonet — stålet dobbelttelles med betongen det fortrenger. Verifisert at
det ikke gjør noen forskjell for jern i **strekksonen** (parabel-rektangel gir null
betongspenning der), men for **trykkarmering** er feilen reell og ikke-konservativ
(størrelsesorden 1 % for et vanlig bjelketverrsnitt).

Valg: `options.subtract_bar_area` med standard **`false`**, som er oppstrøms oppførsel og
det regresjonsgrunnlaget over er målt mot. Men `engine.py` skal **legge en advarsel i
`result.warnings`** når et jernsenter ligger i trykksonen ved brudd, med teksten om at
kapasiteten da er marginalt på usikker side og at avkryssing finnes i avanserte valg.
Rapporten gjengir advarselen. Å velge standard `true` ville gitt tall som ikke lenger
stemmer med `structuralcodes` selv, og det er en dårlig bytte for en modul hvis hele
poeng er å følge oppstrøms pakke.

## 4. Modellen

### 4.1 Tilstand (`store.js`)
```js
{
  schema: 1,
  sectionType: 'beam' | 'slab',
  geometry: { b: 300, h: 600 },          // slab: b er låst til 1000
  concrete: {
    grade: 'C30/37',
    gamma_c: 1.5,
    alpha_cc: 0.85,
    law: 'parabolarectangle' | 'bilinearcompression' | 'sargin',
  },
  steel: {
    fyk: 500, Es: 200000,
    gamma_s: 1.15,
    law: 'elasticperfectlyplastic' | 'elasticplastic',
    epsuk: 0.05, k: 1.08,                // brukes bare av 'elasticplastic'
  },
  cover: 35,                             // standard overdekning for nye lag
  layers: [ Layer, ... ],
  loads: { N_Ed: 0, M_Ed: 0 },           // kN / kNm. TRYKK ER NEGATIV N.
  analysis: 'bending' | 'moment_curvature' | 'nm_domain',
  options: { theta: 0, integrator: 'marin'|'fiber', nPoints: 32, meshSize: null },
  doc: { project: '', title: '', author: '', date: '', note: '' },
}
```

### 4.2 Armeringslag (`rebar.js`)
Ett felles lagobjekt for begge tverrsnittstyper, med `mode` som diskriminant:
```js
// Bjelke
{ id: 'L1', mode: 'bars',    dia: 20, count: 3,        edge: 'bottom', dc: 50 }
// Plate
{ id: 'L2', mode: 'spacing', dia: 16, spacing: 135,    edge: 'bottom', dc: 43 }
```
- `edge` — hvilken kant `dc` måles fra: `'bottom'` eller `'top'`.
- `dc` — avstand fra kanten til **jernets senter** (mm). Entydig, ingen tvil om
  overdekning-til-ytterkant vs. senter.
- Hjelper i UI: «overdekning c + bøyle-Ø» -> `dc = c + dia_boyle + dia/2`.

Rene funksjoner (alle testet):
```js
layerArea(layer)          // mm²  bars: count*π*dia²/4   spacing: (1000/s)*π*dia²/4
layerBarCount(layer)      // antall jern som TEGNES (spacing: floor/round over 1000 mm)
layerCentroidY(layer, h)  // y i seksjonskoordinater, y=0 i senter, +opp
layerDepth(layer, h)      // d fra trykkant (avhenger av momentretning)
totalArea(layers)         // mm² (per meter for plate)
reinforcementRatio(layers, geometry)   // ρ = As/(b*h)
equivalentStrip(layer)    // {width, height, y} — se §4.3
```

### 4.3 Utsmurt armering i plate
Brukeren oppgir Ø og senteravstand s. Per meter:

    As = (1000 / s) · π·Ø² / 4      [mm²/m]

**Tegning** viser `round(1000/s)` jern plassert i faktisk senteravstand s, sentrert om
platebredden — slik at brukeren ser det virkelige mønsteret selv om 1000/s ikke går opp.

**Motor** får en rektangulær stripe med samme areal og samme tyngdepunkt:

    høyde  = Ø
    bredde = As / Ø
    senter = layerCentroidY(layer, h)

For enakset bøying er det bare arealet og dybdeplasseringen som betyr noe, så stripa er
eksakt ekvivalent. `payload.js` sender `smear: {mode:'strip', width, height, y}`.

Stripa er **verifisert** mot diskrete jern med 0,17 % avvik (§3.6), så dette er
standardmodellen — ikke en tilnærming vi må unnskylde.

Reservemodus `smear_mode: 'bars'` finnes for sammenligning: `n = round(1000/s)` punktjern.
Merk at `PointGeometry` **ikke** har et `area`-argument — arealet er alltid `π·d²/4` — så
et punktjern med avvikende areal må oppgis med ekvivalent diameter
`d_eq = sqrt(4·As_per_jern/π)`. `engine.py` returnerer hvilken modus som ble brukt i
`result.meta.smear_mode`, slik at rapporten kan si det.

## 5. JSON-kontrakten JS <-> Python

Dette er den eneste koblingen mellom A1 og resten. Endres bare ved å bumpe `schema`.

### 5.1 Inn (`payload`)
Alle lengder i **mm**, krefter i **N**, momenter i **Nmm**, spenninger i **MPa**.
`payload.js` konverterer fra brukerens kN/kNm. Trykk-aksialkraft er **negativ**.

```json
{
  "schema": 1,
  "analysis": "bending" | "moment_curvature" | "nm_domain",
  "section": {
    "type": "beam" | "slab",
    "b": 300.0,
    "h": 600.0,
    "concrete": { "grade": "C30/37", "gamma_c": 1.5, "alpha_cc": 0.85,
                  "law": "parabolarectangle" },
    "steel":    { "fyk": 500.0, "Es": 200000.0, "gamma_s": 1.15,
                  "law": "elasticperfectlyplastic", "epsuk": 0.05, "k": 1.08 },
    "rebar": [
      { "id": "L1", "kind": "bars",
        "bars": [ {"y": -100.0, "z": -250.0, "dia": 20.0}, ... ] },
      { "id": "L2", "kind": "strip",
        "strip": {"width": 83.33, "height": 16.0, "z": -57.0}, "area": 1333.3 }
    ]
  },
  "loads": { "N_Ed": -200000.0, "M_Ed": 250000000.0 },
  "options": { "theta": 0.0, "integrator": "marin", "n_points": 32,
               "mesh_size": null }
}
```

`payload.js` gjør ALL geometriregning: den sender ferdige jernkoordinater, ikke
`count`/`spacing`. Motoren skal ikke kjenne begrepet «senteravstand». Det holder
Python-siden tynn og gjør hele geometri-logikken testbar i Node.

**Koordinatnavnene er `y` (horisontalt) og `z` (vertikalt), ikke `x`/`y`** — det matcher
`BeamSection` sitt akseystem (§3.6) slik at `engine.py` kan sende dem rett inn i shapely
uten navnebytte. Tverrsnittet er sentrert om origo, som API-et krever. `section-draw.js`
bruker sine egne skjermkoordinater og konverterer selv.

### 5.2 Ut (`result`)
```json
{
  "ok": true,
  "schema": 1,
  "analysis": "bending",
  "meta": {
    "structuralcodes_version": "x.y.z",
    "integrator": "marin",
    "smear_mode": "strip",
    "runtime": "pyodide 0.xx",
    "wall_time_ms": 412
  },
  "materials": {
    "fck": 30.0, "fcd": 17.0, "eps_c2": 0.002, "eps_cu2": 0.0035,
    "fyk": 500.0, "fyd": 434.78, "eps_yd": 0.002174, "eps_ud": 0.0435,
    "Ecm": 32837.0
  },
  "section_props": { "Ag": 180000.0, "As_total": 942.48, "rho": 0.00524,
                     "d_eff": 550.0 },

  "bending": {
    "N_Ed": -200000.0,
    "M_Rd": 251300000.0,
    "x": 142.0,
    "eps_c_top": -0.0035, "eps_s_bottom": 0.0121,
    "failure_mode": "concrete_crushing" | "steel_rupture",
    "M_Ed": 250000000.0,
    "utilisation": 0.995
  },

  "moment_curvature": {
    "N_Ed": -200000.0,
    "kappa": [ ... ],          // 1/mm
    "moment": [ ... ],         // Nmm
    "yield_index": 12,         // indeks der armeringen flyter (eller null)
    "M_Rd": 251300000.0,
    "M_Ed": 250000000.0,
    "utilisation": 0.995
  },

  "nm_domain": {
    "n": [ ... ],              // N, trykk negativ
    "m": [ ... ],              // Nmm
    "N_Ed": -200000.0, "M_Ed": 250000000.0,
    "utilisation": 0.83,       // radiell, regnes i JS (charts.js), ikke i Python
    "N_min": -3200000.0, "N_max": 410000.0
  },

  "warnings": [ "..." ]
}
```
Ved feil: `{ "ok": false, "error": { "message": "...", "kind": "input"|"engine",
"traceback": "..." } }`. Motoren kaster aldri uhåndtert — den svarer alltid med JSON.

## 6. Tegning og plott (`section-draw.js`, `charts.js`)

Rene funksjoner som returnerer **SVG-strenger**. Samme funksjon brukes på skjerm og i
A4-rapporten, med ulik `opts.width`/`opts.scale`. Ingen chart-bibliotek — vektorgrafikk
er både skarpere på papir og lettere å teste.

```js
// section-draw.js
drawSection(model, opts) -> string
//   model: {sectionType, geometry, layers, h, b} + valgfritt {x, neutralAxisAngle}
//   opts:  {widthMm|widthPx, showDims, showLabels, showNeutralAxis, theme:'dark'|'print'}
sectionViewBox(model, opts) -> {minX, minY, w, h, scale}   // testbar uten SVG-parsing

// charts.js
momentCurvatureSvg(mc, opts) -> string
nmDomainSvg(dom, opts) -> string
radialUtilisation(dom, N_Ed, M_Ed) -> {eta, lambda, hitN, hitM}  // stråle mot omhylling
```

`radialUtilisation` er ren geometri (stråle fra origo mot omhyllingspolygonen) og skal ha
egne tester, inkludert lastpunkt utenfor omhyllingen, i origo, og ren aksial last.

## 7. UI

Norsk, mørkt tema, Tailwind via CDN, tosidig oppsett:

**Venstre panel (rullbart)**
1. Tverrsnittstype — `[Bjelke | Plate]`
2. Geometri — b, h (plate: b vist som «1000 mm (per meter)», låst)
3. Betong — kvalitet, γ_c, α_cc, arbeidsdiagram
4. Armeringsstål — f_yk, E_s, γ_s, arbeidsdiagram, ε_uk, k
5. Armering — liste med lag. Hver rad: `antall × Ø` (bjelke) eller `Ø c/c s` (plate),
   kant, `dc`, og avledet `As` + `d` vist i grått. Knapper per rad: ⧉ dupliser, ✕ slett.
   «+ Legg til lag» bruker standard overdekning.
6. Lastvirkning — N_Ed (kN, trykk negativ), M_Ed (kNm)
7. Analyse — valg + analysespesifikke opsjoner
8. Dokumentasjon — prosjekt, tittel, utført av, dato, kommentar

**Høyre panel**
- Tverrsnittstegning øverst, oppdateres live ved hver tilstandsendring (ingen motor
  trengs for tegningen — det er derfor den føles umiddelbar)
- «Beregn»-knapp + framdriftslinje med fasetekst + «Avbryt»
- Resultatkort og plott
- «Rapport»-knapp -> A4-overlegg

Alle tallfelt er uttrykksfelt (`200+50`, `20*5^2/8`) etter mønsteret i
`geometry_workspace/js/numeric-input.js`.

## 8. A4-rapport (`report.js` + `print.css`)

Mønsteret fra `geometry_workspace`: rapporten bygges **på forespørsel** i
`#report-overlay`, og klones rett før utskrift inn i `#cscPrintRoot` som direkte barn av
`<body>`. Egen `print.css` — ikke den delte `assets/css/report-print.css`, av samme grunn
som `geometry_workspace/print.css` dokumenterer.

Innhold:
1. Topptekst — prosjekt, tittel, utført av, dato, modulnavn + versjon
2. Tverrsnitt — figur først, deretter geometri- og materialtabell med ALLE faktorer og
   avledede verdier (f_cd, f_yd, ε_cu2, ε_ud)
3. Armering — lagtabell (n, Ø, A_s, d, per meter for plate), ΣA_s, ρ
4. Lastvirkning
5. Resultat — stor boks: M_Rd, x, tøyninger, bruddform, η
6. Plott — M–κ eller M–N med lastpunkt
7. Forutsetninger og metode — arbeidsdiagram, integrator, utsmurt-modus,
   `structuralcodes`-versjon, EC2-referanser

Sidebrudd mellom 5 og 6 hvis nødvendig; figurbredde fast 174 mm som i
`geometry_workspace`.

## 9. Arbeidsflyt-API (`plan_IO-structure_for_modules.md`)

`index.html` får `MODULE_CONFIG` (alle inputs/outputs med `label`, `symbol`, `type`,
`unit`, `category`, og `path` for outputs) og `window.ModuleAPI` med
`getConfig/getInputs/setInputs/calculate/getLastResults/getOutput/getAllOutputs/hasResults`.

Ett avvik fra spesifikasjonen, som må dokumenteres i `README.md`: `calculate()` er
**asynkron** her, fordi motoren er en worker. Den returnerer et `Promise`.
`ModuleAPI.calculateSync` finnes ikke. Arbeidsflyt-systemet må `await`.

## 10. Distribusjon

- `concrete_section_calculator/**` treffes allerede av `paths:`-filteret `concrete_*/**`
  i `deploy-all-modules.yml` — men mappa **må** likevel legges inn i kopi-løkka
  (`for dir in … ;`) ellers blir siden 404 selv om alt er kommitert.
- `module-registry.json` genereres automatisk — ikke rediger. Modulen trenger
  `<title>`, `<meta name="description">` og `<meta name="keywords">` i `index.html`.
- Kort i rot-`index.html` med «Under Development»-banner, som `geometry_workspace`.
- GA-tag rett etter `<head>`, eksakt som i `CLAUDE.md`.
- `.whl`-filer serveres som `application/octet-stream` av GitHub Pages; verifiser at
  `scripts/dev-server.js` ikke kveler dem lokalt (MIME-tabellen mangler `.whl`, men
  fallback er `application/octet-stream`, som er greit).

## 11. Bølger og rekkefølge

- **Bølge 1 (parallelt):** A1 motor, A2 modell, A3 tegning+plott
- **UX-PORT:** UX-agent lager to mockups med EKTE plott og EKTE tverrsnittstegning fra
  bølge 1. Brukeren åpner dem i nettleseren og velger. Se §11.1.
- **Bølge 2 (parallelt):** A4a skall+UI etter valgt design, A4b rapport+resultat
- **Bølge 3:** integrasjon, nettleserverifisering, distribusjonskobling, rot-kort

Porten ligger etter bølge 1, ikke før, fordi de to tingene som avgjør layouten — hvordan
M–κ-kurven og N–M-omhyllingen faktisk ser ut med ekte tall, og hvor mye plass resultatene
krever — ikke er kjent før motoren har kjørt. Å tegne mockups før det ville vært gjetning.

### 11.1 UX-brief (premisser, ikke forslag)

Disse er gitt og skal ikke «foreslås bort»:
- Logiske seksjoner ovenfra og ned: **materiale → geometri → armering → last → beregn →
  resultat**. Fra hvilken som helst seksjon skal «Beregn» være innen rekkevidde.
- Beregning skal kunne utløses med **tastatur**, ikke bare museklikk.
- **Minst mulig klikking, lesing og småbokser.** Færre felt som må treffes med musa.
  Armeringslag er stedet dette avgjøres — der ligger all gjentakelsen.
- Resultatet skal kunne **inspiseres** etterpå: hva ble nøytralaksen, hvilke tøyninger,
  hvilken bruddform, hvor ligger lastvirkningen mot kapasiteten.
- Tverrsnittstegningen oppdateres live uten motor, så den skal aldri vente på noe.

Agenten leverer **to** komplette, klikkbare HTML-mockups (statiske, med ekte SVG-er
inlinet, ingen motor) som skiller seg i *struktur*, ikke i farge — f.eks. én sammenhengende
rullende arbeidsflate mot ett fast to-panel-oppsett. Begge skal vise samme utfylte
eksempel, slik at de kan sammenlignes direkte.

Alt skjer i worktree `C:\Python\structural_tools-csc` på
`feat/concrete-section-calculator`. Ingenting distribueres før brukeren har testet og
branchen er slått sammen.

## 12. Aksept

- [ ] `node --test concrete_section_calculator/tests/` grønn
- [ ] `python/engine.py` gir samme M_Rd i skrivebords-CPython som i nettleseren
- [ ] Bjelke 300×600 C30/37 3Ø20 stemmer med regresjonstallet fra forskningen
- [ ] Plate 1000×200 Ø12 c/c 150 gir As = 754 mm²/m og plausibel M_Rd
- [ ] Alle tre analysene kjører uten å låse UI, med synlig framdrift
- [ ] Rapporten skriver ut på A4 uten avkuttet innhold, med figur og plott
- [ ] `window.ModuleAPI` svarer etter spesifikasjonen
