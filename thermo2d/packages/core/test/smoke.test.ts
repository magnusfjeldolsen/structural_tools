import { describe, expect, it } from 'vitest';
import { createEmptyProject, resolveMeshSettings } from '../src/index.js';

describe('core scaffold', () => {
  it('creates an empty project with a default analysis', () => {
    const p = createEmptyProject('x');
    expect(p.schemaVersion).toBe(1);
    expect(p.analyses.length).toBe(1);
    expect(resolveMeshSettings(p.mesh).boundarySize).toBe(3);
  });
});
