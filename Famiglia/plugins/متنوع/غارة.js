import { db } from "../../database/db.js";
import { startRaid, strike, raidStatus, cancelRaid } from "../../Corleone/raid.js";

const START = ["غارة", "غاره", "غارة-بدء"];
const ATTACK = ["هجوم", "هجوم-الوحش"];
const STATUS = ["غارة-حال", "حالة-الغارة"];
const CANCEL = ["انسحاب-غارة", "الغاء-غارة", "إلغاء-غارة"];

const fmt = (n) => Math.floor(n).toLocaleString("en-US");

const USAGE =
  "⚔️ *لعبة الغارة*\n\n" +
  "👑 *للمشرف:* `.غارة` تفتح غارة جديدة.\n" +
  "🗡️ *للجميع:* `.هجوم` ضربة واحدة كل ثلاث ثوانٍ.\n" +
  "📊 `.غارة-حال` حالة الوحش والدم.\n" +
  "🏳️ `.انسحاب-غارة` يلغي المشرف الغارة.";

export default {
  name: [...START, ...ATTACK, ...STATUS, ...CANCEL],
  description: "لعبة جماعية: وحش يظهر في المجموعة ويتعاون الأعضاء لإسقاطه",
  category: "متنوع",
  groupOnly: true,

  async run({ sock, from, sender, msg, cmdName, isAdmin, isMod, isOwner, reply, react }) {
    const cmd = String(cmdName || "").trim().toLowerCase();
    const byName = msg?.pushName || db.getPushName(sender) || String(sender).split("@")[0];
    const canManage = isAdmin || isMod || isOwner;

    if (START.includes(cmd)) {
      if (!canManage) return reply({ text: "❌ بدء الغارة لمشرفي المجموعة ومالك البوت." });
      const res = await startRaid({ sock, from, msg, byName });
      if (!res.ok) return reply({ text: res.text });
      return react("⚔️");
    }

    if (ATTACK.includes(cmd)) {
      const res = await strike({ sock, from, sender, byName });
      if (!res.ok) return reply({ text: res.text });
      if (res.killed) return react("🏆");
      const line = res.crit ? "💥 *ضربة حرجة*" : "⚔️ *ضربة*";
      return reply({ text: `${line} — ${fmt(res.damage)}\n🩸 بقي ${fmt(res.remaining)} من ${fmt(res.max)}` });
    }

    if (STATUS.includes(cmd)) {
      const res = raidStatus(from);
      return reply({ text: res.ok ? res.text : `${res.text}\n\n${USAGE}` });
    }

    if (CANCEL.includes(cmd)) {
      if (!canManage) return reply({ text: "❌ إلغاء الغارة لمشرفي المجموعة ومالك البوت." });
      const res = await cancelRaid({ sock, from, byName });
      return reply({ text: res.text });
    }
  },
};
