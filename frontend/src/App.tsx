import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchHealth, fetchMeasurements, fetchSeries, type Measurement, type Series } from './api/client';
import roverHero from './assets/rover-hero.svg';
import { adminApi } from './api/admin';
import { AdminPanel, type AdminView } from './features/admin/AdminPanel';
import './styles/app.css';

type LoadState = 'loading' | 'ready' | 'error';
type TimeRange = 'all' | '24h' | '7d' | '30d';
type IconName = 'dashboard' | 'chart' | 'layers' | 'radio' | 'clock' | 'settings' | 'refresh' | 'arrow' | 'menu' | 'activity' | 'database' | 'planet' | 'signal' | 'print' | 'lock';

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

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></>,
    chart: <><path d="M3 20V4M3 20h18"/><path d="m6 15 4-5 4 3 6-8"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    radio: <><circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16m16-16a11 11 0 0 1 0 16"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 12-3L20 12M4 12l2.4 6a7 7 0 0 0 12-3"/></>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    activity: <><path d="M2 12h5l3-8 4 16 3-8h5"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>,
    planet: <><circle cx="12" cy="12" r="6"/><path d="M2 15c3 3 17 1 20-6"/></>,
    signal: <><path d="M3 19v-3m6 3v-7m6 7V8m6 11V4"/></>,
    print: <><path d="M6 9V3h12v6M6 17H4V9h16v8h-2M6 14h12v7H6z"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function formatDate(value: string) {
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? '—' :
    new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(time) + ' UTC';
}
function formatShortTime(value: string) {
  const time = new Date(value);
  return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(time);
}
function formatValue(value: number) {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value);
}
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface ChartPoint {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: string;
}

/** Serie o różnych jednostkach pokazujemy jako % ich indywidualnego zakresu min/max. */
function TelemetryChart({ series, measurements, selectedId }: {
  series: Series[]; measurements: Measurement[]; selectedId: string | null;
}) {
  const width = 880, height = 275;
  const left = 52, right = 20, top = 21, bottom = 36;
  const values = measurements.filter(measurement => series.some(s => String(s.id) === String(measurement.seriesId)));
  if (values.length === 0) {
    return <div className="empty-chart"><Icon name="activity" size={27}/><strong>Brak pomiarów w wybranym zakresie</strong><span>Wybierz inne serie lub przedział czasu.</span></div>;
  }
  const stamps = values.map(p => new Date(p.timestamp).valueOf()).filter(Number.isFinite);
  const minTime = Math.min(...stamps);
  const maxTime = Math.max(...stamps);
  const span = Math.max(1, maxTime - minTime);
  const plotW = width - left - right, plotH = height - top - bottom;
  const pointSets: { series: Series; points: ChartPoint[] }[] = series.map(item => ({
    series: item,
    points: values
      .filter(p => String(p.seriesId) === String(item.id))
      .map(p => ({
        id: String(p.id), value: p.value, timestamp: p.timestamp,
        x: left + (new Date(p.timestamp).valueOf() - minTime) / span * plotW,
        y: top + (1 - Math.min(1, Math.max(0, (p.value - item.minValue) / (item.maxValue - item.minValue)))) * plotH,
      }))
      .sort((a, b) => a.x - b.x),
  }));
  const active = pointSets.flatMap(group => group.points).find(point => point.id === selectedId);
  const labelFor = (part: number) => formatShortTime(new Date(minTime + part * span).toISOString());
  return (
    <div className="chart-viewport">
      <svg className="telemetry-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label="Wykres procentowych wartości pomiarów względem zakresu każdej serii. Szczegółowe wartości w tabeli poniżej.">
        {[0, .25, .5, .75, 1].map(part => {
          const y = top + part * plotH;
          return <g key={part}><line className="grid-line" x1={left} y1={y} x2={width - right} y2={y}/><text className="grid-label" x={left - 10} y={y + 4} textAnchor="end">{Math.round((1 - part) * 100)}%</text></g>;
        })}
        {[0, .25, .5, .75, 1].map(part => {
          const x = left + part * plotW;
          return <text key={part} className="grid-label" x={x} y={height - 8} textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'}>{labelFor(part)}</text>;
        })}
        {active && <line className="chart-cross" x1={active.x} x2={active.x} y1={top} y2={top + plotH}/>}
        {pointSets.map(group => (
          <g key={String(group.series.id)}>
            {group.points.length > 1 && <path d={group.points.map((point, i) => (i === 0 ? 'M' : 'L') + point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ')} fill="none" stroke={group.series.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>}
            {group.points.map(point => (
              <g key={point.id}>
                {point.id === selectedId && <circle cx={point.x} cy={point.y} r="11" stroke={group.series.color} strokeWidth="2" fill="none" opacity=".65"/>}
                <circle className="chart-point" cx={point.x} cy={point.y} r={point.id === selectedId ? 5 : 2.5} fill={group.series.color} stroke="#1a252a" strokeWidth="1">
                  <title>{group.series.name + ': ' + formatValue(point.value) + ' ' + (group.series.unit || '') + ', ' + formatDate(point.timestamp)}</title>
                </circle>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

function App() {
  const [preview, setPreview] = useState(() => import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview'));
  const [status, setStatus] = useState<LoadState>('loading');
  const [error, setError] = useState('');
  const [liveSeries, setLiveSeries] = useState<Series[]>([]);
  const [liveMeasurements, setLiveMeasurements] = useState<Measurement[]>([]);
  const [reload, setReload] = useState(0);
  const [range, setRange] = useState<TimeRange>('all');
  const [hidden, setHidden] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [screen, setScreen] = useState<'dashboard' | AdminView>('dashboard');
  // Sesja istnieje wyłącznie w pamięci bieżącej karty.
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const onLogin = useCallback((token: string, expiresIn: number) => {
    setSession({ token, expiresAt: Date.now() + expiresIn * 1000 });
    setScreen('series');
  }, []);
  const onUnauthorized = useCallback(() => {
    setSession(null);
    setScreen('account');
  }, []);
  const onSeriesChanged = useCallback(() => { setReload(value => value + 1); }, []);
  const onLogout = useCallback(() => {
    const token = session?.token;
    setSession(null);
    setScreen('dashboard');
    if (token) void adminApi.logout(token).catch(() => {
      // Zamknięcie lokalnej sesji ma pierwszeństwo przy awarii łączności.
    });
  }, [session]);
  useEffect(() => {
    if (!session) return;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) { onUnauthorized(); return; }
    const timeout = window.setTimeout(onUnauthorized, remaining);
    return () => window.clearTimeout(timeout);
  }, [session, onUnauthorized]);
  function openAdmin(view: AdminView) {
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
    const id = window.setInterval(() => setClock(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (preview) { setStatus('ready'); setError(''); return; }
    const controller = new AbortController();
    Promise.all([fetchHealth(controller.signal), fetchSeries(controller.signal), fetchMeasurements(controller.signal)])
      .then(([health, series, measurements]) => {
        if (health.status !== 'ok') throw new Error('Serwer API nie jest gotowy');
        setLiveSeries(series);
        setLiveMeasurements(measurements);
        setStatus('ready');
        setError('');
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych');
      });
    return () => controller.abort();
  }, [preview, reload]);

  const series = preview ? previewSeries : liveSeries;
  const measurements = preview ? previewMeasurements : liveMeasurements;
  const visibleSeries = useMemo(() => series.filter(item => !hidden.includes(String(item.id))), [series, hidden]);
  const timeFiltered = useMemo(() => {
    if (range === 'all') return measurements;
    const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
    const cutoff = Date.now() - days * 86_400_000;
    return measurements.filter(item => new Date(item.timestamp).getTime() >= cutoff);
  }, [measurements, range]);
  const filtered = useMemo(
    () => timeFiltered.filter(item => visibleSeries.some(s => String(s.id) === String(item.seriesId))),
    [timeFiltered, visibleSeries],
  );
  const lastMeasurement = measurements[0];
  const sourceCounts = useMemo(() => new Map(series.map(item => [
    String(item.id), measurements.filter(m => String(m.seriesId) === String(item.id)).length,
  ])), [series, measurements]);
  const activeSelected = filtered.some(item => String(item.id) === selectedId) ? selectedId : null;

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
  const isOnline = isReady && !preview;

  return (
    <div className="app-shell">
      <button className={'scrim ' + (menuOpen ? 'is-open' : '')} aria-label="Zamknij menu" onClick={() => setMenuOpen(false)} />
      <aside className={'sidebar ' + (menuOpen ? 'is-open' : '')} aria-label="Menu aplikacji">
        <a className="brand" href="#dashboard" onClick={openDashboard}>
          <span className="brand-symbol"><Icon name="planet" size={25}/></span>
          <span className="brand-copy"><strong>RoverSense</strong><span>MISSION CONTROL</span></span>
        </a>
        <p className="nav-caption">MONITOROWANIE</p>
        <nav className="side-nav" aria-label="Nawigacja główna">
          <a className={"nav-link " + (screen === "dashboard" ? "active" : "")} href="#dashboard" onClick={openDashboard}><Icon name="dashboard"/>Pulpit misji</a>
          <a className="nav-link" href="#telemetry" onClick={openDashboard}><Icon name="chart"/>Wykres telemetrii</a>
          <a className="nav-link" href="#records" onClick={openDashboard}><Icon name="clock"/>Dziennik pomiarów</a>
        </nav>
        {session && (
          <div className="nav-secondary">
            <p className="nav-caption">ADMINISTRACJA</p>
            <button className={"nav-link " + (screen === "series" ? "active" : "")} type="button" onClick={() => openAdmin("series")}><Icon name="layers"/>Serie pomiarowe</button>
            <button className={"nav-link " + (screen === "sensors" ? "active" : "")} type="button" onClick={() => openAdmin("sensors")}><Icon name="radio"/>Czujniki</button>
            <button className={"nav-link " + (screen === "account" ? "active" : "")} type="button" onClick={() => openAdmin("account")}><Icon name="settings"/>Konto</button>
            <div className="nav-inactive"><Icon name="activity"/>Symulatory · wkrótce</div>
          </div>
        )}
        <div className="sidebar-bottom">
          <span className="mini-label">STACJA KONTROLI</span>
          <strong>RoverSense / Ziemia</strong>
          <span>System monitorowania danych telemetrycznych.</span>
          <div className="signal"><span className={'beacon ' + (!isReady ? 'error' : '')}/><span>{preview ? 'Podgląd lokalny' : isOnline ? 'Połączono z API' : 'Oczekiwanie na API'}</span></div>
          {!session && <button className="sidebar-login-button" type="button" onClick={() => openAdmin('account')}><Icon name="lock" size={15}/> Zaloguj się</button>}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button className="mobile-menu" type="button" aria-label="Otwórz menu" onClick={() => setMenuOpen(value => !value)}><Icon name="menu"/></button>
          <div className="breadcrumb"><span>RoverSense</span><span className="slash">/</span><b>{screen === "dashboard" ? "Pulpit misji" : screen === "series" ? "Serie pomiarowe" : screen === "sensors" ? "Czujniki" : "Konto"}</b></div>
          <div className="topbar-right">
            <span className="utc-time">UTC {new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(clock)}</span>
            <span className={'status-pill ' + (!isReady ? 'offline' : '')}><span className={'beacon ' + (!isReady ? 'error' : '')}/>{preview ? 'PODGLĄD' : isOnline ? 'API ONLINE' : status === 'loading' ? 'ŁĄCZENIE' : 'API OFFLINE'}</span>
          </div>
        </header>
        <main className="main-content" id="dashboard">
          {screen !== 'dashboard' ? (
            <AdminPanel view={screen} token={session?.token ?? null} onLogin={onLogin} onLogout={onLogout} onUnauthorized={onUnauthorized} onSeriesChanged={onSeriesChanged}/>
          ) : (<>
          <div className="page-intro">
            <div><p className="eyebrow">SYSTEM TELEMETRYCZNY / PRZEGLĄD</p><h1>Centrum kontroli misji</h1><p>Stan systemu i odczyty z zarejestrowanych czujników.</p></div>
            <div className="intro-meta"><Icon name="signal" size={15}/><span>DANE UTC</span><span className="outline-tag">MISSION / RS-01</span></div>
          </div>
          {preview && <div className="notice" role="status"><strong>Tryb podglądu UI.</strong> Wyświetlane wartości są wygenerowane lokalnie i nie zostały zapisane w bazie. <button type="button" onClick={returnToApi}>Wróć do danych API</button></div>}
          {status === 'error' && !preview && <div className="notice error" role="alert">Nie udało się połączyć z API: {error}. Uruchom lokalny backend lub sprawdź połączenie. {import.meta.env.DEV && <button type="button" onClick={enablePreview}>Włącz podgląd interfejsu</button>}</div>}
          <section className="hero" aria-label="Przegląd misji RoverSense">
            <div className="hero-visual"><img className="rover-scene" src={roverHero} alt="Ilustracja łazika z sześcioma kołami, masztem kamer i ramieniem robotycznym na Marsie"/></div>
            <div className="hero-copy">
              <span className="hero-kicker">MARS SURFACE OPERATIONS</span>
              <h2>Odkrywaj dane.<br/>Monitoruj każdy sygnał.</h2>
              <p>Jedno centrum obserwacji pomiarów i strumieni danych z czujników — od zapisanej historii po bieżącą telemetrię.</p>
              <div className="hero-actions"><button type="button" className="primary-button" onClick={() => scrollToSection('telemetry')}>Zobacz telemetrię <Icon name="arrow" size={15}/></button><span className="hero-meta">{preview ? 'SYMULOWANE DANE DEMO' : 'ŹRÓDŁO: ROVERSENSE API'}</span></div>
            </div>
            <span className="hero-corner">ROVER / SURFACE UNIT</span>
          </section>
          <section className="metric-grid" aria-label="Podsumowanie telemetrii">
            <div className="metric-card"><span className="metric-icon"><Icon name="layers"/></span><div className="metric-body"><span className="metric-label">Zarejestrowane serie</span><strong className="metric-value">{isReady ? series.length : '—'}</strong><span className="metric-foot">Konfiguracja pomiarów</span></div></div>
            <div className="metric-card"><span className="metric-icon teal"><Icon name="activity"/></span><div className="metric-body"><span className="metric-label">Wczytane pomiary</span><strong className="metric-value">{isReady ? measurements.length : '—'}</strong><span className="metric-foot">Maksymalnie 1000 z API</span></div></div>
            <div className="metric-card"><span className="metric-icon"><Icon name="clock"/></span><div className="metric-body"><span className="metric-label">Ostatni odczyt</span><strong className="metric-value" style={{ fontSize: 19 }}>{lastMeasurement && isReady ? formatShortTime(lastMeasurement.timestamp) : '—'}</strong><span className="metric-foot">{lastMeasurement && isReady ? formatDate(lastMeasurement.timestamp).split(',')[0] + ' UTC' : 'Brak odczytów'}</span></div></div>
            <div className="metric-card"><span className="metric-icon teal"><Icon name="signal"/></span><div className="metric-body"><span className="metric-label">Status transmisji</span><strong className="metric-value" style={{ fontSize: 19 }}>{preview ? 'DEMO' : isOnline ? 'ONLINE' : status === 'loading' ? 'ŁĄCZENIE' : 'OFFLINE'}</strong><span className="metric-foot">{preview ? 'Lokalne dane testowe' : isOnline ? 'Połączono z API' : 'Sprawdź API'}</span></div></div>
          </section>
          <div className="content-grid">
            <section id="telemetry" className="panel" aria-labelledby="chart-heading">
              <div className="panel-heading">
                <div><p className="eyebrow">ANALIZA / TRENDY</p><h2 id="chart-heading">Przebieg telemetrii</h2><p className="subtle">Wartości na osi Y jako % zakresu każdej serii.</p></div>
                <div className="panel-controls">
                  <div className="range-tabs" role="group" aria-label="Zakres czasu">
                    {timeRanges.map(option => <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => { setRange(option.value); setSelectedId(null); }}>{option.label}</button>)}
                  </div>
                  <button className="icon-button" aria-label="Odśwież dane API" title="Odśwież dane" type="button" onClick={() => { if (!preview) { setStatus('loading'); setReload(value => value + 1); } }} disabled={preview || status === 'loading'}><Icon name="refresh" size={15}/></button>
                </div>
              </div>
              <div className="series-toggles" role="group" aria-label="Widoczne serie">
                {series.map(item => <button key={String(item.id)} className="series-toggle" type="button" aria-pressed={!hidden.includes(String(item.id))} onClick={() => toggleSeries(String(item.id))}><span className="legend-dot" style={{ backgroundColor: item.color }}/>{item.name}</button>)}
              </div>
              {status === 'loading' && !preview ? <div className="loading-text" role="status">Pobieranie danych telemetrycznych…</div> :
                !isReady || series.length === 0 ? <div className="empty-chart"><Icon name="database" size={28}/><strong>Nie ma jeszcze serii pomiarowych</strong><span>Dodaj serie i prześlij pomiary przez API. {import.meta.env.DEV && !preview ? <button type="button" className="section-action" onClick={enablePreview}>Zobacz przykładowy wygląd</button> : null}</span></div> :
                  <TelemetryChart series={visibleSeries} measurements={filtered} selectedId={activeSelected}/>}
              <div className="chart-foot"><span>Wykres porównawczy · <b>Oś czasu UTC</b></span><span>Wybierz pomiar w tabeli, aby zaznaczyć punkt.</span></div>
            </section>
            <aside className="panel signal-panel" id="series" aria-labelledby="series-heading">
              <div className="panel-heading"><div><p className="eyebrow">SYSTEM / SERIE</p><h2 id="series-heading">Aktywne serie</h2><p className="subtle">Ostatni zarejestrowany odczyt.</p></div></div>
              <div className="signal-list">
                {series.length === 0 ? <p className="signal-empty">{status === 'loading' ? 'Wczytywanie serii…' : 'Brak serii do wyświetlenia.'}</p> : series.map(item => {
                  const last = measurements.find(point => String(point.seriesId) === String(item.id));
                  return <div key={String(item.id)} className="signal-item"><span className="signal-orb"><Icon name="activity" size={17}/></span><div className="signal-item-main"><strong>{item.name}</strong><span>{sourceCounts.get(String(item.id)) ?? 0} wczytanych pomiarów</span></div><span className="signal-item-value" style={{ color: item.color }}>{last ? formatValue(last.value) : '—'} <small>{item.unit || ''}</small></span></div>;
                })}
              </div>
              <div className="signal-note"><strong><Icon name="radio" size={14}/> Jak działają pomiary?</strong><span>Czujniki wysyłają wyniki do API. Dashboard tylko je odczytuje — nie zmienia danych zapisanych w bazie.</span></div>
            </aside>
          </div>
          <section className="panel table-panel" id="records" aria-labelledby="records-heading">
            <div className="panel-heading"><div><p className="eyebrow">ARCHIWUM / ODCZYTY</p><h2 id="records-heading">Dziennik pomiarów</h2><p className="subtle">Kliknij datę odczytu, aby wyróżnić jego punkt na wykresie.</p></div><button className="section-action" type="button" onClick={() => window.print()}><Icon name="print" size={15}/> Drukuj widok</button></div>
            {filtered.length ? <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th scope="col">Czas pomiaru (UTC)</th>{visibleSeries.map(item => <th scope="col" key={String(item.id)}><span className="legend-dot" style={{ display: 'inline-block', marginRight: 9, backgroundColor: item.color }}/>{item.name} {item.unit ? '(' + item.unit + ')' : ''}</th>)}</tr></thead>
                <tbody>{filtered.slice(0, 45).map(item =>
                  <tr key={String(item.id)} className={activeSelected === String(item.id) ? 'selected' : undefined}>
                    <td><button className="time-button" type="button" aria-pressed={activeSelected === String(item.id)} onClick={() => setSelectedId(String(item.id))}>{formatDate(item.timestamp)}</button></td>
                    {visibleSeries.map(seriesItem => <td key={String(seriesItem.id)} className={String(item.seriesId) !== String(seriesItem.id) ? 'is-empty' : undefined}>{String(item.seriesId) === String(seriesItem.id) ? formatValue(item.value) : '—'}</td>)}
                  </tr>,
                )}</tbody>
              </table>
            </div> : <p className="placeholder">{status === 'loading' ? 'Wczytywanie…' : 'Brak pomiarów odpowiadających filtrom.'}</p>}
            <div className="table-foot"><span>Wyświetlono {Math.min(filtered.length, 45)} z {filtered.length} wczytanych pomiarów · dane z wybranych serii</span><span>Wszystkie czasy w UTC</span></div>
          </section>
          <footer className="footer"><span>ROVERSENSE / MISSION CONTROL</span><span>System telemetrii · Panel obserwacyjny</span></footer>
          </>)}
        </main>
      </div>
    </div>
  );
}

export default App;
