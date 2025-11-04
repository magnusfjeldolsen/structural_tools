/**
 * ElementsTab Component
 *
 * Editable table view of all elements in the model
 * Displays: Name, Start Node, End Node, E (GPa), I (m⁴), A (m²)
 * Allows editing of node connectivity and material properties
 */

import { useState } from 'react';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';

export function ElementsTab() {
  const elements = useModelStore((state) => state.elements);
  const nodes = useModelStore((state) => state.nodes);
  const updateElement = useModelStore((state) => state.updateElement);
  const selectedElements = useModelStore((state) => state.selectedElements);
  const selectElement = useModelStore((state) => state.selectElement);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const activeTab = useUIStore((state) => state.activeTab);

  const [editingCell, setEditingCell] = useState<{ elementName: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Only show elements tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  const handleElementClick = (elementName: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (editingCell) return; // Don't select while editing

    // Multi-select with shift
    if (e.shiftKey) {
      selectElement(elementName, true); // additive mode to toggle
    } else {
      // Single select (clear others)
      clearSelection();
      selectElement(elementName, false); // Replace selection
    }
  };

  const handleCellDoubleClick = (elementName: string, field: string, value: string) => {
    setEditingCell({ elementName, field });
    setEditValue(value);
  };

  const handleCellChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setEditValue(e.target.value);
  };

  const handleCellSave = (elementName: string, field: string) => {
    const element = elements.find((e) => e.name === elementName);
    if (!element) return;

    try {
      const updates: any = {};

      switch (field) {
        case 'nodeI':
          if (!nodes.find((n) => n.name === editValue)) {
            alert('Node not found');
            return;
          }
          updates.nodeI = editValue;
          break;
        case 'nodeJ':
          if (!nodes.find((n) => n.name === editValue)) {
            alert('Node not found');
            return;
          }
          updates.nodeJ = editValue;
          break;
        case 'E':
          const E = parseFloat(editValue);
          if (isNaN(E) || E <= 0) {
            alert('E must be a positive number');
            return;
          }
          updates.E = E;
          break;
        case 'I':
          const I = parseFloat(editValue);
          if (isNaN(I) || I <= 0) {
            alert('I must be a positive number');
            return;
          }
          updates.I = I;
          break;
        case 'A':
          const A = parseFloat(editValue);
          if (isNaN(A) || A <= 0) {
            alert('A must be a positive number');
            return;
          }
          updates.A = A;
          break;
      }
      updateElement(elementName, updates);
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    setEditingCell(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (editingCell) {
        handleCellSave(editingCell.elementName, editingCell.field);
      }
    } else if (e.key === 'Escape') {
      setEditingCell(null);
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
    <div style={{ padding: '12px', overflow: 'auto' }}>
      {elements.length === 0 ? (
        <p style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: '20px' }}>
          No elements yet. Create elements in the Structure tab.
        </p>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={headerStyle}>Name</th>
              <th style={headerStyle}>Start Node</th>
              <th style={headerStyle}>End Node</th>
              <th style={headerStyle}>E (GPa)</th>
              <th style={headerStyle}>I (m⁴)</th>
              <th style={headerStyle}>A (m²)</th>
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => {
              const isSelected = selectedElements.includes(element.name);
              return (
                <tr
                  key={element.name}
                  onClick={(e) => handleElementClick(element.name, e)}
                  style={{
                    backgroundColor: isSelected ? '#E3F2FD' : theme.colors.bgWhite,
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!editingCell) {
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected ? '#BBDEFB' : '#F5F5F5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected ? '#E3F2FD' : theme.colors.bgWhite;
                  }}
                >
                  <td style={getCellStyle(isSelected, false)}>{element.name}</td>

                  {/* Start Node - Editable Dropdown */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.elementName === element.name && editingCell.field === 'nodeI')}
                    onDoubleClick={() => handleCellDoubleClick(element.name, 'nodeI', element.nodeI)}
                  >
                    {editingCell?.elementName === element.name && editingCell.field === 'nodeI' ? (
                      <select
                        autoFocus
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSave(element.name, 'nodeI')}
                        onKeyDown={handleKeyDown}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                        }}
                      >
                        <option value="">Select node</option>
                        {nodes.map((node) => (
                          <option key={node.name} value={node.name}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      element.nodeI
                    )}
                  </td>

                  {/* End Node - Editable Dropdown */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.elementName === element.name && editingCell.field === 'nodeJ')}
                    onDoubleClick={() => handleCellDoubleClick(element.name, 'nodeJ', element.nodeJ)}
                  >
                    {editingCell?.elementName === element.name && editingCell.field === 'nodeJ' ? (
                      <select
                        autoFocus
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSave(element.name, 'nodeJ')}
                        onKeyDown={handleKeyDown}
                        style={{
                          width: '100%',
                          padding: '4px',
                          border: `1px solid ${theme.colors.primary}`,
                          borderRadius: '2px',
                        }}
                      >
                        <option value="">Select node</option>
                        {nodes.map((node) => (
                          <option key={node.name} value={node.name}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      element.nodeJ
                    )}
                  </td>

                  {/* E - Editable Number */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.elementName === element.name && editingCell.field === 'E')}
                    onDoubleClick={() => handleCellDoubleClick(element.name, 'E', element.E.toString())}
                  >
                    {editingCell?.elementName === element.name && editingCell.field === 'E' ? (
                      <input
                        autoFocus
                        type="number"
                        step="0.1"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSave(element.name, 'E')}
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
                      element.E.toFixed(1)
                    )}
                  </td>

                  {/* I - Editable Number */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.elementName === element.name && editingCell.field === 'I')}
                    onDoubleClick={() => handleCellDoubleClick(element.name, 'I', element.I.toString())}
                  >
                    {editingCell?.elementName === element.name && editingCell.field === 'I' ? (
                      <input
                        autoFocus
                        type="number"
                        step="1e-4"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSave(element.name, 'I')}
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
                      element.I.toExponential(2)
                    )}
                  </td>

                  {/* A - Editable Number */}
                  <td
                    style={getCellStyle(isSelected, editingCell?.elementName === element.name && editingCell.field === 'A')}
                    onDoubleClick={() => handleCellDoubleClick(element.name, 'A', element.A.toString())}
                  >
                    {editingCell?.elementName === element.name && editingCell.field === 'A' ? (
                      <input
                        autoFocus
                        type="number"
                        step="1e-4"
                        value={editValue}
                        onChange={handleCellChange}
                        onBlur={() => handleCellSave(element.name, 'A')}
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
                      element.A.toExponential(2)
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
