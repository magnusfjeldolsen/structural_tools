/**
 * Canvas View Component
 * Renders the 2D frame model using Konva
 *
 * Features:
 * - Renders nodes as circles with support symbols
 * - Renders elements as lines with member properties
 * - Renders loads as arrows
 * - Pan and zoom controls
 * - Grid background
 * - Interactive selection
 */

import { Stage, Layer, Circle, Line, Text, Arrow } from 'react-konva';
import { useModelStore, useUIStore } from '../store';

interface CanvasViewProps {
  width: number;
  height: number;
}

export function CanvasView({ width, height }: CanvasViewProps) {
  const nodes = useModelStore((state) => state.nodes);
  const elements = useModelStore((state) => state.elements);
  const loads = useModelStore((state) => state.loads);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);

  const view = useUIStore((state) => state.view);
  const showGrid = useUIStore((state) => state.showGrid);
  const showLoads = useUIStore((state) => state.showLoads);
  const showSupports = useUIStore((state) => state.showSupports);

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
    const gridSpacing = 1; // 1 meter in world coordinates
    const gridPixels = gridSpacing * worldScale;
    const numLinesX = Math.ceil(width / gridPixels) + 2;
    const numLinesY = Math.ceil(height / gridPixels) + 2;

    // Vertical lines
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

    // Horizontal lines
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

  // Render support symbols
  const renderSupports = () => {
    if (!showSupports) return null;

    return nodes.map((node) => {
      if (node.support === 'free') return null;

      const [sx, sy] = toScreen(node.x, node.y);
      const size = 15;

      if (node.support === 'fixed') {
        // Fixed support: triangle
        return (
          <Line
            key={`sup-${node.name}`}
            points={[
              sx, sy,
              sx - size, sy + size,
              sx + size, sy + size,
              sx, sy,
            ]}
            fill="#666"
            stroke="#000"
            strokeWidth={1}
            closed
          />
        );
      } else if (node.support === 'pinned') {
        // Pinned support: circle
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
        // Roller support: circle on line
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

    return visibleLoads.map((load, index) => {
      const pos = getNodePos(load.node);
      if (!pos) return null;

      const [sx, sy] = pos;
      const loadScale = 5; // pixels per kN

      const arrows: JSX.Element[] = [];

      // Render FX (horizontal force)
      if (Math.abs(load.fx) > 0.01) {
        const length = Math.abs(load.fx) * loadScale;
        const dir = load.fx > 0 ? 1 : -1;
        arrows.push(
          <Arrow
            key={`fx-${index}`}
            points={[sx - dir * length, sy, sx, sy]}
            fill="#E91E63"
            stroke="#E91E63"
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );
      }

      // Render FY (vertical force)
      if (Math.abs(load.fy) > 0.01) {
        const length = Math.abs(load.fy) * loadScale;
        const dir = load.fy > 0 ? -1 : 1; // Flip because screen Y is inverted
        arrows.push(
          <Arrow
            key={`fy-${index}`}
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
          {renderElements()}
          {renderSupports()}
          {renderNodes()}
          {renderLoads()}
        </Layer>
      </Stage>
    </div>
  );
}
