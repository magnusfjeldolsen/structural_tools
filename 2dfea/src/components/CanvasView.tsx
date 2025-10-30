/**
 * Canvas View Component
 * Renders the 2D frame model using Konva with clean world-coordinate system
 *
 * Coordinate System:
 * - view.centerX, view.centerY: World coordinates (meters) at canvas center
 * - view.scale: Pixels per meter (zoom level)
 * - All rendering done in world coordinates, Stage handles transform
 */

import { useRef, useState } from 'react';
import { Stage, Layer, Circle, Line, Text, Arrow } from 'react-konva';
import Konva from 'konva';
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
  const stageRef = useRef<Konva.Stage>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [lastMiddleClick, setLastMiddleClick] = useState<number>(0);
  const [mouseWorldPos, setMouseWorldPos] = useState<{ x: number; y: number } | null>(null);

  // Model store
  const nodes = useModelStore((state) => state.nodes);
  const elements = useModelStore((state) => state.elements);
  const loads = useModelStore((state) => state.loads);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const analysisResults = useModelStore((state) => state.analysisResults);
  const addNode = useModelStore((state) => state.addNode);

  // UI store
  const view = useUIStore((state) => state.view);
  const activeTool = useUIStore((state) => state.activeTool);
  const setView = useUIStore((state) => state.setView);
  const panView = useUIStore((state) => state.panView);
  const zoomView = useUIStore((state) => state.zoomView);
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

  // Convert world coordinates (meters) to screen coordinates (pixels)
  // Simple transform: world point relative to view center, scaled, then offset to canvas center
  const toScreen = (worldX: number, worldY: number): [number, number] => {
    const relX = worldX - view.centerX;
    const relY = worldY - view.centerY;
    return [
      cx + relX * view.scale,
      cy - relY * view.scale, // Flip Y axis (up is positive in world coordinates)
    ];
  };

  // Convert screen coordinates to world coordinates
  const toWorld = (screenX: number, screenY: number): [number, number] => {
    const relX = (screenX - cx) / view.scale;
    const relY = -(screenY - cy) / view.scale; // Flip Y
    return [
      view.centerX + relX,
      view.centerY + relY,
    ];
  };

  // Get node screen position
  const getNodePos = (nodeName: string): [number, number] | null => {
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) return null;
    return toScreen(node.x, node.y);
  };

  // === UTILITY FUNCTIONS ===

  const zoomToFit = () => {
    if (nodes.length === 0) {
      setView({ centerX: 0, centerY: 0, scale: 50 });
      return;
    }

    // Calculate bounding box of all nodes in world coordinates
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    nodes.forEach((node) => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    });

    // Add padding (10% of model size or minimum 1m)
    const modelWidth = maxX - minX;
    const modelHeight = maxY - minY;
    const padding = Math.max(Math.max(modelWidth, modelHeight) * 0.1, 1);

    const paddedWidth = modelWidth + 2 * padding;
    const paddedHeight = modelHeight + 2 * padding;

    // Calculate center of bounding box
    const modelCenterX = (minX + maxX) / 2;
    const modelCenterY = (minY + maxY) / 2;

    // Calculate scale to fit bounding box in canvas (use 90% of canvas)
    const scaleX = (width * 0.9) / paddedWidth;
    const scaleY = (height * 0.9) / paddedHeight;
    const newScale = Math.min(scaleX, scaleY, 500); // Cap at max zoom
    const clampedScale = Math.max(newScale, 10); // Min zoom

    // Set view to center on model center
    setView({ centerX: modelCenterX, centerY: modelCenterY, scale: clampedScale });
  };

  // === MOUSE EVENT HANDLERS ===

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    // Middle mouse button - panning or double-click to recenter
    if (e.evt.button === 1) {
      e.evt.preventDefault();

      // Check for double-click (within 300ms)
      const now = Date.now();
      if (now - lastMiddleClick < 300) {
        // Double middle-click: zoom to fit
        zoomToFit();
        setLastMiddleClick(0);
        return;
      }
      setLastMiddleClick(now);

      // Start panning
      setIsPanning(true);
      const pointerPos = stage.getPointerPosition();
      if (pointerPos) {
        setPanStart(pointerPos);
      }
      return;
    }

    // Left mouse button - tool actions
    if (e.evt.button === 0) {
      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;

      const [worldX, worldY] = toWorld(pointerPos.x, pointerPos.y);

      if (activeTool === 'draw-node') {
        // Add node at cursor position
        addNode({
          x: worldX,
          y: worldY,
          support: 'free',
        });
      }
      // TODO: Add other tool handlers (draw-element, select, etc.)
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    // Update mouse position for display - convert screen to world coordinates
    const pointerPos = stage.getPointerPosition();
    if (pointerPos) {
      const [worldX, worldY] = toWorld(pointerPos.x, pointerPos.y);
      setMouseWorldPos({ x: worldX, y: worldY });
    }

    // Handle panning
    if (isPanning && panStart) {
      const pointerPos = stage.getPointerPosition();
      if (pointerPos) {
        const dx = pointerPos.x - panStart.x;
        const dy = pointerPos.y - panStart.y;
        panView(dx, dy);
        setPanStart(pointerPos);
      }
    }

    // TODO: Handle other tool mousemove logic (rubberband, hover highlights, etc.)
  };

  const handleMouseUp = () => {
    // End panning
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }

    // TODO: Handle tool mouseup logic
  };

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;

    const pointerPos = stage.getPointerPosition();
    if (!pointerPos) return;

    const [worldX, worldY] = toWorld(pointerPos.x, pointerPos.y);

    // Zoom in/out centered on cursor
    const scaleMultiplier = e.evt.deltaY > 0 ? 0.9 : 1.1;
    zoomView(scaleMultiplier, worldX, worldY);
  };

  const handleContextMenu = (e: Konva.KonvaEventObject<PointerEvent>) => {
    e.evt.preventDefault();
    // Right-click: zoom to fit
    zoomToFit();
  };

  // Filter loads by active case
  const visibleLoads = loads.nodal.filter(
    (load) => !activeLoadCase || load.case === activeLoadCase
  );

  // Render grid (in world coordinates)
  const renderGrid = () => {
    if (!showGrid) return null;

    const gridLines: JSX.Element[] = [];
    const gridSpacing = 1; // 1 meter grid spacing

    // Calculate visible world bounds
    const [minWorldX, maxWorldY] = toWorld(0, 0);
    const [maxWorldX, minWorldY] = toWorld(width, height);

    // Extend grid slightly beyond visible area
    const startX = Math.floor(minWorldX / gridSpacing) - 1;
    const endX = Math.ceil(maxWorldX / gridSpacing) + 1;
    const startY = Math.floor(minWorldY / gridSpacing) - 1;
    const endY = Math.ceil(maxWorldY / gridSpacing) + 1;

    // Vertical lines
    for (let i = startX; i <= endX; i++) {
      const x = i * gridSpacing;
      const [sx1, sy1] = toScreen(x, minWorldY - gridSpacing);
      const [sx2, sy2] = toScreen(x, maxWorldY + gridSpacing);
      gridLines.push(
        <Line
          key={`v${i}`}
          points={[sx1, sy1, sx2, sy2]}
          stroke={i === 0 ? '#aaa' : '#e0e0e0'}
          strokeWidth={i === 0 ? 1.5 : 0.5}
        />
      );
    }

    // Horizontal lines
    for (let i = startY; i <= endY; i++) {
      const y = i * gridSpacing;
      const [sx1, sy1] = toScreen(minWorldX - gridSpacing, y);
      const [sx2, sy2] = toScreen(maxWorldX + gridSpacing, y);
      gridLines.push(
        <Line
          key={`h${i}`}
          points={[sx1, sy1, sx2, sy2]}
          stroke={i === 0 ? '#aaa' : '#e0e0e0'}
          strokeWidth={i === 0 ? 1.5 : 0.5}
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
        // original + global displacement + local deflection (perpendicular)
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
    const scale = calculateDiagramScale(maxMoment, view.scale / 50, 30) * diagramScale;

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
    const scale = calculateDiagramScale(maxShear, view.scale / 50, 25) * diagramScale;

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
    const scale = calculateDiagramScale(maxAxial, view.scale / 50, 20) * diagramScale;

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
      const size = 15; // Fixed size in pixels

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
    <div style={{ position: 'relative', border: '1px solid #ccc', backgroundColor: '#fafafa' }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
        style={{ cursor: isPanning ? 'grabbing' : activeTool === 'draw-node' ? 'crosshair' : 'default' }}
      >
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

      {/* Mouse coordinates display */}
      {mouseWorldPos && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '4px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'monospace',
            border: '1px solid #ccc',
          }}
        >
          X: {mouseWorldPos.x.toFixed(3)} m, Y: {mouseWorldPos.y.toFixed(3)} m
        </div>
      )}
    </div>
  );
}
