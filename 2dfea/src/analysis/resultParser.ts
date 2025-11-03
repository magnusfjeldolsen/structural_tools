/**
 * Result Parser - Process analysis results from worker
 *
 * IMPORTANT: All values from worker are already in engineering units!
 * - Displacements: mm
 * - Forces: kN
 * - Moments: kNm
 * - Rotations: rad
 *
 * This parser just extracts and organizes data - NO unit conversion!
 */

import type {
  AnalysisResults,
  NodeResult,
} from './types';

/**
 * Parse analysis results (currently pass-through with validation)
 *
 * In the future, this could add derived properties, summaries, etc.
 */
export function parseAnalysisResults(rawResults: AnalysisResults): AnalysisResults {
  // Validate we got results
  if (!rawResults.success) {
    throw new Error(rawResults.message || 'Analysis failed');
  }

  // Return as-is (all conversions done in backend)
  return rawResults;
}

/**
 * Get maximum displacement in model
 *
 * @param results - Analysis results
 * @returns Max displacement magnitude in mm
 */
export function getMaxDisplacement(results: AnalysisResults): {
  value: number;  // mm
  node: string;
  direction: 'DX' | 'DY' | 'DZ';
} {
  let maxValue = 0;
  let maxNode = '';
  let maxDirection: 'DX' | 'DY' | 'DZ' = 'DY';

  for (const [nodeName, data] of Object.entries(results.nodes)) {
    const dispMagnitudes = [
      { value: Math.abs(data.DX), dir: 'DX' as const },
      { value: Math.abs(data.DY), dir: 'DY' as const },
      { value: Math.abs(data.DZ), dir: 'DZ' as const },
    ];

    for (const disp of dispMagnitudes) {
      if (disp.value > maxValue) {
        maxValue = disp.value;
        maxNode = nodeName;
        maxDirection = disp.dir;
      }
    }
  }

  return { value: maxValue, node: maxNode, direction: maxDirection };
}

/**
 * Get maximum rotation in model
 *
 * @param results - Analysis results
 * @returns Max rotation magnitude in rad
 */
export function getMaxRotation(results: AnalysisResults): {
  value: number;  // rad
  node: string;
  direction: 'RX' | 'RY' | 'RZ';
} {
  let maxValue = 0;
  let maxNode = '';
  let maxDirection: 'RX' | 'RY' | 'RZ' = 'RZ';

  for (const [nodeName, data] of Object.entries(results.nodes)) {
    const rotMagnitudes = [
      { value: Math.abs(data.RX), dir: 'RX' as const },
      { value: Math.abs(data.RY), dir: 'RY' as const },
      { value: Math.abs(data.RZ), dir: 'RZ' as const },
    ];

    for (const rot of rotMagnitudes) {
      if (rot.value > maxValue) {
        maxValue = rot.value;
        maxNode = nodeName;
        maxDirection = rot.dir;
      }
    }
  }

  return { value: maxValue, node: maxNode, direction: maxDirection };
}

/**
 * Get maximum moment in model
 *
 * @param results - Analysis results
 * @returns Max moment in kNm
 */
export function getMaxMoment(results: AnalysisResults): {
  value: number;  // kNm
  element: string;
} {
  let maxValue = 0;
  let maxElement = '';

  for (const [elementName, data] of Object.entries(results.elements)) {
    if (data.max_moment > maxValue) {
      maxValue = data.max_moment;
      maxElement = elementName;
    }
  }

  return { value: maxValue, element: maxElement };
}

/**
 * Get maximum shear in model
 *
 * @param results - Analysis results
 * @returns Max shear in kN
 */
export function getMaxShear(results: AnalysisResults): {
  value: number;  // kN
  element: string;
} {
  let maxValue = 0;
  let maxElement = '';

  for (const [elementName, data] of Object.entries(results.elements)) {
    if (data.max_shear > maxValue) {
      maxValue = data.max_shear;
      maxElement = elementName;
    }
  }

  return { value: maxValue, element: maxElement };
}

/**
 * Get maximum axial force in model
 *
 * @param results - Analysis results
 * @returns Max axial force in kN (absolute value)
 */
export function getMaxAxial(results: AnalysisResults): {
  value: number;  // kN
  element: string;
  type: 'tension' | 'compression';
} {
  let maxValue = 0;
  let maxElement = '';
  let type: 'tension' | 'compression' = 'tension';

  for (const [elementName, data] of Object.entries(results.elements)) {
    const absAxial = Math.abs(data.max_axial);
    if (absAxial > maxValue) {
      maxValue = absAxial;
      maxElement = elementName;
      type = data.max_axial > 0 ? 'tension' : 'compression';
    }
  }

  return { value: maxValue, element: maxElement, type };
}

/**
 * Get total reactions at supports
 *
 * @param results - Analysis results
 * @returns Sum of all support reactions
 */
export function getTotalReactions(results: AnalysisResults): {
  FX: number;  // kN
  FY: number;  // kN
  MZ: number;  // kNm
} {
  let totalFX = 0;
  let totalFY = 0;
  let totalMZ = 0;

  for (const data of Object.values(results.nodes)) {
    totalFX += data.reactions.FX;
    totalFY += data.reactions.FY;
    totalMZ += data.reactions.MZ;
  }

  return { FX: totalFX, FY: totalFY, MZ: totalMZ };
}

/**
 * Get nodes with non-zero reactions (i.e., supports)
 */
export function getSupportNodes(results: AnalysisResults): Array<{
  name: string;
  reactions: NodeResult['reactions'];
}> {
  const supports: Array<{ name: string; reactions: NodeResult['reactions'] }> = [];

  for (const [nodeName, data] of Object.entries(results.nodes)) {
    const hasReaction =
      Math.abs(data.reactions.FX) > 1e-6 ||
      Math.abs(data.reactions.FY) > 1e-6 ||
      Math.abs(data.reactions.MZ) > 1e-6;

    if (hasReaction) {
      supports.push({
        name: nodeName,
        reactions: data.reactions,
      });
    }
  }

  return supports;
}

/**
 * Create summary object for display
 */
export interface ResultSummary {
  maxDisplacement: ReturnType<typeof getMaxDisplacement>;
  maxRotation: ReturnType<typeof getMaxRotation>;
  maxMoment: ReturnType<typeof getMaxMoment>;
  maxShear: ReturnType<typeof getMaxShear>;
  maxAxial: ReturnType<typeof getMaxAxial>;
  totalReactions: ReturnType<typeof getTotalReactions>;
  supportCount: number;
}

export function createResultSummary(results: AnalysisResults): ResultSummary {
  return {
    maxDisplacement: getMaxDisplacement(results),
    maxRotation: getMaxRotation(results),
    maxMoment: getMaxMoment(results),
    maxShear: getMaxShear(results),
    maxAxial: getMaxAxial(results),
    totalReactions: getTotalReactions(results),
    supportCount: getSupportNodes(results).length,
  };
}

/**
 * Format value with appropriate precision and unit
 */
export function formatValue(
  value: number,
  type: 'displacement' | 'rotation' | 'force' | 'moment'
): string {
  switch (type) {
    case 'displacement':
      return `${value.toFixed(2)} mm`;
    case 'rotation':
      return `${value.toFixed(6)} rad`;
    case 'force':
      return `${value.toFixed(2)} kN`;
    case 'moment':
      return `${value.toFixed(2)} kNm`;
  }
}
