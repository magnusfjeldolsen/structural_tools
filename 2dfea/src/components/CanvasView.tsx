/**
 * Canvas View Component
 * Renders the 2D frame model using Konva with displaced shape using intermediate values
 */

import { Stage, Layer, Circle, Line, Text, Arrow } from 'react-konva';
import { useModelStore, useUIStore } from '../store';
import {
  diagramToFilledPath,
  calculateDiagramScale,
  getMaxDiagramValue,
} from '../visualization';

interface CanvasViewProps {
  width: number;
  height: number;
}

export function CanvasView({ width, height }: CanvasViewProps) {
  const nodes = useModelStore((state) => state.nodes);
  const elements = useModelStore((state) => state.elements);
  const loads = useModelStore((state) => state.loads);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const analysisResults = useModelStore((state) => state.analysisResults);

  const view = useUIStore((state) => state.view);
  const showGrid = useUIStore((state) => state.showGrid);
  const showLoads = useUIStore((state) => state.showLoads);
  const showSupports = useUIStore((state) => state.showSupports);
  const showDisplacedShape = useUIStore((state) => state.showDisplacedShape);
  const showMomentDiagram = useUIStore((state) => state.showMomentDiagram);
  const showShearDiagram = useUIStore((state) => state.showShearDiagram);
  const showAxialDiagram = useUIStore((state) => state.showAxialDiagram);
  const displacementScale = useUIStore((state) => state.displacementScale);
  const diagramScale = useUIStore((state) => state.diagramScale);

  // Canvas center
  const cx = width / 2;
  const cy = height / 2;

  // Scale factor for world coordinates to pixels (pixels per meter)
  const worldScale = 50 * view.scale;

  // Convert world coordinates (meters) to screen coordinates (pixels)
  const toScreen = (x: number, y: number): [number, number] => {
    return [
      cx + x * worldScale + view.x,
      cy - y * worldScale + view.y, // Flip Y axis (up is positive)
    ];
  };

  // Get node screen position
  const getNodePos = (nodeName: string): [number, number] | null => {
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) return null;
    return toScreen(node.x, node.y);
  };

  // Filter loads by active case
  const visibleLoads = loads.nodal.filter(
    (load) => !activeLoadCase || load.case === activeLoadCase
  );

  // Render grid
  const renderGrid = () => {
    if (!showGrid) return null;

    const gridLines: JSX.Element[] = [];
    const gridSpacing = 1;
    const gridPixels = gridSpacing * worldScale;
    const numLinesX = Math.ceil(width / gridPixels) + 2;
    const numLinesY = Math.ceil(height / gridPixels) + 2;

    for (let i = -numLinesX / 2; i < numLinesX / 2; i++) {
      const x = cx + i * gridPixels + (view.x % gridPixels);
      gridLines.push(
        <Line
          key={`v${i}`}
          points={[x, 0, x, height]}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    for (let i = -numLinesY / 2; i < numLinesY / 2; i++) {
      const y = cy + i * gridPixels + (view.y % gridPixels);
      gridLines.push(
        <Line
          key={`h${i}`}
          points={[0, y, width, y]}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    return <>{gridLines}</>;
  };

  // Render elements (beams)
  const renderElements = () => {
    return elements.map((element) => {
      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      return (
        <Line
          key={element.name}
          points={[posI[0], posI[1], posJ[0], posJ[1]]}
          stroke="#2196F3"
          strokeWidth={3}
          lineCap="round"
          lineJoin="round"
        />
      );
    });
  };

  // Render displaced shape using intermediate deflection values
  const renderDisplacedShape = () => {
    if (!analysisResults || !analysisResults.diagrams || !showDisplacedShape) return null;

    return elements.map((element) => {
      const diagram = analysisResults.diagrams[element.name];
      if (!diagram || !diagram.deflections) return null;

      // Get original node positions
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      // Get node displacements (global)
      const resultI = analysisResults.nodes[element.nodeI];
      const resultJ = analysisResults.nodes[element.nodeJ];
      if (!resultI || !resultJ) return null;

      // Element vector
      const dx = nodeJ.x - nodeI.x;
      const dy = nodeJ.y - nodeI.y;
      const length = Math.sqrt(dx * dx + dy * dy);

      // Unit vectors along and perpendicular to element
      const ux = dx / length; // Along element (local x)
      const uy = dy / length;
      const perpX = -uy;      // Perpendicular to element (local y)
      const perpY = ux;

      // Global displacements at ends (mm converted to m)
      const dispI_x = resultI.DX / 1000; // mm to m
      const dispI_y = resultI.DY / 1000;
      const dispJ_x = resultJ.DX / 1000;
      const dispJ_y = resultJ.DY / 1000;

      // Build displaced shape points using intermediate deflections
      const points: number[] = [];
      const n = diagram.deflections.length; // Should be 11

      for (let i = 0; i < n; i++) {
        const t = i / (n - 1); // Position along element (0 to 1)

        // Original position along element
        const origX = nodeI.x + t * dx;
        const origY = nodeI.y + t * dy;

        // Linear interpolation of global end displacements
        const globalDispX = dispI_x * (1 - t) + dispJ_x * t;
        const globalDispY = dispI_y * (1 - t) + dispJ_y * t;

        // Local deflection perpendicular to element (from diagram)
        // deflections are in mm, convert to m
        const localDefl = diagram.deflections[i] / 1000; // mm to m

        // Total displaced position =
        // original + global displacement (along element direction) + local deflection (perpendicular)
        const displX = origX + globalDispX + localDefl * perpX * displacementScale;
        const displY = origY + globalDispY + localDefl * perpY * displacementScale;

        // Convert to screen coordinates
        const [sx, sy] = toScreen(displX, displY);
        points.push(sx, sy);
      }

      return (
        <Line
          key={`displaced-${element.name}`}
          points={points}
          stroke="#FF6B6B"
          strokeWidth={2}
          lineCap="round"
          lineJoin="round"
          dash={[5, 5]}
        />
      );
    });
  };

  // Render moment diagrams
  const renderMomentDiagrams = () => {
    if (!analysisResults || !analysisResults.diagrams || !showMomentDiagram) return null;

    const maxMoment = getMaxDiagramValue(analysisResults.diagrams, 'moment');
    const scale = calculateDiagramScale(maxMoment, view.scale, 30) * diagramScale;

    return elements.map((element) => {
      const diagram = analysisResults.diagrams[element.name];
      if (!diagram) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        diagram.moments,
        scale,
        true // Flip moment diagram
      );

      return (
        <Line
          key={`moment-${element.name}`}
          points={path}
          fill="rgba(156, 39, 176, 0.3)"
          stroke="#9C27B0"
          strokeWidth={1.5}
          closed
        />
      );
    });
  };

  // Render shear diagrams
  const renderShearDiagrams = () => {
    if (!analysisResults || !analysisResults.diagrams || !showShearDiagram) return null;

    const maxShear = getMaxDiagramValue(analysisResults.diagrams, 'shear');
    const scale = calculateDiagramScale(maxShear, view.scale, 25) * diagramScale;

    return elements.map((element) => {
      const diagram = analysisResults.diagrams[element.name];
      if (!diagram) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        diagram.shears,
        scale,
        false
      );

      return (
        <Line
          key={`shear-${element.name}`}
          points={path}
          fill="rgba(255, 152, 0, 0.3)"
          stroke="#FF9800"
          strokeWidth={1.5}
          closed
        />
      );
    });
  };

  // Render axial diagrams
  const renderAxialDiagrams = () => {
    if (!analysisResults || !analysisResults.diagrams || !showAxialDiagram) return null;

    const maxAxial = getMaxDiagramValue(analysisResults.diagrams, 'axial');
    const scale = calculateDiagramScale(maxAxial, view.scale, 20) * diagramScale;

    return elements.map((element) => {
      const diagram = analysisResults.diagrams[element.name];
      if (!diagram) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        diagram.axials,
        scale,
        false
      );

      return (
        <Line
          key={`axial-${element.name}`}
          points={path}
          fill="rgba(76, 175, 80, 0.3)"
          stroke="#4CAF50"
          strokeWidth={1.5}
          closed
        />
      );
    });
  };

  // Render support symbols
  const renderSupports = () => {
    if (!showSupports) return null;

    return nodes.map((node) => {
      if (node.support === 'free') return null;

      const [sx, sy] = toScreen(node.x, node.y);
      const size = 15;

      if (node.support === 'fixed') {
        return (
          <Line
            key={`sup-${node.name}`}
            points={[sx, sy, sx - size, sy + size, sx + size, sy + size, sx, sy]}
            fill="#666"
            stroke="#000"
            strokeWidth={1}
            closed
          />
        );
      } else if (node.support === 'pinned') {
        return (
          <Circle
            key={`sup-${node.name}`}
            x={sx}
            y={sy + size / 2}
            radius={size / 2}
            fill="#fff"
            stroke="#000"
            strokeWidth={2}
          />
        );
      } else if (node.support === 'roller') {
        return (
          <>
            <Circle
              key={`sup-cir-${node.name}`}
              x={sx}
              y={sy + size / 2}
              radius={size / 2}
              fill="#fff"
              stroke="#000"
              strokeWidth={2}
            />
            <Line
              key={`sup-line-${node.name}`}
              points={[sx - size, sy + size, sx + size, sy + size]}
              stroke="#000"
              strokeWidth={2}
            />
          </>
        );
      }

      return null;
    });
  };

  // Render nodes
  const renderNodes = () => {
    return nodes.map((node) => {
      const [sx, sy] = toScreen(node.x, node.y);

      return (
        <>
          <Circle
            key={`node-${node.name}`}
            x={sx}
            y={sy}
            radius={5}
            fill="#FF5722"
            stroke="#000"
            strokeWidth={1}
          />
          <Text
            key={`label-${node.name}`}
            x={sx + 8}
            y={sy - 8}
            text={node.name}
            fontSize={12}
            fill="#000"
          />
        </>
      );
    });
  };

  // Render nodal loads as arrows
  const renderLoads = () => {
    if (!showLoads) return null;

    return visibleLoads.flatMap((load, index) => {
      const pos = getNodePos(load.node);
      if (!pos) return [];

      const [sx, sy] = pos;
      const loadScale = 5;
      const arrows: JSX.Element[] = [];

      if (Math.abs(load.fx) > 0.01) {
        const length = Math.abs(load.fx) * loadScale;
        const dir = load.fx > 0 ? 1 : -1;
        arrows.push(
          <Arrow
            key={`load-${index}-fx`}
            points={[sx - dir * length, sy, sx, sy]}
            fill="#E91E63"
            stroke="#E91E63"
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );
      }

      if (Math.abs(load.fy) > 0.01) {
        const length = Math.abs(load.fy) * loadScale;
        const dir = load.fy > 0 ? -1 : 1;
        arrows.push(
          <Arrow
            key={`load-${index}-fy`}
            points={[sx, sy - dir * length, sx, sy]}
            fill="#E91E63"
            stroke="#E91E63"
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );
      }

      return arrows;
    });
  };

  return (
    <div style={{ border: '1px solid #ccc', backgroundColor: '#fafafa' }}>
      <Stage width={width} height={height}>
        <Layer>
          {renderGrid()}
          {renderMomentDiagrams()}
          {renderShearDiagrams()}
          {renderAxialDiagrams()}
          {renderElements()}
          {renderDisplacedShape()}
          {renderSupports()}
          {renderNodes()}
          {renderLoads()}
        </Layer>
      </Stage>
    </div>
  );
}
