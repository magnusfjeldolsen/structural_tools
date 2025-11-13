/**
 * NodesTab Component with react-data-grid
 *
 * Excel-like editable table view of all nodes in the model
 * Displays: Name, X (m), Y (m), Support Type
 * Features: Arrow key navigation, Tab navigation, F2 edit, double-click edit
 */

import React, { useState, useMemo } from 'react';
import DataGrid, { Column, RenderEditCellProps, textEditor } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { SupportTypeLabels } from '../analysis/dataTranslator';
import type { SupportType } from '../analysis/types';

interface NodeRow {
  id: string; // react-data-grid requires unique 'id'
  name: string;
  x: number;
  y: number;
  support: SupportType;
}

export function NodesTab() {
  const nodes = useModelStore((state) => state.nodes);
  const updateNode = useModelStore((state) => state.updateNode);
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectNode = useModelStore((state) => state.selectNode);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const activeTab = useUIStore((state) => state.activeTab);

  const [validationError, setValidationError] = useState<string | null>(null);

  // Only show nodes tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  const isEditable = activeTab === 'structure';
  const supportTypes = Object.keys(SupportTypeLabels) as SupportType[];

  // ===== DATA ADAPTER LAYER =====

  // Convert nodes to DataGrid rows
  const rows: NodeRow[] = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.name,
        name: node.name,
        x: node.x,
        y: node.y,
        support: node.support,
      })),
    [nodes]
  );

  // ===== VALIDATION FUNCTIONS =====

  const validateNodeUpdate = (
    updatedRow: NodeRow,
    originalRow: NodeRow | undefined
  ): { valid: boolean; error?: string } => {
    // Name validation
    if (updatedRow.name !== originalRow?.name) {
      const newName = updatedRow.name.trim();
      if (!newName) {
        return { valid: false, error: 'Node name cannot be empty' };
      }

      const isDuplicate = nodes.some(
        (n) => n.name !== originalRow?.name && n.name === newName && !newName.endsWith('_temp')
      );
      if (isDuplicate) {
        return {
          valid: false,
          error: `Node name "${newName}" already exists`,
        };
      }
    }

    // X coordinate validation
    if (updatedRow.x !== originalRow?.x) {
      if (isNaN(updatedRow.x)) {
        return { valid: false, error: 'X must be a valid number' };
      }

      const isDuplicate = nodes.some(
        (n) => n.name !== originalRow?.name && n.x === updatedRow.x && n.y === updatedRow.y
      );
      if (isDuplicate) {
        return {
          valid: false,
          error: `Node coordinates (${updatedRow.x.toFixed(2)}, ${updatedRow.y.toFixed(2)}) already exist`,
        };
      }
    }

    // Y coordinate validation
    if (updatedRow.y !== originalRow?.y) {
      if (isNaN(updatedRow.y)) {
        return { valid: false, error: 'Y must be a valid number' };
      }

      const isDuplicate = nodes.some(
        (n) => n.name !== originalRow?.name && n.x === updatedRow.x && n.y === updatedRow.y
      );
      if (isDuplicate) {
        return {
          valid: false,
          error: `Node coordinates (${updatedRow.x.toFixed(2)}, ${updatedRow.y.toFixed(2)}) already exist`,
        };
      }
    }

    // Support type validation
    if (!supportTypes.includes(updatedRow.support)) {
      return { valid: false, error: 'Invalid support type' };
    }

    return { valid: true };
  };

  // ===== EVENT HANDLERS =====

  const handleRowsChange = (updatedRows: NodeRow[]) => {
    // Find the changed row by comparing with current rows
    let changedRow: NodeRow | undefined;
    let originalRow: NodeRow | undefined;

    for (let i = 0; i < updatedRows.length; i++) {
      if (
        updatedRows[i].name !== rows[i]?.name ||
        updatedRows[i].x !== rows[i]?.x ||
        updatedRows[i].y !== rows[i]?.y ||
        updatedRows[i].support !== rows[i]?.support
      ) {
        changedRow = updatedRows[i];
        originalRow = rows[i];
        break;
      }
    }

    if (!changedRow || !originalRow) return;

    // Validate the change
    const validation = validateNodeUpdate(changedRow, originalRow);
    if (!validation.valid) {
      setValidationError(validation.error || 'Validation failed');
      return; // Don't update if invalid
    }

    // Update the node in the store
    // Note: If name changed, updateNode handles the rename internally
    const updates: any = {
      x: changedRow.x,
      y: changedRow.y,
      support: changedRow.support,
    };
    if (changedRow.name !== originalRow.name) {
      updates.name = changedRow.name;
    }
    updateNode(originalRow.name, updates);

    setValidationError(null);
  };

  // Handle row selection (sync with canvas)
  const selectedRowsSet = useMemo(() => new Set(selectedNodes), [selectedNodes]);

  const handleSelectedRowsChange = (newSelectedRows: Set<string>) => {
    // Convert Set to array
    const newSelection = Array.from(newSelectedRows);

    // If adding to selection
    if (newSelection.length > selectedNodes.length) {
      const addedNode = newSelection.find((name) => !selectedNodes.includes(name));
      if (addedNode) {
        selectNode(addedNode, true); // Additive mode
      }
    } else if (newSelection.length < selectedNodes.length) {
      // If removing from selection
      clearSelection();
      newSelection.forEach((name) => selectNode(name, true));
    } else if (newSelection.length === 1 && selectedNodes.length === 0) {
      // Single selection
      selectNode(newSelection[0], false);
    }
  };

  // ===== COLUMN DEFINITIONS =====

  const columns: Column<NodeRow>[] = useMemo(
    () => [
      {
        key: 'name',
        name: 'Name',
        editable: isEditable,
        renderEditCell: textEditor,
      },
      {
        key: 'x',
        name: 'X (m)',
        editable: isEditable,
        formatter: ({ row }: { row: NodeRow }) => row.x.toFixed(2),
        renderEditCell: (props: RenderEditCellProps<NodeRow>) => (
          <input
            autoFocus
            type="number"
            step="0.01"
            value={props.row.x}
            onChange={(e) => props.onRowChange({ ...props.row, x: parseFloat(e.target.value) || 0 })}
            onFocus={(e) => e.target.select()}
          />
        ),
      },
      {
        key: 'y',
        name: 'Y (m)',
        editable: isEditable,
        formatter: ({ row }: { row: NodeRow }) => row.y.toFixed(2),
        renderEditCell: (props: RenderEditCellProps<NodeRow>) => (
          <input
            autoFocus
            type="number"
            step="0.01"
            value={props.row.y}
            onChange={(e) => props.onRowChange({ ...props.row, y: parseFloat(e.target.value) || 0 })}
            onFocus={(e) => e.target.select()}
          />
        ),
      },
      {
        key: 'support',
        name: 'Support',
        editable: isEditable,
        formatter: ({ row }: { row: NodeRow }) => SupportTypeLabels[row.support],
        renderEditCell: (props: RenderEditCellProps<NodeRow>) => {
          const selectRef = React.useRef<HTMLSelectElement>(null);

          React.useEffect(() => {
            // Automatically open the dropdown when entering edit mode
            if (selectRef.current) {
              selectRef.current.focus();
              // Use showPicker if available (modern browsers)
              if ('showPicker' in selectRef.current) {
                try {
                  (selectRef.current as any).showPicker();
                } catch (e) {
                  // showPicker may fail in some contexts, ignore
                }
              }
            }
          }, []);

          return (
            <select
              ref={selectRef}
              autoFocus
              value={props.row.support}
              onChange={(e) => {
                const newValue = e.target.value as SupportType;
                props.onRowChange({ ...props.row, support: newValue });
                // Delay close slightly to ensure value change is processed
                setTimeout(() => props.onClose(true), 0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  props.onClose(true); // Close editor and commit on Enter
                } else if (e.key === 'Escape') {
                  props.onClose(false); // Cancel on Escape
                }
              }}
              onBlur={() => props.onClose(true)}
            >
              {supportTypes.map((type) => (
                <option key={type} value={type}>
                  {SupportTypeLabels[type]}
                </option>
              ))}
            </select>
          );
        },
      },
    ],
    [isEditable, supportTypes]
  );

  // ===== RENDER =====

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
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

      {/* DataGrid */}
      {nodes.length === 0 ? (
        <p style={{ color: theme.colors.textSecondary, textAlign: 'center', padding: '20px' }}>
          No nodes yet. Create nodes in the Structure tab.
        </p>
      ) : (
        <DataGrid
          columns={columns}
          rows={rows}
          onRowsChange={handleRowsChange}
          selectedRows={selectedRowsSet}
          onSelectedRowsChange={handleSelectedRowsChange}
          rowKeyGetter={(row) => row.id}
          className="nodes-data-grid"
          style={{
            height: '100%',
            fontSize: '13px',
            '--rdg-selection-color': '#E3F2FD',
            '--rdg-header-background-color': theme.colors.bgLight,
            '--rdg-border-color': theme.colors.border,
          } as React.CSSProperties}
        />
      )}
    </div>
  );
}
