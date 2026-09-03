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
| `js/reinforcement.js` | Mekanikken: E-vektet tverrsnitt, aksialfordeling, skjærstrøm, forankring, Volkersen, forbinderkontroll. Rene funksjoner, N og mm. Ingen DOM. |
| `js/interfaces.js` | Grensesnittene mellom eksisterende og ny del: geometri (hvilken side er hvilken), heftbredde og CRUD mot store. Ingen DOM. |
| `js/reinforcement-ui.js` | Broen modell → mekanikk (all enhetsomregning ett sted) og rendering av «Forsterkning»-fanen |
| `js/main.js` | Bootstrap og hurtigtaster |
| `tests/reinforcement.test.mjs` | Fasit for mekanikken. `node geometry_workspace/tests/reinforcement.test.mjs` |
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
| Grensesnitt | `G` | to klikk i skjøten mellom eksisterende og ny del (se «Forsterkning» under) |

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

## Forsterkning — skjærstrøm i grensesnittet

Høyre panel har to faner. **«Tverrsnitt»** er tyngdepunktet og arealmomentene som
før. **«Forsterkning»** svarer på hvor mye kraft forbindelsen mellom et
eksisterende og et nytt profil må ta opp.

Grunnligningen er `q(x) = dN(x)/dx` [N/mm langs bjelkeaksen]. To bidrag:

```
Bøyning:      q_V = V · ES* / EI      ES* = Σ_gruppe Eᵢ·Aᵢ·(yᵢ − y_c)
Aksialkraft:  N_i = N · EᵢAᵢ / ΣEⱼAⱼ  ⟹  q_N = ΔN / L
Sammen:       q_tot = |q_V| + |q_N|,   τ = q_tot / b
```

`y_c = ESx/EA` er den E-vektede nøytralaksen — samme punkt som tyngdepunktet i
det transformerte tverrsnittet. `ES*` regnes alltid om den **sammensatte**
nøytralaksen, ikke om gruppas egen. Er E lik overalt, forkorter E bort og
`q = VQ/I`. De to sidene av samme snitt gir like store `ES*` med motsatt
fortegn, så `|q|` er den samme uansett hvilken side man regner fra.

`q_N = ΔN/L` er en middelverdi. Volkersen-modellen (`λ² = k(1/α + 1/β)`) viser
hvor mye høyere toppene i skjøteendene ligger, med `k = G_a·b/t_a` for lim og
`k = K_ser·rader/s` for skruer.

Arbeidsflyten:

1. Merk hver form som **eksisterende** eller **ny**, og velg materiale (eller
   skriv E fritt). Nye former får stiplet kontur i lerretet.
2. Tegn **grensesnittet** (`G`): to klikk i skjøten. Verktøyet gjetter
   gruppesiden (venstre for a→b, og av dem de som er merket «ny» hvis det gir et
   ikke-tomt sett), tegner piler den veien, og bruker linjas lengde som
   heftbredde `b`. «Snu siden» retter et feil gjett.
3. Legg inn `V_Ed`, `N_Ed`, `M_Ed` og forankringslengden `L`.
4. Les av `q_V`, `q_N`, `q_tot`, `τ` og forbinderkontrollen — nødvendig
   senteravstand for skruer, utnyttelse mot `τ_Rd` for lim.

Hver størrelse vises som **formel → innsatte tall → resultat med enhet**.

**Forutsetninger:** full samvirkning (tverrsnittet forblir plant, ingen
glidning), lineær elastisitet, og at kreftene gjelder det **sammensatte**
tverrsnittet — last som allerede sto på den eksisterende delen før montasje,
bæres av den alene. Beregningen er **iterativ i praksis**: ny geometri gir ny
stivhet, som gir nye krefter.

### Enheter i forsterkningsberegningen

Mekanikken regnes i **N og mm**, uavhengig av arbeidsenheten. Omregningen skjer
ett sted, i `reinforcement-ui.js`: arealegenskapene skaleres med `k²`, `k³`,
`k⁴` (`k` = mm per arbeidsenhet), lastene går gjennom `kNtoN`/`kNmToNmm`, og `L`
ganges med `k`. Forbinderdataene er derimot alltid absolutte — `F_Rd` [kN],
`s` [mm], `K_ser` [N/mm], `τ_Rd`/`G_a` [N/mm²], `t_a` [mm] og heftbredde-
overstyringen [mm] — slik at et bytte fra mm til m ikke endrer skruekapasiteten.

## Datamodell

Hver form har i tillegg til geometrien:

```js
stage: 'existing' | 'new'                 // standard 'existing'
material: { name: 'S355', E: 210000 }     // E i N/mm²
```

`factor` og `material.E` er **uavhengige**: `factor` er vektfaktoren for
tyngdepunktsberegningen, mens `material.E` hører til forsterkningsberegningen.

Modellen har også `interfaces: []` (grensesnitt mellom eksisterende og ny del)
og `loads: { V, N, M, L }` (`V`, `N` i kN, `M` i kNm, `L` i arbeidsenheten).
Eksport-JSON er `version: 2`; filer og lagret tilstand fra versjon 1 migreres
ved innlasting, så gamle modeller åpnes uten feil.

## Enheter

Verktøyet er enhetsløst. Bruk samme lengdeenhet overalt (typisk mm), så blir areal
mm² og arealmomenter mm⁴.
