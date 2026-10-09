# Geometry Workspace

Tverrsnittsverktøy for sammensatte profiler: tyngdepunkt og arealmomenter, og
for forsterkede tverrsnitt kreftene som skjøten mellom ny og eksisterende del
skal dimensjoneres for.

## Language

### Geometri

**Eksisterende del**:
En form som finnes i konstruksjonen før forsterkningen og bærer «før»-lasten alene.
_Avoid_: gammel del, original

**Ny del**:
En form som monteres som forsterkning og bare tar del i «etter»-lasten.
_Avoid_: forsterkningsdel, tillegg

### Skjøt

**Skjøt**:
En linje i tverrsnittsplanet som markerer en fuge mellom deler, der kraft må overføres med festemidler, lim eller sveis.
_Avoid_: interface, grensesnitt, kobling

**Automatisk skjøt**:
En skjøt langs en felles kant mellom en eksisterende og en ny del, utledet fra geometrien og aldri tegnet. Finnes så lenge kanten finnes.
_Avoid_: autoskjøt, kontaktflate

**Tegnet skjøt**:
En skjøt brukeren selv har lagt inn, typisk mellom to eksisterende deler for å finne kraften i en fuge som ellers regnes som stiv.
_Avoid_: manuell skjøt

**Stivt forbundet**:
Deler som berører hverandre uten en skjøt mellom seg; de virker sammen uten glidning, og ingen kraft rapporteres mellom dem.
_Avoid_: implisitt skjøt

**Forsterkningsende**:
Stedet langs bjelken der en ny del fysisk slutter; momentet akkurat der bestemmer forankringskraften, uavhengig av hvor forsterkningen teoretisk ikke lenger trengs.
_Avoid_: bjelkeende, opplegg

**Momentnullpunkt**:
Et sted langs bjelken der M = 0 — et fritt opplegg eller et vendepunkt i en kontinuerlig bjelke, men ikke en innspenning eller et midtopplegg.
_Avoid_: opplegg (som synonym)

### Laster

**Lasttilstand før / etter**:
«Før» virker på tverrsnittet av bare eksisterende deler; «etter» virker på det sammensatte tverrsnittet. Kreftene superponeres algebraisk, med fortegn.
_Avoid_: fase, steg

### Krefter i skjøten

**Skjærstrøm langs skjøten** (`q_L`):
Kraft per lengde bjelke, rettet langs bjelkeaksen i skjøteflaten, fra tverrkraften V. Oppgis i kN/m (= N/mm).
_Avoid_: q_tot, skjærkraft i skjøten

**Tverrkraft på skjøten** (`q_T`):
Kraft per lengde bjelke som virker vinkelrett på skjøteflaten og river delene fra hverandre, typisk fra last som angriper i den nye delen og henges opp gjennom skjøten. Oppgis i kN/m, strekk positiv.
_Avoid_: avrivingskraft, peel

**Akkumulert kraft i ny del** (`N_G`):
Normalkraften i en ny del i snittet, fra «etter»-momentet; lik summen av skjærstrømmen skjøten har overført fra enden av forsterkningen frem til snittet. Oppgis i kN.
_Avoid_: forankringskraft, N fra bøyning

**Forankring i enden** (`q_ende`):
Skjærstrømmen som trengs for å føre `N_G` og aksialandelen `ΔN` inn over en lengde `L`, når snittet ligger i en forsterkningsende. Er M = 0 der, er `N_G = 0` og bare `ΔN` gjenstår.
_Avoid_: q_req, q_N

### Beregningsmåter

**Bjelkeakse z**:
Aksen langs bjelken, vinkelrett på tverrsnittsplanet (x, y). Diagrammer langs bjelken har z som abscisse.
_Avoid_: x-akse langs bjelken

**Snittberegning**:
Kreftene i skjøten i ett snitt, fra V, M og N der, med full samvirkning; forankring og innføring vises som middelverdier over L.
_Avoid_: punktforsterkning, punktmodus

**Linjeberegning**:
Kreftene i skjøten langs hele den nye delen, fra diagrammer N(z), M_x(z), M_y(z), med delvis samvirke (Volkersen/Newmark). Gir q(z) overalt, med topper i endene og ved sprang i N.
_Avoid_: linjeforsterkning, linjemodus

**Delvis samvirke**:
Skjøten gir etter (`q = k·δ`), så delene glir litt mot hverandre og kraften bygges opp over en lengde i stedet for momentant.
_Avoid_: ettergivende samvirke

**Skjøtestivhet** (`k`):
Fjærstivheten per lengde skjøt, `k = n_rader·K/a` [N/mm²]; K er K_ser eller K_u = ⅔·K_ser.
_Avoid_: fugestivhet, forbindelsesstivhet

**Kraft ved full samvirkning** (`N₂∞`):
Kraften den nye delen ville hatt uten glidning, `r·N + M·ES*/EI`; den delvis samvirkende løsningen søker mot den.
_Avoid_: F.ny.inf (arkets navn)

**Karakteristisk lengde** (`1/λ`):
Lengden kraften i den nye delen bruker på å bygge seg 63 % opp mot `N₂∞`; 95 % over `3/λ`.
_Avoid_: overføringslengde (uten tall)

**Løs ende / festet ende**:
Randbetingelsen for den nye delen i hver ende: løs ende har `N₂ = 0` (bare skrudd langs gurten), festet ende har `N₂ = N₂∞` (koblet inn i knutepunktet).
_Avoid_: fri ende (forveksles med at gurten er ubelastet)

**Resultant**:
`√(Σq_L² + q_T²)`; veiledende, vises alltid sammen med de to komponentene, aldri alene.
_Avoid_: q_tot, total skjærstrøm
