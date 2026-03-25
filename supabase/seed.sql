-- seed.sql — Static dev seed data for local development
-- Dynamic data (address_mappings, starknet_selectors) is seeded via
-- scripts/seed-from-files.py after supabase db reset runs this file.

-- ============================================================
-- Dev user (local only — password: dev-password-123)
-- ============================================================

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'dev@chat-dune.local',
  crypt('dev-password-123', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"], "role": "admin"}',
  '{}',
  now(),
  now()
) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Sample threads
-- ============================================================

INSERT INTO threads (id, user_id, title, is_pinned, created_at, updated_at) VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'Ekubo daily swap volume last 30 days',
    true,
    now() - interval '3 days',
    now() - interval '3 days'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Top STRK token holders by balance',
    false,
    now() - interval '2 days',
    now() - interval '2 days'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'StarkGate bridge inflows this week',
    false,
    now() - interval '1 day',
    now() - interval '1 day'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Sample messages
-- ============================================================

INSERT INTO messages (id, thread_id, role, content, created_at) VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'user',
    '[{"type": "text", "text": "Show me Ekubo daily swap volume for the last 30 days as a line chart."}]',
    now() - interval '3 days'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000001',
    'assistant',
    '[{"type": "text", "text": "Here is Ekubo swap volume over the last 30 days. Volume has been trending upward with a notable spike around day 22."}, {"type": "chart", "spec": {"type": "line", "title": "Ekubo Daily Swap Volume (30d)", "xAxis": {"label": "Date", "key": "day"}, "yAxis": {"label": "Volume (USD)", "key": "volume_usd"}, "series": [{"name": "Swap Volume", "dataKey": "volume_usd", "color": "#6366f1"}], "data": []}}]',
    now() - interval '3 days' + interval '30 seconds'
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    '10000000-0000-0000-0000-000000000002',
    'user',
    '[{"type": "text", "text": "Who are the top 20 STRK token holders right now?"}]',
    now() - interval '2 days'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    '10000000-0000-0000-0000-000000000002',
    'assistant',
    '[{"type": "text", "text": "Here are the top 20 STRK holders. Note that several addresses are labeled from the workspace mapping — Starknet Foundation and known exchange wallets appear prominently."}, {"type": "table", "columns": ["rank", "address", "label", "balance_strk"], "rows": []}]',
    now() - interval '2 days' + interval '25 seconds'
  )
ON CONFLICT (id) DO NOTHING;
