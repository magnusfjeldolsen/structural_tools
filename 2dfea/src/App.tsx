/**
 * Main App Component
 *
 * Responsibilities:
 * - Initialize solver on mount
 * - Provide main layout structure
 * - Route between views (if needed)
 */

import { useEffect, useState } from 'react';
import { useModelStore } from './store';

export default function App() {
  const [initStatus, setInitStatus] = useState<'pending' | 'loading' | 'ready' | 'error'>('pending');
  const [initError, setInitError] = useState<string | null>(null);

  const initializeSolver = useModelStore((state) => state.initializeSolver);
  const solver = useModelStore((state) => state.solver);
  const loadExample = useModelStore((state) => state.loadExample);

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
        fontFamily: 'monospace',
        background: '#1a1a1a',
        color: '#00ff00',
      }}>
        <h1>2D Frame Analysis Editor</h1>
        <p>Loading PyNite solver...</p>
        <p style={{ fontSize: '0.8em', color: '#888' }}>
          (This may take 30-60 seconds on first load)
        </p>
        <div style={{
          marginTop: '20px',
          width: '200px',
          height: '4px',
          background: '#333',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            background: '#00ff00',
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
        fontFamily: 'monospace',
        background: '#1a1a1a',
        color: '#ff4444',
      }}>
        <h1>Initialization Failed</h1>
        <p>{initError}</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: '#00ff00',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontFamily: 'monospace',
            fontWeight: 'bold',
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Main app UI
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      fontFamily: 'monospace',
      background: '#1a1a1a',
      color: '#00ff00',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px',
        background: '#2a2a2a',
        borderBottom: '2px solid #00ff00',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5em' }}>2D Frame Analysis</h1>
        <div style={{ fontSize: '0.8em', color: '#888' }}>
          {solver?.initialized ? '✓ Solver Ready' : '⚠ Solver Not Ready'}
        </div>
      </div>

      {/* Main content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <h2>Step 3 Complete: Store Integration ✓</h2>
        <p>Solver initialized and ready to use!</p>

        <div style={{
          display: 'flex',
          gap: '10px',
        }}>
          <button
            onClick={loadExample}
            style={{
              padding: '10px 20px',
              background: '#00ff00',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold',
            }}
          >
            Load Example
          </button>

          <button
            onClick={async () => {
              const runAnalysis = useModelStore.getState().runAnalysis;
              try {
                await runAnalysis();
                alert('Analysis complete! Check console for results.');
              } catch (error) {
                alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            }}
            style={{
              padding: '10px 20px',
              background: '#00ff00',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 'bold',
            }}
          >
            Run Analysis
          </button>
        </div>

        <div style={{
          marginTop: '20px',
          padding: '20px',
          background: '#2a2a2a',
          border: '1px solid #00ff00',
          borderRadius: '4px',
          maxWidth: '600px',
        }}>
          <h3 style={{ marginTop: 0 }}>Next: Step 4 - Basic UI</h3>
          <ul style={{ textAlign: 'left', lineHeight: '1.6' }}>
            <li>Canvas view with Konva</li>
            <li>Toolbar with tools</li>
            <li>Results panel</li>
            <li>Interactive node/element editing</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
