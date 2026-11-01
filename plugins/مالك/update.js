import { execSync } from "child_process";
import { loadPlugins } from "../../core/pluginLoader.js";

export default {
  name: ["update", "actualizar", "gitpull", "تحديث"],
  description: { es: "Fuerza la actualización desde GitHub y recarga plugins", ar: "يفرض التحديث من GitHub ويعيد تحميل الإضافات" },
  category: "owner, المالك",
  ownerOnly: true,

  async run({ reply, react, cmdName }) {
    const lang = /[\u0600-\u06FF]/.test(cmdName || "") ? "ar" : "es";
    const tr = (es, ar) => (lang === "ar" ? ar : es);

    try {
      await react("🔄");

      execSync("git fetch --all");

      const localSha = execSync("git rev-parse HEAD").toString().trim();
      const remoteSha = execSync("git rev-parse origin/main").toString().trim();

      if (localSha === remoteSha) {
        await react("✅");
        return await reply({ text: tr("✅ *Ya está todo actualizado, no hay cambios nuevos.*", "✅ *كل شيء محدّث، لا توجد تغييرات جديدة.*") });
      }

      // 📋 Lista real de archivos modificados ANTES de aplicar el reset
      const archivosCambiados = execSync(`git diff --stat ${localSha} ${remoteSha}`).toString().trim();

      // 📝 Lista de commits nuevos que se van a aplicar
      const commitsNuevos = execSync(`git log ${localSha}..${remoteSha} --oneline`).toString().trim();

      execSync("git reset --hard origin/main");

      await loadPlugins();

      let textoUpdate = tr(`✅ *Actualización Forzada Exitosa*\n\n`, `✅ *تم التحديث الإجباري بنجاح*\n\n`);
      textoUpdate += tr(`📦 *Commits nuevos:*\n\`\`\`${commitsNuevos || "(sin detalles de commits)"}\`\`\`\n\n`, `📦 *الالتزامات الجديدة:*\n\`\`\`${commitsNuevos || "(لا تفاصيل)"}\`\`\`\n\n`);
      textoUpdate += tr(`📋 *Archivos modificados:*\n\`\`\`${archivosCambiados || "(sin cambios de archivos detectados)"}\`\`\`\n\n`, `📋 *الملفات المعدّلة:*\n\`\`\`${archivosCambiados || "(لا تغييرات)"}\`\`\`\n\n`);
      textoUpdate += tr(`🔄 _Plugins recargados en memoria sin conflictos._`, `🔄 _أُعيد تحميل الإضافات في الذاكرة بلا تعارض._`);

      await react("✅");
      await reply({ text: textoUpdate });

    } catch (err) {
      await react("❌");
      await reply({
        text: tr(`❌ *Error crítico en el update:* ${err.message}\n\`\`\`${err.stderr?.toString() || ""}\`\`\``, `❌ *خطأ حرج في التحديث:* ${err.message}\n\`\`\`${err.stderr?.toString() || ""}\`\`\``)
      });
    }
  },
};