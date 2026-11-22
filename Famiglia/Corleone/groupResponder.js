import { db } from "../database/db.js";
import { activeBots } from "./subbotManager.js";

/** "123:5@s.whatsapp.net" -> "123@s.whatsapp.net" (يحذف لاحقة الجهاز). */
export function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];

  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

/**
 * يختار بوتاً واحداً فقط للرد في المجموعة.
 * الأولوية: الرئيسي إن كان مشرفاً، ثم أي فرعي مشرف، ثم الرئيسي، ثم أول بوت موجود.
 * بهذا لا يردّ الرئيسي والفرعيون معاً على الأمر نفسه.
 */
export function pickGroupResponder(groupMeta, groupJid = "") {
  const participants = groupMeta?.participants || [];
  if (!participants.length) return null;

  const online = [...activeBots.values()].filter((b) => {
    if (!b?.jid || b.status !== "online") return false;
    // البوت الموقوف عن هذه المجموعة لا يصلح أن يكون المتحدث باسمها.
    return !groupJid || db.getBotGroup(cleanJid(b.jid).split("@")[0], groupJid).botOn;
  });
  if (!online.length) return null;

  const jidOf = (b) => cleanJid(b.jid);
  const numOf = (jid) => String(jid || "").split("@")[0].split(":")[0];
  const participantOf = (b) => {
    const jidNum = numOf(b.jid);
    const lidNum = numOf(b.lid);
    return participants.find((p) => {
      const pId = numOf(p.id);
      const pLid = numOf(p.lid);
      return pId === jidNum || (!!lidNum && pId === lidNum) || (!!pLid && (pLid === jidNum || pLid === lidNum));
    });
  };
  const present = online.filter((b) => participantOf(b));
  if (!present.length) return null;

  const mainNum = String(global.mainBotNum || "");
  const isMain = (b) => !!b.isMain || (!!mainNum && jidOf(b).split("@")[0] === mainNum);
  const isAdmin = (b) => {
    const p = participantOf(b);
    return p?.admin === "admin" || p?.admin === "superadmin";
  };
  const byJid = (a, b) => jidOf(a).localeCompare(jidOf(b));

  const main = present.find(isMain);
  if (main && isAdmin(main)) return main;

  const adminSub = present.filter((b) => !isMain(b) && isAdmin(b)).sort(byJid)[0];
  if (adminSub) return adminSub;

  return main || present.sort(byJid)[0];
}

const META_TTL = 30_000;
const META_MAX = 500;
const metaCache = new Map();

async function groupMetaFor(sock, groupJid, fresh) {
  const me = String(sock?.user?.id || "").split("@")[0].split(":")[0];
  const key = `${me}:${groupJid}`;
  const hit = metaCache.get(key);
  if (!fresh && hit && hit.exp > Date.now()) return hit.meta;

  let meta = null;
  try {
    meta = await sock.groupMetadata(groupJid);
  } catch {}

  if (metaCache.size >= META_MAX) metaCache.delete(metaCache.keys().next().value);
  metaCache.set(key, { meta, exp: Date.now() + META_TTL });
  return meta;
}

/**
 * أحداث المجموعة (ترحيب/وداع/حذف/تحديثات) تمرّ عبر بوت واحد فقط.
 * الأحداث النادرة تُجلب لها البيانات حديثاً، والحذف المتكرر يستخدم كاشاً قصيراً.
 */
export async function shouldHandleGroupEvent(sock, groupJid, { fresh = false } = {}) {
  if (!groupJid?.endsWith("@g.us")) return true;

  const meta = await groupMetaFor(sock, groupJid, fresh);
  const me = cleanJid(sock?.user?.id || "");
  const responder = pickGroupResponder(meta, groupJid);
  if (responder) return cleanJid(responder.jid) === me;

  // بلا بيانات مجموعة: لا يردّ إلا الرئيسي إن كان معروفاً.
  const mainNum = String(global.mainBotNum || "");
  if (!mainNum) return true;
  return me.split("@")[0] === mainNum;
}
