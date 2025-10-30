/**
 * SnapBar Component
 *
 * Displays snapping controls at the bottom-right of the canvas
 * Allows user to toggle snapping on/off and choose snap targets (nodes, lines)
 */

import { useUIStore } from '../store';

export function SnapBar() {
  const snapEnabled = useUIStore((state) => state.snapEnabled);
  const snapToNodes = useUIStore((state) => state.snapToNodes);
  const snapToElements = useUIStore((state) => state.snapToElements);
  const toggleSnapEnabled = useUIStore((state) => state.toggleSnapEnabled);
  const toggleSnapToNodes = useUIStore((state) => state.toggleSnapToNodes);
  const toggleSnapToElements = useUIStore((state) => state.toggleSnapToElements);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 8,
        right: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        padding: '8px 12px',
        borderRadius: 4,
        border: '1px solid #ccc',
        fontSize: 13,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={snapEnabled}
          onChange={toggleSnapEnabled}
          style={{ cursor: 'pointer' }}
        />
        Snap
      </label>

      <div
        style={{
          width: 1,
          height: 16,
          backgroundColor: '#ccc',
        }}
      />

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: snapEnabled ? 1 : 0.5,
          cursor: snapEnabled ? 'pointer' : 'not-allowed',
        }}
      >
        <input
          type="checkbox"
          checked={snapToNodes}
          onChange={toggleSnapToNodes}
          disabled={!snapEnabled}
          style={{ cursor: snapEnabled ? 'pointer' : 'not-allowed' }}
        />
        Nodes
      </label>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          opacity: snapEnabled ? 1 : 0.5,
          cursor: snapEnabled ? 'pointer' : 'not-allowed',
        }}
      >
        <input
          type="checkbox"
          checked={snapToElements}
          onChange={toggleSnapToElements}
          disabled={!snapEnabled}
          style={{ cursor: snapEnabled ? 'pointer' : 'not-allowed' }}
        />
        Lines
      </label>
    </div>
  );
}
