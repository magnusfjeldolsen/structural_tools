/**
 * useAIStore unit tests.
 *
 * Plan §5.14.4 (race conditions), §5.14.5 (truncation), §5.14.7 (token
 * isolation), §5.14.14 (persistence boundary), §5.14.17 (whitespace
 * normalisation). Manual provider is the test double — it never makes a
 * network call, so we don't have to stub `fetch`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAIStore, _resetAIStoreForTesting, MAX_TURNS } from './useAIStore';
import {
  _resetManualForTesting,
  peekManualPending,
  submitManualResponse,
} from '../providers/manual';
import { PROVIDERS } from '../providers';

function clearAITokenKeys(): void {
  for (const p of PROVIDERS) {
    if (p.tokenStorageKey) localStorage.removeItem(p.tokenStorageKey);
  }
  localStorage.removeItem('2dfea-ai-store');
  localStorage.removeItem('2dfea-ai-custom-openai-base-url');
}

beforeEach(() => {
  clearAITokenKeys();
  _resetManualForTesting();
  _resetAIStoreForTesting();
});

afterEach(() => {
  clearAITokenKeys();
  _resetManualForTesting();
  _resetAIStoreForTesting();
});

describe('useAIStore — defaults', () => {
  it('initial activeProviderId is github-models', () => {
    expect(useAIStore.getState().activeProviderId).toBe('github-models');
  });

  it('initial selectedModels matches each provider defaultModel', () => {
    const { selectedModels } = useAIStore.getState();
    for (const p of PROVIDERS) {
      expect(selectedModels[p.id]).toBe(p.defaultModel);
    }
  });

  it('panelOpen / settingsOpen default to false (not persisted)', () => {
    const s = useAIStore.getState();
    expect(s.panelOpen).toBe(false);
    expect(s.settingsOpen).toBe(false);
  });
});

describe('useAIStore — token helpers (§5.14.7)', () => {
  it('setProviderToken writes to the per-provider key only', () => {
    useAIStore.getState().setProviderToken('github-models', 'ghp_abc');
    expect(localStorage.getItem('2dfea-ai-token-github-models')).toBe('ghp_abc');
    expect(localStorage.getItem('2dfea-ai-token-anthropic')).toBeNull();
  });

  it('clearProviderToken wipes only the matching key', () => {
    useAIStore.getState().setProviderToken('github-models', 'ghp_abc');
    useAIStore.getState().setProviderToken('anthropic', 'sk-ant-zzz');
    useAIStore.getState().clearProviderToken('anthropic');
    expect(localStorage.getItem('2dfea-ai-token-anthropic')).toBeNull();
    expect(localStorage.getItem('2dfea-ai-token-github-models')).toBe('ghp_abc');
  });

  it('getActiveToken reads only the active provider key', () => {
    useAIStore.getState().setProviderToken('anthropic', 'sk-ant-xxx');
    useAIStore.getState().setActiveProviderId('anthropic');
    expect(useAIStore.getState().getActiveToken()).toBe('sk-ant-xxx');
  });

  it('persistence boundary excludes tokens (§5.14.14)', () => {
    useAIStore.getState().setProviderToken('github-models', 'ghp_xxx');
    useAIStore.getState().setActiveProviderId('openai'); // triggers a persist write
    const persisted = JSON.parse(localStorage.getItem('2dfea-ai-store')!);
    const persistedJson = JSON.stringify(persisted);
    expect(persistedJson).not.toContain('ghp_xxx');
    expect(persisted.state).toHaveProperty('activeProviderId');
    expect(persisted.state).toHaveProperty('selectedModels');
    expect(persisted.state).not.toHaveProperty('transcript');
    expect(persisted.state).not.toHaveProperty('panelOpen');
    expect(persisted.state).not.toHaveProperty('inFlight');
  });
});

describe('useAIStore — provider switch clears conversation (§5.14.4)', () => {
  it('changing provider id clears transcript and surfaces a notice', async () => {
    // Seed with manual provider so we can inject a transcript without
    // hitting the network.
    const store = useAIStore.getState();
    store.setActiveProviderId('manual');
    const sendPromise = store.send('hello');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    submitManualResponse(peekManualPending()!.id, 'world');
    await sendPromise;

    expect(useAIStore.getState().transcript.length).toBe(2);

    useAIStore.getState().setActiveProviderId('github-models');
    const after = useAIStore.getState();
    expect(after.transcript).toEqual([]);
    expect(after.lastError).toContain("tool-call IDs aren't portable");
    expect(after.activeProviderId).toBe('github-models');
  });
});

describe('useAIStore — send() with manual provider', () => {
  it('streams the pasted reply into the transcript', async () => {
    useAIStore.getState().setActiveProviderId('manual');
    const sendPromise = useAIStore.getState().send('  hello world  ');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    submitManualResponse(peekManualPending()!.id, 'pasted-reply');
    await sendPromise;

    const t = useAIStore.getState().transcript;
    expect(t).toHaveLength(2);
    expect(t[0].role).toBe('user');
    // §5.14.17 normalisation trims whitespace.
    expect(t[0].text).toBe('hello world');
    expect(t[1].role).toBe('assistant');
    expect(t[1].text).toBe('pasted-reply');
    expect(t[1].streaming).toBe(false);
    expect(useAIStore.getState().status).toBe('idle');
    expect(useAIStore.getState().inFlight).toBeNull();
  });

  it('blocks a second submit while one is in flight (§5.14.4)', async () => {
    useAIStore.getState().setActiveProviderId('manual');
    const first = useAIStore.getState().send('first');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));

    // Attempt a second send before resolving the first — must be a no-op.
    await useAIStore.getState().send('second');
    expect(useAIStore.getState().transcript.find((t) => t.text === 'second')).toBeUndefined();

    submitManualResponse(peekManualPending()!.id, 'reply');
    await first;
    expect(useAIStore.getState().transcript.find((t) => t.text === 'first')).toBeDefined();
  });

  it('abort during streaming sets aborted flag on the assistant message', async () => {
    useAIStore.getState().setActiveProviderId('manual');
    const sendPromise = useAIStore.getState().send('hi');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    useAIStore.getState().abort();
    await sendPromise;

    const t = useAIStore.getState().transcript;
    const assistant = t.find((entry) => entry.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.streaming).toBe(false);
    expect(assistant!.aborted).toBe(true);
    expect(useAIStore.getState().inFlight).toBeNull();
  });

  it('whitespace-only prompts are rejected', async () => {
    useAIStore.getState().setActiveProviderId('manual');
    await useAIStore.getState().send('   \n\t  ');
    expect(useAIStore.getState().transcript).toHaveLength(0);
  });
});

describe('useAIStore — token format pre-flight (§5.14.8)', () => {
  it('GitHub Models with no token surfaces a friendly error before any network call', async () => {
    useAIStore.getState().setActiveProviderId('github-models');
    await useAIStore.getState().send('hello');
    expect(useAIStore.getState().lastError).toMatch(/Enter a GitHub Personal Access Token/);
    // No transcript entries should have been pushed.
    expect(useAIStore.getState().transcript).toHaveLength(0);
  });

  it('GitHub Models with a wrong-shape token surfaces a friendly warning', async () => {
    useAIStore.getState().setProviderToken('github-models', 'not-a-pat');
    useAIStore.getState().setActiveProviderId('github-models');
    await useAIStore.getState().send('hello');
    expect(useAIStore.getState().lastError).toMatch(/PAT/);
    expect(useAIStore.getState().transcript).toHaveLength(0);
  });
});

describe('useAIStore — conversation truncation (§5.14.5)', () => {
  it('keeps the last MAX_TURNS turns and prepends a synthetic marker', async () => {
    useAIStore.getState().setActiveProviderId('manual');

    // Push MAX_TURNS + 5 user/assistant pairs.
    for (let i = 0; i < MAX_TURNS + 5; i++) {
      const promise = useAIStore.getState().send(`turn-${i}`);
      while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
      submitManualResponse(peekManualPending()!.id, `reply-${i}`);
      await promise;
    }

    // The internal helper isn't exported, but we can observe its effect by
    // capturing what the next request's queue head sees. Use a probe send
    // that we abort before it completes.
    const probe = useAIStore.getState().send('probe');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    const pending = peekManualPending()!;
    const probeMsgs = pending.request.messages;
    useAIStore.getState().abort();
    await probe;

    // System slot is owned by Phase 2; Phase 1 just sends the conversation.
    // We expect at most MAX_TURNS + 1 messages (the truncation marker) in the
    // outbound payload.
    expect(probeMsgs.length).toBeLessThanOrEqual(MAX_TURNS + 1);
    // The first message should be the truncation marker.
    const first = probeMsgs[0];
    expect(typeof first.content).toBe('string');
    expect(first.content as string).toMatch(/earlier conversation truncated/i);
  });
});

describe('useAIStore — clearConversation', () => {
  it('drops the transcript, resets status, and aborts any in-flight request', async () => {
    useAIStore.getState().setActiveProviderId('manual');
    const sendPromise = useAIStore.getState().send('first');
    while (!peekManualPending()) await new Promise((r) => setTimeout(r, 0));
    useAIStore.getState().clearConversation();
    await sendPromise;
    expect(useAIStore.getState().transcript).toEqual([]);
    expect(useAIStore.getState().status).toBe('idle');
    expect(useAIStore.getState().inFlight).toBeNull();
  });
});
