-- RDBK.app — drop users.voice_lang (#773). It chose the speech-to-text language of the voice notes;
-- dictation and transcription are gone (#767 · #768) and no code reads or writes it any more
-- (shipped first, per the schema rule: code before the drop).
ALTER TABLE users DROP COLUMN voice_lang;
