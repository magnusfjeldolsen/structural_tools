# Minimum reinforcement for walls — audit of `Minimumsarmering.xlsm!Vegg` and module plan

**Status**: planning
**Date**: 2026-08-21
**Proposed module folder**: `concrete_wall_minimum_reinforcement/`
**Source reviewed**: `local_docs/Minimumsarmering.xlsm`, sheet `Vegg` (git-ignored, stays local)

---

## Part 0 — TL;DR

The `Vegg` sheet gets the two hard things right: the Norwegian NA form of `As,h,min` and
the shape of EC2 (7.1). It has **one real formula bug**, **one silent-zero trap**, and it
hardcodes the single number the whole design decision actually hinges on — the steel
stress `σs`. Because `σs` is frozen at 240 MPa and `kc` at an untraceable 0,6, the sheet
cannot show the user the trade-off they care about: *how much steel does each crack
requirement actually cost me?*

The new module's job is to make that trade-off the main screen. One row of inputs, one
"what governs" bar, one scenario list, and one **ø-indexed table where each bar diameter
carries its own permitted `σs`, and therefore its own required area and spacing**. That
last idea is the reason this module is worth building and is not a port of the sheet.

---

## Part 1 — What the sheet does

Reconstructed from the cell formulas (t = 350 mm, B35, fyk = 500, exterior wall):

| Cell | Label | Formula | Value |
|---|---|---|---|
| `C5` | fctm | `SUMIF(G2:G4, C4, H2:H4)` | 3,2 |
| `K4` | As,v provided | `1000/cc · πø²/4` (ø12 c250) | 452 mm²/m |
| `C7` | **As,h,min** (NA.9.6.3) | `MAX(k·1000·t·fctm/fyk ; 0,25·K4)`, k = 0,3 | 672 mm²/m per face |
| `C8` | **As,v,min** (9.6.2) | `0,002·1000·t/2` | 350 mm²/m per face |
| `J9`, `J10` | single-layer wall | `2·C8`, `2·C7` | 700 / 1344 mm²/m |
| `C15` | crack, ordinary wall | `0,5·1·`**`0,6`**`·fctm·t·1000/240` | 1400 mm²/m per face |
| `C16` | additional | `C15 − C7` | 728 mm²/m |
| `C22` | crack, watertight wall | `0,5·1·`**`1,0`**`·fctm·t·1000/240` | 2333 mm²/m per face |
| `C23` | additional | `C22 − `**`C16`** | 1605 mm²/m |
| `C13`, `C20` | zone height | `3·t` | 1050 mm |

Plus four ø × cc matrices (`As = 1000/cc · πø²/4`) and two `cc_max` rows.

---

## Part 2 — Verification against EC2 + NA

### 2.1 Clause text used (verified against the standards, not from memory)

**EN 1992-1-1 §9.6 — walls**

- 9.6.1(1): §9.6 applies to walls with **length/thickness ≥ 4**. Walls predominantly in
  out-of-plane bending follow the **slab** rules (§9.3) instead.
- 9.6.2(1): `As,vmin ≤ As,v ≤ As,vmax`; recommended `As,vmin = 0,002·Ac`,
  `As,vmax = 0,04·Ac` outside laps (may be doubled at laps).
- 9.6.2(2): where `As,vmin` controls, **half at each face**.
- 9.6.2(3): vertical bar spacing ≤ **lesser of 3t and 400 mm**.
- 9.6.3(1): horizontal reinforcement **at each surface**, not less than `As,hmin`
  (recommended: greater of 25 % of the vertical reinforcement and `0,001·Ac`).
- 9.6.3(2): horizontal bar spacing ≤ **400 mm**.
- 9.6.4(1): links per §9.5.3 where total vertical steel in both faces > `0,02·Ac`.
- 9.6.4(2): ≥ 4 links/m² where the main reinforcement is nearest the faces — **waived**
  for mesh and bars ø ≤ 16 mm with cover > 2ø.

**Norwegian NA.9.6.3** replaces the recommended `As,hmin`:

- exterior wall: `As,hmin = max(0,25·As,v ; `**`0,30`**`·Ac·fctm/fyk)`
- interior wall: `As,hmin = max(0,25·As,v ; `**`0,15`**`·Ac·fctm/fyk)`

**Verified against the standard itself** — NS-EN 1992-1-1:2004+A1:2014+NA:2018, NA.9.6.3(1).
The clause states the minimum area per face **in doubly reinforced walls** as the greater of
25 % of the vertical reinforcement *on the same side* and, for exterior walls
`0,3·Ac·fctm/fyk`, for interior walls `0,15·Ac·fctm/fyk`; and adds that singly reinforced
walls shall carry the corresponding total area. A second paragraph covers tightness — see
§2.7 below. Previously corroborated by: SCIA's published Norway NA parameter set; SCIA's
*Theoretical Background — National Annexes to EN 1992*; the Statens vegvesen /
Rambøll culvert design example (`As.hmin.vegg = max(0,25·As.vmin ; 0,3·Ac·fctm/fyk)`,
explicitly *"defineres som yttervegg"*); and a Norwegian retaining-wall report using the
same expression with `Ac = b·t` and comparing the result against the distribution
reinforcement **at each face separately**.

**EN 1992-1-1 §7.3.2(2), eq. (7.1)**: `As,min·σs = kc·k·fct,eff·Act`

- `kc = 1,0` for **pure tension**; for bending / bending + axial, eq. (7.2)
  `kc = 0,4·[1 − σc/(k1·(h/h*)·fct,eff)] ≤ 1`, with `k1 = 1,5` for compressive `NEd`.
  Pure bending with `NEd = 0` gives `kc = 0,4`.
- `k = 1,0` for h ≤ 300 mm, `0,65` for h ≥ 800 mm, interpolate. It accounts for
  **non-uniform self-equilibrating (internal) stresses** only.
- `fct,eff = fctm`, **or lower `fctm(t)` if cracking is expected earlier than 28 days**;
  `fctm(t) = βcc(t)^α · fctm`, `α = 1` for t < 28 d (eq. 3.4 / 3.2).
- `σs` = max stress permitted in the steel immediately after cracking; may be taken as
  `fyk`, **but a lower value may be needed to meet the crack width limit via 7.3.3(2)**.

**EN 1992-1-1 §7.3.3(2)** — the part the sheet is missing:

> for cracking caused **dominantly by restraint**, the bar sizes given in **Table 7.2N**
> are not exceeded where the steel stress is the value obtained immediately after
> cracking (i.e. σs in Expression (7.1)).

Note that **Table 7.3N (spacing) does not apply to restraint-dominated cracking** — only 7.2N.

Table 7.2N, `φ*s` [mm]:

| σs [MPa] | wk 0,4 | wk 0,3 | wk 0,2 |
|---|---|---|---|
| 160 | 40 | 32 | 25 |
| 200 | 32 | 25 | 16 |
| 240 | 20 | 16 | 12 |
| 280 | 16 | 12 | 8 |
| 320 | 12 | 10 | 6 |
| 360 | 10 | 8 | 5 |
| 400 | 8 | 6 | 4 |
| 450 | 6 | 5 | — |

adjusted by (7.7N) for uniform axial tension: `φs = φ*s·(fct,eff/2,9)·hcr/(8(h−d))`, where
for a fully tensioned section `h − d` is the distance from the bar centroid to the
**nearest** face. (EN 1992-3 eq. 7.122 replaces the 8 with 10 for liquid-retaining.)

**EN 1992-3** — for the watertight case

- Table 7.105 tightness classes 0–3; Class 1 limits through-cracks to `wk1`, interpolated
  on `hD/h` (hydrostatic head / wall thickness): `hD/h ≤ 5 → 0,2 mm`, `≥ 35 → 0,05 mm`.
- Annex L Fig. L.1(a) gives restraint factors for a **wall cast on a base**.
- **Table N.1(b)**: if the design provides close movement joints (greater of 5 m or
  1,5 × wall height), reinforcement need only satisfy **§9.6.2–9.6.4** — i.e. the 7.3.2
  crack minimum drops out entirely. A legitimate, code-sanctioned escape hatch.

**Norwegian NA.7.3.1(5)** crack width limits: X0 → 0,40 (quasi-permanent);
XC1–XC4 / XD1–XD2 / XS1–XS2 → `0,30·kc` (quasi-permanent); XD3 / XS3 / XSA → `0,30·kc`
(frequent); with `kc = cnom/cmin,dur ≤ 1,3`. **Verified in NA.7.3.1(5), Table NA.7.1N and
eq. (NA.901) of NA:2018.** Footnote 1 to that table adds that in X0 the crack width does
not affect durability — the 0,40 limit is for appearance, and may be increased where
appearance is not a constraint.

### 2.7 What NA:2018 adds that neither the sheet nor the first draft of this plan had

Read from the standard after the module was built; all four are now implemented.

1. **NA.9.6.2** — where tightness governs, the vertical minimum is **at least double**,
   i.e. `0,004·Ac`. The sheet does not have this.
2. **NA.9.6.3(1), second paragraph** — where tightness governs, the horizontal minimum comes
   from eq. (7.1) with **`fct,eff = fctm`** and **`k = kc = 1,0`**. This is the NA blessing the
   sheet's *vanntett vegg* row exactly, and it also rules out the early-age `fctm(t)`
   reduction for that case.
3. **NA.7.3.4(3)** — `k3 = 3,4`, `k4 = 0,425`, and `Ac,eff` shall not be less than that
   corresponding to `hc,eff = (h − d + 1,5ø)`. A relaxation, binding mainly on single-layer
   walls.
4. **NA.9.6.2** — `As,vmax` may be doubled at lapped splices **only where the laps sit at
   braced nodes**; otherwise laps must be staggered. The blanket "0,08·Ac at laps" reading is
   too generous.

Also confirmed: the NA amends **only 7.3.2(4)** (σct,p for prestress), so `kc`, `k`,
`fct,eff` and `Act` in eq. (7.1) are the EC2 values; and footnote 1 to Table NA.7.1N states
that in X0 the crack width does not affect durability and the 0,40 limit is for appearance,
which may be increased where appearance is not a constraint — the clause that licenses the
tool's "no crack control required" option.

### 2.2 What the sheet gets right

- `fctm` for B30 / B35 / B45 = 2,9 / 3,2 / 3,8 — matches EC2 Table 3.1.
- `As,v,min = 0,002·Ac`, half at each face — 9.6.2(1) + (2). ✔
- `As,h,min = max(0,25·As,v ; 0,30·Ac·fctm/fyk)` with the full `Ac` — matches NA.9.6.3 and
  all three independent sources. Using the **provided** vertical steel for the 25 % leg
  (rather than `As,vmin`) is the stricter and more correct reading of "the vertical
  reinforcement". ✔
- The structure of (7.1) with `Act = b·t` and half the steel per face. ✔
- `kc = 1,0` for the watertight case. ✔
- All matrix arithmetic (`As = 1000/cc · πø²/4`). ✔

### 2.3 Errors

**E1 — `C23` subtracts the wrong cell.** `C23 = C22 − C16` takes the *additional* steel
from the ordinary-wall case off the watertight total. It should be `C22 − C7` (total minus
the code minimum). At t = 350 that is 1605 vs 1661 mm²/m; the gap tracks `C16`, so it
grows with wall thickness and concrete class. Real bug.

**E2 — `Betongkvaliteter` sheet has B45 → fctm 3,5.** EC2 Table 3.1 gives **3,8** for
C45/55 (3,5 is C40/50). The `Vegg` sheet's own lookup has 3,8 and is unaffected, but
`GPG!B9` reads this table with fck = 45, so every GPG minimum comes out ~8 % low.

**E3 — `NS3473_overflatearmering` lookup is mis-keyed.** The label column runs
B20/B25/B30/B35/B40/B45/B55 while the `fcck` column runs 20/25/30/35/**45**/**55**/**65**.
Selecting "B40" returns ftk 3,35 and "B45" returns 3,7. Either an off-by-one or an
undocumented cube-grade mapping — worth checking against NS 3473 table 5.

### 2.4 Silent-failure traps

**T1 — `SUMIF` returns zero for unlisted concrete.** `C5` only knows B30 / B35 / B45. Type
B25 or B40 and `fctm` becomes **0**, so `As,h,min` and every crack requirement become 0
with no warning at all. Replace with the closed form: `fctm = 0,30·fck^(2/3)` for
fck ≤ 50, `2,12·ln(1 + (fck+8)/10)` above. (The repo already has this in
`ec2concrete/ec2ConcreteUtils.js` — reuse it.)

**T2 — two disconnected definitions of the vertical steel.** `K4` (from `K2`/`K3`) feeds
the 25 % leg, but `C8` is the vertical minimum and the ø × cc matrices are a third,
unlinked place to pick bars. Change one and the others go stale silently.

### 2.5 Code requirements the sheet never checks

| # | Missing | Clause |
|---|---|---|
| M1 | vertical bar spacing ≤ min(3t, 400 mm) | 9.6.2(3) |
| M2 | horizontal bar spacing ≤ 400 mm | 9.6.3(2) |
| M3 | `As,v,max = 0,04·Ac` (0,08 at laps) | 9.6.2(1) |
| M4 | links if vertical steel > 0,02·Ac; ≥ 4 links/m² rule and its ø ≤ 16 waiver | 9.6.4 |
| M5 | scope: length/thickness ≥ 4; out-of-plane bending → slab rules | 9.6.1(1) |
| M6 | **bar diameter compatible with σs and wk** (Table 7.2N + eq. 7.7N) | 7.3.3(2) |

M6 is the serious one. The sheet reports 1400 mm²/m and stops. You can satisfy
1400 mm²/m with ø25 c350 and be nowhere near wk = 0,3 — the area is met and the crack
width is not.

### 2.6 Interpretation choices that are buried and should be explicit

**I1 — `kc = 0,6` for "vanlig vegg" is not an EC2 number.** EC2 offers 1,0 (pure tension)
or eq. (7.2) (0,4 at pure bending, less with compression). 0,6 sits between them with no
clause behind it, and it is doing all the work in that row — it is the entire difference
between 1400 and 2333 mm²/m. The legitimate levers that reach similar numbers are:
eq. (7.2) with the real `NEd`, `fct,eff = fctm(t)` for early-age cracking, the `wk` choice
itself, and movement joints per EN 1992-3 Table N.1(b).

**I2 — `As,h,min` per face vs total.** The sheet applies the NA formula with the full `Ac`
and calls the result *per face*, which doubles the total. That matches SCIA and both
Norwegian design reports, so the reading is defensible — but it deserves to be printed on
the face of the tool rather than inferred from a column header.

**I3 — `k = 1,0` hardcoded.** Correct and conservative here (external / edge restraint is
the governing mechanism for a wall on a base, and `k` only reduces *internal*
self-equilibrating stresses), but it should be a visible, explained default.

**I4 — the 3 × t zone height is a house rule, not a code rule.** EN 1992-3 Annex L ties
the restrained zone of a wall on a base to the **wall height and L/H ratio**, not the
thickness. 3t turns out to be a decent proxy for stocky walls and unconservative for long
ones — see §5.1. Keep it as the default, label it as practice, and let the L/H curve
second-guess it.

**I5 — `fct,eff` frozen at 28 days.** The bottom-of-wall horizontal steel exists to control
*early-age restraint cracking*, which is exactly the case where EC2 permits `fctm(t)`.
This is the single largest legitimate reduction on the table and the sheet does not
offer it.

---

## Part 3 — The module

### 3.1 The idea that makes it different

For restraint cracking, 7.3.3(2) ties the permitted `σs` to the **bar diameter** through
Table 7.2N. And `σs` sits in the denominator of (7.1). So the required area is a function
of the bar you choose:

```
ø  →  φ*s required = ø / [(fct,eff/2,9) · hcr/(8(h−d))]
   →  σs = invert Table 7.2N at the target wk        (interpolated)
   →  As,req = kc·k·fct,eff·Act / σs
   →  cc,max = 1000·(πø²/4) / As,req
```

Small bars buy a high permitted stress and therefore **less** steel; big bars are penalised
twice (lower `σs`, and a larger area to cover with fewer bars). That is counter-intuitive,
it is what the code actually says, and no spreadsheet in the office shows it. Worked for
t = 350, B35, c = 35, wk = 0,3, kc = k = 1,0:

| ø | 8 | 10 | 12 | 16 | 20 | 25 |
|---|---|---|---|---|---|---|
| `φ*s` required | 6,5 | 8,3 | 10,2 | 14,3 | 18,6 | 24,6 |
| σs [MPa] | 391 | 354 | 316 | 257 | 228 | 202 |
| As,req [mm²/m per face] | 1433 | 1581 | 1771 | 2175 | 2453 | 2775 |
| cc,max [mm] | 35 | 50 | 64 | 92 | 128 | 177 |

Same wall, same restraint, only the crack requirement changed — the whole point of the
tool in one comparison (all at ø16):

| requirement | σs [MPa] | As,req [mm²/m per face] | cc,max for ø16 |
|---|---|---|---|
| detailing only (NA.9.6.3) | — | 672 | c300 |
| wk = 0,4 | 297 | 1882 | c107 |
| wk = 0,3 | 257 | 2175 | c92 |
| wk = 0,2 | 217 | 2575 | c78 |
| wk = 0,3, cracking at 3 d (`fct,eff` = 0,6·fctm) | 206 | 1635 | c123 |

The last row is the honest reduction the sheet's `kc = 0,6` was reaching for: 1635 vs
1400 mm²/m, but every step of it traceable to a clause.

*(Cross-check: force `σs = 240` and `kc = 1,0` and the formula returns 2333 mm²/m —
exactly the sheet's `C22`; and `0,3·Ac·fctm/fyk` returns 672 = `C7`. The model reproduces
the sheet everywhere the sheet is right.)*

The same machinery answers the single-vs-double-layer question honestly. For a single
central layer, `h − d = t/2`, so the (7.7N) factor collapses to roughly `t/(4t) = 0,25`:
a 200 mm single-layer wall under full restraint needs `φ*s` ≈ 29 for ø8 and ≈ 58 for
ø16, which is off the top of Table 7.2N entirely. σs pins at the 160 MPa floor and
As,req reaches 4000 mm²/m in one layer.

Two rules follow, and both must be coded rather than left to the reader:

- **Never silently clamp.** If the required `φ*s` falls outside Table 7.2N's range the
  answer is *"outside the table — direct calculation to 7.3.4 required"*, not a number
  produced by pinning σs at 160. Clamping is how a tool tells a comfortable lie.
- **Say it in words.** For a singly reinforced wall under edge restraint the module
  should state that crack control is not achievable in one layer and that a second layer
  (or movement joints) is the fix — instead of printing an unbuildable spacing.

### 3.2 Screen (single view, no scrolling on a laptop)

```
┌─ Wall ─────────────────────────────────────────────────────────────────┐
│ Mode [2 · Wall on base ▾]   □ also restrained top and bottom           │
│ t [350] mm   Concrete [B35▾]   fyk [500]   Layers [Double▾]            │
│ cover c [35]  Wall [Exterior▾]  NEd [0] kN/m   Cracking at [28 d▾]     │
│ kc [1,0] pure tension▾   zone 3t = 1050 mm   L [ ] H [ ] (optional)    │
└────────────────────────────────────────────────────────────────────────┘
┌─ What governs (horizontal, per face) ─┐ ┌─ Crack requirement ──────────┐
│ ▇▇▇▇▇        9.6.2   As,v     350     │ │ ○ none required     →   672  │
│ ▇▇▇▇▇▇▇▇▇▇   NA.9.6.3 As,h    672     │ │ ○ wk 0,4            →  1882  │
│ ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ 7.3.2      2175     │ │ ● wk 0,3·kc (XC/XD) →  2175  │
│ → 7.3.2 governs, ×3,2 over detailing  │ │ ○ wk 0,2            →  2575  │
└───────────────────────────────────────┘ │ ○ EN1992-3 Class 1  →  2960  │
                                          │ ○ movement joints   →   672  │
                                          └──────────────────────────────┘
┌─ Pick your bar (horizontal, bottom zone, per face) ────────────────────┐
│  ø        8     10    12    16    20    25                             │
│  σs      391   354   316   257   228   202   MPa   Tab 7.2N + (7.7N)   │
│  As,req 1433  1581  1771  2175  2453  2775   mm²/m                     │
│  cc,max  c35   c50   c64   c92  c128  c177                             │
│  verdict  ✗     ✗     ⚠     ✓     ✓     ✓    (✗ = cc below buildable)  │
└────────────────────────────────────────────────────────────────────────┘
┌─ ø × cc matrix ─── [horizontal ▾ | vertical] ──────────────────────────┐
│         ø8    ø10   ø12   ø16   ø20   ø25       green ≥ req            │
│  c100   503   785  1131  2011  3142  4909       amber within 5 %       │
│  c150   335   524   754  1340  2094  3272       red   < req            │
│  c200   251   393   565  1005  1571  2454       grey  spacing > smax   │
│  ...                                            hatch ø fails Tab 7.2N │
└────────────────────────────────────────────────────────────────────────┘
```

Everything above recomputes live. No Calculate button.

### 3.3 Requirement set the engine evaluates

Per face (or per layer for single-layer walls):

1. `As,v,min = 0,002·Ac / n_layers`, `As,v,max = 0,04·Ac`, `s_v,max = min(3t, 400)`
2. `As,h,min = max(0,25·As,v,provided ; k_NA·Ac·fctm/fyk)`, k_NA = 0,30 ext / 0,15 int,
   `s_h,max = 400`
3. `As,crack = kc·k·fct,eff·Act/(σs·n_faces)` per the ø-indexed loop above
4. 9.6.4 links trigger and its ø ≤ 16 / cover > 2ø waiver
5. 9.6.1 scope warnings (L/t < 4, out-of-plane bending → §9.3)
6. zone height: 3 × t by default, with the EN 1992-3 Table L.1 second opinion when L and H
   are given (§5.1)

Governing = max of whichever are switched on. The "what governs" bar shows all of them
side by side, so the cost of the crack requirement reads as a ratio, not a bare number.

### 3.4 Files

```
concrete_wall_minimum_reinforcement/
  index.html                 # UI, GA tag immediately after <head>, shared assets/css
  wall_min_reinf_api.js      # pure calc layer, no DOM (per plan_IO-structure_for_modules)
  script.js                  # UI wiring + MODULE_CONFIG / ModuleAPI workflow layer
  print.css
  README.md
```

Reuse `ec2concrete/ec2ConcreteUtils.js` for `fctm` / `fctm(t)` — kills trap T1 outright.

### 3.5 Deployment (per DEPLOYMENT.md — both edits are required or the page 404s)

- add `'concrete_wall_minimum_reinforcement/**'` to the `paths:` trigger in
  `.github/workflows/deploy-all-modules.yml`
- add the folder to the **copy-loop allowlist** (`for dir in … ; do`) in the same file
- do **not** touch `module-registry/module-registry.json` — it is regenerated from
  `index.html` on every deploy
- landing-page card under Concrete

### 3.6 Test plan

- **Sheet parity**: force `σs = 240`, `kc = 1,0`, `k = 1,0`, 28-day `fct,eff` → must return
  `C7 = 672`, `C8 = 350`, `C22 = 2333` for t = 350 / B35 / exterior.
- **Rambøll culvert**: t = 240, B45, exterior → `As,hmin = 547 mm²/m`,
  `As,vmin = 480 mm²/m` total, `s_v,max = 400`, `As,vmax = 9600`.
- **Norwegian retaining wall**: t = 400, fctm 3,2, exterior → `0,3·Ac·fctm/fyk = 768`
  and `As,vmin = 400 mm²/m` per face.
- **Table 7.2N inversion**: exact table points round-trip; interpolation monotonic; clamp
  at σs ∈ [160, 450] and flag out-of-range rather than extrapolating.
- **fctm**: every class C12/15 … C90/105 against Table 3.1; and specifically B25 and B40,
  which the sheet silently zeroes.
- **Single layer**: 200 mm wall, wk = 0,3, full restraint → engine must return
  "not achievable", not a number.
- **Spacing caps**: t = 100 → `s_v,max = 300`; t = 200 → 400 (not 600).
- **Table L.1**: L/H = 2 → R_top 0; L/H = 3 → 0,05; L/H = 4 → 0,3; L/H = 12 → 0,5
  (clamped, not extrapolated); L/H = 3,5 → 0,175 by interpolation.
- **Zone height**: t = 250, H = 3000, L = 25000 → must report full height and flag that
  3t (750 mm) is unconservative.

---

## Part 4 — Decisions taken

**Q1 — `k_NA` is an exposure toggle.** 0,30 for `yttervegg`, 0,15 for `innervegg`.
**Since verified word for word in NA.9.6.3(1) of NS-EN 1992-1-1:2004+A1:2014+NA:2018.** The
physical logic is that an exterior wall sees a far larger seasonal range and dries from
one side, so the restrained strain is roughly double; note also that the interior leg
reproduces EC2’s own recommended `0,001·Ac` to within a tenth of a per cent across B25 to
B45, so 0,15 is the baseline and 0,30 is the deliberate uplift. Implementation: a two-way toggle
with a hint line, plus a numeric override for the awkward cases (a basement wall with
earth on one side and heated space on the other is normally taken as `yttervegg`).

**Q2 — `kc` is an overwritable default input.** The field ships with a computed default
and a preset menu, and the user can type over any of it:

| preset | `kc` | basis |
|---|---|---|
| pure tension (edge restraint) | 1,0 | 7.3.2(2), the default for a wall on a base |
| from `NEd` | eq. (7.2) | live from the axial force field; 0,4 at `NEd` = 0 |
| reduced restraint (house rule) | 0,6 | the sheet's value, labelled as practice |
| custom | — | free entry |

Whatever is active is printed next to the result with its basis, so a check print always
says where the number came from.

**Q3 — keep 3 × t as the default; the L/H curve is the second opinion.** See §5.1.

**Q4 — vertical and horizontal are genuinely different problems, and modes are the right
shape.** See §5.2.

---

## Part 5 — The two answers that needed working out

### 5.1 The restraint curve, and whether 3 × t holds up

**EN 1992-3 Table L.1 — restraint factors for the central zone of a wall on a base:**

| L/H | R at base | R at top |
|---|---|---|
| 1 | 0,5 | 0 |
| 2 | 0,5 | 0 |
| 3 | 0,5 | 0,05 |
| 4 | 0,5 | 0,3 |
| > 8 | 0,5 | 0,5 |

R at the base is **always 0,5** — the base holds the wall completely, and the 0,5 is the
creep relief on a load that builds up slowly. What changes with L/H is the **top**: a
stocky wall (L/H ≤ 2) is free at the top and R decays to zero, while a long wall
(L/H > 8) is held just as hard at the top as at the base. R is taken to vary linearly
between the two.

**Where R enters is the part that is easy to get wrong.** R does *not* appear in eq. (7.1).
Eq. (7.1) is an equilibrium statement at the instant of cracking: once the concrete
reaches `fct,eff` a crack forms and the steel has to catch the released force, and it
makes no difference what caused the strain. So `As,min` is independent of R.

R appears one step earlier, in **whether that zone cracks at all**. EN 1992-3 Annex M,
eq. (M.3), for a wall restrained along one edge: `εsm − εcm = Rax·εfree`. A crack forms
only where `Rax·εfree` exceeds the concrete's tensile strain capacity `εctu`, i.e. where

```
R(z) > R_crit = εctu / εfree
```

For a typical Norwegian basement wall — early-thermal rise ~25–30 °C, `αc` = 10·10⁻⁶/°C,
plus autogenous shrinkage — `εfree` ≈ 300–350 με and `εctu` ≈ 75–110 με, so
`R_crit` ≈ 0,25–0,35. Reading that back off the linear R(z) gives the height over which
the extra horizontal steel is actually needed. For H = 3,0 m:

| L/H | R_crit = 0,25 | R_crit = 0,31 | R_crit = 0,35 |
|---|---|---|---|
| 1–2 | 1500 mm | 1140 mm | 900 mm |
| 3 | 1667 mm | 1267 mm | 1000 mm |
| 4 | full height | 2850 mm | 2250 mm |
| ≥ 6 | full height | full height | full height |

**So 3 × t is a good rule where it came from and a trap where it did not.** For a 350 mm
wall, 3t = 1050 mm, and for L/H ≤ 3 the curve lands at 900–1670 mm — 3t sits right in the
band. That is almost certainly why the rule exists: the ordinary Norwegian basement wall
is stocky, and for stocky walls it happens to be right.

But the rule keys off **thickness**, and the physics keys off **length over height**. At
L/H ≥ 4 the restrained zone runs the full height of the wall, and long retaining and
basement walls are exactly where that bites. A 250 mm × 3 m × 25 m wall gets 750 mm of
extra steel under the 3t rule and needs it over all 3000 mm.

Implementation, and deliberately modest:

- default the zone height to **3 × t**, labelled *"practice (NO) — not an EC2 rule"*
- take `L` and `H` as two optional fields. When both are filled, show a second line:
  *"EN 1992-3 Table L.1: L/H = 8,0 → R = 0,50 at base and top → extra reinforcement over
  the full height, 3000 mm, not 750 mm"*
- expose `εfree` and `εctu` as advanced fields with the Norwegian defaults above, because
  `R_crit` is the whole ballgame and pretending otherwise would be dishonest
- do **not** grow this into an early-thermal crack calculator. It reports a height and a
  warning; it does not compute `T1`.

### 5.2 Vertical vs horizontal, and the mode list

They are different problems, and the sheet is right to treat only the horizontal bars as
crack-driven:

- **Horizontal bars** carry the edge restraint. The wall wants to shorten along its length
  and the base will not let it, so the tension is horizontal and the cracks are vertical.
  7.3.2 governs here, typically by a factor of 3 over the detailing minimum.
- **Vertical bars** are almost never restraint-critical. The wall is free to shorten
  vertically — only the bottom is held, over a short distance — so 9.6.2's `0,002·Ac` and
  whatever out-of-plane bending the wall carries are what govern. The exception is a wall
  cast **between** two slabs, where the vertical direction is restrained top and bottom
  too, and that is a separate situation rather than a different formula.

So modes are structural situations, and each one switches on a set of requirements:

| mode | vertical | horizontal | notes |
|---|---|---|---|
| **1. Ordinary wall** (above ground) | 9.6.2 | NA.9.6.3 | detailing only; the fast path |
| **2. Wall on base** (basement, retaining) | 9.6.2 | NA.9.6.3 + **7.3.2 edge restraint** in the bottom zone | the sheet's *vanlig vegg* |
| **3. Watertight** (lift pit, tank) | 9.6.2 | NA.9.6.3 + **7.3.2** with EN 1992-3 `wk1` from `hD/h` and the (7.122) bar rule | the sheet's *vanntett vegg* |
| **4. Restrained top and bottom** (cast between slabs) | 9.6.2 + **7.3.2** | as mode 2 | a checkbox on modes 1–3, not its own mode |

Modes 1–3 plus the mode 4 checkbox are v1. Mode 2 is the default, because it is what
people open the tool for.

**Out of scope, stated explicitly in the README**: in-plane shear walls and coupling
beams. That is a strength problem driven by analysis forces, not a minimum-reinforcement
problem, and folding it in would blur what this tool is for.

Every mode still ends at the same place — the ø-indexed table of §3.1 — so switching
modes changes which requirement wins, never the shape of the answer.

---

## Sources

- BS EN 1992-1-1:2004 §3.1.2, §7.3.2, §7.3.3 (Tables 7.2N / 7.3N, eq. 7.6N / 7.7N), §9.6
- [EN 1992-3:2006](https://www.phd.eng.br/wp-content/uploads/2015/12/en.1992.3.2006.pdf) §7.3.1 (Table 7.105), §7.3.3 (eq. 7.122), Annex L (Fig. L.1a, **Table L.1**), Annex M (eq. M.3), Annex N (Table N.1)
- **NS-EN 1992-1-1:2004+A1:2014+NA:2018**, National Annex NA — NA.7.3.1(5) with Table NA.7.1N and eq. (NA.901), NA.7.3.2(4), NA.7.3.4(3), NA.9.6.2, NA.9.6.3(1). Read directly; the authority for every NA value in this module
- [SCIA — Norwegian National Annex to EN 1992-1-1](https://help.scia.net/25.0/en/national_annexes/en1992/norway.htm) — NA.7.3.1 and NA.9.6.3 parameters
- [SCIA — Theoretical Background, National Annexes to EN 1992](https://help.scia.net/download/18.0/en/Theory_NA_EN_1992_enu.pdf) — Norway section, citing NS EN 1992-1-1:2004/NA:2010
- [Statens vegvesen / Rambøll, prefabricated culvert design example](https://www.vegvesen.no/globalassets/fag/teknologi/bruer/prefabrikkerte-kulvertelementer-til-v425/beregningseksempel-2015.pdf) §3.1.4
- [Norwegian retaining-wall worked example (jet-as.no)](https://jet-as.no/onewebmedia/Regneeksempel%20for%20st%C3%B8ttemur%20revidert.pdf) §9, §10
