import { db } from "../../database/db.js";

export default {
  name: ["antispam", "مضاد-سبام", "مضاد-سبان"],
  description: "تشغيل أو إيقاف مضاد السبام",
  category: "grupos",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply }) {
    const opcion = args[0]?.toLowerCase();

    if (!["on", "off"].includes(opcion)) {
      const estado = db.getGroup(from).antispam ? "مُفعّل ✅" : "مُعطّل ❌";
      return await reply({
        text: `『🚫』مضاد السبام *${estado}*.\n> اكتب *.antispam on* أو *.antispam off*`,
      });
    }

    db.setGroup(from, { antispam: opcion === "on" });

    return await reply({
      text: `『🚫』مضاد السبام ${opcion === "on" ? "مُفعّل ✅" : "مُعطّل ❌"}.`,
    });
  },
};
