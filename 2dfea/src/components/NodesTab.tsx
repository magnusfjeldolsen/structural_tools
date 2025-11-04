/**
 * NodesTab Component
 *
 * Read-only table view of all nodes in the model
 * Displays: Name, X (m), Y (m), Support Type
 */

import { useModelStore } from '../store/useModelStore';
import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';
import { SupportTypeLabels } from '../analysis/dataTranslator';

export function NodesTab() {
  const nodes = useModelStore((state) => state.nodes);
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectNode = useModelStore((state) => state.selectNode);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const activeTab = useUIStore((state) => state.activeTab);

  // Only show nodes tab in loads or structure tabs
  if (activeTab !== 'loads' && activeTab !== 'structure') {
    return null;
  }

  const handleNodeClick = (nodeName: string, e: React.MouseEvent) => {
    e.preventDefault();

    // Multi-select with shift
    if (e.shiftKey) {
      selectNode(nodeName, true); // additive mode to toggle
    } else {
      // Single select (clear others)
      clearSelection();
      selectNode(nodeName, false); // Replace selection
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

  const getCellStyle = (isSelected: boolean) => ({
    padding: '8px 12px',
    borderBottom: `1px solid ${theme.colors.border}`,
    backgroundColor: isSelected ? '#E3F2FD' : theme.colors.bgWhite,
    cursor: 'pointer' as const,
    color: isSelected ? theme.colors.primary : theme.colors.textPrimary,
    transition: 'background-color 0.2s',
  });

  return (
    <div style={{ padding: '12px', overflow: 'auto' }}>
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
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected ? '#BBDEFB' : '#F5F5F5';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.backgroundColor = isSelected ? '#E3F2FD' : theme.colors.bgWhite;
                  }}
                >
                  <td style={getCellStyle(isSelected)}>{node.name}</td>
                  <td style={getCellStyle(isSelected)}>{node.x.toFixed(2)}</td>
                  <td style={getCellStyle(isSelected)}>{node.y.toFixed(2)}</td>
                  <td style={getCellStyle(isSelected)}>{SupportTypeLabels[node.support]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
