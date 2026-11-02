import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  fetchHealth, fetchMeasurements, fetchSeries,
  type Measurement, type Series,
} from '../../api/client';
import { loadLatestReadings } from './latestReadings';
import { TelemetryReconciler, preferLatest, type StreamFilter, type MeasurementRange } from './measurementStream';

/** Wejściowe filtry i sterowanie odświeżaniem hooka telemetrii; zmiana generacji inicjuje nowy REST. */
interface Options {
  preview: boolean;
  reload: number;
  setReload: Dispatch<SetStateAction<number>>;
  range: MeasurementRange;
  customDates: { from?: string; to?: string };
  hidden: string[];
}

/**
 * Łączy odczyt REST, ostatnie wartości poszczególnych serii i publiczny SSE w stan dashboardu.
 * Generacje TelemetryReconciler chronią przed spóźnionymi migawkami i utratą zdarzeń podczas pobierania.
 * Efekty anulują żądania, timery i EventSource; w preview pomijają API.
 * @returns Stan ładowania, dane serii/pomiarów, ostatnie odczyty i błędy ich niezależnego pobierania.
 */
export function useTelemetry({ preview, reload, setReload, range, customDates, hidden }: Options) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [liveSeries, setLiveSeries] = useState<Series[]>([]);
  const [liveMeasurements, setLiveMeasurements] = useState<Measurement[]>([]);
  const reconcilerRef = useRef(new TelemetryReconciler());
  const [latestBySeries, setLatestBySeries] = useState<Record<string, Measurement | null>>({});
  const [latestErrors, setLatestErrors] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now);

  // A rolling time window changes locally; a clock tick does not refetch REST.
  /** Co minutę aktualizuje lokalny zegar przesuwanych filtrów bez ponownego pobierania REST. */
  useEffect(() => {
    const interval = window.setInterval(/** Przesuwa lokalny czas odniesienia okien filtrów bez żądania do API. */ () => setNow(Date.now()), 60_000);
    return /** Usuwa interwał aktualizacji lokalnego zegara po odmontowaniu hooka. */ () => window.clearInterval(interval);
  }, []);

  /** Pobiera spójną migawkę serii i pomiarów dla nowych filtrów; łączy ją z buforem SSE aktualnej generacji. */
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
      availableSeriesIds: liveSeries.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => String(item.id)),
    };
    const generation = reconciler.begin(initialFilter);
    setLiveMeasurements(reconciler.visible());

    const from = range === 'custom' ? customDates.from : range === 'all' ? undefined :
      new Date(Date.now() - (range === '24h' ? 1 : range === '7d' ? 7 : 30) * 86_400_000).toISOString();
    const to = range === 'custom' ? customDates.to : undefined;

    void Promise.all([fetchHealth(controller.signal), fetchSeries(controller.signal)])
      .then(/** Pobiera pomiary wybranych serii i stosuje migawkę tylko wtedy, gdy generacja REST jest nadal aktualna. */ async ([health, loadedSeries]) => {
        if (controller.signal.aborted) return;
        if (health.status !== 'ok') throw new Error('Serwer API nie jest gotowy');
        const selected = loadedSeries.filter(/** Pomija serie ukryte przez użytkownika w aktywnym filtrze. */ item => !hidden.includes(String(item.id)));
        const loaded = selected.length ? await fetchMeasurements(controller.signal,
          { from, to, series: selected.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => item.id) }) : [];
        if (controller.signal.aborted) return;
        const filter = {
          ...initialFilter,
          availableSeriesIds: loadedSeries.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => String(item.id)),
        };
        const reconciled = reconciler.finish(generation, loaded, filter);
        if (reconciled === null) return;
        setLiveSeries(loadedSeries);
        setLiveMeasurements(reconciled);
        setStatus('ready');
        setError('');
      })
      .catch(/** Raportuje błąd odczytu tylko dla nadal aktywnego widoku lub nieanulowanej generacji. */ reason => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych');
      });

    return /** Anuluje REST i unieważnia jego generację przy zmianie filtrów lub odmontowaniu. */ () => {
      controller.abort();
      reconciler.invalidate();
    };
    // The series list is loaded by this effect; depending on it would loop.
  }, [preview, reload, range, customDates, hidden]);

  const seriesKey = liveSeries.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => String(item.id)).sort().join(',');
  /** Pobiera ostatnie odczyty niezależnie od filtra wykresu i usuwa stan serii, których już nie ma. */
  useEffect(() => {
    if (preview) return;
    const available = new Set(liveSeries.map(/** Wyodrębnia identyfikator do klucza porównania, filtra lub zbioru wyników. */ item => String(item.id)));
    setLatestBySeries(/** Usuwa ostatnie odczyty serii, których nie ma już na aktualnej liście. */ previous => Object.fromEntries(
      Object.entries(previous).filter(/** Pozostawia wpisy wyłącznie dla serii obecnych w aktualnej liście. */ ([key]) => available.has(key)),
    ));
    setLatestErrors(/** Usuwa komunikaty serii, które zniknęły z listy. */ previous => Object.fromEntries(
      Object.entries(previous).filter(/** Pozostawia wpisy wyłącznie dla serii obecnych w aktualnej liście. */ ([key]) => available.has(key)),
    ));
    if (!liveSeries.length) return;
    return loadLatestReadings(liveSeries, /** Stosuje wyniki ostatnich odczytów niezależnie dla danych i błędów poszczególnych serii. */ results => {
      setLatestBySeries(/** Aktualizuje poprawne ostatnie odczyty, zachowując nowsze dane i poprzednie wartości przy błędach. */ previous => {
        const next = { ...previous };
        for (const result of results) {
          if (result.error !== undefined) continue;
          if (result.measurement) next[result.seriesId] = preferLatest(next[result.seriesId], result.measurement) ?? null;
          else if (!(result.seriesId in next)) next[result.seriesId] = null;
        }
        return next;
      });
      setLatestErrors(/** Zapisuje błędy poszczególnych odczytów i czyści je po sukcesie danej serii. */ previous => {
        const next = { ...previous };
        for (const result of results) {
          if (result.error !== undefined) next[result.seriesId] = result.error;
          else delete next[result.seriesId];
        }
        return next;
      });
    });
    // Load independently of chart filters; reload covers manual refresh and SSE reconnect.
  }, [preview, seriesKey, reload]);

  /** Subskrybuje publiczny SSE; po ponownym otwarciu inicjuje REST i po odmontowaniu zamyka EventSource. */
  useEffect(() => {
    if (preview || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    let openCount = 0;
    source.onopen = /** Przy ponownym otwarciu SSE wymusza nową migawkę REST, aby uzupełnić przerwę w zdarzeniach. */ () => {
      if (openCount++ > 0) setReload(/** Zwiększa licznik odświeżenia względem ostatniego zatwierdzonego stanu React. */ value => value + 1);
    };
    source.addEventListener('measurement', /** Waliduje i scala nowy pomiar SSE z bieżącą generacją oraz aktualizuje ostatni odczyt serii. */ (event: MessageEvent<string>) => {
      try {
        const item = JSON.parse(event.data) as Measurement;
        const rows = reconcilerRef.current.receive(item);
        setLiveMeasurements(rows);
        if (item.seriesId == null) return;
        setLatestBySeries(/** Podmienia ostatni odczyt serii tylko wtedy, gdy przychodzące zdarzenie jest nowsze. */ previous => {
          const key = String(item.seriesId);
          const latest = preferLatest(previous[key], item);
          return latest === previous[key] ? previous : { ...previous, [key]: latest ?? null };
        });
      } catch { /* Invalid SSE payloads must not disconnect the stream. */ }
    });
    return /** Zamyka połączenie SSE, kończąc jego automatyczne próby ponownego połączenia. */ () => source.close();
  }, [preview]);

  return { status, setStatus, error, liveSeries, liveMeasurements, latestBySeries, latestErrors, now };
}
