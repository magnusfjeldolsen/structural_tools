/**
 * NodesTab Component
 *
 * Editable table view of all nodes in the model
 * Displays: Name, X (m), Y (m), Support Type
 * All fields are editable with validation
 */

import { useState, useEffect, useRef } from 'react';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { SupportTypeLabels } from '../analysis/dataTranslator';
import type { SupportType } from '../analysis/types';

export function NodesTab() {
  const nodes = useModelStore((state) => state.nodes);
  const updateNode = useModelStore((state) => state.updateNode);
  const activeTab = useUIStore((state) => state.activeTab);

  const [selectedCell, setSelectedCell] = useState<{ nodeName: string; field: string } | null>(null);
  const [editingCell, setEditingCell] = useState<{ nodeName: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLSelectElement>(null);

  // Reset cell state when activeTab changes
  useEffect(() => {
    if (activeTab !== 'loads' && activeTab !== 'structure') {
      setSelectedCell(null);
      setEditingCell(null);
      setValidationError(null);
    }
  }, [activeTab]);

  // Focus and open dropdown when support cell enters edit mode
  useEffect(() => {
    if (editingCell?.field === 'support' && dropdownRef.current) {
      dropdownRef.current.focus();
      // Show the dropdown options
      dropdownRef.current.click();
    }
  }, [editingCell]);

  // Only show nodes tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  const supportTypes = Object.keys(SupportTypeLabels) as SupportType[];

  const handleCellClick = (nodeName: string, field: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (editingCell) return; // Don't select while editing
    setSelectedCell({ nodeName, field });
  };

  const handleCellDoubleClick = (nodeName: string, field: string, value: string) => {
    setValidationError(null);
    setSelectedCell({ nodeName, field });
    setEditingCell({ nodeName, field });
    setEditValue(value);
  };

  const handleCellChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditValue(e.target.value);
  };

  const validateAndSave = (nodeName: string, field: string) => {
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) return;

    try {
      const updates: any = {};

      switch (field) {
        case 'name': {
          const newName = editValue.trim();
          if (!newName) {
            setValidationError('Node name cannot be empty');
            return;
          }
          // Check for duplicate names (allow intermediate temporary names)
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
          // Note: This is a special case - we need to update using the old name
          updateNode(nodeName, updates);
          setEditingCell(null);
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
            (n) =>
              n.name !== nodeName &&
              n.x === x &&
              n.y === node.y
          );
          if (isDuplicate) {
            setValidationError(
              `Node coordinates (${x}, ${node.y}) already exist at another node`
            );
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
            (n) =>
              n.name !== nodeName &&
              n.x === node.x &&
              n.y === y
          );
          if (isDuplicate) {
            setValidationError(
              `Node coordinates (${node.x}, ${y}) already exist at another node`
            );
            return;
          }
          updates.y = y;
          break;
        }

        case 'support': {
          const supportType = editValue as SupportType;
          if (!supportTypes.includes(supportType)) {
            setValidationError('Invalid support type');
            return;
          }
          updates.support = supportType;
          break;
        }
      }

      updateNode(nodeName, updates);
      setValidationError(null);
    } catch (error) {
      setValidationError(
        `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return;
    }

    // Exit edit mode but keep the cell selected so user can navigate with arrow keys
    setEditingCell(null);
    setSelectedCell({ nodeName, field });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (editingCell) {
        validateAndSave(editingCell.nodeName, editingCell.field);
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setValidationError(null);
    }
  };

  const handleTableKeyDown = (e: React.KeyboardEvent, nodeName: string, field: string) => {
    const fields = ['name', 'x', 'y', 'support'];
    const nodeIndex = nodes.findIndex((n) => n.name === nodeName);
    const fieldIndex = fields.indexOf(field);

    // F2 to activate edit mode - only allow if this cell is currently selected
    if (e.key === 'F2' && !editingCell && selectedCell?.nodeName === nodeName && selectedCell?.field === field) {
      e.preventDefault();
      setValidationError(null);
      setEditingCell({ nodeName, field });
      const node = nodes.find((n) => n.name === nodeName);
      if (!node) return;

      // Set edit value based on field
      switch (field) {
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
      return;
    }

    // Arrow key navigation (only when not editing)
    if (!editingCell) {
      // Up/Down arrows navigate between rows (nodes)
      if (e.key === 'ArrowUp' && nodeIndex > 0) {
        e.preventDefault();
        const prevNode = nodes[nodeIndex - 1];
        setSelectedCell({ nodeName: prevNode.name, field });
        return;
      }
      if (e.key === 'ArrowDown' && nodeIndex < nodes.length - 1) {
        e.preventDefault();
        const nextNode = nodes[nodeIndex + 1];
        setSelectedCell({ nodeName: nextNode.name, field });
        return;
      }
      // Left/Right arrows navigate between fields (columns)
      if (e.key === 'ArrowLeft' && fieldIndex > 0) {
        e.preventDefault();
        const prevField = fields[fieldIndex - 1];
        setSelectedCell({ nodeName, field: prevField });
        return;
      }
      if (e.key === 'ArrowRight' && fieldIndex < fields.length - 1) {
        e.preventDefault();
        const nextField = fields[fieldIndex + 1];
        setSelectedCell({ nodeName, field: nextField });
        return;
      }
    }
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  };

  const headerStyle = {
    backgroundColor: theme.colors.bgLight,
    padding: '8px 12px',
    textAlign: 'left' as const,
    fontWeight: 'bold',
    borderBottom: `2px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
  };

  const getCellStyle = (isCellSelected: boolean, isEditing: boolean) => ({
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
    backgroundColor: isEditing ? '#FFF9C4' : isCellSelected ? '#E3F2FD' : theme.colors.bgWhite,
    cursor: isEditing ? 'text' : 'pointer',
    color: theme.colors.textPrimary,
    outline: isCellSelected && !isEditing ? '2px solid #1976D2' : 'none',
  });

  const handleContainerBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only reset if focus is leaving the table container entirely
    if (!tableContainerRef.current?.contains(e.relatedTarget as Node)) {
      // Don't reset if we're in the process of editing (blur from input field)
      if (!editingCell) {
        setSelectedCell(null);
      }
    }
  };

  return (
    <div
      ref={tableContainerRef}
      style={{ padding: '12px', overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}
      onBlur={handleContainerBlur}
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
          }}
        >
          ⚠️ {validationError}
        </div>
      )}

      {nodes.length === 0 ? (
        <p style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: '20px' }}>
          No nodes yet. Create nodes in the Structure tab.
        </p>
      ) : (
        <table style={tableStyle} onKeyDown={(e) => {
          if (selectedCell) {
            handleTableKeyDown(e, selectedCell.nodeName, selectedCell.field);
          }
        }}>
          <thead>
            <tr>
              <th style={headerStyle}>Name</th>
              <th style={headerStyle}>X (m)</th>
              <th style={headerStyle}>Y (m)</th>
              <th style={headerStyle}>Support</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => {
              return (
                <tr key={node.name}>
                  {/* Name */}
                  <td
                    style={getCellStyle(
                      selectedCell?.nodeName === node.name && selectedCell.field === 'name',
                      editingCell?.nodeName === node.name && editingCell.field === 'name'
                    )}
                    onClick={(e) => handleCellClick(node.name, 'name', e)}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'name', node.name)}
                    tabIndex={selectedCell?.nodeName === node.name && selectedCell.field === 'name' ? 0 : -1}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'name' ? (
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => validateAndSave(node.name, 'name')}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      node.name
                    )}
                  </td>

                  {/* X Coordinate */}
                  <td
                    style={getCellStyle(
                      selectedCell?.nodeName === node.name && selectedCell.field === 'x',
                      editingCell?.nodeName === node.name && editingCell.field === 'x'
                    )}
                    onClick={(e) => handleCellClick(node.name, 'x', e)}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'x', node.x.toString())}
                    tabIndex={selectedCell?.nodeName === node.name && selectedCell.field === 'x' ? 0 : -1}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'x' ? (
                      <input
                        autoFocus
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => validateAndSave(node.name, 'x')}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      node.x.toFixed(2)
                    )}
                  </td>

                  {/* Y Coordinate */}
                  <td
                    style={getCellStyle(
                      selectedCell?.nodeName === node.name && selectedCell.field === 'y',
                      editingCell?.nodeName === node.name && editingCell.field === 'y'
                    )}
                    onClick={(e) => handleCellClick(node.name, 'y', e)}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'y', node.y.toString())}
                    tabIndex={selectedCell?.nodeName === node.name && selectedCell.field === 'y' ? 0 : -1}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'y' ? (
                      <input
                        autoFocus
                        type="number"
                        step="0.01"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => validateAndSave(node.name, 'y')}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      node.y.toFixed(2)
                    )}
                  </td>

                  {/* Support Type */}
                  <td
                    style={getCellStyle(
                      selectedCell?.nodeName === node.name && selectedCell.field === 'support',
                      editingCell?.nodeName === node.name && editingCell.field === 'support'
                    )}
                    onClick={(e) => handleCellClick(node.name, 'support', e)}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'support', node.support)}
                    tabIndex={selectedCell?.nodeName === node.name && selectedCell.field === 'support' ? 0 : -1}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'support' ? (
                      <select
                        ref={dropdownRef}
                        autoFocus
                        value={editValue}
                        onChange={(e) => {
                          // Just update the value, don't save yet - wait for Enter key
                          setEditValue(e.target.value);
                        }}
                        onBlur={() => {
                          // Only save if still in editing mode and blur is from outside dropdown
                          if (editingCell?.nodeName === node.name && editingCell.field === 'support') {
                            // Don't auto-save on blur, require explicit Enter or Escape
                            setEditingCell(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            // Cancel edit without saving
                            setEditingCell(null);
                            setSelectedCell({ nodeName: node.name, field: 'support' });
                            setValidationError(null);
                          } else if (e.key === 'Enter') {
                            // Save and return to navigation mode
                            e.preventDefault();
                            validateAndSave(node.name, 'support');
                          }
                          // Arrow keys will naturally navigate through options in the dropdown
                        }}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                        }}
                      >
                        <option value="">Select support</option>
                        {supportTypes.map((type) => (
                          <option key={type} value={type}>
                            {SupportTypeLabels[type]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      SupportTypeLabels[node.support]
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
