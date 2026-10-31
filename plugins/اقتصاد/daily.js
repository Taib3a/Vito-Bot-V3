import { db } from "../../database/db.js";
import { checkCooldown, setCooldown, addBolsillo, formatTime } from "../../core/economy.js";

export default {
  name: ["daily", "diario", "يومي"],
  description: "Reclama tu recompensa diaria",
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const status = checkCooldown(sender, "daily");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Ya reclamaste tu diario. Volvé en *${formatTime(status.remaining)}*.`, `⏳ استلمت يوميتك بالفعل. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    const amount = Math.floor(Math.random() * 300) + 200;
    addBolsillo(sender, amount);
    setCooldown(sender, "daily");

    await reply({ text: tr(`💰 Reclamaste tu diario: *+${amount}* monedas.`, `💰 استلمت يوميتك: *+${amount}* عملة.`) });
  }
};