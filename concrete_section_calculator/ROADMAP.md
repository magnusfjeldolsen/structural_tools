# concrete_section_calculator — veikart

Levende dokument. Hver post sier **hva**, **hvorfor det er gjørbart eller ikke**, og den
**tekniske bindingen** som avgjør rekkefølgen. Det er bindingene som er poenget — et
veikart uten dem er bare en ønskeliste.

Status i dag: ULS bøyekapasitet, moment–krumning og M–N-diagram, lastkombinasjoner med
retning per rad, EC2 8.2-plassering av armeringslag, A4-rapport, lagring/lasting av JSON.
Motoren er fib `structuralcodes` 0.7.2 under Pyodide, med `marin`-integratoren.

---

## NÅ — endringsrunde 4

Plan: `global-devspecs/concrete_section_calculator-v4-sign-and-shear.md`.
Angrepunkt før runden: **`611776e`**.

| # | hva | målt begrunnelse |
|---|---|---|
| **0.1** | **Signert `M_Ed`, `structuralcodes` sin konvensjon** — sagging **negativ**, hogging positiv. `direction`-bryteren fjernes. | θ=0 (trykk oppe, feltmoment) gir `m_y = −215,01 kNm`. Følger av høyrehåndsregelen om Y-aksen. |
| **0.2** | **Aksialkraft ⇒ M–N-diagram automatisk.** «Bending resistance» deaktiveres når en kombinasjon har `N_Ed ≠ 0`. | En `M_Rd` ved én aksialkraft er ett punkt på en kurve, og ser ut som en kapasitet. |
| **0.3** | **Skjærkapasitet** etter EC2 6.2, med og uten bøyler. | `VRdc`/`VRds`/`VRdmax` finnes oppstrøms; vi regner bare ρ_w,min, s_l,max, s_t,max selv. |
| **0.4** | **Fortegn i skjær**: `A_sl` og `d` følger kombinasjonens moment; `NEd` snus for EC2-funksjonene. | Feil side: **+26 %** på usikker side. Feil `NEd`-fortegn: **11×**. |

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

## 4. SLS — rissvidde og spenningsbegrensning

**Hva.** Rissvidde i tilnærmet permanent lastkombinasjon, og maksimal stålspenning i
karakteristisk kombinasjon.

**To ulike vanskelighetsgrader, og de bør skilles.**

**4a. Maksimal stålspenning — gjørbart nå.** `calculate_strain_profile(n, my, mz)` gir
tøyningsplanet ved en gitt lastvirkning, og stålspenningen følger av
`material.constitutive_law.get_stress(eps)`. Det krever et **andre sett materiallover** med
`'elastic'` i stedet for design-lovene, siden SLS ikke bruker γ. `CONCRETE_LAWS` har
allerede `'elastic'`.

**4b. Rissvidde — blokkert av scipy-stubben.**
`codes/ec2_2004/_section_7_3_crack_control.py` bruker `scipy.interpolate.griddata` **to
steder**, og stubben vår kaster på den. Tre veier ut, i stigende kostnad:
1. **Implementer `griddata` i stubben** for de tilfellene modulen faktisk bruker. Krever at
   noen leser kallstedene og ser om det er 1D-, 2D- eller spredt interpolasjon.
2. **Last ekte scipy bare når SLS kjøres.** 13,9 MB på forespørsel, ikke ved sidelast.
   Teknisk enkelt (`pyodide.loadPackage('scipy')` ved behov), men det dobler lastetiden
   for den som bruker SLS.
3. **Regn rissvidden selv** etter EC2 7.3.4. Formelen er ikke lang, men da eier vi den.

**Ingen av dem bør velges før noen har lest de to kallstedene.** Det er en halvtimes
undersøkelse som avgjør et valg vi ellers ville gjettet på.

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

1. **Skjær** (post 2) — planen finnes, motoren er ferdig oppstrøms, ingen avhengigheter.
2. **Materialkatalog med nedtrekk og per-lag-materiale** (post 1) — låser opp 3 og 8.
3. **Kombinasjonstype** (post 5b) — feltet legges inn tidlig, selv om bare `uls` virker
4. **Utklippstavle for lastkombinasjoner** (post 5) — liten, uavhengig, høy nytte.
5. **SLS 4a, maksimal stålspenning** — gjørbart uten å røre scipy-stubben.
6. **UI-overhaling** (post 6) — etter at 1 og 2 har lagt sine felt inn.
7. **CFRP** (post 3).
8. **SLS 4b, rissvidde** — etter at `griddata`-spørsmålet er undersøkt.
9. **Flere tverrsnittsformer** (post 7).
10. **Lasthistorie** (post 8).

Undersøkelsen som bør gjøres **først**, fordi den er billig og avgjør et valg lenger ute:
les de to `griddata`-kallstedene i `_section_7_3_crack_control.py` og avgjør hvilken av de
tre veiene i post 4b som gjelder.
