-- Migration: 20260325000000_initial_schema.sql
-- Phase 3 MVP: threads, messages, address_mappings, starknet_selectors

-- ============================================================
-- Tables
-- ============================================================

CREATE TABLE threads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users NOT NULL,
  title       text NOT NULL,
  is_pinned   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE TABLE messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid REFERENCES threads NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     jsonb NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE address_mappings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace   text NOT NULL DEFAULT 'default',
  address     text NOT NULL,
  chain       text NOT NULL CHECK (chain IN ('starknet', 'ethereum')),
  name        text,
  entity      text,
  category    text,
  tags        text[],
  created_by  uuid REFERENCES auth.users,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (address, chain)
);

-- selector is NOT UNIQUE: same Poseidon hash can map to different protocols
-- (e.g. ERC-20 and ERC-721 both emit selector 0x0099cd8bde... for "Transfer")
-- Composite (selector, protocol) is unique instead.
CREATE TABLE starknet_selectors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selector            text NOT NULL,
  event_name          text NOT NULL,
  protocol            text,
  contract_addresses  text[] NOT NULL DEFAULT '{}',
  keys_layout         jsonb NOT NULL DEFAULT '[]',
  data_layout         jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz DEFAULT now(),
  UNIQUE (selector, protocol)
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_address_mappings_address_chain ON address_mappings(address, chain);
CREATE INDEX idx_threads_user_id_updated_at ON threads(user_id, updated_at DESC);

-- ============================================================
-- Auto-update updated_at on threads
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER threads_updated_at
  BEFORE UPDATE ON threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE address_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE starknet_selectors ENABLE ROW LEVEL SECURITY;

-- Admin check: role = 'admin' stored in auth JWT app_metadata
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Threads: users can only read/write their own threads
-- (select auth.uid()) evaluated once per query, not per row
CREATE POLICY "threads_select_own" ON threads
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "threads_insert_own" ON threads
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "threads_update_own" ON threads
  FOR UPDATE USING ((select auth.uid()) = user_id);

CREATE POLICY "threads_delete_own" ON threads
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Messages: users can only read/write messages in their own threads
CREATE POLICY "messages_select_own_threads" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = messages.thread_id
        AND threads.user_id = (select auth.uid())
    )
  );

CREATE POLICY "messages_insert_own_threads" ON messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = messages.thread_id
        AND threads.user_id = (select auth.uid())
    )
  );

CREATE POLICY "messages_update_own_threads" ON messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = messages.thread_id
        AND threads.user_id = (select auth.uid())
    )
  );

CREATE POLICY "messages_delete_own_threads" ON messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM threads
      WHERE threads.id = messages.thread_id
        AND threads.user_id = (select auth.uid())
    )
  );

-- Address mappings: all authenticated users can read; only admins can write
CREATE POLICY "address_mappings_select_authenticated" ON address_mappings
  FOR SELECT USING ((select auth.role()) = 'authenticated');

CREATE POLICY "address_mappings_insert_admin" ON address_mappings
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "address_mappings_update_admin" ON address_mappings
  FOR UPDATE USING (is_admin());

CREATE POLICY "address_mappings_delete_admin" ON address_mappings
  FOR DELETE USING (is_admin());

-- Starknet selectors: read-only for authenticated users (seeded data, admin-managed)
CREATE POLICY "starknet_selectors_select_authenticated" ON starknet_selectors
  FOR SELECT USING ((select auth.role()) = 'authenticated');
