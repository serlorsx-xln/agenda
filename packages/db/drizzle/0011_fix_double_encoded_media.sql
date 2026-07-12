-- Repair media_assets rows stored as literal "\x..." hex text (double-encoded bytea).
UPDATE "media_assets"
SET "data" = decode(substring(convert_from("data", 'SQL_ASCII') FROM 3), 'hex')
WHERE encode(substring("data" FROM 1 FOR 2), 'hex') = '5c78'
  AND length("data") > "byte_size";
