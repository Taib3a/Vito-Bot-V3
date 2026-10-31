import { inspect } from "util";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import { db } from "../../database/db.js";

export default {
  name: ["eval", "exec", ">", "تنفيذ"],
  description: "Evalúa código JavaScript",
  category: "owner, المالك",
  ownerOnly: true,

  async run(ctx) {
    const { reply, text, sock, from, msg, cmdName } = ctx;
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!text?.trim()) return reply({ text: tr("❌ Sin código que evaluar.", "❌ لا يوجد كود لتنفيذه.") });

    const exec = (code) => eval(`(async () => { ${code} })()`);

    try {
      let result;
      try {
        result = await exec(`return (${text})`);
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        result = await exec(text);
      }

      const out =
        typeof result === "string" ? result : inspect(result, { depth: 2 });

      await reply({
        text: tr(`✅ *Resultado:*\n\`\`\`${out.slice(0, 400000) || "undefined"}\`\`\``, `✅ *النتيجة:*\n\`\`\`${out.slice(0, 400000) || "undefined"}\`\`\``),
      });
    } catch (e) {
      await reply({ text: tr(`❌ *Error:*\n\`\`\`${e?.stack ?? e}\`\`\``, `❌ *خطأ:*\n\`\`\`${e?.stack ?? e}\`\`\``) });
    }
  },
};