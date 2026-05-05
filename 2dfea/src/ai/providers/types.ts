/**
 * AI provider abstraction — provider-neutral chat / streaming types.
 *
 * Five v1 adapters implement {@link AIProvider}: github-models, anthropic,
 * openai, custom-openai-compatible, manual. Each translates the neutral
 * {@link ChatRequest} to its native HTTP / SDK shape and streams chunks back
 * as an `AsyncIterable<ChatChunk>`.
 *
 * Plan: 2dfea/docs/plans/implement-ai-helper.md §5.3.
 *
 * Phase 1 scope is text-only: tool calling and image/PDF content blocks are
 * defined here but not yet exercised by adapters. That keeps the type surface
 * stable across phases and lets the provider conformance test (§8 Group A)
 * assert each adapter exposes the full interface from day one.
 */

export type ProviderId =
  | 'github-models'
  | 'anthropic'
  | 'openai'
  | 'custom-openai-compatible'
  | 'manual';

/**
 * Neutral content block. Anthropic's content-block model is the common
 * denominator; OpenAI's is flatter — adapters absorb the difference (§5.3).
 */
export interface ChatContentBlock {
  type: 'text' | 'image';
  /** Set when type === 'text'. */
  text?: string;
  /**
   * Set when type === 'image'. Either raw base64 or a `data:` URL. Adapters
   * normalise to the provider-native shape (Anthropic `image.source.data`,
   * OpenAI `image_url.url`).
   */
  imageBase64?: string;
  imageMediaType?: 'image/png' | 'image/jpeg';
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Plain string for simple turns; content-block array for vision / tool-result turns. */
  content: string | ChatContentBlock[];
  /** Set on `role: 'tool'` messages — must thread the provider's native id (§5.14.10). */
  tool_call_id?: string;
  /** Set on `role: 'assistant'` messages that committed tool calls. */
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  /**
   * Provider-native tool-call id. The dispatcher does NOT generate ids — id
   * ownership stays with the provider so retries thread correctly (§5.14.10).
   */
  id: string;
  name: string;
  /** JSON-parsed object. Adapters must JSON.parse OpenAI-style stringified args. */
  arguments: unknown;
}

/**
 * Provider-neutral tool descriptor. Adapters translate to `tools[].function`
 * (OpenAI) or `tools[]` with `input_schema` (Anthropic).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Phase 1 sends `[]`. Phase 2 wires `setModelTool`. */
  tools: ToolDefinition[];
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Stream chunk surfaced by an `AIProvider.chat` async iterator. Adapters
 * normalise SSE / SDK-event streams to this shape.
 *
 * - 'text': `textDelta` carries an incremental text fragment.
 * - 'tool_call': fully-buffered tool call (NOT a partial). Tool calls are not
 *   dispatched mid-stream because partial JSON cannot be Zod-validated (§5.11).
 * - 'done': stream completed normally; subsequent iteration must terminate.
 * - 'error': adapter-level error (network, auth, parse). UI surfaces inline.
 */
export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  textDelta?: string;
  toolCall?: ToolCall;
  error?: { message: string; code?: string };
}

/**
 * Curated lightweight model entry exposed in the settings dialog (§5.6.5).
 *
 * `supportsVision` drives the composer's drop-zone enable/disable + tooltip
 * (§5.6.5 Vision support badge). `supportsToolCalls` is informational for
 * Phase 1 (no tools wired yet) and used in Phase 2 to warn when a user has
 * picked a model the catalogue knows does not support tool calling.
 */
export interface CuratedModel {
  id: string;
  label?: string;
  supportsVision: boolean;
  supportsToolCalls: boolean;
}

/**
 * Provider adapter. All five v1 adapters ship in Phase 1 (§5.3) — no
 * feature-flagged subset.
 */
export interface AIProvider {
  id: ProviderId;
  displayName: string;
  /** Default model id offered when the user first picks the provider. */
  defaultModel: string;
  /** Curated list shown in the dropdown (§5.6.5). User can free-text any id via "Other...". */
  availableModels: CuratedModel[];
  /** Provider-level capability flag (true if any curated model supports vision). */
  supportsVision: boolean;
  /** Provider-level capability flag. */
  supportsToolCalls: boolean;
  /** Whether the adapter performs network calls (false for `manual`). */
  requiresNetwork: boolean;
  /** localStorage key that stores this provider's API token. Empty string for `manual`. */
  tokenStorageKey: string;
  /**
   * Plain-English security warning rendered verbatim inline in the settings
   * dialog (§5.6). Approved user-facing copy — implementers must NOT
   * paraphrase.
   */
  securityWarning: string;
  /**
   * Cheap client-side API-key format check (§5.14.8). Returns null if the
   * key looks plausible, or a friendly message if it doesn't. The check is
   * a pre-flight ONLY — it does not block the request, just warns.
   */
  validateTokenFormat(token: string): string | null;
  /**
   * Streamed chat. Adapters MUST honour `signal` (cancellation, §5.14.1)
   * and apply the 60-second no-chunk stall timeout from §5.14.2.
   */
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk>;
}

/**
 * Stream stall timeout in ms (§5.14.2). Centralised so adapters and tests
 * stay in lockstep.
 */
export const STREAM_STALL_TIMEOUT_MS = 60_000;
