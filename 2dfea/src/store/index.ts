/**
 * Store Module - State management with Zustand
 *
 * Usage:
 *   import { useModelStore, useUIStore } from './store';
 *
 *   function MyComponent() {
 *     const nodes = useModelStore(state => state.nodes);
 *     const addNode = useModelStore(state => state.addNode);
 *     const activeTool = useUIStore(state => state.activeTool);
 *   }
 */

export { useModelStore } from './useModelStore';
export { useUIStore } from './useUIStore';

export type { Tool, SnapMode, ViewTransform, SnapSettings, UIState } from './useUIStore';
