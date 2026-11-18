# AGENTS.md — دليل الوكلاء لمستودع Vito-Bot-V3

ذاكرة دائمة للوكلاء العاملين على هذا المستودع. اقرأها قبل أي تعديل.

## نظرة عامة

بوت واتساب عربي مبني على Baileys (فرع `@muhammadridwanf61/baileys-nextgen@7.0.0-rc14`)،
نوع ESM (`"type": "module"`)، يتطلّب Node ≥ 22. المنصة: Node 22 و24.

## قاعدة اللغة (مهمّة جداً)

- **المعرّفات البرمجية تبقى إنجليزية بالكامل**: أسماء المفاتيح، الأعلام (flags)،
  القيم، أسماء الدوال، مفاتيح قاعدة البيانات — **لا تعريب لها إطلاقاً**.
- **العربية مسموحة فقط في**: أسماء الملفات، الأوامر، والنصوص الموجّهة للمستخدم،
  والتعليقات.
- الملف الواحد = أمر واحد.

## البنية

- `index.js` — نقطة الدخول.
- `Famiglia/Corleone/` — الوحدات الأساسية (`connection.js`, `messageHandler.js`,
  `pluginLoader.js`, `settings.js`, `logger.js`, `sqlite.js`…).
- `Famiglia/plugins/` — الأوامر (تُحمَّل تلقائياً من كل المجلدات الفرعية).
- `Famiglia/Corleone/مضاد/` — الميزات المضادة (antifeatures).
- `Famiglia/تشخيص-الهوية.js` — أداة تشخيص مستقلة عن البوت (لا تُحمَّل كأمر).

## الأوامر

```bash
npm run check   # فحص صياغة index.js + Famiglia/ (node --check)
npm start       # تشغيل البوت
```

**بعد كل تعديل**: شغّل `npm run check`، ثم اختباراً حقيقياً للمسار المعدَّل، ثم
التزام ودفع.

## قواعد الكود

- لا تستخدم `set -e` في سكربتات الصدف.
- استخدم `import` في أعلى الملف.
- استخدم `log` من `Famiglia/Corleone/logger.js`، لا `console.log` داخل البوت
  (الأداة المستقلة في `Famiglia/تشخيص-الهوية.js` يجوز لها `console.log`).
- المعرّفات في المنطق المضاد تصل من حدث `group-participants.update` كـ:
  `author` (JID الفعلي)، `authorPn` (رقم الهاتف)، `authorUsername` (اسم المستخدم).
- هوية المرسل في `messages.upsert` توجد في `msg.key`: `participant`,
  `participantAlt`, `participantUsername`, `remoteJidAlt`.
- Baileys يمرّر `mentions` كما هي بلا تحويل؛ واتساب هو من يقرّر العرض (اسم أو
  رقم). لذلك ضع في المصفوفة **كل** ما تملكه من هوية (الاسم + الرقم + JID).

## CI

`.github/workflows/ci.yml` يشغّل على Node 22 و24: فحص الصياغة + تحميل كل
الإضافات + اختبار ذهاب-وإياب لقاعدة البيانات.

**`package-lock.json` إلزامي**: الـ workflow يستخدم `cache: npm` و`npm ci`
وكلاهما يتطلّب ملف قفل. غيابه يُفشل خطوة Setup Node قبل أي فحص. لا تحذفه.

## أدوات التشخيص

`Famiglia/تشخيص-الهوية.js` — أداة مستقلة تكشف هوية المرسل وتختبر المنشن:

```bash
node Famiglia/تشخيص-الهوية.js --sim    # محلي بلا اتصال
node Famiglia/تشخيص-الهوية.js --demo   # بيانات وهمية
node Famiglia/تشخيص-الهوية.js           # حيّ (أوقف البوت العادي أولاً)
```

## ملاحظات

- الجلسات في `sessions/` (متجاهَلة في git — بيانات حساسة).
- قاعدة البيانات في `Famiglia/database/` (متجاهَلة).
