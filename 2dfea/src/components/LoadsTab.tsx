/**
 * LoadsTab Component
 *
 * Displays loads in individual tables for each load type:
 * - Nodal Loads: ID | Case | Fx | Fy | Mz
 * - Distributed Loads: ID | Case | W1 | W2 | X1 | X2 | Direction
 * - Element Point Loads: ID | Case | Distance | Magnitude | Direction
 *
 * Features:
 * - Keyboard navigation (arrow keys)
 * - Editing (F2, Enter, Escape)
 * - Copy/Paste (Ctrl+C, Ctrl+V)
 */

import { useState, useRef } from 'react';
import { useModelStore, useUIStore } from '../store';
import { theme } from '../styles/theme';
import { NodalLoadTable } from './LoadTables/NodalLoadTable';
import { DistributedLoadTable } from './LoadTables/DistributedLoadTable';
import { PointLoadTable } from './LoadTables/PointLoadTable';

type LoadType = 'nodal' | 'distributed' | 'point';
type CellIdentifier = { loadType: LoadType; rowIndex: number; field: string } | null;

interface ClipboardData {
  value: number;
  type: 'value' | 'position';
  sourceLoadType?: LoadType;
}

export function LoadsTab() {
  const activeTab = useUIStore((state) => state.activeTab);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const nodalLoads = useModelStore((state) => state.loads.nodal);
  const distributedLoads = useModelStore((state) => state.loads.distributed);
  const pointLoads = useModelStore((state) => state.loads.elementPoint);
  const updateNodalLoad = useModelStore((state) => state.updateNodalLoad);
  const updateDistributedLoad = useModelStore((state) => state.updateDistributedLoad);
  const updateElementPointLoad = useModelStore((state) => state.updateElementPointLoad);

  const [selectedCell, setSelectedCell] = useState<CellIdentifier>(null);
  const [editingCell, setEditingCell] = useState<CellIdentifier>(null);
  const [editValue, setEditValue] = useState('');
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const tabContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Only show loads tab when active
  if (activeTab !== 'loads') {
    return null;
  }

  // Get load counts for headers
  const getActiveLoads = (loadType: LoadType) => {
    if (loadType === 'nodal') {
      return activeLoadCase ? nodalLoads.filter((l) => l.case === activeLoadCase) : nodalLoads;
    } else if (loadType === 'distributed') {
      return activeLoadCase ? distributedLoads.filter((l) => l.case === activeLoadCase) : distributedLoads;
    } else {
      return activeLoadCase ? pointLoads.filter((l) => l.case === activeLoadCase) : pointLoads;
    }
  };

  // Helper: is this cell editable?
  const isEditable = (field: string): boolean => {
    const readOnlyFields = ['id', 'case'];
    return !readOnlyFields.includes(field);
  };

  // Helper: get field value from load
  const getFieldValue = (loadType: LoadType, rowIndex: number, field: string): string | number => {
    const loads = loadType === 'nodal' ? nodalLoads : loadType === 'distributed' ? distributedLoads : pointLoads;
    const load = loads[rowIndex];
    if (!load) return '';
    return (load as any)[field] ?? '';
  };

  // Helper: determine paste compatibility
  const canPaste = (targetField: string, clipData: ClipboardData): boolean => {
    if (clipData.type === 'value') {
      // Value can paste to any numeric field
      const numericFields = ['fx', 'fy', 'mz', 'w1', 'w2', 'x1', 'x2', 'distance', 'magnitude'];
      return numericFields.includes(targetField);
    } else {
      // Position can paste to position fields
      const positionFields = ['distance', 'x1', 'x2'];
      return positionFields.includes(targetField);
    }
  };

  // Parse number safely
  const parseNum = (value: string): number | '' => {
    if (value === '') return '';
    if (value === '-') return 0;
    const num = parseFloat(value);
    return isNaN(num) ? '' : num;
  };

  // Save edited cell
  const saveEdit = () => {
    if (!editingCell) return;
    const { loadType, rowIndex, field } = editingCell;
    const value = parseNum(editValue);

    try {
      if (loadType === 'nodal') {
        updateNodalLoad(rowIndex, { [field]: value });
      } else if (loadType === 'distributed') {
        updateDistributedLoad(rowIndex, { [field]: value });
      } else if (loadType === 'point') {
        updateElementPointLoad(rowIndex, { [field]: value });
      }
      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving load:', error);
    }
  };

  // Cancel edit
  const cancelEdit = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!selectedCell && !editingCell) return;

    // If editing, handle Enter/Escape
    if (editingCell) {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
        return;
      }
      return; // Let input handle other keys
    }

    // Navigation and action keys
    const { loadType, rowIndex, field } = selectedCell!;

    // Define field order for each load type
    const getFieldOrder = (type: LoadType): string[] => {
      if (type === 'nodal') return ['id', 'case', 'fx', 'fy', 'mz'];
      if (type === 'distributed') return ['id', 'case', 'w1', 'w2', 'x1', 'x2', 'direction'];
      return ['id', 'case', 'distance', 'magnitude', 'direction']; // point loads
    };

    const fieldOrder = getFieldOrder(loadType);
    const currentFieldIndex = fieldOrder.indexOf(field.toLowerCase());

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextFieldIndex = currentFieldIndex + 1;
      if (nextFieldIndex < fieldOrder.length) {
        setSelectedCell({ loadType, rowIndex, field: fieldOrder[nextFieldIndex] });
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevFieldIndex = currentFieldIndex - 1;
      if (prevFieldIndex >= 0) {
        setSelectedCell({ loadType, rowIndex, field: fieldOrder[prevFieldIndex] });
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const activeLoads = getActiveLoads(loadType);
      if (rowIndex + 1 < activeLoads.length) {
        setSelectedCell({ loadType, rowIndex: rowIndex + 1, field });
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex > 0) {
        setSelectedCell({ loadType, rowIndex: rowIndex - 1, field });
      }
    } else if (e.key === 'F2' && isEditable(field)) {
      e.preventDefault();
      const value = getFieldValue(loadType, rowIndex, field);
      setEditingCell(selectedCell);
      setEditValue(String(value));
      setTimeout(() => inputRef.current?.focus(), 0);
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      const value = getFieldValue(loadType, rowIndex, field);
      if (typeof value === 'number') {
        // Determine type based on field
        const type = ['distance', 'x1', 'x2'].includes(field) ? 'position' : 'value';
        setClipboard({ value, type, sourceLoadType: loadType });
      }
    } else if (e.key === 'v' && e.ctrlKey) {
      e.preventDefault();
      if (clipboard && isEditable(field) && canPaste(field, clipboard)) {
        if (clipboard.type === 'value' || ['distance', 'x1', 'x2'].includes(field)) {
          setEditingCell(selectedCell);
          setEditValue(String(clipboard.value));
          setTimeout(() => inputRef.current?.focus(), 0);
        }
      }
    }
  };


  return (
    <div style={containerStyle} ref={tabContainerRef} onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Load tables - each has its own headers and structure */}
      <div style={tablesContainerStyle}>
        <NodalLoadTable
          selectedCell={selectedCell}
          editingCell={editingCell}
          editValue={editValue}
          onSelectCell={setSelectedCell}
          onEditStart={(cell) => {
            if (cell) {
              setEditingCell(cell);
              const value = getFieldValue(cell.loadType, cell.rowIndex, cell.field);
              setEditValue(String(value));
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          onEditChange={setEditValue}
          onEditSave={saveEdit}
          inputRef={inputRef}
          clipboard={clipboard}
          onCopy={(value, type) => setClipboard({ value, type })}
        />
        <DistributedLoadTable
          selectedCell={selectedCell}
          editingCell={editingCell}
          editValue={editValue}
          onSelectCell={setSelectedCell}
          onEditStart={(cell) => {
            if (cell) {
              setEditingCell(cell);
              const value = getFieldValue(cell.loadType, cell.rowIndex, cell.field);
              setEditValue(String(value));
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          onEditChange={setEditValue}
          onEditSave={saveEdit}
          inputRef={inputRef}
          clipboard={clipboard}
          onCopy={(value, type) => setClipboard({ value, type })}
        />
        <PointLoadTable
          selectedCell={selectedCell}
          editingCell={editingCell}
          editValue={editValue}
          onSelectCell={setSelectedCell}
          onEditStart={(cell) => {
            if (cell) {
              setEditingCell(cell);
              const value = getFieldValue(cell.loadType, cell.rowIndex, cell.field);
              setEditValue(String(value));
              setTimeout(() => inputRef.current?.focus(), 0);
            }
          }}
          onEditChange={setEditValue}
          onEditSave={saveEdit}
          inputRef={inputRef}
          clipboard={clipboard}
          onCopy={(value, type) => setClipboard({ value, type })}
        />
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.colors.bgWhite,
  overflow: 'hidden',
};

const tablesContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};
