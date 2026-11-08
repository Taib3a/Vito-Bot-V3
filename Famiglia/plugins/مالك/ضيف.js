import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadPlugins } from "../../core/pluginLoader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// مجلد الإضافات مشتق من موقع هذا الملف: Famiglia/plugins/مالك/ضيف.js
const PLUGINS_DIR = path.resolve(__dirname, "..");

function readQuotedText(m) {
  const msg = m?.message || {};
  const info =
    msg.extendedTextMessage?.contextInfo ||
    msg.imageMessage?.contextInfo ||
    msg.videoMessage?.contextInfo ||
    msg.documentMessage?.contextInfo ||
    null;
  return info?.quotedMessage?.conversation || info?.quotedMessage?.extendedTextMessage?.text || "";
}

function extractNames(code) {
  const names = [];
  const arrayMatches = code.match(/name\s*:\s*\[([^\]]+)\]/g);
  if (arrayMatches) {
    arrayMatches.forEach((m) => {
      const inner = m.match(/\[([^\]]+)\]/);
      if (inner) {
        const items = inner[1].match(/['"]([^'"]+)['"]/g);
        if (items) items.forEach((i) => names.push(i.replace(/['"]/g, "").trim()));
      }
    });
  }
  const stringMatches = code.match(/name\s*:\s*['"]([^'"]+)['"]/g);
  if (stringMatches) {
    stringMatches.forEach((m) => {
      const ex = m.match(/['"]([^'"]+)['"]/);
      if (ex) names.push(ex[1].trim());
    });
  }
  return [...new Set(names)];
}

export default {
  name: ["ضيف"],
  description: "إضافة أو تحديث أمر في مجلد الإضافات",
  category: "المطور",
  ownerOnly: true,

  async run({ msg, reply }) {
    const code = readQuotedText(msg);

    if (!code || !code.trim()) {
      return await reply({
        text:
          "❌ ردّ على رسالة تحتوي على كود الأمر.\n\n" +
          "📌 مثال:\n" +
          "```js\nexport default {\n  name: [\"مرحبا\"],\n  category: \"المتنوع\",\n  async run({ reply }) {\n    await reply({ text: \"أهلاً\" });\n  }\n};\n```",
      });
    }

    const names = extractNames(code);
    if (names.length === 0) {
      return await reply({ text: "❌ لم أجد حقل `name` في الكود المرسل." });
    }

    const primary = names[0];
    const fileName = `${primary}.js`;
    const filePath = path.join(PLUGINS_DIR, fileName);

    try {
      const existed = fs.existsSync(filePath);
      fs.writeFileSync(filePath, code.trim() + "\n", "utf-8");

      await loadPlugins();

      await reply({
        text:
          `✅ ${existed ? "تم تحديث" : "تمت إضافة"} الأمر: *${primary}*\n` +
          `📝 الأسماء: ${names.join(", ")}\n` +
          `📂 المسار: \`Famiglia/plugins/${fileName}\``,
      });
    } catch (error) {
      console.error("[ ضيف ]", error);
      await reply({ text: `❌ حدث خطأ:\n${error.message}` });
    }
  },
};
