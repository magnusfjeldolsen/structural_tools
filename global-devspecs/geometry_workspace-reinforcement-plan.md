# Geometry workspace → forsterkningsverktøy

Plan for utvidelsen av `geometry_workspace/` fra «finn tyngdepunktet» til
«hvor mye kraft må forbindelsen mellom eksisterende og ny profil ta opp».

Alt UI-språk er norsk (bokmål). Kommentarer i koden er norske, som i dagens filer.

---

## 1. Bakgrunn — fysikken verktøyet skal svare på

Når et nytt profil festes til et eksisterende, må kraften overføres gjennom
akseparallell skjærkraft i grensesnittet. Grunnligningen er

    q(x) = dN(x)/dx                       [N/mm langs bjelkeaksen]

der `N(x)` er aksialkraften i den nye delen. To spesialtilfeller:

**Ren aksialkraft.** Kraften fordeles etter aksialstivhet:

    N_i = N · (E_i A_i) / Σ(E_j A_j)

Skal andelen `ΔN` inn i den nye delen overføres over en forankringslengde `L`:

    q_avg = ΔN / L

**Bøyning.** Klassisk skjærstrøm, generalisert til sammensatt tverrsnitt med
ulik E-modul (transformert tverrsnitt):

    q = V · ES* / EI

    ES* = Σ_{i ∈ gruppe} E_i · A_i · (y_i − ȳ)     [1. arealmoment × E, om nøytralaksen]
    EI  = Σ_i E_i · I_i                            [om sammensatt nøytralakse]

`gruppe` er formene som ligger på den ene siden av grensesnittet — altså den
delen hvis aksialkraft må leveres gjennom forbindelsen. For E lik overalt
reduserer dette seg til `q = VQ/I`.

**Kombinasjon.** `q_tot = q_V + q_N`.

**Shear lag (Volkersen).** `q_avg` er en middelverdi; virkelig fordeling har
topper i skjøteendene. Med skjøtelengde `L`, forbindelsesstivhet `k`
[N/mm per mm skjøtelengde] og aksialstivhetene `α = (EA)_eks`, `β = (EA)_ny`:

    λ² = k · (1/α + 1/β)
    x' = x − L/2
    q(x) = (P·λ/2) · [ cosh(λx')/sinh(λL/2) + ((α−β)/(α+β)) · sinh(λx')/cosh(λL/2) ]

Kontroller som MÅ verifiseres i test:
  - `∫₀^L q dx = P` (det andre leddet er odde og integrerer til null)
  - `λ→0` ⟹ `q → P/L`
  - balansert (α = β): `q_max/q_avg = (λL/2)·coth(λL/2)`

For lim er `k = G_a · b / t_a`, der `b` er heftbredden (grensesnittets lengde i
tverrsnittsplanet) og `t_a` limtykkelsen. For skruer er `k = K_ser · n_rader / s`.

---

## 2. Koordinatsystem og enheter — les dette før du regner

- Tverrsnittet tegnes i **XY-planet**. Bjelkeaksen er **ut av planet (z)**.
- Grensesnittets lengde i tverrsnittet er **heftbredden `b` [mm]** — det er
  denne skjærspenningen fordeles over.
- Forankrings-/skjøtelengden **`L` [mm]** er langs bjelkeaksen, tastes inn.
- Skjærstrøm `q` [N/mm] løper langs bjelkeaksen.
- Skjærspenning i limfuge: `τ = q / b` [N/mm²].
- Arbeidsenheten i workspacet (mm/cm/m) gjelder geometrien. Mekanikken regnes
  internt i **N og mm**; UI viser kN, kN/m, N/mm og MPa der det er naturlig, og
  MÅ merke hver verdi med enhet.

---

## 3. Datamodell (utvidelser i `store.js`)

Hver form (`shape`) får to nye felt, med bakoverkompatibel migrering:

```js
stage: 'existing' | 'new'      // standard 'existing'
material: { name: string, E: number }   // E i N/mm², standard { name: 'S355', E: 210000 }
```

`factor` beholdes som i dag (generell vektfaktor for tyngdepunktsberegningen).
Forsterkningsberegningen bruker **`material.E`**, ikke `factor`. Det skal stå i
hjelpeteksten at de to er uavhengige.

Ny toppnivåliste `interfaces: []`:

```js
{
  id: 'if1',
  name: 'Grensesnitt 1',
  a: [x, y], b: [x, y],        // linja som er tegnet i tverrsnittet
  groupIds: ['s3', 's4'],      // formene på «ny»-siden — de hvis kraft går gjennom fugen
  bondWidth: null,             // null ⟹ bruk |b−a| som heftbredde
  connector: {
    kind: 'screw' | 'glue',
    // skrue:
    FRd: 8.0,                  // kapasitet per forbinder [kN]
    rows: 1,                   // antall rader på tvers
    spacing: 200,              // senteravstand [mm]
    Kser: 5000,                // stivhet per forbinder [N/mm], for Volkersen
    // lim:
    tauRd: 4.0,                // dimensjonerende heftfasthet [N/mm²]
    Ga: 700,                   // limets skjærmodul [N/mm²]
    ta: 2                      // limtykkelse [mm]
  }
}
```

Globale lastdata (nytt felt `loads`):

```js
loads: { V: 0, N: 0, M: 0, L: 1000 }   // V,N i kN; M i kNm; L i arbeidsenhet
```

**Migrering:** `migrate()` i store.js må fylle inn `stage`, `material`,
`interfaces` og `loads` for lagrede modeller fra før. Gammel `localStorage`-
tilstand og gammel eksport-JSON skal fortsatt lastes uten feil.
`toJSON()`/`fromJSON()` må ta med de nye feltene, og `version` heves til 2.

---

## 4. Arbeidsdeling

| Agent | Eier disse filene | Rør ikke |
| --- | --- | --- |
| **A — geometriverktøy** | `js/tools.js`, `js/viewport.js`, `js/ui.js`, `js/geometry.js`, `js/store.js`, `index.html` | nye filer under §6 |
| **B — mekanikk** | `js/materials.js` (ny), `js/reinforcement.js` (ny), `tests/reinforcement.test.mjs` (ny) | alt eksisterende |
| **C — grensesnitt + forsterkningspanel** | bygger videre på A og B, kjøres **etter** at begge er ferdige | — |

A og B kjøres parallelt og har ingen felles filer.

---

## 5. Agent A — geometriverktøy

Mål: geometri skal kunne plasseres presist, ikke bare dras omtrentlig.

### A1. Flytteverktøy (`move`, hurtigtast `M`)
Klassisk CAD-flyt: verktøyet virker på **gjeldende utvalg**.
1. Klikk **basispunkt** (snappes).
2. Beveg — hele utvalget følger som forhåndsvisning, `Δx/Δy` og lengde i statuslinja.
3. Klikk **sluttpunkt** (snappes, orto virker) ⟹ flyttingen committes som ett undo-steg.
`Esc` avbryter og setter geometrien tilbake. Er utvalget tomt: si fra i statuslinja.
Tallinntasting: menyen for verktøyet skal ha `Δx`, `Δy` + «Flytt utvalg».

### A2. Kopiverktøy (`copy`, hurtigtast `K`)
Som A1, men legger igjen en kopi i sluttpunktet og **blir stående i verktøyet**
med samme basispunkt, så man kan sette flere kopier etter hverandre. `Esc` avslutter.
Menyen får også «antall kopier» med jevn avstand langs vektoren (rekke-kopi).

### A3. Roteringsverktøy (`rotate`, hurtigtast `T`)
1. Klikk **rotasjonssenter** (snappes — dette er punktet brukeren velger).
2. Klikk **referansepunkt** som definerer startvinkelen.
3. Beveg — utvalget roterer i forhåndsvisning, vinkel vises i statuslinja.
4. Klikk ⟹ committes.
Menyen får «vinkel [°]» + «Roter utvalg om senter», og et valg for om senteret
er nullpunktet, utvalgets tyngdepunkt eller et klikket punkt.
Hold `Shift` for å låse til 15°-trinn.

### A4. Speiling (`mirror`)
To klikk definerer speilaksen. Meny: «behold original» av/på.

### A5. Sentrering
Knapper i venstre panel («Plassering»):
- **«Sentrer utvalg i origo»** — flytter de markerte formene slik at deres
  arealvektede tyngdepunkt havner i (0,0).
- **«Sentrer alt i origo»** — samme for hele modellen, dvs. det sammensatte
  tyngdepunktet (samme vekting som resultatpanelet bruker, inkl. `mode`).
- **«Flytt nullpunkt til tyngdepunkt»** finnes fra før — behold.
Sentrering skal være ett undo-steg og flytte nullpunktet med, slik at
referansemålene ikke endrer seg utilsiktet (nullpunktet flyttes med samme vektor).

### A6. Parametrisk rektangel — **eksplisitt ønske fra bruker**
Å redigere hjørnekoordinater for å endre en bjelkehøyde er klumsete.
- Kjenn igjen at en form er et rektangel: fire punkt, rette vinkler. Aksejustert
  **eller rotert** (bruk kantvektorene, ikke bounding box).
- I egenskapspanelet for en slik form: felt for **bredde `b`**, **høyde `h`**,
  **rotasjon [°]** og **posisjon** med valgbart ankerpunkt (senter / nedre venstre
  / midt på underkant). Endres `b` eller `h`, skaleres rektangelet om det valgte
  ankeret, ikke om origo.
- Lagre `meta = { kind: 'rect', b, h, angle, anchor, origin }` når formen lages
  eller redigeres parametrisk, men **utled alltid feltene på nytt fra punktene**
  når panelet åpnes, slik at en form som er endret ved å dra i et hjørne fortsatt
  viser riktige tall (eller mister rektangel-statusen hvis den ikke lenger er ett).
- Samme prinsipp for `meta.kind === 'circle'` (radius) og `'shell'` (tykkelse,
  senterlinje): la disse redigeres med sine parametre.

### A7. Relative koordinater i punktlista
Koordinatlista i egenskapspanelet får en bryter **absolutt / relativ**. I
relativ modus vises punktene i forhold til formens eget basispunkt — bruk
tyngdepunktet, og skriv i etiketten hva de er relative til. Redigering skal
virke i begge modi.

### A8. Transformasjonspanelet virker på hele utvalget
Dagens «Transformer»-seksjon ligger inne på én form. Legg en tilsvarende
seksjon i venstre panel som virker på **alle markerte former under ett**
(flytt, roter om valgt senter, speil). Behold den per form.

### A9. Rendering og hjelp
- `viewport.js`: forhåndsvisning under flytt/kopi/rotasjon (spøkelseskontur i
  dempet farge), rotasjonssenter tegnes som et lite kryss, og en stiplet linje
  fra basispunkt til markør.
- Verktøyknapper i `index.html` med SVG-ikoner i samme stil som de eksisterende.
  Verktøyraden har i dag `grid-cols-6` — utvid rutenettet.
- Oppdater hjelpedialogen og hurtigtastlista med `M`, `K`, `T` og de nye knappene.
- `README.md` oppdateres tilsvarende.

### A10. Krav
- Alle nye kommandoer skal være **ett undo-steg** (bruk `transient` + `commit()`).
- Ingen regresjon i eksisterende verktøy, snapping, orto eller bildeunderlag.
- Snapping skal gjelde både basispunkt og sluttpunkt; geometri som er i bevegelse
  snapper ikke mot seg selv (samme mønster som `pointermove` bruker i dag).

---

## 6. Agent B — mekanikk (rene moduler, ingen DOM)

### B1. `js/materials.js`
Presets med E [N/mm²] og en kort etikett. Minimum:
stål S355 (210000), stål S235 (210000), betong C25/30 (31000), C30/37 (33000),
C35/45 (34000), limtre GL30c (13000), konstruksjonsvirke C24 (11000),
CFRP-lamell (165000), aluminium EN AW-6082 (70000).
Eksporter `MATERIALS`, `materialByName(name)`, og en `DEFAULT_MATERIAL`.

### B2. `js/reinforcement.js`
Rene funksjoner. Tar inn allerede utregnede polygondata (bruk `ringProps` /
`polygonProps` / `analyze` fra `geometry.js`) — ikke DOM, ikke store.

```js
// E-vektede tverrsnittsdata for et sett former
sectionEA(parts)        // → { EA, ESx, ESy, yc, xc, EIx, EIy, EIxy }
```
der `parts` er `[{ props, E }]` med `props` fra `geometry.js` (A, Sx, Sy, Ix0, …).
`yc = ESx/EA` er den E-vektede nøytralaksen. `EIx` flyttes til denne aksen med
Steiners sats: `EIx = Σ E_i(Ix0_i) − EA·yc²`.

```js
// Tilstandene som sammenlignes
compareStates({ existing, combined })   // → { EA0, EA1, EIx0, EIx1, dEA, dEIx, ratios }
```

```js
// Fordeling av aksialkraft etter aksialstivhet
axialSplit({ N, parts })   // → per del: { id, EA_i, share, N_i }
```

```js
// Skjærstrøm i ett grensesnitt
shearFlow({ V, groupParts, section })
// ES* = Σ_{i ∈ group} E_i·A_i·(y_i − yc)   der yc er sammensatt nøytralakse
// q_V = V · ES* / EIx
```
Støtt begge akser: `V_y` med `ESx`/`EIx`, og `V_x` med `ESy`/`EIy`. Prototypen
kan la UI-et bare bruke `V_y`, men API-et skal ha begge.

```js
// Forankring av aksialkraft
anchorFlow({ dN, L })       // → q_avg = dN/L
```

```js
// Volkersen — formel og kontroller i §1
volkersen({ P, L, k, EA1, EA2, samples = 101 })
// → { lambda, qAvg, qMax, peakFactor, profile: [{x, q}] }
```

```js
// Forbinderkontroll
connectorCheck({ q, bondWidth, connector })
// skrue: s_req = rows·FRd·1000 / q      [mm]   (FRd i kN, q i N/mm)
//        util  = q·s / (rows·FRd·1000)
// lim:   tau   = q / bondWidth   [N/mm²],  util = tau / tauRd
```

### B3. `tests/reinforcement.test.mjs`
Kjørbar med `node geometry_workspace/tests/reinforcement.test.mjs`, ingen
avhengigheter, exit-kode ≠ 0 ved feil. Minimum disse tilfellene, med
håndregnede fasitverdier i kommentar:

1. **Homogent rektangel, VQ/I.** 100×300 mm, V = 50 kN, snitt i halv høyde.
   `Q = 100·150·75 = 1.125e6 mm³`, `I = 100·300³/12 = 2.25e8 mm⁴`,
   `q = 50000·1.125e6/2.25e8 = 250 N/mm`. Verktøyet skal treffe dette når begge
   halvdelene har samme E.
2. **To like deler, aksialfordeling.** Hver får 50 %. Med `E₂ = 2E₁` får del 2 ⅔.
3. **`ΔN/L`.** ΔN = 63.5 kN over L = 2000 mm ⟹ 31.75 N/mm.
4. **Volkersen:** `∫q dx = P` (numerisk, < 0.1 % avvik), `λ→0 ⟹ q→P/L`,
   og balansert `q_max/q_avg = (λL/2)coth(λL/2)`.
5. **Transformert tverrsnitt:** tre på stål med E-forhold 1/20 — nøytralaksen
   skal ligge der håndregningen med transformert bredde gir den.
6. **Forbinderkontroll:** q = 100 N/mm, FRd = 8 kN, 1 rad ⟹ s_req = 80 mm.

Skriv testene slik at de dokumenterer mekanikken — de er også fasit for agent C.

---

## 7. Agent C — grensesnittverktøy og forsterkningspanel

Kjøres etter A og B.

### C1. Grensesnittverktøy (`interface`)
- To klikk tegner grensesnittlinja (snapper mot geometrien — typisk endepunkt
  og skjæringspunkt, som allerede finnes).
- Ved fullføring: gjett `groupIds` = formene hvis tyngdepunkt ligger på venstre
  side av a→b, og som er `stage: 'new'` dersom det gir et ikke-tomt sett.
- Tegn grensesnittet i lerretet: kraftig linje + små piler mot gruppesiden, og
  navnet.

### C2. Venstre panel: materiale og stadium
Hver form i geometrilista får:
- velger **Eksisterende / Ny** (visuelt skille i lerretet: eksisterende med hel
  kontur, ny med stiplet kontur og eget fargestikk — begge fortsatt med sin egen farge).
- materialvelger (presets fra `materials.js`) + fritt `E`-felt.

### C3. Høyre panel: faner
Del høyre panel i to faner: **«Tverrsnitt»** (dagens innhold, uendret) og
**«Forsterkning»**. Forsterkningsfanen inneholder, i denne rekkefølgen:

1. **Laster.** `V_Ed [kN]`, `N_Ed [kN]`, `M_Ed [kNm]`, forankringslengde `L`.
   Merknad: dette er kreftene som virker på det **sammensatte** tverrsnittet —
   last som allerede står på den eksisterende delen før forsterkningen monteres,
   tas ikke av det nye profilet.
2. **Effekt av forsterkningen.** Tabell eksisterende → sammensatt for
   `EA`, `EI_x`, nøytralaksens høyde, og prosentvis økning.
3. **Aksialfordeling.** Per form: `E_i A_i`, andel [%], `N_i [kN]`.
   Hvor mye kraft `ΔN` som må inn i den nye delen, og `q_N = ΔN/L`.
4. **Per grensesnitt.** For hvert grensesnitt i lista:
   `ES*`, `EI`, `q_V = V·ES*/EI`, `q_N`, `q_tot`, heftbredde `b`, `τ = q/b`,
   og forbinderkontrollen (nødvendig senteravstand eller utnyttelse).
5. **Shear lag.** Volkersen-topp `q_max`, toppfaktor `q_max/q_avg`, og en liten
   inline-SVG som viser fordelingen langs skjøten. Skriv tydelig at `ΔN/L` er en
   middelverdi og at toppene ligger i endene.
6. **Utregning.** Hver størrelse vises som formel → innsatte tall → resultat,
   i samme stil som de andre modulene i repoet. Ingen tall uten enhet.

### C4. Advarsler som SKAL vises
- Er det ingen former med `stage: 'new'`: si at det ikke er noe å forsterke.
- Er `EI` ≈ 0 eller grensesnittgruppa tom: si fra i stedet for å dele på null.
- Er noen `factor ≠ 1` samtidig som materialene har ulik `E`: gjør oppmerksom
  på at `factor` bare påvirker tyngdepunktsfanen, ikke forsterkningsberegningen.
- Skriv at beregningen er **iterativ i praksis**: endres geometrien, endres
  stivheten og dermed kreftene. Verktøyet regner for de kreftene brukeren taster
  inn — normalt hentet fra en modell av det forsterkede tverrsnittet.

### C5. Eksport
- «Kopier resultat» skal ta med forsterkningstallene når fanen er aktiv.
- JSON-eksporten tar med `interfaces` og `loads` (allerede dekket av §3).

---

## 8. Felleskrav

- Ren statisk HTML/JS-modul, ingen byggesteg. `three.js` via importmap som i dag.
- Google Analytics-taggen i `index.html` skal stå urørt rett etter `<head>`.
- Ingen nye nettverksavhengigheter.
- Verktøyet skal fungere uten `polygon-clipping` (samme fallback som i dag).
- Syntakssjekk alle endrede JS-filer før du er ferdig.
- Ikke commit — hovedagenten committer.
