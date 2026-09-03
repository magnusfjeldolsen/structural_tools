# Geometry workspace — interaksjon, tallinntasting og opprydding i panelet

Tredje runde. Verktøyet regner riktig; nå skal det bli raskt å bruke. Målet er
at det skal kunne brukes til virkelige forsterkningsberegninger på jobb.

Alt UI-språk er norsk. Norske kommentarer, samme stil som resten av modulen.

---

## 0. Utgangspunktet: to feil og et prinsipp

**Feil 1 — sentrering glemmer skjøtene.** «Sentrer utvalg i origo» og «Sentrer
alt i origo» flytter formene og nullpunktet, men lar skjøtelinjene ligge igjen.
Geometrien og skjøtene glir dermed fra hverandre.

**Feil 2 — skjøter kan ikke velges.** De kan ikke markeres i lerretet, ikke
flyttes, ikke slettes. De er tegnet, men ikke redigerbare.

**Prinsippet som styrer resten:** panelet skal ikke være et sted man går for å
utføre operasjoner. Man **velger geometri i lerretet, starter et verktøy, og
skriver eller klikker**. Panelet viser tilstand og egenskaper — det er ikke et
kommandosenter. Flere av dagens seksjoner bryter med dette og skal bort.

---

## 1. Entiteter og utvalg

I dag er `state.selection` en liste med form-id-er. Den må kunne holde både
former og skjøter.

Skjøte-id-er er `j1, j2, …` og form-id-er `s1, s2, …`, altså allerede unike på
tvers. Vi beholder derfor `selection` som en flat liste med id-er, og legger til
i `store.js`:

```js
entityById(id)        // → { kind: 'shape' | 'joint', obj } | null
selectedEntities()    // → [{ kind, obj }]
selectedJoints()      // → Joint[]
```

`selectedShapes()` beholdes uendret, så eksisterende kall ikke brytes.

**Alle kommandoer skal virke på hele utvalget, uansett blanding:**

| Kommando | Form | Skjøt |
| --- | --- | --- |
| Flytt / kopi / roter / speil | punktene transformeres | `a` og `b` transformeres |
| Slett | fjernes | fjernes |
| Sentrer i origo | punktene flyttes | `a` og `b` flyttes |

**Sentrering (feil 1):** forskyvningsvektoren regnes som i dag ut fra det
arealvektede tyngdepunktet av formene, men skal deretter brukes på **formene,
skjøtene og nullpunktet**. Ett angresteg.

**Valg av skjøt i lerretet (feil 2):** treff på en skjøtelinje innenfor ~8 px
skal markere den. Skjøter prioriteres foran former ved treff, siden linja er
tynn og ellers vanskelig å treffe. Marquee-valg tar med skjøter der begge
endepunkt ligger inne i vinduet. Markert skjøt tegnes fremhevet, og dens
endepunkt får håndtak som kan dras (samme mønster som formenes hjørnepunkt).

---

## 2. Tallinntasting — det viktigste i denne runden

I dag må man ta seg til et felt i panelet for å flytte noe nøyaktig. Det skal
erstattes av CAD-aktig inntasting rett i lerretet.

### 2.1 Oppførsel

Når et verktøy venter på et punkt, og brukeren trykker en tast som starter et
tall — `0-9`, `-`, `.`, `,` — eller `d`/`D`, åpnes et lite inntastingsfelt.
Feltet vises **ved markøren**, eller nederst i lerretet hvis det ikke er plass.

- **Skilletegn mellom x og y:** mellomrom eller tab. **Ikke komma** — komma er
  desimaltegn på norsk.
- **Desimaltegn:** både `.` og `,` godtas og betyr det samme.
- **`Enter`** bekrefter. **`Esc`** lukker feltet og går tilbake til å peke, uten
  å avbryte selve kommandoen. Andre `Esc` avbryter kommandoen, som ellers.
- **`Tab`** flytter mellom x og y hvis feltet er delt i to; ellers er det bare
  et skilletegn i én streng. Velg én av delene og vær konsekvent.

### 2.2 Absolutt og relativt

| Inntasting | Betyr |
| --- | --- |
| `300 200` | absolutt punkt (300, 200) i arbeidsenheten |
| `D 300 200` | forskyvning `Δx = 300`, `Δy = 200` fra forrige punkt |
| `d300 200` | samme — mellomrom etter `d` er valgfritt |
| `@300 200` | samme som `D` (AutoCAD-vane, gratis å støtte) |

Prefikset `D` gjelder **relativt til forrige punkt** i kommandoen (basispunktet
under flytting, forrige hjørne under polygontegning).

### 2.3 Flyten for flytting, som brukeren beskrev den

1. Velg geometrien i lerretet.
2. `M` starter flytting.
3. **Enten** klikk basispunkt, **eller** begynn å skrive.
   - Skriver man `D 300 200` **før** et basispunkt er satt, er det en ren
     forskyvning: kommandoen utføres med én gang. Dette er den raskeste veien,
     og skal virke.
   - Skriver man `300 200` uten prefiks før basispunkt, tolkes det som
     basispunktet.
4. Etter basispunktet: klikk sluttpunkt, eller skriv absolutt eller `D`-relativt.

Samme mønster skal virke for **kopi**, **roter** (der andre inntasting er en
**vinkel i grader**, ikke et punkt), **speil** (to punkt på aksen), **del med
linje**, og for tegneverktøyene (rektangel, skall, polygon, sirkel — der andre
inntasting for sirkel er **radius**).

### 2.4 Implementasjon

Legg dette i en egen modul, `js/numeric-input.js`, som en liten tilstandsmaskin
uavhengig av hvilket verktøy som er aktivt:

```js
new NumericInput({ onCommit(value, mode), onCancel(), getUnit() })
  .beginIfTypingKey(event)   // → true hvis tasten startet inntasting
  .expect('point' | 'delta' | 'length' | 'angle')
```
`onCommit` får `{ kind: 'point'|'delta'|'length'|'angle', x, y, value }`.

Verktøyene i `tools.js` spør ikke om tastetrykk selv — `main.js` sender
tastetrykk til `NumericInput` først, og bare hvis den ikke tok tasten, videre
til dagens hurtigtasthåndtering. Det er dette som gjør at «bare begynn å skrive»
virker uten at hvert verktøy må implementere det.

**Fallgruve:** hurtigtastene `d` og sifrene må ikke lenger utløse verktøybytte
når et verktøy venter på et punkt. `Alt`+siffer (snap) skal fortsatt virke og
har forrang.

---

## 3. Hurtigtaster

`C` og `R` skal bli kopi og rotasjon. Tegneverktøyene flytter derfor:

| Tast | Verktøy | Mnemonikk |
| --- | --- | --- |
| `V` | Velg | uendret |
| `M` | Flytt | uendret |
| `C` | Kopier | **c**opy |
| `R` | Roter | **r**oter |
| `B` | Rektangel | **b**oks |
| `S` | Skall | uendret |
| `P` | Polygon | uendret |
| `O` | Sirkel | `O` er rund |
| `N` | Nullpunkt | **n**ullpunkt |
| `G` | Skjøt | uendret |
| `X` | Del med linje | kutt |
| `F` | Zoom alt | uendret |
| `F8` / `Alt+0` | Orto | uendret |
| `Alt+1…6`, `Alt+9` | Snap | uendret |

Speiling får ingen tast i denne runden — bare verktøyknapp.
Hjelpedialogen og README oppdateres.

---

## 4. Opprydding i venstre panel

### 4.1 Fjernes helt
- **«Marker former for å transformere dem»** med `Δx`/`Δy` og «Flytt» — erstattes
  av tallinntastingen i §2.
- **«Senter for rotasjon og speiling»** og **«Vinkel [°]» + «Roter»** — rotasjon
  gjøres med roteringsverktøyet, som allerede lar brukeren peke ut senteret.
- **«Behold originalen ved speiling»** som fast felt — se §4.2.
- **«Dupliser» / «Slett» / «Tøm»**-knappene — velg og trykk `Del`. `Ctrl+D`
  beholdes for duplisering. «Tøm alt» flyttes til menyen bak «Importer», der de
  andre modell-operasjonene ligger.

### 4.2 Verktøyalternativer nederst til venstre
Alternativer som hører til det **aktive** verktøyet vises i en liten, dempet
boks nederst til venstre i lerretet, ikke i panelet. Boksen er tom og skjult når
verktøyet ikke har alternativer.

- Speil: «behold originalen» (av/på)
- Kopi: «antall kopier»
- Skall: «tykkelse»
- Roter: «lås til 15°» (informativt — `Shift` gjør det uansett)

### 4.3 Rutenett og enhet
Rutenettets steglengde og arbeidsenheten skal ikke ligge øverst i panelet. Flytt
dem inn i en liten innstillingsmeny — naturlig plass er ved siden av
snap-kontrollen nede til høyre i lerretet, som allerede er der
tegneinnstillingene bor. Rutenett av/på beholdes som en snarvei der.

### 4.4 Bildeunderlag under «Importer»
«Bildeunderlag» skal ikke være en egen seksjon i panelet. «Importer»-knappen i
topplinja blir en liten meny:

- Importer modell (JSON) — som i dag
- Importer bilde som underlag
- Tøm all geometri

Innliming med `Ctrl+V` skal fortsatt virke, og fildropp på lerretet likeså.
Når et bilde ER lagt inn, vises bildets egenskaper (synlig, låst,
gjennomsiktighet, plassering, kalibrering) i panelet som i dag — men seksjonen
er skjult så lenge det ikke finnes noe bilde.

### 4.5 Det som blir igjen i venstre panel
Verktøyrad, «Plassering» (bare de to sentreringsknappene), geometriliste med
egenskaper, og skjøtelista. I den rekkefølgen.

---

## 5. Skjøtelista

Skjøtene skal ha sin egen liste i venstre panel, under geometrilista, bygget
som geometrilista: en rad per skjøt som kan åpnes.

- Rad: navn (autogenerert, redigerbart), lengde, forbindelsestype, og en
  slette-knapp.
- Åpnet: delene på hver side (fra `sidesOfJoint`), heftbredde `b`,
  forbindelsesvalg med felter, og `share` når oppsettet er statisk ubestemt.
- Klikk i lista markerer skjøten i lerretet, og omvendt. Hover fremhever.

---

## 6. Arbeidsdeling

Alt dette ligger i de samme filene, så det kjøres **serielt**, ikke parallelt.

| Bølge | Innhold | Filer |
| --- | --- | --- |
| **2B** | Forsterkningspanelet: to lasttilstander, ren-eksisterende-modus, sveis som forbindelse, skjøtelista (§5) | `js/reinforcement-ui.js`, `js/ui.js`, `index.html` (høyre panel + skjøteliste), `README.md` |
| **2C** | Interaksjon: §1 (utvalg og sentrering), §2 (tallinntasting), §3 (hurtigtaster), §4 (opprydding) | `js/numeric-input.js` (ny), `js/tools.js`, `js/main.js`, `js/store.js`, `js/ui.js`, `js/viewport.js`, `index.html` |

2C er den største og mest inngripende. Den kjøres sist, slik at panelet er
ferdig og kan brukes som referanse for hva som skal stå igjen.

---

## 7. Felleskrav

- Statisk HTML/JS, ingen byggesteg. GA-taggen urørt rett etter `<head>`.
- Hver kommando er ett angresteg; `Esc` ruller tilbake.
- `node tests/joints.test.mjs` (13/13) og `tests/reinforcement.test.mjs` (12/12)
  skal fortsatt bestå.
- Verifiser i nettleseren, ikke bare i node. Chrome cacher JS-modulene hardt —
  tving fersk kode med `fetch(fil, {cache:'reload'})` før `location.reload()`.
  `requestAnimationFrame` står stille i en bakgrunnsfane; tving opptegning i
  stedet for å vente.
- Ingen commit — hovedagenten committer.
