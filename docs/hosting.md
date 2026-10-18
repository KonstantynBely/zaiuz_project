# Hosting i infrastruktura

RoverSense korzysta z maszyny wirtualnej Oracle Cloud Infrastructure Compute w regionie Frankfurt. Serwer działa na Ubuntu 24.04 LTS (ARM64), na instancji `VM.Standard.A1.Flex` z 1 OCPU i 6 GB RAM.

## Usługi

- **Caddy** obsługuje HTTPS pod adresem `roversense.duckdns.org` (porty 80 i 443). Obecnie udostępnia stronę testową; po wdrożeniu aplikacji będzie serwować frontend React oraz przekazywać żądania `/api` do backendu.
- **Node.js 24** jest środowiskiem uruchomieniowym backendu Fastify. Dostęp administracyjny do serwera odbywa się przez SSH z użyciem klucza.
- **PostgreSQL 17 + TimescaleDB 2.30.2** działa lokalnie na porcie `5432`, wyłącznie na `localhost`. Baza `roversense` należy do roli `roversense`, a rozszerzenie TimescaleDB jest w niej aktywne.

## Przygotowanie bazy

Skrypty instalacji dla Ubuntu 24.04 ARM64 znajdują się w `deploy/scripts/`:

```bash
sudo bash deploy/scripts/install-db.sh
sudo bash deploy/scripts/bootstrap-db.sh
```

Pierwszy skrypt instaluje i konfiguruje PostgreSQL z TimescaleDB, a drugi tworzy rolę, bazę i rozszerzenie. Hasło roli jest podawane interaktywnie, bez zapisywania go w repozytorium.

Struktura tabel jest definiowana w `database/migrations/001_initial.sql`. Migracje uruchamia się osobno, z katalogu `backend`, poleceniem `npm run db:migrate` po ustawieniu `DATABASE_URL`. Konfiguracja produkcyjna i hasła pozostają poza repozytorium.
