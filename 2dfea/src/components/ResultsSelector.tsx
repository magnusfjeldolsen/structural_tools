/**
 * Results Selector - Dropdown controls for viewing different load cases and combinations
 * Shows active load case (for load creation) and allows independent result viewing
 */

import { useModelStore } from '../store';
import { theme } from '../styles/theme';

interface ResultsSelectorProps {
  isAnalyzing: boolean;
}

export function ResultsSelector({ isAnalyzing }: ResultsSelectorProps) {
  const resultsCache = useModelStore((state) => state.resultsCache);
  const loadCases = useModelStore((state) => state.loadCases);
  const loadCombinations = useModelStore((state) => state.loadCombinations);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const activeResultView = useModelStore((state) => state.activeResultView);
  const setActiveLoadCase = useModelStore((state) => state.setActiveLoadCase);
  const setActiveResultView = useModelStore((state) => state.setActiveResultView);

  // Get available items based on type
  const availableItems = activeResultView.type === 'case' ? loadCases : loadCombinations;
  const availableResults =
    activeResultView.type === 'case'
      ? resultsCache.caseResults
      : resultsCache.combinationResults;

  return (
    <div style={selectorContainerStyle}>
      {/* Active Load Case (for load creation) */}
      <div style={labelContainerStyle}>
        <label style={labelStyle}>Active Load Case:</label>
        <select
          value={activeLoadCase || ''}
          onChange={(e) => setActiveLoadCase(e.target.value || null)}
          style={dropdownStyle}
          disabled={isAnalyzing || loadCases.length === 0}
        >
          <option value="">-- None --</option>
          {loadCases.map((loadCase) => (
            <option key={loadCase.name} value={loadCase.name}>
              {loadCase.name}
            </option>
          ))}
        </select>
      </div>

      {/* Separator */}
      <div style={separatorStyle} />

      {/* View Results Type Selector */}
      <div style={labelContainerStyle}>
        <label style={labelStyle}>View Results:</label>
        <select
          value={activeResultView.type}
          onChange={(e) => setActiveResultView(e.target.value as 'case' | 'combination', null)}
          style={dropdownStyle}
          disabled={isAnalyzing}
        >
          <option value="case">Load Cases</option>
          <option value="combination">Combinations</option>
        </select>
      </div>

      {/* View Results Name Selector */}
      <select
        value={activeResultView.name || ''}
        onChange={(e) => setActiveResultView(activeResultView.type, e.target.value || null)}
        style={dropdownStyle}
        disabled={isAnalyzing || availableItems.length === 0}
      >
        <option value="">-- Select {activeResultView.type} --</option>
        {availableItems.map((item) => {
          const hasResults = availableResults[item.name];
          const status = hasResults ? '✓' : '○';
          return (
            <option key={item.name} value={item.name}>
              [{status}] {item.name}
            </option>
          );
        })}
      </select>

      {/* Status Indicator */}
      {activeResultView.name && !availableResults[activeResultView.name] && (
        <div style={warningStyle}>
          ⚠️ No results available
        </div>
      )}

      {/* Summary Info */}
      {availableItems.length > 0 && (
        <div style={infoStyle}>
          {activeResultView.type === 'case'
            ? `${resultsCache.analysisStatus.successfulCases}/${resultsCache.analysisStatus.totalCases}`
            : `${resultsCache.analysisStatus.successfulCombinations}/${resultsCache.analysisStatus.totalCombinations}`}
          {' results available'}
        </div>
      )}
    </div>
  );
}

const selectorContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: '8px',
  alignItems: 'center',
  flexWrap: 'wrap',
  padding: '6px 0',
};

const dropdownStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: '3px',
  fontSize: '12px',
  boxSizing: 'border-box',
  flex: '0 1 auto',
  minWidth: '150px',
  backgroundColor: theme.colors.bgWhite,
  color: theme.colors.textPrimary,
  cursor: 'pointer',
};

const warningStyle: React.CSSProperties = {
  fontSize: '11px',
  color: theme.colors.warning,
  fontWeight: 'bold',
  padding: '4px 6px',
  backgroundColor: '#fff3e0',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
};

const infoStyle: React.CSSProperties = {
  fontSize: '11px',
  color: theme.colors.textSecondary,
  padding: '4px 6px',
  whiteSpace: 'nowrap',
};

const labelContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 'bold',
  color: theme.colors.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const separatorStyle: React.CSSProperties = {
  width: '1px',
  height: '40px',
  backgroundColor: theme.colors.border,
  margin: '0 4px',
};
