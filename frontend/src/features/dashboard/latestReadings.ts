import { fetchLatestForSeries, type LatestSeriesResult, type Series } from '../../api/client.ts';

/**
 * Pobiera ostatnie odczyty i co 5 s ponawia wyłącznie nieudane serie.
 * @returns Funkcja kończąca pracę, anulująca żądania i zaplanowane ponowienie.
 */
export function loadLatestReadings(
  series: readonly Series[], onResults: (results: LatestSeriesResult[]) => void,
): () => void {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Pobiera wskazaną partię serii, publikuje aktualne wyniki i planuje kolejną próbę tylko dla błędów.
   * Po anulowaniu nie publikuje już wyników ani nie planuje nowego timera.
   */
  async function load(pending: readonly Series[]) {
    let results: LatestSeriesResult[];
    try {
      results = await fetchLatestForSeries(pending, controller.signal);
    } catch (reason) {
      if (controller.signal.aborted) return;
      results = pending.map( item => ({
        seriesId: String(item.id),
        error: reason instanceof Error ? reason.message : 'Nie udało się pobrać odczytu.',
      }));
    }
    if (controller.signal.aborted) return;
    onResults(results);
    const failed = new Set(results.filter( result => result.error !== undefined).map( result => result.seriesId));
    if (failed.size) {
      timer = setTimeout( () => { void load(pending.filter( item => failed.has(String(item.id)))); }, 5000);
    }
  }

  void load(series);
  return () => {
    controller.abort();
    clearTimeout(timer);
  };
}
