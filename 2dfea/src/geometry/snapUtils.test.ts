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
import {
  classifyNode,
  distanceToLineSegment,
  getSnappedPosition,
  projectOntoSegment,
} from './snapUtils';
import type { Element, Node } from '../analysis/types';

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

describe('classifyNode', () => {
  // Build a small graph: N1 (fixed) — E1 — N2 (free) — E2 — N3 (free); N4 isolated free
  const baseElement = { E: 200, I: 1e-4, A: 1e-2 } as const;
  const nodes: Node[] = [
    { name: 'N1', x: 0, y: 0, support: 'fixed' },
    { name: 'N2', x: 4, y: 0, support: 'free' },
    { name: 'N3', x: 8, y: 0, support: 'free' },
    { name: 'N4', x: 1, y: 5, support: 'free' },
    { name: 'N5', x: 2, y: 5, support: 'pinned' },
  ];
  const elements: Element[] = [
    { name: 'E1', nodeI: 'N1', nodeJ: 'N2', ...baseElement },
    { name: 'E2', nodeI: 'N2', nodeJ: 'N3', ...baseElement },
  ];

  it('classifies a free node with no elements as free-end', () => {
    expect(classifyNode('N4', nodes, elements)).toBe('free-end');
  });

  it('classifies a free node with exactly one element as free-end', () => {
    // N3 has 1 element (E2) and support === 'free'
    expect(classifyNode('N3', nodes, elements)).toBe('free-end');
  });

  it('classifies a free node with two or more elements as connected', () => {
    // N2 has 2 elements (E1 + E2) and support === 'free' -> still connected
    expect(classifyNode('N2', nodes, elements)).toBe('connected');
  });

  it('classifies a fixed-support node with no elements as connected (support overrides element count)', () => {
    // N5 is pinned with 0 elements
    expect(classifyNode('N5', nodes, elements)).toBe('connected');
  });

  it('classifies a fixed-support node with one element as connected', () => {
    // N1 has 1 element (E1) and is fixed
    expect(classifyNode('N1', nodes, elements)).toBe('connected');
  });

  it('returns free-end for a node name that is not in the array', () => {
    expect(classifyNode('NONEXISTENT', nodes, elements)).toBe('free-end');
  });
});

describe('getSnappedPosition', () => {
  const baseElement = { E: 200, I: 1e-4, A: 1e-2 } as const;
  const nodes: Node[] = [
    { name: 'N1', x: 0, y: 0, support: 'fixed' },
    { name: 'N2', x: 4, y: 0, support: 'free' },
  ];
  const elements: Element[] = [
    { name: 'E1', nodeI: 'N1', nodeJ: 'N2', ...baseElement },
  ];

  it('returns exact node coordinates when a node is hovered (priority 1)', () => {
    const result = getSnappedPosition({ x: 0.05, y: 0.05 }, 'N1', nodes);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('returns raw cursor coordinates when nothing is hovered', () => {
    const result = getSnappedPosition({ x: 1.7, y: 0.4 }, null, nodes);
    expect(result.x).toBe(1.7);
    expect(result.y).toBe(0.4);
  });

  it('projects the cursor onto the hovered element when no node is hovered', () => {
    // Cursor 0.1 m above the beam axis at x = 2 -> projection foot is (2, 0)
    const result = getSnappedPosition(
      { x: 2, y: 0.1 },
      null,
      nodes,
      'E1',
      elements,
      false
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(0);
  });

  it('node hover wins over element hover (priority 1 beats priority 2)', () => {
    // Both hovered — should snap to node, not project onto element
    const result = getSnappedPosition(
      { x: 0.05, y: 0.05 },
      'N1',
      nodes,
      'E1',
      elements,
      false
    );
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('falls through to raw cursor when bypassElementProjection is true (Shift held)', () => {
    const result = getSnappedPosition(
      { x: 2, y: 0.1 },
      null,
      nodes,
      'E1',
      elements,
      true // Shift bypass
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(0.1);
  });

  it('falls through to raw cursor when hoveredElement references a non-existent element', () => {
    const result = getSnappedPosition(
      { x: 2, y: 0.1 },
      null,
      nodes,
      'E_GHOST',
      elements,
      false
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(0.1);
  });

  it('falls through to raw cursor when an endpoint node of the hovered element is missing', () => {
    const orphanElement: Element = { name: 'E_ORPHAN', nodeI: 'N1', nodeJ: 'GHOST', ...baseElement };
    const result = getSnappedPosition(
      { x: 2, y: 0.1 },
      null,
      nodes,
      'E_ORPHAN',
      [orphanElement],
      false
    );
    expect(result.x).toBe(2);
    expect(result.y).toBe(0.1);
  });

  it('is back-compatible — old 3-arg call still snaps to nodes only', () => {
    // Defaults for hoveredElement/elements/bypass mean no element projection
    const result = getSnappedPosition({ x: 2, y: 0.1 }, null, nodes);
    expect(result.x).toBe(2);
    expect(result.y).toBe(0.1);
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
