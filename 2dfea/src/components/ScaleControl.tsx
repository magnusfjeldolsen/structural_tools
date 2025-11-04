/**
 * Scale Control Component
 * Provides slider (0.1x - 10x) and text input (unlimited range) for scaling diagrams/displacements
 * Includes reset button to return to automatic scaling
 */

import { theme } from '../styles/theme';

interface ScaleControlProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  onReset: () => void;
}

export function ScaleControl({
  label,
  value,
  min = 0.1,
  max = 10,
  step = 0.1,
  onChange,
  onReset,
}: ScaleControlProps) {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    if (inputValue === '' || inputValue === '.') {
      // Allow empty or just dot for user to continue typing
      return;
    }

    const newValue = parseFloat(inputValue);
    if (!isNaN(newValue) && newValue > 0) {
      onChange(newValue);
    }
  };

  const handleTextBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value === '' || e.target.value === '.') {
      e.target.value = value.toFixed(2);
    }
  };

  const displayValue = value < min ? min : value > max ? value : value;

  return (
    <div style={containerStyle}>
      <div style={labelAndResetStyle}>
        <span style={labelStyle}>{label}</span>
        <button onClick={onReset} style={resetButtonStyle} title="Reset to automatic scaling">
          ⟲
        </button>
      </div>

      <div style={controlsContainerStyle}>
        {/* Slider - for quick adjustments within range */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={displayValue}
          onChange={handleSliderChange}
          style={sliderStyle}
          title={`Scale: ${displayValue.toFixed(2)}x`}
        />

        {/* Text input - for custom values outside range */}
        <input
          type="number"
          value={value.toFixed(2)}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          min="0.01"
          step={step}
          style={textInputStyle}
          placeholder="Scale"
          title="Enter custom scale value (0.01x - 100x or higher)"
        />

        {/* Display label with 'x' suffix */}
        <span style={displayLabelStyle}>{displayValue.toFixed(2)}x</span>
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: '#f5f5f5',
  borderTop: `1px solid ${theme.colors.border}`,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelAndResetStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const labelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
};

const resetButtonStyle: React.CSSProperties = {
  padding: '2px 4px',
  backgroundColor: 'transparent',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
  color: theme.colors.textSecondary,
  transition: 'all 0.2s',
  minWidth: '20px',
};

const controlsContainerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const sliderStyle: React.CSSProperties = {
  flex: 1,
  minWidth: '100px',
  height: '6px',
  cursor: 'pointer',
};

const textInputStyle: React.CSSProperties = {
  width: '60px',
  padding: '4px 6px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  textAlign: 'center',
  boxSizing: 'border-box',
};

const displayLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
  minWidth: '35px',
  textAlign: 'right',
};
