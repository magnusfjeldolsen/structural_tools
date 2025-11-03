/**
 * Canvas View Component
 * Renders the 2D frame model using Konva with clean world-coordinate system
 *
 * Coordinate System:
 * - view.centerX, view.centerY: World coordinates (meters) at canvas center
 * - view.scale: Pixels per meter (zoom level)
 * - All rendering done in world coordinates, Stage handles transform
 */

import { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Circle, Line, Text, Arrow, Group } from 'react-konva';
import Konva from 'konva';
import { useModelStore, useUIStore } from '../store';
import {
  diagramToFilledPath,
  calculateDiagramScale,
  getMaxDiagramValue,
} from '../visualization';
import { findNearestNode, findNearestElement, getSnappedPosition } from '../geometry/snapUtils';
import { calculateDeformedElementShape } from '../geometry/deformationUtils';
import { findNodesInRect, findElementsInRect } from '../geometry/selectionUtils';

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
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number; isShift: boolean } | null>(null);

  // Model store
  const nodes = useModelStore((state) => state.nodes);
  const elements = useModelStore((state) => state.elements);
  const loads = useModelStore((state) => state.loads);
  const activeLoadCase = useModelStore((state) => state.activeLoadCase);
  const analysisResults = useModelStore((state) => state.analysisResults);
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectedElements = useModelStore((state) => state.selectedElements);
  const addNode = useModelStore((state) => state.addNode);
  const addElement = useModelStore((state) => state.addElement);
  const updateNode = useModelStore((state) => state.updateNode);
  const deleteNode = useModelStore((state) => state.deleteNode);
  const deleteElement = useModelStore((state) => state.deleteElement);
  const selectNode = useModelStore((state) => state.selectNode);
  const selectElement = useModelStore((state) => state.selectElement);
  const selectNodesInRect = useModelStore((state) => state.selectNodesInRect);
  const selectElementsInRect = useModelStore((state) => state.selectElementsInRect);
  const selectLoad = useModelStore((state) => state.selectLoad);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const deleteSelectedLoads = useModelStore((state) => state.deleteSelectedLoads);
  const moveNodes = useModelStore((state) => state.moveNodes);
  const addNodalLoad = useModelStore((state) => state.addNodalLoad);
  const addElementPointLoad = useModelStore((state) => state.addElementPointLoad);
  const addDistributedLoad = useModelStore((state) => state.addDistributedLoad);

  // UI store
  const view = useUIStore((state) => state.view);
  const activeTool = useUIStore((state) => state.activeTool);
  const activeTab = useUIStore((state) => state.activeTab);
  const loadCreationMode = useUIStore((state) => state.loadCreationMode);
  const loadParameters = useUIStore((state) => state.loadParameters);
  const cancelLoadCreation = useUIStore((state) => state.cancelLoadCreation);
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

  // Snapping state
  const snapEnabled = useUIStore((state) => state.snapEnabled);
  const snapToNodes = useUIStore((state) => state.snapToNodes);
  const snapToElements = useUIStore((state) => state.snapToElements);
  const snapTolerance = useUIStore((state) => state.snapTolerance);
  const hoveredNode = useUIStore((state) => state.hoveredNode);
  const hoveredElement = useUIStore((state) => state.hoveredElement);
  const hoveredLoad = useUIStore((state) => state.hoveredLoad);
  const setHoveredNode = useUIStore((state) => state.setHoveredNode);
  const setHoveredElement = useUIStore((state) => state.setHoveredElement);
  const setHoveredLoad = useUIStore((state) => state.setHoveredLoad);

  // Drawing state
  const drawingElement = useUIStore((state) => state.drawingElement);
  const setDrawingElement = useUIStore((state) => state.setDrawingElement);
  const clearDrawingElement = useUIStore((state) => state.clearDrawingElement);

  // Selection and move state
  const selectionRect = useUIStore((state) => state.selectionRect);
  const setSelectionRect = useUIStore((state) => state.setSelectionRect);
  const moveCommand = useUIStore((state) => state.moveCommand);
  const setMoveBasePoint = useUIStore((state) => state.setMoveBasePoint);
  const setMoveStage = useUIStore((state) => state.setMoveStage);
  const clearMoveCommand = useUIStore((state) => state.clearMoveCommand);
  const commandInput = useUIStore((state) => state.commandInput);
  const setCommandInput = useUIStore((state) => state.setCommandInput);

  // Cursor position
  const setCursorPosition = useUIStore((state) => state.setCursorPosition);

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

  // === KEYBOARD EVENT HANDLERS ===

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if command input is already visible
      if (commandInput?.visible) return;

      // Escape key handling
      if (e.key === 'Escape') {
        // Cancel load creation mode if active
        if (loadCreationMode) {
          cancelLoadCreation();
          return;
        }

        // Cancel selection rectangle if active
        if (selectionStart) {
          setSelectionStart(null);
          setSelectionRect(null);
          return;
        }

        // Cancel drawing if active
        if (drawingElement) {
          clearDrawingElement();
          return;
        }
      }

      // Space bar during move command - show coordinate input
      if (e.key === ' ' && moveCommand) {
        e.preventDefault();
        if (moveCommand.stage === 'awaiting-basepoint-click') {
          setCommandInput({
            visible: true,
            prompt: 'Enter base point (X,Y):',
            value: '',
            error: null,
          });
          setMoveStage('awaiting-basepoint-input');
        } else if (moveCommand.stage === 'awaiting-endpoint-click') {
          setCommandInput({
            visible: true,
            prompt: 'Enter end point (X,Y or dX,Y):',
            value: '',
            error: null,
          });
          setMoveStage('awaiting-endpoint-input');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [drawingElement, clearDrawingElement, moveCommand, commandInput, setCommandInput, setMoveStage, selectionStart, loadCreationMode, cancelLoadCreation]);

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
      const isShiftPressed = e.evt.shiftKey;

      // Priority 1: Check for active move command first
      if (moveCommand?.stage === 'awaiting-basepoint-click') {
        // Set base point by click - use centralized snapping
        const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);
        setMoveBasePoint(snappedPos);
        return;
      } else if (moveCommand?.stage === 'awaiting-endpoint-click') {
        // Set end point by click and execute move - use centralized snapping
        const basePoint = moveCommand.basePoint;
        if (basePoint) {
          const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);
          const dx = snappedPos.x - basePoint.x;
          const dy = snappedPos.y - basePoint.y;
          moveNodes(selectedNodes, dx, dy);
          clearMoveCommand();
        }
        return;
      }

      // Priority 1.5: Load creation mode - interactive selection
      if (loadCreationMode && loadParameters) {
        if (loadCreationMode === 'nodal' && hoveredNode) {
          // Apply nodal load to clicked node
          addNodalLoad({
            node: hoveredNode,
            fx: loadParameters.fx || 0,
            fy: loadParameters.fy || 0,
            mz: loadParameters.mz || 0,
            case: loadParameters.case,
          });
          // Brief visual feedback - could add highlighting here
          return;
        } else if ((loadCreationMode === 'point' || loadCreationMode === 'distributed' || loadCreationMode === 'lineLoad') && hoveredElement) {
          // Apply element load to clicked element
          if (loadCreationMode === 'point') {
            addElementPointLoad({
              element: hoveredElement,
              distance: loadParameters.distance || 0,
              direction: (loadParameters.direction || 'Fy') as 'Fx' | 'Fy' | 'Mz',
              magnitude: loadParameters.magnitude || 0,
              case: loadParameters.case,
            });
          } else if (loadCreationMode === 'lineLoad') {
            // Line load: distributed load across entire element (can be uniform or varying)
            // Get element length to calculate x2
            const element = elements.find((el) => el.name === hoveredElement);
            if (element) {
              const startNode = nodes.find((n) => n.name === element.nodeI);
              const endNode = nodes.find((n) => n.name === element.nodeJ);
              if (startNode && endNode) {
                const dx = endNode.x - startNode.x;
                const dy = endNode.y - startNode.y;
                const elementLength = Math.sqrt(dx * dx + dy * dy);

                // Apply distributed load across entire element (x1=0, x2=length, w1 and w2 from user input)
                addDistributedLoad({
                  element: hoveredElement,
                  direction: (loadParameters.direction || 'Fy') as 'Fx' | 'Fy',
                  w1: loadParameters.w1 || 0,
                  w2: loadParameters.w2 || 0,
                  x1: 0,
                  x2: elementLength,
                  case: loadParameters.case,
                });
              }
            }
          } else {
            // distributed load with custom distribution
            addDistributedLoad({
              element: hoveredElement,
              direction: (loadParameters.direction || 'Fy') as 'Fx' | 'Fy',
              w1: loadParameters.w1 || 0,
              w2: loadParameters.w2 || 0,
              x1: loadParameters.x1 || 0,
              x2: loadParameters.x2 || 0,
              case: loadParameters.case,
            });
          }
          // Brief visual feedback - could add highlighting here
          return;
        }
      }

      // Priority 2: Regular tool behavior
      if (activeTool === 'select') {
        // Tab-based selection filtering
        if (activeTab === 'structure') {
          // Structure tab: only select nodes and elements
          if (selectionStart) {
            // Second click - finalize selection rectangle
            const rect = {
              x1: selectionStart.x,
              y1: selectionStart.y,
              x2: worldX,
              y2: worldY,
            };

            // Determine selection mode based on drag direction
            const mode: 'window' | 'crossing' = rect.x2 > rect.x1 ? 'window' : 'crossing';

            // Check if this was just a click (very small rectangle)
            const dragDistance = Math.sqrt(
              Math.pow(rect.x2 - rect.x1, 2) + Math.pow(rect.y2 - rect.y1, 2)
            );

            if (dragDistance > 0.1) {
              // Significant rectangle - perform selection
              const newNodeNames = findNodesInRect(nodes, rect);
              const newElementNames = findElementsInRect(nodes, elements, rect, mode);

              if (selectionStart.isShift) {
                // Toggle selection (add if not selected, remove if selected)
                newNodeNames.forEach((name: string) => {
                  selectNode(name, true); // true = additive/toggle mode
                });
                newElementNames.forEach((name: string) => {
                  selectElement(name, true); // true = additive/toggle mode
                });
              } else {
                // Replace selection
                selectNodesInRect(rect, mode);
                selectElementsInRect(rect, mode);
              }
            }

            // Clear selection rectangle
            setSelectionStart(null);
            setSelectionRect(null);
          } else {
            // First click - start selection rectangle or select entity
            if (hoveredNode) {
              // Clicked on a node - toggle if Shift is pressed
              selectNode(hoveredNode, isShiftPressed);
            } else if (hoveredElement) {
              // Clicked on an element - toggle if Shift is pressed
              selectElement(hoveredElement, isShiftPressed);
            } else {
              // Start selection rectangle
              if (!isShiftPressed) {
                clearSelection();
              }
              setSelectionStart({ x: worldX, y: worldY, isShift: isShiftPressed });
              setSelectionRect({ x1: worldX, y1: worldY, x2: worldX, y2: worldY });
            }
          }
        } else if (activeTab === 'loads') {
          // Loads tab: only select loads (handled by load click handlers)
          // Clear geometry selection when switching to loads tab
          if (selectedNodes.length > 0 || selectedElements.length > 0) {
            clearSelection();
          }
        }
      } else if (activeTool === 'draw-node') {
        // Add node at cursor position - use centralized snapping
        const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);
        addNode({
          x: snappedPos.x,
          y: snappedPos.y,
          support: 'free',
        });
      } else if (activeTool === 'draw-element') {
        if (!drawingElement) {
          // First click - start drawing
          let startNode: string;
          const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);

          if (hoveredNode) {
            // Snapped to existing node
            startNode = hoveredNode;
          } else {
            // Create new node at snapped position
            addNode({
              x: snappedPos.x,
              y: snappedPos.y,
              support: 'free',
            });
            // Get the newly created node name (last node in array)
            startNode = `N${nodes.length + 1}`;
          }

          setDrawingElement({
            startNode,
            startPos: snappedPos
          });
        } else {
          // Second click - complete element
          let endNode: string;
          const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);

          if (hoveredNode && hoveredNode !== drawingElement.startNode) {
            // Snapped to existing node (and not the same as start)
            endNode = hoveredNode;
          } else {
            // Create new node at snapped position
            addNode({
              x: snappedPos.x,
              y: snappedPos.y,
              support: 'free',
            });
            // Get the newly created node name
            endNode = `N${nodes.length + 1}`;
          }

          // Create element with default properties
          if (drawingElement.startNode) {
            addElement({
              nodeI: drawingElement.startNode,
              nodeJ: endNode,
              E: 210,      // GPa (steel)
              I: 1e-4,     // m^4
              A: 1e-3,     // m^2
            });
          }

          // Clear drawing state
          clearDrawingElement();
        }
      } else if (activeTool === 'delete') {
        // Delete mode: delete hovered entity (structure) or selected loads
        if (activeTab === 'loads' && hoveredLoad) {
          // Delete mode in Loads tab: delete hoveredLoad or selected loads
          selectLoad(hoveredLoad.type, hoveredLoad.index, false);
          deleteSelectedLoads();
          setHoveredLoad(null);
        } else if (activeTab === 'structure') {
          // Delete mode in Structure tab: delete nodes/elements
          // Priority: nodes > elements (nodes delete connected elements and loads automatically)
          // If node has a support, first remove the support, then delete the node on second click
          if (hoveredNode) {
            const node = nodes.find(n => n.name === hoveredNode);
            if (node && node.support !== 'free') {
              // Node has a support - remove it first
              updateNode(hoveredNode, { support: 'free' });
            } else {
              // Node has no support - delete it
              deleteNode(hoveredNode);
              // Clear hover state after deletion
              setHoveredNode(null);
              setHoveredElement(null);
            }
          } else if (hoveredElement) {
            deleteElement(hoveredElement);
            // Clear hover state after deletion
            setHoveredElement(null);
          }
        }
      } else if (activeTool === 'add-support') {
        // Legacy: cycle through support types when clicking a node
        if (hoveredNode) {
          const node = nodes.find(n => n.name === hoveredNode);
          if (node) {
            // Cycle through support types: free -> pinned -> fixed -> roller-x -> roller-y -> free
            const supportCycle: Array<'free' | 'pinned' | 'fixed' | 'roller-x' | 'roller-y'> =
              ['free', 'pinned', 'fixed', 'roller-x', 'roller-y'];
            const currentIndex = supportCycle.indexOf(node.support);
            const nextIndex = (currentIndex + 1) % supportCycle.length;
            const nextSupport = supportCycle[nextIndex];

            updateNode(hoveredNode, { support: nextSupport });
          }
        }
      } else if (activeTool === 'support-fixed') {
        // Fixed support: apply fixed support to clicked node
        if (hoveredNode) {
          updateNode(hoveredNode, { support: 'fixed' });
        }
      } else if (activeTool === 'support-pinned') {
        // Pinned support: apply pinned support to clicked node
        if (hoveredNode) {
          updateNode(hoveredNode, { support: 'pinned' });
        }
      } else if (activeTool === 'support-roller-x') {
        // Roller-X support: apply roller-x support to clicked node
        if (hoveredNode) {
          updateNode(hoveredNode, { support: 'roller-x' });
        }
      } else if (activeTool === 'support-roller-y') {
        // Roller-Y support: apply roller-y support to clicked node
        if (hoveredNode) {
          updateNode(hoveredNode, { support: 'roller-y' });
        }
      }
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
      setCursorPosition({ x: worldX, y: worldY });

      // Snapping detection
      if (snapEnabled) {
        // Convert tolerance from pixels to world units
        const worldTolerance = snapTolerance / view.scale;

        let nearestNode: string | null = null;
        let nearestElement: string | null = null;

        // Check for nearest node first (nodes have priority)
        if (snapToNodes) {
          const nearest = findNearestNode(nodes, { x: worldX, y: worldY }, worldTolerance);
          if (nearest) {
            nearestNode = nearest.name;
          }
        }

        // Check for nearest element only if no node is snapped
        if (snapToElements && !nearestNode) {
          const nearest = findNearestElement(nodes, elements, { x: worldX, y: worldY }, worldTolerance);
          if (nearest) {
            nearestElement = nearest.name;
          }
        }

        // Update hover state
        setHoveredNode(nearestNode);
        setHoveredElement(nearestElement);
      } else {
        // Clear hover state when snapping is disabled
        setHoveredNode(null);
        setHoveredElement(null);
      }
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

    // Update selection rectangle preview while moving mouse
    if (activeTool === 'select' && selectionStart && pointerPos) {
      const [worldX, worldY] = toWorld(pointerPos.x, pointerPos.y);
      setSelectionRect({
        x1: selectionStart.x,
        y1: selectionStart.y,
        x2: worldX,
        y2: worldY,
      });
    }
  };

  const handleMouseUp = () => {
    // End panning
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
    }
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

      const isHovered = hoveredElement === element.name;

      // Calculate midpoint for label
      const midX = (posI[0] + posJ[0]) / 2;
      const midY = (posI[1] + posJ[1]) / 2;

      return (
        <>
          <Line
            key={element.name}
            points={[posI[0], posI[1], posJ[0], posJ[1]]}
            stroke={isHovered ? "#00FFFF" : "#2196F3"}
            strokeWidth={isHovered ? 5 : 3}
            lineCap="round"
            lineJoin="round"
          />
          <Text
            key={`label-${element.name}`}
            x={midX}
            y={midY - 10}
            text={element.name}
            fontSize={12}
            fill="#2196F3"
            fontStyle="bold"
            offsetX={element.name.length * 3}
          />
        </>
      );
    });
  };

  // Render displaced shape using globally correct deformation
  const renderDisplacedShape = () => {
    if (!analysisResults || !analysisResults.diagrams || !showDisplacedShape) return null;

    return elements.map((element) => {
      const diagram = analysisResults.diagrams[element.name];
      if (!diagram || !diagram.deflections_dx || !diagram.deflections_dy) return null;

      // Get node objects
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      // Calculate deformed shape using utility function with both deflection components
      const deformedPoints = calculateDeformedElementShape(
        nodeI,
        nodeJ,
        analysisResults,
        diagram.deflections_dx,  // Local axial deflections
        diagram.deflections_dy,  // Local perpendicular deflections
        displacementScale
      );

      if (deformedPoints.length === 0) return null;

      // Convert world coordinates to screen coordinates
      const screenPoints: number[] = [];
      for (const point of deformedPoints) {
        const [sx, sy] = toScreen(point.x, point.y);
        screenPoints.push(sx, sy);
      }

      return (
        <Line
          key={`displaced-${element.name}`}
          points={screenPoints}
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
        // Fixed support: draw an X
        const offset = size * 0.6;
        return (
          <Group key={`sup-${node.name}`}>
            <Line
              points={[sx - offset, sy - offset, sx + offset, sy + offset]}
              stroke="#000"
              strokeWidth={2.5}
            />
            <Line
              points={[sx + offset, sy - offset, sx - offset, sy + offset]}
              stroke="#000"
              strokeWidth={2.5}
            />
          </Group>
        );
      } else if (node.support === 'pinned') {
        // Pinned support: circle
        return (
          <Circle
            key={`sup-${node.name}`}
            x={sx}
            y={sy}
            radius={size / 2}
            fill="#fff"
            stroke="#000"
            strokeWidth={2}
          />
        );
      } else if (node.support === 'roller-x') {
        // Roller-X: circle with horizontal line below
        return (
          <Group key={`sup-${node.name}`}>
            <Circle
              x={sx}
              y={sy - size / 4}
              radius={size / 2}
              fill="#fff"
              stroke="#000"
              strokeWidth={2}
            />
            <Line
              points={[sx - size * 0.8, sy + size * 0.6, sx + size * 0.8, sy + size * 0.6]}
              stroke="#000"
              strokeWidth={2.5}
            />
          </Group>
        );
      } else if (node.support === 'roller-y') {
        // Roller-Y: circle with vertical line below
        return (
          <Group key={`sup-${node.name}`}>
            <Circle
              x={sx}
              y={sy - size / 4}
              radius={size / 2}
              fill="#fff"
              stroke="#000"
              strokeWidth={2}
            />
            <Line
              points={[sx, sy + size * 0.2, sx, sy + size * 0.8]}
              stroke="#000"
              strokeWidth={2.5}
            />
          </Group>
        );
      }

      return null;
    });
  };

  // Render nodes
  const renderNodes = () => {
    return nodes.map((node) => {
      const [sx, sy] = toScreen(node.x, node.y);
      const isHovered = hoveredNode === node.name;

      return (
        <>
          <Circle
            key={`node-${node.name}`}
            x={sx}
            y={sy}
            radius={isHovered ? 7 : 5}
            fill={isHovered ? "#00FFFF" : "#FF5722"}
            stroke={isHovered ? "#00AAAA" : "#000"}
            strokeWidth={isHovered ? 2 : 1}
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

  // Render nodal loads as arrows (only visible in Loads tab)
  const renderLoads = () => {
    if (!showLoads || activeTab !== 'loads') return null;

    const allElements: JSX.Element[] = [];
    const loadScale = 5;
    const arrowColor = '#E91E63';

    // Render nodal loads
    visibleLoads.forEach((load, index) => {
      const pos = getNodePos(load.node);
      if (!pos) return;

      const [sx, sy] = pos;

      if (Math.abs(load.fx) > 0.01) {
        const length = Math.abs(load.fx) * loadScale;
        const dir = load.fx > 0 ? 1 : -1;
        const arrowStartX = sx - dir * length;
        const labelX = (sx + arrowStartX) / 2;

        allElements.push(
          <Arrow
            key={`nodal-load-${index}-fx`}
            points={[arrowStartX, sy, sx, sy]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Add label showing magnitude
        allElements.push(
          <Text
            key={`nodal-load-${index}-fx-label`}
            x={labelX}
            y={sy - 12}
            text={Math.abs(load.fx).toFixed(1)}
            fontSize={10}
            fill={arrowColor}
            align="center"
            offsetX={Math.abs(load.fx).toFixed(1).length * 3}
          />
        );
      }

      if (Math.abs(load.fy) > 0.01) {
        const length = Math.abs(load.fy) * loadScale;
        const dir = load.fy > 0 ? -1 : 1;
        const arrowStartY = sy - dir * length;
        const labelY = (sy + arrowStartY) / 2;

        allElements.push(
          <Arrow
            key={`nodal-load-${index}-fy`}
            points={[sx, arrowStartY, sx, sy]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Add label showing magnitude
        allElements.push(
          <Text
            key={`nodal-load-${index}-fy-label`}
            x={sx + 8}
            y={labelY}
            text={Math.abs(load.fy).toFixed(1)}
            fontSize={10}
            fill={arrowColor}
            align="left"
            offsetY={5}
          />
        );
      }
    });

    // Render distributed loads (trapezoids/rectangles with arrows at ends)
    const visibleDistributedLoads = loads.distributed.filter(
      (load) => !activeLoadCase || load.case === activeLoadCase
    );

    visibleDistributedLoads.forEach((load, index) => {
      const element = elements.find((el) => el.name === load.element);
      if (!element) return;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return;

      const [x1, y1] = toScreen(nodeI.x, nodeI.y);
      const [x2, y2] = toScreen(nodeJ.x, nodeJ.y);

      // Element vector and perpendicular offset
      const dx = x2 - x1;
      const dy = y2 - y1;
      const elementLength = Math.sqrt(dx * dx + dy * dy);

      if (elementLength < 1) return; // Skip tiny elements

      // Perpendicular direction (pointing up/left from element)
      const perpX = -dy / elementLength;
      const perpY = dx / elementLength;

      // Calculate positions along element for w1 and w2
      const x1_pos = load.x2 > 0 ? x1 + (dx * load.x1) / load.x2 : x1;
      const y1_pos = load.x2 > 0 ? y1 + (dy * load.x1) / load.x2 : y1;
      const x2_pos = load.x2 > 0 ? x1 + dx : x1;
      const y2_pos = load.x2 > 0 ? y1 + dy : y1;

      // Determine load direction (which way the arrows point)
      const isFx = load.direction === 'Fx';

      // Offset perpendicular to load direction (arrows point away from element)
      const offsetDir = load.w1 > 0 ? 1 : -1;
      const offsetMult = isFx ? perpY : -perpX;

      const w1Scale = Math.abs(load.w1) * loadScale;
      const w2Scale = Math.abs(load.w2) * loadScale;

      // Arrow start points (offset from element)
      const w1_offset_x = x1_pos + offsetMult * offsetDir * w1Scale;
      const w1_offset_y = y1_pos + (isFx ? perpX : -perpY) * offsetDir * w1Scale;
      const w2_offset_x = x2_pos + offsetMult * offsetDir * w2Scale;
      const w2_offset_y = y2_pos + (isFx ? perpX : -perpY) * offsetDir * w2Scale;

      // Draw trapezoid/rectangle fill
      const trapezoidPoints = [
        x1_pos, y1_pos,
        x2_pos, y2_pos,
        w2_offset_x, w2_offset_y,
        w1_offset_x, w1_offset_y,
      ];

      allElements.push(
        <Line
          key={`dist-load-${index}-shape`}
          points={trapezoidPoints}
          fill="rgba(233, 30, 99, 0.15)"
          stroke={arrowColor}
          strokeWidth={1}
          opacity={0.6}
          closed={true}
        />
      );

      // Draw arrow at start (w1)
      if (Math.abs(load.w1) > 0.01) {
        allElements.push(
          <Arrow
            key={`dist-load-${index}-w1-arrow`}
            points={[x1_pos, y1_pos, w1_offset_x, w1_offset_y]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Label for w1
        const labelX = (x1_pos + w1_offset_x) / 2;
        const labelY = (y1_pos + w1_offset_y) / 2 - 8;
        allElements.push(
          <Text
            key={`dist-load-${index}-w1-label`}
            x={labelX}
            y={labelY}
            text={Math.abs(load.w1).toFixed(1)}
            fontSize={9}
            fill={arrowColor}
            align="center"
            offsetX={Math.abs(load.w1).toFixed(1).length * 2.5}
          />
        );
      }

      // Draw arrow at end (w2)
      if (Math.abs(load.w2) > 0.01) {
        allElements.push(
          <Arrow
            key={`dist-load-${index}-w2-arrow`}
            points={[x2_pos, y2_pos, w2_offset_x, w2_offset_y]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Label for w2
        const labelX = (x2_pos + w2_offset_x) / 2;
        const labelY = (y2_pos + w2_offset_y) / 2 - 8;
        allElements.push(
          <Text
            key={`dist-load-${index}-w2-label`}
            x={labelX}
            y={labelY}
            text={Math.abs(load.w2).toFixed(1)}
            fontSize={9}
            fill={arrowColor}
            align="center"
            offsetX={Math.abs(load.w2).toFixed(1).length * 2.5}
          />
        );
      }
    });

    return allElements;
  };

  // Render drawing preview (rubber-band line when drawing element)
  const renderDrawingPreview = () => {
    if (!drawingElement || !mouseWorldPos) return null;

    // Get start node position
    const startNode = nodes.find((n) => n.name === drawingElement.startNode);
    if (!startNode) return null;

    const [sx, sy] = toScreen(startNode.x, startNode.y);
    const [ex, ey] = toScreen(mouseWorldPos.x, mouseWorldPos.y);

    return (
      <Line
        key="drawing-preview"
        points={[sx, sy, ex, ey]}
        stroke="#FFA500"
        strokeWidth={2}
        dash={[10, 5]}
        lineCap="round"
      />
    );
  };

  // Render selection rectangle
  const renderSelectionRect = () => {
    if (!selectionRect) return null;

    const [x1, y1] = toScreen(selectionRect.x1, selectionRect.y1);
    const [x2, y2] = toScreen(selectionRect.x2, selectionRect.y2);

    // Determine color based on selection mode
    const mode = selectionRect.x2 > selectionRect.x1 ? 'window' : 'crossing';
    const strokeColor = mode === 'window' ? '#0066CC' : '#00AA00';

    return (
      <Line
        key="selection-rect"
        points={[x1, y1, x2, y1, x2, y2, x1, y2, x1, y1]}
        stroke={strokeColor}
        strokeWidth={1}
        dash={[5, 5]}
        opacity={0.8}
      />
    );
  };

  // Render selection highlighting (for selected nodes/elements)
  const renderSelectionHighlights = () => {
    const highlights: JSX.Element[] = [];

    // Highlight selected nodes with bold circle and glow
    selectedNodes.forEach((nodeName) => {
      const node = nodes.find((n) => n.name === nodeName);
      if (!node) return;

      const [sx, sy] = toScreen(node.x, node.y);

      // Outer glow
      highlights.push(
        <Circle
          key={`select-node-glow-${nodeName}`}
          x={sx}
          y={sy}
          radius={12}
          fill="rgba(0, 102, 204, 0.2)"
          stroke="none"
        />
      );

      // Main selection ring
      highlights.push(
        <Circle
          key={`select-node-${nodeName}`}
          x={sx}
          y={sy}
          radius={10}
          stroke="#0066CC"
          strokeWidth={3}
          fill="rgba(0, 102, 204, 0.3)"
        />
      );
    });

    // Highlight selected elements with thick bright line overlay
    selectedElements.forEach((elementName: string) => {
      const element = elements.find((e) => e.name === elementName);
      if (!element) return;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return;

      const [x1, y1] = toScreen(nodeI.x, nodeI.y);
      const [x2, y2] = toScreen(nodeJ.x, nodeJ.y);

      // Outer glow effect
      highlights.push(
        <Line
          key={`select-element-glow-${elementName}`}
          points={[x1, y1, x2, y2]}
          stroke="#0066CC"
          strokeWidth={12}
          opacity={0.2}
          lineCap="round"
        />
      );

      // Main selection highlight
      highlights.push(
        <Line
          key={`select-element-${elementName}`}
          points={[x1, y1, x2, y2]}
          stroke="#0088FF"
          strokeWidth={8}
          opacity={0.7}
          lineCap="round"
        />
      );
    });

    return highlights;
  };

  // Render move command visualization
  const renderMoveCommandViz = () => {
    if (!moveCommand || !moveCommand.basePoint) return null;

    const [bx, by] = toScreen(moveCommand.basePoint.x, moveCommand.basePoint.y);

    const viz: JSX.Element[] = [];

    // Base point marker
    viz.push(
      <Circle
        key="move-basepoint"
        x={bx}
        y={by}
        radius={8}
        fill="#FF9800"
        stroke="#F57C00"
        strokeWidth={2}
      />
    );

    // Preview lines from base point to mouse (if awaiting endpoint)
    if (moveCommand.stage === 'awaiting-endpoint-click' && mouseWorldPos) {
      const [mx, my] = toScreen(mouseWorldPos.x, mouseWorldPos.y);

      // Line from base to mouse
      viz.push(
        <Line
          key="move-preview-line"
          points={[bx, by, mx, my]}
          stroke="#FF9800"
          strokeWidth={2}
          dash={[5, 5]}
        />
      );

      // Preview of moved nodes
      const dx = mouseWorldPos.x - moveCommand.basePoint.x;
      const dy = mouseWorldPos.y - moveCommand.basePoint.y;

      selectedNodes.forEach((nodeName) => {
        const node = nodes.find((n) => n.name === nodeName);
        if (!node) return;

        const [newX, newY] = toScreen(node.x + dx, node.y + dy);
        viz.push(
          <Circle
            key={`move-preview-${nodeName}`}
            x={newX}
            y={newY}
            radius={6}
            fill="rgba(255, 152, 0, 0.5)"
            stroke="#FF9800"
            strokeWidth={1}
          />
        );
      });
    }

    return viz;
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
        style={{
          cursor: isPanning
            ? 'grabbing'
            : activeTool === 'draw-node'
            ? 'crosshair'
            : activeTool === 'draw-element'
            ? 'crosshair'
            : activeTool === 'delete' && (hoveredNode || hoveredElement)
            ? 'pointer'
            : activeTool === 'delete'
            ? 'not-allowed'
            : 'default'
        }}
      >
        <Layer>
          {renderGrid()}
          {renderMomentDiagrams()}
          {renderShearDiagrams()}
          {renderAxialDiagrams()}
          {renderElements()}
          {renderDisplacedShape()}
          {renderSelectionHighlights()}
          {renderSupports()}
          {renderNodes()}
          {renderLoads()}
          {renderDrawingPreview()}
          {renderSelectionRect()}
          {renderMoveCommandViz()}
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

      {/* Move command status message */}
      {moveCommand && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 152, 0, 0.95)',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 4,
            fontSize: 14,
            fontWeight: 'bold',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 100,
          }}
        >
          {moveCommand.stage === 'awaiting-basepoint-click' && 'Click base point or press Space to type coordinates'}
          {moveCommand.stage === 'awaiting-basepoint-input' && 'Type base point coordinates...'}
          {moveCommand.stage === 'awaiting-endpoint-click' && 'Click end point or press Space to type coordinates'}
          {moveCommand.stage === 'awaiting-endpoint-input' && 'Type end point coordinates...'}
        </div>
      )}
    </div>
  );
}
