/**
 * TabBar Component
 *
 * Main navigation tabs for switching between application modes:
 * - Structure: Create and modify geometry
 * - Loads: Define and manage loads
 * - Analysis: Run analysis and view results
 */

import { useUIStore } from '../store/useUIStore';
import { theme } from '../styles/theme';

export type AppTab = 'structure' | 'loads' | 'analysis';

export function TabBar() {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  const tabStyle = (tab: AppTab) => ({
    flex: 1,
    padding: '14px 24px',
    border: 'none',
    backgroundColor: activeTab === tab ? theme.colors.bgWhite : theme.colors.bgLight,
    borderBottom: activeTab === tab ? `4px solid ${theme.colors.primary}` : '4px solid transparent',
    cursor: 'pointer',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
    fontSize: '15px',
    transition: 'all 0.2s ease',
    color: activeTab === tab ? theme.colors.primary : theme.colors.textPrimary,
  });

  return (
    <div
      style={{
        display: 'flex',
        backgroundColor: theme.colors.bgLight,
        borderBottom: `1px solid ${theme.colors.border}`,
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      <button
        style={tabStyle('structure')}
        onClick={() => setActiveTab('structure')}
      >
        📐 Structure
      </button>
      <button
        style={tabStyle('loads')}
        onClick={() => setActiveTab('loads')}
      >
        ⚡ Loads
      </button>
      <button
        style={tabStyle('analysis')}
        onClick={() => setActiveTab('analysis')}
      >
        📊 Analysis
      </button>
    </div>
  );
}
