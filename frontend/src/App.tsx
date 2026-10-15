import { useEffect, useState } from 'react';
import { fetchHealth, fetchSeries, type Series } from './api/client';
import './styles/app.css';

type LoadingState = 'loading' | 'ok' | 'error';

function App() {
  const [status, setStatus] = useState<LoadingState>('loading');
  const [series, setSeries] = useState<Series[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const health = await fetchHealth(controller.signal);
        if (health.status !== 'ok') throw new Error('Serwer nie jest gotowy');
        setStatus('ok');
        setSeries(await fetchSeries(controller.signal));
      } catch (reason) {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych');
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">R</div>
        <div className="brand">
          <strong>RoverSense</strong>
          <span>Monitoring telemetrii</span>
        </div>
        <div className={`connection ${status}`} role="status">
          <span className="status-dot" aria-hidden="true" />
          {status === 'loading' ? 'Łączenie z API' : status === 'ok' ? 'API dostępne' : 'Brak połączenia'}
        </div>
      </header>
      <main className="container">
        <p className="eyebrow">CENTRUM MONITOROWANIA</p>
        <h1>Telemetria czujników</h1>
        <p className="introduction">Podgląd serii pomiarowych zarejestrowanych w systemie.</p>
        <section className="overview" aria-label="Podsumowanie">
          <div className="metric"><span>Stan usługi</span><strong>{status === 'ok' ? 'Online' : status === 'loading' ? 'Sprawdzanie' : 'Niedostępna'}</strong></div>
          <div className="metric"><span>Liczba serii</span><strong>{status === 'ok' ? series.length : '—'}</strong></div>
          <div className="metric"><span>Źródło danych</span><strong>TimescaleDB</strong></div>
        </section>
        <section className="content-panel" aria-labelledby="series-title">
          <div className="section-heading">
            <div><p className="eyebrow">BAZA POMIAROWA</p><h2 id="series-title">Zarejestrowane serie</h2></div>
            <span className="section-count">{series.length} serii</span>
          </div>
          {status === 'error' ? (
            <p className="notice error" role="alert">Nie udało się pobrać danych: {error}. Sprawdź, czy API i baza danych działają.</p>
          ) : status === 'loading' ? (
            <p className="notice" role="status">Pobieranie informacji z serwera…</p>
          ) : series.length === 0 ? (
            <div className="empty-state"><span className="empty-icon" aria-hidden="true">◌</span><h3>Brak zarejestrowanych serii</h3><p>Po utworzeniu pierwszej serii pojawi się ona w tym miejscu.</p></div>
          ) : (
            <div className="table-wrap"><table><thead><tr><th scope="col">Seria</th><th scope="col">Zakres minimalny</th><th scope="col">Zakres maksymalny</th></tr></thead><tbody>
              {series.map(item => <tr key={item.id}><td><span className="series-dot" style={{ backgroundColor: item.color }} aria-hidden="true" />{item.name}</td><td>{item.minValue}</td><td>{item.maxValue}</td></tr>)}
            </tbody></table></div>
          )}
        </section>
      </main>
      <footer>RoverSense · System pomiarowy</footer>
    </div>
  );
}

export default App;
