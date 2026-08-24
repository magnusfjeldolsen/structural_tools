/**
 * 1D clustering — pure calculation and parsing layer.
 *
 * No DOM, no side effects, deterministic. See SPEC.md for the contract.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ClusterAPI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DELIMITERS = [
    { key: 'tab', char: '\t', label: 'Tab' },
    { key: 'semi', char: ';', label: 'Semicolon' },
    { key: 'comma', char: ',', label: 'Comma' },
    { key: 'pipe', char: '|', label: 'Pipe' }
  ];

  /* Blue ramp from the dataviz reference palette, light -> dark. Clusters are ordered
     by value, so this is an ordinal encoding, not a categorical one. Every subsample
     used below passes validate_palette.js --ordinal --mode dark --surface #131c2e. */
  const RAMP = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7',
    '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95'];
  const RAMP_MAX_DISTINCT = 6;   // above this, adjacent steps fall under the 0,06 dL floor

  // ------------------------------------------------------------------ parsing

  const normaliseNewlines = (text) =>
    String(text).replace(new RegExp('\\r\\n?', 'g'), '\n');

  const splitLines = (text) =>
    normaliseNewlines(text).split('\n').filter(l => l.trim() !== '');

  /** Score each candidate on how consistently it produces the same field count. */
  function detectDelimiter(text) {
    const lines = splitLines(text).slice(0, 50);
    if (!lines.length) return { delimiter: '\t', confidence: 0, counts: {} };
    let best = { delimiter: '\t', confidence: -1, fields: 1 };
    const counts = {};
    for (const d of DELIMITERS) {
      const widths = lines.map(l => l.split(d.char).length);
      const tally = {};
      widths.forEach(w => { tally[w] = (tally[w] || 0) + 1; });
      let modal = 1, modalCount = 0;
      Object.keys(tally).forEach(w => {
        if (tally[w] > modalCount || (tally[w] === modalCount && +w > modal)) {
          modal = +w; modalCount = tally[w];
        }
      });
      const confidence = modal < 2 ? 0 : modalCount / lines.length;
      counts[d.key] = { fields: modal, confidence };
      if (confidence > best.confidence || (confidence === best.confidence && modal > best.fields)) {
        best = { delimiter: d.char, confidence, fields: modal };
      }
    }
    return { delimiter: best.delimiter, confidence: best.confidence, counts };
  }

  /** Comma or point? Norwegian sheets are ';'-delimited with ',' decimals. */
  function detectDecimal(grid) {
    let comma = 0, dot = 0;
    for (const row of grid) {
      for (const cell of row) {
        const c = String(cell == null ? '' : cell).trim();
        if (/^-?\d+,\d+$/.test(c)) comma++;
        else if (/^-?\d+\.\d+$/.test(c)) dot++;
      }
    }
    return comma > dot ? ',' : '.';
  }

  /**
   * One number parser for the whole tool. Strips thousands marks, then applies the
   * decimal convention wholesale rather than replacing only the first separator.
   */
  function toNumber(raw, decimal) {
    if (raw == null) return null;
    let s = String(raw).trim();
    if (s === '') return null;
    s = s.replace(/[\s  ']/g, '');
    if (decimal === ',') s = s.replace(/\./g, '').replace(/,/g, '.');
    else s = s.replace(/,/g, '');
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null;
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  /**
   * Split into a raw grid. Blank lines are KEPT, because the user picks the header
   * row by pointing at it and the row numbers they see must match the file. Only
   * trailing blank lines are dropped. Quotes are honoured.
   */
  function parseGrid(text, delimiter) {
    const lines = normaliseNewlines(text).split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.map(line => splitRow(line, delimiter));
  }

  function splitRow(line, delimiter) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delimiter) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }

  // ------------------------------------------------------------- header row

  /**
   * The header is the row that looks most like labels and is followed by numbers.
   * Returns -1 when nothing qualifies, which the UI renders as "no header row".
   */
  function detectHeaderRow(grid) {
    const width = Math.max(1, ...grid.map(r => r.length));
    let bestIx = -1, bestScore = 0;
    const limit = Math.min(grid.length - 1, 20);
    for (let i = 0; i < limit; i++) {
      const row = grid[i];
      const filledCells = row.filter(c => String(c).trim() !== '');
      if (filledCells.length < 2) continue;
      const below = grid[i + 1] || [];
      const belowHasNumber = below.some(c => toNumber(c, '.') != null || toNumber(c, ',') != null);
      if (!belowHasNumber) continue;

      const filled = filledCells.length / width;
      const textish = filledCells.filter(c =>
        toNumber(c, '.') == null && toNumber(c, ',') == null).length / filledCells.length;
      // A row of numbers is data, not a header, however tidy it looks.
      if (textish < 0.5) continue;
      const unique = new Set(filledCells.map(c => String(c).trim())).size / filledCells.length;
      const score = filled * 1.0 + textish * 1.5 + unique * 0.5;
      if (score > bestScore) { bestScore = score; bestIx = i; }
    }
    return bestIx;
  }

  const colLetter = (i) => {
    let s = '';
    i = i + 1;
    while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
    return s;
  };

  /** Split a grid into named columns and data rows. headerRow = -1 means A, B, C... */
  function buildTable(grid, headerRow) {
    const width = Math.max(1, ...grid.map(r => r.length));
    const raw = headerRow >= 0 && grid[headerRow] ? grid[headerRow] : [];
    const seen = Object.create(null);
    const columns = [];
    for (let i = 0; i < width; i++) {
      let name = String(raw[i] == null ? '' : raw[i]).trim();
      if (!name) name = colLetter(i);
      const base = name;
      let n = 1;
      while (seen[name]) { n++; name = base + ' (' + n + ')'; }
      seen[name] = true;
      columns.push(name);
    }
    const start = headerRow >= 0 ? headerRow + 1 : 0;
    const rows = [];
    for (let i = start; i < grid.length; i++) {
      const r = grid[i];
      if (!r.some(c => String(c).trim() !== '')) continue;      // skip blank rows
      const padded = [];
      for (let j = 0; j < width; j++) padded.push(r[j] == null ? '' : String(r[j]));
      padded._line = i;                                          // original file line
      rows.push(padded);
    }
    return { columns, rows };
  }

  /** How usable is each column as the clustering value? Drives the chip strip. */
  function profileColumns(table, decimal) {
    return table.columns.map((name, index) => {
      let numericCount = 0, min = Infinity, max = -Infinity;
      for (const row of table.rows) {
        const v = toNumber(row[index], decimal);
        if (v != null) { numericCount++; if (v < min) min = v; if (v > max) max = v; }
      }
      const total = table.rows.length;
      return {
        name, index, numericCount, total,
        numeric: numericCount > 0 && numericCount >= Math.max(2, total * 0.5),
        min: numericCount ? min : null,
        max: numericCount ? max : null
      };
    });
  }

  // ------------------------------------------------------------- clustering

  const EXACT_LIMIT = 2000;

  /** Exact 1-D k-means by dynamic programme (Fisher–Jenks). Input must be sorted. */
  function fisherJenks(x, k) {
    const n = x.length;
    const S1 = new Float64Array(n + 1), S2 = new Float64Array(n + 1);
    for (let i = 1; i <= n; i++) { S1[i] = S1[i - 1] + x[i - 1]; S2[i] = S2[i - 1] + x[i - 1] * x[i - 1]; }
    const ssq = (a, b) => {                                      // 1-based, inclusive
      const cnt = b - a + 1;
      const s = S1[b] - S1[a - 1];
      return Math.max(0, (S2[b] - S2[a - 1]) - s * s / cnt);
    };
    const D = [], P = [];
    for (let j = 0; j <= k; j++) { D.push(new Float64Array(n + 1).fill(Infinity)); P.push(new Int32Array(n + 1)); }
    D[0][0] = 0;
    for (let j = 1; j <= k; j++) {
      for (let i = j; i <= n; i++) {
        let best = Infinity, arg = j - 1;
        for (let m = j - 1; m < i; m++) {
          const prev = D[j - 1][m];
          if (prev === Infinity) continue;
          const c = prev + ssq(m + 1, i);
          if (c < best) { best = c; arg = m; }
        }
        D[j][i] = best; P[j][i] = arg;
      }
    }
    const cuts = [];
    let i = n;
    for (let j = k; j >= 1; j--) { cuts.unshift(P[j][i]); i = P[j][i]; }
    return { cuts: cuts.slice(1), wcss: D[k][n] };               // cuts = end index of each cluster but the last
  }

  /** Lloyd on sorted data, seeded at quantiles. Deterministic; used above EXACT_LIMIT. */
  function lloydSorted(x, k) {
    const n = x.length;
    let centroids = [];
    for (let j = 0; j < k; j++) centroids.push(x[Math.min(n - 1, Math.floor((j + 0.5) / k * n))]);
    let cuts = [];
    for (let iter = 0; iter < 100; iter++) {
      const next = [];
      for (let j = 0; j < k - 1; j++) {
        const mid = (centroids[j] + centroids[j + 1]) / 2;
        let lo = 0, hi = n;
        while (lo < hi) { const m = (lo + hi) >> 1; if (x[m] <= mid) lo = m + 1; else hi = m; }
        next.push(lo);
      }
      for (let j = 1; j < next.length; j++) if (next[j] < next[j - 1]) next[j] = next[j - 1];
      if (cuts.length === next.length && cuts.every((v, i2) => v === next[i2])) break;
      cuts = next;
      const bounds = [0].concat(cuts, [n]);
      for (let j = 0; j < k; j++) {
        const a = bounds[j], b = bounds[j + 1];
        if (b > a) { let s = 0; for (let t = a; t < b; t++) s += x[t]; centroids[j] = s / (b - a); }
      }
    }
    const bounds = [0].concat(cuts, [n]);
    let wcss = 0;
    for (let j = 0; j < k; j++) {
      const a = bounds[j], b = bounds[j + 1];
      if (b <= a) continue;
      let s = 0; for (let t = a; t < b; t++) s += x[t];
      const mu = s / (b - a);
      for (let t = a; t < b; t++) wcss += (x[t] - mu) * (x[t] - mu);
    }
    return { cuts, wcss };
  }

  /**
   * Cluster `values` into k bands. Clusters are numbered 1..k in ascending value
   * order, always — so cluster 1 holds the smallest values and the output is
   * readable without a cross-reference.
   */
  function clusterValues(values, k, opts) {
    const force = (opts && opts.method) || null;
    const n = values.length;
    if (!(k >= 1)) throw new Error('cluster count must be at least 1');
    if (k > n) throw new Error('cluster count (' + k + ') exceeds the ' + n + ' numeric values available');

    const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
    const sorted = order.map(i => values[i]);

    const useExact = force ? force === 'exact' : n <= EXACT_LIMIT;
    const res = useExact ? fisherJenks(sorted, k) : lloydSorted(sorted, k);
    const method = useExact ? 'exact' : 'lloyd';

    const bounds = [0].concat(res.cuts, [n]);
    const assign = new Array(n);
    const centroids = [], mins = [], maxs = [];
    for (let j = 0; j < k; j++) {
      const a = bounds[j], b = bounds[j + 1];
      let s = 0;
      for (let t = a; t < b; t++) { assign[order[t]] = j + 1; s += sorted[t]; }
      centroids.push(b > a ? s / (b - a) : null);
      mins.push(b > a ? sorted[a] : null);
      maxs.push(b > a ? sorted[b - 1] : null);
    }
    const breaks = [];
    for (let j = 0; j < k - 1; j++) {
      if (maxs[j] == null || mins[j + 1] == null) continue;
      breaks.push((maxs[j] + mins[j + 1]) / 2);
    }
    return { assign, breaks, centroids, wcss: res.wcss, method, k };
  }

  function clusterStats(values, assign, k) {
    const out = [];
    for (let j = 1; j <= k; j++) {
      const v = values.filter((_, i) => assign[i] === j);
      if (!v.length) { out.push({ id: j, n: 0, min: null, max: null, mean: null, range: null }); continue; }
      const min = Math.min.apply(null, v), max = Math.max.apply(null, v);
      out.push({ id: j, n: v.length, min, max, mean: v.reduce((a, b) => a + b, 0) / v.length, range: max - min });
    }
    return out;
  }

  /**
   * WCSS for k = 1..kMax, for the elbow strip. Always uses the Lloyd path so the
   * scan stays fast on large inputs; it is advisory, not the reported clustering.
   */
  function elbowScan(values, kMax) {
    const n = values.length;
    const top = Math.max(1, Math.min(kMax, n));
    const rows = [];
    for (let k = 1; k <= top; k++) {
      const r = clusterValues(values, k, { method: 'lloyd' });
      rows.push({ k, wcss: r.wcss });
    }
    const w1 = rows[0].wcss || 1;
    rows.forEach(r => { r.normalised = w1 ? r.wcss / w1 : 0; });
    let elbowK = rows.length ? rows[0].k : 1;
    if (rows.length > 2) {
      const x1 = rows[0].k, y1 = rows[0].normalised;
      const x2 = rows[rows.length - 1].k, y2 = rows[rows.length - 1].normalised;
      const den = Math.hypot(y2 - y1, x2 - x1) || 1;
      let bestD = -1;
      rows.forEach(r => {
        const d = Math.abs((y2 - y1) * r.k - (x2 - x1) * r.normalised + x2 * y1 - y2 * x1) / den;
        if (d > bestD) { bestD = d; elbowK = r.k; }
      });
    }
    return { rows, elbowK };
  }

  /** Evenly spaced steps of the validated ordinal ramp, light (low) to dark (high). */
  function rampFor(k) {
    if (k <= 1) return [RAMP[0]];
    const out = [];
    for (let i = 0; i < k; i++) out.push(RAMP[Math.round(i * (RAMP.length - 1) / (k - 1))]);
    return out;
  }

  return {
    DELIMITERS, RAMP, RAMP_MAX_DISTINCT, EXACT_LIMIT,
    detectDelimiter, detectDecimal, toNumber, parseGrid, splitRow,
    detectHeaderRow, buildTable, profileColumns, colLetter,
    clusterValues, clusterStats, elbowScan, rampFor
  };
});
