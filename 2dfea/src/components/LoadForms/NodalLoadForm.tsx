/**
 * Nodal Load Form - Compact form content for nodal loads
 */

import { useEffect } from 'react';
import { useModelStore, useUIStore } from '../../store';
import { theme } from '../../styles/theme';

interface NodalLoadFormProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export function NodalLoadForm({ isExpanded }: NodalLoadFormProps) {
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const loadParameters = useUIStore((state) => state.loadParameters) || {};
  const loadTypeDefaults = useUIStore((state) => state.loadTypeDefaults);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const setLoadTypeDefaults = useUIStore((state) => state.setLoadTypeDefaults);

  // Initialize form with saved defaults on first render
  useEffect(() => {
    if (!isExpanded || !loadTypeDefaults.nodal) {
      return;
    }

    // Populate with saved defaults if not already set
    const defaults = loadTypeDefaults.nodal;
    const currentParams = {
      fx: loadParameters.fx ?? defaults.fx ?? 0,
      fy: loadParameters.fy ?? defaults.fy ?? 0,
      mz: loadParameters.mz ?? defaults.mz ?? 0,
    };

    // Only set if we have saved defaults and current params are empty
    if ((defaults.fx !== undefined || defaults.fy !== undefined || defaults.mz !== undefined) &&
        loadParameters.fx === undefined && loadParameters.fy === undefined && loadParameters.mz === undefined) {
      setLoadCreationMode('nodal', currentParams);
    }
  }, [isExpanded]);

  const handleParameterChange = (key: string, value: string | number) => {
    setLoadCreationMode('nodal', { ...loadParameters, [key]: value });
    setLoadTypeDefaults('nodal', { [key]: value });
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

  // Only render the form content (no button wrapper)
  if (!isExpanded) return null;

  return (
    <div style={formContentStyle}>
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
