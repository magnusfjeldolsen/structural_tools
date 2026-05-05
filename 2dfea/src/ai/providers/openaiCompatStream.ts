/**
 * Shared OpenAI-compatible streaming helper.
 *
 * GitHub Models, Groq, OpenRouter, Cerebras, Ollama (proxied), and any other
 * provider that speaks the OpenAI Chat Completions wire format share the
 * same SSE structure:
 *
 *   data: {"choices":[{"delta":{"content":"hello"}}]}\n\n
 *   data: [DONE]\n\n
 *
 * Phase 1 only consumes `delta.content` (text). Phase 2 will additionally
 * consume `delta.tool_calls[].function.arguments` (an accumulating string —
 * §5.14.6) and yield a single `tool_call` chunk on `finish_reason: 'tool_calls'`.
 *
 * Robustness items honoured here:
 *   - §5.14.1 cancellation via `AbortSignal` — `fetch(url, { signal })`
 *   - §5.14.2 stall timeout — 60s no-chunk → abort with synthetic error
 *   - §5.14.9 logging redaction — Authorization headers never logged
 */

import {
  STREAM_STALL_TIMEOUT_MS,
  type ChatChunk,
  type ChatMessage,
  type ChatRequest,
  type ToolDefinition,
} from './types';

/**
 * Minimal request shape we send to an OpenAI-compatible endpoint. We do not
 * import the openai SDK here — that adapter is a separate file (openai.ts)
 * and uses the SDK directly. This helper is for plain fetch-based providers
 * (githubModels, customOpenAI) where we want to keep the bundle tiny.
 */
export interface OpenAICompatChatRequest {
  url: string;
  apiKey: string;
  /** Optional extra headers (e.g. `OpenAI-Beta`, custom proxy headers). */
  extraHeaders?: Record<string, string>;
  request: ChatRequest;
}

interface OpenAICompatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | OpenAICompatContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

type OpenAICompatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function neutralMessageToOpenAI(msg: ChatMessage): OpenAICompatMessage {
  if (typeof msg.content === 'string') {
    return {
      role: msg.role,
      content: msg.content,
      ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
    };
  }
  // Content-block array → OpenAI multipart format.
  const parts: OpenAICompatContentPart[] = msg.content.map((b) => {
    if (b.type === 'text') {
      return { type: 'text', text: b.text ?? '' };
    }
    // image
    const dataUrl = (b.imageBase64 ?? '').startsWith('data:')
      ? (b.imageBase64 as string)
      : `data:${b.imageMediaType ?? 'image/png'};base64,${b.imageBase64 ?? ''}`;
    return { type: 'image_url', image_url: { url: dataUrl } };
  });
  return { role: msg.role, content: parts };
}

function neutralToolToOpenAI(tool: ToolDefinition): {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
} {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/** OpenAI-compatible streaming chat. Yields {@link ChatChunk}s. */
export async function* openaiCompatChat(
  req: OpenAICompatChatRequest,
  signal: AbortSignal
): AsyncIterable<ChatChunk> {
  const body = {
    model: req.request.model,
    messages: req.request.messages.map(neutralMessageToOpenAI),
    stream: true,
    ...(req.request.tools.length > 0
      ? { tools: req.request.tools.map(neutralToolToOpenAI) }
      : {}),
    ...(req.request.temperature !== undefined ? { temperature: req.request.temperature } : {}),
    ...(req.request.maxTokens !== undefined ? { max_tokens: req.request.maxTokens } : {}),
  };

  let response: Response;
  try {
    response = await fetch(req.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${req.apiKey}`,
        ...req.extraHeaders,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
      return;
    }
    yield {
      type: 'error',
      error: { message: `Network error: ${(err as Error).message}` },
    };
    return;
  }

  if (!response.ok) {
    // Try to read a body for diagnostic context (provider often returns
    // structured JSON with a useful message). Defensive: never echo back
    // anything that could leak the auth header.
    let detail = '';
    try {
      const text = await response.text();
      detail = text.slice(0, 500);
    } catch {
      // ignore
    }
    yield {
      type: 'error',
      error: {
        code: String(response.status),
        message: `Provider returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`,
      },
    };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: { message: 'Provider returned no stream body.' } };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let stallTimer: ReturnType<typeof setTimeout> | null = null;
  let stalled = false;

  const resetStallTimer = (): void => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      stalled = true;
      // The reader will throw on next read because we cancel it here.
      reader.cancel().catch(() => {});
    }, STREAM_STALL_TIMEOUT_MS);
  };

  resetStallTimer();

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (err) {
        if (stalled) {
          yield {
            type: 'error',
            error: { message: 'The model stopped responding — try again.', code: 'stall' },
          };
          return;
        }
        if ((err as Error).name === 'AbortError' || signal.aborted) {
          yield { type: 'error', error: { message: 'Request cancelled.', code: 'aborted' } };
          return;
        }
        yield {
          type: 'error',
          error: { message: `Stream read error: ${(err as Error).message}` },
        };
        return;
      }

      if (chunk.done) break;
      resetStallTimer();
      buffer += decoder.decode(chunk.value, { stream: true });

      // SSE messages are delimited by blank lines (\n\n). Pull off complete
      // events; leave any trailing partial in the buffer.
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = event
          .split('\n')
          .find((line) => line.startsWith('data:'));
        if (!dataLine) continue;
        const payload = dataLine.slice('data:'.length).trim();
        if (payload === '[DONE]') {
          yield { type: 'done' };
          return;
        }
        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string;
            }>;
          };
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) {
            yield { type: 'text', textDelta: delta.content };
          }
          // Phase 2 will additionally handle delta.tool_calls and
          // finish_reason: 'tool_calls' here.
        } catch {
          // Some providers occasionally send keep-alive comments or partial
          // frames. Skip silently — the next iteration will pick up the rest.
        }
      }
    }

    yield { type: 'done' };
  } finally {
    if (stallTimer) clearTimeout(stallTimer);
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
