# Hosting i środowisko uruchomieniowe

RoverSense jest przygotowywany do uruchomienia na maszynie wirtualnej **Oracle Cloud Infrastructure (OCI) Compute**. Poniższe dane opisują konfigurację instancji w panelu OCI z 15.10.2026; instalacja usług aplikacyjnych nie została jeszcze zakończona.

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

Rozmiar dysku, architekturę i wersję działającego systemu należy dodatkowo potwierdzić po zalogowaniu przez SSH.

## Sieć i dostęp

- Sieć VCN: `roversense-vcn`.
- Publiczna podsieć: `roversense-public-subnet`.
- Interfejs podstawowy: `roversense-vnic`.
- Instancja ma przypisany prywatny i publiczny adres IPv4.
- Przy tworzeniu skonfigurowano logowanie SSH za pomocą klucza. Połączenie z poziomu VS Code Remote - SSH wymaga jeszcze weryfikacji.

Adres IP, klucze SSH, hasła i pozostałe sekrety nie są przechowywane w repozytorium.

## Docelowy układ usług

Na jednej maszynie Ubuntu mają działać:

- **Nginx** (lub Caddy): publiczny HTTPS, statyczny build React + Vite oraz reverse proxy `/api` do backendu.
- **Node.js / Fastify / TypeScript**: REST API dostępne lokalnie za reverse proxy.
- **PostgreSQL + TimescaleDB**: lokalna baza danych; pomiary zapisywane w hypertable partycjonowanej według czasu.
- **Python**: generator danych i procesy symulatorów uruchamiane po stronie serwera. Pomiary trafiają do API przez `POST /api/measurements`, nie bezpośrednio do bazy.
- **systemd**: nadzorowanie procesów backendu i symulatorów.

Docelowo publiczne będą tylko porty HTTP/HTTPS (80/443) i kontrolowany dostęp SSH (22). Porty backendu i PostgreSQL (5432) pozostaną niedostępne z internetu. Reguły muszą zostać ustawione zarówno w OCI, jak i w zaporze Ubuntu.

## Wdrażanie i trwałość danych

Docelowe wdrażanie: **GitHub Actions → testy i build → SSH → OCI VM**. Kod i artefakty wydań powinny być oddzielone od danych PostgreSQL. Przed udostępnieniem aplikacji trzeba skonfigurować certyfikat HTTPS, migracje, backup bazy poza VM, test odtworzenia oraz monitoring dostępności.

**Stan wdrożenia:** utworzono i uruchomiono instancję z publicznym IPv4. Działanie SSH, instalacja PostgreSQL/TimescaleDB na ARM64, usługi aplikacji, domena, HTTPS i pipeline CI/CD nie zostały jeszcze potwierdzone. Instancja Always Free nie gwarantuje ciągłej dostępności — Oracle może odzyskiwać nieaktywne zasoby.
