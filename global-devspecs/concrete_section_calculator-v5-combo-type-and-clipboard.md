# concrete_section_calculator — endringsrunde 5

**Kombinasjonstype (veikart 5b) og utklippstavle for lastkombinasjoner (veikart 5).**

Angrepunkt før runden: **`270fa6e`** (origin/master, publisert og verifisert live).
`git reset --hard 270fa6e` tar alt tilbake.

> **Versjon 2 av planen.** Utkast 1 ble gjennomgått mot koden og beskrev en motor og en
> store som ikke finnes. Alle linjenumre under er verifisert mot `270fa6e`. Der planen
> sier «i dag», er det lest, ikke husket.

---

## 1. Hvorfor de to hører sammen i én runde

Utklippstavla trenger et **kolonneformat**. Kommer `type` inn etterpå, må formatet og
parseren endres én gang til, og tekst som allerede er limt ut mangler kolonnen. Derfor
legges feltet inn **først**, og importformatet har kolonnen fra dag én.

Begge postene rører lastseksjonen, `store.js`, `serialize.js`, motoren og rapporten.
Ingen av dem rører materialer, tegning eller integratoren.

---

## 2. `type` på lastkombinasjonen

### 2.1 Modellen

`createCombo` (`js/rebar.js:447`) får ett felt til:

```js
{ id: 'C1', name: 'ULS 1', type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0 }
```

Lovlige verdier, og **ingen andre**:

| verdi | betyr | kontroll i dag |
|---|---|---|
| `uls` | bruddgrensetilstand | bøyekapasitet + skjær |
| `characteristic` | karakteristisk | **ingen** — veikart 4a er ikke bygget |
| `quasi_permanent` | tilnærmet permanent | **ingen** — veikart 4b er ikke bygget |

**`...patch` står sist i `createCombo` (`rebar.js:460`).** En fil med `"type": null`
eller `"type": ""` vil derfor overstyre defaulten, ikke falle tilbake på den. Fabrikken
må normalisere **etter** spredningen:

```js
const out = { id, name: …, type: 'uls', N_Ed: 0, M_Ed: 0, V_Ed: 0, ...patch };
out.type = COMBO_TYPES.includes(out.type) ? out.type : 'uls';
return out;
```

Fabrikken har ingen notat-kanal og skal ikke få en. At en ukjent type ble rettet, meldes
av **den som kaller**: `fromDocument` (`serialize.js:116`) sammenlikner rådataens `type`
mot resultatet og legger på `combo_type_unknown` (severity `warning`) når de er ulike.
Importparseren melder det som en avvist rad, se §4.

### 2.2 Motoren — den fulle kontrakten

Dette er delen utkast 1 tok feil om. Motoren regner i dag **ikke** med at en rad kan
være uløst, og fem steder må endres i samme commit.

**En ikke-ULS-rad får en komplett rad i `combinations[]`**, med samme nøkkelmengde som
en løst rad — `_solve_combo` sin `public`-dict har 18 nøkler — pluss:

```python
{'checked': False, 'reason': 'sls_not_implemented', 'within_limits': False,
 'utilisation': None, 'theta': 0.0, …}
```

**`theta` må være et tall, ikke `None`.** `_is_hogging` (`engine.py:306`) gjør
`float(theta)`, og `engine.py:1172` kaller den på referanseraden. `None` gir `TypeError`
og velter hele motoren.

Fem steder må filtrere på `checked`:

| sted | linje i dag | endring |
|---|---|---|
| `_select_governing` | `engine.py:880` `candidates = [i for i, c in … if c['within_limits']]` | **og** `c['checked']` |
| `axial_ok` | `engine.py:1089` `all(c['within_limits'] for c in combo_results)` | bare over `checked`-rader |
| `_select_shear_governing` | `engine.py:715-731`, filtrerer på `shear.evaluated` | **og** `checked` |
| `shear_ok` | `engine.py:1122-1125` | bare over `checked`-rader |
| `ref_index` | `engine.py:1061` `governing_index if has_candidate else 0` | ellers **første `checked`-rad**, ikke rad 0 |

**Hvorfor `ref_index` er sikkerhetskritisk:** er rad 0 en SLS-rad, blir
`d_eff = None` (`engine.py:1066`) ⇒ `as_min = None` (`:1075`) ⇒
`as_min_ok = bool(as_min is None or …)` (`:1086`) ⇒ **`True`**. Minimumsarmeringen etter
EC2 9.2.1.1 ville stille bestått uten å være regnet. Det er nøyaktig samme sviktform som
`d_eff`-feilen i runde 1.

**Skjær er ikke en del av bøyingen.** `_shear_result` kalles først i `_solve_combo`
(`engine.py:806`) og er uavhengig av aksialsjekken. Uten typefilter ville en
`quasi_permanent`-rad blitt **skjærkontrollert som bruddgrense**, kunne blitt
`shear_governing` — som `report.js:487` trykker i fet skrift — og kunne alene satt
`shear_ok: false`.

### 2.3 Ingen ULS-rad: hva som faktisk skjer

Består tabellen bare av ikke-ULS-rader, er det **ingen kandidater**. I dag går den veien
slik, og alle tre leddene er feil for vårt formål:

1. `has_candidate = False` (`engine.py:1060`) ⇒ `'ok': has_candidate` (`:1162`) ⇒ `ok: false`.
2. Motoren stapper inn en **hardkodet** feilblokk (`engine.py:1227`):
   «No load combination has an axial force within the range this cross-section can
   carry: …». Det er en **faktuelt falsk påstand** i dette tilfellet.
3. `ui.js:1041` `if (result.ok !== true)` erstatter hele resultatpanelet med en rød
   feilboks.

Kontrakten blir:

- Ingen `checked`-rad ⇒ `ok: false` med `error.code = 'no_uls_combination'` og en egen
  melding: *«No load combination is of type ULS. Serviceability checks are not
  implemented in this version, so there is nothing to check.»*
- Den hardkodede `axial_out_of_range`-blokka skal **bare** brukes når det finnes
  ULS-rader, men ingen av dem er innenfor `[n_min, n_max]`. Det er to ulike
  situasjoner, og de skal ikke dele melding.
- `checks` utelates. Rød feilboks er riktig oppførsel her — `#combos`-tabellen i
  inndataseksjonen tegnes uansett, så brukeren ser radene sine.

Merk at §2.2 sitt «raden forsvinner aldri» gjelder **resultat- og rapporttabellene når
det finnes minst én ULS-rad**. Uten ULS-rad finnes det ikke noe resultat å vise.

### 2.4 Aktiv kombinasjon — seks dører, ett håndhevingspunkt

Moment–krumning og bruddtilstanden i M–N regnes for den **aktive** kombinasjonen. Den må
være en `uls`-rad.

`enforceActiveCombo(s)` legges i `store.js` ved siden av `enforceAnalysis` og
`enforceSlabWidth`, og kobles på **alle** disse:

| # | metode | linje | hvorfor den er en dør |
|---|---|---|---|
| 1 | `setState(patch)` | `store.js:211` | Grunn toppnivå-merge. `setState({combos, activeCombo})` er lovlig og passerer i dag **hverken** `enforceAnalysis` eller `enforceSlabWidth`. |
| 2 | `addCombo(patch)` | `:340` | Kan sette inn en ikke-ULS-rad. |
| 3 | `updateCombo(id, values)` | `:347` | Kan gjøre den aktive raden ikke-ULS. |
| 4 | `removeCombo(id)` | `:363` | `activeCombo = combos[0].id` når den aktive fjernes, og `combos[0]` kan være SLS. Fjernes den siste ULS-raden, blir den aktive ugyldig uten at noe kjøres. |
| 5 | `setActiveCombo(id)` | `:372` | Setter `activeCombo` rått. Har i dag **ingen** håndheving overhodet. |
| 6 | `replaceState(next)` | `:385` | `setInputs`, og innlasting av fil. |
| 7 | `createStore(initial)` | `:158` | Konstruktøren. `store.test.mjs` har allerede den tilsvarende testen for `enforceAnalysis`. |

**`fromDocument` er IKKE en dør.** `ui.js:897` gjør
`const {state, notes} = fromDocument(parsed); if (state) store.replaceState(state);` —
filen kommer inn via dør 6. Regelen skal derfor stå **ett sted**, i `store.js`, og ikke
dupliseres i `serialize.js`.

Regelen er **enveis**, som `enforceAnalysis`: den flytter `activeCombo` til første
`uls`-rad når den peker på noe annet. Finnes ingen `uls`-rad, står `activeCombo` — da er
det motorens `no_uls_combination` som gjelder, ikke en stille omplassering.

### 2.5 UI

Typen vises som en liten nedtrekk i kombinasjonsraden, mellom `id`-chippen og navnet.
Ikke-ULS-rader tones ned og får teksten «not checked — SLS is not implemented yet».

To feller, begge målt i koden:

1. **Teksten kan ikke stå i `data-m-interp`-noden.** `ui.js:793` skriver
   `target.textContent = momentInterpretation(v)` ved **hvert tastetrykk** i `M_Ed`.
   «Not checked» ville blitt overskrevet av retningsteksten. Bruk en egen node.
2. **`render()` skal kalles, men rammes inn.** Utkast 1 sa «ikke kall `render()`», og
   det er feil mønster. Det etablerte er `ui.js:716-719`:
   `function renderCombos() { … if (comboEditInFlight) return; … }`, og hver
   felthåndterer (`:767, :779, :806, :820`) setter `comboEditInFlight = true` rundt sitt
   `render()`. En `<select>` mister ikke fokus på samme måte som et tekstfelt, så
   nedtrekken **skal** kjøre en full `render()` **uten** flagget — ellers oppdateres
   ikke raden, og nedtoningen vises ikke.

Tab-rekkefølgen skal gå type → navn → N_Ed → M_Ed → V_Ed, og Shift+Tab motsatt. Dette
er runde 3-regresjonen, og den får et akseptansekriterium denne gangen (§9.16).

---

## 3. Utklippstavleformatet

### 3.1 Kontrakten

Tabulator- eller semikolonseparert. Én rad per kombinasjon. Valgfri overskriftsrad.

```
name	type	N_Ed	M_Ed	V_Ed
ULS 1	uls	-500	-250	120
ULS 2	uls	0	150	80
SLS 1	quasi_permanent	0	-90	40
```

- **Enheter er kN og kNm. Alltid.** Ingen enhetstolkning, ingen enhetskolonne.
  **Eksporten skriver bare kolonnenavnene**, uten enheter — ellers kan ikke modulens
  egen eksport importeres tilbake. Enhetene står i forhåndsvisningens tabellhode, som
  er UI og ikke tekst.
- **`M_Ed` er signert, sagging negativ.** Samme konvensjon som resten av modulen.
- **Komma er desimalskilletegn, ALDRI kolonneskilletegn.** `1,5` betyr 1,5. Derfor er
  komma ikke en lovlig separator, uansett hvor vanlig CSV er. Dette kan ikke mykes opp
  senere uten å gjøre `1,5` tvetydig.

### 3.2 De sju reglene som gjør formatet entydig

Uten disse lander to agenter ulikt på ekte Excel-data.

1. **Linjeskift:** splitt på `/\r\n|\r|\n/`. Excel på Windows limer `\r\n`; splitter man
   bare på `\n`, får hver rad `"uls\r"` i typekolonnen og **hele importen avvises**.
2. **Tomme linjer hoppes over**, hvor som helst, inkludert det avsluttende linjeskiftet
   Excel alltid legger på.
3. **Radnummer i meldinger er linjenummeret i den innlimte teksten, 1-basert,
   overskriftsraden medregnet.** Da peker «row 5» på rad 5 i regnearket.
4. **Overskriftsrad oppdages slik:** første ikke-tomme linje er en overskrift **hvis og
   bare hvis** minst én celle, trimmet og småskrevet, er et kjent kolonnenavn
   (`name`, `type`, `n_ed`, `m_ed`, `v_ed`, `direction`). Ellers posisjonelt.
5. **Separator velges per fil, ikke per linje:** tell tabulatorer og semikolon i hele
   teksten, velg den med flest. Da ødelegger ikke et navn med semikolon en tabulert fil.
6. **Typeverdier matches uten hensyn til store/små bokstaver**, og `-` og mellomrom
   normaliseres til `_`. `ULS`, `uls`, `Quasi-permanent` og `quasi permanent` er alle
   gyldige. Et ekte regneark skriver `ULS`, og en streng implementasjon uten denne
   regelen ville avvist hver eneste rad.
7. **Maks 20 kolonner per linje.** Uten den ligger én linje med 100 000 tabulatorer
   innenfor både radgrensen og tegngrensen.

### 3.3 Manglende kolonner

| situasjon | oppførsel |
|---|---|
| overskriftsrad uten `N_Ed`, `M_Ed` eller `V_Ed` | **hele importen avvises**, med navnet på kolonnen som mangler |
| overskriftsrad uten `type` | tillatt, alle rader blir `uls` |
| overskriftsrad uten `name` | tillatt, navn fra `createCombo` |
| posisjonelt, 4 kolonner | `name`, `N_Ed`, `M_Ed`, `V_Ed`; typen blir `uls` |
| posisjonelt, 5 kolonner | `name`, `type`, `N_Ed`, `M_Ed`, `V_Ed`; kolonne 2 **må** være en kjent type, ellers avvises raden med beskjed om at overskriftsrad trengs |
| posisjonelt, annet antall | hele importen avvises |

En manglende `V_Ed`-kolonne blir **ikke** stille 0. Null skjærkraft er en påstand om
lasten, ikke et fravær av informasjon.

### 3.4 `direction`-kolonnen skal AVVISES, ikke tolkes

Veikartets opprinnelige forslag hadde en kolonne `direction` med `sagging`/`hogging`.
**Den døde i runde 4** — retningen er fortegnet på `M_Ed`. Møter parseren en kolonne som
heter `direction`, avvises hele importen med:

> `direction` is no longer used — the sign of M_Ed is the direction (sagging is negative).

Grunnen til at den avvises og ikke bare ignoreres: en fil med både `direction: hogging`
og `M_Ed: -250` sier to motstridende ting, og hvilken som helst av dem kan være den
brukeren mente. Å velge én i stillhet er et fortegnsvalg tatt på brukerens vegne, på
usikker side halvparten av gangene.

---

## 4. Parseren

Innlimt tekst er **fremmed data**. Den kommer fra et regneark, et FEM-program eller en
e-post, og behandles som fiendtlig inntil den er tolket.

1. **Aldri `eval`, aldri `new Function`, aldri uttrykk.** Feltene er tall.
   Uttrykksfeltene i UI-en (`35+8`, `600/2`) er en annen mekanisme, og de to skal ikke
   møtes. Parseren har ingen tilgang til uttrykkstolkeren. **Merk at `numeric-input.js:26`
   slipper `e`/`E` gjennom, altså at `1e3` virker i et skrevet felt.** Parseren avviser
   `1e3`. Det er bevisst: en skrevet verdi er brukerens egen, en innlimt er ikke.
2. **Tallparsing er streng og eksplisitt.**
   Godtas: `1234.5`, `1234,5`, `1 234,5`, `1 234.5` med vanlig mellomrom **og** hardt
   mellomrom U+00A0 (det Excel limer), ledende `+`/`-`, og unicode-minus `−` (U+2212)
   og `–` (U+2013), som Word og Excel produserer.
   Avvises: alt annet, inkludert `1.234,5`, `1e3`, `~120`, `120 kN`, og tom celle der et
   tall kreves. En avvist celle gir **avvist rad med radnummer og grunn**, aldri `NaN`
   og aldri 0.
3. **Radgrense 200**, tegngrense 200 000, sjekket **før** splitting, kolonnegrense 20.
4. **Navn saneres.** Maks 60 tegn, kontrolltegn fjernet. Et tomt navn gir **ingen
   `name`-nøkkel i det hele tatt**, slik at `createCombo` sin default (`ULS n`, ikke
   `C n` — `rebar.js:456`) faktisk slår inn; en tom streng i patchen ville vunnet over
   defaulten.
5. **Ingen id-er fra fremmed data.** `id` settes av `store.js` sin teller, aldri av den
   innlimte teksten. Ellers kan to rader få samme id, og `activeCombo` peke på begge.
6. **Parseren er ren og DOM-fri.** Ny fil `js/combo-io.js`, eksporterer
   `parseCombos(text) -> { rows, rejected, notes }` og `formatCombos(combos) -> string`.
   Den kaster aldri, rører aldri staten og importerer ingenting utover `rebar.js`.

### 4.1 Eksporten må sanere også

Utkast 1 sanerte bare på importsiden. To hull:

- **Separatorer i navn ødelegger rundturen stille.** Et navn med tabulator, semikolon
  eller linjeskift — fullt mulig via `setInputs` eller innliming i navnefeltet — gir
  feil antall kolonner ved reimport, altså **feil laster**, uten feilmelding. Slike tegn
  erstattes med mellomrom på eksport.
- **Formelinjeksjon.** Eksporten er laget for å limes inn i Excel. Et navn som starter
  med `=`, `+`, `-` eller `@` blir en formel der. Slike navn prefikses med `'` på
  eksport, og parseren **fjerner én ledende `'`** ved import, slik at rundturen forblir
  tapsfri.

---

## 5. Forhåndsvisning før import

Import er **destruktiv**. Derfor:

- En dialog som viser de tolkede radene, og over den:
  «12 rows parsed · 2 rejected (rows 5, 9)».
- Avviste rader listes med radnummer **og grunn**, ikke bare antall.
- To knapper: **Replace all** og **Append**. Uten `Append` må brukeren lime inn alt på
  nytt for å legge til to rader.
- Er alle rader avvist, er begge deaktivert.

**Escaping:** `ui.js:86` sin `esc()` escaper `& < > "` og **ikke** `'`, mens
`report.js:117` også escaper `'`. E3 skal **utvide `ui.js` sin `esc()` til å dekke `'`**,
slik at de to er like. Alternativet — å huske å bruke doble anførselstegn i hvert
attributt — er en regel som holder til noen glemmer den.

### 5.1 Inn og ut av utklippstavla

**Eksport** bruker `navigator.clipboard.writeText`, med `document.execCommand('copy')`
fra en skjult `textarea` som reserve. Knappen bekrefter med «Copied» i to sekunder.

**Import skjer gjennom en `textarea` brukeren limer inn i**, ikke gjennom
`navigator.clipboard.readText()`. Lesetilgang krever tillatelse, er blokkert i flere
nettlesere og feiler stille i andre. En `textarea` virker overalt, og brukeren ser hva
hen limer inn.

---

## 6. Payload og skjema

`section.combos[i].type` blir med i payloaden.

**`SCHEMA_VERSION` skal IKKE bumpes.** `engine.py:963` avviser hele payloaden ved
avvik (`schema_mismatch`), og alle fire `payload-*.json` og seks `result-*.json` har
`"schema": 1`, med `test_engine.py:69` `assert result['schema'] == 1`. En bump ville
velte samtlige fixturbaserte pytest-tester samtidig — på inngangsporten, ikke på tall —
og dermed ødelegge nettopp det absoluttverdi-diffet som skal bevise at ingenting flyttet
seg. Feltet er rent additivt: `_normalise_loads` (`engine.py:757`) leser felt for felt
med `.get`. I stedet: **en test på at motoren tolererer en payload uten `type`** og
behandler raden som `uls`.

Fixturene regenereres av **koordinatoren**, med samme absoluttverdi-diff som i runde 4:
tallene for eksisterende ULS-rader skal stå **helt stille**.

---

## 7. Rapporten

- Kombinasjonstabellen får en `Type`-kolonne.
- Ikke-ULS-rader viser «—» i kapasitetskolonnene og «Not checked» i statuskolonnen, med
  fotnoten: «Serviceability checks are not implemented in this version.»
- `shear_governing`-markeringen (`report.js:487`) skal aldri kunne peke på en ikke-ULS-rad.

### 7.1 Kodene må registreres, ellers vises de som ukjent kode

`messageForCode` (`results.js:408`) faller tilbake på «Unspecified message from the
calculation engine (code: …)» for en kode som ikke står i `CODE_MESSAGES` og riktig
liste (`results.js:270-287`). To nye koder skal inn:

| kode | liste | emitteres av |
|---|---|---|
| `combo_type_unknown` | `RUNTIME_CODES` | `serialize.js` (E1) |
| `no_uls_combination` | `ENGINE_CODES` | `engine.py` (E4) |

`results.test.mjs:108` sjekker at alle **registrerte** koder har melding, men ingenting
sjekker at **emitterte** koder er registrert. E5 skal legge til den mekaniske testen:
søk gjennom `js/*.js` og `python/engine.py` etter kode-literaler og påstå at hver enkelt
finnes i en av listene. Det er den testen som gjør at neste runde ikke kan glemme det.

---

## 8. Arbeidsdeling — disjunkte filer

| agent | eier | bølge |
|---|---|---|
| **E1 modell** | `js/rebar.js`, `js/store.js`, `js/serialize.js`, `tests/rebar.test.mjs`, `tests/store.test.mjs`, `tests/serialize.test.mjs` | 1 |
| **E2 parser** | `js/combo-io.js` (ny), `tests/combo-io.test.mjs` (ny) | 1 |
| **E3 grensesnitt** | `js/ui.js`, `index.html` | 2 |
| **E4 motor** | `python/engine.py`, `js/payload.js`, `tests/payload.test.mjs`, `tests/python/*` | 2 |
| **E5 rapport** | `js/report.js`, `js/results.js`, `tests/report.test.mjs`, `tests/results.test.mjs` | 3 |

Endringer mot utkast 1, alle funnet i gjennomgangen:

- **`tests/payload.test.mjs` hadde ingen eier.** Den påstår eksakt `JSON.stringify`-likhet
  (`:118`) mot en forventet payload uten `type` (`:72`), og ryker i det sekundet feltet
  legges inn. Den tilhører E4.
- **`js/results.js` eies av E5, men E1 og E4 emitterer koder inn i den.** Løst ved at E5
  registrerer begge kodene fra §7.1 og skriver den mekaniske testen. E1 og E4 rører ikke
  filen.
- **E3 trenger et bulk-API som ikke finnes.** `addCombo` × 200 gir 200 `notify()` og 200
  `render()`, og `setState({combos})` omgår `comboSeq` (som bare bumpes i `nextComboId`
  og `replaceState`, `store.js:176, 388`). **E1 lager `setCombos(rows, mode)`** med
  `mode` = `'replace' | 'append'`, som tildeler id-er fra telleren, kjører alle tre
  `enforce*` og varsler **én** gang.
- **Bølge 3 er skilt ut.** E5 tester mot resultatformen E4 lager. I utkast 1 lå de i samme
  bølge, og E5 måtte da ha funnet på en fixtur selv — som §9 forbyr. Koordinatoren
  regenererer fixturene mellom bølge 2 og 3.
- Fixturene leses også av `section.test.mjs`, `section-draw.test.mjs`,
  `materials.test.mjs`, `charts.test.mjs` og `tests/wasm-verify.mjs`. Ingen agent eier
  dem; koordinatoren kjører hele suiten etter regenerering.
- `README.md:289` dokumenterer `combos`-formen og oppdateres av **koordinatoren**.

---

## 9. Akseptansekriterier

Hver av disse skal være en test, ikke en sjekkliste et menneske går gjennom.

**Modell og stat (E1)**
1. `createCombo` uten `type` gir `'uls'`. **Og** `createCombo(s, {type: null})`,
   `{type: ''}` og `{type: 'tull'}` gir alle `'uls'` — normaliseringen skjer etter
   `...patch`.
2. En ukjent type i en fil gir `combo_type_unknown` fra `fromDocument`, og raden blir `uls`.
3. `enforceActiveCombo` flytter `activeCombo` til første `uls`-rad fra **hver av de sju
   dørene** i §2.4-tabellen. Sju tester. `setActiveCombo` og `setState` er de to som
   ikke har noen håndheving i dag.
4. Finnes ingen `uls`-rad, står `activeCombo` urørt — regelen er enveis.
5. `setCombos(rows, 'append')` tildeler nye id-er uten kollisjon med eksisterende, og
   varsler nøyaktig én gang.

**Parser (E2)**
6. `ULS 1\tuls\t-500\t-250\t120` gir `{name:'ULS 1', type:'uls', N_Ed:-500, M_Ed:-250, V_Ed:120}`.
7. `1 234,5` med hardt mellomrom gir `1234.5`; `1.234,5` og `1e3` avvises.
8. `\r\n` som linjeskift gir samme resultat som `\n`. **Denne er den enkeltfeilen som
   mest sannsynlig gjør funksjonen ubrukelig i praksis.**
9. `ULS`, `Quasi-permanent` og `quasi permanent` normaliseres; `tull` avvises.
10. En `direction`-kolonne avviser hele importen med meldingen i §3.4.
11. Overskriftsrad uten `V_Ed` avviser hele importen og navngir kolonnen.
12. 201 rader avvises, 200 godtas; 21 kolonner avvises.
13. **Rundtur:** `parseCombos(formatCombos(rows)).rows` gir `rows` tilbake — også for et
    navn som er `=SUM(A1)`, et navn med tabulator, og et navn med `'` foran.
14. Fem kolonner der kolonne 2 er et tall, uten overskriftsrad, avvises med beskjed om at
    overskriftsrad trengs.

**Grensesnitt (E3)**
15. `<script>alert(1)</script>` som navn kommer ut som tekst i forhåndsvisningen.
    Kriteriet krever DOM; det hører hjemme i nettleserverifiseringen, ikke i `node --test`.
16. **Tab fra typenedtrekken går til navnefeltet, og Shift+Tab tilbake**, etter at en
    type er endret. Runde 3-regresjonen.

**Motor (E4)**
17. To rader, én `uls` og én `characteristic`: den dimensjonerende er ULS-raden,
    `characteristic`-raden har `checked: false`, og `all_ok` er uendret mot en payload
    uten SLS-raden.
18. En `characteristic`-rad med `V_Ed` stor nok til å briste: `shear_ok` forblir `true`
    og `shear_governing` peker ikke på den.
19. Rad 0 er `characteristic`, rad 1 er `uls`: `as_min` regnes mot **rad 1**, ikke `None`.
    Uten denne ville A_s,min stille bestått.
20. Bare ikke-ULS-rader: `ok: false`, `error.code === 'no_uls_combination'`, og meldingen
    nevner **ikke** aksialkraftområdet.
21. En payload helt uten `type`-felt gir samme tall som før runden — alle seks
    resultatfixturer, absoluttverdier uendret.

**Rapport (E5)**
22. Ikke-ULS-raden står i tabellen med «Not checked», ikke utelatt.
23. Hver kode-literal i `js/*.js` og `python/engine.py` finnes i en av kodelistene i
    `results.js`. Mekanisk test, ikke en liste å vedlikeholde.

---

## 10. Det som IKKE skal gjøres i denne runden

- Ingen SLS-beregning. `characteristic` og `quasi_permanent` er etiketter som venter på
  veikart 4a og 4b.
- Ingen endring i materialmodellen — det er neste runde, og den rører de samme filene
  som E1 eier her.
- Ingen `direction`-kompatibilitet. Se §3.4.
- Ingen SCHEMA-bump. Se §6.
- Ingen ny UI-struktur. UI-overhalingen er veikart post 6 og kommer etter
  materialkatalogen.
