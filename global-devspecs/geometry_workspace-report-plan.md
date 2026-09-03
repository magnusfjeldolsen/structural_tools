# Geometry Workspace — rapportmodul (A4-utskrift)

**Status:** plan. Ingen kode er skrevet.
**Modul:** `geometry_workspace/` (ren HTML/ESM, ingen byggesteg)
**Følger:** `global-devspecs/detailed-report-implementation-plan.md`, med begrunnede avvik i §3.
**Gjenbruker:** utskriftsmønsteret fra `concrete_slab_design/` (commit `7dca091`).

---

## 1. TL;DR

Geometry Workspace får en rapportvisning som skriver ut til A4-PDF. **Side 1** er ett
oppslag: tverrsnittet tegnet som ekte vektor-SVG med målsetting, skjøtemarkering,
tyngdepunkt og akser, pluss last før/etter og hvilken skjærstrøm som havner i hver
skjøt. **Side 2 og utover** er den fullstendige beregningen — alt som i dag står i
«Forsterkning»-fanen, i formen *formel → innsatte tall → resultat*. Sidedelingen
løses med utskriftsmønsteret fra `concrete_slab_design` (rapporten flyttes til en
direkte `<body>`-barn før print), utvidet med en atomblokk-konvensjon og en
måle-basert revisjon som **verifiserer** at ingenting splittes — ikke antar det.

---

## 2. Mål og avgrensning

### 2.1 Mål

| # | Mål | Verifiserbart ved |
|---|-----|-------------------|
| M1 | Side 1 er nøyaktig **én** A4-side for enhver modell som verktøyet aksepterer | Sidetall i PDF; audit-funksjonen i §8.1 |
| M2 | Tverrsnittet er **vektor** i PDF-en, ikke raster | Zoom til 800 % i PDF-leser: linjer og tekst forblir skarpe |
| M3 | Ingen overskrift, tabellrad, formelblokk, figur eller avsnitt splittes over et sideskift | Audit-funksjonen + utskriftssjekkliste i tre nettlesere |
| M4 | Alt innhold fra «Forsterkning»-fanen finnes i rapporten, i den rekkefølgen §4.2 angir | Innholdssjekkliste, §8.4 |
| M5 | Formlene finnes **ett** sted i kildekoden, delt av fane og rapport | `js/derivation.js` er eneste sted `formula:`-strenger står |
| M6 | Rapporten sier eksplisitt at momentet ikke gir et eget bidrag til skjærstrømmen | Fast tekstblokk, §5.3 |
| M7 | Rapporten sier eksplisitt hva verktøyet ikke svarer på | Fast tekstblokk, §5.4 |
| M8 | Utskrift virker likt i Chrome, Edge og Firefox | Sjekkliste §8.2 |

### 2.2 Utenfor omfang

- Sideoverskrift/-fot med løpende sidetall («Side 3 av 7»). Chrome kan ikke plassere
  levende innhold i `@page`-margeboksene, og `counter(page)` virker bare der.
  `concrete_slab_design` løste dette ved å skrive overskriften **én gang** øverst i
  dokumentet; vi gjør det samme. Nettleserens egen topp-/bunntekst dekker sidetall.
- Eksport til Word/`.docx`.
- Serverside-PDF, headless-rendring eller nye avhengigheter i `package.json`.
- Flerspråklig rapport. Rapporten er på **norsk**, som resten av modulen.
- Endringer i selve mekanikken (`reinforcement.js`, `connection-stiffness.js`,
  `joints.js`, `geometry.js`). Rapporten er en ren presentasjon av
  `computeReinforcement(state)` og `analyze(shapes, mode)`.
- Valg av festemiddel, kantavstander, innfestingsdetaljer, materialspesifikke
  kontroller. Se §5.4 — dette er en bevisst avgrensning som rapporten **sier**.

### 2.3 Forutsetninger

- Modulen ligger allerede i `paths:`-filteret og kopieringsløkka i
  `.github/workflows/deploy-all-modules.yml` (linje 27 og 121). En ny fil under
  `geometry_workspace/` publiseres automatisk. **Ingen workflow-endring trengs.**
- `geometry_workspace/index.html` har allerede GA-taggen rett etter `<head>`
  (linje 4–12). Ingen nye HTML-filer opprettes, så ingen ny GA-tagg trengs.
- Tailwind lastes fra CDN i `index.html`; rapporten kan bruke Tailwind-klasser på
  skjerm, men `print.css` skal **ikke** være avhengig av dem for struktur (§6.2).

---

## 3. Forhold til den etablerte rapportkonvensjonen

`detailed-report-implementation-plan.md` fastsetter: beskrivelsesfelt → tittel og
tidsstempel → INPUT PARAMETERS (blå) → PLOT (gul) → RESULTS SUMMARY (grønn) →
DETAILED CALCULATIONS (lilla, med sideskift), i `#detailed-report`, med
`toggleReport()` / `printReport()` / `toFixedIfNeeded()`.

Vi følger dette, med disse avvikene — hvert enkelt begrunnet:

| Konvensjon | Her | Begrunnelse |
|---|---|---|
| `<link rel="stylesheet" href="../assets/css/report-print.css">` | Egen `geometry_workspace/print.css` | Samme begrunnelse som `concrete_slab_design` skrev inn i toppen av sin `print.css`: den delte fila skjuler app-markup klasse for klasse og brekker stille når markup endres. Geometry Workspace har i tillegg et **fullhøyde flex-oppsett med `overflow-y-auto`-paneler**, som klipper utskriften til én side hvis rapporten blir stående inne i det. Se §6.1. |
| Rapporten ligger i `#detailed-report` i sideflyten | Rapporten ligger i et overlegg, og klones til `#gwPrintRoot` (direkte barn av `<body>`) før print | Panelene i denne modulen er 320 px brede med egen scroll — det finnes ingen sideflyt å legge en A4-bred rapport i. Mønsteret er `concrete_slab_design` sitt, bare med et lesbart skjermoverlegg i stedet for en utvidbar seksjon. |
| PLOT som `canvas.toDataURL()` (slik `concrete_plate_CFRP-report-spec.md` foreslår) | Generert SVG | Se §7. Kort: lerretet her er WebGL, ikke Chart.js, og figuren er en **måltegning**, ikke et diagram. |
| Overskriftsfarger blå/gul/grønn/lilla | Beholdes | Ingen grunn til å avvike; gjør rapportene i repoet gjenkjennelige. |
| `toFixedIfNeeded(value, decimals)` | `n()`, `q()`, `pct()`, `sci()` fra `reinforcement-ui.js` | Finnes allerede, er eksportert, og er det fanen bruker. En ny formatterer ville gitt to tallformater i samme modul. |
| Én stor `generateDetailedReport()` som bygger en malstreng | `js/derivation.js` (data) + `js/report.js` (side 2+) + `js/report-figure.js` (SVG) | Formlene står i dag inline i `_derivationBody()` i `reinforcement-ui.js`. Kopieres de til rapporten, finnes hver formel to steder. Se M5 og §9, bølge A. |

---

## 4. Sidedisposisjon

Papirflate: A4 stående, marger `18mm 16mm 20mm 20mm` (topp/høyre/bunn/venstre)
⟹ **174 × 259 mm** trykkflate. Alle mål under måles mot dette.

### 4.1 Side 1 — oppgaven på ett blikk

Denne siden skal kunne legges foran noen som ikke kjenner modellen, og gi dem
oppgaven. Ingen mellomregning her.

| Rekkefølge | Blokk | Høyde­budsjett | Innhold |
|---|---|---|---|
| 1 | `.print-head` | 8 mm | Venstre: modellnavn (`state.title`) i fet, eller «Geometri-workspace» om tomt. Høyre: «Tverrsnitt og skjøtekrefter · `NS-EN 1995-1-1` (γ-metoden) · dato». Understrek. |
| 2 | Tittel + beskrivelse | 8–20 mm | `<h1>` «Tverrsnitt, skjøter og skjærstrøm». Under: brukerens frie beskrivelse fra `state.report.note` hvis satt, ellers utelatt (ikke tom plass). |
| 3 | **Figur** | 112 mm | Vektor-SVG, `width="174mm" height="112mm"`. Se §7 for innhold. |
| 4 | Lasttabell | 22 mm | To kolonner: «Før forsterkning — på det eksisterende tverrsnittet alene» og «Etter forsterkning — tillegg på det sammensatte». Rader: `N` [kN], `M_x` [kNm], `M_y` [kNm], `V_y` [kN], `V_x` [kN]. Under tabellen: `L = … mm` (forankringslengde). Ved `res.allExisting` faller «etter»-kolonnen bort og tabellen får i stedet linja «Alle former er eksisterende — dette er en kontroll av dagens konstruksjon; det finnes ingen etter-tilstand.» |
| 5 | Skjøte- og krafttabell | 6 + n·5,5 mm | Én rad per skjøt. Kolonner: `#` (J1, J2 …, samme merking som i figuren) · Navn · **Type** · Forbindelse · `b` [mm] · `q_før` · `q_etter` · `q_N` · **`q_tot`** [N/mm]. `q_tot` i fet. Ved `res.allExisting` vises bare `q_før`, og den er totalen. |
| 6 | Avgrensningsnote | 12 mm | Fast tekst, §5.4. Rammet, liten skrift. |
| — | Slakk | ≥ 20 mm | Buffer mot at skrifthøyder varierer mellom nettlesere. |

**Type-kolonnen** er det brukeren ba om eksplisitt, og avledes slik (feltnavnene
finnes allerede på skjøteobjektet fra `computeReinforcement`):

```
!jt.hasNeighbor  → «treffer ingen former»   (feiltilstand, rød)
jt.existingOnly  → «eksisterende ↔ eksisterende»
ellers           → «mot ny del»
```

`jt.existingOnly` er sann når skjøten har naboer og **ingen** av dem er `stage: 'new'`.
Det er den samme testen som avgjør om skjøten har en «før»-tilstand i det hele tatt,
så tabellen kan ikke komme i utakt med tallene til høyre for den.

**Overflytsregel (deterministisk, ikke målt):** maks **10** skjøterader på side 1. Er
det flere, vises de 9 første, og rad 10 blir «… og *m* flere skjøter — se «Per skjøt»,
side 2». Tilsvarende for figurens tegnforklaring: maks 8 oppføringer, deretter
«… og *m* flere former». Grensene er valgt slik at høydebudsjettet holder med margin,
og de er faste tall nettopp fordi de skal kunne testes.

Blokk 6 avsluttes med `break-after: page`. Alt over ligger i én `<section class="page-1">`.

### 4.2 Side 2 og utover — beregningen

Rekkefølgen er den brukeren ba om. Nummereringen er rapportens egen og vises.

| § | Overskrift | Kilde |
|---|---|---|
| 1 | Forutsetninger og avgrensning | Fast tekst + `Forutsetninger`-lista fra `_derivationBody()` |
| 2 | Akse- og fortegnskonvensjoner | `axisConventionHtml({ theme: 'print' })` — SVG + tabell + avviksmerknaden om `M_y` |
| 3 | Tverrsnittet | `res.section` / `res.existingSection`: `EA`, `x_c`, `y_c`, `EI_x`, `EI_y`, `EI_xy`, `θ`, `EI_1`, `EI_2` |
| 4 | Effekt av forsterkningen | `res.comparison` + `res.axes` — tabellen «Eksisterende / Sammensatt / Økning» og skjevbøyningsadvarselen |
| 5 | Aksialfordeling | `res.parts` × `res.split.shares` — E, E·A, andel, `N_i`; deretter `ΔN`, andel til nye deler, `q_N = ΔN/L` |
| 6 | Per skjøt (én blokk per skjøt) | `res.joints[i]` — se underinndelingen rett under |
| 7 | Shear lag (Volkersen) | `res.joints[i].volkersen` for de gyldige, med profil-SVG |
| 8 | Utregning | `derivationModel(res)` — formel → innsatte tall → resultat, **alle grupper utfoldet** |
| 9 | Advarsler og merknader | `res.warnings` |

**§6, per skjøt** — faste underpunkter i denne rekkefølgen, én `<article>` per skjøt:

| §6.n | Innhold | Felt |
|---|---|---|
| a | Identitet | `jt.name`, merking `J1…`, type (som §4.1), sider `aNames ↔ bNames`, forbindelsestype, `b` |
| b | Krefter | `q_før`, `q_etter`, `q_V,tot`, `q_N`, `q_tot`, `τ = q_tot/b` |
| c | Kontroll av forbindelsen | Skrue: `s_req`, utnyttelse ved `s`. Lim: `τ` mot `τ_Rd`. Sveis: `q_Rd`, utnyttelse |
| d | **Festemiddelstivhet og samvirkegrad** | `jt.slip` (`K_ser`-kilde: EC5 tabell 7.1 eller fritt innlagt/ETA), `jt.gamma` (`k`, `L_ef`, `γ_eff`, `(EI)_ef`, `EI_full`), `jt.fastenerFull` / `jt.fastenerGamma` |
| e | **Forankring i enden** | `jt.anchorCheck`: `N_G`, `L_req`, utnyttelse mot `L` |
| f | Statisk ubestemthet | Vises bare når `!jt.determinate`: hvilke skjøter deler lasten, og hvilken `shareApplied` som er brukt |

*Hvorfor d og e ligger under hver skjøt og ikke som egne kapitler:* begge er
**per-skjøt-størrelser**. `γ_eff` avhenger av fugestivheten `k` i den ene skjøten,
`N_G` av halvplanet den ene skjøten definerer. Samlet i egne kapitler måtte hver
tabell uansett ha én rad per skjøt, og leseren måtte bla fram og tilbake for å sette
sammen ett skjøtekort. Brukeren listet dem som egne punkter; de får egne
*underoverskrifter* med eget nummer, slik at de står i innholdsoversikten og kan
refereres — men de blir stående der tallene hører hjemme.

Hver `<article>` per skjøt er en **atomblokk** (§6.3). Blir en skjøt for høy for én
side (mulig med Volkersen-profil og lang γ-utledning), splittes den på
underpunktgrensene a–f, som hver for seg er atomære. Regelen: `article` får
`break-inside: auto`, underpunktene `break-inside: avoid`, og overskrift a bindes til
b med `.keep-with-next` (§6.3).

---

## 5. Faglig innhold som må stå i rapporten

Fire tekstblokker er **normative** — de skal stå der ordrett i innhold, fordi de er
lette å ta feil av eller å utelate.

### 5.1 Superposisjonen av de to lasttilstandene

> Den eksisterende bjelken bærer allerede «før»-lasten i det forsterkningen monteres.
> Bare tilleggslasten «etter» virker på det sammensatte tverrsnittet. De to
> superponeres: `q_V,tot = |q_før| + |q_etter|`.

Plassering: under lasttabellen på side 1, og som note i §6b.

### 5.2 Hvorfor en skjøt mot ny del ikke har noen «før»-tilstand

> En skjøt mot en ny del har ingen «før»-tilstand: før forsterkningen ble montert
> fantes ikke den nye delen, og ingen skjærstrøm krysset fugen. `V_før` gir derfor
> ingen skjærstrøm her. Virker skjærkraften på det forsterkede tverrsnittet, hører
> den hjemme under «etter».

Plassering: som fotnote til Type-kolonnen på side 1 når minst én skjøt er «mot ny del».

### 5.3 Momentet gir ikke et eget bidrag til skjærstrømmen — NORMATIV

Dette er den ene misforståelsen rapporten er nødt til å lukke. Skal stå som en rammet
blokk **både** i §6b (rett over kraftlista) og i §8-innledningen:

> **Momentet er allerede med.** `q_V = V·ES*/EI` **er** momentets virkning i snittet,
> siden `q = dN/dz` og `N_G = M·ES*/EI` er samme kraft sett fra to sider. Å vise et
> «bidrag fra `M`» ved siden av «bidrag fra `V`» i skjøtekreftene ville telt den samme
> kraften to ganger.
>
> Momentets egen rolle er `N_G` — den **kumulative** kraften fugen må ha levert fram
> til snittet. Den gir et **separat forankringskrav** i skjøteenden (§6e), ikke et
> tillegg til skjærstrømmen. De to er **alternative kriterier der det største styrer**,
> aldri ledd i en sum.

Konsekvenser for implementasjonen, som en agent ikke skal kunne bomme på:

- Kraftlista i §6b og krafttabellen på side 1 har **nøyaktig** postene
  `q_før`, `q_etter`, `q_V,tot`, `q_N`, `q_tot` — det er de samme postene
  `_forceSummaryBody()` og `_jointCard()` viser i dag. **Ingen post som heter
  «fra M», «q_M» eller lignende skal legges til noe sted.**
- `q_N = ΔN/L` er **aksialkraften** `N_etter` fordelt etter aksialstivhet, ikke
  momentet. Den er med i summen fordi den er en annen kraft.
- `N_G` (§6e) skal aldri adderes til `q_tot`, og skal aldri divideres på `L` og
  presenteres som en skjærstrøm ved siden av `q_V`.
- Rapporten skal si dette i klartekst, ikke bare unnlate å gjøre feilen.

Forankringskriteriet skrives ut med sin egen kapasitet, slik at det står klart at det
er en **annen** sammenligning enn skjærstrømskontrollen:

```
L_req = N_G / q_Rd            q_Rd = τ_Rd·b   (lim)
                              q_Rd = n_rader·F_Rd/s   (skruer)
                              q_Rd = n_sveiser·a·f_vw,d   (sveis)
```

`q_Rd` er den samme kapasiteten som `q_tot` kontrolleres mot i §6c. Det er *kapasiteten*
som er felles; kraftene er to forskjellige ting. Rapporten skal si det med den setningen.

### 5.4 Avgrensning: hvor sterk, ikke hvordan — NORMATIV

Skal stå nederst på side 1 og som §1 på side 2:

> **Hva dette verktøyet svarer på — og hva det ikke gjør.** Verktøyet sier **hvor
> sterk** forbindelsen mellom delene må være: skjærstrøm `q_tot` [N/mm] langs hver
> skjøt, aksialkraften `N_G` [kN] som må forankres i enden, og skjærspenningen
> `τ = q_tot/b` i heftflaten.
>
> Det sier **ikke hvordan** forbindelsen skal utføres. Valg av festemiddel,
> kantavstander og senteravstander, innfestingsdetaljer, hulltaking, og de
> materialspesifikke kontrollene av selve forbindelsen hører hjemme i andre verktøy,
> fordi de avhenger av materialer og stedlige forhold. Tallene her er **inndata** til
> den jobben.
>
> Kontrollene som *er* med — nødvendig senteravstand `s_req`, utnyttelse mot `F_Rd`,
> `τ_Rd` for lim, `q_Rd` for sveis — er dimensjoneringskrav som følger direkte av
> `q_tot`, ikke en fullstendig kontroll av forbindelsen.

---

## 6. Teknisk løsning for A4 og sidebrudd

### 6.1 Struktur: rapporten flyttes ut av appen før print

Nøyaktig mønsteret fra `concrete_slab_design/script.js` (`stageReportForPrint`,
`clearPrintStage`, `beforeprint`/`afterprint`), med én ekstra grunn til å bruke det
her: appen er et **fullhøyde flex-oppsett** der begge sidepaneler har
`overflow-y-auto`. Innhold inne i en scroll-container klippes til én side i utskrift.
Rapporten *må* derfor ut av det treet.

```
index.html
  <body class="h-screen flex flex-col">        ← app-treet, skjules i print
    <header>…</header>
    <div class="flex flex-1 min-h-0">…</div>
    <div id="report-overlay" hidden>           ← skjermvisning (fixed, egen scroll)
      <div class="report-toolbar">…</div>      ← «Skriv ut», «Lukk», beskrivelsesfelt
      <div class="report-content">…</div>      ← selve dokumentet, hvit, 174 mm bredt
    </div>
    <div id="gwPrintRoot" aria-hidden="true" hidden></div>   ← direkte barn av <body>
```

`stageReportForPrint()` kloner `.report-content` inn i `#gwPrintRoot`, setter
`root.hidden = false`, og lar `print.css` styre resten. `clearPrintStage()` tømmer
igjen på `afterprint`. Klone, ikke flytte, så skjermvisningen står urørt om utskriften
avbrytes. Rapporten bygges **på forespørsel**, når overlegget åpnes — ikke ved hver
`store`-oppdatering; den er for tung til å bygges i `requestAnimationFrame`-løkka i
`main.js`.

`Ctrl+P` skal gi samme dokument som knappen: derfor `beforeprint`-lytteren. Er
overlegget lukket når `Ctrl+P` trykkes, bygges rapporten først, og
`clearPrintStage()` river den ned etterpå.

### 6.2 Den ene strukturelle regelen

```css
@media print {
  @page { size: A4 portrait; margin: 18mm 16mm 20mm 20mm; }

  html, body {
    background: #fff !important; color: #111 !important;
    margin: 0 !important; padding: 0 !important;
    /* Kritisk i denne modulen: appen er h-screen med overflow-hidden.
       Uten dette klippes utskriften til én side. */
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    font-size: 9.5pt !important; line-height: 1.45 !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  body > *            { display: none !important; }
  body > #gwPrintRoot { display: block !important; }

  #gwPrintRoot, #gwPrintRoot * {
    overflow: visible !important;     /* ingen arvet scroll-container */
    position: static !important;      /* ingen fixed/sticky i utskrift */
    box-shadow: none !important; text-shadow: none !important;
    max-width: 100% !important;
    overflow-wrap: break-word !important;
  }
}
```

`position: static !important` på alt inne i print-roten er tryggere enn å lete opp
enkelttilfeller: `position: fixed` gjentas på hver side i Chrome og forsvinner i
Firefox. Unntaket er figuren, som ikke bruker posisjonering i det hele tatt (§7).

Typografi, farger, tabeller og rutenett kopieres fra
`concrete_slab_design/print.css` med `#slabPrintRoot` → `#gwPrintRoot`. Den fila er
gjennomarbeidet og løser allerede: Tailwind-tekststørrelser uttrykt i punkt,
seksjonsfarger bevart mens resten tvinges nær-svart, `thead { display: table-header-group }`,
og formellinjer som brytes i stedet for å renne ut over høyre kant. **Ikke skriv den
på nytt.**

### 6.3 Sidebrudd: atomblokker og «bind til neste»

Tre CSS-mekanismer, i prioritert rekkefølge, alle med gammel og ny syntaks fordi
Safari fortsatt trenger `page-break-*`:

**(a) Atomblokk — det som aldri skal splittes.**

```css
#gwPrintRoot .atomic,
#gwPrintRoot table,
#gwPrintRoot tr,
#gwPrintRoot svg,
#gwPrintRoot figure {
  page-break-inside: avoid;
  break-inside: avoid;
}
```

Alle blokkene som §4.2 lister — hvert `calc`-element (formel + innsetting + resultat +
note), hver tabellrad, hvert underpunkt a–f i et skjøtekort, hver figur, hver
advarselsboks — merkes `class="atomic"` i markup. Det er markup-siden som avgjør hva
som er atomært, ikke en liste over Tailwind-klasser i CSS-en. Det var nettopp
klasselistene som gjorde den delte `report-print.css` skjør.

**(b) Bind overskrift til det som følger.** `break-after: avoid` på en `<h3>` er
**ikke pålitelig** i Chromium — den ignoreres i flere layoutsituasjoner, og er den
vanligste grunnen til at en overskrift blir stående alene nederst på en side. Den
robuste løsningen er å pakke overskriften og dens første blokk sammen:

```html
<div class="keep-with-next">
  <h3>6.2 Krefter</h3>
  <table class="atomic">…</table>
</div>
```

```css
#gwPrintRoot .keep-with-next { page-break-inside: avoid; break-inside: avoid; }
#gwPrintRoot h1, #gwPrintRoot h2, #gwPrintRoot h3, #gwPrintRoot h4 {
  page-break-after: avoid; break-after: avoid;    /* belte og bukseseler */
}
```

`.keep-with-next` er den som faktisk virker; `break-after: avoid` blir stående som en
gratis forbedring der nettleseren respekterer den. **Enhver overskrift i rapporten
skal ligge i en `.keep-with-next`.** Det er en byggeregel, ikke en stilregel, og skal
håndheves av `report.js` sin `section()`-hjelper, ikke av disiplin.

**(c) Enkeltlinjer.** `orphans: 3; widows: 3;` på `p`, `li` og `td`. Virker i
Chromium og WebKit, ignoreres av Firefox — derfor er ikke noe i rapporten *avhengig*
av det; det er finpuss.

**Fem fallgruver som skal stå i implementasjonsinstruksen:**

1. `break-inside: avoid` virker **ikke** på et element som er flex- eller grid-*item*
   i Chromium. Rapportens atomblokker skal være vanlige blokkelementer. Bruk grid til
   *innholdet inni* en atomblokk, aldri til å stable atomblokkene.
2. Et element som er **høyere enn 259 mm** kan ikke unngå å splittes, uansett CSS.
   Slike må deles i mindre atomblokker. Audit-funksjonen (§8.1) finner dem.
3. `height: 100%` eller `100vh` noe sted i print-treet ⟹ tom side eller klipping.
   `#gwPrintRoot` og alt under skal ha `height: auto`.
4. En SVG med prosent-høyde måles feil i Safari ved utskrift. Figuren får derfor
   **absolutte mm-mål** i `width`/`height` (§7.4).
5. Marger som kolliderer (margin collapse) over et sideskift gir ujevn topp på side 2+.
   Bruk `margin-top` bare på seksjoner, `padding` inne i atomblokker.

### 6.4 Sideskiftet mellom side 1 og side 2

```css
#gwPrintRoot .page-1  { page-break-after: always; break-after: page; }
#gwPrintRoot .page-2  { page-break-before: always; break-before: page; }
```

Begge, ikke bare den ene — en `break-after` på siste barn ignoreres i noen motorer,
mens en `break-before` på det neste elementet respekteres, og motsatt. De to sammen
gir aldri en blank side, fordi de peker på samme skift.

### 6.5 Skjermvisningen speiler papiret

`.report-content` får `width: 174mm` og hvit bakgrunn **også på skjerm**, inne i
overlegget. Det gjør at linjeskift, tabellbredder og figurstørrelse er de samme som
på papir, slik at man ser problemet før man skriver ut. Overlegget har i tillegg en
avkryssbar **«Vis sidegrenser»** som legger på en gjentakende bakgrunn med en tynn
strek hver 259. mm:

```css
.report-content[data-page-guides] {
  background-image: repeating-linear-gradient(
    to bottom, transparent 0, transparent 258mm, #ef4444 258mm, #ef4444 259mm);
}
```

Det er en *indikasjon*, ikke en fasit — den tar ikke hensyn til at utskriftsmotoren
skyver innhold nedover for å unngå brudd. Fasiten er §8.1 og §8.2. Men den fanger
«figuren er for høy» og «tabellen strekker seg over grensen» på et halvt sekund.

---

## 7. Tverrsnittstegningen — anbefaling og begrunnelse

### 7.1 Anbefaling

**Generer en egen SVG fra polygonene. Ikke fang lerretet som raster.**

### 7.2 Begrunnelse

| Hensyn | Raster fra WebGL-lerretet | Generert SVG |
|---|---|---|
| **Fanging i det hele tatt** | `canvas.toDataURL()` på en WebGL-kontekst returnerer **blankt** med mindre konteksten er opprettet med `preserveDrawingBuffer: true`, eller man tegner om og leser av i samme frame. `viewport.js` oppretter ikke renderen slik. Å skru på det koster ytelse i hele appen for én funksjons skyld. | Ingen fanging. Rene data inn, streng ut. |
| **Oppløsning** | Lerretet er typisk ~900 px bredt. Skalert til 174 mm blir det ~130 dpi — og skriftene i figuren, som er tegnet som sprite-teksturer i `_label()`, blir grøtete. | Vektor. Skarp i enhver oppløsning og ved enhver zoom i PDF-leseren. Oppfyller M2. |
| **Riktig innhold** | Lerretet viser *appen*: rutenett, snap-markører, utvalgsmarkering, bildeunderlag, hover-tilstand, og etiketter dimensjonert i skjermpiksler. Det er feil innhold for en rapport, og må uansett skrus av element for element. | Vi tegner nøyaktig det rapporten trenger, og ingenting annet. |
| **Annotasjon** | Målsetting, skjøtemerking, tyngdepunktsymbol og hovedakser måtte tegnes inn i three.js-scenen *bare* for rapporten, og deretter skrus av igjen. | Målelinjer, skjøteledere, tyngdepunktskors, hovedakser og tegnforklaring er **ekte grafikkelementer**, plassert i tegningens koordinatsystem. Det var nettopp dette brukeren pekte på. |
| **Skalering i PDF** | Fast pikselstørrelse; blir enten uskarp eller feil målestokk. | Tegnes i en **navngitt målestokk** (1:20, 1:50 …), som er det en tegning skal ha. |
| **Robusthet** | Asynkron timing mot rendrings-loopen; `tainted canvas` hvis et bildeunderlag fra en annen origo er lastet ⟹ `toDataURL()` kaster. | Synkron, ren funksjon. Kan enhetstestes i Node uten DOM. |
| **Filstørrelse** | En base64-PNG på 174 mm i brukbar oppløsning er 0,5–2 MB, lagt inn i HTML-en og igjen i PDF-en. | Typisk 10–40 kB. |
| Kostnad | Lav (fem linjer) — hvis den hadde virket. | ~250 linjer i `report-figure.js`, pluss tester. |

Kostnaden i siste rad er den eneste reelle innvendingen, og den betales én gang.
Alt annet i tabellen peker samme vei.

Dette er et **bevisst avvik** fra `concrete_plate_CFRP-report-spec.md`, som foreslår
`canvas.toDataURL()`. Det avviket er greit fordi de to tilfellene ikke er like:
CFRP-modulen fanger et **Chart.js-2D-diagram**, der oppløsning er nok og innholdet
allerede er «rapportklart». Her er lerretet WebGL, og figuren er en **måltegning**
der linjevekt, tekststørrelse og målestokk er en del av innholdet.

### 7.3 Datakilder — alt finnes allerede

| Element | Kilde |
|---|---|
| Konturer, inkl. hull | `analyze(state.shapes, state.mode).parts[i].multi` — MultiPolygon på formen `[[ytterring, ...hullringer], …]`, dokumentert i toppen av `geometry.js`. Faller tilbake på `shape.points` hvis `analyze()` feilet. |
| Netto tverrsnitt (etter overlapp/hull) | `analysis.netMulti` |
| Farge, navn, ny/eksisterende, E | `state.shapes[i].color / .name / .stage / .material.E` |
| Skjøtelinjer | `state.joints[i].a`, `.b` — to punkt i arbeidsenhet |
| Skjøtetype | `res.joints[i].existingOnly` / `.hasNeighbor` (§4.1) |
| Tyngdepunkt, sammensatt | `res.section.xc`, `res.section.yc` [mm] |
| Tyngdepunkt, eksisterende | `res.existingSection.xc`, `.yc` [mm] |
| Hovedaksevinkel | `res.axes.after.thetaDeg`, `res.axes.before.thetaDeg` |
| Ytre mål | `geometry.js` sin `boundsOfShapes` / `store.bounds()` |
| Målsettingstekst for parametriske former | `describeShape(shape)` i `shapes.js` → `{kind:'rect', b, h, …}` / `{kind:'circle', c, r}` / `{kind:'shell', p1, p2, t, length}` / `null` |
| Nullpunktsmarkør | `state.reference` |

Merk enhetene: `state.shapes[].points` er i **arbeidsenhet** (`state.unit`, som er
`'mm' | 'cm' | 'm'`), mens alt fra `computeReinforcement` er i **mm** (den skalerer med
`k = unitInfo(unit).toMillimetres` = 1 / 10 / 1000 før mekanikken). `report-figure.js`
skal skalere geometrien til mm **først**, med samme `k`, og deretter jobbe i mm hele
veien. Blandes de to, havner tyngdepunktskorset et helt annet sted enn tverrsnittet —
og det er en feil som ser plausibel ut på skjermen i mm-modus og bare dukker opp når
noen jobber i meter.

Merk også hullmodellen: en `shape` har **én ring** (`points`, åpen). Hull lages ikke
som innerringer, men som **egne former med `role: 'void'`**, som trekkes fra i
`analyze()`. Det er derfor `analysis.parts[i].multi` og `analysis.netMulti` — som er
ekte MultiPolygon med innerringer — er riktig kilde til konturene, ikke `shape.points`.
`role: 'void'`-former skal ikke tegnes som egne fylte flater i figuren; de er allerede
trukket fra i `netMulti`. Tegn per form fra `parts[i].multi` for farge og tegnforklaring,
og bruk `netMulti` som fasit for ytterkonturen.

### 7.4 Figurens oppbygging

Utstedes som:

```html
<svg width="174mm" height="112mm" viewBox="0 0 174 112" role="img"
     aria-label="Tverrsnittet med skjøter, tyngdepunkt og hovedakser">
```

Med `viewBox` i **mm** blir `stroke-width="0.25"` en 0,25 mm strek og
`font-size="2.5"` en 2,5 mm (≈7 pt) skrift, uansett målestokk. Det er hele poenget
med å velge mm som brukerenhet.

**Transformasjonen skal skje i JavaScript, ikke som `transform="scale()"` på gruppa.**
Skalerer man gruppa, skaleres strekbredder og skrift med, og ved 1:100 blir alt
hårtynt og uleselig. `vector-effect="non-scaling-stroke"` finnes, men støtten i
utskrift er ujevn. Regelen: `toPaper([x_mm, y_mm]) → [px_mm, py_mm]` kalles på hvert
punkt før `d`-strengen bygges, og y snus (`py = originY - (y - y0)/S`), siden SVG har
y nedover.

Målestokk `S` velges som den minste i lista `[1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200,
250, 500, 1000]` som gjør at tegningen med målelinjer og tegnforklaring får plass i
tegneflaten. Målestokken **skrives i figuren**: «Målestokk 1:20 · mål i mm».

Innhold, i tegnerekkefølge (bakerst først):

1. **Former.** Én `<path>` per form, hele MultiPolygon-en som ett `d` med subpaths og
   `fill-rule="evenodd"` — det gir hull gratis. Fyll: en lys, **opak** variant av
   `shape.color` (regn den ut mot hvitt i JS; ikke bruk `fill-opacity`, som blir
   upålitelig når `print-color-adjust` ikke slår gjennom). Strek `#334155`, 0,25 mm.
2. **Nye deler** får i tillegg stiplet kontur (`stroke-dasharray="1.5 1"`) og en
   diagonal skravur via `<pattern>` — samme visuelle konvensjon som lerretet bruker
   for `stage === 'new'` (`viewport.js`, `dashedPolylinePositions`), så tegningen
   leses likt på skjerm og papir.
3. **Hovedakser** gjennom det sammensatte tyngdepunktet: to lange strek-prikk-linjer
   (`stroke-dasharray="4 1 0.6 1"`), 1-1 og 2-2, rotert `θ`, merket `1–1 (EI₁)` og
   `2–2 (EI₂)`. Tegnes bare når `res.axes.after` er gyldig.
4. **Tyngdepunkt.** Sammensatt: fylt kors-i-sirkel ved `(xc, yc)`, merket `TP` med
   koordinater. Eksisterende: åpen sirkel ved `existingSection`, merket `TP₀`, bare
   når `!res.allExisting` og avstanden er større enn 0,5 mm på papiret — ellers
   overlapper de to merkene og gir bare rot.
5. **Skjøter.** Linje `a→b` i `JOINT_COLOR` (`#2dd4bf`) mørknet til trykk (`#0d9488`),
   0,6 mm, med en kort vinkelrett endestrek i hver ende. Leder ut til en merkelapp
   `J1`, `J2` … i en liten rammet boks. **Typen kodes i merkelappen, ikke i strekens
   utseende:** `J1 ᴇ–ᴇ` for eksisterende↔eksisterende og `J2 ᴇ–ɴ` for mot ny del.
   Grunnen er at to nesten like streker på en liten tegning er verre å skille enn to
   ulike merkelapper — og tabellen på side 1 staver det uansett ut.
6. **Målsetting.** Total bredde under figuren og total høyde til venstre: målelinje
   med skråstreker i endene (byggmesterstrek, ikke pil), hjelpelinjer opp til
   konturen, mål i mm over streken. Ikke per-del-mål — det blir uleselig og er
   ikke det figuren er til for.
7. **Aksetriade** nede i høyre hjørne: `x` mot høyre, `y` opp, `z` som ring med
   prikk ut av planet — identisk med figuren i `axisConventionHtml()`, så leseren
   ikke må slå opp to konvensjoner.
8. **Tegnforklaring** i en rammet boks: fargeprøve · formnavn · `E` [N/mm²] ·
   «eksisterende»/«ny», maks 8 oppføringer.

Tomtilfelle: uten former tegnes en tom ramme med teksten «Ingen geometri i modellen».
Rapporten skal fortsatt kunne skrives ut.

---

## 8. Testopplegg

Sidebrudd verifiseres i **tre lag**. Lag 1 er automatisk og finner det CSS aldri kan
fikse; lag 2 er nettleserens egen sidefordeling; lag 3 er sluttproduktet.

### 8.1 Lag 1 — måling i siden (automatisk)

`report.js` eksponerer `window.__gw.report.audit()` (samme feilsøkingsobjekt som
resten av modulen allerede bruker). Den:

1. Kalibrerer piksler per mm ved å måle et element med `height: 100mm` — aldri ved å
   anta 96 dpi, som er feil ved zoom og på HiDPI.
2. Regner ut `pageH = 259 mm` i piksler.
3. Går gjennom hvert element med `.atomic`, måler `top` og `bottom` relativt til
   `.report-content`, og rapporterer to feiltyper:
   - **`oversize`** — `bottom - top > pageH`. Blokken er høyere enn en side og
     **kommer til å splittes uansett CSS**. Dette er den viktigste sjekken, og den
     eneste som er 100 % sann uavhengig av utskriftsmotoren.
   - **`straddle`** — `floor(top/pageH) !== floor((bottom - 0.5)/pageH)`. Under
     antakelsen om kontinuerlig flyt ville blokken krysset et sideskift. En ekte
     utskriftsmotor skyver den ned i stedet, så dette er en *indikasjon* på at
     marginene er trange, ikke en feil i seg selv. Rapporteres som advarsel.
4. Sjekker at `.page-1` sin høyde ≤ `pageH` — **det er M1**, og den er eksakt.
5. Returnerer `{ pxPerMm, pageHeightMm, blocks, oversize: [], straddle: [], page1Mm }`
   og tegner en rød ramme rundt hver `oversize` når den kalles med `{ mark: true }`.

Kjøres mot hver fikstur i §8.3. **Godkjent = `oversize.length === 0` og `page1Mm ≤ 259`.**

### 8.2 Lag 2 — utskriftsforhåndsvisning, tre nettlesere

Chrome, Edge og Firefox, med **Skalering 100 %**, **Marger: standard**, **Bakgrunns­grafikk: på**.
For hver fikstur:

| # | Sjekk |
|---|---|
| 1 | Side 1 er nøyaktig én side, og §2 begynner øverst på side 2 |
| 2 | Ingen blank side noe sted |
| 3 | Ingen overskrift er siste linje på en side |
| 4 | Ingen tabellrad er delt; tabellhoder gjentas på ny side |
| 5 | Ingen `calc`-blokk er delt mellom formel, innsetting og resultat |
| 6 | Figuren og Volkersen-profilene er hele, ikke delt |
| 7 | Ingen tekst går ut over høyre marg (den klassiske feilen med lange formellinjer) |
| 8 | Fargene på seksjonsoverskriftene er der (⟹ `print-color-adjust` slår gjennom) |
| 9 | Appens header, paneler og lerret er borte fra utskriften |
| 10 | `Ctrl+P` med overlegget lukket gir samme dokument som «Skriv ut»-knappen |

### 8.3 Fiksturer

`geometry_workspace/tests/fixtures/report/*.json`, lagret med modulens egen
«Eksporter», lastet med «Importer modell». Faste modeller gjør testen repeterbar og
gjør en regresjon sporbar.

| Fil | Hva den treffer |
|---|---|
| `01-tom.json` | Ingen former, ingen skjøter — rapporten skal fortsatt bygges og skrives ut |
| `02-i-profil-eksisterende.json` | `allExisting`, én sveiset skjøt steg↔flens. **Fasit:** `q = 452,754655 N/mm` (samme tall som `composite.test.mjs` sjekker) |
| `03-rektangel-udelt.json` | Én skjøt i et udelt rektangel. **Fasit:** `q = 250 N/mm` |
| `04-laminat-halv-overflens.json` | Skjevbøyning innført: sidevegs andel `15,0 %`, `N_G = 36,4 kN`. Treffer advarselsboksen og §4 |
| `05-mange-skjoter.json` | 12 skjøter ⟹ overflytsregelen på side 1 (9 rader + «og 3 flere») |
| `06-limt-shear-lag.json` | Lim med `G_a`/`t_a` ⟹ Volkersen-profil og toppfaktor, §7 |
| `07-statisk-ubestemt.json` | Flere skjøter på samme del ⟹ `shareApplied`, §6f og advarsel |
| `08-lange-navn-meter.json` | `unit: 'm'`, formnavn på 60 tegn, tall i størrelsesorden `1e12` ⟹ tekstbryting og mm-konvertering i figuren |
| `09-L-null.json` | `L = 0` ⟹ `q_N` udefinert, advarsel, `L_req`-kontroll faller bort |
| `10-hull-og-overlapp.json` | En form med `role: 'void'` inne i en annen, pluss to overlappende solide former, i modus `priority` ⟹ `netMulti` får en innerring, og figuren må tegne den som hull (`fill-rule="evenodd"`), ikke som en egen flate |

### 8.4 Enhetstester (Node, ingen DOM)

Samme mønster som de tre eksisterende testfilene: `node <fil>`, exit 0/1, ingen
avhengigheter, hver forventet verdi håndregnet i kommentaren over sjekken.

**`tests/derivation.test.mjs`** — `derivationModel(res)`:
- returnerer gruppene i fast rekkefølge for `allExisting` og for forsterket
- hver post har `{sym, formula, subst, result}` med ikke-tomme strenger
- **ingen post har `sym` eller `formula` som inneholder et momentbidrag til
  skjærstrømmen** — en regresjonstest direkte på §5.3. Konkret: for hver skjøtegruppe
  er mengden `sym`-verdier i kraftdelen nøyaktig
  `{'q_før','q_etter','q_V,tot','q_N','q_tot'}` (eller `{'q_før'}` ved `allExisting`)
- `q_tot`-postens `formula` er `q_tot = q_V,tot + q_N` — ingen `+ q_M`

**`tests/report-figure.test.mjs`** — `buildFigureSvg(model)` returnerer en streng:
- `viewBox` er `0 0 174 112`, `width="174mm"`
- valgt målestokk er den forventede for en gitt utstrekning (tabelldrevet: 300 mm bred
  ⟹ 1:2; 3000 mm ⟹ 1:20; 60 mm ⟹ 1:1)
- en form med ett hull gir én `<path>` med to subpaths (`d` inneholder to `M`) og
  `fill-rule="evenodd"`
- alle `stroke-width` ligger i `[0.1, 1.0]` **uansett målestokk** — dette er testen som
  fanger «skalert gruppe»-feilen fra §7.4
- geometri i `unit: 'm'` gir samme papirkoordinater som den samme geometrien i
  `unit: 'mm'` ganget med 1000 — mm-konverteringen fra §7.3
- ingen former ⟹ gyldig SVG med teksten «Ingen geometri i modellen»
- utdata inneholder ingen `transform="scale(`

### 8.5 Innholdssjekkliste (M4)

Manuell, én gang per bølge, mot fikstur `04`: hver av §4.2 sine ni seksjoner og hvert
av §6 sine seks underpunkter finnes i rapporten, og hvert tall som står i
«Forsterkning»-fanen finnes igjen i rapporten med samme verdi. Avvik her betyr at
`report.js` og panelet har divergert — som er akkurat det M5 skal gjøre umulig for
formlenes del, men ikke for tabellenes.

**Bruk `ReinforcementPanel.clipboardText()` som fasitliste.** Den finnes allerede
(`reinforcement-ui.js`, ca. linje 1550) og er dagens nærmeste ting til en rapport: ren
ASCII-tekst med lasttabell, «Effekt av forsterkningen» (EA / EI_x / y_c / θ før→etter
med prosentendring), aksialfordelingen, og per skjøt `q_foer`, `q_etter`, `q_V,tot`,
`q_N`, `q_tot`, `b`, `tau`, forbindelsestype, `s_req`/utnyttelse, Volkersen
`lambda`/`q_max`/toppfaktor, `gamma_eff`/`EI_ef`/`EI_full`, forankring
`N_G`/`L_req`/utnyttelse, og to forutsetningslinjer. Er en størrelse i
`clipboardText()` og ikke i rapporten, er rapporten ufullstendig.
`clipboardText()` beholdes uendret — den er til rask innliming i en e-post, ikke en
konkurrent til rapporten.

### 8.6 Regresjon i det eksisterende

Etter bølge A (§9): `node geometry_workspace/tests/reinforcement.test.mjs`,
`joints.test.mjs` og `composite.test.mjs` skal alle fortsatt gi exit 0, og
«Forsterkning»-fanen skal se **nøyaktig lik ut** som før — bølge A flytter formler,
den endrer dem ikke. Sammenlign med et skjermbilde tatt før endringen.

---

## 9. Arbeidsdeling i bølger

Fem bølger. Hver er en egen commit som kan slås sammen for seg, og hver har et
verifiserbart sluttpunkt. Bølge A endrer ikke hva brukeren ser; bølge B–E bygger på
hverandre.

### Bølge A — `derivation.js`, uten synlig endring

Trekk utledningen ut av `_derivationBody()` i `reinforcement-ui.js` og inn i en ren,
DOM-fri `js/derivation.js`:

```js
/**
 * @returns {Array<{ key: string, title: string,
 *                   steps: Array<{sym, formula, subst, result, note}> }>}
 */
export function derivationModel(res) { … }
```

`reinforcement-ui.js` sin `_derivationBody()` blir da en ren rendrer over den
modellen. Ingen formelstreng blir igjen i `reinforcement-ui.js`.

**Ikke skriv om formler som allerede finnes som ferdige strenger.**
`connection-stiffness.js` returnerer `formula` og `substituted` (flerlinjes,
utskriftsklare) fra `ec5Kser()`, `etaKser()`, `slipModulus()` og
`interfaceStiffness()`. `gammaMethod()` og `anchorageCheck()` returnerer
`notes: string[]` med ferdige norske setninger, og `gammaMethod()` returnerer
`reason` når den ikke er anvendelig. `derivationModel()` skal **plukke opp** disse,
ikke formulere dem på nytt — ellers har vi flyttet duplikatet i stedet for å fjerne det.

**Ferdig når:** de tre eksisterende testene er grønne, `tests/derivation.test.mjs` er
grønn, og fanen er pikselidentisk.

### Bølge B — `report-figure.js`

SVG-generatoren og testene, uten at noe bruker den ennå. Eksponeres som
`window.__gw.report = { figure: () => buildFigureSvg(…) }` slik at den kan inspiseres
i konsollet og limes inn i en tom fil for øyekontroll.

**Ferdig når:** `tests/report-figure.test.mjs` er grønn, og figuren for fiksturene
02, 04 og 10 ser riktig ut ved øyekontroll mot lerretet.

### Bølge C — side 1, overlegg og utskriftsrigg

`print.css`, `#gwPrintRoot`, `#report-overlay`, «Rapport»-knappen,
`stageReportForPrint`/`clearPrintStage`, `audit()`, sidegrense-visningen, og hele
side 1 (§4.1). Side 2 er foreløpig bare en overskrift.

**Ferdig når:** M1, M2 og lag 1-testen er grønne for alle ti fiksturer, og lag
2-sjekklistens punkt 1, 2, 8, 9 og 10 er kontrollert.

### Bølge D — side 2 og utover

Alle ni seksjoner i §4.2, inkludert `axisConventionHtml({ theme: 'print' })`, de
normative tekstblokkene i §5, og skjøtekortene med sine seks underpunkter.

**Ferdig når:** M3, M4, M6 og M7 er oppfylt, og hele lag 2-sjekklisten er kjørt i tre
nettlesere mot alle ti fiksturer.

### Bølge E — dokumentasjon og finpuss

`README.md` får en `## Rapport`-seksjon (hva som står hvor, hvordan man skriver ut,
hva `audit()` er). Beskrivelsesfeltet persisteres. Tomtilfeller og feilmeldinger
pusses.

**Ferdig når:** README beskriver rapporten, og en person som ikke har sett modulen før
kan skrive ut en riktig PDF uten å spørre.

**Bølge A–C kan slås sammen til én PR hvis de gjøres i samme økt** — de har ingen
mellomliggende brukerverdi hver for seg. D og E bør være egne, fordi D er der
innholdet faktisk skal granskes.

---

## 10. Filliste

| Fil | Handling | Formål |
|---|---|---|
| `geometry_workspace/js/derivation.js` | **Opprett** | Ren, DOM-fri utledningsmodell. Eneste sted formelstrengene bor (M5). Bølge A |
| `geometry_workspace/js/report-figure.js` | **Opprett** | `buildFigureSvg(model)` → SVG-streng i mm-koordinater. Bølge B |
| `geometry_workspace/js/report.js` | **Opprett** | Bygger rapport-DOM-en fra `computeReinforcement(state)` + `analyze()`. Eier `stageReportForPrint`, `clearPrintStage`, `printReport`, `audit`. Bølge C/D |
| `geometry_workspace/print.css` | **Opprett** | `@media print`-ark scopet til `#gwPrintRoot`. Portert fra `concrete_slab_design/print.css` med tilleggene i §6.2 |
| `geometry_workspace/tests/derivation.test.mjs` | **Opprett** | §8.4, inkl. regresjonstesten på §5.3 |
| `geometry_workspace/tests/report-figure.test.mjs` | **Opprett** | §8.4 |
| `geometry_workspace/tests/fixtures/report/*.json` | **Opprett** | Ti fiksturmodeller, §8.3 |
| `geometry_workspace/index.html` | **Endre** | `<link rel="stylesheet" href="print.css" media="print">`; «Rapport»-knapp i header ved siden av «Eksporter»; `#report-overlay` med verktøylinje, beskrivelsesfelt og `.report-content`; `#gwPrintRoot` som siste barn av `<body>` |
| `geometry_workspace/js/reinforcement-ui.js` | **Endre** | `_derivationBody()` rendrer fra `derivationModel()` (bølge A). `axisConventionHtml()` får et `{ theme }`-argument med en lys variant (bølge D). Ingen mekanikk endres |
| `geometry_workspace/js/ui.js` | **Endre** | Binder «Rapport»-knappen, åpner/lukker overlegget, sender `analysis` videre. Escape-kaskaden i `main.js` lukker overlegget først |
| `geometry_workspace/js/main.js` | **Endre** | Escape lukker `#report-overlay`; `window.__gw.report` eksponeres |
| `geometry_workspace/js/store.js` | **Endre** | `state.report = { note: '' }`, persistert. **Ingen versjonsbump** — feltet er valgfritt, og fravær ⟹ `''`, så v4-filer åpnes uendret |
| `geometry_workspace/README.md` | **Endre** | Ny `## Rapport`-seksjon (bølge E) |
| `global-devspecs/geometry_workspace-report-plan.md` | **Opprett** | Dette dokumentet |
| `.github/workflows/deploy-all-modules.yml` | **Ingen endring** | `geometry_workspace` står allerede i `paths:` (linje 27) og i kopieringsløkka (linje 121). Hele mappa kopieres rekursivt |
| `module-registry/module-registry.json` | **Ingen endring** | Autogenerert ved deploy. Ikke rediger for hånd |
| `index.html` (rot) | **Ingen endring** | Modulen har allerede kort på forsiden |

---

## 11. Risiko

| Risiko | Konsekvens | Tiltak |
|---|---|---|
| Bølge A endrer utseendet på «Forsterkning»-fanen utilsiktet | Regresjon i det brukeren allerede stoler på | Skjermbilde før/etter; de tre eksisterende testene; ingen tekst omskrives i bølge A, bare flyttes |
| Rapporten bygges ved hver `store`-oppdatering | Merkbar treghet i tegneflyten | Bygges kun når overlegget åpnes, og ved `beforeprint`. Aldri i `scheduleRender()` |
| `overflow-y-auto` og `h-screen` i appen klipper utskriften | Utskriften blir én halv side | `#gwPrintRoot` som direkte `<body>`-barn + den eksplisitte `height:auto/overflow:visible`-resetten i §6.2. Dekkes av lag 2-sjekk 9 |
| `break-after: avoid` på overskrifter ignoreres av Chromium | Overskrift alene nederst på siden — den vanligste og styggeste feilen | `.keep-with-next`-innpakning håndhevet av `section()`-hjelperen i `report.js`, §6.3(b) |
| En skjøteblokk blir høyere enn 259 mm | Splittes uansett CSS | `audit().oversize` fanger det; underpunktene a–f er atomære hver for seg, så bruddet skjer på en pen grense |
| Figuren tegnes med skalert gruppe ⟹ hårtynne streker | Uleselig tegning ved liten målestokk | Eksplisitt forbud i §7.4 + enhetstesten på `stroke-width`-området og på fravær av `transform="scale(` |
| Enhetsforveksling arbeidsenhet/mm i figuren | Tyngdepunktskorset havner utenfor tverrsnittet — ser plausibelt ut i mm-modus | Enhetstesten «m gir samme papirkoordinater som mm × 1000»; fikstur `08` |
| Rapporten og fanen divergerer i innhold over tid | To sannheter | M5 løser formlene. For tabellene: innholdssjekklista §8.5 kjøres ved hver endring i «Forsterkning»-fanen. Nevnes i README |
| Noen legger til et «bidrag fra M» i skjøtekreftene senere | Dobbelttelling av samme kraft | Den normative teksten i §5.3 står i rapporten, **og** i regresjonstesten i §8.4 som feiler hvis en sjette post dukker opp i kraftlista |

---

## 12. Utrulling

- Egen feature-branch, PR mot `master`. Den påkrevde CI-sjekken
  `2dfea type-check + build + test` kjører alltid, men hopper over 2dfea-bygget siden
  ingen 2dfea-filer endres. Den kan **ikke** omgås med `--admin`.
- Push til `master` som treffer `geometry_workspace/**` utløser
  `deploy-all-modules.yml`. Ingen byggesteg for denne modulen — mappa kopieres som den
  er. Ferdig på gh-pages etter 2–3 minutter, live etter ytterligere 1–2 minutter
  cache.
- Verifiser på
  `https://magnusfjeldolsen.github.io/structural_tools/geometry_workspace/`: åpne
  «Eksempel», trykk «Rapport», trykk «Skriv ut», lagre som PDF, kontroller sidetall og
  at figuren er skarp ved 800 % zoom.
- Rulle tilbake: `git revert` + push. Modulen har ingen byggeartefakter, så
  tilbakerullingen er fullstendig.
- Etter en rebase-merge kan lokal `master` divergere fra `origin/master`. Stol på
  `origin/master`; `git reset --hard origin/master` for å synkronisere.

---

## 13. Åpne spørsmål

Ingen av disse blokkerer implementasjonen; hvert har et valgt standardsvar som
gjelder til noen sier noe annet.

1. **Målestokk-kandidater.** Lista i §7.4 er den vanlige byggtekniske. Standard: bruk
   den som den står.
2. **Volkersen-profilen på side 1.** Utelatt der, med vilje — side 1 skal være
   oppgaven, ikke analysen. Standard: bare på side 2+.
3. **Beskrivelsesfeltet.** Persisteres i modellen (`state.report.note`) og følger
   dermed med i eksport-JSON. Standard: ja, det er slik brukeren forventer at et
   modellnavn oppfører seg.
4. **Sidetall.** Overlates til nettleserens egen bunntekst, som i
   `concrete_slab_design`. Standard: ingen egen implementasjon.
