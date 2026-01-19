/**
 * NodesTab - Orchestration container for node data editing
 *
 * Follows LoadsTab pattern:
 * - Manages selection state, edit state, clipboard
 * - Global keyboard handler (F2, arrows, Enter, Escape, Ctrl+C/V)
 * - Validation logic
 * - Passes all state to NodeTable as props
 */

import { useState, useEffect, useRef } from 'react';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { NodeTable, CellIdentifier, ClipboardData } from './tables/NodeTable';
import type { SupportType } from '../analysis/types';

export function NodesTab() {
  const nodes = useModelStore((state) => state.nodes);
  const updateNode = useModelStore((state) => state.updateNode);
  const activeTab = useUIStore((state) => state.activeTab);

  // Selection & Edit state
  const [selectedCell, setSelectedCell] = useState<CellIdentifier>(null);
  const [editingCell, setEditingCell] = useState<CellIdentifier>(null);
  const [editValue, setEditValue] = useState('');

  // Clipboard state
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Refs for focus management
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLSelectElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Field configuration
  const fields = ['name', 'x', 'y', 'support'];

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
      if (editingCell.field === 'support') {
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

    const node = nodes[cell.rowIndex];
    if (!node) return;

    setValidationError(null);
    setEditingCell(cell);
    setSelectedCell(cell);

    // Set edit value based on field
    switch (cell.field) {
      case 'name':
        setEditValue(node.name);
        break;
      case 'x':
        setEditValue(node.x.toString());
        break;
      case 'y':
        setEditValue(node.y.toString());
        break;
      case 'support':
        setEditValue(node.support);
        break;
    }
  };

  const handleEditChange = (value: string) => {
    setEditValue(value);
  };

  const handleEditSave = () => {
    if (!editingCell) return;

    const node = nodes[editingCell.rowIndex];
    if (!node) return;

    const nodeName = node.name;
    const field = editingCell.field;

    try {
      const updates: any = {};

      switch (field) {
        case 'name': {
          const newName = editValue.trim();
          if (!newName) {
            setValidationError('Node name cannot be empty');
            return;
          }
          // Check for duplicate names (allow temporary names)
          const isDuplicate = nodes.some(
            (n) => n.name !== nodeName && n.name === newName && !newName.endsWith('_temp')
          );
          if (isDuplicate) {
            setValidationError(
              `Node name "${newName}" already exists. ` +
              `To rename multiple nodes, you can:\n` +
              `1. Use temporary names (e.g., "${newName}_temp")\n` +
              `2. Or use "Renumber Nodes" button to auto-renumber all nodes`
            );
            return;
          }
          updates.name = newName;
          // Special case: update using old name
          updateNode(nodeName, updates);
          setEditingCell(null);
          setValidationError(null);
          return;
        }

        case 'x': {
          const x = parseFloat(editValue);
          if (isNaN(x)) {
            setValidationError('X must be a valid number');
            return;
          }
          // Check for duplicate coordinates
          const isDuplicate = nodes.some(
            (n) => n.name !== nodeName && n.x === x && n.y === node.y
          );
          if (isDuplicate) {
            setValidationError(`Node coordinates (${x}, ${node.y}) already exist at another node`);
            return;
          }
          updates.x = x;
          break;
        }

        case 'y': {
          const y = parseFloat(editValue);
          if (isNaN(y)) {
            setValidationError('Y must be a valid number');
            return;
          }
          // Check for duplicate coordinates
          const isDuplicate = nodes.some(
            (n) => n.name !== nodeName && n.x === node.x && n.y === y
          );
          if (isDuplicate) {
            setValidationError(`Node coordinates (${node.x}, ${y}) already exist at another node`);
            return;
          }
          updates.y = y;
          break;
        }

        case 'support': {
          const supportType = editValue as SupportType;
          updates.support = supportType;
          break;
        }
      }

      updateNode(nodeName, updates);
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

  const handleCopy = (value: number, type: 'position') => {
    setClipboard({ value, type });
  };

  // ============================================================================
  // Global Keyboard Handler
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedCell || nodes.length === 0) return;

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

      // F2 - Enter edit mode
      if (e.key === 'F2') {
        e.preventDefault();
        handleEditStart(selectedCell);
        return;
      }

      // Arrow navigation
      if (e.key === 'ArrowUp' && currentRowIndex > 0) {
        e.preventDefault();
        setSelectedCell({ rowIndex: currentRowIndex - 1, field: selectedCell.field });
        return;
      }
      if (e.key === 'ArrowDown' && currentRowIndex < nodes.length - 1) {
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

      // Ctrl+C - Copy coordinate value
      if (e.ctrlKey && e.key === 'c') {
        const field = selectedCell.field;
        if (field === 'x' || field === 'y') {
          const node = nodes[currentRowIndex];
          if (node) {
            const value = field === 'x' ? node.x : node.y;
            handleCopy(value, 'position');
            e.preventDefault();
          }
        }
        return;
      }

      // Ctrl+V - Paste coordinate value
      if (e.ctrlKey && e.key === 'v' && clipboard) {
        const field = selectedCell.field;
        if (field === 'x' || field === 'y') {
          const node = nodes[currentRowIndex];
          if (node) {
            updateNode(node.name, { [field]: clipboard.value });
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
  }, [selectedCell, editingCell, clipboard, nodes, fields]);

  // ============================================================================
  // Render
  // ============================================================================

  // Only show nodes tab in loads or structure tabs
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

      <NodeTable
        selectedCell={selectedCell}
        editingCell={editingCell}
        editValue={editValue}
        onSelectCell={handleSelectCell}
        onEditStart={handleEditStart}
        onEditChange={handleEditChange}
        onEditSave={handleEditSave}
        onEditCancel={handleEditCancel}
        inputRef={inputRef}
        dropdownRef={dropdownRef}
        clipboard={clipboard}
        onCopy={handleCopy}
      />
    </div>
  );
}
