/**
 * Load Cases Manager Modal
 * Create, modify, and delete load cases
 */

import { useState } from 'react';
import { useModelStore } from '../store';
import { theme } from '../styles/theme';

interface LoadCasesManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LoadCasesManager({ isOpen, onClose }: LoadCasesManagerProps) {
  const loadCases = useModelStore((state) => state.loadCases);
  const addLoadCase = useModelStore((state) => state.addLoadCase);
  const deleteLoadCase = useModelStore((state) => state.deleteLoadCase);

  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseDescription, setNewCaseDescription] = useState('');

  if (!isOpen) return null;

  const handleAddCase = () => {
    if (!newCaseName.trim()) {
      alert('Load case name cannot be empty');
      return;
    }
    if (loadCases.some((lc) => lc.name === newCaseName)) {
      alert('Load case already exists!');
      return;
    }
    addLoadCase({ name: newCaseName, description: newCaseDescription });
    setNewCaseName('');
    setNewCaseDescription('');
  };

  const handleDeleteCase = (name: string) => {
    if (loadCases.length === 1) {
      alert('Cannot delete the last load case!');
      return;
    }
    if (confirm(`Delete load case "${name}"? All associated loads will remain but unlinked.`)) {
      deleteLoadCase(name);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={modalHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Load Cases</h2>
          <button onClick={onClose} style={closeButtonStyle}>✕</button>
        </div>

        <div style={modalBodyStyle}>
          {/* Load Cases List */}
          <div style={sectionStyle}>
            <h4 style={subHeaderStyle}>Existing Load Cases</h4>
            {loadCases.length === 0 ? (
              <p style={{ color: theme.colors.textSecondary, fontSize: '13px' }}>
                No load cases defined. Create one below.
              </p>
            ) : (
              <div style={listStyle}>
                {loadCases.map((lc) => (
                  <div key={lc.name} style={listItemStyle}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{lc.name}</div>
                      {lc.description && (
                        <div style={{ fontSize: '12px', color: theme.colors.textSecondary }}>
                          {lc.description}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteCase(lc.name)}
                      style={deleteButtonStyle}
                      disabled={loadCases.length === 1}
                      title={loadCases.length === 1 ? 'Cannot delete last case' : 'Delete'}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add New Case */}
          <div style={sectionStyle}>
            <h4 style={subHeaderStyle}>Create New Load Case</h4>
            <div style={formStyle}>
              <div>
                <label style={labelStyle}>Case Name *</label>
                <input
                  type="text"
                  value={newCaseName}
                  onChange={(e) => setNewCaseName(e.target.value)}
                  placeholder="e.g., Wind, Snow, Custom..."
                  style={inputStyle}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCase()}
                />
              </div>
              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={newCaseDescription}
                  onChange={(e) => setNewCaseDescription(e.target.value)}
                  placeholder="Optional description..."
                  style={textareaStyle}
                  rows={2}
                />
              </div>
              <button onClick={handleAddCase} style={addButtonStyle}>
                Create Load Case
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
