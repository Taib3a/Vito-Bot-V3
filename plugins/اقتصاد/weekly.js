import { checkCooldown, setCooldown, addBolsillo, formatTime } from "../../core/economy.js";

export default {
  name: ["weekly", "semanal", "اسبوعي"],
  description: { es: "Reclama tu recompensa semanal", ar: "استلم مكافأتك الأسبوعية" },
  category: "economy, الاقتصاد",

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const status = checkCooldown(sender, "weekly");
    if (!status.ready) {
      return await reply({ text: tr(`⏳ Ya reclamaste tu semanal. Volvé en *${formatTime(status.remaining)}*.`, `⏳ استلمت مكافأتك الأسبوعية بالفعل. عد بعد *${formatTime(status.remaining)}*.`) });
    }

    const amount = Math.floor(Math.random() * 1500) + 1000;
    addBolsillo(sender, amount);
    setCooldown(sender, "weekly");

    await reply({ text: tr(`💰 Reclamaste tu semanal: *+${amount}* monedas.`, `💰 استلمت مكافأتك الأسبوعية: *+${amount}* عملة.`) });
  }
};