import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { log } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(__dirname, "../assets");

const FONT_PATH = path.join(ASSETS, "fonts/Tajawal-ExtraBold.ttf");
const FALLBACK_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const DEFAULT_IMAGE = path.join(ASSETS, "monsters/حارس-الظلام.jpg");

let fontFamily = null;
try {
  if (GlobalFonts.registerFromPath(FONT_PATH, "RaidFont")) fontFamily = "RaidFont";
  else if (GlobalFonts.registerFromPath(FALLBACK_FONT, "RaidFont")) fontFamily = "RaidFont";
} catch (e) {
  log.warn(`تعذّر تحميل خط الغارة: ${e.message}`);
}
if (!fontFamily) fontFamily = "sans-serif";

const imageCache = new Map();
const bannerCache = new Map();

async function loadCached(file) {
  if (!imageCache.has(file)) imageCache.set(file, await loadImage(fs.readFileSync(file)));
  return imageCache.get(file);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function glowText(ctx, text, x, y, { size, color, glow, blur = 0 }) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold ${size}px "${fontFamily}"`;
  ctx.shadowColor = glow || color;
  ctx.shadowBlur = blur;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  if (blur) {
    ctx.shadowBlur = blur / 2;
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/**
 * لافتة الغارة: صورة الوحش مع اسمه وعنوان حماسي.
 * تُرسم مرة لكل وحش وتُحفظ في الذاكرة.
 */
export async function renderRaidBanner({ name, imagePath = DEFAULT_IMAGE }) {
  if (bannerCache.has(name)) return bannerCache.get(name);

  const img = await loadCached(imagePath);
  const W = img.width;
  const H = img.height;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(img, 0, 0, W, H);

  const bottom = ctx.createLinearGradient(0, H * 0.42, 0, H);
  bottom.addColorStop(0, "rgba(0,0,0,0)");
  bottom.addColorStop(0.55, "rgba(0,0,0,0.55)");
  bottom.addColorStop(1, "rgba(0,0,0,0.95)");
  ctx.fillStyle = bottom;
  ctx.fillRect(0, H * 0.42, W, H * 0.58);

  const top = ctx.createLinearGradient(0, 0, 0, H * 0.22);
  top.addColorStop(0, "rgba(0,0,0,0.72)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.22);

  const badgeW = 300;
  const badgeH = 76;
  const badgeX = (W - badgeW) / 2;
  const badgeY = 54;
  const badgeFill = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
  badgeFill.addColorStop(0, "#8f0d0d");
  badgeFill.addColorStop(0.5, "#d81f1f");
  badgeFill.addColorStop(1, "#8f0d0d");
  ctx.save();
  ctx.shadowColor = "rgba(220,20,20,0.75)";
  ctx.shadowBlur = 34;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 16);
  ctx.fillStyle = badgeFill;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,210,210,0.75)";
  ctx.lineWidth = 2;
  roundRect(ctx, badgeX + 7, badgeY + 7, badgeW - 14, badgeH - 14, 12);
  ctx.stroke();
  ctx.restore();

  glowText(ctx, "غارة", W / 2, badgeY + 56, {
    size: 44,
    color: "#fff5f5",
    glow: "rgba(255,60,60,0.9)",
    blur: 18,
  });

  const nameY = H - 190;
  glowText(ctx, name, W / 2, nameY, {
    size: 86,
    color: "#f7f2f2",
    glow: "rgba(190,20,20,0.95)",
    blur: 46,
  });

  const subY = nameY + 62;
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 34px "${fontFamily}"`;
  ctx.fillStyle = "#ff8a8a";
  ctx.fillText("يجتاح المجموعة الآن", W / 2, subY);
  ctx.restore();

  const lineY = subY + 34;
  const lineW = 250;
  const lineGrad = ctx.createLinearGradient(W / 2 - lineW, 0, W / 2 + lineW, 0);
  lineGrad.addColorStop(0, "rgba(220,40,40,0)");
  lineGrad.addColorStop(0.5, "rgba(220,40,40,0.95)");
  lineGrad.addColorStop(1, "rgba(220,40,40,0)");
  ctx.fillStyle = lineGrad;
  ctx.fillRect(W / 2 - lineW, lineY, lineW * 2, 3);

  ctx.save();
  ctx.textAlign = "center";
  ctx.font = `bold 32px "${fontFamily}"`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("أرسل  هجوم  للضرب", W / 2, H - 52);
  ctx.restore();

  const buffer = canvas.toBuffer("image/jpeg", 84);
  bannerCache.set(name, buffer);
  return buffer;
}
