/**
 * NodeTable - Presentation component for node data
 *
 * Follows LoadsTab pattern:
 * - Receives all state as props from parent container
 * - Pure presentation - no business logic
 * - Uses shared EditableCell and DropdownCell components
 */

import { RefObject } from 'react';
import { useModelStore } from '../../store';
import { SupportType } from '../../analysis/types';
import { theme } from '../../styles/theme';
import { EditableCell } from '../shared/EditableCell';
import { DropdownCell } from '../shared/DropdownCell';

export type CellIdentifier = { rowIndex: number; field: string } | null;

export interface ClipboardData {
  value: number;
  type: 'position';  // x/y coordinates
}

export interface NodeTableProps {
  // Selection state
  selectedCell: CellIdentifier;
  editingCell: CellIdentifier;
  editValue: string;

  // Callbacks
  onSelectCell: (cell: CellIdentifier) => void;
  onEditStart: (cell: CellIdentifier) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;

  // Refs
  inputRef: RefObject<HTMLInputElement>;
  dropdownRef: RefObject<HTMLSelectElement>;

  // Clipboard
  clipboard: ClipboardData | null;
  onCopy: (value: number, type: 'position') => void;
}

const supportOptions: Array<{ value: SupportType; label: string }> = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'roller-x', label: 'Roller (X)' },
  { value: 'roller-y', label: 'Roller (Y)' },
  { value: 'free', label: 'Free' },
];

export function NodeTable({
  selectedCell,
  editingCell,
  editValue,
  onSelectCell,
  onEditStart,
  onEditChange,
  onEditSave,
  inputRef,
  dropdownRef,
  clipboard,
}: NodeTableProps) {
  const nodes = useModelStore((state) => state.nodes);

  // Helper: Check if cell is selected
  const isCellSelected = (rowIndex: number, field: string): boolean => {
    return selectedCell?.rowIndex === rowIndex && selectedCell?.field === field;
  };

  // Helper: Check if cell is editing
  const isCellEditing = (rowIndex: number, field: string): boolean => {
    return editingCell?.rowIndex === rowIndex && editingCell?.field === field;
  };

  // Helper: Check if clipboard can paste to this field
  const canPaste = (field: string): boolean => {
    if (!clipboard) return false;
    // Only x/y coordinates can be pasted (position type)
    return ['x', 'y'].includes(field);
  };

  // Empty state
  if (nodes.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={emptyMessageStyle}>
          No nodes yet. Use the drawing tools to create nodes.
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={headerItemStyle}>Name</div>
        <div style={headerItemStyle}>X (m)</div>
        <div style={headerItemStyle}>Y (m)</div>
        <div style={headerItemStyle}>Support</div>
      </div>

      {/* Rows */}
      <div style={rowsContainerStyle}>
        {nodes.map((node, rowIndex) => {
          return (
            <div key={node.name} style={rowStyle}>
              {/* Name */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'name')}
                isEditing={isCellEditing(rowIndex, 'name')}
                value={isCellEditing(rowIndex, 'name') ? editValue : node.name}
                onSelect={() => onSelectCell({ rowIndex, field: 'name' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'name' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                inputType="text"
              />

              {/* X coordinate */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'x')}
                isEditing={isCellEditing(rowIndex, 'x')}
                value={isCellEditing(rowIndex, 'x') ? editValue : node.x}
                onSelect={() => onSelectCell({ rowIndex, field: 'x' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'x' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={isCellSelected(rowIndex, 'x') && canPaste('x')}
                inputType="number"
                inputStep="0.01"
                format={(val) => Number(val).toFixed(2)}
              />

              {/* Y coordinate */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'y')}
                isEditing={isCellEditing(rowIndex, 'y')}
                value={isCellEditing(rowIndex, 'y') ? editValue : node.y}
                onSelect={() => onSelectCell({ rowIndex, field: 'y' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'y' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={isCellSelected(rowIndex, 'y') && canPaste('y')}
                inputType="number"
                inputStep="0.01"
                format={(val) => Number(val).toFixed(2)}
              />

              {/* Support */}
              <DropdownCell
                isSelected={isCellSelected(rowIndex, 'support')}
                isEditing={isCellEditing(rowIndex, 'support')}
                value={isCellEditing(rowIndex, 'support') ? (editValue as SupportType) : node.support}
                options={supportOptions}
                autoOpen={true}
                onSelect={() => onSelectCell({ rowIndex, field: 'support' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'support' })}
                onChange={(value) => onEditChange(value)}
                onSave={onEditSave}
                selectRef={dropdownRef}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '4px',
  overflow: 'hidden',
  backgroundColor: theme.colors.bgWhite,
};

const headerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '100px 1fr 1fr 120px',
  gap: '1px',
  padding: '8px',
  backgroundColor: theme.colors.primary,
  borderBottom: `1px solid ${theme.colors.border}`,
  fontWeight: 'bold',
  color: theme.colors.textWhite,
  fontSize: '11px',
};

const headerItemStyle: React.CSSProperties = {
  padding: '4px 6px',
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const rowsContainerStyle: React.CSSProperties = {
  maxHeight: '400px',
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '100px 1fr 1fr 120px',
  gap: '1px',
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
  alignItems: 'center',
};

const emptyMessageStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'center',
  fontSize: '12px',
  color: theme.colors.textLight,
  backgroundColor: theme.colors.bgWhite,
};
