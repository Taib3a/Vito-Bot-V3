import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import axios from "axios";

/**
 * Interactive buttons for baileys-nextgen v7.
 *
 * There is no built-in `sendButtonMessage`, and wrapping the payload in
 * `viewOnceMessage` is NOT enough — WhatsApp drops the buttons. They only
 * render when the message goes out as a plain `interactiveMessage` together
 * with an extra `biz > interactive > native_flow` node, which `initButtons()`
 * attaches.
 */

/** Build the extra nodes that make WhatsApp render the native flow. */
function flowNodes(jid) {
  const nodes = [
    {
      tag: "biz",
      attrs: {},
      content: [
        {
          tag: "interactive",
          attrs: { type: "native_flow", v: "1" },
          content: [{ tag: "native_flow", attrs: { v: "9", name: "mixed" } }],
        },
      ],
    },
  ];

  // A private chat also needs the bot marker.
  if (!String(jid).endsWith("@g.us")) {
    nodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
  }

  return nodes;
}

/** Map a button into the native-flow shape WhatsApp expects. */
function formatButton(btn, index) {
  if (btn.url) {
    return {
      name: "cta_url",
      buttonParamsJson: JSON.stringify({
        display_text: btn.text || "",
        url: btn.url,
        merchant_url: btn.url,
      }),
    };
  }

  if (btn.phoneNumber) {
    return {
      name: "cta_call",
      buttonParamsJson: JSON.stringify({
        display_text: btn.text || "",
        phone_number: btn.phoneNumber,
      }),
    };
  }

  if (btn.copy) {
    return {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({ display_text: btn.text || "", copy_code: btn.copy }),
    };
  }

  return {
    name: "quick_reply",
    buttonParamsJson: JSON.stringify({ display_text: btn.text || "", id: btn.id || `btn_${index}` }),
  };
}

async function buildHeader(conn, { image, title }) {
  if (image) {
    try {
      let buffer;
      if (typeof image === "string") {
        const res = await axios.get(image, { responseType: "arraybuffer" });
        buffer = Buffer.from(res.data);
      } else {
        buffer = image;
      }
      const media = await prepareWAMessageMedia({ image: buffer }, { upload: conn.waUploadToServer });
      return { hasMediaAttachment: true, imageMessage: media.imageMessage };
    } catch (e) {
      console.error("[buttons] تعذّر تجهيز الصورة:", e.message);
    }
  }

  if (title) return { title: String(title).trim(), hasMediaAttachment: false };
  return null;
}

/**
 * Attach `sendButtonMessage` to a connection.
 *
 *   initButtons(sock);
 *   await sock.sendButtonMessage(jid, "text", [{ text: "Hi", id: ".hi" }], { footer });
 *
 * A button may carry `id` (reply), `url`, `phoneNumber` or `copy`. Pass
 * `sections` for a dropdown; it is appended as a `single_select` button.
 */
export function initButtons(conn) {
  conn.sendButtonMessage = async (jid, text = "", buttons = [], opts = {}) => {
    const {
      footer = "",
      title = "",
      quoted = null,
      mentions = [],
      sections = [],
      image = null,
      contextInfo = null,
    } = opts;

    const formatted = buttons.map(formatButton);

    if (sections.length > 0) {
      formatted.push({
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Seleccionar",
          sections: sections.map((s) => ({
            title: s.title,
            rows: s.rows.map((r) => ({ title: r.title, description: r.description || "", id: r.id })),
          })),
        }),
      });
    }

    const header = await buildHeader(conn, { image, title });

    const finalContextInfo = {
      mentionedJid:
        mentions.length > 0
          ? mentions
          : typeof conn.parseMention === "function"
            ? conn.parseMention(text)
            : [],
      groupMentions: [],
      ...(contextInfo || {}),
    };

    const interactiveMessage = {
      body: { text: String(text).trim() },
      footer: footer ? { text: String(footer).trim() } : undefined,
      header: header || undefined,
      nativeFlowMessage: { buttons: formatted, contentFormatVersion: 1 },
      contextInfo: finalContextInfo,
    };

    const waMsg = generateWAMessageFromContent(
      jid,
      { interactiveMessage },
      { quoted, userJid: conn.user?.jid || conn.user?.id }
    );

    return await conn.relayMessage(jid, waMsg.message, {
      messageId: waMsg.key.id,
      additionalNodes: flowNodes(jid),
    });
  };

  return conn;
}

/**
 * Pull the command id out of a clicked button.
 * Returns "" when the message is not a button/list response.
 */
export function extractButtonId(message) {
  if (!message) return "";

  const paramsJson = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (paramsJson) {
    try {
      const parsed = JSON.parse(paramsJson);
      return parsed?.id || parsed?.selectedId || "";
    } catch {
      return "";
    }
  }

  return (
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    ""
  );
}

/* ── Convenience wrappers ─────────────────────────────────────────────────
 * These keep the older `sendButtons(sock, from, msg, opts)` call shape
 * working on top of the same relay path, so callers need no init step.
 */

function ensureButtons(sock) {
  if (typeof sock.sendButtonMessage !== "function") initButtons(sock);
}

/**
 * Send a message with reply/url/copy/call buttons.
 *
 *   await sendButtons(sock, from, msg, {
 *     text: "choose", buttons: [{ text: "Hi", id: ".hi" }],
 *   });
 */
export async function sendButtons(sock, from, msg, opts = {}) {
  ensureButtons(sock);
  const { text, title, footer, buttons = [], mentions, contextInfo, image, sections } = opts;

  return sock.sendButtonMessage(from, text || "", buttons, {
    title,
    footer,
    quoted: msg?.message ? msg : null,
    mentions,
    sections: sections || [],
    image,
    contextInfo,
  });
}

/**
 * Send a single-select dropdown (a "list").
 *
 *   await sendList(sock, from, msg, {
 *     text: "pick one", buttonText: "القائمة",
 *     sections: [{ title: "A", rows: [{ title: "x", description: "…", id: ".say_x" }] }],
 *   });
 */
export async function sendList(sock, from, msg, opts = {}) {
  const { text, title, footer, buttonText, sections = [], mentions, contextInfo, image } = opts;

  return sendButtons(sock, from, msg, {
    text,
    title,
    footer,
    buttons: [],
    sections,
    mentions,
    contextInfo,
    image,
  });
}

export default { initButtons, extractButtonId, sendButtons, sendList };
