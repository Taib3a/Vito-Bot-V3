import axios from "axios";

const API_TIMEOUT = 30000;
const API_HEADERS = { "User-Agent": "AhmadShahzad-MD/1.0 (Aptoide app search)" };

function cleanFileName(value) {
  return (
    String(value || "app")
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "app"
  );
}

export default {
  name: ["تطبيق"],
  description: "البحث وتحميل تطبيقات الأندرويد من Aptoide",
  category: "تحميل",
  groupOnly: false,

  async run({ sock, from, msg, args, usedPrefix, cmdName, reply, react }) {
    const query = String(args.join(" ") || "").trim();

    if (!query) {
      return await reply(
        `📦 *مركز تحميل التطبيقات*\n\nالاستخدام: \`${usedPrefix}${cmdName} WhatsApp\`\n\nيرجى كتابة اسم التطبيق الذي تريد البحث عنه.`
      );
    }

    if (query.length > 100) {
      return await reply("❌ يجب أن يكون اسم التطبيق أقل من 100 حرف.");
    }

    await react("⏳");

    try {
      const apiUrl = `https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`;
      const response = await axios.get(apiUrl, {
        timeout: API_TIMEOUT,
        headers: API_HEADERS,
        maxRedirects: 5,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      const list = response.data?.datalist?.list;

      if (!Array.isArray(list) || list.length === 0) {
        await react("❌");
        return await reply(
          "⚠️ لم يتم العثور على التطبيق بهذا الاسم في Aptoide. يرجى التحقق من الاسم والمحاولة مرة أخرى."
        );
      }

      const app = list[0];
      const downloadUrl = app?.file?.path_alt || app?.file?.path || app?.file?.pathAlt;

      if (!downloadUrl || !/^https:\/\//i.test(downloadUrl)) {
        await react("❌");
        return await reply("❌ لم يوفر متجر Aptoide رابط تحميل صالح. يرجى المحاولة لاحقاً.");
      }

      const sizeBytes = Number(app.size || app.file?.size || 0);
      const sizeText = sizeBytes > 0 ? `${(sizeBytes / 1048576).toFixed(2)} MB` : "غير معروف";
      const appName = String(app.name || query);
      const packageName = String(app.package || "غير معروف");
      const developer = String(app.developer?.name || "غير معروف");
      const version = String(app.file?.vername || app.file?.vercode || "غير معروف");
      const updated = String(app.updated || "غير معروف");

      const iconUrl = app?.icon || app?.graphic || null;

      const caption = [
        "╭━━━〔 📦 تحميل تطبيقات الأندرويد 〕━━━",
        `┃ 📱 الاسم: ${appName}`,
        `┃ 📦 الحجم: ${sizeText}`,
        `┃ 🆔 الحزمة: ${packageName}`,
        `┃ 🔖 الإصدار: ${version}`,
        `┃ 📅 آخر تحديث: ${updated}`,
        `┃ 👨‍💻 المطور: ${developer}`,
        "╰━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "⚠️ يرجى التحقق من التطبيق والمطور قبل التثبيت. قم بتثبيت ملفات APK من مصادر موثوقة فقط.",
        "— 𝐀𝐡𝐦𝐚𝐝𝐒𝐡𝐚𝐡𝐳𝐚𝐝-𝐌𝐃",
      ].join("\n");

      if (iconUrl) {
        await sock.sendMessage(
          from,
          { image: { url: iconUrl }, caption },
          { quoted: msg }
        );
      }

      await sock.sendMessage(
        from,
        {
          document: { url: downloadUrl },
          fileName: `${cleanFileName(appName)}.apk`,
          mimetype: "application/vnd.android.package-archive",
          caption: iconUrl ? "" : caption,
        },
        { quoted: msg }
      );

      await react("✅");
    } catch (error) {
      console.error("[APK Downloader]", error?.message || error);
      await react("❌");
      return await reply(
        "❌ فشل جلب/تحميل التطبيق. قد تكون خدمة Aptoide أو الشبكة مشغولة؛ يرجى المحاولة لاحقاً."
      );
    }
  },
};
