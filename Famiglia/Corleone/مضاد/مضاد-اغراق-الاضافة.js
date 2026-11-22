import { log } from "../logger.js";
import config from "../settings.js";

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

// Baileys يمرّر المشاركين كائنات { id, ... } أو نصوصاً.
const jidOf = (p) => (!p ? "" : typeof p === "string" ? p : p.id || p.jid || p.participant || "");

// نافذة رصد الهجوم. الهجوم الحقيقي يستدعي groupParticipantsUpdate عدة مرات
// متتالية بـ await، فتتباعد الأحداث مئات الملّي ثانية — نافذة ضيقة (نصف ثانية)
// تفوته. نوسّعها إلى 6 ثوانٍ لالتقاط الرشقة كاملة.
const WINDOW_MS = 6_000;
// عدد الإضافات (أو مجموع الأعضاء المضافين) خلال النافذة الذي يُعدّ هجوماً.
const THRESHOLD = 3;
// بعد تنفيذ العقوبة نُهدّئ المراقبة حتى لا تتكرر المعالجة لكل حدث في الرشقة نفسها.
const COOLDOWN_MS = 60_000;
// حدّ أقصى لعدد المجموعات المتتبَّعة في الذاكرة.
const MAX_KEYS = 1000;

// groupJid -> { adds: [{ t, n }], cooldownUntil }
const floodState = new Map();

function ownerNumbers() {
  return [config.ownerNumber, config.coOwners]
    .flat()
    .filter(Boolean)
    .map((n) => numOf(String(n)));
}

// واتساب لا يدعم المنشن باسم المستخدم: حقل `mentionedJid` في البروتوكول يقبل
// JIDs فعلية فقط (PN أو LID). أي نص آخر يُرسَل كما هو ولا يُنتج منشناً.
const isMentionableJid = (j) => /@(s\.whatsapp\.net|lid)$/.test(String(j || ""));

/**
 * يستخرج JID المهاجم (من أضاف الأعضاء) من الحدث بدقة.
 * الحدث يوفّر `author` (message.key.participant) وبدائله:
 * `authorPn` (رقم الهاتف) و`authorUsername`؛ ويُمرَّر هنا كـ actor/actorPn/actorUsername.
 * نُفضّل JID صالحاً (PN/LID) لأن الطرد والمنشن يحتاجانه، والاسم المستخدم بديل نصّي فقط.
 */
function resolveAttacker(event = {}) {
  const candidates = [event.actor, event.actorPn, event.actorUsername];
  for (const c of candidates) {
    const jid = jidOf(c);
    if (isMentionableJid(jid)) return jid;
  }
  for (const c of candidates) {
    const jid = jidOf(c);
    if (jid) return jid;
  }
  return "";
}

/** هل الفاعل مشرف في المجموعة؟ المشرف يضيف أعضاء بشكل طبيعي فلا يُعاقب. */
async function isGroupAdmin(sock, groupJid, ...jids) {
  const nums = new Set(jids.map((j) => numOf(jidOf(j))).filter(Boolean));
  if (!nums.size) return false;

  let meta = null;
  try {
    meta = await sock.groupMetadata(groupJid);
  } catch {}

  const p = meta?.participants?.find((x) =>
    nums.has(numOf(x.id)) || nums.has(numOf(x.lid)) || nums.has(numOf(x.phoneNumber))
  );
  return p?.admin === "admin" || p?.admin === "superadmin";
}

/**
 * يبني مرجع الإشارة إلى المهاجم.
 *
 * `mentions` تضمّ JIDs فعلية فقط (رقم الهاتف ثم الـ LID) — اسم المستخدم لا
 * يُدرَج فيها لأنه لا يعمل في المنشن. النص يعرض رقم الهاتف (فيعرضه واتساب
 * باسم صاحب الحساب)، ثم رقم الـ JID، ثم رابط wa.me كاحتياطي أخير.
 */
function attackerReference({ attacker, attackerNum, actorUsername, actorPn }) {
  const uname = String(actorUsername || "").replace(/^[@~]+/, "").trim();
  const pn = jidOf(actorPn);
  const pnNum = numOf(pn);
  const mentions = [...new Set([pn, attacker].filter(isMentionableJid))];

  // النص: رقم الهاتف ← رقم الـ JID (كلاهما منشن صالح).
  if (pnNum) return { text: `@${pnNum}`, mentions };
  if (/^\d+$/.test(attackerNum)) return { text: `@${attackerNum}`, mentions };

  // لا JID صالح: لا يمكن المنشن — نعرض الاسم أو رابط wa.me كنص عادي فقط.
  if (uname) return { text: uname, mentions };
  const userPart = numOf(attacker);
  return { text: userPart ? `https://wa.me/${userPart}` : "", mentions };
}

export default {
  name: "مضاد-اغراق-الاضافة",
  flag: "antiflood",

  async onJoin({ sock, groupJid, participants, isBotAdmin, actor, actorPn, actorUsername, botLabel }) {
    const list = Array.isArray(participants) ? participants : [];
    if (!list.length) return;

    const now = Date.now();
    const state = floodState.get(groupJid) || { adds: [], cooldownUntil: 0 };

    // فترة التهدئة: بقية رشقة الهجوم تُتجاهَل.
    if (now < state.cooldownUntil) return;

    // نافذة متدرّجة: نسجّل الإضافة الحالية ونسقط ما خرج من النافذة.
    state.adds = state.adds.filter((e) => now - e.t <= WINDOW_MS);
    state.adds.push({ t: now, n: list.length });
    if (floodState.size > MAX_KEYS) floodState.delete(floodState.keys().next().value);
    floodState.set(groupJid, state);

    // هجوم: بلوغ عتبة الإضافات خلال النافذة (يشمل الدفعة الواحدة).
    const added = state.adds.reduce((sum, e) => sum + e.n, 0);
    if (added < THRESHOLD) return;

    // كشف المهاجم من الحدث (author ثم بدائله).
    const attacker = resolveAttacker({ actor, actorPn, actorUsername });
    const attackerNum = numOf(attacker);
    const selfNum = numOf(sock.user?.id || "");

    // استثناء: مالك البوت أو البوت نفسه لا يُعاقبان.
    if (attackerNum && (attackerNum === selfNum || ownerNumbers().includes(attackerNum))) {
      log.info(`[${botLabel}] مضاد الإغراق: إضافة من ${attackerNum} (مالك/البوت) — تجاهُل`);
      return;
    }

    // استثناء: مشرف المجموعة يضيف أعضاء بشكل طبيعي — لا نغلق المجموعة ولا نطرده.
    if (await isGroupAdmin(sock, groupJid, actor, actorPn)) {
      log.info(`[${botLabel}] مضاد الإغراق: إضافة من مشرف ${attackerNum || "?"} — تجاهُل`);
      state.adds = [];
      return;
    }

    state.cooldownUntil = now + COOLDOWN_MS;
    state.adds = [];

    // الإشارة للمهاجم: المصفوفة تضمّ كل بيانات هويته، والنص يعرض الاسم أو الرقم.
    const ref = attackerReference({ attacker, attackerNum, actorUsername, actorPn });
    const tag = ref.text || (attacker ? attackerNum : "مجهول");
    log.warn(
      `[${botLabel}] مضاد الإغراق: هجوم على ${groupJid} — ${added} إضافة خلال ${WINDOW_MS / 1000}ث، المهاجم ${tag}`,
    );

    let closed = false;
    let kicked = false;

    // 1) إغلاق المجموعة فوراً لوقف أي محاولة إضافة أخرى.
    if (isBotAdmin) {
      try {
        await sock.groupSettingUpdate(groupJid, "announcement");
        closed = true;
      } catch (e) {
        log.error(`مضاد الإغراق: تعذّر إغلاق المجموعة (${e.message})`);
      }

      // تعزيز استباقي: قصر الإضافة على المشرفين فقط، فيُسدّ الطريق على أي
      // عضو مخترق يعيد المحاولة حتى لو فُتحت المجموعة لاحقاً.
      try {
        await sock.groupMemberAddMode(groupJid, "admin_add");
      } catch (e) {
        log.error(`مضاد الإغراق: تعذّر تقييد الإضافة للمشرفين (${e.message})`);
      }

      // 2) طرد المهاجم غير المشرف.
      // لا نطرد إن كان المهاجم أحد الوافدين الجدد (انضمام ذاتي، لا إضافة).
      const addedNums = new Set(list.map((p) => numOf(jidOf(p))));
      if (attacker && !addedNums.has(attackerNum)) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [attacker], "remove");
          kicked = true;
        } catch (e) {
          log.error(`مضاد الإغراق: تعذّر طرد المهاجم (${e.message})`);
        }
      }
    } else {
      log.warn(`[${botLabel}] مضاد الإغراق: البوت ليس مشرفاً في ${groupJid} — تعذّر الإغلاق/الطرد`);
    }

    // 3) تحذير عاجل في المجموعة مع ذكر المهاجم (منشن للرقم، رابط للاسم).
    const actionText = closed
      ? "تم إغلاق المجموعة"
      : isBotAdmin
        ? "تعذّر إغلاق المجموعة"
        : "تعذّر إغلاق المجموعة (البوت ليس مشرفاً)";
    const kickText = kicked
      ? ref.text
        ? ` وطرد المهاجم ${ref.text}`
        : " وطرد المهاجم"
      : "";
    const warnText = `⚠️ تم اكتشاف محاولة إغراق! ${actionText}${kickText}. يرجى مراجعة المشرفين.`;
    try {
      await sock.sendMessage(groupJid, {
        text: warnText,
        ...(ref.mentions.length ? { mentions: ref.mentions } : {}),
      });
    } catch (e) {
      log.error(`مضاد الإغراق: تعذّر إرسال التحذير (${e.message})`);
    }
  },
};
