# concrete_section_calculator — endringsrunde 3: skjær

> Tillegg til `concrete_section_calculator-plan.md` og `-v2-changes.md`. Denne fila er
> kontrakten for skjærkapasitet. Der de er i konflikt, gjelder denne.
>
> **Skrevet for å kunne følges uten å ta designbeslutninger.** Er noe likevel uklart:
> spør, ikke gjett. **§11 er oppgavelisten per agent — start der.**

## 0. Bestillingen og omfanget

Brukeren vil ha:
1. **Skjærbøyler vist i tverrsnittstegningen.**
2. **Skjærkraft `V_Ed` per lastkombinasjon.**
3. **To eller flere skjæresnitt** (bøyleben) tegnet ryddig.
4. **Bare vertikalt skjær.** Biaksielt skjær droppes.
5. **Skjærkapasitet uten bøyler** (typisk plate) **og med bøyler** (bjelke).
6. **Bøylediameter og senteravstand** som inndata. Start med én av hver.
7. **Modulært**, slik at flere bøyletyper med ulik senteravstand kan komme senere.

### 0.1 Uttrykkelig UTE av omfang
Torsjon, gjennomlokking, skjær mellom steg og flens (EC2 6.2.4), skjærfuger (6.2.5),
skjærarmering med α ≠ 90°, biaksielt skjær, og `VRdc_prin_stress` (hovedspennings-
kontrollen, som hører til uopprissede og spente tverrsnitt).

**α = 90° er låst i v1**, men ligger i tilstanden fordi modellen skal tåle mer senere.

---

## 1. Fortegnsfellen — les denne først

`structuralcodes` bruker **to motsatte aksialkonvensjoner** i samme bibliotek:

| API | konvensjon |
|---|---|
| `BeamSection.calculate_bending_strength(n=…)` | **`n > 0` er STREKK** |
| `ec2_2004.VRdc(NEd=…)`, `VRdmax(NEd=…)`, `Asw_max(NEd=…)` | **`NEd > 0` er TRYKK** |

Docstringen sier det rett ut: *«NEd (float): The normal force in the cross-section due to
loading or prestress (NEd > 0 for compression)»*.

Målt på referansebjelken (300×600, C30/37, 3Ø20, d = 547 mm):

| aksialkraft | `V_Rd,c` |
|---|---|
| 0 | **81,62 kN** |
| 500 kN **trykk** | **149,99 kN** |
| 500 kN **strekk** | **13,24 kN** |

Snus fortegnet for et snitt i strekk, blir 13,24 kN til 149,99 kN — en **elleve gangers
overestimering**, i retning usikker side, uten at noe feiler.

**Derfor:** konverteringen skal skje på **ett** sted i `engine.py`, i en funksjon som ikke
gjør noe annet:
```python
def _ned_for_shear(n_ed_tension_positive: float) -> float:
    """Seksjons-API-et har strekk positiv; EC2-skjaerfunksjonene har trykk positiv."""
    return -n_ed_tension_positive
```
og den skal ha en **egen test** som påstår alle tre tallene i tabellen over.

---

## 2. Hva `structuralcodes` gir, og hva vi må regne selv

### 2.1 Finnes — bruk dem, ikke håndkod formlene
```python
ec2_2004.VRdc(fck, d, Asl, bw, NEd, Ac, fcd, k1=0.15, gamma_c=1.5, CRdc=None)  # 6.2.2, eq 6.2
ec2_2004.VRds(Asw, s, z, theta, fyk, alpha=90.0, gamma_s=1.15)                 # 6.2.3, eq 6.8
ec2_2004.VRdmax(bw, z, fck, theta, NEd, Ac, fcd, alpha=90.0, limit_fyd=False)  # 6.2.3, eq 6.9
ec2_2004.Asw_max(fcd, fck, bw, s, fywd, NEd, Ac, alpha=90.0)                   # 6.2.3(3)
ec2_2004.Asw_s_required(Ved, z, theta, fywd, alpha=90.0)
```
`VRdc` og `VRdmax` tar `NEd` og `Ac` og håndterer dermed σ_cp selv — vi skal **ikke** legge
til noe aksialledd på toppen.

### 2.2 Finnes IKKE — regnes i `engine.py`, med EC2-referanse i kommentaren
```
rho_w_min = 0.08 * sqrt(fck) / fyk                  # 9.2.2(5)
Asw_s_min = rho_w_min * bw * sin(alpha)             # = rho_w_min * bw for alpha = 90
sl_max    = 0.75 * d * (1 + cot(alpha))             # 9.2.2(6);  = 0.75*d for alpha = 90
st_max    = min(0.75 * d, 600)                      # 9.2.2(8), tverravstand mellom ben
```
Målt for referansebjelken: `rho_w_min = 8,7636e-4`, `Asw/s_min = 0,26291 mm²/mm`,
`sl_max = 410,25 mm`.

---

## 3. Modellen

### 3.1 Tilstand — bøyler er en LISTE fra dag én
```js
shear: {
  theta: 45,            // trykkstavvinkel [°], EC2 6.2.3(2): 21.8 ≤ theta ≤ 45
  z_factor: 0.9,        // z = z_factor * d. EC2 tillater 0,9d uten aksialkraft.
  stirrups: [
    { id: 'S1', dia: 8, spacing: 150, legs: 2, fywk: 500, alpha: 90 },
  ],
},
```
**Tom liste = ingen skjærarmering** ⇒ `V_Rd,c`-veien. Det er standard for plate.

Lista er en liste **nå**, selv om UI bare tilbyr én rad i v1. Det er den ene avgjørelsen som
gjør «flere bøyletyper med ulik senteravstand» til en ren UI-oppgave senere i stedet for en
kontraktsendring. Id-er som lagene: `S1`, `S2`, … fra en `shearSeq` som aldri teller ned.

`alpha` ligger per rad, men **UI låser den til 90 i v1** og validering avviser alt annet.

### 3.2 Avledet, i `rebar.js` (rene funksjoner)
```js
stirrupArea(st)            // legs * pi*dia^2/4                     [mm^2]
aswPerSpacing(st)          // stirrupArea(st) / spacing             [mm^2/mm]
totalAswPerSpacing(list)   // sum over lista                        [mm^2/mm]
```
Flere rader summeres i `A_sw/s`. Det er riktig for parallelle bøylesett med ulik
senteravstand, og det er nettopp derfor lista er en liste.

### 3.3 Lastkombinasjonen får `V_Ed`
```js
{ id: 'C1', name: 'ULS 1', N_Ed: 0, M_Ed: 0, V_Ed: 0, direction: 'sagging' }
```
kN. **`V_Ed` er en størrelse** — fortegnet på skjærkraften har ingen betydning for
kapasiteten, og å be brukeren om et fortegn ville bare invitert feil. `payload.js` tar
`Math.abs`.

---

## 4. Kontrakten

### 4.1 Payload
```json
"section": {
  "shear": {
    "theta": 45.0, "z_factor": 0.9,
    "stirrups": [ { "id": "S1", "dia": 8.0, "spacing": 150.0,
                    "legs": 2, "fywk": 500.0, "alpha": 90.0 } ]
  }
},
"loads": { "combinations": [ { …, "V_Ed": 120000.0 } ] }
```
`V_Ed` i **N**. Mangler `section.shear`, skal motoren oppføre seg som i dag og **ikke**
regne skjær — det er det som holder de committede fixturene gyldige.

### 4.2 Resultat — per kombinasjon
Hver `combinations[i]` får et `shear`-objekt:
```json
"shear": {
  "V_Ed": 120000.0,
  "V_Rd": 143450.0,
  "V_Rd_c": 81620.0,
  "V_Rd_s": 143450.0,
  "V_Rd_max": 779800.0,
  "governing_mode": "stirrups",
  "utilisation": 0.8366,
  "asw_s": 0.335, "asw_s_min": 0.26291, "asw_s_required": 0.280,
  "sl_max": 410.25, "st_max": 410.25,
  "z": 492.3, "d": 547.0, "bw": 300.0,
  "within_limits": true
}
```
`governing_mode` ∈ `'no_stirrups' | 'stirrups' | 'strut_crushing'`:
- **ingen bøyler** ⇒ `V_Rd = V_Rd_c`, `V_Rd_s = null`, mode `'no_stirrups'`
- **med bøyler** ⇒ `V_Rd = min(V_Rd_s, V_Rd_max)`, mode `'stirrups'` eller
  `'strut_crushing'` alt etter hvilken som styrer

**`V_Rd,c` legges ALDRI til `V_Rd,s`.** EC2 6.2.3(2): for elementer med skjærarmering
erstatter `V_Rd,s` bidraget fra betongen, det kommer ikke i tillegg. Å summere dem er den
vanligste feilen i hjemmelagde skjærmoduler, og den er på usikker side.

`V_Rd_c` rapporteres likevel **alltid**, også når bøyler finnes, fordi det er tallet som
sier om bøyler i det hele tatt var nødvendige.

### 4.3 Toppnivå og governing

Analyseblokka får `shear` som speiler **skjærets egen governing kombinasjon**, og
```json
"shear_governing": "C2"
```

**Skjær har sin EGEN governing.** En kombinasjon med stor `V_Ed` og lite `M_Ed` styrer
skjær uten å komme i nærheten av å styre bøying. Å gjenbruke bøyningens `governing` ville
skjult nettopp den kombinasjonen som er farligst for skjær. Samme regler ellers som §4.3 i
v2: kandidater er `within_limits`, størst `utilisation`, uavgjort ⇒ første i rekkefølgen.

`checks` får:
```json
"shear_ok": true, "asw_min_ok": true, "stirrup_spacing_ok": true
```
og `checks.all_ok` tar dem med.

**Hovedtallet η forblir bøyningens.** Statuspilla viser den største av η_M og η_V med en
etikett som sier hvilken — ellers ville en bruker med η_M = 0,4 og η_V = 1,3 sett et grønt
tall. Rapporten viser begge, hver med sin governing-rad.

---

## 5. Validering (`section.js`)

Alle gir norsk-nøytrale koder og engelsk tekst, som resten:

| kode | regel | severity |
|---|---|---|
| `stirrup_spacing_exceeds_max` | `spacing > sl_max` (9.2.2(6)) | `error` |
| `stirrup_legs_spacing_exceeds_max` | benavstand `> st_max` (9.2.2(8)) | `warning` |
| `asw_below_minimum` | `A_sw/s < A_sw/s_min` (9.2.2(5)) | `error` |
| `invalid_strut_angle` | `theta` utenfor 21,8–45° (6.2.3(2)) | `error` |
| `stirrup_alpha_unsupported` | `alpha ≠ 90` | `error` (v1) |

`asw_below_minimum` og `stirrup_spacing_exceeds_max` er **feil, ikke advarsler**: et snitt
som bryter dem har ikke den duktiliteten kapasitetsformelen forutsetter, så tallet ville
vært meningsløst.

---

## 6. Tegningen (`section-draw.js`)

Bøylen tegnes som et **avrundet rektangel** innenfor overdekningen:
`inset = cover_side + dia/2` horisontalt, `cover + dia/2` vertikalt, hjørneradius `2·dia`.

Flere ben enn to tegnes som **loddrette streker** jevnt fordelt mellom de to ytre benene —
det er det et ekstra skjæresnitt fysisk er.

**Holdes bevisst nedtonet** (brukerens ord: «slim», «ryddig»): tynnere strek enn
tverrsnittsomrisset, dempet farge, ingen fyll, og **ingen** egen kotering. Bøylen er
kontekst for armeringen, ikke figurens hovedsak. Én liten etikett `Ø8 c/c 150 (2 legs)`
under snittet, i samme stil som lagetikettene.

Tegnes bare når `shear.stirrups` er ikke-tom.

---

## 7. Rapporten

Nytt kapittel **«Shear»** etter resultatkapitlet, med:
- bøyletabell (Ø, c/c, ben, A_sw/s, f_ywk)
- kombinasjonstabell for skjær: `V_Ed`, `V_Rd,c`, `V_Rd,s`, `V_Rd,max`, `V_Rd`, η, mode
- den dimensjonerende raden merket, som bøyningens
- `A_sw/s` mot `A_sw/s_min`, `s` mot `s_l,max`
- en setning om at `V_Rd,c` **ikke** legges til `V_Rd,s`, med EC2-referanse
- **aksialkraftens virkning nevnt eksplisitt** med tallet: strekk reduserer `V_Rd,c`,
  trykk øker den, og det er `N_Ed` fra samme kombinasjon som brukes

---

## 8. UI

Ny seksjon **«4 · Shear reinforcement»** mellom armering og last (nummereringen forskyves):
- av/på — av som standard for plate, på for bjelke
- én rad: `Ø`, `c/c`, `legs`, `f_ywk`; «+ Add stirrup set» finnes, men er **skjult i v1**
- `theta` og `z_factor` i en sammenslått «Advanced»-boks, som faktorene i materialseksjonen

Lastseksjonen får en `V_Ed`-kolonne i kombinasjonstabellen.

---

## 9. Ytelse

Skjær er **ren aritmetikk** — ingen integrasjon, ingen likevektsiterasjon. Ti
kombinasjoner koster mikrosekunder. Det skal derfor regnes for **alle** kombinasjoner i
alle tre analysene, uten framdriftsrapportering.

---

## 10. Aksept

- [ ] `_ned_for_shear` finnes som egen funksjon og har en test som påstår 81,62 / 149,99 /
      13,24 kN for 0 / +500 kN trykk / 500 kN strekk
- [ ] `V_Rd,c` legges aldri til `V_Rd,s`; egen test
- [ ] Tom `stirrups`-liste gir `V_Rd = V_Rd,c` og mode `no_stirrups`
- [ ] To bøylesett summeres i `A_sw/s`
- [ ] Skjær har egen `shear_governing`, og en test der skjær og bøying styres av **ulike**
      kombinasjoner
- [ ] Manglende `section.shear` i payloaden gir dagens oppførsel — fixturene uendret
- [ ] Bøylen tegnes, og et tredje ben gir en loddrett strek
- [ ] `spacing > 0.75d` og `A_sw/s < A_sw/s_min` gir `error`, ikke advarsel
- [ ] Statuspilla viser den største av η_M og η_V, med etikett
- [ ] Nettleserverifisering bestått

## 11. Oppgaveliste per agent

| agent | eier | oppgave |
|---|---|---|
| **C1 motor** | `python/engine.py`, `tests/python/test_engine.py` | §1, §2, §4, §9 |
| **C2 modell** | `js/rebar.js`, `js/section.js`, `js/store.js`, `js/payload.js`, `js/serialize.js` + deres tester | §3, §5 |
| **C3 UI** | `index.html`, `js/ui.js` | §8 |
| **C4 rapport** | `js/report.js`, `js/results.js`, `print.css` + tester | §7 |
| **C5 tegning** | `js/section-draw.js`, `tests/section-draw.test.mjs` | §6 |

**Bølge 1:** C1 og C2 parallelt. **Bølge 2:** C3, C4 og C5 parallelt.
Fixturene eies av koordinator og regenereres etter bølge 1, med numerisk diff mot HEAD.
