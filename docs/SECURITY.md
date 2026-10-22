# RoverSense — mechanizmy bezpieczeństwa T5

Dwa wybrane mechanizmy do demonstracji w części B3. Kod należy pokazać na działającej aplikacji po wdrożeniu, bez ujawniania haseł lub kluczy.

## 1. Hasła administratora — bcrypt (T5.1)

**Plik:** backend/src/modules/auth/auth.service.ts.

- Hasło przed zapisaniem jest przetwarzane funkcją bcryptjs.hash(password, 12); logowanie używa compare().
- Baza nie przechowuje hasła jawnym tekstem. Bcrypt stosuje sól i koszt obliczeniowy, ograniczając skutki wycieku bazy.
- Przy nieznanym loginie wykonywane jest porównanie z zastępczym haszem, aby ograniczyć różnice czasowe.
- Zmiana hasła unieważnia poprzednie sesje administratora.

**Dowód na nagraniu:** fragment kodu hashPassword(), poprawne i niepoprawne logowanie, zmiana hasła i ponowne logowanie.

## 2. Klucze czujników — losowość i SHA-256 (T5.5)

**Pliki:** backend/src/modules/sensors/sensors.service.ts oraz backend/src/modules/measurements/measurements.repository.ts.

- Podczas rejestracji generowany jest randomBytes(32).toString('hex'), czyli 64-znakowy klucz.
- W bazie trafia jedynie SHA-256 tego klucza. Jawny klucz jest zwracany tylko raz, przy rejestracji czujnika.
- POST /api/measurements wymaga ważnego klucza w nagłówku X-API-Key.
- Wyrejestrowanie ustawia revoked_at; backend odrzuca dalsze pomiary z tym kluczem, zachowując wcześniejszą historię.

**Dowód na nagraniu:** rejestracja sensora, jednorazowy klucz testowy, poprawny pomiar, wyrejestrowanie oraz HTTP 401 przy próbie ponownego wysłania. Użyty klucz należy potem unieważnić.

## Pozostałe zabezpieczenia

- Zapytania PostgreSQL są parametryzowane; operacje administracyjne wymagają serwerowej autoryzacji.
- Tokeny admina są losowe, haszowane w bazie, mają 3600 s ważności i mogą zostać unieważnione.
- Frontend przetrzymuje token wyłącznie w pamięci karty, nie w localStorage.
- W server/config/Caddyfile skonfigurowano CSP, nosniff, X-Frame-Options, Referrer-Policy i Permissions-Policy. Dopuszczone są źródła Google Fonts oraz style inline wymagane przez istniejący frontend, ale nie dopuszcza się wykonywania skryptów inline.
- Logi Fastify ukrywają nagłówki Authorization i X-API-Key.

**Ważne:** zapisanie nowej konfiguracji Caddy w repo nie oznacza, że nagłówki działają już na produkcji. Weryfikacja HTTP i DevTools jest możliwa dopiero po wdrożeniu aktualnej gałęzi.

*Ten plik dostarcza materiał techniczny do końcowej dokumentacji PDF. Nie zawiera danych dostępowych.*
