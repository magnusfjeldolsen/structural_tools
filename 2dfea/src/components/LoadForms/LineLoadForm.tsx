/**
 * Line Load Form - Compact expandable form for line loads
 */

import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface LineLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function LineLoadForm({ isExpanded, onToggleExpand }: LineLoadFormProps) {
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

  return (
    <div style={containerStyle}>
      <button
        onClick={onToggleExpand}
        style={{ ...buttonStyle, backgroundColor: isExpanded ? theme.colors.primaryDark : theme.colors.primary }}
      >
        Line Loads {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div style={expandedContentStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>
              Direction
              <button onClick={toggleCoordinateSystem} style={toggleButtonStyle}>
                {isLocal ? 'Local' : 'Global'}
              </button>
            </label>
            <select
              value={loadParameters.direction || 'Fx'}
              onChange={(e) => handleParameterChange('direction', e.target.value)}
              style={selectStyle}
            >
              {isLocal ? (
                <>
                  <option value="fx">fx (along element)</option>
                  <option value="fy">fy (perpendicular)</option>
                </>
              ) : (
                <>
                  <option value="Fx">Fx (horizontal)</option>
                  <option value="Fy">Fy (vertical)</option>
                </>
              )}
            </select>
          </div>

          <p style={infoStyle}>
            Line loads distribute forces along a line across multiple elements proportionally to element length.
          </p>

          <button onClick={handleCreateLoad} style={createButtonStyle}>
            Create Line Load → Click Elements
          </button>
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  marginBottom: '8px',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px',
  backgroundColor: theme.colors.primary,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  textAlign: 'left',
};

const expandedContentStyle: React.CSSProperties = {
  padding: '12px',
  backgroundColor: '#f9f9f9',
  border: `1px solid ${theme.colors.border}`,
  borderTop: 'none',
  borderBottomLeftRadius: '4px',
  borderBottomRightRadius: '4px',
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const formGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const toggleButtonStyle: React.CSSProperties = {
  padding: '2px 6px',
  backgroundColor: theme.colors.warning,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  fontSize: '11px',
  cursor: 'pointer',
  fontWeight: 'bold',
};

const selectStyle: React.CSSProperties = {
  padding: '6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
};

const infoStyle: React.CSSProperties = {
  fontSize: '12px',
  color: theme.colors.textSecondary,
  fontStyle: 'italic',
  margin: '4px 0',
};

const createButtonStyle: React.CSSProperties = {
  padding: '8px',
  backgroundColor: theme.colors.success,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  marginTop: '8px',
};
