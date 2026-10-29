import { db } from "../../database/db.js";

export default {
  name: ["welcome", "ترحيب"],
  description: "تشغيل أو إيقاف الترحيب والوداع",
  category: "grupos",
  groupOnly: true,
  adminOnly: true,

  async run({ from, args, reply }) {
    const opcion = args[0]?.toLowerCase();

    if (!["on", "off"].includes(opcion)) {
      const estado = db.getGroup(from).welcome ? "مُفعّل ✅" : "مُعطّل ❌";
      return await reply({
        text: `『👋』الترحيب والوداع *${estado}*.\n> اكتب *.welcome on* أو *.welcome off*`,
      });
    }

    db.setGroup(from, { welcome: opcion === "on" });

    return await reply({
      text: `『👋』الترحيب والوداع ${opcion === "on" ? "مُفعّل ✅" : "مُعطّل ❌"}.`,
    });
  },
};
