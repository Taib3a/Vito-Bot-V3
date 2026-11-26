import { db } from "../database/db.js";
import { levelFromXp, grantXp } from "./xp.js";
import { log } from "./logger.js";

const RAID_MS = 3 * 60 * 1000;
const REST_MS = 60 * 60 * 1000;
const HIT_COOLDOWN_MS = 3 * 1000;
const BASE_HP = 2000;
const HP_PER_MEMBER = 400;
const CRIT_RATE = 0.15;
const MIN_DAMAGE = 120;
const MAX_DAMAGE = 260;
const REWARD_MIN = 500;
const REWARD_MAX = 1500;
const TOP_SHARE = 0.3;
const XP_MIN = 50;
const XP_MAX = 150;

const MONSTERS = [
  { name: "غول الكهف", emoji: "👹" },
  { name: "تنين الرمال", emoji: "🐉" },
  { name: "عفريت البئر", emoji: "👺" },
  { name: "حارس الظلام", emoji: "🗿" },
  { name: "أفعى الأطلال", emoji: "🐍" },
  { name: "شبح الواحة", emoji: "👻" },
];

const raids = new Map();
const rests = new Map();

const rnd = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const fmt = (n) => Math.floor(n).toLocaleString("en-US");
const numOf = (jid = "") => String(jid).split("@")[0].split(":")[0];

function maxHp(raid) {
  return BASE_HP + HP_PER_MEMBER * raid.participants.size;
}

function remainingHp(raid) {
  return Math.max(0, maxHp(raid) - raid.totalDamage);
}

function bar(remaining, total, width = 12) {
  const filled = Math.min(width, Math.round((remaining / total) * width));
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function ranking(raid) {
  return [...raid.damage.entries()]
    .map(([jid, dmg]) => ({ jid, dmg, name: raid.names.get(jid) || numOf(jid) }))
    .sort((a, b) => b.dmg - a.dmg);
}

const MEDALS = ["🥇", "🥈", "🥉"];

function statusText(raid, note, footer = "اكتب *.هجوم* للضرب") {
  const max = maxHp(raid);
  const rem = remainingHp(raid);
  const lines = [
    `${raid.monster.emoji} *${raid.monster.name}* يجتاح المجموعة!`,
    "",
    `🩸 الدم: *${fmt(rem)}* / ${fmt(max)} (${Math.round((rem / max) * 100)}%)`,
    bar(rem, max),
    `⏱️ بقي: ${clock(raid.endsAt - Date.now())}`,
    `⚔️ المقاتلون: ${raid.participants.size}`,
  ];

  if (note) lines.push("", note);

  const top = ranking(raid).slice(0, 3);
  if (top.length) {
    lines.push("", "🏅 *أشدّ الضاربين:*");
    top.forEach((entry, i) => lines.push(`${MEDALS[i]} ${entry.name} — ${fmt(entry.dmg)}`));
  }

  lines.push("", footer);
  return lines.join("\n");
}

async function editRaidMessage(sock, raid, text) {
  if (!raid.messageKey) return;
  try {
    await sock.sendMessage(raid.from, { text, edit: raid.messageKey });
  } catch (e) {
    log.warn(`تعذّر تحديث رسالة الغارة: ${e.message}`);
  }
}

function endRaid(raid) {
  raid.done = true;
  if (raid.timer) clearTimeout(raid.timer);
  raids.delete(raid.from);
  rests.set(raid.from, Date.now());
}

async function escapeRaid(raid, sock) {
  if (raid.done) return;
  endRaid(raid);
  const dealt = fmt(raid.totalDamage);
  const text = statusText(
    raid,
    "💨 *هرب الوحش* قبل أن تُسقطوه، ولا جوائز هذه المرة.",
    `⚔️ ضرركم الكلي: ${dealt}`
  );
  await editRaidMessage(sock, raid, text);
  log.info(`[غارة] هرب ${raid.monster.name} في ${raid.from} بضرر ${raid.totalDamage}`);
}

function award(raid) {
  const entries = ranking(raid);
  const pool = rnd(REWARD_MIN, REWARD_MAX);
  const base = Math.round(pool * (1 - TOP_SHARE));
  const topBonus = pool - base;
  const total = raid.totalDamage || 1;

  const rewards = entries.map((entry, i) => {
    const coins = Math.round((base * entry.dmg) / total) + (i === 0 ? topBonus : 0);
    const xp = rnd(XP_MIN, XP_MAX) + (i === 0 ? 50 : 0);

    const eco = db.getEco(entry.jid);
    db.setEco(entry.jid, { bolsillo: (eco.bolsillo || 0) + coins });
    grantXp(entry.jid, xp);

    return { ...entry, coins, xp };
  });

  const lines = [
    `🏆 *سقط ${raid.monster.name}!*`,
    "",
    `⚔️ الضرر الكلي: ${fmt(total)}`,
    `🩸 الدم: ${fmt(maxHp(raid))} / ${fmt(maxHp(raid))}`,
    "",
    "🎁 *الجوائز:*",
    ...rewards.map(
      (r, i) => `${MEDALS[i] || "•"} ${r.name} — ${fmt(r.coins)} عملة، ${r.xp} خبرة`
    ),
  ];

  if (rewards.length) lines.push("", `🥇 صيّاد الوحوش: *${rewards[0].name}*`);
  lines.push("", "الوحش القادم بعد ساعة.");

  return { text: lines.join("\n"), mentions: rewards.map((r) => r.jid), rewards };
}

/** حالة الغارة القائمة، أو null. للقراءة فقط. */
export function activeRaid(from) {
  const raid = raids.get(from);
  return raid && !raid.done ? raid : null;
}

export async function startRaid({ sock, from, msg, byName }) {
  if (activeRaid(from)) return { ok: false, text: "⚔️ هناك غارة دائرة الآن في هذه المجموعة." };

  const rest = rests.get(from) || 0;
  const left = REST_MS - (Date.now() - rest);
  if (left > 0) {
    return { ok: false, text: `⏳ الوحش ما زال يلتقط أنفاسه. عُد بعد ${clock(left)}.` };
  }

  const now = Date.now();
  const raid = {
    from,
    monster: MONSTERS[rnd(0, MONSTERS.length - 1)],
    totalDamage: 0,
    damage: new Map(),
    names: new Map(),
    participants: new Set(),
    lastAttack: new Map(),
    startedAt: now,
    endsAt: now + RAID_MS,
    messageKey: null,
    timer: null,
    done: false,
  };

  raids.set(from, raid);

  const text = statusText(raid, `📣 بدأ *${byName}* الغارة.`);
  try {
    const sent = await sock.sendMessage(from, { text }, { quoted: msg });
    raid.messageKey = sent?.key || null;
  } catch (e) {
    log.warn(`تعذّر إرسال رسالة الغارة: ${e.message}`);
  }

  raid.timer = setTimeout(() => escapeRaid(raid, sock).catch(() => {}), RAID_MS + 50);
  raid.timer.unref?.();

  log.info(`[غارة] بدأت في ${from}: ${raid.monster.name}`);
  return { ok: true, text };
}

export async function strike({ sock, from, sender, byName }) {
  const raid = activeRaid(from);
  if (!raid) return { ok: false, text: "😴 لا توجد غارة الآن. اكتب *.غارة* لبدء واحدة." };

  const now = Date.now();
  if (now >= raid.endsAt) {
    await escapeRaid(raid, sock);
    return { ok: false, text: "💨 انتهى وقت الغارة وهرب الوحش." };
  }

  const wait = HIT_COOLDOWN_MS - (now - (raid.lastAttack.get(sender) || 0));
  if (wait > 0) return { ok: false, text: `⏱️ انتظر ${(wait / 1000).toFixed(1)} ثانية قبل الضربة التالية.` };

  raid.lastAttack.set(sender, now);
  raid.participants.add(sender);
  raid.names.set(sender, byName);

  const level = levelFromXp(db.getUser(sender).xp || 0);
  const crit = Math.random() < CRIT_RATE;
  const base = rnd(MIN_DAMAGE, MAX_DAMAGE) + level * 4;
  const damage = crit ? base * 2 : base;

  raid.totalDamage += damage;
  raid.damage.set(sender, (raid.damage.get(sender) || 0) + damage);

  if (remainingHp(raid) <= 0) {
    endRaid(raid);
    const { text, mentions, rewards } = award(raid);
    await editRaidMessage(sock, raid, `☠️ *سقط ${raid.monster.name}*.`);
    try {
      await sock.sendMessage(from, { text, mentions }, {});
    } catch (e) {
      log.warn(`تعذّر إرسال جوائز الغارة: ${e.message}`);
    }
    log.info(`[غارة] أُسقط ${raid.monster.name} في ${from} بعد ${raid.totalDamage} ضرر`);
    return { ok: true, killed: true, damage, crit, text, rewards };
  }

  const hit = `⚔️ ${byName} ضرب بقوة *${fmt(damage)}*${crit ? " 💥 ضربة حرجة" : ""}`;
  const max = maxHp(raid);
  const remaining = remainingHp(raid);
  await editRaidMessage(sock, raid, statusText(raid, hit));
  return { ok: true, killed: false, damage, crit, remaining, max, text: hit };
}

export function raidStatus(from) {
  const raid = activeRaid(from);
  if (raid) return { ok: true, text: statusText(raid) };

  const left = REST_MS - (Date.now() - (rests.get(from) || 0));
  if (left > 0) return { ok: false, text: `😴 لا غارة الآن. الوحش القادم بعد ${clock(left)}.` };
  return { ok: false, text: "😴 لا غارة الآن. اكتب *.غارة* لبدء واحدة." };
}

export async function cancelRaid({ sock, from, byName }) {
  const raid = activeRaid(from);
  if (!raid) return { ok: false, text: "😴 لا توجد غارة قائمة حتى تُلغى." };

  const dealt = fmt(raid.totalDamage);
  endRaid(raid);
  await editRaidMessage(
    sock,
    raid,
    `🏳️ ألغى *${byName}* الغارة.\n\n⚔️ ضرركم قبل الإلغاء: ${dealt}`
  );
  return { ok: true, text: "🏳️ أُلغيت الغارة." };
}
