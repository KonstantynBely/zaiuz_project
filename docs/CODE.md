# Mapa kodu

## Mapa odpowiedzialności

| Obszar | Punkt wejścia i rola |
| --- | --- |
| Uruchomienie HTTP | `backend/src/server.ts`: konfiguracja, kontrola schematu, odzyskiwanie i zamykanie zasobów. |
| Składanie backendu | `backend/src/app.ts`: zależności, strażnicy, trasy i hooki Fastify; samo buildApp nie otwiera portu. |
| HTTP i domena | `backend/src/modules/*/*.routes.ts` rejestrują trasy, kontrolery obsługują HTTP, serwisy reguły, repozytoria SQL. |
| Wspólne reguły | `backend/src/common/`: transakcje, Problem Details i walidacja ID/dat. |
| Baza | `backend/src/database/`: pula i jawnie uruchamiane skrypty migracji/konta. Model i historię SQL opisuje [ERD](ERD.md). |
| Symulacje | `backend/src/modules/simulations/`: lokalny REST czujnika, worker, obserwacje METAR, statusy i kolejka sprzątania. |
| Zdarzenia | `backend/src/modules/events/`: procesowy rejestr odpowiedzi SSE i rozsyłanie zatwierdzonych pomiarów. |
| Interfejs | `frontend/src/App.tsx`: wybór widoku i filtrów; komponenty i `features/` realizują poszczególne widoki. |
| REST/SSE w UI | `useTelemetry.ts` organizuje efekty; `measurementStream.ts` rozstrzyga generacje, duplikaty i kolejność pomiarów. |
| Monitoring symulacji | `simulationPolling.ts` zapewnia szeregowe cykle i odrzucanie starych odpowiedzi; monitor rozdziela błędy serii i statusów. |
| Generator CLI | `sensor-simulator/src/generator.py`: waliduje parametry, tworzy próbki i wysyła je przez API czujnika. |
| Testy | `tests/` i `frontend/tests/`: scenariusze, atrapy i asercje; [testowanie](TESTING.md) oddziela kontrole bez bazy od integracji. |
| Operacje serwera | `deploy/scripts/`, `server/config/`, `server/scripts/`: instalacja, aktywacja, usługi i backup. |

## Konwencje danych

- Identyfikatory z PostgreSQL BIGINT pozostają tekstem, aby nie tracić precyzji przez JavaScript Number.
- Daty przekazywane do API zawierają strefę czasową, a daty pomiarów na pulpicie są wyświetlane w UTC.
- Interwały backendu są w milisekundach, natomiast formularz i generator Pythona używają sekund. Czas życia sesji z API jest w sekundach, a czas wygaśnięcia w UI w milisekundach.

Szczegóły endpointów opisuje [API](API.md), a przepływ danych [architektura](ARCHITECTURE.md).
