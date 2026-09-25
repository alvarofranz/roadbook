-- A roadbook's category was read from the file's meta.category, which the .rdbk standard does not
-- have (#986): every row is NULL and nothing reads the column. Applied after the code that stopped
-- reading it is deployed.
ALTER TABLE roadbooks DROP COLUMN IF EXISTS category;
