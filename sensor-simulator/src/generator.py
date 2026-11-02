"""Generowanie próbek czujnika; zapis odbywa się wyłącznie przez REST API."""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import json
import math
import os
import random
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def value_for(index: int, minimum: float, maximum: float, pattern: str, rng: random.Random) -> float:
    """Wyznacz próbkę sinusoidalną lub losową bez obcinania jej precyzji.

    Args:
        index: Numer próbki od zera; określa fazę sinusoidy.
        minimum: Skończona dolna granica, sprawdzona przez wywołującego.
        maximum: Górna granica większa od minimum; różnica musi być skończona.
        pattern: Nazwa przebiegu: ``sine`` albo ``random``.
        rng: Generator losowy właściciela zadania; tryb random przesuwa jego stan.

    Returns:
        Wartość w podanym zakresie; sinusoida wykorzystuje 80% jego promienia.

    Raises:
        ValueError: Gdy nazwa przebiegu nie jest obsługiwana.
    """
    middle = minimum / 2 + maximum / 2
    radius = maximum / 2 - minimum / 2
    if pattern == 'sine':
        return middle + radius * 0.8 * math.sin(index / 3)
    if pattern == 'random':
        return rng.uniform(minimum, maximum)
    raise ValueError(f'Nieznany przebieg: {pattern}')


def send_measurement(base_url: str, api_key: str, value: float, timestamp: str | None) -> None:
    """Wyślij jedną próbkę jako JSON przez API czujnika z timeoutem 15 s.

    Args:
        base_url: Adres aplikacji bez ścieżki API; końcowy ukośnik jest pomijany.
        api_key: Jawny klucz urządzenia, wysyłany tylko w nagłówku X-API-Key.
        value: Wartość próbki; JSON nie dopuszcza NaN ani nieskończoności.
        timestamp: Czas ISO ze strefą lub None, aby API nadało czas serwera.

    Raises:
        HTTPError: Gdy API odmówi zapisu statusem błędu HTTP.
        URLError: Przy błędzie zestawienia połączenia.
        TimeoutError: Gdy zestawianie lub odczyt odpowiedzi przekroczy timeout.
        ConnectionError: Gdy otwarte połączenie zostanie zerwane.
        RuntimeError: Gdy odpowiedź nie ma oczekiwanego statusu 201.
        ValueError: Gdy dane nie mogą zostać zakodowane jako prawidłowy JSON.

    Funkcja nie zapisuje bezpośrednio do bazy i nie loguje sekretu urządzenia.
    """
    body: dict[str, float | str] = {'value': value}
    if timestamp is not None:
        body['timestamp'] = timestamp
    req = Request(
        base_url.rstrip('/') + '/api/measurements',
        data=json.dumps(body, allow_nan=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-API-Key': api_key,
        },
        method='POST',
    )
    with urlopen(req, timeout=15) as response:
        if response.status != 201:
            raise RuntimeError(f'Nieoczekiwany kod odpowiedzi: HTTP {response.status}')


def parser() -> argparse.ArgumentParser:
    """Zbuduj parser argumentów CLI z trybem, przebiegiem i zakresem próbek.

    Interwał jest podawany w sekundach. Klucz jest celowo pobierany ze środowiska,
    a nie z argumentu, który mógłby trafić do historii poleceń.
    """
    p = argparse.ArgumentParser(description='RoverSense — generator pomiarów przez API sensora')
    p.add_argument('--url', required=True, help='Adres aplikacji, np. http://127.0.0.1:3000')
    p.add_argument('--mode', choices=['history', 'live'], default='history')
    p.add_argument('--pattern', choices=['sine', 'random'], default='sine')
    p.add_argument('--count', type=int, default=15)
    p.add_argument('--interval', type=float, default=2.0, help='Odstęp w sekundach')
    p.add_argument('--min', dest='minimum', type=float, default=0.0)
    p.add_argument('--max', dest='maximum', type=float, default=100.0)
    p.add_argument('--seed', type=int, default=7)
    return p


def main(argv: list[str] | None = None) -> int:
    """Uruchom generator po sprawdzeniu klucza, granic i zakresu dat.

    Args:
        argv: Argumenty bez nazwy programu; None oznacza argumenty procesu.

    Returns:
        0, jeśli wszystkie próbki przyjęto; 1 przy obsłużonych błędach transmisji
        lub odmowach API; 2 przy niepoprawnej konfiguracji. Argparse może osobno
        zakończyć proces przez SystemExit przy błędach składni CLI.

    History wyznacza daty sprzed startu i nie czeka między próbkami. Live pomija
    timestamp w JSON i czeka między wysłaniami. Błąd jednej transmisji nie kończy
    pozostałych prób; komunikaty nie ujawniają klucza. Funkcję uruchamia wyłącznie
    jawne wywołanie CLI, a import modułu nie wysyła żądań.
    """
    args = parser().parse_args(argv)
    key = os.getenv('ROVERSENSE_SENSOR_KEY')
    if not key:
        print('Brak ROVERSENSE_SENSOR_KEY w zmiennych środowiskowych', file=sys.stderr)
        return 2
    if (args.count <= 0 or not math.isfinite(args.interval) or args.interval <= 0
            or not all(math.isfinite(x) for x in (args.minimum, args.maximum))
            or not args.minimum < args.maximum
            or not math.isfinite(args.maximum - args.minimum)):
        print('Podaj skończone wartości: dodatnią liczbę próbek i interwał oraz min < max', file=sys.stderr)
        return 2
    rng = random.Random(args.seed)
    try:
        start = datetime.now(timezone.utc) - timedelta(seconds=args.count * args.interval)
    except (OverflowError, ValueError):
        print('Liczba próbek i interwał wykraczają poza obsługiwany zakres dat', file=sys.stderr)
        return 2
    errors = 0
    for i in range(args.count):
        value = value_for(i, args.minimum, args.maximum, args.pattern, rng)
        timestamp = (start + timedelta(seconds=i * args.interval)).isoformat() if args.mode == 'history' else None
        try:
            send_measurement(args.url, key, value, timestamp)
            print(f'{i + 1}/{args.count}: przyjęto {value:.6g}')
        except HTTPError as exc:
            errors += 1
            # Nie logujemy treści żądania, nagłówków ani kluczy API.
            print(f'{i + 1}/{args.count}: odrzucono pomiar (HTTP {exc.code})', file=sys.stderr)
        except (URLError, TimeoutError, ConnectionError, RuntimeError) as exc:
            errors += 1
            print(f'{i + 1}/{args.count}: błąd transmisji: {type(exc).__name__}', file=sys.stderr)
        if args.mode == 'live' and i + 1 < args.count:
            time.sleep(args.interval)
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
