import { create } from 'zustand';

const DONE_KEY = 'thermo2d.tour.done';

export interface TourState {
  active: boolean;
  step: number;
  completed: boolean;
  helpOpen: boolean;
  helpPage: string | null;
  start(): void;
  next(): void;
  back(): void;
  stop(done: boolean): void;
  openHelp(page?: string): void;
  closeHelp(): void;
}

function readDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export const tourStore = create<TourState>()((set, get) => ({
  active: false,
  step: 0,
  completed: readDone(),
  helpOpen: false,
  helpPage: null,
  start: () => set({ active: true, step: 0 }),
  next: () => set({ step: get().step + 1 }),
  back: () => set({ step: Math.max(0, get().step - 1) }),
  stop: (done) => {
    if (done) {
      try {
        localStorage.setItem(DONE_KEY, '1');
      } catch {
        /* ignore */
      }
    }
    set({ active: false, completed: done || get().completed });
  },
  openHelp: (page) => set({ helpOpen: true, helpPage: page ?? null }),
  closeHelp: () => set({ helpOpen: false, helpPage: null }),
}));
