import chalk from "chalk";
import { botName } from "./الاعدادات.js";

const B = chalk.blue;
const BB = chalk.blue.bold;
const BG = chalk.blue.bgBlue;
const R = chalk.red;
const RB = chalk.red.bold;
const RG = chalk.red.bgRed;
const DIM = chalk.dim;
const W = chalk.white;
const Y = chalk.yellow;
const G = chalk.green;

function pad(str, len, char = " ") {
  const visible = str.replace(/\u001b\[[0-9;]*m/g, "");
  return str + char.repeat(Math.max(0, len - visible.length));
}

function boxLine(width, left, fill, right) {
  return left + fill.repeat(width) + right;
}

function boxContent(width, label, value) {
  const labelStr = ` ${label}: `;
  const remaining = width - labelStr.length - 1;
  return chalk.blue("║") + W(labelStr) + value + " ".repeat(Math.max(0, remaining)) + chalk.blue("║");
}

function makeBox(width) {
  const top = chalk.blue("╔" + "═".repeat(width) + "╗");
  const bottom = chalk.blue("╚" + "═".repeat(width) + "╝");
  const empty = chalk.blue("║") + " ".repeat(width) + chalk.blue("║");
  return { top, bottom, empty };
}

export default {
  banner() {
    const width = 46;
    const { top, bottom, empty } = makeBox(width);
    console.log();
    console.log(top);
    console.log(empty);
    const nameLine = " " + botName + " ";
    const padLen = Math.floor((width - nameLine.length) / 2);
    console.log(chalk.blue("║") + " ".repeat(padLen) + BB(nameLine) + " ".repeat(width - padLen - nameLine.length) + chalk.blue("║"));
    console.log(empty);
    const subLine = " WhatsApp Bot System V3 ";
    const subPad = Math.floor((width - subLine.length) / 2);
    console.log(chalk.blue("║") + " ".repeat(subPad) + DIM(subLine) + " ".repeat(width - subPad - subLine.length) + chalk.blue("║"));
    console.log(empty);
    console.log(bottom);
    console.log();
  },

  name() {
    this.banner();
  },

  message({ time, groupName, userName, messageType, content }) {
    const width = 46;
    const { top, bottom, empty } = makeBox(width);
    const ts = time || new Date().toLocaleTimeString("en-GB");
    const timeLine = boxContent(width, "Time", Y(ts));
    const groupLine = boxContent(width, "Group", G(groupName || "Private"));
    const userLine = boxContent(width, "User", W(userName || "Unknown"));
    const typeLine = boxContent(width, "Type", W(messageType || "text"));
    const contentDisplay = content && content.length > 35 ? content.slice(0, 32) + "..." : (content || "");
    const contentLine = boxContent(width, "Message", W(contentDisplay));

    console.log();
    console.log(top);
    console.log(timeLine);
    console.log(groupLine);
    console.log(userLine);
    console.log(typeLine);
    console.log(contentLine);
    console.log(bottom);
  },

  info(msg) {
    const ts = new Date().toLocaleTimeString("en-GB");
    console.log(chalk.blue("╭") + BB(" INFO ") + chalk.blue("─") + " " + DIM(`[${ts}]`) + " " + W(msg));
  },

  success(msg) {
    const ts = new Date().toLocaleTimeString("en-GB");
    console.log(chalk.blue("╭") + G(" OK ") + chalk.blue("─") + " " + DIM(`[${ts}]`) + " " + G(msg));
  },

  warn(msg) {
    const ts = new Date().toLocaleTimeString("en-GB");
    console.log(chalk.blue("╭") + Y(" WARN ") + chalk.blue("─") + " " + DIM(`[${ts}]`) + " " + Y(msg));
  },

  error(msg, file, stack) {
    const ts = new Date().toLocaleTimeString("en-GB");
    const width = 46;
    const top = R("╔" + "═".repeat(width) + "╗");
    const bottom = R("╚" + "═".repeat(width) + "╝");
    const empty = R("║") + " ".repeat(width) + R("║");
    const titleLine = R("║") + " " + RB("ERROR DETECTED") + " ".repeat(width - 15) + R("║");
    const timeLine = R("║") + W(" Time: ") + Y(ts) + " ".repeat(Math.max(0, width - 8 - ts.length - 1)) + R("║");
    const fileDisplay = file || "unknown";
    const fileLine = R("║") + W(" File: ") + Y(fileDisplay) + " ".repeat(Math.max(0, width - 8 - fileDisplay.length - 1)) + R("║");
    const msgDisplay = msg && msg.length > 38 ? msg.slice(0, 35) + "..." : (msg || "");
    const msgLine = R("║") + W(" Error: ") + R(msgDisplay) + " ".repeat(Math.max(0, width - 9 - msgDisplay.length - 1)) + R("║");

    console.log();
    console.log(top);
    console.log(titleLine);
    console.log(empty);
    console.log(timeLine);
    console.log(fileLine);
    console.log(msgLine);

    if (stack) {
      const stackLines = stack.split("\n").slice(0, 4);
      console.log(empty);
      for (const line of stackLines) {
        const display = line.trim().slice(0, width - 2);
        console.log(R("║") + DIM(" " + display) + " ".repeat(Math.max(0, width - display.length - 1)) + R("║"));
      }
    }

    console.log(empty);
    console.log(bottom);
  },

  connection(status, details) {
    const ts = new Date().toLocaleTimeString("en-GB");
    const statusColors = {
      connecting: Y("CONNECTING"),
      open: G("CONNECTED"),
      close: R("DISCONNECTED"),
      qr: B("QR READY"),
    };
    const label = statusColors[status] || W(status.toUpperCase());
    console.log(chalk.blue("╭") + BB(" CONN ") + chalk.blue("─") + " " + DIM(`[${ts}]`) + " " + label + (details ? " " + DIM(details) : ""));
  },
};
