import { db } from "../../database/db.js";

export default {
  name: ["antibot", "مضاد-بوتات"],
  description: "تشغيل أو إيقاف مضاد البوتات",
  category: "grupos",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply }) {
    const opcion = args[0]?.toLowerCase();

    if (!["on", "off"].includes(opcion)) {
      const estado = db.getGroup(from).antibot ? "مُفعّل ✅" : "مُعطّل ❌";
      return await reply({
        text: `『🤖』مضاد البوتات *${estado}*.\n> اكتب *.antibot on* أو *.antibot off*`,
      });
    }

    db.setGroup(from, { antibot: opcion === "on" });

    return await reply({
      text: `『🤖』مضاد البوتات ${opcion === "on" ? "مُفعّل ✅" : "مُعطّل ❌"}.`,
    });
  },
};
