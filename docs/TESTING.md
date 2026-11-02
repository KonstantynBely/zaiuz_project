# Testowanie aplikacji

Testy logiki i przeglądarki można uruchamiać bez bazy. Integracja, generator i skrypt kontraktowy zapisują dane, dlatego korzystają z osobnego środowiska testowego. Poniższe polecenia są instrukcją do ręcznego użycia, a nie częścią automatycznego startu aplikacji.

## Kontrole bez bazy

| Katalog | Polecenie | Zakres |
| --- | --- | --- |
| `backend` | `npm run typecheck` | Typy kodu backendu i źródeł testów, bez ich wykonywania. |
| `backend` | `npm test` | Logika, walidacja HTTP, autoryzacja, transakcje i sprzątanie na atrapach. |
| `backend` | `npm run build` | Kompilacja backendu do `dist`. |
| `frontend` | `npm test` | Filtrowanie, grupowanie, uzgadnianie REST/SSE i monitorowanie symulacji. |
| `frontend` | `npm run build` | Typy i build produkcyjny interfejsu. |
| `frontend` | `npm run test:browser` | Chrome/Chromium/Edge z lokalnymi atrapami API; wymaga wcześniejszego builda. |
| główny | `python -m unittest discover -s sensor-simulator/tests -v` | Przebiegi, walidacja i precyzja próbek bez transmisji do API. |

Przykład pełnej kontroli frontendu: `npm test`, `npm run build`, `npm run test:browser`. Niestandardową ścieżkę przeglądarki wskazuje `CHROME_PATH`. Test sprawdza layout od 320 do 1440 px, obie skale, zaznaczenie pomiaru, pusty stan, wydruk i logowanie. Każda ścieżka `/api` jest obsługiwana w pamięci testu.

## Testy z TimescaleDB

Przygotuj lokalną bazę `roversense_test` z rozszerzeniem TimescaleDB. Używaj konta z prawami wyłącznie do bazy testowej. Baza aplikacji i produkcja nie są środowiskiem dla tych testów.

W terminalu przeznaczonym do testów, w katalogu `backend`, ustaw adres lokalnej bazy testowej, używając jej własnego hasła:

```bash
export TEST_DATABASE_URL='postgresql://uzytkownik_testowy:haslo_testowe@127.0.0.1:5432/roversense_test'
DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm run test:integration
```

Adres jest celowo wymagany osobno od `DATABASE_URL`: helper odrzuca brak `TEST_DATABASE_URL`, zdalny host i nazwę bez końcówki `_test`. Testy działają kolejno, ponieważ test odzyskiwania symulacji sprawdza sprzątanie całej bazy testowej. W CI dedykowaną bazę zapewnia usługa TimescaleDB.

## Dane testowe

Do ręcznych testów wykresu i filtrów przydają się serie o różnych jednostkach i zakresach. Skrypt kontraktowy oczekuje co najmniej trzech serii po 15 pomiarów. Przed generowaniem sprawdź istniejące dane; start aplikacji i wdrożenie nie zasilają bazy automatycznie.

Dla nowego środowiska demonstracyjnego:

1. Utwórz konto poleceniem `db:seed-admin` zgodnie z README i zaloguj się w UI.
2. Utwórz serie: temperatura `[-30, 60] °C`, wilgotność `[0, 100] %`, napięcie `[0, 24] V`.
3. Dla każdej serii zarejestruj osobny czujnik i ustaw jego klucz w `ROVERSENSE_SENSOR_KEY`. Z katalogu projektu uruchom generator z `--count 15`, adresem lokalnego API i odpowiednimi `--min` / `--max`, np.:

   ```bash
   python sensor-simulator/src/generator.py --url http://127.0.0.1:3000 \
     --mode history --pattern sine --count 15 --interval 60 --min -30 --max 60
   ```

4. Powtórz z kluczem drugiego i trzeciego czujnika oraz ich zakresami. Sprawdź przez `GET /api/series` i `GET /api/measurements?series=ID_SERII&limit=15`, że każda seria ma co najmniej 15 wyników. Panel administracyjny zawiera identyfikatory serii.
5. Wyrejestruj niepotrzebne czujniki testowe po zakończeniu generowania. Ich pomiary pozostaną. Nie zapisuj kluczy w repozytorium.

## Sprawdzenie kontraktu API

Na kontrolowanej instancji testowej z przygotowanymi danymi, po ustawieniu jej adresu oraz danych konta testowego w środowisku:

```bash
node instructor/zai-tests.mjs --app "$ROVERSENSE_TEST_APP" \
  --user "$ROVERSENSE_TEST_USER" --pass "$ROVERSENSE_TEST_PASSWORD" --stage E2
```

Opcja `--lighthouse` dodaje automatyczny pomiar dostępności. Skrypt sprawdza również HTTPS i nagłówki, dlatego ten zakres kontroli wymaga skonfigurowanego reverse proxy, nie samego Vite. Skrypt tworzy oraz usuwa zasoby, testuje wyrejestrowanie czujników i sesje. Nie jest kontrolą wyłącznie odczytową i nie należy kierować go do produkcji. Jego źródło znajduje się w `instructor/`.

## Ręczne sprawdzenie interfejsu

Po buildach i testach bez bazy sprawdź aplikację z rzeczywistym API środowiska testowego:

- Dashboard przy 320/390 px i na desktopie, obie skale wykresu, filtry dat i serii, zaznaczanie pomiarów z tabeli oraz wydruk.
- Utworzenie i edycję serii; odrzucenie zakresu wykluczającego zapisane pomiary.
- Rejestrację czujnika, jednorazowy klucz, przesłanie wyniku i odmowę zapisu po wyrejestrowaniu.
- Start/Stop symulacji, aktualizację wykresu przez SSE i limit czterech zadań. Aktywne zadania są zwracane niezależnie od limitu 100 zakończonych uruchomień w historii.
- Logowanie, wylogowanie i zmianę hasła na koncie testowym; poprzednia sesja ma przestać działać.
- Lighthouse na buildzie produkcyjnym, HTTPS i nagłówki z faktycznie załadowanej konfiguracji Caddy.

## CI i interpretacja wyników

Workflow sprawdza backend na wydzielonej bazie TimescaleDB, frontend na atrapach API, generator Python i składnię skryptów Bash. Test przeglądarkowy korzysta z builda produkcyjnego. Dodatkowy Lighthouse na pull requestach bada podgląd DEV z próbkami — jego wynik nie potwierdza działania produkcyjnego API ani nagłówków Caddy.

Po zmianie zachowania uruchom kontrole odpowiednie dla danego obszaru i zapisz środowisko, scenariusz oraz wynik. Zielone testy bez bazy nie potwierdzają integracji SQL; sam build nie potwierdza poprawnego layoutu ani konfiguracji działającego serwera.
