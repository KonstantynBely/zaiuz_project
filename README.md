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

Przed zalogowaniem menu wyświetla tylko funkcje publiczne i dyskretny przycisk „Zaloguj się”. Po uwierzytelnieniu dostępny jest panel zarządzania seriami i sensorami, zmiana hasła oraz panel symulatorów z trybami historycznym i live. Wbudowany symulator pozwala wskazać serię, zakres, algorytm losowy/sinusoidalny, liczbę próbek i interwał; umożliwia Start/Stop oraz pokazuje stan, postęp i błędy zadania. Backend rejestruje dedykowany czujnik przez `POST /api/sensors`, nadaje pomiary przez `POST /api/measurements` i wyrejestrowuje go przez `DELETE /api/sensors/:sensorId` — każda z tych operacji odbywa się przez lokalne HTTP REST. Jednocześnie mogą działać maksymalnie cztery niezależne symulacje; każda posiada własny sensor i klucz. Tryb historyczny wysyła serię próbek bez przerw, a live nadaje próbki w zadanym tempie. Poza danymi syntetycznymi (losowe/sinusoida) można wybrać rzeczywiste obserwacje temperatury z Aviation Weather Center (METAR) dla stacji EPWA, EPKK i EPGD. Backend pobiera dane raz na początku zadania i odtwarza je przez zwykłe POST /api/measurements; nie generuje brakujących wartości. W trybie historycznym zachowane są oryginalne daty obserwacji, w live zachowane są wartości przy bieżących datach transmisji. Źródło to obserwacje ziemskie, nie pomiary z Marsa. Dostępność zależy od zewnętrznego serwisu. Dla METAR wymagane jest wskazanie istniejącej serii w °C o odpowiednim zakresie.

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

## Wydruk, dostępność i materiały do dokumentacji

- **Wydruk:** przycisk w dashboardzie drukuje aktywnie skonfigurowany wykres oraz całą **wczytaną** tabelę spełniającą filtry, bez przycisków, formularzy i paginacji. Limit jednorazowego pobrania wynosi 1000 pomiarów z API; wydruk nie oznacza eksportu całej bazy.
- **Dostępność:** nawigacja „Przejdź do głównej treści”, widoczny fokus, obsługa klawiatury i Escape dla menu mobilnego, inne wzory linii wykresu (nie tylko kolory), etykiety formularzy i komunikaty `role=alert`. Układ posiada media queries od małych szerokości; wynik Lighthouse i realny widok przy 360 px należy potwierdzić w przeglądarce.
- **Bezpieczeństwo:** nagłówki CSP i inne zabezpieczenia są zdefiniowane w `server/config/Caddyfile`; nie są aktywne na produkcji, dopóki ta wersja nie zostanie wdrożona.
- **ERD:** [docs/ERD.md](docs/ERD.md) — diagram Mermaid zgodny z migracją bazy.
- **T5/B3:** [docs/SECURITY.md](docs/SECURITY.md) — opis haszowania haseł i kluczy czujników wraz z dowodami do nagrania.

Materiały końcowe E2 (nagranie, dokumentacja PDF i ZIP) przygotowuje się na podstawie zaakceptowanego, działającego wdrożenia; źródła diagramu i opisu zabezpieczeń nie zastępują tych plików.

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

Po zalogowaniu administrator może wysłać `POST /api/simulations` z parametrami `seriesId`, `mode` (`history` albo `live`), `pattern` (`sine`, `random` lub `observed`) oraz opcjonalnie `count`, `intervalMs`, `min`, `max` i `name`. Dla `observed` wymagany jest `station` (`EPWA`, `EPKK` albo `EPGD`), liczba pomiarów odpowiada otrzymanym obserwacjom, a `min` i `max` wynikają z docelowej serii. Backend wywołuje lokalne REST API do utworzenia i wyrejestrowania dedykowanego czujnika; klucz czujnika zostaje wyłącznie w pamięci workera, bez umieszczania go w odpowiedzi symulacji. Żądania wewnętrzne używają losowego klucza procesu, akceptowanego tylko bezpośrednio przez loopback dla tworzenia i usuwania sensorów — nie wykorzystują ani nie przechowują tokenu sesji administratora. Publiczny kontrakt Bearer/X-API-Key nie jest zmieniany; wylogowanie operatora nie przerywa sprzątania symulacji. Statusy można odczytać przez `GET /api/simulations` i `GET /api/simulations/:id`, a pracę zakończyć przez `POST /api/simulations/:id/stop`. Dostępny jest również widok React ze statusem, postępem i niezależnym zatrzymywaniem każdego zadania. Wykonywanie symulacji wymaga serwera HTTP uruchomionego lokalnie lub na serwerze, a nie samego `Fastify.inject` bez nasłuchiwania.

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

## Źródło danych obserwowanych

Tryb `pattern: "observed"` korzysta z publicznego endpointu [Aviation Weather Center METAR](https://aviationweather.gov/data/api/): temperatury powietrza (`temp`, °C) i czasu obserwacji (`obsTime`) z polskich stacji EPWA (Warszawa), EPKK (Kraków), EPGD (Gdańsk). Zapytanie backendu obejmuje ostatnie 24 godziny, dane są walidowane i przechowywane tymczasowo w pamięci w 60-sekundowym cache, aby ograniczać liczbę zapytań do zewnętrznego API. Jednorazowe pobranie zwraca maksymalnie 100 odczytów na stację; brak dostępnych wartości zgłasza błąd, a nie uruchamia fałszywych danych. W parametrach uruchomienia zapisane zostają identyfikator stacji i źródło `AWC METAR`. Historia pomiarów w bazie jest zapisywana zwykłą ścieżką sensora.
