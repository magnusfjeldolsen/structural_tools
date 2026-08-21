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
    $('kcCustom').disabled = $('kcMode').value !== 'custom';
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
        row('td', 'A<sub>s</sub> required', cells.map(() => fmt(r.detailing.AsHMin, 0))) +
        row('td', 'max spacing', cells.map(c => '<b class="text-sky-300">c' + fmt(Math.floor(c.cc / 5) * 5, 0) + '</b>'));
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
      row('td', 'A<sub>s</sub> required [mm²/m]', S.map(b => cell(b, 'AsReq', 0))) +
      row('td', 'max spacing · ' + (direct ? '7.3.4 direct' : '7.3.3'), S.map(ccCell)) +
      row('td', 'max spacing · ' + (direct ? '7.3.3' : '7.3.4 direct'), D.map(ccCell)) +
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
    $('heroNote').innerHTML = note;
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

    render();
  }

  function setCrack(v) {
    state.crackReq = v;
    document.querySelectorAll('[data-crack]').forEach(x => x.classList.toggle('on', x.dataset.crack === v));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
