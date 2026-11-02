import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));
const series = [
  { id: '1', name: 'Temperatura', minValue: -30, maxValue: 60, color: '#e7a679', unit: '°C' },
  { id: '2', name: 'DlugaNazwaBezSpacji'.repeat(8), minValue: 0, maxValue: 100, color: '#78b8ac', unit: '%' },
];
const measurements = Array.from({ length: 80 }, /** Tworzy próbkę fixture dla dwóch serii z deterministyczną wartością i czasem względem startu testu. */ (_, i) => ({
  id: String(i), seriesId: i % 2 ? '1' : '2',
  timestamp: new Date(Date.now() - i * 60_000).toISOString(), value: 20 + 15 * Math.sin(i / 5),
}));

// Every API route is intercepted in memory; the production proxy is never used.
/**
 * Obsługuje wszystkie ścieżki /api w pamięci testu; nieznane zwraca jako 404 zamiast przekazać do proxy.
 * Dla SSE pozostawia otwartą odpowiedź, a pozostałe dane symulują odczyty i logowanie bez bazy.
 */
function mockApi(req, res, next) {
  if (!req.url.startsWith('/api/')) return next();
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(': connected\n\n');
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  const ids = url.searchParams.get('series')?.split(',');
  const routes = {
    '/api/health': { status: 'ok' },
    '/api/series': series,
    '/api/measurements': measurements.filter(/** Ogranicza odpowiedź atrapy pomiarów do serii wskazanych w zapytaniu, pozostawiając wszystkie przy braku filtra. */ m => !ids || ids.includes(m.seriesId))
      .slice(0, Number(url.searchParams.get('limit') || 1000)),
    '/api/auth/login': { accessToken: 'browser-fixture', expiresIn: 3600, tokenType: 'Bearer' },
    '/api/sensors': [],
    '/api/simulations': [],
  };
  if (!(url.pathname in routes)) res.statusCode = 404;
  res.end(JSON.stringify(routes[url.pathname] ?? { status: 404, title: 'Unknown fixture route' }));
}

/** Sprawdza produkcyjny pulpit na ośmiu szerokościach, skalę, wybór punktu, pusty stan, wydruk i logowanie na atrapach API. */
test('Production dashboard: mobile layout, filters, selection, print and login', { timeout: 60_000 }, async t => {
  const chromePath = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find(/** Wybiera pierwszą istniejącą ścieżkę Chrome/Chromium/Edge, uwzględniając CHROME_PATH użytkownika. */ candidate => candidate && existsSync(candidate));
  assert.ok(chromePath, 'Install Chrome/Chromium or set CHROME_PATH to its executable');
  const server = await preview({ root, preview: { host: '127.0.0.1', port: 0 },
    plugins: [{ name: 'browser-fixtures', /** Instaluje atrapę przed proxy Vite, izolując test przeglądarkowy od rzeczywistego backendu. */ configurePreviewServer(s) { s.middlewares.use(mockApi); } }],
  });
  const profile = await mkdtemp(join(tmpdir(), 'roversense-browser-'));
  const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run',
    '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const exited = once(chrome, 'exit');
  let socket;
  t.after(/** Po teście zamyka kanał CDP i proces Chrome, kończy serwer preview i usuwa wyłącznie utworzony profil w TEMP. */ async () => {
    socket?.close();
    chrome.kill();
    await Promise.race([exited, pause(5000)]);
    await new Promise(/** Czeka na potwierdzenie zamknięcia serwera HTTP użytego do testu. */ resolveClose => server.httpServer.close(resolveClose));
    // Only remove the unique profile created by this test, directly inside TEMP.
    if (dirname(profile) === resolve(tmpdir()) && basename(profile).startsWith('roversense-browser-')) {
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });
  const endpoint = await new Promise(/** Odczytuje z stderr adres DevTools uruchomionego Chrome; odrzuca start przy błędzie procesu lub timeout. */ (resolveEndpoint, reject) => {
    const timeout = setTimeout(/** Kończy nieudaną próbę startu, jeśli Chrome nie poda adresu DevTools w ciągu 10 s. */ () => reject(new Error('Chrome startup timeout')), 10_000);
    let output = '';
    chrome.on('error', /** Usuwa timeout startu i przekazuje błąd uruchomienia procesu do oczekującego testu. */ error => { clearTimeout(timeout); reject(error); });
    chrome.stderr.on('data', /** Buforuje fragmenty stderr i rozpoznaje pełny adres WebSocket DevTools, zwalniając timer po sukcesie. */ chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timeout); resolveEndpoint(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await once(socket, 'open');
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.addEventListener('message', /** Rozdziela odpowiedzi CDP po ID komendy, usuwa ich timeouty i zbiera wyjątki JS zgłoszone przez kartę. */ ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const job = pending.get(message.id);
      if (!job) return;
      pending.delete(message.id);
      clearTimeout(job.timer);
      if (message.error) job.reject(new Error(message.error.message));
      else job.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  /** Wysyła komendę Chrome DevTools Protocol i kojarzy odpowiedź przez ID; timeout usuwa oczekiwanie po 5 s. */
  function send(method, params = {}, sessionId) {
    return new Promise(/** Nadaje komendzie CDP ID, rejestruje resolve/reject i timeout, po czym wysyła komunikat przez WebSocket. */ (resolveCommand, reject) => {
      const commandId = ++id;
      const timer = setTimeout(/** Usuwa nieobsłużoną komendę CDP z mapy i kończy jej oczekiwanie błędem po 5 s. */ () => { pending.delete(commandId); reject(new Error('CDP timeout: ' + method)); }, 5000);
      pending.set(commandId, { resolve: resolveCommand, reject, timer });
      socket.send(JSON.stringify({ id: commandId, method, params, sessionId }));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  /** Wysyła komendę CDP do sesji konkretnej karty zamiast do całego procesu przeglądarki. */
  const call = (method, params) => send(method, params, sessionId);
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Network.setBlockedURLs', { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] });
  /** Wykonuje wyrażenie w karcie, czeka na Promise i zgłasza wyjątek JS jako błąd testu. */
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  /** Sprawdza warunek w karcie co 100 ms do 60 prób; brak oczekiwanego stanu kończy test błędem. */
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    assert.fail('Timed out waiting for: ' + expression);
  }
  /** Emuluje wskazaną szerokość mobilnego viewportu i czeka krótko na ResizeObserver oraz React. */
  async function resize(width) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 850, deviceScaleFactor: 1, mobile: true });
    await pause(100);
  }
  /** Sprawdza brak poziomego overflow, zgodność viewBox z szerokością i czytelność podpisów bez kolizji. */
  async function checkChart(width) {
    const data = await evaluate(`(() => {
      const svg = document.querySelector('.telemetry-chart');
      const viewport = document.querySelector('.chart-viewport');
      const labels = [...svg.querySelectorAll(':scope > text')].map(e => e.getBoundingClientRect());
      return { page: document.documentElement.scrollWidth, chart: svg.getBoundingClientRect().width,
        viewBox: svg.viewBox.baseVal.width, viewport: viewport.clientWidth, scroll: viewport.scrollWidth,
        height: svg.getBoundingClientRect().height, font: getComputedStyle(svg.querySelector('text')).fontSize,
        overlap: labels.some((rect, i) => i > 0 && labels[i-1].right > rect.left) };
    })()`);
    assert.ok(data.page <= width && data.scroll <= data.viewport + 1, JSON.stringify(data));
    assert.ok(Math.abs(data.chart - data.viewBox) <= 1 && data.height >= 215, JSON.stringify(data));
    assert.equal(data.font, '11px');
    assert.equal(data.overlap, false);
  }
  await resize(390);
  const { port } = server.httpServer.address();
  await call('Page.navigate', { url: `http://127.0.0.1:${port}/?preview=1` });
  await waitFor('Boolean(document.querySelector(".telemetry-chart circle"))');
  assert.equal(await evaluate('Boolean(document.querySelector(".notice"))'), false, 'DEV preview must be disabled');
  for (const width of [320, 375, 390, 430, 640, 768, 1024, 1440]) {
    await resize(width);
    await checkChart(width);
  }
  await resize(320);
  await evaluate(`document.querySelector('[aria-label="Rodzaj skali wykresu"] button:nth-child(2)').click()`);
  await waitFor('Boolean(document.querySelector(".raw-series-select"))');
  await checkChart(320);
  await evaluate(`document.querySelector('.measurement-cell-button').click()`);
  await waitFor('Boolean(document.querySelector(".chart-cross"))');
  await evaluate(`document.querySelectorAll('.series-toggle').forEach(button => button.click())`);
  await waitFor('Boolean(document.querySelector(".empty-chart"))');
  await evaluate(`document.querySelector('.series-toggle').click()`);
  await waitFor('Boolean(document.querySelector(".telemetry-chart circle"))');
  await checkChart(320);
  await call('Emulation.setEmulatedMedia', { media: 'print' });
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.telemetry-chart')).position`), 'static');
  await call('Emulation.setEmulatedMedia', { media: '' });
  await evaluate(`document.querySelector('.mobile-menu').click()`);
  await evaluate(`document.querySelector('.sidebar-login-button').click()`);
  await waitFor('Boolean(document.querySelector("#admin-username"))');
  await evaluate(`(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [selector, value] of [['#admin-username','fixture'], ['#admin-password','fixture-password']]) {
      const input = document.querySelector(selector);
      setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate(`document.querySelector('.admin-form').requestSubmit()`);
  await waitFor('Boolean(document.querySelector("#series-list-heading"))');
  assert.deepEqual(errors, []);
});
