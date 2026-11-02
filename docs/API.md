# API — notatki użytkowe

Wszystkie ścieżki mają prefiks `/api`. Żądania z body używają `Content-Type: application/json`. Standardowy kontrakt zasobów znajduje się w [specyfikacji OpenAPI](../instructor/zai-api-26z.yaml); poniżej zebrano sposób korzystania z niego i rozszerzenia aplikacji.

## Dostęp

| Operacje | Uwierzytelnienie |
| --- | --- |
| Healthcheck, odczyty serii i pomiarów, strumień SSE | Publiczne. |
| Logowanie | Login i hasło w JSON. |
| Zarządzanie seriami i czujnikami, sesją oraz symulacjami | `Authorization: Bearer TOKEN`. |
| Zapis pomiaru | `X-API-Key: KLUCZ_CZUJNIKA`; sam token administratora nie wystarcza. |

`POST /api/auth/login` zwraca `accessToken`, `tokenType: "Bearer"` i `expiresIn` w sekundach. `POST /api/auth/logout` cofa token, a `PUT /api/auth/password` przyjmuje `currentPassword` i `newPassword`. Zmiana hasła unieważnia dotychczasowe sesje.

## Serie, czujniki i pomiary

| Zasób | Operacje |
| --- | --- |
| `/api/series` | GET listy, POST nowej serii. |
| `/api/series/:seriesId` | GET opisu, PUT pełnej aktualizacji, DELETE serii i jej zależności. |
| `/api/sensors` | GET aktywnych czujników bez kluczy, POST rejestracji z jednorazowym `apiKey`. |
| `/api/sensors/:sensorId` | GET opisu, DELETE wyrejestrowania; wcześniejsze pomiary pozostają. |
| `/api/measurements` | GET z filtrami, POST nowego pomiaru przez czujnik. |
| `/api/measurements/:measurementId` | GET pojedynczego pomiaru; brak edycji i usuwania pojedynczych wyników. |

POST tworzący zasób zwraca 201 i jego ścieżkę w `Location`. PUT serii zastępuje edytowalne pola; zmiana zakresu wykluczająca istniejące pomiary daje 409. ID należy traktować jako wartości nieprzezroczyste, bez konwersji do Number po stronie klienta.

Przykładowe body pomiaru:

```json
{
  "value": 21.5,
  "timestamp": "2026-11-02T10:00:00Z"
}
```

`timestamp` jest opcjonalny — bez niego API używa czasu serwera. Wartość musi mieścić się w domkniętym zakresie serii. Data z przeszłości jest dozwolona, a czas ponad 5 minut w przyszłości jest odrzucany. Seria wynika z klucza urządzenia.

### Filtry GET /api/measurements

| Parametr | Znaczenie |
| --- | --- |
| `series` | Lista ID oddzielonych przecinkami; brak oznacza wszystkie serie. |
| `from`, `to` | Opcjonalne granice ISO 8601 z jawną strefą; obie są włączone do wyniku. |
| `sort` | `timestamp` (domyślnie) albo `-timestamp`. Przy remisie czasu rozstrzyga ID w tym samym kierunku. |
| `limit` | Od 1 do 10000, domyślnie 1000. Frontend pobiera maksymalnie 1000. |

Przykład: `GET /api/measurements?series=1,2&sort=-timestamp&limit=100`. To limit wyniku, nie stronicowanie całej historii. Powtórzone parametry i pusta lista `series=` są odrzucane.

## SSE

`GET /api/events` z `Accept: text/event-stream` otwiera publiczny strumień. Nowe pomiary są wysyłane jako zdarzenia `measurement`:

```text
event: measurement
data: {"id":"123","seriesId":"1","sensorId":"2","value":21.5,"timestamp":"2026-11-02T10:00:00.000Z"}

```

Komentarz heartbeat jest wysyłany co 15 s. Strumień nie odtwarza zdarzeń po ID; po przerwie klient powinien ponownie pobrać migawkę REST. Backend zamyka połączenie, jeśli bufor odbiorcy przekroczy 64 KiB. `sensorId` może nie wystąpić w publicznym opisie pomiaru.

## Symulacje

| Ścieżka | Znaczenie |
| --- | --- |
| `GET /api/simulations` | Aktywne zadania i do 100 ostatnich zakończonych, malejąco po ID. |
| `GET /api/simulations/:simulationId` | Stan pojedynczego uruchomienia. |
| `POST /api/simulations` | Start zadania; odpowiedź 202 i `Location` statusu. |
| `POST /api/simulations/:simulationId/stop` | Anulowanie pracy i oczekiwanie na jej sprzątnięcie; zapisane pomiary pozostają. |

Przykładowa konfiguracja syntetyczna:

```json
{
  "seriesId": "1",
  "mode": "live",
  "pattern": "sine",
  "count": 30,
  "intervalMs": 1000,
  "min": 0,
  "max": 50
}
```

- Wymagane są `seriesId`, `mode` (`history`/`live`) i `pattern` (`random`/`sine`/`observed`).
- Dla danych syntetycznych opcjonalne `count` ma zakres 1–1000 (domyślnie 60), `intervalMs` 200–60000 (domyślnie 1000), a `min`/`max` domyślnie odpowiadają granicom serii.
- Opcjonalne `name` nadaje nazwę dedykowanemu czujnikowi.
- Dla `observed` wymagane jest `station`: EPWA, EPKK albo EPGD. Seria musi mieć jednostkę °C/C i obejmować obserwacje; liczba próbek wynika z pobranych danych, a zakres z serii. `intervalMs` nadal steruje odtwarzaniem live.
- Stan to `pending`, `running`, `stopping`, `stopped`, `completed` albo `failed`. Opis zawiera parametry, `acceptedCount`, `rejectedCount`, daty i ewentualny `error`, bez klucza czujnika.

Limit czterech obejmuje także przygotowywane zadania. Przekroczenie limitu daje 409. Użycie tych endpointów wymaga działającego nasłuchu HTTP backendu — worker korzysta z lokalnych żądań REST.

## Błędy

API zwraca `application/problem+json` z `type`, `title`, `status` i opcjonalnym `detail`. Szczegóły błędów wewnętrznych nie trafiają do klienta.

| Status | Typowa przyczyna |
| --- | --- |
| 400 | Niepoprawny JSON, typ, data albo filtr. |
| 401 | Brak, wygaśnięcie lub unieważnienie wymaganego tokenu/klucza. |
| 403 | Błędne bieżące hasło przy zmianie. |
| 404 | Nieistniejący zasób. |
| 406 / 415 | Nieobsługiwany `Accept` / `Content-Type`. |
| 409 | Konflikt zakresu, zmiana hasła w innej sesji lub limit symulacji. |
| 422 | Wartość poza zakresem lub inne niedozwolone dane domenowe. |
| 500 / 502 / 503 | Błąd wewnętrzny, komunikacji workera albo niedostępne źródło/kończący pracę serwer. |
