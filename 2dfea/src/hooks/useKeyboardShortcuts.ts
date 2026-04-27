/**
 * Keyboard Shortcuts Hook
 *
 * Handles keyboard shortcuts for the application.
 *
 * Shortcuts:
 * - Escape: Hierarchical cancellation (command input → move → draw → selection → tool)
 * - M: Activate move tool
 * - Delete: Activate delete tool
 * - Ctrl+Space: Run full analysis (all load cases and combinations)
 * - Ctrl+Z / Cmd+Z: Undo last model mutation (zundo temporal)
 * - Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y / Cmd+Y: Redo
 */

import { useEffect } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useModelStore, useTemporalModelStore } from '../store/useModelStore';
import { INVALIDATE_ANALYSIS_PATCH } from '../store/historyConfig';

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
  const runFullAnalysis = useModelStore((state) => state.runFullAnalysis);
  const solver = useModelStore((state) => state.solver);

  // Temporal (zundo) bindings — see docs/plans/undo-redo.md.
  // We subscribe to lengths so the effect closure has fresh values when the
  // user actually presses Ctrl+Z / Ctrl+Y. Length-only selectors keep this
  // hook's re-render footprint minimal.
  const undo = useTemporalModelStore((t) => t.undo);
  const redo = useTemporalModelStore((t) => t.redo);
  const pastLen = useTemporalModelStore((t) => t.pastStates.length);
  const futureLen = useTemporalModelStore((t) => t.futureStates.length);

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

      // Ctrl+Space - run full analysis (all load cases and combinations)
      if (e.key === ' ' && e.ctrlKey && !commandInput?.visible) {
        e.preventDefault();
        if (solver) {
          runFullAnalysis().catch((error) => {
            console.error('[Keyboard Shortcut] Full analysis failed:', error);
          });
        }
      }

      // ----------------------------------------------------------------
      // Undo / Redo (zundo temporal) — Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
      // and the Cmd-equivalents on macOS. See docs/plans/undo-redo.md.
      //
      // Guards (must short-circuit BEFORE preventDefault):
      //  - commandInput.visible: the CAD command input is open; let it own
      //    the keystroke.
      //  - Active element is <input>/<textarea>/contenteditable: let the
      //    native input's own undo handle it (so cell edits keep their
      //    native undo).
      // ----------------------------------------------------------------
      const isEditingInput = (() => {
        const el = document.activeElement;
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
        if ((el as HTMLElement).isContentEditable) return true;
        return false;
      })();

      // Undo: Ctrl+Z / Cmd+Z (without Shift)
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (commandInput?.visible || isEditingInput) return;
        e.preventDefault();
        if (pastLen > 0) {
          undo();
          useModelStore.setState((s: any) => Object.assign(s, INVALIDATE_ANALYSIS_PATCH));
          console.log('[ModelStore] Undo', { past: pastLen - 1, future: futureLen + 1 });
        }
        return;
      }

      // Redo: Ctrl+Shift+Z / Cmd+Shift+Z / Ctrl+Y / Cmd+Y
      const isRedo =
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'y' || e.key === 'Y'));
      if (isRedo) {
        if (commandInput?.visible || isEditingInput) return;
        e.preventDefault();
        if (futureLen > 0) {
          redo();
          useModelStore.setState((s: any) => Object.assign(s, INVALIDATE_ANALYSIS_PATCH));
          console.log('[ModelStore] Redo', { past: pastLen + 1, future: futureLen - 1 });
        }
        return;
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
    runFullAnalysis,
    undo,
    redo,
    pastLen,
    futureLen,
  ]);
}
