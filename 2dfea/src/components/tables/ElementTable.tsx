/**
 * ElementTable - Presentation component for element data
 *
 * Follows LoadsTab pattern:
 * - Receives all state as props from parent container
 * - Pure presentation - no business logic
 * - Uses shared EditableCell and DropdownCell components
 */

import { RefObject } from 'react';
import { useModelStore } from '../../store';
import { theme } from '../../styles/theme';
import { EditableCell } from '../shared/EditableCell';
import { DropdownCell } from '../shared/DropdownCell';

export type CellIdentifier = { rowIndex: number; field: string } | null;

export interface ClipboardData {
  value: number;
  type: 'value';  // E/I/A properties
}

export interface ElementTableProps {
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
  onCopy: (value: number, type: 'value') => void;
}

export function ElementTable({
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
}: ElementTableProps) {
  const elements = useModelStore((state) => state.elements);
  const nodes = useModelStore((state) => state.nodes);

  // Build node options for dropdowns
  const nodeOptions = nodes.map((node) => ({
    value: node.name,
    label: node.name,
  }));

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
    // Only E/I/A properties can be pasted (value type)
    return ['E', 'I', 'A'].includes(field);
  };

  // Empty state
  if (elements.length === 0) {
    return (
      <div style={containerStyle}>
        <div style={emptyMessageStyle}>
          No elements yet. Use the drawing tools to create elements.
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={headerItemStyle}>Name</div>
        <div style={headerItemStyle}>Start Node</div>
        <div style={headerItemStyle}>End Node</div>
        <div style={headerItemStyle}>E (GPa)</div>
        <div style={headerItemStyle}>I (m⁴)</div>
        <div style={headerItemStyle}>A (m²)</div>
      </div>

      {/* Rows */}
      <div style={rowsContainerStyle}>
        {elements.map((element, rowIndex) => {
          return (
            <div key={element.name} style={rowStyle}>
              {/* Name */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'name')}
                isEditing={isCellEditing(rowIndex, 'name')}
                value={isCellEditing(rowIndex, 'name') ? editValue : element.name}
                onSelect={() => onSelectCell({ rowIndex, field: 'name' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'name' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                inputType="text"
              />

              {/* Start Node (nodeI) */}
              <DropdownCell
                isSelected={isCellSelected(rowIndex, 'nodeI')}
                isEditing={isCellEditing(rowIndex, 'nodeI')}
                value={isCellEditing(rowIndex, 'nodeI') ? editValue : element.nodeI}
                options={nodeOptions}
                placeholder="Select node..."
                onSelect={() => onSelectCell({ rowIndex, field: 'nodeI' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'nodeI' })}
                onChange={onEditChange}
                onSave={onEditSave}
                selectRef={dropdownRef}
              />

              {/* End Node (nodeJ) */}
              <DropdownCell
                isSelected={isCellSelected(rowIndex, 'nodeJ')}
                isEditing={isCellEditing(rowIndex, 'nodeJ')}
                value={isCellEditing(rowIndex, 'nodeJ') ? editValue : element.nodeJ}
                options={nodeOptions}
                placeholder="Select node..."
                onSelect={() => onSelectCell({ rowIndex, field: 'nodeJ' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'nodeJ' })}
                onChange={onEditChange}
                onSave={onEditSave}
                selectRef={dropdownRef}
              />

              {/* Young's Modulus (E) */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'E')}
                isEditing={isCellEditing(rowIndex, 'E')}
                value={isCellEditing(rowIndex, 'E') ? editValue : element.E}
                onSelect={() => onSelectCell({ rowIndex, field: 'E' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'E' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={isCellSelected(rowIndex, 'E') && canPaste('E')}
                inputType="number"
                inputStep="0.1"
                format={(val) => Number(val).toFixed(1)}
              />

              {/* Moment of Inertia (I) */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'I')}
                isEditing={isCellEditing(rowIndex, 'I')}
                value={isCellEditing(rowIndex, 'I') ? editValue : element.I}
                onSelect={() => onSelectCell({ rowIndex, field: 'I' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'I' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={isCellSelected(rowIndex, 'I') && canPaste('I')}
                inputType="number"
                inputStep="0.0001"
                format={(val) => Number(val).toExponential(2)}
              />

              {/* Cross-sectional Area (A) */}
              <EditableCell
                isSelected={isCellSelected(rowIndex, 'A')}
                isEditing={isCellEditing(rowIndex, 'A')}
                value={isCellEditing(rowIndex, 'A') ? editValue : element.A}
                onSelect={() => onSelectCell({ rowIndex, field: 'A' })}
                onEditStart={() => onEditStart({ rowIndex, field: 'A' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={isCellSelected(rowIndex, 'A') && canPaste('A')}
                inputType="number"
                inputStep="0.0001"
                format={(val) => Number(val).toExponential(2)}
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
  gridTemplateColumns: '100px 120px 120px 100px 100px 100px',
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
  gridTemplateColumns: '100px 120px 120px 100px 100px 100px',
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
