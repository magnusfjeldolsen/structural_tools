/**
 * Cross-entity semantic validation for an imported v1 model.
 *
 * Zod validates SHAPE; this validates REFERENCES. After Zod parse passes,
 * call `semanticValidate(file.model)` and abort the import if any errors
 * are returned.
 *
 * Checks:
 *   - Element nodeI / nodeJ reference an existing node by name
 *   - Loads reference an existing node / element by name
 *   - Loads' optional `case` references an existing load case
 *   - Combinations' factor keys reference existing load cases
 *   - `activeLoadCase` (when not null) is a known case
 *   - `activeResultView.name` (when not null) is a known case or combination
 *   - Load IDs are unique within each load type
 *
 * See docs/plans/save-load-json.md §5.9.
 */

import type { ModelFileV1 } from './schema';

export function semanticValidate(model: ModelFileV1['model']): string[] {
  const errors: string[] = [];

  const nodeNames = new Set(model.nodes.map((n) => n.name));
  const elementNames = new Set(model.elements.map((e) => e.name));
  const caseNames = new Set(model.loadCases.map((c) => c.name));
  const combinationNames = new Set(model.loadCombinations.map((c) => c.name));

  // Elements reference real nodes
  for (const e of model.elements) {
    if (!nodeNames.has(e.nodeI)) {
      errors.push(`Element ${e.name} references missing node "${e.nodeI}"`);
    }
    if (!nodeNames.has(e.nodeJ)) {
      errors.push(`Element ${e.name} references missing node "${e.nodeJ}"`);
    }
  }

  // Nodal loads reference real nodes
  for (const l of model.loads.nodal) {
    if (!nodeNames.has(l.node)) {
      errors.push(`Nodal load ${l.id} references missing node "${l.node}"`);
    }
    if (l.case && !caseNames.has(l.case)) {
      errors.push(`Nodal load ${l.id} references missing case "${l.case}"`);
    }
  }

  // Distributed loads reference real elements
  for (const l of model.loads.distributed) {
    if (!elementNames.has(l.element)) {
      errors.push(
        `Distributed load ${l.id} references missing element "${l.element}"`
      );
    }
    if (l.case && !caseNames.has(l.case)) {
      errors.push(`Distributed load ${l.id} references missing case "${l.case}"`);
    }
  }

  // Element point loads reference real elements
  for (const l of model.loads.elementPoint) {
    if (!elementNames.has(l.element)) {
      errors.push(
        `Element point load ${l.id} references missing element "${l.element}"`
      );
    }
    if (l.case && !caseNames.has(l.case)) {
      errors.push(`Element point load ${l.id} references missing case "${l.case}"`);
    }
  }

  // Combinations reference real cases
  for (const c of model.loadCombinations) {
    for (const factorCase of Object.keys(c.factors)) {
      if (!caseNames.has(factorCase)) {
        errors.push(`Combination ${c.name} factors missing case "${factorCase}"`);
      }
    }
  }

  // activeLoadCase points at an extant case (or is null)
  if (model.activeLoadCase && !caseNames.has(model.activeLoadCase)) {
    errors.push(`activeLoadCase "${model.activeLoadCase}" not in loadCases`);
  }

  // activeResultView points at an extant case or combination (or .name is null)
  if (model.activeResultView.name) {
    const set =
      model.activeResultView.type === 'case' ? caseNames : combinationNames;
    if (!set.has(model.activeResultView.name)) {
      errors.push(
        `activeResultView ${model.activeResultView.type}/"${model.activeResultView.name}" not in model`
      );
    }
  }

  // Unique IDs within each load type
  const dupCheck = (arr: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const x of arr) {
      if (seen.has(x.id)) {
        errors.push(`Duplicate ${label} id "${x.id}"`);
      }
      seen.add(x.id);
    }
  };
  dupCheck(model.loads.nodal, 'nodal load');
  dupCheck(model.loads.distributed, 'distributed load');
  dupCheck(model.loads.elementPoint, 'element point load');

  return errors;
}
