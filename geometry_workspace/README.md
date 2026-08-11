# Geometry Workspace — tyngdepunkt og nøytralakse

Interaktivt 2D-workspace for å finne det arealvektede tyngdepunktet i sammensatte
tverrsnitt, og hvor det ligger i forhold til et valgt referansepunkt.

## Hvorfor

Når en vegg og en bunnplate modelleres med skallelementer i FEM-Design, ligger begge
i sin egen senterflate og overlapper derfor i hjørnet. Skal man legge inn en virtuell
stav langs skjæringslinja uten at den plukker opp aksialkrefter av å ligge forskjøvet
i forhold til den felles nøytralaksen, må staven ligge i tyngdepunktet til det
sammensatte tverrsnittet — med overlappet talt bare én gang. Dette verktøyet regner
ut det punktet i stedet for at man må gjette.

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

- **Netto (`priority`)** — lista er en prioritetsrekkefølge. Hver form får bare det
  arealet ingen form over den allerede har krevd (`difference` mot unionen av de
  foregående). Overlapp telles dermed nøyaktig én gang, og nettotyngdepunktet er
  uavhengig av rekkefølgen så lenge alle formene har samme vektfaktor.
- **Sum (`sum`)** — klassisk sammensatt tverrsnitt der hver del summeres for seg og
  hull trekkes fra. Overlapp telles dobbelt. Nyttig som sammenligning.

Vektfaktoren på hver form er ment som E-forhold ved transformert tverrsnitt; med
faktorer ulik 1 er «tyngdepunktet» nøytralaksen til det transformerte tverrsnittet.

## Enheter

Verktøyet er enhetsløst. Bruk samme lengdeenhet overalt (typisk mm), så blir areal
mm² og arealmomenter mm⁴.
