/**
 * Distributed Load Form - Compact form content for distributed loads
 */

import { useEffect } from 'react';
import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface DistributedLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function DistributedLoadForm({ isExpanded }: DistributedLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const loadTypeDefaults = useUIStore((state) => state.loadTypeDefaults);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const setLoadTypeDefaults = useUIStore((state) => state.setLoadTypeDefaults);

  // Initialize form with saved defaults on first render
  useEffect(() => {
    if (!isExpanded || !loadTypeDefaults.distributed) {
      return;
    }

    const defaults = loadTypeDefaults.distributed;
    const currentParams = {
      x1: loadParameters.x1 ?? defaults.x1 ?? 0,
      x2: loadParameters.x2 ?? defaults.x2 ?? 0,
      w1: loadParameters.w1 ?? defaults.w1 ?? 0,
      w2: loadParameters.w2 ?? defaults.w2 ?? 0,
      direction: loadParameters.direction ?? defaults.direction ?? 'Fx',
    };

    if ((defaults.x1 !== undefined || defaults.x2 !== undefined || defaults.w1 !== undefined ||
         defaults.w2 !== undefined || defaults.direction !== undefined) &&
        loadParameters.x1 === undefined && loadParameters.x2 === undefined &&
        loadParameters.w1 === undefined && loadParameters.w2 === undefined &&
        loadParameters.direction === undefined) {
      setLoadCreationMode('distributed', currentParams);
    }
  }, [isExpanded]);

  const isLocal = (loadParameters.direction as string)?.toLowerCase() === loadParameters.direction;

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('distributed', { ...loadParameters, [key]: value });
    setLoadTypeDefaults('distributed', { [key]: value });
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

    const x1 = parseFloat(loadParameters.x1 as any);
    const x2 = parseFloat(loadParameters.x2 as any);
    if (isNaN(x1) || isNaN(x2) || x1 > x2) {
      alert('x1 must be less than or equal to x2');
      return;
    }

    const w1 = parseFloat(loadParameters.w1 as any);
    const w2 = parseFloat(loadParameters.w2 as any);
    if (isNaN(w1) || isNaN(w2) || (w1 === 0 && w2 === 0)) {
      alert('At least one load intensity must be non-zero');
      return;
    }

    const direction = (loadParameters.direction as string) || 'Fx';
    if (!['Fx', 'Fy', 'fx', 'fy'].includes(direction)) {
      alert('Please select a direction');
      return;
    }

    // Start load creation mode - user will click elements on canvas
    setLoadCreationMode('distributed', {
      x1,
      x2,
      w1,
      w2,
      direction,
      case: activeLoadCase,
    });
  };

  // Only render the form content (no button wrapper)
  if (!isExpanded) return null;

  return (
    <div style={formContentStyle}>
      <div style={formGroupStyle}>
        <label style={labelStyle}>x1 (m)</label>
        <input
          type="number"
          value={loadParameters.x1 || ''}
          onChange={(e) => handleParameterChange('x1', parseFloat(e.target.value) || 0)}
          placeholder="0"
          style={inputStyle}
          step="0.01"
          min="0"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>x2 (m)</label>
        <input
          type="number"
          value={loadParameters.x2 || ''}
          onChange={(e) => handleParameterChange('x2', parseFloat(e.target.value) || 0)}
          placeholder="0"
          style={inputStyle}
          step="0.01"
          min="0"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>w1 (kN/m)</label>
        <input
          type="number"
          value={loadParameters.w1 || ''}
          onChange={(e) => handleParameterChange('w1', parseFloat(e.target.value) || 0)}
          placeholder="0"
          style={inputStyle}
          step="0.1"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>w2 (kN/m)</label>
        <input
          type="number"
          value={loadParameters.w2 || ''}
          onChange={(e) => handleParameterChange('w2', parseFloat(e.target.value) || 0)}
          placeholder="0"
          style={inputStyle}
          step="0.1"
        />
      </div>

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

      <button onClick={handleCreateLoad} style={createButtonStyle}>
        Create Distributed Load → Click Elements
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
  minWidth: '90px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
};

const inputStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
  width: '75px',
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
