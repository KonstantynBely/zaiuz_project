/**
 * Poll cycles are serial. Invalidation prevents older GET responses from
 * undoing a completed Start/Stop operation, even if fetch ignores abort.
 */
export function createSimulationPoller<T>(options: {
  load: (signal: AbortSignal) => Promise<T>;
  apply: (result: T) => void;
  fail: (error: unknown) => void;
  interval?: number;
}) {
  let disposed = false;
  let epoch = 0;
  let inFlight: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let refreshRequested = false;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(() => { void poll(); }, options.interval ?? 2500);
  }

  async function poll(): Promise<void> {
    if (disposed || inFlight) return;
    clearTimer();
    const controller = new AbortController();
    const requestedEpoch = epoch;
    inFlight = controller;
    try {
      const result = await options.load(controller.signal);
      if (!disposed && !controller.signal.aborted && requestedEpoch === epoch) options.apply(result);
    } catch (reason) {
      if (!disposed && !controller.signal.aborted && requestedEpoch === epoch) options.fail(reason);
    } finally {
      if (inFlight === controller) inFlight = null;
      if (!disposed && refreshRequested) {
        refreshRequested = false;
        void poll();
      } else schedule();
    }
  }

  function invalidate() {
    epoch++;
    inFlight?.abort();
  }

  function refresh() {
    invalidate();
    clearTimer();
    if (inFlight) refreshRequested = true;
    else void poll();
  }

  function stop() {
    disposed = true;
    invalidate();
    refreshRequested = false;
    clearTimer();
  }

  return { poll, invalidate, refresh, stop };
}
