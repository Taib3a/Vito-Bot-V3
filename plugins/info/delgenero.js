import { db } from "../../database/db.js";

export default {
  name: ["delgenero", "delgenre", "حذف-جنسي"],
  description: "Elimina tu configuración de género",
  category: "info, المعلومات",
  ownerOnly: false,

  async run({ sender, reply }) {
    const generoActual = db.getGenero(sender);

    if (!generoActual) {
      return await reply({ text: `⚠️ No tienes ningún género configurado.` });
    }

    db.setGenero(sender, null);

    return await reply({ text: `✅ Se eliminó tu configuración de género.` });
  }
};