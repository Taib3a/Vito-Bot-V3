/**
 * Syntax-checks every source file by walking the directories, so new
 * commands/anti-features are covered automatically — package.json never
 * needs to list individual files again.
 */
import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROOTS = ["index.js", "database", "الاضافات", "الاوامر"];
const SKIP = new Set(["node_modules", ".git", "database/sessions-taib"]);

function collect(entry, out = []) {
  let stat;
  try {
    stat = statSync(entry);
  } catch {
    return out;
  }

  if (stat.isDirectory()) {
    for (const name of readdirSync(entry)) {
      if (SKIP.has(name)) continue;
      collect(join(entry, name), out);
    }
  } else if (entry.endsWith(".js")) {
    out.push(entry);
  }
  return out;
}

const files = ROOTS.flatMap((r) => collect(join(root, r))).sort();

if (files.length === 0) {
  console.error("No source files found — check the ROOTS list.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  const rel = file.slice(root.length + 1);
  if (res.status === 0) {
    console.log(`ok    ${rel}`);
  } else {
    failed++;
    console.error(`FAIL  ${rel}`);
    console.error((res.stderr || "").trim());
  }
}

console.log(`\n${files.length - failed}/${files.length} files passed.`);
process.exit(failed === 0 ? 0 : 1);
