/**
 * Load List Panel
 * Displays and manages all loads in the current load case
 */

import { useModelStore } from '../store';

interface LoadListPanelProps {
  onEditLoad?: (loadType: 'nodal' | 'point' | 'distributed', index: number, load: any) => void;
}

export function LoadListPanel({ onEditLoad }: LoadListPanelProps) {
  const loads = useModelStore((state) => state.loads);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const deleteNodalLoad = useModelStore((state) => state.deleteNodalLoad);
  const deleteElementPointLoad = useModelStore((state) => state.deleteElementPointLoad);
  const deleteDistributedLoad = useModelStore((state) => state.deleteDistributedLoad);

  // Filter loads by active case
  const nodalLoads = loads.nodal.filter((l) => l.case === activeLoadCase || (activeLoadCase === null && !l.case));
  const pointLoads = loads.elementPoint.filter((l) => l.case === activeLoadCase || (activeLoadCase === null && !l.case));
  const distributedLoads = loads.distributed.filter((l) => l.case === activeLoadCase || (activeLoadCase === null && !l.case));

  const hasLoads = nodalLoads.length > 0 || pointLoads.length > 0 || distributedLoads.length > 0;

  const panelStyle: React.CSSProperties = {
    backgroundColor: '#111827',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    padding: '16px',
    fontSize: '13px',
    color: '#d1d5db',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: '20px',
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#e5e7eb',
    marginBottom: '12px',
    borderBottom: '1px solid #374151',
    paddingBottom: '8px',
  };

  const loadItemStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px',
    backgroundColor: '#1f2937',
    borderRadius: '4px',
    marginBottom: '6px',
    fontSize: '12px',
  };

  const loadInfoStyle: React.CSSProperties = {
    flex: 1,
    marginRight: '8px',
  };

  const actionButtonStyle: React.CSSProperties = {
    padding: '4px 8px',
    marginLeft: '4px',
    fontSize: '11px',
    borderRadius: '3px',
    border: 'none',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const editButtonStyle: React.CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: '#3b82f6',
    color: '#fff',
  };

  const deleteButtonStyle: React.CSSProperties = {
    ...actionButtonStyle,
    backgroundColor: '#ef4444',
    color: '#fff',
  };

  const emptyStateStyle: React.CSSProperties = {
    textAlign: 'center',
    color: '#6b7280',
    padding: '24px 16px',
    fontSize: '13px',
  };

  const renderNodalLoads = () => {
    if (nodalLoads.length === 0) return null;

    return (
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Nodal Loads ({nodalLoads.length})</div>
        {nodalLoads.map((load, index) => {
          const originalIndex = loads.nodal.indexOf(load);
          const fxText = load.fx !== 0 ? `Fx=${load.fx.toFixed(2)} kN` : '';
          const fyText = load.fy !== 0 ? `Fy=${load.fy.toFixed(2)} kN` : '';
          const mzText = load.mz !== 0 ? `Mz=${load.mz.toFixed(2)} kNm` : '';
          const values = [fxText, fyText, mzText].filter(Boolean).join(', ');

          return (
            <div key={`nodal-${index}`} style={loadItemStyle}>
              <div style={loadInfoStyle}>
                <strong>{load.node}</strong>: {values || 'No load'}
              </div>
              <div>
                {onEditLoad && (
                  <button
                    style={editButtonStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                    onClick={() => onEditLoad('nodal', originalIndex, load)}
                  >
                    Edit
                  </button>
                )}
                <button
                  style={deleteButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
                  onClick={() => deleteNodalLoad(originalIndex)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPointLoads = () => {
    if (pointLoads.length === 0) return null;

    return (
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Element Point Loads ({pointLoads.length})</div>
        {pointLoads.map((load, index) => {
          const originalIndex = loads.elementPoint.indexOf(load);
          const directionLabel =
            load.direction === 'Fx' ? 'Horizontal' : load.direction === 'Fy' ? 'Vertical' : 'Moment';
          const unit = load.direction === 'Mz' ? 'kNm' : 'kN';

          return (
            <div key={`point-${index}`} style={loadItemStyle}>
              <div style={loadInfoStyle}>
                <strong>{load.element}</strong> @ {load.distance.toFixed(2)}m: {load.magnitude.toFixed(2)} {unit} ({directionLabel})
              </div>
              <div>
                {onEditLoad && (
                  <button
                    style={editButtonStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                    onClick={() => onEditLoad('point', originalIndex, load)}
                  >
                    Edit
                  </button>
                )}
                <button
                  style={deleteButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
                  onClick={() => deleteElementPointLoad(originalIndex)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderDistributedLoads = () => {
    if (distributedLoads.length === 0) return null;

    return (
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Distributed Loads ({distributedLoads.length})</div>
        {distributedLoads.map((load, index) => {
          const originalIndex = loads.distributed.indexOf(load);
          const directionLabel = load.direction === 'Fx' ? 'Horizontal' : 'Vertical';

          return (
            <div key={`dist-${index}`} style={loadItemStyle}>
              <div style={loadInfoStyle}>
                <strong>{load.element}</strong> {directionLabel}: w1={load.w1.toFixed(2)}, w2={load.w2.toFixed(2)} kN/m
                <br />
                <span style={{ color: '#9ca3af', fontSize: '11px' }}>
                  x1={load.x1.toFixed(2)}m, x2={load.x2.toFixed(2)}m
                </span>
              </div>
              <div>
                {onEditLoad && (
                  <button
                    style={editButtonStyle}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2563eb')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#3b82f6')}
                    onClick={() => onEditLoad('distributed', originalIndex, load)}
                  >
                    Edit
                  </button>
                )}
                <button
                  style={deleteButtonStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#dc2626')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#ef4444')}
                  onClick={() => deleteDistributedLoad(originalIndex)}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={panelStyle}>
      <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px', color: '#e5e7eb' }}>
        Loads {activeLoadCase && `(${activeLoadCase})`}
      </div>

      {hasLoads ? (
        <>
          {renderNodalLoads()}
          {renderPointLoads()}
          {renderDistributedLoads()}
        </>
      ) : (
        <div style={emptyStateStyle}>No loads in this case</div>
      )}
    </div>
  );
}
