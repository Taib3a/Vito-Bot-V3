import chalk from "chalk";
import config from "../config.js";

const { botName } = config;

const B = chalk.blue;
const BB = chalk.blue.bold;
const R = chalk.red;
const RB = chalk.red.bold;
const RG = chalk.red.bgRed;
const DIM = chalk.dim;
const W = chalk.white;
const Y = chalk.yellow;
const G = chalk.green;
const GB = chalk.green.bold;
const C = chalk.cyan;

function pad(str, len) {
  const visible = String(str).replace(/\u001b\[[0-9;]*m/g, "");
  return String(str) + " ".repeat(Math.max(0, len - visible.length));
}

function strip(str) {
  return String(str).replace(/\u001b\[[0-9;]*m/g, "");
}

function boxContent(width, label, value) {
  const labelStr = ` ${label}: `;
  const remaining = width - strip(labelStr).length - strip(value).length - 1;
  return B("║") + W(labelStr) + value + " ".repeat(Math.max(0, remaining)) + B("║");
}

function makeBox(width) {
  return {
    top: B("╔" + "═".repeat(width) + "╗"),
    bottom: B("╚" + "═".repeat(width) + "╝"),
    empty: B("║") + " ".repeat(width) + B("║"),
  };
}

function ts() {
  return new Date().toLocaleTimeString("en-GB");
}

export async function printBanner() {
  const width = 46;
  const { top, bottom, empty } = makeBox(width);
  console.log();
  console.log(top);
  console.log(empty);
  const nameLine = ` ${botName} `;
  const padLen = Math.floor((width - strip(nameLine).length) / 2);
  console.log(B("║") + " ".repeat(padLen) + BB(nameLine) + " ".repeat(width - padLen - strip(nameLine).length) + B("║"));
  console.log(empty);
  const subLine = " WhatsApp Bot System V3 ";
  const subPad = Math.floor((width - subLine.length) / 2);
  console.log(B("║") + " ".repeat(subPad) + DIM(subLine) + " ".repeat(width - subPad - subLine.length) + B("║"));
  console.log(empty);
  console.log(bottom);
  console.log();
}

const tag = {
  info: B(" INFO "),
  ok: G("  OK  "),
  warn: Y(" WARN "),
  error: R(" ERROR "),
  conn: B(" CONN "),
  bot: W(" BOT  "),
};

export const log = {
  info: (msg) => console.log(B("╭") + tag.info + B("─") + " " + DIM(`[${ts()}]`) + " " + W(msg)),
  ok: (msg) => console.log(B("╭") + tag.ok + B("─") + " " + DIM(`[${ts()}]`) + " " + G(msg)),
  warn: (msg) => console.log(B("╭") + tag.warn + B("─") + " " + DIM(`[${ts()}]`) + " " + Y(msg)),
  error: (msg, file, stack) => {
    const width = 46;
    console.log();
    console.log(R("╔" + "═".repeat(width) + "╗"));
    console.log(R("║") + " " + RB("ERROR DETECTED") + " ".repeat(width - 15) + R("║"));
    console.log(R("║") + " ".repeat(width) + R("║"));
    const t = ts();
    console.log(R("║") + W(" الوقت: ") + Y(t) + " ".repeat(Math.max(0, width - 9 - t.length)) + R("║"));
    if (file) {
      const f = String(file).slice(0, width - 10);
      console.log(R("║") + W(" الملف: ") + Y(f) + " ".repeat(Math.max(0, width - 9 - strip(f).length)) + R("║"));
    }
    const m = String(msg ?? "").slice(0, width - 10);
    console.log(R("║") + W(" الخطأ: ") + R(m) + " ".repeat(Math.max(0, width - 9 - strip(m).length)) + R("║"));
    if (stack) {
      console.log(R("║") + " ".repeat(width) + R("║"));
      for (const line of String(stack).split("\n").slice(1, 4)) {
        const d = line.trim().slice(0, width - 3);
        console.log(R("║") + DIM(" " + d) + " ".repeat(Math.max(0, width - 2 - strip(d).length)) + R("║"));
      }
    }
    console.log(R("╚" + "═".repeat(width) + "╝"));
    console.log();
  },
  conn: (msg) => console.log(B("╭") + tag.conn + B("─") + " " + DIM(`[${ts()}]`) + " " + C(msg)),
  bot: (msg) => console.log(B("╭") + tag.bot + B("─") + " " + DIM(`[${ts()}]`) + " " + W(msg)),

  message({ groupName, userName, messageType, content }) {
    const width = 46;
    const { top, bottom } = makeBox(width);
    const contentDisplay = content && content.length > 32 ? content.slice(0, 29) + "..." : (content || "");
    console.log();
    console.log(top);
    console.log(boxContent(width, "الوقت", Y(ts())));
    console.log(boxContent(width, "المجموعة", G(groupName || "خاص")));
    console.log(boxContent(width, "المرسل", W(userName || "غير معروف")));
    console.log(boxContent(width, "النوع", W(messageType || "نص")));
    console.log(boxContent(width, "الرسالة", W(contentDisplay)));
    console.log(bottom);
  },

  pairingCode(code) {
    const pretty = String(code || "").match(/.{1,4}/g)?.join("-") ?? String(code || "");
    const width = 46;
    const center = (raw, colored) => {
      const p = Math.max(0, width - strip(raw).length);
      const left = Math.floor(p / 2);
      return B("║") + " ".repeat(left) + (colored ?? raw) + " ".repeat(p - left) + B("║");
    };
    console.log();
    console.log(B("╔" + "═".repeat(width) + "╗"));
    console.log(center(""));
    console.log(center("رمز الاقتران (PAIRING CODE)", BB("رمز الاقتران (PAIRING CODE)")));
    console.log(center(pretty, GB(pretty)));
    console.log(center(""));
    console.log(B("╚" + "═".repeat(width) + "╝"));
  },

  cmdExec({ cmdName, sender, success, ms, botLabel = "MAIN" }) {
    const numero = sender?.split("@")[0] || sender || "";
    const estado = success ? GB("نجح") : RB("فشل");
    console.log(
      B(`▸ ${ts()}`) + DIM("  ·  ") + BB(botLabel) + "\n" +
      W("  الأمر    ") + BB(`.${cmdName}`) + "\n" +
      W("  المستخدم ") + G(`+${numero}`) + "\n" +
      W("  الحالة   ") + estado + DIM(`  ·  ${ms}ms`) + "\n" +
      DIM("  " + "·".repeat(50))
    );
  },
};

export default log;
