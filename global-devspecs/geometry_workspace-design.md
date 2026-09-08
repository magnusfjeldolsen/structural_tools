# Geometry Workspace — beslutninger som bærer

Erstatter fem planleggingsdokumenter (`-reinforcement-`, `-joints-`,
`-interaction-`, `-composite-`, `-report-plan.md`, til sammen 2 188 linjer).
De var stillas under bygginga og hadde gjort jobben sin. Tre av dem inneholdt
dessuten feil som måtte rettes i koden etterpå — et dokument ingen leser er
verre enn ingen dokument, fordi det ser autoritativt ut.

Her står bare det en som skal endre modulen faktisk trenger å vite: valgene som
ikke er åpenbare fra koden, og hvorfor de er som de er.

---

## 1. Den styrende likningen

```
q = dN/dx                                    [N/mm]
```

Alt annet er spesialtilfeller:

| | Formel | Hva den er |
|---|---|---|
| `q_V` | `V·ES*/EI` | skjærkraftas skjærstrøm — **og momentets** |
| `q_N` | `ΔN/L` | ytre aksialkraft fordelt etter aksialstivhet |
| `q_tot` | `q_V,tot + q_N` | det skjøten må overføre |

**Momentet skal aldri gi et eget ledd i `q_tot`.** Siden `N_G = M·ES*/EI` og
`q = dN_G/dx`, *er* `q_V` momentets virkning. Et «bidrag fra M» ved siden av
«bidrag fra V» ville telt samme kraft to ganger. Momentets egen rolle er `N_G`,
den kumulative kraften fugen må ha levert fram til snittet — den gir et
**separat forankringskrav**, og de to kriteriene **konkurrerer, de summeres
ikke**: `q_styrende = max(q_tot, N_G/L)`.

`tests/derivation.test.mjs` låser dette: kraftlista er nøyaktig
`{q_før, q_etter, q_V,tot, q_N, q_tot}`, og testen feiler hvis en sjette post
dukker opp.

## 2. To lasttilstander, superponert

Den eksisterende bjelken bærer allerede «før»-lasten når forsterkningen
monteres. Bare «etter» virker på det sammensatte tverrsnittet.

```
q_V,tot = |q(V_før, bare eksisterende)| + |q(V_etter, sammensatt)|
```

En skjøt **mot en ny del** har ingen «før»-tilstand — den nye delen fantes
ikke da. `existingOnly` (skjøten har naboer, og ingen av dem er `stage:'new'`)
er testen som avgjør det, og den samme testen brukes i rapportens
Type-kolonne, slik at tabell og tall ikke kan komme i utakt.

## 3. Halvplanklipping gir `ES*` — grafen gjør det ikke

`ES*` regnes ved å klippe geometrien mot halvplanet på den ene siden av
skjøtelinja (`halfPlaneParts` i `joints.js`). Det er derfor brukeren **ikke**
trenger å dele geometrien for å regne på en skjøt, og det er derfor et snitt
gjennom en udelt, importert form virker.

`|q_V|` er identisk fra begge sider (`ES*_A = −ES*_B`), så siden er aldri et
brukervalg. Det var grunnen til at retningspilene på skjøtene ble fjernet.

Koblingsgrafen (`buildGraph`) er beholdt, men **bare** til to ting: å rute
`ΔN` til riktige deler, og advarslene (`danglingShapes`, `overConstrained`).
Aldri til `ES*`.

## 4. Biaksiell, koblet bøyning

Momenter oppgis om **x- og y-aksen**, ikke om hovedaksene — det er slik
brukeren tenker. Koblingen `EI_xy` regnes med:

```
D  = EI_x·EI_y − EI_xy²
κx = (M_x·EI_y − M_y·EI_xy)/D
q  = [(V_y·EI_y − V_x·EI_xy)·ES*_x + (V_x·EI_x − V_y·EI_xy)·ES*_y] / D
```

Den gamle ukoblede formelen var **58 % ukonservativ** på et tverrsnitt med
`EI_xy ≠ 0` (54,93 mot riktige 34,78 N/mm). Ikke gå tilbake til den.

Fortegnskonvensjonene står i `axisConventionHtml()` i `reinforcement-ui.js`,
og vises i hjelpen. Merk avviket: `M_y` er her `∫σx dA`, ikke den vanlige
`−∫σx dA`.

## 5. γ-metoden: `γ_ref = 1`

EC5 tillegg B setter `γ` for **referansedelen** til 1. Å gi begge deler en
`γ_i < 1` dobbelttelles glidningen — det sto feil i den opprinnelige
spesifikasjonen og ble fanget av en test mot den lukkede formen.
`(EI)_ef` er uavhengig av hvilken del man velger som referanse; `y_ef` og de
enkelte `γ_i` er det ikke.

## 6. `ρ_m`, ikke `ρ_k`

EC5 tabell 7.1 er skrevet med middeldensiteten. `ρ_k` gir ~20 % for lav
`K_ser`, og feilen er stille — 350 er en fullt plausibel densitet for C24, men
riktig `ρ_mean` er 420. `TIMBER_DENSITIES` i `connection-stiffness.js` er
fasit ved sprik mellom de to listene.

Densiteten ligger på **materialet**, ikke på skjøten. En skruet skjøt henter
`ρ` fra formene den treffer, men et tall brukeren har skrevet inn vinner
alltid, og kilden vises («fra materialet C24 i Steg» mot «oppgitt»).

## 7. Heftbredden er snittet, ikke den tegnede linja

`b` er lengden av skjøtelinjas **snitt med tverrsnittet**
(`jointContactLength`). Halvplanmetoden inviterer til å tegne linja med
overheng for å være sikker på at snittet går gjennom, og hver millimeter
overheng gjorde ellers `τ = q/b` for lav — alltid til gunst for
konstruksjonen, uten at noe varslet.

## 8. Enheter

`state.shapes[].points` er i **arbeidsenheten** (`mm|cm|m`). Alt fra
`computeReinforcement()` er i **mm**. Skaler med
`k = unitInfo(unit).toMillimetres` først. Blandes de to, ser feilen plausibel
ut i mm-modus og dukker opp først når noen jobber i meter.

Hull er **egne former med `role:'void'`**, ikke innerringer. Riktig kilde til
konturer er derfor `analyze().parts[i].multi` og `netMulti`, ikke
`shape.points`.

## 9. Avgrensning

Verktøyet sier **hvor sterk** forbindelsen må være. Det sier ikke **hvordan**
den skal utføres — festemiddelvalg, kant- og senteravstander og de
materialspesifikke kontrollene hører hjemme i andre verktøy. Torsjon er
utenfor omfanget.

## 10. Fallgruver som har kostet tid

- **`node --check` fanger ikke alle ESM-feil.** En backtick inne i en template
  literal passerte, men brøt i nettleseren. Verifiser med
  `node --input-type=module -e "await import('./js/x.js')"`.
- **Chrome cacher JS-modulene hardt.** `location.reload()` er ikke nok — bruk
  `ctrl+shift+r`.
- **`localStorage` deles på tvers av faner på samme origin.** Tester du i en ny
  fane, overskriver du modellen som ligger i den åpne.
- **`Number(null) === 0`.** Bruk `Number.isFinite` + `> 0` for valgfrie tall,
  ellers blir «ikke oppgitt» til verdien 0.
- **`break-inside: avoid` virker ikke på flex-/grid-items i Chromium.**
- **Appen er `h-screen` med `overflow-hidden`.** Uten en eksplisitt
  `height:auto`-reset klippes utskriften til én halv side.

## 11. Test

Fem suiter, alle rene `node <fil>`, exit 0/1, ingen avhengigheter:
`reinforcement` (12), `joints` (14), `composite` (14), `derivation` (17),
`report-figure` (17). Hver forventet verdi er håndregnet i en kommentar over
sjekken. De har fanget fire reelle feil, blant annet at C24 fikk stålets
E-modul.

## 12. Eksportkontrakten (`resolved`)

`toJSON()` legger ved et `resolved`-felt for verktøy som skal *bruke*
geometrien — FEM-meshere, MCP-servere — i stedet for å redigere den.

Grunnen: `shapes[].points` er redigeringsverktøyets modell. Et mottakende
verktøy måtte ellers kjenne tre konvensjoner det ikke finnes spor av i
JSON-en — at hull er egne former med `role:'void'`, at `mode:'priority'` gjør
array-rekkefølgen til prioritet, og at ringene er åpne — og i tillegg
reimplementere boolske polygonoperasjoner.

```
resolved: {
  unit: 'mm',                              // ALLTID mm, uansett arbeidsenhet
  mode: 'sum' | 'priority',
  winding: 'outer CCW, holes CW, rings closed',
  notes: string[],                         // se under
  voidsIgnored: string[],
  grossArea, netArea, overlapArea,         // mm², kontrollsummer
  regions: [{ id, name, stage, material, rings: [{ outer, holes }] }]
}
```

Fire egenskaper som er verdt å ikke miste:

- **Hull er trukket inn i de faste formene.** `void`-formene er ikke egne
  regioner; de *er* innerringene. En forms egen geometri har ingen hull i
  `sum`-modus, så uten dette steget ville `holes` alltid vært tom.
- **`notes` sier fra om overlapp.** I `sum`-modus (skallmodellen) teller
  overlapp mellom to faste former dobbelt i tverrsnittsverdiene, men et fysisk
  område kan bare ha materiale én gang. Summen av regionenes arealer er
  `grossArea`, unionen er `netArea`. De to er ulike tall med vilje — men det
  må *sies*, ellers oppdages avviket senere som en «feil» i mottakeren.
- **`voidsIgnored`** fanger utsparinger som ble spist opp av prioriteten. I
  lerretet går det bra (nye former legges først i lista), men en
  maskingenerert fil kan legge hullet etter formen det skal kutte — og da
  forsvinner det stille.
- **Importen leser IKKE `resolved`.** Feltet er avledet av `shapes` og regnes
  ut på nytt ved hver eksport. Å lese det inn ville gitt to kilder til samme
  geometri, der en håndredigert `resolved` stille kunne overstyre formene
  brukeren ser. `fromJSON` plukker eksplisitte felt og kopierer ikke objektet,
  så ukjente nøkler ignoreres uansett.

Formatet er **idempotent** etter første import: eksport → import → eksport gir
byte-identisk fil. Første runde fyller ut standardverdier (`color`, `factor`,
`meta`) og slår opp `rho` fra materialpresetet, som er utfylling, ikke tap.

`tests/export.test.mjs` (7 tester) låser hull-som-innerring,
mm-skaleringa, omløpsretningen, og at `Σ regioner = netArea + overlapp`.
