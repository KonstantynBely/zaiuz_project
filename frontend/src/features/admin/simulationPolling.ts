/**
 * Tworzy szeregowy poller z generacją odpowiedzi i opcjonalnym interwałem, domyślnie 2500 ms.
 * Nie dopuszcza nakładających się cykli i ignoruje stare wyniki nawet wtedy, gdy dostawca nie respektuje abort.
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

  /** Usuwa zaplanowany cykl i zeruje referencję do timera. */
  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  /** Planuje następny cykl po zakończeniu bieżącego; nie planuje pracy po stop(). */
  function schedule() {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(/** Rozpoczyna następny cykl odpytywania po upływie interwału. */ () => { void poll(); }, options.interval ?? 2500);
  }

  /**
   * Wykonuje pojedynczy odczyt i stosuje wyłącznie wynik aktualnej generacji.
   * Błędy przekazuje fail; w finally uruchamia żądane pilne odświeżenie lub planuje zwykły interwał.
   */
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

  /** Zwiększa generację i anuluje trwające żądanie, aby wynik sprzed mutacji nie nadpisał nowego stanu. */
  function invalidate() {
    epoch++;
    inFlight?.abort();
  }

  /** Unieważnia poprzedni wynik i żąda najbliższego możliwego odczytu bez równoległych cykli. */
  function refresh() {
    invalidate();
    clearTimer();
    if (inFlight) refreshRequested = true;
    else void poll();
  }

  /** Trwale dezaktywuje poller, anuluje żądanie i usuwa oczekujące odświeżenie oraz timer. */
  function stop() {
    disposed = true;
    invalidate();
    refreshRequested = false;
    clearTimer();
  }

  return { poll, invalidate, refresh, stop };
}
