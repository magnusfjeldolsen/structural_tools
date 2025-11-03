/**
 * Load Input Dialog
 * Modal dialog for entering load parameters (no node/element selection)
 * After user confirms, they select nodes/elements on canvas interactively
 */

import { useState, useEffect } from 'react';
import { useModelStore, useUIStore } from '../store';

interface LoadInputDialogProps {
  isOpen: boolean;
  onClose: () => void;
  loadType?: 'nodal' | 'point' | 'distributed' | 'lineLoad';
  editingLoad?: {
    type: 'nodal' | 'point' | 'distributed';
    index: number;
    data: any;
  } | null;
}

export function LoadInputDialog({ isOpen, onClose, loadType, editingLoad }: LoadInputDialogProps) {
  const loadCases = useModelStore((state) => state.loadCases);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const updateNodalLoad = useModelStore((state) => state.updateNodalLoad);
  const updateElementPointLoad = useModelStore((state) => state.updateElementPointLoad);
  const updateDistributedLoad = useModelStore((state) => state.updateDistributedLoad);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const closeLoadDialog = useUIStore((state) => state.closeLoadDialog);

  // Form state - nodal load parameters
  const [fx, setFx] = useState<number>(0);
  const [fy, setFy] = useState<number>(0);
  const [mz, setMz] = useState<number>(0);

  // Form state - point load parameters (direction can be local 'Fx'/'Fy'/'Mz' or global 'FX'/'FY'/'MZ')
  const [distance, setDistance] = useState<number>(0);
  const [pointDirection, setPointDirection] = useState<'Fx' | 'Fy' | 'Mz' | 'FX' | 'FY' | 'MZ'>('Fy');
  const [magnitude, setMagnitude] = useState<number>(0);

  // Form state - distributed load parameters (direction can be local 'Fx'/'Fy' or global 'FX'/'FY')
  const [distributedDirection, setDistributedDirection] = useState<'Fx' | 'Fy' | 'FX' | 'FY'>('Fy');
  const [w1, setW1] = useState<number>(0);
  const [w2, setW2] = useState<number>(0);
  const [x1, setX1] = useState<number>(0);
  const [x2, setX2] = useState<number>(0);

  // Form state - line load parameters (simplified - applied across entire element)
  const [lineLoadDirection, setLineLoadDirection] = useState<'Fx' | 'Fy' | 'FX' | 'FY'>('Fy');
  const [lineLoadW1, setLineLoadW1] = useState<number>(0);  // Start intensity
  const [lineLoadW2, setLineLoadW2] = useState<number>(0);  // End intensity

  // Common
  const [selectedCase, setSelectedCase] = useState<string | undefined>(activeLoadCase || undefined);
  const [error, setError] = useState<string>('');
  const [coordinateSystem, setCoordinateSystem] = useState<'global' | 'local'>('global');

  // Initialize form with editing data
  useEffect(() => {
    if (editingLoad && isOpen) {
      setError('');

      if (editingLoad.type === 'nodal') {
        const load = editingLoad.data;
        setFx(load.fx);
        setFy(load.fy);
        setMz(load.mz);
        setSelectedCase(load.case || activeLoadCase || undefined);
      } else if (editingLoad.type === 'point') {
        const load = editingLoad.data;
        setDistance(load.distance);
        setPointDirection(load.direction);
        // Determine coordinate system from direction case
        setCoordinateSystem(load.direction && load.direction[0] === load.direction[0].toLowerCase() ? 'local' : 'global');
        setMagnitude(load.magnitude);
        setSelectedCase(load.case || activeLoadCase || undefined);
      } else if (editingLoad.type === 'distributed') {
        const load = editingLoad.data;
        setDistributedDirection(load.direction);
        // Determine coordinate system from direction case
        setCoordinateSystem(load.direction && load.direction[0] === load.direction[0].toLowerCase() ? 'local' : 'global');
        setW1(load.w1);
        setW2(load.w2);
        setX1(load.x1);
        setX2(load.x2);
        setSelectedCase(load.case || activeLoadCase || undefined);
      }
    } else if (isOpen && !editingLoad) {
      // Reset form for new load
      setFx(0);
      setFy(0);
      setMz(0);
      setDistance(0);
      setPointDirection('Fy');
      setDistributedDirection('Fy');
      setMagnitude(0);
      setW1(0);
      setW2(0);
      setX1(0);
      setX2(0);
      setLineLoadDirection('Fy');
      setLineLoadW1(0);
      setLineLoadW2(0);
      setSelectedCase(activeLoadCase || undefined);
      setError('');
    }
  }, [isOpen, editingLoad, loadType, activeLoadCase]);

  const handleConfirm = () => {
    setError('');

    try {
      if (loadType === 'nodal') {
        if (editingLoad) {
          updateNodalLoad(editingLoad.index, {
            fx,
            fy,
            mz,
            case: selectedCase,
          });
          closeLoadDialog();
        } else {
          // Store parameters and enter selection mode
          setLoadCreationMode('nodal', { fx, fy, mz, case: selectedCase });
          closeLoadDialog();
        }
      } else if (loadType === 'point') {
        if (distance < 0) {
          setError('Distance must be non-negative');
          return;
        }
        if (editingLoad) {
          updateElementPointLoad(editingLoad.index, {
            distance,
            direction: pointDirection,
            magnitude,
            case: selectedCase,
          });
          closeLoadDialog();
        } else {
          // Store parameters and enter selection mode
          setLoadCreationMode('point', {
            distance,
            direction: pointDirection,
            magnitude,
            case: selectedCase,
          });
          closeLoadDialog();
        }
      } else if (loadType === 'distributed') {
        if (x1 < 0 || x2 < 0 || x1 > x2) {
          setError('Invalid distribution range');
          return;
        }
        if (editingLoad) {
          updateDistributedLoad(editingLoad.index, {
            direction: distributedDirection,
            w1,
            w2,
            x1,
            x2,
            case: selectedCase,
          });
          closeLoadDialog();
        } else {
          // Store parameters and enter selection mode
          setLoadCreationMode('distributed', {
            direction: distributedDirection,
            w1,
            w2,
            x1,
            x2,
            case: selectedCase,
          });
          closeLoadDialog();
        }
      } else if (loadType === 'lineLoad') {
        // Line load is simplified: applied across entire element with optional gradient
        // Store parameters and enter element selection mode
        setLoadCreationMode('lineLoad', {
          direction: lineLoadDirection,
          w1: lineLoadW1,
          w2: lineLoadW2,
          case: selectedCase,
        });
        closeLoadDialog();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (!isOpen || !loadType) return null;

  const dialogStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1f2937',
    border: '1px solid #4b5563',
    borderRadius: '8px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    zIndex: 1000,
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
    color: '#f9fafb',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 999,
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#e5e7eb',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    marginBottom: '16px',
    backgroundColor: '#374151',
    border: '1px solid #4b5563',
    borderRadius: '4px',
    color: '#f9fafb',
    fontSize: '13px',
    boxSizing: 'border-box',
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
  };

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: '8px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  };

  const buttonStyle = (isPrimary: boolean): React.CSSProperties => ({
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    backgroundColor: isPrimary ? '#3b82f6' : '#4b5563',
    color: '#fff',
    transition: 'background-color 0.2s',
  });

  const errorStyle: React.CSSProperties = {
    color: '#f87171',
    backgroundColor: '#7f1d1d',
    padding: '8px 12px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '13px',
  };

  const fieldGroupStyle: React.CSSProperties = {
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    marginTop: 0,
    marginBottom: '16px',
    fontSize: '16px',
    fontWeight: 'bold',
  };

  const instructionStyle: React.CSSProperties = {
    fontSize: '12px',
    color: '#d1d5db',
    marginBottom: '16px',
    fontStyle: 'italic',
  };

  return (
    <>
      <div style={overlayStyle} onClick={onClose} />
      <div style={dialogStyle}>
        <h2 style={titleStyle}>
          {editingLoad
            ? `Edit ${loadType === 'nodal' ? 'Nodal' : loadType === 'point' ? 'Point' : loadType === 'lineLoad' ? 'Line' : 'Distributed'} Load`
            : `${loadType === 'nodal' ? 'Nodal' : loadType === 'point' ? 'Point' : loadType === 'lineLoad' ? 'Line' : 'Distributed'} Load Parameters`}
        </h2>

        {!editingLoad && (
          <p style={instructionStyle}>
            Enter the load parameters below. Then click {loadType === 'nodal' ? 'nodes' : 'elements'} on the canvas to apply{loadType === 'lineLoad' ? ' (load applied to entire element)' : ''}.
          </p>
        )}

        {error && <div style={errorStyle}>{error}</div>}

        {/* Load Case Selector */}
        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Load Case</label>
          <select
            value={selectedCase || ''}
            onChange={(e) => setSelectedCase(e.target.value || undefined)}
            style={selectStyle}
          >
            <option value="">Active Case</option>
            {loadCases.map((lc) => (
              <option key={lc.name} value={lc.name}>
                {lc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Coordinate System Selector - for member loads (point and distributed) */}
        {(loadType === 'point' || loadType === 'distributed' || loadType === 'lineLoad') && (
          <div style={fieldGroupStyle}>
            <label style={labelStyle}>Coordinate System</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setCoordinateSystem('global')}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: coordinateSystem === 'global' ? '#2196F3' : '#4b5563',
                  color: coordinateSystem === 'global' ? '#fff' : '#d1d5db',
                  border: '1px solid #666',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: coordinateSystem === 'global' ? 'bold' : 'normal',
                  fontSize: '13px',
                }}
              >
                Global (FX, FY)
              </button>
              <button
                onClick={() => setCoordinateSystem('local')}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: coordinateSystem === 'local' ? '#2196F3' : '#4b5563',
                  color: coordinateSystem === 'local' ? '#fff' : '#d1d5db',
                  border: '1px solid #666',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: coordinateSystem === 'local' ? 'bold' : 'normal',
                  fontSize: '13px',
                }}
              >
                Local (Fx, Fy)
              </button>
            </div>
          </div>
        )}

        {/* Nodal Load Fields */}
        {loadType === 'nodal' && (
          <>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Fx (kN)</label>
              <input
                type="number"
                value={fx}
                onChange={(e) => setFx(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Fy (kN)</label>
              <input
                type="number"
                value={fy}
                onChange={(e) => setFy(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Mz (kNm)</label>
              <input
                type="number"
                value={mz}
                onChange={(e) => setMz(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Point Load Fields */}
        {loadType === 'point' && (
          <>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Distance from start (m)</label>
              <input
                type="number"
                value={distance}
                onChange={(e) => setDistance(parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Direction</label>
              <select
                value={pointDirection}
                onChange={(e) => setPointDirection(e.target.value as 'Fx' | 'Fy' | 'Mz' | 'FX' | 'FY' | 'MZ')}
                style={selectStyle}
              >
                {coordinateSystem === 'global' ? (
                  <>
                    <option value="FX">FX (Horizontal - Global)</option>
                    <option value="FY">FY (Vertical - Global)</option>
                    <option value="MZ">MZ (Moment - Global)</option>
                  </>
                ) : (
                  <>
                    <option value="Fx">Fx (Along Member)</option>
                    <option value="Fy">Fy (Perpendicular)</option>
                    <option value="Mz">Mz (Moment)</option>
                  </>
                )}
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Magnitude (kN or kNm)</label>
              <input
                type="number"
                value={magnitude}
                onChange={(e) => setMagnitude(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Distributed Load Fields */}
        {loadType === 'distributed' && (
          <>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Direction</label>
              <select
                value={distributedDirection}
                onChange={(e) => setDistributedDirection(e.target.value as 'Fx' | 'Fy' | 'FX' | 'FY')}
                style={selectStyle}
              >
                {coordinateSystem === 'global' ? (
                  <>
                    <option value="FX">FX (Horizontal - Global)</option>
                    <option value="FY">FY (Vertical - Global)</option>
                  </>
                ) : (
                  <>
                    <option value="Fx">Fx (Along Member)</option>
                    <option value="Fy">Fy (Perpendicular)</option>
                  </>
                )}
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Start intensity w1 (kN/m)</label>
              <input
                type="number"
                value={w1}
                onChange={(e) => setW1(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End intensity w2 (kN/m)</label>
              <input
                type="number"
                value={w2}
                onChange={(e) => setW2(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Start position x1 (m)</label>
              <input
                type="number"
                value={x1}
                onChange={(e) => setX1(parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End position x2 (m)</label>
              <input
                type="number"
                value={x2}
                onChange={(e) => setX2(parseFloat(e.target.value) || 0)}
                step="0.1"
                min="0"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Line Load Fields */}
        {loadType === 'lineLoad' && (
          <>
            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Direction</label>
              <select
                value={lineLoadDirection}
                onChange={(e) => setLineLoadDirection(e.target.value as 'Fx' | 'Fy' | 'FX' | 'FY')}
                style={selectStyle}
              >
                {coordinateSystem === 'global' ? (
                  <>
                    <option value="FX">FX (Horizontal - Global)</option>
                    <option value="FY">FY (Vertical - Global)</option>
                  </>
                ) : (
                  <>
                    <option value="Fx">Fx (Along Member)</option>
                    <option value="Fy">Fy (Perpendicular)</option>
                  </>
                )}
              </select>
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Start intensity w1 (kN/m)</label>
              <input
                type="number"
                value={lineLoadW1}
                onChange={(e) => setLineLoadW1(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End intensity w2 (kN/m)</label>
              <input
                type="number"
                value={lineLoadW2}
                onChange={(e) => setLineLoadW2(parseFloat(e.target.value) || 0)}
                step="0.1"
                style={inputStyle}
              />
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div style={buttonContainerStyle}>
          <button
            onClick={onClose}
            style={buttonStyle(false)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#6b7280';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4b5563';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={buttonStyle(true)}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#2563eb';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#3b82f6';
            }}
          >
            {editingLoad ? 'Update' : 'Next'}
          </button>
        </div>
      </div>
    </>
  );
}
