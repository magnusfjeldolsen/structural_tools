/**
 * Toolbar Component
 * Main toolbar with tool selection, actions, and visualization controls
 *
 * Tools:
 * - Select, Draw Node, Draw Element, Add Load, Delete
 *
 * Actions:
 * - Load Example, Run Analysis, Clear Model
 *
 * Visualization:
 * - Displaced Shape, Moment/Shear/Axial Diagrams
 */

import { useModelStore, useUIStore } from '../store';

export function Toolbar() {
  const activeTab = useUIStore((state) => state.activeTab);
  const activeTool = useUIStore((state) => state.activeTool);
  const setTool = useUIStore((state) => state.setTool);
  const openLoadDialog = useUIStore((state) => state.openLoadDialog);

  const showDisplacedShape = useUIStore((state) => state.showDisplacedShape);
  const showMomentDiagram = useUIStore((state) => state.showMomentDiagram);
  const showShearDiagram = useUIStore((state) => state.showShearDiagram);
  const showAxialDiagram = useUIStore((state) => state.showAxialDiagram);
  const toggleDisplacedShape = useUIStore((state) => state.toggleDisplacedShape);
  const toggleMomentDiagram = useUIStore((state) => state.toggleMomentDiagram);
  const toggleShearDiagram = useUIStore((state) => state.toggleShearDiagram);
  const toggleAxialDiagram = useUIStore((state) => state.toggleAxialDiagram);

  const loadExample = useModelStore((state) => state.loadExample);
  const runAnalysis = useModelStore((state) => state.runAnalysis);
  const clearModel = useModelStore((state) => state.clearModel);
  const isAnalyzing = useModelStore((state) => state.isAnalyzing);
  const solver = useModelStore((state) => state.solver);
  const analysisResults = useModelStore((state) => state.analysisResults);

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

  const toggleButtonStyle = (active: boolean) => ({
    padding: '6px 12px',
    margin: '0 4px',
    border: '1px solid #ccc',
    backgroundColor: active ? '#9C27B0' : '#fff',
    color: active ? '#fff' : '#000',
    cursor: analysisResults ? 'pointer' : 'not-allowed',
    borderRadius: '4px',
    fontSize: '13px',
    opacity: analysisResults ? 1 : 0.5,
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
        flexDirection: 'column',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ccc',
      }}
    >
      {/* Top Row: Tools and Actions */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          padding: '12px',
          gap: '8px',
        }}
      >
        {/* Tool Group - Changes based on active tab */}
        <div style={{ display: 'flex', gap: '4px', marginRight: '16px' }}>
          {/* Structure Tab Tools - Creation tools only (CAD tools in left panel) */}
          {activeTab === 'structure' && (
            <>
              <button style={toolButtonStyle('draw-node')} onClick={() => setTool('draw-node')}>
                Draw Node
              </button>
              <button style={toolButtonStyle('draw-element')} onClick={() => setTool('draw-element')}>
                Draw Element
              </button>

              {/* Support Type Buttons */}
              <div style={{ display: 'flex', gap: '2px', marginLeft: '8px', padding: '0 8px', borderLeft: '1px solid #ccc' }}>
                <button
                  style={toolButtonStyle('support-fixed')}
                  onClick={() => setTool('support-fixed')}
                  title="Fixed Support (prevents translation and rotation)"
                >
                  ✕
                </button>
                <button
                  style={toolButtonStyle('support-pinned')}
                  onClick={() => setTool('support-pinned')}
                  title="Pinned Support (prevents translation)"
                >
                  ⭕
                </button>
                <button
                  style={toolButtonStyle('support-roller-x')}
                  onClick={() => setTool('support-roller-x')}
                  title="Roller-X (prevents Y translation, allows X movement)"
                >
                  ⭕━
                </button>
                <button
                  style={toolButtonStyle('support-roller-y')}
                  onClick={() => setTool('support-roller-y')}
                  title="Roller-Y (prevents X translation, allows Y movement)"
                >
                  ⭕┃
                </button>
              </div>
            </>
          )}

          {/* Loads Tab Tools */}
          {activeTab === 'loads' && (
            <>
              <button style={toolButtonStyle('add-load')} onClick={() => openLoadDialog('nodal')}>
                Nodal Load
              </button>
              <button style={toolButtonStyle('add-load')} onClick={() => openLoadDialog('point')}>
                Point Load
              </button>
              <button style={toolButtonStyle('add-load')} onClick={() => openLoadDialog('lineLoad')}>
                Line Load
              </button>
              <button style={toolButtonStyle('add-load')} onClick={() => openLoadDialog('distributed')}>
                Distributed Load
              </button>
              <button style={toolButtonStyle('delete')} onClick={() => setTool('delete')}>
                Delete
              </button>
            </>
          )}

          {/* Analysis Tab Tools */}
          {activeTab === 'analysis' && (
            <>
              <button style={toolButtonStyle('select')} onClick={() => setTool('select')}>
                Select
              </button>
            </>
          )}
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

        {/* Action Group - Tab-specific actions */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {activeTab === 'structure' && (
            <>
              <button style={actionButtonStyle} onClick={loadExample}>
                Load Example
              </button>
              <button
                style={{ ...actionButtonStyle, backgroundColor: '#f44336' }}
                onClick={clearModel}
              >
                Clear Model
              </button>
            </>
          )}

          {activeTab === 'analysis' && (
            <button
              style={!solver || isAnalyzing ? disabledButtonStyle : actionButtonStyle}
              onClick={handleRunAnalysis}
              disabled={!solver || isAnalyzing}
            >
              {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
            </button>
          )}
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

      {/* Bottom Row: Visualization Controls - Analysis Tab Only */}
      {activeTab === 'analysis' && analysisResults && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '8px 12px',
            backgroundColor: '#e8e8e8',
            borderTop: '1px solid #ccc',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 'bold', marginRight: '8px' }}>
            Visualize:
          </span>
          <button
            style={toggleButtonStyle(showDisplacedShape)}
            onClick={toggleDisplacedShape}
            disabled={!analysisResults}
          >
            {showDisplacedShape ? '✓' : ''} Displaced Shape
          </button>
          <button
            style={toggleButtonStyle(showMomentDiagram)}
            onClick={toggleMomentDiagram}
            disabled={!analysisResults}
          >
            {showMomentDiagram ? '✓' : ''} Moment
          </button>
          <button
            style={toggleButtonStyle(showShearDiagram)}
            onClick={toggleShearDiagram}
            disabled={!analysisResults}
          >
            {showShearDiagram ? '✓' : ''} Shear
          </button>
          <button
            style={toggleButtonStyle(showAxialDiagram)}
            onClick={toggleAxialDiagram}
            disabled={!analysisResults}
          >
            {showAxialDiagram ? '✓' : ''} Axial
          </button>
        </div>
      )}
    </div>
  );
}
