/* UI layer for the wall minimum reinforcement tool. All arithmetic lives in
   wall_min_reinf_api.js — this file only reads the form and paints the result. */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = () => window.WallMinReinf;

  const state = {
    mode: 'onBase',
    crackReq: 'wk030',
    selectedDia: 16,
    diaAuto: true,          // until the user picks a bar themselves
    method: 'simplified',
    matrixDir: 'h'
  };

  const n = (v) => {
    const x = parseFloat(String(v).replace(',', '.'));
    return isFinite(x) ? x : null;
  };
  const fmt = (v, dp) => (v == null || !isFinite(v)) ? '—' : v.toFixed(dp).replace('.', ',');
  const esc = (s) => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  // ------------------------------------------------------------------ inputs

  function readInputs() {
    return {
      mode: state.mode,
      restrainedTopBottom: $('rtb').checked,
      t: n($('t').value),
      fck: n($('fck').value),
      fyk: n($('fyk').value),
      layers: n($('layers').value),
      cover: n($('cover').value),
      exposureSide: $('side').value,
      vBar: { dia: n($('vdia').value), spacing: n($('vcc').value) },
      crackReq: state.crackReq,
      wkCustom: n($('wkCustom').value),
      naCoverUplift: { on: $('uplift').checked, cnom: n($('cnom').value), cminDur: n($('cmindur').value) },
      hD: n($('hD').value),
      kcMode: $('kcMode').value,
      kcCustom: n($('kcCustom').value),
      kMode: $('kMode').value,
      crackAgeDays: n($('age').value),
      cementClass: $('cement').value,
      method: state.method,
      selectedDia: state.selectedDia,
      wallL: n($('wallL').value),
      wallH: n($('wallH').value),
      epsFree: (n($('epsFree').value) || 320) * 1e-6,
      epsCtu: (n($('epsCtu').value) || 100) * 1e-6
    };
  }

  const MODE_HINT = {
    ordinary: 'Detailing only. §9.6.2 vertical and NA.9.6.3 horizontal.',
    onBase: 'Edge restraint from the base. The horizontal bars carry it — that is where §7.3.2 bites.',
    watertight: 'EN 1992-3 Tightness Class 1. wk1 follows from the head over the thickness.'
  };

  function syncVisibility() {
    $('modeHint').textContent = MODE_HINT[state.mode] || '';
    $('hDWrap').className = state.crackReq === 'watertight' ? 'flex items-center gap-1.5' : 'hidden';
    $('wkWrap').className = state.crackReq === 'custom' ? 'flex items-center gap-1.5' : 'hidden';
    const upliftOn = state.crackReq === 'wk030';
    $('upliftWrap').className = upliftOn ? 'flex items-center gap-1.5 text-xs text-slate-300 ml-2' : 'hidden';
    const showCov = upliftOn && $('uplift').checked;
    $('cnom').className = showCov ? 'fld' : 'fld hidden';
    $('cmindur').className = showCov ? 'fld' : 'fld hidden';
    if (showCov) { $('cnom').style.width = '5rem'; $('cmindur').style.width = '5rem'; }
    const tight = state.mode === 'watertight';
    ['kcMode', 'kMode', 'age', 'cement'].forEach(id => {
      $(id).disabled = tight;
      $(id).style.opacity = tight ? '.45' : '';
      $(id).title = tight
        ? 'Fixed by NA.9.6.3(1) for a tightness-critical wall: eq. (7.1) with fct,eff = fctm and k = kc = 1,0.'
        : '';
    });
    $('kcCustom').disabled = tight || $('kcMode').value !== 'custom';
    if ($('kcMode').value === 'pureTension') $('kcCustom').value = '1.0';
    if ($('kcMode').value === 'house') $('kcCustom').value = '0.6';
  }

  // ----------------------------------------------------------------- render

  /* The cheapest buildable bar: least steel among the options someone can actually fix.
     Falls back to the widest achievable spacing when nothing clears the buildable band. */
  function autoDia(r) {
    if (!r.crack.active) return null;
    const list = r.crack.methodEffective === 'direct' ? r.crack.barsDirect : r.crack.bars;
    const ok = list.filter(b => b.AsReq != null && b.build === 'ok');
    if (ok.length) return ok.reduce((a, b) => (b.AsReq < a.AsReq ? b : a)).dia;
    const any = list.filter(b => b.AsReq != null);
    if (any.length) return any.reduce((a, b) => (b.ccUncapped > a.ccUncapped ? b : a)).dia;
    return null;
  }

  function render() {
    syncVisibility();
    let r = API().calculate(readInputs());
    if (state.diaAuto) {
      const best = autoDia(r);
      if (best != null && best !== state.selectedDia) {
        state.selectedDia = best;
        r = API().calculate(readInputs());
      }
    }
    const dias = r.constants.BAR_DIAMETERS;

    $('wkOut').textContent = r.crack.active
      ? r.crack.wkSource + '  ·  fct,eff = ' + fmt(r.material.fctEff, 2) + ' MPa  ·  kc = ' +
        fmt(r.crack.kc, 2) + '  ·  k = ' + fmt(r.crack.k, 2)
      : 'Crack control switched off — only the detailing minima of §9.6 apply.';

    document.querySelectorAll('[data-method]').forEach(b => {
      const forced = r.crack.active && !r.crack.tableCovers;
      b.classList.toggle('on', b.dataset.method === r.crack.methodEffective);
      b.disabled = forced;
      b.style.opacity = forced && b.dataset.method === 'simplified' ? '.35' : '';
      b.title = forced ? 'Table 7.2N does not span this crack width — the direct route is the only one available' : '';
    });
    paintDiaPicker(dias, r);
    paintHeadline(r);
    paintGovBars(r);
    paintHeroTable(r, dias);
    paintVertTable(r, dias);
    paintMatrix(r, dias);
    paintChecks(r);
    paintWarnings(r);
  }

  function paintDiaPicker(dias, r) {
    $('diaPicker').innerHTML = (state.diaAuto ? '' :
      '<button class="pill sm" data-dia="auto" title="return to the automatic pick">auto</button>') +
      dias.map(d => {
      const list = r.crack.methodEffective === 'direct' ? r.crack.barsDirect : r.crack.bars;
      const b = list.find(x => x.dia === d);
      const dead = r.crack.active && b && b.AsReq == null;
      return '<button class="pill sm ' + (d === state.selectedDia ? 'on' : '') + '" data-dia="' + d + '"' +
        (dead ? ' style="opacity:.4"' : '') + '>' + d + '</button>';
    }).join('');
  }

  function paintHeadline(r) {
    const h = r.governing.horizontal;
    if (h.blocked) {
      $('hAnswer').innerHTML = '<span class="text-rose-400">ø' + h.dia + ' will not do</span>';
      $('hArea').textContent = h.blockReason === 'wkOutOfRange'
        ? 'wk is outside Table 7.2N — use the direct route'
        : 'the bar is larger than Table 7.2N permits at any stress for this wk';
      $('hClause').innerHTML = '<span class="chk-fail">Pick a smaller bar, or relax the crack requirement.</span>';
    } else {
      const list = r.crack.methodEffective === 'direct' ? r.crack.barsDirect : r.crack.bars;
      const selBar = list.find(b => b.dia === h.dia);
      const cc = Math.floor(h.ccMax / 5) * 5;                 // round down to a buildable 5 mm step
      const per = r.inputs.layers === 2 ? ' at each face' : ' in the single layer';
      if (selBar && selBar.build === 'unbuildable') {
        $('hAnswer').innerHTML = 'ø' + h.dia + ' <span class="text-rose-400">will not reach it</span>';
        $('hArea').textContent = fmt(h.As, 0) + ' mm²/m' + per + ' would need c' +
          fmt(selBar.ccUncapped, 0) + ' — below the 75 mm steel fixers can work to.';
      } else {
        const tone = !selBar || selBar.build === 'ok' ? 'text-sky-400' : 'text-amber-300';
        $('hAnswer').innerHTML = 'ø' + h.dia + ' <span class="' + tone + '">c' + cc + '</span>' +
          (selBar && selBar.build === 'tight' ? '<span class="text-amber-300 text-sm font-normal"> tight</span>' : '');
        $('hArea').textContent = fmt(h.As, 0) + ' mm²/m required' + per +
          (state.diaAuto && r.crack.active ? '  ·  cheapest buildable bar' : '');
      }
      $('hClause').innerHTML = '<span class="text-slate-400">governed by</span> <b>' + esc(h.clause) + '</b>' +
        (h.ratio > 1.02 ? ' <span class="text-amber-400">· ' + fmt(h.ratio, 1) + '× the detailing minimum</span>' : '');
    }

    const v = r.governing.vertical;
    const byArea = 1000 * Math.PI * Math.pow(r.inputs.vBar.dia, 2) / 4 / v.As;
    const vccMax = Math.floor(Math.min(byArea, r.detailing.sVMax) / 5) * 5;
    const entered = r.inputs.vBar.spacing;
    const passes = r.detailing.AsVProv >= v.As && entered <= r.detailing.sVMax;
    $('vAnswer').innerHTML = 'ø' + r.inputs.vBar.dia +
      ' <span class="' + (passes ? 'text-sky-400' : 'text-rose-400') + '">c' + entered + '</span>' +
      '<span class="text-sm font-normal ' + (passes ? 'text-emerald-400' : 'text-rose-400') + '"> ' +
      (passes ? '✓' : '✗ short') + '</span>';
    $('vArea').innerHTML = fmt(r.detailing.AsVProv, 0) + ' mm²/m provided against ' + fmt(v.As, 0) +
      ' required.<br>Widest permissible spacing for ø' + r.inputs.vBar.dia + ': <b>c' + vccMax + '</b>' +
      (byArea > r.detailing.sVMax ? ' (capped by 9.6.2(3), c' + fmt(r.detailing.sVMax, 0) + ')' : ' (area governs)');
    $('vClause').innerHTML = '<span class="text-slate-400">governed by</span> <b>' + esc(v.clause) + '</b>';

    const z = r.zone;
    let zt = 'Extra horizontal steel over <b>' + fmt(z.practice, 0) + ' mm</b> from the base (3t — Norwegian practice, not an EC2 rule).';
    if (z.tableL1) {
      const T = z.tableL1;
      if (T.note === 'noCracking') {
        zt += '<br><span class="chk-ok">EN 1992-3 Table L.1: R_crit = ' + fmt(T.Rcrit, 2) +
          ' exceeds the 0,50 base restraint — no restraint cracking predicted.</span>';
      } else {
        const worse = T.height > z.practice * 1.05;
        zt += '<br><span class="' + (worse ? 'chk-warn' : 'chk-ok') + '">Table L.1 at L/H = ' + fmt(T.LH, 1) +
          ': ' + (T.note === 'fullHeight' ? 'restrained over the <b>full height</b>' : '<b>' + fmt(T.height, 0) + ' mm</b>') +
          (worse ? ' — 3t is unconservative here.' : '.') + '</span>';
      }
    } else {
      zt += '<br><span class="text-slate-600">Enter L and H under Assumptions for the EN 1992-3 Table L.1 check.</span>';
    }
    $('hZone').innerHTML = zt;
  }

  function paintGovBars(r) {
    const rows = [
      { label: '9.6.2 vertical minimum', v: r.detailing.AsVMin, tone: '#64748b' },
      { label: 'NA.9.6.3 horizontal minimum', v: r.detailing.AsHMin, tone: '#0ea5e9' }
    ];
    if (r.crack.active) {
      const s = r.crack.bars.find(b => b.dia === state.selectedDia);
      const d = r.crack.barsDirect.find(b => b.dia === state.selectedDia);
      if (s && s.AsReq != null) rows.push({ label: '7.3.2 crack · 7.3.3 simplified', v: s.AsReq, tone: '#f59e0b' });
      if (d && d.AsReq != null) rows.push({ label: '7.3.2 crack · 7.3.4 direct', v: d.AsReq, tone: '#f43f5e' });
    }
    const max = Math.max.apply(null, rows.map(x => x.v).concat([1]));
    $('govBars').innerHTML = rows.map(x =>
      '<div><div class="flex justify-between text-xs mb-0.5"><span class="text-slate-400">' + x.label +
      '</span><span class="num text-slate-200">' + fmt(x.v, 0) + '</span></div>' +
      '<div class="barbg"><div class="barfg" style="width:' + (100 * x.v / max).toFixed(1) + '%;background:' + x.tone + '"></div></div></div>'
    ).join('');
  }

  function paintHeroTable(r, dias) {
    if (!r.crack.active) {
      const cells = dias.map(d => {
        const cc = Math.min(1000 * Math.PI * d * d / 4 / r.detailing.AsHMin, r.detailing.sHMax);
        return { d, cc };
      });
      $('heroTable').innerHTML =
        row('th', 'ø [mm]', cells.map(c => '<b>' + c.d + '</b>')) +
        row('td', 'A<sub>s</sub> req [mm²/m]', cells.map(() => fmt(r.detailing.AsHMin, 0))) +
        row('td', 'c/c max', cells.map(c => '<b class="text-sky-300">c' + fmt(Math.floor(c.cc / 5) * 5, 0) + '</b>'));
      $('heroNote').textContent = 'Detailing minimum only. Spacing is additionally capped at c400 by 9.6.3(2).';
      wireColumns();
      return;
    }

    const direct = r.crack.methodEffective === 'direct';
    const S = dias.map(d => (direct ? r.crack.barsDirect : r.crack.bars).find(b => b.dia === d));
    const D = dias.map(d => (direct ? r.crack.bars : r.crack.barsDirect).find(b => b.dia === d));
    const cell = (b, key, dp) => b && b[key] != null ? fmt(b[key], dp) : '<span class="text-slate-600">—</span>';
    const ccCell = (b) => {
      if (!b || b.AsReq == null) return '<span class="text-rose-400">n/a</span>';
      const cc = Math.floor(Math.min(b.ccMax, r.detailing.sHMax) / 5) * 5;
      const tone = b.build === 'unbuildable' ? 'text-rose-400' : b.build === 'tight' ? 'text-amber-300' : 'text-sky-300';
      return '<b class="' + tone + '">c' + cc + '</b>';
    };

    $('heroTable').innerHTML =
      row('th', 'ø [mm]', dias.map(d => '<b>' + d + '</b>'), dias) +
      (direct ? '' : row('td', 'φ*<sub>s</sub> needed', S.map(b => cell(b, 'phiStarReq', 1)))) +
      row('td', 'σ<sub>s</sub> [MPa]', S.map(b => cell(b, 'sigmaS', 0))) +
      row('td', 'A<sub>s</sub> req [mm²/m]', S.map(b => cell(b, 'AsReq', 0))) +
      row('td', 'c/c max · ' + (direct ? '7.3.4' : '7.3.3'), S.map(ccCell)) +
      row('td', 'c/c max · ' + (direct ? '7.3.3' : '7.3.4'), D.map(ccCell)) +
      row('td', 'verdict', S.map(b => {
        if (!b || b.status === 'outOfTable') return '<span class="text-rose-400" title="beyond Table 7.2N">bar too large</span>';
        if (b.status === 'wkOutOfRange') return '<span class="text-slate-600">—</span>';
        if (b.build === 'unbuildable') return '<span class="text-rose-400">too tight</span>';
        if (b.build === 'tight') return '<span class="text-amber-300">tight</span>';
        return '<span class="text-emerald-400">buildable</span>';
      }));

    const sel = r.crack.bars.find(b => b.dia === state.selectedDia);
    const selD = r.crack.barsDirect.find(b => b.dia === state.selectedDia);
    let note = 'Smaller bars are permitted a higher σ<sub>s</sub> by Table 7.2N, so they need <i>less</i> steel — ' +
      'that is why the required area rises with bar size.';
    if (sel && selD && sel.AsReq != null && selD.AsReq != null) {
      note += ' For ø' + state.selectedDia + ' the direct route of 7.3.4 asks for ' + fmt(selD.AsReq, 0) +
        ' mm²/m against ' + fmt(sel.AsReq, 0) + ' from the simplified route.';
    }
    $('heroNote').innerHTML = note + ' Spacings round down to 5 mm.';
    wireColumns();
  }

  function row(tag, label, cells, dias) {
    const head = '<' + tag + ' style="text-align:left;color:#7f92ad;font-weight:500">' + label + '</' + tag + '>';
    return '<tr>' + head + cells.map((c, i) => {
      const d = dias ? dias[i] : null;
      const on = (d != null ? d : cellDia(i)) === state.selectedDia;
      return '<' + tag + ' data-col="' + cellDia(i) + '"' + (on ? ' class="c-pick"' : '') +
        ' style="cursor:pointer">' + c + '</' + tag + '>';
    }).join('') + '</tr>';
  }
  let COLS = [];
  function cellDia(i) { return COLS[i]; }

  function wireColumns() {
    document.querySelectorAll('#heroTable [data-col]').forEach(el => {
      el.addEventListener('click', () => {
        state.selectedDia = parseFloat(el.dataset.col);
        state.diaAuto = false;
        render();
      });
    });
  }

  /* Same shape as the horizontal table, but the vertical requirement does not vary with
     bar size - 9.6.2(1) is a flat area - so the interesting column is the spacing. */
  function paintVertTable(r, dias) {
    const need = r.governing.vertical.As;
    const cap = r.detailing.sVMax;
    const chosen = r.inputs.vBar.dia;

    const cells = dias.map(d => {
      const byArea = 1000 * Math.PI * d * d / 4 / need;
      const cc = Math.floor(Math.min(byArea, cap) / 5) * 5;
      return { d, cc, capped: byArea > cap };
    });

    const hdr = (c) => '<th data-vcol="' + c.d + '" style="cursor:pointer"' +
      (c.d === chosen ? ' class="c-pick"' : '') + '><b>' + c.d + '</b></th>';
    const td = (c, html, extra) => '<td data-vcol="' + c.d + '" style="cursor:pointer"' +
      (c.d === chosen ? ' class="c-pick"' : '') + (extra || '') + '>' + html + '</td>';

    const lead = (txt) => '<td style="text-align:left;color:#7f92ad">' + txt + '</td>';

    let html = '<tr><th style="text-align:left;color:#7f92ad;font-weight:500">\u00f8 [mm]</th>' +
      cells.map(hdr).join('') + '</tr>';
    html += '<tr>' + lead('A<sub>s</sub> req [mm\u00b2/m]') +
      cells.map(c => td(c, fmt(need, 0))).join('') + '</tr>';
    html += '<tr>' + lead('c/c max') +
      cells.map(c => td(c,
        '<b class="' + (c.capped ? 'text-slate-400' : 'text-sky-300') + '">c' + c.cc + '</b>',
        c.capped ? ' title="capped by 9.6.2(3), min(3t, 400)"' : '')).join('') + '</tr>';
    $('vertTable').innerHTML = html;

    const anyCapped = cells.some(c => c.capped);
    $('vertNote').innerHTML = '<b class="text-slate-400">' + esc(r.governing.vertical.clause) + '</b> \u00b7 ' +
      'one area for every bar, so only the spacing moves. Capped at c' + fmt(cap, 0) +
      ' by 9.6.2(3)' + (anyCapped ? '; greyed values sit at that cap' : '') +
      '. Spacings round down to 5 mm.';

    $('vertTable').querySelectorAll('[data-vcol]').forEach(el => {
      el.addEventListener('click', () => {
        $('vdia').value = el.dataset.vcol;
        render();
      });
    });
  }

  function paintMatrix(r, dias) {
    const spacings = r.constants.SPACINGS;
    const vertical = state.matrixDir === 'v';
    const cap = vertical ? r.detailing.sVMax : r.detailing.sHMax;

    const need = dias.map(d => {
      if (vertical) return r.governing.vertical.As;
      if (!r.crack.active) return r.detailing.AsHMin;
      const list = r.crack.methodEffective === 'direct' ? r.crack.barsDirect : r.crack.bars;
      const b = list.find(x => x.dia === d);
      if (!b || b.AsReq == null) return null;                 // bar not permitted at this wk
      return Math.max(b.AsReq, r.detailing.AsHMin);
    });

    // cheapest (largest) spacing that still works, per column
    const best = dias.map((d, i) => {
      if (need[i] == null) return null;
      let pick = null;
      for (const s of spacings) {
        if (s > cap) continue;
        if (API().area(d, s) >= need[i]) pick = s;
      }
      return pick;
    });

    let html = '<tr><th style="text-align:left">c/c ↓  ø →</th>' +
      dias.map(d => '<th>' + d + '</th>').join('') + '</tr>';
    html += '<tr><td style="text-align:left;color:#7f92ad">required</td>' +
      need.map(v => '<td style="color:#cbd5e1">' + (v == null ? '—' : fmt(v, 0)) + '</td>').join('') + '</tr>';

    for (const s of spacings) {
      html += '<tr><td style="text-align:left;color:#7f92ad">c' + s + '</td>';
      dias.forEach((d, i) => {
        const As = API().area(d, s);
        let cls = 'c-ok', title = '';
        if (s > cap) { cls = 'c-cap'; title = 'spacing exceeds the code maximum c' + cap; }
        else if (need[i] == null) { cls = 'c-veto'; title = 'ø' + d + ' is not permitted at this crack width'; }
        else if (As >= need[i]) cls = 'c-ok';
        else if (As >= 0.95 * need[i]) cls = 'c-near';
        else cls = 'c-bad';
        const mark = (best[i] === s && s <= cap) ? ' ◇' : '';
        html += '<td class="' + cls + (best[i] === s && s <= cap ? ' c-pick' : '') + '" title="' + title + '">' +
          fmt(As, 0) + mark + '</td>';
      });
      html += '</tr>';
    }
    $('matrix').innerHTML = html;
  }

  function paintChecks(r) {
    const icon = { ok: '✓', warn: '!', fail: '✕', info: 'i' };
    $('checks').innerHTML = r.checks.map(c =>
      '<div class="flex gap-2"><span class="chk-' + c.status + '" style="width:1em;flex:none">' + icon[c.status] + '</span>' +
      '<div><div class="text-slate-200">' + esc(c.label) + '</div>' +
      '<div class="text-slate-500 leading-snug">' + esc(c.detail) + '</div></div></div>'
    ).join('');
  }

  function paintWarnings(r) {
    const items = r.warnings.slice();
    const cal = r.checks.find(c => c.id === 'tableCalibration');
    if (cal) items.unshift(cal.detail);
    $('warnPanel').style.display = items.length ? '' : 'none';
    $('warnings').innerHTML = items.map(w =>
      '<div class="border-l-2 border-amber-500/50 pl-2 leading-snug">' + esc(w) + '</div>').join('');
  }


  // ---------------------------------------------------------------- tooltips
  /* One place for every explanation. Keys are attached to elements by TIP_TARGETS
     below, so the markup stays free of prose. */
  const TIPS = {
    'mode.ordinary': ['Ordinary wall',
      'A wall with no significant restraint \u2014 above ground, free to shrink. Only the detailing minima ' +
      'run: 9.6.2 for the vertical bars, NA.9.6.3 for the horizontal. \u00a77.3.2 is switched off, so the ' +
      'horizontal steel falls to the code floor.'],
    'mode.onBase': ['Wall on base',
      'A wall cast on a hardened foundation \u2014 basement, retaining wall, lift shaft. The base stops the ' +
      'wall shrinking along its length, so the tension runs <em>horizontally</em> and the cracks are ' +
      'vertical. \u00a77.3.2 is applied to the horizontal bars only, and typically multiplies them by three.'],
    'mode.watertight': ['Watertight wall',
      'Turns on the NA\u2019s tightness rules, which are not optional. NA.9.6.2 doubles the vertical ' +
      'minimum to 0,004\u00b7A<sub>c</sub>, and NA.9.6.3(1) fixes eq. (7.1) at f<sub>ct,eff</sub> = ' +
      'f<sub>ctm</sub> with k = k<sub>c</sub> = 1,0 \u2014 so the k<sub>c</sub>, k and cracking-age inputs ' +
      'are locked. ' +
      'EN 1992-3 Tightness Class 1. The crack width stops being your choice and follows the head over the ' +
      'wall thickness: 0,20 mm at h<sub>D</sub>/h \u2264 5, down to 0,05 mm at \u2265 35. Bar sizes use ' +
      'eq. (7.122), with 10 in place of the 8 in (7.7N). Below w<sub>k</sub> 0,20 Table 7.2N runs out and ' +
      'the direct calculation of 7.3.4 takes over automatically.'],
    'rtb': ['Restrained top and bottom',
      'For a wall cast <em>between</em> two slabs the vertical direction is restrained as well, so \u00a77.3.2 ' +
      'is applied to the vertical bars too. Leave it off for a wall free to shorten vertically, which is the ' +
      'usual case and why vertical steel is normally detailing-driven.'],

    'crack.none': ['No crack control required',
      'Switches \u00a77.3.2 off entirely and leaves only \u00a79.6. The NA supports this: footnote 1 to Table ' +
      'NA.7.1N says that in X0 the crack width does not affect durability and the 0,40 limit is there for ' +
      'appearance, so where appearance is not a constraint the value may be increased. Also where movement ' +
      'joints are provided instead, since ' +
      'EN 1992-3 Table N.1(b) then asks only for 9.6.2 to 9.6.4. This is the cheapest answer the code allows, ' +
      'and it is a decision you own rather than one the tool makes.'],
    'crack.wk040': ['w<sub>k</sub> = 0,40 mm',
      'Exposure class X0 under the quasi-permanent combination, per NA Table NA.7.1N.'],
    'crack.wk030': ['w<sub>k</sub> = 0,30 mm',
      'XC1\u2013XC4, XD1\u2013XD2 and XS1\u2013XS2 quasi-permanent; XD3, XS3 and XSA frequent. The Norwegian NA ' +
      'scales this by k<sub>c</sub> = c<sub>nom</sub>/c<sub>min,dur</sub> capped at 1,3 \u2014 tick the box ' +
      'alongside to use it, so extra cover buys a wider permitted crack.'],
    'crack.wk020': ['w<sub>k</sub> = 0,20 mm',
      'Tighter than the NA asks for in ordinary exposure. Use it when a client or specification demands it, ' +
      'and watch what it costs in the table on the right.'],
    'crack.watertight': ['EN 1992-3 Class 1',
      'w<sub>k1</sub> interpolated on the hydrostatic head over the wall thickness. Enter the head beside.'],
    'crack.custom': ['Custom crack width',
      'Any target you like. Below 0,20 mm Table 7.2N cannot answer and the tool switches to the direct ' +
      'calculation of 7.3.4 on its own.'],
    'uplift': ['NA cover uplift',
      'NA.7.3.1(5): the permitted crack width scales with cover, k<sub>c</sub> = ' +
      'c<sub>nom</sub>/c<sub>min,dur</sub>, capped at 1,3. With 35 over 25 that is 0,30 \u00d7 1,3 = 0,39 mm.'],

    'f.t': ['Wall thickness',
      'Drives everything: A<sub>c</sub> = 1000 \u00b7 t for both the NA.9.6.3 leg and A<sub>ct</sub> in ' +
      'eq. (7.1), the 3t zone height, and the min(3t, 400) spacing cap of 9.6.2(3).'],
    'f.fck': ['Concrete class',
      'Sets f<sub>ctm</sub> = 0,30 \u00b7 f<sub>ck</sub><sup>2/3</sup> from the closed form of Table 3.1, not ' +
      'a lookup \u2014 so every class works, including the ones a three-row spreadsheet table would silently ' +
      'return zero for. Stronger concrete cracks at a higher force, so it needs <em>more</em> minimum steel.'],
    'f.fyk': ['Steel grade',
      'Divides the NA.9.6.3 leg, and sets the absolute floor A<sub>s</sub> \u2265 ' +
      'k<sub>c</sub>\u00b7k\u00b7f<sub>ct,eff</sub>\u00b7A<sub>ct</sub>/f<sub>yk</sub> below which the bars ' +
      'yield the instant the section cracks.'],
    'f.layers': ['Reinforcement layers',
      'Two layers means one mesh per face. A single central layer sits t/2 from the surface, which eq. (7.7N) ' +
      'punishes hard \u2014 under edge restraint it usually cannot be crack-controlled at all. The detailing ' +
      'minimum changes too: NA.9.6.3(1) states the horizontal minimum per face for <em>doubly</em> reinforced ' +
      'walls, and that a singly reinforced wall shall carry the corresponding <em>total</em> area \u2014 so ' +
      'the one layer has to provide what two faces would have provided between them.'],
    'f.cover': ['Cover to the horizontal bar',
      'Enter c<sub>nom</sub>. 9.6.3 puts the horizontal steel at the surface and in a wall it is normally the ' +
      'outer layer for exactly that reason. Cover sets the lever arm in eq. (7.7N) and the 3,4\u00b7c term in ' +
      'the crack spacing (7.11).'],
    'f.side': ['Exterior or interior wall',
      'NA.9.6.3 replaces EC2\u2019s recommended A<sub>s,hmin</sub> = 0,001\u00b7A<sub>c</sub> with ' +
      'k\u00b7A<sub>c</sub>\u00b7f<sub>ctm</sub>/f<sub>yk</sub>: k = 0,30 exposed to outdoor climate, ' +
      '0,15 indoors. The 0,15 is not an arbitrary halving \u2014 across B25 to B45 it lands on 0,08\u20130,11 % ' +
      'of the section, which <em>is</em> the EC2 recommendation, just re-expressed so it scales with the ' +
      'cracking force instead of being a flat 0,1 %. Exterior is double that. Anything weather-exposed or cast ' +
      'against soil \u2014 facade, basement, retaining wall, lift pit, culvert \u2014 is normally taken as ' +
      'exterior. It only decides the answer when crack control is off; with \u00a77.3.2 active the crack ' +
      'requirement is usually well above both legs and the choice stops mattering.'],
    'f.vbar': ['Vertical steel you intend to provide',
      'Feeds the \u201c25 % of the vertical reinforcement\u201d leg of NA.9.6.3, the 9.6.4 links trigger, and the ' +
      'pass mark on the vertical card. It does not affect the horizontal crack calculation.'],

    'f.kc': ['k<sub>c</sub> in eq. (7.1)',
      'Locked to 1,0 in the watertight mode, where NA.9.6.3(1) fixes it. Otherwise: ' +
      '1,0 is pure tension, which is what edge restraint produces and the right default here. 0,6 is the ' +
      'Norwegian house rule carried over from the source spreadsheet \u2014 there is no clause behind it, so it ' +
      'is offered as a labelled choice rather than a hidden constant. Halving k<sub>c</sub> halves the steel.'],
    'f.k': ['k in eq. (7.1)',
      'k allows for non-uniform self-equilibrating stresses, which arise only from <em>internal</em> restraint. ' +
      'A wall held by its base is restrained <em>externally</em>, so k = 1,0. The EC2 interpolation on thickness ' +
      '(1,0 at 300 mm to 0,65 at 800 mm) is offered for the internal-restraint case.'],
    'f.age': ['Age at cracking',
      'Ignored in the watertight mode, where NA.9.6.3(1) requires f<sub>ct,eff</sub> = f<sub>ctm</sub> at ' +
      '28 days. Otherwise: ' +
      'sets f<sub>ct,eff</sub> in eq. (7.1). Early-age restraint cracking normally happens well before 28 days, ' +
      'and 7.3.2(2) lets you use f<sub>ctm</sub>(t) \u2014 the largest legitimate reduction on the table, worth ' +
      'about 40 % at three days. Several National Annexes impose a floor, so confirm against NA:2010.'],
    'f.cement': ['Cement class',
      'Only matters when cracking is taken before 28 days: it sets s in \u03b2<sub>cc</sub>(t), eq. (3.2). ' +
      'R gains strength fastest, S slowest.'],
    'f.LH': ['Wall length and height',
      'Optional. Give both and the EN 1992-3 Table L.1 restraint curve checks the 3t zone height for you. ' +
      'Restraint at the base is always 0,5; what L/H changes is the top, and above L/H \u2248 4 the whole ' +
      'height is restrained \u2014 which is where the 3t rule of thumb goes wrong.'],
    'f.eps': ['Free strain and strain capacity',
      'In microstrain. Their ratio is the restraint factor below which no crack forms, and that threshold read ' +
      'off the Table L.1 curve is what fixes the height of the cracked zone. Typical Norwegian early-thermal ' +
      'values are around 320 and 100.'],

    'method.simplified': ['7.3.3 simplified',
      'Table 7.2N with the eq. (7.7N) size adjustment \u2014 the familiar route, and what the office spreadsheet ' +
      'does. Note 1 to the table says it is derived for <em>bending</em> (k<sub>2</sub> = 0,5, ' +
      'k<sub>c</sub> = 0,4, h<sub>cr</sub> = 0,5h), so for a wall in uniform tension it runs roughly 10\u201315 % ' +
      'light. Compliant under 7.3.1(9), but read the row below it.'],
    'method.direct': ['7.3.4 direct',
      'The crack width computed from (7.8), (7.9) and (7.11) with k<sub>2</sub> = 1,0 for pure tension, solved ' +
      'for the area that hits your target. More faithful for restraint cracking, and the only route available ' +
      'below w<sub>k</sub> 0,20.'],

    'dir.h': ['Horizontal bars',
      'The direction that carries edge restraint. Each column has its own threshold, because the permitted ' +
      'steel stress depends on the bar size.'],
    'dir.v': ['Vertical bars',
      'One threshold for every column \u2014 0,002\u00b7A<sub>c</sub> split between the faces \u2014 and the ' +
      'spacing cap tightens to min(3t, 400).'],
    'diaPicker': ['Bar size',
      'The tool starts on the cheapest buildable bar. Pick another and the headline follows it; press ' +
      '\u201cauto\u201d to hand the choice back.']
  };

  /* selector -> [tip key, attach to the parent instead of the element itself] */
  const TIP_TARGETS = [
    ['[data-mode="ordinary"]', 'mode.ordinary'], ['[data-mode="onBase"]', 'mode.onBase'],
    ['[data-mode="watertight"]', 'mode.watertight'],
    ['[data-crack="none"]', 'crack.none'], ['[data-crack="wk040"]', 'crack.wk040'],
    ['[data-crack="wk030"]', 'crack.wk030'], ['[data-crack="wk020"]', 'crack.wk020'],
    ['[data-crack="watertight"]', 'crack.watertight'], ['[data-crack="custom"]', 'crack.custom'],
    ['[data-method="simplified"]', 'method.simplified'], ['[data-method="direct"]', 'method.direct'],
    ['[data-dir="h"]', 'dir.h'], ['[data-dir="v"]', 'dir.v'],
    ['#rtb', 'rtb', 'parent'], ['#upliftWrap', 'uplift'],
    ['#t', 'f.t', 'parent'], ['#fck', 'f.fck', 'parent'], ['#fyk', 'f.fyk', 'parent'],
    ['#layers', 'f.layers', 'parent'], ['#cover', 'f.cover', 'parent'], ['#side', 'f.side', 'parent'],
    ['#vdia', 'f.vbar', 'parent'], ['#vcc', 'f.vbar', 'parent'],
    ['#kcMode', 'f.kc', 'parent'], ['#kcCustom', 'f.kc', 'parent'], ['#kMode', 'f.k', 'parent'],
    ['#age', 'f.age', 'parent'], ['#cement', 'f.cement', 'parent'],
    ['#wallL', 'f.LH', 'parent'], ['#wallH', 'f.LH', 'parent'], ['#epsFree', 'f.eps', 'parent'],
    ['#diaPicker', 'diaPicker']
  ];

  function initTips() {
    for (const [sel, key, mode] of TIP_TARGETS) {
      document.querySelectorAll(sel).forEach(el => {
        const host = mode === 'parent' ? el.parentElement : el;
        if (!host) return;
        host.dataset.tip = key;
        const lbl = host.querySelector ? host.querySelector('.lbl') : null;
        if (lbl) lbl.dataset.tip = key;                    // dotted underline affordance
      });
    }

    const box = $('tip');
    let hideTimer = null;

    const show = (host) => {
      const t = TIPS[host.dataset.tip];
      if (!t) return;
      clearTimeout(hideTimer);
      box.innerHTML = '<b>' + t[0] + '</b>' + t[1];
      box.classList.add('on');
      const r = host.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      let x = Math.min(Math.max(8, r.left), window.innerWidth - b.width - 8);
      let y = r.bottom + 8;
      if (y + b.height > window.innerHeight - 8) y = Math.max(8, r.top - b.height - 8);
      box.style.left = x + 'px';
      box.style.top = y + 'px';
    };
    const hide = () => { hideTimer = setTimeout(() => box.classList.remove('on'), 60); };

    document.addEventListener('mouseover', (e) => {
      const host = e.target.closest('[data-tip]');
      if (host) show(host); else hide();
    });
    document.addEventListener('focusin', (e) => {
      const host = e.target.closest('[data-tip]');
      if (host) show(host);
    });
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', () => box.classList.remove('on'), true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('on'); });
  }

  // ------------------------------------------------------------------ wiring

  function init() {
    COLS = API().BAR_DIAMETERS;

    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
      const preset = { ordinary: 'none', onBase: 'wk030', watertight: 'watertight' }[state.mode];
      setCrack(preset);
      render();
    }));

    document.querySelectorAll('[data-crack]').forEach(b => b.addEventListener('click', () => {
      setCrack(b.dataset.crack); render();
    }));

    document.querySelectorAll('[data-method]').forEach(b => b.addEventListener('click', () => {
      state.method = b.dataset.method;
      render();
    }));

    document.querySelectorAll('[data-dir]').forEach(b => b.addEventListener('click', () => {
      state.matrixDir = b.dataset.dir;
      document.querySelectorAll('[data-dir]').forEach(x => x.classList.toggle('on', x === b));
      render();
    }));

    $('diaPicker').addEventListener('click', (e) => {
      const b = e.target.closest('[data-dia]');
      if (!b) return;
      if (b.dataset.dia === 'auto') { state.diaAuto = true; render(); return; }
      state.selectedDia = parseFloat(b.dataset.dia);
      state.diaAuto = false;
      render();
    });

    ['t', 'fck', 'fyk', 'layers', 'cover', 'side', 'vdia', 'vcc', 'rtb', 'uplift', 'cnom', 'cmindur',
      'hD', 'wkCustom', 'kcMode', 'kcCustom', 'kMode', 'age', 'cement', 'wallL', 'wallH', 'epsFree', 'epsCtu']
      .forEach(id => {
        const el = $(id);
        el.addEventListener('input', render);
        el.addEventListener('change', render);
      });

    initTips();
    render();
  }

  function setCrack(v) {
    state.crackReq = v;
    document.querySelectorAll('[data-crack]').forEach(x => x.classList.toggle('on', x.dataset.crack === v));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
