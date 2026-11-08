import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { log } from "../logger.js";
import { db } from "../../database/db.js";

const WIDTH = 800;
const HEIGHT = 450;

// ── لوحة ألوان «العرّاب»: فحمي داكن مع عنابي فاخر وذهبي عتيق ──
const CHARCOAL = "#0d0b0a";
const MAROON = "#4a0d13";
const GOLD = "#d4af37";
const GOLD_BRIGHT = "#f5d67b";
const IVORY = "#f4efe4";
const MAROON_LIGHT = "#c96b78";

const SERIF_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
];
const SERIF_REGULAR_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
];

/** خط كلاسيكي عريض إن وُجد على النظام، وإلا الخط الاحتياطي. */
function registerSerif() {
  try {
    for (const p of SERIF_CANDIDATES) {
      if (GlobalFonts.registerFromPath(p, "GodfatherBold")) return "GodfatherBold";
    }
    for (const p of SERIF_REGULAR_CANDIDATES) {
      if (GlobalFonts.registerFromPath(p, "GodfatherBold")) return "GodfatherBold";
    }
  } catch {
    // تجاهل: نعود إلى الخط الافتراضي أدناه.
  }
  return "serif";
}

const SERIF = registerSerif();

/** يحوّل لوناً سادس عشرياً إلى rgba بشفافية محدّدة. */
function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** قصّ النص الطويل وأضف ثلاث نقاط حتى لا يخرج عن البطاقة. */
function fitText(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function drawLine(ctx, y, x1, x2, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** خلفية سينمائية: فحمي في الوسط وتدرّج عنابي عند الزوايا. */
function drawBackground(ctx) {
  ctx.fillStyle = CHARCOAL;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const vignette = ctx.createRadialGradient(
    WIDTH / 2, HEIGHT / 2, HEIGHT * 0.22,
    WIDTH / 2, HEIGHT / 2, WIDTH * 0.78
  );
  vignette.addColorStop(0, hexToRgba(CHARCOAL, 0));
  vignette.addColorStop(0.6, hexToRgba(MAROON, 0.55));
  vignette.addColorStop(1, hexToRgba(MAROON, 0.95));
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // توهّج ذهبي خفيف خلف صورة المستخدم.
  const glow = ctx.createRadialGradient(210, HEIGHT / 2, 10, 210, HEIGHT / 2, 220);
  glow.addColorStop(0, hexToRgba(GOLD, 0.2));
  glow.addColorStop(1, hexToRgba(GOLD, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 460, HEIGHT);
}

/** صورة المستخدم داخل مربع بزوايا دائرية قليلاً وإطار ذهبي. */
function drawPortrait(ctx, img) {
  const size = 250;
  const x = 85;
  const y = (HEIGHT - size) / 2;
  const radius = 14;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.clip();
  if (img) {
    // قصّ مربّع من مركز الصورة حتى لا تتشوّه.
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, x, y, size, size);
  } else {
    ctx.fillStyle = "#241a1c";
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.shadowColor = hexToRgba(GOLD, 0.55);
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, radius);
  ctx.stroke();
  ctx.restore();

  // إطار داخلي رفيع لمزيد من الفخامة.
  ctx.save();
  ctx.strokeStyle = hexToRgba(GOLD_BRIGHT, 0.45);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 8, size - 16, size - 16, radius - 4);
  ctx.stroke();
  ctx.restore();
}

/**
 * يرسم بطاقة الدخول/الخروج بأسلوب «العرّاب».
 * @returns {Promise<Buffer>} صورة PNG جاهزة للإرسال.
 */
export async function renderGodfatherCard({ avatar, displayName, isJoin, memberCount, groupName }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  drawBackground(ctx);
  drawPortrait(ctx, avatar);

  const left = 372;
  const right = 752;
  const maxWidth = right - left;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // «La Famiglia» بالذهبي اللامع.
  ctx.save();
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.shadowColor = hexToRgba(GOLD, 0.6);
  ctx.shadowBlur = 12;
  ctx.font = `34px "${SERIF}"`;
  ctx.fillText("La Famiglia", left, 138);
  ctx.restore();

  drawLine(ctx, 160, left, right, GOLD, 0.85);

  // اسم المستخدم أو رقمه بالعاجي.
  ctx.fillStyle = IVORY;
  ctx.font = `40px "${SERIF}"`;
  ctx.fillText(fitText(ctx, displayName, maxWidth, `40px "${SERIF}"`), left, 232);

  // سطر الحالة: ترحيب أو وداع.
  const status = isJoin ? "Welcome to the Family" : "You broke my heart";
  ctx.fillStyle = isJoin ? GOLD : MAROON_LIGHT;
  ctx.font = `italic 26px "${SERIF}"`;
  ctx.fillText(fitText(ctx, status, maxWidth, `italic 26px "${SERIF}"`), left, 286);

  drawLine(ctx, 316, left, right, GOLD, 0.85);

  // عدد الأعضاء في الزاوية السفلية.
  if (Number.isFinite(memberCount)) {
    ctx.fillStyle = GOLD;
    ctx.font = `24px "${SERIF}"`;
    const label = `Members: ${memberCount}`;
    ctx.fillText(label, left, 372);
    const w = ctx.measureText(label).width;
    ctx.fillText("👥", left + w + 12, 372);
  }

  if (groupName) {
    ctx.fillStyle = hexToRgba(IVORY, 0.55);
    ctx.font = `18px "${SERIF}"`;
    ctx.fillText(fitText(ctx, groupName, maxWidth, `18px "${SERIF}"`), left, 410);
  }

  return canvas.toBuffer("image/png");
}

/** صورة المستخدم إن وُجدت، وإلا صورة من global.botImages، وإلا null. */
async function resolveAvatar(sock, jid) {
  const urls = [];
  try {
    const url = await sock.profilePictureUrl(jid, "image");
    if (url) urls.push(url);
  } catch {
    // لا صورة شخصية: ننتقل إلى صور البوت.
  }
  if (Array.isArray(global.botImages) && global.botImages.length) {
    const pick = global.botImages[Math.floor(Math.random() * global.botImages.length)];
    if (pick) urls.push(pick);
  }

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      return await loadImage(Buffer.from(await res.arrayBuffer()));
    } catch {
      // جرّب المصدر التالي.
    }
  }
  return null;
}

/** عدد الأعضاء الحالي، أو undefined إن تعذّرت القراءة. */
async function resolveMemberCount(sock, groupJid) {
  try {
    const meta = await sock.groupMetadata(groupJid);
    return meta?.participants?.length;
  } catch {
    return undefined;
  }
}

function cleanJid(jid = "") {
  const at = jid.lastIndexOf("@");
  if (at === -1) return jid.split(":")[0];
  return `${jid.slice(0, at).split(":")[0]}@${jid.slice(at + 1)}`;
}

/** الاسم المعروض: الاسم الممرّر إن وُجد، وإلا الرقم المجرّد. */
function displayNameOf(jid, pushName) {
  const num = cleanJid(jid).split("@")[0];
  const stored = db.getPushName?.(num);
  return String(pushName || stored || num);
}

/**
 * بعض إصدارات baileys ترسل المشارك نصاً وبعضها كائناً يحمل id وpushName،
 * فنوحّد الشكل قبل المعالجة.
 */
function normalizeParticipants(participants) {
  const out = [];
  for (const p of participants || []) {
    if (!p) continue;
    const jid = typeof p === "string" ? p : p.id;
    if (!jid) continue;
    out.push({ jid, pushName: typeof p === "string" ? null : p.pushName });
  }
  return out;
}

export default {
  name: "ترحيب-وداع",
  flag: "welcome",

  async onJoin({ sock, groupJid, participants, botLabel }) {
    const memberCount = await resolveMemberCount(sock, groupJid);

    let groupName = "";
    try {
      const meta = await sock.groupMetadata(groupJid);
      groupName = meta?.subject || "";
    } catch {
      groupName = "";
    }

    for (const { jid, pushName } of normalizeParticipants(participants)) {
      const num = cleanJid(jid).split("@")[0];
      try {
        db.getUser(jid);
        const avatar = await resolveAvatar(sock, jid);
        const buffer = await renderGodfatherCard({
          avatar,
          displayName: displayNameOf(jid, pushName),
          isJoin: true,
          memberCount,
          groupName,
        });
        await sock.sendMessage(groupJid, {
          image: buffer,
          caption: `🤵 أهلاً بك في العائلة، @${num}`,
          mentions: [jid],
        });
      } catch (e) {
        log.error(`[${botLabel}] الترحيب: ${e.message}`);
        try {
          await sock.sendMessage(groupJid, {
            text: `👋 أهلاً وسهلاً @${num} في المجموعة!`,
            mentions: [jid],
          });
        } catch (inner) {
          log.error(`[${botLabel}] الترحيب (نص بديل): ${inner.message}`);
        }
      }
    }
  },

  async onLeave({ sock, groupJid, participants, botLabel }) {
    const memberCount = await resolveMemberCount(sock, groupJid);

    for (const { jid, pushName } of normalizeParticipants(participants)) {
      const num = cleanJid(jid).split("@")[0];
      try {
        const avatar = await resolveAvatar(sock, jid);
        const buffer = await renderGodfatherCard({
          avatar,
          displayName: displayNameOf(jid, pushName),
          isJoin: false,
          memberCount,
          groupName: "",
        });
        await sock.sendMessage(groupJid, {
          image: buffer,
          caption: `🚪 وداعاً @${num}`,
          mentions: [jid],
        });
      } catch (e) {
        log.error(`[${botLabel}] الوداع: ${e.message}`);
        try {
          await sock.sendMessage(groupJid, {
            text: `👋 وداعاً @${num} 👋`,
            mentions: [jid],
          });
        } catch (inner) {
          log.error(`[${botLabel}] الوداع (نص بديل): ${inner.message}`);
        }
      }
    }
  },
};
