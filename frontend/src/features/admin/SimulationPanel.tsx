import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import '../../styles/admin.css';
import { createSimulationMonitor } from './simulationMonitor';
import type { Series } from '../../api/client';
import { adminApi, ApiRequestError, type Simulation, type SimulationInput, type SimulationState } from '../../api/admin';

/** Kontrakt właściwości komponentu SimulationPanel: dane kontrolowane i callbacki właściciela stanu. */
interface Props {
  token: string;
  onUnauthorized: () => void;
  onMeasurementsChanged: () => void;
  onOpenDashboard: () => void;
}

const runningStates: SimulationState[] = ['pending', 'running', 'stopping'];
const stateLabels: Record<SimulationState, string> = {
  pending: 'Oczekiwanie', running: 'W trakcie', stopping: 'Zatrzymywanie',
  stopped: 'Zatrzymano', completed: 'Ukończono', failed: 'Błąd',
};
/** Formatuje datę uruchomienia w lokalnej strefie przeglądarki; brak daty pokazuje jako kreskę. */
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
/** Zachowuje komunikat rozpoznanego błędu API; inne błędy przedstawia jako problem połączenia. */
const describe = (error: unknown) => {
  if (error instanceof ApiRequestError) return error.message;
  return 'Nie udało się połączyć z serwerem.';
};

/**
 * Renderuje konfigurację i statusy symulacji, korzystając z niezależnego monitorowania serii i uruchomień.
 * Generacja sesji chroni przed zastosowaniem spóźnionych wyników Start/Stop po zmianie tokenu lub odmontowaniu.
 */
export function SimulationPanel({ token, onUnauthorized, onMeasurementsChanged, onOpenDashboard }: Props) {
  const [series, setSeries] = useState<Series[]>([]);
  const [runs, setRuns] = useState<Simulation[]>([]);
  const [seriesId, setSeriesId] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'history' | 'live'>('live');
  const [pattern, setPattern] = useState<'random' | 'sine' | 'observed'>('random');
  const [station, setStation] = useState<'EPWA' | 'EPKK' | 'EPGD'>('EPWA');
  const [count, setCount] = useState('30');
  const [intervalSeconds, setIntervalSeconds] = useState('1');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [seriesError, setSeriesError] = useState('');
  const pollerRef = useRef<ReturnType<typeof createSimulationMonitor> | null>(null);
  const sessionEpoch = useRef(0);
  const [notice, setNotice] = useState('');

  /** Odszukuje opis aktualnie wybranej serii na potrzeby walidacji formularza. */
  const selectedSeries = useMemo(() => series.find(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ item => String(item.id) === seriesId), [series, seriesId]);
  /** Wybiera zadania w stanach pending, running lub stopping do panelu sterowania. */
  const activeRuns = useMemo(() => runs.filter(/** Rozpoznaje zadania, które nadal mogą być wykonywane lub zatrzymywane. */ run => runningStates.includes(run.state)), [runs]);

  /** Tworzy niezależne monitory serii i zadań dla jednej generacji sesji; cleanup unieważnia generację i zatrzymuje pollery. */
  useEffect(() => {
    let active = true;
    const epoch = ++sessionEpoch.current;
    setLoading(true);
    setSeriesError('');
    setPollError('');
    /** Ignoruje wyniki starej sesji, przekazuje 401 do rodzica, a pozostałe błędy do właściwego komunikatu. */
    const reportError = (reason: unknown | null, update: (message: string) => void) => {
      if (!active || sessionEpoch.current !== epoch) return;
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else update(reason === null ? '' : describe(reason));
    };
    const poller = createSimulationMonitor({
      /** Pobiera serie dla monitora, przekazując jego sygnał anulowania. */
      loadSeries: signal => adminApi.listSeries(signal),
      /** Pobiera statusy zadań dla bieżącego tokenu i sygnału monitora. */
      loadRuns: signal => adminApi.listSimulations(token, signal),
      /** Stosuje listę serii wyłącznie dla bieżącej generacji sesji i kończy początkowe ładowanie. */
      onSeries: items => {
        if (!active || sessionEpoch.current !== epoch) return;
        setSeries(items);
        setLoading(false);
      },
      /** Stosuje statusy symulacji, jeżeli widok i generacja sesji są nadal aktywne. */
      onRuns: items => {
        if (active && sessionEpoch.current === epoch) setRuns(items);
      },
      /** Aktualizuje błąd listy serii i kończy jej początkowy stan ładowania dla aktywnego widoku. */
      onSeriesError: reason => {
        reportError(reason, setSeriesError);
        if (active && sessionEpoch.current === epoch) setLoading(false);
      },
      /** Przekazuje błąd odpytywania statusów do niezależnego komunikatu lub obsługi utraty sesji. */
      onRunsError: reason => reportError(reason, setPollError),
    });
    pollerRef.current = poller;
    return /** Unieważnia sesję widoku i zatrzymuje monitory, aby spóźnione odpowiedzi nie zmieniały UI. */ () => {
      active = false;
      ++sessionEpoch.current;
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [token, onUnauthorized]);

  /** Wybiera serię i uzupełnia granice formularza jej aktualnym zakresem; brak wyboru czyści pola. */
  function chooseSeries(id: string) {
    setSeriesId(id);
    const target = series.find(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ item => String(item.id) === id);
    setMinimum(target ? String(target.minValue) : '');
    setMaximum(target ? String(target.maxValue) : '');
  }

  /**
   * Waliduje parametry, jednostkę METAR i interwał, unieważnia stary odczyt pollera i wysyła Start.
   * Wynik stosuje tylko w tej samej sesji; następnie wymusza odświeżenie statusów.
   */
  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const min = Number(minimum);
    const max = Number(maximum);
    const parsedCount = Number(count);
    const parsedInterval = Number(intervalSeconds) * 1000;
    if (!selectedSeries) { setError('Wybierz istniejącą serię.'); return; }
    if (pattern === 'observed' && !['°C', 'C'].includes(selectedSeries.unit ?? '')) {
      setError('Dla rzeczywistych temperatur METAR wybierz serię z jednostką °C.');
      return;
    }
    if (pattern !== 'observed' && (!Number.isFinite(min) || !Number.isFinite(max) || minimum.trim() === '' || maximum.trim() === '' ||
      min >= max || min < selectedSeries.minValue || max > selectedSeries.maxValue)) {
      setError('Zakres symulacji musi mieścić się w granicach wybranej serii, a minimum być mniejsze od maksimum.');
      return;
    }
    if ((pattern !== 'observed' && (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1000)) ||
      !Number.isInteger(parsedInterval) || parsedInterval < 200 || parsedInterval > 60000) {
      setError('Podaj od 1 do 1000 pomiarów i odstęp od 0,2 do 60 sekund.');
      return;
    }
    const input: SimulationInput = {
      seriesId, mode, pattern, intervalMs: parsedInterval,
      ...(pattern === 'observed' ? { station } : { count: parsedCount, min, max }),
      ...(name.trim() ? { name: name.trim() } : {}),
    };
    const epoch = sessionEpoch.current;
    pollerRef.current?.invalidate();
    setBusy(true); setError(''); setNotice('');
    try {
      const run = await adminApi.startSimulation(token, input);
      if (sessionEpoch.current !== epoch) return;
      setRuns(/** Dodaje nowy status zadania, usuwając poprzedni wpis o tym samym ID. */ previous => [run, ...previous.filter(/** Usuwa poprzedni wpis uruchomienia o tym samym ID przed dodaniem nowego statusu. */ item => item.id !== run.id)]);
      setNotice(pattern === 'observed'
        ? 'Uruchomiono odtwarzanie obserwacji METAR (Aviation Weather Center).'
        : 'Uruchomiono symulację.');
      pollerRef.current?.refresh();
    } catch (reason) {
      if (sessionEpoch.current !== epoch) return;
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(describe(reason));
      pollerRef.current?.refresh();
    } finally {
      if (sessionEpoch.current === epoch) setBusy(false);
    }
  }

  /**
   * Unieważnia trwający odczyt i wysyła Stop jednego zadania.
   * Po sukcesie podmienia jego stan, odświeża telemetrię i uruchamia nowy cykl monitora.
   */
  async function stop(id: string) {
    const epoch = sessionEpoch.current;
    pollerRef.current?.invalidate();
    setBusy(true); setError(''); setNotice('');
    try {
      const run = await adminApi.stopSimulation(token, id);
      if (sessionEpoch.current !== epoch) return;
      setRuns(/** Podmienia status wskazanego zadania, zachowując pozostałą listę. */ previous => previous.map(/** Zastępuje tylko status uruchomienia wskazanego przez odpowiedź Stop. */ item => item.id === run.id ? run : item));
      setNotice('Zatrzymano symulację. Zapisane pomiary pozostały w historii.');
      onMeasurementsChanged();
      pollerRef.current?.refresh();
    } catch (reason) {
      if (sessionEpoch.current !== epoch) return;
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(describe(reason));
      pollerRef.current?.refresh();
    } finally {
      if (sessionEpoch.current === epoch) setBusy(false);
    }
  }

  return <div className="admin-view simulation-view">
    <div className="admin-heading">
      <h1>Symulatory</h1>
      <p>Uruchamiaj i zatrzymuj symulacje pomiarów.</p>
    </div>
    {seriesError && <p role="alert" className="form-message error">{seriesError} Lista serii zostanie pobrana ponownie automatycznie.</p>}
    {pollError && <p role="status" className="form-message error">{pollError}</p>}
    {error && <p role="alert" className="form-message error">{error}</p>}
    {notice && <p role="status" className="form-message success">{notice}</p>}
    <div className="sim-layout">
      <section className="admin-card sim-configuration" aria-labelledby="simulation-form-heading">
        <h2 id="simulation-form-heading">Nowa symulacja</h2>
        <form className="admin-form" onSubmit={start}>
          <label htmlFor="sim-series">Seria pomiarowa</label>
          <select id="sim-series" required value={seriesId} onChange={/** Zmienia serię symulacji i uzupełnia pola jej zakresem. */ event => chooseSeries(event.target.value)} disabled={busy}>
            <option value="">Wybierz serię</option>
            {series.filter(/** Dla METAR dopuszcza wyłącznie serie z jednostką temperatury. */ item => pattern !== 'observed' || ['°C', 'C'].includes(item.unit ?? '')).map(/** Tworzy opcję wyboru z identyfikatorem, nazwą i ewentualną jednostką serii. */ item =>
              <option key={String(item.id)} value={String(item.id)}>{item.name} ({item.unit || 'bez jednostki'})</option>)}
          </select>
          <label htmlFor="sim-name">Nazwa czujnika (opcjonalna)</label>
          <input id="sim-name" maxLength={100} value={name} onChange={/** Aktualizuje nazwę w stanie formularza. */ event => setName(event.target.value)} disabled={busy} placeholder="Np. czujnik temperatury"/>
          <div className="admin-field-grid">
            <div><label htmlFor="sim-mode">Sposób odtwarzania</label>
              <select id="sim-mode" value={mode} onChange={/** Aktualizuje tryb odtwarzania w stanie formularza. */ event => setMode(event.target.value as 'history' | 'live')} disabled={busy}>
                <option value="live">Na żywo</option><option value="history">Historycznie</option>
              </select></div>
            <div><label htmlFor="sim-pattern">Źródło danych</label>
              <select id="sim-pattern" value={pattern} onChange={/** Zmienia serię symulacji i uzupełnia pola jej zakresem. */ event => {
                const next = event.target.value as 'random' | 'sine' | 'observed';
                setPattern(next);
                if (next === 'observed' && selectedSeries && !['°C', 'C'].includes(selectedSeries.unit ?? '')) chooseSeries('');
              }} disabled={busy}>
                <option value="random">Syntetyczne — losowe</option>
                <option value="sine">Syntetyczne — sinusoida</option>
                <option value="observed">Rzeczywiste — METAR</option>
              </select></div>
          </div>
          {pattern === 'observed' && <>
            <label htmlFor="sim-station">Stacja obserwacyjna</label>
            <select id="sim-station" value={station} onChange={/** Aktualizuje stację METAR w stanie formularza. */ event => setStation(event.target.value as typeof station)} disabled={busy}>
              <option value="EPWA">Warszawa-Okęcie (EPWA)</option>
              <option value="EPKK">Kraków-Balice (EPKK)</option>
              <option value="EPGD">Gdańsk (EPGD)</option>
            </select>
            <p className="admin-helper">Temperatury z ostatnich 24 godzin, źródło: Aviation Weather Center (METAR). W trybie historycznym zachowywana jest data obserwacji, a na żywo — bieżący czas odtwarzania.</p>
          </>}
          {pattern !== 'observed' && <div className="admin-field-grid">
            <div><label htmlFor="sim-min">Minimum wartości</label><input id="sim-min" type="number" step="any" value={minimum} onChange={/** Aktualizuje dolną granicę w stanie formularza. */ event => setMinimum(event.target.value)} required disabled={busy}/></div>
            <div><label htmlFor="sim-max">Maksimum wartości</label><input id="sim-max" type="number" step="any" value={maximum} onChange={/** Aktualizuje górną granicę w stanie formularza. */ event => setMaximum(event.target.value)} required disabled={busy}/></div>
          </div>}
          <div className="admin-field-grid">
            {pattern !== 'observed' && <div><label htmlFor="sim-count">Liczba pomiarów</label><input id="sim-count" type="number" min={1} max={1000} step={1} required value={count} onChange={/** Aktualizuje liczbę próbek w stanie formularza. */ event => setCount(event.target.value)} disabled={busy}/></div>}
            <div><label htmlFor="sim-interval">Odstęp między pomiarami (s)</label><input id="sim-interval" type="number" min={0.2} max={60} step={0.1} required value={intervalSeconds} onChange={/** Aktualizuje interwał w sekundach w stanie formularza. */ event => setIntervalSeconds(event.target.value)} disabled={busy}/></div>
          </div>
          {pattern !== 'observed' && <p className="admin-helper">{mode === 'history' ? 'Pomiary otrzymają historyczne daty i zostaną wysłane bez oczekiwania.' : 'Pomiary będą wysyłane w wybranych odstępach.'}</p>}
          <button type="submit" className="admin-primary" disabled={busy || loading || activeRuns.length >= 4 || !series.length}>{busy ? 'Trwa uruchamianie…' : activeRuns.length >= 4 ? 'Osiągnięto limit 4 symulacji' : '▶ Rozpocznij symulację'}</button>
        </form>
      </section>

      <div className="admin-stack">
        <section className="admin-card sim-status" aria-labelledby="current-sim-heading">
          <div className="admin-card-head">
            <h2 id="current-sim-heading">Aktywne symulacje</h2>
            <span className="admin-counter">{activeRuns.length} / 4</span>
          </div>
          {activeRuns.length === 0 && <p className="admin-empty">Brak aktywnych symulacji.</p>}
          <div className="sim-history-list">
            {activeRuns.map(/** Renderuje przycisk filtra z aktualnym stanem aria-pressed. */ run => <div key={run.id} className="sim-active-card">
              <div className="admin-card-head">
                <div><strong>Symulacja #{run.id}</strong><p className="admin-helper">{series.find(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ s => String(s.id) === String(run.seriesId))?.name || 'Seria ' + run.seriesId}</p></div>
                <span className="sim-state sim-running">{stateLabels[run.state]}</span>
              </div>
              <div className="sim-stat-line"><span>Przyjęte / wszystkie</span><strong>{run.acceptedCount} / {run.parameters.count}</strong></div>
              <div className="sim-stat-line"><span>Odrzucone</span><strong>{run.rejectedCount}</strong></div>
              <div className="sim-stat-line"><span>Źródło</span><strong>{run.parameters.pattern === 'observed' ? 'METAR ' + (run.parameters.station ?? '') : run.parameters.pattern === 'sine' ? 'Sinusoida' : 'Losowe'} · {run.parameters.mode === 'live' ? 'Live' : 'Historyczne'}</strong></div>
              <div className="sim-progress" role="progressbar" aria-label={'Postęp symulacji ' + run.id} aria-valuemin={0} aria-valuemax={run.parameters.count} aria-valuenow={Math.min(run.parameters.count, run.acceptedCount + run.rejectedCount)}><span style={{width: Math.min(100, 100 * (run.acceptedCount + run.rejectedCount) / run.parameters.count) + '%'}}/></div>
              {run.error && <p className="form-message error" role="alert">{run.error}</p>}
              <div className="sim-actions">
                <button className="admin-danger" type="button" disabled={busy || run.state === 'stopping'} onClick={/** Zleca zatrzymanie wskazanego zadania bez blokowania obsługi zdarzenia React. */ () => {void stop(run.id);}}>■ Zatrzymaj #{run.id}</button>
                <button className="admin-minor" type="button" onClick={onOpenDashboard}>Otwórz wykres →</button>
              </div>
            </div>)}
          </div>
        </section>
        <section className="admin-card" aria-labelledby="history-sim-heading">
          <div className="admin-card-head"><h2 id="history-sim-heading">Historia symulacji</h2><span className="admin-counter">{runs.length}</span></div>
          {loading && <p className="loading-text" role="status">Ładowanie symulacji…</p>}
          {!loading && runs.length === 0 && <p className="admin-empty">Nie uruchomiono jeszcze żadnej symulacji.</p>}
          <div className="sim-history-list">
            {runs.slice(0, 8).map(/** Renderuje rekord listy wraz z opisem, stanem i dostępnymi akcjami. */ run => <div className="sim-history-row" key={run.id}>
              <div><strong>Symulacja #{run.id}</strong><span>{series.find(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ s => String(s.id) === String(run.seriesId))?.name || 'Seria ' + run.seriesId} · {dateLabel(run.startedAt)}{run.parameters.pattern === 'observed' ? ' · AWC METAR ' + (run.parameters.station ?? '') : ''}</span></div>
              <div><span className={'sim-state ' + (runningStates.includes(run.state) ? 'sim-running' : run.state === 'failed' ? 'sim-failed' : '')}>{stateLabels[run.state]}</span><small>Przyjęte: {run.acceptedCount} · Odrzucone: {run.rejectedCount}</small></div>
              {run.error && <p className="sim-error-text">{run.error}</p>}
            </div>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
}
