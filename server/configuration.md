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

Do działania aplikacji potrzebne są porty TCP 22 (SSH), 80 (HTTP i obsługa certyfikatów TLS) oraz 443 (HTTPS).

### Sieć i SSH — wynik kontroli z 19.10.2026

Na podstawie poleceń `ss`, `iptables`, `ip6tables` i `sshd -T` uruchomionych na maszynie:

- Caddy nasłuchuje na portach 80/443, a SSH na 22; backend (3000) i PostgreSQL (5432) nasłuchują tylko na `127.0.0.1`.
- Reguły `iptables INPUT` dla IPv4 dopuszczają połączenia nawiązane, ICMP, ruch loopback i TCP 22/80/443; pozostałe nowe połączenia odrzucają.
- UFW nie jest zainstalowany; filtrowanie IPv4 jest skonfigurowane bezpośrednio w `iptables`.
- `ip6tables INPUT` ma politykę `ACCEPT`, bez pokazanych reguł filtrujących IPv6. Nie weryfikowano innych mechanizmów filtracji IPv6.
- `rpcbind` nasłuchuje na porcie 111 w IPv4 i IPv6; reguły IPv4 INPUT odrzucają nowe zewnętrzne połączenia na ten port.
- SSH: logowanie hasłem i keyboard-interactive są wyłączone, logowanie kluczem włączone; `PermitRootLogin without-password` zezwala na logowanie root kluczem.
- `systemctl --failed` nie wykazał uszkodzonych jednostek.

RPC, IPv6 i SSH pozostawiono bez dalszych zmian. **Nie zweryfikowano reguł OCI VCN/NSG/security list**, dlatego test konfiguracji VM nie zastępuje sprawdzenia polityki ruchu sieciowego w panelu Oracle.

## Katalogi i konta

`/srv/roversense/` zawiera katalog `incoming/<SHA>` na przesyłane wydania, chronione `releases/<SHA>` na zaakceptowane wersje oraz dowiązanie `current` wskazujące aktywne wydanie. Katalog `incoming` ma uprawnienia `0700` i należy do `roversense-deploy`; `releases` i zapisane w nim wydania należą do `root`.

- `roversense` — konto systemowe uruchamiające backend i migracje, bez interaktywnego logowania;
- `roversense-deploy` — konto do przesyłania paczek przez SSH; ma prawo zapisu w `/srv/roversense/incoming`, ale nie w `releases`;
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
| [scripts/roversense-backup](scripts/roversense-backup) | `/usr/local/sbin/roversense-backup` |
| [config/roversense-backup.service](config/roversense-backup.service) | `/etc/systemd/system/roversense-backup.service` |
| [config/roversense-backup.timer](config/roversense-backup.timer) | `/etc/systemd/system/roversense-backup.timer` |

`roversense.service` uruchamia `node dist/server.js` jako `roversense` i restartuje proces po awarii. `roversense-migrate.service` jest usługą jednorazową uruchamiającą `node dist/database/migrate.js` z katalogu aktywnego wydania. Nie trzeba jej włączać przez `systemctl enable`.

Caddy obsługuje statyczny frontend z `/srv/roversense/current/frontend/dist` (z obsługą tras SPA) i przekazuje `/api/*` do `127.0.0.1:3000`, zachowując prefiks `/api`. Certyfikat HTTPS jest obsługiwany przez Caddy.

Po ręcznej zmianie jednostek należy wykonać `sudo systemctl daemon-reload`, a po zmianie Caddy — `sudo caddy validate --config /etc/caddy/Caddyfile` i `sudo systemctl reload caddy`. Pliki wzorcowe nie są automatycznie kopiowane na serwer przez CD.

## Wydania i CI/CD

Workflow [`ci.yml`](../.github/workflows/ci.yml) wykonuje testy backendu z TimescaleDB, testy generatora Pythona, weryfikację skryptów Bash i budowanie Reacta. Przy wdrożeniu wykorzystuje runner Ubuntu ARM64, instaluje zależności produkcyjne backendu i tworzy archiwum ze skompilowanym JavaScriptem, `node_modules`, frontendem `dist`, migracjami oraz generatorem Python.

Gotowa paczka trafia przez SSH do `/srv/roversense/incoming/<40-znakowy SHA>`. Skrypt [config/roversense-activate](config/roversense-activate) kopiuje jej zawartość do `releases`, przypisuje pliki do `root`, przełącza `current`, uruchamia migracje, restartuje backend i sprawdza `/api/health`. W przypadku błędu próbuje przywrócić poprzednią wersję aplikacji. **Migracje schematu bazy nie są automatycznie cofane.**

GitHub Actions używa sekretów `ROVERSENSE_SSH_KEY` i `ROVERSENSE_KNOWN_HOSTS`. Klucze prywatne i zawartość sekretów nie są przechowywane w repozytorium.

Workflow jest uruchamiany ręcznie (`workflow_dispatch`) albo po wypchnięciu zmian do `main` (po scaleniu konfiguracji CD). Wdrożenie wymaga zaliczenia zadań CI. Gałąź robocza może być wdrożona ręcznie do weryfikacji przed scaleniem.

## Kontrola wydań i powrót do poprzedniej wersji

Aktywna wersja to cel dowiązania `/srv/roversense/current`; gotowe wydania znajdują się w `/srv/roversense/releases/<SHA>`. Wdrożenie wymaga pełnego 40-znakowego SHA commita.

```bash
readlink -f /srv/roversense/current
sudo find /srv/roversense/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
```

Powrót do istniejącego starszego wydania wykonuje się ręcznie (po wyborze odpowiedniego SHA i sprawdzeniu zgodności bazy danych):

```bash
sudo /usr/local/sbin/roversense-activate <PELNE_40_ZNAKOWE_SHA>
```

Skrypt uruchamia migracje właściwe dla wybranego wydania, restartuje backend i sprawdza `/api/health`. **Cofnięcie wersji aplikacji nie cofa migracji ani danych w PostgreSQL.** Nie usuwać katalogu aktualnie wskazywanego przez `current`. Nie jest skonfigurowana automatyczna retencja wydań; starsze, nieaktywne katalogi usuwa się dopiero po ocenie możliwości powrotu i zajętości dysku:

```bash
sudo du -sh /srv/roversense/releases/*
df -h /
```

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

Na serwerze utworzono prywatny katalog `/var/backups/roversense/postgresql` (właściciel `postgres`, tryb `0700`) oraz wykonano pierwszy ręczny `pg_dump -Fc` i `pg_dumpall --globals-only` (bez testu odtworzenia). Skrypt [scripts/roversense-backup](scripts/roversense-backup) ma tworzyć pełną kopię bazy i ról z sumami SHA-256 oraz usuwać lokalne kopie starsze niż 14 dni. Timer [config/roversense-backup.timer](config/roversense-backup.timer) jest włączony (`active (waiting)`), z uruchomieniem codziennie o **02:30 UTC**; pierwsza planowana próba to 20.10.2026. **Nie potwierdzono jeszcze wykonania backupu przez timer ani możliwości odtworzenia danych.** Backup pozostaje wyłącznie na tej samej maszynie. Kopia poza serwerem, test odtworzenia, audyt zapór OCI/UFW oraz konto administratora pozostają do zrobienia.

### Kontrola backupów

```bash
sudo systemctl status roversense-backup.timer --no-pager
sudo systemctl status roversense-backup.service --no-pager
sudo journalctl -u roversense-backup.service -n 30 --no-pager
sudo -u postgres bash -c 'ls -lh /var/backups/roversense/postgresql/backup-*/'
```

Aby sprawdzić sumy kontrolne plików wybranej kopii, należy podstawić jej rzeczywistą nazwę katalogu:

```bash
sudo -u postgres bash -c '
  cd /var/backups/roversense/postgresql/backup-20261019T183135Z
  sha256sum -c SHA256SUMS
'
```

W pierwszym ręcznym backupie `pg_dump` zgłosił ostrzeżenie TimescaleDB dotyczące `continuous_agg`, ale zakończył się sukcesem. Polecenie `pg_restore -l` generuje tylko spis obiektów w archiwum — nie jest testem odzyskiwania danych. Pierwsze wykonanie timera, odtworzenie bazy i zgodność plików z archiwum nie zostały jeszcze potwierdzone.

### Odtworzenie środowiska po awarii VM

Poniższa kolejność przedstawia wymagane czynności, a nie przetestowany, automatyczny instalator kompletnego serwera:

1. Utworzyć nową maszynę Ubuntu 24.04 na ARM64. Skonfigurować sieć OCI, SSH, DNS i dostęp przez 80/443 zgodnie z potrzebami aplikacji.
2. Zainstalować Node.js 24 i Caddy oraz PostgreSQL 17 z TimescaleDB. Skrypty `deploy/scripts/install-db.sh` i `bootstrap-db.sh` opisują przygotowanie **nowej** bazy; nie uruchamiać ponownie instalatora bez analizy istniejącego środowiska.
3. Odtworzyć konta `roversense` (usługowe, bez logowania) i `roversense-deploy` (SSH z kluczem), katalogi `/srv/roversense/incoming` i `/srv/roversense/releases`, odpowiednie prawa dostępu i konfigurację sudo.
4. Skopiować wzorce konfiguracji z `server/config/` oraz skrypt `server/scripts/roversense-backup` do ścieżek wskazanych w tabeli powyżej. Przywrócić `/etc/roversense/backend.env` i klucze SSH z bezpiecznego źródła poza repozytorium. Załadować jednostki przez `systemctl daemon-reload` i sprawdzić Caddy.
5. Przed uruchomieniem aplikacji odtworzyć role i bazę PostgreSQL z **zweryfikowanej** kopii, stosując właściwą procedurę dla TimescaleDB i kompatybilnych wersji. **Procedury odtwarzania nie przetestowano na tym środowisku.**
6. Uruchomić wdrożenie gotowych artefaktów z GitHub Actions, sprawdzić migracje, `/api/health`, HTTPS, prawa katalogów i działanie timera backupu.

Obecne lokalne backupy nie chronią przed utratą całej VM. Kopia poza serwerem i test rzeczywistego odtworzenia pozostają do wykonania.
