import { generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";

/**
 * Interactive buttons/lists for baileys-nextgen v7.
 *
 * This build has no `sendButtonMessage`: buttons only render when the payload
 * is wrapped in `viewOnceMessage` and relayed as an `interactiveMessage` with a
 * `nativeFlowMessage` inside. That is what this module builds.
 *
 * A click comes back as `interactiveResponseMessage.nativeFlowResponseMessage`
 * whose `paramsJson` carries the button `id`; messageHandler reads it back as
 * the command text, so an id like `.menu` behaves like the user typed it.
 */

const BUTTON_NAME = {
  reply: "quick_reply",
  url: "cta_url",
  copy: "cta_copy",
  call: "cta_call",
};

function uniqueMentions(mentions = []) {
  return [...new Set(mentions.filter(Boolean))];
}

function mergeContextInfo(mentions, contextInfo) {
  const base = { ...(contextInfo || {}) };
  const list = uniqueMentions(mentions);
  if (list.length) base.mentionedJid = list;
  return Object.keys(base).length ? base : undefined;
}

/** Normalize a button into a native-flow button. */
function toNativeFlowButton(button) {
  if (typeof button === "string") {
    return {
      name: BUTTON_NAME.reply,
      buttonParamsJson: JSON.stringify({ display_text: button, id: button }),
    };
  }

  const kind = button.kind || "reply";

  if (kind === "url") {
    return {
      name: BUTTON_NAME.url,
      buttonParamsJson: JSON.stringify({
        display_text: button.text,
        url: button.url,
        merchant_url: button.url,
      }),
    };
  }

  if (kind === "copy") {
    return {
      name: BUTTON_NAME.copy,
      buttonParamsJson: JSON.stringify({
        display_text: button.text,
        id: button.id ?? button.text,
        copy_code: button.copy ?? button.code ?? "",
      }),
    };
  }

  if (kind === "call") {
    return {
      name: BUTTON_NAME.call,
      buttonParamsJson: JSON.stringify({
        display_text: button.text,
        phone_number: button.phone,
      }),
    };
  }

  return {
    name: BUTTON_NAME.reply,
    buttonParamsJson: JSON.stringify({ display_text: button.text, id: button.id }),
  };
}

/** Normalize a section into the single_select shape. */
function toSingleSelect(title, sections) {
  return {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title,
      sections: (sections || []).map((section) => ({
        title: section.title || "",
        rows: (section.rows || []).map((row) => ({
          title: row.title,
          description: row.description || "",
          id: row.id,
        })),
      })),
    }),
  };
}

async function buildHeader(sock, header) {
  if (!header?.image) return header?.title ? { title: header.title, hasMediaAttachment: false } : undefined;

  const media = await prepareWAMessageMedia(
    { image: typeof header.image === "string" ? { url: header.image } : header.image },
    { upload: sock.waUploadToServer }
  );

  return {
    title: header.title || "",
    subtitle: header.subtitle || "",
    hasMediaAttachment: true,
    imageMessage: media.imageMessage,
  };
}

async function relayInteractive(sock, from, msg, interactive) {
  const content = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: interactive,
      },
    },
  };

  // Quoting needs the original message body; without it the builder throws.
  const quoted = msg?.message ? msg : undefined;

  const waMsg = generateWAMessageFromContent(from, content, {
    userJid: sock.user?.id,
    quoted,
  });

  await sock.relayMessage(from, waMsg.message, { messageId: waMsg.key.id });
  return waMsg;
}

/**
 * Send a message with reply/url/copy buttons.
 *
 *   await sendButtons(sock, from, msg, {
 *     text: "choose", buttons: [{ text: "Hi", id: ".hi" }],
 *   });
 */
export async function sendButtons(sock, from, msg, { text, title, footer, buttons = [], mentions, contextInfo, image } = {}) {
  const header = await buildHeader(sock, { title, image });

  return relayInteractive(sock, from, msg, {
    ...(header ? { header } : {}),
    body: { text: text || "" },
    ...(footer ? { footer: { text: footer } } : {}),
    nativeFlowMessage: { buttons: buttons.map(toNativeFlowButton), messageParamsJson: "" },
    contextInfo: mergeContextInfo(mentions, contextInfo),
  });
}

/**
 * Send a single-select dropdown (a "list").
 *
 *   await sendList(sock, from, msg, {
 *     text: "pick one",
 *     title: "Voices",
 *     sections: [{ title: "A", rows: [{ title: "Woody", description: "…", id: ".say_woody" }] }],
 *   });
 */
export async function sendList(sock, from, msg, { text, title, footer, buttonText, sections = [], mentions, contextInfo, image } = {}) {
  const header = await buildHeader(sock, { title, image });

  return relayInteractive(sock, from, msg, {
    ...(header ? { header } : {}),
    body: { text: text || "" },
    ...(footer ? { footer: { text: footer } } : {}),
    nativeFlowMessage: {
      buttons: [toSingleSelect(buttonText || title || "اختر", sections)],
      messageParamsJson: "",
    },
    contextInfo: mergeContextInfo(mentions, contextInfo),
  });
}

/**
 * Pull the command id out of a clicked button.
 * Returns "" when the message is not a button/list response.
 */
export function extractButtonId(message) {
  if (!message) return "";

  const nativeFlow = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (nativeFlow) {
    try {
      const parsed = JSON.parse(nativeFlow);
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

export default { sendButtons, sendList, extractButtonId };
