/**
 * Scaling Utilities
 * Calculate automatic scaling for displaced shapes and diagrams
 * Based on max element length to ensure consistent visualization
 */

import { Node, Element, AnalysisResults, Loads } from '../analysis/types';

/**
 * Get maximum element length in the structure
 * Used as reference for all scaling calculations
 * Note: This function requires both nodes and elements - use calculateMaxElementLength instead
 */
export function getMaxElementLength(elements: Element[]): number {
  if (elements.length === 0) return 1; // Default fallback
  // This function is kept for backwards compatibility but requires additional context
  // Use calculateMaxElementLength(nodes, elements) for proper calculation
  return 1;
}

/**
 * Calculate max element length from nodes and elements
 */
export function calculateMaxElementLength(nodes: Node[], elements: Element[]): number {
  if (elements.length === 0 || nodes.length === 0) return 1;

  let maxLength = 0;
  for (const elem of elements) {
    const nodeI = nodes.find((n) => n.name === elem.nodeI);
    const nodeJ = nodes.find((n) => n.name === elem.nodeJ);

    if (nodeI && nodeJ) {
      const dx = nodeJ.x - nodeI.x;
      const dy = nodeJ.y - nodeI.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      maxLength = Math.max(maxLength, length);
    }
  }

  return maxLength > 0 ? maxLength : 1;
}

/**
 * Calculate max displacement magnitude from analysis results
 */
export function calculateMaxDisplacement(analysisResults: AnalysisResults | null): number {
  if (!analysisResults || !analysisResults.nodes) return 1;

  let maxDisp = 0;
  for (const nodeName in analysisResults.nodes) {
    const nodeResult = analysisResults.nodes[nodeName];
    const magnitude = Math.sqrt(nodeResult.DX * nodeResult.DX + nodeResult.DY * nodeResult.DY);
    maxDisp = Math.max(maxDisp, magnitude);
  }

  return maxDisp > 0 ? maxDisp : 1;
}

/**
 * Calculate automatic displacement scale factor
 * Max displacement shown = maxElementLength / 20
 *
 * scale = (maxElementLength / 20) / maxDisplacement
 */
export function calculateDisplacementScale(
  nodes: Node[],
  elements: Element[],
  analysisResults: AnalysisResults | null
): number {
  const maxElementLength = calculateMaxElementLength(nodes, elements);
  const maxDisplacement = calculateMaxDisplacement(analysisResults);

  const targetSize = maxElementLength / 20;
  return targetSize / maxDisplacement;
}

/**
 * Get min and max values from diagram
 */
export function calculateDiagramExtremes(values: number[]): { min: number; max: number } {
  if (values.length === 0) {
    return { min: 0, max: 1 };
  }

  let min = values[0];
  let max = values[0];

  for (const val of values) {
    min = Math.min(min, val);
    max = Math.max(max, val);
  }

  return { min, max };
}

/**
 * Calculate automatic diagram scale factor
 * Diagram max extent = maxElementLength / 20
 *
 * scale = (maxElementLength / 20) / maxAbsValue
 */
export function calculateDiagramScale(
  nodes: Node[],
  elements: Element[],
  diagramValues: number[]
): number {
  const maxElementLength = calculateMaxElementLength(nodes, elements);
  const { min, max } = calculateDiagramExtremes(diagramValues);

  const maxAbsValue = Math.max(Math.abs(min), Math.abs(max));
  if (maxAbsValue === 0) return 1;

  const targetSize = maxElementLength / 20;
  return targetSize / maxAbsValue;
}

/**
 * Find the index positions of min and max values in diagram
 * Returns array indices for each element
 */
export function findDiagramExtremeIndices(values: number[]): { minIndex: number; maxIndex: number } {
  if (values.length === 0) {
    return { minIndex: 0, maxIndex: 0 };
  }

  let minIndex = 0;
  let maxIndex = 0;
  let minVal = values[0];
  let maxVal = values[0];

  for (let i = 0; i < values.length; i++) {
    if (values[i] < minVal) {
      minVal = values[i];
      minIndex = i;
    }
    if (values[i] > maxVal) {
      maxVal = values[i];
      maxIndex = i;
    }
  }

  return { minIndex, maxIndex };
}

/**
 * Calculate maximum load magnitude across all visible loads
 * Filters by activeLoadCase if provided
 */
export function calculateMaxLoadMagnitude(
  loads: Loads,
  activeLoadCase: string | null
): number {
  let maxMagnitude = 0;

  // Check nodal loads
  for (const load of loads.nodal) {
    if (!activeLoadCase || load.case === activeLoadCase) {
      const fxMag = Math.abs(load.fx);
      const fyMag = Math.abs(load.fy);
      const totalForce = Math.sqrt(fxMag * fxMag + fyMag * fyMag);
      maxMagnitude = Math.max(maxMagnitude, totalForce);
      maxMagnitude = Math.max(maxMagnitude, Math.abs(load.mz));
    }
  }

  // Check distributed loads
  for (const load of loads.distributed) {
    if (!activeLoadCase || load.case === activeLoadCase) {
      maxMagnitude = Math.max(maxMagnitude, Math.abs(load.w1));
      maxMagnitude = Math.max(maxMagnitude, Math.abs(load.w2));
    }
  }

  // Check element point loads
  for (const load of loads.elementPoint) {
    if (!activeLoadCase || load.case === activeLoadCase) {
      maxMagnitude = Math.max(maxMagnitude, Math.abs(load.magnitude));
    }
  }

  return maxMagnitude > 0 ? maxMagnitude : 1;
}

/**
 * Calculate load arrow scale factor
 * Target: largest load arrow = 1/20 of longest element
 *
 * scale = (maxElementLength / 20) / maxLoadMagnitude
 */
export function calculateLoadArrowScale(
  nodes: Node[],
  elements: Element[],
  loads: Loads,
  activeLoadCase: string | null
): number {
  const maxElementLength = calculateMaxElementLength(nodes, elements);
  const maxLoadMagnitude = calculateMaxLoadMagnitude(loads, activeLoadCase);

  if (maxLoadMagnitude === 0) return 1;

  // Target: largest load arrow = 1/20 of longest element
  const targetSize = maxElementLength / 20;
  return targetSize / maxLoadMagnitude;
}
