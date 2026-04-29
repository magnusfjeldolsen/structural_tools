/**
 * Build-time helper: generate the published JSON Schema document at
 * `public/schemas/2dfea-model-v1.json` from the Zod schema.
 *
 * Run via `npm run generate-schema`; also wired as `prebuild` so every
 * production `npm run build` regenerates the schema, eliminating drift
 * between Zod and the published JSON Schema.
 *
 * The schema document is what AI integrations attach as the structured-
 * output contract (Anthropic tool-use schema / OpenAI JSON-schema mode);
 * see plan §5.15 for the grounded-generation flow.
 *
 * Run with `tsx` (not the TS compiler) — this is a build-time script, not
 * shipped to the runtime bundle.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ModelFileV1Schema } from './schema';
import { CURRENT_SCHEMA_VERSION } from './schemaVersion';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const out = zodToJsonSchema(ModelFileV1Schema, {
  name: `2dfea-model-v${CURRENT_SCHEMA_VERSION}`,
  $refStrategy: 'none',
});

const target = resolve(__dirname, '../../public/schemas/2dfea-model-v1.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log(`Wrote ${target}`);
