/**
 * ElementsTab - Orchestration container for element data editing
 *
 * Follows LoadsTab pattern:
 * - Manages selection state, edit state, clipboard
 * - Global keyboard handler (F2, arrows, Enter, Escape, Ctrl+C/V)
 * - Validation logic
 * - Passes all state to ElementTable as props
 */

import { useState, useEffect, useRef } from 'react';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { ElementTable, CellIdentifier, ClipboardData } from './tables/ElementTable';

export function ElementsTab() {
  const elements = useModelStore((state) => state.elements);
  const nodes = useModelStore((state) => state.nodes);
  const updateElement = useModelStore((state) => state.updateElement);
  const activeTab = useUIStore((state) => state.activeTab);

  // Selection & Edit state
  const [selectedCell, setSelectedCell] = useState<CellIdentifier>(null);
  const [editingCell, setEditingCell] = useState<CellIdentifier>(null);
  const [editValue, setEditValue] = useState('');

  // Clipboard state (NEW)
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Refs for focus management
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLSelectElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Field configuration. Order matches the table column order — keyboard
  // arrow-navigation indexes into this array. The two release columns are
  // booleans handled outside the edit-mode round-trip (the BooleanCell IS
  // the editor); they participate in arrow-nav and Space-to-toggle.
  const fields = [
    'name',
    'nodeI',
    'nodeJ',
    'E',
    'I',
    'A',
    'releaseStartMz',
    'releaseEndMz',
  ];

  // Reset state when tab changes
  useEffect(() => {
    if (activeTab !== 'loads' && activeTab !== 'structure') {
      setSelectedCell(null);
      setEditingCell(null);
      setValidationError(null);
      setClipboard(null);
    }
  }, [activeTab]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingCell) {
      if (editingCell.field === 'nodeI' || editingCell.field === 'nodeJ') {
        dropdownRef.current?.focus();
      } else {
        inputRef.current?.focus();
      }
    }
  }, [editingCell]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleSelectCell = (cell: CellIdentifier) => {
    if (editingCell) return; // Don't select while editing
    setSelectedCell(cell);
  };

  const handleEditStart = (cell: CellIdentifier) => {
    if (!cell) return;

    const element = elements[cell.rowIndex];
    if (!element) return;

    setValidationError(null);
    setEditingCell(cell);
    setSelectedCell(cell);

    // Set edit value based on field
    switch (cell.field) {
      case 'name':
        setEditValue(element.name);
        break;
      case 'nodeI':
        setEditValue(element.nodeI);
        break;
      case 'nodeJ':
        setEditValue(element.nodeJ);
        break;
      case 'E':
        setEditValue(element.E.toString());
        break;
      case 'I':
        setEditValue(element.I.toString());
        break;
      case 'A':
        setEditValue(element.A.toString());
        break;
    }
  };

  const handleEditChange = (value: string) => {
    setEditValue(value);
  };

  const handleEditSave = () => {
    if (!editingCell) return;

    const element = elements[editingCell.rowIndex];
    if (!element) return;

    const elementName = element.name;
    const field = editingCell.field;

    try {
      const updates: any = {};

      switch (field) {
        case 'name': {
          const newName = editValue.trim();
          if (!newName) {
            setValidationError('Element name cannot be empty');
            return;
          }
          // Check for duplicate names
          const isDuplicate = elements.some((e) => e.name !== elementName && e.name === newName);
          if (isDuplicate) {
            setValidationError(`Element name "${newName}" already exists`);
            return;
          }
          updates.name = newName;
          // Special case: update using old name
          updateElement(elementName, updates);
          setEditingCell(null);
          setValidationError(null);
          return;
        }

        case 'nodeI': {
          const nodeIName = editValue.trim();
          if (!nodeIName) {
            setValidationError('Start node cannot be empty');
            return;
          }
          if (!nodes.find((n) => n.name === nodeIName)) {
            setValidationError(`Node "${nodeIName}" not found`);
            return;
          }
          // Check for self-loop
          if (nodeIName === element.nodeJ) {
            setValidationError('Start and end nodes cannot be the same');
            return;
          }
          updates.nodeI = nodeIName;
          break;
        }

        case 'nodeJ': {
          const nodeJName = editValue.trim();
          if (!nodeJName) {
            setValidationError('End node cannot be empty');
            return;
          }
          if (!nodes.find((n) => n.name === nodeJName)) {
            setValidationError(`Node "${nodeJName}" not found`);
            return;
          }
          // Check for self-loop
          if (nodeJName === element.nodeI) {
            setValidationError('Start and end nodes cannot be the same');
            return;
          }
          updates.nodeJ = nodeJName;
          break;
        }

        case 'E': {
          const E = parseFloat(editValue);
          if (isNaN(E) || E <= 0) {
            setValidationError("E (Young's Modulus) must be a positive number");
            return;
          }
          updates.E = E;
          break;
        }

        case 'I': {
          const I = parseFloat(editValue);
          if (isNaN(I) || I <= 0) {
            setValidationError('I (Moment of Inertia) must be a positive number');
            return;
          }
          updates.I = I;
          break;
        }

        case 'A': {
          const A = parseFloat(editValue);
          if (isNaN(A) || A <= 0) {
            setValidationError('A (Cross-sectional Area) must be a positive number');
            return;
          }
          updates.A = A;
          break;
        }
      }

      updateElement(elementName, updates);
      setValidationError(null);
    } catch (error) {
      setValidationError(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return;
    }

    // Exit edit mode but keep cell selected
    setEditingCell(null);
    setSelectedCell({ rowIndex: editingCell.rowIndex, field: editingCell.field });
  };

  const handleEditCancel = () => {
    setEditingCell(null);
    setValidationError(null);
  };

  const handleCopy = (value: number, type: 'value') => {
    setClipboard({ value, type });
  };

  /**
   * Toggle a per-end Mz release on a single element. Wraps the store's
   * `updateElement(name, patch)` so the table cell stays presentational.
   * Per docs/plans/member-end-releases-mz.md §5.4 — set/clear semantics,
   * NOT XOR-toggle, since the cell itself is a checkbox driven by the
   * `next` boolean coming from the React change event.
   */
  const handleToggleRelease = (
    elementName: string,
    field: 'releaseStartMz' | 'releaseEndMz',
    next: boolean
  ) => {
    setValidationError(null);
    updateElement(elementName, { [field]: next });
  };

  // ============================================================================
  // Global Keyboard Handler (NEW)
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell || elements.length === 0) return;

      const currentRowIndex = selectedCell.rowIndex;
      const currentFieldIndex = fields.indexOf(selectedCell.field);

      // Don't handle keys when editing (except Enter/Escape)
      if (editingCell) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleEditSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleEditCancel();
        }
        return;
      }

      // F2 - Enter edit mode (no-op for boolean cells — they don't have an
      // edit-mode round-trip; Space is the toggle key).
      if (e.key === 'F2') {
        if (
          selectedCell.field === 'releaseStartMz' ||
          selectedCell.field === 'releaseEndMz'
        ) {
          // Boolean cells: no edit mode. Don't preventDefault — let the
          // browser ignore F2 here.
          return;
        }
        e.preventDefault();
        handleEditStart(selectedCell);
        return;
      }

      // Space - Toggle on boolean cells (release-start / release-end).
      if (
        e.key === ' ' &&
        (selectedCell.field === 'releaseStartMz' ||
          selectedCell.field === 'releaseEndMz')
      ) {
        e.preventDefault();
        const element = elements[currentRowIndex];
        if (element) {
          const field = selectedCell.field as 'releaseStartMz' | 'releaseEndMz';
          handleToggleRelease(element.name, field, !element[field]);
        }
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowUp' && currentRowIndex > 0) {
        e.preventDefault();
        setSelectedCell({ rowIndex: currentRowIndex - 1, field: selectedCell.field });
        return;
      }
      if (e.key === 'ArrowDown' && currentRowIndex < elements.length - 1) {
        e.preventDefault();
        setSelectedCell({ rowIndex: currentRowIndex + 1, field: selectedCell.field });
        return;
      }
      if (e.key === 'ArrowLeft' && currentFieldIndex > 0) {
        e.preventDefault();
        setSelectedCell({ rowIndex: currentRowIndex, field: fields[currentFieldIndex - 1] });
        return;
      }
      if (e.key === 'ArrowRight' && currentFieldIndex < fields.length - 1) {
        e.preventDefault();
        setSelectedCell({ rowIndex: currentRowIndex, field: fields[currentFieldIndex + 1] });
        return;
      }

      // Ctrl+C - Copy property value (E/I/A only)
      if (e.ctrlKey && e.key === 'c') {
        const field = selectedCell.field;
        if (field === 'E' || field === 'I' || field === 'A') {
          const element = elements[currentRowIndex];
          if (element) {
            const value = element[field];
            handleCopy(value, 'value');
            e.preventDefault();
          }
        }
        return;
      }

      // Ctrl+V - Paste property value (E/I/A only)
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        const field = selectedCell.field;
        if (field === 'E' || field === 'I' || field === 'A') {
          const element = elements[currentRowIndex];
          if (element) {
            updateElement(element.name, { [field]: clipboard.value });
            e.preventDefault();
          }
        }
        return;
      }

      // Escape - Clear clipboard
      if (e.key === 'Escape' && clipboard) {
        e.preventDefault();
        setClipboard(null);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCell, editingCell, clipboard, elements, fields]);

  // ============================================================================
  // Render
  // ============================================================================

  // Only show elements tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  return (
    <div
      ref={containerRef}
      style={{
        padding: '12px',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Validation Error Alert */}
      {validationError && (
        <div
          style={{
            backgroundColor: '#FFEBEE',
            border: `1px solid ${theme.colors.error || '#C62828'}`,
            borderRadius: '4px',
            padding: '8px 12px',
            marginBottom: '12px',
            color: theme.colors.error || '#C62828',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
          }}
        >
          ⚠️ {validationError}
        </div>
      )}

      <ElementTable
        selectedCell={selectedCell}
        editingCell={editingCell}
        editValue={editValue}
        onSelectCell={handleSelectCell}
        onEditStart={handleEditStart}
        onEditChange={handleEditChange}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
        onToggleRelease={handleToggleRelease}
        inputRef={inputRef}
        dropdownRef={dropdownRef}
        clipboard={clipboard}
        onCopy={handleCopy}
      />
    </div>
  );
}
