/**
 * Load Case & Combination Panel
 * Manages load cases and combinations for analysis
 */

import { useState, useEffect } from 'react';
import { useModelStore } from '../store';

export function LoadCasePanel() {
  const loadCases = useModelStore((state) => state.loadCases);
  const loadCombinations = useModelStore((state) => state.loadCombinations);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const addLoadCase = useModelStore((state) => state.addLoadCase);
  const deleteLoadCase = useModelStore((state) => state.deleteLoadCase);
  const setActiveLoadCase = useModelStore((state) => state.setActiveLoadCase);
  const addLoadCombination = useModelStore((state) => state.addLoadCombination);
  const deleteLoadCombination = useModelStore((state) => state.deleteLoadCombination);

  const [newCaseName, setNewCaseName] = useState('');
  const [newComboName, setNewComboName] = useState('');
  const [comboFactors, setComboFactors] = useState<Record<string, number>>({});

  // Initialize activeLoadCase to first load case if not set
  useEffect(() => {
    if (loadCases.length > 0 && !activeLoadCase) {
      setActiveLoadCase(loadCases[0].name);
    }
  }, [loadCases, activeLoadCase, setActiveLoadCase]);

  const handleAddCase = () => {
    if (!newCaseName.trim()) return;
    if (loadCases.some((lc) => lc.name === newCaseName)) {
      alert('Load case already exists!');
      return;
    }
    addLoadCase({ name: newCaseName, description: '' });
    setNewCaseName('');
  };

  const handleAddCombination = () => {
    if (!newComboName.trim()) return;
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
      description: '',
    });
    setNewComboName('');
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
    <div style={containerStyle}>
      <h3 style={headerStyle}>Load Cases & Combinations</h3>

      <div style={scrollContainerStyle}>
        {/* Active Load Case Selector */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Active Load Case (for visualization)</h4>
          <select
            value={activeLoadCase || ''}
            onChange={(e) => setActiveLoadCase(e.target.value)}
            style={selectStyle}
          >
            {loadCases.map((lc) => (
              <option key={lc.name} value={lc.name}>
                {lc.name}
              </option>
            ))}
          </select>
          <p style={helpTextStyle}>
            Filters which loads are shown on canvas. Analysis includes all cases.
          </p>
        </section>

        {/* Load Cases */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Load Cases</h4>
          <div style={listStyle}>
            {loadCases.map((lc) => (
              <div key={lc.name} style={listItemStyle}>
                <span style={{ flex: 1 }}>{lc.name}</span>
                <button
                  onClick={() => deleteLoadCase(lc.name)}
                  style={deleteButtonStyle}
                  disabled={loadCases.length === 1}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          <div style={addRowStyle}>
            <input
              type="text"
              value={newCaseName}
              onChange={(e) => setNewCaseName(e.target.value)}
              placeholder="New case name..."
              style={inputStyle}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCase()}
            />
            <button onClick={handleAddCase} style={addButtonStyle}>
              Add Case
            </button>
          </div>
        </section>

        {/* Load Combinations */}
        <section style={sectionStyle}>
          <h4 style={subHeaderStyle}>Load Combinations</h4>
          <div style={listStyle}>
            {loadCombinations.map((combo) => (
              <div key={combo.name} style={listItemStyle}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold' }}>{combo.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {Object.entries(combo.factors)
                      .map(([c, f]) => `${f}×${c}`)
                      .join(' + ')}
                  </div>
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

          {/* Add Combination Form */}
          <div style={formStyle}>
            <input
              type="text"
              value={newComboName}
              onChange={(e) => setNewComboName(e.target.value)}
              placeholder="Combination name..."
              style={inputStyle}
            />

            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>
                Select Cases & Factors:
              </div>
              {loadCases.map((lc) => (
                <div key={lc.name} style={factorRowStyle}>
                  <label style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <input
                      type="checkbox"
                      checked={lc.name in comboFactors}
                      onChange={() => handleToggleCaseInCombo(lc.name)}
                      style={{ marginRight: '8px' }}
                    />
                    {lc.name}
                  </label>
                  {lc.name in comboFactors && (
                    <input
                      type="number"
                      value={comboFactors[lc.name]}
                      onChange={(e) => handleFactorChange(lc.name, e.target.value)}
                      step="0.1"
                      style={{ ...inputStyle, width: '60px' }}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleAddCombination}
              style={addButtonStyle}
              disabled={Object.keys(comboFactors).length === 0}
            >
              Add Combination
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// Styles
const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: '#fff',
  borderLeft: '1px solid #ccc',
};

const scrollContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: '16px',
};

const headerStyle: React.CSSProperties = {
  margin: 0,
  padding: '16px',
  backgroundColor: '#f5f5f5',
  borderBottom: '1px solid #ccc',
  fontSize: '18px',
  fontWeight: 'bold',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: '24px',
  padding: '12px',
  border: '1px solid #e0e0e0',
  borderRadius: '4px',
  backgroundColor: '#fafafa',
};

const subHeaderStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 'bold',
  marginTop: 0,
  marginBottom: '12px',
  color: '#333',
};

const listStyle: React.CSSProperties = {
  marginBottom: '12px',
};

const listItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px',
  marginBottom: '4px',
  backgroundColor: '#fff',
  border: '1px solid #ddd',
  borderRadius: '3px',
};

const addRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

const factorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px',
  fontSize: '13px',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: '3px',
  fontSize: '13px',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #ccc',
  borderRadius: '3px',
  fontSize: '13px',
};

const addButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: '#4CAF50',
  color: '#fff',
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
};

const deleteButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: '#f44336',
  color: '#fff',
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '12px',
};

const helpTextStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#666',
  marginTop: '4px',
  fontStyle: 'italic',
};
