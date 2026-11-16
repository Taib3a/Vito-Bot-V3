import { xpProgress, rankForLevel } from "../../core/xp.js";
import { db } from "../../database/db.js";

export default {
  name: ["مستوى"],
  description: "يعرض مستواك ونقاط الخبرة",
  category: "الاقتصاد",

  async run({ sender, reply }) {

    const user = db.getUser(sender);
    const { level, xp, missing } = xpProgress(user.xp || 0);

    await reply({
      text: ( `『⭐』*المستوى:* ${level}\n*الرتبة:* ${rankForLevel(level)}\n*الخبرة:* ${xp}\n*المتبقي:* ${missing} خبرة للمستوى ${level + 1}`)
    });
  }
};