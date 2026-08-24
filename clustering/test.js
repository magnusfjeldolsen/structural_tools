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

// ---- ramp matches the validated table in SPEC.md 5.2
eq('ramp k=2', A.rampFor(2), ['#cde2fb', '#184f95']);
eq('ramp k=3', A.rampFor(3), ['#cde2fb', '#5598e7', '#184f95']);
eq('ramp k=4', A.rampFor(4), ['#cde2fb', '#86b6ef', '#2a78d6', '#184f95']);
eq('ramp k=5', A.rampFor(5), ['#cde2fb', '#86b6ef', '#5598e7', '#256abf', '#184f95']);
eq('ramp k=6', A.rampFor(6), ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95']);
eq('ramp length always equals k', [2, 3, 6, 9].every(k => A.rampFor(k).length === k), true);

// ---- quoted delimiters survive
eq('quoted delimiter', A.splitRow('a;"b;c";d', ';'), ['a', 'b;c', 'd']);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
