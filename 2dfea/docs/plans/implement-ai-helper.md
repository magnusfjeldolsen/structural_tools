# 2dfea AI Model Helper

## 1. TL;DR

Add a floating **AI Assistant** panel inside the existing 2dfea React app. The user types a prompt (and optionally drops screenshots / PDF pages), an LLM responds by calling tool(s) we expose, and the model materialises on the canvas. The trust boundary is reused, not rebuilt: the AI's structural output is funnelled through the existing `ModelFileV1Schema` (Zod) and the existing `applyToStore` mutation path — the same pipeline that already validates Save/Load JSON. Provider is **first-class pluggable**: a free zero-config tier (GitHub Models with a user PAT) **and** bring-your-own-key tiers for Anthropic, OpenAI, and any OpenAI-compatible endpoint (Groq, OpenRouter, local Ollama proxy, etc.) ship together in v1. Per-provider security warnings are surfaced **in the settings dialog itself** — never buried in docs. PDFs are lazy-rendered to PNGs via `pdfjs-dist` so users who never use the feature don't pay the bundle cost. The feature ships entirely inside the existing 2dfea Vite build — no new module, no workflow changes, no schema bump.

## 2. Context & Assumptions

- **Deployment target**: 2dfea app only (`2dfea/`). React 18 + TypeScript 5.3 + Vite 5 + Zustand 4.4 + Immer + Konva + zundo + Pyodide-hosted PyNite. Triggers `.github/workflows/deploy-all-modules.yml` on push to `master`/`main` touching `2dfea/**`. **No plain HTML modules touched. No deploy workflow change.**

- **Source of truth for the feature**: the verified user ask, refined across two rounds of feedback in this conversation. The two load-bearing user statements:

  > i want to plan an AI helper that lets the user write prompts, drop screenshots/pdfs and then have an AI creating the fe model for the user

  > does the plan allow the user to both use a free ai, but also wire up their own ai? […] The dialog should say this plainly per provider, not bury it in docs.

- **Schema is NOT bumped.** The current published schema `v1.1.0` (locked in by `member-end-releases-mz.md`) is what the AI emits. AI output is validated by the existing `ModelFileV1Schema` — no parallel validator, no relaxed schema for the LLM. Reusing the strict schema is the whole point.

- **`applyToStore` is the only mutation path for full-model AI output.** AI fine-grained edits use the existing public store actions (`addNode`, `updateElement`, `addNodalLoad`, etc.). No new mutation logic, no internal-only store API.

- **Locked-in design decisions** (do not re-evaluate; bake straight into §5):

  1. **Two complementary tool surfaces**, not one:
     - **`set_model`** (primary): single tool whose `input_schema` is the existing `2dfea-model-v1.json` JSON Schema. Atomic replacement via `applyToStore`. Used for "make me a model from this prompt/image".
     - **Fine-grained edit tools** (secondary): `add_node`, `add_element`, `update_element`, `add_nodal_load`, `add_distributed_load`, `add_element_point_load`, `delete_node`, `delete_element`, `delete_load`, `add_load_case`, `add_load_combination`. Each maps 1:1 to an existing store action. Enabled **only when the model is non-empty** (system-prompt instruction + runtime guard in the dispatcher) so the LLM doesn't try to incrementally build from scratch.
  2. **Provider abstraction is a first-class `AIProvider` interface** with five v1 adapters: `github-models`, `anthropic`, `openai`, `custom-openai-compatible` (user supplies endpoint URL), `manual` (no network — paste responses, used for offline / fixture testing). All five ship in Phase 1 — no "feature flag for v1" tier reduction.
  3. **Settings dialog shows per-provider security warnings inline**, not in a tooltip and not in docs. Each provider entry in the dropdown carries its own warning text rendered next to the API key field. Token storage is `localStorage`, scoped per-provider key (`2dfea-ai-token-{provider}`), never shared across providers.
  4. **Repair loop on validation failure**, max 3 retries. When `ModelFileV1Schema.safeParse` rejects the LLM's `set_model` payload, the Zod error tree is formatted as a tool-result message and fed back to the LLM as the next-turn user message. After 3 failures we give up and surface the last error to the user. No silent partial-apply.
  5. **`set_model` reuses `applyToStore` exactly as-is.** That means: tracked slice replaced wholesale, analysis cache invalidated via `INVALIDATE_ANALYSIS_PATCH`, undo history cleared via `useModelStore.temporal.getState().clear()`. Same contract as Save/Load JSON import. The user cannot "undo back into the pre-AI model" — consistent with file import.
  6. **Fine-grained edit tools produce normal Zustand mutations** that are tracked by zundo. A burst of edit-tool calls within a single LLM turn will coalesce into a single undo step via the existing 100ms throttle in `historyConfig.ts` — same as drag-and-drop multi-selects do today.
  7. **Direction enum case sensitivity is repeated verbatim in the system prompt.** The schema author already flagged it ("Lowercase = local, uppercase = global. This is a known AI-generation footgun" — `2dfea/src/io/schema.ts:43-47`). The system prompt cites this rule explicitly, and the strict Zod enum will reject mistakes hard.
  8. **PDF rendering is lazy-loaded.** `pdfjs-dist` is imported via `await import(...)` only when the user drops their first PDF. Cold load adds ~600 KB; not paid by users who only use text or images.
  9. **Image preprocessing client-side**: dropped images are resized to ≤1024 px on the long edge via Canvas API before encoding to base64. PDFs follow the same path post-rasterisation.
  10. **Hard cap of 8 page-images per request** to protect rate limits and context. Page picker UI lets the user choose which pages.
  11. **Streamed assistant text** rendered into the transcript as it arrives. Tool calls are *not* applied incrementally — only after the LLM commits the call. Avoids the "half-built model flickering on canvas" UX.
  12. **No telemetry to network.** This is a public static site; we do not phone home. Local-only counters (tool calls, retries, validation failures) are surfaced in a debug panel and that's it.
  13. **Token security copy is plain English, per provider, in the dialog.** Sample warnings drafted in §5.6.

- **Codebase references** (trust these; line numbers are illustrative, the implementer reads in-place):
  - `2dfea/src/io/schema.ts` — `ModelFileV1Schema` is the validator; `2dfea/public/schemas/2dfea-model-v1.json` is the regenerated JSON Schema (built by `2dfea/src/io/generateJsonSchema.ts` in the prebuild step).
  - `2dfea/src/io/applyToStore.ts` — the wholesale-replacement mutation path. AI's `set_model` calls this directly.
  - `2dfea/src/io/schemaVersion.ts` — `CURRENT_SCHEMA_VERSION = '1.1.0'`. **Not bumped** by this feature.
  - `2dfea/src/store/useModelStore.ts` — public actions used by edit tools.
  - `2dfea/src/store/historyConfig.ts` — `INVALIDATE_ANALYSIS_PATCH` (used inside `applyToStore`); the 100 ms throttle that coalesces edit-tool bursts.
  - `2dfea/src/analysis/types.ts` — entity types the AI needs to know about (already encoded in the JSON Schema).
  - `2dfea/src/App.tsx` — mount point for the new `<AIPanel />` (floating; not part of layout flow).
  - `2dfea/vite.config.ts` — needs `pdfjs-dist` worker URL handling.
  - `2dfea/package.json` — add `pdfjs-dist`. Optional: `eventsource-parser` for SSE streaming if a provider chooses SSE over fetch-stream.
  - `2dfea/vitest.config.ts` — Vitest already configured; new tests slot in.

- **Vitest is in scope.** New tests live next to the code under `2dfea/src/ai/`.

## 3. Goals (Definition of Done)

Each goal is observable and must be verifiable post-merge.

1. A floating "AI" button is visible in the 2dfea app shell (top-right of the canvas area). Clicking opens the `<AIPanel />`.
2. Settings dialog lists five providers (GitHub Models / Anthropic / OpenAI / Custom OpenAI-compatible / Manual). Each provider's row shows a plain-English security warning inline, not in a tooltip.
3. With **GitHub Models + a valid PAT scoped `models:read`**, the prompt "make a 6 m simply supported beam, UDL 10 kN/m" produces a valid model on the canvas, and `Run Analysis` succeeds.
4. With **any of the four BYO-key providers**, the same prompt produces the same outcome (assuming the user's chosen model supports tool calls — fallback path below).
5. **Image input**: dropping a screenshot of a frame sketch produces a model that matches the sketch's topology (subject to LLM ability; verified by ≥1 fixture test against a known sketch).
6. **PDF input**: dropping a 1-page PDF of a frame elevation, picking that page in the page picker, produces an equivalent model. PDF rendering is lazy-loaded — bundle analysis confirms `pdfjs-dist` is in a separate chunk.
7. **Repair loop**: when the LLM emits invalid JSON (e.g. wrong direction enum case), the Zod error is fed back as a tool-result and the next turn fixes it. Bounded to 3 retries; on retry exhaustion the last error is shown to the user.
8. **Edit tools**: with a model already on the canvas, "make element E2 a hinge at the start" calls `update_element` with `releaseStartMz: true` and the canvas updates. The change is undoable (single Ctrl+Z step).
9. **Token security**: tokens are stored in `localStorage` per-provider, never logged to console, never sent to any provider other than the one they belong to. "Clear token" button in the dialog wipes the relevant key.
10. **Manual provider works fully offline**: with no network, the user can paste an LLM response into the manual provider and the rest of the pipeline (validation, repair-loop UI, applyToStore) runs identically.
11. `cd 2dfea && npm run type-check`, `cd 2dfea && npm test`, `cd 2dfea && npm run build` all green.
12. `pr-checks.yml` green on the feature PR (or each phase PR).
13. Manual QA Groups A–G (defined in §8) all pass.
14. No console errors or React warnings in dev or preview.
15. **Schema unchanged**: `CURRENT_SCHEMA_VERSION` still `'1.1.0'` after merge; `2dfea-model-v1.json` regenerates byte-identically.

## 4. Non-Goals

Explicitly out of scope:

- **No schema bump.** The AI emits v1.1.0 JSON. Schema lives where it lives.
- **No new validation logic.** Reuse `ModelFileV1Schema` as-is. If the schema needs new permissiveness for an AI corner case, that's a schema discussion, not an AI-feature discussion.
- **No new mutation path on the store.** `applyToStore` for full-model output, public store actions for edits.
- **No "agentic mode" that runs analysis automatically.** The AI builds the model; the user clicks `Run Analysis` like always. (Future: an analyze tool that returns numerical results to the LLM. Not in v1.)
- **No PDF text extraction / OCR.** PDFs are rasterised to images and fed to a vision model. Native PDF text extraction is a follow-up.
- **No conversation persistence across page reloads.** Conversation history is in-memory only. The model itself persists via the existing localStorage path; the chat does not.
- **No server-side proxy.** The whole feature is client-side. If GitHub Models browser CORS is broken (Phase 0 spike — see §7), we surface the limitation honestly and rely on `manual` provider as the documented fallback. We do **not** stand up a serverless proxy as part of this feature.
- **No telemetry to network.** Local debug counters only.
- **No scrubbing of PII in prompts/images.** The user is responsible for what they upload. Settings dialog warns this.
- **No multi-user / shared conversation features.** Single-user, single-tab, in-memory.
- **No autocompletion of partial models.** If `set_model` returns invalid JSON, we run the repair loop; we do not "merge what we can".
- **No keyboard shortcut** for opening the panel in v1. Click-to-open. Polish follow-up.
- **No change to `tsconfig.json`, the deploy workflow, the GA tag, or any plain HTML module.**

## 5. Architecture & Design

### 5.1 Where the feature lives

Feature code lives under a single new directory `2dfea/src/ai/` plus three React components and two `App.tsx` lines:

```
2dfea/src/ai/
├── providers/
│   ├── types.ts                       ← AIProvider interface, ChatRequest/ChatChunk
│   ├── githubModels.ts                ← OpenAI-compatible, default
│   ├── anthropic.ts                   ← @anthropic-ai/sdk, dangerouslyAllowBrowser
│   ├── openai.ts                      ← openai SDK, dangerouslyAllowBrowser
│   ├── customOpenAI.ts                ← user-supplied baseURL, OpenAI-compatible
│   ├── manual.ts                      ← paste responses, no network
│   ├── index.ts                       ← provider registry, factory
│   └── providers.test.ts              ← shape conformance + manual provider unit tests
├── tools/
│   ├── schema.ts                      ← imports public/schemas/2dfea-model-v1.json
│   ├── definitions.ts                 ← set_model + edit-tool descriptors
│   ├── dispatch.ts                    ← tool-call → store action mapping
│   └── dispatch.test.ts               ← fixture LLM responses → assert store state
├── repairLoop.ts                      ← bounded retry on Zod failure
├── repairLoop.test.ts
├── systemPrompt.ts                    ← composes system prompt; embeds schema warnings
├── systemPrompt.test.ts
├── attachments/
│   ├── imageUtils.ts                  ← resize/encode to base64
│   ├── imageUtils.test.ts
│   ├── pdfRender.ts                   ← lazy pdfjs-dist; page → PNG base64
│   └── pdfRender.test.ts
├── store/
│   └── useAIStore.ts                  ← UI-only Zustand store: open/closed, transcript, status
└── debug/
    └── localCounters.ts               ← in-memory tool-call / retry / failure counters
```

```
2dfea/src/components/
├── AIPanel.tsx                        ← floating panel: input, dropzone, transcript
├── AIPanel.test.tsx
├── AISettingsDialog.tsx               ← provider picker, token entry, per-provider warnings
└── AISettingsDialog.test.tsx
```

```
2dfea/src/App.tsx                      ← +1 import, +1 <AIPanel /> render line
2dfea/vite.config.ts                   ← pdfjs-dist worker URL handling
2dfea/package.json                     ← + pdfjs-dist (and provider SDKs if used)
```

Tests + fixture:

```
2dfea/src/ai/__fixtures__/llm-responses/
├── valid-cantilever.json              ← good set_model response
├── invalid-direction-case.json        ← Fy → fy (case wrong) — repair-loop test
├── invalid-missing-node.json          ← element references nonexistent node
└── multi-turn-edit.json               ← initial set_model + follow-up update_element

2dfea/src/ai/__fixtures__/sketches/
├── frame-portal.png                   ← simple portal frame sketch
└── beam-cantilever.pdf                ← single-page PDF for PDF flow test
```

### 5.2 Trust boundary

```
LLM tool call ──► dispatch.ts ──► branch on tool name:
  set_model:
    JSON ──► ModelFileV1Schema.safeParse ──► applyToStore(file)
                  │ on failure
                  └──► repairLoop: format error, send back to LLM (max 3)
  add_node / add_element / ...:
    args ──► useModelStore.getState().<action>(args)
                  │ on store-level error (e.g. missing node ref)
                  └──► repairLoop: format error, send back to LLM (max 3)
```

`set_model` reuses the existing strict Zod schema. Edit tools have lighter-weight per-arg validation (Zod parsers defined alongside each tool descriptor in `definitions.ts` so the same shape we describe to the LLM is the shape we enforce at runtime). No bypass paths.

### 5.3 Provider abstraction

```ts
// 2dfea/src/ai/providers/types.ts
export type ProviderId =
  | 'github-models'
  | 'anthropic'
  | 'openai'
  | 'custom-openai-compatible'
  | 'manual';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ChatContentBlock[];
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ChatContentBlock {
  type: 'text' | 'image';
  text?: string;
  imageBase64?: string;        // 'data:image/png;base64,...' or raw base64
  imageMediaType?: 'image/png' | 'image/jpeg';
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;          // JSON-parsed
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: ToolDefinition[];     // OpenAI-style; adapters translate to provider-native
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  textDelta?: string;
  toolCall?: ToolCall;
  error?: { message: string; code?: string };
}

export interface AIProvider {
  id: ProviderId;
  displayName: string;
  defaultModel: string;
  availableModels: string[];   // user can also free-text a model id
  supportsVision: boolean;
  supportsToolCalls: boolean;
  /** Human-readable security warning shown in the settings dialog. */
  securityWarning: string;
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatChunk>;
}
```

Each adapter is responsible for translating the provider-neutral `ChatRequest` to its native HTTP shape and back. Anthropic's content-block model is the common denominator; OpenAI's is flatter. The adapters absorb the difference.

### 5.4 Tool definitions

The published JSON Schema is **derived from the live Zod schema at runtime** via `zod-to-json-schema` (already a 2dfea dep — see `package.json`). This eliminates a fragile cross-`public/` import and guarantees the LLM contract is byte-identical to the validator that will check its output, including any future MINOR schema bumps. The published `public/schemas/2dfea-model-v1.json` is not loaded at runtime by this feature — it stays purely for external consumers (other AI integrations, doc generators).

```ts
// 2dfea/src/ai/tools/schema.ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ModelFileV1Schema } from '../../io/schema';
import { CURRENT_SCHEMA_VERSION } from '../../io/schemaVersion';

/** Computed once on module load — the schema is immutable for a given build. */
export const MODEL_JSON_SCHEMA = zodToJsonSchema(ModelFileV1Schema, {
  name: `2dfea-model-v${CURRENT_SCHEMA_VERSION}`,
  $refStrategy: 'none',  // inline everything — providers vary in $ref support
});
```

```ts
// 2dfea/src/ai/tools/definitions.ts
import { MODEL_JSON_SCHEMA } from './schema';

export const setModelTool: ToolDefinition = {
  name: 'set_model',
  description:
    'Replace the entire FE model. Use for initial creation from a prompt or image. ' +
    'The argument MUST validate against the v1.1.0 model schema. ' +
    'Direction enums are CASE SENSITIVE: Fx/Fy/Mz = local; FX/FY/MZ = global.',
  input_schema: MODEL_JSON_SCHEMA,
};

export const addNodeTool: ToolDefinition = {
  name: 'add_node',
  description: 'Add a single node. Use only when a model already exists on the canvas.',
  input_schema: {
    type: 'object',
    required: ['x_m', 'y_m', 'support'],
    properties: {
      x_m: { type: 'number' },
      y_m: { type: 'number' },
      support: { enum: ['fixed', 'pinned', 'roller-x', 'roller-y', 'free'] },
    },
    additionalProperties: false,
  },
};
// ... add_element, update_element, add_nodal_load, add_distributed_load,
//     add_element_point_load, delete_node, delete_element, delete_load,
//     add_load_case, add_load_combination
```

Edit tools are listed in the `tools` array sent to the LLM **only** when `useModelStore.getState().nodes.length > 0`. When the model is empty, only `set_model` is offered. This prevents the LLM from trying to incrementally build from an empty model — the failure mode that motivated using `set_model` as primary.

### 5.5 System prompt (verbatim skeleton)

```
You are a structural engineer's assistant inside a 2D frame analysis editor.

# Output

Your job is to produce a valid 2D frame model by calling tools. Do not produce
free-form JSON in your text replies — call set_model with the JSON as the argument.

# Units (locked, do not vary)

- Length: meters (m)
- Force: kilonewtons (kN)
- Moment: kilonewton-meters (kNm)
- Young's modulus: gigapascals (GPa)
- Moment of inertia: m^4
- Cross-section area: m^2

# Conventions

- Y is up. X is right.
- Nodes named N1, N2, ...; Elements named E1, E2, ...
- Default load cases "Dead" and "Live" already exist; reuse them when possible.
- Supports: 'fixed' | 'pinned' | 'roller-x' | 'roller-y' | 'free'.

# Direction enums — CASE SENSITIVE

- 'Fx', 'Fy', 'Mz'   → LOCAL  (along/perpendicular to the member, about local z)
- 'FX', 'FY', 'MZ'   → GLOBAL (along world X/Y, about world Z)

This is the most common output error. Re-read your tool argument before calling.

# Workflow

1. If the user attached an image or PDF, identify nodes, members, supports, and loads.
2. State your interpretation in 2-3 sentences.
3. Call set_model with a complete, self-consistent model.
4. If the tool returns a validation error, READ the error and CORRECT the JSON.
   Do not retry the same JSON. Use update_*/add_*/delete_* tools for follow-up
   refinements once a model exists.

# Hard rules

- Every element's nodeI/nodeJ MUST reference an existing node name in your output.
- Every load's `node` / `element` MUST reference an existing entity.
- All numeric fields MUST be finite (no NaN, no Infinity).
- E_GPa, I_m4, A_m2 must all be > 0.
```

The runtime injects an additional fragment when the model is non-empty:

```
# Current model state

The user already has a model on the canvas:
- {N} nodes, {M} elements, {L} loads, cases: [{Dead, Live, ...}]

Use the edit tools (add_node, update_element, ...) to refine. Do NOT call
set_model unless the user explicitly asks to start over.
```

### 5.6 Per-provider security warnings (shown inline in the settings dialog)

These are the *exact strings* drafted for the dialog. Each provider's row renders its warning text below the API key field, in a yellow-background callout.

**GitHub Models** (default):
> Your GitHub Personal Access Token will be stored in this browser's localStorage and sent only to `models.github.ai`. Anyone with access to this browser, or who exploits an XSS bug on this page, can read the token. Use a fine-grained PAT scoped to **`models:read` only**, with a short expiration. You can revoke it any time at github.com/settings/tokens.
>
> **Free-tier limits**: GitHub Models' free tier rate-limits both requests-per-minute and requests-per-day. With short prompts on a lightweight model (e.g. `openai/gpt-4o-mini`), expect roughly **30+ short prompts per day** comfortably; heavy iterative sessions will hit the daily cap. When you do, switch to a paid provider below (Anthropic / OpenAI) using your own key, or wait for the daily reset. The exact current limits are at github.com/marketplace/models — they vary by model tier.

**Rate-limit UX requirement (driven by user expectation set in Phase 0 handoff)**: the panel must surface remaining-quota information when GitHub Models returns it (via response headers), and the rate-limit error UI (Phase 6) must include a one-click "switch to BYO-key" link that opens the settings dialog with the Anthropic/OpenAI/Custom rows visible. This converts "free tier exhausted" from a dead-end into a continuation path.

**Anthropic**:
> Your Anthropic API key will be stored in this browser's localStorage and sent directly from your browser to api.anthropic.com (this requires `dangerouslyAllowBrowser`). Browser-side keys can be exfiltrated by any XSS on this page. **Anthropic recommends using API keys server-side, not from a browser.** If you accept the risk, generate a key with the lowest practical usage limit at console.anthropic.com.

**OpenAI**:
> Your OpenAI API key will be stored in this browser's localStorage and sent directly from your browser to api.openai.com (this requires `dangerouslyAllowBrowser`). Browser-side keys can be exfiltrated by any XSS on this page. **OpenAI explicitly discourages exposing keys in client-side code.** If you accept the risk, set a per-key usage limit at platform.openai.com.

**Custom OpenAI-compatible**:
> Your endpoint URL and API key are stored in this browser's localStorage and sent directly to the URL you provide. Verify the endpoint supports browser CORS for `POST /v1/chat/completions`. If you point this at a local proxy (Ollama, LiteLLM, vLLM), no key is leaked off your machine.

**Manual** (paste responses):
> No network calls are made. You will paste the LLM's JSON response into the panel manually. Use this when you don't have an API key, or to test the validation/repair pipeline with a known fixture.

The dialog also has a single global notice at the top:

> Tokens never leave this browser except to the provider you select. This app is a static GitHub Pages site — there is no backend that ever sees your key. Trade-off: a static site cannot keep keys secret. Treat browser-stored API keys like browser-stored passwords.

### 5.6.5 Curated lightweight model lists (per provider)

The user explicitly asked that the famous lightweight models be available — `gpt-4o-mini` and its peers. Each provider exposes a curated dropdown of 3–5 model ids, with the cheapest viable vision+tools model as the default. An "Other..." entry at the bottom of every list opens a free-text field so a user can paste any model id their provider supports. Curated lists are stored as static metadata in `ai/providers/<provider>.ts` and are easy to update.

The list below is the v1 default. Implementer should sanity-check each entry against the provider's docs at implementation time and substitute if any have been deprecated. **Document the final picks in the PR description for Phase 1.**

**`github-models`** — provider's catalog hosts many small models behind one OpenAI-compatible API. All called as `<publisher>/<model>`.
- `openai/gpt-4o-mini` *(default)* — cheap, vision, reliable tool calling. The "famous mini" the user asked about.
- `openai/gpt-4.1-mini` — newer "mini"; better at structured output / JSON-schema adherence than 4o-mini.
- `openai/gpt-4.1-nano` — cheapest OpenAI on the platform; weaker vision; tool calling adequate.
- `microsoft/phi-4` — Microsoft's small-but-strong; tool calling support varies.
- `meta/llama-3.1-8b-instruct` — fastest; **no vision**; tool calling weakest of the curated set. Good for text-only edit-tool usage.
- `mistral/mistral-small` — cheap, EU-hosted alternative; tool calling support varies.
- "Other..." (free text)

**`openai`** (direct):
- `gpt-4o-mini` *(default)* — vision, tools, mature.
- `gpt-4.1-mini` — newer, slightly better tool-call adherence.
- `gpt-4.1-nano` — cheapest; text-leaning.
- `gpt-4o` — premium fallback when mini fails repair-loop too often.
- "Other..."

**`anthropic`** (direct):
- `claude-haiku-4-5-20251001` *(default)* — vision, tools, cheapest current Claude.
- `claude-sonnet-4-6` — better reasoning; ~5× cost; the recommended balance for hard prompts.
- `claude-opus-4-7` — most capable; 1M-context variant exists for very large PDFs (`claude-opus-4-7[1m]`).
- "Other..."

**`custom-openai-compatible`**: no defaults — the user's endpoint dictates what's available. Free-text model id, with placeholder examples in the field to nudge:
- Groq free tier: `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768`
- OpenRouter: `google/gemini-2.0-flash-001`, `google/gemini-flash-1.5`, `meta-llama/llama-3.3-70b-instruct`
- Cerebras: `gpt-oss-120b`, `llama-3.3-70b`
- Local Ollama / LiteLLM proxy: `qwen2.5:7b`, `llama3.2:3b`, etc.

**`manual`**: N/A. The "model" field is hidden — this provider doesn't make network calls.

#### Vision support badge

Each curated model carries a `supportsVision: boolean` flag. The composer reads this flag and:
- Greys out the image/PDF drop-zone when the active model has `supportsVision: false`.
- Shows a one-line tooltip ("This model is text-only — switch to a vision model to use images / PDFs").
- Allows the user to switch model from the tooltip without leaving the panel.

This is the difference between "broken" and "obvious" UX when a user picks a small, text-only model and then drops a PDF. **Robustness against the most likely first-use mistake.**

### 5.7 UI placement

`<AIPanel />` is a floating, draggable panel anchored top-right of the canvas area when collapsed it shows as a small "AI" pill button. Expanded it is ~420 px wide × 600 px tall. It does **not** consume layout space (mounted at the App root, `position: fixed`). Z-index above the canvas, below the existing `LoadInputDialog` modal so dialogs win when both are open.

The panel has three vertical regions:

1. **Header**: model badge ("GitHub Models · gpt-4o-mini" or similar), settings cog, minimize / close.
2. **Transcript** (scrollable): user messages, assistant streamed text, tool-call cards (collapsible JSON), validation-error cards (red border), repair-loop indicator.
3. **Composer**: textarea, drop-zone, attachment thumbnails, send button. Drop-zone accepts `image/*` and `application/pdf`. Paste-from-clipboard wired (images only).

The settings cog opens `<AISettingsDialog />` modal — provider dropdown, API key field, model picker, per-provider warning text, "Clear token" and "Clear conversation" buttons.

### 5.8 PDF flow (lazy-loaded)

```ts
// 2dfea/src/ai/attachments/pdfRender.ts
let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null;

export async function renderPdfToImages(
  file: File,
  selectedPages: number[],   // 1-indexed
  longEdgePx = 1024
): Promise<{ pageNumber: number; imageBase64: string }[]> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist');   // ← chunk split here
    // worker URL configured in vite.config.ts via ?url import
  }
  const pdfjs = await pdfjsModulePromise;
  const doc = await pdfjs.getDocument(await file.arrayBuffer()).promise;
  // ... render each selected page to <canvas>, toDataURL('image/png'), strip prefix
}
```

The page picker is a modal: `pdfjs-dist` renders thumbnails (≤200 px), user clicks pages to include, confirms. Hard cap of 8 pages enforced in the UI ("you can select 8 of 23 pages").

### 5.9 Repair loop

```ts
// 2dfea/src/ai/repairLoop.ts
export interface RepairContext {
  maxRetries: 3;
  attempt: 0 | 1 | 2 | 3;
  lastError: string | null;
}

export function formatZodErrorForLLM(err: ZodError): string {
  // Walk err.issues, produce a numbered list with `path` and `message`,
  // e.g. "1. model.elements[0].direction: Invalid enum value. Expected
  // 'Fx' | 'Fy' | 'FX' | 'FY', received 'fx'"
  // Bound output to ~50 issues to avoid context blow-up.
}
```

The error message is wrapped as a `tool` role message tied to the `tool_call_id`, then the LLM is invoked again with the same conversation. After 3 failures, the panel renders the last error in a red card and stops. The user can edit their prompt and try again.

### 5.10 Edit tools enabled gate

In `dispatch.ts`:

```ts
function getActiveTools(): ToolDefinition[] {
  const state = useModelStore.getState();
  const isEmpty = state.nodes.length === 0 && state.elements.length === 0;
  return isEmpty ? [setModelTool] : [setModelTool, ...editTools];
}
```

Called fresh on every turn (not memoised), so the tool list reflects the current model. The system prompt's "current model state" fragment (§5.5) is also recomputed per turn from `useModelStore.getState()`.

### 5.11 Streaming

Provider-native streaming is consumed as `AsyncIterable<ChatChunk>`. The composer dispatches an action that:

1. Pushes a placeholder assistant message into the transcript (status: 'streaming').
2. Iterates chunks; appends `textDelta` to the placeholder.
3. On `tool_call` chunk, finalises the message and starts a new tool-call card.
4. On `done`, runs the dispatcher; on `error`, surfaces the error inline.

Tool calls are *not* dispatched mid-stream — only after the LLM commits the call (i.e. the `tool_call` chunk has the full JSON). This is necessary because partial JSON cannot be Zod-validated without false-negatives.

### 5.12 Vite config additions

`pdfjs-dist` ships its worker as a separate file. Two changes in `vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  // ... existing config
  optimizeDeps: {
    // pdfjs-dist must NOT be pre-bundled, or its worker breaks
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',   // pdfjs-dist worker is ESM
  },
});
```

And the worker URL is wired at first use:

```ts
// inside renderPdfToImages, before getDocument():
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

`?url` is Vite's URL-import suffix; it produces a hashed asset URL that survives the GH Pages base-path prefix automatically.

### 5.13 Bundle size guards

The existing 2dfea bundle is small. AI feature adds:

| Provider SDK | Approx gzipped | Loaded when |
|---|---|---|
| `@anthropic-ai/sdk` | ~30 KB | only if user picks Anthropic |
| `openai` | ~25 KB | only if user picks OpenAI |
| `pdfjs-dist` | ~600 KB total (worker + main) | only on first PDF drop |

All three are dynamic-imported inside their respective adapter / utility, so the default bundle (GitHub Models + manual + text/image) only adds the chat plumbing (~10–15 KB). Phase 6 manual QA includes a `vite-bundle-visualizer` pass to confirm.

### 5.14 Robustness contract (consolidated)

This section enumerates the failure modes that the implementer must explicitly handle. Each item ties to code in `2dfea/src/ai/`. **An item is not "done" until it has either a unit test or an explicit acceptance step in §8.**

#### 5.14.1 Cancellation & abort

- Every `chat(req, signal)` call accepts an `AbortSignal`. The composer's "Stop" button (visible during streaming) calls `controller.abort()`.
- On abort, the in-flight assistant message is finalised with status `'aborted'` (transcript shows "[stopped]"). No tool calls dispatched. Conversation history truncates to the last successful turn.
- PDF rasterisation (`renderPdfToImages`) accepts the same abort signal and stops mid-page rendering.
- Aborts MUST never leave dangling promises that throw later. All async work uses `try/finally` to clear pending UI state.

#### 5.14.2 Streaming stall timeout

- A 60-second no-chunk timer. If no `ChatChunk` arrives for 60s, the adapter aborts with a `'stall'` error.
- Timer resets on every chunk (text-delta or tool-call partial).
- UX: friendly "the model stopped responding — try again" card.

#### 5.14.3 Payload size guards

| Limit | Value | Where enforced |
|---|---|---|
| Max attachments per message | 8 | composer drop-zone |
| Max single image (post-resize) | 1024 px long edge | `imageUtils.ts` |
| Max single image bytes | 4 MB after base64 | `imageUtils.ts` (re-encode if exceeded) |
| Max PDF pages selectable | 8 | page-picker UI |
| Max total request body | 20 MB | adapter pre-flight (sum of base64 attachments + JSON) |
| Max tool-call argument bytes | 1 MB | `dispatch.ts` before `JSON.parse` |
| Max conversation turns kept | 20 (system + last 19 messages) | `useAIStore.send()` |

Hitting any limit produces a friendly error card; nothing is silently dropped.

#### 5.14.4 Race conditions

- Submit is **blocked** while a request is in-flight. The send button becomes a "Stop" button.
- AI dispatch is **blocked** while `useModelStore.getState().isAnalyzing === true`. Edit tools surface "wait for analysis to finish" error; `set_model` does the same. Avoids the analyze-on-stale-model worker hazard.
- Switching providers mid-conversation **clears the conversation** and shows a one-line confirmation ("Conversation cleared because tool-call IDs aren't portable across providers"). The token for the previous provider is preserved in localStorage.
- Opening the settings dialog during an in-flight request is **allowed** — settings changes do not affect the running request, only the next one.

#### 5.14.5 Conversation truncation

- System prompt is **always** kept (slot 0).
- Last 19 user/assistant/tool messages are kept (slots 1..19).
- Older messages are dropped with a synthetic `[earlier conversation truncated — N turns omitted]` text inserted at the start of slot 1.
- Truncation is computed fresh on every send, so the sliding window stays correct.

#### 5.14.6 Provider-specific quirks the adapter MUST handle

| Provider | Quirk | Adapter behaviour |
|---|---|---|
| OpenAI / GitHub Models | `tool_calls[i].function.arguments` is a JSON-stringified **string**, not an object | Adapter `JSON.parse`s before yielding `ChatChunk { type: 'tool_call' }` |
| OpenAI | Streaming tool calls arrive as accumulating deltas in `tool_calls[i].function.arguments` | Adapter buffers per `index` until `finish_reason === 'tool_calls'`, then yields once |
| Anthropic | Tool input streams as `input_json_delta` events; complete only at `content_block_stop` | Adapter buffers per `content_block_index` until stop, then yields once |
| Anthropic | Vision content blocks are typed `{ type: 'image', source: { type: 'base64', media_type, data } }` not OpenAI's `{ type: 'image_url' }` | Adapter translates from neutral `ChatContentBlock` |
| Custom OpenAI-compat | Some endpoints don't support `stream: true` for tool calls | Adapter falls back to non-streaming on a 400; surfaces "this endpoint doesn't support streaming tool calls" warning once per session |
| All | Rate-limit responses: `429` + provider-specific headers (`retry-after`, `x-ratelimit-reset-requests`, `anthropic-ratelimit-requests-reset`) | Adapter normalises to `{ retryAfterMs: number }`; UI shows countdown |

#### 5.14.7 Token & key safety

- Tokens are stored at `localStorage['2dfea-ai-token-<provider>']`. They are read **only** by the adapter for the matching provider — `githubModels.ts` reads only `2dfea-ai-token-github-models`, etc.
- Tokens are **never**: logged via `console.*`, included in error messages bubbled to UI, written to the transcript, sent to providers other than the matching one, included in any thrown `Error.message`, or stringified into telemetry counters.
- Adapters scrub their own URL/header dumps in dev-mode `console.debug`: `Authorization: Bearer ***REDACTED***`.
- "Clear token" wipes the matching key and zeroes the in-memory copy.
- `useAIStore` does **not** persist tokens — only the active provider id and model id. The token persistence path is the dedicated localStorage key, not the Zustand `persist` middleware.

#### 5.14.8 API-key format pre-flight (cheap)

Before the first request with a new token, validate format client-side:

| Provider | Expected prefix |
|---|---|
| GitHub Models | `ghp_` (classic) or `github_pat_` (fine-grained) |
| Anthropic | `sk-ant-` |
| OpenAI | `sk-proj-` or `sk-` |
| Custom OpenAI-compat | no validation; user's responsibility |

A wrong-format key shows a friendly error before the request goes out, saving a round-trip. The check is a pre-flight only — it does not retry, does not block legitimate keys with future formats (just warns).

#### 5.14.9 Logging & error redaction

- All errors bubbled to UI go through `redactError(err)` which: removes `Bearer …` substrings, removes raw `?key=` query params, truncates stack traces to top 5 frames, and trims to 500 chars.
- Console logs in dev mode prefix every adapter line with `[ai/<provider>]` for easy filtering.
- No telemetry, period. Counters in `localCounters.ts` are local-only and viewable from a debug subview.

#### 5.14.10 Tool-call ID threading

- Adapters report their provider's native `tool_call_id` (OpenAI `tool_calls[].id`, Anthropic `tool_use.id`).
- The repair loop responds with the same id wrapped as a `tool` role message.
- The dispatcher does NOT generate its own ids — id ownership stays with the provider so retries thread correctly.

#### 5.14.11 Schema injection method

- `MODEL_JSON_SCHEMA` is computed once via `zodToJsonSchema(ModelFileV1Schema)` at module load (§5.4).
- This is the single source of truth: any future schema bump auto-propagates to the LLM contract on the next build.
- `public/schemas/2dfea-model-v1.json` (regenerated by `prebuild`) stays available for external consumers but is NOT loaded at runtime.
- Property: a `git diff` showing only `2dfea/src/io/schema.ts` changed must result in the LLM seeing the new shape — no manual JSON-Schema edit.

#### 5.14.12 MIME / file-type sniffing

- Drag-drop uses `file.type` first (`image/png`, `image/jpeg`, `application/pdf`).
- If `file.type` is empty (some OS+browser combinations), sniff magic bytes from `file.slice(0, 8).arrayBuffer()`:
  - `89 50 4E 47` → PNG
  - `FF D8 FF` → JPEG
  - `25 50 44 46` → PDF
  - else → reject with "unsupported file type"
- Defends against the "drag from File Explorer" oddities on Windows.

#### 5.14.13 Bundle / dynamic-import error handling

- `import('pdfjs-dist')` failures (offline first-use, or chunk fetch failure) are caught and surfaced as "Couldn't load PDF support — refresh and try again". The PDF page picker is gated behind successful import.
- Dynamic provider-SDK imports (`@anthropic-ai/sdk`, `openai`) follow the same pattern. Failure shows "Couldn't load <Provider> SDK".

#### 5.14.14 Persistence boundary

`useAIStore` persists ONLY:
- Active provider id
- Active model id
- (Tokens live in their dedicated `2dfea-ai-token-*` keys, not in this store)

It does NOT persist:
- Conversation history (in-memory only — a deliberate v1 choice; see §10 future work)
- Open/closed state of the panel (defaults to closed on every load)
- Attachments / pending uploads
- Debug counters

This boundary is encoded in `useAIStore`'s `partialize`. Tests assert the persisted shape.

#### 5.14.15 GA tag and CSP

- The 2dfea app's existing GA tag (CLAUDE.md mandate) is unaffected — we add no `<head>` content and no new `<script>` tags.
- No `Content-Security-Policy` is currently set on the GH Pages site. If/when one is added, the AI feature will need: `connect-src` allowing `models.github.ai`, `api.anthropic.com`, `api.openai.com`, plus the user-supplied custom endpoint origin. Documented here as a future hardening note.

#### 5.14.16 Worker / analysis interaction

- `useModelStore.getState().isAnalyzing === true` blocks AI dispatch (§5.14.4).
- After `set_model` runs `applyToStore`, the analysis cache is invalidated by `INVALIDATE_ANALYSIS_PATCH` (already in `applyToStore`'s contract). The worker may still be computing on the previous model — its results are discarded by the cache invalidation.
- The user must click `Run Analysis` to re-run on the AI-built model. This is consistent with file import.

#### 5.14.17 Whitespace & encoding normalisation

- Pasted prompts are normalised: `\r\n` → `\n`, NBSP ` ` → space, strip leading/trailing whitespace per line, collapse 3+ blank lines to 2.
- Tool-call argument JSON strings are passed unchanged to `JSON.parse` — Zod's `.finite()` and string-validation catch the rest.

#### 5.14.18 What's _not_ guarded (deliberate)

- LLM hallucinations on engineering judgement (wrong I-value for a section name, wrong support type for a context, etc.). The user is engineering-responsible for the model the AI produces. Settings dialog says this once.
- Provider downtime. We surface the error; we don't fail over.
- User pasting their own key into the wrong provider field. Format pre-flight catches the obvious cases; the rest fail at the provider with a clear 401.

## 6. Data flow worked example

User drops a PDF of a portal frame and types "make me an FE model of this".

1. `<AIPanel />` accepts the drop. `pdfRender.ts` lazy-loads `pdfjs-dist`, renders thumbnails, opens page picker.
2. User picks page 1, clicks Confirm. `pdfRender.ts` rasterises page 1 to a 1024 px PNG, returns base64.
3. Composer fires `useAIStore.send({ text, attachments: [{ kind: 'image', base64 }] })`.
4. `useAIStore` constructs a `ChatRequest`:
   - `messages`: system prompt (with current-model-state fragment showing 0 nodes), then a user message with text + image content blocks
   - `tools`: `[setModelTool]` only (model is empty)
   - `model`: from settings
5. Selected `AIProvider.chat(req, signal)` is called.
6. Provider streams chunks. Text chunks update the placeholder assistant message. The LLM's interpretation ("I see a 3-bay portal with pinned bases…") streams in.
7. Provider emits a `tool_call` chunk with `{ name: 'set_model', arguments: <full ModelFileV1 JSON> }`.
8. `dispatch.ts` runs `ModelFileV1Schema.safeParse(arguments)`.
9. Suppose it fails (LLM emitted `direction: 'fy'`). `repairLoop.ts` formats the Zod error, pushes a `tool` role message with the error, and re-invokes the provider with the same conversation. Attempt counter: 1/3.
10. LLM corrects. Second try: `safeParse` succeeds. `applyToStore(file)` runs.
11. Canvas re-renders. Analysis cache invalidated. Undo history cleared.
12. Transcript shows: user message → assistant text → tool call (collapsed JSON) → "✓ Applied to canvas". The validation error from step 9 is shown as a collapsed, dim "Repair attempt 1/3" entry above.

## 7. Phasing

Each phase is its own PR. Phases are in dependency order; Phase 0 is throwaway.

### Phase 0 — Spike (1–2 days, throwaway branch, no merge)

Verify in a scratch branch that all five providers work from a browser on `magnusfjeldolsen.github.io`:

- GitHub Models: does `POST https://models.github.ai/inference/chat/completions` with a PAT respond with proper CORS headers from a GH Pages origin?
- Anthropic SDK with `dangerouslyAllowBrowser: true`: works?
- OpenAI SDK with `dangerouslyAllowBrowser: true`: works?
- Custom OpenAI-compatible: pick one (Groq's free tier is convenient) and confirm CORS.
- Tool calling: a single `set_model` round-trips with our published JSON Schema as `input_schema`.
- Vision: one supported model accepts a base64 image and returns sensible content.

**Exit criteria**: documented yes/no for each provider, with the exact failure mode if any. If GitHub Models CORS is broken, the plan does not change (we ship the other four), but the dialog promotes one of the BYO-key providers as the "free" recommendation (e.g. Groq's free tier).

### Phase 1 — Provider plumbing + settings dialog (text-only)

PR 1. No tools yet. The user can chat with each provider and see streamed text. Validates the abstraction.

- `ai/providers/types.ts`, all five adapters
- `ai/providers/index.ts` factory
- `useAIStore` (transcript, status, settings)
- `<AIPanel />` MVP: header, transcript, composer (text only)
- `<AISettingsDialog />` with all five provider rows, per-provider warning copy from §5.6
- `App.tsx`: mount point
- Tests: provider conformance (each adapter implements the interface), manual provider unit tests, settings dialog RTL tests
- **Manual QA**: send "hello" via each of the five providers; confirm streamed response

### Phase 2 — `set_model` tool wired through Zod + applyToStore

PR 2. The chat now writes to the canvas.

- `ai/tools/schema.ts`, `ai/tools/definitions.ts` (set_model only)
- `ai/tools/dispatch.ts` (set_model branch)
- `ai/repairLoop.ts` + tests
- `ai/systemPrompt.ts` + tests
- Transcript renders tool-call cards and validation-error cards
- Tests:
  - `dispatch.test.ts`: 5 fixture LLM responses (3 valid, 2 invalid) → assert store state + retry count
  - `repairLoop.test.ts`: 3-retry budget, error formatting
  - `systemPrompt.test.ts`: snapshot test on empty-model and non-empty-model variants
- **User-visible milestone**: typing "make a 6m simply supported beam, UDL 10 kN/m" produces a working model and `Run Analysis` succeeds

### Phase 3 — Image attachment

PR 3. Vision-capable models can now consume sketches.

- `ai/attachments/imageUtils.ts` (resize via Canvas API, base64 encode) + tests
- Drop-zone in composer; paste-from-clipboard
- Thumbnail strip in transcript
- Per-provider `supportsVision` flag drives a "your selected model doesn't support images" warning when the user attaches one
- Tests: fixture image → assert correct base64 in outgoing request shape

### Phase 4 — PDF attachment

PR 4. The big-ticket UX win.

- `pdfjs-dist` added to package.json
- `vite.config.ts` updates (§5.12)
- `ai/attachments/pdfRender.ts` + tests
- Page picker modal
- 8-page hard cap UI
- Tests: fixture single-page and multi-page PDFs → assert images produced with correct page numbering
- **Bundle check**: `npm run build && npx vite-bundle-visualizer dist` confirms `pdfjs-dist` is in a separate chunk

### Phase 5 — Edit tools for incremental refinement

PR 5. The chat now supports follow-up edits.

- All edit-tool descriptors in `ai/tools/definitions.ts`
- `dispatch.ts` branches for each tool, calling existing store actions
- Per-tool input validators (Zod) for runtime safety
- System prompt's current-model-state fragment (§5.5)
- Edit-tools-enabled gate (§5.10)
- Tests: one fixture LLM response per edit tool → assert correct store mutation; assert undoability (single Ctrl+Z reverts the change)

### Phase 6 — Polish

PR 6. Production-ready.

- Rate-limit error parsing (provider-specific `Retry-After` / `x-ratelimit-*` headers) + UI countdown
- Cost / usage display per-conversation (where the provider returns it)
- "Clear token" and "Clear conversation" buttons in dialog
- Local debug counters (tool calls, retries, validation failures) surfaced in a debug subview
- Bundle-size verification step in `pr-checks.yml` (advisory, not blocking)

## 8. Test Plan

### Automated (Vitest)

| File | What it covers |
|---|---|
| `providers/providers.test.ts` | Each adapter implements `AIProvider`; `manual` adapter dispatches correctly |
| `tools/dispatch.test.ts` | 5+ fixture LLM responses → store state assertions; tool gate (empty vs non-empty model) |
| `repairLoop.test.ts` | Retry budget = 3; Zod error formatting; abort signal propagation |
| `systemPrompt.test.ts` | Snapshot tests — empty model, non-empty model, vision-enabled vs not |
| `attachments/imageUtils.test.ts` | Resize correctness, base64 prefix stripping, JPEG vs PNG |
| `attachments/pdfRender.test.ts` | Page count, page selection, hard cap, lazy-load happens once |
| `AIPanel.test.tsx` | RTL: render, type, submit, drop image, drop PDF, error states |
| `AISettingsDialog.test.tsx` | RTL: switch provider → warning text changes, save token, clear token |

### Manual QA Groups

**A — Settings & token security**
1. Open dialog. All five providers visible with distinct warning text.
2. Switch providers; warning text updates.
3. Save token; reload page; token persists.
4. "Clear token" wipes only the active provider's token.
5. Inspect localStorage: tokens are keyed `2dfea-ai-token-{provider}`.

**B — GitHub Models golden path**
1. Provide PAT scoped `models:read`.
2. "Make a 6 m simply supported beam, UDL 10 kN/m, EI default."
3. Model appears; `Run Analysis` succeeds; max moment ≈ 45 kNm at midspan (10·6²/8).

**C — Each BYO-key provider**
Repeat B for Anthropic, OpenAI, Custom (point at Groq or local Ollama). Capture which models support tool calls.

**D — Manual provider**
1. Disable network in devtools.
2. Enter manual provider. Paste a known-good fixture response.
3. Pipeline runs identically; model appears.

**E — Repair loop**
1. Use manual provider. Paste a response with `direction: 'fy'` (lowercase).
2. Validation fails. Paste a corrected response when prompted.
3. Confirm UI shows "Repair attempt 1/3" and final ✓.

**F — Image / PDF input**
1. Drop the fixture portal-frame PNG; submit "build this"; assert sensible model.
2. Drop the fixture cantilever PDF; pick page 1; assert sensible model.
3. Drop a 20-page PDF; confirm page picker shows all 20 thumbnails; confirm 8-page cap is enforced.

**G — Edit tools**
1. With B's beam already on canvas, type "make element E1's right end a hinge".
2. Assert `releaseEndMz` true on E1; canvas indicator visible.
3. Ctrl+Z; assert single undo step reverts.

**H — Negative paths**
1. Empty PAT → submit → friendly auth error.
2. Network offline + non-manual provider → friendly network error.
3. Rate limit hit → countdown UI shows; submit button disabled.
4. 4-retry repair loop scenario → error card after attempt 3.

## 9. Risks & open questions

1. **GitHub Models CORS** — load-bearing for the "free" tier story. Phase 0 must verify. **Mitigation**: if broken, promote one BYO-key provider's free tier as the "free" entry in dialog copy. Plan code does not change.
2. **PAT exfiltration via XSS** — real on a public static site. **Mitigation**: per-provider in-dialog warning text (§5.6); recommend short-lived narrowly-scoped PATs; "Clear token" button always visible.
3. **Provider tool-call conformance drift** — Anthropic and OpenAI shape tool calls slightly differently; smaller / cheaper models often produce malformed tool calls. **Mitigation**: repair loop covers most issues; settings dialog warns when a model is known not to support tool calls (per `availableModels` metadata).
4. **PDF size / context blow-up** — drawing PDFs are routinely 5–50 MB. **Mitigation**: lazy-load + page picker + 8-page cap. Follow-up: bounding-box auto-crop.
5. **Hallucinated direction conventions / unit confusion** — the schema's case-sensitive enums catch direction errors hard. Unit confusion (kN vs N, m vs mm) is harder; the system prompt is explicit but the Zod schema is unit-blind. **Mitigation**: add a sanity-check pass in `dispatch.ts` that flags absurdly large/small values (e.g. `E_GPa > 1000` or `< 1`) as a soft warning before applying. Stretch goal — if scope creeps, push to follow-up.
6. **Conversation history grows unbounded** — long sessions will hit context limits. **Mitigation**: in-memory cap at last 20 turns; older turns truncated with a "[earlier conversation truncated]" marker. Phase 6.
7. **Bundle bloat** — `pdfjs-dist` is large. **Mitigation**: lazy import + chunk split (§5.12 + §5.13). Verify in Phase 4 with bundle-visualizer.
8. **Schema drift** — when `member-end-releases-mz`-style schema changes ship, the published JSON Schema regenerates at prebuild and the AI's tool def auto-updates. **No action needed** — the prebuild handles it. But: a new field might silently start being generated by the LLM, which then validates fine but surprises the user. **Mitigation**: a deliberate "what's new in the model" toast on first use after a schema change. Stretch goal.
9. **Undo behaviour after `set_model`** — clears history (consistent with file import, per `applyToStore` contract). Some users will expect Ctrl+Z to undo "the AI's work". **Mitigation**: dialog copy on first use ("AI-generated models replace the canvas — like opening a file. Ctrl+Z does not rewind across this boundary."). Phase 6.
10. **Cost of ad-hoc users blowing through their key's quota** — usage displays per turn (where the provider reports it) so the user sees the bill accumulate. Phase 6.
11. **Model picker UX** — each provider has different model id formats; we expose a free-text override. **Mitigation**: `availableModels` is an opinionated curated list (3–5 per provider) with "Other..." for free-text.

## 10. Future extensions (NOT in v1)

- **Analyze tool**: lets the LLM call `runAnalysis` and read results, enabling "what's the max moment?" follow-ups.
- **Critique tool**: a "review this model" loop that points out missing supports, kinematic instabilities, etc.
- **Server-side proxy** for token-less use, if the team ever stands up a backend.
- **OCR / native PDF text extraction** to handle drawing PDFs that have selectable text.
- **Conversation persistence** across page reloads (localStorage, opt-in).
- **Multi-turn iterative refinement** with a "diff preview" before applying each edit.
- **Library of prompts** ("simply supported beam", "portal frame", "Vierendeel truss") as one-click templates.
- **Auto-generation of load combinations** following EN 1990 from a list of cases and category hints.
- **Schema-aware JSON repair** in `repairLoop.ts` — instead of asking the LLM to retry, attempt a deterministic fix-up for known issues (case fold of direction enums, etc.) before round-tripping.
- **Keyboard shortcut** to open the panel.
- **Cost telemetry opt-in** (anonymous, off by default).
- **3D extension**: when 2dfea ever bumps to 3D, the same architecture re-tools against the new schema with no AI-side changes.

## 11. Out of scope: backwards compatibility

This feature is purely additive. It introduces no schema change, no store change, no migration. v1.0.0 and v1.1.0 saved files load unchanged. Pre-AI-feature builds open AI-generated saved files indistinguishably from human-authored ones (because they *are* human-equivalent v1.1.0 files). No backwards-compat hazards.

## 12. Open decisions for the implementer

These are deliberately left undetermined; the implementer makes the call and documents it in the PR description:

1. **Verify the curated model lists (§5.6.5) at implementation time** and substitute any deprecated ids. Specifically check: GitHub Models catalog (often shifts), Anthropic's current haiku id (date suffix), OpenAI's current "mini" line. Document final picks per provider in the Phase 1 PR.
2. **Default prompt placeholder text** in the composer ("Describe the model you want to build, or drop an image..." vs alternatives). Pick what reads cleanly.
3. **Exact pixel-level layout of the floating panel** (drag handles, animation timings, dock edge) — implementer's call. Match existing 2dfea panel aesthetics from `LeftCADPanel.tsx` / `LoadInputDialog.tsx`.
4. **Whether to implement the "schema-aware deterministic repair" optimisation in §10** during the repair-loop phase, or defer. If Phase 2 manual QA shows direction-case errors are the dominant repair-loop failure mode, doing the case-fold inline saves a round trip. Implementer's call — defer to follow-up if Phase 2 timeline is tight.
5. **`useAIStore` persistence storage key**: pick `2dfea-ai-store` (matches the existing convention `2dfea-model-storage`).

## 13. Implementation Checklist

This checklist is the contract the feature-implementer agent works against. Each phase is a separate branch, separate PR, rebase-merged into `master`. Tick items as they complete; commit between items where the checklist shows `[commit]`.

### Phase 0 — Spike (throwaway branch, no merge)

Branch: `spike/ai-helper-cors`. Do not merge. Findings written into a comment on this plan's PR thread (or a separate gist).

- [ ] Browser-call `POST https://models.github.ai/inference/chat/completions` with a PAT from a `magnusfjeldolsen.github.io` origin. Capture: 200/4xx, CORS headers, latency.
- [ ] Browser-call Anthropic `POST https://api.anthropic.com/v1/messages` with `anthropic-dangerous-direct-browser-access: true`. Capture same.
- [ ] Browser-call OpenAI `POST https://api.openai.com/v1/chat/completions` with `dangerouslyAllowBrowser`. Capture same.
- [ ] Pick one OpenAI-compatible (Groq free tier recommended). Capture same.
- [ ] Round-trip a `set_model` call against `MODEL_JSON_SCHEMA` (paste schema into request) on the cheapest model per provider. Capture: did tool calling produce structurally valid output?
- [ ] Vision: send a 512×512 PNG + "describe this" against one vision model per provider. Capture: works / doesn't.
- [ ] Decide: if GitHub Models CORS is broken, which provider becomes the "free" recommendation in Phase 1's dialog copy? (Likely: Groq, since it has a real free tier and OpenAI-compatible.) Document.

**Exit criteria**: a written go/no-go with the failure mode (if any) for each provider.

#### Phase 0 → Phase 1 handoff gate (mandatory)

**Do not start Phase 1 until the user has reviewed and approved Phase 0 findings.** This gate exists because Phase 0's outcome can change the dialog's "free tier recommendation" copy in §5.6 — if GitHub Models CORS is broken from a `magnusfjeldolsen.github.io` origin, the recommended free-tier provider shifts (likely to Groq) and the in-dialog warning copy needs to be updated to match.

The implementer reports back to the user with:

```
Phase 0 (spike) is complete. Findings:

  Provider: GitHub Models
    CORS from GH Pages origin: <pass/fail>
    Tool calling round-trip:    <pass/fail>
    Vision round-trip:          <pass/fail>
    Notes: <free text>

  Provider: Anthropic
    <same shape>

  Provider: OpenAI
    <same shape>

  Provider: Custom (Groq tested)
    <same shape>

Recommendation:
  - Default "free" provider in Phase 1 dialog: <github-models | groq | other>
  - Reasoning: <one paragraph>
  - Required §5.6 copy edits: <none | listed below>

Awaiting your approval to start Phase 1. The spike branch
(spike/ai-helper-cors) will not be merged regardless.
```

The user replies with approval (and any §5.6 copy adjustments). **Only then** does the implementer create the `feature/ai-helper-providers` branch and begin Phase 1.

### Phase 1 — Provider plumbing + settings dialog (text only)

Branch: `feature/ai-helper-providers`. PR title: `feat(2dfea): AI helper — provider abstraction + settings dialog (text only)`.

- [ ] `npm run type-check && npm test` green on master before starting.
- [ ] Create `2dfea/src/ai/providers/types.ts` (interface from §5.3). `[commit]`
- [ ] Add provider SDKs as deps if used (`@anthropic-ai/sdk`, `openai`). `[commit]`
- [ ] Implement `manual.ts` (no network, paste-response). `[commit]`
- [ ] Implement `githubModels.ts` (OpenAI-compat fetch + SSE stream parser). `[commit]`
- [ ] Implement `anthropic.ts` (dynamic SDK import, dangerouslyAllowBrowser). `[commit]`
- [ ] Implement `openai.ts` (dynamic SDK import, dangerouslyAllowBrowser). `[commit]`
- [ ] Implement `customOpenAI.ts` (configurable baseURL). `[commit]`
- [ ] `providers/index.ts` factory + curated model metadata per §5.6.5. `[commit]`
- [ ] `useAIStore` (Zustand): transcript, status, settings, send action (text only — no tools yet). Persistence per §5.14.14. `[commit]`
- [ ] `<AIPanel />` MVP: header, transcript, composer (text only). `[commit]`
- [ ] `<AISettingsDialog />`: provider dropdown, per-provider warning (§5.6 verbatim), model picker w/ curated list + "Other...", token field, clear-token, clear-conversation. `[commit]`
- [ ] Wire `<AIPanel />` into `App.tsx` (one import, one render line). `[commit]`
- [ ] Tests: `providers/providers.test.ts`, `AIPanel.test.tsx`, `AISettingsDialog.test.tsx`. `[commit]`
- [ ] Robustness sub-items in scope for this phase:
  - §5.14.1 cancellation (Stop button)
  - §5.14.2 stall timeout
  - §5.14.4 race conditions (submit-blocked-while-in-flight, provider-switch-clears-conversation)
  - §5.14.5 conversation truncation
  - §5.14.7 token safety
  - §5.14.8 key format pre-flight
  - §5.14.9 logging redaction
  - §5.14.14 persistence boundary
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group A passes (see §15 for handoff procedure).
- [ ] Open PR; rebase-merge after user verification.

### Phase 2 — `set_model` tool + Zod + applyToStore

Branch: `feature/ai-helper-set-model`. Base: latest `master` (Phase 1 merged).

- [ ] Rebase from `master`.
- [ ] `ai/tools/schema.ts` (`MODEL_JSON_SCHEMA` from §5.4). `[commit]`
- [ ] `ai/tools/definitions.ts` (`setModelTool` only). `[commit]`
- [ ] `ai/tools/dispatch.ts` (`set_model` branch → `ModelFileV1Schema.safeParse` → `applyToStore`). `[commit]`
- [ ] `ai/repairLoop.ts` (max 3 retries, format Zod errors). `[commit]`
- [ ] `ai/systemPrompt.ts` (skeleton from §5.5). `[commit]`
- [ ] Update `useAIStore.send()` to thread tools, dispatch tool calls, run repair loop. `[commit]`
- [ ] Update `<AIPanel />` transcript: tool-call cards (collapsible JSON), validation-error cards (red border), repair-loop indicator. `[commit]`
- [ ] Tests: `dispatch.test.ts`, `repairLoop.test.ts`, `systemPrompt.test.ts`; fixtures under `__fixtures__/llm-responses/`. `[commit]`
- [ ] Robustness sub-items in scope:
  - §5.14.3 payload size guards
  - §5.14.6 provider-specific quirks (tool_calls.arguments JSON-string, Anthropic input_json_delta buffering)
  - §5.14.10 tool-call ID threading
  - §5.14.11 schema injection method (zod-to-json-schema runtime derivation)
  - §5.14.16 isAnalyzing block
  - §5.14.17 whitespace normalisation
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group B passes.
- [ ] Open PR; rebase-merge after user verification.

### Phase 3 — Image attachment

Branch: `feature/ai-helper-images`. Base: latest `master`.

- [ ] Rebase from `master`.
- [ ] `ai/attachments/imageUtils.ts` (resize via Canvas, base64 encode). `[commit]`
- [ ] Drop-zone in composer; paste-from-clipboard handler. `[commit]`
- [ ] Thumbnail strip in transcript message. `[commit]`
- [ ] `supportsVision` flag drives drop-zone enable/disable + tooltip (§5.6.5). `[commit]`
- [ ] Tests: `imageUtils.test.ts`; fixture image under `__fixtures__/sketches/`. `[commit]`
- [ ] Robustness sub-items in scope: §5.14.3 (image cap), §5.14.12 (MIME sniffing).
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group F (image part) passes.
- [ ] Open PR; rebase-merge.

### Phase 4 — PDF attachment

Branch: `feature/ai-helper-pdf`. Base: latest `master`.

- [ ] Rebase from `master`.
- [ ] `npm install pdfjs-dist`. `[commit]`
- [ ] `vite.config.ts` updates (§5.12). `[commit]`
- [ ] `ai/attachments/pdfRender.ts` (lazy `import('pdfjs-dist')`, `?url` worker import). `[commit]`
- [ ] Page-picker modal (thumbnails, multi-select, 8-page cap). `[commit]`
- [ ] Wire into composer drop-zone; differentiate image vs PDF by MIME. `[commit]`
- [ ] Tests: `pdfRender.test.ts`; fixture single-page PDF. `[commit]`
- [ ] Robustness sub-items in scope: §5.14.3 (page cap), §5.14.12 (PDF magic bytes), §5.14.13 (dynamic-import error handling).
- [ ] **Bundle check**: `npm run build && npx vite-bundle-visualizer dist` confirms `pdfjs-dist` is in a separate chunk. Screenshot in PR. `[commit]`
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group F (PDF part) passes.
- [ ] Open PR; rebase-merge.

### Phase 5 — Edit tools

Branch: `feature/ai-helper-edit-tools`. Base: latest `master`.

- [ ] Rebase from `master`.
- [ ] All edit-tool descriptors in `definitions.ts`. `[commit]`
- [ ] `dispatch.ts` branches for each edit tool, calling existing store actions. `[commit]`
- [ ] Per-tool input validators (Zod) for runtime safety. `[commit]`
- [ ] System prompt's current-model-state fragment (§5.5). `[commit]`
- [ ] Edit-tools-enabled gate (§5.10): tool list recomputed per turn. `[commit]`
- [ ] Tests: one fixture LLM response per edit tool; assert correct mutation; assert single-step Ctrl+Z reverts. `[commit]`
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group G passes.
- [ ] Open PR; rebase-merge.

### Phase 6 — Polish

Branch: `feature/ai-helper-polish`. Base: latest `master`.

- [ ] Rebase from `master`.
- [ ] Rate-limit error handling: parse provider-specific 429 headers; UI countdown; submit-blocked-during-cooldown. `[commit]`
- [ ] Cost / usage display (where the provider returns it in response metadata). `[commit]`
- [ ] Local debug counters subview (tool calls, retries, validation failures, last-error-redacted). `[commit]`
- [ ] First-use info card explaining "AI replaces canvas; Ctrl+Z does not rewind across this boundary" (§9.9). `[commit]`
- [ ] `npm run type-check && npm test && npm run build` all green.
- [ ] Manual QA Group H passes.
- [ ] Open PR; rebase-merge.

## 14. Branch & PR conventions

- **Branch naming**: `feature/ai-helper-<phase-slug>`; spike branches `spike/ai-helper-<topic>`.
- **PR title**: `feat(2dfea): AI helper — <phase summary>` (Conventional Commits + 2dfea scope, matching the existing repo style — e.g. `feat(2dfea): add hollow-circle indicator at released element ends`).
- **PR body**: short summary, link back to this plan section, screenshots/GIFs for UI changes, manual-QA results checklist, decision-log for any §12 picks.
- **Base branch**: `master`.
- **Merge style**: rebase-merge (per the feature-implementer agent's standard workflow). Never squash — phase commits are intentionally granular and tell the implementation story.
- **Each phase rebases onto the latest `master`** before opening its PR. If a previous phase's PR is still open at rebase time, base on that branch and update the base branch when the upstream merges (this happens once per phase boundary at most).
- **Do not merge Phase N+1 before Phase N**. Phases are dependency-ordered.
- **Single-PR escape hatch**: if the implementer judges that two adjacent phases are tightly coupled enough to ship together (e.g. Phase 3 + Phase 4 if image-and-PDF UI ends up sharing 90% of code), they may bundle. Document the bundling decision in the PR description. **Phase 0 is never bundled.**

## 15. Manual verification handoff

Before opening each phase's PR, the implementer hands off to the user with a structured request. Template:

```
Phase <N> — <name> is ready for manual verification.

To run locally:
  cd 2dfea
  npm install   # only needed if package.json changed
  npm run dev   # http://localhost:5173

Please verify Manual QA Group(s) <X, Y> from the plan
(2dfea/docs/plans/implement-ai-helper.md §8):

  Group X — <one-line summary>
    1. <step>
    2. <step>
    Pass / Fail: ___

  Group Y — <one-line summary>
    1. <step>
    2. <step>
    Pass / Fail: ___

Known limitations / things NOT yet implemented in this phase:
  - <item>
  - <item>

Decision log for §12 picks made in this phase:
  - <item>: <choice> — <one-line rationale>

Reply with pass/fail per group and any observations. I'll open the PR
once you confirm.
```

The implementer **does not open the PR until the user replies pass on every group for that phase**. If a group fails, the implementer fixes and re-requests verification — the cycle repeats until pass.

## 16. Pre-flight commands

Commands the implementer runs at the start and end of every phase. Output captured in PR description for posterity.

```bash
# Start of phase (verify clean baseline)
cd 2dfea
npm install
npm run type-check    # tsc --noEmit
npm test              # vitest run
npm run build         # tsc && vite build (also runs prebuild → schema regen)

# End of phase (gate before PR)
cd 2dfea
npm run type-check
npm test
npm run build
# Phase 4 only: bundle visualizer
npx vite-bundle-visualizer dist
```

If any command fails, fix before continuing — never `--no-verify`, never skip tests, never commit a known-broken state. Type errors and test failures are blockers, not warnings.

## 17. Acceptance summary (one-glance gate)

A reviewer or the user can confirm the feature is shipped by checking:

1. ☐ The "AI" panel button is visible in the 2dfea app shell on production GH Pages.
2. ☐ Settings dialog lists five providers with distinct in-dialog security warnings.
3. ☐ With a GitHub Models PAT, "make a 6 m simply supported beam, UDL 10 kN/m" produces a working model that runs analysis to ≈45 kNm at midspan.
4. ☐ Image drop produces a model that matches a known fixture sketch.
5. ☐ PDF page-picker works; lazy-loaded chunk visible in network tab.
6. ☐ Wrong-direction-case (`fy` vs `Fy`) triggers the repair loop, succeeds on attempt 2.
7. ☐ With a model on canvas, "make E1's right end a hinge" updates the canvas; Ctrl+Z reverts in one step.
8. ☐ Manual provider works fully offline.
9. ☐ Tokens visible in localStorage only at `2dfea-ai-token-<provider>` keys; no token leaks to console / errors / transcript.
10. ☐ `git diff master -- 2dfea/src/io/schema.ts` shows zero changes from this feature.
11. ☐ `npm run type-check && npm test && npm run build` green on `master` after final merge.
12. ☐ INDEX.md entry present and accurate.
