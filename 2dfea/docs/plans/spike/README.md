# Phase 0 Spike — AI Helper CORS / Tool-Calling / Vision Verification

Throwaway artefacts for the Phase 0 research spike of the AI Model Helper
feature. **This branch (`spike/ai-helper-cors`) does not merge.**

## What this spike answers

Per [the plan](../implement-ai-helper.md), §7 and §13's Phase 0 checklist:

For each of the four network-using providers (GitHub Models, Anthropic, OpenAI,
Custom OpenAI-compatible — Groq's free tier recommended), verify from a
browser context:

1. **CORS works** — the preflight + actual request succeed without
   `Access-Control-Allow-Origin` errors.
2. **Tool calling round-trips** — sending an OpenAI-style or Anthropic-style
   tool definition and receiving a tool call back works. Uses a small toy
   schema, not the full `MODEL_JSON_SCHEMA`, because we only need to verify
   the protocol — schema shape doesn't change the answer.
3. **Vision works** — sending a base64 PNG in the request gets a
   sensible image-aware reply.

The fifth provider (`manual`) makes no network calls, so there's nothing to
verify in this spike.

## Why an HTML harness (not DevTools fetch snippets)

The plan §13 phrases each test as a `Browser-call POST ...`. Two implementation
options exist:

**(A)** A markdown checklist of `fetch(...)` snippets the user pastes into
DevTools console.
**(B)** A self-contained HTML page with form fields for keys + buttons per test.

I picked **(B) — the HTML harness** because the user has 5 providers × 3 tests =
~15 distinct calls to run. Pasting their API key into a `fetch()` snippet 15
times invites copy-paste mistakes (key in the wrong provider's request, etc.),
and structured per-provider results are easier to report back with. The harness
is a single static file with no build step, so the cost is the same.

## How to run the spike

The CORS check needs a browser origin. Two viable origins:

### Option 1 (recommended): localhost via `npm run dev:serve`

```bash
# from repo root
npm run dev:serve
# Open http://localhost:8080/structural_tools/2dfea/docs/plans/spike/ai-helper-cors.html
```

Localhost is fine for the CORS verification. All four providers are configured
to accept browser-origin requests with the `dangerouslyAllowBrowser`-equivalent
mechanism, and `Access-Control-Allow-Origin: *` is the prevailing pattern. If a
provider rejects localhost specifically (rare), Option 2 below is the fallback.

### Option 2 (production-fidelity): `magnusfjeldolsen.github.io`

If a provider's response is suspicious from localhost (e.g. you want to be
absolutely sure no localhost-only allowlist is masking the truth), the spike
branch can be temporarily deployed for testing. Coordinate with me — I'll cherry
pick the harness onto a `gh-pages` test path. Skip this unless localhost
testing surfaces ambiguity.

## Steps

1. Open the harness page (Option 1 above).
2. For each provider section: paste your API key, optionally tweak the model
   id, click "Run all 3 tests".
3. The harness will run text → tool-calling → vision back-to-back, displaying
   pass/fail + status codes + extracted tool-call args + latency for each.
4. Copy the **Summary** block at the bottom of the page (a plain text block,
   one click to copy).
5. Paste it into the **Results template** section below (or just reply to me
   with the copied summary plus answers to the "Recommendation" prompts).
   I'll verify the conclusions, record decisions about the §5.6 dialog copy
   (which provider becomes the "free" recommendation), and request your
   approval to start Phase 1.

## What we're NOT testing in the spike

- **The full `set_model` JSON Schema round-trip.** The toy schema in the
  harness is enough to prove tool calling works. The full schema is large
  enough that some smaller models choke on it for capacity reasons unrelated
  to the protocol; that's a Phase 2 concern, not a Phase 0 concern.
- **Streaming.** The harness uses non-streaming requests because the question
  is "does the protocol work at all?", not "does streaming work?". Streaming
  is well-supported across all four providers and will be exercised in Phase 1.
- **Repair-loop behaviour.** That's Phase 2.

## Files

- [`ai-helper-cors.html`](ai-helper-cors.html) — the harness itself.

---

## Results template

Fill in the bullets below (or paste the harness's auto-generated Summary block)
and reply with the contents.

### Run context

- **Origin used**: `http://localhost:8080` / `https://magnusfjeldolsen.github.io` / other (circle one)
- **Browser + version**:
- **Date** (ISO):

### Per-provider results

For each provider: capture CORS status (HTTP code + any browser-console CORS
error), text-test pass/fail, tool-call test pass/fail (paste the tool-call
args), vision test pass/fail, and latency. Use "N/A" for vision when the
chosen model is text-only (e.g. most Groq models).

- **GitHub Models** (`https://models.github.ai/inference/chat/completions`,
  e.g. `openai/gpt-4o-mini`)
- **Anthropic** (`https://api.anthropic.com/v1/messages`, e.g.
  `claude-haiku-4-5-20251001` — sanity-check current id;
  `anthropic-dangerous-direct-browser-access: true` is the relevant header)
- **OpenAI** (`https://api.openai.com/v1/chat/completions`, e.g. `gpt-4o-mini`)
- **Custom OpenAI-compatible** (your endpoint, e.g.
  `https://api.groq.com/openai/v1/chat/completions`, model e.g.
  `llama-3.3-70b-versatile`)

### Summary table

| Provider                     | CORS | Text | Tools | Vision |
|------------------------------|------|------|-------|--------|
| GitHub Models                |      |      |       |        |
| Anthropic                    |      |      |       |        |
| OpenAI                       |      |      |       |        |
| Custom (___________________) |      |      |       |        |

Use Pass / Fail / N/A.

### Recommendation prompts

Answer these three:

1. **If GitHub Models CORS passed**: default "free" provider in Phase 1 dialog
   is `github-models`. Confirm? Yes / No.
2. **If GitHub Models CORS failed** (any reason — preflight, auth, missing
   header, region block): which provider should the dialog promote as the
   "free" tier? Suggested fallback: `custom-openai-compatible (Groq)`.
3. **§5.6 copy edits**: any change needed to the per-provider warnings, or
   none?

### Anomalies worth flagging

(e.g. tool-calling worked only with a specific model id; vision returned 400
with one image format but not another; latency was unusable on one provider.)

