/**
 * Data Translator - Convert UI models to Worker format
 *
 * This module ensures clean separation between UI representation
 * and the backend analysis format.
 *
 * COORDINATE SYSTEM CONVERSION:
 * - UI can express loads in local (Fx, Fy, Mz) or global (FX, FY, MZ) coordinates
 * - Backend (PyNite) expects loads in local member coordinates (Fx, Fy, Mz)
 * - This translator converts global loads to local before sending to backend
 */

import type {
  Node,
  Element,
  Loads,
  ModelData,
  SupportType,
} from './types';
import { collectActiveNodes, collectActiveElements } from './dataCollector';

/**
 * Translate complete model to worker format
 *
 * IMPORTANT: PyNite natively understands coordinate system encoding in direction strings:
 * - Lowercase (Fx, Fy, Mz) = Local member coordinates
 * - Uppercase (FX, FY, MZ) = Global coordinates
 * No conversion needed - direction case is preserved for backend.
 *
 * @param nodes - Array of nodes from UI
 * @param elements - Array of elements from UI
 * @param loads - Loads object from UI (may contain local or global directions)
 * @param filterCase - Optional: filter loads by case name
 * @returns ModelData ready for worker with loads unchanged
 */
export function translateModelToWorker(
  nodes: Node[],
  elements: Element[],
  loads: Loads,
  filterCase?: string
): ModelData {
  // Collect only valid elements and their referenced nodes
  const { valid: validElements } = collectActiveElements(elements, nodes);
  const activeNodes = collectActiveNodes(nodes, validElements);

  // Filter loads by case if specified
  const filteredLoads = filterCase ? filterLoadsByCase(loads, filterCase) : loads;

  return {
    nodes: translateNodes(activeNodes),
    elements: translateElements(validElements),
    loads: filteredLoads, // Send loads as-is with direction case preserved
  };
}

/**
 * Translate nodes (currently pass-through, but allows future transforms)
 */
function translateNodes(nodes: Node[]): Node[] {
  return nodes.map((node) => ({
    name: node.name,
    x: node.x,      // m
    y: node.y,      // m
    support: node.support,
  }));
}

/**
 * Translate elements (currently pass-through, but allows future transforms)
 */
function translateElements(elements: Element[]): Element[] {
  const translated = elements.map((element) => ({
    name: element.name,
    nodeI: element.nodeI,
    nodeJ: element.nodeJ,
    E: element.E,   // GPa (backend will convert to Pa)
    I: element.I,   // m⁴
    A: element.A,   // m²
  }));

  // Log element properties being sent to analysis (helps verify fresh values are used)
  console.log('[DataTranslator] Element properties collected for analysis:');
  translated.forEach((el) => {
    console.log(`  ${el.name}: E=${el.E.toFixed(1)} GPa, I=${el.I.toExponential(2)} m⁴, A=${el.A.toExponential(2)} m²`);
  });

  return translated;
}

/**
 * Filter loads by case name
 *
 * @param loads - All loads
 * @param caseName - Case to filter for
 * @returns Filtered loads
 */
export function filterLoadsByCase(loads: Loads, caseName: string): Loads {
  return {
    nodal: loads.nodal.filter((load) => load.case === caseName),
    distributed: loads.distributed.filter((load) => load.case === caseName),
    elementPoint: loads.elementPoint.filter((load) => load.case === caseName),
  };
}

/**
 * Validate model before sending to worker
 *
 * @param model - Model to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateModel(model: ModelData): string[] {
  const errors: string[] = [];

  // Check nodes
  if (model.nodes.length === 0) {
    errors.push('Model must have at least one node');
  }

  // Check elements
  if (model.elements.length === 0) {
    errors.push('Model must have at least one element');
  }

  // Check element references
  const nodeNames = new Set(model.nodes.map((n) => n.name));
  for (const element of model.elements) {
    if (!nodeNames.has(element.nodeI)) {
      errors.push(`Element ${element.name}: start node '${element.nodeI}' not found`);
    }
    if (!nodeNames.has(element.nodeJ)) {
      errors.push(`Element ${element.name}: end node '${element.nodeJ}' not found`);
    }
    if (element.nodeI === element.nodeJ) {
      errors.push(`Element ${element.name}: start and end nodes are the same`);
    }
  }

  // Check element properties
  for (const element of model.elements) {
    if (element.E <= 0) {
      errors.push(`Element ${element.name}: E must be positive`);
    }
    if (element.I <= 0) {
      errors.push(`Element ${element.name}: I must be positive`);
    }
    if (element.A <= 0) {
      errors.push(`Element ${element.name}: A must be positive`);
    }
  }

  // Check loads reference valid nodes/elements
  const elementNames = new Set(model.elements.map((e) => e.name));

  for (const load of model.loads.nodal) {
    if (!nodeNames.has(load.node)) {
      errors.push(`Nodal load: node '${load.node}' not found`);
    }
  }

  for (const load of model.loads.distributed) {
    if (!elementNames.has(load.element)) {
      errors.push(`Distributed load: element '${load.element}' not found`);
    }
  }

  for (const load of model.loads.elementPoint) {
    if (!elementNames.has(load.element)) {
      errors.push(`Point load: element '${load.element}' not found`);
    }
  }

  // Check for at least one support
  const hasSupport = model.nodes.some((node) => node.support !== 'free');
  if (!hasSupport) {
    errors.push('Model must have at least one support (mechanism)');
  }

  return errors;
}

/**
 * Get unique load case names from loads
 */
export function getLoadCaseNames(loads: Loads): string[] {
  const caseNames = new Set<string>();

  for (const load of loads.nodal) {
    if (load.case) caseNames.add(load.case);
  }
  for (const load of loads.distributed) {
    if (load.case) caseNames.add(load.case);
  }
  for (const load of loads.elementPoint) {
    if (load.case) caseNames.add(load.case);
  }

  return Array.from(caseNames).sort();
}

/**
 * Count total loads
 */
export function countLoads(loads: Loads, caseName?: string): number {
  if (caseName) {
    const filtered = filterLoadsByCase(loads, caseName);
    return filtered.nodal.length + filtered.distributed.length + filtered.elementPoint.length;
  }
  return loads.nodal.length + loads.distributed.length + loads.elementPoint.length;
}

/**
 * Support type utilities
 */
export const SupportTypeLabels: Record<SupportType, string> = {
  fixed: 'Fixed',
  pinned: 'Pinned',
  'roller-x': 'Roller (X)',
  'roller-y': 'Roller (Y)',
  free: 'Free',
};

export function getSupportLabel(type: SupportType): string {
  return SupportTypeLabels[type];
}
