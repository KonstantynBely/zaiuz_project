# RoverSense — model danych i diagram ERD

Diagram odpowiada migracji database/migrations/001_initial.sql w PostgreSQL 17 z rozszerzeniem TimescaleDB. Tabela measurements jest hypertable dzieloną według timestamp.

```mermaid
erDiagram
    admins ||--o{ access_tokens : "posiada"
    series ||--o{ sensors : "przypisuje"
    series ||--o{ measurements : "gromadzi"
    sensors |o--o{ measurements : "wysyla"
    series ||--o{ simulation_runs : "uruchamia"
    sensors |o--o{ simulation_runs : "sensor_symulacji"
    sensors |o--o{ rejected_measurements : "odrzucenia"

    admins {
        bigint id PK
        text username UK
        text password_hash
        timestamptz created_at
    }
    access_tokens {
        text token_hash PK
        bigint admin_id FK
        timestamptz expires_at
        timestamptz revoked_at
    }
    series {
        bigint id PK
        text name
        double min_value
        double max_value
        char color
        text unit
        text icon
    }
    sensors {
        bigint id PK
        bigint series_id FK
        text name
        char api_key_hash UK
        timestamptz registered_at
        timestamptz revoked_at
    }
    measurements {
        bigint id "czesc PK"
        timestamptz timestamp "czesc PK"
        bigint series_id FK
        bigint sensor_id FK "nullable"
        double value
    }
    simulation_runs {
        bigint id PK
        bigint series_id FK
        bigint sensor_id FK "nullable"
        text state
        jsonb parameters
        int accepted_count
        int rejected_count
        timestamptz started_at
        timestamptz finished_at
        text error_summary
    }
    rejected_measurements {
        bigint id PK
        timestamptz occurred_at
        bigint sensor_id FK "nullable"
        text reason
        int http_status
    }
```

## Relacje i integralność

- Usunięcie serii usuwa powiązane czujniki, pomiary i uruchomienia symulatorów (FK ON DELETE CASCADE).
- Usunięcie sensora ustawia sensor_id na NULL w zależnych tabelach (ON DELETE SET NULL). **Wyrejestrowanie** sensora nie usuwa jego rekordu — ustawia revoked_at, a dotychczasowe pomiary pozostają.
- Tokeny dostępu są powiązane z kontem administratora i usuwane wraz z nim.
- Klucz główny measurements obejmuje **(timestamp, id)** z powodu wymagań hypertable; osobny indeks przyspiesza odczyt po id.
- Indeks measurements_series_time_idx przyspiesza filtrowanie serii i czasu. Ograniczenie CHECK (min_value < max_value) dotyczy serii, a zakres pomiaru jest walidowany transakcyjnie przez backend.
- password_hash, api_key_hash i token_hash przechowują skróty, nigdy jawne hasła czy klucze.

## Ścieżka pomiaru

Generator Python lub backendowy symulator wysyła POST /api/measurements z nagłówkiem X-API-Key. Backend weryfikuje klucz oraz zakres serii i zapisuje wynik w TimescaleDB. Publiczny dashboard pobiera dane przez GET /api/measurements i nasłuchuje /api/events (SSE). Interfejs nie pozwala ręcznie edytować pojedynczych wyników.

*To źródło diagramu do przyszłego PDF, a nie gotowe zgłoszenie E2.*
