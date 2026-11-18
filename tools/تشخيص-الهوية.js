/**
 * أداة تشخيصية مستقلة (ليست أمراً للبوت): تكشف كيف يُمثّل واتساب هوية المرسل،
 * وتختبر هل يعمل المنشن باسم المستخدم (Username) أم بالرقم فقط.
 *
 * التشغيل:
 *   node tools/تشخيص-الهوية.js --sim                 # فحص محلي بلا اتصال (ترميز المنشن)
 *   node tools/تشخيص-الهوية.js                        # استماع حيّ + إرسال اختبار منشن
 *   node tools/تشخيص-الهوية.js --group 123@g.us       # تحديد المجموعة
 *   node tools/تشخيص-الهوية.js --jid 967...@s.whatsapp.net   # تحديد هدف المنشن
 *   node tools/تشخيص-الهوية.js --session ./sessions/main      # مجلد جلسة آخر
 *
 * ملاحظة: الاستماع الحيّ يفتح مقبساً على الجلسة المحدَّدة، فأوقف البوت العادي
 * أولاً حتى لا تتصادم الجلستان (connectionReplaced).
 */
import { createConnection } from "../Famiglia/Corleone/connection.js";
import { log } from "../Famiglia/Corleone/logger.js";
import { jidDecode, isPnUser, isLidUser, generateWAMessageContent } from "@whiskeysockets/baileys";

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const SIM_ONLY = hasFlag("--sim");
const GROUP_ARG = argOf("--group");
const JID_ARG = argOf("--jid");
const SESSION = argOf("--session") || "./sessions/main";

const LINE = "═".repeat(74);
const title = (t) => console.log(`\n${LINE}\n  ${t}\n${LINE}`);
const kv = (k, v) => console.log(`  ${String(k).padEnd(22)}: ${v ?? "—"}`);

/** يقسّم JID إلى أجزائه: user / server / device / domainType. */
function describeJid(jid) {
  if (!jid) return null;
  const d = jidDecode(jid);
  if (!d) return { raw: jid, server: null, user: null };
  return {
    raw: jid,
    user: d.user,
    server: d.server,
    device: d.device,
    domainType: d.domainType,
    kind: isPnUser(jid) ? "PN (رقم)" : isLidUser(jid) ? "LID (معرّف)" : "أخرى",
    isNumericUser: /^\d+$/.test(d.user || ""),
  };
}

/** يطبع بطاقة هوية كاملة لقيمة JID واحدة. */
function printJidCard(label, jid) {
  const info = describeJid(jid);
  if (!info) return;
  console.log(`\n  ▸ ${label}`);
  kv("JID", info.raw);
  kv("user", info.user);
  kv("server", info.server);
  if (info.device !== undefined) kv("device", info.device);
  kv("النوع", info.kind);
  kv("أرقام فقط؟", info.isNumericUser ? "نعم → منشن بالرقم" : "لا (حروف) → يحتاج اسم/رابط");
}

/**
 * يجمع كل حقول الهوية المحتملة من رسالة عادية (`messages.upsert`).
 * هذه هي نفس الحقول التي يقرأها البوت فعلاً في messageHandler.js.
 */
function identityFromMessage(msg) {
  const key = msg.key || {};
  return {
    remoteJid: key.remoteJid,
    remoteJidAlt: key.remoteJidAlt,
    remoteJidUsername: key.remoteJidUsername,
    participant: key.participant,
    participantAlt: key.participantAlt,
    participantUsername: key.participantUsername,
    fromMe: key.fromMe,
    pushName: msg.pushName,
    addressingMode: key.addressingMode,
  };
}

/** يجمع كل حقول الهوية من عنصر مشارك في `group-participants.update`. */
function identityFromParticipant(p) {
  if (p == null) return null;
  if (typeof p === "string") return { id: p };
  return {
    id: p.id,
    jid: p.jid,
    lid: p.lid,
    phoneNumber: p.phoneNumber,
    username: p.username,
    name: p.name,
    admin: p.admin,
  };
}

/** يطبع تقرير هوية المرسل من رسالة عادية. */
function reportMessageIdentity(msg) {
  const id = identityFromMessage(msg);
  title(`هوية مرسل (messages.upsert) — ${id.fromMe ? "من البوت" : "من مستخدم"}`);
  for (const [k, v] of Object.entries(id)) kv(k, v);

  console.log("\n  ▸ التحليل:");
  const candidates = [id.participant, id.participantAlt, id.remoteJid, id.remoteJidAlt].filter(Boolean);
  for (const c of [...new Set(candidates)]) printJidCard("مرشّح JID", c);

  const uname = id.participantUsername || id.remoteJidUsername;
  kv("اسم المستخدم", uname || "لا يوجد");
  kv("الخلاصة", uname ? `لديه Username → المنشن بالاسم @${uname}` : "لا Username → المنشن بالرقم");
}

/** يطبع تقرير هوية الفاعل من حدث المشاركين. */
function reportParticipantsIdentity(event) {
  title("هوية فاعل (group-participants.update)");
  kv("action", event.action);
  kv("author (JID الفاعل)", event.author);
  kv("authorPn (رقم الهاتف)", event.authorPn);
  kv("authorUsername (اسم المستخدم)", event.authorUsername || "لا يوجد");

  console.log("\n  ▸ التحليل:");
  for (const c of [event.author, event.authorPn].filter(Boolean)) printJidCard("مرشّح JID", c);
  kv(
    "الخلاصة",
    event.authorUsername
      ? `لديه Username → المنشن بالاسم @${event.authorUsername}`
      : "لا Username → المنشن بالرقم",
  );

  console.log("\n  ▸ المشاركون المتأثرون:");
  for (const p of event.participants || []) {
    const info = identityFromParticipant(p);
    console.log(`     ${JSON.stringify(info)}`);
  }
}

/**
 * اختبار محلي: يرمّز رسالة منشن عبر دالة Baileys الحقيقية (generateWAMessageContent)
 * ويطبع ما يضعه واتساب فعلاً في contextInfo.mentionedJid لكل شكل من أشكال الهوية.
 */
async function simulateMentionEncoding() {
  title("اختبار ترميز المنشن محلياً (Baileys generateWAMessageContent)");
  const cases = [
    ["رقم (PN)", "966509999999@s.whatsapp.net"],
    ["معرّف (LID)", "1234567890:5@lid"],
    ["اسم مستخدم خام", "Lord"],
    ["اسم مستخدم بـ@", "@Lord"],
  ];
  for (const [label, jid] of cases) {
    try {
      const content = await generateWAMessageContent(
        { text: `مرحباً @${jid}`, mentions: [jid] },
        { upload: async () => ({}) },
      );
      const ctx = content.extendedTextMessage?.contextInfo;
      console.log(`\n  ▸ ${label}`);
      kv("mentions[]", jid);
      kv("mentionedJid", JSON.stringify(ctx?.mentionedJid));
      kv("nonJidMentions", ctx?.nonJidMentions);
    } catch (e) {
      kv(label, `خطأ: ${e.message}`);
    }
  }
  console.log(
    "\n  ملاحظة: mentionedJid يُمرَّر كما هو (بلا تحويل). واتساب يعرض المنشن اسماً\n" +
      "  إذا كان المُعرّف مرتبطاً بحساب يحمل Username؛ وإلا يعرض الرقم.",
  );
}

/** يحدّد مجموعة للاختبار: من الوسيط، أو أول مجموعة البوت مشرف فيها. */
async function pickGroup(sock) {
  if (GROUP_ARG) return GROUP_ARG;
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups || {});
    if (!list.length) return null;
    console.log("\n  ▸ المجموعات المتاحة:");
    for (const g of list) console.log(`     ${g.id}  —  ${g.subject || "(بلا اسم)"}`);
    return list[0].id;
  } catch (e) {
    log.error(`تعذّر جلب المجموعات: ${e.message}`);
    return null;
  }
}

/** يرسل ثلاث رسائل اختبار إلى مجموعة لرؤية شكل المنشن الحقيقي. */
async function sendMentionTests(sock, groupJid, targetJid) {
  title(`إرسال اختبار المنشن إلى ${groupJid}`);
  const tests = [
    [
      "منشن بـ JID مباشرة",
      { text: `اختبار ١ — منشن بـ JID: @${String(targetJid).split("@")[0]}`, mentions: [targetJid] },
    ],
    [
      "منشن بـ username في النص",
      { text: `اختبار ٢ — منشن باسم مستخدم: @${JID_ARG || "username"}`, mentions: [targetJid] },
    ],
    ["منشن بـ JID داخل المصفوفة فقط", { text: `اختبار ٣ — ${targetJid}`, mentions: [targetJid] }],
  ];
  for (const [label, content] of tests) {
    try {
      await sock.sendMessage(groupJid, content);
      log.ok(`أُرسل: ${label}`);
    } catch (e) {
      log.error(`تعذّر إرسال (${label}): ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("\n  راقب الرسائل الثلاث في واتساب: هل ظهر المنشن اسماً (@Lord) أم رقماً؟");
}

/** الوضع الحيّ: يستمع ويسجّل كل ما يصل، ويختبر المنشن. */
async function liveMode() {
  title("الوضع الحيّ: استماع + اختبار منشن");
  log.info(`فتح الجلسة: ${SESSION} — أوقف البوت العادي أولاً لتجنّب تصادم الجلسات.`);

  const sock = await createConnection({ sessionDir: SESSION, botLabel: "DIAG", isSubbot: false });
  if (!sock) {
    log.error("تعذّر إنشاء الاتصال.");
    return;
  }

  // ننتظر حتى يفتح المقبس فعلاً قبل الإرسال/الاستماع.
  if (typeof sock.waitForOpen === "function") await sock.waitForOpen(60000);

  // 1) الاستماع للرسائل العادية.
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (!msg.message) continue;
      reportMessageIdentity(msg);
    }
  });

  // 2) الاستماع لأحداث المجموعات.
  sock.ev.on("group-participants.update", (event) => reportParticipantsIdentity(event));

  log.ok("الاستماع جاهز — أرسل رسالة في المجموعة الآن لرؤية بياناتها.");

  // 3) اختبار المنشن الحيّ.
  const group = await pickGroup(sock);
  if (!group) {
    log.warn("لا مجموعة محدَّدة — مرّر --group لاختبار المنشن.");
  } else {
    let target = JID_ARG;
    if (!target) {
      try {
        const meta = await sock.groupMetadata(group);
        target = meta?.participants?.find((p) => !p.admin)?.id || meta?.participants?.[0]?.id || null;
      } catch {}
    }
    if (target) {
      printJidCard("هدف المنشن", target);
      await sendMentionTests(sock, group, target);
    } else {
      log.warn("تعذّر تحديد هدف المنشن — مرّر --jid.");
    }
  }

  console.log("\n  الأداة تعمل... اضغط Ctrl+C للخروج.\n");
}

/**
 * وضع العرض (--demo): يحقن رسالةً وحدث مشاركين وهميين فيهما Username، فيطبع
 * التقرير الكامل دون اتصال — لرؤية الشكل النهائي والتحقق من منطق التحليل.
 */
function demoMode() {
  title("وضع العرض (--demo): بيانات وهمية بلا اتصال");

  const fakeMsg = {
    key: {
      remoteJid: "120363000000000000@g.us",
      remoteJidAlt: "120363000000000000@g.us",
      participant: "1234567890:5@lid",
      participantAlt: "966509999999@s.whatsapp.net",
      participantUsername: "Lord",
      fromMe: false,
      addressingMode: "LID",
    },
    pushName: "Lord Vito",
  };
  reportMessageIdentity(fakeMsg);

  const fakeEvent = {
    action: "add",
    author: "1234567890:5@lid",
    authorPn: "966509999999@s.whatsapp.net",
    authorUsername: "Lord",
    participants: [
      { id: "1111111111:2@lid", phoneNumber: "966501111111@s.whatsapp.net", username: "guest1" },
      "966502222222@s.whatsapp.net",
    ],
  };
  reportParticipantsIdentity(fakeEvent);
}

async function main() {
  console.log(`\n${LINE}\n  أداة تشخيص الهوية والمنشن — Vito-Bot-V3\n${LINE}`);

  await simulateMentionEncoding();

  if (hasFlag("--demo")) {
    demoMode();
    title("انتهى وضع العرض (--demo)");
    return;
  }

  if (SIM_ONLY) {
    title("انتهى الوضع المحلي (--sim)");
    return;
  }

  await liveMode();
}

main().catch((e) => {
  log.error(`خطأ قاتل: ${e.message}`);
  process.exit(1);
});
