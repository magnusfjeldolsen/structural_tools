# EC2 Part 4 Fastener Design - Python Implementation Specification

This specification document outlines all formulas, failure modes, and factors
extracted from EC2 Part 4-1 and 4-2 for implementation in Python.

---

## EC2 Part 4-1: General

### Table of Contents


### Failure Modes

#### blow-out failure (Unknown)

```
synonymously 
3.1.15 
Base material 
Material in which the fastener is installed 
3.1.16 
Blow-out failure 
Spalling of the concrete on the side face of the anchorage component at the level of the embedded head with 
no major breakout at the top concrete surface. This is usually associated with anchors with small side cover 
and deep embedment 
3.1.17 
Bonded anchor 
Fastener placed into a hole in hardened concrete, which derives its resistance from a bonding compound 
placed between the wall of...
```

#### concrete breakout (Unknown)

```
90 %) 
3.1.23 
Clamping force 
Prestressing force resulting from tightening of the fastener against the fixture 
3.1.24 
Concrete breakout failure 
Failure that corresponds to a wedge or cone of concrete surrounding the fastener or group of fasteners 
separating from the base material 
3.1.25 
Concrete pry-out failure 
Failure that corresponds to the formation of a concrete spall opposite to the loading direction under shear 
loading 
3.1.26 
Concrete screw 
Threaded anchor screwed into a predri...
```

#### pry-out failure (Unknown)

```
3.1.24 
Concrete breakout failure 
Failure that corresponds to a wedge or cone of concrete surrounding the fastener or group of fasteners 
separating from the base material 
3.1.25 
Concrete pry-out failure 
Failure that corresponds to the formation of a concrete spall opposite to the loading direction under shear 
loading 
3.1.26 
Concrete screw 
Threaded anchor screwed into a predrilled hole where threads create a mechanical interlock with the concrete 
(see Figure 5f)) 
3.1.27 
Displacement 
...
```

#### pull-out failure (Unknown)

```
given in the European Technical Specification 
3.1.42 
Post-installed fastener 
A fastener installed in hardened concrete (see Figure 5) 
3.1.43 
Pullout failure 
A failure mode in which the fastener pulls out of the concrete without development of the full concrete 
resistance or a failure mode in which the fastener body pulls through the expansion sleeve without 
development of the full concrete resistance 
3.1.44 
Special screw 
Screw which connects the element to be fixed to the anchor chann...
```

#### splitting failure (Unknown)

```
development of the full concrete resistance 
3.1.44 
Special screw 
Screw which connects the element to be fixed to the anchor channel 
3.1.45 
Splitting failure 
A concrete failure mode in which the concrete fractures along a plane passing through the axis of the fastener 
or fasteners 
3.1.46 
Steel failure of fastener 
Failure mode characterised by fracture of the steel fastener parts 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
15 
Key 
a) without anchor plate 
b) with a large anchor p...
```

#### steel failure (Unknown)

```
3.1.45 
Splitting failure 
A concrete failure mode in which the concrete fractures along a plane passing through the axis of the fastener 
or fasteners 
3.1.46 
Steel failure of fastener 
Failure mode characterised by fracture of the steel fastener parts 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
15 
Key 
a) without anchor plate 
b) with a large anchor plate in any direction, b1 > 0,5 hn or t ≥ 0,2 hn
c) with a small anchor plate in each direction, b1 ≤ 0,5 hn or t < 0,2 hn
Figure 3 — De...
```

#### concrete breakout (Unknown)

```
h) bonded expansion anchor 
Figure 5 — Definition of effective embedment depth hef for post-installed fasteners, examples 
NOTE For concrete screws hef is smaller than the embedded length of the threads. 
3.1.47 
Supplementary reinforcement 
Reinforcement tying a potential concrete breakout body to the concrete member 
3.1.48 
Torque-controlled expansion anchor 
Post-installed expansion anchor that derives its tensile resistance from the expansion of one or more sleeves 
or other components agai...
```

#### steel failure (4.4.3.1.1)

```
4.4.3.1 Ultimate limit state (static and seismic loading) 
4.4.3.1.1 Partial factors for steel 
The partial factors for steel are γ Ms, γ Ms,ca, γ Ms,.l, γ Ms,flex and γ Ms,re. 
NOTE The value for use in a Country may be found in its National Annex. The recommended values are given in 
Equations (4) to (10). They take into account that the characteristic resistance is based on fuk, except fyk should be used for 
bending of the channel of anchor channels and steel failure of supplementary reinfor...
```

#### steel failure (4.4.3.1.1)

```
γ Ms,ca = 1,8 (7) 
Local failure of the anchor channel by bending of the lips in tension and shear: 
γMs,l = 1,8 (8) 
Bending of the channel of anchor channels: 
γMs,flex = 1,15 (9) 
Steel failure of supplementary reinforcement: 
γMs,re = 1,15 (10) 
4.4.3.1.2 Partial factor for concrete 
The partial factor γMc covers concrete break-out failure modes (cone failure, blow-out failure, pry-out failure 
and edge failure), the partial factor γMsp covers splitting failure. 
The value for γMc is determi...
```

#### blow-out failure (4.4.3.1.2)

```
Bending of the channel of anchor channels: 
γMs,flex = 1,15 (9) 
Steel failure of supplementary reinforcement: 
γMs,re = 1,15 (10) 
4.4.3.1.2 Partial factor for concrete 
The partial factor γMc covers concrete break-out failure modes (cone failure, blow-out failure, pry-out failure 
and edge failure), the partial factor γMsp covers splitting failure. 
The value for γMc is determined from: 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
24 
Mc c inst γ = γ ⋅γ (11) 
where 
γ c partial factor fo...
```

#### splitting failure (4.4.3.1.2)

```
γMs,flex = 1,15 (9) 
Steel failure of supplementary reinforcement: 
γMs,re = 1,15 (10) 
4.4.3.1.2 Partial factor for concrete 
The partial factor γMc covers concrete break-out failure modes (cone failure, blow-out failure, pry-out failure 
and edge failure), the partial factor γMsp covers splitting failure. 
The value for γMc is determined from: 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
24 
Mc c inst γ = γ ⋅γ (11) 
where 
γ c partial factor for concrete under compression 
The partial fa...
```

#### pull-out failure (4.4.3.1.3)

```
 γ inst = 1,0 
However, for seismic strengthening and repair of existing structures the partial factor for concrete γc in 
Equation (11) may be reduced according to the relevant clauses of EN 1998.
NOTE The value of γMsp for use in a country may be found in its National Annex. For the partial factor of γMsp the value 
for γMc is recommended. 
4.4.3.1.3 Partial factor for pull-out failure 
The partial factor for pull-out failure is γMp. 
NOTE The value γMp for use in a Country may be found in its...
```

#### pull-out failure (4.4.3.1.3)

```
However, for seismic strengthening and repair of existing structures the partial factor for concrete γc in 
Equation (11) may be reduced according to the relevant clauses of EN 1998.
NOTE The value of γMsp for use in a country may be found in its National Annex. For the partial factor of γMsp the value 
for γMc is recommended. 
4.4.3.1.3 Partial factor for pull-out failure 
The partial factor for pull-out failure is γMp. 
NOTE The value γMp for use in a Country may be found in its National Annex...
```

#### steel failure (4.4.3.2)

```
NOTE The value γMp for use in a Country may be found in its National Annex. For the partial factor γMp the value for 
γMc is recommended. 
4.4.3.2 Limit state of fatigue 
Partial factors for fatigue loading γMs,fat, γMc,fat, γMsp,fat and γMp,fat shall be considered. 
NOTE The values of the partial factors for fastenings under fatigue loading for use in a country may be found in its 
National Annex. It is recommended to take the partial factor for material as γMs,fat =1,35 (steel failure), 
γMc,f...
```

#### pull-out failure (4.4.3.2)

```
γMc is recommended. 
4.4.3.2 Limit state of fatigue 
Partial factors for fatigue loading γMs,fat, γMc,fat, γMsp,fat and γMp,fat shall be considered. 
NOTE The values of the partial factors for fastenings under fatigue loading for use in a country may be found in its 
National Annex. It is recommended to take the partial factor for material as γMs,fat =1,35 (steel failure), 
γMc,fat = γMsp,fat = γMp,fat (concrete cone failure, splitting failure and pullout failure) according to Equation (4-10). 
...
```

#### concrete edge failure (5.2.1.2)

```
concrete or mortar, a friction force will develop. If a shear force is also acting on a fixture, this friction will 
reduce the shear force on the fastener. However, it will not alter the forces on the concrete. As it is difficult to 
quantify with confidence the effect of friction on the resistance, in this CEN/TS friction forces are neglected in 
the design of the fastenings. 
NOTE In general, this simplified assumption is conservative. However, in case of fastenings shear loaded towards 
the ...
```

#### concrete edge failure (5.2.3.1)

```
assumption that the diameter in the hole of the fixture is not larger than the value df given in Table 1 the 
following cases are distinguished: 
 All fasteners are considered to be effective if the fastening is located far from the edge (Figure 10) and if 
fastener steel or concrete pry-out are the governing failure modes; 
 Only fasteners closest to the edge are assumed to be effective if the fastening is located close to the 
edge and concrete edge failure governs (Figure 11); 
NOTE 1 For g...
```

#### concrete edge failure (5.2.3.1)

```
NOTE 1 For groups without hole clearance this approach might be conservative in the case of concrete break-out 
failure. 
 The fastener is not considered to be effective if the diameter df in the fixture is exceeded or the hole is 
slotted in the direction of the shear force. 
NOTE 2 Slotted holes may be used to prevent fasteners close to an edge from taking up shear loads and to prevent a 
premature concrete edge failure (Figure 12). 
Table 1 — Hole clearance 
1 external diameter 
da
 or dnom
...
```

#### concrete edge failure (5.2.3.2)

```
14. 
Independent of the edge distance the calculation of the design value of the shear forces on each fastener due 
to shear loads and torsional moments acting on the fixture should be carried out to verify steel and pry-out 
failures. 
NOTE Shear loads acting away from the edge do not significantly influence the concrete edge resistance. Therefore 
for the proof of concrete edge failure these components may be neglected in the calculation of the shear forces on the 
fasteners close to the edge....
```

#### pry-out failure (5.2.3.2)

```
) 
a) group with three fasteners in a row 
b) quadruple fastening 
c) quadruple fastening under inclined load 
d) quadruple fastening under torsion moment 
Figure 13 —Determination of shear loads when all fasteners are effective (steel and pry-out failure), 
examples 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
33 
Key 
a) group with two fasteners loaded perpendicular to the edge; 
b) group with two fasteners loaded parallel to the edge; 
c) quadruple fastening loaded by an inclined shear ...
```

#### concrete edge failure (5.2.3.2)

```
Key 
a) group with two fasteners loaded perpendicular to the edge; 
b) group with two fasteners loaded parallel to the edge; 
c) quadruple fastening loaded by an inclined shear load 
Figure 14 — Determination of shear loads when only the fasteners closest to the edge are effective 
(concrete edge failure), examples 
NOTE In case of fastener groups where only the fasteners closest to the edge are effective the component of the 
load acting perpendicular to the edge is taken up by the fasteners cl...
```

#### pull-out failure (6.1.4)

```
shear loads. The corresponding design methods are given in the product-specific Parts of this CEN/TS. 
6.1.4 Both minimum edge distance and spacing should only be specified with positive tolerances. If this 
requirement cannot be met, then the influence of negative tolerances on the design resistance shall be taken 
into account in the design. 
Key 
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure...
```

#### pull-out failure (6.1.4)

```
6.1.4 Both minimum edge distance and spacing should only be specified with positive tolerances. If this 
requirement cannot be met, then the influence of negative tolerances on the design resistance shall be taken 
into account in the design. 
Key 
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure 
d) steel failure 
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 199...
```

#### concrete cone failure (6.1.4)

```
requirement cannot be met, then the influence of negative tolerances on the design resistance shall be taken 
into account in the design. 
Key 
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure 
d) steel failure 
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure ...
```

#### blow-out failure (6.1.4)

```
into account in the design. 
Key 
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure 
d) steel failure 
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS ...
```

#### splitting failure (6.1.4)

```
Key 
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure 
d) steel failure 
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS covers applications under pul...
```

#### steel failure (6.1.4)

```
a1) pull-out failure 
a2) pull-out failure (bond failure) 
b1), b2), b3) concrete cone failures 
b4) concrete blow-out failure 
c) splitting failure 
d) steel failure 
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS covers applications under pulsatin...
```

#### steel failure (6.1.4)

```
Figure 20 — Failure modes under tensile loading 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS covers applications under pulsating tension or shear load (Figure 22) and alternating 
shear load (Figure 23) and combinations thereof. 
Key 
1 1 cycle 
Figure 22 — Definition of pulsating actions 
DD C...
```

#### concrete edge failure (6.1.4)

```
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS covers applications under pulsating tension or shear load (Figure 22) and alternating 
shear load (Figure 23) and combinations thereof. 
Key 
1 1 cycle 
Figure 22 — Definition of pulsating actions 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
39 ...
```

#### pry-out failure (6.1.4)

```
CEN/TS 1992-4-1:2009 (E) 
38 
Key 
a) steel failure 
b) concrete edge failure 
c) concrete pry-out failure 
Figure 21 — Failure modes under shear loading 
7 Verification of fatigue limit state 
7.1 General 
7.1.1 This CEN/TS covers applications under pulsating tension or shear load (Figure 22) and alternating 
shear load (Figure 23) and combinations thereof. 
Key 
1 1 cycle 
Figure 22 — Definition of pulsating actions 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
39 
Key 
1 1 cycle 
Figure ...
```

#### steel failure (7.1.2)

```
fastening of cranes, reciprocating machinery, guide rails of elevators). 
Fatigue load cycling may also arise at restraints of members subjected to temperature variations, e.g. facades. 
NOTE In general, fatigue verification is not required in the following cases: 
 Less than 1 000 load cycles for pulsating tension, shear or combined tension and shear loads with a load 
range ∆ FEk = FEk,max − FEk,min equal to the allowable load for static loading, which is FRd / γQ with 
FRd = design resistanc...
```

#### steel failure (7.3.1)

```
ψFV = 1. 
Table 2 — Required verifications — tension loading 
Single fastener 
Fastener group 
 most loaded fastener fastener group 
Steel failure 
Ms N fat
Rk s F fat Ek , ,
, , γ
N
γ N
∆ ⋅∆ ≤
Ms N fat
h FN Rk s F fat Ek , ,
, , γ
Ψ N
γ N ⋅∆ ⋅∆ ≤
Pull-out failure 
Mpfat
Rk p...
```

#### pull-out failure (7.3.1)

```
Ms N fat
h FN Rk s F fat Ek , ,
, , γ
Ψ N
γ N ⋅∆ ⋅∆ ≤
Pull-out failure 
Mpfat
Rk p
F fat Ek ,
, , γ
N
γ N
∆ ⋅∆ ≤
Mpfat
h FN Rk p
F fat Ek ,
,
, γ
Ψ N
γ N ⋅∆ ⋅∆ ≤ ...
```

#### splitting failure (Unknown)

```
, , γ
N
γ N
∆ ⋅∆ ≤
Concrete 
splitting failure Mcfat
Rk sp
F fat Ek ,
, , γ
N
γ N
∆ ⋅∆ ≤
Mcfat
g Rk sp
F fat Ek ,
, , γ
N
γ N
∆ ⋅∆ ≤
Concrete ...
```

#### blow-out failure (Unknown)

```
, , γ
N
γ N
∆ ⋅∆ ≤
Concrete 
blow-out failure Mcfat
Rk cb
F fat Ek ,
, , γ
N
γ N
∆ ⋅∆ ≤
Mcfat
g Rk cb
F fat Ek ,
, , γ
N
γ N
∆ ⋅∆ ≤
with ...
```

#### steel failure (Unknown)

```
CEN/TS 1992-4-1:2009 (E) 
41 
Table 3 — Required verifications — shear loading 
 Single fastener Fastener Group 
 most loaded fastener fastener group 
Steel failure 
without lever arm MsV fat
Rk s F fat Ek , ,
, , γ
V
γ V
∆ ⋅∆ ≤
MsV fat
h FV Rk s F fat Ek , ,
, , γ
Ψ V
γ V ⋅∆ ⋅∆ ≤
Steel failure 
with lever arm MsV fat
Rk s F fat Ek , ,...
```

#### steel failure (Unknown)

```
MsV fat
h FV Rk s F fat Ek , ,
, , γ
Ψ V
γ V ⋅∆ ⋅∆ ≤
Steel failure 
with lever arm MsV fat
Rk s F fat Ek , ,
, , γ
V
γ V
∆ ⋅∆ ≤
MsV fat
h FV Rk s F fat Ek , ,
, , γ
Ψ V
γ V ⋅∆ ⋅∆ ≤
Concrete 
pry-out failure Mc fat
Rk cp...
```

#### pry-out failure (Unknown)

```
h FV Rk s F fat Ek , ,
, , γ
Ψ V
γ V ⋅∆ ⋅∆ ≤
Concrete 
pry-out failure Mc fat
Rk cp
F fat Ek ,
, , γ
V
γ V
∆ ⋅∆ ≤
Mc fat
g Rk cp
F fat Ek ,
, , γ
V
γ V
∆ ⋅∆ ≤
Concrete ...
```

#### concrete edge failure (Unknown)

```
γF,fat , γMc,fat according to 4.4 
ψFV ≤ 1 for fastener groups, taken from a European Technical Specification 
γ Ms,V, fat = γ Ms,V according to 4.4.3.2 
∆VEk = VEk,max - VEk,min, twice the amplitude of the fatigue shear action, see Figure 23 
∆VRk,s = fatigue resistance, shear, steel, see European Technical Specification 
∆VRk,c = fatigue resistance, shear, concrete edge failure, 
 = 0,6 VRk,c, (VRk,c see product relevant Part of the series CEN/TS 1992-4) 
∆VRk,cp = fatigue resistance, shear, c...
```

#### pry-out failure (Unknown)

```
γ Ms,V, fat = γ Ms,V according to 4.4.3.2 
∆VEk = VEk,max - VEk,min, twice the amplitude of the fatigue shear action, see Figure 23 
∆VRk,s = fatigue resistance, shear, steel, see European Technical Specification 
∆VRk,c = fatigue resistance, shear, concrete edge failure, 
 = 0,6 VRk,c, (VRk,c see product relevant Part of the series CEN/TS 1992-4) 
∆VRk,cp = fatigue resistance, shear, concrete pry-out failure, 
 = 0,6 VRk,cp, (VRk,cp see product relevant Part of the series CEN/TS 1992-4) 
For co...
```

#### steel failure (Unknown)

```
Ψ V /γ
γ V
β , , (16) 
(β , ) + (β , ) ≤ 1 α α N fat V fat (17) 
with 
ψFN, ψFV = required in the case of steel failure in tension and shear or pull-out failure in tension, taken 
 from a European Technical Specification 
α = taken from a European Technical Specification 
∆NRk, ∆VRk = minimum values of resistance of the governing failure mode 
In Equations (15) to (17) the largest value of βN,fat and βV,fat for the different failure modes shall be taken. 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:...
```

#### splitting failure (8.4.2)

```
d,eq eq γ
α
R
R = ⋅ (18) 
with 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
Rk,eq characteristic seismic resistance for a given failure mode, see relevant European Technical 
Specification 
8.4.3 When the fastening design includes seismic actions one of the following conditions shall be satisfied: 
(1) The anchorage is designed for the mi...
```

#### concrete edge failure (8.4.2)

```
α
R
R = ⋅ (18) 
with 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
Rk,eq characteristic seismic resistance for a given failure mode, see relevant European Technical 
Specification 
8.4.3 When the fastening design includes seismic actions one of the following conditions shall be satisfied: 
(1) The anchorage is designed for the minimum of t...
```

#### steel failure (8.4.2)

```
R
R = ⋅ (18) 
with 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
Rk,eq characteristic seismic resistance for a given failure mode, see relevant European Technical 
Specification 
8.4.3 When the fastening design includes seismic actions one of the following conditions shall be satisfied: 
(1) The anchorage is designed for the minimum of the...
```

#### steel failure (8.4.3)

```
Key 
a) yielding in attached element; 
b) yielding in baseplate; 
c) capacity of attached element 
Figure 24 — Seismic design by protection of the fastening 
(2) The fastener is designed for ductile steel failure (see Figure 25). To ensure ductile steel failure 
Equation (19) shall be satisfied: 
inst
k,conc,eq
k,s,eq 0,6
γ
R
R ≤ ⋅ (19) 
with 
Rk,s,eq characteristic seismic resistance for steel failure 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
44 
Rk,conc,eq characteristic seismic resis...
```

#### steel failure (8.4.3)

```
k,s,eq 0,6
γ
R
R ≤ ⋅ (19) 
with 
Rk,s,eq characteristic seismic resistance for steel failure 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
44 
Rk,conc,eq characteristic seismic resistance for all non-steel failure modes such as concrete cone, 
splitting or pull-out under tension loading or pry-out or concrete edge failure under shear 
loading 
inst γ partial factor for installation safety according to relevant European Technical Specification 
Figure 25 — Seismic design by ductile fastener ...
```

#### steel failure (8.4.3)

```
with 
Rk,s,eq characteristic seismic resistance for steel failure 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
44 
Rk,conc,eq characteristic seismic resistance for all non-steel failure modes such as concrete cone, 
splitting or pull-out under tension loading or pry-out or concrete edge failure under shear 
loading 
inst γ partial factor for installation safety according to relevant European Technical Specification 
Figure 25 — Seismic design by ductile fastener yield 
Simultaneously condi...
```

#### concrete edge failure (8.4.3)

```
Rk,s,eq characteristic seismic resistance for steel failure 
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
44 
Rk,conc,eq characteristic seismic resistance for all non-steel failure modes such as concrete cone, 
splitting or pull-out under tension loading or pry-out or concrete edge failure under shear 
loading 
inst γ partial factor for installation safety according to relevant European Technical Specification 
Figure 25 — Seismic design by ductile fastener yield 
Simultaneously conditions ...
```

#### steel failure (8.4.3)

```
splitting or pull-out under tension loading or pry-out or concrete edge failure under shear 
loading 
inst γ partial factor for installation safety according to relevant European Technical Specification 
Figure 25 — Seismic design by ductile fastener yield 
Simultaneously conditions 3), 4) and 5) in B.1.1.2 shall be observed. 
NOTE Ductile failure modes other than ductile steel failure may be allowed. However, ductility equivalent to that 
which occurs during ductile steel failure shall be shown...
```

#### steel failure (8.4.3)

```
loading 
inst γ partial factor for installation safety according to relevant European Technical Specification 
Figure 25 — Seismic design by ductile fastener yield 
Simultaneously conditions 3), 4) and 5) in B.1.1.2 shall be observed. 
NOTE Ductile failure modes other than ductile steel failure may be allowed. However, ductility equivalent to that 
which occurs during ductile steel failure shall be shown in the relevant European Technical Specification. 
(3) For non-structural elements, brittle ...
```

#### splitting failure (8.4.3)

```
Non-structural elements: 
M
k,eq 2,5 d eq γ
α
R ⋅ E ≤ ⋅ (20) 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
8.4.4 Minimum edge distance and minimum spacing between fasteners shall be determined as for 
persistent and transient design situations unless different values for seismic design situations are provided in 
the relevant European Tech...
```

#### concrete edge failure (8.4.3)

```
M
k,eq 2,5 d eq γ
α
R ⋅ E ≤ ⋅ (20) 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
8.4.4 Minimum edge distance and minimum spacing between fasteners shall be determined as for 
persistent and transient design situations unless different values for seismic design situations are provided in 
the relevant European Technical Specification. 
8.4....
```

#### steel failure (8.4.3)

```
k,eq 2,5 d eq γ
α
R ⋅ E ≤ ⋅ (20) 
α eq = 0,75 for concrete related failures: concrete cone, pull-out, blow-out and splitting failure under 
tension loading; pry-out and concrete edge failure under shear loading 
 = 1,0 for steel failure 
8.4.4 Minimum edge distance and minimum spacing between fasteners shall be determined as for 
persistent and transient design situations unless different values for seismic design situations are provided in 
the relevant European Technical Specification. 
8.4.5 ...
```

#### steel failure (Unknown)

```
Plastic design approach, fastenings with headed fasteners and post￾installed fasteners
B.1 Field of application 
B.1.1 In a plastic analysis it is assumed that significant redistribution of fastening tension and shear forces 
will occur in a group. Therefore, this analysis is acceptable only when the failure is governed by ductile steel 
failure of the fastenings under tension, shear and combined tension and shear loads. 
B.1.2 To ensure a ductile steel failure, the following conditions shall be...
```

#### steel failure (Unknown)

```
Key 
a prying force 
Figure B.2 — Example of a fastening with a flexible fixture loaded by a bending moment and a tension 
force 
2) The design resistance of a fastener as governed by concrete failure should exceed the design resistance 
as governed by steel failure. Resistance models given in Clause B.3 will satisfy this requirement. 
3) The nominal steel strength of the fasteners should not exceed MPa f uk = 800 , the ratio nominal steel 
yield strength to nominal ultimate strength shall not e...
```

#### steel failure (Unknown)

```
B.3 Design of fastenings 
In general, the complete fastening is checked according to Equation (4). Therefore the required verifications 
are written for the group. 
B.3.1 Partial factors 
In general partial factors used for actions and resistances in the elastic design are also applicable for design 
based on plastic analysis, except for steel failure. The partial factor for steel γMs,pl is applied to the yield 
strength fyk. 
NOTE The value of γMs,pl for use in a Country may be found in its Nat...
```

#### steel failure (Unknown)

```
DD CEN/TS 1992-4-1:2009
CEN/TS 1992-4-1:2009 (E) 
53 
Table B.1 — Required verifications for tension loading (plastic design) 
 Fastener group 
Steel failure Ms pl
g
Rk s
g
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of...
```

#### pull-out failure (Unknown)

```
Steel failure Ms pl
g
Rk s
g
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out fai...
```

#### concrete cone failure (Unknown)

```
g
Rk s
g
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characteri...
```

#### splitting failure (Unknown)

```
Rk s
g
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characterist...
```

#### steel failure (Unknown)

```
g
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characteristic re...
```

#### steel failure (Unknown)

```
Ed , , N ≤ N / γ
Pull-out failure Equation (B.6) 
Concrete cone failure Equation (B.7) 
Splitting failure See B.3.2.1.4 
B.3.2.1.1 Steel failure 
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characteristic resi...
```

#### pull-out failure (Unknown)

```
The characteristic resistance NRk,s of one fastener in the case of steel failure is given by Equation (B.5) 
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characteristic resistance NRk,p of one fastener in the case of pull-out failure is given in the relevant 
European Technical Specification. The pull-out resistance o...
```

#### pull-out failure (Unknown)

```
Rk s s yk N A f , = ⋅ (B.5) 
The characteristic resistance of a group of tensioned fasteners g
Rk,s N may be taken as the sum of 
characteristic resistances of the fasteners loaded in tension. 
B.3.2.1.2 Pull-out failure 
The characteristic resistance NRk,p of one fastener in the case of pull-out failure is given in the relevant 
European Technical Specification. The pull-out resistance of all tensioned fasteners shall meet Equation (B.6). 
yk
uk
Ms pl
Rk s
Mp
Rk p
f
f
γ
N
γ
N
,...
```

#### concrete cone failure (Unknown)

```
N
γ
N
,
, , ≥ 1,25 ⋅ ⋅ (B.6) 
B.3.2.1.3 Concrete cone failure 
Clause 6 of the product-specific parts 2, 3, 4 and 5 of the series CEN/TS 1992-4 applies without modification. 
The resistance in case of concrete break-out failure of all tensioned fasteners shall meet Equation (B.7). 
yk
uk
Ms,pl
g
Rk,s
Mc
Rk,c
f
f
γ
N
γ...
```

#### splitting failure (Unknown)

```
γ
N
γ
N
≥ 1,25 ⋅ ⋅ (B.7) 
B.3.2.1.4 Splitting failure 
No proof of splitting failure is required if condition a) and at least one of the conditions b) or c) is fulfilled: 
a) Splitting failure is avoided by complying with Equation (B.7), where NRk,c is replaced by NRk,sp according to 
Equation (4) of Parts 2 to 5 of this TS. 
b) The edge distance in all directions is c > 1,0 ccr,sp for single fasteners and c > 1,2 ccr,sp for fastener groups 
and the member depth is h > hmin in both cases. 
c) Wi...
```

#### splitting failure (Unknown)

```
N
γ
N
≥ 1,25 ⋅ ⋅ (B.7) 
B.3.2.1.4 Splitting failure 
No proof of splitting failure is required if condition a) and at least one of the conditions b) or c) is fulfilled: 
a) Splitting failure is avoided by complying with Equation (B.7), where NRk,c is replaced by NRk,sp according to 
Equation (4) of Parts 2 to 5 of this TS. 
b) The edge distance in all directions is c > 1,0 ccr,sp for single fasteners and c > 1,2 ccr,sp for fastener groups 
and the member depth is h > hmin in both cases. 
c) With...
```

#### splitting failure (Unknown)

```
γ
N
≥ 1,25 ⋅ ⋅ (B.7) 
B.3.2.1.4 Splitting failure 
No proof of splitting failure is required if condition a) and at least one of the conditions b) or c) is fulfilled: 
a) Splitting failure is avoided by complying with Equation (B.7), where NRk,c is replaced by NRk,sp according to 
Equation (4) of Parts 2 to 5 of this TS. 
b) The edge distance in all directions is c > 1,0 ccr,sp for single fasteners and c > 1,2 ccr,sp for fastener groups 
and the member depth is h > hmin in both cases. 
c) With f...
```

#### concrete cone failure (Unknown)

```
No proof of splitting failure is required if condition a) and at least one of the conditions b) or c) is fulfilled: 
a) Splitting failure is avoided by complying with Equation (B.7), where NRk,c is replaced by NRk,sp according to 
Equation (4) of Parts 2 to 5 of this TS. 
b) The edge distance in all directions is c > 1,0 ccr,sp for single fasteners and c > 1,2 ccr,sp for fastener groups 
and the member depth is h > hmin in both cases. 
c) With fasteners for use in cracked concrete, the character...
```

#### steel failure (Unknown)

```
B.3.3 Resistance to shear load 
B.3.3.1 Required verifications 
The required verifications are summarised in Table B.2. 
Table B.2 —Required verifications for shear loading (plastic design) 
 Fastener group 
Steel failure, shear load without lever arm Ms pl
g
Rk s
g
Ed , , V ≤ V / γ
Concrete pry-out failure Equation (B.9) 
Concrete edge failure Equation (B.10) 
B.3.3.1.1 Steel failure 
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
R...
```

#### pry-out failure (Unknown)

```
Steel failure, shear load without lever arm Ms pl
g
Rk s
g
Ed , , V ≤ V / γ
Concrete pry-out failure Equation (B.9) 
Concrete edge failure Equation (B.10) 
B.3.3.1.1 Steel failure 
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
Rk s s yk V A f , = 0,5 ⋅ ⋅ (B.8) 
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3....
```

#### concrete edge failure (Unknown)

```
g
Rk s
g
Ed , , V ≤ V / γ
Concrete pry-out failure Equation (B.9) 
Concrete edge failure Equation (B.10) 
B.3.3.1.1 Steel failure 
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
Rk s s yk V A f , = 0,5 ⋅ ⋅ (B.8) 
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3.3.2 Concrete pry-out failure 
Section 6 of the pro...
```

#### steel failure (Unknown)

```
Rk s
g
Ed , , V ≤ V / γ
Concrete pry-out failure Equation (B.9) 
Concrete edge failure Equation (B.10) 
B.3.3.1.1 Steel failure 
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
Rk s s yk V A f , = 0,5 ⋅ ⋅ (B.8) 
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3.3.2 Concrete pry-out failure 
Section 6 of the produ...
```

#### steel failure (Unknown)

```
g
Ed , , V ≤ V / γ
Concrete pry-out failure Equation (B.9) 
Concrete edge failure Equation (B.10) 
B.3.3.1.1 Steel failure 
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
Rk s s yk V A f , = 0,5 ⋅ ⋅ (B.8) 
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3.3.2 Concrete pry-out failure 
Section 6 of the product-sp...
```

#### pry-out failure (Unknown)

```
The characteristic resistance VRk,s of one fastener in the case of steel failure is given by Equation (B.8). 
Rk s s yk V A f , = 0,5 ⋅ ⋅ (B.8) 
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3.3.2 Concrete pry-out failure 
Section 6 of the product-specific parts 2, 3, 4 and 5 of the series CEN/TS 1992-4 applies without modification. 
To satisfy Equation (B.1) the resistan...
```

#### pry-out failure (Unknown)

```
The characteristic resistance of a group of sheared fasteners g
Rk,s V may be taken as equal to the sum of 
characteristic resistances of the fasteners loaded in shear. 
B.3.3.2 Concrete pry-out failure 
Section 6 of the product-specific parts 2, 3, 4 and 5 of the series CEN/TS 1992-4 applies without modification. 
To satisfy Equation (B.1) the resistance in case of concrete pry-out failure of all sheared fasteners shall meet 
Equation (B.9). 
yk
uk
Ms pl
g
Rk s
Mc
Rk cp
f
f
γ
V
γ
V...
```

#### concrete edge failure (Unknown)

```
γ
V
,
, , ≥ 1,25 (B.9) ⋅ ⋅
NOTE Equation (B.9) is satisfied if all fasteners are anchored with an anchorage depth so that Equation (B.7) is met. 
B.3.3.3 Concrete edge failure 
Section 6 of the product specific parts 2, 4, and 5 of the series CEN/TS 1992-4 applies without modification. 
The concrete edge resistance of all sheared fasteners shall meet Equation (B.10). 
yk
uk
Ms pl
g
Rk s
Mc
Rk c
f
f
γ
V
γ...
```

#### steel failure (Unknown)

```
D.3.1 General 
In the absence of test data for a specific fastener the following characteristic resistances in the ultimate limit 
state under fire exposure may be taken instead of the values given in the product-specific Parts of this 
CEN/TS, which are valid for ambient temperature. These values are conservative. 
D.3.2 Tension load 
D.3.2.1 Steel failure 
The characteristic resistance of a fastener in the case of steel failure under fire exposure (characteristic 
tension strength σRk,s,fi) gi...
```

#### steel failure (Unknown)

```
In the absence of test data for a specific fastener the following characteristic resistances in the ultimate limit 
state under fire exposure may be taken instead of the values given in the product-specific Parts of this 
CEN/TS, which are valid for ambient temperature. These values are conservative. 
D.3.2 Tension load 
D.3.2.1 Steel failure 
The characteristic resistance of a fastener in the case of steel failure under fire exposure (characteristic 
tension strength σRk,s,fi) given in the foll...
```

#### concrete cone failure (Unknown)

```
from Equation (D.1) and (D.2). 
NRk,p,fi(90) = 0,25 ⋅ NRk,p for fire exposure up to 90 minutes (D.1) 
NRk,p,fi(120) = 0,20 ⋅ NRk,p for fire exposure between 90 and 120 minutes (D.2) 
NRk,p = characteristic resistance given in the relevant European Technical Specification in cracked 
 concrete C20/25 under ambient temperature 
D.3.2.3 Concrete cone failure 
The characteristic resistance of a single fastener 0
Rk,c,fi N not influenced by adjacent fasteners or edges of the 
concrete member installe...
```

#### splitting failure (Unknown)

```
200
h ⋅ ≤ ef for fire exposure between 90 and 120 minutes (D.4) 
hef = effective embedment depth in mm 
NRk,c = characteristic resistance of a single fastener in cracked concrete C20/25 under ambient 
 temperature according to the relevant product specific part of this CEN/TS 
D.3.2.4 Splitting failure 
The assessment of splitting failure due to loading under fire exposure is not required because the splitting 
forces are assumed to be taken up by the reinforcement. 
D.3.3 Shear load 
D.3.3.1 St...
```

#### splitting failure (Unknown)

```
h ⋅ ≤ ef for fire exposure between 90 and 120 minutes (D.4) 
hef = effective embedment depth in mm 
NRk,c = characteristic resistance of a single fastener in cracked concrete C20/25 under ambient 
 temperature according to the relevant product specific part of this CEN/TS 
D.3.2.4 Splitting failure 
The assessment of splitting failure due to loading under fire exposure is not required because the splitting 
forces are assumed to be taken up by the reinforcement. 
D.3.3 Shear load 
D.3.3.1 Steel ...
```

#### steel failure (Unknown)

```
 temperature according to the relevant product specific part of this CEN/TS 
D.3.2.4 Splitting failure 
The assessment of splitting failure due to loading under fire exposure is not required because the splitting 
forces are assumed to be taken up by the reinforcement. 
D.3.3 Shear load 
D.3.3.1 Steel failure 
D.3.3.1.1 Shear load without lever arm 
For the characteristic shear resistance τRk,s,fi of a fastener in the case of steel failure under fire exposure 
(characteristic strength) the value...
```

#### steel failure (Unknown)

```
The assessment of splitting failure due to loading under fire exposure is not required because the splitting 
forces are assumed to be taken up by the reinforcement. 
D.3.3 Shear load 
D.3.3.1 Steel failure 
D.3.3.1.1 Shear load without lever arm 
For the characteristic shear resistance τRk,s,fi of a fastener in the case of steel failure under fire exposure 
(characteristic strength) the values given in Tables D.1 and D.2 apply. They are also valid for the unprotected 
steel part of the fastener...
```

#### pry-out failure (Unknown)

```
0
Rk s fi , , , , M = 1,2 ⋅W ⋅σ (D.5) 
with 
σRk,s,fi given in Tables D.1 and D.2 
NOTE This approach is based on assumptions. 
D.3.3.2 Concrete pry-out failure 
The characteristic resistance in case of fasteners installed in concrete classes C20/25 to C50/60 may be 
obtained using Equations (D.6) and (D.7). 
VRk,cp,fi(90) = k ⋅ NRk,c,fi(90) for fire exposure up to 90 minutes (D.6) 
VRk,cp,fi(120) = k ⋅ NRk,c,fi(120) for fire exposure between 90 and 120 minutes (D.7) 
DD CEN/TS 1992-4-1:2009
CEN...
```

#### concrete edge failure (Unknown)

```
CEN/TS 1992-4-1:2009 (E) 
60 
k = factor to be taken from the relevant European Technical Specification 
(ambient temperature) 
NRk,c,fi(90), NRk,c,fi(120) = calculated according to D.3.2.3. 
D.3.3.3 Concrete edge failure 
The characteristic resistance of a single fastener installed in concrete classes C20/25 to C50/60 may be 
obtained using Equation (D.8) and (D.9). The influence of the different effects of geometry, thickness, load 
direction, eccentricity and so on is taken from the relevant ...
```


### Formulas (Sample)


### Material and Safety Factors (Sample)

- **partial factor** (Section 4.4)
- **Partial factor** (Section 4.4.2)
- **safety factor** (Section Unknown)
- **γ Ms** (Section 4.4.3.1.1)
- **γMs** (Section 4.4.3.1.1)
- **γMc** (Section 4.4.3.1.2)
- **γ c** (Section 4.4.3.1.2)
- **γc** (Section 4.4.3.1.2)
- **γ inst** (Section 4.4.3.1.2)
- **αM** (Section 5.2.3.4)
- **ψFN** (Section 7.3.1)
- **ψFV** (Section 7.3.1)
- **Ψ N** (Section 7.3.1)
- **Ψ V** (Section Unknown)
- **α N** (Section Unknown)
- **βN** (Section Unknown)
- **βV** (Section Unknown)
- **α eq** (Section 8.4.2)
- **α is** (Section Unknown)
- **αv** (Section Unknown)


---

## EC2 Part 4-2: Headed Fasteners

### Table of Contents


### Failure Modes

#### steel failure (6.2.3)

```
6 Verification of ultimate limit state by elastic analysis .......................................................................6
6.1 General ....................................................................................................................................................6
6.2 Tension load ...........................................................................................................................................6
6.2.1 Required verifications ......................
```

#### pull-out failure (6.2.4)

```
6.1 General ....................................................................................................................................................6
6.2 Tension load ...........................................................................................................................................6
6.2.1 Required verifications ...........................................................................................................................6
6.2.2 Detailing of supplem...
```

#### concrete cone failure (6.2.5)

```
6.2 Tension load ...........................................................................................................................................6
6.2.1 Required verifications ...........................................................................................................................6
6.2.2 Detailing of supplementary reinforcement .........................................................................................7
6.2.3 Steel failure of fastener .....................
```

#### splitting failure (6.2.6)

```
6.2.1 Required verifications ...........................................................................................................................6
6.2.2 Detailing of supplementary reinforcement .........................................................................................7
6.2.3 Steel failure of fastener .........................................................................................................................8
6.2.4 Pull-out failure of fastener .....................
```

#### blow-out failure (6.2.7)

```
6.2.2 Detailing of supplementary reinforcement .........................................................................................7
6.2.3 Steel failure of fastener .........................................................................................................................8
6.2.4 Pull-out failure of fastener ....................................................................................................................8
6.2.5 Concrete cone failure .............................
```

#### steel failure (6.2.8)

```
6.2.3 Steel failure of fastener .........................................................................................................................8
6.2.4 Pull-out failure of fastener ....................................................................................................................8
6.2.5 Concrete cone failure ............................................................................................................................8
6.2.6 Splitting failure .................
```

#### steel failure (6.3.3)

```
6.2.8 Steel failure of the supplementary reinforcement ........................................................................... 18
6.2.9 Anchorage failure of the supplementary reinforcement in the concrete cone ............................ 18
6.3 Shear load ............................................................................................................................................ 19
6.3.1 Required verifications .....................................................................
```

#### pry-out failure (6.3.4)

```
6.2.9 Anchorage failure of the supplementary reinforcement in the concrete cone ............................ 18
6.3 Shear load ............................................................................................................................................ 19
6.3.1 Required verifications ........................................................................................................................ 19
6.3.2 Detailing of supplementary reinforcement ................................
```

#### concrete edge failure (6.3.5)

```
6.3 Shear load ............................................................................................................................................ 19
6.3.1 Required verifications ........................................................................................................................ 19
6.3.2 Detailing of supplementary reinforcement ...................................................................................... 19
6.3.3 Steel failure of fastener ......................
```

#### concrete cone failure (6.2.2)

```
apply. 
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E) 
7 
6.2.2 Detailing of supplementary reinforcement 
When the design relies on supplementary reinforcement, concrete cone failure according to Equation (4) 
needs not to be verified but the supplementary reinforcement should be designed to resist the total load. 
The supplementary reinforcement to take up tension loads should comply with the following requirements (see 
also Figure 2): 
a) In general, the same diameter of the reinforcement ...
```

#### steel failure (6.2.2)

```
EN 1992-1-1. 
Table 1 — Required verifications for headed fasteners loaded in tension 
Single fastener 
Fastener group
most loaded fastener fastener group 
1 Steel failure 
of fastener Ms
Rk, s
Ed Rd, s γ
N
N ≤ N =
Ms
Rk, s
Rd, s h
Ed γ
N
N ≤ N =
2 Pull-out failure 
of fastener Mp
Rk, p...
```

#### pull-out failure (6.2.2)

```
Rk, s
Rd, s h
Ed γ
N
N ≤ N =
2 Pull-out failure 
of fastener Mp
Rk, p
Ed Rd, p γ
N
N ≤ N =
Mp
Rk, p
Rd, p
h
Ed γ
N
N ≤ N =
3 Concrete 
cone failure Mc...
```

#### splitting failure (Unknown)

```
Rk, c
Rd, c g
Ed γ
N
N ≤ N =
4 Splitting failure 
Msp
Rk, sp
Ed Rd, sp γ
N
N ≤ N =
Msp
Rk, sp
Rd, sp
g
Ed γ
N
N ≤ N =
5 Blow-out failurea
Mc...
```

#### blow-out failure (Unknown)

```
Rd, sp
g
Ed γ
N
N ≤ N =
5 Blow-out failurea
Mc
Rk, cb
Ed Rd, cb
γ
N
N ≤ N =
Ms
Rk, cb
Rd, cb
g
Ed γ
N
N ≤ N =
6 Steel failure of ...
```

#### steel failure (Unknown)

```
Rd, cb
g
Ed γ
N
N ≤ N =
6 Steel failure of 
reinforcement Ms, re
Rk, re
Ed,re Rd, re γ
N
N ≤ N =
Ms, re
Rk, re
Rd, re h
Ed, re γ
N
N ≤ N =
7 Anchorage failure 
of reinforcement 
NEd,re ≤ NRd, a Rd, a h...
```

#### steel failure (6.2.3)

```
without welded transverse bars). 
d) The supplementary reinforcement should be anchored outside the assumed failure cone with an 
anchorage length lbd according to EN 1992-1-1. 
e) A surface reinforcement should be provided as shown in Figure 2 designed to resist the forces arising 
from the assumed strut and tie model, taking into account the splitting forces according to 6.2.6. 
6.2.3 Steel failure of fastener 
The characteristic resistance of a fastener in case of steel failure NRk,s is given...
```

#### steel failure (6.2.3)

```
d) The supplementary reinforcement should be anchored outside the assumed failure cone with an 
anchorage length lbd according to EN 1992-1-1. 
e) A surface reinforcement should be provided as shown in Figure 2 designed to resist the forces arising 
from the assumed strut and tie model, taking into account the splitting forces according to 6.2.6. 
6.2.3 Steel failure of fastener 
The characteristic resistance of a fastener in case of steel failure NRk,s is given in the relevant European 
Technic...
```

#### pull-out failure (6.2.4)

```
e) A surface reinforcement should be provided as shown in Figure 2 designed to resist the forces arising 
from the assumed strut and tie model, taking into account the splitting forces according to 6.2.6. 
6.2.3 Steel failure of fastener 
The characteristic resistance of a fastener in case of steel failure NRk,s is given in the relevant European 
Technical Specification. The strength calculation is based on fuk. 
6.2.4 Pull-out failure of fastener 
The characteristic resistance in case of pull-o...
```

#### pull-out failure (6.2.4)

```
from the assumed strut and tie model, taking into account the splitting forces according to 6.2.6. 
6.2.3 Steel failure of fastener 
The characteristic resistance of a fastener in case of steel failure NRk,s is given in the relevant European 
Technical Specification. The strength calculation is based on fuk. 
6.2.4 Pull-out failure of fastener 
The characteristic resistance in case of pull-out failure NRk,p is given in the relevant European Technical 
Specification. 
NOTE The characteristic resi...
```

#### concrete cone failure (6.2.5)

```
d − π (3) 
fck,cube, characteristic cube strength of the concrete strength class but noting the limitations 
 given in the relevant European Technical Specification 
ψucr, N = 1,0 for fasteners in cracked concrete 
 = 1,4 for fasteners in non-cracked concrete 
6.2.5 Concrete cone failure 
The characteristic resistance of a fastener, a group of fasteners and the tensioned fasteners of a group of 
fasteners in case of concrete cone failure may be obtained by Equation (4). 
s, N re, N ec, N 0
c, N
...
```

#### concrete cone failure (6.2.5)

```
 given in the relevant European Technical Specification 
ψucr, N = 1,0 for fasteners in cracked concrete 
 = 1,4 for fasteners in non-cracked concrete 
6.2.5 Concrete cone failure 
The characteristic resistance of a fastener, a group of fasteners and the tensioned fasteners of a group of 
fasteners in case of concrete cone failure may be obtained by Equation (4). 
s, N re, N ec, N 0
c, N
c, N
Rk, c Rk, c = ⋅ ⋅ψ ⋅ψ ⋅ψ
A
A
N N o [N] (4) 
The different factors of Equation (4) are given below. 
DD C...
```

#### splitting failure (6.2.6)

```
hef = 200 mm 
'
ef h = 120/1,5 = 80 mm > 210/3 = 70mm 
Figure 6 — Illustration of the calculation of '
ef h for a double fastening influenced by 4 edges 
6.2.6 Splitting failure 
6.2.6.1 Splitting failure due to installation 
Splitting failure during installation e.g. by torquing of fasteners (see CEN/TS 1992-4-1:2009, Figure 3) is 
avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
and requirements for reinforcement as given in the relevant...
```

#### splitting failure (6.2.6.1)

```
'
ef h = 120/1,5 = 80 mm > 210/3 = 70mm 
Figure 6 — Illustration of the calculation of '
ef h for a double fastening influenced by 4 edges 
6.2.6 Splitting failure 
6.2.6.1 Splitting failure due to installation 
Splitting failure during installation e.g. by torquing of fasteners (see CEN/TS 1992-4-1:2009, Figure 3) is 
avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
and requirements for reinforcement as given in the relevant European Tech...
```

#### splitting failure (6.2.6.1)

```
ef h = 120/1,5 = 80 mm > 210/3 = 70mm 
Figure 6 — Illustration of the calculation of '
ef h for a double fastening influenced by 4 edges 
6.2.6 Splitting failure 
6.2.6.1 Splitting failure due to installation 
Splitting failure during installation e.g. by torquing of fasteners (see CEN/TS 1992-4-1:2009, Figure 3) is 
avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
and requirements for reinforcement as given in the relevant European Techni...
```

#### splitting failure (6.2.6.2)

```
Splitting failure during installation e.g. by torquing of fasteners (see CEN/TS 1992-4-1:2009, Figure 3) is 
avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
and requirements for reinforcement as given in the relevant European Technical Specification. 
NOTE Minimum values for edge distance, spacing and member thickness should also be observed for headed 
fasteners not torqued to allow adequate placing and compaction of the concrete. 
6.2.6...
```

#### splitting failure (6.2.6.2)

```
avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
and requirements for reinforcement as given in the relevant European Technical Specification. 
NOTE Minimum values for edge distance, spacing and member thickness should also be observed for headed 
fasteners not torqued to allow adequate placing and compaction of the concrete. 
6.2.6.2 Splitting failure due to loading 
No verification of splitting failure is required if one of the following...
```

#### pull-out failure (6.2.6.2)

```
6.2.6.2 Splitting failure due to loading 
No verification of splitting failure is required if one of the following conditions is fulfilled: 
a) The edge distance in all directions is c > 1,0 ccr,sp for fastenings with one anchor and c > 1,2 ccr,sp for 
fastenings with more than one anchor. 
 The characteristic values ccr,sp and scr,sp are given in the relevant European Technical Specification. 
b) The characteristic resistance for concrete cone failure and pull-out failure is calculated for crac...
```

#### blow-out failure (6.2.7)

```
member), the smallest edge distance c shall be inserted in Equation (18). 
NOTE If in the European Technical Specification ccr,sp for more than one member depth h is given, then the member 
depth valid for the used ccr,sp shall be inserted in Equation (4). 
If the edge distance is smaller than the value ccr,sp then a longitudinal reinforcement should be provided along 
the edge of the member. 
6.2.7 Blow-out failure 
Verification of blow-out failure is not required if the edge distance in all di...
```

#### blow-out failure (6.2.7)

```
NOTE If in the European Technical Specification ccr,sp for more than one member depth h is given, then the member 
depth valid for the used ccr,sp shall be inserted in Equation (4). 
If the edge distance is smaller than the value ccr,sp then a longitudinal reinforcement should be provided along 
the edge of the member. 
6.2.7 Blow-out failure 
Verification of blow-out failure is not required if the edge distance in all directions exceeds c = 0,5 hef. If a 
verification is required, the character...
```

#### blow-out failure (6.2.7)

```
depth valid for the used ccr,sp shall be inserted in Equation (4). 
If the edge distance is smaller than the value ccr,sp then a longitudinal reinforcement should be provided along 
the edge of the member. 
6.2.7 Blow-out failure 
Verification of blow-out failure is not required if the edge distance in all directions exceeds c = 0,5 hef. If a 
verification is required, the characteristic resistance in case of blow-out failure is: 
0 s, Nb g, Nb ec, Nb ucr, N
c, Nb
0 c, Nb
Rk, cb Rk, cb ψ ψ ψ ψ
A...
```

#### steel failure (6.2.8)

```
eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners 
6.2.7.6 Effect of the position of the fastening 
The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete. 
ψucr, N = 1,0 for fastenings in cracked concrete (26) 
 = 1,4 for fastenings in non-cracked concrete (27) 
6.2.8 Steel failure of the supplementary reinforcement 
The characteristic resistance the supplementary reinforcement NRk,,r...
```

#### steel failure (6.3.1.2)

```
6.3.1.2 For fasteners with supplementary reinforcement the verifications of Table 2, lines 1, 2 and 4 to 6 
apply. 
Table 2 — Verification for headed fasteners loaded in shear 
 Single fastener Fastener groups 
 most loaded fastener fastener group 
1 Steel failure of fastener 
without lever arm Ms
Rk, s
Ed Rd, s γ
V
V ≤ V =
Ms
Rk, s
Rd, s h
Ed γ
V
V ≤ V =
2 Steel failure of fastener 
with lever arm 
Ms...
```

#### steel failure (6.3.1.2)

```
Rk, s
Rd, s h
Ed γ
V
V ≤ V =
2 Steel failure of fastener 
with lever arm 
Ms
Rk, s
Ed Rd, s γ
V
V ≤ V =
Ms
Rk, s
Rd, s h
Ed γ
V
V ≤ V =
3 Concrete edge failure 
Mc...
```

#### concrete edge failure (6.3.1.2)

```
Rk, s
Rd, s h
Ed γ
V
V ≤ V =
3 Concrete edge failure 
Mc
Rk, c
Ed Rd, c γ
V
V ≤ V =
Mc
Rk, c
Rd, c g
Ed γ
V
V ≤ V =
4 Concrete pry-out failure 
Mc
Rk, cp...
```

#### pry-out failure (6.3.1.2)

```
Rk, c
Rd, c g
Ed γ
V
V ≤ V =
4 Concrete pry-out failure 
Mc
Rk, cp
Ed Rd, cp γ
V
V ≤ V =
Mc
Rk, cp
Rd, cp
g
Ed γ
V
V ≤ V =
5 Steel failure of 
supplementary ...
```

#### steel failure (Unknown)

```
Rd, cp
g
Ed γ
V
V ≤ V =
5 Steel failure of 
supplementary 
reinforcement Ms, re
Rk, re
Ed, re Rd, re γ
V
V ≤ V =
Ms, re
Rk, re
Rd, re h
Ed, re γ
V
V ≤ V =
6 Anchorage failure of 
supplementary ...
```

#### concrete cone failure (6.3.2)

```
supplementary 
reinforcement 
VEd, re ≤ NRd, a Rd, a h
Ed, re V ≤ N
6.3.2 Detailing of supplementary reinforcement 
When the design relies on supplementary reinforcement, concrete cone failure according to Equation (32) 
needs not to be verified but the supplementary reinforcement should be designed to resist the total load. The 
supplementary reinforcement may be in the form of a surface reinforcement (Figure 9) or in the shape of 
stirrups or loops (Figure 10). 
The supplementary reinforcement...
```

#### concrete breakout (6.3.2)

```
consist of ribbed bars with fyk ≤ 500 N/mm² and a diameter not larger than 16 mm. The mandrel diameter, db, 
should comply with EN 1992-1-1. 
If the shear force is taken up by a surface reinforcement according to Figure 9, the following additional 
requirements should be met: 
a) Only bars with a distance ≤ 0,75c1 from the fastener should be assumed as effective. 
b) The anchorage length l1 (see Figure 9) in the concrete breakout body is at least 
min l1 = 10 ds, straight bars with or without we...
```

#### steel failure (6.3.3)

```
compression struts of 45° may be assumed. 
If the shear forces are taken up by a supplementary reinforcement is detailed according to Figure 10, it should 
enclose and contact the shaft of the fastener and be positioned as closely as possible to the fixture. 
Figure 9 — Surface reinforcement to take up shear forces with simplified strut and tie model to design 
edge reinforcement 
6.3.3 Steel failure of fastener 
6.3.3.1 Shear load without lever arm 
For headed fasteners welded or not welded to ...
```

#### steel failure (6.3.3.1)

```
Figure 9 — Surface reinforcement to take up shear forces with simplified strut and tie model to design 
edge reinforcement 
6.3.3 Steel failure of fastener 
6.3.3.1 Shear load without lever arm 
For headed fasteners welded or not welded to a steel fixture the characteristic resistance of a fastener in case 
of steel failure VRk,s is given in the relevant European Technical Specification. The strength calculations are 
based on uk f . In case of groups with fasteners with a hole clearance df give...
```

#### steel failure (6.3.3.2)

```
based on uk f . In case of groups with fasteners with a hole clearance df given in CEN/TS 1992-4-1:2009, 
Table 1 and made of non-ductile steel, this characteristic shear resistance should be multiplied with the factor 
k2. The factor k2 is given in the relevant European Technical Specification. 
NOTE According to current experience the factor k2 for non-ductile steel is k2 = 0,8. 
6.3.3.2 Shear load with lever arm 
For headed fastener the characteristic resistance in case of steel failure VRk,s...
```

#### steel failure (6.3.3.2)

```
with 
αM , l see CEN/TS 1992-4-1:2009, Section 5.2.3.3 
MRk, s = ) 1 Sd Rd, s 0
Rk, s M ⋅ ( − N /N (31) 
NRd,s = NRk, s/γMs
The characteristic resistance under tension load in case of steel failure NRk,s the partial safety factor γMs and 
the characteristic bending resistance of a single headed fastener 0 MRk, s , are given in the relevant European 
Technical Specification. 
Figure 10 — Illustration of detailing of the supplementary reinforcement in form of loops, examples 
NOTE The reinforcemen...
```

#### pry-out failure (6.3.4)

```
NOTE The reinforcement in form of stirrups or loops should be detailed with a mandrel diameter according to 
EN 1992-1-1. 
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E) 
22 
6.3.4 Concrete pry-out failure 
Fastenings may fail due to a concrete pry-out failure at the side opposite to load direction. The corresponding 
characteristic resistance VRk,cp may be calculated from Equation (32). 
VRk, cp = k3 ⋅ NRk,c [N] (32) 
with 
k3 factor to be taken from the relevant European Technical Specificat...
```

#### pry-out failure (6.3.4)

```
EN 1992-1-1. 
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E) 
22 
6.3.4 Concrete pry-out failure 
Fastenings may fail due to a concrete pry-out failure at the side opposite to load direction. The corresponding 
characteristic resistance VRk,cp may be calculated from Equation (32). 
VRk, cp = k3 ⋅ NRk,c [N] (32) 
with 
k3 factor to be taken from the relevant European Technical Specification, valid for applications 
without supplementary reinforcement. In case of supplementary reinforcement the ...
```

#### pry-out failure (6.3.4)

```
without supplementary reinforcement. In case of supplementary reinforcement the factor k3
should be multiplied with 0,75 
NRk,c according to 6.2.5, determined for a single fastener or all fasteners in a group loaded in shear 
NOTE In cases where a fastener group is loaded by shear loads and/or external torsion moments, the direction of the 
individual shear loads may alter. In the example of Figure 11 the shear loads acting on the individual anchors neutralise 
each other and the shear load acti...
```

#### concrete edge failure (6.3.5)

```
CEN/TS 1992-4-2:2009 (E) 
23 
 
Figure 13 — Group of two fasteners located in a corner, if the most unfavourable fastener shall be 
verified, example for the calculation of the area Ac,N 
6.3.5 Concrete edge failure 
6.3.5.1 General 
The following conditions shall be observed: 
 For single fasteners and groups with not more than 4 fasteners and with an edge distance in all directions 
c > 10 hef or c > 60 d, a check of the characteristic concrete edge failure resistance may be omitted. The 
sma...
```

#### concrete edge failure (6.3.5.1)

```
verified, example for the calculation of the area Ac,N 
6.3.5 Concrete edge failure 
6.3.5.1 General 
The following conditions shall be observed: 
 For single fasteners and groups with not more than 4 fasteners and with an edge distance in all directions 
c > 10 hef or c > 60 d, a check of the characteristic concrete edge failure resistance may be omitted. The 
smaller value is decisive. 
 For fastenings with more than one edge (see Figure 14), the resistances for all edges shall be calculated...
```

#### concrete edge failure (6.3.5.1)

```
c > 10 hef or c > 60 d, a check of the characteristic concrete edge failure resistance may be omitted. The 
smaller value is decisive. 
 For fastenings with more than one edge (see Figure 14), the resistances for all edges shall be calculated. 
The smaller value is decisive. 
 For groups with fasteners arranged perpendicular to the edge and loaded parallel to the edge or by a 
torsion moment the verification for concrete edge failure is valid for s1 ≥ c1 or c1 ≥ 150 mm. 
NOTE In cases of group...
```

#### concrete edge failure (6.3.5.1)

```
 For fastenings with more than one edge (see Figure 14), the resistances for all edges shall be calculated. 
The smaller value is decisive. 
 For groups with fasteners arranged perpendicular to the edge and loaded parallel to the edge or by a 
torsion moment the verification for concrete edge failure is valid for s1 ≥ c1 or c1 ≥ 150 mm. 
NOTE In cases of groups with fasteners arranged perpendicular to the edge and loaded parallel to the edge or by a 
torsion moment where s1 < c1 and c1 < 150 m...
```

#### steel failure (6.3.5.3)

```
 s = 100 mm c1 = 200 mm, h = 120 mm < 1,5 ⋅ 200 mm, 
 c2,1 = 150 mm ≤ 1,5 ⋅ 200 mm, c2,2 = 100 mm < 1,5 ⋅ 200 mm, '
1c = 150/1,5 = 100 mm 
Figure 20 — Illustration of the calculation of the value '
1c , example 
6.3.5.3 Steel failure of supplementary reinforcement 
The characteristic resistance of one fastener in case of steel failure of the supplementary reinforcement may 
be calculated according to Equation (44). 
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44) 
with 
k6 = efficiency factor 
 = 1,0 surface re...
```

#### steel failure (6.3.5.3)

```
 c2,1 = 150 mm ≤ 1,5 ⋅ 200 mm, c2,2 = 100 mm < 1,5 ⋅ 200 mm, '
1c = 150/1,5 = 100 mm 
Figure 20 — Illustration of the calculation of the value '
1c , example 
6.3.5.3 Steel failure of supplementary reinforcement 
The characteristic resistance of one fastener in case of steel failure of the supplementary reinforcement may 
be calculated according to Equation (44). 
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44) 
with 
k6 = efficiency factor 
 = 1,0 surface reinforcement according to Figure 9 
 = 0,5 supplementa...
```

#### concrete breakout (6.3.5.4)

```
CEN/TS 1992-4-2:2009 (E) 
30 
fyk = nominal yield strength of the supplementary reinforcement ≤ 500 N/mm² 
NOTE The factor k6 = 0,5 for supplementary reinforcement according to Figure 10 takes account of unavoidable 
tolerances in workmanship. 
6.3.5.4 Anchorage failure of supplementary reinforcement in the concrete breakout body 
For applications according to Figure 10 no proof of the anchorage capacity is necessary. 
For applications according to Figure 9 the design resistance VRd,,a of the su...
```

#### steel failure (6.4.1.1)

```
α = influencing factor, according to EN 1992-1-1 
 = 0,7 for hooked bars 
n = number of legs of the supplementary reinforcement effective for one fastener 
6.4 Combined tension and shear load 
6.4.1 Fastenings without supplementary reinforcement 
6.4.1.1 Steel failure decisive for tension and shear load 
For combined tension and shear loads the following equations should be satisfied: 
1 2
V
2
Nβ + β ≤ (46) 
where 
βN = NEd/NRd ≤ 1 and βV = VEd/VRd ≤ 1 
6.4.1.2 Other modes of failure decisive 
F...
```


### Formulas (Sample)

#### Formula 0.5 - Section 6.3.4

```
c,N,2 c,N,1
c,N,1 cr,N 1 cr,N 2
( ; )
(0.5) / 2) (0.5 / 2)
s s s
A A
A A
A A
A s s s s
≤
=
=
=...
```

#### Formula 0.5 - Section 6.3.5.2

```
c,N,1 cr,N 1 cr,N 2
( ; )
( / 2 ) (0.5 )
(0.5) / 2) (0.5 )
c c c
s s
A s c s c
A s s s c
≤
≤
= + ⋅ ⋅ +
= ⋅ + ⋅ ⋅ +
DD CEN/TS 1992-4-2:2009...
```


---

## Implementation Plan

### Required Python Classes/Functions

Based on the extracted information, the following structure is recommended:


1. **Base Classes**
   - `Fastener`: Base fastener class with geometry and material properties
   - `FastenerGroup`: Group of fasteners with layout geometry
   - `ConcreteProperties`: Concrete strength, thickness, edge distances
   - `SupplementaryReinforcement`: Reinforcement design parameters

2. **Failure Mode Calculators** (Each as separate class/function)
   - `SteelFailure`: Calculate steel tensile/shear capacity
   - `ConcreteBreakoutFailure`: Concrete cone failure (tension)
   - `ConcreteEdgeFailure`: Edge breakout failure
   - `ConcretePryoutFailure`: Pry-out failure (shear)
   - `ConcreteBlowoutFailure`: Blowout failure (near edge)
   - `PulloutFailure`: Pullout capacity
   - `SplittingFailure`: Concrete splitting
   - `LocalConcreteFailure`: Local bearing failure

3. **Factor Handlers**
   - `MaterialFactors`: γMs, γMc, γinst
   - `GeometryFactors`: α, β, ψ factors for spacing/edge effects
   - `SafetyFactors`: Partial safety factors

4. **Main Calculation Engine**
   - `FastenerDesign`: Main class to perform combined checks
   - Select which failure modes to check
   - Apply appropriate factors
   - Return governing failure mode and capacity

5. **Utilities**
   - `validate_geometry()`: Check minimum spacing, edge distances
   - `calculate_interaction()`: N-V interaction for combined loading
   - `apply_grout_correction()`: Adjust for grout thickness effects

### Next Steps

1. Review this specification document
2. Identify additional formulas needing detailed extraction
3. Create detailed formula extraction for each failure mode
4. Generate Python implementation with full docstrings
5. Create test cases and validation
