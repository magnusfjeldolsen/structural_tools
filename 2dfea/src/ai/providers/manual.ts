/**
 * Manual provider — paste-response, no network.
 *
 * Used when the user has no API key, wants to run fully offline, or wants to
 * test the validation / repair pipeline against a known fixture (plan §5.3,
 * §8 Group D, Group E).
 *
 * The user types into the prompt as usual; when they submit, the panel
 * captures their text and waits for them to paste the LLM's reply into a
 * separate text area. That paste is what this adapter "streams" back: a
 * single text chunk followed by `done`. Phase 1 only consumes the text path;
 * Phase 2 will additionally parse `<tool_call>{...}</tool_call>` markers
 * (or whatever shape we settle on) into a `tool_call` chunk.
 *
 * The bridge between the panel UI (where the paste happens) and this
 * adapter is a simple module-scoped resolver registry: when the adapter
 * starts a chat, it registers a pending resolver keyed by an opaque id; the
 * panel calls {@link submitManualResponse} with that id when the user pastes.
 */

import {
  type AIProvider,
  type ChatChunk,
  type ChatRequest,
  type CuratedModel,
} from './types';

// Module-scoped registry of pending resolvers. A single in-flight chat is
// the common case (the composer blocks submit while a request is running),
// but the registry is multi-keyed so re-entrancy doesn't deadlock if the
// panel ever changes that contract.
type Resolver = (response: string) => void;
const pendingResolvers = new Map<string, Resolver>();

/** Queue of pending requests, FIFO. The panel reads this to decide what to prompt for. */
interface PendingRequest {
  id: string;
  request: ChatRequest;
  resolve: Resolver;
  reject: (err: Error) => void;
}
const pendingQueue: PendingRequest[] = [];
const pendingListeners = new Set<() => void>();

function notifyPendingListeners(): void {
  for (const fn of pendingListeners) {
    try {
      fn();
    } catch {
      // listener errors must not poison the queue
    }
  }
}

/**
 * The panel calls this to subscribe to pending-request changes (a new prompt
 * arrived, or one was resolved/aborted). Returns an unsubscribe function.
 */
export function subscribeManualPending(listener: () => void): () => void {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/** The panel reads the head of the queue to know what request the user must answer. */
export function peekManualPending(): PendingRequest | null {
  return pendingQueue[0] ?? null;
}

/**
 * The panel calls this when the user pastes a response and clicks "Submit
 * manual reply". `id` must match the head pending request's id, otherwise
 * the call is a no-op (defends against late submissions after an abort).
 */
export function submitManualResponse(id: string, response: string): boolean {
  const head = pendingQueue[0];
  if (!head || head.id !== id) return false;
  const resolver = pendingResolvers.get(id);
  if (!resolver) return false;
  pendingResolvers.delete(id);
  pendingQueue.shift();
  resolver(response);
  notifyPendingListeners();
  return true;
}

/** Test hook: clear all pending state. Used by manual-provider unit tests. */
export function _resetManualForTesting(): void {
  pendingQueue.splice(0, pendingQueue.length);
  pendingResolvers.clear();
  pendingListeners.clear();
}

let nextId = 1;
function freshId(): string {
  return `manual-${Date.now()}-${nextId++}`;
}

const MANUAL_MODELS: CuratedModel[] = [
  // No real model id, but the dialog needs at least one entry to satisfy the
  // shared model-picker component contract. Hidden in the dialog by checking
  // requiresNetwork === false (§5.6.5 says the model field is hidden for
  // manual).
  { id: 'manual', supportsVision: true, supportsToolCalls: true },
];

const MANUAL_SECURITY_WARNING = `No network calls are made. You will paste the LLM's JSON response into the panel manually. Use this when you don't have an API key, or to test the validation/repair pipeline with a known fixture.`;

export const manualProvider: AIProvider = {
  id: 'manual',
  displayName: 'Manual (paste responses)',
  defaultModel: 'manual',
  availableModels: MANUAL_MODELS,
  supportsVision: true,
  supportsToolCalls: true,
  requiresNetwork: false,
  // Manual provider has no token. The empty string makes the panel skip the
  // token field rendering for this provider.
  tokenStorageKey: '',
  securityWarning: MANUAL_SECURITY_WARNING,
  validateTokenFormat(): string | null {
    // No token → never invalid.
    return null;
  },
  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> {
    const id = freshId();

    // Race the manual-paste promise against the abort signal. If the user
    // cancels before pasting, we yield an error chunk and clean up the
    // queue entry so the next request gets a clean slate.
    const responsePromise = new Promise<string>((resolve, reject) => {
      pendingResolvers.set(id, resolve);
      pendingQueue.push({ id, request: req, resolve, reject });
      notifyPendingListeners();
    });

    let aborted = false;
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = () => {
        aborted = true;
        // Pull our entry out of the queue / resolver map so a later
        // submitManualResponse call can't accidentally satisfy a stale request.
        const idx = pendingQueue.findIndex((p) => p.id === id);
        if (idx >= 0) pendingQueue.splice(idx, 1);
        pendingResolvers.delete(id);
        notifyPendingListeners();
        reject(new Error('aborted'));
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });

    let response: string;
    try {
      response = await Promise.race([responsePromise, abortPromise]);
    } catch (err) {
      if (aborted) {
        yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
        return;
      }
      yield {
        type: 'error',
        error: { message: err instanceof Error ? err.message : 'Manual provider failed.' },
      };
      return;
    }

    // Phase 1 hands the entire pasted response back as a single text chunk.
    // Phase 2 will parse out tool-call JSON from a recognised marker.
    yield { type: 'text', textDelta: response };
    yield { type: 'done' };
  },
};
