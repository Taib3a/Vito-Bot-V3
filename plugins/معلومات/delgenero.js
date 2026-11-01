import { db } from "../../database/db.js";

export default {
  name: ["delgenero", "delgenre", "حذف-جنسي"],
  description: { es: "Elimina tu configuración de género", ar: "يحذف إعداد الجنس الخاص بك" },
  category: "info, المعلومات",
  ownerOnly: false,

  async run({ sender, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const generoActual = db.getGenero(sender);

    if (!generoActual) {
      return await reply({ text: tr(`⚠️ No tienes ningún género configurado.`, `⚠️ ليس لديك أي جنس معيّن.`) });
    }

    db.setGenero(sender, null);

    return await reply({ text: tr(`✅ Se eliminó tu configuración de género.`, `✅ تم حذف إعداد الجنس الخاص بك.`) });
  }
};