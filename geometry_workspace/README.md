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
| `js/geometry.js` | Ren polygonmatematikk — areal, 1./2. arealmoment, hovedakser, boolske operasjoner. Ingen DOM. |
| `js/store.js` | Tilstand, CRUD, undo/redo, localStorage, JSON-import/eksport |
| `js/viewport.js` | three.js-rendering i XY-planet (ortografisk kamera), rutenett, snapping, pan/zoom |
| `js/tools.js` | Tegne- og redigeringsverktøy; oversetter pekerhendelser til CRUD |
| `js/ui.js` | Panelrendering: geometriliste, formredigering, resultater |
| `js/main.js` | Bootstrap og hurtigtaster |
| `vendor/polygon-clipping.umd.js` | Boolske polygonoperasjoner (union/differanse). Vendored, så verktøyet virker uten nett. |

three.js hentes fra CDN via `importmap`.

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

## Enheter

Verktøyet er enhetsløst. Bruk samme lengdeenhet overalt (typisk mm), så blir areal
mm² og arealmomenter mm⁴.
