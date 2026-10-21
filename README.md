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

Frontend wyświetla serie i pomiary z publicznego API jako marsjański pulpit telemetrii. Dostępne są filtry serii i dat (szybkie okresy lub własne daty od–do w czasie lokalnym), porównanie wykresów w procentach zakresu oraz rzeczywiste wartości pojedynczej serii, tabela pomiarów w osobnych kolumnach z paginacją i precyzyjnym zaznaczaniem punktu. Dane są automatycznie uzupełniane z publicznego strumienia SSE `/api/events`. Po zerwaniu połączenia EventSource sam ponawia próbę, a frontend odświeża odczyty przez REST. Ograniczenie pojedynczego pobrania to 1000 pomiarów, również przy zastosowanym zakresie dat.

Przed zalogowaniem menu wyświetla tylko funkcje publiczne i dyskretny przycisk „Zaloguj się”. Po uwierzytelnieniu dostępny jest panel zarządzania seriami i sensorami, zmiana hasła oraz panel symulatorów z trybami historycznym i live. Wbudowany symulator pozwala wskazać serię, zakres, algorytm losowy/sinusoidalny, liczbę próbek i interwał; umożliwia Start/Stop oraz pokazuje stan, postęp i błędy zadania. Backend sam rejestruje dedykowany sensor i kieruje pomiary przez `POST /api/measurements`. W danej chwili może pracować jedna symulacja. Symulator historyczny wysyła serię próbek z przeszłymi znacznikami czasu bez przerw, a live nadaje próbki w zadanym tempie. Oba tryby generują syntetyczne wartości.

Klucz API ręcznie rejestrowanego czujnika można skopiować tylko bezpośrednio po jego utworzeniu; lista czujników go nie ujawnia. Usuwanie serii usuwa powiązane czujniki i pomiary, dlatego wymaga potwierdzenia. Token logowania istnieje tylko w pamięci karty, nie w localStorage; odświeżenie strony oznacza konieczność ponownego logowania.

Lokalny podgląd wyglądu bez bazy i backendu:

```bash
cd frontend
npm ci
npm run dev
```

Otwórz `http://127.0.0.1:5173/?preview=1`. W trybie developerskim (`npm run dev`) wyświetlane są wyłącznie przykładowe dane, generowane w przeglądarce; nie są wysyłane do API ani zapisywane w bazie. Aby zobaczyć rzeczywiste odczyty, uruchom backend lokalnie, otwórz stronę bez parametru `preview` i skorzystaj z proxy Vite (`/api` → `127.0.0.1:3000`). Podgląd demonstracyjny jest wyłączony w buildzie produkcyjnym.

Do przetestowania panelu administratora lokalnie potrzebny jest **działający backend z bazą i lokalnym kontem administratora** (zobacz „Uruchomienie lokalne” wyżej). Otwórz aplikację bez `?preview=1`, kliknij „Zaloguj się” na dole menu, a po uwierzytelnieniu wybierz „Serie pomiarowe”, „Czujniki” lub „Symulatory”. Zalecany scenariusz: utwórz serię → przypisz czujnik → skopiuj jednorazowy klucz → uruchom generator Python → sprawdź wyniki na dashboardzie → wyrejestruj czujnik. Osobno uruchom symulator live, przejdź na wykres i sprawdź aktualizację SSE; następnie wróć, zatrzymaj symulację i przetestuj tryb historyczny. Sprawdź własny zakres dat, kliknięcie wartości w tabeli, widok przy 360 px i podgląd wydruku. Testuj na lokalnej bazie, nie na danych produkcyjnych.

Testy grupowania pomiarów dla dashboardu: `cd frontend && npm run test`. TypeScript i build: `npm run typecheck && npm run build`.

Interfejs nie udostępnia dodawania ani edytowania pojedynczych pomiarów. Wszystkie dane generator zapisuje przez API czujnika.

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
