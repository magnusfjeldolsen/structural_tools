# 1D Clustering

Paste a table, split one numeric column into natural groups, see the result as an
interactive plot, and send it back to the sheet it came from.

Live: <https://magnusfjeldolsen.github.io/structural_tools/clustering/>

## What it does

Given a column of numbers — utilisations, lengths, loads, anything that wants binning
— it finds the k groupings that minimise within-group spread, numbers them **low to
high**, and shows every point coloured by its band.

Below 2000 values the split is the **exact optimum** for the chosen k, by dynamic
programme (Fisher–Jenks). Above that a quantile-seeded Lloyd pass takes over and the
plot says which route was used.

## Why it was rewritten

The previous version had real defects, not just dated styling:

- It seeded k-means from **the first k rows in file order**, so the same numbers in a
  different order gave a different answer, and empty clusters were possible.
- Cluster IDs were arbitrary, so "cluster 0" was not the lowest band.
- `val.replace(',', '.')` replaced only the **first** comma, so `1,234.5` became
  `1.234.5` → NaN. Norwegian `1 234,5` failed too.
- The header had to be row 1. A title row or a blank line above it produced garbage
  column names.
- CSV file upload only, with no way to paste.
- No visualisation, so there was no way to see whether a split was sensible.
- No Google Analytics tag and no meta description, contrary to the repo convention —
  which also left it close to invisible to the module registry.

`SPEC.md` lists these as C1–C10 with the fix for each.

## Input

**Paste is the primary path.** Ctrl+V straight from Excel or Sheets. Tab, semicolon,
comma and pipe are detected by scoring how consistently each produces the same field
count; the decimal mark is detected the same way and both are overridable. File
picker and drag-and-drop are there as well.

**The header row is chosen by pointing at it.** The grid is parsed without assuming
one, the first 15 rows are shown with their file line numbers, and clicking a row
makes it the header — rows above it dim out and are excluded. Auto-detection scores
each row on how filled, how textual and how unique it is, and requires the row below
to contain a number. A row of pure numbers is never treated as a header. "No header
row" names the columns A, B, C…

**Columns are chosen from chips, not a dropdown.** Each chip shows the column name,
how many of its values parse as numbers, and its range. Columns with no numbers are
dimmed and cannot be selected, so an unusable choice is impossible rather than
reported after the fact.

## The plot

Row order on x, the clustered value on y, one point per row. Cluster breaks are drawn
as dashed rules with their values, so the partition is legible as bands. Hovering a
point shows **its whole row**; clicking pins it, Esc unpins.

Colour is a **spectral ramp** — violet for the lowest band through blue, cyan, green
and yellow to red for the highest. Built in **OKLCH** rather than HSL, with hue swept
and lightness following each hue's natural peak, which is what keeps the steps evenly
spaced instead of banding at bright yellow and dark blue the way a naive rainbow does.
Chroma is fitted per step to the most saturated value that still lands inside sRGB.

Run through `validate_palette.js --mode dark --pairs all`, it passes contrast and
chroma at every k, passes CVD and normal-vision separation to k = 5, and holds
normal-vision separation to k = 6. Two things it does not pass, worth stating plainly:

- The **lightness band** fails by construction — a real spectrum has a bright yellow,
  and forcing yellow into the dark band turns it olive.
- **Red↔green cannot clear the colour-vision gate at any k.** They are the poles of the
  spectrum and the axis of protan/deutan confusion. That is a real cost for roughly
  8 % of male readers, and it is the price of a rainbow.

So identity never rests on colour alone: cluster breaks are drawn as labelled dashed
rules, the bands carry **C1…Ck** labels in the right margin, the legend gives every
cluster its count and range, and the results table has a `Cluster` column. Above k = 6
the tool says outright that neighbouring hues are no longer reliably separable.

## Choosing k

A strip of bars shows within-cluster spread for k = 1…10, with the elbow marked.
Compressed to a 0,4 power so the shape reads — the raw curve collapses so steeply that
every bar past k = 2 would be flat. Clicking a bar sets k. It is advisory and labelled
as such.

## Cluster statistics

A second table below the results gives one row per cluster and an "All" row: n and
share, min, max, mean, median, sd, band width, the gap to the next cluster, and two
derived numbers worth explaining.

**density** is the cluster's share of the rows divided by its share of the value axis.
Deliberately dimensionless — raw points-per-unit means nothing without knowing the
units and changes the moment the column is rescaled, whereas a share-over-share ratio
does not. `1,0×` is exactly as dense as an even spread, higher is tighter, below `1,0×`
is more strung out. Zero-width bands report `—` rather than dividing by zero.

**silhouette** is the standard cluster-quality number: how much closer a point sits to
its own cluster than to the nearest other one, in [−1, 1]. 1 is cleanly separated, 0 is
on the boundary, negative means probably in the wrong cluster. Computed with prefix sums
over the sorted groups, so the whole table costs `O(n·k·log n)` rather than `O(n²)`.

The "All" row adds the share of total spread the clustering accounts for, `1 − WCSS/TSS`.
Copy the whole table as TSV with one button.

**Every metric is explained at the bottom of the page** — what it measures, how to read a
typical value, and which of three questions it answers: *is k right?* (silhouette and the
elbow, never the percentage of spread, which rises with k by construction), *is this band
a real group?* (its gap against the widths either side), *is this band too loose?*
(density near 1,0× with a large width).

The note under the table is dynamic rather than boilerplate: it names the weakest band if
one is below 0,5 silhouette, names any band sparser than an even spread, and otherwise
points at the widest band as the next candidate for splitting.

## Output

- **Copy for Excel (TSV)** — the inverse of the paste-in path
- **Download CSV** — separator follows the decimal mark, so `,` decimals give a
  `;`-delimited file that reopens cleanly
- Both carry the original columns plus `Cluster`, optionally `ClusterMin`/`ClusterMax`

Rows whose value does not parse are kept, marked `—`, and counted in the status line.
They are never silently dropped.

## Files

| file | role |
|---|---|
| `cluster_api.js` | parsing, detection and clustering; pure, no DOM, `module.exports` under Node |
| `script.js` | form reading, chart painting, hover |
| `index.html` | single-page UI |
| `SPEC.md` | the contract, with the defect list it was written against |
| `test.js` | 70 verification vectors — `node test.js` |
