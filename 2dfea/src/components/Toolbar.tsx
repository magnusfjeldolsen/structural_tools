/**
 * Toolbar Component
 * Main toolbar with tool selection and actions
 *
 * Tools:
 * - Select: Select and manipulate objects
 * - Draw Node: Add nodes to the model
 * - Draw Element: Connect nodes with beams
 * - Add Load: Apply forces and moments
 * - Delete: Remove objects
 *
 * Actions:
 * - Load Example: Load cantilever test model
 * - Run Analysis: Execute structural analysis
 * - Clear Model: Reset everything
 */

import { useModelStore, useUIStore } from '../store';

export function Toolbar() {
  const activeTool = useUIStore((state) => state.activeTool);
  const setTool = useUIStore((state) => state.setTool);

  const loadExample = useModelStore((state) => state.loadExample);
  const runAnalysis = useModelStore((state) => state.runAnalysis);
  const clearModel = useModelStore((state) => state.clearModel);
  const isAnalyzing = useModelStore((state) => state.isAnalyzing);
  const solver = useModelStore((state) => state.solver);

  const handleRunAnalysis = async () => {
    try {
      await runAnalysis();
    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const toolButtonStyle = (tool: string) => ({
    padding: '8px 16px',
    margin: '0 4px',
    border: '1px solid #ccc',
    backgroundColor: activeTool === tool ? '#2196F3' : '#fff',
    color: activeTool === tool ? '#fff' : '#000',
    cursor: 'pointer',
    borderRadius: '4px',
    fontWeight: activeTool === tool ? 'bold' : 'normal',
  });

  const actionButtonStyle = {
    padding: '8px 16px',
    margin: '0 4px',
    border: '1px solid #ccc',
    backgroundColor: '#4CAF50',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '4px',
    fontWeight: 'bold',
  };

  const disabledButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        padding: '12px',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ccc',
        gap: '8px',
      }}
    >
      {/* Tool Group */}
      <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
        <button style={toolButtonStyle('select')} onClick={() => setTool('select')}>
          Select
        </button>
        <button style={toolButtonStyle('draw-node')} onClick={() => setTool('draw-node')}>
          Draw Node
        </button>
        <button style={toolButtonStyle('draw-element')} onClick={() => setTool('draw-element')}>
          Draw Element
        </button>
        <button style={toolButtonStyle('add-load')} onClick={() => setTool('add-load')}>
          Add Load
        </button>
        <button style={toolButtonStyle('delete')} onClick={() => setTool('delete')}>
          Delete
        </button>
      </div>

      {/* Divider */}
      <div
        style={{
          width: '1px',
          height: '32px',
          backgroundColor: '#ccc',
          margin: '0 8px',
        }}
      />

      {/* Action Group */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button style={actionButtonStyle} onClick={loadExample}>
          Load Example
        </button>
        <button
          style={!solver || isAnalyzing ? disabledButtonStyle : actionButtonStyle}
          onClick={handleRunAnalysis}
          disabled={!solver || isAnalyzing}
        >
          {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
        </button>
        <button
          style={{ ...actionButtonStyle, backgroundColor: '#f44336' }}
          onClick={clearModel}
        >
          Clear Model
        </button>
      </div>

      {/* Status Indicator */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
        {!solver && (
          <span style={{ color: '#ff9800', fontWeight: 'bold' }}>
            ⚠️ Solver Initializing...
          </span>
        )}
        {solver && !isAnalyzing && (
          <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>
            ✓ Solver Ready
          </span>
        )}
        {isAnalyzing && (
          <span style={{ color: '#2196F3', fontWeight: 'bold' }}>
            ⏳ Analyzing...
          </span>
        )}
      </div>
    </div>
  );
}
