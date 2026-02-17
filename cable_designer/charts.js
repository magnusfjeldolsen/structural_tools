/**
 * charts.js — All Chart.js interactive plots for Cable Designer.
 *
 * Four plots:
 *  1. Load diagram        — applied loads (distributed + point loads)
 *  2. Cable shape         — deformed geometry with sag annotation
 *  3. Force distribution  — T, H, |V| along span
 *  4. Stress distribution — σ(x) along span
 *
 * Hover behavior:
 *  - mode: 'index', intersect: false  → full-width hover zone (no small target)
 *  - Crosshair vertical guide line via chartjs-plugin-crosshair
 *  - Custom tooltip showing ALL relevant values at that x position
 */

// Chart instances (keyed by canvas id)
const _charts = {};

// ── Shared chart defaults ─────────────────────────────────────────────────────
const BASE_FONT = { family: "'Inter', 'ui-sans-serif', sans-serif", size: 11 };
const GRID_COLOR = 'rgba(255,255,255,0.07)';
const TICK_COLOR = '#9ca3af';
const LABEL_COLOR = '#d1d5db';

function _baseOptions(xLabel, yLabel, tooltipLines) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    interaction: {
      mode: 'index',
      intersect: false,   // Hover anywhere on chart width — wide zone
      axis: 'x',
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { color: LABEL_COLOR, font: BASE_FONT, boxWidth: 14, padding: 10 },
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(15,23,42,0.95)',
        borderColor: 'rgba(148,163,184,0.3)',
        borderWidth: 1,
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        titleFont: { ...BASE_FONT, weight: 'bold' },
        bodyFont: BASE_FONT,
        padding: 10,
        callbacks: {
          title: (items) => {
            const x = items[0]?.parsed?.x;
            return x != null ? `x = ${x.toFixed(3)} m` : '';
          },
          label: tooltipLines,
        },
      },
      crosshair: {
        line: { color: 'rgba(148,163,184,0.4)', width: 1, dashPattern: [4, 4] },
        sync: { enabled: false },
        zoom: { enabled: false },
      },
    },
    scales: {
      x: {
        type: 'linear',
        title: { display: true, text: xLabel, color: LABEL_COLOR, font: BASE_FONT },
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: BASE_FONT, maxTicksLimit: 10 },
      },
      y: {
        title: { display: true, text: yLabel, color: LABEL_COLOR, font: BASE_FONT },
        grid: { color: GRID_COLOR },
        ticks: { color: TICK_COLOR, font: BASE_FONT },
      },
    },
  };
}

function _toXY(xArr, yArr) {
  return xArr.map((x, i) => ({ x, y: yArr[i] }));
}

function _destroyChart(id) {
  if (_charts[id]) {
    _charts[id].destroy();
    delete _charts[id];
  }
}

function _getCtx(id) {
  const canvas = document.getElementById(id);
  return canvas ? canvas.getContext('2d') : null;
}

// ── 1. Load Diagram ───────────────────────────────────────────────────────────
export function renderLoadDiagram(results, state) {
  const id = 'chart-loads';
  _destroyChart(id);
  const ctx = _getCtx(id);
  if (!ctx) return;

  const { x, q_dist, nodal_loads } = results;
  const span = state.span;

  // Distributed load (inverted: positive downward in display)
  const distData = _toXY(x, q_dist.map(v => -v));

  // Point load markers — pick nodes where nodal load >> distributed contribution
  const pointData = [];
  state.pointLoads.forEach(pl => {
    // Find nearest x index
    let bestIdx = 0;
    let bestDist = Infinity;
    x.forEach((xi, i) => {
      const d = Math.abs(xi - pl.position);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    });
    pointData.push({ x: pl.position, y: -pl.magnitude, label: `${pl.magnitude.toFixed(1)} kN` });
  });

  const datasets = [];

  // Distributed load area
  if (q_dist.some(v => v > 0)) {
    datasets.push({
      label: 'Distributed load [kN/m]',
      data: distData,
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56,189,248,0.15)',
      borderWidth: 2,
      pointRadius: 0,
      fill: { target: { value: 0 }, below: 'rgba(56,189,248,0.15)' },
      tension: 0,
    });
  }

  // Point loads as scatter
  if (state.pointLoads.length > 0) {
    datasets.push({
      label: 'Point loads [kN]',
      data: pointData,
      type: 'scatter',
      backgroundColor: '#f87171',
      borderColor: '#f87171',
      pointRadius: 7,
      pointStyle: 'triangle',
      rotation: 180,
    });
  }

  const options = _baseOptions('Position [m]', 'Load [kN or kN/m]', (item) => {
    const ds = item.dataset.label;
    const y = item.parsed.y;
    return `${ds}: ${Math.abs(y).toFixed(2)}`;
  });

  // Invert y so loads appear going downward
  options.scales.y.reverse = true;
  options.scales.x.min = 0;
  options.scales.x.max = span;

  _charts[id] = new Chart(ctx, { type: 'line', data: { datasets }, options });
}

// ── 2. Cable Shape ────────────────────────────────────────────────────────────
export function renderCableShape(results, state) {
  const id = 'chart-shape';
  _destroyChart(id);
  const ctx = _getCtx(id);
  if (!ctx) return;

  const { x, y, f, f_position, sag_ratio } = results;

  const cableData = _toXY(x, y.map(v => -v));  // invert: sag shown downward

  const options = _baseOptions(
    'Position [m]',
    'Deflection [m]',
    (item) => {
      const xi = item.parsed.x;
      const yi = Math.abs(item.parsed.y);
      if (item.datasetIndex === 0) return `Sag: ${yi.toFixed(4)} m`;
      return null;
    }
  );
  options.scales.y.reverse = true;  // Positive sag shown downward
  options.scales.x.min = 0;
  options.scales.x.max = state.span;

  // Annotation: max sag point
  const datasets = [
    {
      label: 'Cable shape',
      data: cableData,
      borderColor: '#38bdf8',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0,
    },
    {
      label: 'Original position',
      data: [{ x: 0, y: 0 }, { x: state.span, y: 0 }],
      borderColor: 'rgba(148,163,184,0.4)',
      borderDash: [6, 4],
      borderWidth: 1.5,
      pointRadius: 0,
    },
    {
      label: `Max sag: ${f.toFixed(4)} m at x=${f_position.toFixed(3)} m (f/L=${sag_ratio.toFixed(4)})`,
      data: [{ x: f_position, y: -f }],
      type: 'scatter',
      backgroundColor: '#f87171',
      borderColor: '#f87171',
      pointRadius: 7,
      pointStyle: 'circle',
    },
  ];

  _charts[id] = new Chart(ctx, { type: 'line', data: { datasets }, options });
}

// ── 3. Force Distribution ─────────────────────────────────────────────────────
export function renderForceDistribution(results, state) {
  const id = 'chart-forces';
  _destroyChart(id);
  const ctx = _getCtx(id);
  if (!ctx) return;

  const { x, T, H_array, V, T_max, T_max_position } = results;

  const datasets = [
    {
      label: 'Total tension T [kN]',
      data: _toXY(x, T),
      borderColor: '#f87171',
      backgroundColor: 'transparent',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0,
    },
    {
      label: 'Horizontal H [kN]',
      data: _toXY(x, H_array),
      borderColor: '#60a5fa',
      borderDash: [6, 3],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
    },
    {
      label: 'Vertical |V| [kN]',
      data: _toXY(x, V.map(v => Math.abs(v))),
      borderColor: '#4ade80',
      borderDash: [3, 3],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
      tension: 0,
    },
    {
      label: `T_max = ${T_max.toFixed(2)} kN at x=${T_max_position.toFixed(3)} m`,
      data: [{ x: T_max_position, y: T_max }],
      type: 'scatter',
      backgroundColor: '#f87171',
      borderColor: '#f87171',
      pointRadius: 7,
      pointStyle: 'circle',
    },
  ];

  const options = _baseOptions(
    'Position [m]',
    'Force [kN]',
    (item) => {
      const ds = item.dataset.label;
      const y = item.parsed.y;
      if (ds.startsWith('T_max')) return null;
      return `${ds.split(' [')[0]}: ${y.toFixed(2)} kN`;
    }
  );
  options.scales.x.min = 0;
  options.scales.x.max = state.span;

  _charts[id] = new Chart(ctx, { type: 'line', data: { datasets }, options });
}

// ── 4. Stress Distribution ────────────────────────────────────────────────────
export function renderStressDistribution(results, state) {
  const id = 'chart-stress';
  _destroyChart(id);
  const ctx = _getCtx(id);
  if (!ctx) return;

  const { x, stress_dist, stress } = results;

  const datasets = [
    {
      label: 'Stress σ(x) [MPa]',
      data: _toXY(x, stress_dist),
      borderColor: '#c084fc',
      backgroundColor: 'rgba(192,132,252,0.1)',
      borderWidth: 2.5,
      pointRadius: 0,
      tension: 0,
      fill: true,
    },
    {
      label: `Average stress: ${stress.toFixed(2)} MPa`,
      data: [{ x: 0, y: stress }, { x: state.span, y: stress }],
      borderColor: '#f87171',
      borderDash: [6, 4],
      backgroundColor: 'transparent',
      borderWidth: 1.5,
      pointRadius: 0,
    },
  ];

  const options = _baseOptions(
    'Position [m]',
    'Stress [MPa]',
    (item) => {
      if (item.datasetIndex === 1) return null;
      return `σ: ${item.parsed.y.toFixed(2)} MPa`;
    }
  );
  options.scales.x.min = 0;
  options.scales.x.max = state.span;

  _charts[id] = new Chart(ctx, { type: 'line', data: { datasets }, options });
}

// ── Render all four plots ─────────────────────────────────────────────────────
export function renderAllCharts(results, state) {
  renderLoadDiagram(results, state);
  renderCableShape(results, state);
  renderForceDistribution(results, state);
  renderStressDistribution(results, state);
}

// ── Destroy all (called on new analysis start) ────────────────────────────────
export function destroyAllCharts() {
  ['chart-loads', 'chart-shape', 'chart-forces', 'chart-stress'].forEach(_destroyChart);
}
