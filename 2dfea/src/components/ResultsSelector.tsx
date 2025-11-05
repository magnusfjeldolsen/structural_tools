/**
 * Results Selector - Dropdown controls for viewing different load cases and combinations
 * Allows users to select which results to display from cached analysis results
 */

import { useModelStore, useUIStore } from '../store';
import { theme } from '../styles/theme';

interface ResultsSelectorProps {
  isAnalyzing: boolean;
}

export function ResultsSelector({ isAnalyzing }: ResultsSelectorProps) {
  const resultsCache = useModelStore((state) => state.resultsCache);
  const loadCases = useModelStore((state) => state.loadCases);
  const loadCombinations = useModelStore((state) => state.loadCombinations);
  const selectedResultType = useUIStore((state) => state.selectedResultType);
  const selectedResultName = useUIStore((state) => state.selectedResultName);
  const setSelectedResult = useUIStore((state) => state.setSelectedResult);

  // Get available items based on type
  const availableItems = selectedResultType === 'case' ? loadCases : loadCombinations;
  const availableResults =
    selectedResultType === 'case'
      ? resultsCache.caseResults
      : resultsCache.combinationResults;

  return (
    <div style={selectorContainerStyle}>
      {/* Type Selector */}
      <select
        value={selectedResultType}
        onChange={(e) => setSelectedResult(e.target.value as 'case' | 'combination', null)}
        style={dropdownStyle}
        disabled={isAnalyzing}
      >
        <option value="case">Load Cases</option>
        <option value="combination">Load Combinations</option>
      </select>

      {/* Name Selector */}
      <select
        value={selectedResultName || ''}
        onChange={(e) => setSelectedResult(selectedResultType, e.target.value || null)}
        style={dropdownStyle}
        disabled={isAnalyzing || availableItems.length === 0}
      >
        <option value="">-- Select {selectedResultType} --</option>
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
      {selectedResultName && !availableResults[selectedResultName] && (
        <div style={warningStyle}>
          ⚠️ No results available
        </div>
      )}

      {/* Summary Info */}
      {availableItems.length > 0 && (
        <div style={infoStyle}>
          {selectedResultType === 'case'
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
