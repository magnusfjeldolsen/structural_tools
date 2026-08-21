# Wall Minimum Reinforcement

Minimum reinforcement for concrete walls to NS-EN 1992-1-1 with the Norwegian National
Annex, and NS-EN 1992-3 for watertight walls. The point of the tool is not the arithmetic —
it is making the **cost of each crack requirement visible**, so reinforcement is chosen
rather than defaulted to.

Live: <https://magnusfjeldolsen.github.io/structural_tools/concrete_wall_minimum_reinforcement/>

## The idea

For restraint cracking, 7.3.3(2) ties the permitted steel stress to the **bar diameter**
through Table 7.2N, and that stress is the denominator of eq. (7.1). So the required area
is a function of the bar you pick — small bars buy a high stress and need *less* steel:

| ø | 8 | 10 | 12 | 16 | 20 | 25 |
|---|---|---|---|---|---|---|
| σs [MPa] | 391 | 354 | 316 | 258 | 228 | 202 |
| As [mm²/m per face] | 1436 | 1583 | 1773 | 2178 | 2458 | 2779 |
| max spacing | c35 | c50 | c64 | c92 | c128 | c177 |

*(t = 350, B35, c = 35, wk = 0,30, kc = k = 1,0. The first three are arithmetically fine
and unbuildable, which the tool says out loud.)*

And the same wall under different requirements, at ø16:

| requirement | As [mm²/m per face] |
|---|---|
| detailing only (NA.9.6.3) | 674 |
| wk 0,40 | 1886 |
| wk 0,30 | 2178 |
| wk 0,20 | 2575 |
| wk 0,30, cracking at 3 d | 1635 |
| kc = 0,6 house rule | 1307 |

## What it implements

**Detailing, §9.6**
- 9.6.2(1),(2): `As,vmin = 0,002·Ac`, half per face; `As,vmax = 0,04·Ac`
- 9.6.2(3): vertical spacing ≤ min(3t, 400)
- 9.6.3(2): horizontal spacing ≤ 400
- 9.6.4: links trigger at 0,02·Ac, and the 4 links/m² rule with its ø ≤ 16 / cover > 2ø waiver
- 9.6.1(1): scope warning at length/thickness < 4

**NA.9.6.3** — `As,hmin = max(0,25·As,v ; k·Ac·fctm/fyk)`, k = 0,30 exterior / 0,15 interior,
overridable. For a single central layer the code leg doubles, since 9.6.3(1) asks for the
amount at each surface and one layer serves both.

The two k values are worth understanding rather than accepting. EC2's own recommendation is
a flat `As,hmin = 0,001·Ac`. The Norwegian NA replaces it with a strength-dependent form,
and the interior value reproduces the EC2 figure almost exactly:

| class | fctm | `0,15·fctm/fyk` (interior) | `0,30·fctm/fyk` (exterior) | EC2 recommended |
|---|---|---|---|---|
| B25 | 2,57 | 0,077 % | 0,154 % | 0,100 % |
| B30 | 2,90 | 0,087 % | 0,174 % | 0,100 % |
| B35 | 3,21 | 0,096 % | 0,193 % | 0,100 % |
| B45 | 3,80 | 0,114 % | 0,228 % | 0,100 % |

So 0,15 is not a halving of 0,30 — it *is* the EC2 baseline, re-expressed so the minimum
scales with the force that cracks the section. 0,30 is a deliberate doubling for walls
exposed to outdoor climate, where the imposed strain is roughly twice as large. Anything
weather-exposed or cast against soil is normally taken as exterior.

**Crack control, §7.3.2** — `As,min·σs = kc·k·fct,eff·Act`, with an absolute floor at
`σs = fyk` that no crack-width relaxation can go below. Two routes, both computed always:

- **7.3.3 simplified** — Table 7.2N with the eq. (7.7N) size adjustment, interpolated in
  both σs and wk. Refuses rather than clamps when a bar falls off the table.
- **7.3.4 direct** — full crack width from (7.8), (7.9) and (7.11) with `k2 = 1,0` for pure
  tension, solved by bisection. Used automatically when wk falls outside Table 7.2N's
  0,20–0,40 band, which is exactly the watertight case.

**EN 1992-3** — Tightness Class 1 `wk1` interpolated on hD/h, eq. (7.122) bar adjustment,
and Table L.1 restraint factors for the restrained-zone height.

## The finding worth knowing about

Note 1 to Table 7.2N states the table assumes **k2 = 0,5, kc = 0,4, hcr = 0,5h** — a section
in **bending**. A wall cracking under edge restraint is in **uniform tension**, where
k2 = 1,0 and hcr = h. Eq. (7.7N) rescales the bar size for that, but it does not restore k2
inside `sr,max`. Checking the simplified answers against a direct 7.3.4 calculation shows
they deliver wk ≈ 0,31–0,45 mm against a 0,30 mm target.

7.3.1(9) makes the two routes alternatives, so both are code-compliant. The tool defaults
to the simplified route because that is what Norwegian practice uses, shows the direct
number on the adjacent row, and says plainly which is which.

## Deliberately out of scope

- Walls governed by out-of-plane bending — 9.6.1(1) sends those to the slab rules of §9.3,
  so eq. (7.2) and a tension-zone `Act` are not implemented. Pairing `kc = 0,4` with
  `Act = b·t` would double-count.
- In-plane shear walls and coupling beams. That is a strength problem driven by analysis
  forces, not a minimum-reinforcement problem.
- Early-thermal modelling. The tool reports a restrained-zone height and a warning; it does
  not compute T1.

## Notes on inputs

- **3 × t** is the default extent of the bottom zone. It is Norwegian practice, not an EC2
  rule, and the tool labels it as such. Enter L and H to get the EN 1992-3 Table L.1 second
  opinion, which keys off L/H rather than thickness and will flag long walls where 3t is
  unconservative.
- **Cover** is the cover to the horizontal bar. 9.6.3 puts those at the surface, and in a
  wall they are normally the outer layer for exactly that reason.
- **fctm** uses the closed form `0,30·fck^(2/3)`, not the rounded Table 3.1 value, so results
  sit about 0,3 % above a hand check using fctm = 3,2 for B35.
- **Exterior vs interior** only decides the answer when crack control is switched off. With
  §7.3.2 active the crack requirement normally sits well above both legs, and the choice
  stops mattering — for t = 400, B35, ø12 it is c145 against c290 with no crack control,
  and c60 either way at wk 0,30.
- Values taken from the Norwegian NA should be confirmed against your own copy of NA:2010.

## Files

| file | role |
|---|---|
| `wall_min_reinf_api.js` | pure calculation layer, no DOM, `module.exports` under Node for tests |
| `script.js` | form reading and painting only |
| `index.html` | single-screen UI |
| `SPEC.md` | the contract the API implements, with its review log |
| `print.css` | print layout |

Verification vectors are listed in `SPEC.md` §11 and include the Statens vegvesen culvert
example, a Norwegian retaining-wall report, and parity with the source spreadsheet.
