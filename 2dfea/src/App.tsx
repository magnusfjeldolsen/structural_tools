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
import { CanvasView, Toolbar, ResultsPanel, LoadCasePanel } from './components';
import { CommandInput } from './components/CommandInput';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

export default function App() {
  const [initStatus, setInitStatus] = useState<'pending' | 'loading' | 'ready' | 'error'>('pending');
  const [initError, setInitError] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<'results' | 'loadcases'>('results');

  const initializeSolver = useModelStore((state) => state.initializeSolver);

  // Initialize keyboard shortcuts
  useKeyboardShortcuts();

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

  // Main app UI - 2 column layout with Toolbar on top
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Toolbar at top */}
      <Toolbar />

      {/* Main content: Canvas (left) + Right Panel (right) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
      }}>
        {/* Canvas View - takes 70% of width */}
        <div style={{ flex: 7, overflow: 'hidden' }}>
          <CanvasView width={window.innerWidth * 0.7} height={window.innerHeight - 60} />
        </div>

        {/* Right Panel with Tabs - takes 30% of width */}
        <div style={{ flex: 3, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {/* Tab Bar */}
          <div style={{
            display: 'flex',
            backgroundColor: '#e0e0e0',
            borderBottom: '2px solid #ccc',
          }}>
            <button
              onClick={() => setRightPanelTab('results')}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                backgroundColor: rightPanelTab === 'results' ? '#fff' : '#e0e0e0',
                borderBottom: rightPanelTab === 'results' ? '3px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontWeight: rightPanelTab === 'results' ? 'bold' : 'normal',
                fontSize: '14px',
              }}
            >
              Results
            </button>
            <button
              onClick={() => setRightPanelTab('loadcases')}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                backgroundColor: rightPanelTab === 'loadcases' ? '#fff' : '#e0e0e0',
                borderBottom: rightPanelTab === 'loadcases' ? '3px solid #2196F3' : 'none',
                cursor: 'pointer',
                fontWeight: rightPanelTab === 'loadcases' ? 'bold' : 'normal',
                fontSize: '14px',
              }}
            >
              Load Cases
            </button>
          </div>

          {/* Panel Content */}
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {rightPanelTab === 'results' ? <ResultsPanel /> : <LoadCasePanel />}
          </div>
        </div>
      </div>

      {/* Command Input Modal */}
      <CommandInput />
    </div>
  );
}
