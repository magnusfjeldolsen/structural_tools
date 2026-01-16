/**
 * Load Creation Panel
 * Displays expandable form content and mode indicator
 * Buttons are now in LoadsTabToolbar
 */

import { useUIStore } from '../store';
import { theme } from '../styles/theme';
import { NodalLoadForm } from './LoadForms/NodalLoadForm';
import { PointLoadForm } from './LoadForms/PointLoadForm';
import { DistributedLoadForm } from './LoadForms/DistributedLoadForm';
import { LineLoadForm } from './LoadForms/LineLoadForm';

interface LoadCreationPanelProps {
  expandedForm: 'nodal' | 'point' | 'distributed' | 'lineLoad' | null;
}

export function LoadCreationPanel({ expandedForm }: LoadCreationPanelProps) {
  const loadCreationMode = useUIStore((state) => state.loadCreationMode);
  const cancelLoadCreation = useUIStore((state) => state.cancelLoadCreation);
  const resetFormParameters = useUIStore((state) => state.resetFormParameters);

  return (
    <div style={containerStyle}>
      {/* Expandable content area */}
      {expandedForm && (
        <div style={expandedContentContainerStyle}>
          {expandedForm === 'nodal' && <NodalLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'point' && <PointLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'distributed' && <DistributedLoadForm isExpanded={true} onToggleExpand={() => {}} />}
          {expandedForm === 'lineLoad' && <LineLoadForm isExpanded={true} onToggleExpand={() => {}} />}

          {loadCreationMode && (
            <button
              onClick={() => {
                cancelLoadCreation();
                resetFormParameters();
              }}
              style={cancelButtonStyle}
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Mode indicator when in creation mode */}
      {loadCreationMode && (
        <div style={modeIndicatorStyle}>
          <span style={modeTextStyle}>
            {loadCreationMode === 'nodal' && '➜ Click nodes to apply nodal loads'}
            {loadCreationMode === 'point' && '➜ Click elements to apply point loads'}
            {loadCreationMode === 'distributed' && '➜ Click elements to apply line loads'}
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

const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 12px',
  backgroundColor: theme.colors.error,
  color: theme.colors.textWhite,
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '12px',
  fontWeight: 'bold',
  marginLeft: '12px',
  whiteSpace: 'nowrap',
};

const expandedContentContainerStyle: React.CSSProperties = {
  padding: '12px 8px',
  backgroundColor: '#f9f9f9',
  borderTop: `1px solid ${theme.colors.border}`,
  maxHeight: '200px',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'row',
  gap: '12px',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
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
