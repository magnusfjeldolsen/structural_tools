/**
 * NodesTab Component
 *
 * Editable table view of all nodes in the model
 * Displays: Name, X (m), Y (m), Support Type
 * All fields are editable with validation
 */

import { useState } from 'react';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { SupportTypeLabels } from '../analysis/dataTranslator';
import type { SupportType } from '../analysis/types';

export function NodesTab() {
  const nodes = useModelStore((state) => state.nodes);
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectNode = useModelStore((state) => state.selectNode);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const updateNode = useModelStore((state) => state.updateNode);
  const activeTab = useUIStore((state) => state.activeTab);

  const [editingCell, setEditingCell] = useState<{ nodeName: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Only show nodes tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  const supportTypes = Object.keys(SupportTypeLabels) as SupportType[];

  const handleNodeClick = (nodeName: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (editingCell) return; // Don't select while editing

    // Multi-select with shift
    if (e.shiftKey) {
      selectNode(nodeName, true); // additive mode to toggle
    } else {
      // Single select (clear others)
      clearSelection();
      selectNode(nodeName, false); // Replace selection
    }
  };

  const handleCellDoubleClick = (nodeName: string, field: string, value: string) => {
    setValidationError(null);
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
          // Check for duplicate names
          const isDuplicate = nodes.some((n) => n.name !== nodeName && n.name === newName);
          if (isDuplicate) {
            setValidationError(`Node name "${newName}" already exists`);
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

    setEditingCell(null);
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

  const getCellStyle = (isSelected: boolean, isEditing: boolean) => ({
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
    backgroundColor: isEditing ? '#FFF9C4' : isSelected ? '#E3F2FD' : theme.colors.bgWhite,
    cursor: isEditing ? 'text' : 'pointer',
    color: theme.colors.textPrimary,
  });

  return (
    <div style={{ padding: '12px', overflow: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
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
        <table style={tableStyle}>
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
              const isSelected = selectedNodes.includes(node.name);
              return (
                <tr
                  key={node.name}
                  onClick={(e) => handleNodeClick(node.name, e)}
                  style={{
                    backgroundColor: isSelected ? '#E3F2FD' : theme.colors.bgWhite,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!editingCell) {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected
                        ? '#BBDEFB'
                        : '#F5F5F5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected
                      ? '#E3F2FD'
                      : theme.colors.bgWhite;
                  }}
                >
                  {/* Name */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.nodeName === node.name && editingCell.field === 'name')}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'name', node.name)}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'name' ? (
                      <input
                        autoFocus
                        type="text"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => validateAndSave(node.name, 'name')}
                        onKeyDown={handleKeyDown}
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
                    style={getCellStyle(isSelected, editingCell?.nodeName === node.name && editingCell.field === 'x')}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'x', node.x.toString())}
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
                    style={getCellStyle(isSelected, editingCell?.nodeName === node.name && editingCell.field === 'y')}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'y', node.y.toString())}
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
                    style={getCellStyle(isSelected, editingCell?.nodeName === node.name && editingCell.field === 'support')}
                    onDoubleClick={() => handleCellDoubleClick(node.name, 'support', node.support)}
                  >
                    {editingCell?.nodeName === node.name && editingCell.field === 'support' ? (
                      <select
                        autoFocus
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => validateAndSave(node.name, 'support')}
                        onKeyDown={handleKeyDown}
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
