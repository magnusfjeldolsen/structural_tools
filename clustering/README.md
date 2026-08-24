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

Colour is an **ordinal ramp, not a categorical palette** — clusters are ordered by
value, so swapping two of them changes the meaning, which is the `dataviz` skill's own
test for ordinal. One blue hue, monotone lightness steps, sampled from the reference
palette and validated with
`validate_palette.js --ordinal --mode dark --surface #131c2e`: all four checks pass for
k = 2…6 (monotone lightness, adjacent ΔL ≥ 0,06, light-end contrast 2,10:1, single hue).

**Above k = 6 the ramp cannot keep its steps 0,06 apart** — the eleven documented steps
span ΔL ≈ 0,47 in total. Beyond six, colour degrades to a magnitude cue and identity is
carried by the break lines and the legend, which are present at every k. The tool says
so rather than pretending otherwise.

## Choosing k

A strip of bars shows within-cluster spread for k = 1…10, with the elbow marked.
Compressed to a 0,4 power so the shape reads — the raw curve collapses so steeply that
every bar past k = 2 would be flat. Clicking a bar sets k. It is advisory and labelled
as such.

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
| `test.js` | 49 verification vectors — `node test.js` |
