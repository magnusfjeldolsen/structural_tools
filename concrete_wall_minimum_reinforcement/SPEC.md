# Build spec — `concrete_wall_minimum_reinforcement`

Contract for `wall_min_reinf_api.js`. Pure functions, no DOM. Units: mm, N, MPa, mm²/m
per metre of wall, unless stated. Revision 2 — see the review log at the end for what
changed and why.

## 1. Inputs

```js
{
  mode: 'ordinary' | 'onBase' | 'watertight',
  restrainedTopBottom: boolean,

  t: 350,                 // wall thickness [mm]
  fck: 35,                // [MPa]
  fyk: 500,               // [MPa]
  layers: 2,              // 1 = single central layer, 2 = one layer per face
  cover: 35,              // cover to the HORIZONTAL bar [mm] — see §6 note
  exposureSide: 'exterior' | 'interior',   // NA.9.6.3 k = 0,30 / 0,15
  kNaOverride: null | number,

  vBar: { dia: 12, spacing: 250 },   // provided vertical steel per layer

  crackReq: 'none' | 'wk040' | 'wk030' | 'wk020' | 'watertight' | 'custom',
  wkCustom: null | number,
  naCoverUplift: { on: false, cnom: 35, cminDur: 25 },
  hD: 2000,               // hydrostatic head [mm], watertight only

  kcMode: 'pureTension' | 'house' | 'custom',   // 1,0 / 0,6 / free
  kcCustom: null | number,
  kMode: 'external' | 'ec2h',                   // 1,0 / interpolate on t
  crackAgeDays: 28,
  cementClass: 'N' | 'R' | 'S',
  method: 'simplified' | 'direct',              // which route drives the matrix colours
  selectedDia: 16,                              // which bar the headline numbers report

  wallL: null, wallH: null,                     // [mm], enables the Table L.1 opinion
  epsFree: 320e-6, epsCtu: 100e-6
}
```

Both routes (§6 and §7) are always computed. `method` only decides which one colours the
ø × cc matrix and drives the headline.

## 2. Material

```
fctm(fck)   = 0,30·fck^(2/3)                for fck ≤ 50
            = 2,12·ln(1 + (fck+8)/10)       for fck > 50           [EC2 Table 3.1]
βcc(t)      = exp( s·(1 − √(28/t)) )        s = 0,20 R / 0,25 N / 0,38 S   [3.2]
fctm(t)     = βcc(t)^α · fctm               α = 1 for t < 28 d             [3.4]
fct,eff     = fctm(crackAgeDays)                                           [7.3.2(2)]
Ecm         = 22 000·((fck+8)/10)^0,3                                      [Table 3.1]
Es          = 200 000
```

`fctm` (28-day) drives the **NA.9.6.3 detailing rule**. `fct,eff` drives **eq. (7.1)**
only. Never substitute one for the other.

When `crackAgeDays < 28`, emit a warning: EC2 permits `fctm(t)`, but several National
Annexes impose a floor on `fct,eff` for early-age restraint. The user must confirm
against NA:2010. No floor is applied silently.

## 3. Detailing requirements

```
Ac        = 1000·t                                        [mm²/m]
As_v_min  = 0,002·Ac / layers                             per layer   [9.6.2(1),(2)]
As_v_max  = 0,04·Ac                (0,08·Ac at laps)                  [9.6.2(1)]
s_v_max   = min(3t, 400)                                              [9.6.2(3)]
s_h_max   = 400                                                       [9.6.3(2)]

As_v_prov = 1000/vBar.spacing · π·vBar.dia²/4             per layer
k_NA      = kNaOverride ?? (exterior ? 0,30 : 0,15)
As_h_surf = max( 0,25·As_v_prov , k_NA·Ac·fctm/fyk )      per surface [NA.9.6.3]
As_h_min  = layers === 2 ? As_h_surf
                         : max( 0,25·As_v_prov , 2·k_NA·Ac·fctm/fyk )
```

The `layers === 1` branch is the subtle one. 9.6.3(1) asks for `As,hmin` **at each
surface**, and a single central layer has to serve both — so the code leg doubles. The
25 % leg does not, because with one layer `As_v_prov` is already the whole-section
vertical steel and 25 % of it is the whole-section answer. This reproduces the source
spreadsheet's `J10 = 2·C7`.

```
links required if As_v_prov·layers > 0,02·Ac                          [9.6.4(1)]
4 links/m² unless (dia ≤ 16 and cover > 2·dia); n/a for layers = 1    [9.6.4(2)]
```

## 4. Crack requirement → target `wk`

| `crackReq` | wk |
|---|---|
| `none` | — (7.3.2 switched off) |
| `wk040` | 0,40 |
| `wk030` | 0,30, × NA uplift if on |
| `wk020` | 0,20 |
| `watertight` | EN 1992-3 `wk1`: 0,2 at hD/t ≤ 5, 0,05 at hD/t ≥ 35, linear between |
| `custom` | `wkCustom` |

NA uplift: `kc_cover = clamp(cnom/cminDur, 1,0, 1,3)`, `wk = 0,30·kc_cover`.

## 5. eq. (7.1) coefficients

```
kc  = 1,0 (pureTension) | 0,6 (house) | kcCustom
k   = 1,0 (external)  |  ec2h: 1,0 for t ≤ 300, 0,65 for t ≥ 800, linear between
Act = Ac = 1000·t                       full section in tension (restraint)
As_min_total = kc·k·fct,eff·Act / σs
As_min_layer = As_min_total / layers
```

**Absolute floor**, independent of `wk` and of the route taken:

```
As_floor = kc·k·fct,eff·Act / (fyk·layers)
```

No amount of crack-width relaxation permits less than this — below it the steel yields at
first cracking. Both routes clamp to it and flag when it governs.

Out of scope for v1: walls governed by out-of-plane bending. 9.6.1(1) sends those to the
slab rules (§9.3), so eq. (7.2) and a tension-zone `Act` are deliberately not
implemented — pairing `kc = 0,4` with `Act = b·t` would double-count.

## 6. Simplified route (7.3.3(2) + Table 7.2N)

Table 7.2N, `φ*s` [mm]; `null` = no value:

```
σs :  160  200  240  280  320  360  400  450
0,4:   40   32   20   16   12   10    8    6
0,3:   32   25   16   12   10    8    6    5
0,2:   25   16   12    8    6    5    4  null
```

Interpolation is two-dimensional: linear in `wk` between columns (EN 1992-3 §7.3.3 permits
interpolation for intermediate crack widths), then inverted in `σs`. Rows where either
bracketing column is `null` are dropped before inversion. Valid only for
`0,20 ≤ wk ≤ 0,40`; outside that band the simplified route refuses and the direct route
of §7 is the only answer.

Per bar diameter `d`:

```
h_minus_d = layers === 2 ? cover + d/2 : t/2       [7.3.3(2), all-tension case]
denom     = (mode === 'watertight') ? 10 : 8       [eq. 7.122 vs eq. 7.7N]
f_adj     = (fct,eff/2,9) · t / (denom·h_minus_d)  hcr = t, section fully in tension
φ*_req    = d / f_adj
σs        = invert Table 7.2N at wk for φ*_req
As_req    = max( kc·k·fct,eff·Act/(σs·layers), As_floor )
cc_max    = 1000·(π·d²/4) / As_req
```

Inversion outcomes, and none of them may be a silent clamp:

- `φ*_req` **larger** than the σs = 160 entry → `status: 'outOfTable'`, no number. This is
  the direction that matters: pinning σs at 160 would understate the requirement.
- `φ*_req` **smaller** than the last entry → σs capped at `min(450, fyk)`,
  `status: 'capped'`. Conservative, so a number is returned, but it is labelled.
- otherwise `status: 'ok'`.

Note on `cover`: 9.6.3 puts the horizontal bars at the surface, and in a wall they are
normally the **outer** layer for exactly this reason. `cover` is therefore the cover to
the horizontal bar, i.e. `cnom`. The vertical bars sit inside them at `cnom + d_h`, which
does not enter any calculation here because the vertical direction is detailing-driven.

Note on `denom = 10` for watertight: EN 1992-3 eq. (7.122) uses 10 and draws `φ*s` from
Figure 7.103N rather than Table 7.2N. Table 7.2N is used here as a stand-in over
`0,20 ≤ wk ≤ 0,40`, where the two agree; below 0,20 only the direct route is offered.

## 7. Direct route (7.3.4)

For a section fully in tension, per layer, given `As`:

```
σs        = min( kc·k·fct,eff·Act / (As·layers), fyk )
c_eff     = layers === 2 ? cover : (t − d)/2
h_c,ef    = min( 2,5·(h_minus_d), t/2 )                 [7.3.2(3), Fig. 7.1c]
Ac,eff    = 1000·h_c,ef
ρ_p,eff   = As / Ac,eff
αe        = Es/Ecm
sr,max    = 3,4·c_eff + 0,8·1,0·0,425·d / ρ_p,eff       k1 0,8  k2 1,0 (tension)  [7.11]
εsm−εcm   = max( (σs − 0,4·fct,eff/ρ_p,eff·(1+αe·ρ_p,eff))/Es , 0,6·σs/Es )  kt 0,4 [7.9]
wk        = sr,max·(εsm−εcm)                                                       [7.8]
```

`wk` is monotonically decreasing in `As`, so solve `wk(As) = wk_target` by bisection on
`As ∈ [As_floor, 20000]` mm²/m, 60 iterations. If `wk(As_floor) ≤ wk_target` the floor
governs. If `wk(20000) > wk_target` the target is unreachable — report `'unreachable'`,
do not return 20000.

(7.11) is valid while `s ≤ 5(c_eff + d/2)`; flag when the resulting `cc_max` exceeds it,
since (7.14) rather than (7.11) then governs the crack spacing.

## 8. Buildability

A required spacing is not an answer if nobody can fix the bars.

```
cc_max < 75           → 'unbuildable'
75 ≤ cc_max < 100     → 'tight'
cc_max > s_h_max      → capped at s_h_max (the detailing rule wins)
```

Also `cc_max ≥ 2d` and `≥ 20 mm` per 8.2 clear-distance, which the 75 mm floor already
covers for every bar in the list.

## 9. Restrained zone height

```
zone_practice = 3·t                       default, labelled "practice (NO), not EC2"

EN 1992-3 Table L.1, wall on base:
  L/H :   ≤1     2     3     4    ≥8
  R_top:   0     0   0,05  0,3   0,5      R_base = 0,5 always, linear in between
R_crit  = epsCtu / epsFree
  R_crit ≥ 0,5      → no restraint cracking predicted anywhere; report it
  R_top  ≥ R_crit   → full height
  else              → z = H·(0,5 − R_crit)/(0,5 − R_top)
```

## 10. Outputs

```js
{
  ok: true,
  material: { fctm, fctEff, Ecm, betaCc, alphaE },
  detailing: { AsVMin, AsVMax, sVMax, AsVProv, kNA, AsHMin, sHMax, links: {...} },
  crack: { active, wk, wkSource, kc, k, Act, AsFloor,
           bars:       [ { dia, phiStarReq, sigmaS, AsReq, ccMax, status, build } ],
           barsDirect: [ { dia, sigmaS, AsReq, ccMax, status, build, srMax } ] },
  governing: { horizontal: { As, clause, dia, ccMax }, vertical: { As, clause } },
  zone: { practice, tableL1: { LH, Rtop, Rcrit, height, note } | null },
  checks: [ { id, label, status: 'ok'|'warn'|'fail'|'info', detail } ],
  warnings: [ ... ]
}
```

`governing.horizontal` is reported for `selectedDia`, because the required area is a
function of the bar — that is the whole point of the tool. The full `bars` array is
always returned so the UI can show every diameter at once.

## 11. Test vectors

| case | expectation |
|---|---|
| t 350, B35, exterior, ø12 c250 | `fctm` 3,21; `AsHMin` 672; `AsVMin` 350 |
| same, kc 1,0, σs forced 240 | `As_min_layer` 2333 |
| t 350, B35, wk 0,3, ø16, c 35, 2 layers | φ*_req 14,25; σs ≈ 257; As ≈ 2175; cc ≈ 92 |
| t 240, B45, exterior, As_v 480 total | `AsHMin` 547 |
| t 400, fctm 3,2, exterior | `k_NA·Ac·fctm/fyk` = 768 |
| t 200, single layer, wk 0,3, ø8 | φ*_req ≈ 29 → `outOfTable` |
| t 100 | `sVMax` 300 |
| fck 40 | `fctm` 3,51 (not 0 — the source sheet's SUMIF trap) |
| fck 35, 3 d, CEM N | `fctEff` ≈ 1,92 |
| L/H 12 | `R_top` 0,5, full height |
| L 6000 H 3000, εfree 320µ, εctu 100µ | z ≈ 1140 mm vs 3t = 1050 mm |
| any input, kc 1,0, B35, t 350, layers 2 | `AsFloor` = 1120 mm²/m per layer |

---

## Review log — what revision 1 got wrong

1. **Single-layer `As_h_min` was contradictory.** The prose said it doubles, the formula
   did not. Worse, doubling the 25 % leg as well would have been wrong, because with one
   layer `As_v_prov` is already the whole-section vertical. Split the two legs. (§3)
2. **No absolute floor.** Nothing stopped a lax `wk` from returning an area at which the
   steel yields the instant the section cracks. Added `As_floor = kc·k·fct,eff·Act/fyk`,
   binding on both routes. (§5)
3. **Silent clamping in both directions.** Revision 1 clamped σs to [160, 450] and
   returned a number either way. The low end is unconservative and must refuse; the high
   end is conservative and may return, but labelled. Split into `outOfTable` / `capped`. (§6)
4. **The watertight factor was dropped.** Revision 1 used `/8` everywhere. EN 1992-3
   eq. (7.122) uses `/10`, which is *more* onerous, so using `/8` for a tank would have
   under-reinforced it. (§6)
5. **`cover` was undefined for the direct route with a single central layer.** `c` in
   (7.11) is cover to the bar surface, which for a central bar is `(t − d)/2`, not the
   nominal cover to a face. (§7)
6. **Bisection could return its own upper bound.** With no reachability test, an
   impossible `wk` would have silently returned 20000 mm²/m as if it were an answer. (§7)
7. **No buildability filter.** `cc_max = 32 mm` is arithmetically correct and useless.
   Added the unbuildable/tight bands. (§8)
8. **`R_crit ≥ 0,5` was unhandled** — the case where the wall simply does not crack, which
   is the answer the user most wants to hear when it is true. (§9)
9. **`governing` was a scalar.** Since `As_req` is a function of the bar diameter, a
   single governing number is meaningless without saying which bar it belongs to. (§10)
