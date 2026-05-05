/**
 * Provider registry / factory.
 *
 * Single source of truth for the list of v1 providers. Consumers use:
 *   - {@link PROVIDERS} to iterate or render the dropdown
 *   - {@link getProvider}(id) to look up the active adapter
 *   - {@link DEFAULT_PROVIDER_ID} as the seed value for fresh installs
 *
 * Plan §5.3 / §5.6.5.
 */

import type { AIProvider, ProviderId } from './types';
import { manualProvider } from './manual';
import { githubModelsProvider } from './githubModels';
import { anthropicProvider } from './anthropic';
import { openaiProvider } from './openai';
import { customOpenAIProvider } from './customOpenAI';

/**
 * Render order in the settings dialog. GitHub Models leads because it is
 * the default free tier (Phase 0 confirmed CORS + tool calls + vision all
 * work). Manual is last — it is an offline / debugging path.
 */
export const PROVIDERS: readonly AIProvider[] = [
  githubModelsProvider,
  anthropicProvider,
  openaiProvider,
  customOpenAIProvider,
  manualProvider,
];

const PROVIDER_BY_ID = new Map<ProviderId, AIProvider>(
  PROVIDERS.map((p) => [p.id, p])
);

export function getProvider(id: ProviderId): AIProvider {
  const p = PROVIDER_BY_ID.get(id);
  if (!p) {
    throw new Error(`Unknown AI provider id: ${id}`);
  }
  return p;
}

export const DEFAULT_PROVIDER_ID: ProviderId = 'github-models';

export {
  manualProvider,
  githubModelsProvider,
  anthropicProvider,
  openaiProvider,
  customOpenAIProvider,
};
export type { AIProvider, ProviderId };
export type { ChatChunk, ChatRequest, ChatMessage, ToolDefinition, CuratedModel } from './types';
