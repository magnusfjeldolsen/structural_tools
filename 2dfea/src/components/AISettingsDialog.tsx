/**
 * AI Settings Dialog.
 *
 * Per plan §5.6 / §5.6.5 / §5.7. Render order, security warnings, and
 * curated model lists are sourced from the provider registry — there is no
 * hand-rolled copy in this file. The §5.6 warning text is rendered verbatim
 * because it is approved user-facing copy.
 *
 * Phase 1 wires:
 *   - provider dropdown
 *   - per-provider warning callout (verbatim from provider.securityWarning)
 *   - API key field (per-provider, scoped to localStorage key)
 *   - model picker — curated dropdown + 'Other...' free-text fallback
 *   - custom-openai endpoint URL field (only when that provider is active)
 *   - 'Clear token' / 'Clear conversation' buttons
 *   - global notice at the top per §5.6
 */

import { useEffect, useState } from 'react';
import { useAIStore } from '../ai/store/useAIStore';
import { PROVIDERS, getProvider } from '../ai/providers';
import type { ProviderId } from '../ai/providers/types';
import { CUSTOM_OPENAI_PLACEHOLDER_URL } from '../ai/providers/customOpenAI';
import { theme } from '../styles/theme';

const OTHER_MODEL_SENTINEL = '__other__';

const GLOBAL_NOTICE = `Tokens never leave this browser except to the provider you select. This app is a static GitHub Pages site — there is no backend that ever sees your key. Trade-off: a static site cannot keep keys secret. Treat browser-stored API keys like browser-stored passwords.`;

const CUSTOM_ENDPOINT_HINT_LINES: ReadonlyArray<string> = [
  'Groq free tier:        llama-3.3-70b-versatile, llama-3.1-8b-instant',
  'OpenRouter:            google/gemini-2.0-flash-001, meta-llama/llama-3.3-70b-instruct',
  'Cerebras:              gpt-oss-120b, llama-3.3-70b',
  'Local (Ollama / proxy): qwen2.5:7b, llama3.2:3b',
];

interface AISettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Render `text` with **bold** and `code` markup honoured. The §5.6 warning
 * strings include both — paraphrasing is forbidden, so we parse minimally
 * here rather than copy-edit them into HTML in the source.
 */
function renderMarkdownInline(text: string): React.ReactNode {
  // Split on bold (**...**) and inline code (`...`) — both are non-overlapping
  // in the §5.6 strings. Order matters: process bold first, then code, by
  // running two passes on a node array.
  type Node = string | { kind: 'bold' | 'code'; text: string };
  let nodes: Node[] = [text];

  const splitOn = (regex: RegExp, kind: 'bold' | 'code'): void => {
    const next: Node[] = [];
    for (const node of nodes) {
      if (typeof node !== 'string') {
        next.push(node);
        continue;
      }
      let lastIndex = 0;
      regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(node))) {
        if (m.index > lastIndex) next.push(node.slice(lastIndex, m.index));
        next.push({ kind, text: m[1] });
        lastIndex = m.index + m[0].length;
      }
      if (lastIndex < node.length) next.push(node.slice(lastIndex));
    }
    nodes = next;
  };

  splitOn(/\*\*([^*]+)\*\*/g, 'bold');
  splitOn(/`([^`]+)`/g, 'code');

  return nodes.map((n, i) => {
    if (typeof n === 'string') return <span key={i}>{n}</span>;
    if (n.kind === 'bold') return <strong key={i}>{n.text}</strong>;
    return (
      <code
        key={i}
        style={{
          fontFamily: 'monospace',
          fontSize: '0.9em',
          background: 'rgba(0,0,0,0.06)',
          padding: '0 4px',
          borderRadius: '3px',
        }}
      >
        {n.text}
      </code>
    );
  });
}

function renderWarningParagraphs(text: string): React.ReactNode {
  // Split on blank lines so the §5.6 multi-paragraph warnings (GitHub
  // Models has two paragraphs for free-tier limits) render with vertical
  // spacing instead of as one wall of text.
  const paragraphs = text.split(/\n\s*\n/);
  return paragraphs.map((p, i) => (
    <p key={i} style={{ margin: '0 0 8px 0', lineHeight: 1.45 }}>
      {renderMarkdownInline(p)}
    </p>
  ));
}

export function AISettingsDialog({ isOpen, onClose }: AISettingsDialogProps) {
  const activeProviderId = useAIStore((s) => s.activeProviderId);
  const setActiveProviderId = useAIStore((s) => s.setActiveProviderId);
  const selectedModels = useAIStore((s) => s.selectedModels);
  const setSelectedModel = useAIStore((s) => s.setSelectedModel);
  const customOpenAIBaseUrl = useAIStore((s) => s.customOpenAIBaseUrl);
  const setCustomOpenAIBaseUrl = useAIStore((s) => s.setCustomOpenAIBaseUrl);
  const setProviderToken = useAIStore((s) => s.setProviderToken);
  const clearProviderToken = useAIStore((s) => s.clearProviderToken);
  const clearConversation = useAIStore((s) => s.clearConversation);

  const provider = getProvider(activeProviderId);
  const selectedModel = selectedModels[activeProviderId];

  // Local state mirrors the dialog's editable fields. We only flush to
  // store / localStorage on explicit save, so a user can back out by
  // closing the dialog.
  const [tokenDraft, setTokenDraft] = useState('');
  const [tokenSaved, setTokenSaved] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [endpointDraft, setEndpointDraft] = useState(customOpenAIBaseUrl);
  const [showOtherModelInput, setShowOtherModelInput] = useState(false);
  const [otherModelDraft, setOtherModelDraft] = useState('');

  // Reload the token draft + endpoint draft when dialog opens or provider changes.
  useEffect(() => {
    if (!isOpen) return;
    setTokenDraft('');
    setTokenSaved(false);
    setTokenError(null);
    setEndpointDraft(customOpenAIBaseUrl);
    // If the current selected model isn't in the curated list, treat it as
    // an Other... entry so the dialog opens with the free-text field
    // pre-populated.
    const inCurated = provider.availableModels.some((m) => m.id === selectedModel);
    if (!inCurated && provider.availableModels.length > 0) {
      setShowOtherModelInput(true);
      setOtherModelDraft(selectedModel ?? '');
    } else {
      setShowOtherModelInput(false);
      setOtherModelDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeProviderId]);

  if (!isOpen) return null;

  const handleSaveToken = (): void => {
    if (!provider.tokenStorageKey) return;
    const validation = provider.validateTokenFormat(tokenDraft);
    if (validation) {
      setTokenError(validation);
      setTokenSaved(false);
      return;
    }
    setProviderToken(activeProviderId, tokenDraft);
    setTokenError(null);
    setTokenSaved(true);
    setTokenDraft('');
  };

  const handleClearToken = (): void => {
    clearProviderToken(activeProviderId);
    setTokenDraft('');
    setTokenSaved(false);
    setTokenError(null);
  };

  const handleProviderChange = (id: ProviderId): void => {
    setActiveProviderId(id);
  };

  const handleModelChange = (value: string): void => {
    if (value === OTHER_MODEL_SENTINEL) {
      setShowOtherModelInput(true);
      setOtherModelDraft('');
      return;
    }
    setShowOtherModelInput(false);
    setSelectedModel(activeProviderId, value);
  };

  const handleOtherModelCommit = (): void => {
    const next = otherModelDraft.trim();
    if (next) {
      setSelectedModel(activeProviderId, next);
    }
  };

  const handleEndpointSave = (): void => {
    setCustomOpenAIBaseUrl(endpointDraft.trim());
  };

  const isCustomOpenAI = activeProviderId === 'custom-openai-compatible';
  const showTokenField = !!provider.tokenStorageKey;
  // For custom-openai we hide the curated dropdown (none anyway); the user
  // free-texts the model id. For 'manual' we hide the model field entirely.
  const showModelField = activeProviderId !== 'manual';
  const isFreeTextOnlyModel =
    isCustomOpenAI || provider.availableModels.length === 0;

  return (
    <div
      role="dialog"
      aria-label="AI Settings"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: theme.colors.bgWhite,
          borderRadius: '6px',
          width: 'min(620px, 92vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          padding: '20px 22px',
          fontFamily: 'Arial, sans-serif',
          color: theme.colors.textPrimary,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>AI Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.4rem',
              cursor: 'pointer',
              color: theme.colors.textSecondary,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div
          style={{
            background: '#fff8e1',
            border: `1px solid ${theme.colors.warning}`,
            borderRadius: '4px',
            padding: '10px 12px',
            fontSize: '0.85rem',
            marginBottom: '16px',
            lineHeight: 1.45,
          }}
        >
          {GLOBAL_NOTICE}
        </div>

        {/* Provider selector */}
        <label htmlFor="ai-provider-select" style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
          Provider
        </label>
        <select
          id="ai-provider-select"
          value={activeProviderId}
          onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '0.95rem',
            border: `1px solid ${theme.colors.border}`,
            borderRadius: '4px',
            marginBottom: '14px',
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.displayName}
            </option>
          ))}
        </select>

        {/* Per-provider security warning — verbatim §5.6 */}
        <div
          data-testid="ai-provider-warning"
          style={{
            background: '#fff8e1',
            border: `1px solid ${theme.colors.warning}`,
            borderRadius: '4px',
            padding: '10px 12px',
            fontSize: '0.85rem',
            marginBottom: '16px',
          }}
        >
          {renderWarningParagraphs(provider.securityWarning)}
        </div>

        {/* Custom-OpenAI endpoint URL */}
        {isCustomOpenAI && (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="ai-custom-endpoint" style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
              Endpoint URL
            </label>
            <input
              id="ai-custom-endpoint"
              type="text"
              value={endpointDraft}
              placeholder={CUSTOM_OPENAI_PLACEHOLDER_URL}
              onChange={(e) => setEndpointDraft(e.target.value)}
              onBlur={handleEndpointSave}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '4px',
                marginBottom: '6px',
              }}
            />
            <details style={{ fontSize: '0.8rem', color: theme.colors.textSecondary }}>
              <summary style={{ cursor: 'pointer' }}>Example endpoints</summary>
              <pre
                style={{
                  margin: '6px 0 0 0',
                  padding: '8px 10px',
                  background: '#f5f5f5',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  fontSize: '0.78rem',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {CUSTOM_ENDPOINT_HINT_LINES.join('\n')}
              </pre>
            </details>
          </div>
        )}

        {/* API key field (hidden for manual) */}
        {showTokenField && (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="ai-token-input" style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
              API key
            </label>
            <input
              id="ai-token-input"
              type="password"
              autoComplete="off"
              value={tokenDraft}
              placeholder="Paste a fresh key — leave blank to keep the saved one"
              onChange={(e) => {
                setTokenDraft(e.target.value);
                setTokenSaved(false);
                setTokenError(null);
              }}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: '0.95rem',
                fontFamily: 'monospace',
                border: `1px solid ${tokenError ? theme.colors.error : theme.colors.border}`,
                borderRadius: '4px',
                marginBottom: '8px',
              }}
            />
            {tokenError && (
              <div
                role="alert"
                style={{ color: theme.colors.error, fontSize: '0.85rem', marginBottom: '8px' }}
              >
                {tokenError}
              </div>
            )}
            {tokenSaved && (
              <div
                role="status"
                style={{ color: theme.colors.success, fontSize: '0.85rem', marginBottom: '8px' }}
              >
                Token saved.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={handleSaveToken}
                disabled={!tokenDraft.trim()}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.9rem',
                  background: theme.colors.primary,
                  color: theme.colors.textWhite,
                  border: 'none',
                  borderRadius: '4px',
                  cursor: tokenDraft.trim() ? 'pointer' : 'not-allowed',
                  opacity: tokenDraft.trim() ? 1 : 0.6,
                }}
              >
                Save token
              </button>
              <button
                type="button"
                onClick={handleClearToken}
                style={{
                  padding: '6px 14px',
                  fontSize: '0.9rem',
                  background: theme.colors.bgWhite,
                  color: theme.colors.textPrimary,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Clear token
              </button>
            </div>
          </div>
        )}

        {/* Model picker (hidden for manual) */}
        {showModelField && (
          <div style={{ marginBottom: '16px' }}>
            <label htmlFor="ai-model-select" style={{ display: 'block', fontWeight: 'bold', marginBottom: '6px' }}>
              Model
            </label>
            {!isFreeTextOnlyModel && !showOtherModelInput && (
              <select
                id="ai-model-select"
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '0.95rem',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                }}
              >
                {provider.availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label ?? m.id}
                    {m.supportsVision ? ' • vision' : ''}
                  </option>
                ))}
                <option value={OTHER_MODEL_SENTINEL}>Other...</option>
              </select>
            )}
            {(isFreeTextOnlyModel || showOtherModelInput) && (
              <input
                id="ai-model-input"
                type="text"
                value={otherModelDraft || (isFreeTextOnlyModel ? selectedModel : '')}
                placeholder={isCustomOpenAI ? 'e.g. llama-3.3-70b-versatile' : 'model id'}
                onChange={(e) => {
                  setOtherModelDraft(e.target.value);
                }}
                onBlur={handleOtherModelCommit}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                }}
              />
            )}
            {!isFreeTextOnlyModel && showOtherModelInput && (
              <button
                type="button"
                onClick={() => {
                  setShowOtherModelInput(false);
                  setOtherModelDraft('');
                  setSelectedModel(activeProviderId, provider.defaultModel);
                }}
                style={{
                  marginTop: '6px',
                  padding: '4px 10px',
                  fontSize: '0.8rem',
                  background: theme.colors.bgWhite,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Back to curated list
              </button>
            )}
          </div>
        )}

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', borderTop: `1px solid ${theme.colors.border}`, paddingTop: '14px' }}>
          <button
            type="button"
            onClick={() => {
              clearConversation();
            }}
            style={{
              padding: '6px 14px',
              fontSize: '0.9rem',
              background: theme.colors.bgWhite,
              color: theme.colors.textPrimary,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Clear conversation
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              fontSize: '0.9rem',
              background: theme.colors.primary,
              color: theme.colors.textWhite,
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
