# RoverSense

RoverSense to aplikacja internetowa do zbierania i przeglądania serii pomiarowych pochodzących z czujników IoT, inspirowana telemetrią robotów mobilnych. Projekt realizowany w ramach przedmiotu **Zaawansowane Aplikacje Internetowe** (semestr zimowy 2026/2027).

## Technologie

Backend: Node.js, Fastify, TypeScript. Frontend: React, Vite, TypeScript. Baza: PostgreSQL + TimescaleDB (pomiary jako hypertable). Generator: Python 3.

## Uruchomienie lokalne

Wymagane Node.js 24 LTS, Python 3.12+ oraz Docker z Compose. W katalogu głównym:

```bash
cp .env.example .env
docker compose --env-file .env up -d
```

W kolejnych terminalach uruchom API i frontend:

```bash
cd backend
npm install
set -a && source ../.env && set +a  # Linux / WSL / Git Bash
npm run db:migrate
npm run db:seed-admin              # wymaga ADMIN_USERNAME i ADMIN_PASSWORD w .env
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Aplikacja jest dostępna pod `http://127.0.0.1:5173`, a REST API pod `http://127.0.0.1:3000`. Serwer Vite przekazuje `/api` do backendu.

Hasło administratora ustaw przed uruchomieniem `db:seed-admin` w pliku `.env` (minimum 12 znaków). Plik `.env` jest ignorowany przez Git. Jeżeli chcesz użyć PowerShell zamiast Bash, ustaw zmienne środowiskowe ręcznie przed uruchomieniem poleceń. Przy ponownym uruchomieniu `db:seed-admin` hasło zostanie zaktualizowane, a dotychczasowe sesje unieważnione.

## Interfejs Mission Control

Ilustracja w banerze znajduje się w `frontend/src/assets/rover-hero.svg`. To autorski rysunek wektorowy inspirowany wyglądem i ogólną konstrukcją łazików marsjańskich (sześć kół, zawieszenie rocker-bogie, kamera na maszcie i ramię robotyczne), a nie fotografia NASA ani odwzorowanie techniczne konkretnego modelu. Asset można edytować niezależnie od komponentów React.

Frontend wyświetla serie i pomiary z publicznego API jako marsjański pulpit telemetrii. Dostępne są filtry czasu i serii, wykres wartości odniesionych procentowo do zakresów min/max poszczególnych serii, tabela odczytów, zaznaczanie punktu po wybraniu wiersza oraz widok do wydruku. Pokazywane są maksymalnie 1000 ostatnich pomiarów zwróconych przez API. Część administracyjna nie jest jeszcze dostępna w interfejsie.

Lokalny podgląd wyglądu bez bazy i backendu:

```bash
cd frontend
npm ci
npm run dev
```

Otwórz `http://127.0.0.1:5173/?preview=1`. W trybie developerskim (`npm run dev`) wyświetlane są wyłącznie przykładowe dane, generowane w przeglądarce; nie są wysyłane do API ani zapisywane w bazie. Aby zobaczyć rzeczywiste odczyty, uruchom backend lokalnie, otwórz stronę bez parametru `preview` i skorzystaj z proxy Vite (`/api` → `127.0.0.1:3000`). Podgląd demonstracyjny jest wyłączony w buildzie produkcyjnym.

## Backend

Backend pobiera konfigurację z otoczenia procesu: `DATABASE_URL` określa połączenie z PostgreSQL, a `HOST` i `PORT` adres oraz port nasłuchiwania. Na serwerze zmienne te, wraz z `NODE_ENV=production`, są przechowywane w `/etc/roversense/backend.env` (uprawnienia `root:roversense`, `0640`). Przy uruchamianiu backendu należy wczytać te wartości do środowiska procesu, np. przez `EnvironmentFile` w systemd; kod aplikacji nie jest zależny od nazwy ani lokalizacji pliku. Konfiguracja zawierająca hasła nie trafia do Git.

API implementuje logowanie, wylogowanie i zmianę hasła administratora; CRUD serii, rejestrację i wyrejestrowanie czujników oraz publiczny odczyt i zapis pomiarów z kluczem `X-API-Key`. Każdy wynik trafia do rzeczywistej hypertable TimescaleDB. Weryfikowane są zakresy serii, znaczniki czasu i autoryzacja. Błędne żądania zwracają Problem Details. Osobne endpointy `/api/simulations` umożliwiają zalogowanemu administratorowi uruchamianie i zatrzymywanie symulacji, a każdy zapisany przez nie wynik nadal przechodzi przez `POST /api/measurements`. Publiczny strumień `GET /api/events` udostępnia nowe pomiary przez Server-Sent Events do aktualizacji wykresów na żywo.

Publiczne ścieżki to `/api/health`, `/api/series`, `/api/series/:id`, `/api/measurements` i `/api/measurements/:id`. Operacje modyfikacji serii i zarządzania czujnikami wymagają `Authorization: Bearer <token>`. Przy zapisie pomiaru wymagany jest klucz czujnika z jednorazowej odpowiedzi `POST /api/sensors`.

Przykładowe logowanie:

```bash
curl -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"TWOJE_HASLO"}'
```

## Symulatory sterowane przez API

Po zalogowaniu administrator może wysłać `POST /api/simulations` z parametrami `seriesId`, `mode` (`history` albo `live`), `pattern` (`sine` albo `random`) oraz opcjonalnie `count`, `intervalMs`, `min`, `max` i `name`. Backend zakłada dedykowany czujnik i przekazuje jego klucz do wykonawcy wewnętrznie, bez umieszczania klucza w odpowiedzi API. Statusy można odczytać przez `GET /api/simulations` i `GET /api/simulations/:id`, a pracę zakończyć przez `POST /api/simulations/:id/stop`. Na razie funkcja udostępniona jest przez REST; widok sterujący w React powstaje oddzielnie. Wykonywanie symulacji wymaga serwera HTTP uruchomionego lokalnie lub na serwerze, a nie samego `Fastify.inject` bez nasłuchiwania.

## Testy

```bash
cd backend
npm run typecheck
npm test
npm run build
npm run test:integration
```

Testy integracyjne wymagają bazy TimescaleDB po uruchomieniu migracji. Pipeline CI uruchamia je na wydzielonej bazie. Generator testowany jest poleceniem:

```bash
python -m unittest discover -s sensor-simulator/tests -v
```

## Generator pomiarów

Po rejestracji czujnika w API ustaw jego klucz w zmiennej środowiskowej:

```bash
export ROVERSENSE_SENSOR_KEY='KLUCZ_OTRZYMANY_PRZY_REJESTRACJI'
python sensor-simulator/src/generator.py --url http://127.0.0.1:3000 \
  --mode history --pattern sine --count 15 --interval 60 --min -40 --max 80
```

Tryb `live` generuje kolejne próbki w określonym interwale. Generator wysyła pomiary wyłącznie przez `POST /api/measurements` i nie zapisuje bezpośrednio do bazy.

## Materiały prowadzącego i hosting

Kontrakt OpenAPI i skrypt testujący znajdują się w katalogu [`instructor/`](instructor/). Konfiguracja serwera Oracle Cloud znajduje się w [server/README.md](server/README.md).
