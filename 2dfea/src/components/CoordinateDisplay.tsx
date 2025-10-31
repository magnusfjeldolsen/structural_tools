/**
 * CoordinateDisplay Component
 *
 * Displays current cursor position in model coordinates.
 * Positioned at bottom-left of canvas, updates in real-time.
 */

import { useUIStore } from '../store/useUIStore';
import { formatCoordinate } from '../utils/coordinateParser';

export function CoordinateDisplay() {
  const cursorPosition = useUIStore((state) => state.cursorPosition);

  if (!cursorPosition) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 10,
        left: 80, // Account for left CAD panel (70px) + some spacing
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        border: '1px solid #ccc',
        borderRadius: 4,
        padding: '6px 12px',
        fontSize: '13px',
        fontFamily: 'monospace',
        color: '#333',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        zIndex: 5,
        pointerEvents: 'none', // Don't interfere with mouse events
      }}
    >
      {formatCoordinate(cursorPosition, 3)}
    </div>
  );
}
