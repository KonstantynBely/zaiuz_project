# Serwer RoverSense

RoverSense działa na maszynie Oracle Cloud Infrastructure z Ubuntu 24.04 LTS (ARM64). Caddy udostępnia frontend React przez HTTPS i przekazuje żądania `/api` do backendu Fastify, który korzysta z lokalnej bazy PostgreSQL + TimescaleDB.

- Adres aplikacji: https://roversense.duckdns.org
- [Konfiguracja serwera i obsługa](configuration.md)
- [Konfiguracje usług i wdrożeń](config/)

Aplikacja jest budowana i testowana w GitHub Actions. Na serwer trafiają gotowe artefakty; wdrożeniem zarządzają skrypt aktywacji i usługi `systemd`. Pliki w `config/` są wersjonowanymi wzorcami ustawień serwera, a nie sekretami ani automatycznie instalowaną konfiguracją.
