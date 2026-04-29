/**
 * Lightweight toast store — single-message queue with auto-dismiss.
 *
 * Used by the save/load JSON module for import success / failure messages,
 * and by the export path for the "Exported …" confirmation. Generic enough
 * to be reused by other features.
 *
 * UX policy:
 *   - One visible toast at a time (latest replaces previous).
 *   - Auto-dismiss after `durationMs` (default 3000 ms).
 *   - The `kind` distinguishes info / error styling — error toasts get a
 *     longer default duration so the user can read them.
 */
import { create } from 'zustand';

export type ToastKind = 'info' | 'error';

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  current: ToastMessage | null;
  show: (msg: { kind: ToastKind; message: string; durationMs?: number }) => void;
  clear: () => void;
}

let nextId = 1;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  current: null,

  show: ({ kind, message, durationMs }) => {
    const id = nextId++;
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ current: { id, kind, message } });
    const ms = durationMs ?? (kind === 'error' ? 6000 : 3000);
    dismissTimer = setTimeout(() => {
      // Only clear if this toast is still the current one (a newer toast
      // would have replaced it, with its own timer).
      set((state) => (state.current?.id === id ? { current: null } : state));
      dismissTimer = null;
    }, ms);
  },

  clear: () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({ current: null });
  },
}));

/**
 * Imperative helper for non-React call sites (the save/load JSON module
 * triggers toasts from plain functions, not hooks).
 */
export function showToast(msg: {
  kind: ToastKind;
  message: string;
  durationMs?: number;
}): void {
  useToastStore.getState().show(msg);
}
