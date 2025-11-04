/**
 * Point Load Form - Compact expandable form for element point loads
 */

import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface PointLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function PointLoadForm({ isExpanded, onToggleExpand }: PointLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);

  const isLocal = (loadParameters.direction as string)?.toLowerCase() === loadParameters.direction;

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('point', { ...loadParameters, [key]: value });
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

    const distance = parseFloat(loadParameters.distance as any);
    if (isNaN(distance) || distance < 0) {
      alert('Distance must be a non-negative number');
      return;
    }

    const magnitude = parseFloat(loadParameters.magnitude as any);
    if (isNaN(magnitude) || magnitude === 0) {
      alert('Magnitude must be a non-zero number');
      return;
    }

    const direction = (loadParameters.direction as string) || 'Fx';
    if (!['Fx', 'Fy', 'Mz', 'fx', 'fy', 'mz'].includes(direction)) {
      alert('Please select a direction');
      return;
    }

    // Start load creation mode - user will click elements on canvas
    setLoadCreationMode('point', {
      distance,
      magnitude,
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
        Point Loads {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div style={expandedContentStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Distance from start (m)</label>
            <input
              type="number"
              value={loadParameters.distance || ''}
              onChange={(e) => handleParameterChange('distance', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
              step="0.01"
              min="0"
            />
          </div>

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
                  <option value="mz">mz (moment)</option>
                </>
              ) : (
                <>
                  <option value="Fx">Fx (horizontal)</option>
                  <option value="Fy">Fy (vertical)</option>
                  <option value="Mz">Mz (moment)</option>
                </>
              )}
            </select>
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Magnitude (kN or kNm)</label>
            <input
              type="number"
              value={loadParameters.magnitude || ''}
              onChange={(e) => handleParameterChange('magnitude', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
              step="0.1"
            />
          </div>

          <button onClick={handleCreateLoad} style={createButtonStyle}>
            Create Point Load → Click Elements
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

const inputStyle: React.CSSProperties = {
  padding: '6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  padding: '6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
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
