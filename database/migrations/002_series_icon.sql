-- Ikona serii jest opcjonalnym polem opisanym w kontrakcie OpenAPI.
ALTER TABLE series ADD COLUMN IF NOT EXISTS icon TEXT;
