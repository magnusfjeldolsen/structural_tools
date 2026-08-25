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
    pinned: null,
    runToken: 0,
    panics: 0,
    tabs: [],            // open cluster ids, in the order they were opened
    active: 'overview',
    cd: {}               // per-cluster distribution state, keyed by cluster id
  };

  const INK = { text: '#7f92ad', bright: '#c3d3e6', axis: '#33496b', grid: '#1c2942',
    brk: '#44607f', surface: '#131c2e' };
  const ROW_CAP = 500;   // rows rendered into the results table; export is never capped

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


  // ------------------------------------------------------------ worker pool

  /*
   * One worker, one generation counter. A stale reply is dropped on arrival; a stale job
   * that is already running gets its worker terminated, because a busy worker cannot read
   * its own queue and there is nothing else that will stop it.
   *
   * Terminating costs a respawn of a few milliseconds, which is far cheaper than waiting
   * out a Fisher-Jenks pass the answer to which is already obsolete.
   */
  const pool = {
    worker: null,
    gen: 0,
    seq: 0,
    busy: false,
    pending: new Map(),
    supported: typeof Worker !== 'undefined',

    spawn() {
      if (!this.supported) return null;
      try {
        this.worker = new Worker('cluster_worker.js');
        this.worker.onmessage = (e) => this.receive(e.data);
        this.worker.onerror = () => { this.supported = false; this.worker = null; };
      } catch (err) {
        this.supported = false;                       // file:// and old browsers
        this.worker = null;
      }
      return this.worker;
    },

    receive(msg) {
      this.busy = false;
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (!entry) return;
      if (msg.gen !== this.gen) return;               // superseded while in flight
      entry.resolve(msg);
    },

    /** Abandon everything in flight. */
    panic() {
      this.gen++;
      for (const [, entry] of this.pending) entry.resolve({ ok: false, cancelled: true });
      this.pending.clear();
      if (this.worker && this.busy) {
        this.worker.terminate();
        this.worker = null;
        state.panics++;
      }
      this.busy = false;
    },

    run(type, payload) {
      if (!this.supported) return Promise.resolve(null);   // caller falls back to sync
      if (this.busy) this.panic();
      if (!this.worker && !this.spawn()) return Promise.resolve(null);
      const id = ++this.seq, gen = this.gen;
      this.busy = true;
      return new Promise((resolve) => {
        this.pending.set(id, { resolve });
        this.worker.postMessage({ id, gen, type, payload });
      });
    }
  };

  function setBusy(on, note) {
    $('busy').hidden = !on;
    if (on && note) $('busy').textContent = note;
  }

  // ------------------------------------------------------------- clustering

  function recompute() {
    if (!state.table || state.valueCol < 0) {
      ['chartPanel', 'resultPanel', 'statsPanel'].forEach(id => { $(id).hidden = true; });
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
    if (!values.length) return;

    const token = ++state.runToken;
    setBusy(true, 'clustering ' + values.length.toLocaleString('en') + ' values…');

    pool.run('cluster', { values, k: state.k }).then((msg) => {
      if (token !== state.runToken) return;                    // a newer run took over
      if (msg && msg.cancelled) return;
      let res, stats, overall, ms = msg ? msg.ms : null;
      if (msg && msg.ok) {
        ({ res, stats, overall } = msg.result);
      } else {
        if (msg && msg.error) { $('elbowNote').innerHTML = '<span class="warn">' + esc(msg.error) + '</span>'; setBusy(false); return; }
        // no worker available: do it here rather than refusing
        const t0 = performance.now();
        try { res = API().clusterValues(values, state.k); }
        catch (e) { $('elbowNote').innerHTML = '<span class="warn">' + esc(e.message) + '</span>'; setBusy(false); return; }
        stats = API().clusterStats(values, res.assign, state.k);
        overall = API().overallStats(values, stats);
        ms = Math.round(performance.now() - t0);
      }

      const ramp = API().rampFor(state.k);
      state.result = { values, rowIx, res, stats, ramp, overall, ms,
        skipped: state.table.rows.length - values.length };

      $('kBadge').innerHTML = (res.method === 'exact' ? '· exact optimum' : '· fast approximation') +
        ' · ' + values.length.toLocaleString('en') + ' values' +
        (ms != null ? ' · ' + ms + ' ms' : '') +
        (pool.supported ? '' : ' · <span class="warn">no worker, computed on the page</span>');

      setBusy(false);
      paintElbow(values);
      paintChart();
      paintLegend();
      paintResults();
      paintStats();
      refreshOpenTabs();
    });
  }

  function paintElbow(values) {
    const kMax = Math.min(10, values.length);
    if (kMax < 2) { $('elbow').innerHTML = ''; $('elbowNote').textContent = ''; return; }
    const scan = API().elbowScan(values, kMax);   // Lloyd path only, cheap even at 10^5
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


  // ---------------------------------------------------------------- canvas

  /** Size a canvas to its CSS box at device resolution and return a CSS-pixel context. */
  function ctxFor(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    return ctx;
  }

  function text(ctx, str, x, y, align, fill, weight) {
    ctx.fillStyle = fill || INK.text;
    ctx.font = (weight ? weight + ' ' : '') + '10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(str, x, y);
  }

  function line(ctx, x1, y1, x2, y2, stroke, dash) {
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------- chart

  const M = { t: 12, r: 54, b: 26, l: 52 };

  function paintChart() {
    const R = state.result;
    if (!R) return;
    $('chartPanel').hidden = false;

    const wrap = $('chartWrap');
    const W = wrap.clientWidth || 900;
    const H = Math.max(430, Math.min(760, 200 + R.values.length * 1.8));
    wrap.style.height = H + 'px';
    const ctx = ctxFor($('chart'), W, H);
    ctxFor($('chartOver'), W, H);

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
    state.scale = { px, py, W, H };

    const ticks = niceTicks(y0, y1, 5);
    ticks.forEach(t => {
      line(ctx, M.l, py(t), W - M.r, py(t), INK.grid);
      text(ctx, fmt(t), M.l - 6, py(t) + 3, 'right');
    });
    line(ctx, M.l, M.t, M.l, H - M.b, INK.axis);
    line(ctx, M.l, H - M.b, W - M.r, H - M.b, INK.axis);
    niceTicks(xMin, xMax, 6).filter(t => t >= xMin && t <= xMax)
      .forEach(t => text(ctx, fmt(t), px(t), H - M.b + 14, 'center'));

    R.res.breaks.forEach((b) => {
      const yy = py(b);
      line(ctx, M.l, yy, W - M.r, yy, INK.brk, [3, 3]);
      text(ctx, fmt(b), M.l + 5, yy - 3, 'left', '#8fa3bd');
    });

    // points: one arc per row, but no DOM node per row
    state.points = [];
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK.surface;
    for (let j = 0; j < R.values.length; j++) {
      const cx = px(xs[j]), cy = py(R.values[j]), cid = R.res.assign[j];
      state.points.push({ cx, cy, j, rowIx: R.rowIx[j], value: R.values[j], cluster: cid });
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, 6.2832);
      ctx.fillStyle = R.ramp[cid - 1];
      ctx.fill();
      if (R.values.length <= 6000) ctx.stroke();     // rings cost more than they give at scale
    }

    R.stats.forEach((st) => {
      if (!st.n) return;
      const top = py(st.max), bot = py(st.min);
      if (bot - top < 11 && R.stats.length > 8) return;
      text(ctx, 'C' + st.id, W - M.r + 6, (top + bot) / 2 + 3.5, 'left', R.ramp[st.id - 1], 'bold');
    });

    text(ctx, useLabelX ? state.table.columns[state.labelCol] : 'row order',
      (M.l + W - M.r) / 2, H - 4, 'center');
    ctx.save();
    ctx.translate(12, (M.t + H - M.b) / 2);
    ctx.rotate(-Math.PI / 2);
    text(ctx, state.table.columns[state.valueCol], 0, 0, 'center');
    ctx.restore();

    $('chartTitle').innerHTML = esc(state.table.columns[state.valueCol]) + ' in ' + state.k +
      ' clusters · ' + R.values.length.toLocaleString('en') + ' points' +
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
      '<button type="button" class="muted" data-open="' + s.id + '" style="background:none;border:0;' +
      'cursor:' + (s.n ? 'pointer' : 'default') + ';padding:0;text-align:left"' +
      (s.n ? ' title="Open the distribution of C' + s.id + '"' : '') + '>' +
      '<span class="swatch" style="background:' + R.ramp[s.id - 1] + '"></span>' +
      '<b style="color:#e6edf6">C' + s.id + '</b> · n = ' + s.n +
      (s.n ? ' · ' + fmt(s.min) + ' … ' + fmt(s.max) + ' <span style="color:#38bdf8">›</span>' : '') +
      '</button>').join('');
    $('legend').querySelectorAll('[data-open]').forEach(b =>
      b.addEventListener('click', () => openCluster(parseInt(b.dataset.open, 10))));
  }

  // -------------------------------------------------------------- hover

  function pointAt(evt) {
    const rect = $('chart').getBoundingClientRect();
    const x = evt.clientX - rect.left, y = evt.clientY - rect.top;
    let best = null, bestD = 14;
    for (const p of state.points) {
      const d = Math.hypot(p.cx - x, p.cy - y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  function highlight(p) {
    const sc = state.scale;
    if (!sc) return;
    const ctx = ctxFor($('chartOver'), sc.W, sc.H);
    if (!p) return;
    ctx.beginPath();
    ctx.arc(p.cx, p.cy, 5.5, 0, 6.2832);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function showTip(p, evt) {
    const row = state.table.rows[p.rowIx];
    const heading = state.labelCol >= 0 ? row[state.labelCol] : 'Row ' + (p.rowIx + 1);
    let html = '<b>' + esc(heading || 'Row ' + (p.rowIx + 1)) + '</b><table>';
    state.table.columns.forEach((c, i) => {
      html += '<tr' + (i === state.valueCol ? ' class="hl"' : '') + '><td class="k">' + esc(c) +
        '</td><td>' + esc(row[i]) + '</td></tr>';
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
    highlight(p);
  }

  function hideTip() {
    if (state.pinned) return;
    $('tip').style.display = 'none';
    highlight(null);
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
      html += '<tr data-open="' + st.id + '" style="cursor:' + (st.n ? 'pointer' : 'default') + '"' +
        (st.n ? ' title="Open the distribution of C' + st.id + '"' : '') + '>' +
        STAT_COLS.map(c => '<td class="' + (c.num ? 'n' : '') + '">' + statCell(c, st) + '</td>').join('') +
        '</tr>';
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
    $('statsTable').querySelectorAll('[data-open]').forEach(tr =>
      tr.addEventListener('click', () => openCluster(parseInt(tr.dataset.open, 10))));

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
    // A 100 000-row DOM table is unreadable and freezes the tab; the exports are not capped.
    const shown = rows.length > ROW_CAP ? rows.slice(0, ROW_CAP) : rows;
    shown.forEach(r => {
      html += '<tr>' + r.map((v, i) => {
        if (cols[i] === 'Cluster' && v !== '—') {
          return '<td><span class="swatch" style="background:' + R.ramp[+v - 1] + '"></span>C' + esc(v) + '</td>';
        }
        return '<td>' + esc(v) + '</td>';
      }).join('') + '</tr>';
    });
    $('resTable').innerHTML = html;
    $('resultStatus').innerHTML = rows.length.toLocaleString('en') + ' rows' +
      (R.skipped ? ', ' + R.skipped + ' without a number' : '') +
      (rows.length > ROW_CAP
        ? ' · <span class="warn">showing the first ' + ROW_CAP + '</span> — copy and download give you all of them'
        : '');
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


  // ------------------------------------------------------ tabs + distribution

  function openCluster(id) {
    if (!state.result || !state.result.stats[id - 1] || !state.result.stats[id - 1].n) return;
    if (state.tabs.indexOf(id) < 0) state.tabs.push(id);
    state.active = id;
    paintTabs();
    showView();
  }

  function closeCluster(id) {
    state.tabs = state.tabs.filter(t => t !== id);
    delete state.cd[id];
    if (state.active === id) state.active = 'overview';
    paintTabs();
    showView();
  }

  function paintTabs() {
    const R = state.result;
    const wrap = $('tabs');
    if (!R) { wrap.hidden = true; return; }
    wrap.hidden = false;
    let html = '<button type="button" class="tab ' + (state.active === 'overview' ? 'on' : '') +
      '" data-tab="overview">Overview</button>';
    state.tabs.forEach(id => {
      const st = R.stats[id - 1];
      html += '<button type="button" class="tab ' + (state.active === id ? 'on' : '') + '" data-tab="' + id + '">' +
        '<span class="tabdot" style="background:' + R.ramp[id - 1] + '"></span>C' + id +
        '<span class="muted" style="font-size:.7rem">' + (st ? st.n : 0) + '</span>' +
        '<span class="x" data-close="' + id + '" title="close">\u00d7</span></button>';
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', (e) => {
      const close = e.target.closest('[data-close]');
      if (close) { closeCluster(parseInt(close.dataset.close, 10)); return; }
      state.active = b.dataset.tab === 'overview' ? 'overview' : parseInt(b.dataset.tab, 10);
      paintTabs(); showView();
    }));
  }

  function showView() {
    const cluster = state.active !== 'overview';
    $('viewOverview').hidden = cluster;
    $('viewCluster').hidden = !cluster;
    if (cluster) paintDistribution(state.active);
    else if (state.result) paintChart();
  }

  /** Drop any open tab whose cluster no longer exists after a re-run. */
  function refreshOpenTabs() {
    const R = state.result;
    if (!R) { state.tabs = []; state.active = 'overview'; state.cd = {}; paintTabs(); return; }
    state.tabs = state.tabs.filter(id => R.stats[id - 1] && R.stats[id - 1].n > 0);
    state.tabs.forEach(id => { if (state.cd[id]) state.cd[id].sorted = null; });
    if (state.active !== 'overview' && state.tabs.indexOf(state.active) < 0) state.active = 'overview';
    paintTabs();
    showView();
  }

  /** Sorted values and prefix sums for one cluster, built once and reused. */
  function clusterSeries(id) {
    const R = state.result;
    let cd = state.cd[id];
    if (!cd) cd = state.cd[id] = { threshold: null, bins: null, sorted: null };
    if (!cd.sorted) {
      const vals = [];
      for (let j = 0; j < R.values.length; j++) if (R.res.assign[j] === id) vals.push(R.values[j]);
      vals.sort((a, b) => a - b);
      cd.sorted = vals;
      cd.prefix = API().prefixSums(vals);
      if (cd.bins == null) cd.bins = API().suggestBins(vals);
      if (cd.threshold == null || cd.threshold < vals[0] || cd.threshold > vals[vals.length - 1]) {
        cd.threshold = vals[Math.floor((vals.length - 1) / 2)];
      }
    }
    return cd;
  }

  const CD = { t: 16, r: 18, b: 46, l: 54, stripH: 74 };

  function paintDistribution(id) {
    const R = state.result;
    const st = R.stats[id - 1];
    const cd = clusterSeries(id);
    const v = cd.sorted, n = v.length;
    const colour = R.ramp[id - 1];

    $('cdTitle').innerHTML = '<span class="tabdot" style="display:inline-block;background:' + colour +
      ';margin-right:.4rem"></span>Cluster C' + id + ' · distribution of ' +
      esc(state.table.columns[state.valueCol]);
    $('cdMeta').innerHTML = n.toLocaleString('en') + ' points · ' + fmt(st.min) + ' … ' + fmt(st.max) +
      ' · mean ' + fmt(st.mean) + ' · sd ' + fmt(st.sd);

    const lo = v[0], hi = v[n - 1];
    const sl = $('cdSlider');
    sl.min = 0; sl.max = 1000;
    sl.value = hi > lo ? Math.round((cd.threshold - lo) / (hi - lo) * 1000) : 500;
    $('cdBins').min = 2;
    $('cdBins').max = Math.max(8, Math.min(120, n));
    $('cdBins').value = cd.bins;
    $('cdBinsOut').textContent = cd.bins + ' bins';

    cd.hist = API().histogram(v, cd.bins);
    drawDistBase(cd, colour);
    updateThreshold(id, cd.threshold, true);
  }

  function distGeom(cd) {
    const wrap = $('cdWrap');
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 340;
    const lo = cd.hist.lo, hi = cd.hist.hi;
    const span = (hi - lo) || 1;
    const px = (x) => CD.l + (x - lo) / span * (W - CD.l - CD.r);
    const histBottom = H - CD.b - CD.stripH;
    return { W, H, lo, hi, px, histBottom, stripTop: histBottom + 12 };
  }

  /** Histogram on top, the raw points as a jittered strip below, one shared x axis. */
  function drawDistBase(cd, colour) {
    const g = distGeom(cd);
    const ctx = ctxFor($('cdBase'), g.W, g.H);
    const h = cd.hist;

    const yTicks = niceTicks(0, h.max, 4);
    yTicks.forEach(t => {
      const y = g.histBottom - (t / (h.max || 1)) * (g.histBottom - CD.t);
      line(ctx, CD.l, y, g.W - CD.r, y, INK.grid);
      text(ctx, String(Math.round(t)), CD.l - 6, y + 3, 'right');
    });

    ctx.fillStyle = colour;
    h.bins.forEach(b => {
      if (!b.n) return;
      const x0 = g.px(b.lo), x1 = g.px(b.hi);
      const y = g.histBottom - (b.n / (h.max || 1)) * (g.histBottom - CD.t);
      ctx.fillRect(x0 + 1, y, Math.max(1, x1 - x0 - 2), g.histBottom - y);
    });

    line(ctx, CD.l, g.histBottom, g.W - CD.r, g.histBottom, INK.axis);
    text(ctx, 'count', CD.l - 6, CD.t - 4, 'right');

    // strip of the actual points, jittered so overlaps are visible
    const stripMid = g.stripTop + CD.stripH / 2;
    ctx.fillStyle = colour;
    ctx.globalAlpha = cd.sorted.length > 4000 ? 0.35 : 0.75;
    for (let i = 0; i < cd.sorted.length; i++) {
      const x = g.px(cd.sorted[i]);
      const jitter = ((i * 2654435761) % 1000) / 1000 - 0.5;   // deterministic, no Math.random
      ctx.beginPath();
      ctx.arc(x, stripMid + jitter * (CD.stripH - 14), 2.4, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    line(ctx, CD.l, g.H - CD.b + 6, g.W - CD.r, g.H - CD.b + 6, INK.axis);
    niceTicks(g.lo, g.hi, 6).filter(t => t >= g.lo && t <= g.hi)
      .forEach(t => text(ctx, fmt(t), g.px(t), g.H - CD.b + 20, 'center'));
    text(ctx, state.table.columns[state.valueCol], (CD.l + g.W - CD.r) / 2, g.H - 6, 'center');
    text(ctx, 'points', CD.l - 6, stripMid + 3, 'right');
  }

  /**
   * Repaint only the overlay: the threshold line and the shading either side. The
   * histogram and the strip underneath are untouched, which is what keeps this cheap
   * enough to run on every pointer move.
   */
  function updateThreshold(id, x, force) {
    const cd = state.cd[id];
    if (!cd || !cd.sorted) return;
    const t0 = performance.now();
    cd.threshold = x;

    const g = distGeom(cd);
    const ctx = ctxFor($('cdOver'), g.W, g.H);
    const xp = g.px(x);

    ctx.fillStyle = 'rgba(148,163,184,.10)';
    ctx.fillRect(CD.l, CD.t, Math.max(0, xp - CD.l), g.H - CD.b - CD.t + 6);
    line(ctx, xp, CD.t - 4, xp, g.H - CD.b + 6, '#ffffff');
    ctx.fillStyle = '#e6edf6';
    ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = xp > g.W * 0.75 ? 'right' : 'left';
    ctx.fillText(fmt(x), xp + (xp > g.W * 0.75 ? -5 : 5), CD.t + 4);

    const s = API().thresholdStats(cd.sorted, cd.prefix, x);
    const R = state.result;
    const cells = [
      ['at or below', s.below.toLocaleString('en'), fmt(s.belowShare * 100, 1) + ' %'],
      ['above', s.above.toLocaleString('en'), fmt(s.aboveShare * 100, 1) + ' %'],
      ['mean below', s.meanBelow == null ? '—' : fmt(s.meanBelow), ''],
      ['mean above', s.meanAbove == null ? '—' : fmt(s.meanAbove), ''],
      ['percentile', fmt(s.percentile * 100, 1), 'of this band']
    ];
    $('cdReadout').innerHTML = cells.map(c =>
      '<div class="read"><b>' + esc(c[1]) + (c[2] && c[0].indexOf('mean') < 0 ?
        ' <span style="font-size:.8rem;color:#7dd3fc">' + esc(c[2]) + '</span>' : '') +
      '</b><span>' + esc(c[0]) + (c[0] === 'percentile' ? ' %' : '') + '</span></div>').join('');

    $('cdValue').value = fmt(x);
    $('cdPerf').textContent = 'threshold recomputed in ' +
      (performance.now() - t0).toFixed(2) + ' ms · binary search, never cancelled' +
      (state.panics ? ' · ' + state.panics + ' clustering pass' + (state.panics > 1 ? 'es' : '') + ' abandoned' : '');
    void force; void R;
  }

  function sliderToValue(id) {
    const cd = state.cd[id];
    const v = cd.sorted, lo = v[0], hi = v[v.length - 1];
    return lo + (+$('cdSlider').value / 1000) * (hi - lo);
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

    const plot = $('chart');   // a canvas now, but the same pointer handling
    plot.addEventListener('mousemove', e => {
      if (state.pinned) return;
      const p = pointAt(e);
      if (p) showTip(p, e); else hideTip();
    });
    plot.addEventListener('mouseleave', hideTip);
    plot.addEventListener('dblclick', e => {
      const p = pointAt(e);
      if (p) { state.pinned = null; hideTip(); openCluster(p.cluster); }
    });
    plot.addEventListener('click', e => {
      const p = pointAt(e);
      if (!p) { state.pinned = null; hideTip(); return; }
      if (state.pinned && state.pinned.j === p.j) { state.pinned = null; hideTip(); }
      else { state.pinned = p; showTip(p, e); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { state.pinned = null; hideTip(); }
    });
    let resizeT = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (!state.result) return;
        if (state.active === 'overview') paintChart(); else paintDistribution(state.active);
      }, 120);
    });

    $('copyBtn').addEventListener('click', () => copyText(serialise('\t'), $('copyBtn')));

    // The slider runs through rAF so several input events inside one frame collapse into
    // a single repaint - the 60 Hz ceiling the readout is quoted against.
    let rafPending = false;
    const onSlide = () => {
      if (state.active === 'overview' || rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        updateThreshold(state.active, sliderToValue(state.active));
      });
    };
    $('cdSlider').addEventListener('input', onSlide);
    $('cdValue').addEventListener('change', () => {
      if (state.active === 'overview') return;
      const cd = state.cd[state.active], v = cd.sorted;
      const x = Math.min(v[v.length - 1], Math.max(v[0], num($('cdValue').value)));
      if (x == null || !isFinite(x)) { updateThreshold(state.active, cd.threshold); return; }
      $('cdSlider').value = Math.round((x - v[0]) / ((v[v.length - 1] - v[0]) || 1) * 1000);
      updateThreshold(state.active, x);
    });
    $('cdMedian').addEventListener('click', () => {
      if (state.active === 'overview') return;
      const st = state.result.stats[state.active - 1];
      const cd = state.cd[state.active], v = cd.sorted;
      $('cdSlider').value = Math.round((st.median - v[0]) / ((v[v.length - 1] - v[0]) || 1) * 1000);
      updateThreshold(state.active, st.median);
    });
    $('cdBins').addEventListener('input', () => {
      if (state.active === 'overview') return;
      const cd = state.cd[state.active];
      cd.bins = parseInt($('cdBins').value, 10);
      $('cdBinsOut').textContent = cd.bins + ' bins';
      cd.hist = API().histogram(cd.sorted, cd.bins);
      drawDistBase(cd, state.result.ramp[state.active - 1]);
      updateThreshold(state.active, cd.threshold);
    });
    $('cdAutoBins').addEventListener('click', () => {
      if (state.active === 'overview') return;
      const cd = state.cd[state.active];
      cd.bins = API().suggestBins(cd.sorted);
      $('cdBins').value = cd.bins;
      $('cdBins').dispatchEvent(new Event('input'));
    });
    $('cdWrap').addEventListener('click', (e) => {
      if (state.active === 'overview') return;
      const cd = state.cd[state.active];
      const g = distGeom(cd);
      const rect = $('cdBase').getBoundingClientRect();
      const frac = (e.clientX - rect.left - CD.l) / (g.W - CD.l - CD.r);
      const x = Math.min(g.hi, Math.max(g.lo, g.lo + frac * (g.hi - g.lo)));
      $('cdSlider').value = Math.round((x - g.lo) / ((g.hi - g.lo) || 1) * 1000);
      updateThreshold(state.active, x);
    });

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
