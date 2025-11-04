/**
 * Element Creation Utilities
 *
 * Handles the three distinct scenarios for creating elements:
 * 1. Neither start nor end node exists
 * 2. Start node exists, end node doesn't
 * 3. Start node doesn't exist, end node does
 *
 * Uses a state machine to track the creation process across two clicks.
 */

import type { Node } from '../analysis/types';

export interface ElementCreationState {
  phase: 'idle' | 'awaiting_end_node' | 'ready_to_create';
  startNodeName?: string;
  startX?: number;
  startY?: number;
  endNodeName?: string;
  endX?: number;
  endY?: number;
  snapToNode?: string; // Name of node being hovered for snap
}

export interface ElementCreationResult {
  startNodeName: string;
  endNodeName: string;
  shouldCreateStartNode?: { x: number; y: number };
  shouldCreateEndNode?: { x: number; y: number };
}

/**
 * Process first click of element creation
 * Determines if user clicked on existing node or new location
 */
export function processFirstClick(
  clickX: number,
  clickY: number,
  nearbyNode: Node | undefined
): ElementCreationState {
  // Scenario: User clicked on existing node or near empty space?
  if (nearbyNode) {
    // Start node exists - wait for end node
    return {
      phase: 'awaiting_end_node',
      startNodeName: nearbyNode.name,
      startX: nearbyNode.x,
      startY: nearbyNode.y,
    };
  } else {
    // Start node doesn't exist - need to create it, then wait for end node
    return {
      phase: 'awaiting_end_node',
      startX: clickX,
      startY: clickY,
    };
  }
}

/**
 * Process second click of element creation
 * Determines if user clicked on existing node or new location for end node
 * Validates the element creation
 */
export function processSecondClick(
  clickX: number,
  clickY: number,
  nearbyNode: Node | undefined,
  currentState: ElementCreationState,
  allNodes: Node[]
): ElementCreationResult | null {
  // Check if we have a valid start point
  if (currentState.phase !== 'awaiting_end_node' || currentState.startX === undefined || currentState.startY === undefined) {
    return null;
  }

  let startNodeName = currentState.startNodeName;
  let endNodeName: string | undefined;

  // Handle end node
  if (nearbyNode) {
    // User clicked on existing node for end
    endNodeName = nearbyNode.name;
  } else {
    // User clicked empty space to create new end node
    endNodeName = undefined; // Will be created
  }

  // Validation: Check start and end are different
  if (startNodeName && endNodeName && startNodeName === endNodeName) {
    console.warn('Cannot create element: start and end nodes are the same');
    return null;
  }

  // Validation: Check if element already exists (if both nodes exist)
  if (startNodeName && endNodeName) {
    const startNode = allNodes.find((n) => n.name === startNodeName);
    const endNode = allNodes.find((n) => n.name === endNodeName);

    if (startNode && endNode) {
      const dx = endNode.x - startNode.x;
      const dy = endNode.y - startNode.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < 0.01) {
        console.warn('Cannot create element: zero-length element');
        return null;
      }
    }
  }

  // Validation: Check distance between start and end locations
  const dx = clickX - (currentState.startX ?? 0);
  const dy = clickY - (currentState.startY ?? 0);
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 0.01) {
    console.warn('Cannot create element: zero-length element (same click position)');
    return null;
  }

  // Build result with information about what needs to be created
  const result: ElementCreationResult = {
    startNodeName: startNodeName || '', // Will need to create if empty
    endNodeName: endNodeName || '', // Will need to create if empty
  };

  // Mark nodes that need to be created
  if (!startNodeName) {
    result.shouldCreateStartNode = { x: currentState.startX, y: currentState.startY };
  }

  if (!endNodeName) {
    result.shouldCreateEndNode = { x: clickX, y: clickY };
  }

  return result;
}

/**
 * Validate that an element creation result is ready
 * Both start and end nodes must exist or be scheduled for creation
 */
export function validateElementCreation(result: ElementCreationResult): {
  valid: boolean;
  error?: string;
} {
  const startExists = result.startNodeName.length > 0;
  const startScheduled = result.shouldCreateStartNode !== undefined;
  const endExists = result.endNodeName.length > 0;
  const endScheduled = result.shouldCreateEndNode !== undefined;

  if (!startExists && !startScheduled) {
    return { valid: false, error: 'Start node missing' };
  }

  if (!endExists && !endScheduled) {
    return { valid: false, error: 'End node missing' };
  }

  return { valid: true };
}

/**
 * Get visual feedback text for current creation phase
 */
export function getCreationPhaseText(state: ElementCreationState): string {
  switch (state.phase) {
    case 'awaiting_end_node':
      if (state.startNodeName) {
        return `Selected start node: ${state.startNodeName}. Click to select end node.`;
      } else {
        return 'Clicked to create start node. Click to select end node.';
      }
    case 'ready_to_create':
      return 'Ready to create element. Press Enter to confirm.';
    default:
      return 'Click to start creating element.';
  }
}
