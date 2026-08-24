# Build spec — 1D clustering tool

Rewrite of `clustering/`. Contract for `cluster_api.js` (pure, no DOM) and the
behaviour of `script.js` (UI + chart).

---

## 0. What is wrong with the current tool

Worth stating, because several of these are correctness bugs rather than polish.

| # | Problem | Consequence |
|---|---|---|
| C1 | `centroids = data.slice(0, k)` seeds k-means from the **first k rows in file order** | Order-dependent, frequently converges to a poor partition, and can leave empty clusters. Two files with the same numbers in a different order give different answers. |
| C2 | No convergence test — always 100 iterations | Wasteful, and hides non-convergence |
| C3 | Cluster IDs are arbitrary | "Cluster 0" is not the lowest band, so the output cannot be read without cross-referencing |
| C4 | `val.trim().replace(",", ".")` replaces only the **first** comma | `1,234.5` becomes `1.234.5` → NaN. Norwegian `1 234,5` also fails |
| C5 | `header: true` | The header must be row 1. A file with a title row or blank rows above it parses into garbage column names |
| C6 | Column `<select>` lists every column | No indication which are numeric; picking a text column produces an alert after the fact |
| C7 | No visualisation | The user cannot see whether the clustering is sensible |
| C8 | File upload only | The common case is a block copied out of Excel |
| C9 | `alert()` for every error | Modal, ugly, loses context |
| C10 | No Google Analytics tag, no meta description/keywords | Violates the repo convention in CLAUDE.md; the module registry indexes `<title>`/`<meta>` so it is close to invisible in search |

---

## 1. Input

**Paste is the primary path.** A focused textarea; Ctrl+V a block copied from
Excel, Sheets or a text file. Excel copies as TSV, which is why tab must be a
first-class delimiter. Secondary: file picker and drag-and-drop for `.csv` / `.txt`
/ `.tsv`. Tertiary: a "load example" button so the tool is explorable with no data
to hand.

### 1.1 Delimiter detection

Candidates: tab, `;`, `,`, `|`. For each, split every line and score by

```
score = (rows with the modal field count) / rows      tie-break on higher modal field count
```

Highest score wins; `auto` is the default and the resolved choice is displayed and
overridable.

### 1.2 Decimal separator

The Norwegian case is `;`-delimited with `,` decimals, so this cannot be assumed.

```
detectDecimal(cells):
  commaLooksDecimal = count of cells matching /^-?\d+,\d+$/
  dotLooksDecimal   = count of cells matching /^-?\d+\.\d+$/
  → whichever is larger; tie → '.'
```

Exposed as auto / `.` / `,` and overridable.

### 1.3 Number parsing

One function, used everywhere:

```
toNumber(raw, decimal):
  strip spaces, non-breaking spaces, apostrophes (thousands marks)
  if decimal is ',':  remove all '.'  then replace ',' with '.'
  else:               remove all ','
  strip a trailing unit suffix?  NO — out of scope, return null
  return Number(s) if finite else null
```

`1 234,5` → 1234.5. `1,234.5` → 1234.5. `12,5` → 12.5. Never a partial replace.

---

## 2. Header row

The grid is parsed **without** a header (`header: false`), giving `string[][]`.
The user then designates which row is the header.

### 2.1 Auto-detection

```
score each row r in the first 20:
  filled   = non-empty cells / max column count
  textish  = non-numeric non-empty cells / non-empty cells
  unique   = distinct non-empty cells / non-empty cells
  score    = filled*1.0 + textish*1.5 + unique*0.5
  and the row below it must contain at least one numeric cell
pick the highest score; if none qualifies, headerRow = -1 (no header)
```

### 2.2 Control

The preview grid shows the first 15 rows with their **file line numbers**. Each row
carries a radio in a leading column; clicking anywhere on the row designates it.
Rows above the header render dimmed and are excluded. A "no header row" option
names the columns `A`, `B`, `C`… .

Duplicate or blank header names are made unique: `""` → `A`/`B`/…, `Foo`, `Foo` →
`Foo`, `Foo (2)`.

---

## 3. Column picker

Replaces the `<select>`. One chip per column, in a wrapping strip:

```
┌──────────────┐
│ max_util     │   ← name
│ 48/50 num    │   ← how many data rows parse as numbers
│ 10,2 … 43,8  │   ← range, in the active decimal notation
└──────────────┘
```

- Columns with **zero** numeric values are shown dimmed and are not selectable,
  with the reason on hover. This kills C6: unsuitable columns cannot be chosen.
- Clicking a chip selects it as the value column. Exactly one is selected.
- Default: the numeric column with the highest numeric ratio; ties → leftmost.
- A separate small select chooses the **label column** used for the x axis and the
  tooltip heading. Default: the leftmost non-numeric column, else "row number".

---

## 4. Clustering

### 4.1 Algorithm

Ordered 1-D clustering has an exact solution, so use it where it is affordable.

```
n = number of numeric values
if n <= 2000:  Fisher–Jenks exact dynamic programme   (optimal)
else:          Lloyd with quantile seeding             (fast, deterministic)
```

**Fisher–Jenks.** Sort ascending. With prefix sums `S1`, `S2`,

```
ssq(a,b) = (S2[b]-S2[a-1]) - (S1[b]-S1[a-1])^2 / (b-a+1)
D[j][i]  = min over m in [j-1, i-1] of  D[j-1][m] + ssq(m+1, i)
```

`D[k][n]` is the minimal within-cluster sum of squares; backtrack the argmin to get
the breaks. O(k·n²) time, O(k·n) memory. At n = 2000, k = 10 that is 4·10⁷
inner steps — under a second, and it runs once per parameter change.

**Lloyd fallback.** Seed centroids at the `(i+0.5)/k` quantiles of the sorted
values — deterministic and already close to optimal in 1-D. Iterate to a stable
assignment, cap 100. Re-seed any empty cluster at the point furthest from its
centroid.

### 4.2 Cluster numbering

Clusters are **numbered 1..k in ascending value order**, always. Cluster 1 holds
the smallest values. This is what makes the output readable without a cross-check
and fixes C3. Output column is `Cluster` (integer), plus `ClusterMin`,
`ClusterMax` if "include cluster stats" is on.

### 4.3 Per-cluster statistics

For each cluster: `n`, `min`, `max`, `mean`, `range`, and the break value to the
next cluster (the midpoint between this cluster's max and the next cluster's min).

### 4.4 Choosing k

A compact strip showing within-cluster sum of squares for k = 1…10, normalised to
WCSS(1), as a small bar row. The **elbow** — the k maximising the distance from the
straight line joining (1, WCSS₁) and (10, WCSS₁₀) — is marked. Clicking a bar sets
k. This is advisory and labelled as such; it is not a claim about the correct k.

Rows whose value does not parse are kept, flagged `Cluster = —`, and reported as a
count. They are never silently dropped.

---

## 5. Visualisation

Built to the `dataviz` skill. Inline SVG, no chart library.

### 5.1 Form

Scatter: **x = row order** (or the label column's value when it is numeric),
**y = the clustered value**. Every row is one point, so the reader sees the raw
distribution, not a summary. Horizontal rules at the cluster breaks make the
partition legible as bands.

### 5.2 Colour — ordinal, not categorical

Clusters are ordered by value, and swapping two of them changes the meaning, so by
the skill's own test this is an **ordinal** encoding, not a categorical one: one
hue, monotone lightness steps. This is also why the scatter is not subject to the
categorical all-pairs series cap.

Blue ramp from `references/palette.md`, sampled evenly across the 11 documented
steps. Validated with `validate_palette.js --ordinal --mode dark --surface #131c2e`:

| k | steps | result |
|---|---|---|
| 2 | `#cde2fb,#184f95` | PASS |
| 3 | `#cde2fb,#5598e7,#184f95` | PASS |
| 4 | `#cde2fb,#86b6ef,#2a78d6,#184f95` | PASS |
| 5 | `#cde2fb,#86b6ef,#5598e7,#256abf,#184f95` | PASS |
| 6 | `#cde2fb,#9ec5f4,#6da7ec,#3987e5,#256abf,#184f95` | PASS |

All four ordinal checks pass in every case — monotone lightness, adjacent ΔL ≥ 0,06,
light-end contrast 2,10:1 against the surface, single hue (spread 4°).

**Above k = 6 the ramp cannot keep adjacent steps 0,06 apart** — the 11 documented
steps span ΔL ≈ 0,47 in total, so six is the maximum that stays visibly distinct.
Beyond six the ramp is interpolated and colour degrades to a pure magnitude cue;
identity is then carried entirely by the break lines and the labelled legend, which
are present at every k. The UI states this rather than pretending otherwise.

Low values take the light end, high values the dark end — the reverse of the
light-mode convention, because on a dark surface the light step is the prominent
one and the high band is the one the reader is usually hunting for.

### 5.3 Marks and anatomy

- Points: `r = 3,5`, 1px surface-coloured ring so overlaps stay countable
- Grid: horizontal only, 1px, `#22304a`; axes in `--text-secondary`
- Break lines: 1px dashed `#44607f`, labelled with the break value at the right
- Legend: always present — one row per cluster with its colour chip, `n`, and range.
  Identity is never colour-alone.
- Band labels at the right edge of the plot: `C1`…`Ck`

### 5.4 Hover

Per-point tooltip, since this is a dot form. Nearest-point hit testing within 14px
so small marks stay reachable. The tooltip lists **every column of that row**,
which is the requirement, with the label column as its heading and the value column
and cluster highlighted. Follows the cursor, flips at the viewport edge, and is
suppressed when the pointer leaves the plot.

Click pins a point so it survives pointer movement; click again or Esc unpins.

### 5.5 Table view

The results table below the chart is the required non-visual equivalent, sorted by
the original row order, with the cluster column tinted by the same ramp.

---

## 6. Output

- **Copy to clipboard as TSV** — the inverse of the paste-in path, so the result
  goes straight back into the sheet it came from. This is the primary action.
- **Download CSV**, using the active delimiter and decimal separator so it reopens
  cleanly in the same locale.
- Both include the original columns plus `Cluster`, and optionally `ClusterMin`,
  `ClusterMax`.

---

## 7. `cluster_api.js` contract

```js
detectDelimiter(text)                 -> { delimiter, confidence, counts }
detectDecimal(rows)                   -> ',' | '.'
toNumber(raw, decimal)                -> number | null
parseGrid(text, delimiter)            -> string[][]
detectHeaderRow(grid)                 -> number            // -1 = none
buildTable(grid, headerRow)           -> { columns:string[], rows:string[][] }
profileColumns(table, decimal)        -> [{ name, index, numericCount, total, min, max, numeric }]
clusterValues(values, k)              -> { assign:int[], breaks:number[], centroids:number[],
                                           wcss:number, method:'exact'|'lloyd' }
clusterStats(values, assign, k)       -> [{ id, n, min, max, mean, range }]
elbowScan(values, kMax)               -> [{ k, wcss, normalised }], elbowK
rampFor(k)                            -> string[]          // the validated ordinal steps
```

Pure, deterministic, `module.exports` under Node so `test.js` can run it.

---

## 8. Housekeeping

- Google Analytics tag immediately after `<head>`, per CLAUDE.md — currently absent.
- `<title>`, `<meta name="description">`, `<meta name="keywords">` so the registry
  generator can index it.
- Keep the folder name `clustering` — it is already in the deploy copy-loop
  allowlist and the `paths:` trigger, and renaming would 404 the existing URL.

---

## 9. Test vectors (`node clustering/test.js`)

| case | expectation |
|---|---|
| `"a;b\n1;2"` | delimiter `;` |
| `"a\tb\n1\t2"` | delimiter tab |
| `"12,5"`, decimal `,` | 12.5 |
| `"1 234,5"`, decimal `,` | 1234.5 |
| `"1,234.5"`, decimal `.` | 1234.5 |
| `"1.234,5"`, decimal `,` | 1234.5 |
| `"abc"` | null |
| grid with 2 blank rows then a header | `detectHeaderRow` → 2 |
| grid with no text row | `detectHeaderRow` → -1 |
| `[10,12,11,40,42,43]`, k=2 | clusters `[1,1,1,2,2,2]`, exact |
| same values shuffled, k=2 | same partition — order independence, which the old code failed |
| `[1,2,3,4,5,6,7,8,9]`, k=3 | `[1,1,1,2,2,2,3,3,3]` |
| ascending numbering | cluster 1 min < cluster 2 min for every k |
| duplicate headers `Foo,Foo` | → `Foo`, `Foo (2)` |
| `rampFor(k)` for k = 2…6 | matches the validated table in §5.2 |
| k > n | error, not a crash |
