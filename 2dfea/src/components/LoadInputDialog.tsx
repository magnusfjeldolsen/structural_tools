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
  const loadTypeDefaults = useUIStore((state) => state.loadTypeDefaults);
  const setLoadTypeDefaults = useUIStore((state) => state.setLoadTypeDefaults);
  const updateNodalLoad = useModelStore((state) => state.updateNodalLoad);
  const updateElementPointLoad = useModelStore((state) => state.updateElementPointLoad);
  const updateDistributedLoad = useModelStore((state) => state.updateDistributedLoad);
  const setLoadCreationMode = useUIStore((state) => state.setLoadCreationMode);
  const closeLoadDialog = useUIStore((state) => state.closeLoadDialog);

  // LOCAL STATE - completely independent until user confirms
  // Nodal load parameters
  const [fx, setFx] = useState<number | ''>(0);
  const [fy, setFy] = useState<number | ''>(0);
  const [mz, setMz] = useState<number | ''>(0);

  // Point load parameters
  const [distance, setDistance] = useState<number | ''>(0);
  const [pointDirection, setPointDirection] = useState<'Fx' | 'Fy' | 'Mz' | 'FX' | 'FY' | 'MZ'>('Fy');
  const [magnitude, setMagnitude] = useState<number | ''>(0);

  // Distributed load parameters
  const [distributedDirection, setDistributedDirection] = useState<'Fx' | 'Fy' | 'FX' | 'FY'>('Fy');
  const [w1Local, setW1Local] = useState<number | ''>(0);
  const [w2Local, setW2Local] = useState<number | ''>(0);
  const [x1, setX1] = useState<number | ''>(0);
  const [x2, setX2] = useState<number | ''>(0);
  const [w2IndependentlyEdited, setW2IndependentlyEdited] = useState(false);

  // Line load parameters
  const [lineLoadDirection, setLineLoadDirection] = useState<'Fx' | 'Fy' | 'FX' | 'FY'>('Fy');
  const [lineLoadW1Local, setLineLoadW1Local] = useState<number | ''>(0);
  const [lineLoadW2Local, setLineLoadW2Local] = useState<number | ''>(0);
  const [lineLoadW2IndependentlyEdited, setLineLoadW2IndependentlyEdited] = useState(false);

  // Common
  const [selectedCase, setSelectedCase] = useState<string | undefined>(activeLoadCase || undefined);
  const [error, setError] = useState<string>('');
  const [coordinateSystem, setCoordinateSystem] = useState<'global' | 'local'>('global');

  // Initialize form with editing data or defaults
  useEffect(() => {
    if (!isOpen) return;

    setError('');
    const caseToUse = activeLoadCase || undefined;
    setSelectedCase(caseToUse);

    if (editingLoad) {
      // Editing existing load - populate from load data
      const load = editingLoad.data;

      if (editingLoad.type === 'nodal') {
        setFx(load.fx ?? 0);
        setFy(load.fy ?? 0);
        setMz(load.mz ?? 0);
      } else if (editingLoad.type === 'point') {
        setDistance(load.distance ?? 0);
        setPointDirection(load.direction ?? 'Fy');
        setCoordinateSystem(load.direction && load.direction[0] === load.direction[0].toLowerCase() ? 'local' : 'global');
        setMagnitude(load.magnitude ?? 0);
      } else if (editingLoad.type === 'distributed') {
        setDistributedDirection(load.direction ?? 'Fy');
        setCoordinateSystem(load.direction && load.direction[0] === load.direction[0].toLowerCase() ? 'local' : 'global');
        setW1Local(load.w1 ?? 0);
        setW2Local(load.w2 ?? 0);
        setX1(load.x1 ?? 0);
        setX2(load.x2 ?? 0);
        setW2IndependentlyEdited(false);
      }
    } else {
      // Creating new load - populate from defaults if available
      const defaults = loadTypeDefaults[loadType as keyof typeof loadTypeDefaults];

      if (loadType === 'nodal' && defaults) {
        const nodalDefaults = defaults as any;
        setFx(nodalDefaults.fx ?? 0);
        setFy(nodalDefaults.fy ?? 0);
        setMz(nodalDefaults.mz ?? 0);
      } else if (loadType === 'point' && defaults) {
        const pointDefaults = defaults as any;
        setDistance(pointDefaults.distance ?? 0);
        setPointDirection(pointDefaults.direction ?? 'Fy');
        setCoordinateSystem(pointDefaults.direction && (pointDefaults.direction as string)[0] === (pointDefaults.direction as string)[0].toLowerCase() ? 'local' : 'global');
        setMagnitude(pointDefaults.magnitude ?? 0);
      } else if (loadType === 'distributed' && defaults) {
        const distDefaults = defaults as any;
        setDistributedDirection(distDefaults.direction ?? 'Fy');
        setCoordinateSystem(distDefaults.direction && (distDefaults.direction as string)[0] === (distDefaults.direction as string)[0].toLowerCase() ? 'local' : 'global');
        setW1Local(distDefaults.w1 ?? 0);
        setW2Local(distDefaults.w2 ?? 0);
        setX1(0);
        setX2(0);
        setW2IndependentlyEdited(false);
      } else if (loadType === 'lineLoad' && defaults) {
        const lineDefaults = defaults as any;
        setLineLoadDirection(lineDefaults.direction ?? 'Fy');
        setCoordinateSystem(lineDefaults.direction && (lineDefaults.direction as string)[0] === (lineDefaults.direction as string)[0].toLowerCase() ? 'local' : 'global');
        setLineLoadW1Local(lineDefaults.w1 ?? 0);
        setLineLoadW2Local(lineDefaults.w2 ?? 0);
        setLineLoadW2IndependentlyEdited(false);
      }
    }
  }, [isOpen, editingLoad, loadType, activeLoadCase, loadTypeDefaults]);

  const handleConfirm = () => {
    setError('');

    try {
      if (loadType === 'nodal') {
        const fxNum = typeof fx === 'number' ? fx : 0;
        const fyNum = typeof fy === 'number' ? fy : 0;
        const mzNum = typeof mz === 'number' ? mz : 0;

        // Save to defaults
        setLoadTypeDefaults('nodal', { fx: fxNum, fy: fyNum, mz: mzNum });

        if (editingLoad) {
          updateNodalLoad(editingLoad.index, {
            fx: fxNum,
            fy: fyNum,
            mz: mzNum,
            case: selectedCase,
          });
        } else {
          setLoadCreationMode('nodal', { fx: fxNum, fy: fyNum, mz: mzNum, case: selectedCase });
        }
        closeLoadDialog();
      } else if (loadType === 'point') {
        const distNum = typeof distance === 'number' ? distance : 0;
        const magNum = typeof magnitude === 'number' ? magnitude : 0;

        if (distNum < 0) {
          setError('Distance must be non-negative');
          return;
        }

        // Save to defaults
        setLoadTypeDefaults('point', { distance: distNum, direction: pointDirection, magnitude: magNum });

        if (editingLoad) {
          updateElementPointLoad(editingLoad.index, {
            distance: distNum,
            direction: pointDirection,
            magnitude: magNum,
            case: selectedCase,
          });
        } else {
          setLoadCreationMode('point', {
            distance: distNum,
            direction: pointDirection,
            magnitude: magNum,
            case: selectedCase,
          });
        }
        closeLoadDialog();
      } else if (loadType === 'distributed') {
        const w1Num = typeof w1Local === 'number' ? w1Local : 0;
        const w2Num = typeof w2Local === 'number' ? w2Local : 0;
        const x1Num = typeof x1 === 'number' ? x1 : 0;
        const x2Num = typeof x2 === 'number' ? x2 : 0;

        if (x1Num < 0 || x2Num < 0 || x1Num > x2Num) {
          setError('Invalid distribution range');
          return;
        }

        // Save to defaults
        setLoadTypeDefaults('distributed', {
          w1: w1Num,
          w2: w2Num,
          x1: x1Num,
          x2: x2Num,
          direction: distributedDirection,
        });

        if (editingLoad) {
          updateDistributedLoad(editingLoad.index, {
            direction: distributedDirection,
            w1: w1Num,
            w2: w2Num,
            x1: x1Num,
            x2: x2Num,
            case: selectedCase,
          });
        } else {
          setLoadCreationMode('distributed', {
            direction: distributedDirection,
            w1: w1Num,
            w2: w2Num,
            x1: x1Num,
            x2: x2Num,
            case: selectedCase,
          });
        }
        closeLoadDialog();
      } else if (loadType === 'lineLoad') {
        const w1Num = typeof lineLoadW1Local === 'number' ? lineLoadW1Local : 0;
        const w2Num = typeof lineLoadW2Local === 'number' ? lineLoadW2Local : 0;

        // Save to defaults
        setLoadTypeDefaults('lineLoad', { w1: w1Num, w2: w2Num, direction: lineLoadDirection });

        setLoadCreationMode('lineLoad', {
          direction: lineLoadDirection,
          w1: w1Num,
          w2: w2Num,
          case: selectedCase,
        });
        closeLoadDialog();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  // Helper to safely parse numbers from input without fallback
  const parseNum = (value: string): number | '' => {
    if (value === '') return '';
    // Allow minus sign to be typed
    if (value === '-') return 0; // Treat bare minus as 0 for now
    const num = parseFloat(value);
    return isNaN(num) ? '' : num;
  };

  // Handlers for distributed load w1/w2 with one-way tunnel
  const handleDistributedW1Change = (value: string) => {
    const numValue = parseNum(value);
    setW1Local(numValue);

    // One-way tunnel: if w2 hasn't been independently edited, make it match w1
    if (!w2IndependentlyEdited && numValue !== '') {
      setW2Local(numValue);
    }
  };

  const handleDistributedW2Change = (value: string) => {
    const numValue = parseNum(value);
    setW2Local(numValue);
    setW2IndependentlyEdited(true);
  };

  // Handlers for line load w1/w2 with one-way tunnel
  const handleLineLoadW1Change = (value: string) => {
    const numValue = parseNum(value);
    setLineLoadW1Local(numValue);

    // One-way tunnel: if w2 hasn't been independently edited, make it match w1
    if (!lineLoadW2IndependentlyEdited && numValue !== '') {
      setLineLoadW2Local(numValue);
    }
  };

  const handleLineLoadW2Change = (value: string) => {
    const numValue = parseNum(value);
    setLineLoadW2Local(numValue);
    setLineLoadW2IndependentlyEdited(true);
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
                value={fx === '' ? '' : fx}
                onChange={(e) => setFx(parseNum(e.target.value))}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Fy (kN)</label>
              <input
                type="number"
                value={fy === '' ? '' : fy}
                onChange={(e) => setFy(parseNum(e.target.value))}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Mz (kNm)</label>
              <input
                type="number"
                value={mz === '' ? '' : mz}
                onChange={(e) => setMz(parseNum(e.target.value))}
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
                value={distance === '' ? '' : distance}
                onChange={(e) => setDistance(parseNum(e.target.value))}
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
                value={magnitude === '' ? '' : magnitude}
                onChange={(e) => setMagnitude(parseNum(e.target.value))}
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
                value={w1Local === '' ? '' : w1Local}
                onChange={(e) => handleDistributedW1Change(e.target.value)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End intensity w2 (kN/m)</label>
              <input
                type="number"
                value={w2Local === '' ? '' : w2Local}
                onChange={(e) => handleDistributedW2Change(e.target.value)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>Start position x1 (m)</label>
              <input
                type="number"
                value={x1 === '' ? '' : x1}
                onChange={(e) => setX1(parseNum(e.target.value))}
                step="0.1"
                min="0"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End position x2 (m)</label>
              <input
                type="number"
                value={x2 === '' ? '' : x2}
                onChange={(e) => setX2(parseNum(e.target.value))}
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
                value={lineLoadW1Local === '' ? '' : lineLoadW1Local}
                onChange={(e) => handleLineLoadW1Change(e.target.value)}
                step="0.1"
                style={inputStyle}
              />
            </div>

            <div style={fieldGroupStyle}>
              <label style={labelStyle}>End intensity w2 (kN/m)</label>
              <input
                type="number"
                value={lineLoadW2Local === '' ? '' : lineLoadW2Local}
                onChange={(e) => handleLineLoadW2Change(e.target.value)}
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
