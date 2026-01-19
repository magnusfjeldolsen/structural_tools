/**
 * EditableCell - Reusable table cell component with inline editing
 *
 * Supports:
 * - Click to select, double-click to edit, F2 to edit (triggered by parent)
 * - Visual states: normal, selected, editing, paste-capable
 * - Text and number inputs
 * - Custom display formatting
 * - Keyboard navigation (handled by parent)
 */

import { RefObject } from 'react';
import { theme } from '../../styles/theme';

export interface EditableCellProps {
  // State
  isSelected: boolean;
  isEditing: boolean;
  value: string | number;

  // Callbacks
  onSelect: () => void;
  onEditStart?: () => void;  // Optional - for read-only cells
  onChange?: (value: string) => void;
  onSave?: () => void;

  // Refs
  inputRef?: RefObject<HTMLInputElement>;

  // Visual hints
  canPaste?: boolean;
  readOnly?: boolean;

  // Input configuration
  inputType?: 'text' | 'number';
  inputStep?: string;

  // Display formatting (applied in non-edit mode)
  format?: (value: any) => string;
}

export function EditableCell({
  isSelected,
  isEditing,
  value,
  onSelect,
  onEditStart,
  onChange,
  onSave,
  inputRef,
  canPaste = false,
  readOnly = false,
  inputType = 'text',
  inputStep,
  format,
}: EditableCellProps) {
  // Determine display value
  const displayValue = format ? format(value) : String(value);

  // Handle double-click
  const handleDoubleClick = () => {
    if (!readOnly && onEditStart) {
      onEditStart();
    }
  };

  return (
    <div
      style={{
        ...cellStyle,
        ...(isSelected ? selectedCellStyle : {}),
        ...(isEditing ? editingCellStyle : {}),
        ...(canPaste && isSelected ? pasteCellStyle : {}),
        ...(readOnly ? readOnlyCellStyle : {}),
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type={inputType}
          step={inputStep}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            // Prevent parent keyboard handler from interfering
            e.stopPropagation();
          }}
          style={inputStyle}
          autoFocus
        />
      ) : (
        displayValue
      )}
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const cellStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: '12px',
  color: theme.colors.textPrimary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  cursor: 'cell',
  outline: 'none',
};

const selectedCellStyle: React.CSSProperties = {
  backgroundColor: '#e3f2fd',
  outline: `2px solid ${theme.colors.primary}`,
  outlineOffset: '-1px',
};

const editingCellStyle: React.CSSProperties = {
  backgroundColor: '#fff9c4',
  padding: 0,
};

const pasteCellStyle: React.CSSProperties = {
  backgroundColor: '#c8e6c9',
};

const readOnlyCellStyle: React.CSSProperties = {
  cursor: 'default',
  backgroundColor: '#f5f5f5',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  padding: '6px 8px',
  border: `1px solid ${theme.colors.primary}`,
  fontSize: '12px',
  boxSizing: 'border-box',
  outline: 'none',
};
