# Skjøter i geometry workspace — generalisering fra «grensesnitt» til «skjøtelinje»

Andre runde. Første runde ga grensesnitt mellom eksisterende og ny del, med
piler som viste hvilken side som var «gruppa». Denne runden fjerner det
begrepet og erstatter det med noe både mer generelt og enklere å bruke.

Norsk UI, norske kommentarer, samme stil som resten av modulen.
**Torsjon er utenfor omfanget.** Bare aksialkraft og skjærkraft.

---

## 1. Innsikten som styrer designet

En skjøtelinje er den samme fysiske tingen enten materialet er gammelt eller
nytt. Skjærstrømmen over et snitt er

    q_V = V · ES* / EI

og den bryr seg ikke om når materialet ble satt inn. Det er bare **aksialleddet**
som er eksklusivt for forsterkning:

    q_N = ΔN / L

For en eksisterende, prismatisk bjelke med konstant aksialkraft er `dN/dx = 0`
i hver del, og en gammel sveis ser derfor **bare** `V`-leddet. `ΔN/L` oppstår
først når ny last skal inn i materiale som ikke bar noe før, over en
forankringslengde.

Konsekvenser som MÅ ligge i koden:

1. **Ett primitiv, ikke to.** «Grensesnitt» og «eksisterende sveis» er samme
   objekt: en **skjøt**. Verktøyet svarer på begge spørsmål med samme formel.
2. **Ingen piler, ingen «snu siden».** `ES*` om nøytralaksen summerer seg til
   null over hele tverrsnittet, så `ES*_A = −ES*_B` og `|q_V|` er identisk fra
   begge sider. Siden er dermed aldri et brukervalg for `q_V`.
3. `q_N` er null for en skjøt som ligger helt inne i eksisterende materiale.
   Det skal falle ut av regnestykket, ikke være et spesialtilfelle i UI-et.

---

## 2. Hva som henger sammen — koblingsgrafen

`q_V` over en skjøt er styrt av **alt som ligger på den ene siden**, ikke bare
den formen som berører linja. En påforing som selv bærer en lamell gir større
kraft i den nederste skjøten enn i den øverste.

Modellen er derfor en graf:

- **Noder** = formene (de som er med i beregningen).
- **Kanter**:
  - **eksplisitt skjøt** mellom to former, tegnet av brukeren;
  - **implisitt stiv forbindelse** mellom former som **berører eller overlapper
    hverandre**, og som det *ikke* ligger en skjøt mellom.

Den implisitte regelen er det som gjør at brukeren slipper å deklarere noe
ekstra. Tegner man en I-profil som tre rektangler og bare én sveis, vet grafen
likevel at steg og underflens sitter sammen.

**Gruppa til en skjøt** = den komponenten grafen faller i når nettopp den
skjøtens kant fjernes, på motsatt side av linja. Sjekk mot disse tilfellene —
alle fire skal virke:

| Oppsett | Forventet gruppe |
| --- | --- |
| Bjelke + lamell i underkant, én skjøt | lamellen |
| Bjelke + plate topp **og** plate bunn, to skjøter | hver skjøt får sin egen plate |
| Kjede: bjelke – påforing A – lamell B | skjøten bjelke–A får **A + B** |
| I-profil som 3 rektangler, sveis kun mellom steg og overflens | overflensen (steg + underflens henger sammen implisitt) |

**Statisk ubestemt tilfelle:** er en del festet med **to eller flere** skjøter
samtidig (en U-profil skrudd til begge flenser), splitter ikke kuttet grafen.
Da kan verktøyet ikke gjette fordelingen — den avhenger av
forbindelsesstivhetene. Verktøyet skal da:
- si tydelig fra at oppsettet er statisk ubestemt,
- fordele likt mellom de aktuelle skjøtene som utgangspunkt,
- og la brukeren overstyre andelen per skjøt (felt `share`, standard `null` =
  automatisk lik fordeling).

---

## 3. To lasttilstander — superposisjon

Dette er ikke pynt: det er den fysisk riktige måten å behandle forsterkning på.
Den eksisterende bjelken bærer allerede det som står på den i det øyeblikket
forsterkningen monteres. Bare **tilleggslasten** virker på det sammensatte
tverrsnittet.

Modellen får derfor to lasttilstander:

```js
loads: {
  before: { V: 0, N: 0, M: 0 },   // virker på tverrsnittet av bare 'existing'
  after:  { V: 0, N: 0, M: 0 },   // virker på det sammensatte tverrsnittet
  L: 1000                          // forankringslengde for ΔN
}
```

For hver skjøt:

- `q_før` = `V_before · ES*_eks / EI_eks` — regnet på **tverrsnittet av bare de
  eksisterende formene**, og bare hvis skjøten ligger helt inne i eksisterende
  materiale. En skjøt mot en ny del har ingen «før»-tilstand.
- `q_etter` = `V_after · ES*_komb / EI_komb` — regnet på **det sammensatte**
  tverrsnittet.
- `q_V,tot = |q_før| + |q_etter|` (superposisjon; lineær elastisitet).
- `q_N` som før, bare for skjøter som fører kraft inn i ny del.
- `q_tot = q_V,tot + q_N`.

Er alle former `existing` (ren kontroll av en eksisterende konstruksjon), skal
UI-et **skjule «etter»-tilstanden og hele forsterkningsdelen** og bare vise
skjærstrømmen. Det er dette som gjør verktøyet nyttig for «hvor mye går det i
sveisen mellom flens og steg».

---

## 4. Datamodell (v3)

`state.interfaces` → **`state.joints`**. Migrering fra v2 skal beholde gamle
grensesnitt (samme `a`, `b`, `connector`; `groupIds` forkastes, siden gruppa nå
utledes). `version: 3`. Gammel v1- og v2-tilstand skal fortsatt lastes.

```js
{
  id: 'j1',
  name: 'Skjøt 1',              // autogenereres av delene den skiller, se §6
  a: [x, y], b: [x, y],
  bondWidth: null,               // null ⟹ linjas lengde
  share: null,                   // null ⟹ automatisk; tall 0..1 ved ubestemt oppsett
  connector: {
    kind: 'screw' | 'glue' | 'weld',
    // skrue/bolt
    FRd: 8.0, rows: 1, spacing: 200, Kser: 5000,
    // lim
    tauRd: 4.0, Ga: 700, ta: 2,
    // sveis — NY
    qRd: null,                   // kapasitet per mm skjøtelengde [N/mm], direkte
    a_weld: 4,                   // a-mål [mm]
    fvwd: 207,                   // dimensjonerende skjærfasthet i sveis [N/mm²]
    nWelds: 2                    // antall sveisestrenger langs skjøten
  }
}
```

Sveisekapasitet når `qRd` ikke er satt: `qRd = nWelds · a_weld · fvwd` [N/mm].
Skriv i hjelpeteksten at `f_vw,d` finnes i modulen `weld_capacity/` — ikke
dupliser den beregningen her.

`loads` endres til strukturen i §3, med migrering fra det flate `{V,N,M,L}`
(gammel `V`/`N`/`M` legges i `after`).

---

## 5. Agent 1 — logikk (rene moduler, ingen DOM)

**Filer du eier:** `js/joints.js` (ny, erstatter `js/interfaces.js` — slett den
gamle), utvidelser i `js/reinforcement.js`, og
`tests/joints.test.mjs` (ny). Rør ikke UI-filer.

### 5.1 Geometrisk naboskap
```js
shapesTouch(shapeA, shapeB, tol)   // → bool
```
Sant hvis polygonene overlapper, eller hvis en kant i A ligger nærmere enn `tol`
fra en kant i B (segment–segment-avstand). `tol` settes fra kallende kode;
standard en liten brøkdel av modellens utstrekning.

```js
sidesOfJoint(joint, shapes, tol)   // → { aSide: [id], bSide: [id] }
```
Hvilke former som berører skjøtelinja fra hver side. Robust metode: sampl et
antall punkt langs linja, forskyv dem en liten avstand langs normalen begge
veier, og se hvilke former punktene faller inni. **Ikke** bruk formenes
tyngdepunkt — det bommer på L-formede og hulle tverrsnitt.

### 5.2 Grafen
```js
buildGraph(shapes, joints, tol)    // → { nodes, edges, implicitEdges }
jointGroup(joint, graph)           // → { groupIds, otherIds, determinate: bool }
```
`jointGroup` fjerner skjøtens kant og finner komponentene. `determinate: false`
når kuttet ikke splitter grafen. Gruppa velges som komponenten som **ikke**
inneholder de eksisterende formene; er alle former eksisterende, velg den
minste komponenten (vilkårlig, siden `|q|` er lik — men vær konsekvent, ellers
hopper fortegnet mellom oppdateringer).

```js
danglingShapes(shapes, joints, graph)  // → nye former uten noen skjøt
overConstrained(shapes, joints, graph) // → deler festet med flere skjøter
```

### 5.3 Utvidelser i `reinforcement.js`
Behold alt som finnes. Legg til:
```js
weldCapacity({ qRd, a_weld, fvwd, nWelds })   // → qRd [N/mm]
```
og utvid `connectorCheck` med `kind: 'weld'`: `util = q / qRd`, og `sReq` er
ikke relevant (returner `null`, ikke `Infinity`).

### 5.4 Tester — `tests/joints.test.mjs`
Kjørbar med bare `node`, exit ≠ 0 ved feil, lesbar utskrift. Minimum:

1. **De fire gruppetilfellene i tabellen i §2**, hver med eksplisitt forventet
   gruppe.
2. **I-profil, sveis flens–steg.** IPE-lignende: overflens 100×10 på y=190..200,
   steg 6×180 på y=10..190, underflens 100×10 på y=0..10. Alle E = 210000,
   V = 100 kN. Regn `q` i sveisen mellom overflens og steg for hånd (ES* for
   flensen om nøytralaksen, delt på EI) og krev at koden treffer det.
   **Regn fasiten ut selv og skriv utregningen i kommentaren** — ikke kopier et
   tall fra en tabell.
3. **|q| er uavhengig av side:** samme skjøt, gruppa byttet ut med komplementet,
   gir samme `|q_V|`.
4. **Ren eksisterende konstruksjon** gir `q_N = 0` uten spesialtilfelle.
5. **Superposisjon:** `V_before = V_after = V/2` på samme tverrsnitt gir samme
   `q_V,tot` som `V_before = 0, V_after = V` når alle former er eksisterende og
   de to tverrsnittstilstandene dermed er identiske.
6. **Statisk ubestemt** oppsett flagges (`determinate: false`) og deles likt.
7. **Sveisekapasitet:** `nWelds = 2`, `a = 4 mm`, `f_vw,d = 207 N/mm²` gir
   `qRd = 1656 N/mm`; med `q = 828 N/mm` blir utnyttelsen 50 %.
8. **`shapesTouch`**: to rektangler som deler en kant er naboer; to som ligger
   1 mm fra hverandre er det ikke (med tol < 1 mm).

`tests/reinforcement.test.mjs` skal fortsatt gi 12/12.

---

## 6. Agent 2 — UI (kjøres etter agent 1)

**Filer du eier:** `js/reinforcement-ui.js`, `js/ui.js`, `js/tools.js`,
`js/viewport.js`, `js/store.js`, `js/main.js`, `index.html`, `README.md`.

### 6.1 Bort med pilene
Fjern piltegningen, «Snu siden» og alt som ber brukeren velge en side.
Grensesnittfargen kolliderer med palettfarge nr. 2 — velg en farge som ikke
finnes i `PALETTE`.

### 6.2 Skjøteverktøyet
- To klikk tegner skjøtelinja, med snapping som i dag. Hurtigtast beholdes.
- **Autonavn:** skjøten navngis etter delene den skiller, f.eks.
  «Steg ↔ Overflens». Har brukeren endret navnet, ikke overskriv det.
- Tegn skjøten som en tydelig linje med endemarkører. En liten, dempet
  markering kan vise hvilken komponent som regnes som gruppa — men det er
  **informasjon, ikke et valg**.
- Hover i skjøtelista fremhever skjøten i lerretet, og omvendt.

### 6.3 Panelet
Fanen heter fortsatt «Forsterkning», men skal virke like godt for en ren
kontroll av eksisterende konstruksjon:

- **Er alle former `existing`:** skjul «etter»-tilstanden, aksialfordelingen,
  ΔN/L og Volkersen. Vis bare lasttilstand «før» og skjærstrømmen per skjøt.
  Overskriften bør si at dette er kontroll av eksisterende konstruksjon.
- **Finnes `new`-former:** vis begge lasttilstandene, med superposisjonen
  `q_tot = |q_før| + |q_etter| + q_N` skrevet ut ledd for ledd.
- Skjøtelista viser per skjøt: delene på hver side, heftbredde `b`,
  forbindelsestype, `q_før`, `q_etter`, `q_N`, `q_tot`, `τ` eller utnyttelse.
- Behold formel → innsatte tall → resultat med enhet i «Utregning».
- Sveis som forbindelsestype, med `a`-mål, `f_vw,d` og antall strenger, og en
  merknad om at `f_vw,d` regnes ut i modulen `weld_capacity/`.

### 6.4 Advarsler
- Ny form uten noen skjøt: «henger i løse lufta — tegn skjøten som fester den».
- Statisk ubestemt oppsett: si det, vis den automatiske like fordelingen, og la
  brukeren sette andelen.
- `EI ≈ 0`, tom gruppe, manglende geometri: som før.
- Behold merknaden om at beregningen er iterativ i praksis.

### 6.5 Hjelp og README
Oppdater hjelpedialogen og README med det nye skjøtebegrepet, de to
lasttilstandene og eksempelet «hvor mye går det i sveisen mellom flens og
steg». Forklar den implisitte naboskapsregelen — den er ikke åpenbar.

---

## 7. Felleskrav

- Statisk HTML/JS, ingen byggesteg. GA-taggen urørt rett etter `<head>`.
- Alt regnes i N og mm internt; hver viste verdi har enhet.
- Ingen commit — hovedagenten committer.
- Verifiser i nettleseren (lokal server kjører på port 8899), ikke bare i node.

---

## 8. TILLEGG — halvplanet erstatter grafen for ES*

Denne seksjonen **overstyrer** §2 og §5.2 der de er i konflikt. Skrevet etter at
agent 1 var satt i gang; les den før du bygger grafen større enn nødvendig.

### 8.1 Regelen

Et snitt er en rett linje. Forlenget uendelig begge veier deler den planet i to
halvplan. **Gruppa er alt som ligger på den ene siden** — ferdig. `ES*` regnes
ved å klippe hele geometrien mot halvplanet og integrere:

    gruppe_multi = klipp(alle former, halvplan)
    ES*          = Σ E_i · (ESx for form i sin del av gruppa, om nøytralaksen)

Klippingen gjøres med `intersectionMulti` fra `geometry.js` mot et rektangel som
dekker hele modellen på den ene siden av linja (bruk `boundsOfShapes` blåst opp
med god margin), og integreres med `multiProps`. Nøytralaksen er fortsatt det
**sammensatte** tverrsnittets.

### 8.2 Hvorfor dette er bedre enn grafen

- Virker på en **importert, detaljert profil som ett polygon**. Brukeren
  trenger ikke splitte geometrien for å kunne regne på et snitt i den.
- Treffer alle fire tilfellene i tabellen i §2 uten grafen: kjeden faller ut av
  at halvplanet inneholder både A og B, I-profilen av at halvplanet over sveisen
  er overflensen.
- Håndterer **loddrette snitt** (skjærstrøm i en flens) like godt som vannrette,
  siden `ES*` uansett måles om bøyningens nøytralakse.
- Er ikke-destruktiv: modellen står som tegnet, og `q` oppdateres når linja dras.

### 8.3 Hva grafen fortsatt skal gjøre

Grafen skal **ikke** brukes til `ES*`. Behold den, kraftig nedskalert, til:

- **Aksialleddet:** hvilken ny del sin `ΔN` som går gjennom hvilken skjøt.
- **Advarsler:** ny form uten noen skjøt (henger i løse lufta), og deler festet
  med flere skjøter samtidig (statisk ubestemt, `share`-feltet).

Naboskapstesten `shapesTouch` beholdes for disse to formålene.

### 8.4 Konsekvens for testene

Behold alle åtte testtilfellene i §5.4, men regn `ES*` gjennom halvplanet.
Legg til to:

9.  **Snitt gjennom én monolittisk form.** Ett enkelt rektangel 100×300 som
    *ikke* er delt, med snittet i halv høyde: `q` skal bli 250 N/mm ved
    V = 50 kN — samme svar som når det er tegnet som to former. Dette er hele
    poenget med halvplanet, og testen skal si det i klartekst.
10. **Loddrett snitt.** Samme rektangel, loddrett snitt i halv bredde, `V_x`
    i stedet for `V_y`: regn fasiten for hånd (`Q = 50·300·25`,
    `I_y = 300·100³/12`) og krev at koden treffer.

### 8.5 Splitteverktøy (agent 2)

Legg til et geometriverktøy **«Del med linje»**: to klikk definerer linja, og
hver markert form som linja krysser deles i to former langs den. De nye formene
arver navn (med suffiks), farge, rolle, stadium og materiale fra originalen.
Ett angresteg. Bruk `intersectionMulti` mot halvplanet på hver side.

Dette er et **redigeringsverktøy, ikke en forutsetning for beregningen** —
skriv det i hjelpeteksten, slik at ingen tror de må splitte for å få tall.
Nytten er å kunne gi de to halvdelene ulikt materiale eller ulikt stadium, eller
å se bidragene hver for seg.
