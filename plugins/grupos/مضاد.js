import { db } from "../../database/db.js";
import { antifeatures } from "../../core/مضاد/index.js";

const ON = new Set(["تفعيل", "on", "تشغيل"]);
const OFF = new Set(["ايقاف", "إيقاف", "off", "تعطيل"]);

/** يبحث عن مضاد بالاسم العربي أو بعلمه (antilink، antispam…). */
function find(name = "") {
  const q = name.toLowerCase();
  return antifeatures.find((a) => a.name.toLowerCase() === q || a.flag.toLowerCase() === q);
}

function panel(groupData) {
  const lines = antifeatures.map(
    (a) => `${groupData[a.flag] ? "✅" : "❌"} ${a.name}  →  *.تفعيل ${a.flag}*`
  );
  return (
    `『🛡️』*لوحة تحكم المضادات*\n\n${lines.join("\n")}\n\n` +
    `> تفعيل الكل: *.تفعيل all*\n> إيقاف الكل: *.ايقاف all*`
  );
}

export default {
  name: ["مضاد", "مضادات", "antifeatures", "تفعيل", "ايقاف", "إيقاف"],
  description: "تحكم واحد بكل المضادات: تفعيل/إيقاف",
  category: "grupos",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, cmdName, reply }) {
    const name = String(cmdName).toLowerCase();

    // الاسم المستخدم يحدّد الاتجاه: .تفعيل = on، .ايقاف = off.
    let accion = null;
    if (ON.has(name)) accion = "on";
    else if (OFF.has(name)) accion = "off";
    else accion = (args[0] || "").toLowerCase();

    // بلا هدف: اعرض لوحة التحكم.
    const target = ON.has(name) || OFF.has(name) ? args[0] : args[1];
    if (!target) return await reply({ text: panel(db.getGroup(from)) });

    // الكل.
    if (target.toLowerCase() === "all") {
      if (accion !== "on" && accion !== "off") {
        return await reply({ text: "❌ استخدم: *.تفعيل all* أو *.ايقاف all*" });
      }
      const value = accion === "on";
      const patch = {};
      for (const a of antifeatures) patch[a.flag] = value;
      db.setGroup(from, patch);
      return await reply({
        text: `『🛡️』تم ${value ? "تفعيل ✅" : "إيقاف ❌"} *كل* المضادات (${antifeatures.length}).`,
      });
    }

    if (accion !== "on" && accion !== "off") {
      return await reply({ text: panel(db.getGroup(from)) });
    }

    const mod = find(target);
    if (!mod) {
      const names = antifeatures.map((a) => `${a.flag} (${a.name})`).join("، ");
      return await reply({ text: `❌ لا يوجد مضاد بهذا الاسم.\n> المتاح: ${names}` });
    }

    db.setGroup(from, { [mod.flag]: accion === "on" });

    return await reply({
      text: `『🛡️』${mod.name} ${accion === "on" ? "مُفعّل ✅" : "مُعطّل ❌"}.`,
    });
  },
};
