/**
 * Provider conformance + manual provider unit tests.
 *
 * Plan §8: "providers/providers.test.ts — Each adapter implements
 * AIProvider; manual adapter dispatches correctly."
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PROVIDERS,
  DEFAULT_PROVIDER_ID,
  getProvider,
  type AIProvider,
} from './index';
import {
  manualProvider,
  _resetManualForTesting,
  peekManualPending,
  submitManualResponse,
  subscribeManualPending,
} from './manual';
import { redactError } from '../redact';

describe('provider registry', () => {
  it('registers all five v1 providers', () => {
    const ids = PROVIDERS.map((p) => p.id).sort();
    expect(ids).toEqual([
      'anthropic',
      'custom-openai-compatible',
      'github-models',
      'manual',
      'openai',
    ]);
  });

  it('default provider id resolves through the registry', () => {
    expect(getProvider(DEFAULT_PROVIDER_ID).id).toBe(DEFAULT_PROVIDER_ID);
  });

  it('throws on unknown provider id', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => getProvider('does-not-exist' as any)).toThrowError(/Unknown AI provider/);
  });

  it.each(PROVIDERS as readonly AIProvider[])(
    'provider %s implements the AIProvider interface',
    (p) => {
      expect(typeof p.id).toBe('string');
      expect(typeof p.displayName).toBe('string');
      expect(typeof p.defaultModel).toBe('string');
      expect(Array.isArray(p.availableModels)).toBe(true);
      expect(typeof p.supportsVision).toBe('boolean');
      expect(typeof p.supportsToolCalls).toBe('boolean');
      expect(typeof p.requiresNetwork).toBe('boolean');
      expect(typeof p.tokenStorageKey).toBe('string');
      expect(typeof p.securityWarning).toBe('string');
      expect(p.securityWarning.length).toBeGreaterThan(20);
      expect(typeof p.validateTokenFormat).toBe('function');
      expect(typeof p.chat).toBe('function');
    }
  );

  it('all networked providers store tokens under 2dfea-ai-token-<provider>', () => {
    for (const p of PROVIDERS) {
      if (!p.requiresNetwork) continue;
      expect(p.tokenStorageKey).toBe(`2dfea-ai-token-${p.id}`);
    }
  });

  it('§5.6 GitHub Models warning includes the canonical 30+ short prompts paragraph', () => {
    const gh = getProvider('github-models');
    expect(gh.securityWarning).toContain('30+ short prompts per day');
    expect(gh.securityWarning).toContain('models.github.ai');
  });

  it('§5.6 Anthropic warning recommends server-side use', () => {
    const a = getProvider('anthropic');
    expect(a.securityWarning).toContain('Anthropic recommends using API keys server-side');
  });

  it('§5.6 OpenAI warning explicitly discourages client-side keys', () => {
    const o = getProvider('openai');
    expect(o.securityWarning).toContain('OpenAI explicitly discourages exposing keys in client-side code');
  });
});

describe('validateTokenFormat (§5.14.8)', () => {
  it('GitHub Models accepts ghp_ and github_pat_ prefixes', () => {
    const gh = getProvider('github-models');
    expect(gh.validateTokenFormat('ghp_abc123')).toBeNull();
    expect(gh.validateTokenFormat('github_pat_abc123')).toBeNull();
    expect(gh.validateTokenFormat('not-a-pat')).toMatch(/PAT/i);
    expect(gh.validateTokenFormat('')).toMatch(/Enter/i);
  });

  it('Anthropic requires sk-ant- prefix', () => {
    const a = getProvider('anthropic');
    expect(a.validateTokenFormat('sk-ant-abc')).toBeNull();
    expect(a.validateTokenFormat('sk-abc')).toMatch(/sk-ant-/);
  });

  it('OpenAI accepts sk- prefixed keys (sk- and sk-proj-)', () => {
    const o = getProvider('openai');
    expect(o.validateTokenFormat('sk-abc')).toBeNull();
    expect(o.validateTokenFormat('sk-proj-abc')).toBeNull();
    expect(o.validateTokenFormat('garbage')).toMatch(/sk-/);
  });

  it('Custom OpenAI does no format check beyond non-empty', () => {
    const c = getProvider('custom-openai-compatible');
    expect(c.validateTokenFormat('any-string-the-user-pasted')).toBeNull();
    expect(c.validateTokenFormat('')).toMatch(/Enter/i);
  });

  it('Manual provider accepts any token (no auth)', () => {
    expect(manualProvider.validateTokenFormat('')).toBeNull();
    expect(manualProvider.validateTokenFormat('whatever')).toBeNull();
  });
});

describe('manual provider — dispatch', () => {
  beforeEach(() => {
    _resetManualForTesting();
  });

  it('streams the pasted response back as a single text chunk + done', async () => {
    const controller = new AbortController();
    const stream = manualProvider.chat(
      { messages: [{ role: 'user', content: 'hello' }], tools: [], model: 'manual' },
      controller.signal
    );

    // Drain the iterator into an array. The generator parks until
    // submitManualResponse() is called, so we kick off the consumer first
    // then submit on a microtask.
    const collected: unknown[] = [];
    const consumer = (async () => {
      for await (const ev of stream) collected.push(ev);
    })();

    // Wait for the generator to register a pending request.
    while (!peekManualPending()) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const pending = peekManualPending();
    expect(pending).not.toBeNull();
    submitManualResponse(pending!.id, 'paste-response-text');

    await consumer;
    expect(collected).toEqual([
      { type: 'text', textDelta: 'paste-response-text' },
      { type: 'done' },
    ]);
  });

  it('aborts cleanly when the controller is aborted before paste', async () => {
    const controller = new AbortController();
    const stream = manualProvider.chat(
      { messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'manual' },
      controller.signal
    );

    const collected: unknown[] = [];
    const consumer = (async () => {
      for await (const ev of stream) collected.push(ev);
    })();

    while (!peekManualPending()) {
      await new Promise((r) => setTimeout(r, 0));
    }
    controller.abort();

    await consumer;
    expect(collected[0]).toMatchObject({ type: 'error', error: { code: 'aborted' } });
    // Pending queue must drain so the next request gets a clean slate.
    expect(peekManualPending()).toBeNull();
  });

  it('subscribers receive change notifications', async () => {
    const seen: number[] = [];
    let callCount = 0;
    const unsub = subscribeManualPending(() => {
      callCount += 1;
      seen.push(callCount);
    });

    const controller = new AbortController();
    const stream = manualProvider.chat(
      { messages: [{ role: 'user', content: 'a' }], tools: [], model: 'manual' },
      controller.signal
    );
    const consumer = (async () => {
      for await (const _ of stream) { /* drain */ }
    })();

    while (!peekManualPending()) {
      await new Promise((r) => setTimeout(r, 0));
    }
    const pending = peekManualPending()!;
    submitManualResponse(pending.id, 'reply');
    await consumer;
    unsub();

    // At least: one notify on push + one on submit.
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});

describe('redactError (§5.14.9)', () => {
  it('redacts Bearer tokens', () => {
    expect(redactError('Authorization: Bearer ghp_abc123def456')).toContain('Bearer ***REDACTED***');
    expect(redactError('Authorization: Bearer ghp_abc123def456')).not.toContain('ghp_abc123def456');
  });

  it('redacts api_key / token query params', () => {
    expect(redactError('https://x.com/y?api_key=secret123&foo=bar')).toContain('api_key=***REDACTED***');
    expect(redactError('https://x.com/y?api_key=secret123&foo=bar')).not.toContain('secret123');
    expect(redactError('?token=xyz')).toContain('token=***REDACTED***');
  });

  it('redacts sk- / ghp_ shaped substrings', () => {
    expect(redactError('Failed: sk-ant-realkey here')).not.toContain('realkey');
    expect(redactError('failed for github_pat_actualtoken')).not.toContain('actualtoken');
  });

  it('truncates long messages to 500 chars + ellipsis', () => {
    const long = 'a'.repeat(2000);
    const out = redactError(long);
    expect(out.length).toBeLessThanOrEqual(501); // 500 + '…'
    expect(out.endsWith('…')).toBe(true);
  });

  it('falls back to a friendly default when input is empty', () => {
    expect(redactError(null)).toMatch(/Something went wrong/i);
    expect(redactError('')).toMatch(/Something went wrong/i);
  });

  it('extracts message from Error instances', () => {
    expect(redactError(new Error('boom'))).toBe('boom');
  });
});

describe('openaiCompatChat — error path (§5.14.9 redaction stays out of body echo)', () => {
  // The helper is exercised end-to-end by the manual provider tests; here we
  // only verify the network-level error path returns a structured chunk
  // without leaking the auth header.
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GitHub Models adapter yields a network error chunk', async () => {
    const gh = getProvider('github-models');
    const controller = new AbortController();
    const stream = gh.chat(
      { messages: [{ role: 'user', content: 'hi' }], tools: [], model: 'openai/gpt-4o-mini' },
      controller.signal
    );
    const collected: unknown[] = [];
    for await (const ev of stream) collected.push(ev);
    const errorEvent = collected.find(
      (e): e is { type: 'error'; error: { message: string } } =>
        typeof e === 'object' && e !== null && (e as { type?: string }).type === 'error'
    );
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error.message).toContain('Network error');
    expect(errorEvent!.error.message).not.toContain('Bearer');
  });
});
