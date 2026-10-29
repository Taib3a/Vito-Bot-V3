import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import config from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.BOT_DB_PATH || join(__dirname, "vito.sqlite");

mkdirSync(__dirname, { recursive: true });

/**
 * Thin wrapper over node:sqlite exposing the small better-sqlite3 surface this
 * project needs (`pragma`, `exec`, `prepare`, `transaction`).
 *
 * node:sqlite ships with Node itself, so there is no native build step and no
 * prebuilt-binary mismatch — one less way for a boot to fail.
 */
function openDatabase(path) {
  const db = new DatabaseSync(path);
  return {
    raw: db,
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        get: (...args) => stmt.get(...args),
        all: (...args) => stmt.all(...args),
        run: (...args) => stmt.run(...args),
      };
    },
    pragma: (expr) => {
      try {
        db.exec(`PRAGMA ${expr}`);
      } catch {
        // unsupported pragma — not fatal
      }
    },
    transaction: (fn) => (...args) => {
      db.exec("BEGIN");
      try {
        const result = fn(...args);
        db.exec("COMMIT");
        return result;
      } catch (err) {
        try {
          db.exec("ROLLBACK");
        } catch {}
        throw err;
      }
    },
    close: () => db.close(),
  };
}

export const db_instance = openDatabase(DB_PATH);
db_instance.pragma("journal_mode = WAL");
db_instance.pragma("synchronous = NORMAL");
db_instance.pragma("wal_autocheckpoint = 1000");
db_instance.pragma("busy_timeout = 3000");

db_instance.exec(`
  CREATE TABLE IF NOT EXISTS users (
    jid TEXT PRIMARY KEY,
    data TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS groups (
    jid TEXT PRIMARY KEY,
    data TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS bots (
    jid TEXT PRIMARY KEY,
    data TEXT DEFAULT '{}'
  );
`);

const hierarchy = ["user", "premium", "mod", "coowner", "owner"];

/** Users are always keyed by bare number, so 123@s.whatsapp.net and 123:5@... match. */
function normalizeJid(jid = "") {
  return String(jid).split("@")[0].split(":")[0];
}

const stmts = {
  getUser: db_instance.prepare("SELECT data FROM users WHERE jid = ?"),
  insertUser: db_instance.prepare("INSERT INTO users (jid, data) VALUES (?, ?)"),
  updateUser: db_instance.prepare("UPDATE users SET data = ? WHERE jid = ?"),
  deleteUser: db_instance.prepare("DELETE FROM users WHERE jid = ?"),
  getAllUsers: db_instance.prepare("SELECT jid, data FROM users"),
  countUsers: db_instance.prepare("SELECT COUNT(*) AS n FROM users"),

  getGroup: db_instance.prepare("SELECT data FROM groups WHERE jid = ?"),
  insertGroup: db_instance.prepare("INSERT INTO groups (jid, data) VALUES (?, ?)"),
  updateGroup: db_instance.prepare("UPDATE groups SET data = ? WHERE jid = ?"),
  countGroups: db_instance.prepare("SELECT COUNT(*) AS n FROM groups"),

  getBot: db_instance.prepare("SELECT data FROM bots WHERE jid = ?"),
  insertBot: db_instance.prepare("INSERT INTO bots (jid, data) VALUES (?, ?)"),
  updateBot: db_instance.prepare("UPDATE bots SET data = ? WHERE jid = ?"),
  getAllBots: db_instance.prepare("SELECT jid, data FROM bots"),
  deleteBot: db_instance.prepare("DELETE FROM bots WHERE jid = ?"),
};

// One-off migration: fold rows stored with a full JID into the bare-number row.
function migrateUserKeys() {
  const rows = db_instance
    .prepare("SELECT jid, data FROM users WHERE jid LIKE '%@%' OR jid LIKE '%:%'")
    .all();
  if (!rows.length) return;

  const run = db_instance.transaction(() => {
    for (const row of rows) {
      const key = normalizeJid(row.jid);
      const old = JSON.parse(row.data);
      const cur = stmts.getUser.get(key);

      if (!cur) {
        stmts.insertUser.run(key, JSON.stringify(old));
      } else {
        const base = JSON.parse(cur.data);
        const merged = {
          ...base,
          ...old,
          role: base.role && base.role !== "user" ? base.role : old.role || "user",
          banned: base.banned === true || old.banned === true,
          registeredAt: [base.registeredAt, old.registeredAt].filter(Boolean).sort()[0],
        };
        stmts.updateUser.run(JSON.stringify(merged), key);
      }
      stmts.deleteUser.run(row.jid);
    }
  });
  run();
}

migrateUserKeys();

function getUser(jid) {
  const key = normalizeJid(jid);
  const row = stmts.getUser.get(key);
  if (!row) {
    const defaultUser = {
      role: "user",
      banned: false,
      registeredAt: new Date().toISOString(),
    };
    stmts.insertUser.run(key, JSON.stringify(defaultUser));
    return defaultUser;
  }
  return JSON.parse(row.data);
}

function getGroup(jid) {
  const row = stmts.getGroup.get(jid);
  if (!row) {
    const defaultGroup = {
      welcome: false,
      antilink: false,
      antispam: false,
      antibot: false,
      primaryBot: null,
      adminMode: false,
      selfMode: false,
    };
    stmts.insertGroup.run(jid, JSON.stringify(defaultGroup));
    return defaultGroup;
  }
  return JSON.parse(row.data);
}

function getBot(jid) {
  const row = stmts.getBot.get(jid);
  if (!row) {
    const defaultBot = { label: "Subbot", isMain: false, status: "offline" };
    stmts.insertBot.run(jid, JSON.stringify(defaultBot));
    return defaultBot;
  }
  return JSON.parse(row.data);
}

export const db = {
  getUser,
  getGroup,
  getBot,

  setUser(jid, dataObject) {
    const currentData = getUser(jid);
    stmts.updateUser.run(JSON.stringify({ ...currentData, ...dataObject }), normalizeJid(jid));
  },

  getAllUsers() {
    return stmts.getAllUsers.all().map((row) => ({ jid: row.jid, ...JSON.parse(row.data) }));
  },

  countUsers() {
    return stmts.countUsers.get().n;
  },

  countGroups() {
    return stmts.countGroups.get().n;
  },

  setGroup(jid, dataObject) {
    const currentData = getGroup(jid);
    stmts.updateGroup.run(JSON.stringify({ ...currentData, ...dataObject }), jid);
  },

  setBot(jid, dataObject, force = false) {
    const currentData = getBot(jid);

    // A bot that owns the session cannot be demoted by a stale write.
    if (currentData.isMain === true && dataObject.isMain === false && !force) return;

    if (force) stmts.updateBot.run(JSON.stringify(dataObject), jid);
    else stmts.updateBot.run(JSON.stringify({ ...currentData, ...dataObject }), jid);
  },

  deleteBot(jid) {
    stmts.deleteBot.run(jid);
  },

  getAllBots() {
    try {
      db_instance.pragma("wal_checkpoint(PASSIVE)");
    } catch {}
    return stmts.getAllBots.all().map((row) => ({ id: row.jid, jid: row.jid, ...JSON.parse(row.data) }));
  },

  getOnlineBots() {
    return db.getAllBots().filter((bot) => bot.status === "online");
  },

  hasRole(jid, role) {
    const num = normalizeJid(jid);

    if (config.ownerNumber?.includes(num)) return true;
    if (config.coOwners?.includes(num) && hierarchy.indexOf("coowner") >= hierarchy.indexOf(role)) {
      return true;
    }

    const user = getUser(jid);
    return hierarchy.indexOf(user.role) >= hierarchy.indexOf(role);
  },

  setRole(jid, role) {
    db.setUser(jid, { role });
  },

  isBanned(jid) {
    return getUser(jid).banned === true;
  },

  ban(jid) {
    db.setUser(jid, { banned: true });
  },

  unban(jid) {
    db.setUser(jid, { banned: false });
  },

  setPrimary(groupJid, botId) {
    db.setGroup(groupJid, { primaryBot: botId });
  },

  getPrimary(groupJid) {
    return getGroup(groupJid).primaryBot || null;
  },

  delPrimary(groupJid) {
    const group = getGroup(groupJid);
    delete group.primaryBot;
    stmts.updateGroup.run(JSON.stringify(group), groupJid);
  },

  setPushName(jid, name) {
    if (!jid || !name) return;
    const user = getUser(jid);
    if (user.pushName !== name) db.setUser(jid, { pushName: name });
  },

  getPushName(jid) {
    return getUser(jid).pushName || null;
  },

  getEco(jid) {
    const user = getUser(jid);
    return {
      bolsillo: user.bolsillo ?? 0,
      banco: user.banco ?? 0,
      inventario: user.inventario ?? [],
      lastWork: user.lastWork ?? 0,
    };
  },

  setEco(jid, dataObject) {
    db.setUser(jid, dataObject);
  },

  getMarriage(jid) {
    return getUser(jid).partner || null;
  },

  marry(jid1, jid2) {
    const marriedAt = new Date().toISOString();
    db.setUser(jid1, { partner: jid2, marriedAt });
    db.setUser(jid2, { partner: jid1, marriedAt });
  },

  divorce(jid) {
    const partner = db.getMarriage(jid);
    if (partner) {
      const partnerUser = getUser(partner);
      delete partnerUser.partner;
      delete partnerUser.marriedAt;
      stmts.updateUser.run(JSON.stringify(partnerUser), normalizeJid(partner));
    }
    const user = getUser(jid);
    delete user.partner;
    delete user.marriedAt;
    stmts.updateUser.run(JSON.stringify(user), normalizeJid(jid));
  },

  setGenero(jid, genero) {
    db.setUser(jid, { genero });
  },

  getGenero(jid) {
    return getUser(jid).genero || null;
  },
};

export default db;
