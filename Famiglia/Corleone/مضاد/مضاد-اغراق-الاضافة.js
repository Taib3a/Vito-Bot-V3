import { log } from "../logger.js";
import config from "../settings.js";

const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

// Baileys يمرّر المشاركين كائنات { id, ... } أو نصوصاً.
const jidOf = (p) => (!p ? "" : typeof p === "string" ? p : p.id || p.jid || p.participant || "");

// نافذة الهجوم: إضافتان خلال نصف ثانية مؤشر قاطع على بوت مهاجم (البشر لا يفعلونها).
const WINDOW_MS = 500;
// بعد تنفيذ العقوبة نُهدّئ المراقبة حتى لا تتكرر المعالجة لكل حدث في الرشقة نفسها.
const COOLDOWN_MS = 10_000;
// حدّ أقصى لعدد المجموعات المتتبَّعة في الذاكرة.
const MAX_KEYS = 1000;

// groupJid -> { lastAddAt, cooldownUntil }
const floodState = new Map();

function ownerNumbers() {
  return [config.ownerNumber, config.coOwners]
    .flat()
    .filter(Boolean)
    .map((n) => numOf(String(n)));
}

/**
 * يستخرج JID المهاجم (من أضاف الأعضاء) من الحدث بدقة.
 * الحدث يوفّر `author` (message.key.participant) وبدائله:
 * `authorPn` (رقم الهاتف) و`authorUsername`؛ ويُمرَّر هنا كـ actor/actorPn/actorUsername.
 */
function resolveAttacker(event = {}) {
  const candidates = [event.actor, event.actorPn, event.actorUsername];
  for (const c of candidates) {
    const jid = jidOf(c);
    if (jid) return jid;
  }
  return "";
}

export default {
  name: "مضاد-اغراق-الاضافة",
  flag: "antiflood",

  async onJoin({ sock, groupJid, participants, isBotAdmin, actor, actorPn, actorUsername, botLabel }) {
    const list = Array.isArray(participants) ? participants : [];
    if (!list.length) return;

    const now = Date.now();
    const state = floodState.get(groupJid) || { lastAddAt: 0, cooldownUntil: 0 };

    // فترة التهدئة: بقية رشقة الهجوم تُتجاهَل.
    if (now < state.cooldownUntil) return;

    const delta = state.lastAddAt ? now - state.lastAddAt : Infinity;
    state.lastAddAt = now;
    if (floodState.size > MAX_KEYS) floodState.delete(floodState.keys().next().value);
    floodState.set(groupJid, state);

    // هجوم: دفعة واحدة بعدّة أعضاء، أو إضافتان خلال نصف ثانية.
    if (list.length < 2 && delta > WINDOW_MS) return;

    // كشف المهاجم من الحدث (author ثم بدائله).
    const attacker = resolveAttacker({ actor, actorPn, actorUsername });
    const attackerNum = numOf(attacker);
    const selfNum = numOf(sock.user?.id || "");

    // استثناء: مالك البوت أو البوت نفسه لا يُعاقبان.
    if (attackerNum && (attackerNum === selfNum || ownerNumbers().includes(attackerNum))) {
      log.info(`[${botLabel}] مضاد الإغراق: إضافة من ${attackerNum} (مالك/البوت) — تجاهُل`);
      return;
    }

    state.cooldownUntil = now + COOLDOWN_MS;

    const tag = attacker ? `@${attackerNum}` : "مجهول";
    log.warn(
      `[${botLabel}] مضاد الإغراق: هجوم على ${groupJid} — ${list.length} عضو، Δ${delta}ms، المهاجم ${tag}`,
    );

    // 1) إغلاق المجموعة فوراً لوقف أي محاولة إضافة أخرى.
    if (isBotAdmin) {
      try {
        await sock.groupSettingUpdate(groupJid, "announcement");
      } catch (e) {
        log.error(`مضاد الإغراق: تعذّر إغلاق المجموعة (${e.message})`);
      }

      // 2) طرد المهاجم حتى لو كان مشرفاً (قد يكون حسابه مخترقاً).
      // لا نطرد إن كان المهاجم أحد الوافدين الجدد (انضمام ذاتي، لا إضافة).
      const addedNums = new Set(list.map((p) => numOf(jidOf(p))));
      if (attacker && !addedNums.has(attackerNum)) {
        try {
          await sock.groupParticipantsUpdate(groupJid, [attacker], "remove");
        } catch (e) {
          log.error(`مضاد الإغراق: تعذّر طرد المهاجم (${e.message})`);
        }
      }
    } else {
      log.warn(`[${botLabel}] مضاد الإغراق: البوت ليس مشرفاً في ${groupJid} — تعذّر الإغلاق/الطرد`);
    }

    // 3) تحذير عاجل في المجموعة مع ذكر المهاجم.
    const warnText =
      `⚠️ تم اكتشاف هجوم إغراق! تم إغلاق المجموعة` +
      (attacker ? ` وطرد المهاجم ${tag}` : ` وطرد المهاجم`) +
      `. يرجى مراجعة المشرفين.`;
    try {
      await sock.sendMessage(groupJid, {
        text: warnText,
        ...(attacker ? { mentions: [attacker] } : {}),
      });
    } catch (e) {
      log.error(`مضاد الإغراق: تعذّر إرسال التحذير (${e.message})`);
    }
  },
};
