/**
 * Floating AI Assistant panel.
 *
 * Plan §5.7: floating, draggable; collapsed = pill button anchored top-right
 * of the canvas area; expanded ~420×600px. position: fixed, mounted at App
 * root (does not consume layout space). z-index above canvas, below
 * LoadInputDialog (zIndex 2100 used by AISettingsDialog) so dialogs win.
 *
 * Phase 1 = text only:
 *   - header: model badge ("provider · model"), settings cog, minimize/close
 *   - transcript: streamed user/assistant turns + inline error cards
 *   - composer: textarea, send/stop button, manual paste textarea (only
 *     when active provider is 'manual' and a request is awaiting reply)
 *
 * Drag-and-drop and PDF / image attachments arrive in Phase 3 / Phase 4.
 */

import { useEffect, useRef, useState } from 'react';
import { useAIStore } from '../ai/store/useAIStore';
import { getProvider } from '../ai/providers';
import {
  peekManualPending,
  submitManualResponse,
  subscribeManualPending,
} from '../ai/providers/manual';
import { AISettingsDialog } from './AISettingsDialog';
import { theme } from '../styles/theme';

const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 600;

export function AIPanel() {
  const panelOpen = useAIStore((s) => s.panelOpen);
  const setPanelOpen = useAIStore((s) => s.setPanelOpen);
  const settingsOpen = useAIStore((s) => s.settingsOpen);
  const setSettingsOpen = useAIStore((s) => s.setSettingsOpen);
  const transcript = useAIStore((s) => s.transcript);
  const status = useAIStore((s) => s.status);
  const lastError = useAIStore((s) => s.lastError);
  const inFlight = useAIStore((s) => s.inFlight);
  const send = useAIStore((s) => s.send);
  const abort = useAIStore((s) => s.abort);
  const activeProviderId = useAIStore((s) => s.activeProviderId);
  const selectedModel = useAIStore((s) => s.selectedModels[activeProviderId]);

  const provider = getProvider(activeProviderId);

  const [draft, setDraft] = useState('');
  const [manualResponseDraft, setManualResponseDraft] = useState('');
  // Re-render the composer area when manual-pending state changes (a chat
  // started on the manual provider, or a paste was submitted).
  const [, setManualPendingTick] = useState(0);

  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return subscribeManualPending(() => {
      setManualPendingTick((n) => n + 1);
    });
  }, []);

  // Auto-scroll transcript to the bottom on new entries / streamed deltas.
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  const isStreaming = status === 'streaming' || !!inFlight;
  const manualPending = activeProviderId === 'manual' ? peekManualPending() : null;

  const handleSend = (): void => {
    if (!draft.trim()) return;
    if (isStreaming && !manualPending) return;
    void send(draft);
    setDraft('');
  };

  const handleStop = (): void => {
    abort();
  };

  const handleManualPasteSubmit = (): void => {
    if (!manualPending) return;
    const ok = submitManualResponse(manualPending.id, manualResponseDraft);
    if (ok) setManualResponseDraft('');
  };

  if (!panelOpen) {
    // Collapsed pill — Phase 1 anchors top-right of viewport. Phase 6 will
    // make this draggable.
    return (
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        style={{
          position: 'fixed',
          top: '70px',
          right: '14px',
          zIndex: 2050,
          padding: '8px 14px',
          background: theme.colors.primary,
          color: theme.colors.textWhite,
          border: 'none',
          borderRadius: '999px',
          fontFamily: 'Arial, sans-serif',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
          cursor: 'pointer',
        }}
        aria-label="Open AI assistant"
      >
        AI
      </button>
    );
  }

  return (
    <>
      <div
        role="dialog"
        aria-label="AI Assistant"
        style={{
          position: 'fixed',
          top: '70px',
          right: '14px',
          width: `${PANEL_WIDTH}px`,
          height: `${PANEL_HEIGHT}px`,
          maxHeight: 'calc(100vh - 80px)',
          zIndex: 2050,
          background: theme.colors.bgWhite,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderBottom: `1px solid ${theme.colors.border}`,
            background: theme.colors.bgLight,
          }}
        >
          <strong style={{ fontSize: '0.9rem' }}>AI Assistant</strong>
          <span
            style={{
              flex: 1,
              fontSize: '0.78rem',
              color: theme.colors.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={`${provider.displayName} · ${selectedModel}`}
          >
            {provider.displayName} · {selectedModel}
          </span>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="AI settings"
            title="AI settings"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              color: theme.colors.textSecondary,
            }}
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="Close AI assistant"
            title="Close"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              color: theme.colors.textSecondary,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Transcript */}
        <div
          ref={transcriptRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            background: '#fafafa',
          }}
          data-testid="ai-transcript"
        >
          {transcript.length === 0 && !lastError && (
            <div
              style={{
                color: theme.colors.textSecondary,
                fontSize: '0.85rem',
                fontStyle: 'italic',
              }}
            >
              Describe the model you want to build, or ask a question. Phase 1
              of this feature is a text-only chat — image / PDF input arrives
              in later updates.
            </div>
          )}
          {transcript.map((entry) => {
            const isUser = entry.role === 'user';
            const isError = entry.role === 'error';
            return (
              <div
                key={entry.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: isError
                    ? '#fdecea'
                    : isUser
                    ? theme.colors.primary
                    : theme.colors.bgWhite,
                  color: isError
                    ? theme.colors.error
                    : isUser
                    ? theme.colors.textWhite
                    : theme.colors.textPrimary,
                  border: isError
                    ? `1px solid ${theme.colors.error}`
                    : isUser
                    ? 'none'
                    : `1px solid ${theme.colors.border}`,
                  borderRadius: '8px',
                  padding: '8px 10px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: '0.9rem',
                  lineHeight: 1.4,
                }}
              >
                {entry.text || (entry.streaming ? '…' : '')}
                {entry.aborted && (
                  <span style={{ fontStyle: 'italic', opacity: 0.7 }}> [stopped]</span>
                )}
                {entry.streaming && entry.text && (
                  <span style={{ opacity: 0.6 }}>▌</span>
                )}
              </div>
            );
          })}
          {lastError && transcript.length === 0 && (
            <div
              role="alert"
              style={{
                background: '#fdecea',
                color: theme.colors.error,
                border: `1px solid ${theme.colors.error}`,
                borderRadius: '6px',
                padding: '8px 10px',
                fontSize: '0.85rem',
              }}
            >
              {lastError}
            </div>
          )}
        </div>

        {/* Manual-paste area: visible only when the active provider is
            'manual' AND a request is awaiting a paste. */}
        {manualPending && (
          <div
            style={{
              borderTop: `1px solid ${theme.colors.border}`,
              padding: '10px 12px',
              background: '#fff8e1',
            }}
            data-testid="ai-manual-paste"
          >
            <div style={{ fontSize: '0.78rem', marginBottom: '6px', color: theme.colors.textSecondary }}>
              Manual provider — paste the LLM's reply below and click Submit.
            </div>
            <textarea
              value={manualResponseDraft}
              onChange={(e) => setManualResponseDraft(e.target.value)}
              placeholder="Paste the model's text response here..."
              rows={4}
              aria-label="Manual provider paste area"
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleManualPasteSubmit}
                disabled={!manualResponseDraft.trim()}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  background: theme.colors.primary,
                  color: theme.colors.textWhite,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: manualResponseDraft.trim() ? 'pointer' : 'not-allowed',
                  opacity: manualResponseDraft.trim() ? 1 : 0.6,
                }}
              >
                Submit manual reply
              </button>
              <button
                type="button"
                onClick={handleStop}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  background: theme.colors.bgWhite,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Composer */}
        <div
          style={{
            borderTop: `1px solid ${theme.colors.border}`,
            padding: '10px 12px',
            background: theme.colors.bgWhite,
          }}
        >
          {lastError && transcript.length > 0 && (
            <div
              role="alert"
              style={{
                background: '#fdecea',
                color: theme.colors.error,
                border: `1px solid ${theme.colors.error}`,
                borderRadius: '4px',
                padding: '6px 8px',
                fontSize: '0.8rem',
                marginBottom: '8px',
              }}
            >
              {lastError}
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isStreaming && !manualPending}
            placeholder="Describe the model you want to build, or ask a question."
            rows={3}
            aria-label="AI prompt"
            style={{
              width: '100%',
              padding: '8px 10px',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center' }}>
            {!isStreaming && (
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim()}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.9rem',
                  background: theme.colors.primary,
                  color: theme.colors.textWhite,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: draft.trim() ? 'pointer' : 'not-allowed',
                  opacity: draft.trim() ? 1 : 0.6,
                }}
              >
                Send
              </button>
            )}
            {isStreaming && !manualPending && (
              <button
                type="button"
                onClick={handleStop}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.9rem',
                  background: theme.colors.error,
                  color: theme.colors.textWhite,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
            )}
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '0.75rem',
                color: theme.colors.textLight,
              }}
            >
              Enter sends · Shift+Enter newline
            </span>
          </div>
        </div>
      </div>

      <AISettingsDialog isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
