/**
 * ReleasePanel Component
 *
 * Floating canvas overlay that appears when one or more elements are
 * selected. Four buttons with explicit set/clear semantics (never toggle):
 *   - Release start    → releaseStartMz = true on every selected element
 *   - Release end      → releaseEndMz   = true on every selected element
 *   - Release both     → both flags     = true on every selected element
 *   - Clear releases   → both flags     = false on every selected element
 *
 * Each click is one zundo history step (the bulk store action wraps all
 * mutations in a single set()), so undo reverts the whole selection together.
 *
 * See docs/plans/member-end-releases-mz.md §5.6.
 */

import { useModelStore } from '../store';

export function ReleasePanel() {
  const selectedElements = useModelStore((state) => state.selectedElements);
  const setElementReleases = useModelStore((state) => state.setElementReleases);

  if (selectedElements.length === 0) return null;

  const apply = (patch: { releaseStartMz?: boolean; releaseEndMz?: boolean }) => {
    setElementReleases(selectedElements, patch);
  };

  const countLabel =
    selectedElements.length === 1
      ? '1 element'
      : `${selectedElements.length} elements`;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '8px 12px',
        borderRadius: 4,
        border: '1px solid #ccc',
        fontSize: 13,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <span style={{ fontWeight: 500, color: '#333' }}>
        Releases ({countLabel}):
      </span>
      <button
        type="button"
        onClick={() => apply({ releaseStartMz: true })}
        style={buttonStyle}
        title="Set Mz release at the i-end of every selected element"
      >
        Release start
      </button>
      <button
        type="button"
        onClick={() => apply({ releaseEndMz: true })}
        style={buttonStyle}
        title="Set Mz release at the j-end of every selected element"
      >
        Release end
      </button>
      <button
        type="button"
        onClick={() => apply({ releaseStartMz: true, releaseEndMz: true })}
        style={buttonStyle}
        title="Set Mz release at both ends of every selected element"
      >
        Release both
      </button>
      <button
        type="button"
        onClick={() => apply({ releaseStartMz: false, releaseEndMz: false })}
        style={buttonStyle}
        title="Clear Mz releases at both ends of every selected element"
      >
        Clear releases
      </button>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 12,
  border: '1px solid #bbb',
  borderRadius: 3,
  backgroundColor: '#fff',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
