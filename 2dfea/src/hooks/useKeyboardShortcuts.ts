/**
 * Keyboard Shortcuts Hook
 *
 * Handles keyboard shortcuts for the application.
 *
 * Shortcuts:
 * - Escape: Hierarchical cancellation (command input → move → draw → selection → tool)
 * - M: Activate move tool
 * - Delete: Activate delete tool
 * - Ctrl+Space: Run analysis
 */

import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useModelStore } from '../store/useModelStore';

export function useKeyboardShortcuts() {
  const activeTool = useUIStore((state) => state.activeTool);
  const setTool = useUIStore((state) => state.setTool);
  const commandInput = useUIStore((state) => state.commandInput);
  const setCommandInput = useUIStore((state) => state.setCommandInput);
  const moveCommand = useUIStore((state) => state.moveCommand);
  const clearMoveCommand = useUIStore((state) => state.clearMoveCommand);
  const setMoveStage = useUIStore((state) => state.setMoveStage);
  const startMoveCommand = useUIStore((state) => state.startMoveCommand);
  const drawingElement = useUIStore((state) => state.drawingElement);
  const clearDrawingElement = useUIStore((state) => state.clearDrawingElement);

  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectedElements = useModelStore((state) => state.selectedElements);
  const clearSelection = useModelStore((state) => state.clearSelection);
  const runAnalysis = useModelStore((state) => state.runAnalysis);
  const solver = useModelStore((state) => state.solver);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape key - hierarchical cancellation
      if (e.key === 'Escape') {
        e.preventDefault();

        // Priority 1: Command input
        if (commandInput?.visible) {
          setCommandInput(null);
          // Return to awaiting click stage if in move command
          if (moveCommand?.stage === 'awaiting-basepoint-input') {
            setMoveStage('awaiting-basepoint-click');
          } else if (moveCommand?.stage === 'awaiting-endpoint-input') {
            setMoveStage('awaiting-endpoint-click');
          }
          return;
        }

        // Priority 2: Move command
        if (moveCommand) {
          clearMoveCommand();
          return;
        }

        // Priority 3: Draw element
        if (drawingElement) {
          clearDrawingElement();
          return;
        }

        // Priority 4: Clear selection
        if (selectedNodes.length > 0 || selectedElements.length > 0) {
          clearSelection();
          return;
        }

        // Priority 5: Reset to select tool
        if (activeTool !== 'select') {
          setTool('select');
          return;
        }
      }

      // M key - activate move tool
      if ((e.key === 'm' || e.key === 'M') && !commandInput?.visible) {
        e.preventDefault();
        if (selectedNodes.length > 0) {
          startMoveCommand();
        } else {
          setTool('move');
        }
      }

      // Delete key - delete selected entities
      if (e.key === 'Delete' && !commandInput?.visible) {
        e.preventDefault();
        if (activeTool !== 'delete') {
          setTool('delete');
        }
      }

      // Ctrl+Space - run analysis
      if (e.key === ' ' && e.ctrlKey && !commandInput?.visible) {
        e.preventDefault();
        if (solver) {
          runAnalysis();
        }
      }

      // Ctrl/Cmd detection for multi-select
      // This is handled in the canvas mouse event handlers
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    activeTool,
    commandInput,
    moveCommand,
    drawingElement,
    selectedNodes,
    selectedElements,
    solver,
    setTool,
    setCommandInput,
    clearMoveCommand,
    setMoveStage,
    startMoveCommand,
    clearDrawingElement,
    clearSelection,
    runAnalysis,
  ]);
}
