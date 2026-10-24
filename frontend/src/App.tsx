import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Measurement, Series } from './api/client';
import roverHero from './assets/rover-hero.svg';
import { useAdminSession } from './features/admin/useAdminSession';
import { AdminPanel, type AdminView } from './features/admin/AdminPanel';
import { Icon } from './components/Icon';
import { Sidebar } from './components/Sidebar';
import { SimulationPanel } from './features/admin/SimulationPanel';
import { TelemetryChart } from './features/dashboard/TelemetryChart';
import { MeasurementHistory } from './features/dashboard/MeasurementHistory';
import { formatDate, formatShortTime, formatValue } from './features/dashboard/formatting';
import { useTelemetry } from './features/dashboard/useTelemetry';
import './styles/app.css';

type TimeRange = 'all' | '24h' | '7d' | '30d' | 'custom';

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: 'all', label: 'Całość' }, { value: '24h', label: '24 h' },
  { value: '7d', label: '7 dni' }, { value: '30d', label: '30 dni' },
];

const previewSeries: Series[] = [
  { id: 'demo-1', name: 'Temperatura modułu', minValue: -30, maxValue: 60, unit: '°C', color: '#e7a679' },
  { id: 'demo-2', name: 'Wilgotność względna', minValue: 0, maxValue: 100, unit: '%', color: '#78b8ac' },
  { id: 'demo-3', name: 'Napięcie akumulatora', minValue: 0, maxValue: 24, unit: 'V', color: '#d6c18f' },
];

/** Podgląd jest dostępny wyłącznie w Vite DEV; te próbki nie trafiają do API ani bazy. */
function createPreviewMeasurements(): Measurement[] {
  const start = Date.now() - 2 * 60 * 60 * 1000;
  const rows: Measurement[] = [];
  for (let i = 0; i < 24; i += 1) {
    const timestamp = new Date(start + i * 5 * 60_000).toISOString();
    const values = [
      12 + Math.sin(i / 3) * 7 + Math.cos(i / 2) * 2,
      48 + Math.sin(i / 4 + 2) * 15,
      16 + Math.cos(i / 5) * 1.8,
    ];
    previewSeries.forEach((series, index) => rows.push({
      id: 'preview-' + index + '-' + i,
      seriesId: series.id,
      value: Number(values[index].toFixed(2)),
      timestamp,
    }));
  }
  return rows.reverse();
}

const previewMeasurements = createPreviewMeasurements();

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function App() {
  const [preview, setPreview] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState<TimeRange>('all');
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [customDates, setCustomDates] = useState<{ from?: string; to?: string }>({});
  const [dateError, setDateError] = useState('');
  const [chartMode, setChartMode] = useState<'percent' | 'raw'>('percent');
  const [rawSeriesId, setRawSeriesId] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const { status, setStatus, error, liveSeries, liveMeasurements, latestBySeries, latestErrors, now } =
    useTelemetry({ preview, reload, setReload, range, customDates, hidden });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 940px)').matches);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebarElement = useRef<HTMLElement>(null);
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 940px)');
    const update = () => { setCompact(breakpoint.matches); setMenuOpen(false); };
    breakpoint.addEventListener('change', update);
    return () => breakpoint.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!compact || !menuOpen) return;
    const sidebar = sidebarElement.current;
    sidebar?.querySelector<HTMLElement>('a[href], button:not(:disabled)')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => menuButton.current?.focus());
      }
      if (event.key !== 'Tab' || !sidebar) return;
      const tabbables = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)'));
      if (!tabbables.length) return;
      if (event.shiftKey && document.activeElement === tabbables[0]) { event.preventDefault(); tabbables[tabbables.length - 1]?.focus(); }
      if (!event.shiftKey && document.activeElement === tabbables[tabbables.length - 1]) { event.preventDefault(); tabbables[0]?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [compact, menuOpen]);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [screen, setScreen] = useState<'dashboard' | AdminView | 'simulations'>('dashboard');
  const showLogin = useCallback(() => setScreen('account'), []);
  const { session, login, logout, clear } = useAdminSession(showLogin);
  const onLogin = useCallback((token: string, expiresIn: number) => {
    login(token, expiresIn);
    setScreen('series');
  }, [login]);
  const onUnauthorized = useCallback(() => {
    clear();
    showLogin();
  }, [clear, showLogin]);
  const onSeriesChanged = useCallback(() => { setReload(value => value + 1); }, []);
  const onLogout = useCallback(() => {
    logout();
    setScreen('dashboard');
  }, [logout]);
  function openAdmin(view: AdminView | 'simulations') {
    setScreen(view);
    setMenuOpen(false);
    if (preview) { setPreview(false); setStatus('loading'); setReload(value => value + 1); }
  }
  function openDashboard() {
    setScreen('dashboard');
    setMenuOpen(false);
  }
  useEffect(() => {
    if (screen !== 'dashboard') return;
    const anchor = window.location.hash.replace('#', '');
    if (!['dashboard', 'telemetry', 'records'].includes(anchor)) return;
    const frame = window.requestAnimationFrame(() => scrollToSection(anchor));
    return () => window.cancelAnimationFrame(frame);
  }, [screen]);

  useEffect(() => {
    if (screen !== 'dashboard') return;
    let frame = 0;
    const updateSection = () => {
      frame = 0;
      const sections = ['dashboard', 'telemetry', 'records'];
      const threshold = Math.min(window.innerHeight * .25, 160);
      let current = 'dashboard';
      for (const id of sections) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= threshold) current = id;
      }
      // Historia staje sie aktywna takze po dotarciu do konca strony.
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = 'records';
      }
      setActiveSection(current);
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateSection);
    };
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    const observer = new ResizeObserver(scheduleUpdate);
    const main = document.getElementById('dashboard');
    if (main) observer.observe(main);
    scheduleUpdate();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer.disconnect();
    };
  }, [screen]);

  const series = preview ? previewSeries : liveSeries;
  const measurements = preview ? previewMeasurements : liveMeasurements;
  const visibleSeries = useMemo(() => series.filter(item => !hidden.includes(String(item.id))), [series, hidden]);
  const timeFiltered = useMemo(() => {
    if (range === 'all') return measurements;
    if (range === 'custom') {
      const from = customDates.from ? Date.parse(customDates.from) : -Infinity;
      const to = customDates.to ? Date.parse(customDates.to) : Infinity;
      return measurements.filter(item => {
        const stamp = Date.parse(item.timestamp);
        return stamp >= from && stamp <= to;
      });
    }
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    const cutoff = now - days * 86_400_000;
    return measurements.filter(item => new Date(item.timestamp).getTime() >= cutoff);
  }, [measurements, range, customDates, now]);
  const filtered = useMemo(
    () => timeFiltered.filter(item => visibleSeries.some(s => String(s.id) === String(item.seriesId))),
    [timeFiltered, visibleSeries],
  );
  const lastMeasurement = measurements[0];

  const activeSelected = filtered.some(item => String(item.id) === selectedId) ? selectedId : null;
  const chartSeries = chartMode === 'raw' ?
    visibleSeries.filter(item => String(item.id) === (visibleSeries.some(s => String(s.id) === rawSeriesId) ? rawSeriesId : String(visibleSeries[0]?.id))) : visibleSeries;
  function toggleSeries(id: string) {
    setHidden(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
    setSelectedId(null);
  }
  function enablePreview() {
    setPreview(true);
    setSelectedId(null);
    setRange('all');
    setHidden([]);
  }
  function returnToApi() {
    setPreview(false);
    setStatus('loading');
    setSelectedId(null);
    setReload(value => value + 1);
  }
  const isReady = status === 'ready';
  function applyDates(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const from = draftFrom ? new Date(draftFrom).valueOf() : undefined;
    const to = draftTo ? new Date(draftTo).valueOf() : undefined;
    if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to)) ||
        (from !== undefined && to !== undefined && from > to) || (!draftFrom && !draftTo)) {
      setDateError('Wybierz poprawne daty. Początek musi być wcześniejszy niż koniec.');
      return;
    }
    setDateError('');
    setCustomDates({ ...(from !== undefined ? { from: new Date(from).toISOString() } : {}),
      ...(to !== undefined ? { to: new Date(to).toISOString() } : {}) });
    setRange('custom');
    setSelectedId(null);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#dashboard">Przejdź do głównej treści</a>
      <button className={'scrim ' + (menuOpen ? 'is-open' : '')} aria-label="Zamknij menu" tabIndex={-1} onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }} />
      <Sidebar
        sidebarElement={sidebarElement}
        menuOpen={menuOpen}
        compact={compact}
        signedIn={Boolean(session)}
        screen={screen}
        activeSection={activeSection}
        onDashboardSection={section => {
          setActiveSection(section);
          openDashboard();
        }}
        onAdminSection={openAdmin}
        onLogout={() => { onLogout(); setMenuOpen(false); }}
      />
      <div className="workspace" inert={compact && menuOpen} aria-hidden={compact && menuOpen}>
        {screen === 'dashboard' && <div className="dashboard-landscape" aria-hidden="true"><img src={roverHero} alt=""/></div>}
        <button ref={menuButton} className="mobile-menu" type="button" aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'} aria-controls="mission-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon name="menu"/></button>
        <main className="main-content" id="dashboard" tabIndex={-1}>
          {screen === 'simulations' && session ? (
            <SimulationPanel token={session.token} onUnauthorized={onUnauthorized} onMeasurementsChanged={onSeriesChanged} onOpenDashboard={() => { openDashboard(); setReload(value => value + 1); }}/>
          ) : screen !== 'dashboard' ? (
            <AdminPanel view={screen === 'simulations' ? 'account' : screen} token={session?.token ?? null} onLogin={onLogin} onLogout={onLogout} onUnauthorized={onUnauthorized} onSeriesChanged={onSeriesChanged}/>
          ) : (<>
          <div className="page-intro">
            <h1>Pulpit</h1>
          </div>
          {preview && <div className="notice" role="status"><strong>Tryb podglądu UI.</strong> Wyświetlane wartości są wygenerowane lokalnie i nie zostały zapisane w bazie. <button type="button" onClick={returnToApi}>Wróć do danych API</button></div>}
          {status === 'error' && !preview && <div className="notice error" role="alert">Nie udało się połączyć z API: {error}. Uruchom lokalny backend lub sprawdź połączenie. {import.meta.env.DEV && <button type="button" onClick={enablePreview}>Włącz podgląd interfejsu</button>}</div>}
          <section className="metric-grid" aria-label="Podsumowanie pomiarów">
            <div className="metric-card"><span className="metric-icon"><Icon name="layers"/></span><div className="metric-body"><span className="metric-label">Serie pomiarowe</span><strong className="metric-value">{isReady ? series.length : '—'}</strong></div></div>
            <div className="metric-card"><span className="metric-icon teal"><Icon name="activity"/></span><div className="metric-body"><span className="metric-label" title="Liczba wczytanych pomiarów, maksymalnie 1000 w jednym zapytaniu">Wczytane pomiary</span><strong className="metric-value">{isReady ? measurements.length : '—'}</strong></div></div>
            <div className="metric-card"><span className="metric-icon"><Icon name="clock"/></span><div className="metric-body"><span className="metric-label">Ostatni odczyt</span><strong className="metric-value metric-time" title={lastMeasurement && isReady ? 'Czas UTC: ' + formatDate(lastMeasurement.timestamp) : undefined}>{lastMeasurement && isReady ? formatShortTime(lastMeasurement.timestamp) : '—'}</strong></div></div>
          </section>
          <div className="content-grid">
            <section id="telemetry" className="panel" aria-labelledby="chart-heading">
              <div className="panel-heading">
                <div><h2 id="chart-heading">Wykres pomiarów</h2></div>
                <div className="panel-controls">
                  <div className="range-tabs" role="group" aria-label="Zakres czasu">
                    {timeRanges.map(option => <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => { setRange(option.value); setDateError(''); setSelectedId(null) }}>{option.label}</button>)}
                  </div>
                  <button className="icon-button" aria-label="Odśwież pomiary" title="Odśwież pomiary" type="button" onClick={() => { if (!preview) { setStatus('loading'); setReload(value => value + 1); } }} disabled={preview || status === 'loading'}><Icon name="refresh" size={15}/></button>
                </div>
              </div>
              <form className="date-range-form" onSubmit={applyDates} aria-label="Własny przedział dat">
                <label>Od <input type="datetime-local" aria-label="Od (czas lokalny)" value={draftFrom} onChange={event => setDraftFrom(event.target.value)}/></label>
                <label>Do <input type="datetime-local" aria-label="Do (czas lokalny)" value={draftTo} onChange={event => setDraftTo(event.target.value)}/></label>
                <button className="section-action date-apply" type="submit">Zastosuj daty</button>
                <span className="date-help">Daty w czasie lokalnym</span>
                {dateError && <p className="date-error" role="alert">{dateError}</p>}
              </form>
              <div className="series-toggles" role="group" aria-label="Widoczne serie">
                {series.map((item, index) => <button key={String(item.id)} className="series-toggle" type="button" aria-pressed={!hidden.includes(String(item.id))} onClick={() => toggleSeries(String(item.id))}><span className="legend-dot" style={{ backgroundColor: item.color }}/><span className={'series-glyph style-' + (index % 4)} aria-hidden="true"/> {item.name}</button>)}
              </div>
              <div className="chart-mode-controls">
                <div className="range-tabs" role="group" aria-label="Rodzaj skali wykresu">
                  <button type="button" aria-pressed={chartMode === 'percent'} onClick={() => setChartMode('percent')}>Porównanie %</button>
                  <button type="button" aria-pressed={chartMode === 'raw'} onClick={() => setChartMode('raw')}>Wartości rzeczywiste</button>
                </div>
                {chartMode === 'raw' && <label className="raw-series-select">Seria <select aria-label="Seria do wykresu rzeczywistych wartości" value={visibleSeries.some(s => String(s.id) === rawSeriesId) ? rawSeriesId : String(visibleSeries[0]?.id ?? '')} onChange={event => setRawSeriesId(event.target.value)}>{visibleSeries.map(item => <option key={String(item.id)} value={String(item.id)}>{item.name} ({item.unit || 'bez jednostki'})</option>)}</select></label>}
              </div>
              {status === 'loading' && !preview ? <div className="loading-text" role="status">Pobieranie danych telemetrycznych…</div> :
                !isReady || series.length === 0 ? <div className="empty-chart"><Icon name="database" size={28}/><strong>Nie ma jeszcze serii pomiarowych</strong><span>Dodaj serie i prześlij pomiary przez API. {import.meta.env.DEV && !preview ? <button type="button" className="section-action" onClick={enablePreview}>Zobacz przykładowy wygląd</button> : null}</span></div> :
                  <TelemetryChart series={chartSeries} allSeries={series} measurements={filtered} selectedId={activeSelected} raw={chartMode === 'raw'}/>}
              <div className="chart-foot"><span>{chartMode === 'raw' ? 'Wartości w jednostkach wybranej serii' : 'Wartości jako % zakresu serii'} · czas UTC</span></div>
            </section>
            <aside className="panel signal-panel" id="series" aria-labelledby="series-heading">
              <div className="panel-heading"><h2 id="series-heading">Ostatnie wartości serii</h2></div>
              <div className="signal-list">
                {series.length === 0 ? <p className="signal-empty">{status === 'loading' ? 'Wczytywanie serii…' : 'Brak serii do wyświetlenia.'}</p> : series.map(item => {
                  const last = preview
                    ? previewMeasurements.find(point => String(point.seriesId) === String(item.id))
                    : latestBySeries[String(item.id)];
                  const failed = !preview && latestErrors[String(item.id)];
                  return <div key={String(item.id)} className="signal-item">
                    <div className="signal-item-main">
                      <strong>{item.name}</strong>
                      {failed && <span className="signal-error" role="status">Błąd odczytu — ponawianie{last ? ' (poprzednia wartość)' : ''}</span>}
                    </div>
                    <span className="signal-item-value" style={{ color: item.color }}>{last ? formatValue(last.value) : failed ? '—' : last === null ? 'Brak odczytów' : '…'} <small>{item.unit || ''}</small></span>
                  </div>;
                })}
              </div>

            </aside>
          </div>
          <MeasurementHistory
            series={series}
            visibleSeries={visibleSeries}
            filtered={filtered}
            selectedId={activeSelected}
            onSelect={(id, seriesId) => {
              setSelectedId(id);
              if (chartMode === 'raw') setRawSeriesId(seriesId);
            }}
            chartMode={chartMode}
            range={range}
            customDates={customDates}
            preview={preview}
            loading={status === 'loading'}
          />
          <footer className="footer"><span>RoverSense</span></footer>
          </>)}
        </main>
      </div>
    </div>
  );
}

export default App;
