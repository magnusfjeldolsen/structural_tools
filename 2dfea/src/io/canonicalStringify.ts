/**
 * canonicalStringify — deterministic, sorted-key JSON serialization.
 *
 * Why hand-rolled (not a library):
 *   - Single-use within `src/io/`.
 *   - 30 LOC of recursion is simpler than auditing a transitive dep.
 *   - Round-trip determinism requires only: alphabetical object-key sort,
 *     preserved array order, default JSON.stringify number formatting.
 *
 * Guarantees:
 *   - Object keys emitted in sorted order recursively.
 *   - Array order preserved (insertion is meaningful for nodes/elements/loads).
 *   - Trailing newline at EOF (POSIX-friendly, git-diff-friendly).
 *   - `NaN` / `Infinity` are not legal JSON; `JSON.stringify` emits `null`.
 *     Validation rejects these upstream via Zod `.finite()`. Do NOT rely on
 *     this stringify pass to catch them.
 *   - `undefined` properties are omitted (JSON.stringify default behaviour).
 *
 * Round-trip contract: for any value `x` that is the result of
 * `JSON.parse(canonicalStringify(y))`, `canonicalStringify(x) === canonicalStringify(y)`.
 *
 * See docs/plans/save-load-json.md §5.5 for the full rationale.
 */
export function canonicalStringify(value: unknown, indent: number = 2): string {
  return (
    JSON.stringify(
      value,
      (_key, v) => {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          return Object.keys(v as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((acc, k) => {
              acc[k] = (v as Record<string, unknown>)[k];
              return acc;
            }, {});
        }
        return v;
      },
      indent
    ) + '\n'
  );
}
