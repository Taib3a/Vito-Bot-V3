import { db } from "../../database/db.js";

export default {
  name: ["antilink", "مضاد-روابط"],
  description: "تشغيل أو إيقاف مضاد الروابط",
  category: "grupos",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply }) {
    const opcion = args[0]?.toLowerCase();

    if (!["on", "off"].includes(opcion)) {
      const estado = db.getGroup(from).antilink ? "مُفعّل ✅" : "مُعطّل ❌";
      return await reply({
        text: `『🔗』مضاد الروابط *${estado}*.\n> اكتب *.antilink on* أو *.antilink off*`,
      });
    }

    db.setGroup(from, { antilink: opcion === "on" });

    return await reply({
      text: `『🔗』مضاد الروابط ${opcion === "on" ? "مُفعّل ✅" : "مُعطّل ❌"}.`,
    });
  },
};
