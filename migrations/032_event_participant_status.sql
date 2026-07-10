SET NAMES utf8mb4;

-- #163: participant activation — pending until the organizer approves
ALTER TABLE event_participants
    ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active' AFTER user_id;
