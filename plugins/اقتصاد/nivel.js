import { xpProgress } from "../../core/xp.js";
import { db } from "../../database/db.js";

export default {
  name: ["nivel", "rank", "xp", "مستوى", "رتبتي"],
  description: "Muestra tu nivel y XP",
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const user = db.getUser(sender);
    const { level, xp, missing } = xpProgress(user.xp || 0);

    await reply({
      text: tr(`『⭐』*Nivel:* ${level}\n*XP:* ${xp}\n*Faltan:* ${missing} XP para nivel ${level + 1}`, `『⭐』*المستوى:* ${level}\n*الخبرة:* ${xp}\n*المتبقي:* ${missing} خبرة للمستوى ${level + 1}`)
    });
  }
};