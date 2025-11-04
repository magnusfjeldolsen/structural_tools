/**
 * Main App Component
 *
 * Responsibilities:
 * - Initialize solver on mount
 * - Provide main layout structure
 * - Render Canvas, Toolbar, Results Panel, and Load Case Manager
 */

import { useEffect, useState } from 'react';
import { useModelStore } from './store';
import { useUIStore } from './store/useUIStore';
import { CanvasView, Toolbar, ResultsPanel } from './components';
import { TabBar } from './components/TabBar';
import { LeftCADPanel } from './components/LeftCADPanel';
import { CommandInput } from './components/CommandInput';
import { CoordinateDisplay } from './components/CoordinateDisplay';
import { SnapBar } from './components/SnapBar';
import { LoadInputDialog } from './components/LoadInputDialog';
import { LoadContextMenu } from './components/LoadContextMenu';
import { NodesTab } from './components/NodesTab';
import { ElementsTab } from './components/ElementsTab';
import { LoadsTabToolbar } from './components/LoadsTabToolbar';
import { LoadCreationPanel } from './components/LoadCreationPanel';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { theme } from './styles/theme';

export default function App() {
  const [initStatus, setInitStatus] = useState<'pending' | 'loading' | 'ready' | 'error'>('pending');
  const [initError, setInitError] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'nodes' | 'elements' | 'results'>('nodes');
  const [rightPanelWidth, setRightPanelWidth] = useState(30); // Percentage of viewport width
  const [isResizingPanel, setIsResizingPanel] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [contextMenuLoad, setContextMenuLoad] = useState<{ type: 'nodal' | 'distributed' | 'elementPoint'; index: number } | null>(null);

  const initializeSolver = useModelStore((state) => state.initializeSolver);
  const loads = useModelStore((state) => state.loads);
  const activeTab = useUIStore((state) => state.activeTab);
  const loadDialogOpen = useUIStore((state) => state.loadDialogOpen);
  const loadDialogType = useUIStore((state) => state.loadDialogType);
  const editingLoadData = useUIStore((state) => state.editingLoadData);
  const closeLoadDialog = useUIStore((state) => state.closeLoadDialog);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

  // Listen for load context menu events from canvas
  useEffect(() => {
    const handleShowLoadContextMenu = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { position, loadType, loadIndex } = customEvent.detail;
      setContextMenuPosition(position);
      setContextMenuLoad({ type: loadType, index: loadIndex });
      setContextMenuOpen(true);
    };

    window.addEventListener('showLoadContextMenu', handleShowLoadContextMenu);
    return () => window.removeEventListener('showLoadContextMenu', handleShowLoadContextMenu);
  }, []);

  // Handle right panel resize
  useEffect(() => {
    if (!isResizingPanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      const viewportWidth = window.innerWidth;
      const newWidth = ((viewportWidth - e.clientX) / viewportWidth) * 100;
      // Constrain width between 15% and 80%
      if (newWidth >= 15 && newWidth <= 80) {
        setRightPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingPanel(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingPanel]);

  // Initialize solver on mount
  useEffect(() => {
    const init = async () => {
      setInitStatus('loading');
      try {
        await initializeSolver();
        setInitStatus('ready');
        console.log('[App] Solver ready');
      } catch (error) {
        console.error('[App] Solver initialization failed:', error);
        setInitError(error instanceof Error ? error.message : 'Unknown error');
        setInitStatus('error');
      }
    };

    init();
  }, [initializeSolver]);

  // Render initialization status
  if (initStatus === 'loading') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'Arial, sans-serif',
      }}>
        <h1>2D Frame Analysis Editor</h1>
        <p>Loading PyNite solver...</p>
        <p style={{ fontSize: '0.9em', color: '#666' }}>
          (This may take 30-60 seconds on first load)
        </p>
        <div style={{
          marginTop: '20px',
          width: '300px',
          height: '4px',
          background: '#e0e0e0',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: '#2196F3',
            animation: 'loading 2s ease-in-out infinite',
          }} />
        </div>
        <style>{`
          @keyframes loading {
            0%, 100% { width: 0%; margin-left: 0%; }
            50% { width: 100%; margin-left: 0%; }
          }
        `}</style>
      </div>
    );
  }

  if (initStatus === 'error') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'Arial, sans-serif',
      }}>
        <h1>Initialization Failed</h1>
        <p style={{ color: '#f44336' }}>{initError}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Main app UI - 2 column layout with TabBar and Toolbar on top
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Tab Navigation */}
      <TabBar />

      {/* Toolbar with tab-specific tools */}
      <Toolbar />

      {/* Main content: Canvas (left) + Right Panel (right) with resizable divider */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Canvas View - dynamic width based on right panel size */}
        <div style={{ width: `${100 - rightPanelWidth}%`, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* Loads Tab Toolbar - visible only in Loads tab */}
          {activeTab === 'loads' && (
            <>
              <LoadsTabToolbar />
              <LoadCreationPanel />
            </>
          )}

          {/* Left CAD Panel - visible in Structure and Loads tabs */}
          {(activeTab === 'structure' || activeTab === 'loads') && <LeftCADPanel />}

          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            <CanvasView width={window.innerWidth * ((100 - rightPanelWidth) / 100)} height={window.innerHeight - 60} />

            {/* Coordinate Display - bottom left of canvas */}
            <CoordinateDisplay />

            {/* Snap Bar - bottom right of canvas */}
            <SnapBar />
          </div>
        </div>

        {/* Resizable divider */}
        <div
          onMouseDown={() => setIsResizingPanel(true)}
          style={{
            width: '4px',
            backgroundColor: theme.colors.border,
            cursor: 'col-resize',
            userSelect: 'none',
            transition: isResizingPanel ? 'none' : 'background-color 0.2s',
          }}
        />

        {/* Right Panel with Tabs - dynamic width */}
        <div style={{ width: `${rightPanelWidth}%`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tab Bar - Nodes, Elements, Results */}
          <div style={{
            display: 'flex',
            backgroundColor: theme.colors.bgLight,
            borderBottom: `2px solid ${theme.colors.border}`,
            overflowX: 'auto',
          }}>
            {(['nodes', 'elements', 'results'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setRightPanelTab(tab)}
                style={{
                  padding: '12px 16px',
                  border: 'none',
                  backgroundColor: rightPanelTab === tab ? theme.colors.bgWhite : theme.colors.bgLight,
                  borderBottom: rightPanelTab === tab ? `3px solid ${theme.colors.primary}` : 'none',
                  cursor: 'pointer',
                  fontWeight: rightPanelTab === tab ? 'bold' : 'normal',
                  fontSize: '14px',
                  color: rightPanelTab === tab ? theme.colors.primary : theme.colors.textPrimary,
                  whiteSpace: 'nowrap',
                  flex: 'none',
                }}
              >
                {tab === 'nodes' && 'Nodes'}
                {tab === 'elements' && 'Elements'}
                {tab === 'results' && 'Results'}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {rightPanelTab === 'nodes' && <NodesTab />}
            {rightPanelTab === 'elements' && <ElementsTab />}
            {rightPanelTab === 'results' && <ResultsPanel />}
          </div>
        </div>
      </div>

      {/* Load Input Dialog */}
      <LoadInputDialog
        isOpen={loadDialogOpen}
        onClose={closeLoadDialog}
        loadType={loadDialogType}
        editingLoad={editingLoadData ? {
          type: editingLoadData.type,
          index: editingLoadData.index,
          data: editingLoadData.type === 'nodal'
            ? loads.nodal[editingLoadData.index]
            : editingLoadData.type === 'point'
            ? loads.elementPoint[editingLoadData.index]
            : loads.distributed[editingLoadData.index]
        } : null}
      />

      {/* Load Context Menu */}
      <LoadContextMenu
        isOpen={contextMenuOpen}
        position={contextMenuPosition}
        loadType={contextMenuLoad?.type || null}
        loadIndex={contextMenuLoad?.index !== undefined ? contextMenuLoad.index : null}
        onClose={() => {
          setContextMenuOpen(false);
          setContextMenuPosition(null);
          setContextMenuLoad(null);
        }}
      />

      {/* Command Input Modal */}
      <CommandInput />
    </div>
  );
}
