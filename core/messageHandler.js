import config from "../config.js";
import { log } from "./logger.js";
import { getPlugins } from "./pluginLoader.js";
import { db } from "../database/db.js";
import { checkAntilink } from "./مضاد/روابط.js";
import { checkAntispam } from "./مضاد/سبام.js";
import { checkAntibot } from "./مضاد/بوتات.js";
import { welcomeOnJoin, welcomeOnLeave } from "./مضاد/ترحيب.js";
import { handleChatXp, handleCommandXp } from "./xp.js";
import { claimOnce } from "./subbotManager.js";
import { resolveAlias } from "./aliases.js";
import { extractButtonId } from "./buttons.js";

const GROUP_TTL = 10 * 60 * 1000;
const groupCache = new Map();
const prefixes = Array.isArray(config.prefix) ? config.prefix : [config.prefix];
const configuredLidCache = new Map();

export function invalidateGroupCache(groupJid) {
  groupCache.delete(groupJid);
}

export function registerGroupCacheEvents(sock) {
  sock.ev.on("group-participants.update", ({ id }) => invalidateGroupCache(id));
  sock.ev.on("groups.update", (updates) => {
    for (const u of updates) if (u?.id) invalidateGroupCache(u.id);
  });
}

/** هل البوت مشرف في هذه المجموعة؟ يُستخدم قبل الطرد. */
async function isBotAdminIn(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    const bot = cleanJid(sock.user?.id || "");
    const botNum = bot.split("@")[0];
    const p = meta?.participants?.find((x) => {
      const id = cleanJid(x.id || "");
      return id === bot || id.split("@")[0] === botNum;
    });
    return p?.admin === "admin" || p?.admin === "superadmin";
  } catch {
    return false;
  }
}

/**
 * يربط أحداث الدخول والخروج بالترحيب ومضاد البوتات.
 * كل معالج معزول بـ try/catch حتى لا يُسقط خطأ واحد البوت.
 */
export function registerGroupEvents(sock, botLabel = "MAIN") {
  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (!id?.endsWith("@g.us") || !Array.isArray(participants)) return;
    if (action !== "add" && action !== "remove") return;

    try {
      const groupData = db.getGroup(id);
      const isBotAdmin = await isBotAdminIn(sock, id);

      if (groupData?.antibot && action === "add") {
        try {
          await checkAntibot({ sock, groupJid: id, participants, isBotAdmin, botLabel });
        } catch (e) {
          log.error(`مضاد البوتات: ${e.message}`);
        }
      }

      if (groupData?.welcome) {
        try {
          if (action === "add") await welcomeOnJoin({ sock, groupJid: id, participants, botLabel });
          else await welcomeOnLeave({ sock, groupJid: id, participants, botLabel });
        } catch (e) {
          log.error(`الترحيب: ${e.message}`);
        }
      }
    } catch (e) {
      log.error(`[${botLabel}] خطأ في حدث المشاركين: ${e.message}`);
    }
  });
}

/** "123:5@s.whatsapp.net" -> "123@s.whatsapp.net" (drops the device suffix). */
function cleanJid(jid = "") {
  if (!jid) return "";
  const atIndex = jid.lastIndexOf("@");
  if (atIndex === -1) return jid.split(":")[0];

  const userPart = jid.slice(0, atIndex).split(":")[0];
  const domainPart = jid.slice(atIndex + 1);
  return `${userPart}@${domainPart}`;
}

async function resolveLid(lidJid, groupMeta, sock) {
  if (!lidJid || !lidJid.endsWith("@lid")) return lidJid;

  const match = groupMeta?.participants?.find((p) => cleanJid(p.id || "") === lidJid);
  if (match?.phoneNumber) return cleanJid(match.phoneNumber);

  try {
    const resolved = await sock.signalRepository?.lidMapping?.getPNForLID(lidJid);
    if (resolved) return cleanJid(resolved);
  } catch {}

  return lidJid;
}

async function matchesConfiguredNumber(numberList, senderNum, rawLid, sock) {
  if (numberList.includes(senderNum)) return true;

  if (rawLid && rawLid.endsWith("@lid")) {
    for (const num of numberList) {
      let lid = configuredLidCache.get(num);

      if (lid === undefined) {
        try {
          const resolved = await sock.signalRepository?.lidMapping?.getLIDForPN(`${num}@s.whatsapp.net`);
          lid = resolved ? cleanJid(resolved) : null;
        } catch {
          lid = null;
        }
        configuredLidCache.set(num, lid);
      }

      if (lid && lid === rawLid) return true;
    }
  }

  return false;
}

export async function handleMessage(sock, rawMsg, botLabel = "MAIN", mainBotNum = null, activeBotsLive = []) {
  try {
    const msg = rawMsg;
    const from = msg.key?.remoteJid;
    if (!from) return;
    if (from === "status@broadcast") return;

    const isGroup = from.endsWith("@g.us");

    const participantRaw = isGroup ? msg.key?.participant || msg.participant || "" : "";
    const participantReal = isGroup ? msg.key?.participantAlt || "" : "";

    let senderJid;
    if (isGroup) {
      senderJid =
        participantRaw.endsWith("@lid") && participantReal && !participantReal.endsWith("@lid")
          ? participantReal
          : participantRaw;
    } else {
      const remoteAlt = msg.key?.remoteJidAlt || "";
      senderJid = from.endsWith("@lid") && remoteAlt && !remoteAlt.endsWith("@lid") ? remoteAlt : from;
    }

    const senderLidJid = senderJid.endsWith("@lid")
      ? senderJid
      : isGroup
        ? participantRaw
        : from.endsWith("@lid")
          ? from
          : "";

    let sender = cleanJid(senderJid);
    const senderLid = cleanJid(senderLidJid);
    const botJid = cleanJid(sock.user?.id || "");

    const body =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      msg.message?.templateButtonReplyMessage?.selectedId ||
      // A native-flow click arrives as paramsJson, not as text.
      extractButtonId(msg.message) ||
      "";

    const msgType = msg.message ? Object.keys(msg.message)[0] ?? "unknown" : "unknown";

    const msgTypeLabel =
      msgType === "conversation" || msgType === "extendedTextMessage" ? "نص" :
      msgType === "imageMessage" ? "🖼️ صورة" :
      msgType === "videoMessage" ? "🎥 فيديو" :
      msgType === "audioMessage" ? "🎵 صوت" :
      msgType === "stickerMessage" ? "🎴 ملصق" :
      msgType === "documentMessage" ? "📄 ملف" :
      msgType === "ptvMessage" ? "📹 ملاحظة فيديو" :
      msgType === "reactionMessage" ? "🔥 تفاعل" :
      msgType === "contactMessage" ? "👤 جهة اتصال" :
      msgType === "locationMessage" ? "📍 موقع" : "أخرى";

    const usedPrefix = prefixes.find((p) => body.startsWith(p)) ?? null;
    const isCmd = !!usedPrefix;
    const fromMe = !!msg.key?.fromMe;

    if (fromMe && !isCmd) return;

    const afterPrefix = isCmd ? body.slice(usedPrefix.length).trimStart() : "";
    const rawCmdName = isCmd ? afterPrefix.split(/\s+/)[0].toLowerCase() : "";
    // Internal checks (primary-bot routing, help text) compare against the
    // canonical name, so an Arabic alias behaves exactly like the original.
    const cmdName = rawCmdName;
    const canonicalName = resolveAlias(rawCmdName);
    const args = isCmd ? afterPrefix.slice(rawCmdName.length).trim().split(/\s+/).filter(Boolean) : [];
    const text = args.join(" ");

    const plugins = getPlugins();
    const plugin = isCmd ? plugins.get(cmdName) : null;

    let groupName = "";
    let groupMeta = null;

    if (isGroup) {
      const cached = groupCache.get(from);
      if (cached && cached.exp > Date.now()) {
        groupMeta = cached.meta;
        groupName = groupMeta?.subject || from;
      } else {
        try {
          groupMeta = await sock.groupMetadata(from);
          groupName = groupMeta?.subject || from;
          groupCache.set(from, { meta: groupMeta, exp: Date.now() + GROUP_TTL });
        } catch {
          groupName = from;
        }
      }

      const primaryBot = db.getPrimary(from);
      if (primaryBot && canonicalName !== "delprimary" && canonicalName !== "setprimary") {
        const myId = botJid.split("@")[0];
        if (primaryBot !== myId) return;
      }

      if (isCmd && (plugin?.adminOnly || plugin?.botAdmin)) {
        try {
          groupMeta = await sock.groupMetadata(from);
          groupName = groupMeta?.subject || from;
          groupCache.set(from, { meta: groupMeta, exp: Date.now() + GROUP_TTL });
        } catch {}
      }
    }

    const rawSenderLid = sender.endsWith("@lid") ? sender : senderLid || "";

    if (sender.endsWith("@lid")) sender = await resolveLid(sender, groupMeta, sock);

    if (msg.pushName) db.setPushName(sender, msg.pushName);

    const senderNum = sender.split("@")[0];

    // For a message the bot sent itself, permissions are judged by the bot's
    // number, so a subbot is owner only if that number is configured.
    const botNum = botJid.split("@")[0];
    const botLid = cleanJid(sock.user?.lid || "");
    const permNum = fromMe ? botNum : senderNum;
    const permLid = fromMe ? botLid : rawSenderLid;

    const isMainBotSelf = fromMe && !!mainBotNum && botNum === String(mainBotNum);

    const isOwner = isMainBotSelf || (await matchesConfiguredNumber(config.ownerNumber, permNum, permLid, sock));
    const isCoOwner = await matchesConfiguredNumber(config.coOwners, permNum, permLid, sock);
    const isMod = isOwner || isCoOwner || db.hasRole(permNum, "mod");
    const isPremium = isMod || db.hasRole(permNum, "premium");

    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup && groupMeta?.participants) {
      const botJidClean = cleanJid(botJid);

      let botLidClean = "";
      try {
        const resolvedBotLid = await sock.signalRepository?.lidMapping?.getLIDForPN(botJidClean);
        if (resolvedBotLid) botLidClean = cleanJid(resolvedBotLid);
      } catch {}

      const senderJidClean = cleanJid(sender);

      const matchesParticipant = (p, targetJid, targetLid) => {
        const pId = cleanJid(p.id);
        const pLid = cleanJid(p.lid || "");
        return (
          pId === targetJid ||
          (targetLid && pId === targetLid) ||
          (targetLid && pLid === targetLid) ||
          pLid === targetJid
        );
      };

      const botParticipant = groupMeta.participants.find((p) => matchesParticipant(p, botJidClean, botLidClean));
      const senderParticipant = groupMeta.participants.find((p) => matchesParticipant(p, senderJidClean, senderLid));

      isAdmin = senderParticipant?.admin === "admin" || senderParticipant?.admin === "superadmin";
      isBotAdmin = botParticipant?.admin === "admin" || botParticipant?.admin === "superadmin";
    }

    if (isGroup) {
      const groupData = db.getGroup(from);

      if (groupData?.selfMode && !isOwner && !isCoOwner && !fromMe) return;
      if (groupData?.adminMode && !isAdmin && !isMod) return;

      if (body && !isAdmin && !isMod && !isCmd) {
        if (groupData?.antilink) {
          const handled = await checkAntilink({ sock, msg, from, sender, body, isBotAdmin, botLabel });
          if (handled) return;
        }

        if (groupData?.antispam) {
          const handled = await checkAntispam({ sock, from, sender, body, isBotAdmin, botLabel });
          if (handled) return;
        }
      }

      if (!isCmd && body) handleChatXp(sender);
    }

    log.message({ groupName, userName: msg.pushName || senderNum, messageType: msgTypeLabel, content: body });

    if (!isCmd) return;

    if (!plugin) {
      if (!claimOnce(`deny:${msg.key.id}`)) return;
      return await sock.sendMessage(
        from,
        {
          text: `✖️ الأمر "*${usedPrefix}${cmdName}*" غير موجود.\n> اكتب *${usedPrefix}menu* لعرض قائمة الأوامر.`,
        },
        { quoted: msg }
      );
    }

    const ctx = {
      sock, msg, from, sender, senderNum, botJid, botLabel, mainBotNum, activeBotsLive,
      isGroup, groupName, groupMeta, body, isCmd, cmdName, args, text, usedPrefix,
      isOwner, isCoOwner, isMod, isPremium, isAdmin, isBotAdmin,
      resolveLid: (lidJid) => resolveLid(lidJid, groupMeta, sock),
      clearGroupCache: () => groupCache.delete(from),
      reply: async (content) => {
        if (typeof content === "string") content = { text: content };
        if (content.text !== undefined) {
          const extra = content.mentions || [];
          content.mentions = [...new Set([sender, ...extra])];
        }
        try {
          return await sock.sendMessage(from, content, { quoted: msg });
        } catch (e1) {
          log.warn(`[${botLabel}] فشل الرد مع الاقتباس (${e1.message})، إعادة بدون اقتباس...`);
          try {
            return await sock.sendMessage(from, content);
          } catch (e2) {
            log.error(`[${botLabel}] فشل الرد بدون اقتباس: ${e2.message} | from: ${from}`);
          }
        }
      },
      react: async (emoji) => {
        try {
          return await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
        } catch (e) {
          log.warn(`[${botLabel}] فشل التفاعل: ${e.message} | from: ${from}`);
        }
      },
    };

    const denyOnce = (text) => {
      if (!claimOnce(`deny:${msg.key.id}`)) return;
      return ctx.reply({ text });
    };

    if (plugin.ownerOnly && !isOwner) return denyOnce("❌ هذا الأمر للمالك فقط.");
    if (plugin.modOnly && !isMod) return denyOnce("❌ هذا الأمر للمشرفين فقط.");
    if (plugin.botAdmin && isGroup && !isBotAdmin) return denyOnce("❌ يحتاج البوت أن يكون مشرفاً في المجموعة.");
    if (plugin.adminOnly && isGroup && !isAdmin && !isMod) return denyOnce("❌ هذا الأمر لمشرفي المجموعة فقط.");
    if (plugin.premiumOnly && !isPremium) return denyOnce("⭐ هذا الأمر للمستخدمين المميزين فقط.");
    if (plugin.groupOnly && !isGroup) return denyOnce("👥 هذا الأمر يعمل في المجموعات فقط.");
    if (plugin.privateOnly && isGroup) return denyOnce("📩 هذا الأمر يعمل في الخاص فقط.");

    const start = Date.now();
    try {
      await plugin.run(ctx);
      log.cmdExec({ cmdName, sender: senderNum, success: true, ms: Date.now() - start, botLabel });
      if (isGroup) handleCommandXp(sender);
    } catch (e) {
      log.cmdExec({ cmdName, sender: senderNum, success: false, ms: Date.now() - start, botLabel });
      log.error(`الأمر ${cmdName}: ${e.message}`);
      await ctx.react("❌");

      if (e.message?.toLowerCase().includes("forbidden")) {
        await ctx.reply({ text: "❌ تعذّر تنفيذ العملية: يحتاج البوت أن يكون مشرفاً في المجموعة." });
      } else {
        await ctx.reply({ text: `❌ خطأ في تنفيذ \`${cmdName}\`:\n${e.message}` });
      }
    }
  } catch (e) {
    log.error(`handleMessage: ${e.message}`);
  }
}
