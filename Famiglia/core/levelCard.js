import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKGROUND_PATH = path.join(here, "..", "assets", "level-bg.jpg");

const GOLD_LIGHT = "#f7e7a1";
const GOLD = "#d4af37";
const GOLD_DARK = "#8a6d1f";

function registerFont(candidates, family) {
  for (const p of candidates) {
    try {
      if (GlobalFonts.registerFromPath(p, family)) return family;
    } catch {}
  }
  return "sans-serif";
}

const FONT_BOLD = registerFont(["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"], "LevelBold");
const FONT_REGULAR = registerFont(["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"], "LevelRegular");

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, h / 2, w / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function goldGradient(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(0.5, GOLD);
  g.addColorStop(1, GOLD_DARK);
  return g;
}

/** إطار ذهبي مزدوج يحيط بالبطاقة كلها. */
function drawOuterFrame(ctx, w, h) {
  ctx.strokeStyle = goldGradient(ctx, 0, 0, w, h);
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(212, 175, 55, 0.6)";
  ctx.strokeRect(36, 36, w - 72, h - 72);
}

/** لوحة المستوى: إطار ذهبي بداخله رقم المستوى وشريط الخبرة. */
function drawLevelPanel(ctx, panel) {
  const { x, y, w, h } = panel;

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
  ctx.shadowBlur = 26;
  ctx.fillStyle = "rgba(12, 6, 3, 0.72)";
  roundRect(ctx, x, y, w, h, 26);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = goldGradient(ctx, x, y, x + w, y + h);
  ctx.lineWidth = 6;
  roundRect(ctx, x, y, w, h, 26);
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(247, 231, 161, 0.5)";
  roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 18);
  ctx.stroke();
}

function drawAvatar(ctx, avatar, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  if (avatar) {
    ctx.clip();
    const side = Math.min(avatar.width, avatar.height);
    ctx.drawImage(
      avatar,
      (avatar.width - side) / 2,
      (avatar.height - side) / 2,
      side,
      side,
      cx - radius,
      cy - radius,
      radius * 2,
      radius * 2,
    );
  } else {
    ctx.fillStyle = "rgba(26, 13, 6, 0.92)";
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = goldGradient(ctx, cx - radius, cy - radius, cx + radius, cy + radius);
  ctx.lineWidth = 8;
  ctx.stroke();
  ctx.restore();
}

function cleanJid(jid = "") {
  const at = jid.lastIndexOf("@");
  if (at === -1) return jid.split(":")[0];
  return `${jid.slice(0, at).split(":")[0]}@${jid.slice(at + 1)}`;
}

/** يجلب الصورة الرمزية للعضو، ويعيد null إن تعذّر ذلك. */
export async function resolveAvatar(sock, jid) {
  try {
    const url = await sock.profilePictureUrl(cleanJid(jid), "image");
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await loadImage(Buffer.from(await res.arrayBuffer()));
  } catch {
    return null;
  }
}

export async function renderLevelCard({ avatar, displayName, level, xp, currentFloor, nextFloor, missing }) {
  const background = await loadImage(await readFile(BACKGROUND_PATH));
  const w = background.width;
  const h = background.height;

  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(background, 0, 0, w, h);

  // تعتيم خفيف للشريط السفلي لإبراز الصورة والمستوى فوقه.
  const shade = ctx.createLinearGradient(0, h * 0.55, 0, h);
  shade.addColorStop(0, "rgba(0, 0, 0, 0)");
  shade.addColorStop(1, "rgba(0, 0, 0, 0.5)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);

  drawOuterFrame(ctx, w, h);

  const cy = Math.round(h * 0.70);

  // يسار الإطار: صورة المستخدم في دائرة ذهبية.
  const avatarRadius = Math.round(h * 0.13);
  const avatarX = Math.round(w * 0.24);
  drawAvatar(ctx, avatar, avatarX, cy, avatarRadius);

  if (displayName) {
    const name = displayName.length > 18 ? `${displayName.slice(0, 18)}…` : displayName;
    ctx.textAlign = "center";
    ctx.font = `bold 30px "${FONT_BOLD}"`;
    ctx.fillStyle = "#f3ead8";
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 12;
    ctx.fillText(name, avatarX, cy + avatarRadius + 44);
    ctx.shadowBlur = 0;
  }

  // يمين الإطار: لوحة المستوى برقم ذهبي كبير.
  const panelW = Math.round(w * 0.40);
  const panelH = Math.round(h * 0.40);
  const panelX = Math.round(w * 0.54);
  const panelY = cy - Math.round(panelH / 2);
  drawLevelPanel(ctx, { x: panelX, y: panelY, w: panelW, h: panelH });

  const cx = panelX + panelW / 2;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 12;

  ctx.font = `22px "${FONT_REGULAR}"`;
  ctx.fillStyle = "rgba(232, 224, 207, 0.8)";
  ctx.fillText("المستوى", cx, panelY + 56);

  ctx.font = `bold 92px "${FONT_BOLD}"`;
  ctx.fillStyle = goldGradient(ctx, panelX, panelY, panelX + panelW, panelY + panelH);
  ctx.fillText(String(level), cx, panelY + 150);

  const barW = panelW - 90;
  const barH = 20;
  const barX = panelX + 45;
  const barY = panelY + panelH - 104;

  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.fill();

  const ratio = nextFloor > currentFloor
    ? Math.min(1, Math.max(0, (xp - currentFloor) / (nextFloor - currentFloor)))
    : 0;
  if (ratio > 0) {
    ctx.fillStyle = goldGradient(ctx, barX, 0, barX + barW, 0);
    roundRect(ctx, barX, barY, Math.max(barH, barW * ratio), barH, barH / 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(212, 175, 55, 0.5)";
  ctx.lineWidth = 2;
  roundRect(ctx, barX, barY, barW, barH, barH / 2);
  ctx.stroke();

  ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
  ctx.shadowBlur = 10;
  ctx.font = `24px "${FONT_REGULAR}"`;
  ctx.fillStyle = "#e8e0cf";
  ctx.fillText(`${xp} / ${nextFloor}`, cx, barY + 54);
  ctx.font = `20px "${FONT_REGULAR}"`;
  ctx.fillStyle = "rgba(230, 220, 200, 0.72)";
  ctx.fillText(`المتبقي ${missing} خبرة`, cx, barY + 86);

  return canvas.toBuffer("image/jpeg", 92);
}
