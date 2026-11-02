#!/usr/bin/env bash
# Przygotowanie roli i bazy roversense w działającym lokalnym PostgreSQL; wymaga root.
# Istniejące hasło roli pozostaje bez zmian; pierwszy wybór hasła wymaga terminala.
# Skrypt sprawdza właściciela istniejącej bazy i zakłada rozszerzenie TimescaleDB.
# Nie uruchamia migracji schematu ani seeda administratora aplikacji.
set -euo pipefail

# Inicjalizacja nowej bazy RoverSense bez hasel w kodzie i logach.
if [[ "$EUID" -ne 0 ]]; then
  echo "Uruchom: sudo bash deploy/scripts/bootstrap-db.sh" >&2
  exit 1
fi

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null; then
  echo "Brak dostepnego PostgreSQL na 127.0.0.1:5432." >&2
  exit 1
fi

# Haslo jest podawane interaktywnie i nie trafia do historii terminala.
if runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_roles WHERE rolname = 'roversense';" | grep -qx 1; then
  echo "Rola roversense juz istnieje, haslo pozostaje bez zmian."
else
  if [[ ! -t 0 ]]; then
    echo "Pierwsze uruchomienie wymaga terminala (haslo roli)." >&2
    exit 1
  fi
  runuser -u postgres -- createuser --login --no-superuser \
    --no-createdb --no-createrole --pwprompt roversense
fi

if runuser -u postgres -- psql -Atqc "SELECT 1 FROM pg_database WHERE datname = 'roversense';" | grep -qx 1; then
  owner="$(runuser -u postgres -- psql -Atqc "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'roversense';")"
  if [[ "$owner" != "roversense" ]]; then
    echo "Baza roversense istnieje, ale ma innego wlasciciela: $owner" >&2
    exit 1
  fi
  echo "Baza roversense juz istnieje."
else
  runuser -u postgres -- createdb --owner=roversense \
    --encoding=UTF8 --template=template0 roversense
fi

# Rozszerzenie zaklada administrator PostgreSQL; tabele stworza migracje.
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d roversense \
  -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
runuser -u postgres -- psql -At -d roversense \
  -c "SELECT extversion FROM pg_extension WHERE extname = 'timescaledb';"

echo "Baza gotowa. Tabele utworz przez npm run db:migrate z DATABASE_URL."
