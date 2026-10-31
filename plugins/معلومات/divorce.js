import { db } from "../../database/db.js";

export default {
  name: ["divorciar", "divorcio", "طلاق"],
  description: "Termina tu matrimonio actual",
  category: "info, المعلومات",

  async run(ctx) {
    const lang = /[\u0600-\u06FF]/.test(ctx.cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const { sender, reply } = ctx;

    const partner = db.getMarriage(sender);
    if (!partner) {
      return reply({ text: tr("💔 No estás casado(a) con nadie.", "💔 أنت غير متزوج من أحد.") });
    }

    db.divorce(sender);

    return reply({
      text: tr(`💔 @${sender.split("@")[0]} se ha divorciado de @${partner.split("@")[0]}.\n> Ambos ya son libres de volver a casarse.`, `💔 @${sender.split("@")[0]} انفصل عن @${partner.split("@")[0]}.\n> كلاكما أحرار للزواج مرة أخرى.`),
      mentions: [sender, partner],
    });
  },
};