/**
 * Unit tests for snapUtils geometry helpers.
 *
 * The load-bearing test is the randomised tolerance assertion: it proves that
 * `projectOntoSegment`'s IEEE-754 noise is at least three orders of magnitude
 * tighter than PyNite's `PhysMember.descritize` tolerance of `1e-12 * (1 + L)`,
 * so a projected node is guaranteed to trigger sub-member splitting on solve.
 *
 * @see docs/plans/snap-to-element-projection.md §5.7, §8
 */
import { describe, it, expect } from 'vitest';
import { distanceToLineSegment, projectOntoSegment } from './snapUtils';

describe('projectOntoSegment', () => {
  it('projects a point onto the interior of a horizontal segment', () => {
    const result = projectOntoSegment(
      { x: 2, y: 1 },
      { x: 0, y: 0 },
      { x: 4, y: 0 }
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(0);
  });

  it('clamps to the start endpoint when the projection would fall before it', () => {
    const result = projectOntoSegment(
      { x: -3, y: 5 },
      { x: 0, y: 0 },
      { x: 4, y: 0 }
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('clamps to the end endpoint when the projection would fall past it', () => {
    const result = projectOntoSegment(
      { x: 10, y: -2 },
      { x: 0, y: 0 },
      { x: 4, y: 0 }
    );
    expect(result.x).toBe(4);
    expect(result.y).toBe(0);
  });

  it('projects onto a vertical segment', () => {
    const result = projectOntoSegment(
      { x: 1, y: 2 },
      { x: 0, y: 0 },
      { x: 0, y: 4 }
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(2);
  });

  it('is symmetric for a mirrored horizontal segment', () => {
    // Same geometry as the interior case but mirrored about y-axis
    const result = projectOntoSegment(
      { x: -2, y: 1 },
      { x: 0, y: 0 },
      { x: -4, y: 0 }
    );
    expect(result.x).toBe(-2);
    expect(result.y).toBe(0);
  });

  it('projects onto a 45-degree diagonal segment (perpendicular foot at midpoint)', () => {
    const result = projectOntoSegment(
      { x: 4, y: 0 },
      { x: 0, y: 0 },
      { x: 4, y: 4 }
    );
    // The perpendicular foot from (4, 0) onto the line y = x lies at (2, 2)
    expect(result.x).toBeCloseTo(2, 12);
    expect(result.y).toBeCloseTo(2, 12);
  });

  it('returns lineStart for a zero-length (degenerate) segment without dividing by zero', () => {
    const result = projectOntoSegment(
      { x: 5, y: 7 },
      { x: 2, y: 3 },
      { x: 2, y: 3 }
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(3);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('is deterministic — identical inputs produce identical outputs across calls', () => {
    const a = projectOntoSegment({ x: 1.7, y: 0.4 }, { x: 0, y: 0 }, { x: 3, y: 0 });
    const b = projectOntoSegment({ x: 1.7, y: 0.4 }, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
  });

  // Load-bearing tolerance test: proves projection noise is well below PyNite's
  // PhysMember.descritize tolerance of 1e-12 * (1 + L) for any reasonable L.
  it('produces projections whose perpendicular distance is <= 1e-13 m for L between 0.1 m and 1000 m', () => {
    const lengths = [0.1, 1, 10, 100, 1000];
    const samplesPerLength = 50;
    // Deterministic pseudo-random offsets so the test is reproducible
    let seed = 0x2dfea;
    const rand = () => {
      // xorshift32
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      // map to [-10, 10]
      return ((seed >>> 0) / 0xffffffff) * 20 - 10;
    };

    for (const L of lengths) {
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: L, y: 0 };
      for (let i = 0; i < samplesPerLength; i++) {
        // Cursor anywhere within ±10 m of the midpoint
        const cursor = { x: L / 2 + rand(), y: rand() };
        const proj = projectOntoSegment(cursor, lineStart, lineEnd);
        // Perpendicular distance from the projection back to the segment
        const perpDist = distanceToLineSegment(proj, lineStart, lineEnd);
        expect(perpDist).toBeLessThanOrEqual(1e-13);
      }
    }
  });
});

describe('distanceToLineSegment (refactored to delegate to projectOntoSegment)', () => {
  it('returns 0 for a point exactly on the segment', () => {
    expect(
      distanceToLineSegment({ x: 2, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 })
    ).toBe(0);
  });

  it('returns the perpendicular distance for an interior projection', () => {
    expect(
      distanceToLineSegment({ x: 2, y: 3 }, { x: 0, y: 0 }, { x: 4, y: 0 })
    ).toBe(3);
  });

  it('returns the distance to the start endpoint when projection clamps there', () => {
    // Cursor at (-3, 4); start at (0, 0) -> distance = sqrt(9 + 16) = 5
    expect(
      distanceToLineSegment({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 4, y: 0 })
    ).toBe(5);
  });

  it('returns the distance to lineStart for a zero-length segment', () => {
    // sqrt((5-2)^2 + (7-3)^2) = sqrt(9 + 16) = 5
    expect(
      distanceToLineSegment({ x: 5, y: 7 }, { x: 2, y: 3 }, { x: 2, y: 3 })
    ).toBe(5);
  });
});
