<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/en/1/1c/Vito_Corleone.jpg" alt="Vito Corleone" width="280" style="border: 4px solid #D4AF37; border-radius: 12px; box-shadow: 0 0 20px rgba(212,175,55,0.5);" />

<br/>

# 𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹

<div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">

![Node.js](https://img.shields.io/badge/Node.js-24-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Baileys](https://img.shields.io/badge/Baileys-7.0-FF6C37?style=for-the-badge&logo=whatsapp&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-node:sqlite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Private](https://img.shields.io/badge/Project-Private-DC143C?style=for-the-badge)

</div>

<br/>

> **بوت واتساب احترافي مستقل — مبني على Node.js 24 و Baileys**
>
> مستوحى من شخصية **فيتو كورليوني** — القوة، الولاء، والسيطرة الكاملة

</div>

---

> ⚠️ **تنبيه: مشروع خاص — Private Project**
>
> هذا المشروع **خاص وغير مفتوح المصدر**. لا يُسمح بنسخه أو تعديله أو إعادة توزيعه دون إذن صريح من المطور.
> أي استخدام غير مصرح به سيُعتبر انتهاكاً لحقوق المطور.

---

## 🛠️ التقنيات المستخدمة

| التقنية | الإصدار | الاستخدام |
|:---:|:---:|:---|
| ![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white) | 24 | بيئة التشغيل الرئيسية |
| ![Baileys](https://img.shields.io/badge/Baileys-7.0-FF6C37?logo=whatsapp&logoColor=white) | 7.0 | مكتبة اتصال واتساب |
| ![SQLite](https://img.shields.io/badge/SQLite-node:sqlite-003B57?logo=sqlite&logoColor=white) | مدمج | قاعدة بيانات محلية |
| ![Pino](https://img.shields.io/badge/Pino-9.6-4B4B4B?logo=node.js&logoColor=white) | 9.6 | نظام السجلات |
| ![Chalk](https://img.shields.io/badge/Chalk-5.4-FFFFFF?logo=npm&logoColor=red) | 5.4 | تلوين سجلات الطرفية |
| ![QRCode](https://img.shields.io/badge/QR_Terminal-0.12-000000) | 0.12 | عرض رمز QR في الطرفية |

---

## ✨ المميزات

<details>
<summary><b>🛡️ الحماية والمضادات</b></summary>

| الميزة | الوصف |
|:---:|:---|
| 🔗 مضاد الروابط | حذف الروابط تلقائياً وطرد المرسل |
| 🤖 مضاد البوتات | كشف وطرد الحسابات المشبوهة |
| 🚫 مضاد السبام | منع الرسائل المكررة عبر تتبع الرسائل |
| 👁️ مراقبة الجروب | مراقبة تغييرات الاسم، الوصف، الترقية، الخفض |
| 👋 الترحيب والوداع | رسائل آلية للأعضاء الجدد والمغادرين |
| 📈 المستوى التلقائي | نظام XP ومستويات تفاعلية لكل عضو |

</details>

<details>
<summary><b>🎛️ إدارة الجروبات</b></summary>

| الميزة | الوصف |
|:---:|:---|
| ✅ تفعيل/تعطيل البوت | تحكم في عمل البوت لكل جروب |
| 🔧 تشغيل/إيقاف الميزات | فعّل أو أوقف أي ميزة لكل جروب |
| 👢 طرد الأعضاء | طرد أي عضو من الجروب |
| ⬆️ ترقية المشرفين | رقّ أي عضو إلى مشرف |
| ⬇️ خفض المشرفين | اخفض أي مشرف إلى عضو |
| 🔇 كتم/فك الكتم | كتم الجروب أو فك الكمت عنه |

</details>

<details>
<summary><b>🤖 النظام المتقدم</b></summary>

| الميزة | الوصف |
|:---:|:---|
| 📱 البوتات الفرعية | ثبّت بوتات فرعية متعددة برمز الاقتران |
| 🎯 دعم الأزرار | دعم كامل لأزرار WhatsApp التفاعلية |
| 💾 قاعدة بيانات محلية | SQLite مدمج — لا خدمات خارجية |
| 🔄 جلسات مستمرة | حفظ تلقائي للمصادقة بعد إعادة التشغيل |
| 📊 تتبع المستخدمين | تسجيل بيانات المستخدمين والجروبات |
| 🎨 سجلات ملوّنة | نظام سجلات احترافي للمراقبة |

</details>

---

## 📦 التثبيت

> **متطلبات:** Node.js 24 أو أحدث

```bash
# تثبيت التبعيات
npm install

# تشغيل البوت
npm start
```

عند التشغيل، اختر طريقة الاتصال:

| الرقم | الطريقة | الوصف |
|:---:|:---|:---|
| `1` | Pairing Code | أدخل رقم الهاتف واحصل على رمز اقتران |
| `2` | QR Code | امسح رمز QR من هاتفك للاتصال |

---

## 📁 هيكل المشروع

```text
project/
├── index.js                    ← نقطة الدخول الرئيسية
├── الاضافات/                    ← الإضافات الأساسية
│   ├── الاعدادات.js             ← إعدادات البوت
│   ├── القاعدة.js               ← طبقة قاعدة البيانات
│   ├── الكونسل.js               ← مسجل الأحداث
│   ├── المحمل.js                ← تحميل الأوامر والميزات
│   ├── المعالج.js               ← معالج الرسائل
│   ├── النظام.js                ← اتصال واتساب
│   └── مضاد/                    ← الميزات المضادة
├── database/                   ← قاعدة البيانات (SQLite)
│   ├── db.js                   ← دوال قاعدة البيانات
│   └── sessions-taib/          ← جلسات المصادقة
├── plugins/                    ← الإضافات (الأوامر)
│   ├── تنصيب/                  ← أوامر التنصيب
│   └── مجموعة/                  ← أوامر إدارة الجروبات
└── الاوامر/                    ← الأوامر العامة
```

---

## 👤 حقوق المطور

<div align="center">

<table>
<tr><td align="center" width="50%">

### 👨‍💻 المطور

# Taib

</td><td align="center" width="50%">

### 📱 واتساب

# +967 735 541 558

</td></tr>
<tr><td align="center">

### 📢 القناة

[whatsapp.com/channel/0029Vb8hDbBDuMRXBFk3u02L](https://whatsapp.com/channel/0029Vb8hDbBDuMRXBFk3u02L)

</td><td align="center">

### 👥 الجروب

[chat.whatsapp.com/IOO6Nwz29rpLgFy6L6p5YH](https://chat.whatsapp.com/IOO6Nwz29rpLgFy6L6p5YH)

</td></tr>
</table>

</div>

---

<div align="center">

<img src="https://upload.wikimedia.org/wikipedia/en/1/1c/Vito_Corleone.jpg" alt="Vito Corleone" width="120" style="border: 3px solid #D4AF37; border-radius: 8px;" />

<br/>

### 🎬 سأقدم له عرضاً لا يمكنه رفضه

*"I'm gonna make him an offer he can't refuse."*

---

**𝙱𝙾𝚃 𝚅𝙸𝚃𝙾 𝚅𝟹** — Powered by **Taib**

© 2026 جميع الحقوق محفوظة — Developed by Taib

</div>
