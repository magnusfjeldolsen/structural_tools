/* UI + chart for the 1D clustering tool. All parsing and clustering lives in
   cluster_api.js; this file reads the form, paints the result and handles hover. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = () => window.ClusterAPI;

  const state = {
    text: '',
    delimiter: null,      // resolved
    decimal: null,        // resolved
    grid: [],
    headerRow: -1,
    table: null,
    profiles: [],
    valueCol: -1,
    labelCol: -1,
    k: 3,
    result: null,
    points: [],
    pinned: null
  };

  const EXAMPLE = [
    'Utilisation report - beams', '',
    'Member;Section;max_util;length_m',
    'B1;IPE300;0,42;6,0', 'B2;IPE300;0,45;6,0', 'B3;IPE300;0,41;6,0',
    'B4;IPE360;0,68;7,5', 'B5;IPE360;0,71;7,5', 'B6;IPE360;0,66;7,5',
    'B7;IPE400;0,93;9,0', 'B8;IPE400;0,97;9,0', 'B9;IPE400;0,95;9,0',
    'B10;IPE300;0,44;6,0', 'B11;IPE360;0,70;7,5', 'B12;IPE400;0,91;9,0',
    'B13;IPE200;0,18;4,0', 'B14;IPE200;0,21;4,0', 'B15;IPE200;0,16;4,0'
  ].join('\n');

  const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : null; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /** Format a number back in the user's own decimal notation. */
  function fmt(v, dp) {
    if (v == null || !isFinite(v)) return '—';
    const s = dp == null ? String(Math.round(v * 1e6) / 1e6) : v.toFixed(dp);
    return state.decimal === ',' ? s.replace('.', ',') : s;
  }

  // ------------------------------------------------------------------ ingest

  function ingest(text) {
    state.text = text || '';
    if (!state.text.trim()) { reset(); return; }

    const dSel = $('delim').value;
    const det = API().detectDelimiter(state.text);
    state.delimiter = dSel === 'auto' ? det.delimiter : dSel;

    state.grid = API().parseGrid(state.text, state.delimiter);

    const decSel = $('dec').value;
    state.decimal = decSel === 'auto' ? API().detectDecimal(state.grid) : decSel;

    state.headerRow = API().detectHeaderRow(state.grid);
    rebuild(true);
  }

  /** Everything downstream of the header-row choice. */
  function rebuild(pickDefaults) {
    state.table = API().buildTable(state.grid, state.headerRow);
    state.profiles = API().profileColumns(state.table, state.decimal);

    if (pickDefaults || state.valueCol < 0 || !state.profiles[state.valueCol] || !state.profiles[state.valueCol].numeric) {
      let best = -1, bestRatio = -1;
      state.profiles.forEach(p => {
        if (!p.numeric) return;
        const ratio = p.total ? p.numericCount / p.total : 0;
        if (ratio > bestRatio) { bestRatio = ratio; best = p.index; }
      });
      state.valueCol = best;
    }
    if (pickDefaults || state.labelCol < 0 || state.labelCol >= state.profiles.length) {
      const text = state.profiles.find(p => !p.numeric);
      state.labelCol = text ? text.index : -1;
    }

    const nameOf = (d) => d === '\t' ? 'tab' : d;
    $('dataStatus').innerHTML = state.table.rows.length
      ? state.table.rows.length + ' rows × ' + state.table.columns.length + ' columns · delimiter <b>' +
        esc(nameOf(state.delimiter)) + '</b> · decimal <b>' + esc(state.decimal) + '</b>'
      : '<span class="warn">No data rows found below the header.</span>';

    $('structure').hidden = false;
    $('pasteBox').style.minHeight = state.table.rows.length ? '5rem' : '';
    paintRawGrid();
    paintChips();
    paintLabelSelect();
    recompute();
  }

  function reset() {
    state.grid = []; state.table = null; state.profiles = []; state.result = null;
    state.valueCol = -1; state.labelCol = -1; state.pinned = null;
    $('structure').hidden = true; $('chartPanel').hidden = true; $('resultPanel').hidden = true;
    $('statsPanel').hidden = true;
    $('pasteBox').style.minHeight = '';
    $('dataStatus').textContent = '';
  }

  // ------------------------------------------------------- header-row picker

  function paintRawGrid() {
    const maxRows = Math.min(state.grid.length, 15);
    const width = Math.min(8, Math.max.apply(null, state.grid.map(r => r.length).concat([1])));
    let html = '';
    for (let i = 0; i < maxRows; i++) {
      const r = state.grid[i] || [];
      const cls = i === state.headerRow ? 'hdr' : (state.headerRow >= 0 && i < state.headerRow ? 'above' : '');
      html += '<tr class="' + cls + '" data-row="' + i + '" title="Click to use row ' + (i + 1) + ' as the header">' +
        '<td class="ln">' + (i + 1) + '</td>';
      for (let j = 0; j < width; j++) {
        const cell = r[j] == null ? '' : String(r[j]);
        html += '<td>' + esc(cell.length > 22 ? cell.slice(0, 21) + '…' : cell) + '</td>';
      }
      if ((state.grid[i] || []).length > width) html += '<td class="muted">…</td>';
      html += '</tr>';
    }
    $('rawGrid').innerHTML = html;
    $('rawGrid').querySelectorAll('tr[data-row]').forEach(tr => {
      tr.addEventListener('click', () => {
        state.headerRow = parseInt(tr.dataset.row, 10);
        rebuild(true);
      });
    });
    $('headerStatus').innerHTML = state.headerRow >= 0
      ? 'Row <b>' + (state.headerRow + 1) + '</b> is the header; rows above it are ignored.'
      : 'No header row — columns are named A, B, C…';
    if (state.grid.length > maxRows) {
      $('headerStatus').innerHTML += ' <span class="muted">(' + state.grid.length + ' rows in total)</span>';
    }
  }

  // ------------------------------------------------------------ column chips

  function paintChips() {
    $('chips').innerHTML = state.profiles.map(p => {
      const dead = !p.numeric;
      const range = p.numericCount ? fmt(p.min) + ' … ' + fmt(p.max) : 'no numbers';
      const title = dead
        ? 'Only ' + p.numericCount + ' of ' + p.total + ' values in this column parse as numbers, so it cannot be clustered.'
        : 'Cluster on ' + p.name;
      return '<button class="chip ' + (p.index === state.valueCol ? 'on' : '') + (dead ? ' dead' : '') +
        '" data-col="' + p.index + '"' + (dead ? ' disabled' : '') + ' title="' + esc(title) + '">' +
        '<b>' + esc(p.name) + '</b>' +
        '<span>' + p.numericCount + '/' + p.total + ' numeric</span>' +
        '<span>' + esc(range) + '</span></button>';
    }).join('');
    $('chips').querySelectorAll('[data-col]').forEach(b => {
      b.addEventListener('click', () => {
        state.valueCol = parseInt(b.dataset.col, 10);
        state.pinned = null;
        paintChips(); recompute();
      });
    });
  }

  function paintLabelSelect() {
    const sel = $('labelCol');
    sel.innerHTML = '<option value="-1">Row number</option>' +
      state.profiles.map(p => '<option value="' + p.index + '">' + esc(p.name) + '</option>').join('');
    sel.value = String(state.labelCol);
  }

  // ------------------------------------------------------------- clustering

  function recompute() {
    if (!state.table || state.valueCol < 0) {
      $('chartPanel').hidden = true; $('resultPanel').hidden = true;
      if (state.table) $('dataStatus').innerHTML += ' <span class="warn">· no numeric column to cluster</span>';
      return;
    }

    const values = [], rowIx = [];
    state.table.rows.forEach((row, i) => {
      const v = API().toNumber(row[state.valueCol], state.decimal);
      if (v != null) { values.push(v); rowIx.push(i); }
    });

    const maxK = Math.min(12, values.length);
    state.k = Math.max(1, Math.min(maxK, Math.round(num($('kInput').value) || 3)));
    $('kInput').value = state.k;

    let res;
    try { res = API().clusterValues(values, state.k); }
    catch (e) {
      $('elbowNote').innerHTML = '<span class="warn">' + esc(e.message) + '</span>';
      return;
    }

    const stats = API().clusterStats(values, res.assign, state.k);
    const ramp = API().rampFor(state.k);

    const overall = API().overallStats(values, stats);
    state.result = { values, rowIx, res, stats, ramp, overall,
      skipped: state.table.rows.length - values.length };
    $('kBadge').textContent = res.method === 'exact'
      ? '· exact optimum' : '· fast approximation, ' + values.length + ' values';

    paintElbow(values);
    paintChart();
    paintLegend();
    paintResults();
    paintStats();
  }

  function paintElbow(values) {
    const kMax = Math.min(10, values.length);
    if (kMax < 2) { $('elbow').innerHTML = ''; $('elbowNote').textContent = ''; return; }
    const scan = API().elbowScan(values, kMax);
    $('elbow').innerHTML = scan.rows.map(r =>
      '<div class="ecol"><button data-k="' + r.k + '" class="' + (r.k === state.k ? 'on ' : '') +
      (r.k === scan.elbowK ? 'elb' : '') +
      '" style="height:' + Math.max(4, Math.round(Math.pow(r.normalised, 0.4) * 38)) + 'px" title="k = ' + r.k +
      ', within-cluster spread ' + Math.round(r.normalised * 100) + '% of k = 1"></button>' +
      '<i>' + r.k + '</i></div>').join('');
    $('elbow').querySelectorAll('[data-k]').forEach(b => b.addEventListener('click', () => {
      $('kInput').value = b.dataset.k; recompute();
    }));
    $('elbowNote').innerHTML = 'Bars are within-cluster spread against k; the dashed one (k = ' +
      scan.elbowK + ') is where the gain flattens. Advisory only.' +
      (state.k > API().RAMP_MAX_DISTINCT
        ? ' <span class="warn">Above k = ' + API().RAMP_MAX_DISTINCT +
          ' neighbouring hues stop being reliably separable — read the bands off the break lines, ' +
          'the C1…Ck labels and the legend rather than the colour alone.</span>'
        : '');
  }

  // ------------------------------------------------------------------- chart

  const M = { t: 12, r: 54, b: 26, l: 52 };

  function paintChart() {
    const R = state.result;
    if (!R) return;
    $('chartPanel').hidden = false;

    const svg = $('chart');
    const W = svg.clientWidth || svg.parentElement.clientWidth || 900;
    const H = Math.max(430, Math.min(760, 200 + R.values.length * 1.8));
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('height', H);

    const useLabelX = $('xMode').value === 'label' && state.labelCol >= 0;
    const xs = R.rowIx.map((ri, j) => {
      if (useLabelX) {
        const v = API().toNumber(state.table.rows[ri][state.labelCol], state.decimal);
        if (v != null) return v;
      }
      return j + 1;
    });

    const xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    const yMin = Math.min.apply(null, R.values), yMax = Math.max.apply(null, R.values);
    const yPad = (yMax - yMin || Math.abs(yMax) || 1) * 0.06;
    const y0 = yMin - yPad, y1 = yMax + yPad;
    const xSpan = (xMax - xMin) || 1;

    const px = (v) => M.l + (v - xMin) / xSpan * (W - M.l - M.r);
    const py = (v) => H - M.b - (v - y0) / (y1 - y0) * (H - M.t - M.b);

    let g = '';

    // horizontal grid + y ticks
    const ticks = niceTicks(y0, y1, 5);
    g += '<g class="grid">' + ticks.map(t =>
      '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + py(t).toFixed(1) + '" y2="' + py(t).toFixed(1) + '"/>').join('') + '</g>';
    g += '<g>' + ticks.map(t =>
      '<text x="' + (M.l - 6) + '" y="' + (py(t) + 3).toFixed(1) + '" text-anchor="end">' + esc(fmt(t)) + '</text>').join('') + '</g>';

    // axes
    g += '<g class="axis"><line x1="' + M.l + '" x2="' + M.l + '" y1="' + M.t + '" y2="' + (H - M.b) + '"/>' +
      '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + (H - M.b) + '" y2="' + (H - M.b) + '"/></g>';

    // x ticks, sparse
    const xt = niceTicks(xMin, xMax, 6).filter(t => t >= xMin && t <= xMax);
    g += '<g>' + xt.map(t => '<text x="' + px(t).toFixed(1) + '" y="' + (H - M.b + 14) + '" text-anchor="middle">' +
      esc(fmt(t)) + '</text>').join('') + '</g>';

    // Cluster breaks carry their value just inside the left edge; the band labels live in
    // the right margin. Keeping them on opposite sides is what stops them colliding when
    // the bands are thin.
    R.res.breaks.forEach((b) => {
      const yy = py(b).toFixed(1);
      g += '<line class="brk" x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      g += '<text x="' + (M.l + 5) + '" y="' + (+yy - 3) + '" style="fill:#8fa3bd">' + esc(fmt(b)) + '</text>';
    });
    R.stats.forEach((st) => {
      if (!st.n) return;
      const top = py(st.max), bot = py(st.min);
      if (bot - top < 11 && R.stats.length > 8) return;      // no room, legend carries it
      const mid = (top + bot) / 2;
      g += '<text x="' + (W - M.r + 6) + '" y="' + (mid + 3.5).toFixed(1) +
        '" style="fill:' + R.ramp[st.id - 1] + ';font-weight:700">C' + st.id + '</text>';
    });

    // points
    state.points = [];
    let marks = '';
    R.values.forEach((v, j) => {
      const cx = px(xs[j]), cy = py(v);
      const cid = R.res.assign[j];
      state.points.push({ cx, cy, j, rowIx: R.rowIx[j], value: v, cluster: cid });
      marks += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="3.5" fill="' +
        R.ramp[cid - 1] + '" data-j="' + j + '"/>';
    });
    g += marks;

    // axis titles
    g += '<text x="' + ((M.l + W - M.r) / 2) + '" y="' + (H - 2) + '" text-anchor="middle">' +
      (useLabelX ? esc(state.table.columns[state.labelCol]) : 'row order') + '</text>';
    g += '<text transform="translate(12,' + ((M.t + H - M.b) / 2) + ') rotate(-90)" text-anchor="middle">' +
      esc(state.table.columns[state.valueCol]) + '</text>';

    svg.innerHTML = g;
    $('chartTitle').innerHTML = esc(state.table.columns[state.valueCol]) + ' in ' + state.k +
      ' clusters · ' + R.values.length + ' points' +
      (R.skipped ? ' · <span class="warn">' + R.skipped + ' rows without a number</span>' : '');
  }

  function niceTicks(a, b, count) {
    if (!(b > a)) return [a];
    const raw = (b - a) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
    const out = [];
    for (let t = Math.ceil(a / step) * step; t <= b + 1e-9; t += step) out.push(+t.toFixed(10));
    return out;
  }

  function paintLegend() {
    const R = state.result;
    $('legend').innerHTML = R.stats.map(s =>
      '<div class="muted"><span class="swatch" style="background:' + R.ramp[s.id - 1] + '"></span>' +
      '<b style="color:#e6edf6">C' + s.id + '</b> · n = ' + s.n +
      (s.n ? ' · ' + fmt(s.min) + ' … ' + fmt(s.max) : '') + '</div>').join('');
  }

  // -------------------------------------------------------------- hover

  function pointAt(evt) {
    const svg = $('chart');
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const sx = vb.width / rect.width, sy = vb.height / rect.height;
    const x = (evt.clientX - rect.left) * sx, y = (evt.clientY - rect.top) * sy;
    let best = null, bestD = 14 * Math.max(sx, sy);
    for (const p of state.points) {
      const d = Math.hypot(p.cx - x, p.cy - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function showTip(p, evt) {
    const R = state.result;
    const row = state.table.rows[p.rowIx];
    const heading = state.labelCol >= 0 ? row[state.labelCol] : 'Row ' + (p.rowIx + 1);
    let html = '<b>' + esc(heading || 'Row ' + (p.rowIx + 1)) + '</b><table>';
    state.table.columns.forEach((c, i) => {
      const hl = i === state.valueCol ? ' class="hl"' : '';
      html += '<tr' + hl + '><td class="k">' + esc(c) + '</td><td>' + esc(row[i]) + '</td></tr>';
    });
    html += '<tr class="hl"><td class="k">Cluster</td><td>C' + p.cluster + '</td></tr></table>';
    const tip = $('tip');
    tip.innerHTML = html;
    tip.style.display = 'block';
    const b = tip.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + b.width > window.innerWidth - 8) x = evt.clientX - b.width - 14;
    if (y + b.height > window.innerHeight - 8) y = Math.max(8, evt.clientY - b.height - 14);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';

    $('chart').querySelectorAll('circle.hi').forEach(c => c.classList.remove('hi'));
    const el = $('chart').querySelector('circle[data-j="' + p.j + '"]');
    if (el) { el.classList.add('hi'); el.parentNode.appendChild(el); }
  }

  function hideTip() {
    if (state.pinned) return;
    $('tip').style.display = 'none';
    $('chart').querySelectorAll('circle.hi').forEach(c => c.classList.remove('hi'));
  }


  // ------------------------------------------------------------- statistics

  /* Columns are ordered so the eye runs from "how big" through "where" to "what shape",
     and every derived one carries its definition in the header tooltip rather than in a
     paragraph nobody reads. */
  const STAT_COLS = [
    { k: 'id', h: 'Cluster', t: 'Numbered low to high by value.' },
    { k: 'n', h: 'n', num: true, t: 'Rows in this cluster.' },
    { k: 'share', h: '% rows', num: true, t: 'Share of all clustered rows.' },
    { k: 'min', h: 'min', num: true },
    { k: 'max', h: 'max', num: true },
    { k: 'mean', h: 'mean', num: true },
    { k: 'median', h: 'median', num: true },
    { k: 'sd', h: 'sd', num: true, t: 'Sample standard deviation within the cluster.' },
    { k: 'width', h: 'width', num: true, t: 'max \u2212 min: how much of the value axis the cluster occupies.' },
    { k: 'gapNext', h: 'gap \u2192', num: true, t: 'Distance from this cluster\u2019s max to the next cluster\u2019s min. A large gap means a clean break.' },
    { k: 'density', h: 'density', num: true, t: 'Share of rows divided by share of the value axis. Dimensionless, so it does not care about units. 1,0 = exactly as dense as an even spread; 5,0 = five times denser; below 1,0 = sparser than even. Blank when the band has zero width.' },
    { k: 'silhouette', h: 'silhouette', num: true, t: 'How much closer a point sits to its own cluster than to the nearest other one, averaged. 1 = perfectly separated, 0 = on the boundary, negative = probably in the wrong cluster. Singletons count as 0.' }
  ];

  function statCell(col, st) {
    const v = st[col.k];
    if (col.k === 'id') {
      return '<span class="swatch" style="background:' + state.result.ramp[st.id - 1] + '"></span>C' + st.id;
    }
    if (v == null) return '<span class="muted">\u2014</span>';
    if (col.k === 'n') return String(v);
    if (col.k === 'share') return fmt(v * 100, 0) + ' %';
    if (col.k === 'density') return fmt(v, 2) + '\u00d7';
    if (col.k === 'silhouette') return fmt(v, 3);
    return fmt(v, sigDp());
  }

  /** Decimal places that suit the spread of the data rather than a fixed guess. */
  function sigDp() {
    const w = state.result ? state.result.overall.width : 1;
    if (!(w > 0)) return 2;
    const mag = Math.floor(Math.log10(w));
    return Math.min(6, Math.max(0, 2 - mag));
  }

  function paintStats() {
    const R = state.result;
    if (!R) { $('statsPanel').hidden = true; return; }
    $('statsPanel').hidden = false;
    const o = R.overall;

    let html = '<tr>' + STAT_COLS.map(c =>
      '<th class="' + (c.num ? 'n' : '') + '"' + (c.t ? ' title="' + esc(c.t) + '"' : '') + '>' +
      esc(c.h) + '</th>').join('') + '</tr>';

    R.stats.forEach(st => {
      html += '<tr>' + STAT_COLS.map(c =>
        '<td class="' + (c.num ? 'n' : '') + '">' + statCell(c, st) + '</td>').join('') + '</tr>';
    });

    const totals = {
      id: null, n: o.n, share: 1, min: o.min, max: o.max, mean: o.mean,
      median: o.median, sd: o.sd, width: o.width, gapNext: null,
      density: null, silhouette: o.silhouette
    };
    html += '<tr class="total">' + STAT_COLS.map(c => {
      if (c.k === 'id') return '<td>All</td>';
      const st = totals;
      if (st[c.k] == null) return '<td class="n"><span class="muted">\u2014</span></td>';
      return '<td class="n">' + statCell(c, Object.assign({ id: 1 }, st)) + '</td>';
    }).join('') + '</tr>';

    $('statsTable').innerHTML = html;

    $('statsSummary').innerHTML = o.explained != null
      ? 'k = ' + state.k + ' accounts for <b>' + fmt(o.explained * 100, 1) +
        ' %</b> of the total spread \u00b7 mean silhouette <b>' + fmt(o.silhouette, 3) + '</b>'
      : '';

    const worst = R.stats.filter(s => s.n > 0)
      .reduce((a, b) => (a == null || b.silhouette < a.silhouette ? b : a), null);
    const widest = R.stats.filter(s => s.n > 0)
      .reduce((a, b) => (a == null || b.width > a.width ? b : a), null);
    const notes = [];
    if (worst && worst.silhouette < 0.5) {
      notes.push('<span class="warn">C' + worst.id + ' is the weakest band at silhouette ' +
        fmt(worst.silhouette, 3) + ' \u2014 it is effectively touching its neighbour. Worth checking k.</span>');
    }
    const loose = R.stats.filter(s => s.n > 1 && s.density != null && s.density < 1);
    if (loose.length) {
      notes.push('<span class="warn">' + loose.map(s => 'C' + s.id).join(', ') +
        (loose.length > 1 ? ' are ' : ' is ') + 'sparser than an even spread \u2014 mostly empty span ' +
        'with a few points across it, which often means a hidden split.</span>');
    }
    if (!notes.length && widest) {
      notes.push('Widest band is C' + widest.id + ' at ' + fmt(widest.width, sigDp()) +
        '; raise k if you want it broken up.');
    }
    notes.push('<a href="#explainPanel" class="text-sky-400 hover:text-sky-300">What do these mean?</a>');
    $('statsNote').innerHTML = notes.join(' ');

    $('copyStatsBtn').onclick = () => {
      const head = STAT_COLS.map(c => c.h).join('\t');
      const body = R.stats.map(st => STAT_COLS.map(c => {
        if (c.k === 'id') return 'C' + st.id;
        const v = st[c.k];
        if (v == null) return '';
        if (c.k === 'share') return fmt(v * 100, 0);
        return typeof v === 'number' ? fmt(v, c.k === 'n' ? 0 : 6) : String(v);
      }).join('\t')).join('\n');
      copyText(head + '\n' + body, $('copyStatsBtn'));
    };
  }

  // ------------------------------------------------------------------ output

  function outputRows() {
    const R = state.result;
    const stats = R.stats;
    const withStats = $('withStats').checked;
    const cols = state.table.columns.concat(['Cluster'], withStats ? ['ClusterMin', 'ClusterMax'] : []);
    const byRow = new Map();
    R.rowIx.forEach((ri, j) => byRow.set(ri, R.res.assign[j]));
    const rows = state.table.rows.map((row, i) => {
      const cid = byRow.has(i) ? byRow.get(i) : null;
      const extra = [cid == null ? '—' : String(cid)];
      if (withStats) {
        const s = cid ? stats[cid - 1] : null;
        extra.push(s ? fmt(s.min) : '—', s ? fmt(s.max) : '—');
      }
      return row.slice(0, state.table.columns.length).concat(extra);
    });
    return { cols, rows };
  }

  function paintResults() {
    const { cols, rows } = outputRows();
    const R = state.result;
    $('resultPanel').hidden = false;
    let html = '<tr>' + cols.map(c => '<th>' + esc(c) + '</th>').join('') + '</tr>';
    rows.forEach(r => {
      html += '<tr>' + r.map((v, i) => {
        if (cols[i] === 'Cluster' && v !== '—') {
          return '<td><span class="swatch" style="background:' + R.ramp[+v - 1] + '"></span>C' + esc(v) + '</td>';
        }
        return '<td>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    $('resTable').innerHTML = html;
    $('resultStatus').textContent = rows.length + ' rows' + (R.skipped ? ', ' + R.skipped + ' without a number' : '');
  }

  function serialise(sep) {
    const { cols, rows } = outputRows();
    const q = (v) => {
      const s = String(v == null ? '' : v);
      return (s.indexOf(sep) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0)
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.map(q).join(sep)].concat(rows.map(r => r.map(q).join(sep))).join('\n');
  }

  // ------------------------------------------------------------------ wiring

  function init() {
    $('pasteBox').addEventListener('input', () => ingest($('pasteBox').value));
    $('pasteBox').addEventListener('paste', () => setTimeout(() => ingest($('pasteBox').value), 0));

    ['delim', 'dec'].forEach(id => $(id).addEventListener('change', () => ingest(state.text)));
    $('labelCol').addEventListener('change', () => {
      state.labelCol = parseInt($('labelCol').value, 10);
      state.pinned = null; paintChart(); paintResults();
    });
    $('xMode').addEventListener('change', () => { state.pinned = null; paintChart(); });
    $('noHeaderBtn').addEventListener('click', () => { state.headerRow = -1; rebuild(true); });

    $('kInput').addEventListener('change', recompute);
    $('kMinus').addEventListener('click', () => { $('kInput').value = Math.max(1, state.k - 1); recompute(); });
    $('kPlus').addEventListener('click', () => { $('kInput').value = state.k + 1; recompute(); });
    $('withStats').addEventListener('change', paintResults);

    $('exampleBtn').addEventListener('click', () => { $('pasteBox').value = EXAMPLE; ingest(EXAMPLE); });
    $('clearBtn').addEventListener('click', () => { $('pasteBox').value = ''; reset(); });

    $('fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { $('pasteBox').value = rd.result; ingest(rd.result); };
      rd.readAsText(f);
    });

    const box = $('pasteBox');
    ['dragenter', 'dragover'].forEach(ev => box.addEventListener(ev, e => {
      e.preventDefault(); document.body.classList.add('dropping');
    }));
    ['dragleave', 'drop'].forEach(ev => box.addEventListener(ev, e => {
      e.preventDefault(); document.body.classList.remove('dropping');
    }));
    box.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { box.value = rd.result; ingest(rd.result); };
      rd.readAsText(f);
    });

    const svg = $('chart');
    svg.addEventListener('mousemove', e => {
      if (state.pinned) return;
      const p = pointAt(e);
      if (p) showTip(p, e); else hideTip();
    });
    svg.addEventListener('mouseleave', hideTip);
    svg.addEventListener('click', e => {
      const p = pointAt(e);
      if (!p) { state.pinned = null; hideTip(); return; }
      if (state.pinned && state.pinned.j === p.j) { state.pinned = null; hideTip(); }
      else { state.pinned = p; showTip(p, e); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { state.pinned = null; hideTip(); }
    });
    window.addEventListener('resize', () => { if (state.result) paintChart(); });

    $('copyBtn').addEventListener('click', () => copyText(serialise('\t'), $('copyBtn')));

    $('csvBtn').addEventListener('click', () => {
      const sep = state.decimal === ',' ? ';' : ',';
      const blob = new Blob(['﻿' + serialise(sep)], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'clustered.csv';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      flash(btn, 'Copied');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); flash(btn, 'Copied'); }
      catch (e2) { flash(btn, 'Copy failed'); }
      document.body.removeChild(ta);
    }
  }

  function flash(btn, msg) {
    const old = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => { btn.textContent = old; }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
