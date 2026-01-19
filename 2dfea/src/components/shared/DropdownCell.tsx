/**
 * DropdownCell - Table cell with dropdown selection in edit mode
 *
 * Supports:
 * - Click to select, double-click to edit, F2 to edit (triggered by parent)
 * - Visual states: normal, selected, editing
 * - Auto-open dropdown on edit start
 * - Custom display formatting
 */

import { RefObject, useEffect } from 'react';
import { theme } from '../../styles/theme';

export interface DropdownCellProps<T = string> {
  // State
  isSelected: boolean;
  isEditing: boolean;
  value: T;

  // Dropdown configuration
  options: Array<{ value: T; label: string }>;
  placeholder?: string;
  autoOpen?: boolean;  // Auto-open dropdown on edit start

  // Callbacks
  onSelect: () => void;
  onEditStart?: () => void;  // Optional - for read-only cells
  onChange?: (value: T) => void;
  onSave?: () => void;

  // Refs
  selectRef?: RefObject<HTMLSelectElement>;

  // Display formatting
  formatDisplay?: (value: T) => string;
  readOnly?: boolean;
}

export function DropdownCell<T = string>({
  isSelected,
  isEditing,
  value,
  options,
  placeholder = 'Select...',
  autoOpen = false,
  onSelect,
  onEditStart,
  onChange,
  onSave,
  selectRef,
  formatDisplay,
  readOnly = false,
}: DropdownCellProps<T>) {
  // Auto-open dropdown when entering edit mode
  useEffect(() => {
    if (isEditing && autoOpen && selectRef?.current) {
      setTimeout(() => {
        try {
          // Try modern showPicker API
          if ('showPicker' in selectRef.current!) {
            (selectRef.current as any).showPicker();
          } else {
            // Fallback for browsers without showPicker
            selectRef.current?.focus();
            selectRef.current?.click();
          }
        } catch (e) {
          // Silently fail if showPicker not supported
          selectRef.current?.focus();
        }
      }, 0);
    }
  }, [isEditing, autoOpen, selectRef]);

  // Determine display value
  const displayValue = formatDisplay
    ? formatDisplay(value)
    : options.find((opt) => opt.value === value)?.label || String(value);

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
        ...(readOnly ? readOnlyCellStyle : {}),
      }}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      tabIndex={0}
    >
      {isEditing ? (
        <select
          ref={selectRef}
          value={value as any}
          onChange={(e) => onChange?.(e.target.value as T)}
          onBlur={onSave}
          onKeyDown={(e) => {
            // Prevent parent keyboard handler from interfering
            e.stopPropagation();
          }}
          style={selectStyle}
          autoFocus
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={String(option.value)} value={option.value as any}>
              {option.label}
            </option>
          ))}
        </select>
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

const readOnlyCellStyle: React.CSSProperties = {
  cursor: 'default',
  backgroundColor: '#f5f5f5',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  padding: '6px 8px',
  border: `1px solid ${theme.colors.primary}`,
  fontSize: '12px',
  boxSizing: 'border-box',
  outline: 'none',
  cursor: 'pointer',
};
