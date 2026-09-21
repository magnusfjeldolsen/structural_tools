# concrete_section_calculator — SLS: spenningsbegrensning (EC2 7.2) og rissvidde (EC2 7.3.4)

Runde 9, rettet i runde 10 etter en kritisk gjennomgang — se **§15** for hva som
ble endret og hva som ble stående. Branch `feat/csc-sls`. Skrevet mot
arbeidskopien slik den står i dag; alle linjenumre under er verifisert mot den.

---

## 0. Rammene, som ikke er til forhandling

1. **SLS er EN EGEN SEKSJON I RESULTATET** som dukker opp når det finnes
   lastkombinasjonsrader av type `characteristic` eller `quasi_permanent`.
   Ingen ny analyse-chip. Ingen SLS-rader ⇒ ingen seksjon, ingen ekstra kostnad.
2. **`w_max` avledes av en eksponeringsklasse i et nedtrekk, med manuell
   override**, plassert i materialraden ved siden av `f_cd` og `f_yd`.
3. **Lite støy i UI.** Én synlig kontroll (nedtrekket), resten i en `<details>`
   som trykker verdiene sine i `summary` — nøyaktig mønsteret `#adv-material`
   / `#fac-summary` allerede bruker (`index.html:228`, `ui.js:2626`).
4. **Doktrinen gjelder uendret.** Ett feil tall er verre enn en manglende
   funksjon. To kilder til samme tall er feilformen som har bitt modulen i hver
   runde. Kontroller er treverdige. En advarsel siterer aldri et tall som ikke
   ble regnet. Brukervendt tekst engelsk, kommentarer norsk som forklarer HVORFOR.
5. **Opphavsrett.** Vi skriver alt selv. Vi implementerer METODEN og viser til
   PUNKTNUMMER. Ingen prosa, definisjon, merknad, tabelloverskrift eller
   tabelloppsett fra EC2, fra et nasjonalt tillegg, fra `structuralcodes`'
   docstrings eller fra noe annet verktøy gjengis — heller ikke omskrevet tett.
   Grenseverdier legges inn som navngitte parametere med VÅRE etiketter og et
   punktnummer. Se §11.
6. **Fixturene i `tests/fixtures/` regenereres BARE av koordinatoren.** Ingen
   implementeringsagent rører dem. Nye tester bygger payloader i kode.

---

## 1. Hva som faktisk skal regnes

Alt hviler på ÉN størrelse modulen ikke har i dag: **den lineær-elastiske
tilstanden i det opprissede snittet** under en bruksgrensekombinasjon. Både
7.2 og 7.3.4 leser den. Hvert tall under har nøyaktig én PRODUSENT — én
funksjon som eier det.

En produsent kan kalles mer enn én gang med ULIKE inndata og gi ULIKE tall.
Det er ikke to kilder; det er to størrelser. Konkret gjelder det to steder, og
begge er navngitt slik at ingen kan leses som den andre:

* §1.3 kalles med `E_cm` for rissbeslutningen (§1.1), og med radens egen modul
  som radens tilstand;
* §1.2/§1.3 kalles i tillegg med `E_cm` for en `quasi_permanent`-rad, og av den
  evalueringen brukes NØYAKTIG ett tall: `sigma_c_initial` til 7.2(3) (§1.4).

Alt annet regnes én gang per rad.

### 1.1 Rissbeslutningen (EC2 7.1(2)) — RETTET I RUNDE 10

**SLS kaller ALDRI `_cracking_moment`.** Kriteriet er den største
strekkspenningen i det URISSEDE TRANSFORMERTE snittet, altså i §1.3, alltid
regnet med `E_cm`:

```
σ_ct = max(σ_c,OK , σ_c,UK)   av §1.3 med Ec = E_cm
σ_ct >  f_ct,eff  ⇒ risset      (løseren i §1.2)
σ_ct ≤  f_ct,eff  ⇒ urisset     (tilstanden fra §1.3 ER svaret)
```

**Hvorfor dette og ikke `M_cr = b·h²/6·(f_ctm − N/A_c)`.** Forrige utkast brukte
den. `_cracking_moment` (`engine.py:375`) regner på BRUTTO rektangel, mens både
§1.2 og §1.3 regner på det TRANSFORMERTE snittet (`n·A_s`). De to har ikke samme
rissgrense, og raden ville båret begge. Målt på referansebjelken, `N = 0`, med
egen implementasjon av §1.2/§1.3 i denne økten:

| `|M|/M_cr,brutto` | urisset transformert σ ved strekkant | `f_ctm` | brutto sier | transformert sier |
|---|---|---|---|---|
| 1,00 | 2,6512 | 2,8965 | risset | urisset |
| 1,05 | 2,7837 | 2,8965 | risset | urisset |
| 1,09 | 2,8898 | 2,8965 | risset | urisset |
| 1,10 | 2,9163 | 2,8965 | risset | risset |

De to blir enige først ved `|M|/M_cr,brutto = 1,092524` for bjelken, `1,063962`
for platefixturen, `1,027947` for AC5-plata og `1,031254` for AC7-plata. I det
båndet erklærte forrige utkast «risset» og trykket `σ_s ≈ 109–120 MPa` og
`w_k ≈ 0,1 mm` for et snitt som modulens EGEN elastiske modell sier er urisset
(`σ_s` der er 13,4 MPa). Båndet var ikke engang gjemt: AC6 trykker allerede
BEGGE forholdstallene — `|M|/M_cr = 0,7768` og `σ_ct/f_ctm = 0,7301` — to svar
på «hvor nær risset er snittet», i samme rad. Det er to-kilder-feilen, ikke en
konservativ margin.

**Hvorfor ikke bare skrive konvensjonen ut** (det andre alternativet som lå på
bordet): å dokumentere en selvmotsigelse fjerner den ikke, og AC6 ville fortsatt
trykket de to tallene ved siden av hverandre. Kapittelet lover at en kontrollør
skal kunne reprodusere hvert tall; det er ikke oppfylt av to tall som svarer
ulikt på samme spørsmål.

**Hvorfor ALLTID `E_cm`, aldri `E_c,eff`.** Riss er irreversibelt og settes ved
FØRSTE pålasting. Lot vi kriteriet bruke radens egen modul, ville kryp «lukke»
riss: målt slår kriteriet inn ved `|M|/M_cr,brutto = 1,0925` med `φ_ef = 0`,
`1,2747` med `φ_ef = 2` og `1,3643` med `φ_ef = 3`. Samme snitt, samme last,
«urisset» fordi det har krøpet. Kriteriet er derfor `E_cm`-fast, og dermed er
`cracked` det SAMME for radens krøpne tilstand og for førstegangstilstanden i
§2.2. **Én rissbeslutning per rad.**

**Prisen, som SKAL stå i rapporten (§7):** kriteriet er mindre konservativt enn
brutto `M_cr` i et bånd på 2,8–9,3 % over den, og undertrykker der en rissvidde
på størrelsesorden 0,1 mm. Et bevisst, målt valg — ikke en forglemmelse.

**`brittle_ok` og `section_props.M_cr` RØRES IKKE.** De svarer på et annet
spørsmål — kapasiteten mot riss-momentet, kalibrert mot A_s,min (se docstringen
i `_cracking_moment`, forholdstall 1,21) — og bor i ULS-kapittelet.
SLS-kapittelet trykker ingen `M_cr` i det hele tatt, nettopp for at de to ikke
skal kunne forveksles. Se §12.10.

Ingen rissvidde regnes for en urisset rad: `crack` er `null` med grunnen
`uncracked`. Ikke 0,0 mm — den ble ikke regnet.

### 1.2 Risset elastisk tilstand — VI SKRIVER DEN SELV

**Dette er rundens viktigste valg, og det er målt fram.**

Alternativene som ble avvist:
* `calculate_strain_profile` på dagens ULS-seksjon bruker dimensjonerende
  materiallover. Målt på referansebjelken: `σ_s` 2,2–3,4 % for høyt, `x` 20–32 %
  for høyt, og `σ_c` **24 % for LAVT** — ikke-konservativt i nettopp
  7.2-kontrollen på betongtrykk.
* `calculate_elastic_cracked_properties` henter E av `get_tangent(eps=0)` =
  20 000 MPa i stedet for `E_cm` = 32 837 MPa, og løser bare med `n = 0`.
* En parallell SLS-seksjon med `UserDefined`-betong gir riktige tall (målt), men
  koster en ny `BeamSection` med egen cache-nøkkel, 4–6 ms per rad i CPython
  (2–4× i Pyodide), og har fire målte sviktformer: rå
  `numpy.linalg.LinAlgError: Singular matrix`, `NoConvergenceWarning` uten svar,
  `x = nan` ved `M = N = 0`, og **stille `σ = 0` utenfor tabellområdet**.

Vår egen løser er **verifisert identisk** med den siste, til alle siffer
forskningen rapporterte, også med aksialkraft:

| tilfelle (bjelke 300×600, 3Ø20) | vår løser | `UserDefined`-seksjonen (målt av forskningen) |
|---|---|---|
| `N = 0`, `M = −120 kNm` | `x = 127,202`, `σ_s = 250,835`, `σ_c = −12,3901` | `127,2016` / `250,8355` / `−12,3901` |
| `N = −500 kN`, `M = −120 kNm` | `x = 314,270`, `σ_s = 53,328` | `314,270` / `53,328` |
| `N = +200 kN`, `M = −120 kNm` | `x = 84,563`, `σ_s = 354,542` | `84,563` / `354,542` |

Den er dessuten deterministisk (ingen Newton, ingen konvergens som kan feile),
koster mikrosekunder, trenger ingen andre seksjon, trenger ingen scipy-stubb, og
er ren matematikk vi eier.

**Modellen.** Motoren bygger ALLTID et rektangel (`engine.py:197 _build`;
`sectionType` er bare `beam` eller `slab`, og plata er alltid 1000 mm bred,
`store.js:enforceSlabWidth`). Derfor:

* Betong: lineær med modulen `E_c` i trykk, **null i strekk**. Full
  bruttorektangel `b × h`.
* Armering: lineær med `E_s`, konsentrert i lagets tyngdepunkt `z_i` med
  arealet `A_i` (`rebar[i]['area']` — også for `kind: 'strip'`, som allerede ER
  utsmurt og har sitt tyngdepunkt i `strip.z`).
* Transformert areal `n·A_s`, **uten** å punsjere betongen. Dette er samme
  konvensjon som ULS-standarden `subtract_bar_area: false` allerede bruker, og
  gjelder uansett hva den flagget står på: SLS leser den ikke. Konsekvensen er
  at armering INNE i trykksonen telles sammen med betongen den fortrenger.
  Det skal STÅ i rapporten (§7), ikke gjemmes.

**Fortegnsrammen.** All regning skjer i en speilet SAGGING-ramme, slik at
koden bare har én gren. `s = +1` når `M_Ed ≤ 0` (sagging, `structuralcodes`'
konvensjon, se `payload.js` og `section.js:thetaFor`), `s = −1` ellers. Sett
`z' = s·z` for hvert lag og `M' = s·M_Ed`; `N` er uendret. Løs i primet ramme.
`x` er avstanden fra trykkanten og er lik i begge rammer; `σ_s` og `ε` per lag
er rammeuavhengige; `z` som rapporteres skal være det OPPRINNELIGE.

**Likningene.** Med `ε(z) = χ·(z − z_na)` (én parameter når `z_na` er gitt) og
`x = h/2 − z_na` klemt til `[0, h]`:

```
A(z_na) = E_c·b·x²/2            + Σ E_s·A_i·(z_i − z_na)
B(z_na) = E_c·b·(x³/3 + z_na·x²/2) + Σ E_s·A_i·(z_i − z_na)·z_i
```

`N = χ·A(z_na)` og `M = χ·B(z_na)`. Eliminer `χ`:

```
R(z_na) = M·A(z_na) − N·B(z_na) = 0
```

`R` er glatt på `[−h/2, +h/2]`. Løs med **bisection**: 120 halveringer, eller
til intervallet er under 1e−9 mm. Deretter `χ = N/A(z_na)` når `N ≠ 0`, ellers
`χ = M/B(z_na)`.

**Har `R(−h/2)` og `R(+h/2)` samme fortegn, finnes ingen rot — og da må grunnen
skilles i TO, fordi de to tilfellene ikke er det samme (rettet i runde 10):**

* **Hele snittet står i strekk.** Kjennes på den urissede tilstanden vi allerede
  har fra §1.1: `σ_c,OK > 0 OG σ_c,UK > 0`. Grunn `fully_in_tension`.
  Se §8 for hvorfor rene strekksnitt er utenfor omfang i denne versjonen —
  det er en BEGRUNSET utelatelse, ikke en regnefeil.
* **Ellers:** snittet har en trykksone i den urissede tilstanden, men det finnes
  ingen likevekt når betongens strekk fjernes. Grunn `no_equilibrium_cracked`.

**Grunnkoden `no_compression_zone` er FJERNET, fordi den var faktuelt feil på
sitt eget akseptansekriterium.** Målt i denne økten på AC8a (referansebjelken,
`N = +800·10³ N`, `M_Ed = −100·10⁶`): den urissede transformerte tilstanden har
`σ_c,OK = −0,715898` (TRYKK) og `σ_c,UK = +9,077837`. Snittet HAR altså en
trykksone, og det er ikke i rent strekk. Det som mangler er likevekt i den
opprissede tilstanden med den armeringen som ligger der. En grunnkode som sa
«ingen trykksone (rent strekk, x utenfor snittet)» påsto to ting som begge var
usanne for den ene raden den ble skrevet for.

Avledet: `ε_a = −χ·z_na`, `ε_i = χ·(z_i − z_na)`, `σ_s,i = E_s·ε_i`,
`σ_c,trykkant = E_c·χ·(h/2 − z_na)` (negativ = trykk).

**Gyldighetsvakter — alle gir `null`, ikke `false` og ikke et tall:**

* `max σ_s,i > f_yk` ⇒ `stresses_outside_elastic_range`. Den lineære modellen
  gjelder ikke for et snitt som har flytt under bruksgrenselast. Målt: en
  støttemomentrad på referansebjelken (ingen toppjern) gir et matematisk gyldig
  rotpunkt med `σ_s = 2622 MPa` og `σ_c = −576 MPa`. Uten denne vakten er det et
  stille feil tall.
* `|σ_c,trykkant| > f_ck` ⇒ samme grunn.
* `x ≤ 0` eller `x > h` ⇒ `no_equilibrium_cracked`. (Vakten er beholdt selv om
  klemmingen i `A(z_na)`/`B(z_na)` gjør den vanskelig å nå: den er billig, og
  `cc.sr_max_far(h, x)` og vår egen `h_c,eff` kaster begge for `x > h`. Se §12.4.)

### 1.3 Urisset elastisk tilstand

Lukket form, ingen rotsøking. Med `n = E_s/E_c`:

```
EA = E_c·b·h + Σ E_s·A_i
ES =           Σ E_s·A_i·z_i
EI = E_c·b·h³/12 + Σ E_s·A_i·z_i²
det = EA·EI − ES²
ε_a = (N·EI − M·ES)/det      χ = (M·EA − N·ES)/det
```

Samme transformerte konvensjon som §1.2 (`n·A_s`, brutto rektangel). `σ_c` på
begge kanter og `σ_s` per lag følger av `ε(z) = ε_a + χ·z`. Rissvidde er `null`.

**§1.3 har TO oppgaver, og det er den samme funksjonen begge ganger:**
1. med `E_cm`, alltid, for rissbeslutningen i §1.1 og for skillet mellom
   `fully_in_tension` og `no_equilibrium_cracked` i §1.2;
2. med radens egen modul, som radens tilstand NÅR raden er urisset.

For en `characteristic`-rad er de to samme kall med samme inndata og skal
memoiseres til ÉN evaluering. For en `quasi_permanent`-rad med `φ_ef > 0` er de
to ULIKE kall (ulik `Ec`) og gir ULIKE tall — de har hvert sitt navn i
kontrakten (`sigma_ct_uncracked` mot `state.sigma_c`) og leses aldri om
hverandre.

### 1.4 Hvilken E-modul, og de to α_e-ene

| størrelse | modul | hvorfor |
|---|---|---|
| snittanalysen, rad av type `characteristic` | `E_cm` | korttidslast |
| snittanalysen, rad av type `quasi_permanent` | `E_c,eff = E_cm/(1 + φ_ef)` | EC2 7.4.3(5), lign. 7.20 |
| `α_e` i lign. 7.9 | **`E_s/E_cm`, ALLTID** | EC2 7.3.4(2) definerer den slik |

**FELLA SOM SKJULER SEG SELV, målt:** bruker man `E_c,eff` også i lign. 7.9,
blir `w_k` LAVERE enn uten kryp i det hele tatt — de to feilene opphever
hverandre og blir usynlige. De to forholdstallene MÅ derfor ha **hvert sitt navn
i koden**: `alpha_e` (lign. 7.9, fra `E_cm`) og `n_sec` (snittanalysen, fra den
modulen raden faktisk brukte). Begge skal stå i rapporten.

**ÉN RAPPORTERT TILSTAND PER RAD — men 7.2(3) leser en annen størrelse.
RETTET I RUNDE 10.**

Forrige utkast sammenliknet betongtrykkspenningen i den KRØPNE tilstanden mot
`0,45·f_ck` og ba brukeren kjøre på nytt med `φ_ef = 0` hvis hen ville se
øyeblikksverdien. Det var systematisk på usikker side. Målt på referansebjelken,
samme last (`M_Ed = −100·10⁶`, `N = 0`), i denne økten:

| | `σ_c` | utnyttelse mot `0,45·30 = 13,5` |
|---|---|---|
| `φ_ef = 0` (ved påføring) | −10,325115 | **0,764823** |
| `φ_ef = 2` (den krøpne tilstanden) | −6,886016 | **0,510075** |

Modulen ville trykket 51 % der 76,5 % er tallet kriteriet gjelder, og et snitt
med `σ_c,inst = 14 MPa` ville fått «OK». Grunnen er at EC2 3.1.4 knytter
ikke-lineært kryp til spenningen VED PÅFØRING — det er den spenningen som
driver krypet. Å sammenlikne den krøpne spenningen mot `0,45·f_ck` er sirkulært:
den er lav NETTOPP fordi vi allerede antok lineært kryp.

**Derfor:** for en `quasi_permanent`-rad regnes §1.2/§1.3 én gang TIL, med
`E_cm`, og av den evalueringen brukes NØYAKTIG ÉN størrelse: `sigma_c_initial`,
den eneste inngangen til 7.2(3). Ingenting annet fra den evalueringen når
resultatet — ikke `σ_s`, ikke `x`, ikke tøyningsplanet, ikke rissviddekjeden.

**Dette er ikke to kilder til samme tall.** `σ_c` ved påføring og `σ_c` etter
kryp er to ULIKE fysiske størrelser, slik `alpha_e` og `n_sec` er det. De har
hvert sitt navn, hver sin etikett i rapporten («at first loading» mot
«long-term»), og hver sin ene produsent: den SAMME funksjonen, kalt med ulik
`Ec`. Forrige utkasts avvisning i §13 («det ville vært to `σ_s` for én last»)
blandet de to sammen — og den avvisningen er nå rettet der.

* Kostnaden er én ekstra bisection, mikrosekunder. Ingen ny seksjon, ingen
  cache-nøkkel.
* Rissbeslutningen er den samme for begge evalueringene (§1.1 er `E_cm`-fast),
  så det finnes ingen rad som er «risset langtid, urisset korttid».
* Vaktene i §1.2 gjelder BEGGE evalueringene hver for seg. Faller den
  øyeblikkelige ut mens den krøpne står, er `sigma_c_initial` `null` og
  `sigma_c_qp_ok` er `null` med grunnen — ikke `true`, og ikke den krøpne
  verdien smuglet inn som erstatning.
* For `φ_ef = 0` er de to evalueringene identiske; `sigma_c_initial` er da lik
  `state.sigma_c` og skal likevel stå, med sin egen etikett.

For en `characteristic`-rad finnes ingen slik dobbelthet: `E_c = E_cm`, raden
har én tilstand, og 7.2(2)/7.2(5) leser den direkte.

7.2(3) er dessuten ikke en kapasitetskontroll — se §2.2.

### 1.5 Hvilke rader får hvilken kontroll

| radtype | 7.2 betongtrykk | 7.2 stålstrekk | 7.3.4 rissvidde |
|---|---|---|---|
| `characteristic` | ja, `state.sigma_c` mot `k_c,char·f_ck` (bare XD/XS, se §2.1) | ja, mot `k_s,char·f_yk` | **nei** — `null`, grunn `not_quasi_permanent` |
| `quasi_permanent` | ja, **`sigma_c_initial`** mot `k_c,qp·f_ck` (§1.4) | nei | ja |
| `uls` | — | — | — |

Det er dette som gir de to SLS-typene hvert sitt formål. De er ikke varianter av
hverandre; de svarer på hvert sitt spørsmål, og det er grunnen til at modulen
allerede har nøyaktig to.

---

## 2. EC2 7.2 — spenningsbegrensning

Finnes **ikke** i `structuralcodes` (verifisert: `ec2_2004`-mappa har
materialegenskaper, kryp/svinn, armeringsegenskaper, skjær og 7.3-risskontroll,
ingenting for 7.2). Hele kontrollen er vår kode. Det er tre sammenlikninger når
tilstanden i §1 først finnes.

### 2.1 De tre grensene

| vår nøkkel | grense | hvilken spenning | kombinasjon | punkt | standardverdi |
|---|---|---|---|---|---|
| `sigma_c_char_factor` | `σ_c ≤ k·f_ck` | `state.sigma_c` | characteristic | 7.2(2) | 0,6 |
| `sigma_c_qp_factor` | `σ_c ≤ k·f_ck` | **`sigma_c_initial`** (§1.4) | quasi-permanent | 7.2(3) | 0,45 |
| `sigma_s_char_factor` | `σ_s ≤ k·f_yk` | `state.sigma_s_max` | characteristic | 7.2(5) | 0,8 |

Alle tre er nasjonalt bestemte parametere. De legges inn som **synlige,
overstyrbare felt** med våre egne etiketter og et punktnummer — ikke som en
gjengitt tabell. Standardverdiene er de anbefalte.

**Navnene må IKKE bli `k1`/`k2`/`k3`.** `state.spacing.k1` og `state.spacing.k2`
finnes allerede (EC2 8.2), og 7.3.4 har sine egne `k1`–`k4`. Tre sett med samme
bokstav i samme resultat er en feil som venter.

7.2(2) er av EC2 begrenset til eksponeringsklassene XD, XF og XS. Det gir TRE
utfall, ikke to (**rettet i runde 10** — forrige utkast hadde to, og den
manglende tredje forkledde «vi vet ikke» som «gjelder ikke»):

| eksponeringsklasse | `sigma_c_char_required` | `sigma_c_char_ok` |
|---|---|---|
| valgt, og i XD/XF/XS | `true` | `true`/`false` av sammenlikningen |
| valgt, men ikke i XD/XF/XS (X0, XC*) | `false` | utelatt fra `sls.checks`, står i `not_applicable` |
| **ikke valgt** (`exposure_class = null`) | **`null`** | **`null` i `sls.checks`, grunn `no_exposure_class`** |

Den tredje raden er poenget. `exposure_class = null` er den BEVISSTE
standardtilstanden (§5). Med et rent `bool`-felt ble den `false`, og kontrollen
havnet i `not_applicable` — altså påstanden «denne kontrollen gjelder ikke»,
uten noe grunnlag for å si det. Sannheten er at vi ikke vet om den gjelder,
fordi ingen klasse er valgt. Det er nøyaktig samme situasjon som AC10 allerede
behandler riktig for `crack_width_ok`, og de to skal svare likt.

At X0/XC* går til `not_applicable` og ikke til `null` står fast: der ER
klassen kjent, og «gjelder ikke» er da en besvart påstand. Å la den bli `null`
ville gjort «ubesvart» til normaltilstanden for hvert eneste XC-snitt.

### 2.2 7.2(3) er ikke en kapasitetskontroll

Overskrides `0,45·f_ck` under tilnærmet permanent last, betyr det at lineært
kryp ikke lenger er en gyldig antakelse og at ikke-lineært kryp må vurderes
(EC2 3.1.4). **Vi regner ikke ikke-lineært kryp.** Etiketten og teksten må si
det. Ikke «Not OK» uten forklaring.

Nettopp DERFOR leser den `sigma_c_initial` og ikke den krøpne spenningen
(§1.4): kontrollen spør om antakelsen som ligger under `φ_ef` holder, og den
antakelsen står og faller med spenningen i det øyeblikket lasten kom på. Å
prøve den på et resultat som allerede forutsetter svaret, er ingen prøve.

En detalj som skal stå i rapportens modellavsnitt, ikke skjules: EC2 3.1.4
knytter grensa til betongens fasthet ved påføringstidspunktet. Vi bruker
`f_ck` ved 28 døgn, slik 7.2(3) selv er formulert. For en konstruksjon som
lastes tidlig er den derfor på usikker side, og det er brukerens vurdering —
ikke et tall vi kan utlede av et tverrsnitt alene.

### 2.3 Hvilken σ_s

`σ_s` til 7.2 er den STØRSTE strekkspenningen blant ALLE lag. `σ_s` til lign.
7.9 er den største blant lagene som ligger INNE i `A_c,eff` (§3.3). Det er to
ULIKE utvalg fra den SAMME lista med lagspenninger — lista er den ene kilden,
og begge tallene skal bære etikett som sier hvilket utvalg de kom fra.

Begge utvalgene tas fra radens EGEN tilstand (`state.layers`). Lagspenningene
fra den øyeblikkelige evalueringen i §1.4 er IKKE i lista og skal ikke legges
der: den evalueringen leverer `sigma_c_initial` og ingenting annet.

---

## 3. EC2 7.3.4 — den direkte rissviddeberegningen

Vi bruker `structuralcodes.codes.ec2_2004._section_7_3_crack_control`. Hele
kjeden er verifisert scipy-fri: `griddata` brukes bare på linje 499 og 507,
begge inne i `As_min_2` (den forenklede 7.3.3-metoden), som vi **ikke** rører.
`interp1d` brukes bare i `k(h)`, som vi heller ikke trenger.

### 3.1 Regelen for hva vi kaller og hva vi skriver selv

En størrelse har nøyaktig én produsent. Har pakken en funksjon som tar
NØYAKTIG de inndataene vi har og gir NØYAKTIG den størrelsen vi trenger, kaller
vi den, og vi utleder den aldri på nytt. Ellers skriver vi den selv — og da
kaller vi ikke pakkens variant for en delmengde av tilfellene.

**Fra pakken:** `alpha_e`, `rho_p_eff`, `kt`, `k1`, `k2`, `k3`, `k4`,
`sr_max_close`, `sr_max_far`, `w_spacing`, `wk`.

**Vår egen kode:** den rissede/urissede tilstanden (§1), **`h_c,eff`**,
**`ε_sm − ε_cm`**, `c`, `φ_eq`, senteravstanden `s`, `ε_r` inn i `k2`, valget av
gren i alle tre min/maks-leddene, `w_max`, og hele 7.2.

**`h_c,eff` og `ε_sm − ε_cm` er FLYTTET hit i runde 10, og pakkens varianter
skal da ikke kalles i det hele tatt.** Grunnen er regelen rett over. Verifisert
i kildekoden i denne økten: `cc.hc_eff` returnerer `min(2.5*(h-d), (h-x)/3,
h/2)` og `cc.eps_sm_eps_cm` returnerer `max(c, 0.6*sigma_s/Es)` — ingen av dem
gir kandidatene eller de to leddene hver for seg. Men §3.3 og §4 krever nettopp
dem (`h_c_eff_candidates`, `h_c_eff_governing`, `eps_equation`, `eps_floor`,
`eps_governing`), og de er hele poenget med etterprøvbarheten. Hadde vi kalt
pakken OG regnet kandidatene selv for å finne grenen, ville `h_c,eff` og
`ε_sm − ε_cm` hatt to produsenter hver, uten kryssjekk — og det er nøyaktig
feilformen doktrinen navngir. Pakken tar altså ikke «nøyaktig den størrelsen vi
trenger», og da skriver vi den selv.

**Pakken blir i stedet et TEST-orakel, ikke en andre produsent i koden.** En
test i `tests/python` skal påstå at vår `h_c,eff` er bit-lik `cc.hc_eff(h, d, x)`
og vår `ε_sm − ε_cm` bit-lik `cc.eps_sm_eps_cm(...)` for alle AC-tilfellene i
§9 pluss et lite sveip. Det gir uavhengig kontroll uten at det finnes to
produsenter når modulen kjører — og det sparer to kall i Pyodide.

Vi arver da ikke pakkens inngangsvakter, og må ha våre egne. Verifisert hvilke
de er: `cc.hc_eff` kaster for `h < 0`, `d < 0`, `x < 0`, `d > h` og `x > h`;
`cc.eps_sm_eps_cm` kaster for negativ `σ_s`, `α_e`, `ρ_p,eff`, `f_ct,eff` eller
`E_s`, og for `k_t` utenfor {0,4; 0,6}. Av disse er det bare to som kan nås hos
oss, og begge har allerede en grunnkode: `x` utenfor `(0, h]` fanges av vakten i
§1.2, og `σ_s ≤ 0` av `no_tensile_stress_in_effective_area` (§3.5). Resten er
umulige per konstruksjon og skal stå som `assert` med en norsk begrunnelse, ikke
som en grunnkode brukeren kan se.

**Skal ALDRI kalles:**
* `w_max` — se §11. Den er avgrenset til nøyaktig de radene standarden selv
  anbefaler verdier for, og kaster `ValueError` med en villedende melding for
  `('XD1','f')` og `('XS3','f')`: meldingen sier at `'f'` ikke er en gyldig
  `load_combination`, mens den gyldige verdien i virkeligheten er
  kombinasjonen av klasse og lasttilfelle. Verifisert i denne økten. Dessuten
  kjenner den ikke våre kombinasjonstyper.
* `As_min_2` — 7.3.3, kaster på `griddata`.
* `xi1` — kaster for `phi_p = 0`, altså for all vanlig slakkarmering.
* `phi_eq` — tar bare to grupper (§3.4).
* `sr_max_theta` — modulen har ingen skjevbøying: `thetaFor` gir bare 0 eller π.
* `k`, `kc_*`, `As_min`, `As_min_p` — 7.3.2 minimumsarmering er utenfor omfang (§8).
* `detailed_result` / `create_detailed_result` / `get_point_stress` — den
  første kaster fra triangle-stubben, og den siste returnerer STILLE 0 uten
  `group_label`. Vi regner `ε` av planet og har ÉN kilde.

### 3.2 Kjeden, i rekkefølge

```
1  d           = tyngdepunkt for lagene med ε > 0, målt fra trykkanten
2  h_c,eff     = VÅR, = min(2,5(h−d), (h−x)/3, h/2), grenen rapporteres [7.3.2(3)]
3  A_c,eff     = b · h_c,eff
4  A_s,eff     = Σ A_i for strekklag med tyngdepunkt innenfor A_c,eff
5  ρ_p,eff     = cc.rho_p_eff(A_s,eff, 0, 0, A_c,eff)                        [7.10]
6  α_e         = cc.alpha_e(E_s, E_cm)                                       [7.3.4(2)]
7  k_t         = cc.kt('long')                                               [7.9]
8  σ_s         = største strekkspenning blant lagene i A_c,eff  (må være > 0)
9  ε_sm − ε_cm = VÅR, = max( (σ_s − k_t·f_ct,eff/ρ_p,eff·(1+α_e·ρ_p,eff))/E_s ,
                             0,6·σ_s/E_s ), grenen rapporteres              [7.9]
10 k1          = cc.k1('bond') = 0,8   k3 = cc.k3() = 3,4   k4 = cc.k4() = 0,425
11 k2          = cc.k2(ε_r),  ε_r = max(0, ε_2)/ε_1                          [7.13]
12 c           = d_c − φ/2 for det YTTERSTE strekklaget
13 φ_eq        = Σ n_i φ_i² / Σ n_i φ_i   over lagene i A_c,eff              [7.12]
14 terskel     = cc.w_spacing(c, φ_eq) = 5(c + φ/2)
15 s           = største senteravstand blant lagene i A_c,eff som HAR en (§3.4)
16 s_r,max     = cc.sr_max_close(...) hvis s ≤ terskel, ellers cc.sr_max_far(h, x)
17 w_k         = cc.wk(s_r,max, ε_sm − ε_cm)                                 [7.8]
```

Steg 2 og 9 er VÅRE fra og med runde 10 (§3.1), med pakken som test-orakel.
Formene over er skrevet ut her fordi de nå er vårt ansvar, og fordi
grenvalgene i §3.3 ikke kan rapporteres uten dem.

**Kjeden kjøres PER KANT, ikke én gang for hele snittet. NYTT I RUNDE 12.**
Steg 1–5, 8 og 12–17 leses av DEN ENE kantens egen sone; bare `α_e`, `k_t`,
`f_ct,eff`, `k1`, `k3`, `k4` og `ε_r`/`k2` (steg 6, 7, 10, 11) er
snittstørrelser som er felles. `w_k` er MAKSIMUM over kantene.

En kant er en betongoverflate med `ε > 0` i tøyningsplanet — for et bøyd snitt
er det nøyaktig én (trykkanten har `ε ≤ 0` og faller ut av seg selv), for et
strekkstag er det to. Til hver kant hører de strekklagene som er NÆRMEST den
(på eksakt halv høyde velges kanten `state.tens_face_z` alt har pekt ut), og:

```
d_kant  = arealvektet avstand fra KANTEN til tyngdepunktet av DENS egne strekklag
h_c,ef  = min( 2,5·d_kant , (h−x)/3 når det finnes en trykksone , h/2 )
```

`2,5(h−d)` i 7.3.2(3) er altså `2,5·d_kant`, og `d` som rapporteres er fortsatt
målt fra den MOTSATTE overflaten (`d = h − d_kant`), slik at `2,5(h−d)` og
orakelet `cc.hc_eff(h, d, x)` står uendret.

**Hvorfor:** EN 1992-1-1 fig. 7.1 deltegning (c) viser strekkstaven med TO
effektive soner, én mot hver overflate, og `(h−d)` er avstanden fra DEN
overflaten sonen ligger mot til tyngdepunktet av armeringen som hører til DEN
sonen. `h/2` i kandidatlista er ANTI-OVERLAPPSTAKET for nettopp det tilfellet —
to soner à `h/2` møtes eksakt på halv høyde — ikke en påstand om at en
strekkstavs sone er halve snittet. Mekanisk: `A_c,eff` er betongen heften rekker
ut i fra stengene nær den overflaten risset måles på; et jern 300 mm inne i
snittet kan ikke holde igjen et overflateriss.

**Målt** (sveip over 3 888 strekkstag/veggskiver, 1 536 med rissvidde både før
og etter): 1 476 av dem har armering ved begge kanter, og før fikk bare ÉN av
de to overflatene et svar. I 32,2 % av tilfellene var det gamle svaret FOR
LAVT — ned til 0,3448× den riktige verdien. Verst i `far`-grenen (79,2 % for
lave), der `s_r,max = 1,3(h−x)` ikke avhenger av `ρ_p,eff` og bare den senkende
virkningen av en fortynnet `ρ_p,eff` står igjen. Regelen var dessuten
DISKONTINUERLIG: et lag flyttet 2 mm gjennom halv høyde hoppet `w_k` med faktor
1,4158 (målt, `A_s,eff` 1 472,6 → 2 415,1 mm²); kantvis er største nabosprang
over ±10 mm 1,0011.

**Ren bøyning er per definisjon uberørt** — med strekkarmering ved bare én kant
er kantens lagsett HELE strekksettet og `d_kant = h − d`. Verifisert bit for bit
mot koden før endringen på 41 bøyningssnitt × 32 størrelser: 0 avvik.
`2,5(h−d) > h` — en effektiv sone dypere enn hele snittet — kan da heller ikke
lenger oppstå: målt 0 av 3 012 kanter i sveipet, mot at det var normaltilstanden
for et strekkstag før.

Steg 8: er den største strekkspenningen blant lagene i `A_c,eff` ikke positiv,
finnes ingen strekkarmering å regne rissvidde på i sonen. `crack` er `null` med
grunnen `no_tensile_stress_in_effective_area`, og lign. 7.9 kalles ikke — hverken
vår eller pakkens, som begge er udefinerte der.

**`d` i steg 1 er IKKE `section_props.d_eff`.** `d_eff` er tyngdepunktet i
strekkarmeringen ved BRUDD; SLS-`d` er samme begrep på SLS-tøyningsplanet, og de
to kan skille lag når et lag står i strekk ved brudd men i trykk under
bruksgrenselast. DEFINISJONEN skal likevel bare finnes ett sted: kall
`_tension_layers` (`engine.py:327`) og `_weighted_depth` (`engine.py:314`) med
SLS-lagtilstandene — ikke skriv regelen `ε > 0` en gang til. Rapporten viser
begge, hver med sin etikett, og aldri i samme tabell uten den.

`f_ct,eff = f_ctm`, lest fra `conc.fctm` — samme kilde `_cracking_moment` og
`materials.fctm` allerede bruker. **Kall aldri `ec2_2004.Ecm()`:** den tar
`f_cm`, ikke `f_ck`, og gir 6,8 % for lav modul hvis man bommer. `conc.Ecm`
(`engine.py:1599` bruker den allerede) er den ene kilden.

`k_t`: rissvidde regnes bare på tilnærmet permanent kombinasjon (§1.5), som per
definisjon er langtidslasten. `k_t = 0,4`, utledet av radtypen, ikke et felt.
Det skal stå i rapporten med den begrunnelsen.

### 3.3 De tre grenvalgene SKAL rapporteres

Dette er den største enkeltgevinsten for etterprøvbarhet, og det er billig.
Målingene viser at alle tre skifter innenfor helt vanlige tverrsnitt, og at to
av dem produserer oppførsel som ser ut som en feil i verktøyet hvis grenen er
skjult:

* **`h_c,eff`** — hvilken av `2,5(h−d)`, `(h−x)/3`, `h/2` som ble minst. Målt:
  bjelken styres av `2,5(h−d)` (da spiller `x` ingen rolle), plata av `(h−x)/3`
  (da er `x` avgjørende). Samme formel, motsatt konklusjon.
* **lign. 7.9** — hovedleddet eller gulvet `0,6·σ_s/E_s`. Målt: gulvet styrer i
  store deler av det praktiske plateområdet, og hovedleddet kan der bli negativt.
* **`s_r,max`** — nær eller fjern, med terskelen `5(c + φ/2)` og senteravstanden
  ved siden av. **Merk: fjerngrenen er IKKE alltid den største.** Målt på plata
  Ø12 c/c 200 er `s_r,max,nær = 323,6` mot `s_r,max,fjern = 221,2`. Ikke bruk
  «konservativ» som begrunnelse for noe som helst her.

### 3.4 Størrelser som må utledes, og hvordan

**`c` — overdekning til LENGDEJERNETS overflate.** `state.cover` er
overdekningen til BØYLA (`store.js:55`, `suggestedDc = cover + bøyle + dia/2`),
og payloaden bærer den ikke. Legger vi til et `cover`-felt i payloaden, får vi
to kilder til den samme fysiske avstanden — nøyaktig feilen `stirrup_dia` bar på
før den ble ryddet bort (`payload.js`, kommentaren i `rebarEntry`). Utled
GEOMETRISK i motoren, fra tallene payloaden allerede har:

```
d_c = h/2 − |z|        (avstand fra nærmeste kant til jernsenteret)
c   = d_c − φ/2
```

Verifisert mot begge fixturene:

| | `h/2` | `z` | `d_c` | `φ/2` | `c` |
|---|---|---|---|---|---|
| bjelken | 300 | −250 | 50 | 10 | **40 mm** |
| plata | 100 | −69 | 31 | 6 | **25 mm** |

Bøyla er allerede inne i `d_c` (den kom dit via `suggestedDc`), gratis og uten
et felt som kan komme i utakt.

**`φ` og `s` for et `kind: 'strip'`-lag.** Forskningen påsto at rissvidde ikke
kan besvares for et utsmurt lag. **Det er feil, og det er verifisert her.**
`equivalentStrip` (`rebar.js:198`) setter `height = dia` EKSAKT og
`width = A_s/dia`. Altså:

```
φ = strip.height
s = 1000 · π · φ² / (4 · A_s)        ← 1000, IKKE b
```

**Konstanten er 1000, ikke `b`. RETTET I RUNDE 10, og den var reelt farlig.**
Forrige utkast skrev `b`. Foroverveien er `layerArea` (`rebar.js:87`):

```js
if (layer.mode === 'spacing') return (1000 / num(layer.spacing)) * a;
```

— en hardkodet 1000, fordi et `spacing`-lag ALLTID regnes per meter. Utkastet
antok at `spacing` ⇒ plate ⇒ `b = 1000`, og den antakelsen holder ikke.
Verifisert i kildekoden i denne økten: `parseShorthand` (`ui.js:307`)
returnerer `{ mode: 'spacing', … }` uansett tverrsnittstype, og `createLayer`
(`rebar.js:494`) lar `...patch` overstyre bjelkens `mode: 'bars'`. Det finnes
ingen vakt noe sted. Målt: «Ø12 c/c 200» på en 300 mm bred bjelke gir
`area = 565,486678`; med `b` blir `s = 60,0 mm`, med 1000 blir den `200 mm`,
som er sannheten.

At `s` blir feil er ikke en kosmetisk feil — den velger GREN i steg 16. For
AC7-geometrien («Ø16 c/c 300», terskel 215) gir `b`-formelen på en 300 mm bjelke
`s = 90` og dermed `close`, mens sannheten 300 gir `far`. Målt forskjell mellom
grenene i AC7: `s_r,max` 346,34 mot 218,46 — 37 % rett på `w_k`, stille.

**Regelen bak, og den gjelder mer enn denne ene formelen:** en inversjon må
være den EKSAKTE inversen av foroverveien. Bruker inversjonen en annen
konstant enn foroverveien, beskriver `s` og `A_s` to ulike armeringsbilder, og
resten av kjeden regner på det ene mens rapporten trykker det andre.

**Testen må ligge på en BJELKE med et `spacing`-lag, ikke på platefixturen.**
Testen forrige utkast påla («låser at inversjonen gir tilbake `layer.dia` og
`layer.spacing`») ville passert på platefixturen med BEGGE formlene —
verifisert: begge gir 113,0 der, fordi `b` tilfeldigvis ER 1000. En test som
ikke kan se feilen den er skrevet for, er ingen test.

**`s` for et `kind: 'bars'`-lag. NY I RUNDE 10 — den manglet helt.** Forrige
utkast definerte `s` bare for stripa, mens steg 15 krevde den for alle lag.
Payloaden bærer koordinatene allerede (`rebar[i].bars = [{y, z, dia}, …]`,
`payload.js:rebarEntry`), så regelen er:

```
sorter lagets bars på y;  s_lag = største avstand mellom to NABOJERN
```

Verifisert mot bjelkefixturen: `y = −100, 0, +100` ⇒ `s = 100,0`, som er AC1s
tall. Utled det ÉTT sted, i motoren, av `bars` — ikke av `count` og `b`, som
ville vært en andre kilde til den samme geometrien.

**Et lag med ETT jern har ingen senteravstand, og får ingen påfunnet.**
`barPositions` (`rebar.js:178`) returnerer `[{y: 0, …}]` for `n = 1`; det
finnes ikke noe nabojern å måle til. Regelen:

* et énjernslag bidrar ikke med noen `s`, og fjerner ingen heller;
* har MINST ETT lag i `A_c,eff` en `s`, brukes den største av dem;
* har INGEN av lagene i `A_c,eff` en `s`, er `crack` `null` med grunnen
  `no_bar_spacing`.

Grunnen til at det ikke defaultes: **grenene er ikke ordnet.** En default på 0
tvinger `close`, en på ∞ tvinger `far`, og målt i AC5 er `close` = 323,63 mot
`far` = 221,22 — den ene er ikke systematisk på den sikre siden av den andre.
Et påfunnet tall her ville vært et stille grenvalg på 30–50 % av `s_r,max`.

**`φ_eq`** regnes alltid av oss, med den generelle formen
`Σ n_i φ_i² / Σ n_i φ_i`, som reduserer seg eksakt til `φ` når alle jern i sonen
har samme diameter. `n_i = A_i/(π φ_i²/4)` (ikke nødvendigvis heltall for en
stripe — formelen er arealvektet og tåler det). Pakkens `phi_eq` tar bare to
grupper; å bruke den for to og vår egen for tre ville vært to kilder.

**`s` med flere lag i `A_c,eff`:** største senteravstand blant de lagene som
HAR en (se énjernsregelen over), rapportert, med en linje i utledningen som
sier hvor mange lag som bidro og hvor mange som ikke kunne. Vertikal fordeling
av jern inngår ikke — det står under §8.

**`ε_r` til `k2`:** `ε_1` = strekktøyningen ved den ytterste strekkanten,
`ε_2` = tøyningen ved motsatt kant, satt til 0 hvis den er trykk.
`ε_r = ε_2/ε_1 ∈ [0, 1]` per konstruksjon, så `cc.k2` kan ikke kaste. Ren
bøyning gir eksakt `k2 = 0,5`. Ikke hardkod 0,5: et snitt med aksialtrykk eller
aksialstrekk i tillegg til moment havner mellom 0,5 og 1,0, og det er en vanlig
situasjon. **Grensetilfellet `ε_r = 1` (rent strekk) er derimot ikke nåbart** —
et snitt der hele tverrsnittet står i strekk faller ut i §1.2 med grunnen
`fully_in_tension`, se §8. Forrige utkast lovet `k2 = 1,0` for rent strekk; det
var en påstand om en gren koden aldri kommer til, og den er fjernet.

### 3.5 Når rissvidden er `null`

Grunnkoder, alle med treverdig oppførsel:

| kode | når |
|---|---|
| `uncracked` | `σ_ct ≤ f_ct,eff` i det urissede transformerte snittet (§1.1) |
| `not_quasi_permanent` | raden er `characteristic` |
| `fully_in_tension` | begge betongkantene står i strekk (§1.2, §8) |
| `no_equilibrium_cracked` | ingen likevekt i den opprissede tilstanden, eller `x` utenfor `(0, h]` |
| `stresses_outside_elastic_range` | `σ_s > f_yk` eller `|σ_c| > f_ck` |
| `no_tension_reinforcement` | ingen lag med `ε > 0` |
| `no_bonded_bars_in_effective_area` | ingen strekklag med tyngdepunkt innenfor `A_c,eff` |
| `no_tensile_stress_in_effective_area` | lag finnes i `A_c,eff`, men ingen har `σ_s > 0` (§3.2 steg 8) |
| `no_bar_spacing` | ingen av lagene i `A_c,eff` har en senteravstand (§3.4) |

**En kant som ikke kan regnes gjør HELE rissvidden ubesvart. NYTT I RUNDE 12.**
Gir én av kantene `no_bonded_bars_in_effective_area`, `no_bar_spacing` eller
`no_tensile_stress_in_effective_area`, er `crack` `null` med DEN grunnen — også
når den andre kanten kunne regnes. Svaret er «største rissvidde over
overflatene», og det kan ikke gis når bare den ene er kjent; den andre kanten
skal ikke stille bli «svaret». Med armering ved bare én kant er dette ordrett
den oppførselen tabellen over alltid har beskrevet. `no_tension_reinforcement`
gjelder fortsatt snittet, ikke en kant. En strekkant uten et eneste jern nærmest
seg får `no_bonded_bars_in_effective_area` — overflaten risser, men 7.3.4 har
ingen heftende armering å regne med der.

Radene i tabellen over er UTTØMMENDE for `crack = null`: er `crack_reason`
ingen av dem, er `crack` et fylt objekt. De tre kodene `fully_in_tension`,
`no_equilibrium_cracked` og `stresses_outside_elastic_range` er samtidig
`state_reason`-koder (§1.2) — når tilstanden mangler, arver `crack_reason`
grunnen fra den, slik at det ikke finnes to måter å si det samme på.

**`no_crack_width_limit` står IKKE i denne tabellen. Rettet i runde 10:** den
hører ikke hjemme her, og forrige utkast motsa seg selv om den. Når `w_k` ER
regnet og bare grensa mangler, er `crack` et FYLT objekt med `w_k` i, og det er
`crack.ok`, `crack.w_max` og `crack.utilisation` som er `null`. Slik står det
allerede både i §4 og i AC10. En agent som leste §3.5 bokstavelig ville satt
`crack = None` og kastet en ferdig regnet rissvidde på gulvet.

`no_crack_width_limit` er altså en grunn til at **`crack.ok` er `null`**, og
den bor sammen med `no_exposure_class` (§2.1) i det settet:

| kode | når `crack.ok` er `null` |
|---|---|
| `no_exposure_class` | ingen eksponeringsklasse valgt, og ingen manuell override |
| `no_crack_width_limit` | klasse valgt, men den har ingen anbefalt grense hos oss (§11) |

Koden emitteres av motoren. **Den engelske teksten bor i `results.js`**, ett
sted, som `describeWarning` allerede gjør for advarsler. En test skal påstå at
hver kode motoren kan emittere — fra BEGGE tabellene, og `state_reason`-kodene
i §1.2 — har en tekst, og at ingen tekst finnes uten en kode.

---

## 4. Kontrakten — hva motoren legger i resultatet

`result.sls` finnes **bare** når payloaden har et `sls`-objekt OG minst én
kombinasjon har type `characteristic` eller `quasi_permanent`. Alle eksisterende
fixturer og payloader mangler `sls` og skal gi nøyaktig samme resultat som i dag.

**`result.checks` og `result.checks.all_ok` RØRES IKKE.** SLS har sine egne
treverdige kontroller i `sls.checks` og sin egen `sls.all_ok`. Grunnen skal stå
i koden: «Overall assessment» er ULS-dommen, og å folde en ubesvart rissvidde
inn i den ville gjort «–» til normaltilstanden — en dom alle lærer seg å
overse er verre enn ingen dom. De to står ved siden av hverandre i UI og rapport.

```
result.sls = {
  'phi_ef':        float,          # inndata, uendret
  'Ecm':           float,          # = materials.Ecm, gjentatt her fordi kjeden leser den
  'Ec_eff':        float,          # E_cm/(1+phi_ef)
  'alpha_e':       float,          # E_s/E_cm  — LIGN. 7.9. Aldri E_c,eff.
  'f_ct_eff':      float,          # = materials.fctm
  'exposure_class': str | None,
  'w_max':         float | None,   # mm
  'w_max_source':  'class' | 'manual' | None,
  'w_max_reason':  str | None,     # grunnkode når w_max er None, se §3.5
  'limits': {                      # de tre 7.2-faktorene slik de kom inn, og produktene
      'sigma_c_char_factor': float, 'sigma_c_char': float | None,
      'sigma_c_qp_factor':   float, 'sigma_c_qp':   float,
      'sigma_s_char_factor': float, 'sigma_s_char': float,
      # TREVERDIG, ikke bool (§2.1): True = klassen er i XD/XF/XS,
      # False = klassen er valgt og er ikke det, None = ingen klasse valgt.
      'sigma_c_char_required': True | False | None,
  },
  'rows':   [ SlsRow, ... ],       # én per SLS-rad, i payloadens rekkefølge
  'checks': { ... },               # bare de som GJELDER, se under
  'not_applicable': { key: 'engelsk grunn', ... },
  'all_ok': True | False | None,   # _three_valued_and(sls['checks'])
}
```

`SlsRow`:

```
{
  'id': str, 'name': str, 'type': 'characteristic' | 'quasi_permanent',
  'N_Ed': float, 'M_Ed': float,          # N og Nmm, som ellers i resultatet
  # Rissbeslutningen, §1.1. INGEN 'M_cr' — SLS kaller aldri _cracking_moment.
  # Grensa den prøves mot er sls['f_ct_eff'], som er lik for alle rader og
  # derfor IKKE gjentas her. Den står allerede to steder (sls og crack); et
  # tredje ville vært et tall å holde i utakt.
  'sigma_ct_uncracked': float,            # største strekkspenning, urisset, ALLTID E_cm
  'cracked': bool,
  'Ec_used': float, 'n_sec': float,       # modulen denne raden ble regnet med
  'state': {                              # None når den ikke kunne regnes
      # 'z_na' er NULL når χ = 0 (rent aksialt): et snitt med samme tøyning
      # overalt HAR ingen nullakse, og 0 eller ±∞ ville begge vært et tall som
      # løy. 'x' er derimot alltid et tall — den degenererer til h (helt i
      # trykk) eller 0 (helt i strekk), som er det figuren skal tegne.
      'x': float, 'z_na': float | None, 'eps_a': float, 'chi_y': float,
      'sigma_c': float,                   # trykkanten, NEGATIV
      'eps_1': float, 'eps_2': float,     # ytterste strekkant / motsatt kant
      'sigma_s_max': float,               # største strekkspenning, ALLE lag  -> 7.2
      # Hele snittet i strekk og risset (strekkstag, ringarmering i tanker).
      # Da bærer betongen ingenting, likevekten står i jernene alene, og
      # 'x' = 0 / 'sigma_c' = 0 er SVARET — ikke en degenerasjon. `(h-x)/3`
      # faller da ut av h_c,eff, fordi den er utledet for en trykksone.
      'tension_only': bool,
      'layers': [ {'id','z','eps','sigma','tension': bool}, ... ],
  } | None,
  'state_reason': str | None,             # grunnkode når 'state' er None

  # §1.4: betongtrykkspenningen VED PÅFØRING. Bare denne ene størrelsen kommer
  # fra evalueringen med E_cm; den har ingen egen 'state', med vilje.
  'sigma_c_initial': float | None,        # None for characteristic (== state.sigma_c)
  'sigma_c_initial_reason': str | None,   # grunnkode når den ikke kunne regnes

  'stress': {                             # None når 'state' er None
      # 'sigma_c' er ALLTID den spenningen grensa faktisk ble prøvd på:
      # state.sigma_c for characteristic, sigma_c_initial for quasi_permanent.
      # 'sigma_c_checked' sier hvilken, slik at ingen leser den som den andre.
      # Den krøpne spenningen forsvinner ikke — den står i state.sigma_c.
      'sigma_c': float, 'sigma_c_limit': float | None, 'sigma_c_util': float | None,
      # 'sigma_c_ok' er None når grensa IKKE GJELDER for raden, ikke bare når
      # den ikke kunne regnes: EC2 7.2(2) gjelder bare XD/XF/XS, og uten valgt
      # klasse er det ukjent. 'sigma_c_ok_reason' bærer hvilken av delene det
      # er ('sigma_c_char_not_required' / 'no_exposure_class' / en grunnkode
      # fra tilstanden). Utnyttelsen står igjen uansett — den er et faktum om
      # raden, ikke en dom. 7.2(3) (quasi_permanent) er ikke klasseavhengig.
      'sigma_c_ok': True|False|None,
      'sigma_c_ok_reason': str | None,
      'sigma_c_checked': 'state' | 'initial',   # hvilken spenning grensa ble prøvd på
      # 'sigma_s' er state.sigma_s_max for BEGGE radtyper — største strekk-
      # spenning over alle lag. For quasi_permanent finnes ingen grense (EC2
      # 7.2(5) er en karakteristisk kontroll), men tallet står likevel: det er
      # inngangen til rissvidden. Spenningen lign. 7.9 faktisk bruker er en
      # ANNEN størrelse, crack.sigma_s i det styrende laget inne i A_c,eff.
      'sigma_s': float, 'sigma_s_limit': float | None, 'sigma_s_util': float | None,
      'sigma_s_ok': True|False|None,      # None for quasi_permanent-rader
      'sigma_s_ok_reason': str | None,    # 'sigma_s_limit_characteristic_only' der
  } | None,
  'crack': {                              # None når 'crack_reason' er satt
      # ALLE feltene fram til 'edges' er DEN STYRENDE KANTENS — kanten med størst
      # w_k. Ingen av dem er fjernet eller omdefinert i runde 12: for et bøyd
      # snitt, som har én kant, er de bit for bit de samme tallene som før.
      'd': float,                         # målt fra den MOTSATTE overflaten
      'd_edge': float,                    # = h - d, avstand fra KANTENS overflate
      'x': float,
      'h_c_eff': float,
      'h_c_eff_candidates': {'2.5(h-d)': float, '(h-x)/3': float, 'h/2': float},
      'h_c_eff_governing': '2.5(h-d)' | '(h-x)/3' | 'h/2',
      'A_c_eff': float, 'A_s_eff': float, 'layers_in_zone': [str, ...],
      'layers_at_face': [str, ...],       # strekklagene som HØRER TIL kanten
      'rho_p_eff': float, 'alpha_e': float, 'k_t': float, 'f_ct_eff': float,
      'sigma_s': float, 'sigma_s_layer': str,
      'eps_sm_eps_cm': float, 'eps_equation': float, 'eps_floor': float,
      'eps_governing': 'equation' | 'floor',
      'eps_1': float, 'eps_2': float, 'eps_r': float,
      'k1': float, 'k2': float, 'k3': float, 'k4': float,
      'c': float, 'phi_eq': float, 'bar_spacing': float, 'spacing_threshold': float,
      'sr_max_close': float, 'sr_max_far': float,
      'sr_max': float, 'sr_max_branch': 'close' | 'far',
      'w_k': float,                       # = max(edges[*].w_k)
      # BEGGE kantene står, ikke bare den styrende: leseren må kunne se hvilken
      # overflate som ble målt og hva den andre gav (§3.2).
      'governing_edge': 'bottom' | 'top',
      'governing_edge_face_z': float,
      'edges': [ {                        # 1 for bøyning, 2 for et strekkstag
          'face': 'bottom' | 'top', 'face_z': float,
          'd_edge': float, 'd': float, 'x': float,
          'h_c_eff': float, 'h_c_eff_candidates': {...}, 'h_c_eff_governing': str,
          'A_c_eff': float, 'A_s_eff': float,
          'layers_in_zone': [str, ...], 'layers_at_face': [str, ...],
          'rho_p_eff': float, 'alpha_e': float, 'k_t': float, 'f_ct_eff': float,
          'sigma_s': float, 'sigma_s_layer': str,
          'eps_sm_eps_cm': float, 'eps_equation': float, 'eps_floor': float,
          'eps_governing': str,
          'eps_1': float, 'eps_2': float, 'eps_r': float,   # snittets, ikke kantens
          'k1': float, 'k2': float, 'k3': float, 'k4': float,
          'c': float, 'phi_eq': float,
          'bar_spacing': float, 'spacing_threshold': float,
          'sr_max_close': float, 'sr_max_far': float,
          'sr_max': float, 'sr_max_branch': str, 'w_k': float,
      }, ... ],
      'w_max': float | None,
      'utilisation': float | None, 'ok': True|False|None,
      'ok_reason': str | None,            # satt NÅR 'ok' er None, se §3.5
  } | None,
  'crack_reason': str | None,
}
```

`d_edge`, `layers_at_face`, `governing_edge`, `governing_edge_face_z` og
`edges` er nye i runde 12 og er RENT ADDITIVE — ingen eksisterende nøkkel er
fjernet eller har byttet betydning, slik at `results.js` og `report.js` leser
akkurat som før uten å endres. `eps_1`, `eps_2`, `eps_r` og `k2` står i hver
kant selv om de er snittstørrelser: en kantrad man må lese en annen rad for å
forstå, er ikke en etterprøvbar rad.

`h_c_eff_candidates`, `h_c_eff_governing`, `eps_equation`, `eps_floor` og
`eps_governing` er lovlige felter fra og med runde 10 FORDI §3.1 flyttet de to
størrelsene til vår egen kode. Så lenge pakkens `hc_eff`/`eps_sm_eps_cm` ble
kalt, kunne de ikke fylles uten å skrive pakkens formler en gang til, og da
hadde `h_c_eff` og `ε_sm − ε_cm` hatt to produsenter hver. Det er den
koblingen som gjør §3.1 og §4 forenlige — bryt den ene, og den andre blir gal.

`sls.checks`-nøkler (kun de som gjelder; resten i `not_applicable`):

| nøkkel | gjelder når | engelsk etikett (`results.js`) |
|---|---|---|
| `sigma_c_char_ok` | ≥1 characteristic-rad OG `sigma_c_char_required` er ikke `False` | `Concrete stress under characteristic load ≤ k·f_ck (EC2 7.2(2))` |
| `sigma_s_char_ok` | ≥1 characteristic-rad | `Reinforcement stress under characteristic load ≤ k·f_yk (EC2 7.2(5))` |
| `sigma_c_qp_ok` | ≥1 quasi-permanent-rad | `Concrete stress at first loading under quasi-permanent load ≤ k·f_ck — the condition for treating creep as linear (EC2 7.2(3))` |
| `crack_width_ok` | ≥1 quasi-permanent-rad som RISSER | `Crack width w_k ≤ w_max (EC2 7.3.4)` |

* `sigma_c_char_ok` er **`null`** med grunnen `no_exposure_class` når
  `sigma_c_char_required` er `None`, og går til `not_applicable` bare når den
  er `False` — altså når en klasse ER valgt og den ikke er i XD/XF/XS (§2.1).
  Etiketten sier «at first loading» for `sigma_c_qp_ok` fordi det er den
  spenningen den faktisk prøver (§1.4); ingen etikett skal antyde en annen.
* Rader som ikke risser teller ikke med i `crack_width_ok`. Risser INGEN av
  dem, går nøkkelen til `not_applicable` med grunnen — ikke til `null`.
* Mangler `w_max`, eller kunne én cracking-rad ikke regnes, er `crack_width_ok`
  **`null`** med grunn. Det er en ubesvart kontroll, ikke en bestått.
* Kunne `sigma_c_initial` ikke regnes for en quasi-permanent rad (§1.4), er
  `sigma_c_qp_ok` **`null`** med grunnen. Den krøpne spenningen skal ikke tre
  inn som erstatning — det var nettopp den feilen runde 10 rettet.
* `_three_valued_and` (`engine.py:1067`) gjenbrukes uendret på `sls['checks']`.

**Nye advarselskoder (maks tre):** `sls_incomplete` (speiler
`assessment_incomplete`: antall i `message`, grunnene i `detail`),
`sls_crack_width_exceeded`, `sls_stress_limit_exceeded`. Alle severity
`warning` — SLS er bruksgrense, ikke brudd. Ingen av dem siterer et tall som
ikke ble regnet.

**Payloadens `sls`-blokk** (bygges av `payload.js`, se §5):

```
payload.sls = {
  'phi_ef': float,                 # >= 0
  'exposure_class': str | None,
  'w_max': float | None,           # mm, ferdig oppslått ELLER overstyrt
  'w_max_source': 'class' | 'manual' | None,
  'w_max_reason': str | None,      # 'no_exposure_class' | 'no_crack_width_limit'
  'sigma_c_char_factor': float, 'sigma_c_qp_factor': float, 'sigma_s_char_factor': float,
  # TREVERDIG (§2.1). JS har eksponeringstabellen, ikke motoren — og JS er
  # derfor også det ene stedet som kan si «ingen klasse valgt» fra «valgt, men
  # utenfor XD/XF/XS». Motoren skal ALDRI utlede den av klassestrengen.
  'sigma_c_char_required': True | False | None,
}
```

**Motoren slår ALDRI opp en eksponeringsklasse.** JS eier tabellen, payloaden
bærer tall. Det er samme arbeidsdeling som `payload.js` allerede har for
geometri («payload.js gjør ALT, engine.py gjør INGENTING»), og det er den eneste
måten UI-et kan vise `w_max` live før en kjøring uten at tabellen finnes to steder.

---

## 5. Tilstanden, og hvilke dører som håndhever hva

Nytt toppnivåfelt i `defaultState()` (`store.js:90`):

```js
sls: {
  exposure_class: null,          // null = ikke valgt. Vi finner ALDRI på en klasse.
  w_max_override: null,          // mm. null = bruk den avledede.
  phi_ef: 2.0,                   // kryptall for tilnærmet permanent
  sigma_c_char_factor: 0.6,      // EC2 7.2(2)
  sigma_c_qp_factor: 0.45,       // EC2 7.2(3)
  sigma_s_char_factor: 0.8,      // EC2 7.2(5)
},
```

`phi_ef = 2,0` er en INNDATA med en fornuftig standard, på linje med `γ_c = 1,5`
og `α_cc = 0,85` — ikke en avledning. Den skal stå synlig i sammendragslinja og
i rapporten, merket som brukerens tall. Grunnen til at den ikke får en
kryp-kjede med RH, `t_0`, `t`, sementklasse og omkrets: fem inndata for å
fortelle brukeren noe hen ofte vet bedre selv, er akkurat den støyen
bestillingen ber oss unngå. Målt betydning: `φ_ef` fra 0 til 2 flytter `x` med
57 % på referansebjelken (127,20 → 200,36) og `w_k` med 6,8 %.

`exposure_class = null` som standard er BEVISST: uten en klasse finnes ingen
`w_max`, og `crack_width_ok` er `null` med en grunn som sier hva brukeren skal
gjøre. Å finne på 0,3 mm ville vært et tall ingen har valgt.

**Og det gjelder 7.2(2) like mye:** uten klasse er `sigma_c_char_required`
`null`, ikke `false`, og `sigma_c_char_ok` blir `null` — ikke «gjelder ikke»
(§2.1). Standardtilstanden skal svare «ubesvart» på begge kontrollene som
henger av klassen, ikke på den ene og «gjelder ikke» på den andre.

**`cloneState`** (`store.js:294`) må klone `sls` som egen gruppe, akkurat som
`spacing`. **`serialize.js:NESTED_GROUPS`** (linje 50) må få `'sls'`, ellers
faller en fil med et delvis `sls`-objekt tilbake til `undefined`-felt i stedet
for standardverdier — nøyaktig grunnen `shear` allerede står der.

**Ny dør: `enforceSlsParams(s)`**, ÉNVEIS, samme mønster som
`enforceComboTypes` (`store.js:398`):

* `exposure_class` som ikke er i `EXPOSURE_CLASSES` ⇒ `null`. Ikke en gjetning.
* `w_max_override` som ikke er et tall `> 0` ⇒ `null` (altså: bruk den avledede).
* `phi_ef` som ikke er et endelig tall `≥ 0` ⇒ `2.0`.
* de tre faktorene: ikke et endelig tall `> 0` ⇒ standardverdien.

Kalles fra NØYAKTIG de samme stedene `enforceComboTypes` kalles fra: i
`createStore` (linje 418), og i hver setter som kan skrive `sls` eller erstatte
hele staten (`setState`/`replaceState`, linje 759–813). Regelen gjelder
TILSTANDEN, ikke inngangen til den — det er begrunnelsen som allerede står over
`enforceAnalysis` (`store.js:335`).

`enforceActiveCombo` er UENDRET: M–κ og N–M er fortsatt ULS-figurer, og aktiv
rad skal fortsatt være en ULS-rad. Bare kommentaren over den må rettes.

---

## 6. UI

### 6.1 Inndata — én synlig kontroll

`index.html`, seksjon 1 Material:

* Rutenettet med `Concrete grade` / `Reinforcement grade` blir `sm:grid-cols-3`
  og får `<select id="i-exposure">` med etiketten **`Exposure class`**. Første
  valg er `Not selected`. Så de elleve klassene §11 lister, i den rekkefølgen,
  med BARE klassekoden som tekst — ingen beskrivelse av hva klassen dekker (§14).
  Nedtrekket bygges av `EXPOSURE_CLASSES`, aldri av en liste skrevet inn i
  `index.html`; ellers finnes klassesettet to steder.
* `#mat-derived` (linje 270) får en sjette celle: `w_max` i mm, med `md:grid-cols-6`.
  Det er nøyaktig det brukeren ba om: samme plass, samme mønster som `f_cd`/`f_yd`.
  Cella viser `–` når ingen klasse er valgt, og en liten markør når verdien er
  overstyrt manuelt. For en klasse med `w_max: null` (i dag bare XD3, §11) viser
  den også `–`, men med `title` som sier at EC2 ikke anbefaler noen grense for
  den klassen og at feltet under er veien inn. Det er forskjellen mellom «du har
  ikke valgt» og «det finnes ingen anbefalt verdi», og den skal være synlig.
* Ny `<details id="adv-sls">` rett under `#adv-material`, med
  `<span id="sls-summary">` som trykker VERDIENE sine (regel §2.6: en
  sammenfoldet boks må vise hva den skjuler):
  `Serviceability — w_max 0.30 mm (XC3) · φ_ef 2.00 · 0.60/0.45/0.80 · f_ck/f_yk`
  Innhold: `w_max` override [mm], `φ_ef`, og de tre faktorene, med
  punktreferansene som `title`.
* Én linje under boksen, vår egen ordlyd:
  `Limits follow the values recommended in EC2 7.3.1(5) and 7.2 where a recommended value
   exists. A national annex may set different ones, and some exposure classes have none —
   enter your own in the fields above.`
  Setningen må tåle XD3 (§11) og XF/XA (§8) uten å love en verdi for dem.
  Ingen setning i UI-et skal si eller antyde at modulen har en grense for hver
  klasse.

### 6.2 Resultatet — én egen seksjon, som forsvinner når den ikke har noe å si

I `renderResult()` (`ui.js:2171`), som et eget kort **nederst i venstre kolonne**,
etter lagtabellen og før advarslene. Høyrekolonnen røres ikke.

Seksjonen rendres når `result.sls` finnes — **også i `ok !== true`-grenen**
(`ui.js:2185`). Har brukeren bare SLS-rader, feiler ULS med
`no_uls_combination`, og det ville vært absurd å skjule en ferdig regnet
rissvidde bak den feilboksen.

**Synlig uten et eneste klikk, én linje per SLS-rad:**
`type · M_Ed · σ_c · σ_s · w_k · w_max · η` — eller `–` med grunnen i klartekst.
Under: SLS-kontrollene med samme hake/kryss/strek-mønster som
`checkRows`-blokka, og `not_applicable`-linjene i nedtonet tekst uten symbol.

**Bak ÉN `<details id="sls-derivation">`:** hele utledningen i §4, en blokk per
rad, med de tre grenvalgene uthevet. Bruk det eksisterende
DISCLOSURE-mønsteret (`ui.js:2789`, `DISCLOSURE_KEY`, dekket av
`tests/disclosure.test.mjs`) — ingen ny UI-maskineri trengs.

`#res-summary` får `· w_k 0.21/0.30 mm` bakerst når `sls` finnes. Uten `w_max`
blir det `· w_k 0.21 mm` — ingen skråstrek og ingen grense som ikke finnes.
Er ingen rissvidde regnet, står det ingenting. Ikke mer.

### 6.3 Setningene som blir usanne, og som MÅ rettes i samme runde

Står de igjen, motsier modulen seg selv. Alle er verifisert i dag:

| sted | i dag | skal bli |
|---|---|---|
| `report.js:1157` | «…crack width control (SLS) and EC2:2023, both outside this module's scope» | bare EC2:2023 er utenfor; 7.3.3 (den forenklede tabellmetoden) er det også, og den er den eneste som treffer `griddata` |
| `report.js:1167` | «Shear, cracking, deflection, … are not checked» | fjern `cracking`; behold nedbøyning, torsjon, forankring, brann. Men ikke erstatt den med en påstand om at riss er dekket i alle tilfeller: 7.3.2 minimumsarmering og rene strekksnitt er fortsatt utenfor (§8), og en rad kan svare `null`. Setningen skal si hva som ER gjort — 7.3.4 rissvidde på tilnærmet permanent last — ikke at riss er ferdig behandlet |
| `report.js:601` | «Serviceability checks are not implemented in this version.» | peker på SLS-kapittelet |
| `results.js:434` | `no_uls_combination`: «Serviceability checks are not implemented…» | «…no ULS row, so there is no resistance check. Any serviceability rows are still evaluated below.» |
| `engine.py:1678`, `engine.py:1688` | samme to påstander i motorens egne `message` | samme retting |
| `ui.js:1846` | `title` på typenedtrekket | «Only ULS rows are checked for resistance. Serviceability rows are evaluated in the serviceability section of the result.» |
| `ui.js:1865` | «Not checked — SLS is not implemented yet» | «Not checked for resistance — used in the serviceability section» |
| `store.js:376`, `rebar.js:513` | norske kommentarer som sier at SLS ikke er implementert | rettes |

---

## 7. Rapporten

Nytt **kapittel 6 · Serviceability**. Plot blir 7, «Assumptions and method» blir 8.
Kapittelet finnes ALLTID (ellers ville nummereringen hoppet eller vært betinget,
som er verre); uten SLS-rader er innholdet én linje:
`No serviceability combinations were given, so no serviceability check was carried out.`

Innhold når det finnes rader — minimalistisk, men ETTERPRØVBART. En kontrollør
skal kunne reprodusere hvert tall med blyant:

1. **Parameterblokk:** `φ_ef`, `E_cm`, `E_c,eff`, `n_sec` per radtype,
   `α_e (lign. 7.9, fra E_cm)`, `f_ct,eff`, `k_t` med begrunnelsen, `k1`, `k2`,
   `k3`, `k4`, de tre 7.2-faktorene, `w_max` med kilde (klasse, manuell, eller
   ingen — og da grunnen, §3.5).
2. **Én tabell per SLS-rad** med HELE kjeden i §3.2, i den rekkefølgen, og med
   de tre grenvalgene markert. Ukomprimert — det er her etterprøvbarheten bor,
   ikke på skjermen.
3. **Modellavsnitt**, vår egen ordlyd:
   * lineær-elastisk analyse av det opprissede snittet, betong uten strekk,
     transformert areal `n·A_s` på brutto rektangel (armering i trykksonen
     telles sammen med betongen den fortrenger — samme konvensjon som
     ULS-standarden `subtract_bar_area: false`);
   * **rissbeslutningen (§1.1):** snittet regnes som risset når
     strekkspenningen i det urissede TRANSFORMERTE snittet, med `E_cm`,
     overstiger `f_ct,eff`. Det er en annen konvensjon enn riss-momentet
     `M_cr` i kapittelet om kapasitet, som regner på brutto rektangel; på
     modulens egne tverrsnitt skiller de to lag i et bånd på 2,8–9,3 % over
     `M_cr`, der denne konvensjonen gir «urisset» der brutto ville gitt
     «risset». Tallet skal STÅ, med båndet for det snittet rapporten gjelder.
     De to skal aldri leses som samme størrelse.
   * **`σ_c` under tilnærmet permanent last står to ganger, og det er med
     vilje:** «at first loading» (uten kryp) er den 7.2(3) prøves på, fordi
     EC2 3.1.4 knytter ikke-lineært kryp til spenningen ved påføring;
     «long-term» (med `φ_ef`) er tilstanden resten av raden regnes på. To ulike
     fysiske størrelser, hver med sin etikett. Målt forskjell på
     referansebjelken: utnyttelse 0,765 mot 0,510. De skal aldri stå uten
     etikett, og aldri i samme kolonne;
   * SLS-`x` er en ANNEN `x` enn ULS-`x` (målt 20–32 % forskjell) og de to skal
     aldri stå i samme tabell uten etikett;
   * svinn inngår ikke: EC2 2004 7.3.4 har ingen svinnterm i lign. 7.8/7.9.
     Det er en BEGRUNNET utelatelse, ikke en mangel. Ikke lån termen fra
     MC2010 eller EN 1992-1-1:2023 inn i en 2004-beregning;
   * `w_k` er en beregnet kontrollverdi mot en grense, ikke en prediksjon av en
     rissvidde noen kan måle på veggen. Publiserte sammenlikninger mot måledata
     viser større spredning mellom modellene enn desimalene vi trykker.
4. **Kontrollene** med samme hake/kryss/strek som ULS-tabellen, og
   `not_applicable`-radene med grunn i stedet for symbol.

---

## 8. Utenfor omfang — og hvorfor

* **Nedbøyning (EC2 7.4).** Krever spennvidde, statisk system, K-faktor,
  lasthistorikk og ζ-fordelingskoeffisienten. Et tverrsnitt vet ingenting om
  dem. 2004-grenen i `structuralcodes` har ingen nedbøyningsfunksjon i det hele
  tatt. Eget arbeid, en annen runde.
* **EC2 7.3.2 minimumsarmering for rissbegrensning.** En ANNEN kontroll enn
  7.3.4, og den blandes ofte med den. Modulen har allerede et bøyeminimum etter
  9.2.1.1, og kommentaren i `section.js:150` sier riktig at `ec2_2004.As_min` er
  noe annet. Å legge til begge i samme runde inviterer til å blande dem.
* **EC2 7.3.3 (forenklet tabelloppslag).** Sperret av `griddata`, erstattet
  fullstendig av 7.3.4, og den mest gjengivelsesnære delen av kapittel 7. Både
  teknisk og opphavsrettslig er det rett å la den ligge.
* **Kombinasjonstypen `frequent`.** Modulen har tre typer. Et nasjonalt tillegg
  kan knytte de strengeste klassene til en ofte forekommende kombinasjon; vi
  leverer det anbefalte settet, der slakkarmert betong kontrolleres i den
  tilnærmet permanente. Blir `frequent` aktuelt, er det en fjerde type i
  `COMBO_TYPES`, i motorens whitelist (`engine.py:840`) og i typenedtrekket.
  Ikke nå.
* **Overdekningsavhengig `w_max` (`c_nom`/`c_min,dur`).** Et nasjonalt tillegg
  kan gjøre grensa avhengig av overdekningen. Vi har ikke verifisert den
  mekanismen mot kilden selv, og vi hardkoder ikke en tabell vi ikke har
  etterprøvd. Manuell override er veien inn til en annen verdi.
* **Snitt der HELE tverrsnittet står i strekk (`fully_in_tension`, §1.2).**
  NY OPPFØRING I RUNDE 10, og den er en bevisst utelatelse, ikke en glipp.
  Grunnen er ikke at tilstanden er vanskelig å regne — et fullt opprisset snitt
  i rent strekk er trivielt (`σ_s = N/ΣA_s` for ett lag, en lukket 2×2 for to).
  Grunnen er at EC2 7.3.2(3) behandler et element i rent strekk med en effektiv
  strekksone PER BETONGFLATE, ikke med den ene sammenhengende `A_c,eff` som
  hele kjeden i §3.2 er bygd rundt. Halvveis implementert — én `A_c,eff`, `x = 0`
  inn i `(h−x)/3` som da blir `h/3` — ville kjeden gitt et tall som ser riktig
  ut og ikke er det. Ett feil tall er verre enn en manglende funksjon.
  Kontrollen er derfor `null` med en grunn som sier hva som mangler. En egen
  strekkstavgren er en senere runde, og den må bygge `A_c,eff` per flate.
* **Eksponeringsklassene XF og XA.** Ikke dekket av grensesettet vi leverer.
  De tilbys derfor ikke i nedtrekket. Merk at EC2 knytter 7.2(2) til XD, XF OG
  XS — en bruker med XF-eksponering må sette `w_max` manuelt og får ikke den
  kontrollen i denne versjonen. Det skal stå i teksten under nedtrekket.
  Mekanismen for å ta dem inn finnes nå: en oppføring med `w_max: null` og
  `longitudinal_crack_check: true`, slik XD3 har (§11). Det er en verdiendring,
  ikke en kodeendring — men den gjøres ikke i denne runden, og ikke uten at
  noen har etterprøvd hvilke XF/XA-klasser 7.2(2) faktisk dekker.
* **`mode: 'spacing'` på en bjelke.** `layerArea` regner et `spacing`-lag PER
  METER med en hardkodet 1000, uansett `b` (`rebar.js:87`), og
  `parseShorthand`/`createLayer` slipper et slikt lag inn på en bjelke uten
  vakt (§3.4). Et areal per meter på et 300 mm bredt snitt er en
  modellinkonsistens som er ELDRE enn denne runden og som SLS ikke skal rette —
  men SLS skal heller ikke skjule den. Derfor inverterer §3.4 med den samme
  1000-konstanten foroverveien bruker: da beskriver `s` og `A_s` det samme
  armeringsbildet, og feilen blir stående synlig i stedet for å bli delvis
  bortregnet i rissviddekjeden. Å innføre en vakt mot kombinasjonen er en egen
  oppgave, i `rebar.js`, med sine egne tester.
* **Kryptall regnet av inndata (RH, `t_0`, `t`, sementklasse, omkrets).**
  `φ_ef` er ett tall brukeren oppgir. Se §5.
* **Skjevbøying, vegg støpt mot såle (7.3.4(5)), riss fra påført deformasjon,
  hudarmering, spennarmering, dekompresjon.** Ingen av dem kan besvares av et
  tverrsnitt alene, eller finnes ikke i modellen.
* **Vertikal jernfordeling i senteravstanden.** Med flere lag i `A_c,eff`
  brukes den største horisontale senteravstanden. Det skal stå i utledningen.

---

## 9. Akseptansekriterier med tall

Alle tall under er **regnet med `structuralcodes` 0.7.2 og pakkens egne
7.3.4-funksjoner**, på modulens egne fixturgeometrier. AC1–AC8 og AC10 ble
regnet i runde 9 og **reprodusert siffer for siffer i runde 10** med en
uavhengig implementasjon av §1.2/§1.3. `sigma_ct_uncracked`-linjene, AC6b og
AC11–AC14 er nye og regnet i runde 10. Sammenlikn med `rel_tol = 1e-6`
(`REL_TOL` i `tests/python/test_engine.py`).

Konstanter for C30/37: `f_ctm = 2,896468153817`, `E_cm = 32836,568031331`,
`α_e = 6,090770503457`, `E_c,eff(φ_ef = 2) = 10945,522677`, `n_sec = 18,272312`.

### AC1 — referansebjelken, tilnærmet permanent, uten kryp
300×600, C30, 3Ø20 i `z = −250` (`A_s = 942,477796`), `N = 0`,
`M_Ed = −100·10⁶ Nmm`, `φ_ef = 0`:

```
sigma_ct_uncracked = 5,085064 > f_ctm = 2,896468   =>  cracked = true
x = 127,201637   z_na = 172,798363   eps_a = 4,271536e−04   chi_y = −2,471977e−06
sigma_c = −10,325115 MPa     sigma_s = 209,029569 MPa       d = 550,0
sigma_c_initial = −10,325115 (identisk, fordi phi_ef = 0 — men den SKAL stå)
h_c_eff = 125,000000  [2.5(h-d)]   kandidater 125,000000 / 157,599454 / 300,0
A_c_eff = 37 500   A_s_eff = 942,477796   rho_p_eff = 0,025132741
k_t = 0,4   eps_equation = 7,793708e−04   eps_floor = 6,270887e−04   [equation]
eps_r = 0   k2 = 0,5   c = 40,0   phi_eq = 20,0   s = 100,0   terskel = 250,0  [close]
sr_max_close = 271,281702   sr_max_far = 614,637872   sr_max = 271,281702
w_k = 0,211429 mm
```

### AC2 — samme rad, `φ_ef = 2,0` (kryp flytter x, ikke α_e)

```
Ec_used = 10945,522677   n_sec = 18,272312   alpha_e = 6,090770503  (UENDRET)
sigma_ct_uncracked = 5,085064  (UENDRET fra AC1 — kriteriet er E_cm-fast, §1.1)
x = 200,355056   sigma_c = −6,886016   sigma_s = 219,577827
h_c_eff = 125,0 [2.5(h-d)]  ((h−x)/3 = 133,214981)
eps_sm_eps_cm = 8,321121e−04 [equation]   sr_max = 271,281702   w_k = 0,225737 mm

sigma_c_initial = −10,325115          (E_cm-evalueringen, = AC1s sigma_c)
sigma_c_qp_limit = 0,45·30 = 13,5
sigma_c_util = 0,764823   <-- 7.2(3) prøves på DENNE
(den krøpne ville gitt 6,886016/13,5 = 0,510075 — 25 prosentpoeng lavere)
sigma_c_checked = 'initial'
```

Denne raden låser TO feller som begge skjuler seg selv:
* `alpha_e` skal være 6,090770503 i BÅDE AC1 og AC2. Brukes `E_c,eff` i lign.
  7.9, blir `w_k` lavere enn uten kryp i det hele tatt, og de to feilene
  opphever hverandre.
* `sigma_c_util` skal være 0,764823, ikke 0,510075. Regnes 7.2(3) på den
  krøpne spenningen, ser kontrollen ut som en kontroll og er det ikke.
  Testen må sammenlikne mot 0,764823 EKSPLISITT — en test som bare sjekker
  «`sigma_c_ok` er `true`» ville passert på begge tallene.

### AC3 — referansebjelken, karakteristisk, `M_Ed = −120·10⁶`

```
sigma_ct_uncracked = 6,102077 > f_ctm  =>  cracked = true
x = 127,201637   sigma_c = −12,390138 MPa   sigma_s = 250,835483 MPa
sigma_c_limit = 0,6·30 = 18,0   util = 0,688341   sigma_c_checked = 'state'
sigma_s_limit = 0,8·500 = 400,0 util = 0,627089
sigma_c_initial = null   (characteristic-rad: E_c ER E_cm, ingen egen evaluering)
crack = null, crack_reason = 'not_quasi_permanent'
```

De tre eksponeringstilfellene skal alle ligge som tester (§2.1):

| `exposure_class` | `sigma_c_char_required` | `sigma_c_char_ok` |
|---|---|---|
| `'XD1'` | `true` | i `sls.checks`, `true` |
| `'XC3'` | `false` | IKKE i `sls.checks`; står i `not_applicable` |
| `null` | `null` | i `sls.checks` som **`null`**, grunn `no_exposure_class` |

Den tredje raden er den runde 10 rettet. Den skal ikke kunne falle tilbake til
`not_applicable` uten at en test ser det.

### AC4 — platefixturen, tilnærmet permanent
1000×200, strip `height = 12`, `A_s = 1000,861376`, `z = −69`, `M_Ed = −30·10⁶`,
`φ_ef = 0`. **Låser stripe-inversjonen og `(h−x)/3`-grenen:**

```
phi (fra strip.height) = 12,0      s (invertert, 1000-formelen) = 113,000000
sigma_ct_uncracked = 4,229476 > f_ctm  =>  cracked = true
x = 39,703712   sigma_c = −9,701727   sigma_s = 192,431537   d = 169,0
h_c_eff = 53,432096  [(h-x)/3]   kandidater 77,5 / 53,432096 / 100,0
A_c_eff = 53 432,096074   rho_p_eff = 0,018731464
eps = 6,176119e−04 [equation]  (floor 5,772946e−04)
c = 25,0   terskel = 155,0   s = 113,0  [close]
sr_max_close = 193,907666   sr_max_far = 208,385175   w_k = 0,119760 mm
```

**Merk at AC4 IKKE kan skille de to inversjonsformlene** — platefixturen har
`b = 1000`, så `b`-formelen og 1000-formelen gir begge 113,000000. Verifisert.
Det er AC11 som låser den.

### AC5 — GULVET i lign. 7.9 styrer
Plate 1000×200, Ø12 c/c 200 (`A_s = 565,486678`, `z = −59`, `c = 35`),
`M_Ed = −22·10⁶`, `φ_ef = 0`:

```
sigma_ct_uncracked = 3,210281 > f_ctm  =>  cracked = true
x = 29,829377   sigma_s = 261,004679   h_c_eff = 56,723541 [(h-x)/3]
rho_p_eff = 0,009969171
eps_equation = 6,886549e−04   eps_floor = 7,830140e−04   ->  [floor]
terskel = 205,0 > s = 200  ->  [close]
sr_max_close = 323,630857   sr_max_far = 221,221810      (NB: nær > fjern)
w_k = 0,253408 mm
```

### AC6 — URISSET: rissvidde er `null`, ikke 0
Platefixturen, `M_Ed = −15·10⁶`:

```
sigma_ct_uncracked = 2,114738 <= f_ctm = 2,896468   =>  cracked = false
crack = null   crack_reason = 'uncracked'
eps_a = −1,341775e−06   chi_y = −6,574369e−07
sigma_c (trykkant) = −2,202857   sigma_c (strekkant) = +2,114738   sigma_s = 8,804275
```

7.2-kontrollene skal likevel svare, på den urissede tilstanden.

**Raden skal IKKE bære noen `M_cr`, og testen skal påstå det** (§1.1).
Til orientering om hvorfor: brutto `M_cr` er 19 309 787,69 Nmm her, altså
`|M|/M_cr = 0,7768`, mens `σ_ct/f_ctm = 0,7301`. To forholdstall, to svar på
«hvor nær risset er snittet», i samme rad. Bare det ene trykkes.

### AC6b — BÅNDET der de to konvensjonene er uenige
Referansebjelken, `N = 0`, `M_Ed = −54 743 248,11 Nmm` (= `1,05·M_cr,brutto`):

```
sigma_ct_uncracked = 2,783729 <= f_ctm = 2,896468   =>  cracked = false
crack = null   crack_reason = 'uncracked'
```

Brutto `M_cr` ville gitt `cracked = true` og `sigma_s = 114,429576`,
`w_k ≈ 0,1 mm`. Testen låser at vi svarer `uncracked` her — og den er grunnen
til at valget i §1.1 ikke kan reverseres i god tro uten at noen ser det.
Grensa for bjelken ligger på `|M| = 1,092524·M_cr,brutto`.

### AC7 — FJERNGRENEN og gulvet samtidig
Plate 1000×200, Ø16 c/c 300 (`A_s = 670,206433`, `z = −57`, `c = 35`),
`M_Ed = −25·10⁶`:

```
sigma_ct_uncracked = 3,636351 > f_ctm  =>  cracked = true
x = 31,951722   sigma_s = 254,882720   h_c_eff = 56,016093 [(h-x)/3]
rho_p_eff = 0,011964534   eps = 7,646482e−04 [floor]  (equation 7,549545e−04)
terskel = 215,0 < s = 300  ->  [far]
sr_max_close = 346,338570   sr_max_far = 218,462761   sr_max = 218,462761
w_k = 0,167047 mm
```

### AC8 — ingen gyldig tilstand

**AC8a.** Referansebjelken, `N = +800·10³ N`, `M_Ed = −100·10⁶`:

```
urisset transformert (E_cm): sigma_c,OK = −0,715898   sigma_c,UK = +9,077837
sigma_ct_uncracked = 9,077837 > f_ctm   =>  cracked = true
R skifter ikke fortegn  =>  state = null
IKKE begge kanter i strekk  =>  state_reason = 'no_equilibrium_cracked'
stress = null   sigma_c_initial = null   crack = null
```

**Testen skal påstå grunnkoden EKSPLISITT, og at den ikke er
`fully_in_tension`.** Dette er raden som avslørte at den gamle koden
`no_compression_zone` («rent strekk, x utenfor snittet») var faktuelt feil:
snittet HAR en trykksone (−0,716 MPa på OK), og det står ikke i rent strekk.

**AC8b.** Referansebjelken, `M_Ed = +100·10⁶` (støttemoment, ingen toppjern):

```
sigma_ct_uncracked = 5,353916 (OK-kanten) > f_ctm   =>  cracked = true
løseren FINNER en rot: x = 28,610536
men sigma_s = 2622,220056 MPa og sigma_c = −575,868076 MPa
=>  vakten slår inn, state_reason = 'stresses_outside_elastic_range'
```

**Denne testen er den viktigste i settet:** uten vakten er dette et stille feil
tall.

### AC9 — regresjon
Alle committede fixturer uten `sls`-blokk gir `result` UTEN `sls`-nøkkel, og
`result.checks` bit for bit uendret. De 575 JS-testene og 99 python-testene skal
være grønne uten at en eneste forventning endres, bortsett fra dem som låser de
åtte tekstene i §6.3.

### AC10 — treverdighet
* Kun `characteristic`-rader, klasse **XC3** ⇒ `sls.checks` har bare
  `sigma_s_char_ok`; `sigma_c_char_ok` og `crack_width_ok` står i
  `not_applicable`; `sls.all_ok` er `true`/`false`, ikke `null`.
  (Klassen MÅ være satt for at dette skal gjelde — se neste punkt.)
* Kun `characteristic`-rader, **ingen eksponeringsklasse** ⇒ `sigma_c_char_ok`
  er **`null`** i `sls.checks` med grunnen `no_exposure_class`, IKKE i
  `not_applicable`; `sls.all_ok = null`. Dette er speilbildet av punktet under,
  og de to skal svare likt på det samme fraværet.
* Quasi-permanent-rad uten eksponeringsklasse ⇒ `w_k` regnet, `crack` er et
  FYLT objekt, `crack.w_max = null`, `crack.utilisation = null`,
  `crack.ok = null` med `ok_reason = 'no_exposure_class'`,
  `crack_width_ok = null`, `sls.all_ok = null`.
* Alle quasi-permanent-rader urisset ⇒ `crack_width_ok` i `not_applicable`,
  ikke `null`.
* Quasi-permanent-rad der `sigma_c_initial` ikke kunne regnes mens radens egen
  tilstand står ⇒ `sigma_c_qp_ok = null` med grunn, og `stress['sigma_c']` er
  `null` — ikke den krøpne verdien.
### AC11 — STRIPE-INVERSJONEN, på en BJELKE (den eneste testen som kan se feilen)
Bjelke 300×600 med et `mode: 'spacing'`-lag, «Ø12 c/c 200». Det er nåbart:
`parseShorthand` gir `mode: 'spacing'` uansett tverrsnittstype, og `createLayer`
lar `...patch` overstyre `mode: 'bars'`.

```
layerArea  = (1000/200)·π·12²/4 = 565,486677646     (1000 er hardkodet, rebar.js:87)
strip.height = 12,0    strip.width = 47,123889804
s (1000-formelen, RIKTIG) = 200,000000
s (b-formelen,    GALT)   =  60,000000
```

Testen låser `bar_spacing == 200,0`. Med `b` i formelen gir den 60,0.
Samme test på platefixturen gir 113,0 med BEGGE formlene og ser ingenting —
det er hele grunnen til at denne ligger på en bjelke.

Grenvalget: med «Ø16 c/c 300» på samme bjelke er `A_s = 670,206433`, riktig
`s = 300,0` mot gal `s = 90,0`, og terskelen `5(35+8) = 215`. De to formlene
velger da HVER SIN gren, og AC7 måler forskjellen mellom grenene til
`s_r,max` 346,34 mot 218,46. Legg også denne som test.

### AC12 — ETT JERN I LAGET: ingen senteravstand, ingen påfunnet gren
Bjelke 300×600, **1Ø20** i `z = −250` (`A_s = 314,159265`), `N = 0`,
`M_Ed = −60·10⁶`, `φ_ef = 0`:

```
sigma_ct_uncracked = 3,233262 > f_ctm   =>  cracked = true
x = 77,626200   sigma_c = −9,831440   sigma_s = 364,390322   (< f_yk, vakten slår IKKE inn)
bars = [{y: 0, z: −250, dia: 20}]   ->  ingen nabojern, ingen s
crack = null   crack_reason = 'no_bar_spacing'
```

Tilstanden er altså helt i orden, og 7.2-kontrollene skal svare. Det er BARE
rissvidden som er ubesvart. En implementering som defaulter `s = 0` velger
`close`, en som defaulter `s = ∞` velger `far`; testen skal påstå `null`, ikke
et tall fra noen av dem.

### AC13 — HELE SNITTET I STREKK: `fully_in_tension`, ikke `no_equilibrium_cracked`
Bjelke 300×600 med 3Ø20 i BÅDE `z = −250` og `z = +250`, `N = +1000·10³ N`,
`M_Ed = 0`:

```
urisset transformert (E_cm): sigma_c,OK = +5,222455   sigma_c,UK = +5,222455
sigma_ct_uncracked = 5,222455 > f_ctm   =>  cracked = true
R skifter ikke fortegn, og BEGGE kanter er i strekk
=>  state = null, state_reason = 'fully_in_tension'
```

Paret AC8a/AC13 er det som låser at de to grunnkodene ikke kollapser til én
igjen. De skiller seg bare på fortegnet til `sigma_c,OK`, og det er nettopp
derfor de må testes sammen.

### AC14 — EN KLASSE UTEN ANBEFALT GRENSE
Referansebjelken som AC1, men `exposure_class = 'XD3'`, ingen override:

```
w_max = null   w_max_source = null   w_max_reason = 'no_crack_width_limit'
sigma_c_char_required = true          (XD3 er i XD-familien, EC2 7.2(2))
crack er et FYLT objekt: w_k = 0,211429 står der
crack.w_max = null   crack.utilisation = null   crack.ok = null
crack.ok_reason = 'no_crack_width_limit'
crack_reason = null                   <-- crack er IKKE null
sls.checks['crack_width_ok'] = null
```

Testen må påstå `crack is not None` og `crack['w_k'] == 0,211429…`. En
implementering som leser den gamle §3.5-tabellen bokstavelig setter
`crack = None` og kaster en ferdig regnet rissvidde. Med
`w_max_override = 0.25` skal samme rad gi `w_max_source = 'manual'`,
`utilisation = 0,845716` (= 0,2114290340/0,25) og `ok = false`.

---

## 10. Arbeidsdeling — tre Sonnet-agenter, SEKVENSIELT

De deler filer. Ingen av dem rører `tests/fixtures/*.json`. Hver avslutter med
begge testkommandoene grønne:

```
cd C:\Python\structural_tools-csc && npm run test:concrete-section
cd C:\Python\structural_tools-csc && python -m pytest concrete_section_calculator/tests/python -q
```

### A1 — MOTOREN
**Eier:** `python/engine.py`, `tests/python/test_engine.py` (eller en ny
`tests/python/test_sls.py`).
**Leverer:** §1 (begge løsere + de tre vaktene), §2, §3, kontrakten i §4, de tre
advarselskodene, og rettingen av de to `message`-strengene `engine.py:1678`/`1688`.
Payloadens `sls`-blokk finnes ennå ikke i UI-et — A1 bygger den i testene.
**Krav:** mangler `payload['sls']`, skal `result` være bit for bit som i dag.
`result.checks` røres ikke. **AC1–AC8, AC6b og AC10–AC13 skal ligge som
tester**, sammen med orakel-testene mot `cc.hc_eff` og `cc.eps_sm_eps_cm`
(§3.1). AC11 og AC12 bygger payloader i kode — `bars`-lista og et
`kind: 'strip'`-lag på et 300 mm bredt snitt finnes ikke i noen fixtur, og
fixturene skal ikke røres. AC14 deles med A2 (motorsiden: `crack` fylt med
`ok = null`).

### A2 — TILSTAND, TABELL OG PAYLOAD
**Eier:** `js/store.js`, `js/materials.js`, `js/serialize.js`, `js/payload.js`,
`js/rebar.js` (bare kommentaren linje 513), `index.html` (kontrollene i §6.1),
og testene `store.test.mjs`, `materials.test.mjs`, `payload.test.mjs`,
`serialize.test.mjs`.
**Leverer:** `state.sls` (§5), `enforceSlsParams` med tester per dør (følg
mønsteret i `store.test.mjs:756` for «hver av dørene»), `EXPOSURE_CLASSES` og
`slsLimits(state)` i `materials.js` (§11), `'sls'` i `NESTED_GROUPS`,
`payload.sls` (§4), og selve kontrollene i `index.html`.
**Krav:** eksponeringstabellen finnes ETT sted, i `materials.js`, og
nedtrekket bygges av den. Payloaden bærer TALL, aldri en klassestreng motoren
skal slå opp. `sigma_c_char_required` er TREVERDIG (§2.1) — `null` når ingen
klasse er valgt. `w_max: null` for en valgt klasse (XD3) og `w_max: null` for
«ingen klasse valgt» må komme ut med HVER SIN `w_max_reason`; AC14 låser det.

### A3 — PRESENTASJON
**Eier:** `js/results.js`, `js/ui.js`, `js/report.js`, og testene
`results.test.mjs`, `report.test.mjs`, `ui.test.mjs`, `disclosure.test.mjs`.
**Leverer:** SLS-seksjonen i resultatet (§6.2) inkludert i `ok !== true`-grenen,
`<details id="sls-derivation">` på det eksisterende DISCLOSURE-mønsteret,
`SLS_CHECK_ORDER`/`SLS_CHECK_LABELS`/`SLS_REASON_TEXT` og en uttømmende test på
at hver grunnkode har tekst, rapportens kapittel 6 med renummerering av 7 og 8,
og ALLE de gjenstående tekstrettingene i §6.3.
**Krav:** `checkRows` (som gjør en manglende nøkkel til `null`) skal IKKE brukes
på `sls.checks` — den ville vist `not_applicable`-nøkler som ubesvarte. SLS
trenger sin egen radbygger som bare emitterer nøkler som faktisk finnes, pluss
`not_applicable`-linjene uten symbol.

---

## 11. Eksponeringsklassene og `w_max` — vår egen parameterliste

Ligger i `materials.js`, ved siden av `CONCRETE_GRADES`, i nøyaktig samme form.
Dette er en PARAMETERLISTE med våre etiketter og en punktreferanse, ikke en
gjengitt tabell: ingen kolonneoverskrifter, fotnoter eller merknader fra
standarden, og ikke standardens oppsett.

```js
/**
 * Rissviddegrense per eksponeringsklasse [mm], for slakkarmert betong under
 * tilnærmet permanent last, med den verdien EC2 7.3.1(5) anbefaler DER den
 * anbefaler en. Verdiene er nasjonalt bestemte — et nasjonalt tillegg kan
 * sette andre, og da er `w_max_override` veien inn.
 *
 * `w_max: null` betyr at EC2 IKKE anbefaler noen verdi for den klassen. Da
 * finner vi ikke på en. Kontrollen blir ubesvart (`null`) med grunnen
 * `no_crack_width_limit`, og brukeren legger inn sin egen.
 *
 * `appearance_only` merker klassene der grensa er begrunnet i UTSEENDE og ikke
 * i bestandighet. `longitudinal_crack_check` merker klassene der EC2 7.2(2)
 * krever kontroll av betongtrykkspenningen under karakteristisk last.
 *
 * Lista bærer BARE klassekoden. Ingen forklarende tekst om hva hver klasse
 * dekker — den teksten er standardens egen, og den gjengir vi ikke. Se §14.
 */
export const EXPOSURE_CLASSES = Object.freeze([
  { value: 'X0',  w_max: 0.40, appearance_only: true,  longitudinal_crack_check: false },
  { value: 'XC1', w_max: 0.40, appearance_only: true,  longitudinal_crack_check: false },
  { value: 'XC2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XC3', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XC4', w_max: 0.30, appearance_only: false, longitudinal_crack_check: false },
  { value: 'XD1', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XD2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  // EC2 anbefaler INGEN rissviddegrense for XD3. Se avsnittet under.
  { value: 'XD3', w_max: null, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS1', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS2', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
  { value: 'XS3', w_max: 0.30, appearance_only: false, longitudinal_crack_check: true  },
]);
```

### XD3 — RETTET I RUNDE 10, og det var både et feil tall og en feil attribusjon

Forrige utkast ga XD3 `w_max: 0,30` under en docstring som sa at verdiene er de
EC2 7.3.1(5) anbefaler. **EC2 anbefaler ingen verdi for XD3 for slakkarmert
betong.** Radene i det anbefalte settet er X0/XC1, XC2–XC4 og
XD1/XD2/XS1/XS2/XS3; XD3 er ikke blant dem. Verifisert uavhengig i denne økten:
pakkens `w_max` har `Literal['X0','XC1','XC2','XC3','XC4','XD1','XD2','XS1',
'XS2','XS3']` og svarer `ValueError: XD3 is not a valid value for
exposure_class` — pakkens sett er nøyaktig standardens.

Forrige utkast leste den manglende XD3 som en MANGEL VED PAKKEN (§3.1 sa
«kjenner ikke XD3/XF/XA/XSA»). Det var feil: det er standardens egen
avgrensning, ikke pakkens. Og konsekvensen var verre enn et feil tall — vi
tilla CEN en anbefaling de ikke har gitt, i nøyaktig den tabellen vi bevisst
ikke har gjengitt. Det er den ene attribusjonsfeilen §14 er skrevet for å
hindre.

**Hvorfor XD3 likevel BLIR STÅENDE i nedtrekket, med `w_max: null`** — i stedet
for å fjernes:

* XD3 er en ekte eksponeringsklasse, og den er i XD-familien som EC2 7.2(2)
  gjelder for. Med `longitudinal_crack_check: true` får brukeren den kontrollen.
* Fjernet vi den, ville en bruker med XD3-eksponering valgt «XD2» fordi det er
  det nærmeste i lista, og fått 0,30 mm uten å vite at hen selv gjettet. En
  stille feil-selektering er verre enn en synlig ubesvart grense.
* `w_max: null` treffer en vei som allerede finnes og allerede er testet:
  `crack.ok = null` med grunnen `no_crack_width_limit` (§3.5), og
  `crack_width_ok = null`. Tre-verdigheten gjør jobben; ingen ny maskineri.

Alternativet gjennomgangen også åpnet for — ta med 0,30 og merke den som VÅR
ekstrapolasjon — er forkastet. Vi har ikke etterprøvd noen kilde for den
verdien, og doktrinen sier at et tall vi ikke kan stå inne for ikke skal
trykkes, uansett hvor godt det er merket.

`slsLimits(state)` gir `{ w_max, w_max_source, w_max_reason,
sigma_c_char_limit, sigma_c_qp_limit, sigma_s_char_limit,
sigma_c_char_required }`. Override vinner over klassen — også over en klasse
med `w_max: null`. Uten klasse: `w_max: null`, `w_max_source: null`,
`w_max_reason: 'no_exposure_class'`, `sigma_c_char_required: null`. Klasse med
`w_max: null` og ingen override: `w_max: null`, `w_max_source: null`,
`w_max_reason: 'no_crack_width_limit'`, `sigma_c_char_required: true`.

---

## 12. Feller som er MÅLT, og som skal fanges i vår innpakning

1. `ec2_2004.Ecm()` tar `f_cm`, ikke `f_ck` (32 836,57 mot 30 588,56 — 6,8 % feil).
   Bruk `conc.Ecm`.
2. `cc.eps_sm_eps_cm` avviser `k_t` som ikke er eksakt 0,6 eller 0,4, og avviser
   negativ `σ_s`. Send absoluttverdien av en STREKKspenning.
3. `cc.k2(eps_r)` krever `eps_r ∈ [0, 1]`. Vår `ε_r` er klemt der per
   konstruksjon. Hardkod likevel ikke 0,5.
4. `cc.sr_max_far(h, x)` kaster for `x > h`, og det gjør vår egen `h_c,eff`
   også (samme grense, §3.1). Vakten i §1.2 fanger det først.
5. `cc.k(h)` returnerer `numpy.float64`, ikke `float`. Vi kaller den ikke, men
   ALT som skal ut i JSON må gjennom `_num` (`engine.py:102`) uansett.
6. `cc.sr_max_theta` tar vinkel i RADIANER. Vi kaller den ikke.
7. `state.cover` er overdekning til BØYLA. `c` i lign. 7.11 er til
   lengdejernet. Utled `c = d_c − φ/2` ÉTT sted, i motoren (§3.4). Regn aldri
   `cover + bøylediameter` på nytt noe annet sted — det blir den andre kilden.
8. `w_max` fra pakken er ødelagt for XD/XS med `'f'`, og kjenner ikke våre
   kombinasjonstyper. Kall den aldri.
9. `get_point_stress` uten `group_label` gir betongens spenning i jernets punkt
   = 0, uten å feile. Den enkleste av to kilder er den som lyver. Bruk aldri.
10. `M_cr` i `section_props` er GOVERNING-radens (`engine.py:1648`-blokka) og
    er `None` når den raden ligger utenfor `[n_min, n_max]`. **SLS har ingen
    `M_cr` i det hele tatt** (§1.1, rettet i runde 10): rissbeslutningen er
    `σ_ct > f_ct,eff` på det urissede transformerte snittet. Ikke legg en
    `M_cr` inn i `sls.rows[i]` «for ordens skyld» — det gjenoppretter nøyaktig
    de to konkurrerende forholdstallene runde 10 fjernet.
11. **Inversjonen av `layerArea` bruker 1000, ikke `b`** (§3.4). Konstanten i
    foroverveien er hardkodet (`rebar.js:87`), og `mode: 'spacing'` er nåbart
    på en bjelke. Målt: `b`-formelen gir 60 mm der sannheten er 200 mm, og det
    bytter gren i `s_r,max`. En test på platefixturen kan ikke se det.
12. **Et lag med ETT jern har ingen senteravstand** (§3.4). `barPositions`
    returnerer `[{y: 0, …}]` for `n = 1`. Verken 0 eller ∞ er en trygg default:
    grenene er ikke ordnet (AC5: `close` 323,63 mot `far` 221,22).
13. **7.2(3) leser `sigma_c_initial`, ikke den krøpne spenningen** (§1.4).
    Målt: utnyttelse 0,765 mot 0,510 på samme rad. En «forenkling» som gjenbruker
    radens egen `σ_c` her gjør kontrollen systematisk usikker, og den ser
    fortsatt ut som en kontroll.
14. **Vi arver ikke pakkens inngangsvakter for `h_c,eff` og `ε_sm − ε_cm`**
    lenger (§3.1). De to nåbare tilfellene er `x` utenfor `(0, h]` og
    `σ_s ≤ 0`, og begge har en grunnkode. Resten er `assert`.

---

## 13. Hva jeg ikke tok forskningens ord for

Doktrinen sier: ikke stol blindt. Dette er rettet:

* **«Rissvidde kan ikke besvares for et utsmurt stripelag.»** Feil. `φ` og `s`
  er eksakt gjenvinnbare fra `strip.height` og `area` (§3.4), verifisert mot
  platefixturen: `φ = 12`, `s = 113,0`. Ingen nye payload-felt, ingen `null`.
  (Selve formelen bommet på konstanten i runde 9 — den skal ha 1000, ikke `b`.
  Rettet i runde 10, se §3.4 og AC11. Konklusjonen står; utregningen gjorde det
  ikke, og det er verdt å merke seg at et riktig PRINSIPP kan bære en gal
  formel helt fram til en test som ikke kan se den.)
* **«Bygg SLS på en parallell `UserDefined`-seksjon.»** Avvist. Vår egen løser
  gir de SAMME tallene til alle rapporterte siffer, også med aksialkraft (§1.2),
  uten Newton-iterasjon, uten en andre seksjon og uten fire målte sviktformer.
* **«Fjerngrenen for `s_r,max` er den konservative.»** Feil som generell regel.
  Målt i AC5: nær 323,63 mot fjern 221,22. Ikke bruk «konservativ» som
  begrunnelse for grenvalget noe sted.
* **«Norsk NA gir `0,30·k_c` med `k_c = c_nom/c_min,dur`, og flytter XD3/XS3 til
  ofte forekommende.»** Ikke verifisert mot kilden i denne økten. Vi hardkoder
  ingen uverifisert tabell. Vi leverer det anbefalte settet, sier i klartekst at
  et nasjonalt tillegg kan avvike, og gir en manuell override. `frequent` og
  overdekningsavhengigheten står under §8.
* **«NDP-ene for 7.2 er `default EN` i Norge.»** Hvilte på én kilde. Derfor er
  alle tre faktorene overstyrbare felt med den anbefalte verdien som standard —
  en senere retting blir en verdiendring, ikke en kodeendring.
* **`k_t` som brukerinndata.** Droppet. Rissvidde regnes bare på tilnærmet
  permanent kombinasjon, som per definisjon er langtidslasten. `k_t = 0,4`
  utledes av radtypen og står i rapporten med begrunnelsen. Ett felt mindre.
* **`c_nom`/`c_min,dur` som inndata.** Droppet med NA-tabellen.
* **To spenningstilstander per tilnærmet permanent rad** (korttid til 7.2(3),
  langtid til 7.3.4). **Denne avvisningen var min egen feil, og den er
  OMGJORT i runde 10.** Begrunnelsen «det ville vært to `σ_s` for én last»
  blandet to ting: øyeblikkelig og langtids BETONGTRYKKSPENNING er to ulike
  fysiske størrelser, ikke to kilder til samme tall — like lite som `alpha_e`
  og `n_sec` er det. Slik utkastet sto, ble 7.2(3) prøvd på den krøpne
  spenningen og var systematisk på usikker side: målt utnyttelse 0,510 der
  0,765 er tallet kriteriet gjelder. Løsningen er smalere enn det jeg avviste:
  det er ikke to tilstander som rapporteres, men ÉN ekstra navngitt størrelse,
  `sigma_c_initial`, og ingen `σ_s` kommer fra den evalueringen. Se §1.4.

---

## 14. Opphavsrett — hva jeg gjorde, og hva agentene skal gjøre

Alt i dette dokumentet er formulert av meg. Ingen prosa, definisjon, merknad,
tabelloverskrift eller tabelloppsett fra EC2, fra et nasjonalt tillegg, fra
`structuralcodes`' docstrings eller fra noe annet verktøy er båret inn — heller
ikke omskrevet tett. Ligningsnumrene er referanser, ikke sitater. Alle tall i
§9 er MÅLTE utdata fra kjøringer i denne økten, ikke avskrift av en tabell.
Tabell 7.2N og 7.3N er bevisst ikke hentet ut, og skal ikke implementeres.

For agentene:

* Grenseverdier legges inn som navngitte parametere med VÅRE etiketter og et
  punktnummer. Ingen tabell som ser ut som standardens tabell.
* All brukervendt tekst skrives fra bunnen av, på engelsk, av oss. Ingen setning
  limes inn fra standarden, fra pakkens docstrings eller fra et annet verktøy —
  heller ikke inn i en norsk kommentar. Pakkens docstrings siterer standarden
  tett flere steder; når du forklarer HVORFOR, skriv din egen forklaring.
* Ingen skjermbilder, ikoner, fonter eller andre filer fra noen ekstern kilde.
* Ingen skjermutforming, ordlyd eller tallformat kopiert fra et annet verktøy.
  Å se hva som er vanlig praksis er lov; å gjenbruke noens konkrete utforming
  er det ikke.
* **Ikke skriv inn beskrivelser av eksponeringsklassene.** Nedtrekket og
  rapporten viser BARE klassekoden (`XC3`), aldri en forklaring av hva klassen
  dekker. De forklaringene er standardens egen prosa, og en hjelpsom
  «XC3 — moderate humidity» i en `option`-tekst eller en `title` er nettopp den
  ordrette gjengivelsen §0.5 forbyr. Trenger brukeren å vite hva klassene
  betyr, slår hen opp i standarden — vi er ikke dens erstatning.
* **Ikke tillegg standarden en verdi den ikke har gitt.** Mangler en klasse en
  anbefalt grense, er svaret `null` og en ubesvart kontroll. Se XD3 i §11: en
  påfunnet verdi under overskriften «de EC2 anbefaler» er både et feil tall og
  en falsk attribusjon, og den siste er den alvorligste av de to.
* Er du i tvil om noe ligger for nær en kilde: SKRIV DET OM, og si fra i
  sluttrapporten din at du gjorde det.

---

## 15. Runde 10 — hva gjennomgangen rettet, og hva som ble stående

En kritisk gjennomgang gikk over runde 9 og regnet alle tallene på nytt.
**Specens eksisterende tall holdt:** AC1–AC8 er reprodusert siffer for siffer
med en uavhengig implementasjon av §1.2/§1.3 (bl.a. `x = 127,201637062`,
`w_k = 0,2114290340`, AC5 `close 323,6308574` mot `far 221,2218100`, AC8b
`σ_s = 2622,2200559`), og det samme er §1.4-målingene og `E_cm = 32836,57` mot
den gale 30588,56. Signaturene, `griddata` på linje 499/507 inne i `As_min_2`,
`xi1` som kaster for `phi_p = 0`, og `w_max('XD1','f')`-meldingen er verifisert
på nytt i denne økten.

**Rettet (alvorlig):**

| # | hva | hvor |
|---|---|---|
| 1 | 7.2(3) regnet på den KRØPNE spenningen, systematisk på usikker side (0,510 mot 0,765). Ny `sigma_c_initial` fra en andre evaluering med `E_cm`; §13-avvisningen omgjort | §1.4, §1.5, §2.1, §2.2, §4, AC2 |
| 2 | XD3 hadde `w_max: 0,30` under «de verdiene EC2 anbefaler» — EC2 anbefaler ingen for XD3. Nå `w_max: null`, klassen blir stående, kontrollen blir ubesvart | §11, §3.1, §6.1, §14, AC14 |
| 3 | Stripe-inversjonen brukte `b` der foroverveien har hardkodet 1000; `mode: 'spacing'` på bjelke er nåbart, og feilen bytter gren i `s_r,max` | §3.4, §8, §12.11, AC11 |
| 4 | `s` var udefinert for et `kind: 'bars'`-lag, og et énjernslag hadde verken regel eller grunnkode. Utledes nå av `bars[].y`; `n = 1` gir `no_bar_spacing` | §3.2, §3.4, §3.5, §12.12, AC12 |

**Rettet (medium):**

| # | hva | hvor |
|---|---|---|
| 5 | `h_c,eff` og `ε_sm − ε_cm` hadde fått to produsenter, fordi §4 krevde kandidater og ledd pakken ikke gir ut. Begge er nå våre, med pakken som test-orakel | §3.1, §3.2, §4 |
| 6 | `sigma_c_char_required` var `bool`, så «ingen klasse valgt» ble til «gjelder ikke». Nå treverdig, med `no_exposure_class` | §2.1, §4, AC3, AC10 |
| 7 | `no_crack_width_limit` sto i tabellen over når `crack` er `null`, i strid med §4 og AC10. Flyttet til grunnene for at `crack.ok` er `null` | §3.5, §4, AC14 |
| 8 | Rissbeslutningen på BRUTTO snitt mens tilstandene regnes på det TRANSFORMERTE. Kriteriet er nå `σ_ct > f_ct,eff` på det urissede transformerte snittet, alltid med `E_cm`; SLS kaller ikke lenger `_cracking_moment` | §1.1, §1.3, §4, §7, §12.10, AC1–AC8, AC6b |
| 9 | Rene strekksnitt falt ut under en grunnkode som var faktuelt feil på sitt eget akseptansekriterium. `no_compression_zone` er delt i `fully_in_tension` og `no_equilibrium_cracked`; rent strekk er nå en BEGRUNNET utelatelse | §1.2, §3.4, §3.5, §8, AC8a, AC13 |

**Hva som IKKE ble gjort, mot det gjennomgangen åpnet for:**

* **Funn 1** åpnet for å la 7.2(3)-kontrollen UTGÅ i stedet for å regne
  førstegangstilstanden. Ikke gjort: den koster én bisection, og kontrollen er
  den eneste plassen modulen sier fra om at `φ_ef`-antakelsen kan svikte.
* **Funn 2** åpnet for å FJERNE XD3 fra nedtrekket. Ikke gjort: da velger en
  bruker med XD3-eksponering «XD2» og får 0,30 mm uten å vite at hen gjettet.
  En synlig ubesvart grense slår en stille feil-selektering. Se §11.
  Det andre alternativet — beholde 0,30 merket som VÅR ekstrapolasjon — er
  også forkastet: vi har ingen etterprøvd kilde for det tallet.
* **Funn 8** åpnet for å BEHOLDE brutto `M_cr` og bare skrive konvensjonen ut.
  Ikke gjort: å dokumentere en selvmotsigelse fjerner den ikke, og AC6 trykket
  allerede begge forholdstallene. Prisen — mindre konservativt i et bånd på
  2,8–9,3 % over `M_cr` — er i stedet skrevet ut i §1.1 og §7, med tallene.
* **Funn 9** kunne vært løst ved å BYGGE en strekkstavgren. Ikke gjort i denne
  runden: EC2 7.3.2(3) krever da en effektiv strekksone per betongflate, og en
  halv implementering ville gitt et tall som ser riktig ut. Se §8.
* `frequent`, overdekningsavhengig `w_max`, XF/XA i nedtrekket, nedbøyning og
  7.3.2-minimumsarmering står fortsatt under §8, uendret.

**Ingen tall i dette dokumentet er arvet uprøvd.** Alt i §1.1, §1.4, §3.4 og §9
er regnet i denne økten mot `structuralcodes` 0.7.2 i CPython. Ingen filer i
`concrete_section_calculator/` er endret; skriptene lå utenfor repoet.
