import fs from "fs";
import path from "path";

const TMP_DIR = path.resolve("./tmp");

export default {
  name: ["cleartmp", "limpiartmp", "تنظيف"],
  description: { es: "Borra los archivos temporales de la carpeta tmp", ar: "يحذف الملفات المؤقتة من مجلد tmp" },
  category: "owner, المالك",
  ownerOnly: true,

  async run({ reply, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    if (!fs.existsSync(TMP_DIR)) {
      return await reply({ text: tr(`⚠️ La carpeta tmp no existe: \`${TMP_DIR}\``, `⚠️ مجلد tmp غير موجود: \`${TMP_DIR}\``) });
    }

    try {
      const entries = fs.readdirSync(TMP_DIR, { withFileTypes: true });
      let borrados = 0;

      for (const entry of entries) {
        const fullPath = path.join(TMP_DIR, entry.name);
        try {
          if (entry.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(fullPath);
          }
          borrados++;
        } catch {}
      }

      await reply({ text: tr(`🧹 Se borraron *${borrados}* elemento(s) de tmp (archivos y carpetas).`, `🧹 حُذف *${borrados}* عنصر من tmp (ملفات ومجلدات).`) });

      if (global.gc) global.gc();
    } catch (e) {
      await reply({ text: tr(`❌ Error limpiando tmp: ${e.message}`, `❌ خطأ في تنظيف tmp: ${e.message}`) });
    }
  }
};