/**
 * Distributed Load Form - Compact form content for distributed loads
 */

import { useEffect, useState } from 'react';
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

  // Local state for w1/w2 - kept separate from global state to avoid affecting model
  const [w1Local, setW1Local] = useState<number | ''>(loadParameters.w1 ?? '');
  const [w2Local, setW2Local] = useState<number | ''>(loadParameters.w2 ?? '');
  const [w2IndependentlyEdited, setW2IndependentlyEdited] = useState(false);

  // Initialize form with saved defaults on first render
  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    // Initialize direction and x1/x2 from loadParameters/defaults
    const defaults = loadTypeDefaults.distributed;

    // Always restore direction from defaults if not in loadParameters
    if (!loadParameters.direction && defaults?.direction) {
      setLoadCreationMode('distributed', {
        ...loadParameters,
        direction: defaults.direction,
        x1: defaults.x1 ?? loadParameters.x1 ?? 0,
        x2: defaults.x2 ?? loadParameters.x2 ?? 0,
      });
    }

    // Initialize w1/w2 local state from defaults
    if (defaults) {
      setW1Local(defaults.w1 ?? '');
      setW2Local(defaults.w2 ?? '');
      // Reset w2 independence flag when form expands
      setW2IndependentlyEdited(false);
    }
  }, [isExpanded]);

  const isLocal = (loadParameters.direction as string)?.toLowerCase() === loadParameters.direction;

  // Handle w1 input - local only
  const handleW1Change = (value: string) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setW1Local(numValue);

    // One-way tunnel: if w2 hasn't been independently edited, make it match w1
    if (!w2IndependentlyEdited && numValue !== '') {
      setW2Local(numValue);
      setLoadTypeDefaults('distributed', { w1: numValue as number, w2: numValue as number });
    } else if (numValue !== '') {
      setLoadTypeDefaults('distributed', { w1: numValue as number });
    }
  };

  // Handle w2 input - local only
  const handleW2Change = (value: string) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setW2Local(numValue);
    setW2IndependentlyEdited(true); // Mark as independently edited
    if (numValue !== '') {
      setLoadTypeDefaults('distributed', { w2: numValue as number });
    }
  };

  // Handle other parameters (x1, x2, direction) - global state
  const handleParameterChange = (key: string, value: string | number) => {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    setLoadCreationMode('distributed', { ...loadParameters, [key]: numValue });
    setLoadTypeDefaults('distributed', { [key]: numValue });
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

    const x1 = loadParameters.x1 !== undefined ? parseFloat(loadParameters.x1 as any) : 0;
    const x2 = loadParameters.x2 !== undefined ? parseFloat(loadParameters.x2 as any) : 0;

    // Allow x1=0, x2=0 (full element length), or x1 < x2
    if (isNaN(x1) || isNaN(x2)) {
      alert('x1 and x2 must be valid numbers');
      return;
    }
    if (x1 > x2 && x2 !== 0) {
      alert('x1 must be less than or equal to x2 (or leave x2 at 0 for full element)');
      return;
    }

    // Use local state for w1/w2
    const w1 = typeof w1Local === 'number' ? w1Local : 0;
    const w2 = typeof w2Local === 'number' ? w2Local : 0;
    if (w1 === 0 && w2 === 0) {
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
        <label style={labelStyle}>x1 (m) <span style={{fontWeight: 'normal', fontSize: '10px'}}>optional</span></label>
        <input
          type="number"
          value={loadParameters.x1 || ''}
          onChange={(e) => handleParameterChange('x1', parseFloat(e.target.value) || 0)}
          placeholder="0 (start)"
          style={inputStyle}
          step="0.01"
          min="0"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>x2 (m) <span style={{fontWeight: 'normal', fontSize: '10px'}}>optional</span></label>
        <input
          type="number"
          value={loadParameters.x2 || ''}
          onChange={(e) => handleParameterChange('x2', parseFloat(e.target.value) || 0)}
          placeholder="0 (full)"
          style={inputStyle}
          step="0.01"
          min="0"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>w1 (kN/m)</label>
        <input
          type="number"
          value={w1Local === '' ? '' : w1Local}
          onChange={(e) => handleW1Change(e.target.value)}
          placeholder="0"
          style={inputStyle}
          step="0.1"
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>w2 (kN/m)</label>
        <input
          type="number"
          value={w2Local === '' ? '' : w2Local}
          onChange={(e) => handleW2Change(e.target.value)}
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
