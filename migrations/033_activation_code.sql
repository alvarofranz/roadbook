SET NAMES utf8mb4;

ALTER TABLE event_participants ADD COLUMN activation_code VARCHAR(6) DEFAULT NULL AFTER status;
CREATE INDEX idx_activation_code ON event_participants(activation_code);
