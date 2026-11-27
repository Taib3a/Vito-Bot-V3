# AGENTS.md

## قواعد ثابتة
- لا إرسال في المحادثات الخاصة إطلاقاً — البوت يعمل داخل المجموعات (`@g.us`) فقط.
- لا كود مكالمات/VoIP في المشروع.
- الاختبار داخل المجموعات فقط وبعد موافقة المستخدم.
- جلسة واحدة في مكان واحد: أي اتصال ثانٍ بنفس `sessions/main` يقتل الاتصال بـ`401 Stream Errored (conflict)`.

## التشغيل
```bash
npm start                     # index.js
setsid nohup npm start > /tmp/bot.log 2>&1 &   # تشغيل مستمر
grep -a "متصل\|401\|انقطع" /tmp/bot.log
```
- الإضافات تُحمَّل وتُحدَّث تلقائياً (`تحديث إضافة`)، أما `Famiglia/Corleone/أنظمة/**` فتُحمَّل عند بدء التشغيل فقط — تحتاج إعادة تشغيل.
- الجلسة الحالية: `201140875066:20@s.whatsapp.net` (الاسم فوديكا، جهاز 20، android).

## الأزرار (native_flow)
`sock.sendButtonMessage(jid, text, buttons, opts)` من `Famiglia/Corleone/buttons.js`.
- شكل الزر: `{text, id}` رد سريع · `{text, url}` رابط · `{text, copy}` نسخ · `{text, phoneNumber}` اتصال · `{text, location:true}` موقع · `{text, callPermission:true}` إذن اتصال · `{text, flow:{id}}` نموذج.
- `sections` تُضاف كزر `single_select` (صفوف بسهم ›).
- **الفتح داخل واتساب يعتمد على الرابط لا على نوع الزر**: `https://wa.me/settings` ✅ (يفتح الإعدادات)، `https://whatsapp.com/channel/<id>` ✅، المواقع الخارجية تفتح المتصفح.

## ثيم المجموعة (chat_theme)
- البروتوكول مبني يدوياً بـ`protobufjs` لأن `WAProto` في المحرك لا يملك `ChatThemeSetting`:
  - الحقول: 8 طابع الوقت · 16 clearTheme · 26 colorSchemeId · 90 solidColor(13/21 fixed32 ARGB، 24 bool) · 106 customImage(10 directPath، 18 mediaKey، 26 fileEncSha256، 34 fileSha256، 45 float dimLevel).
  - الغلاف: حقل 98 → النوع 34 → الحمولة 242، تشفير `signalRepository.encryptGroupMessage` ثم `sendNode` بـ`mediatype: "chat_theme"`.
- الخلفية: `HKDF("WhatsApp Chat Wallpaper Keys")` → AES-256-CBC + HMAC10 → `POST https://<host>/mms/chat-wallpaper-image/<token>`.
- الملفات: `Corleone/groupTheme.js` (البروتوكول)، `Corleone/themePending.js` (انتظار الصورة دقيقتين)، `plugins/مجموعات/ثيم-مجموعة.js` (الأوامر)، `أنظمة/خدمات/ثيم-خلفية-مباشر.js` (التقاط الصورة).
- الظهور عند الأعضاء يعتمد على تفعيل واتساب للثيمات المشتركة (بيتا) — الإرسال ينجح دائماً.
