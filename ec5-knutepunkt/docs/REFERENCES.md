# Kilderegister

Alle beregninger i verktøyet refererer til én av følgende kilder. Referansene i UI/rapport bruker
kortformen i venstre kolonne.

| Kort | Fullstendig referanse | Brukt til |
|------|----------------------|-----------|
| EC5 | NS-EN 1995-1-1:2004+A1:2008+NA:2010 Eurokode 5: Prosjektering av trekonstruksjoner. Del 1-1. Standard Norge. | Kap. 2 (γ_M, k_mod), 3.1, 7.1 (K_ser), 8.1–8.7 |
| EC5 NA | Nasjonalt tillegg NA til NS-EN 1995-1-1 (Norge) | NA.2.3.1.2 lastvarighet, NA.2.4.1 γ_M |
| EC0 | NS-EN 1990:2002+A1:2005+NA:2016 Eurokode: Grunnlag for prosjektering av konstruksjoner | (6.10a), (6.10b), (6.14b), tabell NA.A1.1, NA.A1.2(B) |
| EN338 | NS-EN 338:2016 Konstruksjonstrevirke – Styrkeklasser | ρ_k, ρ_mean, f_c,90,k, f_t,90,k for C-klasser |
| EN14080 | NS-EN 14080:2013 Limtre – Krav | ρ_k, ρ_mean for GL-klasser |
| EN14592 | NS-EN 14592:2008+A1:2012 Dybeltype festemidler – Krav | Definisjoner d, d₁, f_u, M_y,Rk |
| EC3-1-8 | NS-EN 1993-1-8:2005+NA:2009 | Boltstrekk (F_t,Rk = f_ub·A_s), stålplate (etterslep) |
| EN10025 | NS-EN 10025-2:2019 | f_y, f_u for S235/S355 |
| ETA | Produsentens europeiske tekniske bedømmelse | f_ax,k, f_head,k, f_tens,k, M_y,Rk for skruer |

## Ligningsregister (implementert)

| Ligning/tabell | Fil/funksjon |
|---|---|
| (2.1) K_u = 2/3·K_ser | ec5.js `calculateConnection` |
| (2.17) R_d = k_mod·R_k/γ_M | ec5.js `designCapacity` |
| Tabell 2.3/NA γ_M, tabell 3.1 k_mod | materials.js |
| Tabell 7.1 K_ser | ec5.js |
| (8.4) oppsprekking F_90,Rk | ec5.js `splitCheck` |
| (8.6) tre–tre ett snitt, (8.7) to snitt | ec5.js `johansenTT` |
| (8.8) β | ec5.js |
| (8.9)–(8.13) stål–tre | ec5.js `johansenST` |
| (8.14) M_y,Rk spiker, (8.30) bolt | ec5.js `yieldMoment` |
| (8.15)/(8.16) f_h,k spiker | ec5.js `embedmentStrength` |
| (8.17) n_ef spiker, tabell 8.1 k_ef | ec5.js `effectiveNumber` |
| (8.18) minste tykkelse uten forboring | ec5.js |
| (8.23)–(8.25) uttrekk spiker | ec5.js `axialCapacity` |
| (8.31)–(8.33) f_h,α,k bolt, k₉₀ | ec5.js |
| (8.34) n_ef bolt | ec5.js |
| 8.5.2(2) skivetrykk 3·f_c,90,k | ec5.js |
| Tabell 8.2, 8.4, 8.5 avstander | spacing.js |
| 8.7.1(2)–(5) skruer d_ef, regelsett | ec5.js `fastenerRules` |
| (8.38)–(8.40) uttrekk skruer | ec5.js |
| 8.2.2(2) taueffekt-grenser | ec5.js `ropeLimit` |
| EC0 (6.10a)/(6.10b), NA-faktorer | combos.js |
