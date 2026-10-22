import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchHealth, fetchMeasurements, fetchSeries, type Measurement, type Series } from './api/client';
import roverHero from './assets/rover-hero.svg';
import { adminApi } from './api/admin';
import { AdminPanel, type AdminView } from './features/admin/AdminPanel';
import { SimulationPanel } from './features/admin/SimulationPanel';
import { groupMeasurements } from './features/dashboard/measurementRows';
import { appendStreamMeasurement, type StreamFilter } from './features/dashboard/measurementStream';
import './styles/app.css';

type LoadState = 'loading' | 'ready' | 'error';
type TimeRange = 'all' | '24h' | '7d' | '30d' | 'custom';
type IconName = 'dashboard' | 'chart' | 'layers' | 'radio' | 'clock' | 'settings' | 'refresh' | 'arrow' | 'menu' | 'activity' | 'database' | 'planet' | 'signal' | 'print' | 'lock';

const timeRanges: { value: TimeRange; label: string }[] = [
  { value: 'all', label: 'Całość' }, { value: '24h', label: '24 h' },
  { value: '7d', label: '7 dni' }, { value: '30d', label: '30 dni' },
];

const DASH_PATTERNS = ['none', '9 5', '3 4', '13 4 3 4'] as const;

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
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

interface ChartPoint {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: string;
}

/** Wspólny wykres w % zakresów lub rzeczywiste wartości jednej wybranej serii. */
function TelemetryChart({ series, allSeries, measurements, selectedId, raw }: {
  series: Series[]; allSeries: Series[]; measurements: Measurement[]; selectedId: string | null; raw: boolean;
}) {
  const width = 880, height = 275;
  const left = 60, right = 20, top = 21, bottom = 36;
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
  const labelFor = (part: number) => {
    const date = new Date(minTime + part * span);
    return new Intl.DateTimeFormat('pl-PL', span >= 86_400_000 ? { month: '2-digit', day: '2-digit', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date);
  };
  const valueLabel = (part: number) => raw && series[0] ?
    formatValue(series[0].maxValue - part * (series[0].maxValue - series[0].minValue)) : Math.round((1 - part) * 100) + '%';
  return (
    <div className="chart-viewport">
      <svg className="telemetry-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={raw ? 'Wykres wartości rzeczywistych wybranej serii. Szczegółowe pomiary znajdują się w tabeli.' : 'Wykres procentowych wartości względem zakresu każdej serii. Szczegóły w tabeli.'}>
        {[0, .25, .5, .75, 1].map(part => {
          const y = top + part * plotH;
          return <g key={part}><line className="grid-line" x1={left} y1={y} x2={width - right} y2={y}/><text className="grid-label" x={left - 10} y={y + 4} textAnchor="end">{valueLabel(part)}</text></g>;
        })}
        {[0, .25, .5, .75, 1].map(part => {
          const x = left + part * plotW;
          return <text key={part} className="grid-label" x={x} y={height - 8} textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'}>{labelFor(part)}</text>;
        })}
        {active && <line className="chart-cross" x1={active.x} x2={active.x} y1={top} y2={top + plotH}/>}
        {pointSets.map(group => (
          <g key={String(group.series.id)}>
            {group.points.length > 1 && <path d={group.points.map((point, i) => (i === 0 ? 'M' : 'L') + point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ')} fill="none" stroke={group.series.color} strokeWidth="2.5" strokeDasharray={DASH_PATTERNS[Math.max(0, allSeries.findIndex(item => String(item.id) === String(group.series.id))) % DASH_PATTERNS.length]} strokeLinecap="round" strokeLinejoin="round"/>}
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
  const [draftFrom, setDraftFrom] = useState('');
  const [draftTo, setDraftTo] = useState('');
  const [customDates, setCustomDates] = useState<{ from?: string; to?: string }>({});
  const [dateError, setDateError] = useState('');
  const [tablePage, setTablePage] = useState(0);
  const [chartMode, setChartMode] = useState<'percent' | 'raw'>('percent');
  const [rawSeriesId, setRawSeriesId] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const streamFilterRef = useRef<StreamFilter>({ range: 'all', hiddenSeriesIds: [], availableSeriesIds: [] });
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
  const [screen, setScreen] = useState<'dashboard' | AdminView | 'simulations'>('dashboard');
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
    if (preview) { setStatus('ready'); setError(''); return; }
    const controller = new AbortController();
    const from = range === 'custom' ? customDates.from : range === 'all' ? undefined :
      new Date(Date.now() - (range === '24h' ? 1 : range === '7d' ? 7 : 30) * 86_400_000).toISOString();
    const to = range === 'custom' ? customDates.to : undefined;
    Promise.all([fetchHealth(controller.signal), fetchSeries(controller.signal)])
      .then(async ([health, loadedSeries]) => {
        if (controller.signal.aborted) return;
        if (health.status !== 'ok') throw new Error('Serwer API nie jest gotowy');
        const selectedSeriesIds = loadedSeries
          .filter(item => !hidden.includes(String(item.id)))
          .map(item => item.id);
        const loadedMeasurements = selectedSeriesIds.length
          ? await fetchMeasurements(controller.signal, { from, to, series: selectedSeriesIds })
          : [];
        if (controller.signal.aborted) return;
        setLiveSeries(loadedSeries);
        setLiveMeasurements(loadedMeasurements);
        setStatus('ready');
        setError('');
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Nie udało się pobrać danych');
      });
    return () => controller.abort();
  }, [preview, reload, range, customDates, hidden]);

  // Utrzymuj bieżący filtr osobno od połączenia, bez rozłączania SSE przy każdej zmianie zakresu.
  useEffect(() => {
    streamFilterRef.current = {
      range, from: customDates.from, to: customDates.to,
      hiddenSeriesIds: hidden,
      availableSeriesIds: liveSeries.map(item => String(item.id)),
    };
  }, [range, customDates, hidden, liveSeries]);

  // SSE jest strumieniem powiadomień; po ponownym połączeniu pobieramy brakujące dane przez REST.
  useEffect(() => {
    if (preview || typeof EventSource === 'undefined') {
      return;
    }
    const source = new EventSource('/api/events');
    let openCount = 0;
    source.onopen = () => {
      if (openCount++ > 0) setReload(value => value + 1);
    };
    source.addEventListener('measurement', (event: MessageEvent<string>) => {
      try {
        const item = JSON.parse(event.data) as Measurement;
        const filter = streamFilterRef.current;
        const now = Date.now();
        setLiveMeasurements(previous => appendStreamMeasurement(previous, item, filter, now));
      } catch { /* Nieprawidłowa ramka nie zatrzymuje strumienia. */ }
    });
    return () => source.close();
  }, [preview]);

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
    const cutoff = Date.now() - days * 86_400_000;
    return measurements.filter(item => new Date(item.timestamp).getTime() >= cutoff);
  }, [measurements, range, customDates]);
  const filtered = useMemo(
    () => timeFiltered.filter(item => visibleSeries.some(s => String(s.id) === String(item.seriesId))),
    [timeFiltered, visibleSeries],
  );
  const lastMeasurement = measurements[0];
  const sourceCounts = useMemo(() => new Map(series.map(item => [
    String(item.id), measurements.filter(m => String(m.seriesId) === String(item.id)).length,
  ])), [series, measurements]);
  const activeSelected = filtered.some(item => String(item.id) === selectedId) ? selectedId : null;
  const chartSeries = chartMode === 'raw' ?
    visibleSeries.filter(item => String(item.id) === (visibleSeries.some(s => String(s.id) === rawSeriesId) ? rawSeriesId : String(visibleSeries[0]?.id))) : visibleSeries;
  const groupedRows = useMemo(() => groupMeasurements(visibleSeries, filtered), [visibleSeries, filtered]);
  const rowsPerPage = 35;
  const lastPage = Math.max(0, Math.ceil(groupedRows.length / rowsPerPage) - 1);
  const safePage = Math.min(tablePage, lastPage);
  const pageRows = groupedRows.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);

  function toggleSeries(id: string) {
    setHidden(items => items.includes(id) ? items.filter(item => item !== id) : [...items, id]);
    setSelectedId(null);
    setTablePage(0);
  }
  function enablePreview() {
    setPreview(true);
    setSelectedId(null);
    setRange('all');
    setHidden([]);
    setTablePage(0);
  }
  function returnToApi() {
    setPreview(false);
    setStatus('loading');
    setSelectedId(null);
    setReload(value => value + 1);
  }
  const isReady = status === 'ready';
  const isOnline = isReady && !preview;
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
    setTablePage(0);
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#dashboard">Przejdź do głównej treści</a>
      <button className={'scrim ' + (menuOpen ? 'is-open' : '')} aria-label="Zamknij menu" tabIndex={-1} onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }} />
      <aside ref={sidebarElement} id="mission-navigation" className={'sidebar ' + (menuOpen ? 'is-open' : '')} aria-label="Menu aplikacji" aria-hidden={compact && !menuOpen} inert={compact && !menuOpen}>
        <a className="brand" href="#dashboard" onClick={openDashboard}>
          <span className="brand-symbol"><Icon name="planet" size={25}/></span>
          <span className="brand-copy"><strong>RoverSense</strong></span>
        </a>
        <nav className="side-nav" aria-label="Nawigacja główna">
          <a className={"nav-link " + (screen === "dashboard" ? "active" : "")} href="#dashboard" aria-current={screen === 'dashboard' ? 'page' : undefined} onClick={openDashboard}><Icon name="dashboard"/>Pulpit</a>
          <a className="nav-link" href="#telemetry" onClick={openDashboard}><Icon name="chart"/>Wykres pomiarów</a>
          <a className="nav-link" href="#records" onClick={openDashboard}><Icon name="clock"/>Dziennik pomiarów</a>
        </nav>
        {session && (
          <div className="nav-secondary">
            <p className="nav-caption">ADMINISTRACJA</p>
            <button className={"nav-link " + (screen === "series" ? "active" : "")} type="button" onClick={() => openAdmin("series")}><Icon name="layers"/>Serie pomiarowe</button>
            <button className={"nav-link " + (screen === "sensors" ? "active" : "")} type="button" onClick={() => openAdmin("sensors")}><Icon name="radio"/>Czujniki</button>
            <button className={"nav-link " + (screen === "simulations" ? "active" : "")} type="button" onClick={() => openAdmin("simulations")}><Icon name="activity"/>Symulatory</button>
            <button className={"nav-link " + (screen === "account" ? "active" : "")} type="button" onClick={() => openAdmin("account")}><Icon name="settings"/>Zmiana hasła</button>
          </div>
        )}
        <div className="sidebar-bottom">
          {!session && <button className="sidebar-login-button" type="button" onClick={() => openAdmin('account')}><Icon name="lock" size={15}/> Zaloguj się</button>}
        </div>
      </aside>
      <div className="workspace" inert={compact && menuOpen} aria-hidden={compact && menuOpen}>
        <header className="topbar">
          <button ref={menuButton} className="mobile-menu" type="button" aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'} aria-controls="mission-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon name="menu"/></button>
          <div className="breadcrumb"><b>{screen === "dashboard" ? "Pulpit" : screen === "series" ? "Serie pomiarowe" : screen === "sensors" ? "Czujniki" : screen === "simulations" ? "Symulatory" : "Konto"}</b></div>
          <div className="topbar-right">
            <span className={'connection-indicator ' + (!isReady ? 'offline' : '')} role="status" aria-label={preview ? 'Dane demonstracyjne' : isOnline ? 'Połączono z serwerem' : status === 'loading' ? 'Łączenie z serwerem' : 'Brak połączenia z serwerem'}>
              <span className={'beacon ' + (!isReady ? 'error' : '')} aria-hidden="true"/>
              <span>{preview ? 'Podgląd' : isOnline ? 'Połączono' : status === 'loading' ? 'Łączenie…' : 'Brak połączenia'}</span>
            </span>
          </div>
        </header>
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
          <section className="hero" aria-label="RoverSense — monitorowanie pomiarów">
            <div className="hero-visual"><img className="rover-scene" src={roverHero} alt="Ilustracja łazika marsjańskiego"/></div>
            <div className="hero-copy">
              <h2>Dane z czujników</h2>
              <p>Wykresy i historia pomiarów w jednym miejscu.</p>
            </div>
          </section>
          <section className="metric-grid" aria-label="Podsumowanie pomiarów">
            <div className="metric-card"><span className="metric-icon"><Icon name="layers"/></span><div className="metric-body"><span className="metric-label">Serie pomiarowe</span><strong className="metric-value">{isReady ? series.length : '—'}</strong></div></div>
            <div className="metric-card"><span className="metric-icon teal"><Icon name="activity"/></span><div className="metric-body"><span className="metric-label" title="Liczba wczytanych pomiarów, maksymalnie 1000 w jednym zapytaniu">Wczytane pomiary</span><strong className="metric-value">{isReady ? measurements.length : '—'}</strong></div></div>
            <div className="metric-card"><span className="metric-icon"><Icon name="clock"/></span><div className="metric-body"><span className="metric-label">Ostatni odczyt</span><strong className="metric-value metric-time">{lastMeasurement && isReady ? formatShortTime(lastMeasurement.timestamp) : '—'}</strong></div></div>
          </section>
          <div className="content-grid">
            <section id="telemetry" className="panel" aria-labelledby="chart-heading">
              <div className="panel-heading">
                <div><h2 id="chart-heading">Wykres pomiarów</h2></div>
                <div className="panel-controls">
                  <div className="range-tabs" role="group" aria-label="Zakres czasu">
                    {timeRanges.map(option => <button key={option.value} type="button" aria-pressed={range === option.value} onClick={() => { setRange(option.value); setDateError(''); setSelectedId(null); setTablePage(0); }}>{option.label}</button>)}
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
                  const last = measurements.find(point => String(point.seriesId) === String(item.id));
                  return <div key={String(item.id)} className="signal-item"><span className="signal-orb"><Icon name="activity" size={17}/></span><div className="signal-item-main"><strong>{item.name}</strong><span>{sourceCounts.get(String(item.id)) ?? 0} wczytanych pomiarów</span></div><span className="signal-item-value" style={{ color: item.color }}>{last ? formatValue(last.value) : '—'} <small>{item.unit || ''}</small></span></div>;
                })}
              </div>
              
            </aside>
          </div>
          <section className="panel table-panel" id="records" aria-labelledby="records-heading">
            <div className="panel-heading"><div><h2 id="records-heading">Historia pomiarów</h2><p className="subtle">Kliknij wartość, aby zaznaczyć ją na wykresie.</p></div><button className="section-action" type="button" onClick={() => window.print()}><Icon name="print" size={15}/> Drukuj</button></div>
            {groupedRows.length ? <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th scope="col">Czas pomiaru (UTC)</th>{visibleSeries.map(item => <th scope="col" key={String(item.id)}><span className="legend-dot" style={{ display: 'inline-block', marginRight: 9, backgroundColor: item.color }}/>{item.name} {item.unit ? '(' + item.unit + ')' : ''}</th>)}</tr></thead>
                <tbody>{pageRows.map(row =>
                  <tr key={row.key} className={[...row.cells.values()].some(item => String(item.id) === activeSelected) ? 'selected' : undefined}>
                    <th scope="row" className="measurement-time">{formatDate(row.timestamp)}</th>
                    {visibleSeries.map(item => {
                      const sample = row.cells.get(String(item.id));
                      return <td key={String(item.id)} className={sample ? undefined : 'is-empty'}>{sample ?
                        <button className="measurement-cell-button" type="button" aria-pressed={String(sample.id) === activeSelected}
                          title={'Zaznacz: ' + item.name + ', ' + formatDate(sample.timestamp)} onClick={() => { setSelectedId(String(sample.id)); if (chartMode === 'raw') setRawSeriesId(String(sample.seriesId)); }}>{formatValue(sample.value)}</button> : '—'}</td>;
                    })}
                  </tr>,
                )}</tbody>
              </table>
            </div> : <p className="placeholder">{status === 'loading' ? 'Wczytywanie…' : 'Brak pomiarów odpowiadających filtrom.'}</p>}
            <div className="table-foot"><span>Wiersze {groupedRows.length ? safePage * rowsPerPage + 1 : 0}–{Math.min((safePage + 1) * rowsPerPage, groupedRows.length)} z {groupedRows.length} wczytanych</span>
              <div className="table-pagination">
                <button type="button" disabled={safePage === 0} onClick={() => setTablePage(page => Math.max(0, page - 1))}>← Poprzednia</button>
                <span>Strona {safePage + 1} / {lastPage + 1}</span>
                <button type="button" disabled={safePage >= lastPage} onClick={() => setTablePage(page => Math.min(lastPage, page + 1))}>Następna →</button>
              </div>
            </div>
          </section>
          <section className="print-report" aria-label="Raport pomiarów do wydruku">
            <header className="print-report-head">
              <h2>RoverSense — raport telemetrii</h2>
              <p>Zakres: {range === 'custom' ? [customDates.from ? formatDate(customDates.from) : 'początek', customDates.to ? formatDate(customDates.to) : 'teraz'].join(' – ') : range === 'all' ? 'wszystkie wczytane pomiary' : range === '24h' ? 'ostatnie 24 godziny' : range === '7d' ? 'ostatnie 7 dni' : 'ostatnie 30 dni'} · Wykres: {chartMode === 'raw' ? 'jednostki serii' : '% zakresu serii'}</p>
              <p>Widoczne serie: {visibleSeries.length}.</p>
              <ul className="print-legend">
                {visibleSeries.map(item => <li key={String(item.id)}>
                  <svg viewBox="0 0 42 12" width="42" height="12" aria-hidden="true"><line x1="2" y1="6" x2="40" y2="6" stroke={item.color} strokeWidth="3" strokeDasharray={DASH_PATTERNS[Math.max(0, series.findIndex(s => String(s.id) === String(item.id))) % DASH_PATTERNS.length]}/></svg>
                  {item.name}{item.unit ? ' (' + item.unit + ')' : ''}
                </li>)}
              </ul>
              <p>{preview ? 'Lokalne dane demonstracyjne. ' : ''}Wydruk obejmuje wszystkie wczytane odczyty spełniające filtry (do 1000 ostatnich wyników pobranych z API). Czas w UTC.</p>
            </header>
            <table className="print-table">
              <thead><tr><th scope="col">Czas pomiaru (UTC)</th>{visibleSeries.map(item => <th scope="col" key={String(item.id)}>{item.name}{item.unit ? ' (' + item.unit + ')' : ''}</th>)}</tr></thead>
              <tbody>{groupedRows.map(row => <tr key={row.key}><th scope="row">{formatDate(row.timestamp)}</th>{visibleSeries.map(item => <td key={String(item.id)}>{row.cells.has(String(item.id)) ? formatValue(row.cells.get(String(item.id))!.value) : '—'}</td>)}</tr>)}</tbody>
            </table>
          </section>
          <footer className="footer"><span>RoverSense</span></footer>
          </>)}
        </main>
      </div>
    </div>
  );
}

export default App;
