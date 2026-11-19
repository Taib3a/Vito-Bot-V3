# AGENTS.md

ذاكرة المشروع — تُقرأ تلقائياً في كل جلسة.

## هوية المشروع

`Taib3a/Vito-Bot-V3` — بوت واتساب على Baileys، **مستودع مستقل وليس fork**.
المالك: تائب (Taib). جميع أوامر البوت وملفاته بالعربية، و**المعرّفات داخل الكود إنجليزية فقط**.

## قواعد صارمة

- **أمر واحد لكل ملف** في `Famiglia/plugins/<قسم>/<اسم>.js`
- الإضافات في `Famiglia/plugins/` · المضادات في `Famiglia/Corleone/مضاد/` · المحرّكات المشتركة في `Famiglia/Corleone/<مجال>/`
- المحمّل يدعم `name` فقط (نص أو مصفوفة) — **لا `aliases`**
- بعد كل تغيير: `npm run check` ثم الاختبار، ثم الالتزام
- لا سكربت اختبارات في `package.json`؛ الاختبار يدوي عبر `node --input-type=module -e`

## البيئة

- `file_editor` لا ينشئ ملفات داخل مجلدات عربية غير موجودة (ENOENT) — استخدم `mkdir -p` أولاً
- `node:test` **لا يدعم** `mock.module` هنا؛ اختبر بمحرّكات وهمية (stubs) بدل الاستيراد الوهمي
- `db.getAllUsers()` يعيد الأرقام **بلا** لاحقة `@s.whatsapp.net` — أعد بناء المعرّف عند الحاجة

## ⚠️ تنبيه حقوقي مهم (مُتحقَّق 2026-11-19)

`Famiglia/Corleone/مكالمات/` منقول من **HirooSy/HIROBOT** (`lib/package/voip/`).

**مدى النقل:** 12 من 13 ملفاً أساسياً **مطابق حرفياً** (0 فروق): `types.js`, `bytes.js`,
`protobuf.js`, `voip-deps.js`, `voipClient.js`, `WaVoipCoordinator.js`, `media/rtp.js`,
`media/rtcp.js`, `crypto/srtp.js`, `crypto/ssrc.js`, `signaling/signaling.js`, `call/call-state.js`.
`index.js` يختلف بـ 8 أسطر فقط (استيراد `axios` بدل `hiro/axios` + getters مضافة).

**شروط رخصة HIROBOT** (Other / NOASSERTION):
- الاستخدام **غير تجاري فقط**
- **يمنع إعادة التوزيع** — «You may NOT distribute, sublicense, or share the original or modified software»
- **الإسناد إلزامي**: إبقاء نص الرخصة + ذكر HirooSy + رابط المستودع الأصلي

**الوضع الحالي:** الإسناد موجود في سطر واحد أعلى `مكالمات/ربط.js` فقط.
**لا يوجد ملف `LICENSE`** في المستودع، ولا ذكر لـ HirooSy في `README.md`.

**نقطة تعارض تحتاج قرار المالك:** المستودع **عام** على GitHub، ورخصة HIROBOT تمنع
إعادة التوزيع — بينما `README.md` يعلن «مشروع خاص، يُمنع النسخ». أي نشر للكود
يحتاج مراجعة الرخصة أو إذناً كتابياً من HirooSy.

## البنية الفعلية

- `Famiglia/plugins/` — إضافات بأقسام عربية (`التحميل`, `المالك`, `مكالمات`, …) — 456 أمراً
- `Famiglia/Corleone/مكالمات/` — محرّك VoIP (منقول، راجع التنبيه أعلاه)
- `Famiglia/Corleone/الوسائط/المصادر.js` — يوتيوب (كشط `ytInitialData`) + y2mate + spotsaver
- `Famiglia/Corleone/الحالات/الرفع.js` — تطبيع الفيديو والنشر إلى `status@broadcast`
- `Famiglia/database/db.js` — SQLite عبر `node:sqlite`

## مصادر وسائط مثبتة عملياً

- **بحث يوتيوب**: كشط `ytInitialData` ✅ · YouTube Music API أعاد 0 نتائج ❌
- **صوت يوتيوب**: y2mate (`frame.y2meta-uk.com` → `cnv.cx/v2`) ✅ ~3.25 م.ب في 4.5ث
- **سبوتفاي**: spotsaver `cnv.cx/v2/api/spotify/?q=` — **يحتاج معرّفات سبوتفاي حقيقية**؛
  معرّفات Deezer تعيد 500
- نفق y2mate يرفض ffmpeg المباشر (403) → **يجب التنزيل إلى ملف** أولاً
- مهلة `downloadBuffer` تصاعدية؛ `timeout: 0` يسبب تعليقاً أبدياً على الأنفاق الميتة
