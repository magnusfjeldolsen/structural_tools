/**
 * LeftCADPanel Component
 *
 * Vertical panel on left side of canvas with CAD tools:
 * - Move (M key)
 * - Delete (Del key)
 * - Renumber Nodes
 * - Renumber Elements
 * - Future: Copy, Mirror, Array, etc.
 */

import { useState } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useModelStore } from '../store/useModelStore';
import { theme } from '../styles/theme';

export function LeftCADPanel() {
  const activeTool = useUIStore((state) => state.activeTool);
  const setTool = useUIStore((state) => state.setTool);
  const startMoveCommand = useUIStore((state) => state.startMoveCommand);
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const renumberNodes = useModelStore((state) => state.renumberNodes);
  const renumberElements = useModelStore((state) => state.renumberElements);
  const nodes = useModelStore((state) => state.nodes);
  const elements = useModelStore((state) => state.elements);

  const [showRenumberNodesConfirm, setShowRenumberNodesConfirm] = useState(false);
  const [showRenumberElementsConfirm, setShowRenumberElementsConfirm] = useState(false);

  const handleMoveClick = () => {
    if (selectedNodes.length > 0) {
      startMoveCommand();
    } else {
      // Just activate the tool if no selection
      setTool('move');
    }
  };

  const handleRenumberNodesClick = () => {
    if (nodes.length === 0) {
      alert('No nodes to renumber');
      return;
    }
    setShowRenumberNodesConfirm(true);
  };

  const handleRenumberElementsClick = () => {
    if (elements.length === 0) {
      alert('No elements to renumber');
      return;
    }
    setShowRenumberElementsConfirm(true);
  };

  const confirmRenumberNodes = () => {
    renumberNodes();
    setShowRenumberNodesConfirm(false);
  };

  const confirmRenumberElements = () => {
    renumberElements();
    setShowRenumberElementsConfirm(false);
  };

  const buttonStyle = (tool: string) => ({
    width: '70px',
    height: '70px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    border: 'none',
    backgroundColor: activeTool === tool ? theme.colors.primary : theme.colors.bgWhite,
    color: activeTool === tool ? theme.colors.textWhite : theme.colors.textPrimary,
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: activeTool === tool ? 'bold' : 'normal',
    borderBottom: `1px solid ${theme.colors.border}`,
    transition: 'all 0.2s ease',
    padding: '8px',
  });

  const iconStyle = {
    fontSize: '24px',
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '70px',
        backgroundColor: theme.colors.bgWhite,
        borderRight: `2px solid ${theme.colors.border}`,
        boxShadow: '2px 0 4px rgba(0,0,0,0.1)',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        style={buttonStyle('move')}
        onClick={handleMoveClick}
        title="Move (M)"
      >
        <span style={iconStyle}>✋</span>
        <span>Move</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>M</span>
      </button>

      <button
        style={buttonStyle('delete')}
        onClick={() => setTool('delete')}
        title="Delete (Del)"
      >
        <span style={iconStyle}>🗑️</span>
        <span>Delete</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>Del</span>
      </button>

      <button
        style={buttonStyle('renumber-nodes')}
        onClick={handleRenumberNodesClick}
        title="Renumber Nodes (RN)"
      >
        <span style={iconStyle}>🔢</span>
        <span>Renumber</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>Nodes</span>
      </button>

      <button
        style={buttonStyle('renumber-elements')}
        onClick={handleRenumberElementsClick}
        title="Renumber Elements (RE)"
      >
        <span style={iconStyle}>🔢</span>
        <span>Renumber</span>
        <span style={{ fontSize: '9px', opacity: 0.7 }}>Elements</span>
      </button>

      {/* Confirmation dialogs */}
      {showRenumberNodesConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRenumberNodesConfirm(false)}
        >
          <div
            style={{
              backgroundColor: theme.colors.bgWhite,
              borderRadius: '4px',
              padding: '20px',
              maxWidth: '400px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: theme.colors.textPrimary }}>
              Renumber Nodes?
            </h3>
            <p style={{ color: theme.colors.textSecondary, marginBottom: '20px' }}>
              Nodes will be renumbered from bottom to top, left to right (N1, N2, N3, ...).
              All loads and supports will be updated to reference the new node names.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.colors.bgLight,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: theme.colors.textPrimary,
                }}
                onClick={() => setShowRenumberNodesConfirm(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.colors.primary,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: theme.colors.textWhite,
                  fontWeight: 'bold',
                }}
                onClick={confirmRenumberNodes}
              >
                Renumber
              </button>
            </div>
          </div>
        </div>
      )}

      {showRenumberElementsConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowRenumberElementsConfirm(false)}
        >
          <div
            style={{
              backgroundColor: theme.colors.bgWhite,
              borderRadius: '4px',
              padding: '20px',
              maxWidth: '400px',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: theme.colors.textPrimary }}>
              Renumber Elements?
            </h3>
            <p style={{ color: theme.colors.textSecondary, marginBottom: '20px' }}>
              Elements will be renumbered from bottom to top, left to right (E1, E2, E3, ...).
              All loads will be updated to reference the new element names.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.colors.bgLight,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: theme.colors.textPrimary,
                }}
                onClick={() => setShowRenumberElementsConfirm(false)}
              >
                Cancel
              </button>
              <button
                style={{
                  padding: '8px 16px',
                  backgroundColor: theme.colors.primary,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: theme.colors.textWhite,
                  fontWeight: 'bold',
                }}
                onClick={confirmRenumberElements}
              >
                Renumber
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
