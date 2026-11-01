import { db } from "../../database/db.js";

function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");

  if (atIndex === -1) return jid.split(":")[0];

  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);

  return `${userPart}@${domainPart}`;
}

export default {
  name: ["listwarn", "listawarn", "warns", "التحذيرات"],
  description: { es: 'Muestra la lista de advertencias del grupo', ar: 'يعرض قائمة تحذيرات المجموعة' },
  category: "grupos, المجموعات",
  groupOnly: true,
  adminOnly: true,

  async run({ sock, from, msg, reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      const groupData = db.getGroup(from) || {};
      const currentWarns = groupData.warns || {};

      const users = Object.entries(currentWarns)
        .filter(([_, warns]) => Array.isArray(warns) && warns.length > 0);

      if (users.length === 0) {
        return await reply({
          text: tr(`📋 *LISTA DE ADVERTENCIAS*\n\n✅ No hay usuarios con advertencias activas en este grupo.`, `📋 *قائمة التحذيرات*\n\n✅ لا يوجد مستخدمون لديهم تحذيرات نشطة في هذه المجموعة.`)
        });
      }

      let texto = tr(`📋 *LISTA DE ADVERTENCIAS*\n`, `📋 *قائمة التحذيرات*\n`);
      texto += `━━━━━━━━━━━━━━━━━━\n\n`;

      const mentions = [];

      users.forEach(([jid, warns], index) => {
        const cleanJidUser = cleanJid(jid);
        const number = warns[0]?.targetNum || cleanJidUser.split('@')[0];

        mentions.push(cleanJidUser);

        texto += `👤 *${index + 1}. @${number}*\n`;
        texto += tr(`📊 *Advertencias:* ${warns.length}/3\n`, `📊 *التحذيرات:* ${warns.length}/3\n`);

        warns.forEach((warn, warnIndex) => {
          texto += tr(`\n   ⚠️ *Warn #${warnIndex + 1}*\n`, `\n   ⚠️ *تحذير رقم ${warnIndex + 1}*\n`);
          texto += tr(`   📝 *Razón:* ${warn.razon || "No especificada"}\n`, `   📝 *السبب:* ${warn.razon || "غير محدد"}\n`);
          texto += tr(`   📅 *Fecha:* ${warn.fecha || "Desconocida"}\n`, `   📅 *التاريخ:* ${warn.fecha || "غير معروف"}\n`);
          texto += tr(`   👮‍♂️ *Por:* ${warn.by || "Desconocido"}\n`, `   👮‍♂️ *بواسطة:* ${warn.by || "غير معروف"}\n`);
        });

        texto += `\n━━━━━━━━━━━━━━━━━━\n\n`;
      });

      texto += tr(`👥 *Usuarios advertidos:* ${users.length}`, `👥 *المستخدمون المحذَّرون:* ${users.length}`);

      await sock.sendMessage(
        from,
        {
          text: texto,
          mentions
        },
        { quoted: msg }
      );

    } catch (err) {
      console.error(tr("Error en comando listwarn:", "خطأ في أمر listwarn:"), err);

      await reply({
        text: tr("❌ Ocurrió un error interno al ejecutar el comando.", "❌ حدث خطأ داخلي أثناء تنفيذ الأمر.")
      });
    }
  }
};