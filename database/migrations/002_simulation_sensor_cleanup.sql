-- Registered worker sensors stay tracked even if creating a run or REST cleanup fails.
CREATE TABLE simulation_sensor_cleanup (
  sensor_id BIGINT PRIMARY KEY REFERENCES sensors(id) ON DELETE CASCADE,
  ready BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO simulation_sensor_cleanup(sensor_id, ready)
SELECT DISTINCT r.sensor_id, true
FROM simulation_runs r JOIN sensors s ON s.id=r.sensor_id
WHERE s.revoked_at IS NULL;
