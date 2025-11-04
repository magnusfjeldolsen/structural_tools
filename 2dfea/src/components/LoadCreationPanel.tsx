/**
 * Load Creation Panel
 * Contains expandable load type buttons with compact forms
 * Only one load type can be expanded at a time
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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h4 style={titleStyle}>Load Creation</h4>
        {loadCreationMode && (
          <button onClick={cancelLoadCreation} style={cancelButtonStyle}>
            Cancel
          </button>
        )}
      </div>

      <div style={formsContainerStyle}>
        <NodalLoadForm
          isExpanded={expandedForm === 'nodal'}
          onToggleExpand={() => handleToggleForm('nodal')}
        />
        <PointLoadForm
          isExpanded={expandedForm === 'point'}
          onToggleExpand={() => handleToggleForm('point')}
        />
        <DistributedLoadForm
          isExpanded={expandedForm === 'distributed'}
          onToggleExpand={() => handleToggleForm('distributed')}
        />
        <LineLoadForm
          isExpanded={expandedForm === 'lineLoad'}
          onToggleExpand={() => handleToggleForm('lineLoad')}
        />
      </div>

      {loadCreationMode && (
        <div style={modeIndicatorStyle}>
          <span style={modeTextStyle}>
            {loadCreationMode === 'nodal' && 'Click nodes to apply nodal loads'}
            {loadCreationMode === 'point' && 'Click elements to apply point loads'}
            {loadCreationMode === 'distributed' && 'Click elements to apply distributed loads'}
            {loadCreationMode === 'lineLoad' && 'Click elements to apply line loads'}
          </span>
        </div>
      )}
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '8px',
  backgroundColor: theme.colors.bgWhite,
  borderBottom: `1px solid ${theme.colors.border}`,
  gap: '8px',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '13px',
  fontWeight: 'bold',
  color: theme.colors.textPrimary,
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  backgroundColor: theme.colors.error,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '3px',
  cursor: 'pointer',
  fontSize: '11px',
  fontWeight: 'bold',
};

const formsContainerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const modeIndicatorStyle: React.CSSProperties = {
  padding: '8px',
  backgroundColor: theme.colors.info,
  borderRadius: '3px',
  border: `1px solid ${theme.colors.primary}`,
};

const modeTextStyle: React.CSSProperties = {
  color: theme.colors.textWhite,
  fontSize: '12px',
  fontWeight: 'bold',
};
