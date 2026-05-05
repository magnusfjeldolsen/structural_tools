/**
 * Custom OpenAI-compatible provider.
 *
 * The user supplies a base URL (Groq, OpenRouter, Cerebras, a local Ollama
 * proxy, LiteLLM, vLLM, …) and a key. Any endpoint that speaks OpenAI's
 * `/v1/chat/completions` SSE shape works.
 *
 * Phase 0 confirmed Groq works on `llama-3.3-70b-versatile` (text + tools;
 * vision N/A because the model is text-only — expected).
 *
 * The configurable base URL lives in the same Zustand store as the active
 * provider id, in a per-provider settings sub-slice. The store reads it via
 * {@link getCustomOpenAIBaseUrl}; this adapter calls that getter at chat()
 * time so a settings change between turns is picked up without remounting.
 */

import {
  type AIProvider,
  type ChatChunk,
  type ChatRequest,
  type CuratedModel,
} from './types';
import { openaiCompatChat } from './openaiCompatStream';

export const CUSTOM_OPENAI_TOKEN_KEY = '2dfea-ai-token-custom-openai-compatible';
export const CUSTOM_OPENAI_BASE_URL_KEY = '2dfea-ai-custom-openai-base-url';

/** Default placeholder shown in the dialog. Not used as a fallback at runtime. */
export const CUSTOM_OPENAI_PLACEHOLDER_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * No curated models — the user's endpoint dictates what's available
 * (plan §5.6.5). The dialog will hide the curated dropdown for this
 * provider and render a free-text model field with placeholder examples.
 */
const CUSTOM_OPENAI_CURATED: CuratedModel[] = [];

const CUSTOM_OPENAI_SECURITY_WARNING = `Your endpoint URL and API key are stored in this browser's localStorage and sent directly to the URL you provide. Verify the endpoint supports browser CORS for \`POST /v1/chat/completions\`. If you point this at a local proxy (Ollama, LiteLLM, vLLM), no key is leaked off your machine.`;

/** Read the user-configured base URL from localStorage. */
export function getCustomOpenAIBaseUrl(): string {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(CUSTOM_OPENAI_BASE_URL_KEY) ?? '';
}

export const customOpenAIProvider: AIProvider = {
  id: 'custom-openai-compatible',
  displayName: 'Custom OpenAI-compatible (BYO endpoint)',
  // The user selects a model via free-text. We seed a sensible Groq-free-tier
  // default so the dialog isn't empty on first load.
  defaultModel: 'llama-3.3-70b-versatile',
  availableModels: CUSTOM_OPENAI_CURATED,
  // Conservatively false at the provider level — the user's chosen endpoint
  // and model dictate the truth. The composer uses the per-message model
  // metadata to gate vision UI in later phases.
  supportsVision: false,
  supportsToolCalls: true,
  requiresNetwork: true,
  tokenStorageKey: CUSTOM_OPENAI_TOKEN_KEY,
  securityWarning: CUSTOM_OPENAI_SECURITY_WARNING,
  validateTokenFormat(token: string): string | null {
    // No validation; user's responsibility (plan §5.14.8).
    if (!token.trim()) return 'Enter the API key for your custom endpoint.';
    return null;
  },
  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> {
    const apiKey = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(CUSTOM_OPENAI_TOKEN_KEY)
      : null) ?? '';
    const baseUrl = getCustomOpenAIBaseUrl().trim();
    if (!baseUrl) {
      yield {
        type: 'error',
        error: { message: 'No endpoint URL configured. Open settings and paste a /v1/chat/completions URL.' },
      };
      return;
    }
    yield* openaiCompatChat(
      {
        url: baseUrl,
        apiKey,
        request: req,
      },
      signal
    );
  },
};
