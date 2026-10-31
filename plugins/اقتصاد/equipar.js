import { db } from "../../database/db.js";
import { ITEMS } from "../../core/gamedata.js";

function getPersonajes(jid) {
  const user = db.getUser(jid);
  return user.personajes || {};
}

export default {
  name: ["equipar", "equip", "تجهيز"],
  description: "Equipa un arma o armadura a un personaje",
  category: "economy, الاقتصاد",

  async run({ sender, args, reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const itemId = args[0]?.toLowerCase();
    const personajeId = args[1]?.toLowerCase();

    if (!itemId || !personajeId) {
      return await reply({
        text: tr(`⚠️ *Uso:* .equipar <item> <personaje>\n\n*Ejemplo:* .equipar katana_maldita gojo`, `⚠️ *الاستخدام:* .equipar <العنصر> <الشخصية>\n\n*مثال:* .equipar katana_maldita gojo`)
      });
    }

    const item = ITEMS[itemId];
    if (!item) {
      return await reply({ text: tr("❌ Item no encontrado.\n\n> Usá *.tienda* para ver los items.", "❌ العنصر غير موجود.\n\n> استخدم *.tienda* لعرض العناصر.") });
    }

    const misPersonajes = getPersonajes(sender);
    const personaje = misPersonajes[personajeId];
    if (!personaje) {
      return await reply({ text: tr("❌ No tenés ese personaje.\n\n> Usá *.comprarpersonaje* para comprarlo.", "❌ ليس لديك هذه الشخصية.\n\n> استخدم *.comprarpersonaje* لشرائها.") });
    }

    const eco = db.getEco(sender);
    if (!eco.inventario.includes(itemId)) {
      return await reply({ text: tr("❌ No tenés ese item en tu inventario.\n\n> Usá *.comprar* para comprarlo.", "❌ ليس لديك هذا العنصر في حقيبتك.\n\n> استخدم *.comprar* لشرائه.") });
    }

    if (item.restriccion && item.restriccion !== personajeId) {
      return await reply({
        text: tr(`🔒 *${item.nombre}* es exclusivo de *${item.restriccion}*, no se lo podés poner a este personaje.`, `🔒 *${item.nombre}* حصري لـ *${item.restriccion}*، لا يمكنك تجهيزه لهذه الشخصية.`)
      });
    }

    personaje[item.tipo] = itemId;
    misPersonajes[personajeId] = personaje;
    db.setUser(sender, { personajes: misPersonajes });

    await react("✅");
    await reply({
      text: tr(`✅ Equipaste *${item.nombre}* a tu personaje.\n\n*Slot:* ${item.tipo}\n*Poder del item:* +${item.poder}`, `✅ جهّزت *${item.nombre}* لشخصيتك.\n\n*الخانة:* ${item.tipo}\n*قوة العنصر:* +${item.poder}`)
    });
  }
};