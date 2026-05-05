/**
 * In-memory debug counters — local only, never sent to a network (plan §5.14.9).
 *
 * Phase 1 wires bumps for `chatTurns`, `streamErrors`, `aborts`. Later phases
 * extend with `toolCalls`, `repairRetries`, `validationFailures`. Phase 6
 * adds a debug subview that renders the snapshot.
 *
 * The store does NOT persist these — they reset on page reload. That is
 * deliberate (plan §5.14.14).
 */

export interface LocalCounters {
  chatTurns: number;
  streamErrors: number;
  aborts: number;
  toolCalls: number;
  repairRetries: number;
  validationFailures: number;
}

const counters: LocalCounters = {
  chatTurns: 0,
  streamErrors: 0,
  aborts: 0,
  toolCalls: 0,
  repairRetries: 0,
  validationFailures: 0,
};

export function bumpCounter(key: keyof LocalCounters, by = 1): void {
  counters[key] += by;
}

export function snapshotCounters(): Readonly<LocalCounters> {
  return { ...counters };
}

/** Test hook. */
export function _resetCountersForTesting(): void {
  for (const key of Object.keys(counters) as Array<keyof LocalCounters>) {
    counters[key] = 0;
  }
}
