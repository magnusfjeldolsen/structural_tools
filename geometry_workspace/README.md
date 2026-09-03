# Geometry Workspace — tyngdepunkt og nøytralakse

Interaktivt 2D-workspace for å finne det arealvektede tyngdepunktet i sammensatte
tverrsnitt, og hvor det ligger i forhold til et valgt referansepunkt.

## Hvorfor

Tegn en vilkårlig sammensatt geometri og få tyngdepunktet, arealmomentene og
hovedaksene — målt fra et referansepunkt du selv velger. Nyttig når tverrsnittet er
for uregelmessig til å slås opp i en tabell, og man ellers ville endt med å gjette.

Overlappende former kan telles én eller to ganger. Det siste høres rart ut, men er
riktig for skallmodeller: en ringmur og en bunnplate modellert i hver sin senterflate
overlapper i hjørnet, og modellen har begge elementene til stede der. En virtuell stav
integrerer over begge, så tyngdepunktet staven må ligge i for å slippe uønskede
aksialkrefter, er det med overlappet talt to ganger.

## Filstruktur

| Fil | Ansvar |
| --- | --- |
| `index.html` | UI-skall, paneler og hjelpetekst |
| `js/geometry.js` | Ren polygonmatematikk — areal, 1./2. arealmoment, hovedakser, transformasjoner, boolske operasjoner. Ingen DOM. |
| `js/shapes.js` | Kjenner igjen parametriske former (rektangel, sirkel, skall) i en punktliste, og bygger punktene tilbake fra parameterne. Ingen DOM. |
| `js/store.js` | Tilstand, CRUD, undo/redo, localStorage, JSON-import/eksport |
| `js/viewport.js` | three.js-rendering i XY-planet (ortografisk kamera), rutenett, snapping, pan/zoom |
| `js/tools.js` | Tegne- og redigeringsverktøy; oversetter pekerhendelser til CRUD |
| `js/ui.js` | Panelrendering: geometriliste, formredigering, plassering, resultater |
| `js/materials.js` | Materialpresets med E [N/mm²]. Ingen DOM. |
| `js/reinforcement.js` | Mekanikken: E-vektet tverrsnitt, aksialfordeling, skjærstrøm, forankring, Volkersen, forbinderkontroll (skrue/lim/sveis). Rene funksjoner, N og mm. Ingen DOM. |
| `js/joints.js` | Skjøtelinjer: naboskap (`shapesTouch`), en kraftig nedskalert graf (kun til ΔN-ruting og advarsler), og halvplan-avskjæring for ES* (`halfPlaneParts`/`fullSectionParts`). Erstatter det slettede `interfaces.js`. Ingen DOM. |
| `js/reinforcement-ui.js` | Broen modell → mekanikk (all enhetsomregning ett sted) og rendering av «Forsterkning»-fanen (resultater og de globale lastfeltene) |
| `js/main.js` | Bootstrap og hurtigtaster |
| `tests/reinforcement.test.mjs` | Fasit for mekanikken. `node geometry_workspace/tests/reinforcement.test.mjs` |
| `tests/joints.test.mjs` | Fasit for naboskap, grafen og halvplan-ES*. `node geometry_workspace/tests/joints.test.mjs` |
| `vendor/polygon-clipping.umd.js` | Boolske polygonoperasjoner (union/differanse). Vendored, så verktøyet virker uten nett. |

three.js hentes fra CDN via `importmap`.

## Plassere geometri

Geometri skal kunne plasseres presist, ikke bare dras omtrentlig. Fire verktøy
virker på **utvalget**, med snapping og orto som ellers — og geometrien som er i
bevegelse snapper ikke mot seg selv:

| Verktøy | Tast | Flyt |
| --- | --- | --- |
| Flytt | `M` | basispunkt → sluttpunkt |
| Kopi | `K` | basispunkt → der kopien skal ligge. Verktøyet blir stående med samme basispunkt, så flere kopier kan settes etter hverandre. Menyen har «antall» for en rekke med jevn avstand. |
| Roter | `T` | rotasjonssenter → referansepunkt for startvinkelen → sluttvinkel. `Shift` låser til 15°. |
| Speil | — | to klikk definerer speilaksen; menyen velger om originalen beholdes |
| Skjøt | `G` | to klikk langs skjøtelinja (se «Skjøter og forsterkning» under) |
| Del med linje | `X` | to klikk for snittlinja; deler hver MARKERTE form linja krysser. Redigeringsverktøy, ikke en forutsetning for beregningen. |

Hver kommando er **ett angresteg**. `Esc` er en kaskade der ett trykk alltid
skal gi et rent utgangspunkt: står markøren i et tallfelt, forlates feltet; er
en kommando i gang, avbrytes den og geometrien settes tilbake; ellers tømmes
utvalget. Hjelpedialogen og verktøymenyen lukkes uansett, og steg 1 og 2 skjer i
samme trykk. De samme kommandoene finnes som tallfelt i
verktøymenyene og i «Plassering» i venstre panel, der de virker på hele utvalget
under ett. «Sentrer utvalg i origo» og «Sentrer alt i origo» flytter
nullpunktet med samme vektor, slik at referansemålene ikke endrer seg av
flyttingen.

## Parametrisk redigering

Å endre en bjelkehøyde ved å regne ut fire hjørnekoordinater er klumsete.
`shapes.js` kjenner derfor igjen hva en form er, og egenskapspanelet lar den
redigeres med sine egne parametre:

- **Rektangel** — `b`, `h` og rotasjon, også når rektangelet er rotert
  (kantvektorene brukes, ikke omskreven boks). Ankerpunktet (senter, nedre
  venstre eller midt på underkant) bestemmer hva som står stille når `b` eller
  `h` endres.
- **Sirkel** — senter og radius.
- **Skall** — senterlinje og tykkelse.

Parameterne utledes **alltid fra punktene**, aldri fra `meta`. Drar man et
hjørne slik at formen ikke lenger er et rektangel, forsvinner feltene — panelet
viser aldri tall som ikke stemmer med geometrien. `meta` er bare en huskelapp
for hva formen er *ment* som, og hvilket anker som sist ble brukt.

Koordinatlista kan vises absolutt eller relativt til formens eget tyngdepunkt.
Begge kan redigeres.

## Beregningen

Arealegenskapene integreres eksakt over polygonkantene (Greens formel):

```
A    = ½ Σ (xᵢ·yᵢ₊₁ − xᵢ₊₁·yᵢ)
Sx   = ∫ y dA      Sy = ∫ x dA
Ix0  = ∫ y² dA     Iy0 = ∫ x² dA     Ixy0 = ∫ xy dA
```

Tyngdepunktet er `x̄ = Sy/A`, `ȳ = Sx/A`, og arealmomentene flyttes til
tyngdepunktsaksene med Steiners sats. Hovedaksene følger av Mohrs sirkel.

### Overlapphåndtering

To modi:

- **Skallmodell (`sum`, standard)** — hver form bidrar med hele sitt areal, også der
  formene overlapper, og hull trekkes fra. Dette speiler FEM-modellen: begge skallene
  finnes i overlappsonen, så materialet der teller to ganger. Overlappsonen regnes ut
  som unionen av parvise snitt mellom de faste formene, og tegnes opp i oransje.
- **Fysisk tverrsnitt (`priority`)** — lista er en prioritetsrekkefølge. Hver form får
  bare det arealet ingen form over den allerede har krevd (`difference` mot unionen av
  de foregående). Overlapp telles dermed nøyaktig én gang, og tyngdepunktet er
  uavhengig av rekkefølgen så lenge alle formene har samme vektfaktor.

Vektfaktoren på hver form er ment som E-forhold ved transformert tverrsnitt; med
faktorer ulik 1 er «tyngdepunktet» nøytralaksen til det transformerte tverrsnittet.

## Skjøter og forsterkning — skjærstrøm i skjøten

Høyre panel har to faner. **«Tverrsnitt»** er tyngdepunktet og arealmomentene
som før. **«Forsterkning»** svarer på hvor mye kraft en **skjøt** må ta opp —
enten det er en ny del som festes til et eksisterende profil, eller en ren
kontroll av en eksisterende sveis («hvor mye går det i sveisen mellom flens og
steg i denne gamle bjelken»). Det er samme fysiske spørsmål og samme formel;
verktøyet skiller ikke mellom dem.

### Ett primitiv: skjøten

En **skjøt** (`js/joints.js`) er en linje tegnet i tverrsnittsplanet. Den har
ingen side å velge: `ES*` for hele tverrsnittet er per definisjon null (det er
slik nøytralaksen `y_c` er bestemt), så de to sidene av samme snitt gir like
store `ES*` med motsatt fortegn — `|q|` er identisk uansett hvilken side man
regner fra. Skjøteverktøyet (`G`) tegner derfor bare en tydelig linje med
endemarkører, ingen piler, intet «snu siden».

**Den implisitte naboskapsregelen**: former som berører eller overlapper
hverandre, og som det *ikke* ligger en skjøt mellom, regnes automatisk som
stivt forbundet (`shapesTouch` i `joints.js`). Tegner du en I-profil som tre
rektangler og bare sveiser flensen mot steget, vet verktøyet likevel at steg
og underflens sitter sammen — ingen ekstra skjøt trengs der.

### ES* fra halvplanet, ikke en graf

Et snitt er en rett linje. Forlenget uendelig deler den planet i to halvplan,
og **gruppa er alt som ligger på den ene siden** — akkurat som i klassisk
bjelketeori (`Q` = statisk moment av arealet på den ene siden av snittet).
`halfPlaneParts(joint, shapes, side)` klipper hele geometrien mot halvplanet
med `intersectionMulti` og integrerer med `multiProps`; `fullSectionParts`
gir tilsvarende for hele tverrsnittet. Fordelen: det virker uendret på en
**udelt, importert profil** — du trenger ikke splitte geometrien for å kunne
snitte i den. En liten graf (`buildGraph`/`jointGroup`) er beholdt, men bare
til to ting: å rute aksialleddet `ΔN` til riktig skjøt, og advarsler (en ny
form uten noen skjøt, eller en del festet med flere skjøter samtidig —
statisk ubestemt, se `share`-feltet).

### To lasttilstander — superposisjon

```js
loads: {
  before: { V, N, M },   // virker på tverrsnittet av bare 'existing'-formene
  after:  { V, N, M },   // virker på det sammensatte tverrsnittet
  L,                      // forankringslengde for ΔN, i arbeidsenheten
}
```

Den eksisterende bjelken bærer allerede `before`-lasten idet forsterkningen
monteres — bare `after` virker på det sammensatte tverrsnittet. Per skjøt:

```
q_før   = V_før · ES*_eks / EI_eks     (bare hvis skjøten ligger HELT i eksisterende materiale)
q_etter = V_etter · ES* / EI            (halvplanet mot det sammensatte tverrsnittet)
q_V,tot = |q_før| + |q_etter|
q_N     = ΔN_i / L                      (aksialleddet, fra grafen — se over)
q_tot   = q_V,tot + q_N
```

En skjøt mot en ny del har ingen «før»-tilstand. Er **alle** former merket
`existing` (ingen forsterkning i det hele tatt), skjuler fanen automatisk
«etter»-tilstanden, aksialfordelingen og Volkersen, og viser bare «før» og
skjærstrømmen per skjøt — dette er ren-eksisterende-modus, og er det som gjør
verktøyet nyttig for kontroll av en gammel konstruksjon uten noen ny del.

`q_N = ΔN/L` er en middelverdi. Volkersen-modellen (`λ² = k(1/α + 1/β)`) viser
hvor mye høyere toppene i skjøteendene ligger, med `k = G_a·b/t_a` for lim og
`k = K_ser·rader/s` for skruer.

### Forbindelsestyper

Skjøtelista i venstre panel (under geometrilista) er der en skjøt redigeres:
navn, forbindelsestype, heftbredde og — når oppsettet er statisk ubestemt —
andelen av `ΔN` som går gjennom nettopp den skjøten. Tre typer:

- **Skruer/mekaniske forbindere** — `F_Rd` [kN] per forbinder, rader, senter-
  avstand `s`, `K_ser`. `s_req = rader·F_Rd·1000/q_tot`.
- **Lim** — `τ_Rd`, `G_a`, `t_a`. `τ = q_tot/b`, `util = τ/τ_Rd`.
- **Sveis** — `q_Rd = n_sveiser · a · f_vw,d` [N/mm], eller en direkte `q_Rd`.
  `f_vw,d` (dimensjonerende skjærfasthet i sveisesnittet) regnes **ikke** ut
  her — den hentes fra modulen `weld_capacity/`. `util = q_tot/q_Rd`. En
  sveiseskjøt har ingen senteravstand å løse for (`sReq` er `null`).

Arbeidsflyten:

1. (Bare ved forsterkning) Merk hver form som **eksisterende** eller **ny**,
   og velg materiale. Nye former får stiplet kontur i lerretet.
2. Tegn **skjøten** (`G`): to klikk langs linja. Autonavnes etter delene den
   skiller. Rediger forbindelsestype, felter og heftbredde i skjøtelista.
3. Legg inn lastene i fanen «Forsterkning» — `before` og (hvis relevant)
   `after`, samt forankringslengden `L`.
4. Les av `q_før`, `q_etter`, `q_N`, `q_tot`, `τ` og forbinderkontrollen per
   skjøt, i skjøtekortet i fanen.

Hver størrelse vises som **formel → innsatte tall → resultat med enhet**.

**Forutsetninger:** full samvirkning (tverrsnittet forblir plant, ingen
glidning), lineær elastisitet. Beregningen er **iterativ i praksis**: ny
geometri gir ny stivhet, som gir nye krefter.

### Enheter i forsterkningsberegningen

Mekanikken regnes i **N og mm**, uavhengig av arbeidsenheten. Omregningen
skjer ett sted, i `reinforcement-ui.js`: former OG skjøter skaleres til mm
(`shapesMm`/`jointsMm`, punktene ganget med `k` = mm per arbeidsenhet) FØR de
mates inn i `halfPlaneParts`/`fullSectionParts`/`buildGraph`, lastene går
gjennom `kNtoN`/`kNmToNmm`, og `L` ganges med `k`. Forbinderdataene er derimot
alltid absolutte — `F_Rd` [kN], `s` [mm], `K_ser` [N/mm], `τ_Rd`/`G_a` [N/mm²],
`t_a` [mm], `a_weld`/`fvwd`/`qRd` og heftbredde-overstyringen [mm] — slik at
et bytte fra mm til m ikke endrer skrue- eller sveisekapasiteten.

## Datamodell (v3)

Hver form har i tillegg til geometrien:

```js
stage: 'existing' | 'new'                 // standard 'existing'
material: { name: 'S355', E: 210000 }     // E i N/mm²
```

`factor` og `material.E` er **uavhengige**: `factor` er vektfaktoren for
tyngdepunktsberegningen, mens `material.E` hører til forsterkningsberegningen.

`state.joints` (tidligere `interfaces`) er lista over skjøter:

```js
{
  id: 'j1',
  name: 'Steg ↔ Overflens',       // autogenereres av delene den skiller
  a: [x, y], b: [x, y],
  bondWidth: null,                 // null ⟹ linjas lengde
  share: null,                     // null ⟹ automatisk lik fordeling ved statisk ubestemt oppsett
  connector: {
    kind: 'screw' | 'glue' | 'weld',
    FRd, rows, spacing, Kser,      // skrue
    tauRd, Ga, ta,                 // lim
    qRd, a_weld, fvwd, nWelds,     // sveis — qRd overstyrer utledningen om satt
  },
}
```

`state.loads` er `{ before: {V,N,M}, after: {V,N,M}, L }` — se «To
lasttilstander» over. Eksport-JSON er `version: 3`; filer og lagret tilstand
fra versjon 1 og 2 migreres ved innlasting (gammel `interfaces` → `joints`,
gammel flat `loads` → `{ before: 0, after: {...} }`), så gamle modeller åpnes
uten feil.

## Enheter

Verktøyet er enhetsløst. Bruk samme lengdeenhet overalt (typisk mm), så blir areal
mm² og arealmomenter mm⁴.
