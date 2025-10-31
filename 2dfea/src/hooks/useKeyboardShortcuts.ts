/**
 * Keyboard Shortcuts Hook
 *
 * Handles keyboard shortcuts for the application.
 * Escape hierarchy:
 * 1. Command input (if visible)
 * 2. Move command (if active)
 * 3. Draw element (if in progress)
 * 4. Clear selection (if any selected)
 * 5. Reset to select tool
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
  const drawingElement = useUIStore((state) => state.drawingElement);
  const clearDrawingElement = useUIStore((state) => state.clearDrawingElement);

  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const selectedElements = useModelStore((state) => state.selectedElements);
  const clearSelection = useModelStore((state) => state.clearSelection);

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

      // Delete key - delete selected entities
      if (e.key === 'Delete' && !commandInput?.visible) {
        e.preventDefault();
        if (activeTool !== 'delete') {
          setTool('delete');
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
    setTool,
    setCommandInput,
    clearMoveCommand,
    setMoveStage,
    clearDrawingElement,
    clearSelection,
  ]);
}
