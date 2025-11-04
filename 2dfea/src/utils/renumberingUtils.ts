/**
 * Renumbering Utilities
 *
 * Handles renumbering of nodes and elements with proper reference updates.
 * Uses temporary names with "_temp" suffix to maintain load/support context during renumbering.
 */

import type { Node, Element } from '../analysis/types';

export interface RenumberingMap {
  oldName: string;
  newName: string;
}

export interface RenumberingResult {
  mapping: RenumberingMap[];
  updatedNodes: Node[];
  updatedElements: Element[];
}

/**
 * Renumber nodes from bottom-left to top-right, bottom to top then left to right
 * Step 1: Create temp names (N0_temp, N1_temp, etc.)
 * Step 2: Sort nodes by Y (ascending, bottom first), then by X
 * Step 3: Create final names (N1, N2, N3, etc.)
 * Step 4: Generate mapping and updated references
 */
export function renumberNodes(
  nodes: Node[],
  elements: Element[]
): RenumberingResult {
  // Step 1: Create temporary mapping to break circular references
  const tempMapping = new Map<string, string>();
  const nodesToSort = nodes.map((node, index) => ({
    originalNode: node,
    tempName: `N${index}_temp`,
  }));

  // Record temp names
  nodesToSort.forEach((item) => {
    tempMapping.set(item.originalNode.name, item.tempName);
  });

  // Step 2: Create nodes with temp names and sort by Y (ascending), then X
  const nodesWithTemp = nodesToSort.map((item) => ({
    ...item.originalNode,
    name: item.tempName,
  }));

  // Sort by Y (ascending = bottom first in world coords), then by X
  nodesWithTemp.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.0001) {
      return a.y - b.y; // Bottom to top
    }
    return a.x - b.x; // Left to right for same Y
  });

  // Step 3: Create final mapping from temp to new names
  const finalMapping = new Map<string, string>();
  const finalNodes = nodesWithTemp.map((node, index) => {
    const newName = `N${index + 1}`;
    finalMapping.set(node.name, newName);
    return {
      ...node,
      name: newName,
    };
  });

  // Step 4: Create complete mapping (original -> final)
  const completeMapping: RenumberingMap[] = [];
  const originalToTemp = new Map(
    nodes.map((node, index) => [node.name, `N${index}_temp`])
  );

  // Build complete mapping
  originalToTemp.forEach((tempName, originalName) => {
    const finalName = finalMapping.get(tempName);
    if (finalName) {
      completeMapping.push({ oldName: originalName, newName: finalName });
    }
  });

  // Step 5: Update element references
  const updatedElements = elements.map((element) => {
    const finalNodeIName = finalMapping.get(tempMapping.get(element.nodeI)!);
    const finalNodeJName = finalMapping.get(tempMapping.get(element.nodeJ)!);

    return {
      ...element,
      nodeI: finalNodeIName || element.nodeI,
      nodeJ: finalNodeJName || element.nodeJ,
    };
  });

  return {
    mapping: completeMapping,
    updatedNodes: finalNodes,
    updatedElements: updatedElements,
  };
}

/**
 * Renumber elements based on element connectivity and position
 * Sort by: lowest nodeI Y position, then lowest nodeJ Y position, then left to right
 */
export function renumberElements(
  elements: Element[],
  nodes: Node[]
): RenumberingResult {
  // Create temporary mapping
  const tempMapping = new Map<string, string>();
  const elementsToSort = elements.map((element, index) => ({
    originalElement: element,
    tempName: `E${index}_temp`,
  }));

  // Record temp names
  elementsToSort.forEach((item) => {
    tempMapping.set(item.originalElement.name, item.tempName);
  });

  // Create elements with temp names and sort
  const elementsWithTemp = elementsToSort.map((item) => ({
    ...item.originalElement,
    name: item.tempName,
  }));

  // Create node position lookup
  const nodePos = new Map(nodes.map((n) => [n.name, { x: n.x, y: n.y }]));

  // Sort elements by node positions
  elementsWithTemp.sort((a, b) => {
    const posA_I = nodePos.get(a.nodeI);
    const posA_J = nodePos.get(a.nodeJ);
    const posB_I = nodePos.get(b.nodeI);
    const posB_J = nodePos.get(b.nodeJ);

    if (!posA_I || !posA_J || !posB_I || !posB_J) return 0;

    // Get min Y of element (lowest node)
    const minYA = Math.min(posA_I.y, posA_J.y);
    const minYB = Math.min(posB_I.y, posB_J.y);

    if (Math.abs(minYA - minYB) > 0.0001) {
      return minYA - minYB; // Bottom to top
    }

    // If same Y, sort by min X
    const minXA = Math.min(posA_I.x, posA_J.x);
    const minXB = Math.min(posB_I.x, posB_J.x);

    if (Math.abs(minXA - minXB) > 0.0001) {
      return minXA - minXB; // Left to right
    }

    return 0;
  });

  // Create final mapping from temp to new names
  const finalMapping = new Map<string, string>();
  const finalElements = elementsWithTemp.map((element, index) => {
    const newName = `E${index + 1}`;
    finalMapping.set(element.name, newName);
    return {
      ...element,
      name: newName,
    };
  });

  // Create complete mapping (original -> final)
  const completeMapping: RenumberingMap[] = [];
  const originalToTemp = new Map(
    elements.map((element, index) => [element.name, `E${index}_temp`])
  );

  originalToTemp.forEach((tempName, originalName) => {
    const finalName = finalMapping.get(tempName);
    if (finalName) {
      completeMapping.push({ oldName: originalName, newName: finalName });
    }
  });

  return {
    mapping: completeMapping,
    updatedNodes: nodes, // Nodes unchanged for element renumbering
    updatedElements: finalElements,
  };
}

/**
 * Get a human-readable summary of renumbering changes
 */
export function getRenumberingSummary(mapping: RenumberingMap[]): string {
  const lines = mapping.map((m) => `${m.oldName} → ${m.newName}`);
  return lines.join('\n');
}

/**
 * Extract the next node number to use after renumbering
 * Looks for highest Nxxx number and returns next number
 * For example: [N1, N2, N5] -> returns 6
 */
export function getNextNodeNumber(nodes: Node[]): number {
  if (nodes.length === 0) return 1;

  let maxNum = 0;
  for (const node of nodes) {
    const match = node.name.match(/^N(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      maxNum = Math.max(maxNum, num);
    }
  }

  return maxNum + 1;
}

/**
 * Extract the next element number to use after renumbering
 * Looks for highest Exxx number and returns next number
 * For example: [E1, E2, E5] -> returns 6
 */
export function getNextElementNumber(elements: Element[]): number {
  if (elements.length === 0) return 1;

  let maxNum = 0;
  for (const element of elements) {
    const match = element.name.match(/^E(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      maxNum = Math.max(maxNum, num);
    }
  }

  return maxNum + 1;
}
