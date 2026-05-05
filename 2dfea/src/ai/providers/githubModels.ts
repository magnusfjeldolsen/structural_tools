/**
 * GitHub Models provider — the default free tier.
 *
 * Calls `POST https://models.github.ai/inference/chat/completions` with a
 * GitHub PAT. The wire format is OpenAI-compatible, so we delegate to
 * {@link openaiCompatChat}.
 *
 * Phase 0 (spike) confirmed (per the user's hand-off):
 *   - CORS from a localhost / GH Pages origin is fine.
 *   - Tool calling round-trips on `openai/gpt-4o-mini`.
 *   - Vision works on `openai/gpt-4o-mini`.
 *
 * Free-tier rate-limit UX is plan §5.6 verbatim — handled in the dialog
 * (this file does not embellish or paraphrase). Phase 6 will parse 429
 * headers and surface a "switch to BYO-key" countdown link (§5.6 Rate-limit
 * UX requirement).
 */

import {
  type AIProvider,
  type ChatChunk,
  type ChatRequest,
  type CuratedModel,
} from './types';
import { openaiCompatChat } from './openaiCompatStream';

export const GITHUB_MODELS_TOKEN_KEY = '2dfea-ai-token-github-models';
const GITHUB_MODELS_ENDPOINT = 'https://models.github.ai/inference/chat/completions';

/**
 * Curated list per plan §5.6.5. Names verified against the provider's docs at
 * implementation time; substitute if a specific id is deprecated.
 *
 * Decision (plan §12.1, logged for the PR): the v1 picks below match the
 * plan's recommended set. `openai/gpt-4o-mini` is the default — vision +
 * tool calling confirmed by the Phase 0 spike, and it is the "famous mini"
 * the user explicitly asked about.
 */
const GITHUB_MODELS_CURATED: CuratedModel[] = [
  { id: 'openai/gpt-4o-mini', supportsVision: true, supportsToolCalls: true },
  { id: 'openai/gpt-4.1-mini', supportsVision: true, supportsToolCalls: true },
  { id: 'openai/gpt-4.1-nano', supportsVision: false, supportsToolCalls: true },
  { id: 'microsoft/phi-4', supportsVision: false, supportsToolCalls: true },
  { id: 'meta/llama-3.1-8b-instruct', supportsVision: false, supportsToolCalls: true },
  { id: 'mistral/mistral-small', supportsVision: false, supportsToolCalls: true },
];

const GITHUB_MODELS_SECURITY_WARNING = `Your GitHub Personal Access Token will be stored in this browser's localStorage and sent only to \`models.github.ai\`. Anyone with access to this browser, or who exploits an XSS bug on this page, can read the token. Use a fine-grained PAT scoped to **\`models:read\` only**, with a short expiration. You can revoke it any time at github.com/settings/tokens.

**Free-tier limits**: GitHub Models' free tier rate-limits both requests-per-minute and requests-per-day. With short prompts on a lightweight model (e.g. \`openai/gpt-4o-mini\`), expect roughly **30+ short prompts per day** comfortably; heavy iterative sessions will hit the daily cap. When you do, switch to a paid provider below (Anthropic / OpenAI) using your own key, or wait for the daily reset. The exact current limits are at github.com/marketplace/models — they vary by model tier.`;

export const githubModelsProvider: AIProvider = {
  id: 'github-models',
  displayName: 'GitHub Models (free)',
  defaultModel: 'openai/gpt-4o-mini',
  availableModels: GITHUB_MODELS_CURATED,
  supportsVision: true,
  supportsToolCalls: true,
  requiresNetwork: true,
  tokenStorageKey: GITHUB_MODELS_TOKEN_KEY,
  securityWarning: GITHUB_MODELS_SECURITY_WARNING,
  validateTokenFormat(token: string): string | null {
    const trimmed = token.trim();
    if (!trimmed) return 'Enter a GitHub Personal Access Token.';
    // Classic PATs: ghp_…  Fine-grained: github_pat_…
    if (!trimmed.startsWith('ghp_') && !trimmed.startsWith('github_pat_')) {
      return "GitHub PATs usually start with 'ghp_' or 'github_pat_'. Double-check you pasted a PAT and not a different key.";
    }
    return null;
  },
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk> {
    const apiKey = (typeof localStorage !== 'undefined'
      ? localStorage.getItem(GITHUB_MODELS_TOKEN_KEY)
      : null) ?? '';
    return openaiCompatChat(
      {
        url: GITHUB_MODELS_ENDPOINT,
        apiKey,
        request: req,
      },
      signal
    );
  },
};
