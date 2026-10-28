import { DatabaseSync } from "node:sqlite";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(__dirname);
const DB_PATH = process.env.BOT_DB_PATH || join(DB_DIR, "bot.db");

mkdirSync(DB_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    jid TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    is_banned INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS groups (
    jid TEXT PRIMARY KEY,
    name TEXT DEFAULT '',
    is_muted INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS group_features (
    group_jid TEXT NOT NULL,
    feature TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    PRIMARY KEY (group_jid, feature)
  );

  CREATE TABLE IF NOT EXISTS handled_messages (
    message_id TEXT PRIMARY KEY,
    group_jid TEXT NOT NULL,
    handled_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sub_bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT UNIQUE NOT NULL,
    pairing_code TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    session_path TEXT NOT NULL DEFAULT '',
    installed_at TEXT DEFAULT (datetime('now')),
    last_connected_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_handled_at ON handled_messages(handled_at);
`);

const stmts = {
  getUser: db.prepare("SELECT * FROM users WHERE jid = ?"),
  insertUser: db.prepare("INSERT INTO users (jid, name) VALUES (?, ?) ON CONFLICT(jid) DO UPDATE SET name = excluded.name RETURNING *"),
  banUser: db.prepare("UPDATE users SET is_banned = 1 WHERE jid = ?"),
  getSetting: db.prepare("SELECT value FROM settings WHERE key = ?"),
  upsertSetting: db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"),
  getGroup: db.prepare("SELECT * FROM groups WHERE jid = ?"),
  insertGroup: db.prepare("INSERT OR IGNORE INTO groups (jid, name) VALUES (?, ?)"),
  getGroupMuted: db.prepare("SELECT is_muted FROM groups WHERE jid = ?"),
  getGroupActive: db.prepare("SELECT is_active FROM groups WHERE jid = ?"),
  setGroupActive: db.prepare("UPDATE groups SET is_active = ? WHERE jid = ?"),
  getFeature: db.prepare("SELECT enabled FROM group_features WHERE group_jid = ? AND feature = ?"),
  upsertFeature: db.prepare("INSERT INTO group_features (group_jid, feature, enabled) VALUES (?, ?, ?) ON CONFLICT(group_jid, feature) DO UPDATE SET enabled = excluded.enabled"),
  getEnabledFeatures: db.prepare("SELECT feature FROM group_features WHERE group_jid = ? AND enabled = 1"),
  claimMessage: db.prepare("INSERT OR IGNORE INTO handled_messages (message_id, group_jid) VALUES (?, ?)"),
  checkClaim: db.prepare("SELECT changes() AS affected"),
  cleanOldHandled: db.prepare("DELETE FROM handled_messages WHERE handled_at < ?"),
  getSubBot: db.prepare("SELECT * FROM sub_bots WHERE phone = ?"),
  insertSubBot: db.prepare("INSERT INTO sub_bots (phone, session_path, pairing_code, status) VALUES (?, ?, ?, 'pending') RETURNING *"),
  updateSubBotPending: db.prepare("UPDATE sub_bots SET pairing_code = ?, session_path = ?, status = 'pending' WHERE phone = ? RETURNING *"),
  updateSubBotStatus: db.prepare("UPDATE sub_bots SET status = ?, last_connected_at = CASE WHEN ? = 'connected' THEN datetime('now') ELSE last_connected_at END WHERE phone = ?"),
  listSubBots: db.prepare("SELECT * FROM sub_bots ORDER BY installed_at DESC"),
};

export async function getUser(jid) {
  return stmts.getUser.get(jid) ?? null;
}

export async function registerUser(jid, name = "") {
  return stmts.insertUser.get(jid, name);
}

export async function banUser(jid) {
  stmts.banUser.run(jid);
}

export async function isBanned(jid) {
  const row = stmts.getUser.get(jid);
  return row?.is_banned === 1;
}

export async function getSetting(key, fallback = null) {
  const row = stmts.getSetting.get(key);
  return row?.value ?? fallback;
}

export async function setSetting(key, value) {
  stmts.upsertSetting.run(key, String(value));
}

export async function registerGroup(jid, name = "") {
  stmts.insertGroup.run(jid, name);
}

export async function isGroupMuted(jid) {
  const row = stmts.getGroupMuted.get(jid);
  return row?.is_muted === 1;
}

export async function isGroupActive(groupJid) {
  const row = stmts.getGroupActive.get(groupJid);
  return row?.is_active === 1;
}

export async function setGroupActive(groupJid, active) {
  stmts.setGroupActive.run(active ? 1 : 0, groupJid);
}

export async function isFeatureEnabled(groupJid, feature) {
  const row = stmts.getFeature.get(groupJid, feature);
  return row?.enabled === 1;
}

export async function setFeatureEnabled(groupJid, feature, enabled) {
  stmts.upsertFeature.run(groupJid, feature, enabled ? 1 : 0);
}

export async function getEnabledFeatures(groupJid) {
  const rows = stmts.getEnabledFeatures.all(groupJid);
  return new Set(rows.map((r) => r.feature));
}

export async function tryClaimMessage(messageId, groupJid) {
  const info = stmts.claimMessage.run(messageId, groupJid);
  return info.changes > 0;
}

export async function cleanOldHandledMessages(maxAgeHours = 24) {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString();
  stmts.cleanOldHandled.run(cutoff);
}

setInterval(() => { try { cleanOldHandledMessages(); } catch {} }, 3600_000);

export async function registerSubBot(phone, sessionPath, pairingCode = "") {
  const existing = stmts.getSubBot.get(phone);
  if (existing) {
    return stmts.updateSubBotPending.run(pairingCode, sessionPath, phone);
  }
  return stmts.insertSubBot.get(phone, sessionPath, pairingCode);
}

export async function updateSubBotStatus(phone, status) {
  stmts.updateSubBotStatus.run(status, status, phone);
}

export async function getSubBot(phone) {
  return stmts.getSubBot.get(phone) ?? null;
}

export async function listSubBots() {
  return stmts.listSubBots.all();
}
