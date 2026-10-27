/*
# Create sub_bots table to track installed sub-bots

1. New Tables
- `sub_bots` — tracks sub-bots installed via the .تنصيب command.
  - `id` (uuid, primary key)
  - `phone` (text, unique) — phone number of the sub-bot account
  - `pairing_code` (text) — the pairing code generated for this sub-bot
  - `status` (text) — 'pending', 'connected', 'disconnected', 'failed'
  - `session_path` (text) — path to the sub-bot's auth state folder
  - `installed_at` (timestamptz)
  - `last_connected_at` (timestamptz) — when the sub-bot last connected

2. Security
- RLS enabled.
- Single-tenant backend bot, no sign-in; policies use `TO anon, authenticated`.
- CRUD granted to `anon, authenticated`.
*/

CREATE TABLE IF NOT EXISTS sub_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  pairing_code text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  session_path text NOT NULL DEFAULT '',
  installed_at timestamptz DEFAULT now(),
  last_connected_at timestamptz
);

ALTER TABLE sub_bots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON sub_bots TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_sub_bots" ON sub_bots;
CREATE POLICY "anon_select_sub_bots" ON sub_bots FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sub_bots" ON sub_bots;
CREATE POLICY "anon_insert_sub_bots" ON sub_bots FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sub_bots" ON sub_bots;
CREATE POLICY "anon_update_sub_bots" ON sub_bots FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sub_bots" ON sub_bots;
CREATE POLICY "anon_delete_sub_bots" ON sub_bots FOR DELETE TO anon, authenticated USING (true);
