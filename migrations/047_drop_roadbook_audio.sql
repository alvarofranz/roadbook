-- A voice note is part of its note: a `voice` block inside the roadbook document (#992). The old
-- server-side clips (roadbook_audio + public/audio/<id>/) were moved into their notes' documents
-- and nothing reads the table. Applied after the code that stopped using it is deployed.
DROP TABLE IF EXISTS roadbook_audio;
