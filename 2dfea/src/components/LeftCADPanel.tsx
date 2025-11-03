/**
 * LeftCADPanel Component
 *
 * Vertical panel on left side of canvas with CAD tools:
 * - Move (M key)
 * - Delete (Del key)
 * - Future: Copy, Mirror, Array, etc.
 */

import { useUIStore } from '../store/useUIStore';
import { useModelStore } from '../store/useModelStore';
import { theme } from '../styles/theme';

export function LeftCADPanel() {
  const activeTool = useUIStore((state) => state.activeTool);
  const setTool = useUIStore((state) => state.setTool);
  const startMoveCommand = useUIStore((state) => state.startMoveCommand);
  const selectedNodes = useModelStore((state) => state.selectedNodes);

  const handleMoveClick = () => {
    if (selectedNodes.length > 0) {
      startMoveCommand();
    } else {
      // Just activate the tool if no selection
      setTool('move');
    }
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
    </div>
  );
}
