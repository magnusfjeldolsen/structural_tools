import { describe, expect, it } from 'vitest';
import { resultKey, transferables, type WorkerRequest, type WorkerResponse } from './protocol.js';

describe('worker protocol', () => {
  it('builds result keys that separate analyses and scenarios', () => {
    expect(resultKey('a', null)).toBe('a|');
    expect(resultKey('a', undefined)).toBe('a|');
    expect(resultKey('a', 's')).toBe('a|s');
    expect(resultKey('a', 's').split('|')).toEqual(['a', 's']);
  });
  it('collects typed-array buffers once each', () => {
    const shared = new Float32Array(4);
    const msg = { type: 'done', jobId: 'r1', result: { a: shared, b: new Uint32Array(2), nested: [shared, { c: new Float64Array(1) }], s: 'x' } };
    const bufs = transferables(msg);
    expect(bufs.length).toBe(3);
    expect(bufs).toContain(shared.buffer);
  });
  it('types the request/response union', () => {
    const req: WorkerRequest = { type: 'cancel', jobId: 'r1' };
    const res: WorkerResponse = { type: 'progress', jobId: 'r1', t: 5, fraction: 0.1, step: 1 };
    expect(req.type).toBe('cancel');
    expect(res.type).toBe('progress');
  });
});
