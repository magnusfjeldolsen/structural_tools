/**
 * Toast — single-message notification overlay.
 *
 * Renders the current message from `useToastStore` in the top-right corner.
 * Auto-dismiss is handled by the store's timer; this component is purely
 * presentational.
 *
 * Styling matches the toolbar palette (info = blue, error = red).
 */
import { useToastStore } from '../store/useToastStore';

export function Toast() {
  const current = useToastStore((s) => s.current);
  const clear = useToastStore((s) => s.clear);

  if (!current) return null;

  const palette =
    current.kind === 'error'
      ? { bg: '#f44336', fg: '#fff' }
      : { bg: '#2196F3', fg: '#fff' };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 1000,
        maxWidth: '420px',
        padding: '12px 16px',
        backgroundColor: palette.bg,
        color: palette.fg,
        borderRadius: '4px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ flex: 1, lineHeight: 1.4 }}>{current.message}</span>
      <button
        onClick={clear}
        aria-label="Dismiss notification"
        style={{
          background: 'transparent',
          border: 'none',
          color: palette.fg,
          fontSize: '18px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          minWidth: '20px',
        }}
      >
        ×
      </button>
    </div>
  );
}
