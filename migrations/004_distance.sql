-- RDBK.app — distances stored in metres (integers).
SET NAMES utf8mb4;
ALTER TABLE roadbooks CHANGE km_total total_distance INT NOT NULL DEFAULT 0;
