# Konfiguracja i obsługa serwera

## Środowisko

| Element | Konfiguracja |
| --- | --- |
| Hosting | Oracle Cloud Infrastructure Compute, Frankfurt |
| Maszyna | VM.Standard.A1.Flex, ARM64, 1 OCPU, 6 GB RAM |
| System | Ubuntu 24.04 LTS |
| Node.js | 24.22.0 (NodeSource), `/usr/bin/node` |
| Python | 3.12.3 |
| Baza | PostgreSQL 17, TimescaleDB 2.30.2 |
| Reverse proxy | Caddy, HTTPS: `roversense.duckdns.org` |
| API | Fastify na `127.0.0.1:3000` |
| PostgreSQL | `localhost:5432`, niedostępny bezpośrednio z Internetu |

Publicznie potrzebne są porty 22 (SSH), 80 (HTTP do przekierowania/TLS) i 443 (HTTPS). Reguły sieci Oracle Cloud i zapory hosta należy kontrolować osobno; pełny audyt obu warstw nie został jeszcze udokumentowany.

## Katalogi i konta

`/srv/roversense/` zawiera katalog `releases/<SHA>` dla poszczególnych wydań oraz dowiązanie `current` wskazujące aktywne wydanie.

- `roversense` — konto systemowe uruchamiające backend i migracje, bez interaktywnego logowania;
- `roversense-deploy` — konto do przesyłania paczek przez SSH; ma prawo zapisu w `/srv/roversense/releases`;
- `root` — właściciel `/srv/roversense`, chronionych konfiguracji i skryptu aktywacji.

Konto wdrożeniowe korzysta z klucza SSH (bez logowania hasłem). Reguła w `/etc/sudoers.d/roversense-deploy` pozwala mu uruchamiać tylko `/usr/local/sbin/roversense-activate`. Odpowiedni wzorzec jest w [config/roversense-deploy.sudoers](config/roversense-deploy.sudoers).

Produkcja nie wymaga pobierania repozytorium przez `git clone` ani uruchamiania kompilacji na VM.

## Baza danych

Instalacja korzysta ze skryptów [install-db.sh](../deploy/scripts/install-db.sh) i [bootstrap-db.sh](../deploy/scripts/bootstrap-db.sh), przeznaczonych dla Ubuntu 24.04 ARM64:

```bash
sudo bash deploy/scripts/install-db.sh
sudo bash deploy/scripts/bootstrap-db.sh
```

Pierwszy przygotowuje PostgreSQL 17 i TimescaleDB, ustawia `listen_addresses = localhost` oraz `shared_preload_libraries = 'timescaledb'`. Drugi zakłada rolę i bazę `roversense` oraz rozszerzenie TimescaleDB. Hasło roli wprowadza się interaktywnie.

Tabele tworzą migracje z `database/migrations/`. Na serwerze uruchamia je `roversense-migrate.service` podczas aktywacji wydania. Migracje są ewidencjonowane w `schema_migrations` i nie wymagają instalowania pakietów developerskich na VM.

Kontrola bazy:

```bash
pg_lsclusters
sudo -u postgres psql -d roversense -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
sudo -u postgres psql -d roversense -c "SELECT hypertable_name FROM timescaledb_information.hypertables;"
```

## Konfiguracja backendu

Zmienne środowiskowe backendu są przechowywane poza repozytorium w `/etc/roversense/backend.env`, z właścicielem `root:roversense` i trybem `0640`. Sam katalog `/etc/roversense` ma tryb `0750`.

Wymagane wartości:

| Zmienna | Zastosowanie |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `127.0.0.1` |
| `PORT` | `3000` |
| `DATABASE_URL` | połączenie do bazy `roversense` na lokalnym PostgreSQL |

Wartość `DATABASE_URL` zawiera hasło; znaki specjalne w haśle muszą być zakodowane zgodnie z URL. Pliku z rzeczywistą zawartością nie umieszcza się w Git. Obie usługi `systemd` odczytują go przez `EnvironmentFile`.

## Usługi systemd i Caddy

Konfiguracje odpowiadają użytym jednostkom:

| Plik w repozytorium | Lokalizacja na serwerze |
| --- | --- |
| [config/roversense.service](config/roversense.service) | `/etc/systemd/system/roversense.service` |
| [config/roversense-migrate.service](config/roversense-migrate.service) | `/etc/systemd/system/roversense-migrate.service` |
| [config/Caddyfile](config/Caddyfile) | `/etc/caddy/Caddyfile` |
| [config/roversense-deploy.sudoers](config/roversense-deploy.sudoers) | `/etc/sudoers.d/roversense-deploy` |
| [config/roversense-activate](config/roversense-activate) | `/usr/local/sbin/roversense-activate` |

`roversense.service` uruchamia `node dist/server.js` jako `roversense` i restartuje proces po awarii. `roversense-migrate.service` jest usługą jednorazową uruchamiającą `node dist/database/migrate.js` z katalogu aktywnego wydania. Nie trzeba jej włączać przez `systemctl enable`.

Caddy obsługuje statyczny frontend z `/srv/roversense/current/frontend/dist` (z obsługą tras SPA) i przekazuje `/api/*` do `127.0.0.1:3000`, zachowując prefiks `/api`. Certyfikat HTTPS jest obsługiwany przez Caddy.

Po ręcznej zmianie jednostek należy wykonać `sudo systemctl daemon-reload`, a po zmianie Caddy — `sudo caddy validate --config /etc/caddy/Caddyfile` i `sudo systemctl reload caddy`. Pliki wzorcowe nie są automatycznie kopiowane na serwer przez CD.

## Wydania i CI/CD

Workflow [`ci.yml`](../.github/workflows/ci.yml) wykonuje testy backendu z TimescaleDB, testy generatora Pythona, weryfikację skryptów Bash i budowanie Reacta. Przy wdrożeniu wykorzystuje runner Ubuntu ARM64, instaluje zależności produkcyjne backendu i tworzy archiwum ze skompilowanym JavaScriptem, `node_modules`, frontendem `dist`, migracjami oraz generatorem Python.

Gotowa paczka trafia przez SSH do `/srv/roversense/releases/<40-znakowy SHA>`. Skrypt [config/roversense-activate](config/roversense-activate) przełącza `current`, uruchamia migracje, restartuje backend i sprawdza `/api/health`. W przypadku błędu próbuje przywrócić poprzednią wersję aplikacji. **Migracje schematu bazy nie są automatycznie cofane.**

GitHub Actions używa sekretów `ROVERSENSE_SSH_KEY` i `ROVERSENSE_KNOWN_HOSTS`. Klucze prywatne i zawartość sekretów nie są przechowywane w repozytorium.

Workflow jest uruchamiany ręcznie (`workflow_dispatch`) albo po wypchnięciu zmian do `main` (po scaleniu konfiguracji CD). Wdrożenie wymaga zaliczenia zadań CI. Gałąź robocza może być wdrożona ręcznie do weryfikacji przed scaleniem.

## Podstawowa kontrola

```bash
sudo systemctl status roversense.service --no-pager
sudo systemctl status roversense-migrate.service --no-pager
sudo journalctl -u roversense.service -n 50 --no-pager
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS https://roversense.duckdns.org/api/health
curl -I https://roversense.duckdns.org/
readlink -f /srv/roversense/current
```

Prawidłowa odpowiedź API: `{"status":"ok"}`. Dla strony głównej oczekiwane HTTP 200.

## Kopie zapasowe i bezpieczeństwo

Baza PostgreSQL jest przechowywana niezależnie od katalogów wydań. Przywrócenie kodu do poprzedniej wersji nie oznacza odzyskania danych z bazy.

Automatyczny backup PostgreSQL, test odtwarzania, pełna kontrola zapór OCI/UFW i inicjalizacja konta administratora pozostają osobnymi czynnościami administracyjnymi; nie należy traktować ich jako wykonanych na podstawie samego działającego HTTPS i `/api/health`.
