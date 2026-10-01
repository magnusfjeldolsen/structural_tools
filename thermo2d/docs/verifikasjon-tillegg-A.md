# Kontroll av avlesninger fra NS-EN 1992-1-2 tillegg A

Testen `packages/core/test/verification/spec14.test.ts` (case 5) sammenligner
thermo2d med verdier jeg har lest av fra hukommelsen. Fyll inn kolonnen
«Din avlesning» fra din kopi av standarden, så oppdaterer jeg testen og fjerner
merkingen «approximate». Toleransen i spec §14 er 5 % eller 15 K, det som er
størst.

## Oppsett som testen kjører

| Parameter | Verdi |
|---|---|
| Snitt | 300 × 500 mm rektangulær bjelke |
| Betong | Silika-tilslag, fukt 1,5 %, nedre λ-grense, ρ = 2300 kg/m³, εm = 0,7 |
| Brann | ISO 834 på under, venstre og høyre side; αc = 25 W/m²K, Φ = 1,0, εf = 1,0 |
| Ueksponert topp | αc = 4 W/m²K mot 20 °C |
| Tid | 30, 60 og 90 min |
| Avlesningspunkt | Midt i bredden (x = 150 mm), dybde d fra underkant |

## Figur A.2 — temperaturprofil i plate (én side eksponert)

Midt i bredden på en 300 mm bred bjelke oppfører underkanten seg som en
énsidig plate de første ~100 mm. Les av θ ved dybde d:

| Tid | d = 25 mm | d = 50 mm | d = 75 mm | d = 100 mm |
|---|---|---|---|---|
| 30 min, min avlesning | 300 | – | – | – |
| 30 min, din avlesning | | | | |
| 60 min, min avlesning | 430 | – | – | – |
| 60 min, din avlesning | | | | |
| 90 min, min avlesning | 560 | 350 | 230 | 150 |
| 90 min, din avlesning | | | | |

thermo2d (normal mesh, Δt = 5 s) gir ved 90 min: 25 mm ≈ 554, 50 mm ≈ 340 °C.

## Figurer A.8–A.11 — bjelker (tre sider eksponert)

Hvis en av figurene har et snitt nær 300 × 500 (f.eks. h × b = 600 × 300 eller
500 × 300), les av isotermen 500 °C i hjørnet og midt i bredden, og
temperaturen ved et par punkter du kan plassere nøyaktig:

| Figur og snitt | Tid | Punkt (x, y fra nedre venstre hjørne) | Din avlesning |
|---|---|---|---|
| | 90 min | hjørnestang-posisjon (45, 45) | |
| | 90 min | midtstang (150, 45) | |
| | 90 min | dybde til 500 °C-isotermen midt i bredden | |

thermo2d gir for (45, 45): 552 °C, (150, 45): 381 °C, 500 °C-isotermen ≈ 34 mm.

## Nasjonalt tillegg

Noter her om NA-en endrer noe i tabellen «Betong» over (fukt, λ-grense,
tilslag) eller gir egne krav til αc/εm.
