# UX-mockups — concrete_section_calculator

To komplette, klikkbare mockups som skiller seg i **struktur**, ikke i farge. Begge viser
det **samme** utfylte eksempelet: bjelke 300 × 600, C30/37, 3 Ø20 i underkant — og begge
bytter til plate-eksempelet 1000 × 200, Ø12 c/c 113 når du velger «Plate».

| Fil | Struktur |
|---|---|
| [`a-arbeidsark.html`](a-arbeidsark.html) | Ett rullende arbeidsark. Alt åpent, ovenfra og ned, resultatet nederst i samme dokument. |
| [`b-topanel.html`](b-topanel.html) | Fast to-panels-oppsett. Inndatarekke til venstre, én stor tegneflate med faner til høyre. Ingenting ruller ut av syne. |

Åpne dem ved å dobbeltklikke fila. De er selvstendige: Tailwind fra CDN, alt annet inline.
Google Analytics-taggen ligger rett etter `<head>` i begge, slik `CLAUDE.md` krever, siden
de ligger i en mappe som deployes.

Nede til venstre står et lite **Mockup**-panel: «Varm opp på nytt» og «Simuler feilet last»,
så oppvarmingen og feiltilstanden kan vurderes uten å vente på et uhell.

---

## Premissene begge holder

Fra §7 og §11.1 — ikke forhandlet bort noen av dem:

- Rekkefølge **materiale → geometri → armering → last → beregn → resultat**.
- «Beregn» innen rekkevidde fra alle seksjoner (A: fast bunnlinje. B: festet panelfot).
- <kbd>Ctrl</kbd>+<kbd>⏎</kbd> beregner fra hvor som helst. <kbd>?</kbd> viser resten.
- Retningsvalget (felt/støtte) står synlig i lastseksjonen, ikke i avanserte valg.
- Tverrsnittstegningen er ren JS og tegnes ferdig før motoren finnes — prøv å laste sida
  på nytt og skriv i geometrifeltene mens statuspilla fortsatt teller MB.
- Motorstatus med **determinat** framdrift, «6,4 / 10,2 MB», og en klikkbar «Prøv igjen»
  som ikke låser sida (§3.9).
- Resultatet kan inspiseres: x, x/d, ε per lag, σ/f_yd, bruddform, A_s,min/A_s,max,
  n_min/n_max, og hvor lastvirkningen ligger mot kapasiteten.
- Tallfeltene tar uttrykk (`35+8`, `600/2`).

---

## A — «Arbeidsark»

**Optimaliserer for innskrivingsfart og for at hele beregningen kan leses som ett dokument.**

Armeringslagene legges inn på **én korthåndslinje**:

```
3ø20 uk 50        3 stk Ø20, underkant, dc = 50
2x25 ok           2 stk Ø25, overkant, dc auto = c + bøyle + Ø/2
ø12 c113 uk 31    Ø12 c/c 113, underkant, dc = 31
ø10/150           Ø10 c/c 150, underkant, dc auto
```

<kbd>⏎</kbd> legger til og lar markøren stå. En tolkningslinje under feltet viser hva som
ble forstått (`→ 3 × Ø20 · UK · dc 50 · As 942 mm²`) før du trykker. <kbd>↑</kbd> henter
forrige linje tilbake. Radene under er lesbare oppsummeringer, ikke skjemaer — klikker du
på en rad, åpner den seg til den **samme** korthåndslinja. Det finnes derfor ikke en eneste
liten tallboks i armeringsdelen.

**Hva det koster.** Grammatikken må læres. Første gang er plassholderen og eksempellinja
det eneste du har — og en bruker som ikke leser dem, står fast. Resultatet ligger nederst,
så på en laptop må du rulle for å se hva en endring gjorde; den faste bunnlinja bærer bare
η, ΣA_s og d.

## B — «To paneler»

**Optimaliserer for at resultatet er synlig mens du redigerer, og for at ingenting må læres.**

Armeringslagene er kort med **store treffflater**: Ø som brikkerad (8/10/12/16/20/25/32),
antall som ±-stepper, c/c som brikkerad pluss ±5, og d_c med en 🔒-hengelås som holder den
lik `c + bøyle + Ø/2` helt til du selv låser den opp. Du kan òg klikke rett i over- eller
underkant av tegningen for å legge et lag der. Ingen syntaks å huske, og nesten ingenting å
skrive.

Fanene **er** analysevalget: velger du «Moment–krumning», bestiller du den analysen. Det
fjerner en hel kontroll fra skjemaet. Inspeksjonsstripa nederst i høyre panel (η, M_Rd, x,
x/d, ε_c,topp, ε_s,maks, bruddform, ΣA_s, ρ, kontroller) står **fast uansett fane**, så du
ser nøytralaksen flytte seg mens du skrur på armeringen.

**Hva det koster.** Klikk. Og brikker kan per definisjon ikke uttrykke en vilkårlig verdi —
c/c 113 fra plate-fixturen står verken på lista eller i ±5-sprangene fra 150, så feltet
måtte likevel bli skrivbart. Det er akkurat der brikkedesignet tar tilbake den småboksen
det prøvde å fjerne. Kortene er dessuten høye: fire lag fyller hele venstrepanelet, og da
må du rulle i inndata i stedet for i resultatet.

---

## Head-to-head

Å legge inn to lag til (2 Ø20 UK d_c 85, og 2 Ø12 OK d_c 36) på toppen av standardlaget:

| | A | B |
|---|---|---|
| Musklikk | **0** | 9 |
| Tastetrykk | 23 | 6 |
| Sikteoppgaver med mus | **0** | 9, minste mål ≈ 34 × 26 px |
| Må læres først | grammatikken | ingenting |
| Resultat synlig under redigering | η i bunnlinja | **hele inspeksjonsstripa** |
| Rulling for å se resultatet | ja | **nei** |

---

## Hva jeg ville sendt

**A — arbeidsarket**, med tre ting hentet fra B.

Brifen sier «minst mulig klikking, lesing og småbokser», og at armeringslista er der det
avgjøres. Da er null klikk og null småbokser det svaret som faktisk leverer på premisset.
B er finere å møte første gang, men den bruker klikk som valuta — og en bruker som legger
inn fire lag om dagen betaler den prisen hver eneste dag, mens grammatikken betales én gang.
A skalerer òg bedre nedover i lagantall: den femte raden koster like lite som den andre.

Arbeidsarket har dessuten en ekstra gevinst som ikke er ren UX: det er formet som
A4-rapporten i §8. Skjerm og papir får samme mentale modell, og `report.js` får en
dokumentstruktur å speile i stedet for å finne opp.

**Hent fra B, konkret for A4a:**

1. **🔒-hengelåsen på `d_c`.** A regner allerede auto-`d_c` når du utelater den, men lar deg
   ikke se at den er avledet. Hengelåsen gjør regelen synlig og gjør at `d_c` sjelden skrives.
2. **Inspeksjonsstripa i den faste bunnlinja.** A har plass til x, x/d og bruddform ved siden
   av η. Da forsvinner A-ens eneste alvorlige svakhet — at du må rulle for å se hva en endring
   gjorde.
3. **Brikkeraden for Ø som alternativ vei.** Legg den i radeditoren, ikke i innleggingslinja,
   så korthånden fortsatt er hovedveien og brikkene er utveien for den som ikke vil lære den.

Det ene jeg **ikke** ville tatt med fra B, er fane-som-analysevalg. Den er elegant, men den
gjør et klikk på en fane til et 0,4–3 s motorkall uten at brukeren ba om å regne — og i A
ligger uansett alle tre analysene i samme rulleflate.

---

## Datagrunnlag og ærlighet

Alle tall, kurver og omhyllinger er lest ordrett fra `tests/fixtures/`, ikke funnet på.
`docs/mockups` inneholder ingen egen kopi av dem; datablokka øverst i hver fil er generert
fra fixturene.

Verifisert, ikke bare påstått:

- `barPositions()` i mockupene gir **nøyaktig** `payload-beam-300x600.json`
  sin `rebar[0].bars`: `y = −100, 0, +100`, `z = −250`, `dia = 20`.
- ΣA_s, d, ρ regnet i JS treffer `section_props` på alle sifre, for både bjelke (942,478 mm²,
  d = 550, ρ = 0,005712) og plate (1000,861 mm²/m, d = 169, ρ = 0,005922).
- Tøyningslinja i tegningen er `ε(z) = ε_a + χ_y·z` med fixturens egne `eps_a`/`chi_y`, og
  treffer `eps_c_top` = −3,50 ‰ på toppen og `eps_s_max` = 18,86 ‰ i jernene.
- `x = h/2 − (−ε_a/χ_y)` gir 86,0890 mm — identisk med fixturens `x`.

Det eneste jeg har valgt selv, er **M_Ed**: 180 kNm for bjelken og 55 kNm/m for plata.
η = 0,84 er regnet av den som M_Ed/M_Rd(N_Ed), altså med planens egen definisjon.
**N_Ed holdes på 0**, fordi et annet N ville gitt en annen M_Rd som jeg ikke har målt.

---

## Funn for de andre agentene i bølge 1

**1. `nm_domain.m` i fixturene er FORTEGNSATT, ikke `abs`.** Plan §5.2 sier at `m` krysser
JSON-grensa som størrelser i den analyserte retningen. Det gjør den ikke i fila: 13 av 69
punkter i `result-nmdomain-beam-300x600.json` er negative (min −254,74 kNm, maks
+364,25 kNm), og 20 av 69 i plate-fixturen. Enten er fixturen feil eller så er §5.2 feil —
og de kan ikke begge stemme. **A1 og A3 må avklare dette før begge koder mot hver sin
lesning.** Jeg plotter det som står i fila, og det gir den riktige lukkede omhyllingen med
begge momentretninger.

**2. Hvis `abs` innføres, går `radialUtilisation` i stykker — stille.** Regelen «minste
positive λ» (§6) på abs-verdiene folder trykk-/støttegrenen opp i +M-halvplanet. For
bjelken ved N_Ed = 0 krysser strålen da omhyllingen ved **6,39 kNm** i stedet for
214,92 kNm, og λ = 0,0355 gir **η = 28,2** mot det korrekte 0,84. Det feiler ikke, det
lyver. Med fortegnsatt `m` er det ett eneste kryss på +M-siden og regelen virker.

**3. Kryssjekk som bør bli en test.** Lineær interpolasjon i omhyllingen ved N = 0 gir
214,9198 kNm, mot `M_Rd_at_N` = 215,0068 kNm fra det separate bending-kallet — 0,040 %
avvik. At de to veiene til samme tall møtes, er en billig og god regresjonstest på at
`nm_domain` og `bending` snakker om samme tverrsnitt.

**4. Brukbar, men verdt å vite:** `mc.yield_index = 9` er siste punkt *før* knekken i begge
fixturene, ikke første punkt etter. Merket «flytning» i M–κ-plottet sitter derfor på
201,2 kNm for bjelken, ikke på 205,8.
