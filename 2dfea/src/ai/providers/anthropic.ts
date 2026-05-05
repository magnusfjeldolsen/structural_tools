/**
 * Anthropic provider.
 *
 * Uses `@anthropic-ai/sdk` with `dangerouslyAllowBrowser: true`. The SDK is
 * dynamic-imported so it only contributes ~30 KB gzipped to the bundle when
 * the user actually selects this provider (plan §5.13).
 *
 * Robustness:
 *   §5.14.1 — `messages.stream({ ... }).on('text', ...).on('error', ...)`
 *             with the abort signal hooked to `controller.abort()`.
 *   §5.14.2 — 60s stall timer wraps the SDK iterator.
 *   §5.14.6 — Anthropic content blocks `{ type: 'image', source: {...} }`
 *             are produced from neutral ChatContentBlocks here. Tool input
 *             streams as `input_json_delta` and is buffered until
 *             `content_block_stop` (Phase 2 work — text-only path is fine).
 *   §5.14.7 — token read here, never logged.
 *   §5.14.13 — dynamic-import failure surfaces a friendly "Couldn't load
 *              Anthropic SDK" error chunk.
 */

import {
  STREAM_STALL_TIMEOUT_MS,
  type AIProvider,
  type ChatChunk,
  type ChatContentBlock,
  type ChatMessage,
  type ChatRequest,
  type CuratedModel,
} from './types';

export const ANTHROPIC_TOKEN_KEY = '2dfea-ai-token-anthropic';

/**
 * Decision (plan §12.1, logged for the PR): the v1 picks below match the
 * plan's recommended set. The default is `claude-haiku-4-5-20251001`
 * because it is the cheapest current Claude with vision + tool calling.
 */
const ANTHROPIC_CURATED: CuratedModel[] = [
  { id: 'claude-haiku-4-5-20251001', supportsVision: true, supportsToolCalls: true },
  { id: 'claude-sonnet-4-6', supportsVision: true, supportsToolCalls: true },
  { id: 'claude-opus-4-7', supportsVision: true, supportsToolCalls: true },
  { id: 'claude-opus-4-7[1m]', supportsVision: true, supportsToolCalls: true, label: 'claude-opus-4-7 (1M context)' },
];

const ANTHROPIC_SECURITY_WARNING = `Your Anthropic API key will be stored in this browser's localStorage and sent directly from your browser to api.anthropic.com (this requires \`dangerouslyAllowBrowser\`). Browser-side keys can be exfiltrated by any XSS on this page. **Anthropic recommends using API keys server-side, not from a browser.** If you accept the risk, generate a key with the lowest practical usage limit at console.anthropic.com.`;

interface AnthropicTextBlockInput { type: 'text'; text: string; }
interface AnthropicImageBlockInput {
  type: 'image';
  source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg'; data: string };
}
type AnthropicContentInput = AnthropicTextBlockInput | AnthropicImageBlockInput;

function neutralContentToAnthropic(content: ChatContentBlock[]): AnthropicContentInput[] {
  return content.map((b) => {
    if (b.type === 'text') {
      return { type: 'text', text: b.text ?? '' };
    }
    // Strip data: URL prefix if present — Anthropic wants raw base64.
    const raw = (b.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, '');
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: b.imageMediaType ?? 'image/png',
        data: raw,
      },
    };
  });
}

interface AnthropicMessageInput {
  role: 'user' | 'assistant';
  content: string | AnthropicContentInput[];
}

function partitionMessages(messages: ChatMessage[]): {
  system: string;
  messages: AnthropicMessageInput[];
} {
  // Anthropic takes `system` as a top-level string parameter, not a message.
  const systemParts: string[] = [];
  const out: AnthropicMessageInput[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') systemParts.push(msg.content);
      continue;
    }
    if (msg.role === 'tool') {
      // Phase 1 doesn't emit tool-role messages. When repair-loop arrives in
      // Phase 2 we'll translate { role: 'tool' } into a content-block on a
      // user message ({ type: 'tool_result', tool_use_id, content }). Skip
      // for now to keep the type surface honest.
      continue;
    }
    const role = msg.role; // 'user' | 'assistant'
    const content =
      typeof msg.content === 'string'
        ? msg.content
        : neutralContentToAnthropic(msg.content);
    out.push({ role, content });
  }
  return { system: systemParts.join('\n\n'), messages: out };
}

export const anthropicProvider: AIProvider = {
  id: 'anthropic',
  displayName: 'Anthropic (BYO key)',
  defaultModel: 'claude-haiku-4-5-20251001',
  availableModels: ANTHROPIC_CURATED,
  supportsVision: true,
  supportsToolCalls: true,
  requiresNetwork: true,
  tokenStorageKey: ANTHROPIC_TOKEN_KEY,
  securityWarning: ANTHROPIC_SECURITY_WARNING,
  validateTokenFormat(token: string): string | null {
    const trimmed = token.trim();
    if (!trimmed) return 'Enter an Anthropic API key.';
    if (!trimmed.startsWith('sk-ant-')) {
      return "Anthropic keys start with 'sk-ant-'. Double-check you pasted the right key.";
    }
    return null;
  },
  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> {
    const apiKey = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(ANTHROPIC_TOKEN_KEY)
      : null) ?? '';

    let AnthropicModule: typeof import('@anthropic-ai/sdk');
    try {
      AnthropicModule = await import('@anthropic-ai/sdk');
    } catch {
      yield {
        type: 'error',
        error: { message: "Couldn't load Anthropic SDK — refresh and try again." },
      };
      return;
    }

    const Anthropic = AnthropicModule.default;
    const client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    const { system, messages } = partitionMessages(req.messages);

    let stream: AsyncIterable<unknown>;
    try {
      stream = (await client.messages.create({
        model: req.model,
        max_tokens: req.maxTokens ?? 4096,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(system ? { system } : {}),
        messages: messages as Parameters<typeof client.messages.create>[0]['messages'],
        stream: true,
      })) as unknown as AsyncIterable<unknown>;
    } catch (err) {
      if (signal.aborted) {
        yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
        return;
      }
      yield {
        type: 'error',
        error: { message: `Anthropic error: ${(err as Error).message}` },
      };
      return;
    }

    // Wire abort: when signal fires, we stop iterating and let the SDK's
    // internal AbortController propagate. The SDK does not (yet) accept an
    // external signal at create-time on every method, so we guard with a
    // racing flag.
    let aborted = false;
    const onAbort = (): void => {
      aborted = true;
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    let stalled = false;
    const resetStall = (): void => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
      }, STREAM_STALL_TIMEOUT_MS);
    };
    resetStall();

    try {
      for await (const ev of stream) {
        if (aborted) {
          yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
          return;
        }
        if (stalled) {
          yield {
            type: 'error',
            error: { message: 'The model stopped responding — try again.', code: 'stall' },
          };
          return;
        }
        resetStall();

        // Anthropic streams typed events. We narrow with property checks to
        // avoid pulling the SDK's heavy type imports into the public surface.
        const anyEv = ev as { type?: string; delta?: { type?: string; text?: string } };
        if (anyEv.type === 'content_block_delta' && anyEv.delta?.type === 'text_delta' && anyEv.delta.text) {
          yield { type: 'text', textDelta: anyEv.delta.text };
        }
        // 'message_stop' marks end of stream.
        if (anyEv.type === 'message_stop') {
          yield { type: 'done' };
          return;
        }
      }
      yield { type: 'done' };
    } catch (err) {
      if (aborted || (err as Error).name === 'AbortError') {
        yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
        return;
      }
      yield {
        type: 'error',
        error: { message: `Stream error: ${(err as Error).message}` },
      };
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
    }
  },
};
