/**
 * NodalLoadTable Component
 *
 * Displays nodal loads in table format with editing support:
 * ID | Case | Fx | Fy | Mz | (empty) | (empty) | (empty)
 *
 * Supports:
 * - Cell selection and navigation
 * - Editing with F2, Enter, Escape
 * - Copy/Paste (Ctrl+C/V)
 */

import { RefObject } from 'react';
import { useModelStore } from '../../store';
import { theme } from '../../styles/theme';
import { EditableCell } from '../shared/EditableCell';

type LoadType = 'nodal' | 'distributed' | 'point';
type CellIdentifier = { loadType: LoadType; rowIndex: number; field: string } | null;

interface ClipboardData {
  value: number;
  type: 'value' | 'position';
  sourceLoadType?: LoadType;
}

interface NodalLoadTableProps {
  selectedCell: CellIdentifier;
  editingCell: CellIdentifier;
  editValue: string;
  onSelectCell: (cell: CellIdentifier) => void;
  onEditStart: (cell: CellIdentifier) => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  inputRef: RefObject<HTMLInputElement>;
  clipboard: ClipboardData | null;
  onCopy: (value: number, type: 'value' | 'position') => void;
}

export function NodalLoadTable({
  selectedCell,
  editingCell,
  editValue,
  onSelectCell,
  onEditStart,
  onEditChange,
  onEditSave,
  inputRef,
  clipboard,
}: NodalLoadTableProps) {
  const loads = useModelStore((state) => state.loads.nodal);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);

  // Filter loads for active case only
  const activeLoads = activeLoadCase ? loads.filter((l) => l.case === activeLoadCase) : loads;

  if (activeLoads.length === 0) {
    return (
      <div style={emptyMessageStyle}>
        <span>No nodal loads in {activeLoadCase || 'any case'}</span>
      </div>
    );
  }

  return (
    <div style={sectionStyle}>
      <div style={sectionTitleStyle}>Nodal Loads ({activeLoads.length})</div>
      <div style={headerStyle}>
        <div style={headerItemStyle}>ID</div>
        <div style={headerItemStyle}>Case</div>
        <div style={headerItemStyle}>Fx (kN)</div>
        <div style={headerItemStyle}>Fy (kN)</div>
        <div style={headerItemStyle}>Mz (kNm)</div>
      </div>
      <div style={tableContainerStyle}>
        {activeLoads.map((load, rowIndex) => {
          const isRowSelected = selectedCell?.loadType === 'nodal' && selectedCell?.rowIndex === rowIndex;
          const isRowEditing = editingCell?.loadType === 'nodal' && editingCell?.rowIndex === rowIndex;

          // Safety check for load properties
          const fxVal = typeof load.fx === 'number' ? load.fx : 0;
          const fyVal = typeof load.fy === 'number' ? load.fy : 0;
          const mzVal = typeof load.mz === 'number' ? load.mz : 0;

          return (
            <div key={load.id} style={rowStyle}>
              {/* ID Cell */}
              <div
                style={{
                  ...cellStyle,
                  ...(isRowSelected && selectedCell?.field === 'id' ? selectedCellStyle : {}),
                }}
                onClick={() => onSelectCell({ loadType: 'nodal', rowIndex, field: 'id' })}
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
                onClick={() => onSelectCell({ loadType: 'nodal', rowIndex, field: 'case' })}
                tabIndex={0}
              >
                {load.case || ''}
              </div>

              {/* Fx Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'fx'}
                isEditing={isRowEditing && editingCell?.field === 'fx'}
                value={isRowEditing && editingCell?.field === 'fx' ? editValue : fxVal}
                onSelect={() => onSelectCell({ loadType: 'nodal', rowIndex, field: 'fx' })}
                onEditStart={() => onEditStart({ loadType: 'nodal', rowIndex, field: 'fx' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={!!clipboard}
                inputType="number"
                inputStep="0.01"
                format={(val) => Number(val).toFixed(2)}
              />

              {/* Fy Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'fy'}
                isEditing={isRowEditing && editingCell?.field === 'fy'}
                value={isRowEditing && editingCell?.field === 'fy' ? editValue : fyVal}
                onSelect={() => onSelectCell({ loadType: 'nodal', rowIndex, field: 'fy' })}
                onEditStart={() => onEditStart({ loadType: 'nodal', rowIndex, field: 'fy' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={!!clipboard}
                inputType="number"
                inputStep="0.01"
                format={(val) => Number(val).toFixed(2)}
              />

              {/* Mz Cell */}
              <EditableCell
                isSelected={isRowSelected && selectedCell?.field === 'mz'}
                isEditing={isRowEditing && editingCell?.field === 'mz'}
                value={isRowEditing && editingCell?.field === 'mz' ? editValue : mzVal}
                onSelect={() => onSelectCell({ loadType: 'nodal', rowIndex, field: 'mz' })}
                onEditStart={() => onEditStart({ loadType: 'nodal', rowIndex, field: 'mz' })}
                onChange={onEditChange}
                onSave={onEditSave}
                inputRef={inputRef}
                canPaste={!!clipboard}
                inputType="number"
                inputStep="0.01"
                format={(val) => Number(val).toFixed(2)}
              />
            </div>
          );
        })}
      </div>
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

const tableContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '300px',
  overflowY: 'auto',
};

const headerStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '50px 80px 1fr 1fr 1fr',
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

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '50px 80px 1fr 1fr 1fr',
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

const emptyMessageStyle: React.CSSProperties = {
  padding: '12px 8px',
  textAlign: 'center',
  fontSize: '12px',
  color: theme.colors.textLight,
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
};
