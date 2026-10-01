# thermo2d — ordliste

Begrepene slik de brukes i appen, MCP-serveren, dokumentasjonen og koden.
Ingen implementasjonsdetaljer her; de står i DECISIONS.md.

| Begrep (nb) | Term (en) | Betydning |
|---|---|---|
| **Prosjekt** | Project | Hele modellen i ett dokument: regioner, materialer, randbetingelser, tidsserier, målepunkter, analyser og scenarier. Én sannhet; alt annet er avledet. |
| **Region** | Region | Et sammenhengende område i snittet med ett materiale. Kan ha hull. Regioner kan ligge inni hverandre (f.eks. en stålplate i betong), men ikke delvis overlappe. |
| **Armeringsstang** | Rebar | En rund stang med senter, diameter og stålmateriale. Regnes termisk enten som eget stålområde eller som et målepunkt i betongen (prosjektvalg, se *armeringens termiske modell*). |
| **Armeringssett** | Rebar set | En regel som genererer stenger fra vertsgeometrien (kantrad, hjørner, rutenett, ring) og regenererer dem når geometrien endres. |
| **Overdekning** | Cover | Avstand fra betongoverflaten til *lengdearmeringens* overflate (standard) eller senter (prosjektvalg). Tverrarmering er ikke inkludert; den oppgis som «Ø tverrarmering» på settet og legges til som avstand. |
| **Ø tverrarmering** | Transverse reinforcement diameter | Diameteren på bøyler eller fordelingsarmering som ligger mellom overflaten og lengdearmeringen. Brukes bare til å plassere stengene; regnes aldri termisk. |
| **Bøyle** | Stirrup | Lukket armeringsbane i overdekningsavstand fra kanten. Standard: kun posisjonsreferanse, ikke meshet. |
| **Randbetingelse** | Boundary condition | Hva som skjer på en kant: fast temperatur, konveksjon, konveksjon + stråling, varmefluks eller isolert. Hver kant har nøyaktig én; standard er isolert. |
| **Eksponering** | Exposure | Snarvei som setter randbetingelser på hele flater i klartekst: brann, ueksponert, isolert, inne, ute. |
| **Eksponert side** | Exposed face | Kant med brannkurve: konveksjon + stråling mot gasstemperaturen. |
| **Ueksponert side** | Unexposed face | Kant mot omgivelsene under brann. Ingen brannstråling treffer den; varmeovergangen er et brukervalg med forklaring: 4 W/m²K (standard, EN 1991-1-2 §3.1(5)), 9 W/m²K (§3.1(6), stråling til omgivelsene innbakt) eller egen verdi. |
| **Tidsserie** | Time series | Verdi mot tid (°C eller W/m²) som styrer en randbetingelse eller varmekilde. Brannkurver og klimaserier er tidsserier med sitering. |
| **Brannkurve** | Fire curve | Standardisert gasstemperatur mot tid (ISO 834, hydrokarbon, parametrisk …) hentet fra biblioteket. |
| **Målepunkt** | Probe | Et punkt der temperaturen leses ut over tid. Kan være skrevet inn, klikket, ved en dybde fra en flate, eller automatisk i hver armeringsstang. |
| **Linjeprofil** | Line probe | En linje som gir temperaturprofilen langs seg ved valgt tid. |
| **Analyse** | Analysis | Kjøreoppsett: stasjonær, transient eller periodisk, med varighet, tidssteg og toleranser. |
| **Scenario** | Scenario | En variant av prosjektet uttrykt som overstyringer (materialbytte, annen kurve, annen overdekning). Kjøres og sammenlignes ved siden av basismodellen. |
| **Metrikk** | Metric | En avledet størrelse etter kjøring: varmestrøm, U-verdi, ψ-verdi, overflatetemperatur, f_Rsi, tid til terskel. |
| **Bibliotek** | Library | Materialer og kurver med sitering og kvalitetsflagg (standard, produsent, typisk, bruker). Innebygde elementer er skrivebeskyttet; prosjektet lagrer en oppløst kopi av det det bruker. |
| **Egendefinert materiale** | Custom material | Materiale brukeren har laget eller endret. Lagres i prosjektet, og kan deles via firmabiblioteket. |
| **Firmabibliotek** | Company library | Delte materialer og kurver i en mappe i Git-repoet, lest av både appen og MCP-serveren. |
| **Resultat** | Run result | Mesh, temperaturfelt ved utdatatidspunkter og målepunkthistorikk for én analyse og ett scenario. Blir *utdatert* når modellen endres, men slettes ikke før neste kjøring. |
| **Utdatert** | Stale | Resultat som ikke lenger svarer til modellen. |
| **Armeringens termiske modell** | Rebar thermal model | Bestemmes av materialet brukeren setter på stengene. Standard er *stål*: stengene meshes som stål med egen varmekapasitet og ledningsevne. Settes stangmaterialet til betong, leses betongtemperaturen ved stangsenter, slik EN 1992-1-2 tillegg A gjør; det gir 20–40 K varmere hjørnestenger. Resultattabellen oppgir hvilken modell som er brukt. |
