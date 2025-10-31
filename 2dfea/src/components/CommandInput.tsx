/**
 * CommandInput Component
 *
 * Small modal input field for coordinate entry during move operations.
 * Appears at bottom of screen, handles validation and submission.
 */

import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../store/useUIStore';
import { useModelStore } from '../store/useModelStore';
import { parseCoordinateInput, validateCoordinateInput } from '../utils/coordinateParser';

export const CommandInput: React.FC = () => {
  const commandInput = useUIStore((state) => state.commandInput);
  const updateCommandInputValue = useUIStore((state) => state.updateCommandInputValue);
  const setCommandInput = useUIStore((state) => state.setCommandInput);
  const moveCommand = useUIStore((state) => state.moveCommand);
  const setMoveBasePoint = useUIStore((state) => state.setMoveBasePoint);
  const setMoveStage = useUIStore((state) => state.setMoveStage);
  const clearMoveCommand = useUIStore((state) => state.clearMoveCommand);

  const selectedNodes = useModelStore((state) => state.selectedNodes);
  const moveNodes = useModelStore((state) => state.moveNodes);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when it appears
  useEffect(() => {
    if (commandInput?.visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [commandInput?.visible]);

  if (!commandInput || !commandInput.visible) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
    const error = validateCoordinateInput(commandInput.value);
    if (error) {
      setCommandInput({
        ...commandInput,
        error,
      });
      return;
    }

    // Parse input
    const parsed = parseCoordinateInput(commandInput.value);
    if (!parsed) {
      setCommandInput({
        ...commandInput,
        error: 'Invalid coordinate format',
      });
      return;
    }

    // Handle based on move command stage
    if (moveCommand?.stage === 'awaiting-basepoint-input') {
      // Set base point (always absolute)
      setMoveBasePoint(parsed.point);
      setCommandInput(null);
    } else if (moveCommand?.stage === 'awaiting-endpoint-input') {
      // Calculate movement delta
      const basePoint = moveCommand.basePoint;
      if (!basePoint) {
        console.error('No base point set');
        return;
      }

      let dx: number, dy: number;
      if (parsed.isDelta) {
        // Relative movement
        dx = parsed.point.x;
        dy = parsed.point.y;
      } else {
        // Absolute endpoint - calculate delta from base point
        dx = parsed.point.x - basePoint.x;
        dy = parsed.point.y - basePoint.y;
      }

      // Execute move
      moveNodes(selectedNodes, dx, dy);

      // Clean up
      setCommandInput(null);
      clearMoveCommand();
    }
  };

  const handleCancel = () => {
    setCommandInput(null);
    if (moveCommand?.stage === 'awaiting-basepoint-input') {
      // Cancel to awaiting click
      setMoveStage('awaiting-basepoint-click');
    } else if (moveCommand?.stage === 'awaiting-endpoint-input') {
      // Cancel to awaiting click
      setMoveStage('awaiting-endpoint-click');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'white',
        border: '2px solid #333',
        borderRadius: 4,
        padding: 10,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 1000,
        minWidth: 300,
      }}
    >
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 'bold' }}>
          {commandInput.prompt}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={commandInput.value}
          onChange={(e) => updateCommandInputValue(e.target.value)}
          placeholder="X,Y or X Y (absolute) or dX,Y or dX Y (relative)"
          style={{
            width: '100%',
            padding: 6,
            fontSize: 14,
            border: commandInput.error ? '1px solid red' : '1px solid #ccc',
            borderRadius: 4,
          }}
        />
        {commandInput.error && (
          <div style={{ color: 'red', fontSize: 12, marginTop: 4 }}>
            {commandInput.error}
          </div>
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel (Esc)
          </button>
          <button
            type="submit"
            style={{
              padding: '4px 12px',
              fontSize: 12,
              background: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            OK (Enter)
          </button>
        </div>
      </form>
    </div>
  );
};
