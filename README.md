# RoverSense

RoverSense to aplikacja internetowa do zbierania i przeglądania serii pomiarowych pochodzących z czujników IoT, inspirowana telemetrią robotów mobilnych. Projekt realizowany w ramach przedmiotu **Zaawansowane Aplikacje Internetowe** (semestr zimowy 2026/2027).

## Technologie

Backend: Node.js, Fastify, TypeScript. Frontend: React, Vite, TypeScript. Baza: PostgreSQL + TimescaleDB (pomiary jako hypertable). Generator: Python 3.

## Uruchomienie lokalne

Wymagane: Node.js 22+, Python 3.12+ i Docker z Docker Compose. W katalogu głównym projektu:

```bash
cp .env.example .env
docker compose --env-file .env up -d
```

W dwóch terminalach uruchom backend i frontend:

```bash
cd backend
npm install
set -a && source ../.env && set +a  # Linux / WSL / Git Bash
npm run db:migrate
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

Otwórz `http://127.0.0.1:5173`. Vite kieruje żądania `/api` do backendu pod adresem `http://127.0.0.1:3000`. Przed uruchomieniem backendu trzeba ustawić `DATABASE_URL` w środowisku. Powyższy przykład ładuje `.env` dla Bash. W PowerShell można ustawić `$env:DATABASE_URL` na wartość z `.env.example` przed uruchomieniem skryptów. Migracje wymagają PostgreSQL z rozszerzeniem TimescaleDB.

## Aktualnie zaimplementowane

- `GET /api/health` — status aplikacji.
- `GET /api/series` i `GET /api/series/{id}` — rzeczywisty odczyt z PostgreSQL; pusta lista, jeżeli nie utworzono jeszcze serii.
- Migracja inicjalizująca relacyjne tabele i hypertable `measurements`.
- Strona React pokazująca dostępność API i listę istniejących serii.
- Generator konsolowy z trybem historycznym/live i wysyłaniem pomiarów przez `POST /api/measurements`. Do użycia po dodaniu obsługi rejestracji czujników i zapisu wyników w API.
- Testy jednostkowe, integracyjne TimescaleDB i workflow GitHub Actions.

Pozostałe operacje wymagane przez kontrakt API, w szczególności uwierzytelnianie, tworzenie serii i czujników oraz przyjmowanie pomiarów, nie są jeszcze zaimplementowane.

## Testy

```bash
cd backend
npm test
npm run typecheck
npm run build
npm run test:integration
```

Test integracyjny wymaga działającej bazy po migracjach. Generator jest testowany przez:

```bash
python -m unittest discover -s sensor-simulator/tests -v
```

## Generator

Generator pobiera klucz czujnika z `ROVERSENSE_SENSOR_KEY`, aby nie wpisywać go w argumentach polecenia. Po uruchomieniu API z obsługą czujników:

```bash
export ROVERSENSE_SENSOR_KEY='KLUCZ_OTRZYMANY_PRZY_REJESTRACJI'
python sensor-simulator/src/generator.py --url http://127.0.0.1:3000 --mode history --pattern sine --count 15 --interval 60 --min -40 --max 80
```

Tryb `live` generuje wyniki w zadanym interwale. Każda próbka jest przesyłana wyłącznie przez `POST /api/measurements` z nagłówkiem `X-API-Key`; generator nie zapisuje bezpośrednio do bazy.

## Kontrakt API

Oryginalny plik OpenAPI i skrypt testowy z materiałów prowadzącego znajdują się w [`instructor/`](instructor/). Pliki te nie są modyfikowane.

## Hosting

Konfigurację instancji Oracle Cloud i założenia wdrożenia opisano w [docs/hosting.md](docs/hosting.md).
