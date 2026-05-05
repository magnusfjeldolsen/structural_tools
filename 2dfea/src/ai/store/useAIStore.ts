// @ts-nocheck — same convention as the other 2dfea Zustand stores
//   (useUIStore.ts, useModelStore.ts) which use @ts-nocheck because the
//   immer + persist + devtools middleware pile-up causes generic-inference
//   pain that masks real type signal. Public consumers still get strict
//   typing through the `AIState` interface re-exported below.

/**
 * AI feature Zustand store — UI-only state for the AI assistant panel.
 *
 * Plan §5.3 (transcript, status, settings) + §5.14.4 (race conditions) +
 * §5.14.5 (truncation) + §5.14.7 (token safety) + §5.14.14 (persistence
 * boundary).
 *
 * Owned state:
 *   - panelOpen: dialog open flag (NOT persisted — defaults closed each load)
 *   - settingsOpen: settings dialog flag
 *   - activeProviderId, selectedModels: persisted (small, not sensitive)
 *   - customOpenAIBaseUrl: persisted
 *   - transcript: in-memory only
 *   - inFlight: { abortController, requestId } | null
 *   - lastError: string | null (for inline display, separate from transcript
 *     so transient network errors don't pollute the conversation)
 *
 * NOT owned by this store:
 *   - API tokens. Those live in their dedicated localStorage keys
 *     (`2dfea-ai-token-<provider>`) — see §5.14.7 boundary.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

import type {
  AIProvider,
  ChatChunk,
  ChatMessage,
  ProviderId,
} from '../providers/types';
import {
  PROVIDERS,
  DEFAULT_PROVIDER_ID,
  getProvider,
} from '../providers';
import {
  CUSTOM_OPENAI_BASE_URL_KEY,
  CUSTOM_OPENAI_PLACEHOLDER_URL,
} from '../providers/customOpenAI';
import { redactError } from '../redact';
import { bumpCounter } from '../debug/localCounters';

// ============================================================================
// Types
// ============================================================================

/**
 * Transcript entry. `system` is implicit (built fresh on each send), so the
 * transcript only carries user / assistant turns plus surfaceable adapter
 * errors. Tool calls land here in Phase 2 — `kind: 'tool_call'`.
 */
export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant' | 'error';
  text: string;
  /** True while an assistant message is still streaming. */
  streaming?: boolean;
  /** True when the user aborted this assistant message mid-stream. */
  aborted?: boolean;
  createdAt: number;
}

export type AIStatus = 'idle' | 'streaming' | 'error';

/**
 * Truncation cap (§5.14.5). System prompt is slot 0 in the prepared
 * messages; this cap applies to user/assistant/tool turns only.
 */
export const MAX_TURNS = 19;

export interface AIState {
  // ----- panel visibility ----------------------------------------------------
  panelOpen: boolean;
  settingsOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;

  // ----- settings (persisted) ------------------------------------------------
  activeProviderId: ProviderId;
  /** Per-provider selected model. Free-text models live here too. */
  selectedModels: Record<ProviderId, string>;
  /** User-entered base URL for the custom-openai-compatible provider. */
  customOpenAIBaseUrl: string;
  setActiveProviderId: (id: ProviderId) => void;
  setSelectedModel: (id: ProviderId, model: string) => void;
  setCustomOpenAIBaseUrl: (url: string) => void;

  // ----- transcript (in-memory) ---------------------------------------------
  transcript: TranscriptEntry[];
  status: AIStatus;
  lastError: string | null;
  clearConversation: () => void;

  // ----- in-flight gate ------------------------------------------------------
  /** Set while a chat() iteration is running. Submit is blocked while non-null. */
  inFlight: null | { controller: AbortController; requestId: string };

  // ----- send ---------------------------------------------------------------
  /** Send a text-only message through the active provider. Phase 1 wires text only. */
  send: (text: string) => Promise<void>;
  abort: () => void;

  // ----- token helpers (do NOT live in store state — pass-through helpers) --
  /** Returns the token from localStorage for the current active provider. */
  getActiveToken: () => string;
  /** Writes the token for a specific provider, scoped to that provider's key. */
  setProviderToken: (id: ProviderId, token: string) => void;
  /** Clears the token for a specific provider. */
  clearProviderToken: (id: ProviderId) => void;
}

// ============================================================================
// Initial state
// ============================================================================

const initialSelectedModels: Record<ProviderId, string> = PROVIDERS.reduce(
  (acc: Record<ProviderId, string>, p: AIProvider) => {
    acc[p.id] = p.defaultModel;
    return acc;
  },
  {} as Record<ProviderId, string>
);

const initialState = {
  panelOpen: false,
  settingsOpen: false,
  activeProviderId: DEFAULT_PROVIDER_ID,
  selectedModels: initialSelectedModels,
  customOpenAIBaseUrl: '',
  transcript: [] as TranscriptEntry[],
  status: 'idle' as AIStatus,
  lastError: null as string | null,
  inFlight: null as AIState['inFlight'],
};

// ============================================================================
// Helpers
// ============================================================================

let nextEntryId = 1;
function freshEntryId(prefix: string): string {
  return `${prefix}-${Date.now()}-${nextEntryId++}`;
}

/**
 * Whitespace / encoding normalisation (§5.14.17). Run on the raw user text
 * before it enters the transcript or the outbound request.
 */
function normaliseText(input: string): string {
  return input
    // Windows / classic-Mac line endings → Unix
    .replace(/\r\n?/g, '\n')
    // NBSP → space
    .replace(/ /g, ' ')
    // Strip trailing whitespace per line
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build the messages payload for an outbound request. Phase 1 has no
 * tool messages, so this is a straightforward map. Phase 2 will splice in
 * the system-prompt skeleton and current-model-state fragment.
 */
function buildMessagesForSend(
  transcript: TranscriptEntry[],
  newUserText: string
): ChatMessage[] {
  const turns: ChatMessage[] = transcript
    .filter((e) => e.role === 'user' || e.role === 'assistant')
    .map<ChatMessage>((e) => ({
      role: e.role as 'user' | 'assistant',
      content: e.text,
    }));
  turns.push({ role: 'user', content: newUserText });

  // §5.14.5: keep last MAX_TURNS messages, prepend a synthetic truncation
  // marker if anything was dropped.
  if (turns.length <= MAX_TURNS) return turns;
  const dropped = turns.length - MAX_TURNS;
  const kept = turns.slice(turns.length - MAX_TURNS);
  return [
    {
      role: 'user',
      content: `[earlier conversation truncated — ${dropped} turn${dropped === 1 ? '' : 's'} omitted]`,
    },
    ...kept,
  ];
}

// ============================================================================
// Store
// ============================================================================

export const useAIStore = create<AIState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,

        // ----- visibility ----------------------------------------------------
        setPanelOpen: (open: boolean) => {
          set((state) => {
            state.panelOpen = open;
          });
        },
        setSettingsOpen: (open: boolean) => {
          set((state) => {
            state.settingsOpen = open;
          });
        },

        // ----- settings ------------------------------------------------------
        setActiveProviderId: (id: ProviderId) => {
          // §5.14.4: switching providers mid-conversation clears it because
          // tool-call IDs aren't portable across providers. We also abort
          // any in-flight request — settings changes during streaming are
          // allowed by the plan to take effect on the *next* request, but
          // a provider switch is special: the running request is keyed to
          // the old provider's tool-call shape and the user's intent is
          // clearly to start fresh.
          const current = get();
          if (current.activeProviderId !== id) {
            if (current.inFlight) {
              current.inFlight.controller.abort();
            }
            set((state) => {
              state.activeProviderId = id;
              state.transcript = [];
              state.status = 'idle';
              state.lastError =
                "Conversation cleared because tool-call IDs aren't portable across providers.";
              state.inFlight = null;
            });
            // Mirror customOpenAI base URL into its dedicated localStorage
            // key whenever the user activates that provider, so the
            // adapter (which reads from localStorage at chat() time) sees
            // a consistent value.
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem(
                CUSTOM_OPENAI_BASE_URL_KEY,
                get().customOpenAIBaseUrl
              );
            }
          }
        },
        setSelectedModel: (id: ProviderId, model: string) => {
          set((state) => {
            state.selectedModels[id] = model;
          });
        },
        setCustomOpenAIBaseUrl: (url: string) => {
          set((state) => {
            state.customOpenAIBaseUrl = url;
          });
          // Mirror to the dedicated localStorage key the adapter reads
          // from — see customOpenAI.ts. Persist middleware writes to
          // a different key (`2dfea-ai-store`) so we keep both in sync
          // explicitly.
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(CUSTOM_OPENAI_BASE_URL_KEY, url);
          }
        },

        // ----- transcript ----------------------------------------------------
        clearConversation: () => {
          const current = get();
          if (current.inFlight) {
            current.inFlight.controller.abort();
          }
          set((state) => {
            state.transcript = [];
            state.status = 'idle';
            state.lastError = null;
            state.inFlight = null;
          });
        },

        // ----- send ----------------------------------------------------------
        abort: () => {
          const current = get();
          if (current.inFlight) {
            current.inFlight.controller.abort();
            bumpCounter('aborts');
          }
        },

        send: async (rawText: string) => {
          const current = get();
          // §5.14.4 — submit blocked while in-flight.
          if (current.inFlight) return;
          const text = normaliseText(rawText);
          if (!text) return;

          const provider = getProvider(current.activeProviderId);
          const model = current.selectedModels[current.activeProviderId];

          // §5.14.8 — cheap key-format pre-flight (network adapters only).
          if (provider.requiresNetwork) {
            const token =
              typeof localStorage !== 'undefined' && provider.tokenStorageKey
                ? localStorage.getItem(provider.tokenStorageKey) ?? ''
                : '';
            const validationMsg = provider.validateTokenFormat(token);
            if (validationMsg) {
              set((state) => {
                state.lastError = validationMsg;
                state.status = 'error';
              });
              return;
            }
          }

          const userEntry: TranscriptEntry = {
            id: freshEntryId('u'),
            role: 'user',
            text,
            createdAt: Date.now(),
          };
          const assistantEntry: TranscriptEntry = {
            id: freshEntryId('a'),
            role: 'assistant',
            text: '',
            streaming: true,
            createdAt: Date.now(),
          };

          const messages = buildMessagesForSend(current.transcript, text);
          const controller = new AbortController();
          const requestId = freshEntryId('r');

          set((state) => {
            state.transcript.push(userEntry);
            state.transcript.push(assistantEntry);
            state.status = 'streaming';
            state.lastError = null;
            state.inFlight = { controller, requestId };
          });
          bumpCounter('chatTurns');

          try {
            const stream = provider.chat(
              {
                messages,
                tools: [], // Phase 1 = text only
                model,
              },
              controller.signal
            );

            for await (const chunk of stream as AsyncIterable<ChatChunk>) {
              // Race against late chunks landing after a different request
              // started (defence-in-depth — `inFlight` is supposed to be
              // null between requests because submit blocks).
              const live = get();
              if (!live.inFlight || live.inFlight.requestId !== requestId) {
                break;
              }

              if (chunk.type === 'text' && chunk.textDelta) {
                set((state) => {
                  const target = state.transcript.find((t) => t.id === assistantEntry.id);
                  if (target) target.text += chunk.textDelta;
                });
              } else if (chunk.type === 'error') {
                bumpCounter('streamErrors');
                const friendly = redactError(chunk.error?.message ?? 'Unknown error');
                set((state) => {
                  const target = state.transcript.find((t) => t.id === assistantEntry.id);
                  if (target) {
                    target.streaming = false;
                    if (chunk.error?.code === 'aborted') {
                      target.aborted = true;
                      target.text = target.text || '[stopped]';
                    } else {
                      // Surface the error inline as a separate transcript
                      // entry rather than overwriting the streamed text —
                      // the user can see what they got before the failure.
                      if (!target.text) target.text = '[no response]';
                    }
                  }
                  if (chunk.error?.code !== 'aborted') {
                    state.transcript.push({
                      id: freshEntryId('e'),
                      role: 'error',
                      text: friendly,
                      createdAt: Date.now(),
                    });
                  }
                  state.status = chunk.error?.code === 'aborted' ? 'idle' : 'error';
                  state.lastError = chunk.error?.code === 'aborted' ? null : friendly;
                });
                break;
              } else if (chunk.type === 'done') {
                set((state) => {
                  const target = state.transcript.find((t) => t.id === assistantEntry.id);
                  if (target) target.streaming = false;
                  state.status = 'idle';
                });
                break;
              }
              // Phase 2 will handle chunk.type === 'tool_call' here.
            }
          } catch (err) {
            // Adapter-level throw (rare — most adapters yield error chunks).
            bumpCounter('streamErrors');
            const friendly = redactError(err);
            set((state) => {
              const target = state.transcript.find((t) => t.id === assistantEntry.id);
              if (target) target.streaming = false;
              state.transcript.push({
                id: freshEntryId('e'),
                role: 'error',
                text: friendly,
                createdAt: Date.now(),
              });
              state.status = 'error';
              state.lastError = friendly;
            });
          } finally {
            set((state) => {
              if (state.inFlight && state.inFlight.requestId === requestId) {
                state.inFlight = null;
                if (state.status === 'streaming') {
                  // Ensure we don't get stuck in 'streaming' if the loop
                  // exited without a terminal chunk (defensive).
                  state.status = 'idle';
                }
                const target = state.transcript.find((t) => t.id === assistantEntry.id);
                if (target && target.streaming) {
                  target.streaming = false;
                }
              }
            });
          }
        },

        // ----- token helpers ------------------------------------------------
        getActiveToken: () => {
          const provider = getProvider(get().activeProviderId);
          if (!provider.tokenStorageKey || typeof localStorage === 'undefined') return '';
          return localStorage.getItem(provider.tokenStorageKey) ?? '';
        },
        setProviderToken: (id: ProviderId, token: string) => {
          const provider = getProvider(id);
          if (!provider.tokenStorageKey || typeof localStorage === 'undefined') return;
          if (token) {
            localStorage.setItem(provider.tokenStorageKey, token);
          } else {
            localStorage.removeItem(provider.tokenStorageKey);
          }
        },
        clearProviderToken: (id: ProviderId) => {
          const provider = getProvider(id);
          if (!provider.tokenStorageKey || typeof localStorage === 'undefined') return;
          localStorage.removeItem(provider.tokenStorageKey);
        },
      })),
      {
        name: '2dfea-ai-store',
        // Persistence boundary — §5.14.14. ONLY:
        //   - active provider id
        //   - per-provider selected model
        //   - customOpenAIBaseUrl
        // NOT persisted: tokens (those live in dedicated keys), transcript,
        // panel/settings open flags, status, inFlight.
        partialize: (state) => ({
          activeProviderId: state.activeProviderId,
          selectedModels: state.selectedModels,
          customOpenAIBaseUrl: state.customOpenAIBaseUrl,
        }),
      }
    ),
    { name: 'AIStore' }
  )
);

// Test hook — reset to initial state without touching persistence.
export function _resetAIStoreForTesting(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (useAIStore as any).setState({ ...initialState });
}

export { CUSTOM_OPENAI_PLACEHOLDER_URL };
