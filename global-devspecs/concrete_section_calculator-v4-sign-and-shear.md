# concrete_section_calculator — endringsrunde 4: fortegn og skjær

> **Erstatter `-v3-shear.md`.** Tillegg til `-plan.md` og `-v2-changes.md`. Der de er i
> konflikt, gjelder denne. Revisjon 2, etter kritisk gjennomgang som fant en selvmotsigelse
> i §4 og fire feil som ville gitt stille galt resultat.
>
> **Angrepunkt: `611776e`.** `git reset --hard 611776e` gir tilstanden før runden.
>
> **§10 er oppgavelisten — start der.** Resten er oppslagsverk. Alle tall er målt med
> `structuralcodes` 0.7.2 og er reproduserbare fra geometrien som står her.

## 0. Bestillingen
1. Aksialkraft ⇒ M–N-diagram automatisk.
2. Skjærkapasitet.
3. Fortegn i skjær undersøkt.
4. Signert moment, **etter `structuralcodes` sin konvensjon**, også på inndata.
5. Ctrl + mellomrom kjører beregningen.

---

## 1. Fortegn — vi overtar `structuralcodes` sin konvensjon

### 1.1 Målt
Referansebjelken, armering bare i underkant:

| θ | trykksone | `m_y` |
|---|---|---|
| 0 | overkant ⇒ **feltmoment** | **−215 006 759,186 Nmm** |
| π | underkant ⇒ **støttemoment** | **+6 387 625,184 Nmm** |

**Sagging er NEGATIV.** Følger av høyrehåndsregelen om Y-aksen (Y horisontal, Z vertikal).

### 1.2 Tilstanden
```js
{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: -250, V_Ed: 0 }
```
- `M_Ed` **signert**. Negativ = feltmoment. Positiv = støttemoment.
- **`direction` fjernes** fra kombinasjonen OG fra `state`. Retningen *er* fortegnet.
- `V_Ed` nytt, **størrelse** (§4.1c).

### 1.3 `theta` OVERLEVER i payloaden
Dette er ikke en forenkling vi tar. `payload.js` utleder og sender fortsatt:
- `options.theta` — fra fortegnet til **den aktive** kombinasjonens `M_Ed`
- `combinations[i].theta` — fra fortegnet til **radens egen** `M_Ed`

Regel: `M_Ed <= 0 ⇒ theta = 0`, `M_Ed > 0 ⇒ theta = π`.

**Hvorfor det må overleve:** seks pytest-tilfeller driver støttemoment gjennom
`payload['options']['theta'] = math.pi` (`test_engine.py:175, 201, 323, 419, 446, 639`), og
fixturene har `M_Ed = 0`. Fjernes `theta`, finnes det ingen måte å be om en
støttemoment-M–κ på, og seks tester mister det de tester.

### 1.4 Hva som blir RÅ, og hva som IKKE blir det

**Rå (motorens eget fortegn):**
- `bending.M_Rd` — negativ for feltkapasitet
- `moment_curvature.moment`, `moment_curvature.kappa`
- `nm_domain.m`
- `combinations[i].M_Ed`, `M_Rd`

**Forblir størrelser — og det er bevisst:**
- `utilisation` = `|M_Ed| / |M_Rd|`. Utnyttelse er en størrelse.
- **`mc_chi` (inn til motoren) og `moment_curvature.chi_plan`.** Pakken vil ha krumningen i
  sitt eget roterte system, der den alltid er negativ. `engine.py:1088` gjør
  `chi_input = [-abs(v)]` og **det skal stå**. Fjernes det, brekker JS-drevet
  moment–krumning for støttemoment. `chi_plan` emitteres fortsatt som størrelser, og
  `solver-client.js` sender dem uendret.

### 1.5 `meta.moment_sign` og `meta.domain_theta` fjernes
Ingen produksjonskode leser `moment_sign`. `domain_theta` leses **bare** av
`charts.js:529`. Fjern også:
- `_signed_arr` (`engine.py:120-126`) — blir død
- **`domain_probe_n`-kallet (`engine.py:993-998`)** — et helt `calculate_bending_strength`
  bare for å finne et fortegn vi ikke lenger trenger. ~50 ms per M–N-kjøring.

**Verifisert bonus:** med rå `m_y` er punktMENGDEN i omhyllingen identisk for θ = 0 og
θ = π — bare traverseringsrekkefølgen snur. `options.theta` blir dermed irrelevant for
`nm_domain.n/m`.

### 1.6 Fixturene: absoluttverdier uendret, fortegn snur
`M_Rd` går fra `+215006759.18601915` til `-215006759.18601915`. **Endres et absoluttall, er
det en feil.**

To pytest-påstander snur ikke av seg selv og må skrives om:
- `test_engine.py:490` `max(dom['m']) == 364250941.1746183` → under rå blir maks
  **+254,74e6**; 364,25e6 er nå `abs(min(...))`.
- `test_engine.py:491` påstår at feltgrenen er positiv → **må inverteres**.

### 1.7 UI-en har opplysningsplikt
Norsk praksis er sagging positiv. Vi velger motsatt fordi biblioteket gjør det:
- Feltetikett: `M_Ed [kNm] — sagging negative`
- **Levende tolkningslinje** under raden: `−250 kNm → sagging, compression at the top face`
- Én setning i lastseksjonen og i rapportens lastkapittel: *«Sign convention follows fib
  structuralcodes: sagging (compression at the top face) is negative.»*
- **`ui.js:766` har `bindNumericInput(…, { min: 0 })` på `M_Ed`.** Den må bort, ellers
  avvises negative moment stille.

---

## 2. Aksialkraft ⇒ M–N automatisk

Rene funksjoner i `section.js`:
```js
export function axialForcesPresent(state)  // true hvis noen Number.isFinite(N_Ed) && N_Ed !== 0
export function allowedAnalyses(state)     // uten aksial: alle tre. Med: uten 'bending'.
```
**Eksakt null**, ingen toleranse — verdiene kommer fra `evaluate()` og er det brukeren
skrev. `NaN`/tom teller som fravær.

**Tre veier inn som alle må stenges, ikke bare den ene:**
1. `ui.js` — kortet «Bending resistance» deaktiveres. `ANALYSES` er i dag en **chip-rad**
   med én delt `#ana-desc` (`ui.js:99, 1331-1334`), ikke kort. D3 gir den deaktiverte
   chippen `disabled`, dempet stil og `title` med begrunnelsen.
2. **`ui.js:1456` — tastatursnarveien `1`** setter `analysis: 'bending'` ubetinget. Må
   respektere `allowedAnalyses`.
3. **`serialize.js`** — en lagret fil med `analysis: 'bending'` og `N_Ed ≠ 0` skal
   normaliseres til `nm_domain` ved lasting, med en
   `{code: 'analysis_forced_to_nm_domain', severity: 'info'}`-note. Uten dette omgår en
   fil regelen i stillhet.

`payload.js` overstyrer **ikke** — en overstyring gjemt der ville vært usynlig i resultatet.
**Arbeidsflyt-API-et (`setInputs`) omgår regelen bevisst**; det er dokumentert i README som
et kjent avvik, ikke en glipp.

**Begrunnelse som skal stå i UI:** *«A resistance quoted at a single axial force is one
point on a curve.»*

**Moment–krumning er unntatt, og unntaket forsvares på egne premisser:** M(κ) ved fast N er
én entydig kurve, ikke ett punkt plukket fra en flate. Men M–κ rapporterer også `M_Rd` og
`utilisation` ved den ene aksialkraften (`engine.py:1167-1170`). Derfor: **når `N_Ed ≠ 0`
skal M–κ-kortet og rapportens M–κ-kapittel merkes** `M_Rd at N_Ed = … kN — see the
interaction domain for the full picture`.

---

## 3. Skjær — modell

### 3.1 Omfang
Bare vertikalt skjær, α = 90°. **Ute:** torsjon, gjennomlokking, skjær steg/flens,
skjærfuger, biaksielt skjær, `VRdc_prin_stress`, og **`Asw_max`** (den har ingen plass i
resultatet; tatt ut av omfanget framfor å ligge ubrukt).

### 3.2 Funksjoner fra `structuralcodes` 0.7.2
```python
ec2_2004.VRdc(fck, d, Asl, bw, NEd, Ac, fcd, k1=0.15, gamma_c=1.5, CRdc=None)
ec2_2004.VRds(Asw, s, z, theta, fyk, alpha=90.0, gamma_s=1.15)
ec2_2004.VRdmax(bw, z, fck, theta, NEd, Ac, fcd, alpha=90.0, limit_fyd=False)
ec2_2004.Asw_s_required(Ved, z, theta, fywd, alpha=90.0)
```
**`NEd` er trykk-positiv i ALLE tre som tar den** — `VRdc`, `VRdmax` og `Asw_max`.

### 3.3 Regnes selv
```
rho_w_min = 0.08*sqrt(fck)/fywk      # 9.2.2(5) — SKJAERarmeringens fywk, ikke lengdearmeringens
Asw_s_min = rho_w_min * bw           # alpha = 90
sl_max    = 0.75*d                   # 9.2.2(6)
st_max    = min(0.75*d, 600)         # 9.2.2(8)
leg_pitch = (bw - 2*(cover_side + dia/2)) / (legs - 1)   # legs >= 2; legs == 2 -> ingen sjekk
```

### 3.4 Tilstand
```js
shear: {
  strut_angle_deg: 45,   // EC2 6.2.3(2): 21.8 <= v <= 45.  DEGREES.
  z_factor: 0.9,
  stirrups: [ { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 } ],
},
```
**`strut_angle_deg`, ikke `theta`.** `theta` betyr bøyeretning i radianer overalt ellers i
denne kodebasen, og `_is_hogging(theta)` sjekker `|θ| ≈ π`. En strøket 45-er ville lest som
feltmoment uten feilmelding.

Tom liste = ingen skjærarmering ⇒ `V_Rd,c`-veien. Standard for plate.
`alpha` låses til 90 i v1.

`rebar.js`: `stirrupArea(st)`, `aswPerSpacing(st)`, `totalAswPerSpacing(list)`.

**Alle rader må ha samme `fywk` i v1** — `VRds` tar én `fyk`. Avvik gir
`stirrup_mixed_fywk` (`error`). `fywd = fywk / state.steel.gamma_s`.

---

## 4. Skjær — fortegn og A_sl (undersøkelsen du ba om)

### 4.1a `NEd` snus
Ett sted, i en funksjon som ikke gjør noe annet, med egen test:
```python
def _ned_for_shear(n_ed_tension_positive: float) -> float:
    """Seksjons-API-et har strekk positiv; EC2-skjaerfunksjonene har trykk positiv."""
    return -n_ed_tension_positive
```
Målt, referansebjelken (`A_sl = 942.4778`, `d = 547`):

| N_Ed (strekk positiv, vår konvensjon) | `V_Rd,c` |
|---|---|
| 0 | **81 615,2393 N** |
| −500 kN (trykk) | **149 990,24 N** |
| +500 kN (strekk) | **13 240,24 N** |

11,33 ganger mellom de to ytterpunktene. Snudd fortegn på et strekksnitt er en
elleve gangers overestimering, på usikker side.

### 4.1b `A_sl` er BØYESTREKKARMERINGEN, og hentes GEOMETRISK

**Dette er rettet etter gjennomgangen, og rettelsen er viktig.** Første utkast sa at
`A_sl` skulle hentes fra tøyningsplanet via `_effective_depth`, «ikke en geometrisk regel»,
med henvisning til lærdommen fra v2. **Det var feil, og tallet i utkastet kom fra den ruten
det forbød.**

EC2 6.2.2 definerer `A_sl` som *«the cross-sectional area of the tensile reinforcement,
anchored at least (lbd + d) beyond the considered cross-section»*. Det er et
**forankringsbegrep knyttet til bøyestrekksiden**, ikke «alle lag med ε > 0 ved brudd».
v2-lærdommen gjaldt `d` for `A_s,min` (EC2 9.2.1.1) og lar seg ikke overføre.

Målt på samme snitt, ved støttemomentbrudd ligger nøytralaksen så lavt at begge lag står i
strekk:

| rute | `A_sl` | `d` | `V_Rd,c` |
|---|---|---|---|
| tøyningsplan (`_effective_depth`) | 1168,67 | 150,94 | 42,55 kN |
| **geometrisk strekkside** | 226,1947 | 551 | **64 281,8718 N** |

Tøyningsplan-ruten er dessuten **ukonservativ i feil retning**: ved aksialstrekk teller den
overkantarmeringen inn i skjærkapasiteten for et feltmoment.

**Regelen:**
```
theta_c = combo.theta            # 0 eller pi, fra fortegnet til M_Ed
strekkside = 'bottom' hvis theta_c == 0 ellers 'top'
A_sl = sum(layerArea) for lag paa strekksiden
d    = h/2 + |z| for det innerste laget paa strekksiden   (samme definisjon som i dag)
```
Rent geometrisk. **Ingen tøyningsplan.** Det gjør samtidig at skjær kan regnes for
**enhver** kombinasjon — også de utenfor `[n_min, n_max]` og de M–κ ikke løste — og løser
tre hull gjennomgangen fant.

**Testtall, reproduserbare fra modulens standardverdier** (bjelke 300×600, C30/37,
α_cc = 1,0, `cover 35`, `stirrup_dia 8`, `cover_side 35`; 3Ø20 UK `dc = 53` ⇒ `z = −247`,
`d = 547`; 2Ø12 OK `dc = 49` ⇒ `z = +251`, `d = 551`):

| kombinasjon | `A_sl` | `d` | `V_Rd,c` |
|---|---|---|---|
| `M_Ed < 0` (felt, strekk UK) | 942,4778 | 547 | **81 615,2393 N** |
| `M_Ed > 0` (støtte, strekk OK) | 226,1947 | 551 | **64 281,8718 N** |

Feil side på et støttemoment: **+27,0 % på usikker side.**

**`M_Ed = 0`:** ingen strekkside fra momentet. Ta **siden med minst `A_sl`** — nå trivielt
computerbart siden regelen er geometrisk — og legg
`{code: 'shear_asl_ambiguous', severity: 'info'}`.

### 4.1c `V_Ed` sitt fortegn betyr ingenting
`VRds`/`VRdmax` er symmetriske i V. `payload.js` sender `Math.abs`.

### 4.1d `b_w`
Minste bredde i strekksonen. Rektangel og plate: `sectionWidth(state)`, altså **1000 for
plate** (per meter). Parametriske T-tverrsnitt trenger et eget `b_w`-felt — det står som
merknad i veikartet, ikke som oppgave her.

### 4.2 Resultat per kombinasjon
```json
"shear": {
  "evaluated": true,
  "V_Ed": 120000.0,
  "V_Rd": 143453.3, "V_Rd_c": 81615.2393, "V_Rd_s": 143453.3, "V_Rd_max": 779803.2,
  "governing_mode": "stirrups",
  "utilisation": 0.83651,
  "Asl": 942.4778, "d": 547.0, "bw": 300.0, "z": 492.3,
  "asw_s": 0.670206, "asw_s_min": 0.262907, "asw_s_required": 0.560634,
  "sl_max": 410.25, "st_max": 410.25
}
```
Feltet heter **`evaluated`**, ikke `within_limits` — det siste betyr allerede «aksialkraft
innenfor `[n_min, n_max]`» på kombinasjonsnivå (`engine.py:582, 617`) og leses av
`charts.js:531`.

Tallene over er **målt** med `z = 0.9·547 = 492.3`, `A_sw = 2·π·8²/4 = 100.5310`,
`s = 150` ⇒ `A_sw/s = 0.670206`, `θ_strut = 45°`, `f_ywd = 500/1.15`.
*(Første utkast oppga `asw_s` og `asw_s_required` med halve verdien — én bøylearm i stedet
for to. Gjennomgangen fanget det; feilen var selvskjulende fordi 0,335 fortsatt består
minimumskravet.)*

`z = z_factor · d`, der `d` er **skjærets `d`** fra §4.1b.

`governing_mode` ∈ `'no_stirrups' | 'stirrups' | 'strut_crushing'`.

**`V_Rd,c` legges ALDRI til `V_Rd,s`** (EC2 6.2.3(2)). `V_Rd,c` rapporteres likevel alltid —
det er tallet som sier om bøyler i det hele tatt trengtes.

### 4.3 Egen dimensjonerende kombinasjon
`<analyse>.shear_governing`. En rad med stor `V_Ed` og lite `M_Ed` styrer skjær uten å være
i nærheten av å styre bøying. Samme regler ellers som v2 §4.3.

`checks` får `shear_ok`, `asw_min_ok`, `stirrup_spacing_ok`.
`shear_ok` = `V_Ed <= V_Rd` for alle kombinasjoner.

**`CHECK_ORDER` og `CHECK_LABELS` i `results.js` MÅ utvides** — `checkRows()` emitterer
bare `CHECK_ORDER`-nøkler, og `results.test.mjs:384` påstår likhet. Uten det vises de tre
nye kontrollene ikke i rapporten i det hele tatt.

**Statuspilla:** η_M forblir hovedtallet med sin etikett `η = M_Ed / M_Rd(N_Ed)`.
**Ikke slå sammen til max(η_M, η_V)** — hele poenget med at terskelen og etiketten bor ett
sted (`results.js:21-39`) er at samme snitt aldri skal vise to ulike η under samme navn.
Skjær får et **eget merke** ved siden av: `V 1.31` i samme fargeskala.

### 4.4 Validering (`section.js`)
| kode | regel | severity |
|---|---|---|
| `stirrup_spacing_exceeds_max` | `spacing > sl_max` | `error` |
| `asw_below_minimum` | **kun når lista er ikke-tom** og `A_sw/s < A_sw/s_min` | `error` |
| `stirrup_legs_spacing_exceeds_max` | `legs > 2` og `leg_pitch > st_max` | `warning` |
| `invalid_strut_angle` | `strut_angle_deg` utenfor 21,8–45 | `error` |
| `stirrup_alpha_unsupported` | `alpha ≠ 90` | `error` |
| `stirrup_mixed_fywk` | rader med ulik `fywk` | `error` |

**Minimumskravet gjelder BARE når bøyler finnes.** EC2 6.2.1(4) og 9.3.2 unntar elementer
uten skjærarmering, og plate er nettopp det. Uten dette unntaket ville standardplata —
`b_w = 1000` ⇒ `A_sw/s_min = 0,876` mot `A_sw/s = 0` — gitt hard feil ved hver eneste
kjøring, og det samme ville hver bjelke gjort før brukeren la inn bøyler.

### 4.5 Nye koder trenger engelsk tekst
`shear_asl_ambiguous` (motor) og de seks i §4.4 (modell) må inn i `results.js`
`CODE_MESSAGES` + `ENGINE_CODES`/`VALIDATION_CODES`. `results.test.mjs:92` påstår at hver
kode har en tekst som ikke er plassholderen. **Kodene lages i bølge 1, tekstene skrives i
bølge 2** — det er tildelt i §10, ikke antatt.

---

## 5. Plott og tegning

### 5.1 `momentCurvatureSvg` viser STØRRELSER — bevisst unntak
`charts.js:286-288` har aksene hardkodet fra 0 (`axes(o, f, 0, xHi, 0, yHi)`). Med rå
verdier blir `xHi = 1.05e-9` og hele kurven havner utenfor lerretet — **uten feil og uten
at noen test sier fra.**

Valget er: bygge tredje kvadrant, eller vise størrelser. **Vi viser størrelser.**
M–κ har bare én gren; fortegnet bærer ingen informasjon der, bare konvensjon. Så:
- `momentCurvatureSvg` tar `Math.abs` på `kappa` og `moment` **lokalt, i tegnefunksjonen**
- aksetitlene blir `|κ| [10⁻⁶/mm]` og `|M| [kNm]`
- én linje under figuren: `Magnitudes shown; sagging moment is negative (see §1).`

Dataene i resultatet forblir rå. Dette er den **eneste** tillatte `abs` i `charts.js`, og
den skal ha en kommentar som sier hvorfor.

### 5.2 `nmDomainSvg` og `radialUtilisation` blir RÅ — hvert kallsted navngitt
Fjern `abs` her, og bare her:

| sted | i dag | skal bli |
|---|---|---|
| `charts.js:391` | `mEd = Math.abs(M_Ed)` i `radialUtilisation` | `Number(M_Ed)` |
| `charts.js:524` | `mEd = Math.abs(dom.M_Ed)` | `Number(dom.M_Ed)` |
| `charts.js:529, 536-540` | `domain_theta` + θ-sammenligning + `abs(cb.M_Ed)` | **slettes**; bruk `Number(cb.M_Ed)` |
| `charts.js:620-625` | `mEd > EPS`-vakt og reservemarkør | `Math.abs(mEd) > EPS` |
| `charts.js:405` | kommentaren «FORTEGNSATT — ingen abs her» | omskrives, polariteten er snudd |
| **`report.js:646`** | `Math.abs(toNum(dom.M_Ed))` inn i `radialUtilisation` | `toNum(dom.M_Ed)` |

**`report.js:646` er D4 sin fil.** Beholdes `abs` der, kommer nøyaktig den feilen
`charts.js` sin hodekommentar kaller «den dyrekjøpte lærdommen» tilbake: målt gir
lasten (−500 kN, −150 kNm) da **η = 3,67** i stedet for 0,413.

Tre tekster i `report.js` blir usanne og må rettes: `:506` «magnitude in the analysed
direction», `:740` «κ and M are magnitudes», `:754` «+M is the analysed direction».

**Merknad:** `charts.js:421-424` bryter uavgjort i lukkekjeden med «lavest m». Under
speilingen blir det «høyest m». Det er uobserverbart på dagens fixturer, men gjør
speilinvariansen tilfeldig i stedet for strukturell. Én setning i koden holder.

### 5.3 Bøyler i `section-draw.js`
Avrundet rektangel innenfor overdekningen: `inset` = `cover_side + dia/2` horisontalt,
`cover + dia/2` vertikalt. **Hjørneradius `min(2·dia, halve korteste innersiden)`** — uten
klemmen sprekker figuren for tynne plater.
`legs > 2` gir loddrette streker jevnt fordelt mellom ytterbenene.
**Nedtonet:** tynnere strek enn omrisset, dempet farge, ingen kotering, én liten etikett
`Ø8 c/c 150 (2 legs)`. Tegnes bare når lista er ikke-tom.

---

## 6. Tastatur
**Ctrl + mellomrom** kjører. **Ctrl + Enter beholdes som alias.** Håndteringen må ligge
**før** `ui.js:1446` sin `if (inField() || e.ctrlKey …) return;`, på samme sted som dagens
Ctrl+Enter (`ui.js:1443`). `e.key` er `' '`.
Hjelpeoverlegget i `index.html` lister snarveiene og må oppdateres — inkludert at `f`/`s`
(retning) utgår.

---

## 7. `direction` fjernes — hvert kallsted

| fil:linje | eier |
|---|---|
| `js/store.js:69, 71` (`defaultState`) | D2 |
| `js/rebar.js:455` (`createCombo`) | D2 |
| `js/section.js:107, 138, 310` (`asMin`, `derived`, `layerSummary`) | **D2** |
| `js/payload.js:166` (`options.theta` fra `state.direction`) | D2 |
| `js/report.js:234, 312, 507` | **D4** — `directionLabel(undefined)` gir `DASH`, så kapittel 3 og 4 ville trykt «–» i stillhet |
| `js/ui.js:402, 693-694, 1123, 1224, 1317-1318, 1422, 1454-1455` | D3 — merk **to** kontroller: lastradens segment OG det globale `#dir-seg` |
| `index.html` hjelpeoverlegg, `f`/`s` | D3 |
| 40 `direction`-referanser i 8 JS-testfiler | eieren av hver testfil |

---

## 8. Filfordeling og rekkefølge

**Bølge 1, parallelt:** D1 motor (`python/engine.py`, `tests/python/test_engine.py`) ·
D2 modell (`js/rebar.js`, `js/section.js`, `js/store.js`, `js/payload.js`,
`js/serialize.js` + deres tester).

**Mellom bølgene: koordinator regenererer fixturene.** D4 og D5 leser dem direkte
(`charts.test.mjs:26-29`, `report.test.mjs`) og kan ikke kjøre sine tester før.

**Bølge 2, parallelt:** D3 UI (`index.html`, `js/ui.js`, `js/main.js`, `README.md`) ·
D4 rapport (`js/report.js`, `js/results.js`, `print.css` + tester) ·
D5 plott og tegning (`js/charts.js`, `js/section-draw.js` + tester).

**Kryssbinding D4↔D5:** `report.js:646` kaller `radialUtilisation` fra `charts.js`. Begge
er fortalt om rå fortegn i §5.2; D4 skal ikke vente på D5.

`serialize.js`: `shear` **må inn i `NESTED_GROUPS` (`serialize.js:43`)**, ellers får en fil
med delvis `shear` udefinerte felt. `V_Ed` ordner seg av seg selv gjennom `createCombo`.

---

## 9. Aksept
- [ ] `M_Ed` signert; `direction` finnes ikke; begge segmentkontroller borte; `min: 0` fjernet
- [ ] `M_Rd = -215006759.18601915` — samme absoluttverdi som før
- [ ] `meta.moment_sign`, `meta.domain_theta`, `_signed_arr` og `domain_probe_n`-kallet borte
- [ ] `test_engine.py:490-491` omskrevet; `charts.test.mjs:178-181` **invertert** — den
      påstår i dag at fortegnet på `M_Ed` er likegyldig, og at den fortsatt er grønn er det
      klareste tegnet på at fortegnsendringen ikke er gjort
- [ ] **`radialUtilisation(DOM, -500, -150)` gir η ≈ 0,413, ikke 3,67** — egen påstand
- [ ] **M–κ-figuren har innhold innenfor viewBox** — egen påstand
- [ ] `N_Ed ≠ 0` stenger alle tre veiene: chip, tast `1`, og lagret fil
- [ ] `_ned_for_shear`-test med 81 615,24 / 149 990,24 / 13 240,24 N
- [ ] `A_sl` geometrisk: 81 615,2393 N for felt og 64 281,8718 N for støtte på samme snitt
- [ ] `M_Ed = 0` velger minst `A_sl` og gir `shear_asl_ambiguous`
- [ ] Tom bøyleliste: `V_Rd = V_Rd,c`, mode `no_stirrups`, og **ingen** `asw_below_minimum`
- [ ] Standardplata kjører uten feil
- [ ] `V_Rd,c` aldri lagt til `V_Rd,s`
- [ ] `shear_governing` ≠ bøyningens governing i en konstruert test
- [ ] `CHECK_ORDER` utvidet; de tre nye kontrollene vises i rapporten
- [ ] Alle sju nye koder har engelsk tekst; `results.test.mjs:92` grønn
- [ ] Ctrl + mellomrom kjører; Ctrl + Enter virker fortsatt
- [ ] Nettleserverifisering bestått

## 10. Oppgaveliste per agent

### D1 — motor
1. Fjern `meta.moment_sign`, `meta.domain_theta`, `_signed_arr`, `domain_probe_n`-kallet.
2. Rå `m_y`/`chi_y` ut. **`chi_input = -abs(v)` og `chi_plan` som størrelser BLIR STÅENDE**
   (§1.4).
3. `utilisation = |M_Ed|/|M_Rd|`.
4. Skjær: `_ned_for_shear`, geometrisk `A_sl`/`d` (§4.1b), `M_Ed = 0`-regelen, `V_Rd`-valget,
   `shear_governing`, `checks`, `shear_asl_ambiguous`.
5. Tester: alle tall i §4.1a, §4.1b, §4.2; `test_engine.py:490-491` omskrevet; absoluttverdiene
   i fixturene uendret.

### D2 — modell
1. `combos`: `M_Ed` signert, `direction` bort, `V_Ed` inn.
2. `state.shear` (`strut_angle_deg`!) + `stirrupArea`/`aswPerSpacing`/`totalAswPerSpacing`.
3. `axialForcesPresent`/`allowedAnalyses` (§2).
4. De seks skjærreglene (§4.4), med minimumsunntaket.
5. `payload.js`: `theta` overlever (§1.3), `V_Ed` som `abs`.
6. `serialize.js`: `shear` i `NESTED_GROUPS`; normaliser `analysis` ved `N_Ed ≠ 0` med note.
7. `section.js:107, 138, 310` — `direction`-lesere (§7).

### D3 — UI
1. Signert `M_Ed`: felt, tolkningslinje, konvensjonssetning, **`min: 0` bort** (§1.7).
2. `V_Ed`-kolonne.
3. `allowedAnalyses` på chipen OG på tast `1` (§2); M–κ-merknaden ved `N_Ed ≠ 0`.
4. Seksjon «Shear reinforcement»; `strut_angle_deg`/`z_factor` under «Advanced».
5. Ctrl + mellomrom; hjelpeoverlegget oppdatert, `f`/`s` fjernet (§6).
6. Begge `direction`-kontrollene bort (§7). README: avviket om `setInputs` (§2).

### D4 — rapport
1. **`report.js:646`: `abs` bort** (§5.2) — dette er den ene linja som kan gjeninnføre
   3,67-feilen.
2. Tekstene `:506`, `:740`, `:754` rettet; `direction`-leserne `:234, 312, 507`.
3. Skjærkapittel; `CHECK_ORDER`/`CHECK_LABELS` utvidet; alle sju nye koder i `CODE_MESSAGES`.
4. Skjærmerket ved siden av η_M — **ikke** slått sammen (§4.3).

### D5 — plott og tegning
1. `momentCurvatureSvg`: lokal `abs`, aksetitler `|κ|`/`|M|`, merknadslinje (§5.1).
2. `nmDomainSvg`/`radialUtilisation`: rå, hvert kallsted i §5.2.
3. `charts.test.mjs:178-181` invertert; `:356-401` slettet; `NONCONVEX`-fixturens polaritet.
4. Bøyler i `section-draw.js` med radiusklemme (§5.3).
