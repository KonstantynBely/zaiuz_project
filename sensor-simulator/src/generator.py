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
    """Generuje liczbę w domkniętym zakresie pomiarowym."""
    middle = (minimum + maximum) / 2
    radius = (maximum - minimum) / 2
    if pattern == 'sine':
        return middle + radius * 0.8 * math.sin(index / 3)
    if pattern == 'random':
        return rng.uniform(minimum, maximum)
    raise ValueError(f'Nieznany przebieg: {pattern}')


def send_measurement(base_url: str, api_key: str, value: float, timestamp: str | None) -> None:
    body: dict[str, float | str] = {'value': value}
    if timestamp is not None:
        body['timestamp'] = timestamp
    req = Request(
        base_url.rstrip('/') + '/api/measurements',
        data=json.dumps(body).encode('utf-8'),
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
    args = parser().parse_args(argv)
    key = os.getenv('ROVERSENSE_SENSOR_KEY')
    if not key:
        print('Brak ROVERSENSE_SENSOR_KEY w zmiennych środowiskowych', file=sys.stderr)
        return 2
    if args.count <= 0 or args.interval <= 0 or not args.minimum < args.maximum:
        print('Liczba próbek i interwał muszą być dodatnie, a min < max', file=sys.stderr)
        return 2
    rng = random.Random(args.seed)
    start = datetime.now(timezone.utc) - timedelta(seconds=args.count * args.interval)
    errors = 0
    for i in range(args.count):
        value = round(value_for(i, args.minimum, args.maximum, args.pattern, rng), 5)
        timestamp = (start + timedelta(seconds=i * args.interval)).isoformat() if args.mode == 'history' else None
        try:
            send_measurement(args.url, key, value, timestamp)
            print(f'{i + 1}/{args.count}: przyjęto {value}')
        except HTTPError as exc:
            errors += 1
            # Nie logujemy treści żądania, nagłówków ani kluczy API.
            print(f'{i + 1}/{args.count}: odrzucono pomiar (HTTP {exc.code})', file=sys.stderr)
        except (URLError, RuntimeError) as exc:
            errors += 1
            print(f'{i + 1}/{args.count}: błąd transmisji: {type(exc).__name__}', file=sys.stderr)
        if args.mode == 'live' and i + 1 < args.count:
            time.sleep(args.interval)
    return 1 if errors else 0


if __name__ == '__main__':
    raise SystemExit(main())
