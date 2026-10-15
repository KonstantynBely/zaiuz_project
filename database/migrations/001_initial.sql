-- PostgreSQL + TimescaleDB. Id pomiaru pochodzi z sekwencji, lecz unikalny
-- klucz hypertable musi również obejmować kolumnę partycjonowania timestamp.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE admins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE access_tokens (
  token_hash TEXT PRIMARY KEY,
  admin_id BIGINT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX access_tokens_admin_idx ON access_tokens(admin_id);

CREATE TABLE series (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  min_value DOUBLE PRECISION NOT NULL,
  max_value DOUBLE PRECISION NOT NULL,
  color CHAR(7) NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  unit TEXT,
  CHECK (min_value < max_value)
);

CREATE TABLE sensors (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key_hash CHAR(64) NOT NULL UNIQUE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX sensors_series_idx ON sensors(series_id);

CREATE TABLE measurements (
  id BIGINT GENERATED ALWAYS AS IDENTITY,
  timestamp TIMESTAMPTZ NOT NULL,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  sensor_id BIGINT REFERENCES sensors(id) ON DELETE SET NULL,
  value DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (timestamp, id)
);
SELECT create_hypertable('measurements', by_range('timestamp'), if_not_exists => TRUE);
CREATE INDEX measurements_series_time_idx ON measurements(series_id, timestamp DESC);
CREATE INDEX measurements_id_idx ON measurements(id);

CREATE TABLE simulation_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  series_id BIGINT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  sensor_id BIGINT REFERENCES sensors(id) ON DELETE SET NULL,
  state TEXT NOT NULL CHECK (state IN ('pending','running','stopping','stopped','completed','failed')),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_summary TEXT
);

CREATE TABLE rejected_measurements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sensor_id BIGINT REFERENCES sensors(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  http_status INTEGER NOT NULL
);
