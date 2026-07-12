-- Rich demo data for dashboard / hero screenshots.
-- Idempotent-ish: updates existing demo campaigns for the latest user.
-- Usage:
--   docker exec -i line-postgres-1 psql -U line -d line_promotion < scripts/seed-demo-dashboard.sql

BEGIN;

DO $$
DECLARE
  uid text;
  today date := (timezone('Asia/Bangkok', now()))::date;
  c_promo uuid := 'b0000001-0000-4000-8000-000000000001';
  c_flash uuid := 'b0000001-0000-4000-8000-000000000002';
  c_review uuid := 'b0000001-0000-4000-8000-000000000003';
  c_zoom uuid := 'b0000001-0000-4000-8000-000000000004';
  c_thanks uuid := 'b0000001-0000-4000-8000-000000000005';
  run_promo uuid := 'c0000001-0000-4000-8000-000000000101';
  run_flash uuid := 'c0000001-0000-4000-8000-000000000102';
  run_review uuid := 'c0000001-0000-4000-8000-000000000103';
  run_thanks uuid := 'c0000001-0000-4000-8000-000000000104';
  mid_promo text[] := ARRAY[
    'ma990c470966cb0aa8e6fe26cf79383aa',
    'm525c795a7da897083a8a2df0295a1ef1',
    'm4de7d8ccd2ab02e64ef1c870642c97ea',
    'm53743cdbe9bb966cbd4b696c923e6880',
    'mbdd3f522ae2247ad4565330152fa76b7',
    'mb4bf7001448e353830f3a4c40b7589a4',
    'm118e66b5d6b53c6e9ca281b38d6135ef',
    'm32f7d1579d12963bbbb13f6434de8438'
  ];
  mid_flash text[] := ARRAY[
    'ma990c470966cb0aa8e6fe26cf79383aa',
    'm525c795a7da897083a8a2df0295a1ef1',
    'mbdd3f522ae2247ad4565330152fa76b7',
    'mb4bf7001448e353830f3a4c40b7589a4',
    'm53743cdbe9bb966cbd4b696c923e6880'
  ];
  mid_review text[] := ARRAY[
    'ma990c470966cb0aa8e6fe26cf79383aa',
    'm525c795a7da897083a8a2df0295a1ef1',
    'm4de7d8ccd2ab02e64ef1c870642c97ea',
    'mbdd3f522ae2247ad4565330152fa76b7'
  ];
  mid_thanks text[] := ARRAY[
    'ma990c470966cb0aa8e6fe26cf79383aa',
    'm525c795a7da897083a8a2df0295a1ef1',
    'm4de7d8ccd2ab02e64ef1c870642c97ea',
    'm53743cdbe9bb966cbd4b696c923e6880',
    'mbdd3f522ae2247ad4565330152fa76b7',
    'mb4bf7001448e353830f3a4c40b7589a4'
  ];
  i int;
BEGIN
  SELECT id INTO uid FROM "user" ORDER BY "created_at" DESC LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No user found — sign up first';
  END IF;

  -- LINE appears connected for screenshots
  UPDATE line_connection
  SET
    status = 'connected',
    mid = COALESCE(NULLIF(mid, ''), 'udemosscreenshot000000000000001'),
    display_name = COALESCE(NULLIF(display_name, ''), 'Agenda Demo'),
    last_error = NULL,
    last_synced_at = now(),
    connected_at = COALESCE(connected_at, now() - interval '12 days'),
    updated_at = now()
  WHERE user_id = uid;

  -- Campaigns: active + higher daily caps for dense progress
  UPDATE campaigns SET
    name = 'โปรโมชันสินค้าใหม่รายสัปดาห์',
    status = 'active', enabled = true, max_sends = 50,
    send_rotation_index = 3, timezone = 'Asia/Bangkok',
    window_start_hour = 9, window_end_hour = 21,
    updated_at = now()
  WHERE id = c_promo AND user_id = uid;

  UPDATE campaigns SET
    name = 'Flash Sale ทุกวันศุกร์',
    status = 'active', enabled = true, max_sends = 40,
    send_rotation_index = 2, timezone = 'Asia/Bangkok',
    window_start_hour = 10, window_end_hour = 22,
    updated_at = now()
  WHERE id = c_flash AND user_id = uid;

  UPDATE campaigns SET
    name = 'ขอบคุณลูกค้า 1K',
    status = 'active', enabled = true, max_sends = 30,
    send_rotation_index = 1, timezone = 'Asia/Bangkok',
    window_start_hour = 9, window_end_hour = 20,
    updated_at = now()
  WHERE id = c_thanks AND user_id = uid;

  UPDATE campaigns SET
    name = 'แชร์รีวิวลูกค้า',
    status = 'active', enabled = true, max_sends = 25,
    send_rotation_index = 0, timezone = 'Asia/Bangkok',
    updated_at = now()
  WHERE id = c_review AND user_id = uid;

  UPDATE campaigns SET
    name = 'แจ้งเตือนกิจกรรม Zoom',
    status = 'paused', enabled = false, max_sends = 20,
    updated_at = now()
  WHERE id = c_zoom AND user_id = uid;

  -- Clear today's daily sends then refill
  DELETE FROM campaign_daily_sends
  WHERE campaign_id IN (c_promo, c_flash, c_thanks, c_review)
    AND stat_date = today;

  -- Promo: 32 / 50 today (first 4 groups x 8 sends pattern → 32 unique mid hits)
  FOR i IN 1..4 LOOP
    INSERT INTO campaign_daily_sends (campaign_id, stat_date, chat_mid, send_count)
    VALUES (c_promo, today, mid_promo[i], 8)
    ON CONFLICT (campaign_id, stat_date, chat_mid) DO UPDATE
      SET send_count = EXCLUDED.send_count;
  END LOOP;

  -- Flash: 18 / 40
  FOR i IN 1..3 LOOP
    INSERT INTO campaign_daily_sends (campaign_id, stat_date, chat_mid, send_count)
    VALUES (c_flash, today, mid_flash[i], 6)
    ON CONFLICT (campaign_id, stat_date, chat_mid) DO UPDATE
      SET send_count = EXCLUDED.send_count;
  END LOOP;

  -- Thanks: 12 / 30
  FOR i IN 1..3 LOOP
    INSERT INTO campaign_daily_sends (campaign_id, stat_date, chat_mid, send_count)
    VALUES (c_thanks, today, mid_thanks[i], 4)
    ON CONFLICT (campaign_id, stat_date, chat_mid) DO UPDATE
      SET send_count = EXCLUDED.send_count;
  END LOOP;

  -- Review: 7 / 25
  FOR i IN 1..2 LOOP
    INSERT INTO campaign_daily_sends (campaign_id, stat_date, chat_mid, send_count)
    VALUES (c_review, today, mid_review[i], CASE WHEN i = 1 THEN 4 ELSE 3 END)
    ON CONFLICT (campaign_id, stat_date, chat_mid) DO UPDATE
      SET send_count = EXCLUDED.send_count;
  END LOOP;

  -- Today's runs (upsert by fixed ids)
  -- Soft-hide the sparse "0/0 failed" run from today so recent list looks dense
  UPDATE campaign_runs
  SET created_at = now() - interval '10 days',
      started_at = now() - interval '10 days'
  WHERE user_id = uid
    AND status = 'failed'
    AND sent_count = 0
    AND failed_count = 0
    AND created_at::date = (timezone('UTC', now()))::date;

  INSERT INTO campaign_runs (
    id, user_id, campaign_id, status, trigger,
    sent_count, failed_count, skipped_count, total_targets,
    started_at, finished_at, created_at
  ) VALUES
    (run_promo, uid, c_promo, 'running', 'scheduled', 32, 0, 0, 50,
      now() - interval '3 hours', NULL, now() - interval '3 hours'),
    (run_flash, uid, c_flash, 'partial', 'scheduled', 18, 2, 1, 40,
      now() - interval '2 hours 20 minutes',
      now() - interval '2 hours', now() - interval '2 hours 20 minutes'),
    (run_thanks, uid, c_thanks, 'success', 'manual', 12, 0, 0, 30,
      now() - interval '90 minutes',
      now() - interval '70 minutes', now() - interval '90 minutes'),
    (run_review, uid, c_review, 'running', 'manual', 7, 0, 0, 25,
      now() - interval '40 minutes', NULL, now() - interval '40 minutes')
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    sent_count = EXCLUDED.sent_count,
    failed_count = EXCLUDED.failed_count,
    skipped_count = EXCLUDED.skipped_count,
    total_targets = EXCLUDED.total_targets,
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at,
    created_at = EXCLUDED.created_at;

  UPDATE campaigns SET daily_run_id = run_promo, last_run_at = now() - interval '20 minutes'
  WHERE id = c_promo;
  UPDATE campaigns SET daily_run_id = run_flash, last_run_at = now() - interval '2 hours'
  WHERE id = c_flash;
  UPDATE campaigns SET daily_run_id = run_thanks, last_run_at = now() - interval '90 minutes'
  WHERE id = c_thanks;
  UPDATE campaigns SET daily_run_id = run_review, last_run_at = now() - interval '40 minutes'
  WHERE id = c_review;

  -- Extra historic runs with denser numbers (keep recent variety)
  INSERT INTO campaign_runs (
    id, user_id, campaign_id, status, trigger,
    sent_count, failed_count, skipped_count, total_targets,
    started_at, finished_at, created_at
  ) VALUES
    ('c0000001-0000-4000-8000-000000000201', uid, c_promo, 'success', 'scheduled', 48, 2, 0, 50,
      now() - interval '1 day 4 hours', now() - interval '1 day 1 hour', now() - interval '1 day'),
    ('c0000001-0000-4000-8000-000000000202', uid, c_flash, 'success', 'scheduled', 40, 0, 0, 40,
      now() - interval '2 days 6 hours', now() - interval '2 days 3 hours', now() - interval '2 days'),
    ('c0000001-0000-4000-8000-000000000203', uid, c_review, 'partial', 'manual', 19, 3, 1, 25,
      now() - interval '3 days 5 hours', now() - interval '3 days 2 hours', now() - interval '3 days'),
    ('c0000001-0000-4000-8000-000000000204', uid, c_thanks, 'success', 'scheduled', 30, 0, 0, 30,
      now() - interval '4 days 7 hours', now() - interval '4 days 4 hours', now() - interval '4 days'),
    ('c0000001-0000-4000-8000-000000000205', uid, c_flash, 'failed', 'scheduled', 6, 8, 2, 40,
      now() - interval '5 days 3 hours', now() - interval '5 days 2 hours', now() - interval '5 days')
  ON CONFLICT (id) DO UPDATE SET
    sent_count = EXCLUDED.sent_count,
    failed_count = EXCLUDED.failed_count,
    status = EXCLUDED.status,
    total_targets = EXCLUDED.total_targets;

  -- Auto-reply: enable a few with solid match counts
  UPDATE auto_reply_rules
  SET enabled = true,
      matched_count = GREATEST(matched_count, 120),
      last_matched_at = now() - interval '35 minutes'
  WHERE user_id = uid
    AND include_keywords::text LIKE '%ราคา%';

  UPDATE auto_reply_rules
  SET enabled = true,
      matched_count = GREATEST(matched_count, 86),
      last_matched_at = now() - interval '2 hours'
  WHERE user_id = uid
    AND include_keywords::text LIKE '%สนใจ%';

  UPDATE auto_reply_rules
  SET enabled = true,
      matched_count = GREATEST(matched_count, 54),
      last_matched_at = now() - interval '5 hours'
  WHERE user_id = uid
    AND include_keywords::text LIKE '%ส่งฟรี%';

  RAISE NOTICE 'Demo dashboard seeded for user % (today=%)', uid, today;
END $$;

COMMIT;
