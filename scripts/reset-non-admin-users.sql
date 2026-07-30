-- Delete all non-admin users and their data (FK cascades handle most tables).
-- Keeps: app_settings, admin user(s), admin sessions/accounts/LINE data.

BEGIN;

DELETE FROM audit_log
WHERE user_id IN (SELECT id FROM "user" WHERE role <> 'admin');

DELETE FROM verification;
DELETE FROM signup_rate_limits;

DELETE FROM "user" WHERE role <> 'admin';

COMMIT;

SELECT id, name, email, role FROM "user" ORDER BY created_at;
