/**
 * OpenAI provider — direct (BYO key).
 *
 * Uses the `openai` SDK with `dangerouslyAllowBrowser: true`. SDK is dynamic
 * imported (~25 KB gzipped) — only paid for if the user picks this provider.
 *
 * The SDK's chat-completions stream is OpenAI's native shape, but we do not
 * reuse openaiCompatStream.ts here because:
 *   1. The SDK provides nicer iterator semantics (typed events, automatic
 *      buffering of tool-call argument deltas).
 *   2. Future Phase 6 work — usage / cost reporting — is exposed via the
 *      SDK's chunk metadata more cleanly than via raw SSE parsing.
 *
 * For Phase 1 we just iterate `chunk.choices[0].delta.content`.
 *
 * Robustness same shape as anthropic.ts: §5.14.1, .2, .7, .8, .9, .13.
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

export const OPENAI_TOKEN_KEY = '2dfea-ai-token-openai';

/**
 * Decision (plan §12.1, logged for the PR): default `gpt-4o-mini` matches
 * the plan's recommendation — cheap, vision, mature tool calling.
 */
const OPENAI_CURATED: CuratedModel[] = [
  { id: 'gpt-4o-mini', supportsVision: true, supportsToolCalls: true },
  { id: 'gpt-4.1-mini', supportsVision: true, supportsToolCalls: true },
  { id: 'gpt-4.1-nano', supportsVision: false, supportsToolCalls: true },
  { id: 'gpt-4o', supportsVision: true, supportsToolCalls: true },
];

const OPENAI_SECURITY_WARNING = `Your OpenAI API key will be stored in this browser's localStorage and sent directly from your browser to api.openai.com (this requires \`dangerouslyAllowBrowser\`). Browser-side keys can be exfiltrated by any XSS on this page. **OpenAI explicitly discourages exposing keys in client-side code.** If you accept the risk, set a per-key usage limit at platform.openai.com.`;

interface OpenAITextPart { type: 'text'; text: string; }
interface OpenAIImagePart { type: 'image_url'; image_url: { url: string }; }
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAIContentPart[];
  tool_call_id?: string;
}

function neutralContentToOpenAI(blocks: ChatContentBlock[]): OpenAIContentPart[] {
  return blocks.map<OpenAIContentPart>((b) => {
    if (b.type === 'text') {
      return { type: 'text', text: b.text ?? '' };
    }
    const dataUrl = (b.imageBase64 ?? '').startsWith('data:')
      ? (b.imageBase64 as string)
      : `data:${b.imageMediaType ?? 'image/png'};base64,${b.imageBase64 ?? ''}`;
    return { type: 'image_url', image_url: { url: dataUrl } };
  });
}

function neutralMessageToOpenAI(msg: ChatMessage): OpenAIMessage {
  const content =
    typeof msg.content === 'string' ? msg.content : neutralContentToOpenAI(msg.content);
  return {
    role: msg.role,
    content,
    ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
  };
}

export const openaiProvider: AIProvider = {
  id: 'openai',
  displayName: 'OpenAI (BYO key)',
  defaultModel: 'gpt-4o-mini',
  availableModels: OPENAI_CURATED,
  supportsVision: true,
  supportsToolCalls: true,
  requiresNetwork: true,
  tokenStorageKey: OPENAI_TOKEN_KEY,
  securityWarning: OPENAI_SECURITY_WARNING,
  validateTokenFormat(token: string): string | null {
    const trimmed = token.trim();
    if (!trimmed) return 'Enter an OpenAI API key.';
    if (!trimmed.startsWith('sk-')) {
      return "OpenAI keys start with 'sk-' (often 'sk-proj-'). Double-check you pasted the right key.";
    }
    return null;
  },
  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> {
    const apiKey = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(OPENAI_TOKEN_KEY)
      : null) ?? '';

    let OpenAIModule: typeof import('openai');
    try {
      OpenAIModule = await import('openai');
    } catch {
      yield {
        type: 'error',
        error: { message: "Couldn't load OpenAI SDK — refresh and try again." },
      };
      return;
    }

    const OpenAI = OpenAIModule.default;
    const client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    let stream: AsyncIterable<unknown>;
    try {
      stream = (await client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages.map(neutralMessageToOpenAI) as Parameters<
            typeof client.chat.completions.create
          >[0]['messages'],
          stream: true,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.maxTokens !== undefined ? { max_tokens: req.maxTokens } : {}),
        },
        { signal }
      )) as unknown as AsyncIterable<unknown>;
    } catch (err) {
      if (signal.aborted) {
        yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
        return;
      }
      yield {
        type: 'error',
        error: { message: `OpenAI error: ${(err as Error).message}` },
      };
      return;
    }

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
      for await (const chunk of stream) {
        if (signal.aborted) {
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

        const anyChunk = chunk as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string;
          }>;
        };
        const delta = anyChunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { type: 'text', textDelta: delta.content };
        }
      }
      yield { type: 'done' };
    } catch (err) {
      if (signal.aborted || (err as Error).name === 'AbortError') {
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
