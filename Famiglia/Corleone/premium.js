import db from "../database/db.js";
import config from "./settings.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeNumber(value = "") {
  return String(value).split("@")[0].split(":")[0].replace(/\D/g, "");
}

export function normalizeUsername(value = "") {
  return String(value).replace(/^@/, "").trim().toLowerCase();
}

function isActive(until) {
  const time = Date.parse(until || "");
  return Number.isFinite(time) && time > Date.now();
}

function isConfiguredPremium(number, username) {
  const numbers = (config.premium?.numbers || []).map(normalizeNumber);
  const usernames = (config.premium?.usernames || []).map(normalizeUsername);
  return numbers.includes(number) || (!!username && usernames.includes(username));
}

export function isPremiumUser({ number, username, jid, includeUsernames = false } = {}) {
  const num = normalizeNumber(number || jid);
  const name = normalizeUsername(username);

  if (isConfiguredPremium(num, name)) return true;

  if (num) {
    const user = db.getUser(num);
    if (isActive(user.premiumUntil)) return true;
  }

  if (includeUsernames && name) {
    return db.getAllUsers().some((user) => {
      if (!isActive(user.premiumUntil)) return false;
      return (
        normalizeUsername(user.premiumUsername) === name ||
        normalizeUsername(user.premiumDisplayName) === name
      );
    });
  }

  return false;
}

export function addPremium({ number, username = "", displayName = "", days, addedBy = "" }) {
  const num = normalizeNumber(number);
  if (!num) throw new Error("رقم غير صالح");

  const duration = Number(days);
  if (!Number.isInteger(duration) || duration < 1) throw new Error("مدة غير صالحة");

  const user = db.getUser(num);
  const currentUntil = Date.parse(user.premiumUntil || "") || 0;
  const base = Math.max(Date.now(), currentUntil);
  const until = new Date(base + duration * DAY_MS).toISOString();

  db.setUser(num, {
    premiumUntil: until,
    premiumUsername: username ? normalizeUsername(username) : user.premiumUsername || null,
    premiumDisplayName: displayName || user.premiumDisplayName || null,
    premiumAddedBy: addedBy || null,
    premiumDays: duration,
  });

  return {
    number: num,
    username: username ? normalizeUsername(username) : user.premiumUsername || "",
    displayName: displayName || user.premiumDisplayName || "",
    until,
    extended: currentUntil > Date.now(),
  };
}

export function removePremium(number) {
  const num = normalizeNumber(number);
  if (!num) throw new Error("رقم غير صالح");

  const user = db.getUser(num);
  const wasActive = isActive(user.premiumUntil);

  db.setUser(num, {
    premiumUntil: null,
    premiumUsername: null,
    premiumDisplayName: null,
    premiumAddedBy: null,
    premiumDays: null,
  });

  return { number: num, removed: wasActive };
}

export function listPremium() {
  return db
    .getAllUsers()
    .filter((user) => isActive(user.premiumUntil))
    .map((user) => ({
      number: user.jid,
      username: user.premiumUsername || "",
      displayName: user.premiumDisplayName || "",
      until: user.premiumUntil,
    }))
    .sort((a, b) => Date.parse(a.until) - Date.parse(b.until));
}
