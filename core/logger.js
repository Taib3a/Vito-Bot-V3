import chalk from "chalk";
import gradient from "gradient-string";
import figlet from "figlet";
import config from "../config.js";

const vito = gradient(["#7B2FBE", "#E040FB", "#00E5FF"]);
const separator = chalk.hex("#7B2FBE")("─".repeat(55));

export async function printBanner() {
  const art = await figlet.text("VITO", { font: "ANSI Shadow" });
  console.clear();
  console.log("\n" + vito(art));
  console.log(chalk.hex("#E040FB").bold(`        ⚡  ${config.botName}  ⚡`));
  console.log(chalk.hex("#00E5FF")("        ✦  WhatsApp Bot V3  ✦"));
  console.log(separator);
  console.log(chalk.white("        Powered by ") + chalk.hex("#E040FB").bold(config.author));
  console.log(separator + "\n");
}

const tag = {
  info: chalk.bgHex("#7B2FBE").white.bold("  INFO  "),
  ok: chalk.bgHex("#00C853").white.bold("   OK   "),
  warn: chalk.bgHex("#FF6F00").white.bold("  WARN  "),
  error: chalk.bgHex("#D50000").white.bold(" ERROR  "),
  conn: chalk.bgHex("#1A237E").white.bold("  CONN  "),
  bot: chalk.bgHex("#263238").white.bold("  BOT   "),
};

function ts() {
  return new Date().toLocaleTimeString("en-GB");
}

export const log = {
  info: (msg) => console.log(`${chalk.gray(`[${ts()}]`)} ${tag.info}  ${chalk.white(msg)}`),
  ok: (msg) => console.log(`${chalk.gray(`[${ts()}]`)} ${tag.ok}  ${chalk.greenBright(msg)}`),
  warn: (msg) => console.log(`${chalk.gray(`[${ts()}]`)} ${tag.warn}  ${chalk.yellow(msg)}`),
  error: (msg, file, stack) => {
    console.log(`${chalk.gray(`[${ts()}]`)} ${tag.error}  ${chalk.red(msg)}`);
    if (file) console.log(chalk.gray(`           ↳ ${file}`));
    if (stack) for (const l of String(stack).split("\n").slice(1, 4)) console.log(chalk.gray(`             ${l.trim()}`));
  },
  conn: (msg) => console.log(`${chalk.gray(`[${ts()}]`)} ${tag.conn}  ${chalk.cyan(msg)}`),
  bot: (msg) => console.log(`${chalk.gray(`[${ts()}]`)} ${tag.bot}  ${chalk.hex("#B0BEC5")(msg)}`),

  message() {},

  /**
   * Prints the pairing code in a box.
   *
   * The caller already regroups the code, so strip any hyphen before grouping
   * again — otherwise "DASN-ACF4" becomes "DASN--ACF-4".
   */
  pairingCode(code) {
    const clean = String(code || "").replace(/[^0-9A-Za-z]/g, "");
    const pretty = clean.match(/.{1,4}/g)?.join("-") || clean;
    const width = 31;
    const line = (text) => {
      const visible = text.replace(/\u001b\[[0-9;]*m/g, "");
      return " │ " + text + " ".repeat(Math.max(0, width - visible.length)) + "│";
    };
    console.log(
      "\n ┌" + "─".repeat(width) + "┐\n" +
      line(chalk.white("🔑 رمز الاقتران:")) + "\n" +
      line(chalk.greenBright.bold(pretty)) + "\n" +
      " └" + "─".repeat(width) + "┘\n"
    );
  },

  cmdExec({ cmdName, sender, success, ms, botLabel = "MAIN" }) {
    const numero = sender?.split("@")[0] || sender || "";
    const estado = success ? chalk.greenBright.bold("نجح") : chalk.red.bold("فشل");

    console.log(
      chalk.hex("#00E5FF")(`▸ ${ts()}`) + chalk.gray("  ·  ") + chalk.hex("#E040FB").bold(botLabel) + "\n" +
      chalk.white("  الأمر    ") + chalk.hex("#7B2FBE").bold(`.${cmdName}`) + "\n" +
      chalk.white("  المستخدم ") + chalk.greenBright(`+${numero}`) + "\n" +
      chalk.white("  الحالة   ") + estado + chalk.gray(`  ·  ${ms}ms`) + "\n" +
      chalk.gray("  " + "·".repeat(50))
    );
  },
};

export default log;
