import { useEffect, useId, useState, type FormEvent } from 'react';
import '../../styles/admin.css';
import type { Series } from '../../api/client';
import { adminApi, ApiRequestError, type Sensor, type SeriesInput } from '../../api/admin';

export type AdminView = 'series' | 'sensors' | 'account';

interface AdminPanelProps {
  view: AdminView;
  token: string | null;
  onLogin: (token: string, expiresIn: number) => void;
  onLogout: () => void;
  onUnauthorized: () => void;
  onSeriesChanged: () => void;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof ApiRequestError) {
    if (reason.status === 401) return 'Sesja wygasła lub dane logowania są niepoprawne.';
    return reason.message;
  }
  return 'Nie udało się połączyć z API. Sprawdź, czy backend działa.';
}

function LoginForm({ onLogin }: { onLogin: AdminPanelProps['onLogin'] }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) { setError('Podaj login i hasło.'); return; }
    setBusy(true);
    setError('');
    try {
      const session = await adminApi.login(username.trim(), password);
      setPassword('');
      onLogin(session.accessToken, session.expiresIn);
    } catch (reason) {
      setError(errorMessage(reason));
      setPassword('');
    } finally { setBusy(false); }
  }
  return (
    <div className="admin-view login-view">
      <div className="admin-heading"><h1>Logowanie</h1><p>Zaloguj się, aby zarządzać seriami i czujnikami.</p></div>
      <div className="admin-login-layout">
        <section className="admin-card login-card" aria-labelledby="login-heading">
          <h2 id="login-heading">Konto administratora</h2>
          <form onSubmit={submit} className="admin-form">
            <label htmlFor="admin-username">Login</label>
            <input id="admin-username" name="username" type="text" autoComplete="username" maxLength={120} value={username} onChange={event => setUsername(event.target.value)} required/>
            <label htmlFor="admin-password">Hasło</label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/>
            {error && <p className="form-message error" role="alert">{error}</p>}
            <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'Trwa logowanie…' : 'Zaloguj się'}</button>
          </form>
        </section>
      </div>
    </div>
  );
}

const newSeries: SeriesInput = { name: '', minValue: 0, maxValue: 100, color: '#e7a679', unit: null, icon: null };
function SeriesEditor({ series, busy, onSave, onCancel }: {
  series: Series | null;
  busy: boolean;
  onSave: (value: SeriesInput, id: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(series?.name ?? '');
  const [minimum, setMinimum] = useState(String(series?.minValue ?? newSeries.minValue));
  const [maximum, setMaximum] = useState(String(series?.maxValue ?? newSeries.maxValue));
  const [color, setColor] = useState(series?.color ?? newSeries.color);
  const [unit, setUnit] = useState(series?.unit ?? '');
  const [icon, setIcon] = useState(series?.icon ?? '');
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const min = Number(minimum), max = Number(maximum);
    if (!name.trim()) { setError('Nazwa serii jest wymagana.'); return; }
    if (!minimum.trim() || !maximum.trim() || !Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
      setError('Podaj poprawny zakres: wartość minimalna musi być mniejsza od maksymalnej.');
      return;
    }
    setError('');
    await onSave({ name: name.trim(), minValue: min, maxValue: max, color, unit: unit.trim() || null, icon: icon.trim() || null }, series ? String(series.id) : null);
  }
  return (
    <section className="admin-card admin-editor" aria-labelledby="series-editor-heading">
      <div className="admin-editor-heading"><h2 id="series-editor-heading">{series ? 'Edytuj serię' : 'Nowa seria'}</h2><button className="admin-minor" onClick={onCancel} type="button">Zamknij</button></div>
      <form className="admin-form" onSubmit={submit}>
        <label htmlFor="series-name">Nazwa serii</label>
        <input id="series-name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="Np. temperatura modułu"/>
        <div className="admin-field-grid">
          <div><label htmlFor="series-min">Minimum</label><input id="series-min" type="number" step="any" required value={minimum} onChange={event => setMinimum(event.target.value)}/></div>
          <div><label htmlFor="series-max">Maksimum</label><input id="series-max" type="number" step="any" required value={maximum} onChange={event => setMaximum(event.target.value)}/></div>
        </div>
        <div className="admin-field-grid">
          <div><label htmlFor="series-unit">Jednostka (opcjonalnie)</label><input id="series-unit" value={unit} maxLength={20} onChange={event => setUnit(event.target.value)} placeholder="np. °C"/></div>
          <div><label htmlFor="series-color">Kolor wykresu</label><div className="color-control"><input id="series-color" type="color" value={color} onChange={event => setColor(event.target.value)}/><span>{color.toUpperCase()}</span></div></div>
        </div>
        <label htmlFor="series-icon">Ikona / oznaczenie (opcjonalnie)</label>
        <input id="series-icon" value={icon} maxLength={60} onChange={event => setIcon(event.target.value)} placeholder="np. thermometer"/>
        {error && <p className="form-message error" role="alert">{error}</p>}
        <button className="admin-primary" type="submit" disabled={busy}>{busy ? 'Zapisywanie…' : series ? 'Zapisz zmiany' : 'Utwórz serię'}</button>
      </form>
    </section>
  );
}

export function AdminPanel({ view, token, onLogin, onLogout, onUnauthorized, onSeriesChanged }: AdminPanelProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [sensorName, setSensorName] = useState('');
  const [sensorSeriesId, setSensorSeriesId] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeySeriesId, setNewKeySeriesId] = useState<string | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const sensorNameId = useId();

  useEffect(() => { setNewKey(null); setNewKeySeriesId(null); setNotice(''); setError(''); }, [view]);
  useEffect(() => {
    if (!token) { setNewKey(null); return; }
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([adminApi.listSeries(), adminApi.listSensors(token)])
      .then(([loadedSeries, loadedSensors]) => {
        if (!active) return;
        setSeries(loadedSeries);
        setSensors(loadedSensors);
      })
      .catch(reason => {
        if (!active) return;
        if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
        else setError(errorMessage(reason));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, refresh, onUnauthorized]);

  if (!token) return <LoginForm onLogin={onLogin}/>;

  async function execute(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      setRefresh(value => value + 1);
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(errorMessage(reason));
      throw reason;
    } finally { setBusy(false); }
  }

  async function saveSeries(input: SeriesInput, id: string | null) {
    try {
      await execute(async () => {
        if (id) await adminApi.updateSeries(token!, id, input);
        else await adminApi.createSeries(token!, input);
        setEditorVisible(false); setEditingSeries(null);
        onSeriesChanged();
      }, id ? 'Zaktualizowano serię.' : 'Utworzono serię.');
    } catch { /* Formularz pozostaje otwarty, a komunikat jest prezentowany w widoku. */ }
  }
  async function deleteSeries(item: Series) {
    if (!window.confirm('Usunąć serię „' + item.name + '”? Usunięte zostaną też wszystkie jej czujniki i pomiary. Tej operacji nie można cofnąć.')) return;
    try {
      await execute(async () => {
        await adminApi.deleteSeries(token!, String(item.id));
        setNewKey(null);
        if (String(editingSeries?.id) === String(item.id)) setEditorVisible(false);
        onSeriesChanged();
      }, 'Usunięto serię i powiązane dane.');
    } catch { /* Informacja o błędzie jest wyświetlona powyżej listy. */ }
  }
  async function createSensor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sensorName.trim() || !sensorSeriesId) { setError('Podaj nazwę czujnika i wybierz serię.'); return; }
    setNewKey(null);
    setNewKeySeriesId(null);
    try {
      await execute(async () => {
        const created = await adminApi.createSensor(token!, sensorName.trim(), sensorSeriesId);
        setNewKey(created.apiKey);
        setNewKeySeriesId(sensorSeriesId);
        setSensorName('');
        setSensorSeriesId('');
      }, 'Zarejestrowano czujnik. Zapisz klucz API przed zamknięciem powiadomienia.');
    } catch { /* Błąd w panelu. */ }
  }
  async function revokeSensor(item: Sensor) {
    if (!window.confirm('Wyrejestrować czujnik „' + item.name + '”? Jego klucz przestanie działać, a dotychczasowe pomiary pozostaną.')) return;
    setNewKey(null);
    setNewKeySeriesId(null);
    try {
      await execute(() => adminApi.deleteSensor(token!, String(item.id)), 'Czujnik został wyrejestrowany.');
    } catch { /* Błąd w panelu. */ }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (nextPassword.length < 8) { setError('Nowe hasło musi mieć minimum 8 znaków.'); return; }
    if (nextPassword !== repeatPassword) { setError('Nowe hasła nie są identyczne.'); return; }
    setBusy(true); setError('');
    try {
      await adminApi.changePassword(token!, oldPassword, nextPassword);
      setOldPassword(''); setNextPassword(''); setRepeatPassword('');
      onLogout();
    } catch (reason) {
      if (reason instanceof ApiRequestError && reason.status === 401) onUnauthorized();
      else setError(errorMessage(reason));
    } finally { setBusy(false); }
  }

  const currentTitle = view === 'series' ? 'Serie pomiarowe' : view === 'sensors' ? 'Czujniki' : 'Konto administratora';
  const instructionSeries = series.find(item => String(item.id) === (newKey ? newKeySeriesId : sensorSeriesId)) ?? null;
  const generatorUrl = window.location.port === '5173' ? 'http://127.0.0.1:3000' : window.location.origin;
  return (
    <div className="admin-view">
      <div className="admin-heading">
        <div className="admin-heading-row"><div><h1>{currentTitle}</h1><p>{view === 'series' ? 'Zarządzaj zakresem, jednostkami i wyglądem serii.' : view === 'sensors' ? 'Rejestruj urządzenia i kontroluj dostęp do pomiarów.' : 'Zmień hasło lub zakończ bieżącą sesję.'}</p></div>
          {view === 'series' && <button className="admin-primary" type="button" onClick={() => { setEditingSeries(null); setEditorVisible(true); setNotice(''); }} disabled={busy}>+ Nowa seria</button>}
        </div>
      </div>
      {error && <p className="form-message error" role="alert">{error}</p>}
      {notice && <p className="form-message success" role="status">{notice}</p>}
      {loading && <p className="loading-text" role="status">Wczytywanie…</p>}
      {view === 'series' && (
        <div className={'admin-layout ' + (editorVisible ? 'with-editor' : '')}>
          <section className="admin-card" aria-labelledby="series-list-heading">
            <div className="admin-card-head"><h2 id="series-list-heading">Lista serii</h2><span className="admin-counter">{series.length} serii</span></div>
            {series.length === 0 && !loading ? <p className="admin-empty">Nie ma jeszcze serii. Utwórz pierwszą, aby przypisać do niej czujnik.</p> :
              <div className="admin-list">{series.map(item => (
                <div className="admin-list-item" key={String(item.id)}>
                  <span className="admin-series-color" style={{ backgroundColor: item.color }} aria-hidden="true"/>
                  <div className="admin-list-info"><strong>{item.name}</strong><span>{item.minValue} – {item.maxValue} {item.unit || ''} · ID {item.id}</span></div>
                  <div className="admin-actions"><button className="admin-minor" type="button" disabled={busy} onClick={() => { setEditingSeries(item); setEditorVisible(true); setNotice(''); }}>Edytuj</button><button className="admin-danger" type="button" disabled={busy} onClick={() => { void deleteSeries(item); }}>Usuń</button></div>
                </div>
              ))}</div>}
          </section>
          {editorVisible && <SeriesEditor key={String(editingSeries?.id ?? 'new')} series={editingSeries} busy={busy} onSave={saveSeries} onCancel={() => { setEditorVisible(false); setEditingSeries(null); }}/>}
        </div>
      )}
      {view === 'sensors' && (
        <div className="admin-layout with-editor">
          <section className="admin-card" aria-labelledby="sensor-list-heading">
            <div className="admin-card-head"><h2 id="sensor-list-heading">Zarejestrowane czujniki</h2><span className="admin-counter">{sensors.length} szt.</span></div>
            {sensors.length === 0 && !loading ? <p className="admin-empty">Brak czujników. Po rejestracji klucz API będzie widoczny tylko raz.</p> :
              <div className="admin-list">{sensors.map(item => (
                <div className="admin-list-item" key={String(item.id)}>
                  <span className="sensor-device" aria-hidden="true">◉</span>
                  <div className="admin-list-info"><strong>{item.name}</strong><span>Seria: {series.find(s => String(s.id) === String(item.seriesId))?.name ?? item.seriesId} · ID {item.id}</span><span>{item.lastMeasurementAt ? 'Ostatni odczyt: ' + new Date(item.lastMeasurementAt).toLocaleString('pl-PL') : 'Brak pomiarów'}</span></div>
                  <div className="admin-actions"><button type="button" className="admin-danger" disabled={busy} onClick={() => { void revokeSensor(item); }}>Wyrejestruj</button></div>
                </div>
              ))}</div>}
          </section>
          <div className="admin-stack">
            <section className="admin-card admin-editor" aria-labelledby="sensor-create-heading">
              <h2 id="sensor-create-heading">Zarejestruj czujnik</h2>
              <p className="admin-description">Przypisz czujnik do serii i odbierz jednorazowy klucz dostępu do API.</p>
              <form className="admin-form" onSubmit={createSensor}>
                <label htmlFor={sensorNameId}>Nazwa czujnika</label>
                <input id={sensorNameId} value={sensorName} onChange={event => setSensorName(event.target.value)} maxLength={100} required placeholder="Np. sensor temperatury 01"/>
                <label htmlFor="sensor-series">Seria docelowa</label>
                <select id="sensor-series" value={sensorSeriesId} onChange={event => setSensorSeriesId(event.target.value)} required>
                  <option value="">Wybierz serię</option>
                  {series.map(item => <option key={String(item.id)} value={String(item.id)}>{item.name}</option>)}
                </select>
                <button className="admin-primary" type="submit" disabled={busy || series.length === 0}>{busy ? 'Rejestrowanie…' : 'Zarejestruj czujnik'}</button>
              </form>
            </section>
            {newKey && <section className="admin-card secret-card" aria-labelledby="key-heading">
              <h2 id="key-heading">Zapisz klucz API</h2>
              <p className="admin-description">Po zamknięciu tej informacji klucz nie będzie dostępny ponownie. Nie przesyłaj go do Git ani nie udostępniaj publicznie.</p>
              <label htmlFor="created-api-key">Klucz czujnika</label>
              <input id="created-api-key" className="key-input" type="text" readOnly spellCheck={false} value={newKey} onFocus={event => event.target.select()} autoComplete="off"/>
              <div className="admin-actions"><button type="button" className="admin-minor" onClick={() => { if (!navigator.clipboard?.writeText) { setError('Schowek nie jest dostępny. Zaznacz klucz i skopiuj go ręcznie.'); return; } void navigator.clipboard.writeText(newKey).then(() => setNotice('Skopiowano klucz do schowka.')).catch(() => setError('Nie udało się skopiować. Zaznacz klucz i skopiuj go ręcznie.')); }}>Kopiuj klucz</button><button type="button" className="admin-danger" onClick={() => { setNewKey(null); setNewKeySeriesId(null); setNotice('Klucz ukryto. Nie można go ponownie odczytać.'); }}>Ukryj klucz</button></div>
            </section>}
            <details className="admin-card admin-help-details">
              <summary>Generator Python — instrukcja</summary>
              <div className="admin-help-body">
                <p className="admin-description">Po rejestracji czujnika ustaw jednorazowy klucz w zmiennej środowiskowej <code>ROVERSENSE_SENSOR_KEY</code> i uruchom generator z katalogu projektu. Jeśli trzeba, zmień adres w opcji <code>--url</code>.</p>
                <pre className="admin-code"><code>{'python sensor-simulator/src/generator.py --url ' + generatorUrl + ' --mode history --pattern random --count 15 --interval 60' + (instructionSeries ? ' --min ' + instructionSeries.minValue + ' --max ' + instructionSeries.maxValue : ' --min 0 --max 100')}</code></pre>
                <p className="admin-helper">{instructionSeries ? 'Zakres dostosowany do serii: ' + instructionSeries.name + '. ' : 'Najpierw wybierz serię przy rejestracji czujnika, aby dostosować zakres. '}Generator wysyła pomiary do API. Interwał jest podawany w sekundach. Nie umieszczaj klucza w poleceniu ani w repozytorium.</p>
              </div>
            </details>
          </div>
        </div>
      )}
      {view === 'account' && <div className="admin-layout with-editor">
        <section className="admin-card admin-editor" aria-labelledby="password-heading">
          <h2 id="password-heading">Zmiana hasła</h2>
          <p className="admin-description">Po zapisaniu nowego hasła wszystkie dotychczasowe sesje zostaną unieważnione.</p>
          <form className="admin-form" onSubmit={changePassword}>
            <label htmlFor="current-password">Obecne hasło</label><input id="current-password" type="password" autoComplete="current-password" value={oldPassword} onChange={event => setOldPassword(event.target.value)} required/>
            <label htmlFor="new-password">Nowe hasło</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={nextPassword} onChange={event => setNextPassword(event.target.value)} required/>
            <label htmlFor="repeat-password">Powtórz nowe hasło</label><input id="repeat-password" type="password" autoComplete="new-password" value={repeatPassword} onChange={event => setRepeatPassword(event.target.value)} required/>
            <button className="admin-primary" disabled={busy} type="submit">{busy ? 'Zapisywanie…' : 'Zmień hasło'}</button>
          </form>
        </section>
        <section className="admin-card admin-editor"><h2>Sesja</h2><p className="admin-description">Wylogowanie zakończy bieżącą sesję.</p><button className="admin-minor" type="button" onClick={onLogout}>Wyloguj się</button></section>
      </div>}
    </div>
  );
}
