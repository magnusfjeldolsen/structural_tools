/**
 * Lightweight leading + trailing throttle.
 *
 * Used by the zundo `temporal` middleware via `handleSet` so that bursts of
 * synchronous `set` calls coalesce into a single history entry. We avoid a
 * lodash dependency for a single ~20-LOC use site (keeps the bundle lean).
 *
 * Behaviour:
 *  - `leading: true`  → fire immediately on the first call of a burst
 *  - `trailing: true` → fire once more after `wait` ms if any calls occurred during the wait
 *  - both true        → typical "fire now, then once at the end if anything else came in"
 *
 * @param fn   The function to throttle.
 * @param wait Window in milliseconds.
 * @param opts Edge controls; both leading and trailing default to true.
 */
export function throttle<F extends (...args: any[]) => any>(
  fn: F,
  wait: number,
  opts: { leading?: boolean; trailing?: boolean } = {}
): F {
  const leading = opts.leading !== false;
  const trailing = opts.trailing !== false;

  let lastInvoke = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<F> | null = null;
  let pendingThis: unknown = null;

  const invoke = () => {
    lastInvoke = Date.now();
    timer = null;
    if (pendingArgs) {
      const args = pendingArgs;
      const ctx = pendingThis;
      pendingArgs = null;
      pendingThis = null;
      fn.apply(ctx, args);
    }
  };

  const throttled = function (this: unknown, ...args: Parameters<F>) {
    const now = Date.now();
    const elapsed = now - lastInvoke;

    if (elapsed >= wait) {
      // Outside the window: maybe fire on the leading edge.
      if (leading) {
        lastInvoke = now;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        fn.apply(this, args);
      } else if (trailing && !timer) {
        pendingArgs = args;
        pendingThis = this;
        timer = setTimeout(invoke, wait);
      }
      return;
    }

    // Inside the window: queue the trailing call.
    if (trailing) {
      pendingArgs = args;
      pendingThis = this;
      if (!timer) {
        timer = setTimeout(invoke, wait - elapsed);
      }
    }
  } as F;

  return throttled;
}
