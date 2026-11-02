#!/usr/bin/env bash
# Przygotowanie nowego hosta Ubuntu 24.04 ARM64; wymaga root i dostępu do repozytoriów APT.
# Instaluje PostgreSQL/TimescaleDB, ogranicza nasłuchiwanie do localhost i restartuje klaster.
# Nie tworzy tabel aplikacji; bootstrap-db.sh przygotowuje rolę, bazę i rozszerzenie.
# set -euo pipefail kończy pracę po błędzie; zmiany pakietów i konfiguracji nie są transakcyjne.
set -euo pipefail

# Instalacja PostgreSQL 17 i TimescaleDB na Ubuntu 24.04 ARM64.
if [[ "$EUID" -ne 0 ]]; then
  echo "Uruchom: sudo bash deploy/scripts/install-db.sh" >&2
  exit 1
fi

# shellcheck source=/dev/null
source /etc/os-release
if [[ "$ID" != "ubuntu" || "$VERSION_ID" != "24.04" || "$(dpkg --print-architecture)" != "arm64" ]]; then
  echo "Ten skrypt obsluguje wylacznie Ubuntu 24.04 ARM64." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl gnupg postgresql-common

# Klucz i repozytorium PostgreSQL (PGDG), ograniczone do ARM64.
install -d -m 0755 /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
cat > /etc/apt/sources.list.d/pgdg.sources <<'EOF'
Types: deb
URIs: https://apt.postgresql.org/pub/repos/apt
Suites: noble-pgdg
Architectures: arm64
Components: main
Signed-By: /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
EOF

# Repozytorium TimescaleDB i dedykowany klucz podpisu.
install -d -m 0755 /etc/apt/keyrings
key_file="$(mktemp)"
trap 'rm -f "$key_file"' EXIT
curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
  | gpg --batch --yes --dearmor -o "$key_file"
install -m 0644 "$key_file" /etc/apt/keyrings/timescaledb.gpg
cat > /etc/apt/sources.list.d/timescaledb.list <<'EOF'
deb [arch=arm64 signed-by=/etc/apt/keyrings/timescaledb.gpg] https://packagecloud.io/timescale/timescaledb/ubuntu/ noble main
EOF

apt-get update
for package in postgresql-17 timescaledb-2-postgresql-17; do
  candidate="$(apt-cache policy "$package" | awk '/Candidate:/ { value = $2 } END { print value }')"
  if [[ -z "$candidate" || "$candidate" == "(none)" ]]; then
    echo "Brak pakietu $package dla tej platformy. Przerwano instalacje." >&2
    exit 1
  fi
  echo "$package: $candidate"
done

apt-get install -y --no-install-recommends \
  postgresql-17 postgresql-client-17 timescaledb-2-postgresql-17

# Oczekujemy nowego klastra 17/main na domyslnym porcie, bez zmiany danych.
cluster_port="$(pg_lsclusters -h | awk '$1 == "17" && $2 == "main" { print $3 }')"
if [[ "$cluster_port" != "5432" ]]; then
  echo "Klaster 17/main nie dziala na porcie 5432. Sprawdz: pg_lsclusters" >&2
  exit 1
fi

# Baza nie ma byc dostepna z internetu.
pg_conftool 17 main set listen_addresses localhost
pg_conftool 17 main set password_encryption scram-sha-256
pg_conftool 17 main set shared_preload_libraries timescaledb
systemctl enable postgresql
systemctl restart postgresql@17-main

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null; then
  echo "PostgreSQL nie odpowiada lokalnie na porcie 5432." >&2
  exit 1
fi
runuser -u postgres -- psql -Atqc "SHOW shared_preload_libraries;" | grep -qx timescaledb
runuser -u postgres -- psql -Atqc "SHOW listen_addresses;" | grep -qx localhost
echo "PostgreSQL 17 + TimescaleDB: usluga uruchomiona lokalnie."
echo "Nastepny krok: sudo bash deploy/scripts/bootstrap-db.sh"
