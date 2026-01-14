# EC2 Part 4 Fastener Design - Comprehensive Python Implementation Specification
Generated from: 1992-4-1.txt and 1992-4-2.txt
---

## Overview

This specification provides ALL formulas, factors, and requirements extracted from
EC2 Part 4-1 (General) and Part 4-2 (Headed Fasteners) for implementing a complete
Python-based fastener design calculation system.

### Failure Modes for Tension Loading

1. **Steel failure** (Section 6.2.3) - Tensile failure of fastener steel
2. **Pull-out failure** (Section 6.2.4) - Fastener pulls out of concrete
3. **Concrete cone failure** (Section 6.2.5) - Concrete breakout cone
4. **Splitting failure** (Section 6.2.6) - Concrete splits during installation or loading
5. **Blow-out failure** (Section 6.2.7) - Near-edge spalling failure

### Failure Modes for Shear Loading

1. **Steel failure** (Section 6.3.3) - Shear failure of fastener steel
2. **Concrete pry-out failure** (Section 6.3.4) - Concrete spall opposite to load direction
3. **Concrete edge failure** (Section 6.3.5) - Edge breakout under shear

---

## Part 4-2: Headed Fasteners - Design Formulas

### 6.2.3 Steel failure of fastener

**Location**: Lines 375-378 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.2.3 Steel failure of fastener
   1 | The characteristic resistance of a fastener in case of steel failure NRk,s is given in the relevant European
   2 | Technical Specification. The strength calculation is based on fuk.
```

### 6.2.4 Pull-out failure

**Location**: Lines 99-100 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.2.4 Pull-out failure of fastener ....................................................................................................................8
```

### 6.2.5 Concrete cone failure

**Location**: Lines 394-582 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.2.5 Concrete cone failure
   1 | The characteristic resistance of a fastener, a group of fasteners and the tensioned fasteners of a group of
   2 | fasteners in case of concrete cone failure may be obtained by Equation (4).
   3 | s, N re, N ec, N 0
   4 | c, N
   5 | c, N
   6 | Rk, c Rk, c = ⋅ ⋅ψ ⋅ψ ⋅ψ
   7 | A
   8 | A
   9 | N N o [N] (4)
  10 | The different factors of Equation (4) are given below.
  11 | DD CEN/TS 1992-4-2:2009
  12 | CEN/TS 1992-4-2:2009 (E)
  13 | 9
  14 | 6.2.5.1 Characteristic resistance of a single fastener
  15 |  Cracked concrete:
  16 | The characteristic resistance of a single fastener placed in cracked concrete and not influenced by
  17 | adjacent fasteners or edges of the concrete member is obtained by:
  18 | 1,5 cr ck,cube ef
  19 | o
  20 | Rk,c N = k ⋅ f ⋅ h [N] (5)
  21 | with kcr factor to take into account the influence of load transfer mechanisms for
  22 | applications in cracked concrete, the actual value is given in the corresponding
  23 | European Technical Specification.
  24 |  fck,cube [N/mm2
  25 | ], characteristic cube strength of the concrete strength class but noting the
  26 | limitations given in the relevant European Technical Specification.
  27 |  hef [mm], see CEN/TS 1992-4-1:2009, Figure 5, the actual value is given in the
  28 | corresponding European Technical Specification.
  29 | NOTE For headed fasteners according to current experience the value is 8,5. The actual value for a particular
  30 | fastener may be taken from the relevant European Technical Specification.
  31 |  Non-cracked concrete:
  32 | The characteristic resistance of a single fastener placed in non-cracked concrete and not influenced by
  33 | adjacent fasteners or edges of the concrete member is obtained by:
  34 | 1,5 ucr ck,cube ef
  35 | o
  36 | Rk,c N = k ⋅ f ⋅ h [N] (6)
  37 | with kucr factor to take into account the influence of load transfer mechanisms for
  38 | applications in non-cracked concrete, the actual value is given in the
  39 | corresponding European Technical Specification.
  40 | NOTE For headed fasteners according to current experience the value is 11,9. The actual value for a particular
  41 | fastener may be taken from the relevant European Technical Specification.
  42 | 6.2.5.2 Effect of axial spacing and edge distance
  43 | The geometric effect of axial spacing and edge distance on the characteristic resistance is taken into account
  44 | by the value 0
  45 | c, N c, N A /A , where
  46 | 0
  47 | c, Ν Α = reference projected area, see Figure 3
  48 |  = scr,N ⋅ scr,N (7)
  49 | c, N A = actual projected area, limited by overlapping concrete cones of adjacent fasteners
  50 | (s < scr,N) as well as by edges of the concrete member (c < ccr,N).
  51 | Examples for the calculation of Ac,N are given in Figure 4
  52 | scr,N, ccr,N given in the corresponding European Technical Specification
  53 | NOTE For headed fasteners according to current experience scr,N = 2 ccr,N = 3 hef.
  54 | DD CEN/TS 1992-4-2:2009
  55 | CEN/TS 1992-4-2:2009 (E)
  56 | 10
  57 | Key
  58 | 1 Concrete cone
  59 | Figure 3 — Idealized concrete cone and area 0 Ac, N of concrete cone of an individual fastener
  60 | cr,N cr,N
  61 | 0Ac,N = s ⋅ s
  62 | DD CEN/TS 1992-4-2:2009
  63 | CEN/TS 1992-4-2:2009 (E)
  64 | 11
  65 | a)
  66 | Ac, N = (c1 + 0,5 scr, N) ⋅ scr, N
  67 | if: c1 ≤ ccr, N
  68 | b)
  69 | Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ scr, N
  70 | if: c1 ≤ ccr, N
  71 |  s1 ≤ scr, N
  72 | c)
  73 | Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ (c2 + s2 + 0,5 scr, N)
  74 | if: c1; c2 ≤ ccr, N
  75 |  s1 ; s2 ≤ scr, N
  76 | Key
  77 | a) Individual fastener at the edge of a concrete member
  78 | b) Group of two fasteners at the edge of a concrete member
  79 | c) Group of four fasteners at a corner of a concrete member
  80 | Figure 4 — Examples of actual areas Ac, N of the idealised concrete cones for different arrangements of
  81 | fasteners in case of axial tension load
  82 | 6.2.5.3 Effect of the disturbance of the distribution of stresses in the concrete due to edges
  83 | The factor ψs, N takes account of the disturbance of the distribution of stresses in the concrete due to edges of
  84 | the concrete member. For fastenings with several edge distances (e.g. fastening in a corner of the concrete
  85 | member or in a narrow member), the smallest edge distance c should be inserted in Equation (8).
  86 | DD CEN/TS 1992-4-2:2009
  87 | CEN/TS 1992-4-2:2009 (E)
  88 | 12
  89 | 0 7 0 3 1
  90 | cr, N
  91 | s, N = + ⋅ ≤
  92 | c
  93 | c
  94 | ψ , , [-] (8)
  95 | 6.2.5.4 Effect of shell spalling
  96 | The shell spalling factor ψre, N takes account of the effect of a dense reinforcement for embedment depths
  97 | hef < 100 mm:
  98 | 1
  99 | 200
 100 | 0 5 ef
 101 | re, N = + ≤
 102 | h
 103 | ψ , [-] (9)
 104 | with: hef [mm]
 105 | Irrespective of the embedment depth of the fastener, ψre, N may be taken as 1,0 in the following cases:
 106 | a) Reinforcement (any diameter) is provided at a spacing ≥ 150mm, or
 107 | b) Reinforcement with a diameter of 10 mm or less is provided at a spacing > 100 mm.
 108 | 6.2.5.5 Effect of the eccentricity of the load
 109 | The factor ψec, N takes account of a group effect when different tension loads are acting on the individual
 110 | fasteners of a group.
 111 | 1
 112 | 1 2
 113 | 1
 114 | N cr, N
 115 | ec, N ≤
 116 | + ⋅ = e /s ψ [-] (10)
 117 | with
 118 | eN eccentricity of the resulting tensile load acting on the tensioned fasteners
 119 | (see CEN/TS 1992-4-1:2009, 5.2).
 120 | Where there is an eccentricity in two directions, ψec, N should be determined separately for each direction and
 121 | the product of both factors should be inserted in Equation (4).
 122 | 6.2.5.6 Effect of the position of the fastening
 123 | The factor ψucr, N takes account of the position of the fastening in cracked or non-cracked concrete.
 124 | ψucr, N = 1,0 for fasteners in cracked concrete (11)
 125 |  = 1,4 for fasteners in non-cracked concrete (12)
 126 | 6.2.5.7 Effect of a narrow member
 127 | For the case of fasteners in an application with three or more edges distances less than ccr, N from the
 128 | fasteners (see Figure 5) the calculation according to Equation (4) leads to conservative results. More precise
 129 | results are obtained if in the case of single fasteners the value hef is substituted by
 130 | ef
 131 | cr, N
 132 | ' max ef h
 133 | c
 134 | c h = ⋅ (13)
 135 | or in the case of groups hef is substituted by the larger value of
 136 | DD CEN/TS 1992-4-2:2009
 137 | CEN/TS 1992-4-2:2009 (E)
 138 | 13
 139 | ef
 140 | cr, N
 141 | ' max ef ef
 142 | cr, N
 143 | ' max ef o h
 144 | s
 145 | s h r h
 146 | c
 147 | c h = ⋅ = ⋅ (14)
 148 | with cmax = maximum distance from centre of a fastener to the edge of concrete member ≤ ccr,N
 149 | smax = maximum centre to centre spacing of fasteners ≤ scr,N
 150 | The value ' hef is inserted in Equation (5) or Equation (6) and used for the determination of 0
 151 | c, N A and
 152 | c, N A according to Figures 3 and 4 as well as in Equations (7), (8) and (9), where the values
 153 | ef
 154 | '
 155 | ef
 156 | cr,N '
 157 | cr,N h
 158 | h
 159 | s = s ⋅ (15)
 160 | ef
 161 | '
 162 | ef
 163 | cr,N '
 164 | cr,N h
 165 | h
 166 | c = c ⋅ (16)
 167 | are inserted for scr,N or ccr,N, respectively.
 168 | NOTE An example for the calculation of '
 169 | ef h is illustrated in Figure 6.
 170 | Key
 171 | a) (c1; c2,1; c2,2) ≤ ccr,N
 172 | b) (c1,1; c1,2; c2,1; c2,2) ≤ ccr,N
 173 | Figure 5 — Examples for fastenings in concrete members where '
 174 | ef h , ' scr,N and ' ccr,N may be used
 175 | DD CEN/TS 1992-4-2:2009
 176 | CEN/TS 1992-4-2:2009 (E)
 177 | 14
 178 | c1 = 110 mm
 179 | c2 = 100 mm
 180 | c3 = 120 mm = cmax
 181 | c4 = 80 mm
 182 | s = 210 mm
 183 | hef = 200 mm
 184 | '
 185 | ef h = 120/1,5 = 80 mm > 210/3 = 70mm
 186 | Figure 6 — Illustration of the calculation of '
 187 | ef h for a double fastening influenced by 4 edges
```

#### Extracted Formulas (20 found)

**Formula 1**

```
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
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
9
6.2.5.1 Characteristic resistance of a single fastener
 Cracked concrete:
```

**Formula 2**

```
 Cracked concrete:
The characteristic resistance of a single fastener placed in cracked concrete and not influenced by
adjacent fasteners or edges of the concrete member is obtained by:
1,5 cr ck,cube ef
o
Rk,c N = k ⋅ f ⋅ h [N] (5)
with kcr factor to take into account the influence of load transfer mechanisms for
applications in cracked concrete, the actual value is given in the corresponding
European Technical Specification.
 fck,cube [N/mm2
], characteristic cube strength of the concrete strength class but noting the
limitations given in the relevant European Technical Specification.
 hef [mm], see CEN/TS 1992-4-1:2009, Figure 5, the actual value is given in the
corresponding European Technical Specification.
NOTE For headed fasteners according to current experience the value is 8,5. The actual value for a particular
```

**Formula 3**

```
 Non-cracked concrete:
The characteristic resistance of a single fastener placed in non-cracked concrete and not influenced by
adjacent fasteners or edges of the concrete member is obtained by:
1,5 ucr ck,cube ef
o
Rk,c N = k ⋅ f ⋅ h [N] (6)
with kucr factor to take into account the influence of load transfer mechanisms for
applications in non-cracked concrete, the actual value is given in the
corresponding European Technical Specification.
NOTE For headed fasteners according to current experience the value is 11,9. The actual value for a particular
fastener may be taken from the relevant European Technical Specification.
6.2.5.2 Effect of axial spacing and edge distance
The geometric effect of axial spacing and edge distance on the characteristic resistance is taken into account
by the value 0
c, N c, N A /A , where
```

**Formula 4**

```
6.2.5.2 Effect of axial spacing and edge distance
The geometric effect of axial spacing and edge distance on the characteristic resistance is taken into account
by the value 0
c, N c, N A /A , where
0
c, Ν Α = reference projected area, see Figure 3
 = scr,N ⋅ scr,N (7)
c, N A = actual projected area, limited by overlapping concrete cones of adjacent fasteners
(s < scr,N) as well as by edges of the concrete member (c < ccr,N).
Examples for the calculation of Ac,N are given in Figure 4
scr,N, ccr,N given in the corresponding European Technical Specification
NOTE For headed fasteners according to current experience scr,N = 2 ccr,N = 3 hef.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
10
```

**Formula 5**

```
The geometric effect of axial spacing and edge distance on the characteristic resistance is taken into account
by the value 0
c, N c, N A /A , where
0
c, Ν Α = reference projected area, see Figure 3
 = scr,N ⋅ scr,N (7)
c, N A = actual projected area, limited by overlapping concrete cones of adjacent fasteners
(s < scr,N) as well as by edges of the concrete member (c < ccr,N).
Examples for the calculation of Ac,N are given in Figure 4
scr,N, ccr,N given in the corresponding European Technical Specification
NOTE For headed fasteners according to current experience scr,N = 2 ccr,N = 3 hef.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
10
Key
```

**Formula 6**

```
by the value 0
c, N c, N A /A , where
0
c, Ν Α = reference projected area, see Figure 3
 = scr,N ⋅ scr,N (7)
c, N A = actual projected area, limited by overlapping concrete cones of adjacent fasteners
(s < scr,N) as well as by edges of the concrete member (c < ccr,N).
Examples for the calculation of Ac,N are given in Figure 4
scr,N, ccr,N given in the corresponding European Technical Specification
NOTE For headed fasteners according to current experience scr,N = 2 ccr,N = 3 hef.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
10
Key
1 Concrete cone
```

**Formula 7**

```
 = scr,N ⋅ scr,N (7)
c, N A = actual projected area, limited by overlapping concrete cones of adjacent fasteners
(s < scr,N) as well as by edges of the concrete member (c < ccr,N).
Examples for the calculation of Ac,N are given in Figure 4
scr,N, ccr,N given in the corresponding European Technical Specification
NOTE For headed fasteners according to current experience scr,N = 2 ccr,N = 3 hef.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
10
Key
1 Concrete cone
Figure 3 — Idealized concrete cone and area 0 Ac, N of concrete cone of an individual fastener
cr,N cr,N
0Ac,N = s ⋅ s
DD CEN/TS 1992-4-2:2009
```

**Formula 8**

```
10
Key
1 Concrete cone
Figure 3 — Idealized concrete cone and area 0 Ac, N of concrete cone of an individual fastener
cr,N cr,N
0Ac,N = s ⋅ s
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
11
a)
Ac, N = (c1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
b)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
```

**Formula 9**

```
0Ac,N = s ⋅ s
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
11
a)
Ac, N = (c1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
b)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
 s1 ≤ scr, N
c)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ (c2 + s2 + 0,5 scr, N)
if: c1; c2 ≤ ccr, N
 s1 ; s2 ≤ scr, N
```

**Formula 10**

```
11
a)
Ac, N = (c1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
b)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
 s1 ≤ scr, N
c)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ (c2 + s2 + 0,5 scr, N)
if: c1; c2 ≤ ccr, N
 s1 ; s2 ≤ scr, N
Key
a) Individual fastener at the edge of a concrete member
b) Group of two fasteners at the edge of a concrete member
```

**Formula 11**

```
b)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ scr, N
if: c1 ≤ ccr, N
 s1 ≤ scr, N
c)
Ac, N = (c1 + s1 + 0,5 scr, N) ⋅ (c2 + s2 + 0,5 scr, N)
if: c1; c2 ≤ ccr, N
 s1 ; s2 ≤ scr, N
Key
a) Individual fastener at the edge of a concrete member
b) Group of two fasteners at the edge of a concrete member
c) Group of four fasteners at a corner of a concrete member
Figure 4 — Examples of actual areas Ac, N of the idealised concrete cones for different arrangements of
fasteners in case of axial tension load
6.2.5.3 Effect of the disturbance of the distribution of stresses in the concrete due to edges
```

**Formula 12**

```
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
12
0 7 0 3 1
cr, N
s, N = + ⋅ ≤
c
c
ψ , , [-] (8)
6.2.5.4 Effect of shell spalling
The shell spalling factor ψre, N takes account of the effect of a dense reinforcement for embedment depths
hef < 100 mm:
1
200
0 5 ef
```

**Formula 13**

```
The shell spalling factor ψre, N takes account of the effect of a dense reinforcement for embedment depths
hef < 100 mm:
1
200
0 5 ef
re, N = + ≤
h
ψ , [-] (9)
with: hef [mm]
Irrespective of the embedment depth of the fastener, ψre, N may be taken as 1,0 in the following cases:
a) Reinforcement (any diameter) is provided at a spacing ≥ 150mm, or
b) Reinforcement with a diameter of 10 mm or less is provided at a spacing > 100 mm.
6.2.5.5 Effect of the eccentricity of the load
The factor ψec, N takes account of a group effect when different tension loads are acting on the individual
fasteners of a group.
```

**Formula 14**

```
1
1 2
1
N cr, N
ec, N ≤
+ ⋅ = e /s ψ [-] (10)
with
eN eccentricity of the resulting tensile load acting on the tensioned fasteners
(see CEN/TS 1992-4-1:2009, 5.2).
Where there is an eccentricity in two directions, ψec, N should be determined separately for each direction and
the product of both factors should be inserted in Equation (4).
6.2.5.6 Effect of the position of the fastening
The factor ψucr, N takes account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fasteners in cracked concrete (11)
 = 1,4 for fasteners in non-cracked concrete (12)
```

**Formula 15**

```
(see CEN/TS 1992-4-1:2009, 5.2).
Where there is an eccentricity in two directions, ψec, N should be determined separately for each direction and
the product of both factors should be inserted in Equation (4).
6.2.5.6 Effect of the position of the fastening
The factor ψucr, N takes account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fasteners in cracked concrete (11)
 = 1,4 for fasteners in non-cracked concrete (12)
6.2.5.7 Effect of a narrow member
For the case of fasteners in an application with three or more edges distances less than ccr, N from the
fasteners (see Figure 5) the calculation according to Equation (4) leads to conservative results. More precise
results are obtained if in the case of single fasteners the value hef is substituted by
ef
cr, N
' max ef h
c
```

**Formula 16**

```
Where there is an eccentricity in two directions, ψec, N should be determined separately for each direction and
the product of both factors should be inserted in Equation (4).
6.2.5.6 Effect of the position of the fastening
The factor ψucr, N takes account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fasteners in cracked concrete (11)
 = 1,4 for fasteners in non-cracked concrete (12)
6.2.5.7 Effect of a narrow member
For the case of fasteners in an application with three or more edges distances less than ccr, N from the
fasteners (see Figure 5) the calculation according to Equation (4) leads to conservative results. More precise
results are obtained if in the case of single fasteners the value hef is substituted by
ef
cr, N
' max ef h
c
c h = ⋅ (13)
```

**Formula 17**

```
' max ef o h
s
s h r h
c
c h = ⋅ = ⋅ (14)
with cmax = maximum distance from centre of a fastener to the edge of concrete member ≤ ccr,N
smax = maximum centre to centre spacing of fasteners ≤ scr,N
The value ' hef is inserted in Equation (5) or Equation (6) and used for the determination of 0
c, N A and
c, N A according to Figures 3 and 4 as well as in Equations (7), (8) and (9), where the values
ef
'
ef
cr,N '
cr,N h
```

**Formula 18**

```
s
s h r h
c
c h = ⋅ = ⋅ (14)
with cmax = maximum distance from centre of a fastener to the edge of concrete member ≤ ccr,N
smax = maximum centre to centre spacing of fasteners ≤ scr,N
The value ' hef is inserted in Equation (5) or Equation (6) and used for the determination of 0
c, N A and
c, N A according to Figures 3 and 4 as well as in Equations (7), (8) and (9), where the values
ef
'
ef
cr,N '
cr,N h
h
```

**Formula 19**

```
c1 = 110 mm
c2 = 100 mm
c3 = 120 mm = cmax
c4 = 80 mm
s = 210 mm
hef = 200 mm
'
ef h = 120/1,5 = 80 mm > 210/3 = 70mm
Figure 6 — Illustration of the calculation of '
ef h for a double fastening influenced by 4 edges
```

**Formula 20**

```
c3 = 120 mm = cmax
c4 = 80 mm
s = 210 mm
hef = 200 mm
'
ef h = 120/1,5 = 80 mm > 210/3 = 70mm
Figure 6 — Illustration of the calculation of '
ef h for a double fastening influenced by 4 edges
```

### 6.2.6 Splitting failure

**Location**: Lines 582-658 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.2.6 Splitting failure
   1 | 6.2.6.1 Splitting failure due to installation
   2 | Splitting failure during installation e.g. by torquing of fasteners (see CEN/TS 1992-4-1:2009, Figure 3) is
   3 | avoided by complying with minimum values for edge distances cmin, spacing smin, and member thickness hmin
   4 | and requirements for reinforcement as given in the relevant European Technical Specification.
   5 | NOTE Minimum values for edge distance, spacing and member thickness should also be observed for headed
   6 | fasteners not torqued to allow adequate placing and compaction of the concrete.
   7 | 6.2.6.2 Splitting failure due to loading
   8 | No verification of splitting failure is required if one of the following conditions is fulfilled:
   9 | a) The edge distance in all directions is c > 1,0 ccr,sp for fastenings with one anchor and c > 1,2 ccr,sp for
  10 | fastenings with more than one anchor.
  11 |  The characteristic values ccr,sp and scr,sp are given in the relevant European Technical Specification.
  12 | b) The characteristic resistance for concrete cone failure and pull-out failure is calculated for cracked
  13 | concrete and reinforcement resists the splitting forces and limits the crack width to wk ≤ 0,3 mm.
  14 | The required cross-section As of the splitting reinforcement may be determined as follows:
  15 | DD CEN/TS 1992-4-2:2009
  16 | CEN/TS 1992-4-2:2009 (E)
  17 | 15
  18 | yk Ms, re
  19 | Ed s / 0,5 f γ
  20 | ΣN A = [mm²] (17)
  21 | with
  22 | ΣΝEd = sum of the design tensile force of the fasteners in tension under the design value of the actions [N]
  23 | fyk = nominal yield strength of the reinforcing steel ≤ 500 N/mm²
  24 | If the conditions a) and b) of 6.2.6.2 are not fulfilled, then the characteristic resistance of one fastener or a
  25 | group of fasteners should be calculated according to Equation (18).
  26 | s, N ec,N re, N h, sp 0
  27 | c, N
  28 | 0 c, N
  29 | Rk, sp Rk = ⋅ ⋅ψ ⋅ψ ⋅ψ ⋅ψ
  30 | A
  31 | A
  32 | N N [N] (18)
  33 | with ) min( , 0
  34 | Rk,p Rk,c
  35 | 0
  36 | Rk N = N N
  37 | NRk,p according to Section 6.2.4
  38 | s, N re, N ec, N ucr, N
  39 | 0
  40 | Rk, c N ,ψ ⋅ψ ⋅ψ ⋅ψ according to 6.2.5, however the values ccr,N and scr,N should be
  41 | replaced by ccr,sp and scr,sp. The values ccr, sp and scr, sp are based on a member thickness hmin
  42 | The factor ψh, sp takes into account the influence of the actual member depth h on the splitting resistance. For
  43 | fasteners according to current experience it is given by Equation (19).
  44 | 2/3
  45 | min
  46 | ef
  47 | 2/3
  48 | min
  49 | h, sp
  50 | 2
  51 | 
  52 | 
  53 | 
  54 | 
  55 | 
  56 | 
  57 | 
  58 |  ≤ 
  59 | 
  60 | 
  61 | 
  62 | 
  63 | 
  64 | 
  65 |  = h
  66 | h
  67 | h
  68 | h
  69 | ψ (19)
  70 | For fastenings with several edge distances (e.g. fastening in a corner of the concrete member or in a narrow
  71 | member), the smallest edge distance c shall be inserted in Equation (18).
  72 | NOTE If in the European Technical Specification ccr,sp for more than one member depth h is given, then the member
  73 | depth valid for the used ccr,sp shall be inserted in Equation (4).
  74 | If the edge distance is smaller than the value ccr,sp then a longitudinal reinforcement should be provided along
  75 | the edge of the member.
```

#### Extracted Formulas (5 found)

**Formula 1**

```
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
15
yk Ms, re
Ed s / 0,5 f γ
ΣN A = [mm²] (17)
with
ΣΝEd = sum of the design tensile force of the fasteners in tension under the design value of the actions [N]
fyk = nominal yield strength of the reinforcing steel ≤ 500 N/mm²
If the conditions a) and b) of 6.2.6.2 are not fulfilled, then the characteristic resistance of one fastener or a
group of fasteners should be calculated according to Equation (18).
s, N ec,N re, N h, sp 0
c, N
0 c, N
Rk, sp Rk = ⋅ ⋅ψ ⋅ψ ⋅ψ ⋅ψ
```

**Formula 2**

```
15
yk Ms, re
Ed s / 0,5 f γ
ΣN A = [mm²] (17)
with
ΣΝEd = sum of the design tensile force of the fasteners in tension under the design value of the actions [N]
fyk = nominal yield strength of the reinforcing steel ≤ 500 N/mm²
If the conditions a) and b) of 6.2.6.2 are not fulfilled, then the characteristic resistance of one fastener or a
group of fasteners should be calculated according to Equation (18).
s, N ec,N re, N h, sp 0
c, N
0 c, N
Rk, sp Rk = ⋅ ⋅ψ ⋅ψ ⋅ψ ⋅ψ
A
A
```

**Formula 3**

```
yk Ms, re
Ed s / 0,5 f γ
ΣN A = [mm²] (17)
with
ΣΝEd = sum of the design tensile force of the fasteners in tension under the design value of the actions [N]
fyk = nominal yield strength of the reinforcing steel ≤ 500 N/mm²
If the conditions a) and b) of 6.2.6.2 are not fulfilled, then the characteristic resistance of one fastener or a
group of fasteners should be calculated according to Equation (18).
s, N ec,N re, N h, sp 0
c, N
0 c, N
Rk, sp Rk = ⋅ ⋅ψ ⋅ψ ⋅ψ ⋅ψ
A
A
N N [N] (18)
```

**Formula 4**

```
If the conditions a) and b) of 6.2.6.2 are not fulfilled, then the characteristic resistance of one fastener or a
group of fasteners should be calculated according to Equation (18).
s, N ec,N re, N h, sp 0
c, N
0 c, N
Rk, sp Rk = ⋅ ⋅ψ ⋅ψ ⋅ψ ⋅ψ
A
A
N N [N] (18)
with ) min( , 0
Rk,p Rk,c
0
Rk N = N N
NRk,p according to Section 6.2.4
s, N re, N ec, N ucr, N
```

**Formula 5**

```
A
N N [N] (18)
with ) min( , 0
Rk,p Rk,c
0
Rk N = N N
NRk,p according to Section 6.2.4
s, N re, N ec, N ucr, N
0
Rk, c N ,ψ ⋅ψ ⋅ψ ⋅ψ according to 6.2.5, however the values ccr,N and scr,N should be
replaced by ccr,sp and scr,sp. The values ccr, sp and scr, sp are based on a member thickness hmin
The factor ψh, sp takes into account the influence of the actual member depth h on the splitting resistance. For
fasteners according to current experience it is given by Equation (19).
2/3
min
```

### 6.2.7 Blow-out failure

**Location**: Lines 658-779 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.2.7 Blow-out failure
   1 | Verification of blow-out failure is not required if the edge distance in all directions exceeds c = 0,5 hef. If a
   2 | verification is required, the characteristic resistance in case of blow-out failure is:
   3 | 0 s, Nb g, Nb ec, Nb ucr, N
   4 | c, Nb
   5 | 0 c, Nb
   6 | Rk, cb Rk, cb ψ ψ ψ ψ
   7 | A
   8 | A
   9 | N = N ⋅ ⋅ ⋅ ⋅ ⋅ [N] (20)
  10 | The different factors of Equation (20) are given below:
  11 | NOTE For groups of fasteners perpendicular to the edge, which are loaded uniformly, verification is only required for
  12 | the fasteners closest to the edge.
  13 | 6.2.7.1 Characteristic resistance of a single anchor
  14 | The characteristic resistance of a single anchor, not influenced by adjacent fasteners or free structural
  15 | component edges placed in cracked concrete, is obtained by:
  16 | 1 h ck,cube
  17 | 0
  18 | Rk,cb N = 8 ⋅ c ⋅ A ⋅ f [N] (21)
  19 | with
  20 | DD CEN/TS 1992-4-2:2009
  21 | CEN/TS 1992-4-2:2009 (E)
  22 | 16
  23 | fck,cube [N/mm2
  24 | ], characteristic cube strength of the concrete strength class but noting the limitations
  25 |  given in the relevant European Technical Specification
  26 | Ah [mm2
  27 | ], see Equation (3)
  28 | c1 [mm], edge distance, see Figure 7
  29 | Figure 7 — Idealized concrete break-out body and area 0
  30 | c, Nb A of an individual fastener in case of blow￾out failure
  31 | 6.2.7.2 Geometric effect of axial spacing and edge distance
  32 | The geometric effect of axial spacing and edge distance on the characteristic resistance is taken into account
  33 | by the value
  34 | 0
  35 | c, Nb c, Nb A /A
  36 | where
  37 | 0
  38 | c, Nb A = reference projected area, see Figure 7
  39 |  = (4 c1)² (22)
  40 | Ac, Nb = actual projected area, limited by overlapping concrete break-out bodies of adjacent fasteners
  41 |  (s < 4 c1) as well as by edges of the concrete member (c2 < 2 ⋅ c1 ) or the member depth. Examples
  42 |  for the calculation of Ac,Nb are given in Figure 8.
  43 | DD CEN/TS 1992-4-2:2009
  44 | CEN/TS 1992-4-2:2009 (E)
  45 | 17
  46 | a)
  47 | 1
  48 | 1 1 4 (4 )
  49 | s c
  50 | A c c s ,
  51 | 4
  52 | c Nb
  53 | ≤
  54 | = +
  55 | b)
  56 | 1
  57 | 2 1
  58 | 1 2 1
  59 | 4
  60 | 2
  61 | 4 ( 2 )
  62 | s c
  63 | c c
  64 | A c c s c ,
  65 | ≤
  66 | ≤
  67 | c Nb = + +
  68 | c)
  69 | 1
  70 | 1
  71 | 1 1
  72 | 4
  73 | 2
  74 | (2 ) (4 )
  75 | s c
  76 | f c
  77 | A c f c s ,
  78 | ≤
  79 | ≤
  80 | c Nb = + +
  81 | Figure 8 — Examples of actual areas Ac, Nb of the idealised concrete break-out bodies for different
  82 | arrangements of fasteners in case of blow-out
  83 | 6.2.7.3 Effect of the disturbance of the distribution of stresses in the concrete due to a corner
  84 | The factor ψs, Nb takes account of the disturbance of the distribution of stresses in the concrete due to a corner
  85 | of the concrete member. For fastenings with several edge distances (e.g. fastening in a corner of the concrete
  86 | member), the smallest edge distance, c2, should be inserted in Equation (23).
  87 | 0,7 0,3 1
  88 | 1
  89 | 2
  90 | s, Nb = + ⋅ ≤
  91 | c
  92 | c
  93 | ψ (23)
  94 | 6.2.7.4 Effect of the bearing area on the behaviour of groups
  95 | The factor ψg, Nb takes account of the bearing areas of the individual fasteners of a group.
  96 | DD CEN/TS 1992-4-2:2009
  97 | CEN/TS 1992-4-2:2009 (E)
  98 | 18
  99 | 1
 100 | 4 c
 101 | s
 102 | n (1 n)
 103 | 1
 104 | 1 ψg, Nb = + − ⋅ ≥ (24)
 105 | with n = number of tensioned fasteners in a row parallel to the edge
 106 | s1 ≤ 4c1
 107 | 6.2.7.5 Effect of the eccentricity of the load
 108 | The factor ψec, Nb takes account of a group effect, when different loads are acting on the individual fasteners of
 109 | a group.
 110 | 1 2 /(4 c )
 111 | 1
 112 | N 1
 113 | ec, Nb + ⋅ e
 114 | ψ = (25)
 115 | with
 116 | eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners
 117 | 6.2.7.6 Effect of the position of the fastening
 118 | The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete.
 119 | ψucr, N = 1,0 for fastenings in cracked concrete (26)
 120 |  = 1,4 for fastenings in non-cracked concrete (27)
```

#### Extracted Formulas (14 found)

**Formula 1**

```
6.2.7 Blow-out failure
Verification of blow-out failure is not required if the edge distance in all directions exceeds c = 0,5 hef. If a
verification is required, the characteristic resistance in case of blow-out failure is:
0 s, Nb g, Nb ec, Nb ucr, N
c, Nb
0 c, Nb
Rk, cb Rk, cb ψ ψ ψ ψ
A
A
N = N ⋅ ⋅ ⋅ ⋅ ⋅ [N] (20)
The different factors of Equation (20) are given below:
```

**Formula 2**

```
c, Nb
0 c, Nb
Rk, cb Rk, cb ψ ψ ψ ψ
A
A
N = N ⋅ ⋅ ⋅ ⋅ ⋅ [N] (20)
The different factors of Equation (20) are given below:
NOTE For groups of fasteners perpendicular to the edge, which are loaded uniformly, verification is only required for
the fasteners closest to the edge.
6.2.7.1 Characteristic resistance of a single anchor
The characteristic resistance of a single anchor, not influenced by adjacent fasteners or free structural
component edges placed in cracked concrete, is obtained by:
1 h ck,cube
0
Rk,cb N = 8 ⋅ c ⋅ A ⋅ f [N] (21)
```

**Formula 3**

```
6.2.7.1 Characteristic resistance of a single anchor
The characteristic resistance of a single anchor, not influenced by adjacent fasteners or free structural
component edges placed in cracked concrete, is obtained by:
1 h ck,cube
0
Rk,cb N = 8 ⋅ c ⋅ A ⋅ f [N] (21)
with
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
16
fck,cube [N/mm2
], characteristic cube strength of the concrete strength class but noting the limitations
 given in the relevant European Technical Specification
Ah [mm2
], see Equation (3)
```

**Formula 4**

```
by the value
0
c, Nb c, Nb A /A
where
0
c, Nb A = reference projected area, see Figure 7
 = (4 c1)² (22)
Ac, Nb = actual projected area, limited by overlapping concrete break-out bodies of adjacent fasteners
 (s < 4 c1) as well as by edges of the concrete member (c2 < 2 ⋅ c1 ) or the member depth. Examples
 for the calculation of Ac,Nb are given in Figure 8.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
17
a)
1
```

**Formula 5**

```
c, Nb c, Nb A /A
where
0
c, Nb A = reference projected area, see Figure 7
 = (4 c1)² (22)
Ac, Nb = actual projected area, limited by overlapping concrete break-out bodies of adjacent fasteners
 (s < 4 c1) as well as by edges of the concrete member (c2 < 2 ⋅ c1 ) or the member depth. Examples
 for the calculation of Ac,Nb are given in Figure 8.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
17
a)
1
1 1 4 (4 )
s c
```

**Formula 6**

```
s c
c c
A c c s c ,
≤
≤
c Nb = + +
c)
1
1
1 1
4
2
(2 ) (4 )
s c
f c
```

**Formula 7**

```
s c
f c
A c f c s ,
≤
≤
c Nb = + +
Figure 8 — Examples of actual areas Ac, Nb of the idealised concrete break-out bodies for different
arrangements of fasteners in case of blow-out
6.2.7.3 Effect of the disturbance of the distribution of stresses in the concrete due to a corner
The factor ψs, Nb takes account of the disturbance of the distribution of stresses in the concrete due to a corner
of the concrete member. For fastenings with several edge distances (e.g. fastening in a corner of the concrete
member), the smallest edge distance, c2, should be inserted in Equation (23).
0,7 0,3 1
1
2
```

**Formula 8**

```
of the concrete member. For fastenings with several edge distances (e.g. fastening in a corner of the concrete
member), the smallest edge distance, c2, should be inserted in Equation (23).
0,7 0,3 1
1
2
s, Nb = + ⋅ ≤
c
c
ψ (23)
6.2.7.4 Effect of the bearing area on the behaviour of groups
The factor ψg, Nb takes account of the bearing areas of the individual fasteners of a group.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
18
1
```

**Formula 9**

```
1
4 c
s
n (1 n)
1
1 ψg, Nb = + − ⋅ ≥ (24)
with n = number of tensioned fasteners in a row parallel to the edge
s1 ≤ 4c1
6.2.7.5 Effect of the eccentricity of the load
The factor ψec, Nb takes account of a group effect, when different loads are acting on the individual fasteners of
a group.
1 2 /(4 c )
1
N 1
ec, Nb + ⋅ e
```

**Formula 10**

```
4 c
s
n (1 n)
1
1 ψg, Nb = + − ⋅ ≥ (24)
with n = number of tensioned fasteners in a row parallel to the edge
s1 ≤ 4c1
6.2.7.5 Effect of the eccentricity of the load
The factor ψec, Nb takes account of a group effect, when different loads are acting on the individual fasteners of
a group.
1 2 /(4 c )
1
N 1
ec, Nb + ⋅ e
ψ = (25)
```

**Formula 11**

```
a group.
1 2 /(4 c )
1
N 1
ec, Nb + ⋅ e
ψ = (25)
with
eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners
6.2.7.6 Effect of the position of the fastening
The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fastenings in cracked concrete (26)
 = 1,4 for fastenings in non-cracked concrete (27)
```

**Formula 12**

```
1
N 1
ec, Nb + ⋅ e
ψ = (25)
with
eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners
6.2.7.6 Effect of the position of the fastening
The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fastenings in cracked concrete (26)
 = 1,4 for fastenings in non-cracked concrete (27)
```

**Formula 13**

```
ψ = (25)
with
eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners
6.2.7.6 Effect of the position of the fastening
The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fastenings in cracked concrete (26)
 = 1,4 for fastenings in non-cracked concrete (27)
```

**Formula 14**

```
with
eN = eccentricity of the resulting tensile load in respect of the centre of gravity of the tensioned fasteners
6.2.7.6 Effect of the position of the fastening
The factor ψucr, N takes into account of the position of the fastening in cracked or non-cracked concrete.
ψucr, N = 1,0 for fastenings in cracked concrete (26)
 = 1,4 for fastenings in non-cracked concrete (27)
```

### 6.3.3 Steel failure (shear)

**Location**: Lines 910-943 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.3.3 Steel failure of fastener
   1 | 6.3.3.1 Shear load without lever arm
   2 | For headed fasteners welded or not welded to a steel fixture the characteristic resistance of a fastener in case
   3 | of steel failure VRk,s is given in the relevant European Technical Specification. The strength calculations are
   4 | based on uk f . In case of groups with fasteners with a hole clearance df given in CEN/TS 1992-4-1:2009,
   5 | Table 1 and made of non-ductile steel, this characteristic shear resistance should be multiplied with the factor
   6 | k2. The factor k2 is given in the relevant European Technical Specification.
   7 | NOTE According to current experience the factor k2 for non-ductile steel is k2 = 0,8.
   8 | 6.3.3.2 Shear load with lever arm
   9 | For headed fastener the characteristic resistance in case of steel failure VRk,s may be obtained from
  10 | Equation (30).
  11 | DD CEN/TS 1992-4-2:2009
  12 | CEN/TS 1992-4-2:2009 (E)
  13 | 21
  14 | l
  15 | α M
  16 | V M Rk, s
  17 | Rk, s
  18 | ⋅ = [N] (30)
  19 | with
  20 | αM , l see CEN/TS 1992-4-1:2009, Section 5.2.3.3
  21 | MRk, s = ) 1 Sd Rd, s 0
  22 | Rk, s M ⋅ ( − N /N (31)
  23 | NRd,s = NRk, s/γMs
  24 | The characteristic resistance under tension load in case of steel failure NRk,s the partial safety factor γMs and
  25 | the characteristic bending resistance of a single headed fastener 0 MRk, s , are given in the relevant European
  26 | Technical Specification.
  27 | Figure 10 — Illustration of detailing of the supplementary reinforcement in form of loops, examples
  28 | NOTE The reinforcement in form of stirrups or loops should be detailed with a mandrel diameter according to
  29 | EN 1992-1-1.
  30 | DD CEN/TS 1992-4-2:2009
  31 | CEN/TS 1992-4-2:2009 (E)
  32 | 22
```

#### Extracted Formulas (4 found)

**Formula 1**

```
For headed fasteners welded or not welded to a steel fixture the characteristic resistance of a fastener in case
of steel failure VRk,s is given in the relevant European Technical Specification. The strength calculations are
based on uk f . In case of groups with fasteners with a hole clearance df given in CEN/TS 1992-4-1:2009,
Table 1 and made of non-ductile steel, this characteristic shear resistance should be multiplied with the factor
k2. The factor k2 is given in the relevant European Technical Specification.
NOTE According to current experience the factor k2 for non-ductile steel is k2 = 0,8.
6.3.3.2 Shear load with lever arm
For headed fastener the characteristic resistance in case of steel failure VRk,s may be obtained from
Equation (30).
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
21
l
α M
V M Rk, s
```

**Formula 2**

```
21
l
α M
V M Rk, s
Rk, s
⋅ = [N] (30)
with
αM , l see CEN/TS 1992-4-1:2009, Section 5.2.3.3
MRk, s = ) 1 Sd Rd, s 0
Rk, s M ⋅ ( − N /N (31)
NRd,s = NRk, s/γMs
The characteristic resistance under tension load in case of steel failure NRk,s the partial safety factor γMs and
the characteristic bending resistance of a single headed fastener 0 MRk, s , are given in the relevant European
Technical Specification.
Figure 10 — Illustration of detailing of the supplementary reinforcement in form of loops, examples
```

**Formula 3**

```
V M Rk, s
Rk, s
⋅ = [N] (30)
with
αM , l see CEN/TS 1992-4-1:2009, Section 5.2.3.3
MRk, s = ) 1 Sd Rd, s 0
Rk, s M ⋅ ( − N /N (31)
NRd,s = NRk, s/γMs
The characteristic resistance under tension load in case of steel failure NRk,s the partial safety factor γMs and
the characteristic bending resistance of a single headed fastener 0 MRk, s , are given in the relevant European
Technical Specification.
Figure 10 — Illustration of detailing of the supplementary reinforcement in form of loops, examples
NOTE The reinforcement in form of stirrups or loops should be detailed with a mandrel diameter according to
EN 1992-1-1.
DD CEN/TS 1992-4-2:2009
```

**Formula 4**

```
⋅ = [N] (30)
with
αM , l see CEN/TS 1992-4-1:2009, Section 5.2.3.3
MRk, s = ) 1 Sd Rd, s 0
Rk, s M ⋅ ( − N /N (31)
NRd,s = NRk, s/γMs
The characteristic resistance under tension load in case of steel failure NRk,s the partial safety factor γMs and
the characteristic bending resistance of a single headed fastener 0 MRk, s , are given in the relevant European
Technical Specification.
Figure 10 — Illustration of detailing of the supplementary reinforcement in form of loops, examples
NOTE The reinforcement in form of stirrups or loops should be detailed with a mandrel diameter according to
EN 1992-1-1.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
22
```

### 6.3.4 Concrete pry-out failure

**Location**: Lines 109-110 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.3.4 Concrete pry-out failure ..................................................................................................................... 22
```

### 6.3.5 Concrete edge failure

**Location**: Lines 986-1289 in 1992-4-2.txt

#### Full Section Content

```
   0 | 6.3.5 Concrete edge failure
   1 | 6.3.5.1 General
   2 | The following conditions shall be observed:
   3 |  For single fasteners and groups with not more than 4 fasteners and with an edge distance in all directions
   4 | c > 10 hef or c > 60 d, a check of the characteristic concrete edge failure resistance may be omitted. The
   5 | smaller value is decisive.
   6 |  For fastenings with more than one edge (see Figure 14), the resistances for all edges shall be calculated.
   7 | The smaller value is decisive.
   8 |  For groups with fasteners arranged perpendicular to the edge and loaded parallel to the edge or by a
   9 | torsion moment the verification for concrete edge failure is valid for s1 ≥ c1 or c1 ≥ 150 mm.
  10 | NOTE In cases of groups with fasteners arranged perpendicular to the edge and loaded parallel to the edge or by a
  11 | torsion moment where s1 < c1 and c1 < 150 mm the design method for concrete edge failure may yield unconservative
  12 | results.
  13 | 6.3.5.2 Characteristic shear resistance VRk,c
  14 | The characteristic resistance of a fastener or a fastener group (Figure 15) corresponds to:
  15 | s, V h, V ec,V α,V re, V 0
  16 | c, V
  17 | 0 c, V
  18 | Rk, c Rk, c = ⋅ ⋅ψ ⋅ψ ⋅ ψ ⋅ψ ⋅ψ
  19 | A
  20 | A
  21 | V V [N] (33)
  22 | The different factors of Equation (33) are given below.
  23 | 1 2 cr,N
  24 | 1 cr,N
  25 | c,N,2 1 1 cr,N 2
  26 | c,N,1 cr,N 1 cr,N 2
  27 | ( ; )
  28 | ( / 2 ) (0.5 )
  29 | (0.5) / 2) (0.5 )
  30 | c c c
  31 | s s
  32 | A s c s c
  33 | A s s s c
  34 | ≤
  35 | ≤
  36 | = + ⋅ ⋅ +
  37 | = ⋅ + ⋅ ⋅ +
  38 | DD CEN/TS 1992-4-2:2009
  39 | CEN/TS 1992-4-2:2009 (E)
  40 | 24
  41 | 
  42 | Key
  43 | 1 loaded fastener
  44 | 2 unloaded fastener
  45 | a) situation
  46 | b) verification for the left edge
  47 | c) verification for the bottom edge
  48 | Figure 14 — Verification for a quadruple fasting with hole clearance at a corner, example
  49 | Figure 15 — Example of a fastener group loaded perpendicular to the edge
  50 | 6.3.5.2.1 Characteristic resistance of a single anchor
  51 | The initial value of the characteristic resistance of a headed fastener loaded perpendicular to the edge in
  52 | cracked concrete corresponds to:
  53 | 1,5
  54 | Rk,c nom f ck, cube 1 V = 1,6 ⋅ d ⋅ l ⋅ f ⋅ c α β [N] (34)
  55 | with
  56 | α
  57 | α
  58 | sin
  59 | cos
  60 | 2
  61 | 1
  62 | E2 Ed
  63 | E1 Ed
  64 | = ⋅
  65 | = ⋅
  66 | •
  67 | V V
  68 | V V
  69 | o
  70 | DD CEN/TS 1992-4-2:2009
  71 | CEN/TS 1992-4-2:2009 (E)
  72 | 25
  73 | 0,5
  74 | 1
  75 | 0,1 
  76 | 
  77 | 
  78 | 
  79 | 
  80 | 
  81 | 
  82 |  = ⋅ c
  83 | l
  84 | α f [-] (35)
  85 | 0,2
  86 | 1
  87 | nom 0,1 
  88 | 
  89 | 
  90 | 
  91 | 
  92 | 
  93 | 
  94 |  = ⋅ c
  95 | d β [-] (36)
  96 | fck,cube characteristic cube strength of the concrete strength class but noting the limitations
  97 |  given in the relevant European Technical Specification [N/mm2
  98 | ]
  99 | c1 edge distance in the direction of the shear load [mm]
 100 | lf = hef in case of a uniform diameter of the shank of the headed fastener [mm]
 101 |  ≤ 8 dnom
 102 | dnom ≤ 60 mm, [mm]
 103 | The values dnom and lf are given in the relevant European Technical Specification.
 104 | 6.3.5.2.2 Geometric effect of axial spacing, edge distance and member thickness
 105 | The geometrical effect of spacing as well as of further edge distances and the effect of thickness of the
 106 | concrete member on the characteristic resistance is taken into account by the ratio 0
 107 | c, V c, V A /A , where:
 108 | 0
 109 | c, V A = reference projected area, see Figure 16
 110 | = 4,5 2
 111 | 1c (37)
 112 | Ac, V area of the idealized concrete break-out, limited by the overlapping concrete cones of adjacent
 113 |  fasteners (s < 3 c1) as well as by edges parallel to the assumed loading direction (c2 < 1,5 c1) and
 114 |  by member thickness (h < 1,5 c1). Examples for calculation of Ac,V are given in Figure 17.
 115 | Figure 16 — Idealized concrete break-out body and area 0
 116 | c, V A for a single fastener
 117 | DD CEN/TS 1992-4-2:2009
 118 | CEN/TS 1992-4-2:2009 (E)
 119 | 26
 120 | a)
 121 |  Ac, V = 1,5 c1 (1,5 c1 + c2)
 122 |  h ≥ 1,5 c1
 123 |  c2 ≤ 1,5 c1
 124 | b)
 125 |  Ac, V = (2 ⋅ 1,5 c1 + s2) ⋅ h
 126 |  h < 1,5 c1
 127 |  s2 ≤ 3 c1
 128 | c)
 129 |  Ac, V = (1,5 c1 + s2 +⋅c2) ⋅ h
 130 |  h < 1,5 c1
 131 |  s2 ≤ 3 c1
 132 |  c2 ≤ 1,5 c1
 133 | Key
 134 | a) single anchor at a corner
 135 | b) group of anchors at an edge in a thin concrete member
 136 | c) group of anchors at a corner in a thin concrete member
 137 | Figure 17 — Examples of actual projected areas Ac,V of the idealized concrete break-out bodies
 138 | for different fastener arrangements under shear loading
 139 | 6.3.5.2.3 Effect of the disturbance of the distribution of stresses in the concrete due to further
 140 |  edges
 141 | The factor ψs, V takes account of the disturbance of the distribution of stresses in the concrete due to further
 142 | edges of the concrete member on the shear resistance. For fastenings with two edges parallel to the direction
 143 | of loading (e.g. in a narrow concrete member) the smaller edge distance should be inserted in Equation (38).
 144 | 1
 145 | 1,5 0,7 0,3
 146 | 1
 147 | 2
 148 | s, V = + ⋅ ≤
 149 | c
 150 | c
 151 | ψ (38)
 152 | DD CEN/TS 1992-4-2:2009
 153 | CEN/TS 1992-4-2:2009 (E)
 154 | 27
 155 | 6.3.5.2.4 Effect of the thickness of the structural component
 156 | The factor ψh, V takes account of the fact that the concrete edge resistance does not decrease proportionally to
 157 | the member thickness as assumed by the ratio 0
 158 | c, V c, V A /A (Figures 17b) and 17c)).
 159 | 1 15 0 5
 160 | 1
 161 | h, V  ≥ 
 162 |  
 163 | 
 164 |  =
 165 | ,
 166 | h
 167 | , c
 168 | ψ (39)
 169 | 6.3.5.2.5 Effect of the eccentricity of the load
 170 | The factor ψ ec,V takes account into a group effect when different shear loads are acting on the individual
 171 | fasteners of a group (see Figure 18).
 172 | 1
 173 | 1 2 /(3 )
 174 | 1
 175 | V 1
 176 | ec,V ≤
 177 | + ⋅ ⋅ = e c
 178 | ψ (40)
 179 | eV eccentricity of the resulting shear load acting on the fasteners relative to the centre of gravity of
 180 | the fasteners loaded in shear
 181 | Figure 18 — Resolving unequal shear components into an eccentric shear load resultant, example
 182 | 6.3.5.2.6 Effect of load direction
 183 | The factor ψ α,V takes into account the angle α V between the load applied VSd and the direction
 184 | perpendicular to the free edge under consideration for the calculation of the concrete edge resistance (see
 185 | Figure 14).
 186 | 1
 187 | (cos )2 (0.4 sin )
 188 | 1
 189 | 2
 190 | V V
 191 | ,V ≥
 192 | + ⋅
 193 | =
 194 | α α
 195 | ψ α (41)
 196 | DD CEN/TS 1992-4-2:2009
 197 | CEN/TS 1992-4-2:2009 (E)
 198 | 28
 199 | α V = angle between design shear load VSd and a line perpendicular to the edge,
... (103 more lines)
```

#### Extracted Formulas (31 found)

**Formula 1**

```
6.3.5.2 Characteristic shear resistance VRk,c
The characteristic resistance of a fastener or a fastener group (Figure 15) corresponds to:
s, V h, V ec,V α,V re, V 0
c, V
0 c, V
Rk, c Rk, c = ⋅ ⋅ψ ⋅ψ ⋅ ψ ⋅ψ ⋅ψ
A
A
V V [N] (33)
The different factors of Equation (33) are given below.
1 2 cr,N
1 cr,N
c,N,2 1 1 cr,N 2
c,N,1 cr,N 1 cr,N 2
( ; )
```

**Formula 2** - Reference (0.5)

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
```

**Formula 3**

```
Figure 15 — Example of a fastener group loaded perpendicular to the edge
6.3.5.2.1 Characteristic resistance of a single anchor
The initial value of the characteristic resistance of a headed fastener loaded perpendicular to the edge in
cracked concrete corresponds to:
1,5
Rk,c nom f ck, cube 1 V = 1,6 ⋅ d ⋅ l ⋅ f ⋅ c α β [N] (34)
with
α
α
sin
cos
2
1
E2 Ed
E1 Ed
```

**Formula 4**

```
d β [-] (36)
fck,cube characteristic cube strength of the concrete strength class but noting the limitations
 given in the relevant European Technical Specification [N/mm2
]
c1 edge distance in the direction of the shear load [mm]
lf = hef in case of a uniform diameter of the shank of the headed fastener [mm]
 ≤ 8 dnom
dnom ≤ 60 mm, [mm]
The values dnom and lf are given in the relevant European Technical Specification.
6.3.5.2.2 Geometric effect of axial spacing, edge distance and member thickness
The geometrical effect of spacing as well as of further edge distances and the effect of thickness of the
concrete member on the characteristic resistance is taken into account by the ratio 0
c, V c, V A /A , where:
0
c, V A = reference projected area, see Figure 16
```

**Formula 5**

```
6.3.5.2.2 Geometric effect of axial spacing, edge distance and member thickness
The geometrical effect of spacing as well as of further edge distances and the effect of thickness of the
concrete member on the characteristic resistance is taken into account by the ratio 0
c, V c, V A /A , where:
0
c, V A = reference projected area, see Figure 16
= 4,5 2
1c (37)
Ac, V area of the idealized concrete break-out, limited by the overlapping concrete cones of adjacent
 fasteners (s < 3 c1) as well as by edges parallel to the assumed loading direction (c2 < 1,5 c1) and
 by member thickness (h < 1,5 c1). Examples for calculation of Ac,V are given in Figure 17.
Figure 16 — Idealized concrete break-out body and area 0
c, V A for a single fastener
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
```

**Formula 6**

```
c, V A for a single fastener
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
26
a)
 Ac, V = 1,5 c1 (1,5 c1 + c2)
 h ≥ 1,5 c1
 c2 ≤ 1,5 c1
b)
 Ac, V = (2 ⋅ 1,5 c1 + s2) ⋅ h
 h < 1,5 c1
 s2 ≤ 3 c1
c)
 Ac, V = (1,5 c1 + s2 +⋅c2) ⋅ h
 h < 1,5 c1
```

**Formula 7**

```
a)
 Ac, V = 1,5 c1 (1,5 c1 + c2)
 h ≥ 1,5 c1
 c2 ≤ 1,5 c1
b)
 Ac, V = (2 ⋅ 1,5 c1 + s2) ⋅ h
 h < 1,5 c1
 s2 ≤ 3 c1
c)
 Ac, V = (1,5 c1 + s2 +⋅c2) ⋅ h
 h < 1,5 c1
 s2 ≤ 3 c1
 c2 ≤ 1,5 c1
Key
a) single anchor at a corner
```

**Formula 8**

```
b)
 Ac, V = (2 ⋅ 1,5 c1 + s2) ⋅ h
 h < 1,5 c1
 s2 ≤ 3 c1
c)
 Ac, V = (1,5 c1 + s2 +⋅c2) ⋅ h
 h < 1,5 c1
 s2 ≤ 3 c1
 c2 ≤ 1,5 c1
Key
a) single anchor at a corner
b) group of anchors at an edge in a thin concrete member
c) group of anchors at a corner in a thin concrete member
Figure 17 — Examples of actual projected areas Ac,V of the idealized concrete break-out bodies
for different fastener arrangements under shear loading
```

**Formula 9**

```
of loading (e.g. in a narrow concrete member) the smaller edge distance should be inserted in Equation (38).
1
1,5 0,7 0,3
1
2
s, V = + ⋅ ≤
c
c
ψ (38)
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
27
6.3.5.2.4 Effect of the thickness of the structural component
The factor ψh, V takes account of the fact that the concrete edge resistance does not decrease proportionally to
the member thickness as assumed by the ratio 0
```

**Formula 10**

```
α α
ψ α (41)
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
28
α V = angle between design shear load VSd and a line perpendicular to the edge,
0° ≤ α V ≤ 90°, see Figure 14
6.3.5.2.7 Effect of the position of the fastening
The factor ψre, V takes account of the effect of the position of the fastening in cracked or non-cracked concrete
or of the type of reinforcement on the edge.
ψre, V = 1,0 fastening in cracked concrete without edge reinforcement or stirrups
ψre, V = 1,2 fastening in cracked concrete with straight edge reinforcement (> Ø 12 mm)
ψre, V = 1,4 fastening in cracked concrete with edge reinforcement and closely spaced stirrups or wire
mesh with a spacing a < 100 mm and a ≤ 2 c1, or
 fastening in non-cracked concrete (verification according to Part 1, Section 5)
```

**Formula 11**

```
α V = angle between design shear load VSd and a line perpendicular to the edge,
0° ≤ α V ≤ 90°, see Figure 14
6.3.5.2.7 Effect of the position of the fastening
The factor ψre, V takes account of the effect of the position of the fastening in cracked or non-cracked concrete
or of the type of reinforcement on the edge.
ψre, V = 1,0 fastening in cracked concrete without edge reinforcement or stirrups
ψre, V = 1,2 fastening in cracked concrete with straight edge reinforcement (> Ø 12 mm)
ψre, V = 1,4 fastening in cracked concrete with edge reinforcement and closely spaced stirrups or wire
mesh with a spacing a < 100 mm and a ≤ 2 c1, or
 fastening in non-cracked concrete (verification according to Part 1, Section 5)
A factor ψre, V > 1 for applications in cracked concrete should only be applied, if the embedment depth hef of
the fastener is hef ≥ 2,5 times the concrete cover of the edge reinforcement.
6.3.5.2.8 Effect of a narrow thin member
For fastenings in a narrow, thin member with c2,max < 1,5 c1 and h < 1,5 c1 (see Figure 19) the calculation
according to Equation (33) leads to conservative results. More precise results are achieved if c1 is limited in
```

**Formula 12**

```
0° ≤ α V ≤ 90°, see Figure 14
6.3.5.2.7 Effect of the position of the fastening
The factor ψre, V takes account of the effect of the position of the fastening in cracked or non-cracked concrete
or of the type of reinforcement on the edge.
ψre, V = 1,0 fastening in cracked concrete without edge reinforcement or stirrups
ψre, V = 1,2 fastening in cracked concrete with straight edge reinforcement (> Ø 12 mm)
ψre, V = 1,4 fastening in cracked concrete with edge reinforcement and closely spaced stirrups or wire
mesh with a spacing a < 100 mm and a ≤ 2 c1, or
 fastening in non-cracked concrete (verification according to Part 1, Section 5)
A factor ψre, V > 1 for applications in cracked concrete should only be applied, if the embedment depth hef of
the fastener is hef ≥ 2,5 times the concrete cover of the edge reinforcement.
6.3.5.2.8 Effect of a narrow thin member
For fastenings in a narrow, thin member with c2,max < 1,5 c1 and h < 1,5 c1 (see Figure 19) the calculation
according to Equation (33) leads to conservative results. More precise results are achieved if c1 is limited in
case of single fasteners to the larger value of
```

**Formula 13**

```
6.3.5.2.7 Effect of the position of the fastening
The factor ψre, V takes account of the effect of the position of the fastening in cracked or non-cracked concrete
or of the type of reinforcement on the edge.
ψre, V = 1,0 fastening in cracked concrete without edge reinforcement or stirrups
ψre, V = 1,2 fastening in cracked concrete with straight edge reinforcement (> Ø 12 mm)
ψre, V = 1,4 fastening in cracked concrete with edge reinforcement and closely spaced stirrups or wire
mesh with a spacing a < 100 mm and a ≤ 2 c1, or
 fastening in non-cracked concrete (verification according to Part 1, Section 5)
A factor ψre, V > 1 for applications in cracked concrete should only be applied, if the embedment depth hef of
the fastener is hef ≥ 2,5 times the concrete cover of the edge reinforcement.
6.3.5.2.8 Effect of a narrow thin member
For fastenings in a narrow, thin member with c2,max < 1,5 c1 and h < 1,5 c1 (see Figure 19) the calculation
according to Equation (33) leads to conservative results. More precise results are achieved if c1 is limited in
case of single fasteners to the larger value of

```

**Formula 14**

```
max ' 2,max
1 h
c
c (42)
with
c2,max = largest of the two edge distances parallel to the direction of loading
or in case of groups c1 is limited to the largest value of





=
/3
/1,5
```

**Formula 15**

```
s
h
c
c (43)
with
smax = maximum spacing between fasteners within the group
The value '
1c is inserted in Equations (34) to (40) as well as in the determination of the areas 0
c, V A and c, V A
according to Figures 16 and 17.
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
29
if c2,1 and c2,2
< 1,5 c1
```

**Formula 16**

```
Figure 19 — Example of a fastener in a thin, narrow member where the value '
1c may be used
NOTE An example for the calculation of '
1c is illustrated in Figure 20.
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
```

**Formula 17**

```
Figure 20 — Illustration of the calculation of the value '
1c , example
6.3.5.3 Steel failure of supplementary reinforcement
The characteristic resistance of one fastener in case of steel failure of the supplementary reinforcement may
be calculated according to Equation (44).
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44)
with
k6 = efficiency factor
 = 1,0 surface reinforcement according to Figure 9
 = 0,5 supplementary reinforcement according to Figure 10
n = number of bars of the supplementary reinforcement of one fastener
As = cross section of one bar of the supplementary reinforcement
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
30
```

**Formula 18**

```
6.3.5.3 Steel failure of supplementary reinforcement
The characteristic resistance of one fastener in case of steel failure of the supplementary reinforcement may
be calculated according to Equation (44).
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44)
with
k6 = efficiency factor
 = 1,0 surface reinforcement according to Figure 9
 = 0,5 supplementary reinforcement according to Figure 10
n = number of bars of the supplementary reinforcement of one fastener
As = cross section of one bar of the supplementary reinforcement
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
30
fyk = nominal yield strength of the supplementary reinforcement ≤ 500 N/mm²
NOTE The factor k6 = 0,5 for supplementary reinforcement according to Figure 10 takes account of unavoidable
```

**Formula 19**

```
The characteristic resistance of one fastener in case of steel failure of the supplementary reinforcement may
be calculated according to Equation (44).
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44)
with
k6 = efficiency factor
 = 1,0 surface reinforcement according to Figure 9
 = 0,5 supplementary reinforcement according to Figure 10
n = number of bars of the supplementary reinforcement of one fastener
As = cross section of one bar of the supplementary reinforcement
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
30
fyk = nominal yield strength of the supplementary reinforcement ≤ 500 N/mm²
NOTE The factor k6 = 0,5 for supplementary reinforcement according to Figure 10 takes account of unavoidable
tolerances in workmanship.
```

**Formula 20**

```
be calculated according to Equation (44).
NRk, re = k6 ⋅ n ⋅As ⋅ fyk (44)
with
k6 = efficiency factor
 = 1,0 surface reinforcement according to Figure 9
 = 0,5 supplementary reinforcement according to Figure 10
n = number of bars of the supplementary reinforcement of one fastener
As = cross section of one bar of the supplementary reinforcement
DD CEN/TS 1992-4-2:2009
CEN/TS 1992-4-2:2009 (E)
30
fyk = nominal yield strength of the supplementary reinforcement ≤ 500 N/mm²
NOTE The factor k6 = 0,5 for supplementary reinforcement according to Figure 10 takes account of unavoidable
tolerances in workmanship.
6.3.5.4 Anchorage failure of supplementary reinforcement in the concrete breakout body
```


---

## Recommended Python Implementation Structure

### 1. Core Classes

```python
class Fastener:
    """Base fastener with geometry and material properties"""
    def __init__(self, diameter, embedment_depth, steel_grade, ...):
        self.d = diameter  # Fastener diameter [mm]
        self.hef = embedment_depth  # Effective embedment depth [mm]
        self.fuk = steel_grade  # Characteristic tensile strength [MPa]
        # ... other properties

class FastenerGroup:
    """Group of fasteners with spacing and edge distances"""
    def __init__(self, fasteners: List[Fastener], spacings, edge_distances):
        self.fasteners = fasteners
        self.s = spacings  # Spacing between fasteners [mm]
        self.c = edge_distances  # Edge distances [mm]

class ConcreteProperties:
    """Concrete material properties"""
    def __init__(self, fck, h, cracked=False):
        self.fck = fck  # Characteristic cylinder strength [MPa]
        self.h = h  # Member thickness [mm]
        self.cracked = cracked  # Cracked/non-cracked concrete
```

### 2. Failure Mode Functions

Each failure mode should be implemented as a separate function/class:

```python
def steel_failure_tension(fastener: Fastener, gamma_Ms=1.2) -> float:
    """
    Calculate steel failure capacity in tension

    Standard: EC2-4-2 Section 6.2.3
    Formula: (6.1) or similar

    Args:
        fastener: Fastener object
        gamma_Ms: Partial factor for steel (default 1.2)

    Returns:
        NRk_s: Characteristic resistance [N]
    """
    pass

def concrete_cone_failure(fastener: Fastener, concrete: ConcreteProperties,
                         group: FastenerGroup = None, gamma_Mc=1.5) -> float:
    """
    Calculate concrete cone failure capacity

    Standard: EC2-4-2 Section 6.2.5
    Formulas: Multiple formulas for geometry effects

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        group: Optional fastener group for spacing effects
        gamma_Mc: Partial factor for concrete

    Returns:
        NRk_c: Characteristic resistance [N]
    """
    pass

def concrete_edge_failure_shear(fastener: Fastener, concrete: ConcreteProperties,
                               edge_distance: float, gamma_Mc=1.5) -> float:
    """
    Calculate concrete edge failure under shear

    Standard: EC2-4-2 Section 6.3.5

    Args:
        fastener: Fastener properties
        concrete: Concrete properties
        edge_distance: Distance to edge parallel to load [mm]
        gamma_Mc: Partial factor

    Returns:
        VRk_c: Characteristic shear resistance [N]
    """
    pass

# Similar functions for:
# - pullout_failure()
# - splitting_failure()
# - blowout_failure()
# - steel_failure_shear()
# - pryout_failure()
```

### 3. Main Design Class

```python
class FastenerDesign:
    """Main class to perform fastener design checks"""

    def __init__(self, fastener, concrete, loading, edge_distances, spacings=None):
        self.fastener = fastener
        self.concrete = concrete
        self.NEd = loading.get('tension', 0)  # Design tension [N]
        self.VEd = loading.get('shear', 0)  # Design shear [N]
        self.edge_distances = edge_distances
        self.spacings = spacings

    def check_tension(self, failure_modes='all'):
        """
        Check all or specified tension failure modes

        Returns dict with capacity for each mode and governing mode
        """
        results = {}

        if 'steel' in failure_modes or failure_modes == 'all':
            results['steel'] = steel_failure_tension(self.fastener)

        if 'cone' in failure_modes or failure_modes == 'all':
            results['cone'] = concrete_cone_failure(...)

        # ... check all modes

        governing = min(results, key=results.get)
        return {'capacities': results, 'governing': governing}

    def check_shear(self, failure_modes='all'):
        """Check shear failure modes"""
        pass

    def check_combined(self):
        """Check tension-shear interaction"""
        pass
```

### 4. Next Steps for Implementation

1. Review all extracted formulas in sections above
2. For each formula, identify:
   - All input parameters
   - All psi/alpha/beta factors and how they're calculated
   - Units for all quantities
   - Conditions of applicability
3. Implement each formula as a Python function with:
   - Complete docstring citing standard section
   - Type hints
   - Input validation
   - Unit tests
4. Create validation examples from standard worked examples
5. Build user interface for input/output

