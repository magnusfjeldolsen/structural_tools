/**
 * BooleanCell - Reusable table cell component for boolean values.
 *
 * Renders a centered checkbox; clicking the cell or the checkbox toggles
 * the value via `onToggle`. Visual states (selected, focusable) match the
 * other cells in `tables/ElementTable.tsx` so it slots into the existing
 * grid layout cleanly.
 *
 * No edit-mode round-trip (unlike `EditableCell`). The checkbox IS the
 * editor — there is no "double-click to enter edit mode" step. Per
 * docs/plans/member-end-releases-mz.md §5.4, the cell is bound to a
 * single boolean and the parent dispatches `updateElement(name, { ... })`
 * synchronously.
 *
 * Tooltip text is plumbed through `title` so column-header tooltips and
 * cell-level tooltips can both reuse this component without bespoke styling.
 */

import { theme } from '../../styles/theme';

export interface BooleanCellProps {
  isSelected: boolean;
  value: boolean;
  onSelect: () => void;
  onToggle: (next: boolean) => void;
  title?: string;
  /** Visually distinct read-only state for cells that should not change. */
  readOnly?: boolean;
}

export function BooleanCell({
  isSelected,
  value,
  onSelect,
  onToggle,
  title,
  readOnly = false,
}: BooleanCellProps) {
  const handleCellClick = () => {
    onSelect();
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    onToggle(e.target.checked);
  };

  // Stop the synthetic click on the checkbox from re-triggering `onSelect`
  // before the change handler fires (otherwise selection state and toggle
  // race for the same event in some browsers).
  const stopPropagation = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      style={{
        ...cellStyle,
        ...(isSelected ? selectedCellStyle : {}),
        ...(readOnly ? readOnlyCellStyle : {}),
      }}
      onClick={handleCellClick}
      tabIndex={0}
      title={title}
    >
      <input
        type="checkbox"
        checked={value}
        onChange={handleCheckboxChange}
        onClick={stopPropagation}
        disabled={readOnly}
        style={checkboxStyle}
        aria-label={title}
      />
    </div>
  );
}

// ============================================================================
// Styles — kept aligned with EditableCell so column heights match
// ============================================================================

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '12px',
  color: theme.colors.textPrimary,
  overflow: 'hidden',
  textAlign: 'center',
  cursor: 'cell',
  outline: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const selectedCellStyle: React.CSSProperties = {
  backgroundColor: '#e3f2fd',
  outline: `2px solid ${theme.colors.primary}`,
  outlineOffset: '-1px',
};

const readOnlyCellStyle: React.CSSProperties = {
  cursor: 'default',
  backgroundColor: '#f5f5f5',
};

const checkboxStyle: React.CSSProperties = {
  width: '14px',
  height: '14px',
  cursor: 'pointer',
  margin: 0,
};
