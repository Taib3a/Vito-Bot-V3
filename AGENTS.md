# AGENTS.md

ذاكرة هذا المستودع للمساعدين الآليين.

## قواعد ثابتة
- **المعرّفات تبقى إنجليزية دائماً** (مفاتيح، أعلام، قيم، متغيّرات، أسماء ملفات المحرّك).
  العربية للأوامر (أسماء الإضافات) والرسائل الموجّهة للمستخدم فقط.
- **أمر واحد لكل ملف** في `Famiglia/plugins/`.
- **لا تنفّذ كوداً غير موثوق** — التحليل الساكن فقط.
- بعد كل تغيير: `npm run check` ثم اختبار التحميل، ثم commit وpush.

## البنية
- نقطة الدخول: `index.js`.
- المحرّك الداخلي: `Famiglia/Corleone/` (messageHandler, pluginLoader, connection, sqlite ...).
- الإضافات: `Famiglia/plugins/<قسم-عربي>/<اسم-عربي>.js`.
- المضادات: `Famiglia/Corleone/مضاد/`.
- الاستيراد المطلق من داخل الإضافات: `../../Corleone/<ملف>.js`.

## واجهة الإضافة
```js
export default {
  name: ["اسم-عربي"],
  description: "...",
  category: "القسم",
  ownerOnly: true,      // للمالك فقط
  groupOnly: true,      // داخل المجموعات فقط
  adminOnly: true,      // لمشرفي المجموعة
  botAdmin: true,       // يتطلب أن يكون البوت مشرفاً
  async run({ sock, from, msg, reply, react, args, text, groupMeta, isGroup, isOwner, resolveLid, ... }) {}
}
```
- `reply(content)` يقتبس الرسالة تلقائياً ويضيف الإشارة للمرسل.
- `args` مصفوفة الوسائط بعد الأمر · `text` النص الكامل.
- `messageHandler` يتحقق من `groupOnly`/`adminOnly`/`botAdmin`/`ownerOnly` قبل الاستدعاء.

## الأوامر والفحص
- `npm run check` = `node --check` على `index.js` و`Famiglia`.
- اختبار التحميل: `BOT_DB_PATH=/tmp/x.db node -e "import('./Famiglia/Corleone/pluginLoader.js').then(async m=>{await m.loadPlugins(); console.log(m.getPlugins().size)})"`.

## محرّك المكالمات (VoIP)
- المحرّك في `Famiglia/Corleone/مكالمات/` — مقتبس من **HIROBOT** (github.com/HirooSy/HIROBOT)، رخصة **غير تجارية**.
- الجسر: `مكالمات/ربط.js` (getVoip لكل اتصال، سجل مكالمات لكل محادثة، `groupMemberNumbers`).
- **مهم**: نسخة GitHub `main` أحدث من النسخ المنزّلة من مواقع الرفع — تدعم `groupCall` وروابط المكالمات. عند الترقية، استبدل الملفات من `main` ثم أعِد إصلاح `hiro/axios` → `axios`.
- يتطلب `ffmpeg`/`ffprobe` على السيرفر للمكالمات ذات الوسائط.
- الإضافات: `مكالمة` · `مكالمة-جماعية` (groupOnly) · `إغلاق` · `كتم` · `تفاعل-مكالمة`.

## بايلز
- `"@whiskeysockets/baileys": "npm:@muhammadridwanf61/baileys-nextgen@latest"`.
- يوفّر `sock.ws` و`signalRepository` و`getUSyncDevices` المطلوبة لمحرّك المكالمات.
- أحداث المكالمات (`CB:*`) تُبَثّ على `sock.ws`.

## Git
- الفرع الرئيسي: `main`. بعد كل تغيير: commit بالعربية + push، ثم تأكيد نجاح CI.
