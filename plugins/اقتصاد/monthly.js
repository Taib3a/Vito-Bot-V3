import { checkCooldown, setCooldown, addBolsillo, formatTime } from "../../core/economy.js";

export default {
  name: ["monthly", "mensual", "شهري"],
  description: "Reclama tu recompensa mensual",
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const status = checkCooldown(sender, "monthly");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Ya reclamaste tu mensual. Volvé en *${formatTime(status.remaining)}*.`, `⏳ استلمت مكافأتك الشهرية بالفعل. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    const amount = Math.floor(Math.random() * 6000) + 4000;
    addBolsillo(sender, amount);
    setCooldown(sender, "monthly");

    await reply({ text: tr(`💰 Reclamaste tu mensual: *+${amount}* monedas.`, `💰 استلمت مكافأتك الشهرية: *+${amount}* عملة.`) });
  }
};