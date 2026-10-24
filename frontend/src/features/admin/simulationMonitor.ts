import type { Series } from '../../api/client';
import type { Simulation } from '../../api/admin';
import { createSimulationPoller } from './simulationPolling.ts';

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
    stop: () => { series.stop(); runs.stop(); },
  };
}
