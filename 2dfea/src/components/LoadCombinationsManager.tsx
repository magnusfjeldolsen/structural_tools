/**
 * Load Combinations Manager Modal
 * Create, modify, and delete load combinations
 */

import { useState } from 'react';
import { useModelStore } from '../store';
import { theme } from '../styles/theme';

interface LoadCombinationsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoadCombinationsManager({ isOpen, onClose }: LoadCombinationsManagerProps) {
  const loadCases = useModelStore((state) => state.loadCases);
  const loadCombinations = useModelStore((state) => state.loadCombinations);
  const addLoadCombination = useModelStore((state) => state.addLoadCombination);
  const deleteLoadCombination = useModelStore((state) => state.deleteLoadCombination);

  const [newComboName, setNewComboName] = useState('');
  const [newComboDescription, setNewComboDescription] = useState('');
  const [comboFactors, setComboFactors] = useState<Record<string, number>>({});

  if (!isOpen) return null;

  const handleAddCombination = () => {
    if (!newComboName.trim()) {
      alert('Combination name cannot be empty');
      return;
    }
    if (loadCombinations.some((combo) => combo.name === newComboName)) {
      alert('Combination already exists!');
      return;
    }
    if (Object.keys(comboFactors).length === 0) {
      alert('Add at least one load case with factor!');
      return;
    }
    addLoadCombination({
      name: newComboName,
      factors: comboFactors,
      description: newComboDescription,
    });
    setNewComboName('');
    setNewComboDescription('');
    setComboFactors({});
  };

  const handleToggleCaseInCombo = (caseName: string) => {
    setComboFactors((prev) => {
      const newFactors = { ...prev };
      if (caseName in newFactors) {
        delete newFactors[caseName];
      } else {
        newFactors[caseName] = 1.0;
      }
      return newFactors;
    });
  };

  const handleFactorChange = (caseName: string, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setComboFactors((prev) => ({ ...prev, [caseName]: num }));
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Load Combinations</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        <div style={modalBodyStyle}>
          {/* Load Combinations List */}
          <div style={sectionStyle}>
            <h4 style={subHeaderStyle}>Existing Load Combinations</h4>
            {loadCombinations.length === 0 ? (
              <p style={{ color: theme.colors.textSecondary, fontSize: '13px' }}>
                No load combinations defined. Create one below.
              </p>
            ) : (
              <div style={listStyle}>
                {loadCombinations.map((combo) => (
                  <div key={combo.name} style={listItemStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{combo.name}</div>
                      <div style={{ fontSize: '12px', color: theme.colors.textSecondary }}>
                        {Object.entries(combo.factors)
                          .map(([c, f]) => `${f}×${c}`)
                          .join(' + ')}
                      </div>
                      {combo.description && (
                        <div style={{ fontSize: '12px', color: theme.colors.textSecondary, marginTop: '2px' }}>
                          {combo.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteLoadCombination(combo.name)}
                      style={deleteButtonStyle}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Combination */}
          <div style={sectionStyle}>
            <h4 style={subHeaderStyle}>Create New Load Combination</h4>
            <div style={formStyle}>
              <div>
                <label style={labelStyle}>Combination Name *</label>
                <input
                  type="text"
                  value={newComboName}
                  onChange={(e) => setNewComboName(e.target.value)}
                  placeholder="e.g., Ultimate, Serviceability..."
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={newComboDescription}
                  onChange={(e) => setNewComboDescription(e.target.value)}
                  placeholder="Optional description..."
                  style={textareaStyle}
                  rows={2}
                />
              </div>

              <div>
                <label style={labelStyle}>Load Case Factors</label>
                {loadCases.length === 0 ? (
                  <p style={{ color: theme.colors.textSecondary, fontSize: '13px' }}>
                    Create load cases first to define combinations.
                  </p>
                ) : (
                  <div style={factorsContainerStyle}>
                    {loadCases.map((lc) => (
                      <div key={lc.name} style={factorRowStyle}>
                        <label style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <input
                            type="checkbox"
                            checked={lc.name in comboFactors}
                            onChange={() => handleToggleCaseInCombo(lc.name)}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                          />
                          <span>{lc.name}</span>
                        </label>
                        {lc.name in comboFactors && (
                          <input
                            type="number"
                            value={comboFactors[lc.name]}
                            onChange={(e) => handleFactorChange(lc.name, e.target.value)}
                            step="0.1"
                            style={{ ...inputStyle, width: '70px', marginLeft: '8px' }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleAddCombination}
                style={addButtonStyle}
                disabled={Object.keys(comboFactors).length === 0}
              >
                Create Combination
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  backgroundColor: theme.colors.bgWhite,
  borderRadius: '6px',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  width: '90%',
  maxWidth: '500px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const modalHeaderStyle: React.CSSProperties = {
  padding: '16px',
  borderBottom: `1px solid ${theme.colors.border}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  backgroundColor: theme.colors.bgLight,
};

const closeButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '20px',
  cursor: 'pointer',
  color: theme.colors.textPrimary,
  padding: '0',
  width: '24px',
  height: '24px',
};

const modalBodyStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
  padding: '12px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '4px',
  backgroundColor: '#fafafa',
};

const subHeaderStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 'bold',
  marginTop: 0,
  marginBottom: '12px',
  color: theme.colors.textPrimary,
};

const listStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  backgroundColor: theme.colors.bgWhite,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  gap: '8px',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 'bold',
  marginBottom: '4px',
  color: theme.colors.textPrimary,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '13px',
  boxSizing: 'border-box',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '13px',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const factorsContainerStyle: React.CSSProperties = {
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  padding: '8px',
  backgroundColor: theme.colors.bgWhite,
};

const factorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 4px',
  fontSize: '13px',
  borderBottom: `1px solid ${theme.colors.border}`,
};

const addButtonStyle: React.CSSProperties = {
  padding: '8px 12px',
  backgroundColor: theme.colors.success,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: theme.colors.error,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
};
