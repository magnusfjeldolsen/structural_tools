/**
 * Load Creation Panel
 * Horizontal button bar with expandable form content
 * Spans from left toolbar to right panel tabs
 */

import { useState } from 'react';
import { useUIStore } from '../store';
import { theme } from '../styles/theme';
import { NodalLoadForm } from './LoadForms/NodalLoadForm';
import { PointLoadForm } from './LoadForms/PointLoadForm';
import { DistributedLoadForm } from './LoadForms/DistributedLoadForm';
import { LineLoadForm } from './LoadForms/LineLoadForm';

export function LoadCreationPanel() {
  const [expandedForm, setExpandedForm] = useState<'nodal' | 'point' | 'distributed' | 'lineLoad' | null>(null);
  const loadCreationMode = useUIStore((state) => state.loadCreationMode);
  const cancelLoadCreation = useUIStore((state) => state.cancelLoadCreation);

  const handleToggleForm = (formType: 'nodal' | 'point' | 'distributed' | 'lineLoad') => {
    if (expandedForm === formType) {
      setExpandedForm(null);
    } else {
      setExpandedForm(formType);
    }
  };

  const buttonLoadTypes: Array<{ type: 'nodal' | 'point' | 'distributed' | 'lineLoad'; label: string }> = [
    { type: 'nodal', label: 'Nodal Load' },
    { type: 'point', label: 'Point Load' },
    { type: 'distributed', label: 'Distributed Load' },
    { type: 'lineLoad', label: 'Line Load' },
  ];

  return (
    <div style={containerStyle}>
      {/* Top button row */}
      <div style={buttonRowStyle}>
        {buttonLoadTypes.map((btn) => (
          <button
            key={btn.type}
            onClick={() => handleToggleForm(btn.type)}
            style={{
              ...buttonStyle,
              backgroundColor: expandedForm === btn.type ? theme.colors.primaryDark : theme.colors.primary,
            }}
          >
            {btn.label} {expandedForm === btn.type ? '▼' : '▶'}
          </button>
        ))}
        {loadCreationMode && (
          <button onClick={cancelLoadCreation} style={cancelButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      {/* Expandable content area */}
      {expandedForm && (
        <div style={expandedContentContainerStyle}>
          {expandedForm === 'nodal' && <NodalLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'point' && <PointLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'distributed' && <DistributedLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'lineLoad' && <LineLoadForm isExpanded={true} onToggleExpand={() => {}} />}
        </div>
      )}

      {/* Mode indicator when in creation mode */}
      {loadCreationMode && (
        <div style={modeIndicatorStyle}>
          <span style={modeTextStyle}>
            {loadCreationMode === 'nodal' && '➜ Click nodes to apply nodal loads'}
            {loadCreationMode === 'point' && '➜ Click elements to apply point loads'}
            {loadCreationMode === 'distributed' && '➜ Click elements to apply distributed loads'}
            {loadCreationMode === 'lineLoad' && '➜ Click elements to apply line loads'}
          </span>
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
  overflow: 'hidden',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '4px',
  padding: '6px 8px',
  backgroundColor: theme.colors.bgLight,
  alignItems: 'center',
  flexWrap: 'wrap',
  minHeight: '32px',
};

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: theme.colors.primary,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
  flex: 'none',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: theme.colors.error,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  marginLeft: 'auto',
  whiteSpace: 'nowrap',
};

const expandedContentContainerStyle: React.CSSProperties = {
  padding: '12px 8px',
  backgroundColor: '#f9f9f9',
  borderTop: `1px solid ${theme.colors.border}`,
  maxHeight: '200px',
  overflowY: 'auto',
};

const modeIndicatorStyle: React.CSSProperties = {
  padding: '6px 8px',
  backgroundColor: theme.colors.info,
  borderTop: `1px solid ${theme.colors.primary}`,
};

const modeTextStyle: React.CSSProperties = {
  color: theme.colors.textWhite,
  fontSize: '12px',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
};
