/**
 * DistributedLoadTable Component
 *
 * Displays distributed loads in table format with editing support:
 * ID | Case | w1 | w2 | x1 | x2 | Direction | (empty)
 *
 * Supports:
 * - Cell selection and navigation
 * - Editing with F2, Enter, Escape
 * - Copy/Paste (Ctrl+C/V)
 */

import { RefObject } from 'react';
import { useModelStore } from '../../store';
import { theme } from '../../styles/theme';

type LoadType = 'nodal' | 'distributed' | 'point';
type CellIdentifier = { loadType: LoadType; rowIndex: number; field: string } | null;

interface ClipboardData {
  value: number;
  type: 'value' | 'position';
  sourceLoadType?: LoadType;
}

interface DistributedLoadTableProps {
  selectedCell: CellIdentifier;
  editingCell: CellIdentifier;
  editValue: string;
  onSelectCell: (cell: CellIdentifier) => void;
  onEditStart: (cell: CellIdentifier) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  inputRef: RefObject<HTMLInputElement>;
  clipboard: ClipboardData | null;
  onCopy: (value: number, type: 'value' | 'position') => void;
}

export function DistributedLoadTable({
  selectedCell,
  editingCell,
  editValue,
  onSelectCell,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  inputRef,
  clipboard,
}: DistributedLoadTableProps) {
  const loads = useModelStore((state) => state.loads.distributed);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);

  // Filter loads for active case only
  const activeLoads = activeLoadCase ? loads.filter((l) => l.case === activeLoadCase) : loads;

  if (activeLoads.length === 0) {
    return (
      <div style={emptyMessageStyle}>
        <span>No distributed loads in {activeLoadCase || 'any case'}</span>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Distributed Loads ({activeLoads.length})</div>
      <div style={headerStyle}>
        <div style={headerItemStyle}>ID</div>
        <div style={headerItemStyle}>Case</div>
        <div style={headerItemStyle}>W1</div>
        <div style={headerItemStyle}>W2</div>
        <div style={headerItemStyle}>X1</div>
        <div style={headerItemStyle}>X2</div>
        <div style={headerItemStyle}>Direction</div>
      </div>
      <div style={tableContainerStyle}>
        {activeLoads.map((load, rowIndex) => {
          const isRowSelected = selectedCell?.loadType === 'distributed' && selectedCell?.rowIndex === rowIndex;
          const isRowEditing = editingCell?.loadType === 'distributed' && editingCell?.rowIndex === rowIndex;

          // Safety check for load properties
          const w1Val = typeof load.w1 === 'number' ? load.w1 : 0;
          const w2Val = typeof load.w2 === 'number' ? load.w2 : 0;
          const x1Val = typeof load.x1 === 'number' ? load.x1 : 0;
          const x2Val = typeof load.x2 === 'number' ? load.x2 : 0;

          return (
            <div key={load.id} style={rowStyle}>
              {/* ID Cell */}
              <div
                style={{
                  ...cellStyle,
                  ...(isRowSelected && selectedCell?.field === 'id' ? selectedCellStyle : {}),
                }}
                onClick={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'id' })}
                tabIndex={0}
              >
                {load.id}
              </div>

              {/* Case Cell */}
              <div
                style={{
                  ...cellStyle,
                  ...(isRowSelected && selectedCell?.field === 'case' ? selectedCellStyle : {}),
                }}
                onClick={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'case' })}
                tabIndex={0}
              >
                {load.case || ''}
              </div>

              {/* w1 Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'w1'}
                isEditing={isRowEditing && editingCell?.field === 'w1'}
                value={isRowEditing && editingCell?.field === 'w1' ? editValue : w1Val.toFixed(2)}
                onSelect={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'w1' })}
                onEditStart={() => onEditStart({ loadType: 'distributed', rowIndex, field: 'w1' })}
                onChange={onEditChange}
                onSave={onEditSave}
                onCancel={onEditCancel}
                inputRef={inputRef}
                canPaste={!!clipboard}
              />

              {/* w2 Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'w2'}
                isEditing={isRowEditing && editingCell?.field === 'w2'}
                value={isRowEditing && editingCell?.field === 'w2' ? editValue : w2Val.toFixed(2)}
                onSelect={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'w2' })}
                onEditStart={() => onEditStart({ loadType: 'distributed', rowIndex, field: 'w2' })}
                onChange={onEditChange}
                onSave={onEditSave}
                onCancel={onEditCancel}
                inputRef={inputRef}
                canPaste={!!clipboard}
              />

              {/* x1 Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'x1'}
                isEditing={isRowEditing && editingCell?.field === 'x1'}
                value={isRowEditing && editingCell?.field === 'x1' ? editValue : x1Val.toFixed(2)}
                onSelect={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'x1' })}
                onEditStart={() => onEditStart({ loadType: 'distributed', rowIndex, field: 'x1' })}
                onChange={onEditChange}
                onSave={onEditSave}
                onCancel={onEditCancel}
                inputRef={inputRef}
                canPaste={!!clipboard}
              />

              {/* x2 Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'x2'}
                isEditing={isRowEditing && editingCell?.field === 'x2'}
                value={isRowEditing && editingCell?.field === 'x2' ? editValue : x2Val.toFixed(2)}
                onSelect={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'x2' })}
                onEditStart={() => onEditStart({ loadType: 'distributed', rowIndex, field: 'x2' })}
                onChange={onEditChange}
                onSave={onEditSave}
                onCancel={onEditCancel}
                inputRef={inputRef}
                canPaste={!!clipboard}
              />

              {/* Direction Cell (read-only for now) */}
              <div
                style={{
                  ...cellStyle,
                  ...(isRowSelected && selectedCell?.field === 'direction' ? selectedCellStyle : {}),
                }}
                onClick={() => onSelectCell({ loadType: 'distributed', rowIndex, field: 'direction' })}
                tabIndex={0}
              >
                {load.direction}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EditableCellProps {
  isSelected: boolean;
  isEditing: boolean;
  value: string | number;
  onSelect: () => void;
  onEditStart: () => void;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  inputRef: RefObject<HTMLInputElement>;
  canPaste: boolean;
}

function EditableCell({
  isSelected,
  isEditing,
  value,
  onSelect,
  onEditStart,
  onChange,
  onSave,
  inputRef,
  canPaste,
}: EditableCellProps) {
  return (
    <div
      style={{
        ...cellStyle,
        ...(isSelected ? selectedCellStyle : {}),
        ...(isEditing ? editingCellStyle : {}),
        ...(canPaste && isSelected ? pasteCellStyle : {}),
      }}
      onClick={onSelect}
      onDoubleClick={onEditStart}
      tabIndex={0}
    >
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onSave}
          onKeyDown={(e) => {
            e.stopPropagation();
          }}
          style={inputStyle}
          autoFocus
        />
      ) : (
        String(value)
      )}
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
};

const sectionTitleStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: theme.colors.bgLight,
  fontWeight: 'bold',
  fontSize: '12px',
  color: theme.colors.textPrimary,
  borderBottom: `1px solid ${theme.colors.border}`,
};

const headerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '50px 80px 1fr 1fr 1fr 1fr 1fr',
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

const tableContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '300px',
  overflowY: 'auto',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '50px 80px 1fr 1fr 1fr 1fr 1fr',
  gap: '1px',
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
  alignItems: 'center',
};

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

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  padding: '6px 8px',
  border: `1px solid ${theme.colors.primary}`,
  fontSize: '12px',
  boxSizing: 'border-box',
};

const emptyMessageStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'center',
  fontSize: '12px',
  color: theme.colors.textLight,
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
};
