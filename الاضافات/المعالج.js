import { prefix } from "./الاعدادات.js";
import {
  isBanned,
  registerUser,
  registerGroup,
  isGroupActive,
  isGroupMuted,
  tryClaimMessage,
} from "./القاعدة.js";
import { loadCommands } from "./المحمل.js";
import { loadAntiFeatures } from "./محمل-المضاد.js";
import log from "./الكونسل.js";

let commands = null;
let antiFeatures = null;

async function getCommands() {
  if (!commands) {
    commands = await loadCommands();
  }
  return commands;
}

async function getAntiFeatures() {
  if (!antiFeatures) {
    antiFeatures = await loadAntiFeatures();
  }
  return antiFeatures;
}

async function runAntiFeatures(ctx) {
  const features = await getAntiFeatures();
  for (const feature of features) {
    if (typeof feature.onMessage === "function") {
      await feature.onMessage(ctx);
    }
  }
}

export async function runAntiFeaturesOnEvent(eventType, ctx) {
  const features = await getAntiFeatures();
  for (const feature of features) {
    const handler = feature[eventType];
    if (typeof handler === "function") {
      await handler(ctx);
    }
  }
}

function extractBody(msg) {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption ||
    ""
  );
}

export async function handleMessage(sock, msg) {
  try {
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const isGroup = msg.key.remoteJid?.endsWith("@g.us");
    const groupJid = isGroup ? msg.key.remoteJid : null;
    const fromMe = !!msg.key.fromMe;

    if (isGroup) {
      await registerGroup(groupJid);
    }

    await registerUser(senderJid, msg.pushName || "");

    if (await isBanned(senderJid)) return;

    // Anti-features only run in groups where the bot was explicitly activated.
    // Commands below are never gated, so .تفعيل itself always works.
    if (isGroup && !fromMe) {
      if (await isGroupActive(groupJid)) {
        if (await isGroupMuted(groupJid)) return;

        const claimed = await tryClaimMessage(msg.key.id, groupJid);
        if (!claimed) return;

        const ctx = { sock, msg, senderJid, isGroup, groupJid };
        await runAntiFeatures(ctx);
      }
    }

    const raw = extractBody(msg);
    if (!raw || !raw.startsWith(prefix)) return;

    const body = raw.slice(prefix.length).trim();
    if (!body) return;

    const [cmdName, ...args] = body.split(/\s+/);
    const cmds = await getCommands();
    const command = cmds[cmdName.toLowerCase()];
    if (!command) return;

    await command.execute({ sock, msg, args, senderJid, isGroup, fromMe, commands: cmds });
  } catch (err) {
    log.error(`Command error: ${err.message}`);
  }
}
