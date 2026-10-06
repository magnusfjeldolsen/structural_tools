# Orkestreringsprompt – Knutepunkt (Eurokode 5-verktøy)

Denne filen er den formaliserte prompten for autonom, agentbasert videreutvikling av verktøyet.
Den er skrevet slik at én orkestrator (et sterkt modell-nivå) kan lede flere spesialiserte
agenter (rimeligere modell-nivå) gjennom avgrensede oppgaver, med tydelige leveranser og
akseptkriterier. Kopiér relevante deler inn i agentens system-/oppgaveprompt.

---

## 0 Produktmål (uendret gjennom hele utviklingen)

> Et nettleserbasert verktøy (ren JavaScript, ingen backend, publisert på GitHub Pages) som lar
> en norsk byggingeniør definere en mekanisk forbindelse i tre etter NS-EN 1995-1-1:2004+A1:2008+NA:2010,
> plassere festemidler i et gyldig mønster, påføre laster i flere lastkombinasjoner etter NS-EN 1990 NA,
> og få en kompakt, sporbar A4-rapport (PDF) som kan brukes som prosjektdokumentasjon.
> Hvert tall i rapporten skal kunne spores til et punkt, en ligning eller en tabell i en navngitt kilde.

Ikke-forhandlingsbare prinsipper:

1. **Etterprøvbarhet.** Ingen formel uten referanse (standard + punkt/ligning/tabell). Ingen tallverdi
   fra «hukommelse»; materialdata ligger i `src/engine/materials.js` med kilde per tabell.
2. **Kompakt UX.** Brukeren ser bare det som trengs for gjeldende steg. Sidepanelet viser alltid
   status (utnyttelse, tegning, feil). Ingen modaler for vanlig arbeid.
3. **Agent-vennlig.** Alle interaktive elementer har `data-testid`. Hele tilstanden ligger i URL-hash.
   `window.knutepunkt` gir stabilt API (`getState/setState/getResult/goTo/openReport`).
4. **Ren motor.** `src/engine/*` har ingen DOM-avhengigheter og er 100 % enhetstestet med
   håndregnede eksempler. UI kaller `calculateConnection()` og `ulsCombinations()`.
5. **Norsk først.** Norsk bokmål i UI og rapport. Fagtermer følger Standard Norges oversettelse.

---

## 1 Roller

### Orkestrator (sterk modell)
Ansvar: planlegge, dekomponere, skrive akseptkriterier, gjennomgå leveranser, slå sammen,
holde arkitekturen konsistent, avgjøre tolkningsspørsmål i standarden. Skriver *ikke* store
kodemengder selv; skriver spesifikasjoner, tester og gjennomgår diff.

### Standardagent (fag)
Input: ett avgrenset punkt i EC5/EC0 (f.eks. «8.7.3 kombinert aksial- og skjærkraft for skruer»).
Output: en «regelnotat»-fil i `docs/rules/<punkt>.md` med
- ordrett gjengivelse av kravets *struktur* (ikke opphavsrettsbeskyttet fulltekst) i egne ord,
- alle ligninger med variabeldefinisjoner og enheter,
- gyldighetsområde og forutsetninger,
- norsk NA-avvik,
- minst ett håndregnet talleksempel med fasit (brukes direkte som enhetstest),
- kildeliste med punkt/ligning/tabell.

### Motoragent (kode, ren JS)
Input: et regelnotat. Output: implementasjon i `src/engine/` + tester i `tests/` som reproduserer
regelnotatets talleksempel. Hvert beregningssteg legges i `Trace` med `formula`, `subs`, `value`,
`unit`, `ref`. Ingen UI-endringer.

### UI-agent (kode, vanilla JS/CSS)
Input: en UX-spesifikasjon (skjermbilde/wireframe + akseptkriterier). Output: endringer i
`src/app.js`, `src/style.css`, `src/drawing.js`. Krav: bevar `data-testid`, ikke bryt URL-tilstand,
kjør `tests/ui_smoke.py`.

### Rapportagent
Input: liste over hva som skal dokumenteres. Output: `src/report.js`. Krav: A4, flytende
paginering, hver tabellrad med referanse, «Forutsetninger» og «Referanser» alltid til slutt.

### Testagent
Skriver og vedlikeholder `tests/*.test.mjs` (node:test) og `tests/ui_smoke.py` (Playwright).
Lager regresjonstester fra alle regelnotat-eksempler og fra publiserte eksempler i litteraturen
(oppgi kilde, f.eks. lærebok/håndbok, med sidetall).

### UX-revisor (nettleseragent)
Bruker verktøyet som en ny ingeniør via nettleser (ikke API), fra tom side til ferdig PDF.
Leverer en rangert liste over friksjon: hva var uklart, hvor mange klikk, hva manglet.
Kriterier: kan hele flyten gjennomføres på < 3 minutter for et standardtilfelle? Er alle feil
forklart med hva som må rettes? Er rapporten lesbar utskrevet i svart-hvitt?

---

## 2 Arbeidsflyt per oppgave

```
Orkestrator            Standardagent           Motoragent            Testagent        UI-agent
    │ 1. velg neste punkt  │                       │                     │               │
    ├─────────────────────►│ 2. regelnotat + eks.  │                     │               │
    │◄─────────────────────┤                       │                     │               │
    │ 3. godkjenn notat    │                       │                     │               │
    ├──────────────────────────────────────────────►│ 4. implementer     │               │
    │                                              ├────────────────────►│ 5. test = eks.│
    │◄─────────────────────────────────────────────┴─────────────────────┤               │
    │ 6. gjennomgå diff, kjør `npm test`                                  │               │
    ├─────────────────────────────────────────────────────────────────────────────────────►│ 7. UI
    │◄─────────────────────────────────────────────────────────────────────────────────────┤
    │ 8. UX-revisor kjører flyten, rapporterer; orkestrator prioriterer fikser              │
```

Definisjon av «ferdig» for en oppgave:
- [ ] `npm test` grønn, inkludert ny test fra regelnotatets eksempel
- [ ] `python3 tests/ui_smoke.py` grønn (ingen konsollfeil, rapport genereres)
- [ ] Alle nye steg i `Trace` har `ref`
- [ ] `docs/REFERENCES.md` oppdatert om ny kilde er brukt
- [ ] `README.md` «Omfang» oppdatert

---

## 3 Prioritert etterslep (orkestratoren plukker fra toppen)

| # | Oppgave | Kilde | Agent |
|---|---------|-------|-------|
| 1 | Kombinert aksial- og skjærkraft for skruer, (8.28) | EC5 8.7.3 | Standard → Motor |
| 2 | Aksialbelastede skruegrupper: n_ef = n^0,9, vinkel α i (8.38) | EC5 8.7.2 | Standard → Motor |
| 3 | Blokkskjær og pluggskjær | EC5 tillegg A | Standard → Motor |
| 4 | Stålplatens kapasitet (netto tverrsnitt, hullkanttrykk i stål) | NS-EN 1993-1-8 3.6, tabell 3.4 | Standard → Motor |
| 5 | Moment i knutepunkt: kraftfordeling på festemidler (polart treghetsmoment) | Lærebok (oppgi) | Standard → Motor |
| 6 | Fullstendig tabell 8.2 for ikke forboret spiker med ρ_k > 420 | EC5 tabell 8.2 | Standard → Motor |
| 7 | Spikerplater (punched metal plate) | EC5 8.8 | Standard → Motor → UI |
| 8 | Skrudde forbindelser i vinkel (skrå skruer, 45°) | EC5 8.7.2 + ETA | Standard → Motor |
| 9 | Gunstig egenlast (γ_G,inf), ulykkeslast, seismisk | EC0 NA.A1.2 | Standard → Motor |
| 10 | Import av ETA-produktdatabase (JSON) med kilde per produkt | Produsenters ETA | Motor → UI |
| 11 | Interaktiv tegning: dra festemidler, snap til minsteavstand | – | UI |
| 12 | Lagre/laste beregninger som `.json`, flere knutepunkt i én rapport | – | UI → Rapport |
| 13 | Engelsk språkvalg | – | UI |
| 14 | MCP-server som eksponerer `calculateConnection` (valgfritt, etter at UI er stabilt) | – | Motor |

---

## 4 Tolkningsregler som allerede er tatt (må ikke endres uten orkestratorbeslutning)

| Tema | Valg | Begrunnelse |
|------|------|-------------|
| Treskruer, effektiv diameter | d_ef = 1,1·d₁ brukes for både f_h og M_y; regelsett velges etter d_ef ≤ 6 (spiker) / > 6 (bolt) | EC5 8.7.1(2)–(4); konservativt. Bruker kan overstyre M_y,Rk fra ETA. |
| Skruens spiss | 1·d trekkes fra effektiv gjengelengde | EC5 angir ikke; vanlig praksis, konservativt. |
| f_head,k | 10,5 N/mm² dersom ikke oppgitt | Typisk ETA-verdi; skal overstyres. |
| γ_M | 1,25 tre, 1,15 limtre, 1,30 forbindelser | Norsk NA.2.4.1 – verifiser ved ny NA-utgave. |
| Snølast varighet | Korttid | NS-EN 1995-1-1 NA.2.3.1.2 – verifiser for spesialområder. |
| Lastvarighet kombinasjon | Korteste varighet blant bidragende laster | EC5 3.1.3(2). |
| a₃/a₄-kontroll | Mot strengeste av belastet/ubelastet | Forenkling til mønsteret er retningsbevisst (etterslep #11). |
| Oppsprekking F₉₀,Rd | γ_M = 1,3 (forbindelse) | Vanlig praksis; kan diskuteres. |

---

## 5 Kodestandard

- ES-moduler, ingen byggetrinn, ingen avhengigheter i runtime. Bare `node:test` og Playwright til test.
- Enheter: N, mm, N/mm², kg/m³ internt; kN kun i UI/rapport.
- Norske variabelnavn i UI-tekst, engelske i kode. Standardens symboler i strenger (f_h,k, M_y,Rk).
- Alle referanser skrives som `EC5 lign. (8.6)`, `EC5 tabell 8.4`, `EC5 8.7.2(3)`, `NS-EN 1990 NA.A1.2(B)`.

---

## 6 Malprompt for en agentoppgave

```
Du er <rolle> i prosjektet Knutepunkt (se docs/ORCHESTRATION_PROMPT.md, seksjon 0, 4 og 5).
Oppgave: <én setning>.
Kilde(r): <standard, punkt, tabell>.
Leveranse: <filer>.
Akseptkriterier:
  - <konkret, testbart>
  - npm test grønn
Ikke gjør: <avgrensning>.
Rapportér tilbake med: endrede filer, testresultat, åpne tolkningsspørsmål (nummerert).
```
