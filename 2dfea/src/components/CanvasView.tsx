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
import { isLocalDirection } from '../utils/coordinateUtils';
import {
  findExtremeIndices,
  findDisplacementExtremes,
  getLocalPositionFromIndex,
} from '../utils/diagramLabelUtils';
import {
  getElementAngle,
  getPointAlongElement,
  calculateLabelWorldPos,
  shouldLabelBeAbove,
} from '../utils/labelPositioning';
import { calculateLoadArrowScale } from '../utils/scalingUtils';

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
  const getResultsForCase = useModelStore((state) => state.getResultsForCase);
  const getResultsForCombination = useModelStore((state) => state.getResultsForCombination);
  const analysisResults = useModelStore((state) => state.analysisResults);  // Keep for backward compat
  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectedElements = useModelStore((state) => state.selectedElements);
  const nextNodeNumber = useModelStore((state) => state.nextNodeNumber);
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
  const selectedLoads = useModelStore((state) => state.selectedLoads);
  const moveNodes = useModelStore((state) => state.moveNodes);
  const addNodalLoad = useModelStore((state) => state.addNodalLoad);
  const addElementPointLoad = useModelStore((state) => state.addElementPointLoad);
  const addDistributedLoad = useModelStore((state) => state.addDistributedLoad);
  const pasteLoadProperties = useModelStore((state) => state.pasteLoadProperties);

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
  const displacementScaleManual = useUIStore((state) => state.displacementScaleManual);
  const useManualDisplacementScale = useUIStore((state) => state.useManualDisplacementScale);
  const momentDiagramScale = useUIStore((state) => state.momentDiagramScale);
  const momentDiagramScaleManual = useUIStore((state) => state.momentDiagramScaleManual);
  const useManualMomentDiagramScale = useUIStore((state) => state.useManualMomentDiagramScale);
  const shearDiagramScale = useUIStore((state) => state.shearDiagramScale);
  const shearDiagramScaleManual = useUIStore((state) => state.shearDiagramScaleManual);
  const useManualShearDiagramScale = useUIStore((state) => state.useManualShearDiagramScale);
  const axialDiagramScale = useUIStore((state) => state.axialDiagramScale);
  const axialDiagramScaleManual = useUIStore((state) => state.axialDiagramScaleManual);
  const useManualAxialDiagramScale = useUIStore((state) => state.useManualAxialDiagramScale);
  const loadArrowScaleManual = useUIStore((state) => state.loadArrowScaleManual);
  const useManualLoadArrowScale = useUIStore((state) => state.useManualLoadArrowScale);
  const setLoadArrowScale = useUIStore((state) => state.setLoadArrowScale);

  // Results query state
  const selectedResultType = useUIStore((state) => state.selectedResultType);
  const selectedResultName = useUIStore((state) => state.selectedResultName);

  // Label visibility states
  const showDisplacementLabels = useUIStore((state) => state.showDisplacementLabels);
  const showMomentLabels = useUIStore((state) => state.showMomentLabels);
  const showShearLabels = useUIStore((state) => state.showShearLabels);
  const showAxialLabels = useUIStore((state) => state.showAxialLabels);

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
  const copiedData = useUIStore((state) => state.copiedData);
  const pasteMode = useUIStore((state) => state.pasteMode);
  const clearPasteData = useUIStore((state) => state.clearPasteData);

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

  // Helper: Get the currently active analysis results based on user selection
  // Tries to get from cache first, falls back to analysisResults for backward compat
  const getActiveResults = () => {
    // If user has selected a result, try to get it from cache
    if (selectedResultName) {
      if (selectedResultType === 'case') {
        const caseResults = getResultsForCase(selectedResultName);
        if (caseResults) return caseResults;
      } else {
        const comboResults = getResultsForCombination(selectedResultName);
        if (comboResults) return comboResults;
      }
      // Selection exists but results don't
      console.warn(
        `[CanvasView] No results available for ${selectedResultType} "${selectedResultName}"`
      );
      return null;
    }
    // Fall back to current analysisResults for backward compatibility
    return analysisResults;
  };

  // Get node screen position
  const getNodePos = (nodeName: string): [number, number] | null => {
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) return null;
    return toScreen(node.x, node.y);
  };

  // === LOAD ARROW SCALE AUTO-UPDATE ===

  // Update automatic load arrow scale in store when model changes
  useEffect(() => {
    const loadArrowScaleAuto = calculateLoadArrowScale(
      nodes,
      elements,
      loads,
      activeLoadCase
    );
    setLoadArrowScale(loadArrowScaleAuto);
  }, [nodes, elements, loads, activeLoadCase, setLoadArrowScale]);

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
        // Exit paste mode if active
        if (pasteMode) {
          clearPasteData();
          return;
        }

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

      // Priority 1.4: Paste mode - left-click to paste properties
      if (pasteMode && copiedData && copiedData.entityType === 'load' && hoveredLoad) {
        const targetLoadType = hoveredLoad.type;
        const sourceLoadType = copiedData.loadType;

        // Only paste if types match
        if (targetLoadType === sourceLoadType) {
          pasteLoadProperties(targetLoadType, hoveredLoad.index, copiedData.properties);
          // Keep paste mode active for multiple pastes
          return;
        }
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
          // Scenario 1 & 2: Get or create start node
          let startNode: string;
          const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);

          if (hoveredNode) {
            // Start node exists - use it
            startNode = hoveredNode;
          } else {
            // Start node doesn't exist - create new node
            // Capture the node name BEFORE calling addNode (which increments nextNodeNumber)
            const newNodeName = `N${nextNodeNumber}`;
            addNode({
              x: snappedPos.x,
              y: snappedPos.y,
              support: 'free',
            });
            startNode = newNodeName;
          }

          setDrawingElement({
            startNode,
            startPos: snappedPos,
          });
        } else {
          // Second click - complete element
          // Scenario: End node may or may not exist
          let endNode: string;
          const snappedPos = getSnappedPosition({ x: worldX, y: worldY }, hoveredNode, nodes);

          // Validation: Check if end node is same as start (prevent self-loops)
          if (hoveredNode && hoveredNode === drawingElement.startNode) {
            console.warn('Cannot create element: start and end nodes are the same');
            clearDrawingElement();
            return;
          }

          if (hoveredNode) {
            // End node exists - use it
            endNode = hoveredNode;
          } else {
            // End node doesn't exist - create new node
            // Capture the node name BEFORE calling addNode (which increments nextNodeNumber)
            const newNodeName = `N${nextNodeNumber}`;
            addNode({
              x: snappedPos.x,
              y: snappedPos.y,
              support: 'free',
            });
            endNode = newNodeName;
          }

          // Additional validation: Check for zero-length element
          const startNodeObj = nodes.find((n) => n.name === drawingElement.startNode);
          const endNodeObj = nodes.find((n) => n.name === endNode);

          if (startNodeObj && endNodeObj) {
            const dx = endNodeObj.x - startNodeObj.x;
            const dy = endNodeObj.y - startNodeObj.y;
            const length = Math.sqrt(dx * dx + dy * dy);

            if (length < 0.01) {
              console.warn('Cannot create element: zero-length element');
              clearDrawingElement();
              return;
            }
          }

          // Create element with default properties
          if (drawingElement.startNode) {
            addElement({
              nodeI: drawingElement.startNode,
              nodeJ: endNode,
              E: 210, // GPa (steel)
              I: 1e-4, // m^4
              A: 1e-3, // m^2
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

  // Helper: Check if a point is inside a trapezoid (for distributed load hover detection)
  const isPointInTrapezoid = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    w1_offset_x: number,
    w1_offset_y: number,
    w2_offset_x: number,
    w2_offset_y: number,
    tolerance: number
  ): boolean => {
    // Create trapezoid points
    const points = [
      [x1, y1],
      [x2, y2],
      [w2_offset_x, w2_offset_y],
      [w1_offset_x, w1_offset_y],
    ];

    // Point-in-polygon using ray casting algorithm
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];

      const intersect = ((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    // Check tolerance distance to edges
    if (!inside) {
      for (let i = 0; i < points.length; i++) {
        const [x_a, y_a] = points[i];
        const [x_b, y_b] = points[(i + 1) % points.length];

        // Distance from point to line segment
        const dx = x_b - x_a;
        const dy = y_b - y_a;
        const t = Math.max(0, Math.min(1, ((px - x_a) * dx + (py - y_a) * dy) / (dx * dx + dy * dy)));
        const closestX = x_a + t * dx;
        const closestY = y_a + t * dy;
        const distance = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

        if (distance <= tolerance) return true;
      }
    }

    return inside;
  };

  // Check for hovered loads in Loads tab
  const checkLoadHover = (worldX: number, worldY: number) => {
    // Calculate load scale dynamically
    const loadArrowScaleAuto = calculateLoadArrowScale(
      nodes,
      elements,
      loads,
      activeLoadCase
    );
    const loadScale = useManualLoadArrowScale
      ? loadArrowScaleManual
      : loadArrowScaleAuto;

    const [screenX, screenY] = toScreen(worldX, worldY);
    const screenTolerance = snapTolerance; // Use same pixel tolerance as nodes

    // Check nodal loads
    const visibleNodalLoads = loads.nodal.filter(
      (load) => !activeLoadCase || load.case === activeLoadCase
    );

    for (let i = 0; i < visibleNodalLoads.length; i++) {
      const load = visibleNodalLoads[i];
      const node = nodes.find((n) => n.name === load.node);
      if (!node) continue;

      const [nodeScreenX, nodeScreenY] = toScreen(node.x, node.y);

      // Check distance to node position
      const dx = screenX - nodeScreenX;
      const dy = screenY - nodeScreenY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= screenTolerance) {
        setHoveredLoad({ type: 'nodal', index: i });
        return;
      }
    }

    // Check element point loads
    const visibleElementPointLoads = loads.elementPoint.filter(
      (load) => !activeLoadCase || load.case === activeLoadCase
    );

    for (let i = 0; i < visibleElementPointLoads.length; i++) {
      const load = visibleElementPointLoads[i];
      const element = elements.find((el) => el.name === load.element);
      if (!element) continue;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) continue;

      // Calculate the impact point position along the element
      const elementWorldLength = Math.sqrt((nodeJ.x - nodeI.x) ** 2 + (nodeJ.y - nodeI.y) ** 2);
      const distanceRatio = Math.min(1, Math.max(0, load.distance / elementWorldLength));

      const impactWorldX = nodeI.x + (nodeJ.x - nodeI.x) * distanceRatio;
      const impactWorldY = nodeI.y + (nodeJ.y - nodeI.y) * distanceRatio;
      const [impactScreenX, impactScreenY] = toScreen(impactWorldX, impactWorldY);

      // Check distance to impact point
      const dx = screenX - impactScreenX;
      const dy = screenY - impactScreenY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= screenTolerance) {
        setHoveredLoad({ type: 'elementPoint', index: i });
        return;
      }
    }

    // Check distributed loads
    const visibleDistributedLoads = loads.distributed.filter(
      (load) => !activeLoadCase || load.case === activeLoadCase
    );

    for (let i = 0; i < visibleDistributedLoads.length; i++) {
      const load = visibleDistributedLoads[i];
      const element = elements.find((el) => el.name === load.element);
      if (!element) continue;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) continue;

      const [x1, y1] = toScreen(nodeI.x, nodeI.y);
      const [x2, y2] = toScreen(nodeJ.x, nodeJ.y);

      // Element vector and perpendicular offset
      const dx = x2 - x1;
      const dy = y2 - y1;
      const elementLength = Math.sqrt(dx * dx + dy * dy);

      if (elementLength < 1) continue;

      // Perpendicular direction
      const perpX = -dy / elementLength;
      const perpY = dx / elementLength;

      // Calculate positions along element for w1 and w2
      const x1_pos = load.x2 > 0 ? x1 + (dx * load.x1) / load.x2 : x1;
      const y1_pos = load.x2 > 0 ? y1 + (dy * load.x1) / load.x2 : y1;
      const x2_pos = load.x2 > 0 ? x1 + dx : x1;
      const y2_pos = load.x2 > 0 ? y1 + dy : y1;

      // Determine load direction
      const isFx = load.direction === 'Fx';

      // Offset perpendicular to load direction
      const offsetDir = load.w1 > 0 ? 1 : -1;
      const offsetMult = isFx ? perpY : -perpX;

      const w1ScaleWorld = Math.abs(load.w1) * loadScale; // World units
      const w2ScaleWorld = Math.abs(load.w2) * loadScale; // World units
      const w1Scale = w1ScaleWorld * view.scale; // Convert to screen pixels
      const w2Scale = w2ScaleWorld * view.scale; // Convert to screen pixels

      // Arrow start points
      const w1_offset_x = x1_pos + offsetMult * offsetDir * w1Scale;
      const w1_offset_y = y1_pos + (isFx ? perpX : -perpY) * offsetDir * w1Scale;
      const w2_offset_x = x2_pos + offsetMult * offsetDir * w2Scale;
      const w2_offset_y = y2_pos + (isFx ? perpX : -perpY) * offsetDir * w2Scale;

      // Check if point is in trapezoid
      if (
        isPointInTrapezoid(
          screenX,
          screenY,
          x1_pos,
          y1_pos,
          x2_pos,
          y2_pos,
          w1_offset_x,
          w1_offset_y,
          w2_offset_x,
          w2_offset_y,
          screenTolerance
        )
      ) {
        setHoveredLoad({ type: 'distributed', index: i });
        return;
      }
    }

    // No load hovered
    setHoveredLoad(null);
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

      // Determine what to hover based on active tab
      if (activeTab === 'loads') {
        // In Loads tab: normally only hover loads, but when creating loads, allow element/node snapping
        if (loadCreationMode) {
          // During load creation: allow node/element snapping for interactive selection
          setHoveredLoad(null);

          // Enable snapping for element point selection
          if (snapEnabled) {
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

            setHoveredNode(nearestNode);
            setHoveredElement(nearestElement);
          } else {
            setHoveredNode(null);
            setHoveredElement(null);
          }
        } else {
          // Not in load creation mode: only hover over loads, not nodes/elements
          setHoveredNode(null);
          setHoveredElement(null);

          // Check for hovered loads
          checkLoadHover(worldX, worldY);
        }
      } else if (activeTab === 'structure') {
        // In Structure tab: hover over nodes/elements as normal
        setHoveredLoad(null);

        // Snapping detection for nodes and elements
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
      } else {
        // Analysis tab: no hovering
        setHoveredNode(null);
        setHoveredElement(null);
        setHoveredLoad(null);
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

    // Right-click context menu for loads
    if (activeTab === 'loads') {
      const stage = e.target.getStage();
      if (!stage) return;

      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;

      // Get native browser coordinates for menu positioning
      const clientX = (e.evt as PointerEvent).clientX;
      const clientY = (e.evt as PointerEvent).clientY;

      // Check for loads at this position (same logic as hover detection)
      // Calculate load scale dynamically
      const loadArrowScaleAuto = calculateLoadArrowScale(
        nodes,
        elements,
        loads,
        activeLoadCase
      );
      const loadScale = useManualLoadArrowScale
        ? loadArrowScaleManual
        : loadArrowScaleAuto;
      const screenTolerance = snapTolerance;

      // Check nodal loads
      const visibleNodalLoads = loads.nodal.filter(
        (load) => !activeLoadCase || load.case === activeLoadCase
      );

      for (let i = 0; i < visibleNodalLoads.length; i++) {
        const load = visibleNodalLoads[i];
        const node = nodes.find((n) => n.name === load.node);
        if (!node) continue;

        const [nodeScreenX, nodeScreenY] = toScreen(node.x, node.y);
        const dx = pointerPos.x - nodeScreenX;
        const dy = pointerPos.y - nodeScreenY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= screenTolerance) {
          showLoadContextMenu('nodal', i, clientX, clientY);
          return;
        }
      }

      // Check element point loads
      const visibleElementPointLoads = loads.elementPoint.filter(
        (load) => !activeLoadCase || load.case === activeLoadCase
      );

      for (let i = 0; i < visibleElementPointLoads.length; i++) {
        const load = visibleElementPointLoads[i];
        const element = elements.find((el) => el.name === load.element);
        if (!element) continue;

        const nodeI = nodes.find((n) => n.name === element.nodeI);
        const nodeJ = nodes.find((n) => n.name === element.nodeJ);
        if (!nodeI || !nodeJ) continue;

        const elementWorldLength = Math.sqrt((nodeJ.x - nodeI.x) ** 2 + (nodeJ.y - nodeI.y) ** 2);
        const distanceRatio = Math.min(1, Math.max(0, load.distance / elementWorldLength));

        const impactWorldX = nodeI.x + (nodeJ.x - nodeI.x) * distanceRatio;
        const impactWorldY = nodeI.y + (nodeJ.y - nodeI.y) * distanceRatio;
        const [impactScreenX, impactScreenY] = toScreen(impactWorldX, impactWorldY);

        const dx = pointerPos.x - impactScreenX;
        const dy = pointerPos.y - impactScreenY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= screenTolerance) {
          showLoadContextMenu('elementPoint', i, clientX, clientY);
          return;
        }
      }

      // Check distributed loads
      const visibleDistributedLoads = loads.distributed.filter(
        (load) => !activeLoadCase || load.case === activeLoadCase
      );

      for (let i = 0; i < visibleDistributedLoads.length; i++) {
        const load = visibleDistributedLoads[i];
        const element = elements.find((el) => el.name === load.element);
        if (!element) continue;

        const nodeI = nodes.find((n) => n.name === element.nodeI);
        const nodeJ = nodes.find((n) => n.name === element.nodeJ);
        if (!nodeI || !nodeJ) continue;

        const [x1, y1] = toScreen(nodeI.x, nodeI.y);
        const [x2, y2] = toScreen(nodeJ.x, nodeJ.y);

        const dx = x2 - x1;
        const dy = y2 - y1;
        const elementLength = Math.sqrt(dx * dx + dy * dy);

        if (elementLength < 1) continue;

        const perpX = -dy / elementLength;
        const perpY = dx / elementLength;

        const x1_pos = load.x2 > 0 ? x1 + (dx * load.x1) / load.x2 : x1;
        const y1_pos = load.x2 > 0 ? y1 + (dy * load.x1) / load.x2 : y1;
        const x2_pos = load.x2 > 0 ? x1 + dx : x1;
        const y2_pos = load.x2 > 0 ? y1 + dy : y1;

        const isFx = load.direction === 'Fx';
        const offsetDir = load.w1 > 0 ? 1 : -1;
        const offsetMult = isFx ? perpY : -perpX;

        const w1ScaleWorld = Math.abs(load.w1) * loadScale; // World units
        const w2ScaleWorld = Math.abs(load.w2) * loadScale; // World units
        const w1Scale = w1ScaleWorld * view.scale; // Convert to screen pixels
        const w2Scale = w2ScaleWorld * view.scale; // Convert to screen pixels

        const w1_offset_x = x1_pos + offsetMult * offsetDir * w1Scale;
        const w1_offset_y = y1_pos + (isFx ? perpX : -perpY) * offsetDir * w1Scale;
        const w2_offset_x = x2_pos + offsetMult * offsetDir * w2Scale;
        const w2_offset_y = y2_pos + (isFx ? perpX : -perpY) * offsetDir * w2Scale;

        if (
          isPointInTrapezoid(
            pointerPos.x,
            pointerPos.y,
            x1_pos,
            y1_pos,
            x2_pos,
            y2_pos,
            w1_offset_x,
            w1_offset_y,
            w2_offset_x,
            w2_offset_y,
            screenTolerance
          )
        ) {
          showLoadContextMenu('distributed', i, clientX, clientY);
          return;
        }
      }
    }
    // Right-click no longer centers the model (double middle-click does that instead)
  };

  // Helper function to dispatch load context menu event
  const showLoadContextMenu = (
    loadType: 'nodal' | 'distributed' | 'elementPoint',
    loadIndex: number,
    clientX: number,
    clientY: number
  ) => {
    window.dispatchEvent(
      new CustomEvent('showLoadContextMenu', {
        detail: {
          position: { x: clientX, y: clientY },
          loadType,
          loadIndex,
        },
      })
    );
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
    const results = getActiveResults();
    if (!results || !results.diagrams || !showDisplacedShape) return null;

    // Use manual displacement scale if set, otherwise use automatic
    const effectiveDisplacementScale = useManualDisplacementScale ? displacementScaleManual : displacementScale;

    return elements.map((element) => {
      const diagram = results.diagrams[element.name];
      if (!diagram || !diagram.deflections_dx || !diagram.deflections_dy) return null;

      // Get node objects
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      // Calculate deformed shape using utility function with both deflection components
      const deformedPoints = calculateDeformedElementShape(
        nodeI,
        nodeJ,
        results,
        diagram.deflections_dx,  // Local axial deflections
        diagram.deflections_dy,  // Local perpendicular deflections
        effectiveDisplacementScale
      );

      if (deformedPoints.length === 0) return null;

      // Convert world coordinates to screen coordinates
      const screenPoints: number[] = [];
      for (const point of deformedPoints) {
        const [sx, sy] = toScreen(point.x, point.y);
        screenPoints.push(sx, sy);
      }

      // Find max/min displacement magnitudes
      const extremes = findDisplacementExtremes(diagram.deflections_dx, diagram.deflections_dy);
      const labelElements: React.ReactNode[] = [];

      // Render max/min labels if enabled
      if (showDisplacementLabels && (extremes.maxMagnitude > 0 || extremes.minMagnitude > 0)) {
        const angle = getElementAngle([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y]);

        // Max displacement label
        const maxLocalPos = getLocalPositionFromIndex(extremes.maxIndex, diagram.deflections_dx.length);
        const maxWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], maxLocalPos);
        const maxLabelWorldPos = calculateLabelWorldPos(maxWorldPos, angle, 0.15, true);
        const [maxScreenX, maxScreenY] = toScreen(maxLabelWorldPos[0], maxLabelWorldPos[1]);

        labelElements.push(
          <Text
            key={`disp-max-label-${element.name}`}
            x={maxScreenX}
            y={maxScreenY}
            text={`max: ${extremes.maxMagnitude.toFixed(2)} mm`}
            fontSize={12}
            fontFamily="Arial"
            fill="#FF6B6B"
            align="center"
            verticalAlign="middle"
            offsetX={45}
          />
        );

        // Min displacement label (if significantly different from zero)
        if (Math.abs(extremes.minMagnitude) > 0.01) {
          const minLocalPos = getLocalPositionFromIndex(extremes.minIndex, diagram.deflections_dx.length);
          const minWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], minLocalPos);
          const minLabelWorldPos = calculateLabelWorldPos(minWorldPos, angle, 0.15, false);
          const [minScreenX, minScreenY] = toScreen(minLabelWorldPos[0], minLabelWorldPos[1]);

          labelElements.push(
            <Text
              key={`disp-min-label-${element.name}`}
              x={minScreenX}
              y={minScreenY}
              text={`min: ${extremes.minMagnitude.toFixed(2)} mm`}
              fontSize={12}
              fontFamily="Arial"
              fill="#FF6B6B"
              align="center"
              verticalAlign="middle"
              offsetX={45}
            />
          );
        }
      }

      return [
        <Line
          key={`displaced-${element.name}`}
          points={screenPoints}
          stroke="#FF6B6B"
          strokeWidth={2}
          lineCap="round"
          lineJoin="round"
          dash={[5, 5]}
        />,
        ...labelElements,
      ];
    });
  };

  // Helper: Apply angle-based sign correction to diagram values
  // Elements pointing "backwards" (towards negative X) need sign flipping
  // > 90° (upward-left) or < -90° (downward-left)
  const applyAngleCorrection = (values: number[], element: any): number[] => {
    const nodeI = nodes.find((n) => n.name === element.nodeI);
    const nodeJ = nodes.find((n) => n.name === element.nodeJ);
    if (!nodeI || !nodeJ) return values;

    const dx = nodeJ.x - nodeI.x;
    const dy = nodeJ.y - nodeI.y;
    const angleRad = Math.atan2(dy, dx);
    const angleDeg = angleRad * (180 / Math.PI);

    // Strictly greater/less than to exclude vertical elements (exactly 90° or -90°)
    const shouldFlipSigns = angleDeg > 90 || angleDeg < -90;
    if (!shouldFlipSigns) return values;

    return values.map(v => -v);
  };

  // Render moment diagrams
  const renderMomentDiagrams = () => {
    const results = getActiveResults();
    if (!results || !results.diagrams || !showMomentDiagram) return null;

    const maxMoment = getMaxDiagramValue(results.diagrams, 'moment');
    const effectiveScale = useManualMomentDiagramScale ? momentDiagramScaleManual : momentDiagramScale;
    const scale = calculateDiagramScale(maxMoment, view.scale / 50, 30) * effectiveScale;

    return elements.map((element) => {
      const diagram = results.diagrams[element.name];
      if (!diagram) return null;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      // Apply angle-based sign correction
      const correctedMoments = applyAngleCorrection(diagram.moments, element);

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        correctedMoments,
        scale,
        true // Flip moment diagram
      );

      // Find max/min moments
      const extremes = findExtremeIndices(correctedMoments);
      const labelElements: React.ReactNode[] = [];

      // Render max/min labels if enabled
      if (showMomentLabels) {
        const angle = getElementAngle([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y]);

        // Max moment label
        const maxLocalPos = getLocalPositionFromIndex(extremes.maxIndex, correctedMoments.length);
        const maxWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], maxLocalPos);
        const isMaxAbove = shouldLabelBeAbove(angle, true);
        const maxLabelWorldPos = calculateLabelWorldPos(maxWorldPos, angle, 0.2, isMaxAbove);
        const [maxScreenX, maxScreenY] = toScreen(maxLabelWorldPos[0], maxLabelWorldPos[1]);

        labelElements.push(
          <Text
            key={`moment-max-label-${element.name}`}
            x={maxScreenX}
            y={maxScreenY}
            text={`max: ${extremes.maxValue.toFixed(2)} kNm`}
            fontSize={11}
            fontFamily="Arial"
            fill="#9C27B0"
            align="center"
            verticalAlign="middle"
            offsetX={50}
          />
        );

        // Min moment label
        if (extremes.minValue < 0) {
          const minLocalPos = getLocalPositionFromIndex(extremes.minIndex, correctedMoments.length);
          const minWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], minLocalPos);
          const isMinAbove = shouldLabelBeAbove(angle, false);
          const minLabelWorldPos = calculateLabelWorldPos(minWorldPos, angle, 0.2, isMinAbove);
          const [minScreenX, minScreenY] = toScreen(minLabelWorldPos[0], minLabelWorldPos[1]);

          labelElements.push(
            <Text
              key={`moment-min-label-${element.name}`}
              x={minScreenX}
              y={minScreenY}
              text={`min: ${extremes.minValue.toFixed(2)} kNm`}
              fontSize={11}
              fontFamily="Arial"
              fill="#9C27B0"
              align="center"
              verticalAlign="middle"
              offsetX={50}
            />
          );
        }
      }

      return [
        <Line
          key={`moment-${element.name}`}
          points={path}
          fill="rgba(156, 39, 176, 0.3)"
          stroke="#9C27B0"
          strokeWidth={1.5}
          closed
        />,
        ...labelElements,
      ];
    });
  };

  // Render shear diagrams
  const renderShearDiagrams = () => {
    const results = getActiveResults();
    if (!results || !results.diagrams || !showShearDiagram) return null;

    const maxShear = getMaxDiagramValue(results.diagrams, 'shear');
    const effectiveScale = useManualShearDiagramScale ? shearDiagramScaleManual : shearDiagramScale;
    const scale = calculateDiagramScale(maxShear, view.scale / 50, 25) * effectiveScale;

    return elements.map((element) => {
      const diagram = results.diagrams[element.name];
      if (!diagram) return null;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      // Apply angle-based sign correction
      const correctedShears = applyAngleCorrection(diagram.shears, element);

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        correctedShears,
        scale,
        false
      );

      // Find max/min shears
      const extremes = findExtremeIndices(correctedShears);
      const labelElements: React.ReactNode[] = [];

      // Render max/min labels if enabled
      if (showShearLabels) {
        const angle = getElementAngle([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y]);

        // Max shear label
        const maxLocalPos = getLocalPositionFromIndex(extremes.maxIndex, correctedShears.length);
        const maxWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], maxLocalPos);
        const isMaxAbove = shouldLabelBeAbove(angle, true);
        const maxLabelWorldPos = calculateLabelWorldPos(maxWorldPos, angle, 0.18, isMaxAbove);
        const [maxScreenX, maxScreenY] = toScreen(maxLabelWorldPos[0], maxLabelWorldPos[1]);

        labelElements.push(
          <Text
            key={`shear-max-label-${element.name}`}
            x={maxScreenX}
            y={maxScreenY}
            text={`max: ${extremes.maxValue.toFixed(2)} kN`}
            fontSize={11}
            fontFamily="Arial"
            fill="#FF9800"
            align="center"
            verticalAlign="middle"
            offsetX={45}
          />
        );

        // Min shear label
        if (extremes.minValue < 0) {
          const minLocalPos = getLocalPositionFromIndex(extremes.minIndex, correctedShears.length);
          const minWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], minLocalPos);
          const isMinAbove = shouldLabelBeAbove(angle, false);
          const minLabelWorldPos = calculateLabelWorldPos(minWorldPos, angle, 0.18, isMinAbove);
          const [minScreenX, minScreenY] = toScreen(minLabelWorldPos[0], minLabelWorldPos[1]);

          labelElements.push(
            <Text
              key={`shear-min-label-${element.name}`}
              x={minScreenX}
              y={minScreenY}
              text={`min: ${extremes.minValue.toFixed(2)} kN`}
              fontSize={11}
              fontFamily="Arial"
              fill="#FF9800"
              align="center"
              verticalAlign="middle"
              offsetX={45}
            />
          );
        }
      }

      return [
        <Line
          key={`shear-${element.name}`}
          points={path}
          fill="rgba(255, 152, 0, 0.3)"
          stroke="#FF9800"
          strokeWidth={1.5}
          closed
        />,
        ...labelElements,
      ];
    });
  };

  // Render axial diagrams
  const renderAxialDiagrams = () => {
    const results = getActiveResults();
    if (!results || !results.diagrams || !showAxialDiagram) return null;

    const maxAxial = getMaxDiagramValue(results.diagrams, 'axial');
    const effectiveScale = useManualAxialDiagramScale ? axialDiagramScaleManual : axialDiagramScale;
    const scale = calculateDiagramScale(maxAxial, view.scale / 50, 20) * effectiveScale;

    return elements.map((element) => {
      const diagram = results.diagrams[element.name];
      if (!diagram) return null;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return null;

      const posI = getNodePos(element.nodeI);
      const posJ = getNodePos(element.nodeJ);
      if (!posI || !posJ) return null;

      // Apply angle-based sign correction
      const correctedAxials = applyAngleCorrection(diagram.axials, element);

      const path = diagramToFilledPath(
        posI[0], posI[1],
        posJ[0], posJ[1],
        correctedAxials,
        scale,
        false
      );

      // Find max/min axials
      const extremes = findExtremeIndices(correctedAxials);
      const labelElements: React.ReactNode[] = [];

      // Render max/min labels if enabled
      if (showAxialLabels) {
        const angle = getElementAngle([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y]);

        // Max axial label
        const maxLocalPos = getLocalPositionFromIndex(extremes.maxIndex, correctedAxials.length);
        const maxWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], maxLocalPos);
        const isMaxAbove = shouldLabelBeAbove(angle, true);
        const maxLabelWorldPos = calculateLabelWorldPos(maxWorldPos, angle, 0.15, isMaxAbove);
        const [maxScreenX, maxScreenY] = toScreen(maxLabelWorldPos[0], maxLabelWorldPos[1]);

        labelElements.push(
          <Text
            key={`axial-max-label-${element.name}`}
            x={maxScreenX}
            y={maxScreenY}
            text={`max: ${extremes.maxValue.toFixed(2)} kN`}
            fontSize={11}
            fontFamily="Arial"
            fill="#4CAF50"
            align="center"
            verticalAlign="middle"
            offsetX={45}
          />
        );

        // Min axial label
        if (extremes.minValue < 0) {
          const minLocalPos = getLocalPositionFromIndex(extremes.minIndex, correctedAxials.length);
          const minWorldPos = getPointAlongElement([nodeI.x, nodeI.y], [nodeJ.x, nodeJ.y], minLocalPos);
          const isMinAbove = shouldLabelBeAbove(angle, false);
          const minLabelWorldPos = calculateLabelWorldPos(minWorldPos, angle, 0.15, isMinAbove);
          const [minScreenX, minScreenY] = toScreen(minLabelWorldPos[0], minLabelWorldPos[1]);

          labelElements.push(
            <Text
              key={`axial-min-label-${element.name}`}
              x={minScreenX}
              y={minScreenY}
              text={`min: ${extremes.minValue.toFixed(2)} kN`}
              fontSize={11}
              fontFamily="Arial"
              fill="#4CAF50"
              align="center"
              verticalAlign="middle"
              offsetX={45}
            />
          );
        }
      }

      return [
        <Line
          key={`axial-${element.name}`}
          points={path}
          fill="rgba(76, 175, 80, 0.3)"
          stroke="#4CAF50"
          strokeWidth={1.5}
          closed
        />,
        ...labelElements,
      ];
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

  // Helper: Get load color based on selection/hover state
  const getLoadColor = (type: 'nodal' | 'distributed' | 'elementPoint', index: number): string => {
    const isSelected = selectedLoads[type].includes(index);
    const isHovered = hoveredLoad?.type === type && hoveredLoad?.index === index;

    if (isSelected && isHovered) return '#00D4FF'; // Light blue - selected + hovered
    if (isSelected) return '#00A8FF'; // Medium blue - selected
    if (isHovered) return '#FF69B4'; // Hot pink - hovered
    return '#E91E63'; // Default pink
  };

  // Render element local coordinate system axes at element midpoints
  const renderElementAxes = () => {
    const allElements: JSX.Element[] = [];
    const axisLength = 20

    ; // Screen pixels for axis length

    elements.forEach((element) => {
      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return;

      // Get element midpoint in world coordinates
      const midWorldX = (nodeI.x + nodeJ.x) / 2;
      const midWorldY = (nodeI.y + nodeJ.y) / 2;
      const [midScreenX, midScreenY] = toScreen(midWorldX, midWorldY);

      // Get element direction in world coordinates
      const dx = nodeJ.x - nodeI.x;
      const dy = nodeJ.y - nodeI.y;
      const elementLength = Math.sqrt(dx * dx + dy * dy);

      if (elementLength < 0.01) return; // Skip zero-length elements

      // Calculate element angle: theta = atan2(dy, dx)
      // Note: This is in world coordinates where Y increases upward
      const theta = Math.atan2(dy, dx);
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // Local X axis direction: along element from nodeI to nodeJ (world coordinates)
      // Using theta: [cos(theta), sin(theta)]
      const localXX = cosTheta;
      const localXY = sinTheta;

      // Local Y axis direction: perpendicular to element (90° CCW from local X) (world coordinates)
      // Using theta: [-sin(theta), cos(theta)]
      const localYX = -sinTheta;
      const localYY = cosTheta;

      // Convert to screen space: screen coordinates have Y-axis flipped (down is positive)
      // Axes should be constant screen pixels regardless of zoom level
      // The local X and Y are already unit vectors, so multiply by desired pixel length
      // Negate Y components to account for screen Y-axis flip
      const xAxisScreenOffsetX = localXX * axisLength;
      const xAxisScreenOffsetY = -localXY * axisLength; // Negate for screen Y-flip

      const yAxisScreenOffsetX = localYX * axisLength;
      const yAxisScreenOffsetY = -localYY * axisLength; // Negate for screen Y-flip

      // Local X axis endpoint (red) - in screen coordinates
      const xAxisEndX = midScreenX + xAxisScreenOffsetX;
      const xAxisEndY = midScreenY + xAxisScreenOffsetY;

      // Local Y axis endpoint (green) - in screen coordinates
      const yAxisEndX = midScreenX + yAxisScreenOffsetX;
      const yAxisEndY = midScreenY + yAxisScreenOffsetY;

      // Draw X axis (red)
      allElements.push(
        <Arrow
          key={`element-axis-x-${element.name}`}
          points={[midScreenX, midScreenY, xAxisEndX, xAxisEndY]}
          fill="#FF5252"
          stroke="#FF5252"
          strokeWidth={2}
          pointerLength={6}
          pointerWidth={6}
        />
      );

      // Draw X label
      allElements.push(
        <Text
          key={`element-axis-x-label-${element.name}`}
          x={xAxisEndX + 4}
          y={xAxisEndY - 6}
          text="x"
          fontSize={10}
          fill="#FF5252"
          fontStyle="bold"
        />
      );

      // Draw Y axis (green)
      allElements.push(
        <Arrow
          key={`element-axis-y-${element.name}`}
          points={[midScreenX, midScreenY, yAxisEndX, yAxisEndY]}
          fill="#4CAF50"
          stroke="#4CAF50"
          strokeWidth={2}
          pointerLength={6}
          pointerWidth={6}
        />
      );

      // Draw Y label
      allElements.push(
        <Text
          key={`element-axis-y-label-${element.name}`}
          x={yAxisEndX + 4}
          y={yAxisEndY - 6}
          text="y"
          fontSize={10}
          fill="#4CAF50"
          fontStyle="bold"
        />
      );
    });

    return allElements.length > 0 ? allElements : null;
  };

  // Render nodal loads as arrows (only visible in Loads tab)
  const renderLoads = () => {
    if (!showLoads || activeTab !== 'loads') return null;

    const allElements: JSX.Element[] = [];

    // Calculate automatic load arrow scale (1/20 of longest element)
    const loadArrowScaleAuto = calculateLoadArrowScale(
      nodes,
      elements,
      loads,
      activeLoadCase
    );

    // Use manual scale if enabled, otherwise automatic
    const loadScale = useManualLoadArrowScale
      ? loadArrowScaleManual
      : loadArrowScaleAuto;

    // Render nodal loads
    visibleLoads.forEach((load, index) => {
      const pos = getNodePos(load.node);
      if (!pos) return;

      const [sx, sy] = pos;
      const arrowColor = getLoadColor('nodal', index);

      if (Math.abs(load.fx) > 0.01) {
        const lengthWorld = Math.abs(load.fx) * loadScale; // World units (meters)
        const length = lengthWorld * view.scale; // Convert to screen pixels
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
        const lengthWorld = Math.abs(load.fy) * loadScale; // World units (meters)
        const length = lengthWorld * view.scale; // Convert to screen pixels
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

      // Perpendicular direction (90° CCW rotation from element direction)
      const perpX = -dy / elementLength;
      const perpY = dx / elementLength;

      // Calculate positions along element for w1 and w2
      const x1_pos = load.x2 > 0 ? x1 + (dx * load.x1) / load.x2 : x1;
      const y1_pos = load.x2 > 0 ? y1 + (dy * load.x1) / load.x2 : y1;
      const x2_pos = load.x2 > 0 ? x1 + dx : x1;
      const y2_pos = load.x2 > 0 ? y1 + dy : y1;

      // Determine load direction and coordinate system
      const isLocal = isLocalDirection(load.direction);
      const baseDir = load.direction.toLowerCase();

      // For local directions: Fx = along element, Fy = perpendicular
      // For global directions: FX = horizontal, FY = vertical (need rotation)
      let arrowDirX = 0, arrowDirY = 0;

      if (isLocal) {
        // Local coordinate system: use element-aligned or perpendicular
        if (baseDir === 'fx') {
          // Fx: along element
          arrowDirX = dx / elementLength;
          arrowDirY = dy / elementLength;
        } else {
          // Fy: perpendicular to element (90° CW - pointing away from element)
          // Invert the perpendicular direction to correct the visual orientation
          arrowDirX = -perpX;
          arrowDirY = -perpY;
        }
      } else {
        // Global coordinate system: horizontal or vertical
        if (baseDir === 'fx') {
          // FX: horizontal (pointing right)
          arrowDirX = 1;
          arrowDirY = 0;
        } else {
          // FY: vertical (pointing down, since positive Y in screen space is down)
          arrowDirX = 0;
          arrowDirY = -1;
        }
      }

      // Offset in direction of the load (trapezoid extends in load direction)
      const offsetDir = load.w1 > 0 ? 1 : -1;

      // Trapezoid extends in the same direction as the arrows (both local and global)
      // Offset uses the arrow direction to create a region that follows the load arrows
      const offsetX = arrowDirX;
      const offsetY = arrowDirY;

      const w1ScaleWorld = Math.abs(load.w1) * loadScale; // World units (meters)
      const w2ScaleWorld = Math.abs(load.w2) * loadScale; // World units (meters)
      const w1Scale = w1ScaleWorld * view.scale; // Convert to screen pixels
      const w2Scale = w2ScaleWorld * view.scale; // Convert to screen pixels

      // Arrow start points (offset from element in direction perpendicular to load)
      const w1_offset_x = x1_pos + offsetX * offsetDir * w1Scale;
      const w1_offset_y = y1_pos + offsetY * offsetDir * w1Scale;
      const w2_offset_x = x2_pos + offsetX * offsetDir * w2Scale;
      const w2_offset_y = y2_pos + offsetY * offsetDir * w2Scale;

      // Draw trapezoid/rectangle fill
      const trapezoidPoints = [
        x1_pos, y1_pos,
        x2_pos, y2_pos,
        w2_offset_x, w2_offset_y,
        w1_offset_x, w1_offset_y,
      ];

      const arrowColor = getLoadColor('distributed', index);

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

      // Draw arrow at start (w1) - pointing in load direction
      if (Math.abs(load.w1) > 0.01) {
        // Arrow points in the load direction (arrowDirX/Y), magnitude determines length
        const dir = load.w1 > 0 ? 1 : -1;
        const arrowScaleWorld = Math.abs(load.w1) * loadScale; // World units (meters)
        const arrowScale = arrowScaleWorld * view.scale; // Convert to screen pixels
        const w1_arrow_x = x1_pos + arrowDirX * dir * arrowScale;
        const w1_arrow_y = y1_pos + arrowDirY * dir * arrowScale;

        allElements.push(
          <Arrow
            key={`dist-load-${index}-w1-arrow`}
            points={[x1_pos, y1_pos, w1_arrow_x, w1_arrow_y]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Label for w1
        const labelX = (x1_pos + w1_arrow_x) / 2;
        const labelY = (y1_pos + w1_arrow_y) / 2 - 8;
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

      // Draw arrow at end (w2) - pointing in load direction
      if (Math.abs(load.w2) > 0.01) {
        // Arrow points in the load direction (arrowDirX/Y), magnitude determines length
        const dir = load.w2 > 0 ? 1 : -1;
        const arrowScale = Math.abs(load.w2) * loadScale;
        const w2_arrow_x = x2_pos + arrowDirX * dir * arrowScale;
        const w2_arrow_y = y2_pos + arrowDirY * dir * arrowScale;

        allElements.push(
          <Arrow
            key={`dist-load-${index}-w2-arrow`}
            points={[x2_pos, y2_pos, w2_arrow_x, w2_arrow_y]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );

        // Label for w2
        const labelX = (x2_pos + w2_arrow_x) / 2;
        const labelY = (y2_pos + w2_arrow_y) / 2 - 8;
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

    // Render element point loads (arrows at specific positions on elements)
    const visibleElementPointLoads = loads.elementPoint.filter(
      (load) => !activeLoadCase || load.case === activeLoadCase
    );

    visibleElementPointLoads.forEach((load, index) => {
      const element = elements.find((el) => el.name === load.element);
      if (!element) return;

      const nodeI = nodes.find((n) => n.name === element.nodeI);
      const nodeJ = nodes.find((n) => n.name === element.nodeJ);
      if (!nodeI || !nodeJ) return;

      // Calculate the impact point position along the element
      const elementWorldLength = Math.sqrt((nodeJ.x - nodeI.x) ** 2 + (nodeJ.y - nodeI.y) ** 2);
      const distanceRatio = Math.min(1, Math.max(0, load.distance / elementWorldLength));

      const impactWorldX = nodeI.x + (nodeJ.x - nodeI.x) * distanceRatio;
      const impactWorldY = nodeI.y + (nodeJ.y - nodeI.y) * distanceRatio;
      const [impactScreenX, impactScreenY] = toScreen(impactWorldX, impactWorldY);

      // Element vector for determining perpendicular direction
      const [x1, y1] = toScreen(nodeI.x, nodeI.y);
      const [x2, y2] = toScreen(nodeJ.x, nodeJ.y);
      const dx = x2 - x1;
      const dy = y2 - y1;
      const elementScreenLength = Math.sqrt(dx * dx + dy * dy);

      if (elementScreenLength < 1) return;

      // Perpendicular direction (pointing "up" from element)
      const perpX = -dy / elementScreenLength;
      const perpY = dx / elementScreenLength;

      const arrowColor = getLoadColor('elementPoint', index);
      const lengthWorld = Math.abs(load.magnitude) * loadScale; // World units (meters)
      const length = lengthWorld * view.scale; // Convert to screen pixels
      const dir = load.magnitude > 0 ? 1 : -1;

      // Determine load direction and coordinate system
      const isLocal = isLocalDirection(load.direction);
      const baseDir = load.direction.toLowerCase();

      // Calculate arrow direction
      let arrowDirX = 0, arrowDirY = 0;

      if (baseDir === 'mz') {
        // Moment - handled separately below
      } else if (isLocal) {
        // Local coordinate system: Fx = along element, Fy = perpendicular
        if (baseDir === 'fx') {
          // Fx: along element
          arrowDirX = dx / elementScreenLength;
          arrowDirY = dy / elementScreenLength;
        } else {
          // Fy: perpendicular to element (90° CCW)
          arrowDirX = perpX;
          arrowDirY = perpY;
        }
      } else {
        // Global coordinate system: FX = horizontal, FY = vertical
        if (baseDir === 'fx') {
          // FX: horizontal
          arrowDirX = 1;
          arrowDirY = 0;
        } else {
          // FY: vertical
          arrowDirX = 0;
          arrowDirY = 1;
        }
      }

      // For point loads on elements, we draw in the calculated direction
      let arrowEndX = 0, arrowEndY = 0, labelX = 0, labelY = 0;

      if (baseDir === 'mz') {
        // Moment: draw a small curved arc (simplified as small circle)
        const arcRadius = 8;
        allElements.push(
          <Circle
            key={`point-load-${index}-moment`}
            x={impactScreenX}
            y={impactScreenY}
            radius={arcRadius}
            stroke={arrowColor}
            strokeWidth={2}
            fill="none"
          />
        );

        // Add arrow to show direction of rotation
        const arrowAngle = Math.PI / 4;
        const arrowTipX = impactScreenX + arcRadius * Math.cos(arrowAngle);
        const arrowTipY = impactScreenY + arcRadius * Math.sin(arrowAngle);
        allElements.push(
          <Arrow
            key={`point-load-${index}-moment-arrow`}
            points={[
              impactScreenX + arcRadius * Math.cos(arrowAngle - 0.3),
              impactScreenY + arcRadius * Math.sin(arrowAngle - 0.3),
              arrowTipX,
              arrowTipY,
            ]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={6}
            pointerWidth={6}
          />
        );

        labelX = impactScreenX - 15;
        labelY = impactScreenY - 15;
      } else {
        // Force: draw arrow in calculated direction
        arrowEndX = impactScreenX + arrowDirX * dir * length;
        arrowEndY = impactScreenY + arrowDirY * dir * length;
        labelX = (impactScreenX + arrowEndX) / 2;
        labelY = (impactScreenY + arrowEndY) / 2 - 8;
      }

      if (baseDir !== 'mz') {
        allElements.push(
          <Arrow
            key={`point-load-${index}`}
            points={[impactScreenX, impactScreenY, arrowEndX, arrowEndY]}
            fill={arrowColor}
            stroke={arrowColor}
            strokeWidth={2}
            pointerLength={8}
            pointerWidth={8}
          />
        );
      }

      // Add label showing magnitude
      allElements.push(
        <Text
          key={`point-load-${index}-label`}
          x={labelX}
          y={labelY}
          text={Math.abs(load.magnitude).toFixed(1)}
          fontSize={10}
          fill={arrowColor}
          align="center"
          offsetX={Math.abs(load.magnitude).toFixed(1).length * 3}
        />
      );
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
          {renderElementAxes()}
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
