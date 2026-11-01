import { db } from "../../database/db.js";
import { PERSONAJES } from "../../core/gamedata.js";

function getPersonajes(jid) {
  const user = db.getUser(jid);
  return user.personajes || {};
}

export default {
  name: ["buychar", "شخصية", "شخصيات"],
  description: { es: "Compra un personaje de Jujutsu Kaisen", ar: "يشتري شخصية من Jujutsu Kaisen" },
  category: "economy, الاقتصاد",

  async run({ sock, from, msg, sender, args, reply, react, usedPrefix, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    const personajeId = args[0]?.toLowerCase();

    if (personajeId) {
      const personaje = PERSONAJES[personajeId];
      if (!personaje) {
        return await reply({ text: tr("❌ Personaje no encontrado.", "❌ الشخصية غير موجودة.") });
      }

      const misPersonajes = getPersonajes(sender);
      if (misPersonajes[personajeId]) {
        return await reply({ text: tr(`❌ Ya tenés a *${personaje.nombre}*.`, `❌ لديك *${personaje.nombre}* بالفعل.`) });
      }

      const eco = db.getEco(sender);
      if (eco.bolsillo < personaje.precio) {
        const faltante = personaje.precio - eco.bolsillo;
        return await reply({
          text:
            tr(`❌ No tenés suficientes Fragmentos.\n\n`, `❌ ليس لديك شظايا كافية.\n\n`) +
            `*Precio:* ${personaje.precio.toLocaleString()} Fragmentos\n` +
            `*Bolsillo:* ${eco.bolsillo.toLocaleString()} Fragmentos\n` +
            `*Te faltan:* ${faltante.toLocaleString()} Fragmentos`
        });
      }

      misPersonajes[personajeId] = { nivel: 1, xp: 0, arma: null, armadura: null };
      db.setEco(sender, { bolsillo: eco.bolsillo - personaje.precio });
      db.setUser(sender, { personajes: misPersonajes });

      await react("✅");
      return await reply({
        text:
          tr(`✅ *¡Compraste a ${personaje.nombre}!*\n\n`, `✅ *اشتريت ${personaje.nombre}!*\n\n`) +
          `*Precio pagado:* ${personaje.precio.toLocaleString()} Fragmentos\n` +
          `*Bolsillo restante:* ${(eco.bolsillo - personaje.precio).toLocaleString()} Fragmentos\n\n` +
          tr(`> Usá *.equipar <item> ${personajeId}* para darle equipo`, `> استخدم *.equipar <عنصر> ${personajeId}* لتجهيزه`)
      });
    }

    // nextgen has no Button/Carousel builder, so the catalogue is sent as text.
    try {
      let lista = "⚔️ *الشخصيات المتاحة للشراء*\n\n";
      for (const [id, p] of Object.entries(PERSONAJES)) {
        lista += `▸ *${p.nombre}*\n`;
        lista += `   الجيل: ${p.generacion}\n`;
        lista += `   السعر: ${p.precio.toLocaleString()} قطعة\n`;
        lista += `   للشراء: ${usedPrefix}buychar ${id}\n\n`;
      }
      await reply({ text: lista });
    } catch (e) {
      await reply({ text: `❌ خطأ في عرض القائمة:\n${e.message}` });
    }
  },
};