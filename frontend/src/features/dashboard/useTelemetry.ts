import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  fetchHealth, fetchMeasurements, fetchLatestForSeries, fetchSeries,
  type Measurement, type Series,
} from '../../api/client';
import { TelemetryReconciler, preferLatest, type StreamFilter, type MeasurementRange } from './measurementStream';

interface Options {
  preview: boolean;
  reload: number;
  setReload: Dispatch<SetStateAction<number>>;
  range: MeasurementRange;
  customDates: { from?: string; to?: string };
  hidden: string[];
}

/** Dashboard telemetry state is independent of administrator session state. */
export function useTelemetry({ preview, reload, setReload, range, customDates, hidden }: Options) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [liveSeries, setLiveSeries] = useState<Series[]>([]);
  const [liveMeasurements, setLiveMeasurements] = useState<Measurement[]>([]);
  const reconcilerRef = useRef(new TelemetryReconciler());
  const [latestBySeries, setLatestBySeries] = useState<Record<string, Measurement | null>>({});
  const [now, setNow] = useState(Date.now);

  // A rolling time window changes locally; a clock tick does not refetch REST.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const reconciler = reconcilerRef.current;
    if (preview) {
      reconciler.invalidate();
      setStatus('ready');
      setError('');
      return;
    }
    const controller = new AbortController();
    const initialFilter: StreamFilter = {
      range,
      from: customDates.from,
      to: customDates.to,
      hiddenSeriesIds: hidden,
      availableSeriesIds: liveSeries.map(item => String(item.id)),
    };
    const generation = reconciler.begin(initialFilter);
    setLiveMeasurements(reconciler.visible());

    const from = range === 'custom' ? customDates.from : range === 'all' ? undefined :
      new Date(Date.now() - (range === '24h' ? 1 : range === '7d' ? 7 : 30) * 86_400_000).toISOString();
    const to = range === 'custom' ? customDates.to : undefined;

    void Promise.all([fetchHealth(controller.signal), fetchSeries(controller.signal)])
      .then(async ([health, loadedSeries]) => {
        if (controller.signal.aborted) return;
        if (health.status !== 'ok') throw new Error('Serwer API nie jest gotowy');
        const selected = loadedSeries.filter(item => !hidden.includes(String(item.id)));
        const loaded = selected.length ? await fetchMeasurements(controller.signal,
          { from, to, series: selected.map(item => item.id) }) : [];
        if (controller.signal.aborted) return;
        const filter = {
          ...initialFilter,
          availableSeriesIds: loadedSeries.map(item => String(item.id)),
        };
        const reconciled = reconciler.finish(generation, loaded, filter);
        if (reconciled === null) return;
        setLiveSeries(loadedSeries);
        setLiveMeasurements(reconciled);
        setStatus('ready');
        setError('');
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych');
      });

    return () => {
      controller.abort();
      reconciler.invalidate();
    };
    // The series list is loaded by this effect; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, reload, range, customDates, hidden]);

  const seriesKey = liveSeries.map(item => String(item.id)).sort().join(',');
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    const available = new Set(liveSeries.map(item => String(item.id)));
    setLatestBySeries(previous => Object.fromEntries(
      Object.entries(previous).filter(([key]) => available.has(key)),
    ));
    if (!liveSeries.length) return () => controller.abort();
    void fetchLatestForSeries(liveSeries, controller.signal)
      .then(results => {
        if (controller.signal.aborted) return;
        setLatestBySeries(previous => {
          const next = { ...previous };
          for (const { seriesId, measurement } of results) {
            if (measurement) next[seriesId] = preferLatest(next[seriesId], measurement) ?? null;
            else if (!(seriesId in next)) next[seriesId] = null;
          }
          return next;
        });
      })
      .catch(() => { /* A failed lookup is not evidence that a series has no readings. */ });
    return () => controller.abort();
    // Load independently of chart filters; reload covers manual refresh and SSE reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, seriesKey, reload]);

  useEffect(() => {
    if (preview || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let openCount = 0;
    source.onopen = () => {
      if (openCount++ > 0) setReload(value => value + 1);
    };
    source.addEventListener('measurement', (event: MessageEvent<string>) => {
      try {
        const item = JSON.parse(event.data) as Measurement;
        const rows = reconcilerRef.current.receive(item);
        setLiveMeasurements(rows);
        if (item.seriesId == null) return;
        setLatestBySeries(previous => {
          const key = String(item.seriesId);
          const latest = preferLatest(previous[key], item);
          return latest === previous[key] ? previous : { ...previous, [key]: latest ?? null };
        });
      } catch { /* Invalid SSE payloads must not disconnect the stream. */ }
    });
    return () => source.close();
  }, [preview]);

  return { status, setStatus, error, liveSeries, liveMeasurements, latestBySeries, now };
}
