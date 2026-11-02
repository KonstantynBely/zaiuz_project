# Dokumentacja kodu

Funkcje i metody TypeScript/JavaScript mają komentarze JSDoc przy deklaracjach. Komponenty opisują odpowiedzialność widoku i właściciela stanu, a callbacki — wykonywaną operację lub etap cyklu asynchronicznego. Python używa docstringów z opisem argumentów, wyniku i wyjątków. Skrypty operacyjne opisują wymagane uprawnienia, wejście, skutki uboczne i ograniczenia cofania zmian.

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

## Zasady utrzymania komentarzy

- Pierwsze zdanie wyjaśnia zadanie funkcji. Dalszy opis podaje założenia, skutki uboczne i istotny sposób wykonania, zamiast powtarzać każdą instrukcję.
- Typy argumentów pozostają w TypeScript. `@param`, `@returns` i `@throws` doprecyzowują kontrakt tam, gdzie sama sygnatura nie opisuje jednostek, odpowiedzialności za zasoby lub przyczyny odmowy.
- ID traktuje się jako wartości nieprzezroczyste. Backend sprawdza BIGINT tekstowo, aby nie utracić precyzji przez Number. Daty API wymagają jawnej strefy; prezentacja pomiarów używa UTC.
- Interwały backendu są w milisekundach, formularz i CLI Pythona podają sekundy. Czas życia tokenu z API jest w sekundach, a expiresAt w UI w milisekundach.
- Dokumentacja efektów i workerów obejmuje anulowanie, odrzucanie spóźnionych wyników oraz cleanup. Po dodaniu nowego timera lub połączenia należy zaktualizować opis właściciela zasobu.
- Komentarze opisują kontrakt i działanie kodu; nie zawierają prawdziwych haseł, kluczy ani tokenów. Stan usług i danych jest częścią diagnostyki środowiska.
- Zmiana zachowania wymaga aktualizacji opisu i odpowiednich testów. Samo dodanie komentarzy nie powinno zmieniać instrukcji wykonywanych przez program.

Opis endpointów i ich rozszerzeń znajduje się w [API](API.md), a przepływ danych między modułami w [architekturze](ARCHITECTURE.md).
