/**
 * Line Load Form - Compact form content for line loads
 */

import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface LineLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function LineLoadForm({ isExpanded }: LineLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);

  const isLocal = (loadParameters.direction as string)?.toLowerCase() === loadParameters.direction;

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('lineLoad', { ...loadParameters, [key]: value });
  };

  const toggleCoordinateSystem = () => {
    const currentDir = (loadParameters.direction as string) || 'Fx';
    const newDir = isLocal ? currentDir.toUpperCase() : currentDir.toLowerCase();
    handleParameterChange('direction', newDir);
  };

  const handleCreateLoad = () => {
    // Validation
    if (!activeLoadCase) {
      alert('Please select an active load case first');
      return;
    }

    const direction = (loadParameters.direction as string) || 'Fx';
    if (!['Fx', 'Fy', 'fx', 'fy'].includes(direction)) {
      alert('Please select a direction');
      return;
    }

    // Start load creation mode - user will click to draw a line on elements
    setLoadCreationMode('lineLoad', {
      direction,
      case: activeLoadCase,
    });
  };

  // Only render the form content (no button wrapper)
  if (!isExpanded) return null;

  return (
    <div style={formContentStyle}>
      <div style={formGroupStyle}>
        <label style={labelStyle}>Direction</label>
        <div style={directionGroupStyle}>
          <select
            value={loadParameters.direction || 'Fx'}
            onChange={(e) => handleParameterChange('direction', e.target.value)}
            style={selectStyle}
          >
            {isLocal ? (
              <>
                <option value="fx">fx</option>
                <option value="fy">fy</option>
              </>
            ) : (
              <>
                <option value="Fx">Fx</option>
                <option value="Fy">Fy</option>
              </>
            )}
          </select>
          <button onClick={toggleCoordinateSystem} style={toggleButtonStyle}>
            {isLocal ? 'Local' : 'Global'}
          </button>
        </div>
      </div>

      <div style={infoStyle}>
        Distributes load across multiple elements proportionally
      </div>

      <button onClick={handleCreateLoad} style={createButtonStyle}>
        Create Line Load → Click Elements
      </button>
    </div>
  );
}

const formContentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
};

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: '0 1 auto',
  minWidth: '120px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
};

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
  flex: 1,
  minWidth: '60px',
};

const directionGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
};

const toggleButtonStyle: React.CSSProperties = {
  padding: '4px 6px',
  backgroundColor: theme.colors.warning,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  fontSize: '11px',
  cursor: 'pointer',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};

const infoStyle: React.CSSProperties = {
  fontSize: '11px',
  color: theme.colors.textSecondary,
  fontStyle: 'italic',
  flex: '0 1 auto',
};

const createButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: theme.colors.success,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};
