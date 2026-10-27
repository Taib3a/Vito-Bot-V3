/*
# Add group activation + per-group feature toggles + anti-spam dedup

1. Modified Tables
- `groups`: add `is_active` (boolean, default false) — whether the bot is
  activated in this specific group. The bot only responds to commands and
  anti-features in groups where is_active = true.

2. New Tables
- `group_features` — per-group on/off toggles for anti-features.
  - `group_jid` (text) — which group
  - `feature` (text) — feature key (anti_links, welcome, group_monitor, anti_bots, auto_level)
  - `enabled` (boolean, default false)
  - Primary key on (group_jid, feature) so each group+feature pair is unique.
- `handled_messages` — anti-spam dedup table. When multiple sub-bots share a
  group, only the first to insert a row for a given message ID responds; the
  others see the row already exists and skip.
  - `message_id` (text, primary key) — Baileys msg.key.id
  - `group_jid` (text)
  - `handled_at` (timestamptz)

3. Security
- RLS enabled on all new tables.
- Single-tenant backend bot (no sign-in), policies use `TO anon, authenticated`.
- CRUD granted to `anon, authenticated`.
*/

ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS group_features (
  group_jid text NOT NULL,
  feature text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (group_jid, feature)
);

CREATE TABLE IF NOT EXISTS handled_messages (
  message_id text PRIMARY KEY,
  group_jid text NOT NULL,
  handled_at timestamptz DEFAULT now()
);

ALTER TABLE group_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE handled_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON group_features TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON handled_messages TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_group_features" ON group_features;
CREATE POLICY "anon_select_group_features" ON group_features FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_group_features" ON group_features;
CREATE POLICY "anon_insert_group_features" ON group_features FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_group_features" ON group_features;
CREATE POLICY "anon_update_group_features" ON group_features FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_group_features" ON group_features;
CREATE POLICY "anon_delete_group_features" ON group_features FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_handled" ON handled_messages;
CREATE POLICY "anon_select_handled" ON handled_messages FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_handled" ON handled_messages;
CREATE POLICY "anon_insert_handled" ON handled_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_handled" ON handled_messages;
CREATE POLICY "anon_delete_handled" ON handled_messages FOR DELETE TO anon, authenticated USING (true);
