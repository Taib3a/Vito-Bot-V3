/*
# Create core tables for 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹

1. New Tables
- `users` — WhatsApp users who interact with the bot.
  - `jid` (text, unique) — WhatsApp JID
  - `name` (text) — display name or push name
  - `is_owner` (boolean, default false)
  - `is_banned` (boolean, default false)
  - `warn_count` (int, default 0)
  - `joined_at` (timestamptz)
- `groups` — WhatsApp groups the bot is in.
  - `jid` (text, unique)
  - `name` (text)
  - `is_muted` (boolean, default false)
  - `joined_at` (timestamptz)
- `settings` — key/value store for bot configuration.
  - `key` (text, unique)
  - `value` (text)
  - `updated_at` (timestamptz)

2. Security
- RLS enabled on all tables.
- Single-tenant backend bot, no sign-in screen; policies use `TO anon, authenticated`.
- CRUD granted to `anon, authenticated`.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid text UNIQUE NOT NULL,
  name text DEFAULT '',
  is_owner boolean NOT NULL DEFAULT false,
  is_banned boolean NOT NULL DEFAULT false,
  warn_count int NOT NULL DEFAULT 0,
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid text UNIQUE NOT NULL,
  name text DEFAULT '',
  is_muted boolean NOT NULL DEFAULT false,
  joined_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON groups TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_groups" ON groups;
CREATE POLICY "anon_select_groups" ON groups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_groups" ON groups;
CREATE POLICY "anon_insert_groups" ON groups FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_groups" ON groups;
CREATE POLICY "anon_update_groups" ON groups FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_groups" ON groups;
CREATE POLICY "anon_delete_groups" ON groups FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE TO anon, authenticated USING (true);
