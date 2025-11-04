/**
 * Loads Tab Toolbar
 * Provides load case management, active case selection, and load combination management
 */

import { useState } from 'react';
import { useModelStore } from '../store';
import { theme } from '../styles/theme';
import { LoadCasesManager } from './LoadCasesManager';
import { LoadCombinationsManager } from './LoadCombinationsManager';

export function LoadsTabToolbar() {
  const loadCases = useModelStore((state) => state.loadCases);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const setActiveLoadCase = useModelStore((state) => state.setActiveLoadCase);

  const [loadCasesModalOpen, setLoadCasesModalOpen] = useState(false);
  const [loadCombinationsModalOpen, setLoadCombinationsModalOpen] = useState(false);

  return (
    <>
      <div style={toolbarStyle}>
        {/* Load Cases Manager Button */}
        <button
          onClick={() => setLoadCasesModalOpen(true)}
          style={buttonStyle}
          title="Manage load cases"
        >
          Load Cases
        </button>

        {/* Active Load Case Dropdown */}
        <select
          value={activeLoadCase || ''}
          onChange={(e) => setActiveLoadCase(e.target.value || null)}
          style={selectStyle}
        >
          <option value="">All Cases</option>
          {loadCases.map((lc) => (
            <option key={lc.name} value={lc.name}>
              {lc.name}
            </option>
          ))}
        </select>

        {/* Load Combinations Manager Button */}
        <button
          onClick={() => setLoadCombinationsModalOpen(true)}
          style={buttonStyle}
          title="Manage load combinations"
        >
          Load Combinations
        </button>
      </div>

      {/* Modals */}
      <LoadCasesManager
        isOpen={loadCasesModalOpen}
        onClose={() => setLoadCasesModalOpen(false)}
      />
      <LoadCombinationsManager
        isOpen={loadCombinationsModalOpen}
        onClose={() => setLoadCombinationsModalOpen(false)}
      />
    </>
  );
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '12px',
  padding: '8px 16px',
  backgroundColor: theme.colors.bgLight,
  borderBottom: `1px solid ${theme.colors.border}`,
  alignItems: 'center',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: theme.colors.primary,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '13px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};

const selectStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '4px',
  fontSize: '13px',
  backgroundColor: theme.colors.bgWhite,
  cursor: 'pointer',
  minWidth: '150px',
};
