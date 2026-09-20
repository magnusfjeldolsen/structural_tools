# concrete_section_calculator — veikart

Levende dokument. Hver post sier **hva**, **hvorfor det er gjørbart eller ikke**, og den
**tekniske bindingen** som avgjør rekkefølgen. Det er bindingene som er poenget — et
veikart uten dem er bare en ønskeliste.

Status i dag: ULS bøyekapasitet, moment–krumning og M–N-diagram, lastkombinasjoner med
retning per rad, EC2 8.2-plassering av armeringslag, A4-rapport, lagring/lasting av JSON.
Motoren er fib `structuralcodes` 0.7.2 under Pyodide, med `marin`-integratoren.

---

## FERDIG — endringsrunde 4 (`fe1030c` motor og modell, `f9586b9` grensesnitt)

Plan: `global-devspecs/concrete_section_calculator-v4-sign-and-shear.md`.
Angrepunkt før runden: **`611776e`** — `git reset --hard 611776e` tar alt tilbake.

Alle fire postene under er levert og verifisert i nettleser. 297 JS-tester,
70 Python-tester.

| # | hva | målt begrunnelse |
|---|---|---|
| **0.1** | **Signert `M_Ed`, `structuralcodes` sin konvensjon** — sagging **negativ**, hogging positiv. `direction`-bryteren fjernes. | θ=0 (trykk oppe, feltmoment) gir `m_y = −215,01 kNm`. Følger av høyrehåndsregelen om Y-aksen. |
| **0.2** | **Aksialkraft ⇒ M–N-diagram automatisk.** «Bending resistance» deaktiveres når en kombinasjon har `N_Ed ≠ 0`. | En `M_Rd` ved én aksialkraft er ett punkt på en kurve, og ser ut som en kapasitet. |
| **0.3** | **Skjærkapasitet** etter EC2 6.2, med og uten bøyler. | `VRdc`/`VRds`/`VRdmax` finnes oppstrøms; vi regner bare ρ_w,min, s_l,max, s_t,max selv. |
| **0.4** | **Fortegn i skjær**: `A_sl` og `d` følger kombinasjonens moment; `NEd` snus for EC2-funksjonene. | Feil side: **+26 %** på usikker side. Feil `NEd`-fortegn: **11×**. |

### Funnet ved gjennomgang av skjermbildene, rettet i `f9586b9`

Fem feil som ingen test dekket. De står her fordi de deler én form: **to kilder til
samme tall**, der bare den ene ble lest av den som tegnet.

| hva | hvorfor det ikke ble oppdaget |
|---|---|
| Plata ble **tegnet** 300 mm bred mens motoren regnet 1000 | `section-draw.js` leste `geometry.b` rått, alt annet leser `sectionWidth()`. Begge «riktige» hver for seg. |
| «UTILISATION **H**» | CSS-en storbokstaverte `η` til gresk Eta, som ikke kan skilles fra latinsk H. |
| Bøylemerkelappen usynlig | Lå oppå underkantarmeringen, som tegnes etter bøylen og malte over den. |
| `λ` betydde 1,24 i figuren, 1,242 i rapporten og 0,81 på siden | `radialUtilisation` returnerer `{lambda}` = faktoren og `{eta}` = 1/λ. Tre kallsteder valgte hver sin. |
| Knappene sa Ctrl+Enter | Ctrl+Mellomrom var implementert, men bare i tastaturlytteren. |

**Læren for neste runde:** en test som sammenlikner *figurens* tall med *motorens* tall er
verdt mer enn ti tester som sjekker at figuren har riktig struktur.

0.1 er også en **forenkling**: «størrelse»-regelen fra v2 med `meta.moment_sign` og
`meta.domain_theta` oppheves, fordi den bare fantes for å bygge bro mellom en
retningsbryter og en motor som regner med fortegn.

---

## Tre ting som binder alt annet

**1. `marin`-integratoren, ikke `fiber`.** `triangle` kjører ikke noe sted; stubben kaster
hvis den kalles. Marin er analytisk, eksakt for polygoner, og har ingen nettverk.
Konsekvens: alt som krever punktprøving i tverrsnittet — `random_points_within`,
`create_detailed_result`, spennings-scatterplott — er **utilgjengelig** til noen bygger et
ekte `triangle`-hjul for Pyodide. Ingen av postene under trenger det.

**2. `scipy` er stubbet til tre funksjoner** (`lu_factor`, `lu_solve`, `interp1d`). Det
sparte 13,9 MB og 2,2 sekunder per last. **`griddata` kaster.** Det treffer SLS direkte,
se post 4.

**3. `structuralcodes` 0.7.2 rettet marin-integrasjon for *mer enn ett armeringsmateriale*.**
Det er den ene oppstrøms-rettelsen som låser opp post 1 og post 3 — uten den ville ulike
materialer i ulike lag gitt feil resultat i stillhet.

---

## 1. Materialer: nedtrekk, egendefinerte, og per lag

**Hva.** Betong- og stålkvalitet fra nedtrekksliste. Deretter en liste med egendefinerte
materialer — gammel armering, avvikende ståltyper — og mulighet for **ulikt materiale i
ulike armeringslag**.

**Gjørbart nå.** `PointGeometry(point, diameter, material)` og
`SurfaceGeometry(poly, material)` tar allerede ett materiale hver. Det som manglet var at
marin-integratoren regnet feil med flere armeringsmaterialer, og det er rettet i 0.7.2
(PR #369). Vi er på 0.7.2.

**Teknisk binding.** Materialet må flyttes fra `state.steel` (ett globalt) til en
**materialkatalog** med id-er, og hvert lag peker på en id:
```js
materials: { concrete: [{id:'C1', …}], steel: [{id:'B500NC', …}, {id:'old-ks40', …}] },
layers: [ { …, material: 'B500NC' } ],
```
Det er en kontraktsendring i payloaden (`section.rebar[i].material`) og i `engine.py` sin
`_build`. Middels stor, men ren.

**Rekkefølge.** Bør komme **før** post 3 (CFRP), fordi CFRP er nettopp «et lag med et annet
materiale». Å bygge CFRP først ville betydd å bygge katalogen to ganger.

---

## 2. Skjær

Egen plan: `global-devspecs/concrete_section_calculator-v4-sign-and-shear.md`
(erstatter `-v3-shear.md`, som ble skrevet før fortegnskonvensjonen var avklart).

Kort: EC2 6.2 er **ferdig implementert** i `structuralcodes` (`VRdc`, `VRds`, `VRdmax`,
`Asw_max`, `Asw_s_required`), inkludert aksialkraftens virkning. Vi regner bare ρ_w,min,
s_l,max og s_t,max selv.

**Den viktigste fellen står i planen §1:** `VRdc(NEd=…)` har **trykk positiv**, mens
`BeamSection(n=…)` har **strekk positiv**. Målt: et snitt med 500 kN strekk har
`V_Rd,c = 13,2 kN`; med fortegnet snudd blir det 150,0 kN. Elleve ganger, på usikker side.

---

## 3. Karbonfiberforsterkning (CFRP)

**Hva.** Samme modul brukt til forsterkning, med lastkombinasjoner for **to tilstander**:
ved påføringstidspunktet og i ferdig tilstand.

**Gjørbart.** CFRP er et lag med et lineærelastisk materiale uten flytegrense, altså et
`SurfaceGeometry` eller `PointGeometry` med et egendefinert materiale — post 1.

**Den tekniske kjernen er ikke materialet, men *forspenningen i historien*.**
`ConcreteEC2_2004` og `ReinforcementEC2_2004` tar begge **`initial_strain`** og
**`initial_stress`** i konstruktøren. Det er nøyaktig mekanismen: betongen og
lengdearmeringen bærer allerede tøyning når CFRP-en limes på, mens CFRP-en starter på null.
Uten `initial_strain` ville modellen latt karbonfiberen bære egenvekten den aldri så.

**Binding.** Krever post 1 (materialkatalog) og post 8 (laststeg), som er samme mekanisme
sett fra to sider. CFRP er faktisk det *enkleste* tilfellet av laststeg: to steg.

---

## FERDIG — 4. SLS: rissvidde og spenningsbegrensning (EC2 7.2 / 7.3.4)

Spec: `global-devspecs/concrete_section_calculator-sls.md`. 625 JS-tester, 145
Python-tester, fixturene urørt. En uavhengig håndregning (utenfor repoet, CPython mot
`structuralcodes` 0.7.2) traff motoren til 1e−11 på fem snitt før motorkoden ble skrevet —
tallene i spec §9 er derfor akseptkriterier, ikke en avskrift av hva koden svarer.

**Hva som ble levert.** Rissvidde `w_k` for tilnærmet permanente kombinasjoner,
spenningsgrensene i EC2 7.2 for karakteristiske, eksponeringsklasse med avledet `w_max` og
manuell overstyring, kryptallet `φ_ef`, og et eget SLS-kapittel i både resultatet og
rapporten — som dukker opp BARE når det finnes en bruksgrenserad. SLS er en ekstra
vurdering man gjør etter ULS, og ser sånn ut i grensesnittet.

**De to avgjørelsene som bar runden:**

1. **`calculate_strain_profile` kunne ikke brukes.** Den regner med DESIGN-lovene. Målt:
   betongspenningen ble 9,41 MPa der håndregningen sier 12,39 — **24 % for lav**, på
   usikker side, uten noe varsel. Løsningen er et eget, lineær-elastisk snitt ved siden av
   (E_cm i trykk, null i strekk, elastisk stål), som treffer håndregningen til 0,00 %.
2. **Rissvidden regnes av oss, ikke av pakkens 7.3-modul** — vei 3 i den gamle posten
   under. `griddata`-stubben kaster fortsatt, men det spilte ingen rolle: `ec2_2004` sine
   ENKELTFORMLER (`sr_max_close`, `sr_max_far`, `wk`, `eps_sm_eps_cm`) er tilgjengelige og
   brukes som orakel i testene. Vi eier kjeden mellom dem; formlene er standardens.

**Det den ikke gjør.** Nedbøyning (EC2 7.4) — egen sak, egen post. Forspenning. Og
`w_max` for en klasse EC2 ikke anbefaler noen verdi for (XD3) står som UBESVART, ikke som
bestått: en manuell overstyring er veien videre der.

### Rettet i gjennomgangen etter runden

Samme form som hver runde før: **to kilder til samme tall**, og en tekst som sa noe annet
enn koden gjorde.

| hva | hvorfor det var galt |
|---|---|
| Ingen vei i UI-et til å velge eksponeringsklasse | `w_k` ble regnet, men rissviddekontrollen var permanent ubesvart, med et varsel brukeren ikke kunne gjøre noe med. |
| `sls_incomplete` valgte grunnen på NØKKELNAVNET | `sigma_c_char_ok` fikk alltid «ingen klasse er valgt», også når klassen stod der og raden ikke lot seg løse. `sigma_s_char_ok` fikk ingen grunn i det hele tatt. Nå leses grunnen av raden som manglet svaret. |
| `slsLimits()` regnet tre spenningsgrenser ingen leste | Tall som SÅ UT som beregningens, mens motoren gangte sine egne faktorer. Borte. |
| De fire standardverdiene stod i fire filer | Nå i `SLS_DEFAULTS` (materials.js), med et navngitt speil i `engine.py` som en test holder i takt. |
| Raden felte dom på EC2 7.2(2) også for XC-klasser | Kontrollista sa «not applicable», utledningen skrev «OK». Nå er dommen `null` MED grunnen, mens spenningen og utnyttelsen står igjen som de faktaene de er. |
| `η` brøt ned på egen linje under 600 px | Radens viktigste tall, visuelt løsrevet fra navnet det hører til. Wrappingen ligger nå i den indre gruppa. |
| Ingen stålspenning for en tilnærmet permanent rad | Den har ingen GRENSE (EC2 7.2(5) er en karakteristisk kontroll) og ble derfor ikke rapportert i det hele tatt — men den er selve inngangen til rissvidden. Nå står den, med grunnen til at ingen grense felles, og utledningen viser i tillegg σ_s i det styrende laget som lign. 7.9 faktisk bruker. |

---

## FERDIG — kryptallet etter EC2 tillegg B, og første UX-runde

### Kryp

`φ(t, t₀)` utledes av relativ fuktighet, belastningsalder, levetid og
sementklasse; `h₀ = 2A_c/u` kommer av geometrien. Egen sammenfoldbar boks i
seksjon 1 — altså **tilgjengelig før det finnes en tilnærmet permanent
lastkombinasjon**, fordi kryp er en betongegenskap og ikke en
bruksgrenseinnstilling. Standardene (RH 50 %, 28 døgn, 50 år) gir et forsvarlig
tall for den som aldri åpner boksen.

**Skrevet i JS, ikke Python, og det var et valg.** `φ` må vises levende mens man
skriver, altså før Pyodide har kjørt. Prisen er at vi eier formlene, og den er
betalt med `tests/fixtures/creep-ec2-annexb.json`: 120 punkter regnet av
`structuralcodes` selv, frosset, og prøvd i **hvert ledd** av kjeden — ikke bare
på svaret. Avvik 0 ved 1e-12.

**Den ene kanten som måtte voktes:** `t = t₀` gir `β_c = 0` og dermed `φ = 0`.
Matematisk riktig — ved påføringsøyeblikket har ingenting krøpet — men som
inndata er det nesten alltid en skrivefeil, og et stille `φ = 0` ville gjort en
tilnærmet permanent kontroll om til en korttidskontroll uten å si fra.

**Målt:** standardbjelken 300×600 i C30/37 innendørs, lastet ved 28 døgn, 50 år
gir `φ = 2,346`. Den gamle faste standarden var 2,0 — altså på usikker side for
nettopp det snittet, og hele grunnen til at tallet nå utledes.

`φ_ef` er nå en OVERSTYRING (`null` = utled). En fil lagret da tallet var fast
bærer `phi_ef: 2.0` og leses derfor som en overstyring på 2,0 — samme svar som
den gang. `φ = 0` er også en lovlig overstyring.

### Første UX-runde — fem målte feil

Fra en uavhengig gjennomgang som målte i nettleseren i stedet for å se.

| | før | etter |
|---|---:|---:|
| Tab tilbake til `M_Ed` etter `Ctrl+Space` | 46 | **0** |
| Merkelapper i tverrsnittsfiguren | 6,0–7,1 px | **12–16 px** |
| Vannrett overflyt ved 390 px | 244 px | **0** |
| Tekstnoder under WCAG AA | 87 | **6** |
| SLS-ord i `<title>`/meta | 0/5 | **5/5** |

Fokusfeilen satt i `render()`, ikke i `calculate()`: opptegningen bygger
radlistene på nytt med `innerHTML`, så noden som hadde fokus finnes ikke
etterpå. Rettet der, så hver kaller arver det.

Skriftfiksen bet to ganger, begge med husets egen feilform. Første forsøk ga
merkelappsonen skriftfaktoren men glemte lagmerkelappene; andre forsøk lot sonen
vokse fritt, og **platas fyllingsgrad falt fra 77 % til 61 %**. Nå er faktoren
klemt mot sonens budsjett, og sonen som reserveres og teksten som settes leser
samme funksjon.

**To forslag ble avvist**, begge fordi de ville reversert bevisste valg: en
Sagging/Hogging-bryter i stedet for fortegn (retningen ER fortegnet på `M_Ed`),
og å lukke `#adv-shear` som standard (den inneholder bøyleradene, og regelen som
holder den åpen finnes fordi en kalkulator som gjemmer en inndata den bruker,
lyver).

### Benchmark mot publiserte eksempler

Kjeden treffer det offisielle EC2-regneeksempelet (European Concrete Platform
2017, eks. 7.3) til **0,05–0,4 %** på x, σ_s, h_c,eff, ρ_p,eff, s_r,max og w_k
når den mates med kildens egne forutsetninger. Det som gjenstår er to bevisste
valg, begge til sikker side: `k_t = 0,4` (tilnærmet permanent) og
`α_e = E_s/E_cm` i lign. 7.9, som er definisjonen i EC2 7.3.4(2).

**Funn verdt å huske:** to av tre publiserte eksempler regner rissvidde uten å
sjekke om snittet i det hele tatt risser — det ene på et snitt som ligger på
26 % av rissmomentet. Vi svarer «urisset — ingen riss å måle», med grunnen i
klartekst. Det betyr at vi gir en tankestrek der andre verktøy gir et tall.

---

## 5. Lastkombinasjoner til og fra utklippstavla

**Hva.** Kopiere kombinasjonene som tekst, og lime inn fra eksterne kilder.

**Gjørbart nå**, og det eneste som trengs er en **definert syntaks** og en parser som er
streng.

Forslag til syntaks — tabulator- eller semikolonseparert, én rad per kombinasjon, med
valgfri overskriftsrad, slik at det limes rett inn fra et regneark:
```
name    N_Ed    M_Ed    V_Ed    direction
ULS 1   -500    250     120     sagging
ULS 2   0       150     80      hogging
```

**Kravene som gjør dette trygt, og som må stå i spesifikasjonen:**
- **Aldri `eval`.** Feltene er tall, ikke uttrykk. Uttrykksfeltene i UI er en annen sak.
- Tall parses strengt: både `1 234,5` og `1234.5` godtas, alt annet avvises **med
  radnummer**. En stille `NaN` i en lastkombinasjon er et usikkert tall.
- `direction` må være `sagging`/`hogging` — ukjent verdi avvises, faller ikke til en
  standard.
- Radgrense (f.eks. 200) så en feilaktig innliming ikke fryser siden.
- Innlimt tekst havner **aldri** i DOM som HTML. Navn escapes.
- Forhåndsvisning før import: «12 rader tolket, 2 avvist (rad 5, 9)» — importen er
  destruktiv for den eksisterende tabellen, og da skal man se hva man får først.

---

## 5b. Kombinasjonstype: ULS, karakteristisk, tilnærmet permanent

**Hva.** Hver lastkombinasjon får en **type**, og typen styrer hvilken kontroll som kjøres:

| type | kontroll |
|---|---|
| `uls` | bøyekapasitet, skjær |
| `characteristic` | maksimal stålspenning (post 4a) |
| `quasi_permanent` | rissvidde (post 4b) |

**Hvorfor det hører hjemme i lastkombinasjonen og ikke i analysevalget.** Et snitt
kontrolleres mot alle tre samtidig, med ulike lastnivåer i hver. Legger man typen på
analysen i stedet, må brukeren fylle ut tabellen tre ganger.

**Binding.** Feltet kan legges inn **nå**, sammen med `V_Ed` (post 2), selv om bare `uls`
gjør noe. Da slipper vi en kontraktsendring senere, og importformatet i post 5 får
kolonnen fra dag én. SLS-kontrollene kobles på når post 4a og 4b står.

**Konsekvens for `governing`.** Hver kontroll får sin egen dimensjonerende rad, som skjær
allerede krever. Én `governing` per kontroll, ikke én for hele tabellen.

---

## 6. UI-overhaling — mindre overveldende inngang

**Hva.** Førsteinntrykket skal være tydelig: velg betong, velg stål, velg bjelke eller
plate. Resten folder seg ut etter behov.

**Retning.** Dagens side viser alt på én gang. Prinsippet bør snus: de tre valgene over
først, og alt annet — faktorer, arbeidsdiagram, k1/k2/d_g, θ, z-faktor — i sammenfoldede
«Advanced»-bokser som allerede finnes i seksjon 1. Standardverdiene er riktige for de aller
fleste; de skal ikke kreve oppmerksomhet.

**Binding.** Bør gjøres **etter** post 1 og 2, ellers omarbeides den samme seksjonen tre
ganger.

**Konkret sak som venter her.** Tverrsnittsfiguren i geometriseksjonen fyller bare rundt
en fjerdedel av panelet sitt: `viewBox`-en reserverer plass til armeringsmerkelappene til
høyre, og en høy, smal bjelke etterlater derfor luft på alle kanter. Figuren er den
viktigste tilbakemeldingen på siden og bør fylle boksen. Rettes sammen med resten av
seksjonen, ikke som en løsrevet CSS-lapp.

---

## 7. Flere tverrsnittsformer

**Hva.** Parametrisk T-tverrsnitt og opp-ned T, i tillegg til rektangel og plate.

**Gjørbart nå.** Motoren tar et vilkårlig shapely-polygon; `payload.js` bygger det allerede.
`structuralcodes` er verifisert på ikke-konvekse T-tverrsnitt i vår egen forskning.

**Det som må tenkes gjennom:**
- `b_w` for skjær er **stegbredden**, ikke flensbredden. Post 2 antar rektangel og må få en
  eksplisitt `b_w` når formen ikke er det.
- `A_s,min` bruker `b_t`, som er strekksonens bredde — for en opp-ned T er det flensen.
- Tegningen må kunne kotere en parametrisk form.

---

## 8. Lasthistorie og støpeetapper

**Hva.** Flere laststeg der tverrsnittet vokser: forskalingselementet bærer seg selv, ny
betong støpes tilnærmet monolittisk mot den, og videre. Typisk kaikonstruksjoner.

**Gjørbart — og mekanismen finnes allerede.** `initial_strain` og `initial_stress` i
materialkonstruktørene er nettopp dette: betong støpt i steg 2 starter uten tøyning, mens
steg 1 allerede bærer. Det er samme mekanisme som CFRP i post 3, bare med flere steg.

**Dette er den største posten**, fordi tilstanden må gå fra ett tverrsnitt til en
**sekvens** av tverrsnitt med hver sin geometri og lastvirkning, og resultatet blir en
historie i stedet for ett tall. Det er en modelleringsendring, ikke en beregningsendring.

**Binding.** Krever post 1 og post 3. Bør ikke påbegynnes før begge står.

---

## Foreslått rekkefølge

Postene 2 (skjær), 5b (kombinasjonstype) og 4 (SLS) er **ferdige**. Det som står igjen,
i den rekkefølgen bindingene tilsier:

1. **Småtteri brukeren har bestilt** — tallfelt i «numpad mode» på mobil, og bort med
   `.0` der desimalen ikke betyr noe (geometri, armeringsdiameter). Uavhengig av alt
   annet, og hver gang man ser dem er de irriterende.
1b. **Resten av UX-runden** — dobbeltnedlastingen av Pyodide (15,4 → 9,7 MB), egen
   melding ved feil fortegn på `M_Ed`, tegne figuren i boksens egen bredde med en
   `viewBox` som følger snittformen, fokusfelle på rapportoverlegget, overskriftsnivåer
   og `aria-live`.
2. **Moment–krumning i BEGGE retninger**, med synlige punkter på kurven, når
   kombinasjonene har både positivt og negativt moment.
3. **Glideren under moment–krumning** — nøytralakse og spenningsutvikling per punkt, med
   konturplot for betongen og fargekoding for armeringen ved siden av. **Kun i UI-et,
   ikke i rapporten** (rapporten skal være minimal, men gjøre beregningen gjenskapbar).
   Merk bindingen: konturplot krever punktprøving i tverrsnittet, og `create_detailed_result`
   kaster gjennom `triangle`-stubben. `get_point_stress(y, z, group_label='L1')` virker
   derimot — men returnerer STILLE 0 uten `group_label`, så den må kalles riktig.
4. **Materialkatalog med nedtrekk og per-lag-materiale** (post 1) — låser opp 3 og 8.
5. **Utklippstavle for lastkombinasjoner** (post 5) — liten, uavhengig, høy nytte.
6. **Del opp `ui.js`** (3 200 linjer, den fila hver eneste runde kolliderer på).
7. **Mobil** — målt 244 px overflyt ved 390 px bredde.
8. **UI-overhaling** (post 6), **CFRP** (post 3), **flere tverrsnittsformer** (post 7),
   **lasthistorie** (post 8).

`griddata`-undersøkelsen som stod her er **ikke lenger nødvendig**: rissvidden regnes av
oss, av enkeltformlene i `ec2_2004`, og pakkens 7.3-modul kalles aldri.
