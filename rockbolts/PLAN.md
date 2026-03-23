# Uttrekking av fjellboltgruppe — App Plan
**Reference**: SVV 220 / Kim & Lee method for rock cone pull-out

---

## 1. User Inputs

All `:=` values from the PDF (highlighted variables):

### Loading & Tendon
| Variable | Description | Default | Unit |
|---|---|---|---|
| `N_Ed_per_stag` | Design load per anchor | 1632 | kN |
| `stagtype` | Permanent / Midlertidig | Midlertidig | — |
| `f_tk` | Characteristic tensile strength | 900 | MPa |
| `phi` (φ) | Tendon diameter | 90 | mm |

`f_a` and capacity factor (0.65/0.50) follow from `stagtype`.

### Borehole & Bond
| Variable | Description | Default | Unit |
|---|---|---|---|
| `d_borhull_valgt` | Selected borehole diameter | 140 | mm |
| `tau_d_staal_mortel` | Design bond strength steel–grout | 1.9 | MPa |
| `tau_k_mortel_berg` | Char. bond strength grout–rock | 1.5 | MPa |
| `gamma_mortel_berg` | Material factor grout–rock | 1.25 | — |

Rock type selector auto-fills `tau_k_mortel_berg`. Mortar class selector auto-fills `tau_d_staal_mortel`.

### Rock Mass
| Variable | Description | Default | Unit |
|---|---|---|---|
| `gamma_M` | Material factor rock (2–3) | 3 | — |
| `tau_k_berg` | Shear strength rock mass | 50 | kPa |
| `psi` (ψ) | Failure cone half-angle | 40 | deg |
| `alpha` (α) | Anchor angle to rock surface | 60 | deg |
| `eta` (η) | Number of anchors | 1 | — |
| `D` | Centre spacing | 10000 | mm |

Rock quality selector auto-fills `tau_k_berg` and `psi`.

---

## 2. Calculated Values & Formulas

### Steel Capacity
```
A_t = π · φ² / 4                          [mm²]
R_i = 0.65 · f_tk · A_t / 1000            [kN]  (midlertidig)
R_i = 0.50 · f_tk · A_t / 1000            [kN]  (permanent)
```

### Bond: Steel–Grout
```
d_ekv = φ
L_tb_staal = P_p / (τ_d_stål_mørtel · φ · π)          [m]
```
Units: [kN] / ([N/mm²] · [mm] · π) = [kN·mm/N] = [m]

### Bond: Grout–Rock
```
d_min_borhull = 1.5 · φ                               [mm]
d_borhull = max(d_min_borhull, d_borhull_valgt)        [mm]
τ_d_mørtel_berg = τ_k_mørtel_berg / γ_mørtel_berg    [MPa]
L_tb_mortel = P_p / (τ_d_mørtel_berg · d_borhull · π) [m]
L_tb = max(L_tb_staal, L_tb_mortel)                   [m]
```

### Rock Cone — Single Anchor
```
ψ_eff = ψ · sin(α)   [degrees, reduced angle]
λ_enkel = √(γM · Pp / (τk · π · tan(ψ_eff)))          [m]
```
Verified: √(3×1632 / (50×π×tan(34.64°))) = 6.717 m ✓

### Rock Cone — Anchor Row (eq. 10-29 SVV 220)
```
ψ_eff = ψ · sin(α_avg)   [degrees]
A = π · tan(ψ_eff)
B = π · sin(ψ_eff) · η · Pp · γM / τk
λ_rekke = [-(η-1)·D + √((η-1)²·D² + B)] / A           [m]
```
Verified: with η=1, D=10000mm → 6.092 m ✓
Note: sin(ψ_eff) in discriminant, tan(ψ_eff) in denominator.

### Governing Drilling Depth
```
L_innborring = max(L_tb, λ_enkel, λ_rekke)             [m]
```

---

## 3. Utilization Ratios

5 utilization checks, each colour-coded green/yellow/red:

| # | Check | Formula | Threshold |
|---|---|---|---|
| 1 | Stag (tendon) | P_p / R_i × 100% | ≤ 100% |
| 2 | Heft stål–mørtel | L_tb_staal / L_innborring × 100% | governs at 100% |
| 3 | Heft mørtel–berg | L_tb_mortel / L_innborring × 100% | governs at 100% |
| 4 | Bergkjegle, enkelt stag | λ_enkel / L_innborring × 100% | governs at 100% |
| 5 | Bergkjegle, stagrekke | λ_rekke / L_innborring × 100% | governs at 100% |

Checks 2–5: exactly ONE will show 100% (governing failure mode for drilling depth).
Colour thresholds: ≤ 85% → green, 85–100% → yellow, > 100% → red (only possible for check 1).

---

## 4. Page Layout

Following `concrete_beam_design` module styling:

```
[Header + back link]
[Title: "Uttrekking av fjellboltgruppe — SVV 220"]
[Description textarea (valgfri)]

[Input form grid]:
  [LEFT: Belastning og stag   ] [RIGHT: Borhull og heftforbindelser]
  [FULL: Bergmasse og ankergeometri (3-column)]

[Calculate button]

[Results section (hidden):
  [L_innborring prominent result box]
  [5 utilization gauges (grid)]
]

[Detailed Report section (hidden, collapsible):
  [Print button → window.print()]
  [#detailed-report div]:
    1. Description (if any)
    2. Title + timestamp
    3. INNDATA (blue heading) — input parameter table
    4. BEREGNINGSRESULTAT (green) — L_innborring + governing mode
    5. DETALJERTE BEREGNINGER (purple, page break) — all steps
    6. UTNYTTELSE (orange) — utilization table
]
```

---

## 5. File Architecture

```
rockbolts/
├── index.html          ← main app (UI + report logic)
├── rockbolts_api.js    ← pure calculation engine (window.RockboltsAPI)
├── rockData.js         ← lookup tables (ROCK_TYPES, ROCK_QUALITY)
└── PLAN.md             ← this file
```

### CSS / JS dependencies (shared)
- `../assets/css/common.css`
- `../assets/css/forms.css`
- `../assets/css/components.css`
- `../assets/css/report-print.css`  ← print to PDF via window.print()
- `../assets/js/common.js`
- Tailwind CDN, MathJax CDN (optional)

---

## 6. Future Phase 2 (Plotting)

- Anchor layout SVG: row of η anchors at angle α, spacing D
- Rock cone cross-section: cone at angle ψ from anchor tip, depth λ
- Overlapping cone geometry for groups
- Rock cone volume: truncated cone per anchor
- Rock weight: V × γ_rock (from ROCK_TYPES table)
