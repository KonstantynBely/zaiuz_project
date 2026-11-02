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

### Sieć i SSH

Konfiguracja dostępu do hosta obejmuje porty publiczne, reguły systemu i reguły sieci OCI. Założenia dla tego wdrożenia:

- Publiczny ruch aplikacji trafia do Caddy przez 80/443; SSH używa portu 22 i uwierzytelniania kluczem.
- Backend i PostgreSQL pozostają na loopback; porty 3000 i 5432 nie są wystawiane publicznie.
- Polityka filtrowania obejmuje IPv4 i IPv6 oraz reguły OCI VCN/NSG/security list.
- Usługi niezwiązane z aplikacją nie wymagają otwierania dodatkowych portów publicznych.

Do diagnostyki konfiguracji hosta służą `ss -lntup`, `iptables -S`, `ip6tables -S`, `sshd -T` i `systemctl --failed`. Reguły sieci OCI są zarządzane osobno w panelu dostawcy. Ta sekcja opisuje założenia dostępu, a nie wynik audytu konkretnej VM.

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

Workflow jest uruchamiany ręcznie (`workflow_dispatch`) albo po wypchnięciu zmian do `main`. Wdrożenie wymaga zaliczenia zadań CI. Ręczne uruchomienie z gałęzi roboczej również może wdrożyć ją na produkcję; nie jest osobnym środowiskiem testowym.

## Kontrola wydań i powrót do poprzedniej wersji

Aktywna wersja to cel dowiązania `/srv/roversense/current`; gotowe wydania znajdują się w `/srv/roversense/releases/<SHA>`. Wdrożenie wymaga pełnego 40-znakowego SHA commita.

```bash
readlink -f /srv/roversense/current
sudo find /srv/roversense/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n'
```

Powrót do istniejącego starszego wydania wykonuje się ręcznie (po wyborze odpowiedniego SHA i sprawdzeniu zgodności bazy danych):

```bash
sudo /usr/local/sbin/roversense-activate 40_ZNAKOWE_SHA_TUTAJ
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

`/api/health` potwierdza działanie procesu HTTP. Backend sprawdza bazę przy starcie; odpowiedź tego endpointu nie potwierdza jej bieżącej dostępności. Wykonawca symulacji i SSE są przewidziane dla jednej instancji backendu, zgodnie z jednostką systemd. Uruchomienie wielu instancji wymaga osobnej koordynacji zadań i zdarzeń.

## Kopie zapasowe i bezpieczeństwo

Baza PostgreSQL jest przechowywana niezależnie od katalogów wydań. Przywrócenie kodu do poprzedniej wersji nie oznacza odzyskania danych z bazy.

Skrypt [scripts/roversense-backup](scripts/roversense-backup) zapisuje pełną kopię bazy i ról z sumami SHA-256 w prywatnym katalogu `/var/backups/roversense/postgresql` (właściciel `postgres`, tryb `0700`) i usuwa kopie starsze niż 14 dni. Timer [config/roversense-backup.timer](config/roversense-backup.timer) przewiduje uruchomienie codziennie o 02:30 według strefy czasowej serwera. Wymaga instalacji i włączenia na VM. Backup w tej lokalizacji pozostaje na tej samej maszynie.

Backup lokalny obejmuje bazę i role. Ochrona przed utratą całej VM wymaga przechowywania kopii również poza nią. Integralność plików, poprawność odtworzenia i uruchomienie aplikacji po odtworzeniu są odrębnymi kontrolami.

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
  cd /var/backups/roversense/postgresql/NAZWA_WYBRANEJ_KOPII
  sha256sum -c SHA256SUMS
'
```

Polecenie `pg_restore -l` generuje spis obiektów w archiwum. Test odzyskiwania danych polega na odtworzeniu kopii w osobnym środowisku i sprawdzeniu odczytu aplikacji; sama lista obiektów ani zgodne sumy plików go nie zastępują.

### Odtworzenie środowiska po awarii VM

Kolejność czynności przy przygotowaniu nowej VM i odtworzeniu danych:

1. Utworzyć nową maszynę Ubuntu 24.04 na ARM64. Skonfigurować sieć OCI, SSH, DNS i dostęp przez 80/443 zgodnie z potrzebami aplikacji.
2. Zainstalować Node.js 24 i Caddy oraz PostgreSQL 17 z TimescaleDB. Skrypty `deploy/scripts/install-db.sh` i `bootstrap-db.sh` opisują przygotowanie **nowej** bazy; nie uruchamiać ponownie instalatora bez analizy istniejącego środowiska.
3. Odtworzyć konta `roversense` (usługowe, bez logowania) i `roversense-deploy` (SSH z kluczem), katalogi `/srv/roversense/incoming` i `/srv/roversense/releases`, odpowiednie prawa dostępu i konfigurację sudo.
4. Skopiować wzorce konfiguracji z `server/config/` oraz skrypt `server/scripts/roversense-backup` do ścieżek wskazanych w tabeli powyżej. Przywrócić `/etc/roversense/backend.env` i klucze SSH z bezpiecznego źródła poza repozytorium. Załadować jednostki przez `systemctl daemon-reload` i sprawdzić Caddy.
5. Przed uruchomieniem aplikacji odtworzyć role i bazę PostgreSQL z kopii o sprawdzonej integralności, stosując procedurę dla TimescaleDB i kompatybilnych wersji.
6. Uruchomić wdrożenie gotowych artefaktów z GitHub Actions, sprawdzić migracje, `/api/health`, HTTPS, prawa katalogów i działanie timera backupu.

Po odtworzeniu potwierdzić odczyt serii i pomiarów, logowanie na koncie testowym oraz dostępność HTTPS. Kopie i katalogi wydań mają niezależną retencję; usunięcie starszego wydania nie może usuwać danych bazy ani jej backupów.
