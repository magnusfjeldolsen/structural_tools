/**
 * Point Load Form - Compact form content for element point loads
 */

import { useEffect } from 'react';
import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface PointLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function PointLoadForm({ isExpanded }: PointLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const loadTypeDefaults = useUIStore((state) => state.loadTypeDefaults);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const setLoadTypeDefaults = useUIStore((state) => state.setLoadTypeDefaults);

  // Initialize form with saved defaults on first render
  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    const defaults = loadTypeDefaults.point;
    if (!defaults) return;

    // Always restore missing parameters from defaults
    const needsUpdate =
      (!loadParameters.distance && defaults.distance !== undefined) ||
      (!loadParameters.magnitude && defaults.magnitude !== undefined) ||
      (!loadParameters.direction && defaults.direction !== undefined);

    if (needsUpdate) {
      setLoadCreationMode('point', {
        ...loadParameters,
        distance: loadParameters.distance ?? defaults.distance ?? 0,
        magnitude: loadParameters.magnitude ?? defaults.magnitude ?? 0,
        direction: loadParameters.direction ?? defaults.direction ?? 'Fx',
      });
    }
  }, [isExpanded]);

  const isLocal = (loadParameters.direction as string)?.toLowerCase() === loadParameters.direction;

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('point', { ...loadParameters, [key]: value });
    setLoadTypeDefaults('point', { [key]: value });
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

  // Only render the form content (no button wrapper)
  if (!isExpanded) return null;

  return (
    <div style={formContentStyle}>
      <div style={formGroupStyle}>
        <label style={labelStyle}>Distance (m)</label>
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
                <option value="mz">mz</option>
              </>
            ) : (
              <>
                <option value="Fx">Fx</option>
                <option value="Fy">Fy</option>
                <option value="Mz">Mz</option>
              </>
            )}
          </select>
          <button onClick={toggleCoordinateSystem} style={toggleButtonStyle}>
            {isLocal ? 'Local' : 'Global'}
          </button>
        </div>
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>Magnitude (kN)</label>
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
  minWidth: '100px',
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
  width: '80px',
};

const selectStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
  flex: 1,
  minWidth: '70px',
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
