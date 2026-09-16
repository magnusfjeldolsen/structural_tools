# concrete_section_calculator — betongtverrsnitt i bruddgrensetilstand

Én modul som regner **bruddgrensekapasitet** for armerte betongtverrsnitt etter Eurocode 2 ved å
kjøre fib [`structuralcodes`](https://github.com/fib-international/structuralcodes) 0.7.2 —
uendret, fra et vendored hjul — i nettleseren via Pyodide.

Erstatter og overgår `concrete_beam_design` og `concrete_slab_design`.

**Live:** <https://magnusfjeldolsen.github.io/structural_tools/concrete_section_calculator/>

---

## 1. Hva den gjør

Tre analyser, begge momentretninger, to tverrsnittstyper:

| Analyse | Gir |
|---|---|
| **Bøyekapasitet** | `M_Rd` ved gitt `N_Ed`, nøytralakse `x`, `x/d`, tøyning og spenning per armeringslag, bruddform |
| **Moment–krumning** | `M(κ)` i 20 punkter med `M_Ed` og flytepunktet inntegnet |
| **M–N-diagram** | Full kapasitetsomhylling (69 punkter) med lastpunktet inntegnet |

- **Bjelke** `b × h`, armeringslag som `antall × Ø`.
- **Plate** alltid 1000 mm bred (alt per meter), armeringslag som `Ø c/c s`. Tegningen viser jern i
  faktisk senteravstand; motoren får en ekvivalent utsmurt stripe (verifisert innenfor 0,17 %).
- **Feltmoment** (θ = 0, trykk oppe) og **støttemoment** (θ = π, trykk nede).
- Flere armeringslag, hvert med egen kant og egen `d_c`.
- Utskriftsklar A4-rapport med tverrsnittsfigur, plott, kontrolltabell og forutsetningskapittel.

**Uttrykkelig utenfor omfang:** skjær, riss/SLS, nedbøyning, torsjon, forankring, biaksiell bøying,
forspenning, brann, eksponeringsklasser. Se `global-devspecs/concrete_section_calculator-plan.md`
§1.1 og §1.2 — §1.2 forklarer også hva som er **kuttet med begrunnelse** (`fiber`-integratoren,
`law: 'sargin'`, `smear_mode: 'bars'`, lagring av tilstand) og som ikke skal legges inn igjen.

---

## 2. Kjøre lokalt

Modulen er ren statisk HTML + ES-moduler. Den må serveres over HTTP — `file://` virker ikke, fordi
worker-en er en **modulworker** og Pyodide hentes over nett.

```bash
npm run dev:serve        # serverer hele repoet, som GitHub Pages
# -> http://localhost:8080/concrete_section_calculator/
```

Tester:

```bash
npm run test:concrete-section                                   # JS, node:test
python -m pytest concrete_section_calculator/tests/python/      # motoren, CPython
```

---

## 3. Filer og eierskap

```
concrete_section_calculator/
  index.html                  UI-skall, GA-tag, MODULE_CONFIG, window.ModuleAPI
  print.css                   A4-rapport (skjermoverlegg + @media print)
  README.md                   denne fila
  js/
    meta.js                   MODULE_VERSION/ID/NAME — bumpes HER og bare her
    store.js                  tilstand + subscribe/notify
    materials.js              kvaliteter, faktorer, avledede materialverdier
    section.js                geometrimodell, avledede størrelser, validering
    rebar.js                  armeringslag, barPositions, utsmurt stripe
    payload.js                tilstand -> motor-payload
    numeric-input.js          uttrykksfelt («35+8», «20*5^2/8»)
    section-draw.js           tverrsnitts-SVG (skjerm og papir)
    charts.js                 M–κ- og M–N-SVG, lastpunkt, radiell λ
    solver-client.js          worker-håndtak: init/run/cancel/progress
    results.js                resultatformatering, norske statustekster
    report.js                 A4-rapportbygger
    ui.js                     DOM-binding
    main.js                   oppstart og orkestrering
  workers/solver-worker.mjs   Pyodide-vert + meldingsprotokoll
  python/engine.py            run(payload, progress=None) — eneste structuralcodes-kode
  python/wasm_stubs.py        install_stubs() — triangle + scipy
  vendor/*.whl                structuralcodes, vendored
  docs/                       forskningsgrunnlag. LES, ikke rediger
  tests/                      fixturer + JS- og Python-tester
```

Alt i `js/` **unntatt `ui.js` og `main.js`** er DOM-fritt og rent, og kjører i `node --test`.

---

## 4. Oppgradere `structuralcodes`

Dette er hele grunnen til at hjulet er vendored og lastes med `loadPackage` i stedet for å bygges
inn i et tarball-bunt: **oppgraderingen er å bytte én fil.** Ingen byggesteg, ingen
kjøretidsavhengighet til PyPI.

1. **Legg det nye hjulet i `vendor/`.**

   ```bash
   pip download structuralcodes==<ny versjon> --no-deps -d concrete_section_calculator/vendor/
   ```

   Filnavnet **må være et gyldig wheel-navn** (`structuralcodes-<versjon>-py3-none-any.whl`).
   Pyodide svarer `InvalidWheelFilename` på alt annet, og `Content-Type` ser den ikke på —
   `application/octet-stream` er verifisert greit.

2. **Bump `SC_WHEEL_URL` i `workers/solver-worker.mjs`.** Den står øverst i fila:

   ```js
   const SC_WHEEL_URL = new URL('../vendor/structuralcodes-0.7.2-py3-none-any.whl', import.meta.url).href;
   ```

   Oppdater `STRUCTURALCODES_VERSION` i `js/meta.js` i samme commit — den trykkes i rapportens
   forutsetningskapittel.

3. **Kjør stub-ekvivalenstesten. Dette steget er ikke valgfritt.**

   ```bash
   python -m pytest concrete_section_calculator/tests/python/test_stub_equivalence.py
   ```

   Den gjør to ting, og begge er avgjørende:

   - Kjører referansetilfellet i to underprosesser — én med ekte `scipy`, én med
     `wasm_stubs.install_stubs()` — og påstår **identiske tall**.
   - Gransker installert `structuralcodes` for `scipy`-importer og **feiler hvis settet har
     endret seg** fra de fire kjente stedene.

   `scipy` er 13,87 MB over nettet og 2 176 ms CPU per last, og `structuralcodes` 0.7.2 bruker
   nøyaktig tre funksjoner av den (`lu_factor`/`lu_solve` som par, pluss `interp1d`/`griddata` i kode
   vi ikke rører). Stubben erstatter LU-løsningen med `np.linalg.solve` — samme LAPACK-rutine, målt
   bit-identisk. Utvider en ny versjon av pakken sin `scipy`-bruk, skal det oppdages **høylytt i
   test**, ikke stille i nettleseren hos en bruker.

4. **Kjør resten**: `npm run test:concrete-section` og
   `python -m pytest concrete_section_calculator/tests/python/`.

Samme framgangsmåte gjelder Pyodide: bump `PYODIDE_VERSION` i `workers/solver-worker.mjs` og
`<link rel="modulepreload">`/`<link rel="preload">`-URL-ene i `index.html`. De peker på samme
versjon, og en glemt oppdatering her gir en nedlasting som ikke gjenbrukes — ikke en feil, bare en
tregere side.

---

## 5. Meldingsprotokollen — tre feller

`{ type, msgId, payload }` i begge retninger. Formen er **frosset** i plan §3.3.
`js/solver-client.js` eier klientsiden; `workers/solver-worker.mjs` eier worker-siden.

1. **`cancel` MÅ bære `payload.target`** — `msgId`-en for løpet som skal avbrytes. Uten den vet ikke
   worker-en hvilken jobb som skal kastes ut av køa, og «Avbryt» blir en knapp som svarer «ok» uten
   å avbryte noe.
2. **`{ok: false}` fra motoren kommer som `type: 'result'`, ikke `error`.** `axial_out_of_range` er
   et **svar** brukeren skal lese, ikke en krasj. `error` er reservert for worker- og
   kjøretidssvikt.
3. **`pct` er et heltall 0–100**, ikke 0–1. En klient som ganger med 100 én gang for mye får en
   framdriftslinje som står på 100 % fra første sekund.

### 5.1 «Avbryt» er skrudd av for to av tre analyser

Bøyekapasitet er målt til 54 ms og M–N-diagrammet til 60–140 ms. Et løp som **allerede regner** kan
ikke stoppes — eneste utvei er `worker.terminate()` og en ny 10 MB oppstart. Å tilby det for å angre
en 50 ms jobb er et dårlig bytte. Bare moment–krumning er avbrytbar, og der er avbruddet gratis:
det er å la være å sende neste punkt.

### 5.2 Moment–krumning drives fra JS, ett punkt om gangen

`options.mc_chi` lar `engine.py` regne **ett** krumningspunkt per kall. Det gir determinat framdrift
(«punkt 7 av 20») og ekte avbrytbarhet.

Framgangsmåten i `solver-client.js`:

1. Ett **probe-kall** med en triviell `mc_chi`, bare for å få `moment_curvature.chi_plan` —
   krumningsrutenettet regnes inne i pakken, og JS kan ikke gjette det. Probepunktets egen verdi
   kastes; det hører ikke til rutenettet.
2. Ett kall per verdi i `chi_plan`, i rekkefølge, med framdrift og avbruddssjekk mellom hvert.
3. Kurven settes sammen av punktene. `yield_index` settes etter motorens egen regel (`pre − 1`, og
   bare når vi kom så langt), `truncated` når kurven stoppet før planen var kjørt ferdig.

**Enhetene er størrelser hele veien.** `chi_plan` kommer som størrelser, og `mc_chi` **tas** som
størrelse: motoren gjør `abs()` og setter fortegnet selv ut fra θ. Planverdiene sendes derfor
uendret. Tidligere ganget klienten med `meta.moment_sign`, fordi motoren den gangen tolket `mc_chi`
fortegnsatt og et positivt tall ga et tøvete moment. Det er rettet i `engine.py`, og kompensasjonen
er fjernet — en kompensasjon for en feil som ikke finnes lenger, er selv en feil som venter.

**Avbrudd** er å la være å sende neste punkt. Et punkt som allerede regner kan ikke stoppes, men det
tar ~30 ms, så det merkes ikke. Punktene som alt er regnet beholdes, og kurven merkes `truncated`
med en `mc_truncated`-advarsel.

Den ene reserven som står igjen: er `chi_plan` `null` eller tom, kjøres ett samlet kall med ubestemt
framdrift. Plan §5.2 sier at feltet er `null` hvis pakken endrer seg — rutenettet bygges via en
**privat** metode i `structuralcodes`, og forsvinner den i en oppgradering, mister JS bare
muligheten til å drive punktvis. Reserven er altså for en framtidig oppgradering, ikke for noe som
forventes i dag.

---

## 6. Oppvarming

Motoren initialiseres ved **sidelast**, parallelt med at brukeren fyller ut skjemaet. Brukeren
bruker 10–30 sekunder på skjemaet, og det skjuler hele kaldstarten på ~10,2 MB / ~2,6 s.

- Statuspillen viser **fase og nedlastet mengde**. Mengden er et **anslag** merket med «≈»:
  Pyodides egne henter kan ikke måles utenfra, og worker-en sender heller `bytes: null` enn et tall
  den gjetter. Anslaget bygger på de målte størrelsene i plan §3.2 og vises aldri som en måling.
- `navigator.connection.saveData` ⇒ **ingen forhåndslasting.** Da venter vi til første «Beregn»,
  som er et samtykke.
- **En feilet oppvarming låser ikke sida.** Blokkert CDN, frakoblet maskin eller bedriftsproxy gir
  en klikkbar «Prøv igjen», ikke en død knapp. Skjemaet virker, og tverrsnittstegningen er ren
  JavaScript som aldri venter på motoren.

---

## 7. `window.ModuleAPI` — fire avvik fra `plan_IO-structure_for_modules.md`

`index.html` eksponerer `MODULE_CONFIG` og `window.ModuleAPI` med
`getConfig / getInputs / setInputs / calculate / getLastResults / getLastInputs / getOutput /
getAllOutputs / hasResults`, **pluss `ready(): Promise<void>`**.

Spesifikasjonen er skrevet for moduler som regner synkront i JavaScript. Denne regner i Python i en
worker, bak 10 MB kjøremotor. Fire ting kan derfor ikke oppfylles, og de står her fordi en konsument
som ikke vet om dem får feil svar uten at noe feiler:

### Avvik 1 — `calculate()` er asynkron

Den returnerer et `Promise`. En eksisterende konsument som gjør

```js
const r = ModuleAPI.calculate(x);
if (r.success) { /* ... */ }
```

ser et sant Promise-objekt og leser `undefined`. Riktig bruk:

```js
const result = await ModuleAPI.calculate(inputs);
```

`calculate()` **venter selv** på at motoren er initialisert i stedet for å avvise. Trykker man
«Beregn» ett sekund etter sidelast, føles knappen treg — den feiler ikke.

### Avvik 2 — resultatformen er plan §5.2, ikke `{success, inputs, intermediate_calculations, results, status, _metadata}`

Resultatet er objektet `engine.py` returnerer:

```js
{ ok, schema, analysis, meta, materials, section_props,
  bending | moment_curvature | nm_domain, checks, warnings }
```

`MODULE_CONFIG.outputs[].path` peker derfor inn i **denne** strukturen —
`bending.M_Rd`, `section_props.d_eff`, `checks.all_ok` — ikke i spesifikasjonens.
Et mislykket svar er `{ ok: false, schema, error: {code, message, detail} }`.

### Avvik 3 — `calculate()` er ikke en ren funksjon av argumentet

Den avhenger av worker-tilstand og av nettet, og kan feile av grunner som ikke ligger i inndataen:
blokkert CDN, avbrutt nedlasting, en worker som ble terminert. Samme inndata kan derfor gi et svar
den ene gangen og `{ok: false, error: {code: 'runtime_load_failed'}}` den neste. En arbeidsflyt som
kjeder moduler må håndtere det — det er ikke en feil som kan valideres bort på forhånd.

### Avvik 4 — «returner ALLE mellomverdier» er ikke oppnåelig

`structuralcodes` eksponerer ikke sine indre trinn: likevektsiterasjonene, integrasjonen over
geometrien og pivotsøket skjer inne i pakken og finnes ikke som verdier å hente ut. Plan §5.2 gir
alt pakken faktisk gir — tøyningsplanet (`eps_a`, `chi_y`), nøytralaksen, tøyning og spenning per
armeringslag, materialverdiene og kontrollene. Å oppfylle kravet ville krevd en gaffel av pakken,
og da er hele premisset — å kjøre oppstrøms `structuralcodes` **uendret** — borte.

### I tillegg: `ready()`

```js
await ModuleAPI.ready();   // løses når kjøremotoren er oppe
```

Står ikke i spesifikasjonen, men en konsument som vil vite om den første beregningen kommer til å
ta 3 sekunder eller 50 millisekunder har ingen annen måte å finne det ut på.

---

## 8. Distribusjon

- Mappa står i kopi-løkka i `.github/workflows/deploy-all-modules.yml`. **Ikke trim den bort** —
  `paths:`-filteret treffer mappa via `concrete_*/**`, men uten løkke-oppføringen blir sida 404 selv
  om alt er kommitert.
- `module-registry.json` **genereres automatisk** fra `<title>` og `<meta name="description|keywords">`
  i `index.html`. Ikke rediger registerfila for hånd; endringene blir overskrevet.
- Google Analytics-taggen ligger rett etter `<head>`, eksakt som `CLAUDE.md` krever.
- `.whl` serveres som `application/octet-stream` (fallback i `scripts/dev-server.js`) — verifisert
  greit for `loadPackage`.

---

## 9. Tall å kjenne igjen (regresjonsgrunnlag)

Bjelke 300×600, C30/37, **α_cc = 1,0**, 3Ø20, overdekning 40:

```
A_s = 942,4778 mm²   d = 550 mm   f_cd = 20,0 MPa   f_yd = 434,783 MPa
n_min = −4 010 438,41 N            n_max = +442 554,79 N
M_Rd (θ=0, n=0)       = −215 006 759,19 Nmm
M_Rd (θ=0, n=−500 kN) = −305 396 903,0  Nmm
moment–krumning: 20 punkter, flyt på indeks 9
```

Plate 1000×200, Ø12 c/c 113 (A_s = 1000 mm²/m), overdekning 25: `M_Rd = −69 864 525,0 Nmm/m`.

**Merk α_cc = 1,0**: UI-standarden er 0,85 (norsk NA), så fixturene bærer 1,0 mens skjemaet starter
på 0,85. Det er to ulike inndatasett, ikke en uoverensstemmelse.
