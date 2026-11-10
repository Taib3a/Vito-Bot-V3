import chalk from "chalk";
import config from "./settings.js";

const { botName } = config;

// ═══════════════════════════════════════════════════════════
//  لوحة الألوان — مستوحاة من تنسيق YUTA (بنفسجي/ماجنتا/سماوي)
//  مع إطار أزرق للصندوق كما هو مطلوب.
// ═══════════════════════════════════════════════════════════
const C_PURPLE = "#7B2FBE";
const C_MAGENTA = "#E040FB";
const C_CYAN = "#00E5FF";

const B = chalk.hex("#2979FF"); // إطار الصندوق (أزرق)
const BB = chalk.hex("#2979FF").bold;
const W = chalk.white;
const DIM = chalk.dim;
const Y = chalk.yellow;
const YB = chalk.yellowBright;
const G = chalk.green;
const GB = chalk.greenBright;
const R = chalk.red;
const RB = chalk.red.bold;
const C = chalk.cyan;
const MAG = chalk.hex(C_MAGENTA);
const CY = chalk.hex(C_CYAN);
const PUR = chalk.hex(C_PURPLE);

const WIDTH = 56; // العرض الداخلي للصندوق
const LABEL_W = 11; // عرض عمود العنوان (لمحاذاة الصفوف)

// ═══════════════════════════════════════════════════════════
//  أدوات حساب العرض المرئي (تتجاهل أكواد الألوان وتحسب الإيموجي)
// ═══════════════════════════════════════════════════════════
const ANSI = /\u001b\[[0-9;]*m/g;

function stripAnsi(s) {
  return String(s ?? "").replace(ANSI, "");
}

function charWidth(cp) {
  if (cp === 0x200d) return 0; // ZWJ
  if (cp >= 0xfe00 && cp <= 0xfe0f) return 0; // محددات التنويع
  if (cp >= 0x1f000) return 2; // الإيموجي الحديثة
  if (cp >= 0x2600 && cp <= 0x27bf) return 2; // رموز وإيموجي
  if (cp >= 0x2b00 && cp <= 0x2bff) return 2;
  if (cp >= 0x231a && cp <= 0x231b) return 2;
  if (cp >= 0x23e9 && cp <= 0x23fa) return 2;
  if (cp >= 0x25fd && cp <= 0x25fe) return 2;
  if (cp >= 0x2648 && cp <= 0x2653) return 2;
  if (cp === 0x267f || cp === 0x2693) return 2;
  if (cp >= 0x26aa && cp <= 0x26ab) return 2;
  if (cp >= 0x26bd && cp <= 0x26be) return 2;
  if (cp >= 0x26c4 && cp <= 0x26c5) return 2;
  if (cp === 0x26ce || cp === 0x26d4 || cp === 0x26ea) return 2;
  if (cp >= 0x26f2 && cp <= 0x26f3) return 2;
  if (cp === 0x26f5 || cp === 0x26fa || cp === 0x26fd) return 2;
  if (cp === 0x2705 || cp === 0x2728) return 2;
  if (cp >= 0x270a && cp <= 0x270b) return 2;
  if (cp === 0x274c || cp === 0x274e) return 2;
  if (cp >= 0x2753 && cp <= 0x2755) return 2;
  if (cp === 0x2757) return 2;
  if (cp >= 0x2795 && cp <= 0x2797) return 2;
  if (cp === 0x27b0 || cp === 0x27bf) return 2;
  if (cp >= 0x2b1b && cp <= 0x2b1c) return 2;
  if (cp === 0x2b50 || cp === 0x2b55) return 2;
  // الحروف العريضة (CJK وغيرها)
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0x303e) ||
    (cp >= 0x3041 && cp <= 0x33ff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xa000 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

function visWidth(s) {
  let w = 0;
  for (const ch of stripAnsi(s)) w += charWidth(ch.codePointAt(0));
  return w;
}

function padEndVis(s, width) {
  const gap = width - visWidth(s);
  return gap > 0 ? s + " ".repeat(gap) : s;
}

/** يقتطع النص ليدخل في العرض المطلوب (بحساب العرض المرئي). */
function fit(s, width) {
  const raw = String(s ?? "");
  let out = "";
  let w = 0;
  for (const ch of raw) {
    const cw = charWidth(ch.codePointAt(0));
    if (w + cw > width) return out + "…";
    out += ch;
    w += cw;
  }
  return out;
}

/** يوحّد النص في سطر واحد حتى لا يكسر الصندوق. */
function oneLine(s) {
  return String(s ?? "")
    .replace(/\s*\n\s*/g, " ⏎ ")
    .trim();
}

function centerVis(text, width) {
  const len = visWidth(text);
  const left = Math.max(0, Math.floor((width - len) / 2));
  const right = Math.max(0, width - len - left);
  return " ".repeat(left) + text + " ".repeat(right);
}

function ts() {
  return new Date().toLocaleTimeString("en-GB");
}

// ═══════════════════════════════════════════════════════════
//  الشعار (بانر) — نفس صندوق الألوان
// ═══════════════════════════════════════════════════════════
export async function printBanner() {
  const top = BB("╔" + "═".repeat(WIDTH) + "╗");
  const bottom = BB("╚" + "═".repeat(WIDTH) + "╝");
  const empty = B("║") + " ".repeat(WIDTH) + B("║");
  const row = (text, colored) => B("║") + centerVis(colored ?? text, WIDTH) + B("║");

  console.log();
  console.log(top);
  console.log(empty);
  console.log(row(botName, PUR(botName)));
  console.log(empty);
  console.log(row("WhatsApp Bot System V3", DIM("WhatsApp Bot System V3")));
  console.log(empty);
  console.log(bottom);
  console.log();
}

// ═══════════════════════════════════════════════════════════
//  وسوم الحالة (بنفس ألوان YUTA)
// ═══════════════════════════════════════════════════════════
const tag = {
  info: chalk.bgHex(C_PURPLE).white.bold("  INFO  "),
  ok: chalk.bgHex("#00C853").white.bold("   OK   "),
  warn: chalk.bgHex("#FF6F00").white.bold("  WARN  "),
  error: chalk.bgHex("#D50000").white.bold(" ERROR  "),
  conn: chalk.bgHex("#1A237E").white.bold("  CONN  "),
  bot: chalk.bgHex("#263238").white.bold("  BOT   "),
};

export const log = {
  info: (msg) => console.log(`${DIM(`[${ts()}]`)} ${tag.info}  ${W(msg)}`),
  ok: (msg) => console.log(`${DIM(`[${ts()}]`)} ${tag.ok}  ${G(msg)}`),
  warn: (msg) => console.log(`${DIM(`[${ts()}]`)} ${tag.warn}  ${Y(msg)}`),
  conn: (msg) => console.log(`${DIM(`[${ts()}]`)} ${tag.conn}  ${C(msg)}`),
  bot: (msg) => console.log(`${DIM(`[${ts()}]`)} ${tag.bot}  ${chalk.hex("#B0BEC5")(msg)}`),

  error: (msg, file, stack) => {
    const line = (plain, colored) => {
      const val = fit(plain, WIDTH - 2);
      const spaces = Math.max(0, WIDTH - 1 - visWidth(val));
      return R("║") + " " + (colored ?? val) + " ".repeat(spaces) + R("║");
    };

    console.log();
    console.log(R("╔" + "═".repeat(WIDTH) + "╗"));
    console.log(
      R("║") + " " + RB("⚠ خطأ") + " ".repeat(Math.max(0, WIDTH - 1 - visWidth("⚠ خطأ"))) + R("║")
    );
    console.log(R("║") + " ".repeat(WIDTH) + R("║"));
    console.log(line(`الوقت: ${ts()}`, W("الوقت: ") + Y(ts())));
    if (file) console.log(line(`الملف: ${file}`, W("الملف: ") + Y(String(file))));
    console.log(line(`الخطأ: ${msg ?? ""}`, W("الخطأ: ") + R(String(msg ?? ""))));
    if (stack) {
      console.log(R("║") + " ".repeat(WIDTH) + R("║"));
      for (const l of String(stack).split("\n").slice(1, 4)) {
        const t = l.trim();
        console.log(line("  " + t, DIM("  " + fit(t, WIDTH - 6))));
      }
    }
    console.log(R("╚" + "═".repeat(WIDTH) + "╝"));
    console.log();
  },

  // ═════════════════════════════════════════════════════════
  //  صندوق الرسالة الواردة — الوحيد الذي يطبع الرسالة.
  //  الإطار أزرق، والشريط العلوي أحمر (SUB) أو أصفر (MAIN).
  // ═════════════════════════════════════════════════════════
  message({ groupName, userName, messageType, content, isGroup = false, isCmd = false, botLabel = "MAIN" }) {
    const isSub = /sub/i.test(String(botLabel));
    const tipoBot = isSub ? "SUB" : "MAIN";
    const barPaint = isSub ? chalk.bgRed.white.bold : chalk.bgYellow.black.bold;

    const rawUser = stripAnsi(String(userName ?? ""));
    const numero = rawUser.split("@")[0].split(":")[0] || "غير معروف";
    // إشارة + للأرقام فقط، أما الأسماء فتُعرض كما هي.
    const usuario = /^\+?\d+$/.test(numero) ? `+${numero}` : numero;
    const lugar = isGroup ? groupName || "مجموعة" : "دردشة خاصة";
    const tipo = isCmd ? "⚡ أمر" : messageType || "نص";
    const texto = content ? oneLine(content) : "(بلا نص)";

    const top = B("╔" + "═".repeat(WIDTH) + "╗");
    const mid = B("╠" + "═".repeat(WIDTH) + "╣");
    const bottom = B("╚" + "═".repeat(WIDTH) + "╝");

    const row = (label, value, color = (x) => x) => {
      const head = `  ${padEndVis(label, LABEL_W)} :: `;
      const avail = Math.max(1, WIDTH - visWidth(head));
      const val = fit(String(value ?? ""), avail);
      const spaces = Math.max(0, WIDTH - visWidth(head) - visWidth(val));
      return B("║") + DIM(head) + color(val) + " ".repeat(spaces) + B("║");
    };

    const bar = barPaint(centerVis(` ⚡ ${botName} │ ${tipoBot} ⚡ `, WIDTH));

    console.log();
    console.log(top);
    console.log(B("║") + bar + B("║"));
    console.log(mid);
    console.log(row("⏰ الوقت", ts(), Y));
    console.log(row("📱 المستخدم", usuario, GB));
    console.log(row("📝 النوع", tipo, CY));
    console.log(row("👥 المجموعة", lugar, YB));
    console.log(row("💬 الرسالة", texto, isCmd ? MAG : W));
    console.log(bottom);
  },

  pairingCode(code) {
    const pretty = String(code || "").match(/.{1,4}/g)?.join("-") ?? String(code || "");
    const center = (plain, colored) => B("║") + centerVis(colored ?? plain, WIDTH) + B("║");
    console.log();
    console.log(B("╔" + "═".repeat(WIDTH) + "╗"));
    console.log(center(""));
    console.log(center("رمز الاقتران (PAIRING CODE)", BB("رمز الاقتران (PAIRING CODE)")));
    console.log(center(pretty, GB(pretty)));
    console.log(center(""));
    console.log(B("╚" + "═".repeat(WIDTH) + "╝"));
  },

  cmdExec({ cmdName, sender, success, ms, botLabel = "MAIN" }) {
    const rawSender = stripAnsi(String(sender ?? "")).split("@")[0].split(":")[0] || String(sender ?? "");
    const usuario = /^\+?\d+$/.test(rawSender) ? `+${rawSender}` : rawSender;
    const estado = success ? GB("نجح") : RB("فشل");
    const etiqueta = /sub/i.test(String(botLabel)) ? RB(botLabel) : YB(botLabel);
    console.log(
      B(`▸ ${ts()}`) +
        DIM("  ·  ") +
        etiqueta +
        DIM("  ·  ") +
        MAG(`.${cmdName}`) +
        DIM("  ·  ") +
        G(usuario) +
        DIM("  ·  ") +
        estado +
        DIM(`  (${ms}ms)`)
    );
  },
};

export default log;
