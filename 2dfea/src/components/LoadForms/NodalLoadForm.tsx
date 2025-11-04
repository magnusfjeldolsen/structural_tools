/**
 * Nodal Load Form - Compact expandable form for nodal loads
 */

import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface NodalLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function NodalLoadForm({ isExpanded, onToggleExpand }: NodalLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('nodal', { ...loadParameters, [key]: value });
  };

  const handleCreateLoad = () => {
    // Validation
    if (!activeLoadCase) {
      alert('Please select an active load case first');
      return;
    }

    const fx = parseFloat(loadParameters.fx as any) || 0;
    const fy = parseFloat(loadParameters.fy as any) || 0;
    const mz = parseFloat(loadParameters.mz as any) || 0;

    if (fx === 0 && fy === 0 && mz === 0) {
      alert('At least one force or moment must be non-zero');
      return;
    }

    // Start load creation mode - user will click nodes on canvas
    setLoadCreationMode('nodal', {
      fx,
      fy,
      mz,
      case: activeLoadCase,
    });
  };

  return (
    <div style={containerStyle}>
      <button
        onClick={onToggleExpand}
        style={{ ...buttonStyle, backgroundColor: isExpanded ? theme.colors.primaryDark : theme.colors.primary }}
      >
        Nodal Loads {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div style={expandedContentStyle}>
          <div style={formGroupStyle}>
            <label style={labelStyle}>Fx (kN)</label>
            <input
              type="number"
              value={loadParameters.fx || ''}
              onChange={(e) => handleParameterChange('fx', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
              step="0.1"
            />
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Fy (kN)</label>
            <input
              type="number"
              value={loadParameters.fy || ''}
              onChange={(e) => handleParameterChange('fy', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
              step="0.1"
            />
          </div>

          <div style={formGroupStyle}>
            <label style={labelStyle}>Mz (kNm)</label>
            <input
              type="number"
              value={loadParameters.mz || ''}
              onChange={(e) => handleParameterChange('mz', parseFloat(e.target.value) || 0)}
              placeholder="0"
              style={inputStyle}
              step="0.1"
            />
          </div>

          <button onClick={handleCreateLoad} style={createButtonStyle}>
            Create Nodal Load → Click Nodes
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
};

const inputStyle: React.CSSProperties = {
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
