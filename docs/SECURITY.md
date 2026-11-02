# Bezpieczeństwo aplikacji

Opis mechanizmów zaimplementowanych w kodzie i wersjonowanej konfiguracji RoverSense. Konfiguracja w repozytorium nie potwierdza, że jej aktualna wersja jest załadowana na działającym serwerze.

## Podział dostępu

Odczyty serii i pomiarów oraz SSE są publiczne. Zarządzanie seriami, czujnikami, hasłem i symulacjami wymaga sesji administratora. Zapis pomiaru wymaga klucza czujnika; seria jest ustalana na podstawie klucza i nie jest wybierana w body żądania.

Trasy i kody odpowiedzi opisuje [API](API.md). Strażnicy są składani w `backend/src/app.ts`, a reguły sesji w module `auth`.

## Hasła administratora

`auth.service.ts` hashuje hasła przez bcrypt z kosztem 12 i sprawdza je funkcją `compare()`. Baza przechowuje `password_hash`. Przy nieznanym loginie również wykonywane jest porównanie z zastępczym hashem, aby ograniczyć różnice czasu odpowiedzi.

Limit wynosi 72 bajty UTF-8. Dłuższe hasło jest odrzucane, zamiast zostać obcięte. Frontend pokazuje ten limit, ale backend weryfikuje go niezależnie. Zmiana hasła wymaga minimum 8 znaków; ręczny skrypt przygotowania konta wymaga minimum 12 znaków.

Aktualizacja hasła i cofnięcie sesji odbywają się w jednej transakcji. Zapis nowego tokenu ponownie sprawdza hash hasła pod blokadą wiersza konta, dzięki czemu spóźnione logowanie starym hasłem nie tworzy aktywnej sesji po zmianie.

## Sesje

Token powstaje z 32 losowych bajtów i jest zwracany jako 64 znaki szesnastkowe. Repozytorium zapisuje jego SHA-256, datę wygaśnięcia i ewentualnego cofnięcia. Sesja jest ważna przez 3600 s. Wylogowanie cofa wskazany token, a zmiana hasła — dotychczasowe sesje konta.

Frontend utrzymuje token tylko w pamięci karty. Nie zapisuje go w localStorage; odświeżenie aplikacji wymaga ponownego logowania. Lokalny timer usuwa wygasłą sesję, a odpowiedź 401 powoduje powrót do logowania. Serwer sprawdza ważność niezależnie od stanu UI.

## Klucze czujników

Rejestracja generuje 32 losowe bajty, zwracane jako 64 znaki szesnastkowe. Jawne `apiKey` występuje tylko w odpowiedzi rejestracji z `Cache-Control: no-store`. Odczyty czujników nie ujawniają klucza ani jego skrótu.

`measurements.service.ts` hashuje przesłany klucz, a repozytorium sprawdza jego aktywność i zakres serii podczas transakcyjnego zapisu. Wyrejestrowanie ustawia `revoked_at` i blokuje kolejne pomiary bez usuwania dotychczasowej historii.

Klucz w panelu można skopiować tylko bezpośrednio po rejestracji. Generator Python pobiera go z `ROVERSENSE_SENSOR_KEY`, zamiast przyjmować jako argument polecenia.

## Lokalny worker symulacji

Backend tworzy losowy klucz procesu używany do lokalnego tworzenia i wyrejestrowania czujników. Strażnik wymaga jednocześnie:

- adresu klienta loopback;
- bezpośredniego nagłówka Host odpowiadającego lokalnemu portowi API;
- poprawnego klucza porównanego przez `timingSafeEqual`.

Ten mechanizm dotyczy zapisów czujników i nie zastępuje publicznego Bearer ani klucza urządzenia. Sekret procesu nie trafia do odpowiedzi symulacji ani do bazy. Czujnik workera ma własny klucz pomiarowy, a trwała kolejka sprzątania przechowuje tylko jego ID. Jej zachowanie przy awarii i restarcie opisuje [model danych](ERD.md).

## Walidacja i SQL

Fastify sprawdza schematy JSON bez automatycznej konwersji typów, np. null lub boolean na liczbę. Serwisy weryfikują dodatkowo zakresy, daty ze strefą i identyfikatory mieszczące się w BIGINT.

Zapytania przekazują wartości jako parametry SQL. Kierunek sortowania jest wybierany z dozwolonego zestawu. Zapisy pomiarów i zmiany zakresu serii używają blokad tych samych rekordów, aby walidacja nie minęła się ze współbieżną zmianą.

Helper transakcji zawsze zwalnia pobrane połączenie. Po nieudanym BEGIN lub rollbacku odrzuca klienta z puli; nieudany rollback zachowuje obie przyczyny w AggregateError.

## HTTP, logi i sekrety

API zwraca błędy jako Problem Details. Opisy błędów wewnętrznych i stosy wywołań nie są wysyłane do klienta. Logi Fastify redagują nagłówki Authorization, X-API-Key i klucz workera; kod generatora nie wypisuje sekretów urządzenia.

[Konfiguracja Caddy](../server/config/Caddyfile) ustawia HTTPS, CSP, nosniff, X-Frame-Options, Referrer-Policy i Permissions-Policy. CSP dopuszcza skrypty aplikacji z własnego origin, Google Fonts oraz style inline używane przez UI. Weryfikacja aktywnych nagłówków wymaga sprawdzenia odpowiedzi faktycznie działającego reverse proxy.

Sekrety procesu pochodzą ze środowiska, a pliki `.env` są ignorowane. Wersjonowany `.env.example` opisuje nowe środowisko lokalne; nie jest konfiguracją produkcji. Wdrożenie przechowuje właściwe wartości poza katalogiem kodu, zgodnie z [instrukcją serwera](../server/configuration.md).

## Sprawdzanie zmian

Testy bez bazy sprawdzają limity haseł, walidację, sesje i obsługę błędów transakcji na atrapach. Testy integracyjne sprawdzają zapis i współbieżność na wydzielonej bazie. Procedura znajduje się w [TESTING.md](TESTING.md).

Po zmianach autoryzacji sprawdź zarówno udaną operację, jak i brak tokenu, token cofnięty, błędny klucz oraz wyrejestrowany czujnik. Do prób używaj kont i urządzeń testowych; nie zapisuj ich sekretów w raportach ani przykładach kodu.
