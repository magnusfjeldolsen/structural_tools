# Knutepunkt – forbindelser i tre etter Eurokode 5

Nettleserbasert verktøy for beregning av mekaniske forbindelser i trekonstruksjoner etter
**NS-EN 1995-1-1:2004+A1:2008+NA:2010** (Eurokode 5) med norsk nasjonalt tillegg, og
lastkombinasjoner etter **NS-EN 1990 NA**. Ren JavaScript, ingen backend, kjører på GitHub Pages.

**Status: prototype (v0.1).** Motoren er enhetstestet mot håndregnede eksempler, men verktøyet
er ikke tredjepartsverifisert. Bruk i prosjekt krever uavhengig kontroll.

## Hva verktøyet gjør
1. **Forbindelse** – tre–tre (ett/to snitt), stålplate–tre (utenpåliggende, innslisset, dobbel).
2. **Materialer** – C14–C30 (NS-EN 338), GL24c–GL32h (NS-EN 14080), S235/S355, klimaklasse.
3. **Festemiddel og mønster** – treskruer, spiker, bolter, stålstavdybler; rader × antall,
   avstander a₁–a₄ kontrolleres live mot tabell 8.2/8.4/8.5; «Sett alle til minste».
4. **Laster** – flere karakteristiske laster (G, nyttelast A–E, snø, vind) med kraftvektor;
   kombinasjoner (6.10a)/(6.10b) med norske faktorer lages automatisk, k_mod velges per kombinasjon.
5. **Resultat og rapport** – Johansen-bruddformer med taueffekt, n_ef, oppsprekking (8.1.4),
   stivhet (tabell 7.1), full beregningsgang med referanse på hvert steg, A4-rapport til PDF.

Alt lagres i URL-en – kopier lenken for å dele beregningen.

## Kjøre lokalt
```bash
npm test                         # motor-tester (node:test, ingen avhengigheter)
python3 -m http.server 8080      # åpne http://localhost:8080
python3 tests/ui_smoke.py        # røyktest av UI (krever Playwright + Chromium)
```
ES-moduler krever en HTTP-server; `file://` fungerer ikke.

## Publisere
Push til `main` → workflow i `.github/workflows/pages.yml` kjører tester og publiserer roten til
GitHub Pages (aktiver Pages med kilde «GitHub Actions» i repo-innstillingene).

## Struktur
```
index.html            skall
src/app.js            tilstand, wizard, orkestrering, agent-API (window.knutepunkt)
src/drawing.js        SVG-tegning (plan + snitt)
src/report.js         A4-rapport
src/style.css         design + print/A4
src/engine/ec5.js     EC5 kap. 8: f_h,k, M_y,Rk, F_ax,Rk, Johansen, n_ef, oppsprekking, K_ser
src/engine/spacing.js minsteavstander
src/engine/combos.js  NS-EN 1990 (6.10a/b), (6.14b), vinkel mot fiber
src/engine/materials.js materialdata med kilde per tabell
tests/                enhetstester + UI-røyktest
docs/ORCHESTRATION_PROMPT.md  formalisert prompt for agentbasert utvikling
docs/AGENT_GUIDE.md   hvordan en agent betjener siden
docs/REFERENCES.md    kilderegister og ligningsregister
```

## Omfang og begrensninger (v0.1)
Implementert: 8.1.2, 8.1.4, 8.2.2, 8.2.3, 8.3.1–8.3.2 (glatt spiker), 8.5.1–8.5.2, 8.6, 8.7.1–8.7.2, tabell 7.1,
tabell 3.1, NA γ_M, EC0 (6.10a/b). Se `docs/REFERENCES.md` for ligningsregister.

Ikke implementert (se etterslep i `docs/ORCHESTRATION_PROMPT.md`): kombinert aksial/skjær for skruer
(8.7.3), blokkskjær (tillegg A), stålplatens kapasitet (EC3-1-8), moment i knutepunkt, spikerplater (8.8),
skrå skruer, gunstig egenlast, ulykkeslaster.

Festemiddelverdier merket «typisk ETA» skal erstattes med produsentens ETA i prosjekter.

## Lisens
MIT. Standardtekster er ikke gjengitt; verktøyet refererer til punkt, ligning og tabell.
