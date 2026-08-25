// Verification vectors for cluster_api.js.  Run:  node test.js
const A = require('./cluster_api.js');

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '\n      got  ' + g + '\n      want ' + w));
}
function near(name, got, want, tol) {
  const ok = got != null && Math.abs(got - want) <= (tol || 1e-9);
  ok ? pass++ : fail++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + '  got=' + got + ' want=' + want);
}

// ---- delimiter detection
eq('delimiter semicolon', A.detectDelimiter('a;b;c\n1;2;3\n4;5;6').delimiter, ';');
eq('delimiter tab', A.detectDelimiter('a\tb\n1\t2\n3\t4').delimiter, '\t');
eq('delimiter comma', A.detectDelimiter('a,b\n1,2\n3,4').delimiter, ',');
eq('delimiter pipe', A.detectDelimiter('a|b\n1|2\n3|4').delimiter, '|');

// ---- decimal detection
eq('decimal comma', A.detectDecimal([['12,5'], ['13,25'], ['x']]), ',');
eq('decimal point', A.detectDecimal([['12.5'], ['13.25'], ['x']]), '.');

// ---- number parsing (the bug the old tool had: replace(',', '.') only hit the first)
near('12,5 as comma-decimal', A.toNumber('12,5', ','), 12.5);
near('1 234,5 as comma-decimal', A.toNumber('1 234,5', ','), 1234.5);
near('1.234,5 as comma-decimal', A.toNumber('1.234,5', ','), 1234.5);
near('1,234.5 as point-decimal', A.toNumber('1,234.5', '.'), 1234.5);
near('plain integer', A.toNumber('42', '.'), 42);
near('negative', A.toNumber('-3.5', '.'), -3.5);
near('exponent', A.toNumber('1e3', '.'), 1000);
eq('text is not a number', A.toNumber('abc', '.'), null);
eq('empty is not a number', A.toNumber('   ', '.'), null);
eq('old bug 1,234.5 no longer mangles', A.toNumber('1,234.5', '.') === 1234.5, true);

// ---- header row detection with a preamble
const preamble = A.parseGrid('Report of things\n\nID;max_util\nA;10\nB;12', ';');
eq('header row after preamble', A.detectHeaderRow(preamble), 2);
const noHeader = A.parseGrid('1;10\n2;12\n3;14', ';');
eq('no header row', A.detectHeaderRow(noHeader), -1);

// ---- table build
const t1 = A.buildTable(preamble, 2);
eq('columns from header', t1.columns, ['ID', 'max_util']);
eq('rows below header only', t1.rows.length, 2);
const t2 = A.buildTable(noHeader, -1);
eq('synthetic column names', t2.columns, ['A', 'B']);
eq('all rows are data', t2.rows.length, 3);
const dup = A.buildTable(A.parseGrid('Foo;Foo;\n1;2;3', ';'), 0);
eq('duplicate and blank headers made unique', dup.columns, ['Foo', 'Foo (2)', 'C']);

// ---- column profiling
const prof = A.profileColumns(t1, '.');
eq('ID column is not numeric', prof[0].numeric, false);
eq('value column is numeric', prof[1].numeric, true);
eq('numeric count', prof[1].numericCount, 2);

// ---- clustering
const v = [10, 12, 11, 40, 42, 43];
const c2 = A.clusterValues(v, 2);
eq('two obvious groups', c2.assign, [1, 1, 1, 2, 2, 2]);
eq('exact method used', c2.method, 'exact');
eq('ascending numbering: cluster 1 is the low band', c2.centroids[0] < c2.centroids[1], true);

// the old implementation seeded from the first k rows, so order changed the answer
const shuffled = [43, 10, 42, 11, 40, 12];
const cs = A.clusterValues(shuffled, 2);
eq('order independence', cs.assign, [2, 1, 2, 1, 2, 1]);
const groupsA = JSON.stringify(v.filter((_, i) => c2.assign[i] === 1).sort((a, b) => a - b));
const groupsB = JSON.stringify(shuffled.filter((_, i) => cs.assign[i] === 1).sort((a, b) => a - b));
eq('same partition regardless of input order', groupsA, groupsB);

eq('even split of a ramp', A.clusterValues([1, 2, 3, 4, 5, 6, 7, 8, 9], 3).assign, [1, 1, 1, 2, 2, 2, 3, 3, 3]);
eq('k = n gives singletons', A.clusterValues([5, 1, 3], 3).assign, [3, 1, 2]);
eq('k = 1 puts everything in one band', A.clusterValues([5, 1, 3], 1).assign, [1, 1, 1]);

// ascending numbering must hold for every k
let ascOk = true;
for (let k = 2; k <= 5; k++) {
  const r = A.clusterValues([3, 9, 1, 7, 5, 11, 2, 8], k);
  const st = A.clusterStats([3, 9, 1, 7, 5, 11, 2, 8], r.assign, k);
  for (let j = 1; j < k; j++) if (!(st[j - 1].max <= st[j].min)) ascOk = false;
}
eq('clusters are ordered bands for every k', ascOk, true);

// exact must be at least as good as Lloyd on the same data
const hard = [1, 2, 3, 50, 51, 52, 53, 100, 101];
const ex = A.clusterValues(hard, 3, { method: 'exact' });
const ll = A.clusterValues(hard, 3, { method: 'lloyd' });
eq('exact is not worse than Lloyd', ex.wcss <= ll.wcss + 1e-9, true);

// errors, not crashes
let threw = false;
try { A.clusterValues([1, 2], 5); } catch (e) { threw = /exceeds/.test(e.message); }
eq('k > n reports an error', threw, true);

// ---- stats and breaks
const st2 = A.clusterStats(v, c2.assign, 2);
eq('cluster sizes', [st2[0].n, st2[1].n], [3, 3]);
near('break sits between the bands', c2.breaks[0], 26, 1e-9);

// ---- elbow
const el = A.elbowScan([1, 2, 3, 20, 21, 22, 40, 41, 42], 6);
eq('elbow scan length', el.rows.length, 6);
eq('wcss falls as k rises', el.rows.every((r, i) => i === 0 || r.wcss <= el.rows[i - 1].wcss + 1e-9), true);
eq('elbow finds the three real groups', el.elbowK, 3);

// ---- per-cluster statistics
const sv = [0.16, 0.18, 0.21, 0.41, 0.42, 0.44, 0.45, 0.66, 0.68, 0.70, 0.71, 0.91, 0.93, 0.95, 0.97];
const sr = A.clusterValues(sv, 4);
const ss = A.clusterStats(sv, sr.assign, 4);
eq('stats: one row per cluster', ss.length, 4);
eq('stats: counts sum to n', ss.reduce((a, b) => a + b.n, 0), sv.length);
eq('stats: shares sum to 1', Math.abs(ss.reduce((a, b) => a + b.share, 0) - 1) < 1e-12, true);
near('stats: mean of the low band', ss[0].mean, (0.16 + 0.18 + 0.21) / 3, 1e-12);
near('stats: median of a 4-point band', ss[1].median, (0.42 + 0.44) / 2, 1e-12);
near('stats: width is max - min', ss[0].width, 0.21 - 0.16, 1e-12);
near('stats: gap to the next cluster', ss[0].gapNext, 0.41 - 0.21, 1e-12);
eq('stats: last cluster has no gap', ss[3].gapNext, null);
eq('stats: sd of a singleton is 0', A.clusterStats([1, 5], [1, 2], 2)[0].sd, 0);
eq('stats: zero-width band reports no density', A.clusterStats([1, 5], [1, 2], 2)[0].density, null);
eq('stats: singleton silhouette is 0 by convention', A.clusterStats([1, 5], [1, 2], 2)[0].silhouette, 0);
eq('stats: tight clusters are denser than an even spread', ss.every(x => x.density > 1), true);
eq('stats: well separated data scores a high silhouette', ss.every(x => x.silhouette > 0.7), true);
eq('stats: density is unit-free', (() => {
  const scaled = sv.map(v => v * 1000);
  const r2 = A.clusterValues(scaled, 4);
  const s2 = A.clusterStats(scaled, r2.assign, 4);
  return s2.every((x, i) => Math.abs(x.density - ss[i].density) < 1e-9);
})(), true);

const ov = A.overallStats(sv, ss);
eq('overall: n', ov.n, sv.length);
near('overall: width', ov.width, 0.97 - 0.16, 1e-12);
eq('overall: clustering explains most of the spread', ov.explained > 0.98, true);
eq('overall: silhouette is the n-weighted mean', Math.abs(ov.silhouette -
  ss.reduce((a, x) => a + x.silhouette * x.n, 0) / sv.length) < 1e-12, true);
eq('overall: empty input returns null', A.overallStats([], []), null);

// ---- spectral ramp matches the validated values in SPEC.md 5.2
eq('ramp k=3', A.rampFor(3), ['#7853d5', '#00cd89', '#e54e3f']);
eq('ramp k=5', A.rampFor(5), ['#7853d5', '#00a0cc', '#00cd89', '#e7c100', '#e54e3f']);
eq('ramp k=6', A.rampFor(6), ['#7853d5', '#0093d6', '#00c0b4', '#84d447', '#f0af00', '#e54e3f']);
eq('ramp k=8', A.rampFor(8),
  ['#7853d5', '#0a7eed', '#00a9c7', '#00c4ab', '#66d45a', '#dece00', '#f49600', '#e54e3f']);
eq('ramp length always equals k', [1, 2, 3, 6, 9, 12].every(k => A.rampFor(k).length === k), true);
eq('ramp ends violet at the low end and red at the high end',
  [A.rampFor(7)[0], A.rampFor(7)[6]], ['#7853d5', '#e54e3f']);
eq('every step is a valid hex colour',
  A.rampFor(12).every(c => /^#[0-9a-f]{6}$/.test(c)), true);
eq('ramp is deterministic', A.rampFor(9).join(), A.rampFor(9).join());

// ---- histogram and threshold (the distribution view)
const dv = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9];
const dpre = A.prefixSums(dv);
eq('prefix sums', Array.from(dpre), [0, 1, 3, 5, 8, 11, 14, 18, 22, 27, 36]);
eq('upperBound below everything', A.upperBound(dv, 0), 0);
eq('upperBound is inclusive of equals', A.upperBound(dv, 3), 6);
eq('upperBound above everything', A.upperBound(dv, 99), dv.length);

const hh = A.histogram(dv, 4);
eq('histogram bin count', hh.bins.length, 4);
eq('every value lands in exactly one bin', hh.bins.reduce((a, b) => a + b.n, 0), dv.length);
eq('histogram spans the data', [hh.lo, hh.hi], [1, 9]);
eq('tallest bin is reported', hh.max, Math.max.apply(null, hh.bins.map(b => b.n)));
eq('histogram of one value does not divide by zero', A.histogram([5, 5, 5], 4).bins.length, 4);
eq('empty histogram is empty', A.histogram([], 4).bins.length, 0);
eq('bin count is clamped', A.histogram(dv, 9999).bins.length, 500);

const ts = A.thresholdStats(dv, dpre, 3);
eq('threshold splits at or below / above', [ts.below, ts.above], [6, 4]);
near('shares sum to one', ts.belowShare + ts.aboveShare, 1, 1e-12);
near('mean below', ts.meanBelow, 14 / 6, 1e-12);
near('mean above', ts.meanAbove, (36 - 14) / 4, 1e-12);
eq('threshold above the top leaves nothing above', A.thresholdStats(dv, dpre, 99).above, 0);
eq('nothing above means no mean above', A.thresholdStats(dv, dpre, 99).meanAbove, null);
eq('threshold below the bottom leaves nothing below', A.thresholdStats(dv, dpre, -1).below, 0);
eq('empty series has no threshold stats', A.thresholdStats([], A.prefixSums([]), 1), null);
eq('percentile matches the below share', A.thresholdStats(dv, dpre, 4).percentile,
  A.thresholdStats(dv, dpre, 4).belowShare);

eq('suggestBins is sane on a spread', A.suggestBins(dv) >= 1 && A.suggestBins(dv) <= 120, true);
eq('suggestBins on identical values', A.suggestBins([2, 2, 2]), 1);
eq('suggestBins on a single value', A.suggestBins([7]), 1);

// ---- quoted delimiters survive
eq('quoted delimiter', A.splitRow('a;"b;c";d', ';'), ['a', 'b;c', 'd']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
