import { create } from 'zustand';

/** Last agent-API calls, so the UI can show that an agent is driving the app. */
export interface AgentActivity {
  calls: { name: string; at: number }[];
  record(name: string): void;
}

export const agentActivity = create<AgentActivity>()((set, get) => ({
  calls: [],
  record: (name) => set({ calls: [...get().calls.slice(-19), { name, at: Date.now() }] }),
}));
