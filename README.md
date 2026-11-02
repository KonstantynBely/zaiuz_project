# RoverSense

Aplikacja do zbierania i przeglądania serii pomiarowych z czujników, przygotowana na przedmiot **Zaawansowane Aplikacje Internetowe**, semestr zimowy 2026/2027.

Backend: Node.js 24, Fastify i TypeScript. Frontend: React, Vite i TypeScript. Baza: PostgreSQL 17 z TimescaleDB. Niezależny generator czujnika korzysta ze standardowej biblioteki Python 3.12+.

## Funkcje

- Publiczny wykres, ostatnie wartości serii i historia pomiarów; filtry dat i serii, skala procentowa lub jednostki wybranej serii.
- Aktualizacje pomiarów przez SSE; po ponownym połączeniu odświeżenie danych przez REST.
- Logowanie administratora, zmiana hasła, zarządzanie seriami i rejestracja czujników. Klucz czujnika jest ujawniany tylko przy rejestracji.
- Do czterech równoległych symulacji: dane losowe, sinusoida albo odtwarzanie obserwacji temperatury METAR. Każda symulacja wysyła pomiary przez API dedykowanego czujnika.
- Responsywny interfejs, obsługa klawiatury i wydruk wykresu z całą wczytaną tabelą. Jednorazowy odczyt obejmuje maksymalnie 1000 pomiarów; paginacja tabeli dotyczy tych danych, a nie całej bazy.

Pojedynczych pomiarów nie można edytować ani usuwać. Zapis wymaga `X-API-Key` czujnika; token administratora go nie zastępuje. Usunięcie serii usuwa także jej czujniki i pomiary. Wyrejestrowanie samego czujnika zachowuje historię.

## Uruchomienie nowego środowiska lokalnego

Potrzebne są Node.js 24, Docker Compose i Python 3.12+. Poniższa inicjalizacja dotyczy nowej bazy lokalnej. Działające wdrożenie ma własną konfigurację i dane.

```bash
cp .env.example .env
```

Uzupełnij lokalnie `ADMIN_USERNAME` i `ADMIN_PASSWORD` w `.env`; hasło startowe musi mieć co najmniej 12 znaków i najwyżej 72 bajty UTF-8. Następnie w Bash / WSL / Git Bash:

```bash
docker compose --env-file .env up -d
cd backend
npm ci
set -a
source ../.env
set +a
npm run db:migrate
npm run db:seed-admin
npm run dev
```

`db:seed-admin` tworzy lub aktualizuje konto i unieważnia jego poprzednie sesje. W PowerShell ustaw odpowiednie zmienne `$env:...` zamiast używać `source`.

W drugim terminalu:

```bash
cd frontend
npm ci
npm run dev
```

Frontend: `http://127.0.0.1:5173`. API: `http://127.0.0.1:3000`. Vite przekazuje `/api` do backendu. `.env` i rzeczywiste dane dostępowe nie są wersjonowane.

## Sprawdzanie kodu bez bazy

```bash
cd backend
npm run typecheck
npm test
npm run build
```

```bash
cd frontend
npm test
npm run build
npm run test:browser
```

Test przeglądarkowy wymaga Chrome, Chromium albo Edge; niestandardową ścieżkę można podać w `CHROME_PATH`. Uruchamia build produkcyjny i lokalne atrapy API w pamięci, sprawdzając ekran od 320 do 1440 px, skalę wykresu, zaznaczanie, pusty stan, wydruk i logowanie. Nie korzysta z backendu ani bazy.

Z głównego katalogu:

```bash
python -m unittest discover -s sensor-simulator/tests -v
```

Testy integracyjne wymagają osobnej lokalnej bazy zakończonej `_test` i zmiennej `TEST_DATABASE_URL`. Nie korzystają automatycznie z `DATABASE_URL`. Procedury i scenariusze opisuje [testowanie aplikacji](docs/TESTING.md).

## Podgląd interfejsu

`npm run dev` w katalogu `frontend`, następnie `http://127.0.0.1:5173/?preview=1`: podgląd z lokalnymi próbkami, bez backendu. Próbki nie są zapisywane i służą wyłącznie sprawdzaniu wyglądu UI. Build produkcyjny nie zawiera tego zestawu danych i nie włącza podglądu.

Do ręcznego sprawdzenia builda produkcyjnego użyj `npm run build` i `npm run preview` (domyślnie port 4173). Działające lokalne API jest potrzebne dla proxy `/api`. Pomiar Lighthouse produkcyjnej aplikacji wykonuj na tym buildzie lub na świadomie wybranym wdrożeniu. CI dodatkowo sprawdza dostępność podglądu DEV; to osobny test.

## Generator czujnika

Po rejestracji czujnika ustaw jego jednorazowy klucz w środowisku i dopasuj zakres do serii:

```bash
export ROVERSENSE_SENSOR_KEY='KLUCZ_TESTOWEGO_CZUJNIKA'
python sensor-simulator/src/generator.py --url http://127.0.0.1:3000 \
  --mode history --pattern sine --count 15 --interval 60 --min -30 --max 60
```

Tryb `history` nadaje próbkom daty z przeszłości i wysyła je bez oczekiwania. `live` wysyła je w podanym odstępie, w sekundach. Wysyłane wartości zachowują precyzję; zaokrąglenie dotyczy tylko komunikatów w terminalu. Generator nie wymaga pakietów zewnętrznych i nie zapisuje bezpośrednio do bazy.

Backendowy symulator jest odrębnym wykonawcą TypeScript. Pobiera obserwacje METAR z [Aviation Weather Center](https://aviationweather.gov/data/api/) dla EPWA, EPKK i EPGD: temperaturę w °C oraz datę obserwacji z ostatnich 24 godzin, do 100 odczytów na stację, z cache 60 s. W trybie historycznym zachowuje czas obserwacji, a w live nadaje bieżący czas odtwarzania. Brak obserwacji zgłasza błąd. Serie METAR muszą mieć jednostkę °C lub C i obejmować zakres obserwowanych temperatur.

## Dokumentacja

- [Dokumentacja aplikacji](docs/README.md): architektura, API, model danych, bezpieczeństwo, testowanie i mapa kodu.
- [Materiały referencyjne](instructor/README.md): kontrakt OpenAPI i skrypt testowy.
- [Wdrożenie](server/README.md): konfiguracje Caddy, systemd, instalacji bazy i backupów.

Ilustracja `frontend/src/assets/rover-hero.svg` jest autorskim rysunkiem inspirowanym łazikami marsjańskimi.
