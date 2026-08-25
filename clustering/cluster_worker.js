/**
 * Compute worker for the clustering tool.
 *
 * Only the genuinely expensive work lives here — the Fisher–Jenks dynamic programme is
 * O(k·n²) and will lock a tab for seconds on a large paste. The threshold slider does
 * NOT go through the worker: on a presorted array it is a binary search, so it stays on
 * the main thread where it costs nothing and needs no cancellation path.
 *
 * Every job carries the caller's generation token straight back out. The main thread
 * drops anything stale, which handles the ordinary case; for a job already running when
 * a newer one arrives, the pool terminates this worker outright, because a busy worker
 * cannot read its own message queue.
 */
/* global importScripts, ClusterAPI */
importScripts('cluster_api.js');

self.onmessage = function (e) {
  const { id, gen, type, payload } = e.data || {};
  const t0 = Date.now();
  try {
    let result;
    switch (type) {
      case 'cluster': {
        const res = ClusterAPI.clusterValues(payload.values, payload.k);
        const stats = ClusterAPI.clusterStats(payload.values, res.assign, payload.k);
        const overall = ClusterAPI.overallStats(payload.values, stats);
        result = { res, stats, overall };
        break;
      }
      case 'elbow':
        result = ClusterAPI.elbowScan(payload.values, payload.kMax);
        break;
      case 'ping':
        result = { ok: true };
        break;
      default:
        throw new Error('unknown job type: ' + type);
    }
    self.postMessage({ id, gen, ok: true, result, ms: Date.now() - t0 });
  } catch (err) {
    self.postMessage({ id, gen, ok: false, error: String(err && err.message || err), ms: Date.now() - t0 });
  }
};
