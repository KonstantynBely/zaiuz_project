import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Series } from '../../api/client';
import { adminApi, ApiRequestError, type Simulation, type SimulationInput, type SimulationState } from '../../api/admin';

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
const dateLabel = (date: string | null) => date ? new Date(date).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
const describe = (error: unknown) => {
  if (error instanceof ApiRequestError) return error.message;
  return 'Nie udało się połączyć z API.';
};

export function SimulationPanel({ token, onUnauthorized, onMeasurementsChanged, onOpenDashboard }: Props) {
  const [series, setSeries] = useState<Series[]>([]);
  const [runs, setRuns] = useState<Simulation[]>([]);
  const [seriesId, setSeriesId] = useState('');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'history' | 'live'>('live');
  const [pattern, setPattern] = useState<'random' | 'sine'>('random');
  const [count, setCount] = useState('30');
  const [intervalMs, setIntervalMs] = useState('1000');
  const [minimum, setMinimum] = useState('');
  const [maximum, setMaximum] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const selectedSeries = useMemo(() => series.find(item => String(item.id) === seriesId), [series, seriesId]);
  const active = useMemo(() => runs.find(run => runningStates.includes(run.state)), [runs]);

  const load = useCallback(async (includeSeries: boolean, showLoading: boolean) => {
    if (showLoading) setLoading(true);
    try {
      const [loadedSeries, loadedRuns] = await Promise.all([
        includeSeries ? adminApi.listSeries() : Promise.resolve(null),
        adminApi.listSimulations(token),
      ]);
      if (loadedSeries) setSeries(loadedSeries);
      setRuns(loadedRuns);
      setLastRefresh(new Date());
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) { onUnauthorized(); return; }
      setError(describe(reason));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void load(true, true);
    // Wersja REST pollingu pokazuje status i liczniki również bez SSE.
    const timer = window.setInterval(() => { void load(false, false); }, 2500);
    return () => window.clearInterval(timer);
  }, [load]);

  function chooseSeries(id: string) {
    setSeriesId(id);
    const target = series.find(item => String(item.id) === id);
    setMinimum(target ? String(target.minValue) : '');
    setMaximum(target ? String(target.maxValue) : '');
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const min = Number(minimum);
    const max = Number(maximum);
    const parsedCount = Number(count);
    const parsedInterval = Number(intervalMs);
    if (!selectedSeries) { setError('Wybierz istniejącą serię.'); return; }
    if (!Number.isFinite(min) || !Number.isFinite(max) || minimum.trim() === '' || maximum.trim() === '' ||
      min >= max || min < selectedSeries.minValue || max > selectedSeries.maxValue) {
      setError('Zakres symulacji musi mieścić się w granicach wybranej serii, a minimum być mniejsze od maksimum.');
      return;
    }
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 1000 ||
      !Number.isInteger(parsedInterval) || parsedInterval < 200 || parsedInterval > 60000) {
      setError('Liczba pomiarów: 1–1000. Interwał: 200–60000 ms.');
      return;
    }
    const input: SimulationInput = {
      seriesId, mode, pattern, count: parsedCount, intervalMs: parsedInterval,
      min, max, ...(name.trim() ? { name: name.trim() } : {}),
    };
    setBusy(true); setError(''); setNotice('');
    try {
      const run = await adminApi.startSimulation(token, input);
      setRuns(previous => [run, ...previous.filter(item => item.id !== run.id)]);
      setNotice('Uruchomiono symulację. Pomiarów szukaj na publicznym dashboardzie.');
      void load(false, false);
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(describe(reason));
    } finally { setBusy(false); }
  }

  async function stop(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const run = await adminApi.stopSimulation(token, id);
      setRuns(previous => previous.map(item => item.id === run.id ? run : item));
      setNotice('Zatrzymano symulację. Zapisane wcześniej pomiary pozostały w bazie.');
      onMeasurementsChanged();
      void load(false, false);
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(describe(reason));
    } finally { setBusy(false); }
  }

  return <div className="admin-view simulation-view">
    <div className="admin-heading">
      <p className="eyebrow">MISSION CONTROL / TRANSMISJA</p>
      <h1>Symulatory czujników</h1>
      <p>Uruchamiaj źródła danych w backendzie. Każda symulacja automatycznie rejestruje swój czujnik i przekazuje pomiary przez REST API.</p>
    </div>
    {error && <p role="alert" className="form-message error">{error}</p>}
    {notice && <p role="status" className="form-message success">{notice}</p>}
    <div className="sim-layout">
      <section className="admin-card sim-configuration" aria-labelledby="simulation-form-heading">
        <span className="admin-card-kicker">PARAMETRY MISJI</span>
        <h2 id="simulation-form-heading">Nowa symulacja</h2>
        <p className="admin-description">Jeden aktywny symulator jednocześnie. Klucz API pozostaje wyłącznie na serwerze.</p>
        <form className="admin-form" onSubmit={start}>
          <label htmlFor="sim-series">Seria pomiarowa</label>
          <select id="sim-series" required value={seriesId} onChange={event => chooseSeries(event.target.value)} disabled={busy || !!active}>
            <option value="">Wybierz serię</option>
            {series.map(item => <option key={String(item.id)} value={String(item.id)}>{item.name} ({item.unit || 'bez jednostki'})</option>)}
          </select>
          <label htmlFor="sim-name">Nazwa czujnika (opcjonalna)</label>
          <input id="sim-name" maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={busy || !!active} placeholder="Np. symulator temperatury"/>
          <div className="admin-field-grid">
            <div><label htmlFor="sim-mode">Tryb transmisji</label><select id="sim-mode" value={mode} onChange={event => setMode(event.target.value as 'history' | 'live')} disabled={busy || !!active}><option value="live">Live — wysyłka w odstępach</option><option value="history">Historyczny — import serii</option></select></div>
            <div><label htmlFor="sim-pattern">Algorytm</label><select id="sim-pattern" value={pattern} onChange={event => setPattern(event.target.value as 'random' | 'sine')} disabled={busy || !!active}><option value="random">Losowy</option><option value="sine">Sinusoida</option></select></div>
          </div>
          <div className="admin-field-grid">
            <div><label htmlFor="sim-min">Minimum wartości</label><input id="sim-min" type="number" step="any" value={minimum} onChange={event => setMinimum(event.target.value)} required disabled={busy || !!active}/></div>
            <div><label htmlFor="sim-max">Maksimum wartości</label><input id="sim-max" type="number" step="any" value={maximum} onChange={event => setMaximum(event.target.value)} required disabled={busy || !!active}/></div>
          </div>
          <div className="admin-field-grid">
            <div><label htmlFor="sim-count">Liczba pomiarów</label><input id="sim-count" type="number" min={1} max={1000} step={1} required value={count} onChange={event => setCount(event.target.value)} disabled={busy || !!active}/></div>
            <div><label htmlFor="sim-interval">Interwał (ms)</label><input id="sim-interval" type="number" min={200} max={60000} step={1} required value={intervalMs} onChange={event => setIntervalMs(event.target.value)} disabled={busy || !!active}/></div>
          </div>
          <p className="admin-helper">{mode === 'history' ? 'Tryb historyczny wysyła próbki bez przerw, nadając im daty z przeszłości. Interwał oznacza odstęp między ich znacznikami czasu.' : 'Tryb live wysyła kolejne pomiary co wybrany interwał, z bieżącym czasem serwera.'}</p>
          <button type="submit" className="admin-primary" disabled={busy || loading || !!active || !series.length}>{busy ? 'Trwa uruchamianie…' : active ? 'Zatrzymaj obecną symulację przed startem' : '▶ Rozpocznij symulację'}</button>
        </form>
      </section>

      <div className="admin-stack">
        <section className="admin-card sim-status" aria-labelledby="current-sim-heading">
          <div className="admin-card-head"><div><span className="admin-card-kicker">TELEMETRIA / STATUS</span><h2 id="current-sim-heading">Bieżące zadanie</h2></div><span className={'sim-state ' + (active ? 'sim-running' : '')}>{active ? stateLabels[active.state] : 'Brak aktywnego'}</span></div>
          {active ? <div>
            <div className="sim-stat-line"><span>Seria</span><strong>{series.find(s => String(s.id) === String(active.seriesId))?.name || active.seriesId}</strong></div>
            <div className="sim-stat-line"><span>Przyjęte pomiary</span><strong>{active.acceptedCount} / {active.parameters.count}</strong></div>
            <div className="sim-stat-line"><span>Odrzucone pomiary</span><strong>{active.rejectedCount}</strong></div>
            <div className="sim-stat-line"><span>Tryb</span><strong>{active.parameters.mode === 'live' ? 'Live' : 'Historyczny'}</strong></div>
            <div className="sim-progress" role="progressbar" aria-label="Przesłane próbki" aria-valuemin={0} aria-valuemax={active.parameters.count} aria-valuenow={Math.min(active.parameters.count, active.acceptedCount + active.rejectedCount)}><span style={{width: Math.min(100, 100 * (active.acceptedCount + active.rejectedCount) / active.parameters.count) + '%'}}/></div>
            {active.error && <p className="form-message error" role="alert">{active.error}</p>}
            <div className="sim-actions"><button className="admin-danger" type="button" disabled={busy || active.state === 'stopping'} onClick={() => {void stop(active.id);}}>{busy ? 'Zatrzymywanie…' : '■ Zatrzymaj'}</button><button className="admin-minor" type="button" onClick={onOpenDashboard}>Otwórz wykres →</button></div>
          </div> : <><p className="admin-empty">Wybierz serię i uruchom symulator, aby śledzić postęp pomiarów.</p><button className="admin-minor" type="button" onClick={onOpenDashboard}>Zobacz dashboard →</button></>}
          <p className="sim-refresh">Status odświeżany co 2,5 s{lastRefresh ? ' · ' + lastRefresh.toLocaleTimeString('pl-PL') : ''}</p>
        </section>
        <section className="admin-card" aria-labelledby="history-sim-heading">
          <div className="admin-card-head"><div><span className="admin-card-kicker">ARCHIWUM MISJI</span><h2 id="history-sim-heading">Ostatnie uruchomienia</h2></div><span className="admin-counter">{runs.length}</span></div>
          {loading && <p className="loading-text" role="status">Ładowanie symulacji…</p>}
          {!loading && runs.length === 0 && <p className="admin-empty">Nie uruchomiono jeszcze żadnej symulacji.</p>}
          <div className="sim-history-list">
            {runs.slice(0, 8).map(run => <div className="sim-history-row" key={run.id}>
              <div><strong>Symulacja #{run.id}</strong><span>{series.find(s => String(s.id) === String(run.seriesId))?.name || 'Seria ' + run.seriesId} · {dateLabel(run.startedAt)}</span></div>
              <div><span className={'sim-state ' + (runningStates.includes(run.state) ? 'sim-running' : run.state === 'failed' ? 'sim-failed' : '')}>{stateLabels[run.state]}</span><small>{run.acceptedCount} OK / {run.rejectedCount} błędów</small></div>
              {run.error && <p className="sim-error-text">{run.error}</p>}
            </div>)}
          </div>
        </section>
      </div>
    </div>
  </div>;
}
