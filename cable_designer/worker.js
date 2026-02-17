/**
 * worker.js — Web Worker that loads Pyodide and runs the Python cable analysis.
 *
 * Message protocol (both directions use { type, msgId, payload }):
 *
 *  Inbound (from app.js):
 *    { type: 'init' }
 *    { type: 'analyze', msgId: string, payload: paramsObject }
 *
 *  Outbound (to app.js):
 *    { type: 'ready' }
 *    { type: 'result',  msgId, payload: resultsObject }
 *    { type: 'error',   msgId, payload: { message } }
 *    { type: 'progress', payload: { message } }
 */

// Module worker: use import() instead of importScripts()
// import.meta.url is available in module workers.

let pyodide = null;
let analyzerSource = null;

// ── Initialization ────────────────────────────────────────────────────────────

async function initialize() {
  try {
    _progress('Loading Pyodide runtime…');

    // Dynamic import of Pyodide (module worker, not importScripts)
    const pyodideModule = await import('https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.mjs');
    const { loadPyodide } = pyodideModule;

    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    });

    _progress('Installing numpy and scipy…');
    await pyodide.loadPackage(['numpy', 'scipy']);

    _progress('Loading cable analysis engine…');
    // Relative URL resolution — works on localhost AND GitHub Pages
    const pyUrl = new URL('./python/cable_analyzer.py', import.meta.url).href;
    const resp = await fetch(pyUrl);
    if (!resp.ok) throw new Error(`Failed to fetch cable_analyzer.py: ${resp.status}`);
    analyzerSource = await resp.text();

    // Execute module source so run_analysis is defined in the Python globals
    await pyodide.runPythonAsync(analyzerSource);

    _progress('Ready');
    self.postMessage({ type: 'ready' });
  } catch (err) {
    self.postMessage({ type: 'error', msgId: null, payload: { message: String(err) } });
  }
}

// ── Analysis ──────────────────────────────────────────────────────────────────

async function analyze(msgId, params) {
  try {
    if (!pyodide) throw new Error('Pyodide not initialized');

    // Pass params safely via Python globals — avoids any string escaping issues
    pyodide.globals.set('_params_json', JSON.stringify(params));
    const resultJson = await pyodide.runPythonAsync('run_analysis(_params_json)');

    const results = JSON.parse(resultJson);
    self.postMessage({ type: 'result', msgId, payload: results });
  } catch (err) {
    self.postMessage({ type: 'error', msgId, payload: { message: String(err) } });
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = ({ data }) => {
  switch (data.type) {
    case 'init':
      initialize();
      break;
    case 'analyze':
      analyze(data.msgId, data.payload);
      break;
    default:
      console.warn('[worker] Unknown message type:', data.type);
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _progress(message) {
  self.postMessage({ type: 'progress', payload: { message } });
}
