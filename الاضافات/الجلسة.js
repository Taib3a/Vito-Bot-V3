import { DatabaseSync } from "node:sqlite";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import { mkdirSync, readFileSync, readdirSync, renameSync } from "fs";
import { join } from "path";
import log from "./الكونسل.js";

const AUTH_DB = "auth.db";
const LEGACY_BACKUP = "backup-json";

/**
 * Single-file SQLite auth state.
 *
 * Baileys' useMultiFileAuthState writes one JSON file per key (creds.json plus
 * pre-key-*.json and session-*.json), so a session folder grows into hundreds
 * of files. Everything lives in one auth.db here instead. An existing
 * multi-file session is imported on first run and its JSON files are moved
 * aside into backup-json/ so nothing is lost.
 */
export async function useSQLiteAuthState(sessionDir) {
  mkdirSync(sessionDir, { recursive: true });

  const db = openDatabase(join(sessionDir, AUTH_DB));
  db.exec("CREATE TABLE IF NOT EXISTS auth (id TEXT PRIMARY KEY, data TEXT NOT NULL)");

  const selectStmt = db.prepare("SELECT data FROM auth WHERE id = ?");
  const upsertStmt = db.prepare(
    "INSERT INTO auth (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data"
  );
  const deleteStmt = db.prepare("DELETE FROM auth WHERE id = ?");

  const readData = (id) => {
    const row = selectStmt.get(id);
    if (!row?.data) return null;
    try {
      return JSON.parse(row.data, BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const writeData = (value, id) => upsertStmt.run(id, JSON.stringify(value, BufferJSON.replacer));

  if (!readData("creds")) {
    importLegacySession(sessionDir, writeData);
  }

  const creds = readData("creds") ?? initAuthCreds();
  writeData(creds, "creds");

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            let value = readData(`${type}-${id}`);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            data[id] = value;
          }
          return data;
        },
        set: async (data) => {
          for (const category of Object.keys(data)) {
            for (const id of Object.keys(data[category])) {
              const value = data[category][id];
              if (value) writeData(value, `${category}-${id}`);
              else deleteStmt.run(`${category}-${id}`);
            }
          }
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
  };
}

/**
 * Drop every cached key except `creds`.
 *
 * A stale key store makes Baileys repeatedly fail the handshake and reconnect,
 * which is the tight 428 loop. Clearing the keys keeps `creds` (so the session
 * survives) but forces a clean re-handshake.
 */
export function clearSocketKeys(sessionDir) {
  try {
    const db = new DatabaseSync(join(sessionDir, AUTH_DB));
    const { changes } = db.prepare("DELETE FROM auth WHERE id != 'creds'").run();
    db.close();
    if (changes > 0) {
      log.warn(`نُظّفت ${changes} مفاتيح قديمة من الجلسة قبل إعادة الاتصال.`);
    }
  } catch (err) {
    log.warn(`تعذّر تنظيف مفاتيح الجلسة: ${err.message}`);
  }
}

function openDatabase(dbPath) {
  try {
    return new DatabaseSync(dbPath);
  } catch (err) {
    // A corrupt auth.db would otherwise brick every boot; quarantine it and
    // start a fresh session so the user can re-pair instead of being stuck.
    const quarantine = `${dbPath}.corrupt-${Date.now()}`;
    try {
      renameSync(dbPath, quarantine);
    } catch {
      // nothing else we can do — surface the original error below
    }
    log.warn(`تعذّر فتح ${dbPath} (${err.message}) — نُقل إلى ${quarantine} والبدء من جديد.`);
    return new DatabaseSync(dbPath);
  }
}

function importLegacySession(sessionDir, writeData) {
  let files;
  try {
    files = readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }
  if (files.length === 0) return;

  const backupDir = join(sessionDir, LEGACY_BACKUP);
  mkdirSync(backupDir, { recursive: true });

  let imported = 0;
  for (const file of files) {
    try {
      const value = JSON.parse(readFileSync(join(sessionDir, file), "utf8"), BufferJSON.reviver);
      writeData(value, file === "creds.json" ? "creds" : file.replace(/\.json$/, ""));
      renameSync(join(sessionDir, file), join(backupDir, file));
      imported++;
    } catch {
      // skip files that are not valid session data
    }
  }

  if (imported > 0) {
    log.info(`تم ترحيل ${imported} ملف جلسة إلى قاعدة بيانات واحدة (${AUTH_DB}).`);
  }
}
