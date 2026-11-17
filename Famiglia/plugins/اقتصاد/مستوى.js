import { xpProgress } from "../../core/xp.js";
import { db } from "../../database/db.js";
import { renderLevelCard, resolveAvatar } from "../../core/levelCard.js";
import { log } from "../../core/logger.js";

export default {
  name: ["مستوى"],
  description: "يعرض مستواك ونقاط الخبرة في بطاقة مصوّرة",
  category: "الاقتصاد",

  async run({ sock, from, sender, msg, reply }) {
    const user = db.getUser(sender);
    const { level, xp, currentFloor, nextFloor, missing } = xpProgress(user.xp || 0);

    try {
      const avatar = await resolveAvatar(sock, sender);
      const image = await renderLevelCard({
        avatar,
        displayName: db.getPushName(sender) || null,
        level,
        xp,
        currentFloor,
        nextFloor,
        missing,
      });
      await sock.sendMessage(from, { image, caption: "" }, { quoted: msg });
    } catch (e) {
      log.error(`بطاقة المستوى: ${e.message}`);
      await reply({
        text: `『⭐』*المستوى:* ${level}\n*الخبرة:* ${xp}\n*المتبقي:* ${missing} خبرة للمستوى ${level + 1}`,
      });
    }
  },
};