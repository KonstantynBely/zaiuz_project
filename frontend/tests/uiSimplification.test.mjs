import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/features/admin/AdminPanel.tsx', import.meta.url), 'utf8');
const simulations = readFileSync(new URL('../src/features/admin/SimulationPanel.tsx', import.meta.url), 'utf8');

test('dashboard nie pokazuje ozdobnych etykiet ani technicznych statusów', () => {
  for (const phrase of [
    'MISSION / RS-01', 'MARS SURFACE OPERATIONS', 'ŹRÓDŁO: ROVERSENSE API',
    'SSE LIVE', 'Automatyczny odbiór zdarzeń', 'Maksymalnie 1000 z API',
    'SYSTEM TELEMETRYCZNY / PRZEGLĄD', 'ARCHIWUM / ODCZYTY',
  ]) assert.ok(!app.includes(phrase), 'Zbędny tekst: ' + phrase);
  assert.match(app, /<h2 id="chart-heading">Wykres pomiarów<\/h2>/);
  assert.match(app, /<h2 id="records-heading">Historia pomiarów<\/h2>/);
  assert.match(app, /Czas pomiaru \(UTC\)/);
});

test('podstawowe funkcje i bezpieczeństwo pozostały dostępne', () => {
  assert.match(app, /new EventSource\('\/api\/events'\)/);
  assert.match(app, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(app, /aria-label="Połączenie z serwerem"|aria-label=\{preview/);
  assert.match(admin, /<details className="admin-card admin-help-details">/);
  assert.match(admin, /Po zamknięciu tej informacji klucz nie będzie dostępny ponownie/);
  assert.match(simulations, /Aviation Weather Center \(METAR\)/);
});

test('formularz symulacji pokazuje sekundy, lecz przesyła milisekundy do API', () => {
  assert.match(simulations, /const \[intervalSeconds, setIntervalSeconds\] = useState\('1'\)/);
  assert.match(simulations, /const parsedInterval = Number\(intervalSeconds\) \* 1000/);
  assert.match(simulations, /min=\{0\.2\} max=\{60\}/);
  assert.match(simulations, /intervalMs: parsedInterval/);
});
