# Samvirkegrad, festemiddelstivhet og virkningen på nøytralaksen

Fjerde runde. Verktøyet regner riktig skjærstrøm, men sier for lite om to ting
brukeren faktisk trenger å vite: **hva forsterkningen gjør med tverrsnittets
akser**, og **hvor godt de to profilene egentlig samvirker**.

Norsk UI, norske kommentarer, samme stil som resten av modulen.
Fortsatt ingen torsjon — bare aksialkraft og skjær.

---

## 1. Virkningen på nøytralakse og hovedakser

I dag vises bare nøytralaksens høyde `y_c` før og etter. Det er for lite.
Forsterkning flytter tyngdepunktet i **begge** retninger og kan **rotere
hovedaksene**, og da får man sidevegs utbøyning av en last som før virket i et
hovedplan. Det er en reell, ubehagelig overraskelse i praksis, og verktøyet skal
si fra om den.

### 1.1 Det som skal vises, eksisterende → sammensatt

| Størrelse | Merknad |
| --- | --- |
| `x_c`, `y_c` | E-vektet tyngdepunkt, begge retninger, med `Δx_c` og `Δy_c` |
| `EI_x`, `EI_y`, `EI_xy` | om det sammensatte tyngdepunktet |
| `θ` | hovedaksevinkelen, før og etter, med `Δθ` |
| `EI_1`, `EI_2` | hovedstivhetene |

### 1.2 Konsekvensen skal skrives ut, ikke bare tallene

Er `EI_xy ≠ 0` etter forsterkning, gir et moment om x-aksen også krumning om
y-aksen. Utled og vis nøytralaksens helning for et rent `M_x`:

    tan β = EI_xy / EI_y        (nøytralaksens helning i forhold til x-aksen)

og påpek at nedbøyningen står vinkelrett på nøytralaksen, altså at bjelken
bøyer seg sidevegs. Vis den sidevegse andelen som `tan β`, i prosent av den
loddrette nedbøyningen.

**Advarsel** som skal utløses: var `EI_xy ≈ 0` før og er merkbart forskjellig
fra null etter (bruk en relativ terskel, f.eks. `|EI_xy| > 0,02·√(EI_x·EI_y)`),
skriv at forsterkningen har innført skjev bøyning som ikke fantes før, og at
lasten må kontrolleres i begge plan. Dette er hele poenget med seksjonen.

Utled formelen selv og skriv utledningen som kommentar — ikke kopier den.

---

## 2. Kraftsammendrag rett under lastene

I dag må brukeren scrolle til «4. Per skjøt» for å se hva skjøten skal
overføre. Legg et **kompakt sammendrag rett under lastfeltene og
forankringslengden**, før «Effekt av forsterkningen».

Per skjøt, én rad per lastvirkning pluss en sum:

| Bidrag | Verdi |
| --- | --- |
| fra `V_før` | `q_før` [N/mm] |
| fra `V_etter` | `q_etter` [N/mm] |
| fra `ΔN` over `L` | `q_N` [N/mm] |
| **totalt** | `q_tot` [N/mm], uthevet |

Er det flere skjøter, én blokk per skjøt. Dette er tallet brukeren kom for —
det skal ikke være noe man leter etter. Detaljene og utregningen blir stående
lenger nede som i dag.

---

## 3. Festemiddelstivhet — `js/connection-stiffness.js` (ny)

Brukeren spurte hvor stivheten skal hentes fra. Svaret finnes, og skal ligge i
verktøyet i stedet for i et regneark.

### 3.1 Eurokode 5, tabell 7.1 — `K_ser` per festemiddel per skjærplan [N/mm]

Med `ρ_m` middeldensitet [kg/m³] og `d` diameter [mm]:

| Festemiddel | `K_ser` |
| --- | --- |
| Dybler, bolter (med eller uten klaring), skruer, spiker med forboring | `ρ_m^1,5 · d / 23` |
| Spiker uten forboring | `ρ_m^1,5 · d^0,8 / 30` |
| Klammer | `ρ_m^1,5 · d^0,8 / 80` |
| Ringdybler / skivedybler | `ρ_m · d_c / 2` |
| Tannplatedybler | `1,5 · ρ_m · d_c / 4` |

Regler som MÅ være med:
- To ulike treslag: `ρ_m = √(ρ_m,1 · ρ_m,2)`.
- **Stål-mot-tre og betong-mot-tre: `K_ser` multipliseres med 2.**
- Bruddgrensetilstand: `K_u = (2/3)·K_ser`. La brukeren velge tilstand, og gjør
  det tydelig hvilken som er i bruk.

### 3.2 Andre forbindelser
- **Lim:** `k = G_a · b / t_a` per lengdeenhet — finnes allerede, flytt hit.
- **Fritt innlagt:** felt for `K_ser` rett fra en ETA eller produktgodkjenning.
  Dette skal være likestilt, ikke gjemt bort — for stål-mot-stål og for
  proprietære festemidler er det den eneste ærlige veien.

Skriv i hjelpeteksten hvor tallene kommer fra, og at EC5-formlene gjelder
trevirke — de skal ikke brukes ukritisk på stål.

### 3.3 Smøring til fugestivhet
`K` per lengdeenhet av skjøten: `K = n_skjærplan · n_rader · K_ser / s`
[N/mm per mm]. Det er denne som går inn i både Volkersen og γ-metoden.

---

## 4. Samvirkegrad — γ-metoden (EC5 tillegg B)

Dette er det som binder sammen brukerens spørsmål. Verktøyet antar i dag **full
samvirkning**, som gir for stor `EI` (for liten nedbøyning) og litt for stor
`q`. γ-metoden gir den virkelige graden.

For en fritt opplagt bjelke med spennvidde `L_ef` og festemiddelavstand `s`:

    γ_i     = 1 / (1 + π²·E_i·A_i·s / (K·L_ef²))
    (EI)_ef = Σ (E_i·I_i + γ_i·E_i·A_i·a_i²)
    F_i     = γ_i·E_i·A_i·a_i·s·V / (EI)_ef        ← kraft per festemiddel

`a_i` er avstanden fra del `i` sitt tyngdepunkt til den **effektive**
nøytralaksen, som selv avhenger av `γ`:

    y_ef = Σ (γ_i·E_i·A_i·y_i) / Σ (γ_i·E_i·A_i)

Merk at `γ = 1` gir full samvirkning og `γ → 0` gir ingen — vis `γ` direkte som
«samvirkegrad», det er det tallet brukeren er ute etter.

**Omfang og begrensninger som SKAL stå i UI-et:**
- Implementer **topartstilfellet** (eksisterende + ny), som er det dominerende
  ved forsterkning. Er det flere enn to grupper, si fra at γ-metoden ikke brukes.
- γ-metoden er utledet for **sinusformet last på en fritt opplagt bjelke**.
  For andre systemer brukes en effektiv lengde: `L_ef = L` fritt opplagt,
  `0,8·L` for et kontinuerlig felt, `2·L` for utkraget. La brukeren velge, og
  skriv hvorfor.
- **Full samvirkning skal fortsatt være standard og vises ved siden av**, slik
  at ingenting endrer seg stille. γ-resultatet er et tillegg, ikke en erstatning.

### 4.1 Kraft per festemiddel — det brukeren skal bruke videre
Vis eksplisitt, per skjøt:
- `F_per festemiddel` [kN] = `q_tot · s / (n_rader · n_skjærplan)` ved full
  samvirkning, og `F_i` fra γ-formelen ved delvis samvirkning.
- Utnyttelse mot oppgitt kapasitet per festemiddel, og nødvendig antall.

Dette er utdataen som går videre til en kapasitetskontroll, så den skal ha
enhet, være uthevet, og si hvilken forutsetning den hviler på.

---

## 5. Arbeidsdeling

| Bølge | Innhold | Filer |
| --- | --- | --- |
| **A** | §3 og §4 som rene, testede moduler | `js/connection-stiffness.js` (ny), utvidelser i `js/reinforcement.js`, `tests/composite.test.mjs` (ny) |
| **B** | §1, §2 og §4.1 i panelet | `js/reinforcement-ui.js`, `js/ui.js`, `index.html`, `README.md` |

A først, B etterpå — B koder mot A sitt API.

---

## 6. Testkrav for bølge A

`node tests/composite.test.mjs`, ingen avhengigheter, exit ≠ 0 ved feil.
Håndregnet fasit i kommentar for hver:

1. **`K_ser` etter EC5:** `ρ_m = 420 kg/m³`, `d = 8 mm`, skrue ⟹
   `K_ser = 420^1,5·8/23`. Regn ut selv og skriv mellomregningen.
2. **Stål-mot-tre dobler** `K_ser`.
3. **`K_u = ⅔·K_ser`.**
4. **To treslag:** `ρ_m = √(ρ_1·ρ_2)`.
5. **γ → 1 når `K → ∞`** (stiv forbindelse gir full samvirkning), og
   **γ → 0 når `K → 0`** (ingen samvirkning). Kontroller begge grensene
   numerisk.
6. **`(EI)_ef` mellom grensene:** ligger strengt mellom summen av delenes egne
   `E·I` (ingen samvirkning) og full samvirkning med Steiner. Dette er den
   viktigste kontrollen — den fanger fortegns- og `a_i`-feil.
7. **`F_i` mot `q·s`:** ved `γ → 1` skal kraften per festemiddel nærme seg
   `q_VQ/I · s / (rader · skjærplan)`. Toleranse må begrunnes i kommentaren.
8. **Hovedakserotasjon:** et usymmetrisk oppsett (lamell bare på den ene siden)
   der `EI_xy ≠ 0`, med håndregnet `θ` og `tan β = EI_xy/EI_y`.

`tests/joints.test.mjs` (13/13) og `tests/reinforcement.test.mjs` (12/12) skal
fortsatt bestå.

---

## 7. Felleskrav

- Statisk HTML/JS, ingen byggesteg. GA-taggen urørt.
- Alt i N og mm internt; hver vist verdi har enhet.
- Formel → innsatte tall → resultat i «Utregning», som ellers.
- Ingen commit — hovedagenten committer.

---

## 8. Hva `M` skal brukes til

`M` er i dag en inndata som regner ut `N_G = M·ES*/EI`, viser tallet, og mater
ingenting. Det er en underbrukt inndata, ikke en feil — men den skal gjøres
meningsfull.

### 8.1 Hvorfor `M` IKKE gir et eget bidrag til `q`

Dette må stå i hjelpeteksten, for spørsmålet er naturlig å stille:

    N_G(x) = M(x)·ES*/EI
    q(x)   = dN_G/dx = (dM/dx)·ES*/EI = V·ES*/EI

`q_V` **er** forankringen av bøyekraften. Integrerer man `q_V` fra lamellenden
og innover, får man nøyaktig `N_G` på det stedet. Det er samme mekanisme sett
fra to sider. Et eget «bidrag fra M» i `q_tot` ville telt den samme kraften to
ganger, og skal ikke finnes.

`q_N = ΔN/L` er derimot en annen mekanisme: en ytre aksialkraft som det
sammensatte tverrsnittet deler på. I en ren bøyningsforsterkning er `N = 0`, og
da SKAL `q_N` være null.

### 8.2 Forankringskontroll i enden — det `N_G` skal drive

For limte lameller og påsveisede plater er endeforankringen ofte det som
styrer, ikke skjærstrømmen midt på. Legg inn per skjøt:

- `N_G` ved kritisk snitt (fra `M_etter`), i kN.
- **Nødvendig forankringslengde** fra lamellenden:
  `L_req = N_G / q_Rd`, der `q_Rd` er skjøtens kapasitet per lengdeenhet
  (`τ_Rd·b` for lim, `n_rader·F_Rd/s` for skruer, `q_Rd` for sveis).
- Sammenlign med den `L` brukeren har lagt inn, og vis utnyttelse `L_req / L`.
- Advarsel når `L_req > L`: forankringen er for kort, uansett hvor liten `q`
  er midt på bjelken.

Skriv at kontrollen er en middelverdibetraktning, og at Volkersen-toppen i
§ Shear lag kommer i tillegg — for et limt skjøteende er det toppen som
utløser avskalling.

### 8.3 Spenninger — ikke nå
`σ_i = M·E_i·(y − y_c)/EI` er den naturlige neste utvidelsen, men et fullt
spenningsbilde krever flere lastvirkninger enn verktøyet tar inn i dag.
**Utenfor omfanget denne runden.** Ikke bygg halvveis.
