import { DatabaseSync } from "node:sqlite";

/**
 * node:sqlite wrapper exposing the slice of the better-sqlite3 API this
 * project uses (`pragma`, `exec`, `prepare().get/all/run`, `transaction`).
 *
 * node:sqlite ships inside Node, so there is no native build step and no
 * prebuilt-binary mismatch — a whole class of install-time crashes disappears.
 */
export function openDatabase(dbPath, { readonly = false } = {}) {
  const db = readonly ? new DatabaseSync(dbPath, { readOnly: true }) : new DatabaseSync(dbPath);

  return {
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
        // Unsupported pragma — never fatal.
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

    close: () => {
      try {
        db.close();
      } catch {}
    },
  };
}
