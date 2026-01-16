/**
 * Line Load Form - Compact form content for line loads
 */

import { useEffect, useState } from 'react';
import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface LineLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function LineLoadForm({ isExpanded }: LineLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const formParameters = useUIStore((state) => state.formParameters) || {};
  const loadTypeDefaults = useUIStore((state) => state.loadTypeDefaults);
  const setFormParameters = useUIStore((state) => state.setFormParameters);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const resetFormParameters = useUIStore((state) => state.resetFormParameters);
  const setLoadTypeDefaults = useUIStore((state) => state.setLoadTypeDefaults);

  // Local state for w1/w2 - kept separate from global state to avoid affecting model
  const [w1Local, setW1Local] = useState<number | ''>(formParameters.w1 ?? '');
  const [w2Local, setW2Local] = useState<number | ''>(formParameters.w2 ?? '');
  const [w2IndependentlyEdited, setW2IndependentlyEdited] = useState(false);

  // Initialize form with saved defaults on first render
  useEffect(() => {
    if (!isExpanded) {
      return;
    }

    // Initialize direction and other fields from formParameters/defaults
    if (!formParameters.direction && loadTypeDefaults.lineLoad?.direction) {
      setFormParameters({
        ...formParameters,
        direction: loadTypeDefaults.lineLoad.direction,
      });
    }

    // Initialize w1/w2 local state from defaults
    if (loadTypeDefaults.lineLoad) {
      setW1Local(loadTypeDefaults.lineLoad.w1 ?? '');
      setW2Local(loadTypeDefaults.lineLoad.w2 ?? '');
      // Reset w2 independence flag when form expands
      setW2IndependentlyEdited(false);
    }
  }, [isExpanded]);

  const isLocal = typeof formParameters.direction === 'string'
    ? formParameters.direction.toLowerCase() === formParameters.direction
    : false;

  // Handle w1 input - local only
  const handleW1Change = (value: string) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setW1Local(numValue);

    // One-way tunnel: if w2 hasn't been independently edited, make it match w1
    if (!w2IndependentlyEdited && numValue !== '') {
      setW2Local(numValue);
      setLoadTypeDefaults('lineLoad', { w1: numValue as number, w2: numValue as number });
    } else if (numValue !== '') {
      setLoadTypeDefaults('lineLoad', { w1: numValue as number });
    }
  };

  // Handle w2 input - local only
  const handleW2Change = (value: string) => {
    const numValue = value === '' ? '' : parseFloat(value);
    setW2Local(numValue);
    setW2IndependentlyEdited(true); // Mark as independently edited
    if (numValue !== '') {
      setLoadTypeDefaults('lineLoad', { w2: numValue as number });
    }
  };

  // Handle direction - global state
  const handleParameterChange = (key: string, value: string | number) => {
    setFormParameters({ ...formParameters, [key]: value });
    setLoadTypeDefaults('lineLoad', { [key]: value });
  };

  const toggleCoordinateSystem = () => {
    const currentDir = (formParameters.direction as string) || 'Fx';
    const newDir = isLocal ? currentDir.toUpperCase() : currentDir.toLowerCase();
    handleParameterChange('direction', newDir);
  };

  const handleCreateLoad = () => {
    // Validation
    if (!activeLoadCase) {
      alert('Please select an active load case first');
      return;
    }

    const direction = (formParameters.direction as string) || 'Fx';
    if (!['Fx', 'Fy', 'fx', 'fy', 'FX', 'FY'].includes(direction)) {
      alert('Please select a direction');
      return;
    }

    // Use local state for w1/w2
    const w1 = typeof w1Local === 'number' ? w1Local : 0;
    const w2 = typeof w2Local === 'number' ? w2Local : 0;

    if (w1 === 0 && w2 === 0) {
      alert('Please enter at least one magnitude value');
      return;
    }

    // Start load creation mode - user will click to draw a line on elements
    setLoadCreationMode('lineLoad', {
      direction,
      w1,
      w2,
      case: activeLoadCase,
    });
    // Reset form parameters after entering creation mode
    resetFormParameters();
  };

  // Only render the form content (no button wrapper)
  if (!isExpanded) return null;

  return (
    <div style={formContentStyle}>
      <div style={formGroupStyle}>
        <label style={labelStyle}>Direction</label>
        <div style={directionGroupStyle}>
          <select
            value={formParameters.direction || 'Fx'}
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
                <option value="FX">FX</option>
                <option value="FY">FY</option>
              </>
            )}
          </select>
          <button onClick={toggleCoordinateSystem} style={toggleButtonStyle}>
            {isLocal ? 'Local' : 'Global'}
          </button>
        </div>
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>Start (kN/m)</label>
        <input
          type="number"
          step="0.1"
          value={w1Local === '' ? '' : w1Local}
          onChange={(e) => handleW1Change(e.target.value)}
          placeholder="w1"
          style={inputStyle}
        />
      </div>

      <div style={formGroupStyle}>
        <label style={labelStyle}>End (kN/m)</label>
        <input
          type="number"
          step="0.1"
          value={w2Local === '' ? '' : w2Local}
          onChange={(e) => handleW2Change(e.target.value)}
          placeholder="w2"
          style={inputStyle}
        />
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

const inputStyle: React.CSSProperties = {
  padding: '4px 6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
  width: '80px',
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
