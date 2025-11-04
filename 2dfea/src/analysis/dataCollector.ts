/**
 * Data Collector - Validates and collects active nodes and elements
 *
 * Ensures clean data flow to FE-solver by:
 * - Removing orphaned nodes (not referenced by any element)
 * - Validating element connectivity
 * - Detecting missing nodes and zero-length elements
 * - Providing detailed error/warning messages
 */

import type { Node, Element } from './types';

export interface ValidationError {
  type: 'error' | 'warning';
  element: string;
  message: string;
}

/**
 * Collect only nodes that are actually referenced by elements
 *
 * @param nodes - All nodes in the model
 * @param elements - All elements in the model
 * @returns Array of nodes that are referenced by at least one element
 *
 * @example
 * const activeNodes = collectActiveNodes(nodes, elements);
 * // Returns only nodes that are used in element connectivity
 */
export function collectActiveNodes(nodes: Node[], elements: Element[]): Node[] {
  // Extract set of referenced node names
  const referencedNodeNames = new Set<string>();

  for (const element of elements) {
    referencedNodeNames.add(element.nodeI);
    referencedNodeNames.add(element.nodeJ);
  }

  // Filter nodes to only include referenced ones
  return nodes.filter((node) => referencedNodeNames.has(node.name));
}

/**
 * Validate a single element for connectivity and property issues
 *
 * @param element - Element to validate
 * @param nodes - Available nodes in the model
 * @returns Array of validation errors (empty if valid)
 */
export function validateElement(element: Element, nodes: Node[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const nodeNames = new Set(nodes.map((n) => n.name));

  // Check if nodeI exists
  if (!nodeNames.has(element.nodeI)) {
    errors.push({
      type: 'error',
      element: element.name,
      message: `Start node '${element.nodeI}' not found`,
    });
  }

  // Check if nodeJ exists
  if (!nodeNames.has(element.nodeJ)) {
    errors.push({
      type: 'error',
      element: element.name,
      message: `End node '${element.nodeJ}' not found`,
    });
  }

  // Check if start and end nodes are different
  if (element.nodeI === element.nodeJ) {
    errors.push({
      type: 'error',
      element: element.name,
      message: 'Start and end nodes cannot be the same (zero-length element)',
    });
  }

  // Check element properties
  if (element.E <= 0) {
    errors.push({
      type: 'error',
      element: element.name,
      message: `Invalid Young's modulus E: ${element.E} GPa (must be > 0)`,
    });
  }

  if (element.I <= 0) {
    errors.push({
      type: 'error',
      element: element.name,
      message: `Invalid moment of inertia I: ${element.I} m⁴ (must be > 0)`,
    });
  }

  if (element.A <= 0) {
    errors.push({
      type: 'error',
      element: element.name,
      message: `Invalid cross-section area A: ${element.A} m² (must be > 0)`,
    });
  }

  return errors;
}

/**
 * Collect and validate all elements
 *
 * @param elements - All elements in the model
 * @param nodes - All nodes in the model
 * @returns Object with valid elements and validation messages
 *
 * @example
 * const { valid, warnings } = collectActiveElements(elements, nodes);
 * if (warnings.length > 0) {
 *   console.warn('Element validation issues:', warnings);
 * }
 * // Send valid elements to solver
 */
export function collectActiveElements(
  elements: Element[],
  nodes: Node[]
): { valid: Element[]; warnings: ValidationError[] } {
  const valid: Element[] = [];
  const warnings: ValidationError[] = [];

  for (const element of elements) {
    const errors = validateElement(element, nodes);

    if (errors.length === 0) {
      valid.push(element);
    } else {
      warnings.push(...errors);
    }
  }

  return { valid, warnings };
}

/**
 * Check if the model is ready for analysis
 *
 * @param nodes - All nodes in the model
 * @param elements - All elements in the model
 * @returns Object with readiness status and validation results
 */
export function validateModelForAnalysis(nodes: Node[], elements: Element[]) {
  const elementValidation = collectActiveElements(elements, nodes);
  const activeNodes = collectActiveNodes(nodes, elements);

  return {
    isReady: elementValidation.warnings.length === 0 && elements.length > 0 && nodes.length > 0,
    elementWarnings: elementValidation.warnings,
    validElements: elementValidation.valid,
    validNodes: activeNodes,
    orphanedNodes: nodes.filter((n) => !activeNodes.includes(n)),
    totalElements: elements.length,
    totalNodes: nodes.length,
  };
}
