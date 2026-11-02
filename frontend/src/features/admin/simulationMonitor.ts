import type { Series } from '../../api/client';
import type { Simulation } from '../../api/admin';
import { createSimulationPoller } from './simulationPolling.ts';

/**
 * Uruchamia dwa niezależne pollery: serie pobiera do pierwszego sukcesu, a statusy cyklicznie.
 * Błędy raportuje osobno; zwrócone stop anuluje oba źródła i ich timery.
 */
export function createSimulationMonitor(options: {
  loadSeries: (signal: AbortSignal) => Promise<Series[]>;
  loadRuns: (signal: AbortSignal) => Promise<Simulation[]>;
  onSeries: (series: Series[]) => void;
  onRuns: (runs: Simulation[]) => void;
  onSeriesError: (error: unknown | null) => void;
  onRunsError: (error: unknown | null) => void;
}) {
  // Series are needed once per visit. Retry failures independently of run status.
  const series = createSimulationPoller({
    load: options.loadSeries,
    /** Przekazuje aktualny wynik odpowiedniemu odbiorcy i usuwa błąd tego źródła; po sukcesie listy serii kończy jej poller. */
    apply: items => {
      options.onSeries(items);
      options.onSeriesError(null);
      series.stop();
    },
    fail: options.onSeriesError,
    interval: 5000,
  });
  const runs = createSimulationPoller({
    load: options.loadRuns,
    /** Przekazuje aktualny wynik odpowiedniemu odbiorcy i usuwa błąd tego źródła; po sukcesie listy serii kończy jej poller. */
    apply: items => {
      options.onRuns(items);
      options.onRunsError(null);
    },
    fail: options.onRunsError,
  });
  void series.poll();
  void runs.poll();
  return {
    invalidate: runs.invalidate,
    refresh: runs.refresh,
    /** Zatrzymuje odpytywanie serii i uruchomień wraz z anulowaniem ich trwających żądań. */
    stop: () => { series.stop(); runs.stop(); },
  };
}
