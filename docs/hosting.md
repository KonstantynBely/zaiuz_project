# Hosting i środowisko uruchomieniowe

RoverSense jest przygotowywany do uruchomienia na maszynie wirtualnej **Oracle Cloud Infrastructure (OCI) Compute**. Instancję utworzono 15.10.2026, a konfiguracja usług jest realizowana etapami. Serwer HTTPS jest uruchomiony; aplikacja i baza PostgreSQL nie zostały jeszcze wdrożone.

## Instancja

| Parametr | Konfiguracja |
| --- | --- |
| Nazwa | `roversense-server` |
| Region | Frankfurt |
| Usługa | OCI Compute, instancja Always Free |
| Typ | `VM.Standard.A1.Flex` (ARM/Ampere) |
| Procesor i RAM | 1 OCPU, 6 GB RAM |
| System | Ubuntu 24.04 LTS (obraz wybrany przy tworzeniu instancji) |
| Dysk | Domyślny wolumin rozruchowy, bez dodatkowych woluminów |
| Stan w panelu OCI | `Running` |

W terminalu potwierdzono Ubuntu 24.04.5 LTS na ARM64, około 5,8 GiB RAM oraz systemowy system plików o rozmiarze 45 GB.

## Sieć i dostęp

- Sieć VCN: `roversense-vcn`.
- Publiczna podsieć: `roversense-public-subnet`.
- Interfejs podstawowy: `roversense-vnic`.
- Instancja ma przypisany prywatny i publiczny adres IPv4.
- Przy tworzeniu skonfigurowano logowanie SSH za pomocą klucza. Dostęp do Ubuntu przez SSH został potwierdzony.

Adres IP, klucze SSH, hasła i pozostałe sekrety nie są przechowywane w repozytorium.

## Docelowy układ usług

Na jednej maszynie Ubuntu mają działać:

- **Caddy**: uruchomiony serwer HTTPS dla `roversense.duckdns.org`. Docelowo obsłuży statyczny build React + Vite oraz reverse proxy `/api` do backendu.
- **Node.js 24 LTS / Fastify / TypeScript**: REST API dostępne lokalnie za reverse proxy. Na VM potwierdzono Node.js `v24.22.0` i npm `11.19.1`.
- **PostgreSQL + TimescaleDB**: lokalna baza danych; pomiary zapisywane w hypertable partycjonowanej według czasu.
- **Python**: generator danych i procesy symulatorów uruchamiane po stronie serwera. Pomiary trafiają do API przez `POST /api/measurements`, nie bezpośrednio do bazy.
- **systemd**: nadzorowanie procesów backendu i symulatorów.

Docelowo publiczne będą tylko porty HTTP/HTTPS (80/443) i kontrolowany dostęp SSH (22). Porty backendu i PostgreSQL (5432) pozostaną niedostępne z internetu. Reguły muszą zostać ustawione zarówno w OCI, jak i w zaporze Ubuntu.

## Wdrażanie i trwałość danych

Docelowe wdrażanie: **GitHub Actions → testy i build → SSH → OCI VM**. Kod i artefakty wydań powinny być oddzielone od danych PostgreSQL. Przed udostępnieniem aplikacji trzeba skonfigurować certyfikat HTTPS, migracje, backup bazy poza VM, test odtworzenia oraz monitoring dostępności.

**Stan wdrożenia (18.10.2026):** instancja z publicznym IPv4, SSH, domena DuckDNS, Caddy i testowa strona HTTPS działają; Node.js 24 jest zainstalowany. Skrypty bazy znajdują się w repozytorium, lecz instalacja PostgreSQL/TimescaleDB na Oracle, uruchomienie aplikacji, backup i pipeline CD nie zostały jeszcze potwierdzone. Instancja Always Free nie gwarantuje ciągłej dostępności — Oracle może odzyskiwać nieaktywne zasoby.

## Przygotowanie bazy danych na Ubuntu

Skrypty obsługują **Ubuntu 24.04 ARM64** i PostgreSQL **17**. Uruchamia się je na nowej instancji z poziomu katalogu głównego projektu, po sprawdzeniu dostępnego miejsca i upewnieniu się, że nie ma istniejącej bazy do zachowania:

```bash
sudo bash deploy/scripts/install-db.sh
sudo bash deploy/scripts/bootstrap-db.sh
```

Pierwszy skrypt konfiguruje repozytoria pakietów i uruchamia PostgreSQL z TimescaleDB tylko na localhost. Drugi tworzy rolę `roversense` (interaktywnie prosi o hasło przy pierwszym uruchomieniu), bazę `roversense` i rozszerzenie `timescaledb`. Ponowne uruchomienie nie usuwa danych ani nie zeruje hasła istniejącej roli. Skrypty nie instalują aplikacji i nie uruchamiają migracji.

Schemat bazy powstaje oddzielnie przez `npm run db:migrate` w katalogu `backend`, po ustawieniu prywatnego `DATABASE_URL` wskazującego na `127.0.0.1:5432/roversense`. Hasła ani pliku z konfiguracją produkcyjną nie zapisujemy w Git; dostęp do konfiguracji powinien być ograniczony do administratora i usługi backendu. Nie należy używać przykładowego hasła z `.env.example` na VPS-ie.

Powyższe polecenia dotyczą **instalacji na nowym serwerze**, a nie aktualizacji istniejącej bazy. Aktualizacje aplikacji uruchamiają tylko brakujące migracje. Przed migracjami zmieniającymi strukturę należy wykonać backup i sprawdzić możliwość odtworzenia. Po instalacji sprawdź `pg_lsclusters`, `pg_isready -h 127.0.0.1 -p 5432` i `sudo -u postgres psql -d roversense -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';"`. Port 5432 ma pozostać zablokowany w OCI.
