// محرّك VoIP كاملاً في ملف واحد — 48 وحدة كانت منفصلة في Famiglia/.
//
// كل وحدة داخل نطاق مستقل IIFE فتحتفظ بمعرّفاتها الخاصة، وتُصدَّر واجهتها
// عبر كائن __<اسم-الوحدة>. الاستيرادات الداخلية صارت تفكيكاً من تلك الكائنات.
//
// استُثني audio-codec.js (WASM مُجمَّع 599 ك.ب يستخدم import.meta.url).
//
// المحرّك مقتبس من HIROBOT (github.com/HirooSy/HIROBOT) — رخصة غير تجارية.

import { execFile, spawn } from "node:child_process";
import { X509Certificate, createCipheriv, createDecipheriv, createECDH, createHash, createHmac, createSign, createVerify, generateKeyPairSync, hkdfSync, randomBytes as __ext_randomBytes, randomBytes as nodeRandomBytes, randomInt as nodeRandomInt, timingSafeEqual } from "node:crypto";
import { default as dgram } from "node:dgram";
import { EventEmitter } from "node:events";
import { default as fs } from "node:fs";
import { access } from "node:fs/promises";
import { setPriority } from "node:os";
import { default as path } from "node:path";

/* ═══ util.js ═══════════════════════════════════════════════════════ */
const __util = (() => {
  const TEXT_ENCODER = new TextEncoder();
  const TEXT_DECODER = new TextDecoder();
  const EMPTY_BYTES = Object.freeze(new Uint8Array(0));
  function concatBytes(parts) {
      let total = 0;
      for (let i = 0; i < parts.length; i += 1) {
          total += parts[i].length;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (let i = 0; i < parts.length; i += 1) {
          out.set(parts[i], offset);
          offset += parts[i].length;
      }
      return out;
  }
  const HEX_CHARS = '0123456789abcdef';
  const HEX_TABLE = (() => {
      const table = new Array(256);
      for (let i = 0; i < 256; i += 1) {
          table[i] = HEX_CHARS[i >> 4] + HEX_CHARS[i & 0x0f];
      }
      return table;
  })();
  const HEX_LOOKUP = (() => {
      const table = new Int8Array(128).fill(-1);
      for (let i = 0x30; i <= 0x39; i += 1)
          table[i] = i - 0x30;
      for (let i = 0x41; i <= 0x46; i += 1)
          table[i] = i - 0x41 + 10;
      for (let i = 0x61; i <= 0x66; i += 1)
          table[i] = i - 0x61 + 10;
      return table;
  })();
  const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const BASE64_LOOKUP = (() => {
      const table = new Uint8Array(128).fill(0xff);
      for (let i = 0; i < BASE64_CHARS.length; i += 1) {
          table[BASE64_CHARS.charCodeAt(i)] = i;
      }
      table[0x3d] = 0;
      return table;
  })();
  function bytesToHex(value) {
      let out = '';
      for (let i = 0; i < value.length; i += 1) {
          out += HEX_TABLE[value[i]];
      }
      return out;
  }
  function hexToBytes(value) {
      const len = value.length;
      if (len & 1) {
          throw new Error('hex string must have even length');
      }
      const out = new Uint8Array(len >> 1);
      for (let i = 0; i < len; i += 2) {
          const hiCode = value.charCodeAt(i);
          const loCode = value.charCodeAt(i + 1);
          const hi = hiCode < 128 ? HEX_LOOKUP[hiCode] : -1;
          const lo = loCode < 128 ? HEX_LOOKUP[loCode] : -1;
          if ((hi | lo) < 0) {
              throw new Error('invalid hex character');
          }
          out[i >> 1] = (hi << 4) | lo;
      }
      return out;
  }
  function lookupBase64(code) {
      if (code > 127) {
          throw new Error('invalid base64 character');
      }
      const v = BASE64_LOOKUP[code];
      if (v === 0xff) {
          throw new Error('invalid base64 character');
      }
      return v;
  }
  function encodeBase64(value, alphabet, pad) {
      const len = value.length;
      if (len === 0)
          return '';
      const remainder = len % 3;
      const mainLen = len - remainder;
      const chunks = Math.ceil(len / 3);
      const out = new Array(pad ? chunks * 4 : Math.ceil((len * 4) / 3));
      let k = 0;
      for (let i = 0; i < mainLen; i += 3) {
          const a = value[i];
          const b = value[i + 1];
          const c = value[i + 2];
          out[k++] = alphabet[a >> 2];
          out[k++] = alphabet[((a & 0x03) << 4) | (b >> 4)];
          out[k++] = alphabet[((b & 0x0f) << 2) | (c >> 6)];
          out[k++] = alphabet[c & 0x3f];
      }
      if (remainder === 1) {
          const a = value[mainLen];
          out[k++] = alphabet[a >> 2];
          out[k++] = alphabet[(a & 0x03) << 4];
          if (pad) {
              out[k++] = '=';
              out[k++] = '=';
          }
      }
      else if (remainder === 2) {
          const a = value[mainLen];
          const b = value[mainLen + 1];
          out[k++] = alphabet[a >> 2];
          out[k++] = alphabet[((a & 0x03) << 4) | (b >> 4)];
          out[k++] = alphabet[(b & 0x0f) << 2];
          if (pad) {
              out[k++] = '=';
          }
      }
      return out.join('');
  }
  function bytesToBase64(value) {
      return encodeBase64(value, BASE64_CHARS, true);
  }
  function base64ToBytes(value) {
      const len = value.length;
      if (len === 0)
          return EMPTY_BYTES;
      if ((len & 3) !== 0) {
          throw new Error('base64 string length must be multiple of 4');
      }
      let padding = 0;
      if (value.charCodeAt(len - 1) === 0x3d)
          padding += 1;
      if (value.charCodeAt(len - 2) === 0x3d)
          padding += 1;
      const outLen = ((len * 3) >> 2) - padding;
      const out = new Uint8Array(outLen);
      let j = 0;
      const mainLen = len - 4;
      let i = 0;
      for (; i < mainLen; i += 4) {
          const a = lookupBase64(value.charCodeAt(i));
          const b = lookupBase64(value.charCodeAt(i + 1));
          const c = lookupBase64(value.charCodeAt(i + 2));
          const d = lookupBase64(value.charCodeAt(i + 3));
          out[j++] = (a << 2) | (b >> 4);
          out[j++] = ((b & 0x0f) << 4) | (c >> 2);
          out[j++] = ((c & 0x03) << 6) | d;
      }
      const a = lookupBase64(value.charCodeAt(i));
      const b = lookupBase64(value.charCodeAt(i + 1));
      out[j++] = (a << 2) | (b >> 4);
      if (j < outLen) {
          const c = lookupBase64(value.charCodeAt(i + 2));
          out[j++] = ((b & 0x0f) << 4) | (c >> 2);
          if (j < outLen) {
              const d = lookupBase64(value.charCodeAt(i + 3));
              out[j++] = ((c & 0x03) << 6) | d;
          }
      }
      return out;
  }
  function toBytesView(value) {
      if (value instanceof Uint8Array) {
          return value.constructor === Uint8Array
              ? value
              : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      }
      if (value instanceof ArrayBuffer) {
          return new Uint8Array(value);
      }
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  function uint8TimingSafeEqual(left, right) {
      if (left.byteLength !== right.byteLength) {
          return false;
      }
      return timingSafeEqual(left, right);
  }
  function toError(value) {
      if (value instanceof Error)
          return value;
      if (typeof value === 'string')
          return new Error(value);
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
          return new Error(String(value));
      }
      if (value && typeof value === 'object') {
          const message = value.message;
          if (typeof message === 'string' && message.length > 0) {
              return new Error(message);
          }
          const code = value.code;
          if (typeof code === 'string' || typeof code === 'number') {
              return new Error(`unknown error (${code})`);
          }
      }
      return new Error('unknown error');
  }
  function resolveOptionalPositive(value, name) {
      if (value === undefined)
          return undefined;
      if (Number.isSafeInteger(value) && value > 0)
          return value;
      throw new Error(`${name} must be a positive safe integer`);
  }
  function resolvePositive(value, fallback, name) {
      return resolveOptionalPositive(value, name) ?? fallback;
  }
  return { TEXT_ENCODER, TEXT_DECODER, EMPTY_BYTES, concatBytes, bytesToHex, hexToBytes, bytesToBase64, base64ToBytes, toBytesView, uint8TimingSafeEqual, toError, resolvePositive };
})();

/* ═══ bytes.js ══════════════════════════════════════════════════════ */
const __bytes = (() => {
  const { base64ToBytes, bytesToBase64, bytesToHex, concatBytes, EMPTY_BYTES, TEXT_DECODER, TEXT_ENCODER, toBytesView } = __util;
  function ensureBounds(buf, offset, size) {
      if (!Number.isInteger(offset) || offset < 0 || offset + size > buf.length) {
          throw new RangeError(`byte access out of range: offset ${offset}, size ${size}, length ${buf.length}`);
      }
  }
  function readUInt16BE(buf, offset) {
      ensureBounds(buf, offset, 2);
      return (buf[offset] << 8) | buf[offset + 1];
  }
  function readUInt32BE(buf, offset) {
      ensureBounds(buf, offset, 4);
      return (((buf[offset] << 24) |
          (buf[offset + 1] << 16) |
          (buf[offset + 2] << 8) |
          buf[offset + 3]) >>>
          0);
  }
  function readUInt32LE(buf, offset) {
      ensureBounds(buf, offset, 4);
      return ((buf[offset] |
          (buf[offset + 1] << 8) |
          (buf[offset + 2] << 16) |
          (buf[offset + 3] << 24)) >>>
          0);
  }
  function readBigUInt64BE(buf, offset) {
      const hi = readUInt32BE(buf, offset);
      const lo = readUInt32BE(buf, offset + 4);
      return (BigInt(hi) << 32n) | BigInt(lo);
  }
  function writeUInt16BE(buf, value, offset) {
      ensureBounds(buf, offset, 2);
      buf[offset] = (value >> 8) & 0xff;
      buf[offset + 1] = value & 0xff;
  }
  function writeUInt32BE(buf, value, offset) {
      ensureBounds(buf, offset, 4);
      buf[offset] = (value >> 24) & 0xff;
      buf[offset + 1] = (value >> 16) & 0xff;
      buf[offset + 2] = (value >> 8) & 0xff;
      buf[offset + 3] = value & 0xff;
  }
  function writeUInt32LE(buf, value, offset) {
      ensureBounds(buf, offset, 4);
      buf[offset] = value & 0xff;
      buf[offset + 1] = (value >> 8) & 0xff;
      buf[offset + 2] = (value >> 16) & 0xff;
      buf[offset + 3] = (value >> 24) & 0xff;
  }
  function writeBigUInt64BE(buf, value, offset) {
      writeUInt32BE(buf, Number((value >> 32n) & 0xffffffffn), offset);
      writeUInt32BE(buf, Number(value & 0xffffffffn), offset + 4);
  }
  function toArrayBuffer(bytes) {
      if (bytes.byteOffset === 0 &&
          bytes.byteLength === bytes.buffer.byteLength &&
          bytes.buffer instanceof ArrayBuffer) {
          return bytes.buffer;
      }
      return bytes.slice().buffer;
  }
  return { readUInt16BE, readUInt32BE, readUInt32LE, readBigUInt64BE, writeUInt16BE, writeUInt32BE, writeUInt32LE, writeBigUInt64BE, toArrayBuffer, base64ToBytes, bytesToBase64, bytesToHex, concatBytes, EMPTY_BYTES, TEXT_DECODER, TEXT_ENCODER, toBytesView };
})();

/* ═══ protobuf.js ═══════════════════════════════════════════════════ */
const __protobuf = (() => {
  const { concatBytes } = __bytes;
  const WIRE_TYPE_VARINT = 0;
  const WIRE_TYPE_LENGTH_DELIMITED = 2;
  const VARINT_CONTINUATION = 0x80;
  const VARINT_PAYLOAD_MASK = 0x7fn;
  const VARINT_SHIFT = 7n;
  function encodeVarint(value) {
      const bytes = [];
      let remaining = value;
      while (remaining > VARINT_PAYLOAD_MASK) {
          bytes.push(Number(remaining & VARINT_PAYLOAD_MASK) | VARINT_CONTINUATION);
          remaining >>= VARINT_SHIFT;
      }
      bytes.push(Number(remaining & VARINT_PAYLOAD_MASK));
      return new Uint8Array(bytes);
  }
  function encodeTag(fieldNumber, wireType) {
      return encodeVarint((BigInt(fieldNumber) << 3n) | BigInt(wireType));
  }
  function encodeProtoVarintField(fieldNumber, value) {
      return concatBytes([encodeTag(fieldNumber, WIRE_TYPE_VARINT), encodeVarint(value)]);
  }
  function encodeProtoLengthDelimited(fieldNumber, data) {
      return concatBytes([
          encodeTag(fieldNumber, WIRE_TYPE_LENGTH_DELIMITED),
          encodeVarint(BigInt(data.length)),
          data
      ]);
  }
  return { encodeProtoVarintField, encodeProtoLengthDelimited };
})();

/* ═══ app-data-protocol.js ══════════════════════════════════════════ */
const __app_data_protocol = (() => {
  const { concatBytes, EMPTY_BYTES, TEXT_DECODER, TEXT_ENCODER } = __bytes;
  const { encodeProtoLengthDelimited, encodeProtoVarintField } = __protobuf;
  const APP_DATA_PAYLOADS_MESSAGES = 1;
  const APP_DATA_MESSAGE_REACTION_INFO = 1;
  const APP_DATA_MESSAGE_AR_EFFECT_INFO = 3;
  const REACTION_INFO_TRANSACTION_ID = 1;
  const REACTION_INFO_REACTION = 2;
  const AR_EFFECT_INFO_TRANSACTION_ID = 1;
  const AR_EFFECT_INFO_AR_EFFECT_ID = 2;
  const WIRE_TYPE_VARINT = 0;
  const WIRE_TYPE_FIXED64 = 1;
  const WIRE_TYPE_LENGTH_DELIMITED = 2;
  const WIRE_TYPE_FIXED32 = 5;
  const VARINT_CONTINUATION = 0x80;
  const VARINT_PAYLOAD_MASK = 0x7f;
  const VARINT_SHIFT = 7n;

  const MAX_MESSAGES_PER_PAYLOAD = 32;
  function readVarint(data, offset) {
      let value = 0n;
      let shift = 0n;
      let cursor = offset;
      while (cursor < data.length) {
          const byte = data[cursor++];
          value |= BigInt(byte & VARINT_PAYLOAD_MASK) << shift;
          if ((byte & VARINT_CONTINUATION) === 0)
              return { value, next: cursor };
          shift += VARINT_SHIFT;
          if (shift > 63n)
              break;
      }
      throw new Error('truncated protobuf varint');
  }

  function* readFields(data) {
      let offset = 0;
      while (offset < data.length) {
          const tag = readVarint(data, offset);
          offset = tag.next;
          const fieldNumber = Number(tag.value >> 3n);
          const wireType = Number(tag.value & 0x7n);
          if (fieldNumber === 0)
              throw new Error('invalid protobuf field number 0');
          if (wireType === WIRE_TYPE_VARINT) {
              const read = readVarint(data, offset);
              offset = read.next;
              yield { fieldNumber, wireType, varint: read.value, bytes: EMPTY_BYTES };
              continue;
          }
          if (wireType === WIRE_TYPE_LENGTH_DELIMITED) {
              const length = readVarint(data, offset);
              const start = length.next;
              const end = start + Number(length.value);
              if (end > data.length)
                  throw new Error('truncated protobuf length-delimited field');
              offset = end;
              yield { fieldNumber, wireType, varint: 0n, bytes: data.subarray(start, end) };
              continue;
          }
          if (wireType === WIRE_TYPE_FIXED64) {
              offset += 8;
          }
          else if (wireType === WIRE_TYPE_FIXED32) {
              offset += 4;
          }
          else {
              throw new Error(`unsupported protobuf wire type ${wireType}`);
          }
          if (offset > data.length)
              throw new Error('truncated protobuf fixed-width field');
      }
  }

  function encodeReactionPayload(reaction) {
      const reactionInfo = concatBytes([
          encodeProtoVarintField(REACTION_INFO_TRANSACTION_ID, reaction.transactionId),
          encodeProtoLengthDelimited(REACTION_INFO_REACTION, TEXT_ENCODER.encode(reaction.reaction))
      ]);
      const message = encodeProtoLengthDelimited(APP_DATA_MESSAGE_REACTION_INFO, reactionInfo);
      return encodeProtoLengthDelimited(APP_DATA_PAYLOADS_MESSAGES, message);
  }
  function decodeReactionInfo(data, requireTransactionId) {
      let transactionId = null;
      let reaction = null;
      for (const field of readFields(data)) {
          if (field.fieldNumber === REACTION_INFO_TRANSACTION_ID && field.wireType === 0) {
              transactionId = field.varint;
          }
          else if (field.fieldNumber === REACTION_INFO_REACTION && field.wireType === 2) {
              reaction = TEXT_DECODER.decode(field.bytes);
          }
      }
      if (reaction === null)
          return null;
      if (transactionId === null && requireTransactionId)
          return null;
      return { transactionId: transactionId ?? 0n, reaction };
  }
  function decodeArEffectInfo(data, requireTransactionId) {
      let transactionId = null;
      let arEffectId = null;
      for (const field of readFields(data)) {
          if (field.fieldNumber === AR_EFFECT_INFO_TRANSACTION_ID && field.wireType === 0) {
              transactionId = field.varint;
          }
          else if (field.fieldNumber === AR_EFFECT_INFO_AR_EFFECT_ID && field.wireType === 2) {
              arEffectId = TEXT_DECODER.decode(field.bytes);
          }
      }
      if (arEffectId === null)
          return null;
      if (transactionId === null && requireTransactionId)
          return null;
      return { transactionId: transactionId ?? 0n, arEffectId };
  }

  function decodeAppDataMessage(data, strict) {
      let reaction = null;
      let arEffect = null;
      for (const field of readFields(data)) {
          if (field.wireType !== WIRE_TYPE_LENGTH_DELIMITED)
              continue;
          if (field.fieldNumber === APP_DATA_MESSAGE_REACTION_INFO) {
              reaction = decodeReactionInfo(field.bytes, strict);
          }
          else if (field.fieldNumber === APP_DATA_MESSAGE_AR_EFFECT_INFO) {
              arEffect = decodeArEffectInfo(field.bytes, strict);
          }
      }
      if (reaction)
          return arEffect ? { reaction, arEffect } : { reaction };
      return arEffect ? { arEffect } : null;
  }
  function decodeAsPayloads(data) {
      const items = [];
      let truncated = false;
      for (const field of readFields(data)) {
          if (field.fieldNumber !== APP_DATA_PAYLOADS_MESSAGES)
              continue;
          if (field.wireType !== WIRE_TYPE_LENGTH_DELIMITED)
              continue;
          if (items.length >= MAX_MESSAGES_PER_PAYLOAD) {
              truncated = true;
              break;
          }
          const item = decodeAppDataMessage(field.bytes, false);
          if (item)
              items.push(item);
      }
      return { items, truncated };
  }

  function decodeAppDataPayload(data) {
      try {
          const nested = decodeAsPayloads(data);
          if (nested.items.length > 0) {
              return { shape: 'payloads', items: nested.items, truncated: nested.truncated };
          }
      }
      catch {
      }
      try {
          const flat = decodeAppDataMessage(data, true);
          if (flat)
              return { shape: 'message', items: [flat], truncated: false };
      }
      catch {
          return null;
      }
      return null;
  }
  return { encodeReactionPayload, decodeAppDataPayload };
})();

/* ═══ primitives.js ═════════════════════════════════════════════════ */
const __primitives = (() => {
  const { toBytesView } = __util;
  function randomBytes(length) {
      return toBytesView(nodeRandomBytes(length));
  }
  function randomInt(min, max) {
      return nodeRandomInt(min, max);
  }
  function hmacSha1(key, ...parts) {
      const hmac = createHmac('sha1', key);
      for (const part of parts) {
          hmac.update(part);
      }
      return toBytesView(hmac.digest());
  }
  function aesCtr128(key, iv, data) {
      const cipher = createCipheriv('aes-128-ctr', key, iv);
      const output = toBytesView(cipher.update(data));
      cipher.final();
      return output;
  }
  return { randomBytes, randomInt, hmacSha1, aesCtr128 };
})();

/* ═══ types.js ══════════════════════════════════════════════════════ */
const __types = (() => {
  var CallState;
  (function (CallState) {
      CallState["Initiating"] = "initiating";
      CallState["Ringing"] = "ringing";
      CallState["IncomingRinging"] = "incoming_ringing";
      CallState["Connecting"] = "connecting";
      CallState["Active"] = "active";
      CallState["WaitingRoom"] = "waiting_room";
      CallState["OnHold"] = "on_hold";
      CallState["Ended"] = "ended";
  })(CallState || (CallState = {}));
  var CallDirection;
  (function (CallDirection) {
      CallDirection["Outgoing"] = "outgoing";
      CallDirection["Incoming"] = "incoming";
  })(CallDirection || (CallDirection = {}));
  var CallMediaType;
  (function (CallMediaType) {
      CallMediaType["Audio"] = "audio";
      CallMediaType["Video"] = "video";
  })(CallMediaType || (CallMediaType = {}));
  var EndCallReason;
  (function (EndCallReason) {
      EndCallReason["UserEnded"] = "user_ended";
      EndCallReason["Declined"] = "declined";
      EndCallReason["Timeout"] = "timeout";
      EndCallReason["Busy"] = "busy";
      EndCallReason["Cancelled"] = "cancelled";
      EndCallReason["Failed"] = "failed";
      EndCallReason["DoNotDisturb"] = "do_not_disturb";
      EndCallReason["Unknown"] = "unknown";
  })(EndCallReason || (EndCallReason = {}));
  var PayloadType;
  (function (PayloadType) {
      PayloadType[PayloadType["WhatsAppOpus"] = 120] = "WhatsAppOpus";

      PayloadType[PayloadType["H264"] = 97] = "H264";
  })(PayloadType || (PayloadType = {}));
  const DEFAULT_VIDEO_CONFIG = {

      width: 640,
      height: 360,
      frameRate: 20,

      clockRate: 90000
  };
  const DEFAULT_AUDIO_CONFIG = {
      sampleRate: 16000,
      captureChunkSize: 960,
      playbackOutputSize: 960,
      maxBufferSize: 1600,
      intervalMs: 60
  };
  const SRTP_SEND_AUTH_TAG_LEN = 4;
  const SRTP_RECV_AUTH_TAG_LEN = 4;
  const SRTP_AUTH_TAG_LEN = 4;
  const SRTP_LABEL = {
      ENCRYPTION: 0x00,
      AUTH: 0x01,
      SALT: 0x02
  };

  const SRTCP_LABEL = {
      ENCRYPTION: 0x03,
      AUTH: 0x04,
      SALT: 0x05
  };
  const RTCP_AUTH_TAG_LEN = 10;
  const WA_RELAY_PORT = 3480;
  const WA_DTLS_FINGERPRINT = 'sha-256 F9:CA:0C:98:A3:CC:71:D6:42:CE:5A:E2:53:D2:15:20:D3:1B:BA:D8:57:A4:F0:AF:BE:0B:FB:F3:6B:0C:A0:68';
  return { CallState, CallDirection, CallMediaType, EndCallReason, PayloadType, DEFAULT_VIDEO_CONFIG, DEFAULT_AUDIO_CONFIG, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN, SRTP_AUTH_TAG_LEN, SRTP_LABEL, SRTCP_LABEL, RTCP_AUTH_TAG_LEN, WA_RELAY_PORT, WA_DTLS_FINGERPRINT };
})();

/* ═══ rtp.js ════════════════════════════════════════════════════════ */
const __rtp = (() => {
  const { EMPTY_BYTES, readUInt16BE, readUInt32BE, writeUInt16BE, writeUInt32BE } = __bytes;
  const { randomInt } = __primitives;
  const { PayloadType } = __types;
  const RTP_VERSION = 2;
  const MIN_HEADER_SIZE = 12;
  class RtpHeader {
      version = RTP_VERSION;
      padding = false;
      extension = false;
      marker = false;
      payloadType;
      sequenceNumber;
      timestamp;
      ssrc;
      csrc = [];
      extensionProfile = 0;
      extensionData = EMPTY_BYTES;
      get csrcCount() {
          return this.csrc.length;
      }
      constructor(payloadType, sequenceNumber, timestamp, ssrc) {
          this.payloadType = payloadType;
          this.sequenceNumber = sequenceNumber;
          this.timestamp = timestamp;
          this.ssrc = ssrc;
      }
      size() {
          let s = MIN_HEADER_SIZE + this.csrcCount * 4;
          if (this.extension) {
              s += 4 + this.extensionData.length;
          }
          return s;
      }
      encode(buf) {
          if (buf.length < this.size()) {
              throw new Error('buffer too small for RTP header');
          }
          buf[0] =
              ((this.version & 0x03) << 6) |
                  ((this.padding ? 1 : 0) << 5) |
                  ((this.extension ? 1 : 0) << 4) |
                  (this.csrcCount & 0x0f);
          buf[1] = ((this.marker ? 1 : 0) << 7) | (this.payloadType & 0x7f);
          writeUInt16BE(buf, this.sequenceNumber, 2);
          writeUInt32BE(buf, this.timestamp, 4);
          writeUInt32BE(buf, this.ssrc, 8);
          let offset = 12;
          for (let i = 0; i < this.csrc.length; i++) {
              writeUInt32BE(buf, this.csrc[i], offset);
              offset += 4;
          }
          if (this.extension) {
              if (this.extensionData.length % 4 !== 0) {
                  throw new Error('RTP extension data must be 32-bit aligned');
              }
              writeUInt16BE(buf, this.extensionProfile, offset);
              writeUInt16BE(buf, this.extensionData.length / 4, offset + 2);
              buf.set(this.extensionData, offset + 4);
          }
          return this.size();
      }
      static decode(buf) {
          if (buf.length < MIN_HEADER_SIZE) {
              throw new Error('buffer too small for RTP header');
          }
          const version = (buf[0] >> 6) & 0x03;
          if (version !== RTP_VERSION) {
              throw new Error(`invalid RTP version: ${version}`);
          }
          const padding = ((buf[0] >> 5) & 0x01) !== 0;
          const extension = ((buf[0] >> 4) & 0x01) !== 0;
          const csrcCount = buf[0] & 0x0f;
          const marker = ((buf[1] >> 7) & 0x01) !== 0;
          const payloadType = buf[1] & 0x7f;
          const sequenceNumber = readUInt16BE(buf, 2);
          const timestamp = readUInt32BE(buf, 4);
          const ssrc = readUInt32BE(buf, 8);
          const headerSize = MIN_HEADER_SIZE + csrcCount * 4;
          if (buf.length < headerSize) {
              throw new Error('buffer too small for CSRC list');
          }
          const csrc = [];
          let offset = 12;
          for (let i = 0; i < csrcCount; i++) {
              csrc.push(readUInt32BE(buf, offset));
              offset += 4;
          }
          const header = new RtpHeader(payloadType, sequenceNumber, timestamp, ssrc);
          header.version = version;
          header.padding = padding;
          header.extension = extension;
          header.marker = marker;
          header.csrc = csrc;
          if (extension) {
              if (buf.length < offset + 4) {
                  throw new Error('buffer too small for RTP extension header');
              }
              header.extensionProfile = readUInt16BE(buf, offset);
              const extWords = readUInt16BE(buf, offset + 2);
              const extBytes = extWords * 4;
              offset += 4;
              if (buf.length < offset + extBytes) {
                  throw new Error('buffer too small for RTP extension data');
              }
              header.extensionData = buf.slice(offset, offset + extBytes);
          }
          return header;
      }
  }
  class RtpPacket {
      header;
      payload;
      constructor(header, payload) {
          this.header = header;
          this.payload = payload;
      }
      size() {
          return this.header.size() + this.payload.length;
      }
      encode() {
          const buf = new Uint8Array(this.size());
          const headerSize = this.header.encode(buf);
          buf.set(this.payload, headerSize);
          return buf;
      }
      static decode(buf) {
          const header = RtpHeader.decode(buf);
          let end = buf.length;
          if (header.padding) {
              const padLen = buf[buf.length - 1];
              if (padLen > 0 && header.size() + padLen <= buf.length) {
                  end = buf.length - padLen;
              }
          }
          const payload = buf.slice(header.size(), end);
          return new RtpPacket(header, payload);
      }
  }

  const VideoMediaFrameInfo = { IDR: 0x08, Delta: 0x20 };
  const DEFAULT_VIDEO_RTP_STEP_SAMPLES = Math.round(90000 / 30);

  function videoRtpDurationSamples(durationMs) {
    if (!durationMs || durationMs <= 0) return DEFAULT_VIDEO_RTP_STEP_SAMPLES;
    const samples = Math.round((durationMs * 90000) / 1000);
    return samples || DEFAULT_VIDEO_RTP_STEP_SAMPLES;
  }

  function encodeWhatsappVideoExtension(ext) {
    const hasFrameNumber = ext.frameNumber !== null && ext.frameNumber !== undefined;
    const out = [];
    out.push(0x30 | ((hasFrameNumber ? 3 : 1) - 1), ext.mediaFrameInfo & 0xff);
    if (hasFrameNumber) {
      out.push((ext.frameNumber >>> 8) & 0xff, ext.frameNumber & 0xff);
    }
    out.push(0x51, (ext.initialBandwidth >>> 8) & 0xff, ext.initialBandwidth & 0xff);
    out.push(0x61, (ext.shortOffset >>> 8) & 0xff, ext.shortOffset & 0xff);
    out.push(0x91, (ext.transportSequence >>> 8) & 0xff, ext.transportSequence & 0xff);
    while (out.length % 4 !== 0) out.push(0);
    return new Uint8Array(out);
  }

  class VideoRtpStream {
    ssrc;
    sequenceNumber;
    timestamp;
    tsStride;
    transportSequence = 0;
    frameNumber = 1;
    firstPacket = true;
    constructor(ssrc, tsStride) {
      this.ssrc = ssrc;
      this.sequenceNumber = randomInt(0, 65536);
      this.timestamp = randomInt(0, 0xffffffff);
      this.tsStride = tsStride;
    }
    setTimestampStride(tsStride) {
      if (!tsStride) return false;
      this.tsStride = tsStride;
      return true;
    }

    nextPacket(lastInAccessUnit, mediaFrameInfo) {
      const frameNumber = this.firstPacket ? this.frameNumber : null;
      const ext = {
        mediaFrameInfo,
        frameNumber,
        initialBandwidth: 0,
        shortOffset: 0,
        transportSequence: this.transportSequence
      };
      const header = new RtpHeader(PayloadType.H264, this.sequenceNumber, this.timestamp, this.ssrc);
      header.marker = lastInAccessUnit;
      header.extension = true;
      header.extensionProfile = 0xdebe;
      header.extensionData = encodeWhatsappVideoExtension(ext);
      this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
      this.transportSequence = (this.transportSequence + 1) & 0xffff;
      if (lastInAccessUnit) {
        this.timestamp = (this.timestamp + this.tsStride) >>> 0;
        this.frameNumber = (this.frameNumber + 1) & 0xffff;
        this.firstPacket = true;
      } else {
        this.firstPacket = false;
      }
      return header;
    }
  }

  class RtpSession {
      ssrc;
      payloadType;
      sequenceNumber;
      sampleRate;
      timestamp;
      samplesPerPacket;
      constructor(ssrc, payloadType, sampleRate, samplesPerPacket) {
          this.ssrc = ssrc;
          this.payloadType = payloadType;
          this.sequenceNumber = randomInt(0, 65536);
          this.sampleRate = sampleRate;
          this.timestamp = randomInt(0, 0xffffffff);
          this.samplesPerPacket = samplesPerPacket;
      }
      static whatsappOpus(ssrc) {
          return new RtpSession(ssrc, PayloadType.WhatsAppOpus, 16000, 960);
      }
      createPacket(payload, marker = false) {
          const header = new RtpHeader(this.payloadType, this.sequenceNumber, this.timestamp, this.ssrc);
          header.marker = marker;
          this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
          this.timestamp = (this.timestamp + this.samplesPerPacket) >>> 0;
          return new RtpPacket(header, payload);
      }
      createPacketWithDuration(payload, durationSamples, marker = false) {
          const header = new RtpHeader(this.payloadType, this.sequenceNumber, this.timestamp, this.ssrc);
          header.marker = marker;
          this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
          this.timestamp = (this.timestamp + durationSamples) >>> 0;
          return new RtpPacket(header, payload);
      }
  }
  return { RtpHeader, RtpPacket, VideoMediaFrameInfo, videoRtpDurationSamples, VideoRtpStream, RtpSession };
})();

/* ═══ WaAppDataStream.js ════════════════════════════════════════════ */
const __WaAppDataStream = (() => {
  const { decodeAppDataPayload, encodeReactionPayload } = __app_data_protocol;
  const { randomInt } = __primitives;
  const { RtpHeader, RtpPacket } = __rtp;
  const DEFAULT_RETRANSMISSION_INTERVAL_MS = 60;
  const DEFAULT_CLEAR_INTERVAL_MS = 600;

  const MAX_TRACKED_TRANSACTIONS = 64;

  const WA_APP_DATA_PAYLOAD_TYPE = 119;

  class WaAppDataStream {
      ssrc;
      logger;
      sendPacket;
      retransmissionIntervalMs;
      clearIntervalMs;
      sequenceNumber = randomInt(0, 65_536);

      timestamp = randomInt(0, 0xffffffff);
      outgoing = null;
      retransmitTimer = null;

      seenTransactions = new Set();

      nextTransactionId = 1n;
      learnedPayloadType;
      configuredPayloadType;
      sframeRequired = false;
      sframeProtect = null;
      txReactionCount = 0;
      txReactionErrorCount = 0;
      rxReactionCount = 0;
      constructor(options) {
          this.logger = options.logger;
          this.ssrc = options.ssrc;
          this.sendPacket = options.sendPacket;
          this.configuredPayloadType = options.payloadType ?? null;
          this.learnedPayloadType = null;
          this.retransmissionIntervalMs =
              options.retransmissionIntervalMs ?? DEFAULT_RETRANSMISSION_INTERVAL_MS;
          this.clearIntervalMs = options.clearIntervalMs ?? DEFAULT_CLEAR_INTERVAL_MS;
      }

      get payloadType() {
          return this.configuredPayloadType ?? WA_APP_DATA_PAYLOAD_TYPE;
      }

      get peerPayloadType() {
          return this.learnedPayloadType;
      }

      observeInboundPayloadType(payloadType) {
          if (this.configuredPayloadType !== null || this.learnedPayloadType === payloadType)
              return;
          this.learnedPayloadType = payloadType;
      }

      setSframe(required, protect) {
          this.sframeRequired = required;
          this.sframeProtect = protect;
      }

      sendReaction(reaction) {
          const transactionId = this.nextTransactionId++;
          const payload = encodeReactionPayload({ transactionId, reaction });
          const clearAt = Date.now() + this.clearIntervalMs;
          this.outgoing = { payload, transactionId, reaction, clearAt };
          this.txReactionCount++;
          const sent = this.transmit();
          this.armRetransmission();
          return sent;
      }

      receive(payload, ssrc) {
          if (payload.length === 0)
              return EMPTY_REACTIONS;
          const decoded = decodeAppDataPayload(payload);
          if (!decoded) {
              return EMPTY_REACTIONS;
          }
          const fresh = [];
          for (const item of decoded.items) {
              const reaction = item.reaction;
              if (!reaction)
                  continue;
              const key = `${ssrc}:${reaction.transactionId}`;
              if (this.seenTransactions.has(key))
                  continue;
              this.rememberTransaction(key);
              this.rxReactionCount++;
              fresh.push(reaction);
          }
          return fresh;
      }
      close() {
          this.clearOutgoing();
          this.seenTransactions.clear();
      }
      rememberTransaction(key) {
          if (this.seenTransactions.size >= MAX_TRACKED_TRANSACTIONS) {
              const oldest = this.seenTransactions.values().next().value;
              if (oldest !== undefined)
                  this.seenTransactions.delete(oldest);
          }
          this.seenTransactions.add(key);
      }
      armRetransmission() {
          if (this.retransmitTimer)
              return;
          this.retransmitTimer = setInterval(() => {
              this.onRetransmissionTick();
          }, this.retransmissionIntervalMs);
          this.retransmitTimer.unref?.();
      }
      onRetransmissionTick() {
          const outgoing = this.outgoing;
          if (!outgoing) {
              this.clearOutgoing();
              return;
          }
          if (Date.now() >= outgoing.clearAt) {
              this.clearOutgoing();
              return;
          }
          this.transmit();
      }
      clearOutgoing() {
          this.outgoing = null;
          if (this.retransmitTimer) {
              clearInterval(this.retransmitTimer);
              this.retransmitTimer = null;
          }
      }
      transmit() {
          const outgoing = this.outgoing;
          if (!outgoing)
              return false;
          const payloadType = this.payloadType;
          try {
              const header = new RtpHeader(payloadType, this.sequenceNumber, this.timestamp, this.ssrc);
              this.sequenceNumber = (this.sequenceNumber + 1) & 0xffff;
              const payload = this.sframeProtect
                  ? this.sframeProtect(outgoing.payload)
                  : outgoing.payload;
              return this.sendPacket(new RtpPacket(header, payload));
          }
          catch (err) {
              this.txReactionErrorCount++;
              return false;
          }
      }
  }
  const EMPTY_REACTIONS = [];
  return { WA_APP_DATA_PAYLOAD_TYPE, WaAppDataStream };
})();

/* ═══ core.js ═══════════════════════════════════════════════════════ */
const __core = (() => {
  const noop = () => { };
  function createNoopLogger(level = 'trace') {
      const logger = {
          level,
          trace: noop,
          debug: noop,
          media: noop,
          info: noop,
          warn: noop,
          error: noop,
          child: (_bindings, options) => (options?.level ? createNoopLogger(options.level) : logger)
      };
      return logger;
  }
  const LEVELS = { trace: 0, debug: 1, media: 2, info: 3, warn: 4, error: 5, silent: 6 };
  function createConsoleLogger(level = 'info', bindings = {}) {
      const threshold = LEVELS[level] ?? LEVELS.info;
      const prefix = Object.entries(bindings)
          .map(([k, v]) => `${k}=${v}`)
          .join(' ');
      const line = (lvl, msg, meta) => {
          if (LEVELS[lvl] < threshold)
              return;
          const extra = meta ? ` ${safeJson(meta)}` : '';
          const tag = prefix ? `[voip ${prefix}]` : '[voip]';
          const out = lvl === 'error' || lvl === 'warn' ? console.error : console.log;
          out(`${tag} ${msg}${extra}`);
      };
      return {
          level,
          trace: (msg, meta) => line('trace', msg, meta),
          debug: (msg, meta) => line('debug', msg, meta),
          media: (msg, meta) => line('media', msg, meta),
          info: (msg, meta) => line('info', msg, meta),
          warn: (msg, meta) => line('warn', msg, meta),
          error: (msg, meta) => line('error', msg, meta),
          child: (childBindings = {}, options) => createConsoleLogger(options?.level ?? level, { ...bindings, ...childBindings })
      };
  }
  function safeJson(meta) {
      try {
          return JSON.stringify(meta, (_k, v) => (v instanceof Uint8Array ? `<${v.length} bytes>` : v));
      }
      catch {
          return String(meta);
      }
  }
  const RANDOM_PAD_MAX_16_MASK = 0x0f;
  function writeRandomPadMax16(message) {
      const padLength = (__ext_randomBytes(1)[0] & RANDOM_PAD_MAX_16_MASK) + 1;
      const out = new Uint8Array(message.length + padLength);
      out.set(message, 0);
      out.fill(padLength, message.length);
      return out;
  }
  function unpadPkcs7(bytes) {
      if (bytes.length === 0) {
          throw new Error('unpadPkcs7 given empty bytes');
      }
      const padLength = bytes[bytes.length - 1];
      if (padLength > bytes.length) {
          throw new Error(`unpadPkcs7 given ${bytes.length} bytes, but pad is ${padLength}`);
      }
      return bytes.subarray(0, bytes.length - padLength);
  }
  return { createNoopLogger, createConsoleLogger, writeRandomPadMax16, unpadPkcs7 };
})();

/* ═══ WaAudioEngine.js ══════════════════════════════════════════════ */
const __WaAudioEngine = (() => {
  const { TEXT_DECODER } = __bytes;
  const { createNoopLogger } = __core;
  const { DEFAULT_AUDIO_CONFIG } = __types;
  const FFMPEG_BIN = 'ffmpeg';
  const MAX_DECODE_BYTES = 128 * 1024 * 1024;
  const MAX_STDERR_CHARS = 16 * 1024;
  const ffmpegProbeCache = new Map();
  function probeBinary(bin) {
      return new Promise((resolve) => {
          execFile(bin, ['-version'], { timeout: 5_000 }, (err) => resolve(!err));
      });
  }
  async function hasFfmpeg(bin) {
      let available = ffmpegProbeCache.get(bin);
      if (available === undefined) {
          available = await probeBinary(bin);
          if (available) {
              ffmpegProbeCache.set(bin, available);
          }
      }
      return available;
  }
  function createSelfCorrectingInterval(callback, intervalMs) {
      let expected = performance.now() + intervalMs;
      let timer = null;
      let stopped = false;
      function tick() {
          if (stopped) return;
          if (performance.now() - expected > intervalMs * 3) {
              expected = performance.now();
          }
          callback();
          expected += intervalMs;
          timer = setTimeout(tick, Math.max(0, expected - performance.now()));
      }
      timer = setTimeout(tick, intervalMs);
      return {
          clear() {
              stopped = true;
              if (timer) clearTimeout(timer);
          }
      };
  }
  class WaAudioEngine {
      logger;
      audioSender = null;
      audioBuffer = null;
      audioScale = 1;
      audioPosition = 0;
      audioFinished = false;
      onAudioFinished = null;
      playbackInterval = null;
      captureInterval = null;
      circularBuffer;
      bufferWritePos = 0;
      bufferReadPos = 0;
      bufferLength = 0;
      sampleRate;
      captureChunkSize;
      maxBuffer;
      outputSize;
      intervalMs;
      silenceMode = false;
      externalMode = false;
      loopMode = false;
      liveWritePos = 0;
      extStarted = false;
      extPreBufferSize;
      extTargetBuffer;
      extHighWater;
      extMaxBuffer;
      streamPreBufferSize;
      streamHighWater;
      captureChunkBuffer;
      silenceChunkBuffer;
      playbackOutputBuffer;
      streamProc = null;
      streamMode = false;
      streamEnded = false;
      streamPaused = false;
      streamToken = 0;
      streamQueue = [];
      streamCarry = Buffer.alloc(0);
      constructor(config = {}) {
          const c = { ...DEFAULT_AUDIO_CONFIG, ...config };
          this.logger = config.logger ?? createNoopLogger();
          this.sampleRate = c.sampleRate;
          this.captureChunkSize = c.captureChunkSize;
          this.maxBuffer = c.maxBufferSize;
          this.outputSize = c.playbackOutputSize;
          this.intervalMs = c.intervalMs;
          this.circularBuffer = new Float32Array(this.maxBuffer);
          this.captureChunkBuffer = new Float32Array(this.captureChunkSize);
          this.silenceChunkBuffer = new Float32Array(this.captureChunkSize);
          this.playbackOutputBuffer = new Float32Array(this.outputSize);
          this.extPreBufferSize = Math.floor(this.sampleRate * 0.06);
          this.extTargetBuffer = Math.floor(this.sampleRate * 0.06);
          this.extHighWater = Math.floor(this.sampleRate * 0.2);
          this.extMaxBuffer = Math.floor(this.sampleRate);
          this.streamPreBufferSize = Math.floor(this.sampleRate * 0.3);
          this.streamHighWater = Math.floor(this.sampleRate * 0.6);
          this.streamMaxBacklog = Math.floor(this.sampleRate * 1);
      }
      setAudioSender(sender) {
          this.audioSender = sender;
      }
      setLoopMode(enabled) {
          this.loopMode = enabled;
      }
      setOnAudioFinished(callback) {
          this.onAudioFinished = callback;
      }
      setExternalMode(enabled) {
          this.stopStream();
          this.externalMode = enabled;
          this.extStarted = false;
          if (enabled) {
              this.audioBuffer = new Float32Array(this.extMaxBuffer);
              this.audioScale = 1;
              this.audioPosition = 0;
              this.liveWritePos = 0;
              this.audioFinished = false;
          }
      }
      isExternalMode() {
          return this.externalMode;
      }
      feedExternalAudio(data) {
          if (!this.externalMode || !this.audioBuffer)
              return 0;
          let incoming = data;
          if (incoming.length > this.extMaxBuffer) {
              incoming = incoming.subarray(incoming.length - this.extMaxBuffer);
          }
          if (this.liveWritePos + incoming.length > this.audioBuffer.length) {
              const unconsumed = this.liveWritePos - this.audioPosition;
              if (unconsumed > 0 && this.audioPosition > 0) {
                  this.audioBuffer.copyWithin(0, this.audioPosition, this.liveWritePos);
              }
              this.liveWritePos = Math.max(0, unconsumed);
              this.audioPosition = 0;
          }
          const overflow = this.liveWritePos + incoming.length - this.extMaxBuffer;
          if (overflow > 0) {
              const drop = Math.min(overflow, this.liveWritePos);
              if (drop > 0) {
                  this.audioBuffer.copyWithin(0, drop, this.liveWritePos);
                  this.liveWritePos -= drop;
              }
          }
          this.audioBuffer.set(incoming, this.liveWritePos);
          this.liveWritePos += incoming.length;
          return ((this.liveWritePos - this.audioPosition) / this.sampleRate) * 1000;
      }
      getLiveBufferMs() {
          if (!this.externalMode || !this.audioBuffer)
              return 0;
          return ((this.liveWritePos - this.audioPosition) / this.sampleRate) * 1000;
      }
      static feedWatermarksMs() {
          return {
              pauseMs: 120,
              resumeMs: 60
          };
      }
      isAudioFinished() {
          return this.audioFinished;
      }
      async loadSource(source) {
          if (WaAudioEngine.isRemoteSource(source)) {
              this.startStream(source);
              return;
          }
          await this.loadAudioFile(source);
      }
      static isRemoteSource(source) {
          return /^https?:\/\//i.test(String(source));
      }
      async loadAudioFile(audioPath) {
          this.setExternalMode(false);
          try {
              await access(audioPath);
          }
          catch {
              throw new Error(`File not found: ${audioPath}`);
          }
          if (!(await hasFfmpeg(FFMPEG_BIN))) {
              throw new Error('ffmpeg not found on PATH (install ffmpeg to load audio files)');
          }
          this.audioBuffer = null;
          this.audioBuffer = await this.decodeWithFFmpeg(audioPath);
          this.audioScale = 1 / 32768;
          this.audioPosition = 0;
          this.audioFinished = false;
      }
      async decodeWithFFmpeg(inputPath) {
          return new Promise((resolve, reject) => {
              const proc = spawn(FFMPEG_BIN, [
                  '-hide_banner',
                  '-loglevel',
                  'error',
                  '-i',
                  inputPath,
                  '-ac',
                  '1',
                  '-ar',
                  String(this.sampleRate),
                  '-acodec',
                  'pcm_s16le',
                  '-f',
                  's16le',
                  'pipe:1'
              ], { stdio: ['ignore', 'pipe', 'pipe'] });
              let pcm = Buffer.allocUnsafeSlow(1 << 20);
              let decodedBytes = 0;
              let stderr = '';
              let aborted = false;
              proc.stdout?.on('data', (chunk) => {
                  if (aborted)
                      return;
                  decodedBytes += chunk.length;
                  if (decodedBytes > MAX_DECODE_BYTES) {
                      aborted = true;
                      proc.kill('SIGKILL');
                      reject(new Error(`ffmpeg output exceeded ${MAX_DECODE_BYTES} bytes: ${inputPath}`));
                      return;
                  }
                  if (decodedBytes > pcm.length) {
                      const grown = Buffer.allocUnsafeSlow(Math.max(pcm.length * 2, decodedBytes));
                      pcm.copy(grown, 0, 0, decodedBytes - chunk.length);
                      pcm = grown;
                  }
                  chunk.copy(pcm, decodedBytes - chunk.length);
              });
              proc.stderr?.on('data', (chunk) => {
                  stderr = (stderr + TEXT_DECODER.decode(chunk)).slice(0, MAX_STDERR_CHARS);
              });
              proc.on('error', (err) => reject(new Error(`ffmpeg not available (install ffmpeg on PATH): ${err.message}`)));
              proc.on('close', (code) => {
                  if (aborted)
                      return;
                  if (code !== 0) {
                      reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
                      return;
                  }
                  const exact = pcm.length - decodedBytes > 1048576 ? Buffer.from(pcm.subarray(0, decodedBytes - (decodedBytes % 2))) : pcm;
                  resolve(new Int16Array(exact.buffer, exact.byteOffset, (exact === pcm ? decodedBytes : exact.length) >> 1));
                  pcm = null;
              });
          });
      }
      generateTestTone(frequency = 440, duration = 3, amplitude = 0.3) {
          const samples = this.sampleRate * duration;
          this.audioBuffer = new Float32Array(samples);
          this.audioScale = 1;
          this.audioPosition = 0;
          this.audioFinished = false;
          for (let i = 0; i < samples; i++) {
              const t = i / this.sampleRate;
              this.audioBuffer[i] = Math.sin(2 * Math.PI * frequency * t) * amplitude;
          }
      }
      startStream(source) {
          this.setExternalMode(true);
          this.streamMode = true;
          const token = this.streamToken;
          const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
          if (WaAudioEngine.isRemoteSource(source)) {
              args.push('-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5');
          }
          if (/\.m3u8/i.test(source))
              args.push('-live_start_index', '-1');
          args.push('-i', source, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', String(this.sampleRate), '-acodec', 'pcm_s16le', '-f', 's16le', 'pipe:1');
          const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'ignore'] });
          this.streamProc = proc;
          const markEnded = () => {
              if (token === this.streamToken) {
                  this.streamEnded = true;
              }
          };
          proc.stdout.on('data', (chunk) => {
              if (token !== this.streamToken) {
                  return;
              }
              this.streamQueue.push(this.toStreamSamples(chunk));
              this.pumpStream();
          });
          proc.on('error', markEnded);
          proc.on('close', markEnded);
      }
      stopStream() {
          this.streamToken++;
          if (this.streamProc) {
              this.streamProc.kill('SIGKILL');
              this.streamProc = null;
          }
          this.streamMode = false;
          this.streamEnded = false;
          this.streamPaused = false;
          this.streamQueue = [];
          this.streamCarry = Buffer.alloc(0);
      }
      toStreamSamples(chunk) {
          const bytes = this.streamCarry.length > 0 ? Buffer.concat([this.streamCarry, chunk]) : chunk;
          const usable = bytes.length - (bytes.length % 2);
          const samples = new Float32Array(usable / 2);
          for (let i = 0; i < samples.length; i++) {
              samples[i] = bytes.readInt16LE(i * 2) / 32768;
          }
          this.streamCarry = Buffer.from(bytes.subarray(usable));
          return samples;
      }
      pumpStream() {
          const proc = this.streamProc;
          if (!proc) {
              return;
          }
          while (this.streamQueue.length > 0) {
              const room = this.streamHighWater - (this.liveWritePos - this.audioPosition);
              if (room <= 0) {
                  break;
              }
              const head = this.streamQueue[0];
              const take = Math.min(head.length, room);
              this.feedExternalAudio(head.subarray(0, take));
              if (take < head.length) {
                  this.streamQueue[0] = head.subarray(take);
              }
              else {
                  this.streamQueue.shift();
              }
          }
          let queued = 0;
          for (const chunk of this.streamQueue)
              queued += chunk.length;
          if (queued > this.streamMaxBacklog) {
              proc.stdout?.pause();
          }
          else {
              proc.stdout?.resume();
          }
      }
      isStreamFinished() {
          if (this.audioFinished) {
              return true;
          }
          if (!this.streamEnded || this.streamQueue.length > 0 || this.audioPosition < this.liveWritePos) {
              return false;
          }
          this.audioFinished = true;
          const token = this.streamToken;
          setTimeout(() => {
              if (token === this.streamToken && this.onAudioFinished) {
                  this.onAudioFinished();
              }
          }, 0);
          return true;
      }
      startPlayback() {
          if (this.playbackInterval) {
              return;
          }
          this.resetBuffer();
          this.playbackInterval = createSelfCorrectingInterval(() => {
              this.readFromBuffer(this.outputSize);
          }, this.intervalMs);
      }
      stopPlayback() {
          if (this.playbackInterval) {
              this.playbackInterval.clear();
              this.playbackInterval = null;
          }
      }
      onPlaybackData(audioData) {
          this.writeToBuffer(audioData);
      }
      startSilenceCapture() {
          if (this.captureInterval) {
              return;
          }
          this.silenceMode = true;
          this.captureInterval = createSelfCorrectingInterval(() => {
              if (this.audioSender) {
                  try {
                      this.audioSender.sendCapturedAudio(this.silenceChunkBuffer);
                  }
                  catch { }
              }
          }, this.intervalMs);
      }
      startCapture() {
          if (this.captureInterval && this.silenceMode) {
              this.captureInterval.clear();
              this.captureInterval = null;
          }
          if (this.captureInterval) {
              return;
          }
          this.silenceMode = false;
          if (this.streamMode) {
              this.extStarted = this.liveWritePos - this.audioPosition >= this.streamPreBufferSize;
          }
          else if (this.externalMode) {
              this.audioPosition = Math.max(0, this.liveWritePos - this.extPreBufferSize);
              const available = this.liveWritePos - this.audioPosition;
              this.extStarted = available >= this.extPreBufferSize;
          }
          else {
              this.audioPosition = 0;
          }
          this.captureInterval = createSelfCorrectingInterval(() => {
              const chunk = this.getNextChunk();
              if (this.audioSender) {
                  try {
                      this.audioSender.sendCapturedAudio(chunk);
                  }
                  catch { }
              }
          }, this.intervalMs);
      }
      stopCapture() {
          if (this.captureInterval) {
              this.captureInterval.clear();
              this.captureInterval = null;
          }
      }
      stop() {
          this.stopPlayback();
          this.stopCapture();
          this.stopStream();
      }
      release() {
          this.stop();
          this.audioBuffer = null;
          this.audioPosition = 0;
          this.liveWritePos = 0;
          this.resetBuffer();
      }
      hasAudio() {
          return this.audioBuffer !== null && this.audioBuffer.length > 0;
      }
      resetBuffer() {
          this.bufferWritePos = 0;
          this.bufferReadPos = 0;
          this.bufferLength = 0;
      }
      writeToBuffer(data) {
          for (let i = 0; i < data.length && this.bufferLength < this.maxBuffer; i++) {
              this.circularBuffer[this.bufferWritePos] = data[i];
              this.bufferWritePos = (this.bufferWritePos + 1) % this.maxBuffer;
              this.bufferLength++;
          }
      }
      readFromBuffer(count) {
          this.playbackOutputBuffer.fill(0);
          for (let i = 0; i < count; i++) {
              if (this.bufferLength > 0) {
                  this.playbackOutputBuffer[i] = this.circularBuffer[this.bufferReadPos];
                  this.bufferReadPos = (this.bufferReadPos + 1) % this.maxBuffer;
                  this.bufferLength--;
              }
          }
          return this.playbackOutputBuffer;
      }
      getNextChunk() {
          if (!this.audioBuffer) {
              return this.silenceChunkBuffer;
          }
          if (this.streamMode) {
              this.pumpStream();
              if (this.isStreamFinished()) {
                  return this.silenceChunkBuffer;
              }
          }
          const endPos = this.externalMode ? this.liveWritePos : this.audioBuffer.length;
          if (endPos === 0 || (this.audioFinished && !this.externalMode)) {
              return this.silenceChunkBuffer;
          }
          if (this.externalMode) {
              const available = endPos - this.audioPosition;
              const preBuffer = this.streamMode ? this.streamPreBufferSize : this.extPreBufferSize;
              if (!this.extStarted) {
                  if (available < preBuffer && !this.streamEnded) {
                      return this.silenceChunkBuffer;
                  }
                  this.extStarted = true;
              }
              if (this.streamMode) {
                  if (available < this.captureChunkSize && !this.streamEnded) {
                      this.extStarted = false;
                      return this.silenceChunkBuffer;
                  }
              }
              else if (available > this.extHighWater) {
                  this.audioPosition = endPos - this.extTargetBuffer;
              }
              if (this.audioPosition >= endPos) {
                  return this.silenceChunkBuffer;
              }
          }
          this.captureChunkBuffer.fill(0);
          for (let i = 0; i < this.captureChunkSize; i++) {
              if (this.audioPosition >= endPos) {
                  if (this.loopMode && !this.externalMode && endPos > 0) {
                      this.audioPosition = 0;
                      if (this.audioPosition >= endPos) break;
                      continue;
                  }
                  if (!this.externalMode && !this.audioFinished) {
                      this.audioFinished = true;
                      if (this.onAudioFinished) {
                          const cb = this.onAudioFinished;
                          setTimeout(() => cb(), 0);
                      }
                  }
                  break;
              }
              this.captureChunkBuffer[i] = this.audioBuffer[this.audioPosition] * this.audioScale;
              this.audioPosition++;
          }
          return this.captureChunkBuffer;
      }
  }
  return { WaAudioEngine };
})();

/* ═══ record.js ═════════════════════════════════════════════════════ */
const __record = (() => {
  const ContentType = Object.freeze({
    CHANGE_CIPHER_SPEC: 20,
    ALERT: 21,
    HANDSHAKE: 22,
    APPLICATION_DATA: 23,
  });

  const DTLS_1_2_VERSION = Buffer.from([0xfe, 0xfd]);

  const RECORD_HEADER_LEN = 13;

  function encodeEpochSeq(epoch, sequenceNumber) {
    const buf = Buffer.alloc(8);
    buf.writeUInt16BE(epoch, 0);

    buf.writeUIntBE(Number(sequenceNumber & 0xffffffffffffn), 2, 6);
    return buf;
  }

  function decodeEpochSeq(buf) {
    const epoch = buf.readUInt16BE(0);
    const sequenceNumber = BigInt(buf.readUIntBE(2, 6));
    return { epoch, sequenceNumber };
  }

  function encodeRecord({ type, epoch, sequenceNumber, fragment }) {
    const header = Buffer.alloc(RECORD_HEADER_LEN);
    header.writeUInt8(type, 0);
    DTLS_1_2_VERSION.copy(header, 1);
    encodeEpochSeq(epoch, sequenceNumber).copy(header, 3);
    header.writeUInt16BE(fragment.length, 11);
    return Buffer.concat([header, fragment]);
  }

  function decodeRecords(datagram) {
    const records = [];
    let offset = 0;
    while (offset + RECORD_HEADER_LEN <= datagram.length) {
      const type = datagram.readUInt8(offset);

      const { epoch, sequenceNumber } = decodeEpochSeq(datagram.subarray(offset + 3, offset + 11));
      const length = datagram.readUInt16BE(offset + 11);
      const fragmentStart = offset + RECORD_HEADER_LEN;
      const fragmentEnd = fragmentStart + length;
      if (fragmentEnd > datagram.length) break;
      records.push({
        type,
        epoch,
        sequenceNumber,
        fragment: datagram.subarray(fragmentStart, fragmentEnd),
      });
      offset = fragmentEnd;
    }
    return records;
  }
  return { ContentType, DTLS_1_2_VERSION, encodeEpochSeq, decodeEpochSeq, encodeRecord, decodeRecords };
})();

/* ═══ aead.js ═══════════════════════════════════════════════════════ */
const __aead = (() => {
  const { encodeEpochSeq, DTLS_1_2_VERSION } = __record;
  const GCM_TAG_LEN = 16;
  const GCM_SALT_LEN = 4;
  const GCM_EXPLICIT_NONCE_LEN = 8;

  const aes128GcmParams = { keyLen: 16, fixedIvLen: GCM_SALT_LEN };

  function buildNonce(salt, epoch, sequenceNumber) {
    const explicitNonce = encodeEpochSeq(epoch, sequenceNumber);
    return Buffer.concat([salt, explicitNonce]);
  }

  function buildAdditionalData(epoch, sequenceNumber, type, plaintextLength) {
    return Buffer.concat([
      encodeEpochSeq(epoch, sequenceNumber),
      Buffer.from([type]),
      DTLS_1_2_VERSION,
      (() => { const b = Buffer.alloc(2); b.writeUInt16BE(plaintextLength, 0); return b; })(),
    ]);
  }

  function encryptRecord({ writeKey, salt, epoch, sequenceNumber, type, plaintext }) {
    const nonce = buildNonce(salt, epoch, sequenceNumber);
    const aad = buildAdditionalData(epoch, sequenceNumber, type, plaintext.length);
    const cipher = createCipheriv('aes-128-gcm', writeKey, nonce, { authTagLength: GCM_TAG_LEN });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    const explicitNonce = nonce.subarray(GCM_SALT_LEN);
    return Buffer.concat([explicitNonce, ciphertext, tag]);
  }

  function decryptRecord({ readKey, salt, epoch, sequenceNumber, type, fragment }) {
    const explicitNonce = fragment.subarray(0, GCM_EXPLICIT_NONCE_LEN);
    const tag = fragment.subarray(fragment.length - GCM_TAG_LEN);
    const ciphertext = fragment.subarray(GCM_EXPLICIT_NONCE_LEN, fragment.length - GCM_TAG_LEN);
    const nonce = Buffer.concat([salt, explicitNonce]);
    const plaintextLength = ciphertext.length;
    const aad = buildAdditionalData(epoch, sequenceNumber, type, plaintextLength);
    const decipher = createDecipheriv('aes-128-gcm', readKey, nonce, { authTagLength: GCM_TAG_LEN });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
  return { aes128GcmParams, encryptRecord, decryptRecord };
})();

/* ═══ der.js ════════════════════════════════════════════════════════ */
const __der = (() => {
  function encodeLength(len) {
    if (len < 0x80) return Buffer.from([len]);
    const bytes = [];
    let n = len;
    while (n > 0) {
      bytes.unshift(n & 0xff);
      n >>>= 8;
    }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }

  function tlv(tag, content) {
    return Buffer.concat([Buffer.from([tag]), encodeLength(content.length), content]);
  }

  const der = {
    sequence: (...parts) => tlv(0x30, Buffer.concat(parts)),
    set: (...parts) => tlv(0x31, Buffer.concat(parts)),
    contextConstructed: (tagNumber, ...parts) => tlv(0xa0 | tagNumber, Buffer.concat(parts)),

    integer: (value) => {

      let bytes;
      if (Buffer.isBuffer(value)) {
        bytes = value;
      } else {
        let n = BigInt(value);
        if (n === 0n) {
          bytes = Buffer.from([0]);
        } else {
          const out = [];
          while (n > 0n) {
            out.unshift(Number(n & 0xffn));
            n >>= 8n;
          }
          bytes = Buffer.from(out);
        }
      }

      if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
      return tlv(0x02, bytes);
    },

    bitString: (content, unusedBits = 0) => tlv(0x03, Buffer.concat([Buffer.from([unusedBits]), content])),
    octetString: (content) => tlv(0x04, content),
    nullValue: () => Buffer.from([0x05, 0x00]),
    objectIdentifier: (dotted) => {
      const parts = dotted.split('.').map(Number);
      const first = parts[0] * 40 + parts[1];
      const bytes = [first];
      for (const part of parts.slice(2)) {
        if (part < 0x80) {
          bytes.push(part);
          continue;
        }
        const chunk = [];
        let n = part;
        chunk.unshift(n & 0x7f);
        n >>>= 7;
        while (n > 0) {
          chunk.unshift((n & 0x7f) | 0x80);
          n >>>= 7;
        }
        bytes.push(...chunk);
      }
      return tlv(0x06, Buffer.from(bytes));
    },
    utf8String: (str) => tlv(0x0c, Buffer.from(str, 'utf8')),
    printableString: (str) => tlv(0x13, Buffer.from(str, 'ascii')),

    utcTime: (date) => {
      const yy = String(date.getUTCFullYear() % 100).padStart(2, '0');
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mi = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      return tlv(0x17, Buffer.from(`${yy}${mm}${dd}${hh}${mi}${ss}Z`, 'ascii'));
    },
  };

  function readTlv(buf, offset = 0) {
    const tag = buf.readUInt8(offset);
    let lenByte = buf.readUInt8(offset + 1);
    let lenStart = offset + 2;
    let length;
    if (lenByte & 0x80) {
      const numBytes = lenByte & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) length = (length << 8) | buf.readUInt8(lenStart + i);
      lenStart += numBytes;
    } else {
      length = lenByte;
    }
    const content = buf.subarray(lenStart, lenStart + length);
    return { tag, content, next: lenStart + length };
  }
  return { der, readTlv };
})();

/* ═══ cert-builder.js ═══════════════════════════════════════════════ */
const __cert_builder = (() => {
  const { der } = __der;
  const EC_PUBLIC_KEY_OID = '1.2.840.10045.2.1';
  const PRIME256V1_OID = '1.2.840.10045.3.1.7';
  const ECDSA_WITH_SHA256_OID = '1.2.840.10045.4.3.2';
  const COMMON_NAME_OID = '2.5.4.3';

  function rdnSequence(commonName) {
    return der.sequence(
      der.set(
        der.sequence(
          der.objectIdentifier(COMMON_NAME_OID),
          der.utf8String(commonName),
        ),
      ),
    );
  }

  function algorithmIdentifierEcdsaSha256() {
    return der.sequence(der.objectIdentifier(ECDSA_WITH_SHA256_OID));
  }

  function subjectPublicKeyInfo(spkiDer) {

    return spkiDer;
  }

  function ecdsaSignatureFromNode(sig) {
    return sig;
  }

  function generateSelfSignedCert(commonName = 'wa-voip') {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spkiDer = publicKey.export({ format: 'der', type: 'spki' });

    const serialNumber = __ext_randomBytes(16);
    const notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const notAfter = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const tbsCertificate = der.sequence(
      der.contextConstructed(0, der.integer(2)),
      der.integer(serialNumber),
      algorithmIdentifierEcdsaSha256(),
      rdnSequence(commonName),
      der.sequence(der.utcTime(notBefore), der.utcTime(notAfter)),
      rdnSequence(commonName),
      subjectPublicKeyInfo(spkiDer),

    );

    const signer = createSign('SHA256');
    signer.update(tbsCertificate);
    signer.end();
    const signature = ecdsaSignatureFromNode(signer.sign(privateKey));

    const certDer = der.sequence(
      tbsCertificate,
      algorithmIdentifierEcdsaSha256(),
      der.bitString(signature),
    );

    const spkiParsed = spkiOuterBitStringContent(spkiDer);
    const publicKeyPoint = spkiParsed.subarray(1);

    return { certDer, privateKey, publicKeyPoint };
  }

  function spkiOuterBitStringContent(spkiDer) {

    let offset = 0;
    const tag = spkiDer.readUInt8(offset);
    if (tag !== 0x30) throw new Error('generateSelfSignedCert: unexpected SPKI outer tag');

    offset = skipTlvHeader(spkiDer, offset).next === undefined ? offset : offset;
    const outer = readOneTlv(spkiDer, 0);

    const algId = readOneTlv(outer.content, 0);
    const bitString = readOneTlv(outer.content, algId.next);
    if (bitString.tag !== 0x03) throw new Error('generateSelfSignedCert: expected BIT STRING after AlgorithmIdentifier');
    return bitString.content;
  }

  function skipTlvHeader(buf, offset) {
    return readOneTlv(buf, offset);
  }

  function readOneTlv(buf, offset) {
    const tag = buf.readUInt8(offset);
    let lenByte = buf.readUInt8(offset + 1);
    let lenStart = offset + 2;
    let length;
    if (lenByte & 0x80) {
      const numBytes = lenByte & 0x7f;
      length = 0;
      for (let i = 0; i < numBytes; i++) length = (length << 8) | buf.readUInt8(lenStart + i);
      lenStart += numBytes;
    } else {
      length = lenByte;
    }
    return { tag, content: buf.subarray(lenStart, lenStart + length), next: lenStart + length };
  }
  return { generateSelfSignedCert };
})();

/* ═══ ecdhe.js ══════════════════════════════════════════════════════ */
const __ecdhe = (() => {
  const NAMED_CURVE_SECP256R1 = 23;

  function generateEcdheKeypair() {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    return {
      publicKeyPoint: ecdh.getPublicKey(),
      computeSharedSecret: (peerPublicKeyPoint) => ecdh.computeSecret(peerPublicKeyPoint),
    };
  }

  function buildEcdheSignedParams(clientRandom, serverRandom, publicKeyPoint) {
    return Buffer.concat([
      clientRandom,
      serverRandom,
      Buffer.from([3]),
      Buffer.from([0, NAMED_CURVE_SECP256R1]),
      Buffer.from([publicKeyPoint.length]),
      publicKeyPoint,
    ]);
  }

  function signEcdheParams(privateKey, signedParams) {
    const signer = createSign('SHA256');
    signer.update(signedParams);
    signer.end();
    return signer.sign(privateKey);
  }

  function verifyEcdheParams(peerPublicKey, signedParams, signature) {
    const verifier = createVerify('SHA256');
    verifier.update(signedParams);
    verifier.end();
    return verifier.verify(peerPublicKey, signature);
  }
  return { NAMED_CURVE_SECP256R1, generateEcdheKeypair, buildEcdheSignedParams, signEcdheParams, verifyEcdheParams };
})();

/* ═══ handshake-framing.js ══════════════════════════════════════════ */
const __handshake_framing = (() => {
  const HandshakeType = Object.freeze({
    HELLO_REQUEST: 0,
    CLIENT_HELLO: 1,
    SERVER_HELLO: 2,
    HELLO_VERIFY_REQUEST: 3,
    CERTIFICATE: 11,
    SERVER_KEY_EXCHANGE: 12,
    CERTIFICATE_REQUEST: 13,
    SERVER_HELLO_DONE: 14,
    CERTIFICATE_VERIFY: 15,
    CLIENT_KEY_EXCHANGE: 16,
    FINISHED: 20,
  });

  const HANDSHAKE_HEADER_LEN = 12;

  function writeUint24BE(buf, offset, value) {
    buf.writeUInt8((value >> 16) & 0xff, offset);
    buf.writeUInt8((value >> 8) & 0xff, offset + 1);
    buf.writeUInt8(value & 0xff, offset + 2);
  }
  function readUint24BE(buf, offset) {
    return (buf.readUInt8(offset) << 16) | (buf.readUInt8(offset + 1) << 8) | buf.readUInt8(offset + 2);
  }

  function encodeHandshakeMessage({ msgType, messageSeq, body, maxFragmentSize = 1200 }) {
    const totalLength = body.length;
    if (totalLength <= maxFragmentSize) {
      const header = Buffer.alloc(HANDSHAKE_HEADER_LEN);
      header.writeUInt8(msgType, 0);
      writeUint24BE(header, 1, totalLength);
      header.writeUInt16BE(messageSeq, 4);
      writeUint24BE(header, 6, 0);
      writeUint24BE(header, 9, totalLength);
      return [Buffer.concat([header, body])];
    }
    const fragments = [];
    let offset = 0;
    while (offset < totalLength) {
      const fragLen = Math.min(maxFragmentSize, totalLength - offset);
      const header = Buffer.alloc(HANDSHAKE_HEADER_LEN);
      header.writeUInt8(msgType, 0);
      writeUint24BE(header, 1, totalLength);
      header.writeUInt16BE(messageSeq, 4);
      writeUint24BE(header, 6, offset);
      writeUint24BE(header, 9, fragLen);
      fragments.push(Buffer.concat([header, body.subarray(offset, offset + fragLen)]));
      offset += fragLen;
    }
    return fragments;
  }

  function decodeHandshakeFragment(buf) {
    const msgType = buf.readUInt8(0);
    const length = readUint24BE(buf, 1);
    const messageSeq = buf.readUInt16BE(4);
    const fragmentOffset = readUint24BE(buf, 6);
    const fragmentLength = readUint24BE(buf, 9);
    const body = buf.subarray(HANDSHAKE_HEADER_LEN, HANDSHAKE_HEADER_LEN + fragmentLength);
    return {
      msgType, length, messageSeq, fragmentOffset, fragmentLength, body,
      consumed: HANDSHAKE_HEADER_LEN + fragmentLength,
    };
  }

  class HandshakeReassembler {
    #pending = new Map();

    addFragment({ msgType, length, messageSeq, fragmentOffset, fragmentLength, body }) {
      if (fragmentOffset === 0 && fragmentLength === length) {

        return { msgType, messageSeq, body: Buffer.from(body) };
      }
      let entry = this.#pending.get(messageSeq);
      if (!entry) {
        entry = { length, msgType, chunks: new Map() };
        this.#pending.set(messageSeq, entry);
      }
      entry.chunks.set(fragmentOffset, Buffer.from(body));

      let covered = 0;
      for (const chunk of entry.chunks.values()) covered += chunk.length;
      if (covered < entry.length) return null;
      const sortedOffsets = [...entry.chunks.keys()].sort((a, b) => a - b);
      const assembled = Buffer.concat(sortedOffsets.map((off) => entry.chunks.get(off)));
      this.#pending.delete(messageSeq);
      return { msgType: entry.msgType, messageSeq, body: assembled.subarray(0, entry.length) };
    }
  }

  function logicalHandshakeBytes({ msgType, messageSeq, body }) {
    const header = Buffer.alloc(HANDSHAKE_HEADER_LEN);
    header.writeUInt8(msgType, 0);
    writeUint24BE(header, 1, body.length);
    header.writeUInt16BE(messageSeq, 4);
    writeUint24BE(header, 6, 0);
    writeUint24BE(header, 9, body.length);
    return Buffer.concat([header, body]);
  }
  return { HandshakeType, encodeHandshakeMessage, decodeHandshakeFragment, HandshakeReassembler, logicalHandshakeBytes };
})();

/* ═══ handshake-messages.js ═════════════════════════════════════════ */
const __handshake_messages = (() => {
  const { der, readTlv } = __der;
  const CIPHER_SUITE_ECDHE_ECDSA_AES_128_GCM_SHA256 = 0xc02b;
  const COMPRESSION_METHOD_NULL = 0;
  const SIGNATURE_SCHEME_ECDSA_SECP256R1_SHA256 = 0x0403;
  const EXTENSION_SUPPORTED_GROUPS = 10;
  const EXTENSION_SIGNATURE_ALGORITHMS = 13;
  const NAMED_CURVE_SECP256R1 = 23;

  function u16(n) { const b = Buffer.alloc(2); b.writeUInt16BE(n, 0); return b; }
  function u8LenPrefixed(buf) { return Buffer.concat([Buffer.from([buf.length]), buf]); }
  function u16LenPrefixed(buf) { return Buffer.concat([u16(buf.length), buf]); }

  function buildClientHello({ clientRandom, sessionId = Buffer.alloc(0), cookie = Buffer.alloc(0) }) {
    const cipherSuites = u16LenPrefixed(u16(CIPHER_SUITE_ECDHE_ECDSA_AES_128_GCM_SHA256));
    const compressionMethods = u8LenPrefixed(Buffer.from([COMPRESSION_METHOD_NULL]));

    const supportedGroupsExt = Buffer.concat([
      u16(EXTENSION_SUPPORTED_GROUPS),
      u16LenPrefixed(u16LenPrefixed(u16(NAMED_CURVE_SECP256R1))),
    ]);
    const sigAlgsExt = Buffer.concat([
      u16(EXTENSION_SIGNATURE_ALGORITHMS),
      u16LenPrefixed(u16LenPrefixed(u16(SIGNATURE_SCHEME_ECDSA_SECP256R1_SHA256))),
    ]);
    const extensions = u16LenPrefixed(Buffer.concat([supportedGroupsExt, sigAlgsExt]));

    return Buffer.concat([
      Buffer.from([0xfe, 0xfd]),
      clientRandom,
      u8LenPrefixed(sessionId),
      u8LenPrefixed(cookie),
      cipherSuites,
      compressionMethods,
      extensions,
    ]);
  }

  function parseHelloVerifyRequest(body) {
    const cookieLen = body.readUInt8(2);
    const cookie = body.subarray(3, 3 + cookieLen);
    return { cookie };
  }

  function parseServerHello(body) {
    let offset = 2;
    const serverRandom = body.subarray(offset, offset + 32);
    offset += 32;
    const sessionIdLen = body.readUInt8(offset);
    offset += 1 + sessionIdLen;
    const cipherSuite = body.readUInt16BE(offset);
    offset += 2;
    const compressionMethod = body.readUInt8(offset);
    offset += 1;

    return { serverRandom, cipherSuite, compressionMethod };
  }

  function parseCertificate(body) {
    const listLen = (body.readUInt8(0) << 16) | (body.readUInt8(1) << 8) | body.readUInt8(2);
    const certificates = [];
    let offset = 3;
    const end = 3 + listLen;
    while (offset < end) {
      const certLen = (body.readUInt8(offset) << 16) | (body.readUInt8(offset + 1) << 8) | body.readUInt8(offset + 2);
      offset += 3;
      certificates.push(body.subarray(offset, offset + certLen));
      offset += certLen;
    }
    return { certificates };
  }

  function buildCertificate(certDer) {
    const oneCert = Buffer.concat([
      Buffer.from([(certDer.length >> 16) & 0xff, (certDer.length >> 8) & 0xff, certDer.length & 0xff]),
      certDer,
    ]);
    const listLen = oneCert.length;
    return Buffer.concat([
      Buffer.from([(listLen >> 16) & 0xff, (listLen >> 8) & 0xff, listLen & 0xff]),
      oneCert,
    ]);
  }

  function parseClientHello(body) {
    let offset = 2;
    const clientRandom = body.subarray(offset, offset + 32);
    offset += 32;
    const sessionIdLen = body.readUInt8(offset); offset += 1;
    const sessionId = body.subarray(offset, offset + sessionIdLen); offset += sessionIdLen;
    const cookieLen = body.readUInt8(offset); offset += 1;
    const cookie = body.subarray(offset, offset + cookieLen); offset += cookieLen;
    const cipherSuitesLen = body.readUInt16BE(offset); offset += 2;
    const cipherSuites = [];
    for (let i = 0; i < cipherSuitesLen; i += 2) cipherSuites.push(body.readUInt16BE(offset + i));
    offset += cipherSuitesLen;
    const compressionMethodsLen = body.readUInt8(offset); offset += 1;
    const compressionMethods = Array.from(body.subarray(offset, offset + compressionMethodsLen));
    return { clientRandom, sessionId, cookie, cipherSuites, compressionMethods };
  }

  function buildHelloVerifyRequest({ cookie }) {
    return Buffer.concat([
      Buffer.from([0xfe, 0xfd]),
      u8LenPrefixed(cookie),
    ]);
  }

  function buildServerHello({ serverRandom, sessionId = Buffer.alloc(0), cipherSuite, compressionMethod = COMPRESSION_METHOD_NULL }) {
    return Buffer.concat([
      Buffer.from([0xfe, 0xfd]),
      serverRandom,
      u8LenPrefixed(sessionId),
      u16(cipherSuite),
      Buffer.from([compressionMethod]),
    ]);
  }

  function buildServerHelloDone() {
    return Buffer.alloc(0);
  }

  function parseServerKeyExchange(body) {
    let offset = 0;
    const curveType = body.readUInt8(offset); offset += 1;
    const namedCurve = body.readUInt16BE(offset); offset += 2;
    const pointLen = body.readUInt8(offset); offset += 1;
    const publicKeyPoint = body.subarray(offset, offset + pointLen); offset += pointLen;
    const signatureScheme = body.readUInt16BE(offset); offset += 2;
    const sigLen = body.readUInt16BE(offset); offset += 2;
    const signature = body.subarray(offset, offset + sigLen); offset += sigLen;
    return { curveType, namedCurve, publicKeyPoint, signatureScheme, signature };
  }

  function buildServerKeyExchange({ publicKeyPoint, signature }) {
    return Buffer.concat([
      Buffer.from([3]),
      u16(NAMED_CURVE_SECP256R1),
      u8LenPrefixed(publicKeyPoint),
      u16(SIGNATURE_SCHEME_ECDSA_SECP256R1_SHA256),
      u16LenPrefixed(signature),
    ]);
  }

  function buildClientKeyExchange(publicKeyPoint) {
    return u8LenPrefixed(publicKeyPoint);
  }
  function parseClientKeyExchange(body) {
    const len = body.readUInt8(0);
    return { publicKeyPoint: body.subarray(1, 1 + len) };
  }

  function buildFinished(verifyData) { return verifyData; }
  function parseFinished(body) { return { verifyData: body }; }

  function buildCertificateVerify({ signatureScheme, signature }) {
    return Buffer.concat([u16(signatureScheme), u16LenPrefixed(signature)]);
  }
  return { CIPHER_SUITE_ECDHE_ECDSA_AES_128_GCM_SHA256, COMPRESSION_METHOD_NULL, SIGNATURE_SCHEME_ECDSA_SECP256R1_SHA256, EXTENSION_SUPPORTED_GROUPS, EXTENSION_SIGNATURE_ALGORITHMS, NAMED_CURVE_SECP256R1, buildClientHello, parseHelloVerifyRequest, parseServerHello, parseCertificate, buildCertificate, parseClientHello, buildHelloVerifyRequest, buildServerHello, buildServerHelloDone, parseServerKeyExchange, buildServerKeyExchange, buildClientKeyExchange, parseClientKeyExchange, buildFinished, parseFinished, buildCertificateVerify };
})();

/* ═══ prf.js ════════════════════════════════════════════════════════ */
const __prf = (() => {
  function pHashSha256(secret, seed, length) {
    const out = [];
    let outLen = 0;
    let a = seed;
    while (outLen < length) {
      a = createHmac('sha256', secret).update(a).digest();
      const chunk = createHmac('sha256', secret).update(Buffer.concat([a, seed])).digest();
      out.push(chunk);
      outLen += chunk.length;
    }
    return Buffer.concat(out).subarray(0, length);
  }

  function prf(secret, label, seed, length) {
    return pHashSha256(secret, Buffer.concat([Buffer.from(label, 'ascii'), seed]), length);
  }

  function deriveMasterSecret(preMasterSecret, clientRandom, serverRandom) {
    return prf(preMasterSecret, 'master secret', Buffer.concat([clientRandom, serverRandom]), 48);
  }

  function deriveKeyBlock(masterSecret, clientRandom, serverRandom, { keyLen, fixedIvLen }) {
    const needed = 2 * keyLen + 2 * fixedIvLen;
    const block = prf(masterSecret, 'key expansion', Buffer.concat([serverRandom, clientRandom]), needed);
    let offset = 0;
    const take = (n) => { const b = block.subarray(offset, offset + n); offset += n; return b; };
    return {
      clientWriteKey: take(keyLen),
      serverWriteKey: take(keyLen),
      clientWriteIv: take(fixedIvLen),
      serverWriteIv: take(fixedIvLen),
    };
  }

  function deriveVerifyData(masterSecret, label, handshakeHash) {
    return prf(masterSecret, label, handshakeHash, 12);
  }
  return { prf, deriveMasterSecret, deriveKeyBlock, deriveVerifyData };
})();

/* ═══ handshake.js ══════════════════════════════════════════════════ */
const __handshake = (() => {
  const { encryptRecord, decryptRecord, aes128GcmParams } = __aead;
  const { generateSelfSignedCert } = __cert_builder;
  const { generateEcdheKeypair, buildEcdheSignedParams, verifyEcdheParams, signEcdheParams } = __ecdhe;
  const { HandshakeType, encodeHandshakeMessage, decodeHandshakeFragment, HandshakeReassembler, logicalHandshakeBytes } = __handshake_framing;
  const msg = __handshake_messages;
  const { deriveMasterSecret, deriveKeyBlock, deriveVerifyData } = __prf;
  const { ContentType, encodeRecord, decodeRecords } = __record;
  const RETRANSMIT_TIMEOUTS_MS = [1000, 2000, 4000, 8000, 8000];
  const HANDSHAKE_TIMEOUT_MS = 25000;

  class DtlsClient extends EventEmitter {
    #sendDatagram;
    #state = 'idle';
    #messageSeq = 0;
    #reassembler = new HandshakeReassembler();
    #handshakeMessages = [];
    #clientRandom;
    #serverRandom;
    #cookie = Buffer.alloc(0);
    #ecdhe;
    #cert;
    #peerCertificates = [];
    #pendingServerKeyExchange = null;
    #serverRequestedClientCert = false;
    #masterSecret;
    #writeEpoch = 0;
    #writeSeq = 0n;
    #readSeqByEpoch = new Map([[0, -1n]]);
    #keys = null;
    #retransmitTimer = null;
    #retransmitAttempt = 0;
    #lastFlightDatagrams = [];
    #overallTimeoutTimer = null;

    constructor({ sendDatagram }) {
      super();
      this.#sendDatagram = sendDatagram;
    }

    start() {
      this.#clientRandom = __ext_randomBytes(32);
      this.#cert = generateSelfSignedCert('wa-voip');
      this.#state = 'wait_hvr';
      this.#sendFlight1();
      this.#overallTimeoutTimer = setTimeout(() => this.#fail(new Error('DTLS handshake timed out overall')), HANDSHAKE_TIMEOUT_MS);
    }

    close() {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
    }

    handleDatagram(datagram) {
      if (this.#state === 'closed') return;
      let records;
      try {
        records = decodeRecords(datagram);
      } catch {
        return;
      }
      for (const record of records) this.#handleRecord(record);
    }

    get isConnected() { return this.#state === 'connected'; }

    encryptApplicationData(plaintext) {
      if (!this.isConnected) throw new Error('DtlsClient.encryptApplicationData: not connected yet');
      const seq = this.#writeSeq++;
      const fragment = encryptRecord({
        writeKey: this.#keys.clientWriteKey, salt: this.#keys.clientWriteIv,
        epoch: this.#writeEpoch, sequenceNumber: seq, type: ContentType.APPLICATION_DATA, plaintext,
      });
      return encodeRecord({ type: ContentType.APPLICATION_DATA, epoch: this.#writeEpoch, sequenceNumber: seq, fragment });
    }

    decryptApplicationData(datagram) {
      const out = [];
      let records;
      try { records = decodeRecords(datagram); } catch (e) {
        return out;
      }
      for (const record of records) {
        if (record.type !== ContentType.APPLICATION_DATA) {
          this.#handleRecord(record);
          continue;
        }
        const readFloor = this.#readSeqByEpoch.get(record.epoch) ?? -1n;
        if (record.sequenceNumber <= readFloor) {
          continue;
        }
        try {
          const plaintext = decryptRecord({
            readKey: this.#keys.serverWriteKey, salt: this.#keys.serverWriteIv,
            epoch: record.epoch, sequenceNumber: record.sequenceNumber, type: record.type, fragment: record.fragment,
          });
          this.#readSeqByEpoch.set(record.epoch, record.sequenceNumber);
          out.push(plaintext);
        } catch { }
      }
      return out;
    }

    #sendFlight1() {
      const chBody = msg.buildClientHello({ clientRandom: this.#clientRandom, cookie: this.#cookie });
      const datagram = this.#packHandshakeMessage(HandshakeType.CLIENT_HELLO, chBody);
      this.#transmitFlight([datagram]);
    }

    #sendFlight3(serverPublicKeyPoint) {
      this.#ecdhe = generateEcdheKeypair();
      const preMasterSecret = this.#ecdhe.computeSharedSecret(serverPublicKeyPoint);
      this.#masterSecret = deriveMasterSecret(preMasterSecret, this.#clientRandom, this.#serverRandom);

      const certPart = this.#serverRequestedClientCert
        ? this.#packHandshakeMessage(HandshakeType.CERTIFICATE, msg.buildCertificate(this.#cert.certDer))
        : Buffer.alloc(0);

      const cke = this.#packHandshakeMessage(HandshakeType.CLIENT_KEY_EXCHANGE, msg.buildClientKeyExchange(this.#ecdhe.publicKeyPoint));

      const certVerifyPart = this.#serverRequestedClientCert
        ? this.#packHandshakeMessage(HandshakeType.CERTIFICATE_VERIFY, msg.buildCertificateVerify({
            signatureScheme: msg.SIGNATURE_SCHEME_ECDSA_SECP256R1_SHA256,

            signature: signEcdheParams(this.#cert.privateKey, Buffer.concat(this.#handshakeMessages)),
          }))
        : Buffer.alloc(0);

      this.#keys = deriveKeyBlock(this.#masterSecret, this.#clientRandom, this.#serverRandom, aes128GcmParams);
      const handshakeHashBeforeFinished = createHash('sha256').update(Buffer.concat(this.#handshakeMessages)).digest();
      const verifyData = deriveVerifyData(this.#masterSecret, 'client finished', handshakeHashBeforeFinished);
      const finishedBody = msg.buildFinished(verifyData);
      const finishedMsgSeq = this.#messageSeq++;
      const finishedLogical = logicalHandshakeBytes({ msgType: HandshakeType.FINISHED, messageSeq: finishedMsgSeq, body: finishedBody });
      const finishedFragments = encodeHandshakeMessage({ msgType: HandshakeType.FINISHED, messageSeq: finishedMsgSeq, body: finishedBody });

      this.#handshakeMessages.push(finishedLogical);

      const ccsRecord = encodeRecord({ type: ContentType.CHANGE_CIPHER_SPEC, epoch: this.#writeEpoch, sequenceNumber: this.#writeSeq++, fragment: Buffer.from([1]) });
      this.#writeEpoch = 1;
      this.#writeSeq = 0n;

      const finishedSeq = this.#writeSeq++;
      const encryptedFinished = encryptRecord({
        writeKey: this.#keys.clientWriteKey, salt: this.#keys.clientWriteIv,
        epoch: this.#writeEpoch, sequenceNumber: finishedSeq, type: ContentType.HANDSHAKE, plaintext: finishedFragments[0],
      });
      const finishedRecord = encodeRecord({ type: ContentType.HANDSHAKE, epoch: this.#writeEpoch, sequenceNumber: finishedSeq, fragment: encryptedFinished });

      this.#state = 'wait_server_finished';

      this.#transmitFlight([Buffer.concat([certPart, cke, certVerifyPart, ccsRecord, finishedRecord])]);
    }

    #packHandshakeMessage(msgType, body) {
      const seq = this.#messageSeq++;
      const fragments = encodeHandshakeMessage({ msgType, messageSeq: seq, body });
      this.#handshakeMessages.push(logicalHandshakeBytes({ msgType, messageSeq: seq, body }));
      return Buffer.concat(fragments.map((f) => encodeRecord({ type: ContentType.HANDSHAKE, epoch: this.#writeEpoch, sequenceNumber: this.#writeSeq++, fragment: f })));
    }

    #transmitFlight(datagrams) {
      this.#lastFlightDatagrams = datagrams;
      this.#retransmitAttempt = 0;
      for (const d of datagrams) this.#sendDatagram(d);
      this.#armRetransmit();
    }

    #armRetransmit() {
      clearTimeout(this.#retransmitTimer);
      if (this.#state === 'connected' || this.#state === 'closed') return;
      const timeout = RETRANSMIT_TIMEOUTS_MS[Math.min(this.#retransmitAttempt, RETRANSMIT_TIMEOUTS_MS.length - 1)];
      this.#retransmitTimer = setTimeout(() => {
        this.#retransmitAttempt += 1;
        for (const d of this.#lastFlightDatagrams) this.#sendDatagram(d);
        this.#armRetransmit();
      }, timeout);
    }

    #handleRecord(record) {
      if (record.type === ContentType.HANDSHAKE) {
        if (record.epoch === 0) {
          const decoded = decodeHandshakeFragment(record.fragment);
          const complete = this.#reassembler.addFragment(decoded);
          if (complete) this.#handleHandshakeMessage(complete);
          return;
        }
        if (record.epoch === 1 && this.#state === 'wait_server_finished') {
          this.#tryDecryptServerFinished(record);
          return;
        }
        return;
      }
      if (record.type === ContentType.CHANGE_CIPHER_SPEC) {
        return;
      }
      if (record.type === ContentType.ALERT) {
        this.#fail(new Error(`DTLS alert received (epoch ${record.epoch}): ${record.fragment.toString('hex')}`));
        return;
      }
    }

    #handleHandshakeMessage({ msgType, messageSeq, body }) {
      if (this.#state === 'wait_hvr' && msgType === HandshakeType.HELLO_VERIFY_REQUEST) {
        const { cookie } = msg.parseHelloVerifyRequest(body);
        this.#cookie = cookie;

        this.#handshakeMessages = [];
        this.#messageSeq = 0;
        this.#state = 'wait_server_flight';
        const chBody = msg.buildClientHello({ clientRandom: this.#clientRandom, cookie: this.#cookie });
        const datagram = this.#packHandshakeMessage(HandshakeType.CLIENT_HELLO, chBody);
        this.#transmitFlight([datagram]);
        return;
      }
      if (this.#state === 'wait_server_flight' || this.#state === 'wait_hvr') {
        this.#state = 'wait_server_flight';

        this.#handshakeMessages.push(logicalHandshakeBytes({ msgType, messageSeq, body }));
        if (msgType === HandshakeType.SERVER_HELLO) {
          const parsed = msg.parseServerHello(body);
          this.#serverRandom = parsed.serverRandom;
          return;
        }
        if (msgType === HandshakeType.CERTIFICATE) {
          this.#peerCertificates = msg.parseCertificate(body).certificates;
          return;
        }
        if (msgType === HandshakeType.SERVER_KEY_EXCHANGE) {
          this.#pendingServerKeyExchange = msg.parseServerKeyExchange(body);
          return;
        }
        if (msgType === HandshakeType.CERTIFICATE_REQUEST) {
          this.#serverRequestedClientCert = true;
          return;
        }
        if (msgType === HandshakeType.SERVER_HELLO_DONE) {
          this.#onServerHelloDone();
          return;
        }
      }
    }

    #onServerHelloDone() {
      if (!this.#serverRandom || this.#peerCertificates.length === 0 || !this.#pendingServerKeyExchange) {
        this.#fail(new Error('DTLS: ServerHelloDone arrived before a required prior message'));
        return;
      }
      try {
        const { publicKeyPoint, signature } = this.#pendingServerKeyExchange;
        const signedParams = buildEcdheSignedParams(this.#clientRandom, this.#serverRandom, publicKeyPoint);
        const leaf = new X509Certificate(this.#peerCertificates[0]);
        const ok = verifyEcdheParams(leaf.publicKey, signedParams, signature);
        if (!ok) throw new Error('ServerKeyExchange signature verification failed');
        this.#sendFlight3(publicKeyPoint);
      } catch (e) {
        this.#fail(new Error(`DTLS: ServerKeyExchange verification failed: ${e.message}`));
      }
    }

    #tryDecryptServerFinished(record) {
      const readFloor = this.#readSeqByEpoch.get(1) ?? -1n;
      if (record.sequenceNumber <= readFloor) return;
      let plaintext;
      try {
        plaintext = decryptRecord({
          readKey: this.#keys.serverWriteKey, salt: this.#keys.serverWriteIv,
          epoch: 1, sequenceNumber: record.sequenceNumber, type: ContentType.HANDSHAKE, fragment: record.fragment,
        });
      } catch (e) {
        this.#fail(new Error(`DTLS: failed to decrypt server Finished: ${e.message}`));
        return;
      }
      this.#readSeqByEpoch.set(1, record.sequenceNumber);
      const decoded = decodeHandshakeFragment(plaintext);
      if (decoded.msgType !== HandshakeType.FINISHED) return;
      const { verifyData } = msg.parseFinished(decoded.body);
      const handshakeHash = createHash('sha256').update(Buffer.concat(this.#handshakeMessages)).digest();
      const expected = deriveVerifyData(this.#masterSecret, 'server finished', handshakeHash);
      if (!expected.equals(verifyData)) {
        this.#fail(new Error('DTLS: server Finished verify_data mismatch — handshake integrity check failed'));
        return;
      }
      this.#state = 'connected';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
      this.emit('connected');
    }

    #fail(err) {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
      this.emit('error', err);
    }
  }

  class DtlsServer extends EventEmitter {
    #sendDatagram;
    #state = 'idle';
    #messageSeq = 0;
    #reassembler = new HandshakeReassembler();
    #handshakeMessages = [];
    #clientRandom;
    #serverRandom;
    #ecdhe;
    #cert;
    #masterSecret;
    #writeEpoch = 0;
    #writeSeq = 0n;
    #readSeqByEpoch = new Map([[0, -1n]]);
    #keys = null;
    #retransmitTimer = null;
    #retransmitAttempt = 0;
    #lastFlightDatagrams = [];
    #overallTimeoutTimer = null;

    constructor({ sendDatagram }) {
      super();
      this.#sendDatagram = sendDatagram;
    }

    startPassive() {
      this.#cert = generateSelfSignedCert('wa-voip');
      this.#state = 'wait_client_hello';
      this.#overallTimeoutTimer = setTimeout(() => this.#fail(new Error('DTLS handshake timed out overall (passive/server role)')), HANDSHAKE_TIMEOUT_MS);
    }

    close() {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
    }

    handleDatagram(datagram) {
      if (this.#state === 'closed') return;
      let records;
      try {
        records = decodeRecords(datagram);
      } catch {
        return;
      }
      for (const record of records) this.#handleRecord(record);
    }

    get isConnected() { return this.#state === 'connected'; }

    encryptApplicationData(plaintext) {
      if (!this.isConnected) throw new Error('DtlsServer.encryptApplicationData: not connected yet');
      const seq = this.#writeSeq++;
      const fragment = encryptRecord({
        writeKey: this.#keys.serverWriteKey, salt: this.#keys.serverWriteIv,
        epoch: this.#writeEpoch, sequenceNumber: seq, type: ContentType.APPLICATION_DATA, plaintext,
      });
      return encodeRecord({ type: ContentType.APPLICATION_DATA, epoch: this.#writeEpoch, sequenceNumber: seq, fragment });
    }

    decryptApplicationData(datagram) {
      const out = [];
      let records;
      try { records = decodeRecords(datagram); } catch (e) {
        return out;
      }
      for (const record of records) {
        if (record.type !== ContentType.APPLICATION_DATA) {
          this.#handleRecord(record);
          continue;
        }
        const readFloor = this.#readSeqByEpoch.get(record.epoch) ?? -1n;
        if (record.sequenceNumber <= readFloor) continue;
        try {
          const plaintext = decryptRecord({
            readKey: this.#keys.clientWriteKey, salt: this.#keys.clientWriteIv,
            epoch: record.epoch, sequenceNumber: record.sequenceNumber, type: record.type, fragment: record.fragment,
          });
          this.#readSeqByEpoch.set(record.epoch, record.sequenceNumber);
          out.push(plaintext);
        } catch { }
      }
      return out;
    }

    #handleRecord(record) {
      if (record.type === ContentType.HANDSHAKE) {
        if (record.epoch === 0) {
          const decoded = decodeHandshakeFragment(record.fragment);
          const complete = this.#reassembler.addFragment(decoded);
          if (complete) this.#handleHandshakeMessage(complete);
          return;
        }
        if (record.epoch === 1 && this.#state === 'wait_client_finished') {
          this.#tryDecryptClientFinished(record);
          return;
        }
        return;
      }
      if (record.type === ContentType.CHANGE_CIPHER_SPEC) return;
      if (record.type === ContentType.ALERT) {
        this.#fail(new Error(`DTLS alert received (epoch ${record.epoch}): ${record.fragment.toString('hex')}`));
        return;
      }
    }

    #handleHandshakeMessage({ msgType, messageSeq, body }) {
      if (this.#state === 'wait_client_hello' && msgType === HandshakeType.CLIENT_HELLO) {
        this.#handshakeMessages.push(logicalHandshakeBytes({ msgType, messageSeq, body }));
        const { clientRandom } = msg.parseClientHello(body);
        this.#clientRandom = clientRandom;
        this.#sendFlight2();
        return;
      }
      if (this.#state === 'wait_client_finished' && msgType === HandshakeType.CLIENT_KEY_EXCHANGE) {
        this.#handshakeMessages.push(logicalHandshakeBytes({ msgType, messageSeq, body }));
        const { publicKeyPoint } = msg.parseClientKeyExchange(body);
        this.#finishKeyExchange(publicKeyPoint);
        return;
      }
    }

    #sendFlight2() {
      this.#serverRandom = __ext_randomBytes(32);
      this.#ecdhe = generateEcdheKeypair();

      const shBody = msg.buildServerHello({ serverRandom: this.#serverRandom, cipherSuite: msg.CIPHER_SUITE_ECDHE_ECDSA_AES_128_GCM_SHA256 });
      const shDatagram = this.#packHandshakeMessage(HandshakeType.SERVER_HELLO, shBody);

      const certBody = msg.buildCertificate(this.#cert.certDer);
      const certDatagram = this.#packHandshakeMessage(HandshakeType.CERTIFICATE, certBody);

      const signedParams = buildEcdheSignedParams(this.#clientRandom, this.#serverRandom, this.#ecdhe.publicKeyPoint);
      const signature = signEcdheParams(this.#cert.privateKey, signedParams);
      const skeBody = msg.buildServerKeyExchange({ publicKeyPoint: this.#ecdhe.publicKeyPoint, signature });
      const skeDatagram = this.#packHandshakeMessage(HandshakeType.SERVER_KEY_EXCHANGE, skeBody);

      const shdBody = msg.buildServerHelloDone();
      const shdDatagram = this.#packHandshakeMessage(HandshakeType.SERVER_HELLO_DONE, shdBody);

      this.#state = 'wait_client_finished';
      this.#transmitFlight([Buffer.concat([shDatagram, certDatagram, skeDatagram, shdDatagram])]);
    }

    #finishKeyExchange(clientPublicKeyPoint) {
      try {
        const preMasterSecret = this.#ecdhe.computeSharedSecret(clientPublicKeyPoint);
        this.#masterSecret = deriveMasterSecret(preMasterSecret, this.#clientRandom, this.#serverRandom);
        this.#keys = deriveKeyBlock(this.#masterSecret, this.#clientRandom, this.#serverRandom, aes128GcmParams);
      } catch (e) {
        this.#fail(new Error(`DTLS: server-side key derivation failed: ${e.message}`));
      }
    }

    #tryDecryptClientFinished(record) {
      const readFloor = this.#readSeqByEpoch.get(1) ?? -1n;
      if (record.sequenceNumber <= readFloor) return;
      if (!this.#keys) {
        return;
      }
      let plaintext;
      try {
        plaintext = decryptRecord({
          readKey: this.#keys.clientWriteKey, salt: this.#keys.clientWriteIv,
          epoch: 1, sequenceNumber: record.sequenceNumber, type: ContentType.HANDSHAKE, fragment: record.fragment,
        });
      } catch (e) {
        this.#fail(new Error(`DTLS: failed to decrypt client Finished: ${e.message}`));
        return;
      }
      this.#readSeqByEpoch.set(1, record.sequenceNumber);
      const decoded = decodeHandshakeFragment(plaintext);
      if (decoded.msgType !== HandshakeType.FINISHED) return;
      const { verifyData } = msg.parseFinished(decoded.body);

      const handshakeHashForClient = createHash('sha256').update(Buffer.concat(this.#handshakeMessages)).digest();
      const expected = deriveVerifyData(this.#masterSecret, 'client finished', handshakeHashForClient);
      if (!expected.equals(verifyData)) {
        this.#fail(new Error('DTLS: client Finished verify_data mismatch — handshake integrity check failed'));
        return;
      }

      const clientFinishedLogical = logicalHandshakeBytes({ msgType: decoded.msgType, messageSeq: decoded.messageSeq, body: decoded.body });
      this.#handshakeMessages.push(clientFinishedLogical);
      this.#sendServerFinished();
    }

    #sendServerFinished() {
      const handshakeHash = createHash('sha256').update(Buffer.concat(this.#handshakeMessages)).digest();
      const verifyData = deriveVerifyData(this.#masterSecret, 'server finished', handshakeHash);
      const finishedBody = msg.buildFinished(verifyData);
      const finishedMsgSeq = this.#messageSeq++;
      const finishedFragments = encodeHandshakeMessage({ msgType: HandshakeType.FINISHED, messageSeq: finishedMsgSeq, body: finishedBody });

      const ccsRecord = encodeRecord({ type: ContentType.CHANGE_CIPHER_SPEC, epoch: this.#writeEpoch, sequenceNumber: this.#writeSeq++, fragment: Buffer.from([1]) });
      this.#writeEpoch = 1;
      this.#writeSeq = 0n;

      const finishedSeq = this.#writeSeq++;
      const encryptedFinished = encryptRecord({
        writeKey: this.#keys.serverWriteKey, salt: this.#keys.serverWriteIv,
        epoch: this.#writeEpoch, sequenceNumber: finishedSeq, type: ContentType.HANDSHAKE, plaintext: finishedFragments[0],
      });
      const finishedRecord = encodeRecord({ type: ContentType.HANDSHAKE, epoch: this.#writeEpoch, sequenceNumber: finishedSeq, fragment: encryptedFinished });

      this.#state = 'connected';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
      this.#transmitFlight([Buffer.concat([ccsRecord, finishedRecord])]);
      this.emit('connected');
    }

    #packHandshakeMessage(msgType, body) {
      const seq = this.#messageSeq++;
      const fragments = encodeHandshakeMessage({ msgType, messageSeq: seq, body });
      this.#handshakeMessages.push(logicalHandshakeBytes({ msgType, messageSeq: seq, body }));
      return Buffer.concat(fragments.map((f) => encodeRecord({ type: ContentType.HANDSHAKE, epoch: this.#writeEpoch, sequenceNumber: this.#writeSeq++, fragment: f })));
    }

    #transmitFlight(datagrams) {
      this.#lastFlightDatagrams = datagrams;
      this.#retransmitAttempt = 0;
      for (const d of datagrams) this.#sendDatagram(d);
      this.#armRetransmit();
    }

    #armRetransmit() {
      clearTimeout(this.#retransmitTimer);
      if (this.#state === 'connected' || this.#state === 'closed') return;
      const timeout = RETRANSMIT_TIMEOUTS_MS[Math.min(this.#retransmitAttempt, RETRANSMIT_TIMEOUTS_MS.length - 1)];
      this.#retransmitTimer = setTimeout(() => {
        this.#retransmitAttempt += 1;
        for (const d of this.#lastFlightDatagrams) this.#sendDatagram(d);
        this.#armRetransmit();
      }, timeout);
    }

    #fail(err) {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#overallTimeoutTimer);
      this.emit('error', err);
    }
  }
  return { DtlsClient, DtlsServer };
})();

/* ═══ crc32c.js ═════════════════════════════════════════════════════ */
const __crc32c = (() => {
  const TABLE = (() => {
    const table = new Uint32Array(256);
    const poly = 0x82f63b78;
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? (c >>> 1) ^ poly : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32c(data) {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  return { crc32c };
})();

/* ═══ wire.js ═══════════════════════════════════════════════════════ */
const __wire = (() => {
  const { crc32c } = __crc32c;
  const ChunkType = Object.freeze({
    DATA: 0,
    INIT: 1,
    INIT_ACK: 2,
    SACK: 3,
    HEARTBEAT: 4,
    HEARTBEAT_ACK: 5,
    ABORT: 6,
    SHUTDOWN: 7,
    SHUTDOWN_ACK: 8,
    ERROR: 9,
    COOKIE_ECHO: 10,
    COOKIE_ACK: 11,
    SHUTDOWN_COMPLETE: 14,
  });

  const COMMON_HEADER_LEN = 12;

  function pad4(len) { return (4 - (len % 4)) % 4; }

  function buildPacket({ sourcePort, destinationPort, verificationTag, chunks }) {
    const header = Buffer.alloc(COMMON_HEADER_LEN);
    header.writeUInt16BE(sourcePort, 0);
    header.writeUInt16BE(destinationPort, 2);
    header.writeUInt32BE(verificationTag >>> 0, 4);

    const body = Buffer.concat(chunks);
    const packetWithZeroChecksum = Buffer.concat([header, body]);
    const checksum = crc32c(packetWithZeroChecksum);

    packetWithZeroChecksum.writeUInt32LE(checksum, 8);
    return packetWithZeroChecksum;
  }

  function parsePacketHeader(datagram) {
    if (datagram.length < COMMON_HEADER_LEN) throw new Error('SCTP packet shorter than common header');
    const sourcePort = datagram.readUInt16BE(0);
    const destinationPort = datagram.readUInt16BE(2);
    const verificationTag = datagram.readUInt32BE(4) >>> 0;

    const receivedChecksum = datagram.readUInt32LE(8) >>> 0;
    const forVerification = Buffer.from(datagram);
    forVerification.writeUInt32BE(0, 8);
    const computedChecksum = crc32c(forVerification);
    if (computedChecksum !== receivedChecksum) {
      throw new Error(`SCTP checksum mismatch: got 0x${receivedChecksum.toString(16)}, computed 0x${computedChecksum.toString(16)}`);
    }
    return { sourcePort, destinationPort, verificationTag, chunksStart: COMMON_HEADER_LEN };
  }

  function splitChunks(datagram, chunksStart) {
    const chunks = [];
    let offset = chunksStart;
    while (offset + 4 <= datagram.length) {
      const type = datagram.readUInt8(offset);
      const flags = datagram.readUInt8(offset + 1);
      const length = datagram.readUInt16BE(offset + 2);
      if (length < 4 || offset + length > datagram.length) break;
      chunks.push({ type, flags, value: datagram.subarray(offset + 4, offset + length) });
      offset += length + pad4(length);
    }
    return chunks;
  }

  function encodeChunk(type, flags, value) {
    const length = 4 + value.length;
    const header = Buffer.alloc(4);
    header.writeUInt8(type, 0);
    header.writeUInt8(flags, 1);
    header.writeUInt16BE(length, 2);
    const padding = Buffer.alloc(pad4(length));
    return Buffer.concat([header, value, padding]);
  }

  const SUPPORTED_EXTENSIONS_PARAM_TYPE = 0x8008;
  const CHUNK_TYPE_RECONFIG = 130;
  const CHUNK_TYPE_FORWARD_TSN = 192;

  function buildSupportedExtensionsParam() {
    const chunkTypes = Buffer.from([CHUNK_TYPE_RECONFIG, CHUNK_TYPE_FORWARD_TSN]);
    const header = Buffer.alloc(4);
    header.writeUInt16BE(SUPPORTED_EXTENSIONS_PARAM_TYPE, 0);
    header.writeUInt16BE(4 + chunkTypes.length, 2);
    return Buffer.concat([header, chunkTypes, Buffer.alloc(pad4(4 + chunkTypes.length))]);
  }

  function buildInit({ initiateTag, advertisedReceiverWindow, outboundStreams, inboundStreams, initialTsn }) {
    const fixed = Buffer.alloc(16);
    fixed.writeUInt32BE(initiateTag >>> 0, 0);
    fixed.writeUInt32BE(advertisedReceiverWindow >>> 0, 4);
    fixed.writeUInt16BE(outboundStreams, 8);
    fixed.writeUInt16BE(inboundStreams, 10);
    fixed.writeUInt32BE(initialTsn >>> 0, 12);
    const value = Buffer.concat([fixed, buildSupportedExtensionsParam()]);
    return encodeChunk(ChunkType.INIT, 0, value);
  }

  function parseInitOrInitAck(chunkValue) {
    const initiateTag = chunkValue.readUInt32BE(0) >>> 0;
    const advertisedReceiverWindow = chunkValue.readUInt32BE(4) >>> 0;
    const outboundStreams = chunkValue.readUInt16BE(8);
    const inboundStreams = chunkValue.readUInt16BE(10);
    const initialTsn = chunkValue.readUInt32BE(12) >>> 0;

    let offset = 16;
    let stateCookie = null;
    while (offset + 4 <= chunkValue.length) {
      const paramType = chunkValue.readUInt16BE(offset);
      const paramLength = chunkValue.readUInt16BE(offset + 2);
      if (paramLength < 4 || offset + paramLength > chunkValue.length) break;
      const paramValue = chunkValue.subarray(offset + 4, offset + paramLength);
      if (paramType === 7) stateCookie = paramValue;
      offset += paramLength + pad4(paramLength);
    }
    return { initiateTag, advertisedReceiverWindow, outboundStreams, inboundStreams, initialTsn, stateCookie };
  }

  function buildInitAck({ initiateTag, advertisedReceiverWindow, outboundStreams, inboundStreams, initialTsn, stateCookie }) {
    const fixed = Buffer.alloc(16);
    fixed.writeUInt32BE(initiateTag >>> 0, 0);
    fixed.writeUInt32BE(advertisedReceiverWindow >>> 0, 4);
    fixed.writeUInt16BE(outboundStreams, 8);
    fixed.writeUInt16BE(inboundStreams, 10);
    fixed.writeUInt32BE(initialTsn >>> 0, 12);
    const cookieParamHeader = Buffer.alloc(4);
    cookieParamHeader.writeUInt16BE(7, 0);
    cookieParamHeader.writeUInt16BE(4 + stateCookie.length, 2);
    const cookieParam = Buffer.concat([cookieParamHeader, stateCookie, Buffer.alloc(pad4(4 + stateCookie.length))]);
    return encodeChunk(ChunkType.INIT_ACK, 0, Buffer.concat([fixed, cookieParam]));
  }

  function buildCookieEcho(stateCookie) {
    return encodeChunk(ChunkType.COOKIE_ECHO, 0, stateCookie);
  }

  function buildCookieAck() {
    return encodeChunk(ChunkType.COOKIE_ACK, 0, Buffer.alloc(0));
  }

  const DATA_HEADER_LEN = 12;

  function buildData({ tsn, streamId, streamSeq, ppid, payload, unordered = false, beginning = true, ending = true }) {
    let flags = 0;
    if (unordered) flags |= 0x04;
    if (beginning) flags |= 0x02;
    if (ending) flags |= 0x01;
    const value = Buffer.alloc(DATA_HEADER_LEN + payload.length);
    value.writeUInt32BE(tsn >>> 0, 0);
    value.writeUInt16BE(streamId, 4);
    value.writeUInt16BE(streamSeq, 6);
    value.writeUInt32BE(ppid >>> 0, 8);
    payload.copy(value, DATA_HEADER_LEN);
    return encodeChunk(ChunkType.DATA, flags, value);
  }

  function parseData(chunkFlags, chunkValue) {
    return {
      unordered: (chunkFlags & 0x04) !== 0,
      beginning: (chunkFlags & 0x02) !== 0,
      ending: (chunkFlags & 0x01) !== 0,
      tsn: chunkValue.readUInt32BE(0) >>> 0,
      streamId: chunkValue.readUInt16BE(4),
      streamSeq: chunkValue.readUInt16BE(6),
      ppid: chunkValue.readUInt32BE(8) >>> 0,
      payload: chunkValue.subarray(DATA_HEADER_LEN),
    };
  }

  function buildSack({ cumulativeTsnAck, advertisedReceiverWindow, gapAckBlocks = [] }) {
    const value = Buffer.alloc(12 + gapAckBlocks.length * 4);
    value.writeUInt32BE(cumulativeTsnAck >>> 0, 0);
    value.writeUInt32BE(advertisedReceiverWindow >>> 0, 4);
    value.writeUInt16BE(gapAckBlocks.length, 8);
    value.writeUInt16BE(0, 10);
    let offset = 12;
    for (const block of gapAckBlocks) {
      value.writeUInt16BE(block.start & 0xffff, offset);
      value.writeUInt16BE(block.end & 0xffff, offset + 2);
      offset += 4;
    }
    return encodeChunk(ChunkType.SACK, 0, value);
  }

  function parseSack(chunkValue) {
    const cumulativeTsnAck = chunkValue.readUInt32BE(0) >>> 0;
    const advertisedReceiverWindow = chunkValue.readUInt32BE(4) >>> 0;
    const gapAckBlocks = [];
    if (chunkValue.length >= 12) {
      const numGapBlocks = chunkValue.readUInt16BE(8);
      let offset = 12;
      for (let i = 0; i < numGapBlocks && offset + 4 <= chunkValue.length; i++) {
        gapAckBlocks.push({
          start: chunkValue.readUInt16BE(offset),
          end: chunkValue.readUInt16BE(offset + 2)
        });
        offset += 4;
      }
    }
    return { cumulativeTsnAck, advertisedReceiverWindow, gapAckBlocks };
  }

  function buildHeartbeat(heartbeatInfo) {
    const paramHeader = Buffer.alloc(4);
    paramHeader.writeUInt16BE(1, 0);
    paramHeader.writeUInt16BE(4 + heartbeatInfo.length, 2);
    return encodeChunk(ChunkType.HEARTBEAT, 0, Buffer.concat([paramHeader, heartbeatInfo, Buffer.alloc(pad4(4 + heartbeatInfo.length))]));
  }

  function buildHeartbeatAck(heartbeatParamValue) {

    const paramHeader = Buffer.alloc(4);
    paramHeader.writeUInt16BE(1, 0);
    paramHeader.writeUInt16BE(4 + heartbeatParamValue.length, 2);
    return encodeChunk(ChunkType.HEARTBEAT_ACK, 0, Buffer.concat([paramHeader, heartbeatParamValue, Buffer.alloc(pad4(4 + heartbeatParamValue.length))]));
  }

  function parseHeartbeatInfo(chunkValue) {
    const paramLength = chunkValue.readUInt16BE(2);
    return chunkValue.subarray(4, paramLength);
  }

  function buildAbort(reasonText = '') {
    return encodeChunk(ChunkType.ABORT, 0, Buffer.from(reasonText, 'utf8'));
  }
  return { ChunkType, buildPacket, parsePacketHeader, splitChunks, encodeChunk, buildInit, parseInitOrInitAck, buildInitAck, buildCookieEcho, buildCookieAck, buildData, parseData, buildSack, parseSack, buildHeartbeat, buildHeartbeatAck, parseHeartbeatInfo, buildAbort };
})();

/* ═══ association.js ════════════════════════════════════════════════ */
const __association = (() => {
  const sctp = __wire;
  const SCTP_PORT = 5000;
  const RETRANSMIT_TIMEOUT_MS = 1000;
  const MAX_INIT_RETRIES = 5;
  const HEARTBEAT_INTERVAL_MS = 5000;

  const SEND_WINDOW_SIZE = 32;
  const MAX_VIDEO_QUEUE_AGE_MS = 400;
  const MAX_QUEUED_VIDEO_PACKETS = 200;
  const MAX_QUEUED_AUDIO_FRAMES = 6;
  const inFlightLifetimeMs = 1000;
  const MAX_VIDEO_IN_FLIGHT = 24;
  const STALE_GAP_TSN_LIMIT = 512;
  const videoBurstBytes = 8192;
  const videoPaceBytesPerMs = 120;

  function randomUint32() {
    return __ext_randomBytes(4).readUInt32BE(0);
  }

  class SctpAssociation extends EventEmitter {
    #sendDtlsPayload;
    #state = 'idle';

    #myTag = randomUint32();
    #peerVerificationTag = 0;
    #initialTsn = randomUint32();
    #nextTsn;
    #stateCookie = null;
    #retransmitTimer = null;
    #initRetries = 0;
    #heartbeatTimer = null;
    #outboundStreamSeq = 0;
    #outboundVideoStreamSeq = 0;
    #inboundExpectedStreamSeq = 0;
    #reorderBuffer = new Map();
    #inFlight = new Map();
    #videoInFlightCount = 0;
    #videoFlushCount = 0;
    #audioQueue = [];
    #videoQueue = [];
    #inboundCumulativeTsn = -1;
    #inboundReceivedAheadTsns = new Set();
    #srttMs = null;
    #rttVarMs = 0;
    #rtoMs = RETRANSMIT_TIMEOUT_MS;
    #videoBudgetBytes = videoBurstBytes;
    #videoBudgetAt = performance.now();
    #paceTimer = null;

    constructor({ sendDtlsPayload }) {
      super();
      this.#sendDtlsPayload = sendDtlsPayload;
      this.#nextTsn = this.#initialTsn;
    }

    start() {
      this.#state = 'wait_init_ack';
      this.#sendInit();
    }

    close() {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#paceTimer);
      this.#paceTimer = null;
      clearInterval(this.#heartbeatTimer);
      for (const entry of this.#inFlight.values()) clearTimeout(entry.timer);
      this.#inFlight.clear();
      this.#videoInFlightCount = 0;
      this.#audioQueue = [];
      this.#videoQueue = [];
      this.#reorderBuffer.clear();
      this.#inboundReceivedAheadTsns.clear();
    }

    get isConnected() { return this.#state === 'connected'; }

    getSendBacklog() {
      return {
        queued: this.#audioQueue.length + this.#videoQueue.length,
        queuedAudio: this.#audioQueue.length,
        queuedVideo: this.#videoQueue.length,
        inFlight: this.#inFlight.size,
        retransmits: this.#retransmitCount,
        videoFlushes: this.#videoFlushCount
      };
    }

    send(payload, isAudio = true) {
      if (this.#state === 'closed') return;
      if (isAudio) {
        this.#audioQueue.push(payload);
        if (this.#audioQueue.length > MAX_QUEUED_AUDIO_FRAMES) {
          this.#audioQueue.splice(0, this.#audioQueue.length - MAX_QUEUED_AUDIO_FRAMES);
        }
      } else {
        const now = Date.now();
        this.#videoQueue.push({ payload, queuedAtMs: now });
        const oldest = this.#videoQueue[0];
        if (this.#videoQueue.length > MAX_QUEUED_VIDEO_PACKETS ||
          now - oldest.queuedAtMs > MAX_VIDEO_QUEUE_AGE_MS) {
          this.#videoQueue = [];
          this.#videoFlushCount++;
        }
      }
      this.#pumpSendQueue();
    }

    handleDtlsPayload(plaintext) {
      if (this.#state === 'closed') return;
      let header;
      try {
        header = sctp.parsePacketHeader(plaintext);
      } catch (e) {
        return;
      }
      if (this.#state !== 'wait_init_ack' && header.verificationTag !== this.#myTag) {
        return;
      }
      const chunks = sctp.splitChunks(plaintext, header.chunksStart);
      for (const chunk of chunks) this.#handleChunk(chunk, header);
    }

    #sendInit() {
      const chunk = sctp.buildInit({
        initiateTag: this.#myTag,
        advertisedReceiverWindow: 131072,

        outboundStreams: 65535,
        inboundStreams: 65535,
        initialTsn: this.#initialTsn,
      });

      const packet = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: 0, chunks: [chunk] });
      this.#sendDtlsPayload(packet);
      clearTimeout(this.#retransmitTimer);
      this.#retransmitTimer = setTimeout(() => {
        if (this.#state !== 'wait_init_ack') return;
        this.#initRetries += 1;
        if (this.#initRetries > MAX_INIT_RETRIES) {
          this.#fail(new Error('SCTP: INIT retransmit limit exceeded'));
          return;
        }
        this.#sendInit();
      }, RETRANSMIT_TIMEOUT_MS * Math.min(2 ** this.#initRetries, 8));
    }

    #sendCookieEcho() {
      const chunk = sctp.buildCookieEcho(this.#stateCookie);
      const packet = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: this.#peerVerificationTag, chunks: [chunk] });
      this.#sendDtlsPayload(packet);
      clearTimeout(this.#retransmitTimer);
      this.#retransmitTimer = setTimeout(() => {
        if (this.#state !== 'wait_cookie_ack') return;
        this.#sendCookieEcho();
      }, RETRANSMIT_TIMEOUT_MS);
    }

    #onConnected() {
      this.#state = 'connected';
      clearTimeout(this.#retransmitTimer);
      this.#heartbeatTimer = setInterval(() => this.#sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
      this.emit('connected');
      this.#pumpSendQueue();
    }

    #pumpSendQueue() {
      if (this.#state !== 'connected') return;
      while (this.#inFlight.size < SEND_WINDOW_SIZE) {
        let payload, isAudio;
        if (this.#audioQueue.length > 0) {
          payload = this.#audioQueue.shift();
          isAudio = true;
        } else if (this.#videoQueue.length > 0 && this.#videoInFlightCount < MAX_VIDEO_IN_FLIGHT) {
          this.#refillVideoBudget(performance.now());
          const headBytes = this.#videoQueue[0].payload.length;
          const neededBytes = Math.min(headBytes, videoBurstBytes);
          if (this.#videoBudgetBytes < neededBytes) {
            this.#scheduleVideoPump(neededBytes);
            break;
          }
          this.#videoBudgetBytes -= headBytes;
          payload = this.#videoQueue.shift().payload;
          isAudio = false;
        } else {
          break;
        }
        const tsn = this.#nextTsn;
        this.#nextTsn = (this.#nextTsn + 1) >>> 0;
        const streamSeq = isAudio ? this.#outboundStreamSeq++ : this.#outboundVideoStreamSeq++;
        const chunk = sctp.buildData({ tsn, streamId: 0, streamSeq, ppid: 53, payload, unordered: isAudio });
        const packet = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: this.#peerVerificationTag, chunks: [chunk] });
        const entry = { packet, timer: null, isAudio, createdAt: performance.now(), sentAt: performance.now(), retransmitted: false, missing: 0, attempts: 0 };
        this.#inFlight.set(tsn, entry);
        if (!isAudio) this.#videoInFlightCount++;
        this.#sendDtlsPayload(packet);
        this.#armDataRetransmit(tsn, entry);
      }
    }

    #retransmitCount = 0;

    #armDataRetransmit(tsn, entry) {
      clearTimeout(entry.timer);
      const delayMs = Math.min(RETRANSMIT_TIMEOUT_MS, this.#rtoMs * 2 ** entry.attempts);
      entry.timer = setTimeout(() => {
        if (!this.#inFlight.has(tsn)) return;
        if (performance.now() - entry.createdAt > inFlightLifetimeMs) {
          this.#abandonInFlight(tsn, entry);
          return;
        }
        this.#retransmitCount++;
        entry.attempts++;
        entry.retransmitted = true;
        entry.missing = 0;
        entry.sentAt = performance.now();
        this.#sendDtlsPayload(entry.packet);
        this.#armDataRetransmit(tsn, entry);
      }, delayMs);
    }

    #abandonInFlight(tsn, entry) {
      clearTimeout(entry.timer);
      this.#inFlight.delete(tsn);
      if (!entry.isAudio) this.#videoInFlightCount--;
      this.#pumpSendQueue();
    }

    #refillVideoBudget(now) {
      this.#videoBudgetBytes = Math.min(videoBurstBytes, this.#videoBudgetBytes + (now - this.#videoBudgetAt) * videoPaceBytesPerMs);
      this.#videoBudgetAt = now;
    }

    #scheduleVideoPump(bytesNeeded) {
      if (this.#paceTimer) return;
      const waitMs = Math.ceil((bytesNeeded - this.#videoBudgetBytes) / videoPaceBytesPerMs);
      this.#paceTimer = setTimeout(() => {
        this.#paceTimer = null;
        this.#pumpSendQueue();
      }, waitMs);
    }

    #updateRto(sampleMs) {
      if (this.#srttMs === null) {
        this.#srttMs = sampleMs;
        this.#rttVarMs = sampleMs / 2;
      } else {
        this.#rttVarMs = 0.75 * this.#rttVarMs + 0.25 * Math.abs(this.#srttMs - sampleMs);
        this.#srttMs = 0.875 * this.#srttMs + 0.125 * sampleMs;
      }
      this.#rtoMs = Math.min(RETRANSMIT_TIMEOUT_MS, Math.max(500, this.#srttMs + 4 * this.#rttVarMs));
    }

    #fastRetransmitMissing(highestTsn, latestAckedSentAt) {
      const reorderWindowMs = this.#srttMs === null ? 0 : this.#srttMs / 4;
      for (const [tsn, entry] of this.#inFlight) {
        const behind = (highestTsn - tsn) >>> 0;
        if (behind === 0 || behind >= 0x80000000) continue;
        if (performance.now() - entry.createdAt > inFlightLifetimeMs) continue;
        if (entry.sentAt + reorderWindowMs >= latestAckedSentAt) continue;
        entry.missing++;
        if (entry.missing < 3) continue;
        entry.missing = 0;
        entry.retransmitted = true;
        entry.sentAt = performance.now();
        this.#retransmitCount++;
        this.#sendDtlsPayload(entry.packet);
        this.#armDataRetransmit(tsn, entry);
      }
    }

    #handleChunk(chunk, header) {
      switch (chunk.type) {
        case sctp.ChunkType.INIT_ACK: {
          if (this.#state !== 'wait_init_ack') return;
          const parsed = sctp.parseInitOrInitAck(chunk.value);
          if (!parsed.stateCookie) { this.#fail(new Error('SCTP: INIT ACK missing State Cookie')); return; }
          this.#peerVerificationTag = parsed.initiateTag;
          this.#inboundExpectedStreamSeq = 0;
          this.#inboundCumulativeTsn = (parsed.initialTsn - 1) >>> 0;
          this.#inboundReceivedAheadTsns.clear();
          this.#stateCookie = parsed.stateCookie;
          this.#state = 'wait_cookie_ack';
          this.#initRetries = 0;
          this.#sendCookieEcho();
          return;
        }
        case sctp.ChunkType.COOKIE_ACK: {
          if (this.#state !== 'wait_cookie_ack') return;
          this.#onConnected();
          return;
        }
        case sctp.ChunkType.DATA: {
          const parsed = sctp.parseData(chunk.flags, chunk.value);
          this.#handleIncomingData(parsed);
          return;
        }
        case sctp.ChunkType.SACK: {
          const parsed = sctp.parseSack(chunk.value);
          this.#handleSack(parsed);
          return;
        }
        case sctp.ChunkType.HEARTBEAT: {
          const info = sctp.parseHeartbeatInfo(chunk.value);
          const ackChunk = sctp.buildHeartbeatAck(info);
          const packet = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: this.#peerVerificationTag, chunks: [ackChunk] });
          this.#sendDtlsPayload(packet);
          return;
        }
        case sctp.ChunkType.HEARTBEAT_ACK:
          return;
        case sctp.ChunkType.ABORT:
          this.#fail(new Error('SCTP: received ABORT from peer'));
          return;
        case sctp.ChunkType.ERROR:

          return;
        default:
          return;
      }
    }

    #handleIncomingData({ tsn, streamId, streamSeq, ppid, payload, unordered }) {
      this.#recordInboundTsn(tsn);
      this.#buildAndSendSack();

      if (streamId !== 0 || ppid !== 53) return;

      if (unordered) {
        this.emit('message', payload);
        return;
      }

      if (streamSeq === this.#inboundExpectedStreamSeq) {
        this.#inboundExpectedStreamSeq += 1;
        this.emit('message', payload);

        while (this.#reorderBuffer.has(this.#inboundExpectedStreamSeq)) {
          const buffered = this.#reorderBuffer.get(this.#inboundExpectedStreamSeq);
          this.#reorderBuffer.delete(this.#inboundExpectedStreamSeq);
          this.#inboundExpectedStreamSeq += 1;
          this.emit('message', buffered);
        }
      } else if (streamSeq > this.#inboundExpectedStreamSeq) {
        this.#reorderBuffer.set(streamSeq, payload);
        if (this.#reorderBuffer.size > STALE_GAP_TSN_LIMIT) {
          const bufferedSeqs = [...this.#reorderBuffer.keys()].sort((a, b) => a - b);
          this.#inboundExpectedStreamSeq = bufferedSeqs[0];
          const buffered = this.#reorderBuffer.get(this.#inboundExpectedStreamSeq);
          this.#reorderBuffer.delete(this.#inboundExpectedStreamSeq);
          this.#inboundExpectedStreamSeq += 1;
          this.emit('message', buffered);
          while (this.#reorderBuffer.has(this.#inboundExpectedStreamSeq)) {
            const next = this.#reorderBuffer.get(this.#inboundExpectedStreamSeq);
            this.#reorderBuffer.delete(this.#inboundExpectedStreamSeq);
            this.#inboundExpectedStreamSeq += 1;
            this.emit('message', next);
          }
        }
      }
    }

    #recordInboundTsn(tsn) {
      if (sackAcksTsn(this.#inboundCumulativeTsn, tsn)) {
        return;
      }
      this.#inboundReceivedAheadTsns.add(tsn);
      let next = (this.#inboundCumulativeTsn + 1) >>> 0;
      while (this.#inboundReceivedAheadTsns.has(next)) {
        this.#inboundReceivedAheadTsns.delete(next);
        this.#inboundCumulativeTsn = next;
        next = (this.#inboundCumulativeTsn + 1) >>> 0;
      }
      if (this.#inboundReceivedAheadTsns.size > STALE_GAP_TSN_LIMIT) {
        let maxAheadOffset = 0;
        for (const aheadTsn of this.#inboundReceivedAheadTsns) {
          const offset = (aheadTsn - this.#inboundCumulativeTsn) >>> 0;
          if (offset > maxAheadOffset) maxAheadOffset = offset;
        }
        const jumpTo = (this.#inboundCumulativeTsn + maxAheadOffset) >>> 0;
        this.#inboundReceivedAheadTsns.delete(jumpTo);
        this.#inboundCumulativeTsn = jumpTo;
      }
    }

    #buildAndSendSack() {
      const gapAckBlocks = [];
      if (this.#inboundReceivedAheadTsns.size > 0) {
        const sorted = [...this.#inboundReceivedAheadTsns].sort((a, b) => {
          const diffA = (a - this.#inboundCumulativeTsn) >>> 0;
          const diffB = (b - this.#inboundCumulativeTsn) >>> 0;
          return diffA - diffB;
        });
        let blockStart = null;
        let blockEnd = null;
        for (const tsn of sorted) {
          const offset = (tsn - this.#inboundCumulativeTsn) >>> 0;
          if (offset > 0xffff) continue;
          if (blockStart !== null && offset === blockEnd + 1) {
            blockEnd = offset;
          } else {
            if (blockStart !== null) gapAckBlocks.push({ start: blockStart, end: blockEnd });
            blockStart = offset;
            blockEnd = offset;
          }
        }
        if (blockStart !== null) gapAckBlocks.push({ start: blockStart, end: blockEnd });
      }
      const sackChunk = sctp.buildSack({
        cumulativeTsnAck: this.#inboundCumulativeTsn,
        advertisedReceiverWindow: 131072,
        gapAckBlocks
      });
      const sackPacket = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: this.#peerVerificationTag, chunks: [sackChunk] });
      this.#sendDtlsPayload(sackPacket);
    }

    #handleSack({ cumulativeTsnAck, gapAckBlocks }) {
      if (this.#inFlight.size === 0) return;
      const now = performance.now();
      let acked = false;
      let rttSample = null;
      let latestAckedSentAt = -1;
      const release = (tsn, entry) => {
        clearTimeout(entry.timer);
        this.#inFlight.delete(tsn);
        if (!entry.isAudio) this.#videoInFlightCount--;
        if (!entry.retransmitted) rttSample = now - entry.sentAt;
        if (entry.sentAt > latestAckedSentAt) latestAckedSentAt = entry.sentAt;
        acked = true;
      };
      for (const [tsn, entry] of this.#inFlight) {
        if (sackAcksTsn(cumulativeTsnAck, tsn)) release(tsn, entry);
      }
      let highestGapOffset = -1;
      if (gapAckBlocks && gapAckBlocks.length > 0 && this.#inFlight.size > 0) {
        for (const block of gapAckBlocks) {
          if (block.end > highestGapOffset) highestGapOffset = block.end;
          for (const [tsn, entry] of this.#inFlight) {
            const offset = (tsn - cumulativeTsnAck) >>> 0;
            if (offset >= block.start && offset <= block.end) release(tsn, entry);
          }
        }
      }
      if (rttSample !== null) this.#updateRto(rttSample);
      if (highestGapOffset >= 0 && latestAckedSentAt >= 0) this.#fastRetransmitMissing((cumulativeTsnAck + highestGapOffset) >>> 0, latestAckedSentAt);
      if (acked) this.#pumpSendQueue();
    }

    #sendHeartbeat() {
      if (this.#state !== 'connected') return;
      const info = __ext_randomBytes(16);
      const chunk = sctp.buildHeartbeat(info);
      const packet = sctp.buildPacket({ sourcePort: SCTP_PORT, destinationPort: SCTP_PORT, verificationTag: this.#peerVerificationTag, chunks: [chunk] });
      this.#sendDtlsPayload(packet);
    }

    #fail(err) {
      this.#state = 'closed';
      clearTimeout(this.#retransmitTimer);
      clearTimeout(this.#paceTimer);
      this.#paceTimer = null;
      clearInterval(this.#heartbeatTimer);
      for (const entry of this.#inFlight.values()) clearTimeout(entry.timer);
      this.#inFlight.clear();
      this.#videoInFlightCount = 0;
      this.#audioQueue = [];
      this.#videoQueue = [];
      this.#reorderBuffer.clear();
      this.#inboundReceivedAheadTsns.clear();
      this.emit('error', err);
    }
  }

  function sackAcksTsn(cumAck, tsn) {
    const diff = (cumAck - tsn) >>> 0;
    return diff < 0x80000000;
  }
  return { SctpAssociation };
})();

/* ═══ pre-negotiated.js ═════════════════════════════════════════════ */
const __pre_negotiated = (() => {
  const { SctpAssociation } = __association;
  class PreNegotiatedDataChannel extends EventEmitter {
    #association;

    constructor({ sendDtlsPayload, logger }) {
      super();
      this.#association = new SctpAssociation({ sendDtlsPayload, logger });
      this.#association.on('connected', () => this.emit('open'));
      this.#association.on('message', (payload) => this.emit('message', payload));
      this.#association.on('error', (err) => this.emit('error', err));
    }

    start() { this.#association.start(); }
    close() { this.#association.close(); }
    getSendBacklog() { return this.#association.getSendBacklog(); }
    get readyState() { return this.#association.isConnected ? 'open' : 'connecting'; }

    handleDtlsPayload(plaintext) { this.#association.handleDtlsPayload(plaintext); }

    send(payload, isAudio = true) {
      this.#association.send(Buffer.isBuffer(payload) ? payload : Buffer.from(payload), isAudio);
    }
  }
  return { PreNegotiatedDataChannel };
})();

/* ═══ stun.js ═══════════════════════════════════════════════════════ */
const __stun = (() => {
  const { concatBytes, readBigUInt64BE, readUInt16BE, readUInt32BE, TEXT_DECODER, writeUInt16BE, writeUInt32BE } = __bytes;
  const { hmacSha1, randomBytes } = __primitives;
  const { bytesToHex } = __util;
  const STUN_MAGIC_COOKIE = 0x2112a442;
  const STUN_FINGERPRINT_XOR = 0x5354554e;
  const STUN_BINDING_REQUEST = 0x0001;
  const STUN_ALLOCATE_REQUEST = 0x0003;
  const WHATSAPP_PING = 0x0801;
  const WHATSAPP_PONG = 0x0802;
  const ATTR_USERNAME = 0x0006;
  const ATTR_MESSAGE_INTEGRITY = 0x0008;
  const ATTR_LIFETIME = 0x000d;
  const ATTR_XOR_RELAYED_ADDRESS = 0x0016;
  const ATTR_REQUESTED_TRANSPORT = 0x0019;
  const ATTR_PRIORITY = 0x0024;

  const ATTR_SENDER_SUBSCRIPTIONS = 0x4000;
  const ATTR_SSRC_LIST = 0x4024;
  const ATTR_ICE_CONTROLLED = 0x8029;
  const ATTR_XOR_MAPPED_ADDRESS = 0x0020;
  const ATTR_ICE_CONTROLLING = 0x802a;
  const ATTR_FINGERPRINT = 0x8028;
  const DEFAULT_ICE_PRIORITY = 16_777_215;
  function generateTransactionId() {
      return randomBytes(12);
  }
  function encodeAttribute(attrType, data) {
      const header = new Uint8Array(4);
      writeUInt16BE(header, attrType, 0);
      writeUInt16BE(header, data.length, 2);
      const padding = (4 - (data.length % 4)) % 4;
      const pad = new Uint8Array(padding);
      return concatBytes([header, data, pad]);
  }
  function crc32(data) {
      let crc = 0xffffffff;
      for (let i = 0; i < data.length; i++) {
          crc ^= data[i];
          for (let j = 0; j < 8; j++) {
              if (crc & 1) {
                  crc = (crc >>> 1) ^ 0xedb88320;
              }
              else {
                  crc >>>= 1;
              }
          }
      }
      return (crc ^ 0xffffffff) >>> 0;
  }
  function buildStunMessage(msgType, attrs, transactionId, integrityKey, includeFingerprint = true) {
      let attrsData = attrs;
      if (integrityKey) {
          const msgLenForHmac = attrsData.length + 24;
          const hmacHeader = new Uint8Array(20);
          writeUInt16BE(hmacHeader, msgType, 0);
          writeUInt16BE(hmacHeader, msgLenForHmac, 2);
          writeUInt32BE(hmacHeader, STUN_MAGIC_COOKIE, 4);
          hmacHeader.set(transactionId, 8);
          const hmacInput = concatBytes([hmacHeader, attrsData]);
          const hmac = hmacSha1(integrityKey, hmacInput);
          const miAttr = encodeAttribute(ATTR_MESSAGE_INTEGRITY, hmac);
          attrsData = concatBytes([attrsData, miAttr]);
      }
      if (includeFingerprint) {
          const msgLenForCrc = attrsData.length + 8;
          const crcHeader = new Uint8Array(20);
          writeUInt16BE(crcHeader, msgType, 0);
          writeUInt16BE(crcHeader, msgLenForCrc, 2);
          writeUInt32BE(crcHeader, STUN_MAGIC_COOKIE, 4);
          crcHeader.set(transactionId, 8);
          const crcInput = concatBytes([crcHeader, attrsData]);
          const fingerprint = (crc32(crcInput) ^ STUN_FINGERPRINT_XOR) >>> 0;
          const fpBuf = new Uint8Array(4);
          writeUInt32BE(fpBuf, fingerprint, 0);
          const fpAttr = encodeAttribute(ATTR_FINGERPRINT, fpBuf);
          attrsData = concatBytes([attrsData, fpAttr]);
      }
      const header = new Uint8Array(20);
      writeUInt16BE(header, msgType, 0);
      writeUInt16BE(header, attrsData.length, 2);
      writeUInt32BE(header, STUN_MAGIC_COOKIE, 4);
      header.set(transactionId, 8);
      return concatBytes([header, attrsData]);
  }
  function encodeVarint(value) {
      const bytes = [];
      let v = value >>> 0;
      while (v > 0x7f) {
          bytes.push((v & 0x7f) | 0x80);
          v >>>= 7;
      }
      bytes.push(v & 0x7f);
      return new Uint8Array(bytes);
  }
  function encodeProtobufVarintField(fieldNumber, value) {
      const tag = encodeVarint((fieldNumber << 3) | 0);
      const val = encodeVarint(value);
      return concatBytes([tag, val]);
  }
  function encodeProtobufLengthDelimited(fieldNumber, data) {
      const tag = encodeVarint((fieldNumber << 3) | 2);
      const len = encodeVarint(data.length);
      return concatBytes([tag, len, data]);
  }
  function buildSenderSubscriptions(ssrc) {
      const inner = concatBytes([
          encodeProtobufVarintField(3, ssrc),
          encodeProtobufVarintField(5, 0),
          encodeProtobufVarintField(6, 0)
      ]);
      return encodeProtobufLengthDelimited(1, inner);
  }
  function buildSSRCSubscriptionList(selfSsrcs, peerSsrcs, selfPid, peerPid) {
      const entries = [];
      for (const ssrc of selfSsrcs) {
          if (ssrc === 0)
              continue;
          const inner = concatBytes([
              encodeProtobufVarintField(1, selfPid),
              encodeProtobufVarintField(2, 1),
              encodeProtobufVarintField(3, ssrc)
          ]);
          entries.push(encodeProtobufLengthDelimited(1, inner));
      }
      for (const peerSsrc of peerSsrcs) {
          if (peerSsrc === 0)
              continue;
          const inner = concatBytes([
              encodeProtobufVarintField(1, peerPid),
              encodeProtobufVarintField(2, 1),
              encodeProtobufVarintField(3, peerSsrc)
          ]);
          entries.push(encodeProtobufLengthDelimited(1, inner));
      }
      return concatBytes(entries);
  }

  const WASM_STREAM_DESCRIPTOR_PLAN = [
      { participant: 0, layer: 0 },
      { participant: 0, layer: 1 },
      { participant: 0, layer: 2 },
      { participant: 1, layer: 0 },
      { participant: 1, layer: 1 },
      { participant: 1, layer: 2 },
      { participant: 2, layer: 0 },
      { participant: 2, layer: 1 },
      { participant: 2, layer: 2 }
  ];

  function createWasmStreamDescriptors(streamSsrcs, hbhFecSsrcs = []) {
      const entries = [];
      for (let i = 0; i < streamSsrcs.length; i++) {
          const ssrc = streamSsrcs[i];
          if (ssrc === 0)
              continue;
          const plan = WASM_STREAM_DESCRIPTOR_PLAN[i];
          const parts = [];
          if (plan.participant !== 0)
              parts.push(encodeProtobufVarintField(1, plan.participant));
          if (plan.layer !== 0)
              parts.push(encodeProtobufVarintField(2, plan.layer));
          parts.push(encodeProtobufVarintField(3, ssrc));
          entries.push(encodeProtobufLengthDelimited(1, concatBytes(parts)));
      }
      hbhFecSsrcs.forEach((ssrc, index) => {
          if (ssrc === 0) {
              return;
          }
          entries.push(encodeProtobufLengthDelimited(1, concatBytes([
              encodeProtobufVarintField(1, index + 3),
              encodeProtobufVarintField(2, 3),
              encodeProtobufVarintField(3, ssrc)
          ])));
      });
      return concatBytes(entries);
  }
  function createGroupSenderSubscription(ssrcs, pids, withVideoLayer) {
      const parts = [encodeProtobufLengthDelimited(1, concatBytes(ssrcs.filter((ssrc) => ssrc !== 0).map(encodeVarint)))];
      for (const pid of pids) {
          const participant = withVideoLayer
              ? concatBytes([encodeProtobufVarintField(1, pid), encodeProtobufVarintField(2, 1)])
              : encodeProtobufVarintField(1, pid);
          parts.push(encodeProtobufLengthDelimited(2, participant));
      }
      return encodeProtobufLengthDelimited(1, encodeProtobufLengthDelimited(1, concatBytes(parts)));
  }
  function createGroupSenderSubscriptions(streamSsrcs, appDataSsrc, pids) {
      return concatBytes([
          createGroupSenderSubscription(streamSsrcs.slice(3, 6), pids, true),
          createGroupSenderSubscription(streamSsrcs.slice(6, 9), [], false),
          createGroupSenderSubscription(streamSsrcs.slice(0, 3), pids, false),
          createGroupSenderSubscription([appDataSsrc], pids, false)
      ]);
  }
  function createGroupReceiverSubscriptions(pids) {
      return concatBytes(pids.map((pid) => encodeProtobufLengthDelimited(2, encodeProtobufVarintField(1, pid))));
  }
  function parseIpv4Bytes(ip) {
      const octets = ip.split('.');
      if (octets.length !== 4) {
          return null;
      }
      const out = new Uint8Array(4);
      for (let i = 0; i < 4; i++) {
          if (!/^\d{1,3}$/.test(octets[i]) || Number(octets[i]) > 255) {
              return null;
          }
          out[i] = Number(octets[i]);
      }
      return out;
  }
  function parseIpv6Bytes(text) {
      let ip = text;
      const zone = ip.indexOf('%');
      if (zone >= 0) {
          ip = ip.slice(0, zone);
      }
      if (ip.includes('.')) {
          const split = ip.lastIndexOf(':');
          const tail = split >= 0 ? parseIpv4Bytes(ip.slice(split + 1)) : null;
          if (!tail) {
              return null;
          }
          ip = `${ip.slice(0, split + 1)}${((tail[0] << 8) | tail[1]).toString(16)}:${((tail[2] << 8) | tail[3]).toString(16)}`;
      }
      const halves = ip.split('::');
      if (halves.length > 2) {
          return null;
      }
      const head = halves[0] ? halves[0].split(':') : [];
      const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
      const gap = 8 - head.length - tail.length;
      if (halves.length === 2 ? gap < 1 : gap !== 0) {
          return null;
      }
      const groups = [...head, ...new Array(halves.length === 2 ? gap : 0).fill('0'), ...tail];
      const out = new Uint8Array(16);
      for (let i = 0; i < 8; i++) {
          if (!/^[0-9a-fA-F]{1,4}$/.test(groups[i])) {
              return null;
          }
          const value = parseInt(groups[i], 16);
          out[i * 2] = value >> 8;
          out[i * 2 + 1] = value & 0xff;
      }
      return out;
  }
  function relayXorKey(transactionId) {
      const key = new Uint8Array(16);
      writeUInt32BE(key, STUN_MAGIC_COOKIE, 0);
      for (let i = 0; i < 12; i++) {
          key[4 + i] = transactionId[(i & ~3) + 3 - (i & 3)];
      }
      return key;
  }
  function stripAddressBrackets(text) {
      if (typeof text !== 'string') {
          return '';
      }
      const trimmed = text.trim();
      return trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  }
  function resolveRelayedAddressBytes(ip, form) {
      const bare = stripAddressBrackets(ip);
      if (!bare) {
          return null;
      }
      const ipv4 = bare.includes(':') ? null : parseIpv4Bytes(bare);
      const ipv6 = ipv4 ? null : parseIpv6Bytes(bare);
      if (!ipv4 && !ipv6) {
          return null;
      }
      if (form !== 'mapped') {
          return ipv4 ?? ipv6;
      }
      if (ipv6) {
          return ipv6;
      }
      const mapped = new Uint8Array(16);
      mapped.set([0xff, 0xff], 10);
      mapped.set(ipv4, 12);
      return mapped;
  }
  function encodeXorRelayedAddress(ip, port, transactionId, form = 'exact') {
      const portNumber = Number(port);
      if (!Number.isInteger(portNumber) || portNumber < 1 || portNumber > 65535) {
          return undefined;
      }
      if (!transactionId || transactionId.length !== 12) {
          return undefined;
      }
      const address = resolveRelayedAddressBytes(ip, form);
      if (!address) {
          return undefined;
      }
      const data = new Uint8Array(4 + address.length);
      data[1] = address.length === 16 ? 0x02 : 0x01;
      writeUInt16BE(data, portNumber ^ (STUN_MAGIC_COOKIE >>> 16), 2);
      const key = relayXorKey(transactionId);
      for (let i = 0; i < address.length; i++) {
          data[4 + i] = address[i] ^ key[i];
      }
      return data;
  }
  function parseRelayedAddressMismatch(reason) {
      if (typeof reason !== 'string') {
          return null;
      }
      const match = /destination address:\s*(.+?)\s+relay address:\s*(.+?)[\s\0]*$/i.exec(reason);
      if (!match) {
          return null;
      }
      const readEndpoint = (text) => {
          const hit = /^\[(.+)\]:(\d{1,5})$/.exec(text) ?? /^([^:\s]+):(\d{1,5})$/.exec(text);
          if (!hit) {
              return null;
          }
          const port = Number(hit[2]);
          return port >= 1 && port <= 65535 ? { ip: hit[1], port } : null;
      };
      return { destination: readEndpoint(match[1]), relay: readEndpoint(match[2]) };
  }
  function buildAllocateForRelay(relayToken, streamDescriptors, hmacKey, relayIp, relayPort, transactionId = generateTransactionId(), options = {}) {
      const parts = [];
      parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, relayToken));
      parts.push(encodeAttribute(ATTR_SSRC_LIST, streamDescriptors));
      if (relayIp && relayPort && options.relayedAddress !== 'none') {
          const xorRelayedAddress = encodeXorRelayedAddress(relayIp, relayPort, transactionId, options.relayedAddress);
          if (xorRelayedAddress) {
              parts.push(encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, xorRelayedAddress));
          }
      }
      const attrs = concatBytes(parts);
      return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, false);
  }
  function buildGroupAllocateForRelay(relayToken, group, hmacKey, relayIp, relayPort, transactionId = generateTransactionId(), options = {}) {
      const pids = [...new Set(group.pids)].sort((a, b) => a - b);
      if (pids.length === 0) {
          return buildAllocateForRelay(relayToken, createWasmStreamDescriptors(group.streamSsrcs), hmacKey, relayIp, relayPort, transactionId, options);
      }
      const parts = [
          encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, relayToken),
          encodeAttribute(0x4025, createGroupSenderSubscriptions(group.streamSsrcs, group.appDataSsrc, pids)),
          encodeAttribute(0x4021, createGroupReceiverSubscriptions(pids)),
          encodeAttribute(ATTR_SSRC_LIST, createWasmStreamDescriptors(group.streamSsrcs, pids.length > 1 ? group.hbhFecSsrcs ?? [] : [])),
          encodeAttribute(0x805a, encodeVarint(pids.length))
      ];
      if (relayIp && relayPort && options.relayedAddress !== 'none') {
          const xorRelayedAddress = encodeXorRelayedAddress(relayIp, relayPort, transactionId, options.relayedAddress);
          if (xorRelayedAddress) {
              parts.push(encodeAttribute(ATTR_XOR_RELAYED_ADDRESS, xorRelayedAddress));
          }
      }
      return buildStunMessage(STUN_ALLOCATE_REQUEST, concatBytes(parts), transactionId, hmacKey, false);
  }
  function buildBindingRequest(username, hmacKey, senderSubscriptions, includeIceControllingOrOptions = true) {
      const options = typeof includeIceControllingOrOptions === 'boolean'
          ? { iceRole: includeIceControllingOrOptions ? 'controlling' : 'none' }
          : (includeIceControllingOrOptions ?? {});
      const iceRole = options.iceRole ?? 'controlling';
      const includePriority = options.includePriority ?? true;
      const includeUsername = options.includeUsername ?? true;
      const transactionId = options.transactionId ?? generateTransactionId();
      const usernameAttr = includeUsername ? encodeAttribute(ATTR_USERNAME, username) : undefined;
      const priorityAttr = includePriority
          ? (() => {
              const priorityBuf = new Uint8Array(4);
              writeUInt32BE(priorityBuf, DEFAULT_ICE_PRIORITY, 0);
              return encodeAttribute(ATTR_PRIORITY, priorityBuf);
          })()
          : undefined;
      const parts = [];
      if (usernameAttr)
          parts.push(usernameAttr);
      if (priorityAttr)
          parts.push(priorityAttr);
      if (iceRole === 'controlling' || iceRole === 'controlled') {
          const tieBreaker = randomBytes(8);
          const attrType = iceRole === 'controlled' ? ATTR_ICE_CONTROLLED : ATTR_ICE_CONTROLLING;
          parts.push(encodeAttribute(attrType, tieBreaker));
      }
      if (senderSubscriptions && senderSubscriptions.length > 0) {
          parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions));
      }
      const attrs = concatBytes(parts);
      return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, true);
  }

  function encodeXorMappedAddressV4(ip, port) {
      const octets = ip.split('.').map((s) => Number(s) & 0xff);
      const buf = new Uint8Array(8);
      buf[0] = 0x00;
      buf[1] = 0x01;
      const xPort = port ^ (STUN_MAGIC_COOKIE >>> 16);
      writeUInt16BE(buf, xPort, 2);
      const cookieBytes = new Uint8Array(4);
      writeUInt32BE(cookieBytes, STUN_MAGIC_COOKIE, 0);
      for (let i = 0; i < 4; i++) buf[4 + i] = octets[i] ^ cookieBytes[i];
      return buf;
  }

  function buildBindingSuccessResponse(transactionId, mappedIp, mappedPort, hmacKey) {
      const xorAddr = encodeXorMappedAddressV4(mappedIp, mappedPort);
      const attrs = encodeAttribute(ATTR_XOR_MAPPED_ADDRESS, xorAddr);
      const STUN_BINDING_SUCCESS_RESPONSE = 0x0101;
      return buildStunMessage(STUN_BINDING_SUCCESS_RESPONSE, attrs, transactionId, hmacKey, true);
  }
  function buildBindingRequestWithSubs(username, hmacKey, senderSubscriptions, includeIceControlling, includeFingerprint, transactionId = generateTransactionId()) {
      const parts = [];
      if (username && username.length > 0) {
          parts.push(encodeAttribute(ATTR_USERNAME, username));
      }
      const priorityBuf = new Uint8Array(4);
      writeUInt32BE(priorityBuf, DEFAULT_ICE_PRIORITY, 0);
      parts.push(encodeAttribute(ATTR_PRIORITY, priorityBuf));
      if (includeIceControlling) {
          const tieBreaker = randomBytes(8);
          parts.push(encodeAttribute(ATTR_ICE_CONTROLLING, tieBreaker));
      }
      if (senderSubscriptions && senderSubscriptions.length > 0) {
          parts.push(encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions));
      }
      const attrs = concatBytes(parts);
      return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, hmacKey, includeFingerprint);
  }
  function buildMinimalBindingWithSubs(senderSubscriptions, includeFingerprint = false) {
      const transactionId = generateTransactionId();
      const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions);
      return buildStunMessage(STUN_BINDING_REQUEST, attrs, transactionId, undefined, includeFingerprint);
  }
  function buildMinimalAllocateWithSubs(senderSubscriptions, includeFingerprint = false) {
      const transactionId = generateTransactionId();
      const attrs = encodeAttribute(ATTR_SENDER_SUBSCRIPTIONS, senderSubscriptions);
      return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, undefined, includeFingerprint);
  }
  function buildAllocateRequest(username, hmacKey, lifetime = 3600) {
      const transactionId = generateTransactionId();
      const parts = [];
      parts.push(encodeAttribute(ATTR_REQUESTED_TRANSPORT, new Uint8Array([17, 0, 0, 0])));
      parts.push(encodeAttribute(ATTR_USERNAME, username));
      const lifetimeBuf = new Uint8Array(4);
      writeUInt32BE(lifetimeBuf, lifetime, 0);
      parts.push(encodeAttribute(ATTR_LIFETIME, lifetimeBuf));
      const attrs = concatBytes(parts);
      return buildStunMessage(STUN_ALLOCATE_REQUEST, attrs, transactionId, hmacKey, true);
  }
  function buildRelayBindingSuccess(transactionId, hmacKey) {
      return buildStunMessage(0x0101, new Uint8Array(0), transactionId, hmacKey, true);
  }
  function buildWhatsAppPing(transactionId = generateTransactionId()) {
      const header = new Uint8Array(20);
      writeUInt16BE(header, WHATSAPP_PING, 0);
      writeUInt16BE(header, 0, 2);
      writeUInt32BE(header, STUN_MAGIC_COOKIE, 4);
      header.set(transactionId, 8);
      return header;
  }
  function isStunPacket(data) {
      if (data.length < 2)
          return false;
      if ((data[0] & 0xc0) !== 0)
          return false;
      const type = readUInt16BE(data, 0);
      if (type === WHATSAPP_PING || type === WHATSAPP_PONG)
          return true;
      return data.length >= 8 && readUInt32BE(data, 4) === STUN_MAGIC_COOKIE;
  }
  function isRtpPacket(data) {
      if (data.length < 2)
          return false;
      return (data[0] & 0xc0) === 0x80;
  }
  const STUN_ATTR_NAMES = {
      0x0001: 'MAPPED-ADDRESS',
      0x0006: 'USERNAME',
      0x0008: 'MESSAGE-INTEGRITY',
      0x0009: 'ERROR-CODE',
      0x000a: 'UNKNOWN-ATTRIBUTES',
      0x0014: 'REALM',
      0x0015: 'NONCE',
      0x0019: 'REQUESTED-TRANSPORT',
      0x0020: 'XOR-MAPPED-ADDRESS',
      0x0024: 'PRIORITY',
      0x0025: 'USE-CANDIDATE',
      0x4000: 'SENDER-SUBSCRIPTIONS',
      0x4001: 'RECEIVER-SUBSCRIPTION',
      0x4002: 'SUBSCRIPTION-ACK',
      0x8022: 'SOFTWARE',
      0x8028: 'FINGERPRINT',
      0x8029: 'ICE-CONTROLLED',
      0x802a: 'ICE-CONTROLLING',
      0x4033: 'STABLE-ROUTING-CONN-ID'
  };
  function parseStunResponse(data) {
      if (data.length < 20)
          return null;
      const cookie = readUInt32BE(data, 4);
      if (cookie !== STUN_MAGIC_COOKIE) {
          const msgType = readUInt16BE(data, 0);
          if (msgType === 0x0801 || msgType === 0x0802) {
              return {
                  rawType: msgType,
                  method: msgType === 0x0801 ? 'wa-ping' : 'wa-pong',
                  stunClass: 'indication',
                  isSuccess: false,
                  isError: false,
                  transactionId: bytesToHex(data.subarray(8, 20)),
                  length: data.length,
                  attributes: []
              };
          }
          return null;
      }
      const rawType = readUInt16BE(data, 0);
      const msgLength = readUInt16BE(data, 2);
      const transactionId = bytesToHex(data.subarray(8, 20));
      const c0 = (rawType >> 4) & 0x1;
      const c1 = (rawType >> 8) & 0x1;
      const stunClassNum = (c1 << 1) | c0;
      const stunClass = ['request', 'indication', 'success', 'error'][stunClassNum] || 'unknown';
      const method_bits = ((rawType & 0x3e00) >> 2) | ((rawType & 0x00e0) >> 1) | (rawType & 0x000f);
      let method = 'unknown';
      switch (method_bits) {
          case 0x001:
              method = 'binding';
              break;
          case 0x003:
              method = 'allocate';
              break;
          case 0x004:
              method = 'refresh';
              break;
          case 0x006:
              method = 'send';
              break;
          case 0x007:
              method = 'data';
              break;
          case 0x008:
              method = 'create-permission';
              break;
          case 0x009:
              method = 'channel-bind';
              break;
      }
      if (rawType === 0x0801)
          method = 'wa-ping';
      if (rawType === 0x0802)
          method = 'wa-pong';
      const attributes = [];
      let errorCode;
      let errorReason;
      let stableRoutingConnId;
      let offset = 20;
      while (offset + 4 <= 20 + msgLength && offset + 4 <= data.length) {
          const attrType = readUInt16BE(data, offset);
          const attrLength = readUInt16BE(data, offset + 2);
          const attrEnd = offset + 4 + attrLength;
          if (attrEnd > data.length)
              break;
          const attrData = data.subarray(offset + 4, attrEnd);
          attributes.push({
              type: attrType,
              typeName: STUN_ATTR_NAMES[attrType] || `0x${attrType.toString(16).padStart(4, '0')}`,
              length: attrLength,
              data: attrData
          });
          if (attrType === 0x0009 && attrLength >= 4) {
              const errorClass = attrData[2] & 0x07;
              const errorNumber = attrData[3];
              errorCode = errorClass * 100 + errorNumber;
              if (attrLength > 4) {
                  errorReason = TEXT_DECODER.decode(attrData.subarray(4));
              }
          }
          if (attrType === 0x4033 && stunClass === 'success' && attrLength === 8) {
              stableRoutingConnId = readBigUInt64BE(attrData, 0);
          }
          offset = attrEnd + ((4 - (attrLength % 4)) % 4);
      }
      return {
          rawType,
          method,
          stunClass,
          isSuccess: stunClass === 'success',
          isError: stunClass === 'error',
          errorCode,
          errorReason,
          stableRoutingConnId,
          transactionId,
          length: data.length,
          attributes
      };
  }
  function formatStunResponse(info) {
      let result = `STUN ${info.method} ${info.stunClass} (0x${info.rawType.toString(16).padStart(4, '0')}, ${info.length}B)`;
      if (info.isError && info.errorCode) {
          result += ` ERROR ${info.errorCode}`;
          if (info.errorReason)
              result += `: ${info.errorReason}`;
      }
      if (info.attributes.length > 0) {
          const attrNames = info.attributes.map((a) => a.typeName).join(', ');
          result += ` [${attrNames}]`;
      }
      return result;
  }
  function classifyPacket(data) {
      if (data.length < 2)
          return `tiny(${data.length}B)`;
      const firstByte = data[0];
      const twoBits = (firstByte & 0xc0) >> 6;
      if (twoBits === 0) {
          const info = parseStunResponse(data);
          if (info)
              return formatStunResponse(info);
          const msgType = (data[0] << 8) | data[1];
          return `STUN? 0x${msgType.toString(16)} (${data.length}B)`;
      }
      if (twoBits === 2) {
          const pt = data[1] & 0x7f;
          const marker = (data[1] >> 7) & 1;
          const seq = data.length >= 4 ? (data[2] << 8) | data[3] : 0;
          return `RTP/SRTP PT=${pt} M=${marker} seq=${seq} (${data.length}B)`;
      }
      if (twoBits === 1) {
          return `DTLS? 0x${firstByte.toString(16)} (${data.length}B)`;
      }
      return `unknown 0x${firstByte.toString(16)} (${data.length}B)`;
  }
  return { buildSenderSubscriptions, buildSSRCSubscriptionList, createWasmStreamDescriptors, createGroupSenderSubscriptions, createGroupReceiverSubscriptions, parseRelayedAddressMismatch, buildAllocateForRelay, buildGroupAllocateForRelay, buildBindingRequest, buildBindingSuccessResponse, buildBindingRequestWithSubs, buildMinimalBindingWithSubs, buildMinimalAllocateWithSubs, buildAllocateRequest, buildRelayBindingSuccess, buildWhatsAppPing, isStunPacket, isRtpPacket, parseStunResponse, formatStunResponse, classifyPacket };
})();

/* ═══ WaManualRelay.js ══════════════════════════════════════════════ */
const __WaManualRelay = (() => {
  const { TEXT_ENCODER, toArrayBuffer } = __bytes;
  const { createNoopLogger } = __core;
  const { DtlsClient } = __handshake;
  const { PreNegotiatedDataChannel } = __pre_negotiated;
  const { randomBytes } = __primitives;
  const { buildAllocateForRelay, buildBindingRequest, buildBindingRequestWithSubs, buildRelayBindingSuccess, buildSenderSubscriptions, buildSSRCSubscriptionList, buildWhatsAppPing, createWasmStreamDescriptors, parseRelayedAddressMismatch, parseStunResponse } = __stun;
  const { PayloadType } = __types;
  const { toError } = __util;
  const CONFIG = {
    TRUE_WEB_CLIENT_RELAY_PORT: 3480,
    CONNECTION_TIMEOUT_MS: 20_000,

    ICE_BINDING_TIMEOUTS_MS: [250, 400, 600, 1000, 1500, 2000],
    KEEPALIVE_INTERVAL_MS: 1000,
    ICE_BINDING_ENABLED: false,
    ICE_CONSENT_REFRESH_ENABLED: false,
    ICE_CONSENT_REFRESH_MS: 400,
    MAX_BUFFER_SIZE: 256 * 1024,
  };

  const ConnectionState = {
    None: 'None',
    Connecting: 'Connecting',
    Open: 'Open',
    Closed: 'Closed',
    Failed: 'Failed',
  };

  function byteLengthOf(data) {
    return data?.byteLength ?? data?.length ?? 0;
  }

  function randomUfrag() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  class WaManualRelay extends EventEmitter {
    rejectedModes = new Set();
    answeredRelayNames = new Set();
    maxActiveRelays = 3;
    logger;
    connections = new Map();
    relayMap = new Map();
    standbyRelays = [];
    failedRelays = new Set();
    audioSsrc = 0;
    videoSsrc = 0;
    subscriptionSsrc = 0;
    streamSsrcs = null;
    selfPid = 0;
    peerPid = 0;
    rxStun = { bindReq: 0, bindAnswered: 0, allocOk: 0, allocErr: 0, pong: 0, other: 0 };
    configuring = false;
    globalBuffer = [];
    globalBufferedBytes = 0;
    stats = { sent: 0, received: 0, connected: 0 };
    retrySchedule = [1000, 2000, 4000];
    transports = ['dtls', 'raw'];
    allocateBuilder = null;
    destroyed = false;

    constructor(options = {}) {
      super();
      this.logger = options.logger ?? createNoopLogger();
      this.transports = options.transports ?? this.transports;
      this.maxActiveRelays = options.maxActiveRelays ?? this.maxActiveRelays;
      this.allocateBuilder = options.allocateBuilder ?? null;
    }

    setSsrc(ssrc) {
      this.audioSsrc = ssrc;
    }

    setParticipantIds(selfPid, peerPid) {
      this.selfPid = selfPid ?? 0;
      this.peerPid = peerPid ?? 0;
    }

    getRxStunStats() {
      return { ...this.rxStun };
    }

    setVideoSsrc(ssrc) {
      this.videoSsrc = ssrc;
    }

    setStreamSsrcs(ssrcs) {
      this.streamSsrcs = ssrcs;
    }

    setSubscriptionSsrc(ssrc) {
      this.subscriptionSsrc = ssrc;
    }

    setAllocateBuilder(builder) {
      this.allocateBuilder = builder;
    }

    refreshRelays(relays) {
      const infos = relays.map((relay) => this.toRelayInfo(relay));
      for (const conn of this.connections.values()) {
        const current = conn.relayInfo;
        const next = infos.find((info) => info.ip === current.ip && info.port === current.port && info.name === current.name)
          ?? infos.find((info) => info.ip === current.ip && info.port === current.port);
        if (!next) continue;
        conn.relayInfo = { ...next, id: current.id };
        this.relayMap.set(current.id, conn.relayInfo);
        conn.stunTransactionId = randomBytes(12);
      }
      this.resendSubscriptions();
    }

    makeConnectionId(ip, port, authTokenId) {
      const base = ip.includes(':') ? `[${ip}]:${port}` : `${ip}:${port}`;
      return authTokenId ? `${base}#${authTokenId}` : base;
    }

    toRelayInfo(relay) {
      const port = relay.port || CONFIG.TRUE_WEB_CLIENT_RELAY_PORT;
      return {
        id: this.makeConnectionId(relay.ip, port, relay.authTokenId),
        ip: relay.ip,
        port,
        token: relay.token,
        authToken: relay.authToken,
        rawAuthToken: relay.rawAuthToken,
        rawToken: relay.rawToken,
        key: relay.key,
        relayId: relay.relayId,
        name: relay.name || 'unknown',
        authTokenId: relay.authTokenId,
        isFna: relay.isFna,
        fallbackPort: port === CONFIG.TRUE_WEB_CLIENT_RELAY_PORT ? 3478 : CONFIG.TRUE_WEB_CLIENT_RELAY_PORT
      };
    }

    async configureRelays(relays) {
      this.destroyed = false;
      this.configuring = true;
      const infos = relays.map((relay) => this.toRelayInfo(relay)).filter((info) => !this.failedRelays.has(info.id));
      for (const info of infos) {
        if (this.relayMap.has(info.id)) {
          this.relayMap.set(info.id, info);
        }
        else if (this.relayMap.size < this.maxActiveRelays) {
          this.relayMap.set(info.id, info);
        }
      }
      this.standbyRelays = infos.filter((info) => !this.relayMap.has(info.id));
      const connectionPromises = [];
      for (const [, relayInfo] of this.relayMap) {
        if (!this.connections.has(relayInfo.id)) {
          connectionPromises.push(this.ensureConnection(relayInfo));
        }
      }
      if (connectionPromises.length > 0) {
        const settled = connectionPromises.map((promise) => promise.catch(() => {}));
        const firstOpen = new Promise((resolve) => {
          for (const promise of settled) {
            promise.then(() => {
              if (this.hasConnection()) resolve();
            });
          }
        });
        await Promise.race([Promise.all(settled), firstOpen]);
      }
      this.configuring = false;
      if (this.globalBuffer.length > 0) {
        for (const item of this.globalBuffer) this.sendToRelay(item.ip, item.port, item.data);
        this.globalBuffer = [];
        this.globalBufferedBytes = 0;
      }
    }

    buildRoutes(relayInfo) {
      const ports = [relayInfo.port];
      if (relayInfo.fallbackPort !== undefined && relayInfo.fallbackPort !== relayInfo.port) {
        ports.push(relayInfo.fallbackPort);
      }
      const routes = [];
      const preferRaw = !relayInfo.authToken && this.transports.includes('raw');
      const rank = (mode) => (this.rejectedModes.has(`${relayInfo.ip}|${mode}`) ? 2 : 0) + (preferRaw && mode !== 'raw' ? 1 : 0);
      const modes = [...this.transports].sort((a, b) => rank(a) - rank(b));
      for (const mode of modes) {
        for (const port of ports) {
          routes.push({ mode, port });
        }
      }
      if (routes.length === 0) {
        routes.push({ mode: 'dtls', port: relayInfo.port });
      }
      return routes;
    }

    applyRoute(conn, index) {
      const route = conn.routes[index];
      conn.routeIndex = index;
      conn.mode = route.mode;
      conn.dialPort = route.port;
      conn.returnPathSeen = false;
      this.restartAllocateLadder(conn);
    }

    restartAllocateLadder(conn) {
      conn.allocateStage = 0;
      conn.allocateLocked = false;
      conn.allocateExhausted = false;
      conn.allocateCandidates = null;
      conn.allocateAttempts.clear();
      conn.allocatePacket = null;
      conn.proven = false;
      conn.refused = false;
      conn.allocateResponses = 0;
      conn.stunTransactionId = randomBytes(12);
    }

    advanceRoute(conn, reason, targetIndex = conn.routeIndex + 1) {
      if (targetIndex >= conn.routes.length) {
        return false;
      }
      const from = conn.routes[conn.routeIndex];
      this.applyRoute(conn, targetIndex);
      this.logger.warn('[RELAY] switching relay route', { connectionId: conn.relayInfo.id, reason, from, to: conn.routes[conn.routeIndex] });
      this.closePeerObjects(conn);
      conn.state = ConnectionState.Closed;
      return true;
    }

    getOrCreateConnection(relayInfo) {
      let conn = this.connections.get(relayInfo.id);
      if (!conn) {
        const routes = this.buildRoutes(relayInfo);
        conn = {
          state: ConnectionState.None,
          relayInfo,
          socket: null,
          dtlsClient: null,
          dataChannel: null,
          packetBuffer: [],
          bufferedBytes: 0,
          connectPromise: null,
          connectionTimeout: null,
          keepaliveTimer: null,
          iceConsentTimer: null,
          retryTimer: null,
          retryCount: 0,
          recovering: false,
          lastInboundAt: 0,
          localUfrag: randomUfrag(),
          stunTransactionId: randomBytes(12),
          routes,
          routeIndex: 0,
          mode: routes[0].mode,
          dialPort: routes[0].port,
          fallbackTimer: null,
          answered: false,
          keepaliveTicks: 0,
          allocateStage: 0,
          allocateLocked: false,
          allocateExhausted: false,
          allocateCandidates: null,
          allocateRounds: 0,
          returnPathSeen: false,
          proven: false,
          refused: false,
          allocateResponses: 0,
          openedAt: 0,
          allocateAttempts: new Map(),
          stats: { sentPackets: 0, receivedPackets: 0, sentBytes: 0, receivedBytes: 0 }
        };
        this.connections.set(relayInfo.id, conn);
      }
      return conn;
    }

    ensureConnection = async (relayInfo) => {
      if (this.destroyed) {
        return;
      }
      const conn = this.getOrCreateConnection(relayInfo);
      if (conn.state === ConnectionState.Open || conn.state === ConnectionState.Connecting) {
        return (conn.connectPromise ?? Promise.resolve()).catch(() => {});
      }
      const promise = this.connect(conn);
      conn.connectPromise = promise;
      let failed = false;
      try {
        await promise;
      } catch {
        failed = true;
      } finally {
        conn.connectPromise = null;
      }
      if (failed && !this.destroyed && this.advanceRoute(conn, 'connect_failed')) {
        await this.ensureConnection(relayInfo);
      }
    };

    performIceBinding(socket, relayInfo, conn) {
      return new Promise((resolve) => {
        const iceUfrag = relayInfo.authToken || relayInfo.token || '';
        const icePwd = relayInfo.key || '';

        const username = TEXT_ENCODER.encode(`${iceUfrag}:${conn.localUfrag}`);
        const hmacKey = TEXT_ENCODER.encode(icePwd);
        let attempt = 0;
        let settled = false;
        let timer = null;

        const onMessage = (datagram) => {
          if (settled || datagram.length < 2) return;

          if ((datagram[0] & 0xc0) !== 0) return;
          const info = parseStunResponse(datagram);
          if (info && info.method === 'binding' && (info.isSuccess || info.isError)) {
            settled = true;
            clearTimeout(timer);
            socket.removeListener('message', onMessage);
            resolve(info.isSuccess);
          }
        };
        socket.on('message', onMessage);

        const sendAttempt = () => {
          if (settled) return;
          if (attempt >= CONFIG.ICE_BINDING_TIMEOUTS_MS.length) {
            settled = true;
            socket.removeListener('message', onMessage);
            resolve(false);
            return;
          }
          const packet = buildBindingRequest(username, hmacKey, undefined, { iceRole: 'controlling', transactionId: conn.stunTransactionId });
          try {
            socket.send(packet, conn.dialPort, relayInfo.ip);
          } catch { }
          const wait = CONFIG.ICE_BINDING_TIMEOUTS_MS[attempt];
          attempt += 1;
          timer = setTimeout(sendAttempt, wait);
        };
        sendAttempt();
      });
    }

    startIceConsentRefresh(socket, relayInfo, conn) {
      const iceUfrag = relayInfo.authToken || relayInfo.token || '';
      const icePwd = relayInfo.key || '';

      const username = TEXT_ENCODER.encode(`${iceUfrag}:${conn.localUfrag}`);
      const hmacKey = TEXT_ENCODER.encode(icePwd);
      if (conn.iceConsentTimer) clearInterval(conn.iceConsentTimer);
      conn.iceConsentTimer = setInterval(() => {
        if (conn.state !== ConnectionState.Open || !conn.socket) {
          clearInterval(conn.iceConsentTimer);
          conn.iceConsentTimer = null;
          return;
        }
        try {
          const packet = buildBindingRequest(username, hmacKey, undefined, { iceRole: 'controlling' });
          socket.send(packet, conn.dialPort, relayInfo.ip);
        } catch { }
      }, CONFIG.ICE_CONSENT_REFRESH_MS);
    }

    connect = async (conn) => {
      this.closePeerObjects(conn);
      conn.state = ConnectionState.Connecting;
      conn.answered = false;
      const relayInfo = conn.relayInfo;
      const targetIp = relayInfo.ip;
      const targetPort = conn.dialPort;
      const dtlsRoute = conn.mode === 'dtls';
      const timeoutMs = dtlsRoute ? 6000 : CONFIG.CONNECTION_TIMEOUT_MS;
      return new Promise((resolve, reject) => {
        const socket = dgram.createSocket('udp4');
        conn.socket = socket;

        let settledConn = false;
        const settle = (err) => {
          if (settledConn) return;
          settledConn = true;
          if (conn.connectionTimeout) {
            clearTimeout(conn.connectionTimeout);
            conn.connectionTimeout = null;
          }
          if (err) {
            conn.state = ConnectionState.Failed;
            this.closePeerObjects(conn);
            reject(err);
          } else {
            resolve();
          }
        };

        const receive = (payload) => {
          if (conn.socket !== socket) return;
          conn.lastInboundAt = Date.now();
          conn.answered = true;
          const view = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
          if (!conn.returnPathSeen && view.length > 0 && (view[0] & 0xc0) !== 0) {
            conn.returnPathSeen = true;
            this.logger.info('[RELAY] return media confirmed', { connectionId: relayInfo.id, mode: conn.mode, port: conn.dialPort, bytes: view.length });
            this.markRelayProven(conn, 'media');
          }
          this.handleRelayStun(conn, relayInfo, payload);
          conn.stats.receivedPackets++;
          conn.stats.receivedBytes += byteLengthOf(payload);
          this.stats.received++;
          this.emit('relay_receive', { ip: relayInfo.ip, port: relayInfo.port, data: payload });
        };

        socket.on('error', (err) => {
          if (conn.state === ConnectionState.Open) this.handleRelayLoss(conn);
          settle(err instanceof Error ? err : new Error(String(err)));
        });

        conn.connectionTimeout = setTimeout(() => {
          settle(new Error(`relay connect timed out after ${timeoutMs}ms (${conn.mode} ${targetIp}:${targetPort})`));
        }, timeoutMs);

        if (!dtlsRoute) {
          socket.on('message', (datagram) => {
            receive(new Uint8Array(datagram.buffer, datagram.byteOffset, datagram.byteLength));
          });
          socket.connect(targetPort, targetIp, (err) => {
            if (settledConn) return;
            if (err) {
              settle(err);
              return;
            }
            conn.dataChannel = {
              send: (data) => {
                socket.send(Buffer.from(data));
              },
              getSendBacklog: () => 0,
              close: () => {}
            };
            this.handleChannelOpen(conn, relayInfo, socket, settle);
          });
          return;
        }

        const connLogger = this.logger.child?.({ connectionId: relayInfo.id }) ?? this.logger;

        const dtls = new DtlsClient({
          sendDatagram: (datagram) => {
            try { socket.send(datagram, targetPort, targetIp); } catch { }
          },
          logger: connLogger
        });
        conn.dtlsClient = dtls;

        const dc = new PreNegotiatedDataChannel({
          sendDtlsPayload: (plaintext) => {
            if (!dtls.isConnected) return;
            const record = dtls.encryptApplicationData(plaintext);
            try { socket.send(record, targetPort, targetIp); } catch { }
          },
          logger: connLogger
        });
        conn.dataChannel = dc;

        let iceBindingDone = false;
        socket.on('message', (datagram) => {
          if (!iceBindingDone) {
            return;
          }
          const isDtlsRecord = datagram.length >= 1 && datagram[0] >= 20 && datagram[0] <= 63;
          if (!isDtlsRecord) {
            return;
          }
          if (dtls.isConnected) {
            const payloads = dtls.decryptApplicationData(datagram);
            for (const payload of payloads) dc.handleDtlsPayload(payload);
          } else {
            try {
              dtls.handleDatagram(datagram);
            } catch { }
          }
        });

        dtls.on('connected', () => {
          this.logger.info('[RELAY] dtls connected', { connectionId: relayInfo.id, port: targetPort });
          dc.start();
        });
        dtls.on('error', (err) => {
          settle(err);
        });
        dc.on('open', () => {
          this.handleChannelOpen(conn, relayInfo, socket, settle);
        });
        dc.on('error', (err) => {
          settle(err);
        });
        dc.on('message', receive);

        socket.bind(0, async () => {
          if (CONFIG.ICE_BINDING_ENABLED) {
            const bindingOk = await this.performIceBinding(socket, relayInfo, conn);
            if (settledConn) return;
            if (!bindingOk) {
              settle(new Error('ICE binding to relay failed or timed out'));
              return;
            }
          }
          iceBindingDone = true;
          dtls.start();
        });
      });
    };

    handleChannelOpen(conn, relayInfo, socket, settle) {
      if (conn.socket !== socket) return;
      if (conn.allocateLocked || conn.allocateExhausted || conn.proven || conn.refused) {
        this.restartAllocateLadder(conn);
      }
      conn.state = ConnectionState.Open;
      conn.answered = false;
      conn.openedAt = Date.now();
      this.flushBufferedPackets(conn);
      conn.lastInboundAt = Date.now();
      this.logger.info('[RELAY] channel open', { connectionId: relayInfo.id, mode: conn.mode, port: conn.dialPort, hasAuthToken: Boolean(relayInfo.authToken) });
      this.startKeepalive(conn);
      this.armRouteFallback(conn);
      if (conn.mode === 'dtls' && CONFIG.ICE_CONSENT_REFRESH_ENABLED) this.startIceConsentRefresh(socket, relayInfo, conn);
      this.sendStunAllocateOnOpen(conn, relayInfo);
      for (const delayMs of [50, 150, 500, 3000]) setTimeout(() => this.sendStunAllocateOnOpen(conn, conn.relayInfo), delayMs);
      this.sendToChannel(conn, toArrayBuffer(buildWhatsAppPing(conn.stunTransactionId)));
      this.stats.connected++;
      const wasRecovering = conn.recovering;
      if (wasRecovering) {
        conn.recovering = false;
        conn.retryCount = 0;
      }
      this.emit('relay_connected', { ip: relayInfo.ip, port: relayInfo.port });
      if (wasRecovering) this.emit('relay_recovered', { connectionId: relayInfo.id });
      settle(null);
    }

    armRouteFallback(conn) {
      if (conn.fallbackTimer) {
        clearTimeout(conn.fallbackTimer);
        conn.fallbackTimer = null;
      }
      if (conn.routeIndex + 1 >= conn.routes.length) {
        return;
      }
      const socket = conn.socket;
      conn.fallbackTimer = setTimeout(() => {
        conn.fallbackTimer = null;
        if (conn.socket !== socket || conn.state !== ConnectionState.Open || conn.answered) {
          return;
        }
        if (this.advanceRoute(conn, 'relay_unanswered')) {
          void this.ensureConnection(conn.relayInfo);
        }
      }, 4000);
      conn.fallbackTimer.unref?.();
    }

    resendSubscriptions() {
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.Open && conn.dataChannel) {
          if (conn.allocateExhausted) this.restartAllocateLadder(conn);
          this.sendStunAllocateOnOpen(conn, conn.relayInfo);
        }
      }
    }

    handleRelayStun(conn, relayInfo, payload) {
      const data = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      if (data.length < 20 || (data[0] & 0xc0) !== 0) return;
      const type = (data[0] << 8) | data[1];
      const cookie = ((data[4] << 24) | (data[5] << 16) | (data[6] << 8) | data[7]) >>> 0;
      if (cookie !== 0x2112a442 && type !== 0x0802) return;
      if (type === 0x0001) {
        this.rxStun.bindReq++;
        if (!relayInfo.key) return;
        try {
          const response = buildRelayBindingSuccess(data.slice(8, 20), TEXT_ENCODER.encode(relayInfo.key));
          this.sendToChannel(conn, toArrayBuffer(response));
          this.rxStun.bindAnswered++;
        }
        catch (err) {
          this.logger.warn('[RELAY] binding success send failed', { message: toError(err).message });
        }
      }
      else if (type === 0x0103) {
        this.rxStun.allocOk++;
        conn.allocateResponses++;
        this.lockAllocateForm(conn, data);
      }
      else if (type === 0x0113 || type === 0x0111) {
        const errorInfo = parseStunResponse(data);
        conn.allocateResponses++;
        if (this.rxStun.allocErr++ === 0) {
          this.logger.warn('[RELAY] allocate/binding ERROR from relay', { connectionId: relayInfo.id, type: '0x' + type.toString(16), bytes: data.length, errorCode: errorInfo?.errorCode, errorReason: errorInfo?.errorReason, hex: Buffer.from(data).toString('hex') });
        }
        if (type === 0x0113 && errorInfo?.errorCode === 452) {
          if (!conn.allocateLocked) conn.refused = true;
          this.advanceAllocateForm(conn, relayInfo, data, errorInfo);
        }
      }
      else if (type === 0x0802) {
        this.rxStun.pong++;
      }
      else {
        this.rxStun.other++;
      }
    }

    sendStunAllocateOnOpen(conn, relayInfo) {
      if (this.destroyed || !relayInfo.key) {
        return;
      }
      const ssrc = this.subscriptionSsrc || this.audioSsrc;
      if (!ssrc) {
        return;
      }
      if (conn.mode === 'dtls' && !this.allocateBuilder) {
        this.sendBindingRegistrations(conn, relayInfo, ssrc);
      }
      this.sendAllocate(conn, relayInfo);
    }

    sendBindingRegistrations(conn, relayInfo, ssrc) {
      const hmacKey = TEXT_ENCODER.encode(relayInfo.key);
      const subs = buildSenderSubscriptions(ssrc);
      const remoteUfrag = relayInfo.authToken || relayInfo.token;
      if (remoteUfrag) {
        const username = TEXT_ENCODER.encode(`${remoteUfrag}:${conn.localUfrag}`);
        this.sendToChannel(conn, toArrayBuffer(buildBindingRequestWithSubs(username, hmacKey, subs, true, true, conn.stunTransactionId)));
      }
      if (relayInfo.token && relayInfo.token !== remoteUfrag) {
        const username = TEXT_ENCODER.encode(`${relayInfo.token}:${conn.localUfrag}`);
        this.sendToChannel(conn, toArrayBuffer(buildBindingRequestWithSubs(username, hmacKey, subs, true, true, conn.stunTransactionId)));
      }
      this.sendToChannel(conn, toArrayBuffer(buildBindingRequestWithSubs(undefined, undefined, subs, false, false, conn.stunTransactionId)));
    }

    resolveRelayTarget(conn, relayInfo) {
      const dialed = { ip: relayInfo.ip, port: conn.dialPort ?? relayInfo.port };
      if (conn.mode === 'dtls') {
        return dialed;
      }
      try {
        const remote = conn.socket?.remoteAddress();
        if (remote?.address && remote.port) {
          return { ip: remote.address, port: remote.port };
        }
      }
      catch (err) {
        this.logger.debug('[RELAY] remote address unavailable', { message: toError(err).message });
      }
      return dialed;
    }

    getAllocateCandidates(conn, relayInfo) {
      if (conn.allocateCandidates) {
        return conn.allocateCandidates;
      }
      const target = this.resolveRelayTarget(conn, relayInfo);
      const ports = [target.port, relayInfo.port, conn.dialPort, relayInfo.fallbackPort].filter((port, index, all) => Number.isInteger(port) && port > 0 && all.indexOf(port) === index);
      const candidates = ports.map((port) => ({ form: 'exact', ip: target.ip, port }));
      candidates.push({ form: 'mapped', ip: target.ip, port: ports[0] });
      candidates.push({ form: 'none', ip: target.ip, port: ports[0] });
      conn.allocateCandidates = candidates;
      return candidates;
    }

    lockAllocateForm(conn, data) {
      if (conn.allocateLocked) {
        return;
      }
      const attempt = conn.allocateAttempts.get(Buffer.from(data.subarray(8, 20)).toString('hex'));
      if (attempt) {
        conn.allocateStage = attempt.stage;
        conn.stunTransactionId = attempt.transactionId;
      }
      conn.allocateLocked = true;
      conn.allocateExhausted = false;
      conn.refused = false;
      this.rejectedModes.delete(`${conn.relayInfo.ip}|${conn.mode}`);
      this.logger.info('[RELAY] allocate accepted', { connectionId: conn.relayInfo.id, route: { mode: conn.mode, port: conn.dialPort }, relayedAddress: attempt?.candidate ?? null });
      this.markRelayProven(conn, 'allocate');
    }

    markRelayProven(conn, via) {
      if (conn.proven) {
        return;
      }
      conn.proven = true;
      const relayInfo = conn.relayInfo;
      this.logger.info('[RELAY] relay proven', { connectionId: relayInfo.id, via });
      if (this.answeredRelayNames.has(relayInfo.name)) {
        return;
      }
      this.answeredRelayNames.add(relayInfo.name);
      this.emit('relay_answered', { name: relayInfo.name, ip: relayInfo.ip, port: relayInfo.port, rttMs: conn.openedAt ? Date.now() - conn.openedAt : undefined });
    }

    advanceAllocateForm(conn, relayInfo, data, errorInfo) {
      if (conn.allocateLocked || conn.allocateExhausted) {
        return;
      }
      const attempt = conn.allocateAttempts.get(Buffer.from(data.subarray(8, 20)).toString('hex'));
      if (!attempt || attempt.stage !== conn.allocateStage) {
        return;
      }
      const candidates = this.getAllocateCandidates(conn, relayInfo);
      const mismatch = parseRelayedAddressMismatch(errorInfo?.errorReason);
      const learned = mismatch?.relay;
      if (learned && !candidates.some((entry) => entry.form === 'exact' && entry.ip === learned.ip && entry.port === learned.port)) {
        candidates.splice(conn.allocateStage + 1, 0, { form: 'exact', ip: learned.ip, port: learned.port });
      }
      const echoedSame = Boolean(mismatch?.destination && mismatch?.relay && mismatch.destination.ip === mismatch.relay.ip && mismatch.destination.port === mismatch.relay.port);
      if (echoedSame || conn.allocateStage >= candidates.length - 1) {
        this.handleAllocateExhausted(conn, relayInfo, errorInfo);
        return;
      }
      this.logger.warn('[RELAY] relayed address rejected, trying next candidate', { connectionId: relayInfo.id, rejected: attempt.candidate, next: candidates[conn.allocateStage + 1], serverRead: mismatch?.destination ?? null, serverRelay: mismatch?.relay ?? null });
      conn.allocateStage++;
      conn.stunTransactionId = randomBytes(12);
      this.sendAllocate(conn, relayInfo);
    }

    handleAllocateExhausted(conn, relayInfo, errorInfo) {
      conn.allocateExhausted = true;
      conn.refused = true;
      conn.allocatePacket = null;
      this.logger.warn('[RELAY] every relayed address candidate was rejected', { connectionId: relayInfo.id, route: { mode: conn.mode, port: conn.dialPort }, errorReason: errorInfo?.errorReason });
      this.rejectedModes.add(`${relayInfo.ip}|${conn.mode}`);
      if (this.advanceRoute(conn, 'allocate_rejected')) {
        void this.ensureConnection(relayInfo);
        return;
      }
      if (this.activateStandbyRelay(conn)) {
        return;
      }
      if (conn.allocateRounds < 2) {
        conn.allocateRounds += 1;
        this.applyRoute(conn, 0);
        this.closePeerObjects(conn);
        conn.state = ConnectionState.Closed;
        conn.retryTimer = setTimeout(() => {
          conn.retryTimer = null;
          if (this.connections.get(relayInfo.id) !== conn) return;
          void this.ensureConnection(relayInfo);
        }, 3000 * conn.allocateRounds);
        conn.retryTimer.unref?.();
        return;
      }
      this.logger.error('[RELAY] allocate failed on every route and relay', { connectionId: relayInfo.id, rounds: conn.allocateRounds });
    }

    activateStandbyRelay(conn) {
      const next = this.standbyRelays.shift();
      if (!next) {
        return false;
      }
      const failedId = conn.relayInfo.id;
      this.failedRelays.add(failedId);
      this.relayMap.delete(failedId);
      this.connections.delete(failedId);
      if (conn.retryTimer) {
        clearTimeout(conn.retryTimer);
        conn.retryTimer = null;
      }
      this.closePeerObjects(conn);
      conn.state = ConnectionState.Failed;
      this.relayMap.set(next.id, next);
      this.logger.warn('[RELAY] switching to standby relay', { from: failedId, to: next.id });
      void this.ensureConnection(next);
      return true;
    }

    sendAllocate(conn, relayInfo) {
      if (conn.allocateExhausted) {
        return;
      }
      if (!relayInfo.rawToken || relayInfo.rawToken.length === 0 || !relayInfo.key || !this.audioSsrc) {
        return;
      }
      const candidates = this.getAllocateCandidates(conn, relayInfo);
      const candidate = candidates[Math.min(conn.allocateStage, candidates.length - 1)];
      let packet;
      if (this.allocateBuilder) {
        packet = this.allocateBuilder(relayInfo, candidate, conn.stunTransactionId);
      }
      else {
        packet = buildAllocateForRelay(relayInfo.rawToken, this.streamSsrcs ? createWasmStreamDescriptors(this.streamSsrcs) : buildSSRCSubscriptionList([this.audioSsrc], [this.subscriptionSsrc], this.selfPid, this.peerPid), TEXT_ENCODER.encode(relayInfo.key), candidate.ip, candidate.port, conn.stunTransactionId, { relayedAddress: candidate.form });
      }
      if (!packet) {
        return;
      }
      conn.allocatePacket = toArrayBuffer(packet);
      const attemptKey = Buffer.from(conn.stunTransactionId).toString('hex');
      if (!conn.allocateAttempts.has(attemptKey)) {
        conn.allocateAttempts.set(attemptKey, { stage: conn.allocateStage, transactionId: conn.stunTransactionId, candidate });
      }
      this.sendToChannel(conn, conn.allocatePacket);
    }

    sendToChannel(conn, data) {
      if (conn.state !== ConnectionState.Open || !conn.dataChannel) return;
      try {
        conn.dataChannel.send(data);
        conn.stats.sentPackets++;
        conn.stats.sentBytes += byteLengthOf(data);
        this.stats.sent++;
      } catch { }
    }

    closePeerObjects(conn) {
      if (conn.fallbackTimer) {
        clearTimeout(conn.fallbackTimer);
        conn.fallbackTimer = null;
      }
      if (conn.keepaliveTimer) {
        clearInterval(conn.keepaliveTimer);
        conn.keepaliveTimer = null;
      }
      if (conn.iceConsentTimer) {
        clearInterval(conn.iceConsentTimer);
        conn.iceConsentTimer = null;
      }
      try { conn.dataChannel?.close?.(); } catch { }
      try { conn.dtlsClient?.close?.(); } catch { }
      try { conn.socket?.close?.(); } catch { }
      conn.socket = null;
      conn.dtlsClient = null;
      conn.dataChannel = null;
    }

    startKeepalive(conn) {
      if (conn.keepaliveTimer) clearInterval(conn.keepaliveTimer);
      conn.keepaliveTimer = setInterval(() => {
        if (conn.state !== ConnectionState.Open || !conn.dataChannel) return;
        if (Date.now() - conn.lastInboundAt > 15_000) {
          this.handleRelayLoss(conn);
          return;
        }

        if (!conn.proven && conn.answered && !conn.refused && conn.allocateResponses === 0 && Date.now() - conn.openedAt >= 3000) {
          this.markRelayProven(conn, 'answered');
        }
        conn.keepaliveTicks++;
        if (conn.keepaliveTicks % 5 === 0) {
          this.logger.info('[RELAY] status', { connectionId: conn.relayInfo.id, mode: conn.mode, port: conn.dialPort, answered: conn.answered, locked: conn.allocateLocked, sentPackets: conn.stats.sentPackets, receivedPackets: conn.stats.receivedPackets, rx: this.rxStun });
        }
        if (conn.allocatePacket) this.sendToChannel(conn, conn.allocatePacket);
        this.sendToChannel(conn, toArrayBuffer(buildWhatsAppPing(conn.stunTransactionId)));
      }, CONFIG.KEEPALIVE_INTERVAL_MS);
    }

    flushBufferedPackets(conn) {
      while (conn.packetBuffer.length > 0) {
        const packet = conn.packetBuffer.shift();
        if (!packet) continue;
        conn.bufferedBytes -= byteLengthOf(packet);
        try {
          conn.dataChannel.send(packet);
          conn.stats.sentPackets++;
          conn.stats.sentBytes += byteLengthOf(packet);
          this.stats.sent++;
        } catch { }
      }
    }

    bufferPacket(conn, packet) {
      const size = byteLengthOf(packet);
      if (size > CONFIG.MAX_BUFFER_SIZE) return false;
      while (conn.packetBuffer.length > 0 && conn.bufferedBytes + size > CONFIG.MAX_BUFFER_SIZE) {
        const dropped = conn.packetBuffer.shift();
        if (dropped) conn.bufferedBytes -= byteLengthOf(dropped);
      }
      conn.packetBuffer.push(packet);
      conn.bufferedBytes += size;
      return true;
    }

    sendToRelay(ip, port, data) {
      if (this.configuring) {
        this.globalBuffer.push({ ip, port, data });
        this.globalBufferedBytes += byteLengthOf(data);
        return;
      }
      for (const [, conn] of this.connections) {
        if (conn.relayInfo.ip !== ip || conn.relayInfo.port !== port) continue;
        if (conn.state === ConnectionState.Open && conn.dataChannel) {
          try {
            conn.dataChannel.send(data);
            conn.stats.sentPackets++;
            conn.stats.sentBytes += byteLengthOf(data);
            this.stats.sent++;
          } catch { }
        } else {
          this.bufferPacket(conn, data);
          if (!conn.recovering) void this.ensureConnection(conn.relayInfo);
        }
      }
    }

    pickMediaConnections() {
      const open = [];
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.Open && conn.dataChannel) open.push(conn);
      }
      const proven = open.filter((conn) => conn.proven);
      if (proven.length > 0) return proven;
      const viable = open.filter((conn) => !conn.refused);
      return viable.length > 0 ? viable : open;
    }

    broadcast(data) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      const isAudio = bytes.length < 2 || (bytes[1] & 0x7f) !== PayloadType.H264;
      let sentAny = false;
      for (const conn of this.pickMediaConnections()) {
        try {
          conn.dataChannel.send(data, isAudio);
          conn.stats.sentPackets++;
          conn.stats.sentBytes += byteLengthOf(data);
          this.stats.sent++;
          sentAny = true;
        } catch { }
      }
      return sentAny;
    }

    handleRelayLoss(conn) {
      if (this.destroyed || conn.state !== ConnectionState.Open) return;
      if (!conn.answered) {
        if (this.advanceRoute(conn, 'relay_lost_unanswered')) {
          void this.ensureConnection(conn.relayInfo);
          return;
        }
        if (conn.routes.length > 1) {
          this.applyRoute(conn, 0);
        }
      }
      this.logger.warn('[RELAY] relay lost', { connectionId: conn.relayInfo.id, port: conn.dialPort, silentMs: Date.now() - conn.lastInboundAt, answered: conn.answered, rx: this.rxStun });
      this.closePeerObjects(conn);
      conn.state = ConnectionState.Closed;
      if (!conn.recovering) conn.retryCount = 0;
      conn.recovering = true;
      this.emit('relay_lost', { connectionId: conn.relayInfo.id, anyOpen: this.hasConnection(), max: this.retrySchedule.length });
      this.scheduleRelayRetry(conn);
    }

    scheduleRelayRetry(conn) {
      if (conn.retryCount >= this.retrySchedule.length) {
        this.emit('relay_failed', { connectionId: conn.relayInfo.id, anyOpen: this.hasConnection(), max: this.retrySchedule.length });
        return;
      }
      const delay = this.retrySchedule[conn.retryCount];
      conn.retryCount += 1;
      conn.retryTimer = setTimeout(async () => {
        conn.retryTimer = null;
        if (this.connections.get(conn.relayInfo.id) !== conn) return;
        this.emit('relay_retrying', { connectionId: conn.relayInfo.id, attempt: conn.retryCount, anyOpen: this.hasConnection(), max: this.retrySchedule.length });
        await this.ensureConnection(conn.relayInfo);
        if (conn.state !== ConnectionState.Open) this.scheduleRelayRetry(conn);
      }, delay);
      conn.retryTimer.unref?.();
    }

    hasConnection() {
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.Open) return true;
      }
      return false;
    }

    getSendBacklog() {
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.Open && conn.dataChannel) {
          return conn.dataChannel.getSendBacklog();
        }
      }
      return null;
    }

    getVideoFlushCount() {
      let total = 0;
      for (const [, conn] of this.connections) {
        const backlog = conn.dataChannel?.getSendBacklog?.();
        if (backlog) total += backlog.videoFlushes ?? 0;
      }
      return total;
    }
    getConnectedCount() {
      let count = 0;
      for (const [, conn] of this.connections) {
        if (conn.state === ConnectionState.Open) count++;
      }
      return count;
    }

    cleanup() {
      this.destroyed = true;
      for (const [, conn] of this.connections) {
        if (conn.retryTimer) clearTimeout(conn.retryTimer);
        conn.retryTimer = null;
        this.closePeerObjects(conn);
        conn.state = ConnectionState.Closed;
        conn.connectPromise = null;
        conn.packetBuffer = [];
        conn.allocateAttempts.clear();
      }
      this.connections.clear();
      this.relayMap.clear();
      this.standbyRelays = [];
      this.failedRelays.clear();
      this.answeredRelayNames.clear();
      this.rejectedModes.clear();
      this.globalBuffer = [];
      this.globalBufferedBytes = 0;
    }
  }
  return { WaManualRelay };
})();

/* ═══ h264.js ═══════════════════════════════════════════════════════ */
const __h264 = (() => {
  const H264_STAP_A_TYPE = 24;
  const H264_FUA_TYPE = 28;
  const MTU_PAYLOAD_MAX = 800;

  function auHasIDR(au) {
    for (const nalu of splitAnnexB(au)) {
      if (nalu.length > 0 && (nalu[0] & 0x1f) === 5) return true;
    }
    return false;
  }

  function packageH264NALU(nalu) {
    if (!nalu || nalu.length === 0) return [];
    if (nalu.length <= MTU_PAYLOAD_MAX) {
      return [nalu.slice()];
    }
    const naluHeader = nalu[0];
    const fbitAndNri = naluHeader & 0xe0;
    const originalType = naluHeader & 0x1f;
    const fuIndicator = fbitAndNri | H264_FUA_TYPE;

    const body = nalu.subarray(1);
    const fragSize = MTU_PAYLOAD_MAX - 2;

    const out = [];
    let offset = 0;
    while (offset < body.length) {
      const end = Math.min(offset + fragSize, body.length);
      const chunk = body.subarray(offset, end);

      let fuHeader = originalType;
      if (offset === 0) fuHeader |= 0x80;
      if (end === body.length) fuHeader |= 0x40;

      const pkt = new Uint8Array(2 + chunk.length);
      pkt[0] = fuIndicator;
      pkt[1] = fuHeader;
      pkt.set(chunk, 2);
      out.push(pkt);

      offset = end;
    }
    return out;
  }

  function annexBStartCodeLen(data, offset) {
    if (
      offset + 3 < data.length &&
      data[offset] === 0 &&
      data[offset + 1] === 0 &&
      data[offset + 2] === 0 &&
      data[offset + 3] === 1
    ) {
      return 4;
    }
    if (offset + 2 < data.length && data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 1) {
      return 3;
    }
    return 0;
  }

  function splitAnnexB(data) {
    const nalus = [];
    let start = -1;
    let i = 0;
    while (i < data.length) {
      const sc = annexBStartCodeLen(data, i);
      if (sc > 0) {
        if (start >= 0) {
          let end = i;
          while (end > start && data[end - 1] === 0) end--;
          if (end > start) nalus.push(data.subarray(start, end));
        }
        i += sc;
        start = i;
        continue;
      }
      i++;
    }
    if (start >= 0 && start < data.length) nalus.push(data.subarray(start));
    return nalus;
  }

  const DROP_NAL_TYPES = new Set([6, 9, 10, 11, 12]);

  function buildAccessUnitPayload(au) {
    const nalus = splitAnnexB(au);
    const parts = [];
    for (const n of nalus) {
      if (n.length === 0 || DROP_NAL_TYPES.has(n[0] & 0x1f)) continue;
      if (parts.length > 0) parts.push(Uint8Array.of(0, 0, 0, 1));
      parts.push(n);
    }
    if (parts.length === 0) return null;
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  const MAX_FU_REASSEMBLY_BYTES = 4 << 20;
  const MAX_ACCESS_UNIT_BYTES = 8 << 20;

  class H264Depacketizer {
    fuBuf = new Uint8Array(0);
    fuActive = false;
    overflow = false;

    depacketize(payload) {
      if (!payload || payload.length < 1) return [];
      const naluType = payload[0] & 0x1f;
      const fbitAndNri = payload[0] & 0xe0;

      if (naluType >= 1 && naluType <= 23) {
        this.fuActive = false;
        return [payload.slice()];
      }

      if (naluType === H264_STAP_A_TYPE) {
        this.fuActive = false;
        let body = payload.subarray(1);
        const out = [];
        while (body.length >= 2) {
          const size = (body[0] << 8) | body[1];
          body = body.subarray(2);
          if (size <= 0 || size > body.length) return out;
          out.push(body.slice(0, size));
          body = body.subarray(size);
        }
        return out;
      }

      if (naluType === H264_FUA_TYPE) {
        if (payload.length < 2) {
          this.fuActive = false;
          return [];
        }
        const fuHeader = payload[1];
        const startBit = fuHeader & 0x80;
        const endBit = fuHeader & 0x40;
        const origType = fuHeader & 0x1f;
        const body = payload.subarray(2);

        if (startBit !== 0) {
          if (1 + body.length > MAX_FU_REASSEMBLY_BYTES) {
            this.fuActive = false;
            this.fuBuf = new Uint8Array(0);
            this.overflow = true;
            return [];
          }
          this.fuActive = true;
          this.fuBuf = new Uint8Array(1 + body.length);
          this.fuBuf[0] = fbitAndNri | origType;
          this.fuBuf.set(body, 1);
        } else if (this.fuActive) {
          if (this.fuBuf.length + body.length > MAX_FU_REASSEMBLY_BYTES) {
            this.fuActive = false;
            this.fuBuf = new Uint8Array(0);
            this.overflow = true;
            return [];
          }
          const merged = new Uint8Array(this.fuBuf.length + body.length);
          merged.set(this.fuBuf, 0);
          merged.set(body, this.fuBuf.length);
          this.fuBuf = merged;
        } else {
          return [];
        }

        if (endBit !== 0 && this.fuActive) {
          this.fuActive = false;
          const out = this.fuBuf;
          this.fuBuf = new Uint8Array(0);
          return [out];
        }
        return [];
      }

      this.fuActive = false;
      return [];
    }
  }

  class H264AccessUnitAssembler {
    depacketizer = new H264Depacketizer();
    accessUnit = new Uint8Array(0);
    expectedSeq = 0;
    hasSequence = false;
    keyframeNeeded = false;

    reset() {
      this.depacketizer = new H264Depacketizer();
      this.accessUnit = new Uint8Array(0);
    }

    push(sequence, marker, payload) {
      let recoveryNeeded = false;
      if (this.hasSequence && sequence !== this.expectedSeq) {
        recoveryNeeded = !this.keyframeNeeded;
        this.reset();
        this.keyframeNeeded = true;
      }
      this.hasSequence = true;
      this.expectedSeq = (sequence + 1) & 0xffff;

      for (const nalu of this.depacketizer.depacketize(payload)) {
        if (this.accessUnit.length + 4 + nalu.length > MAX_ACCESS_UNIT_BYTES) {
          recoveryNeeded = recoveryNeeded || !this.keyframeNeeded;
          this.reset();
          this.keyframeNeeded = true;
          break;
        }
        const merged = new Uint8Array(this.accessUnit.length + 4 + nalu.length);
        merged.set(this.accessUnit, 0);
        merged.set([0, 0, 0, 1], this.accessUnit.length);
        merged.set(nalu, this.accessUnit.length + 4);
        this.accessUnit = merged;
      }
      if (this.depacketizer.overflow) {
        recoveryNeeded = recoveryNeeded || !this.keyframeNeeded;
        this.reset();
        this.keyframeNeeded = true;
      }
      if (!marker) {
        return [null, false, recoveryNeeded];
      }

      const accessUnit = this.accessUnit;
      this.reset();
      if (accessUnit.length === 0) {
        return [null, false, recoveryNeeded];
      }
      if (this.keyframeNeeded) {
        if (!auHasIDR(accessUnit)) {
          return [null, false, recoveryNeeded];
        }
        this.keyframeNeeded = false;
      }
      return [accessUnit, true, recoveryNeeded];
    }
  }
  return { auHasIDR, packageH264NALU, splitAnnexB, DROP_NAL_TYPES, buildAccessUnitPayload, H264Depacketizer, H264AccessUnitAssembler };
})();

/* ═══ WaVideoEngine.js ══════════════════════════════════════════════ */
const __WaVideoEngine = (() => {
  const { TEXT_DECODER } = __bytes;
  const { createNoopLogger } = __core;
  const { auHasIDR } = __h264;
  const { DEFAULT_VIDEO_CONFIG } = __types;
  const { toBytesView, toError } = __util;
  const FFMPEG_BIN = 'ffmpeg';
  const MAX_STDERR_CHARS = 16 * 1024;

  const MAX_PENDING_BYTES = 8 * 1024 * 1024;
  const ffmpegProbeCache = new Map();
  function probeBinary(bin) {
      return new Promise((resolve) => {
          execFile(bin, ['-version'], { timeout: 5_000 }, (err) => resolve(!err));
      });
  }
  async function hasFfmpeg(bin) {
      let available = ffmpegProbeCache.get(bin);
      if (available === undefined) {
          available = await probeBinary(bin);
          if (available)
              ffmpegProbeCache.set(bin, available);
      }
      return available;
  }
  function startCodeLen(data, offset) {
      if (offset + 3 < data.length &&
          data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 0 && data[offset + 3] === 1) {
          return 4;
      }
      if (offset + 2 < data.length && data[offset] === 0 && data[offset + 1] === 0 && data[offset + 2] === 1) {
          return 3;
      }
      return 0;
  }

  function pickH264Level(width, height, frameRate) {
      const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
      const mbps = mbs * frameRate;
      if (mbs <= 1620 && mbps <= 40500) return '3.0';
      if (mbs <= 3600 && mbps <= 108000) return '3.1';
      if (mbs <= 5120 && mbps <= 216000) return '3.2';
      return '4.0';
  }
  const align16 = (n) => Math.max(16, Math.ceil(n / 16) * 16);

  class WaVideoEngine {
      logger;
      videoSender = null;
      proc = null;
      width;
      height;
      frameRate;
      frameDurationMs;
      running = false;
      pending = new Uint8Array(0);
      accessUnitsSent = 0;
      videoPath = null;
      waitingForKeyFrame = true;

      sourceKind = null;
      constructor(config = {}) {
          const c = { ...DEFAULT_VIDEO_CONFIG, ...config };
          this.logger = config.logger ?? createNoopLogger();
          this.width = c.width;
          this.height = c.height;
          this.frameRate = c.frameRate;
          this.frameDurationMs = 1000 / this.frameRate;
      }
      setVideoSender(sender) {
          this.videoSender = sender;
      }
      isRunning() {
          return this.running;
      }
      hasSource() {
          return this.sourceKind !== null;
      }

      async loadVideoFile(videoPath) {
          try {
              await access(videoPath);
          }
          catch {
              throw new Error(`File not found: ${videoPath}`);
          }
          if (!(await hasFfmpeg(FFMPEG_BIN))) {
              throw new Error('ffmpeg not found on PATH (install ffmpeg to load video files)');
          }
          this.videoPath = videoPath;
          this.sourceKind = 'file';
      }

      async loadBlankSource() {
          if (!(await hasFfmpeg(FFMPEG_BIN))) {
              throw new Error('ffmpeg not found on PATH (install ffmpeg for the black-screen video fallback)');
          }
          this.sourceKind = 'blank';
      }

      start() {
          if (!this.sourceKind || this.proc)
              return;
          const outW = align16(this.width);
          const outH = align16(this.height);
          const scaleFilter = `scale=${outW}:${outH}:force_original_aspect_ratio=decrease,pad=${outW}:${outH}:(ow-iw)/2:(oh-ih)/2,setsar=1`;

          const keyframeIntervalFrames = Math.max(1, Math.round(this.frameRate));
          const kbpsCap = 600;
          const targetBitrateKbps = Math.max(200, Math.min(kbpsCap, Math.round((outW * outH * this.frameRate) / 1000 * 0.08)));
          const bufsizeKbps = Math.max(60, Math.round(targetBitrateKbps * 0.25));
          const level = pickH264Level(outW, outH, this.frameRate);
          const inputArgs = this.sourceKind === 'blank'

              ? ['-f', 'lavfi', '-re', '-i', `color=c=black:s=${outW}x${outH}:r=${this.frameRate}`]
              : ['-stream_loop', '-1', '-re', '-i', this.videoPath];

          const args = [
              '-hide_banner', '-loglevel', 'error',
              ...inputArgs,
              '-an',
              '-vf', scaleFilter,
              '-r', String(this.frameRate),
              '-c:v', 'libx264',
              '-threads', '1',
              '-profile:v', 'baseline',
              '-level', level,
              '-preset', 'veryfast',
              '-tune', 'zerolatency',
              '-pix_fmt', 'yuv420p',
              '-bf', '0',
              '-b:v', `${targetBitrateKbps}k`,
              '-maxrate', `${targetBitrateKbps}k`,
              '-bufsize', `${bufsizeKbps}k`,
              '-x264-params', `aud=1:repeat-headers=1:keyint=${keyframeIntervalFrames}:min-keyint=${keyframeIntervalFrames}:scenecut=0:rc-lookahead=0:sync-lookahead=0:open-gop=0:ref=1`,
              '-f', 'h264',
              'pipe:1'
          ];
          const proc = spawn(FFMPEG_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] });
          this.proc = proc;
          try {
              setPriority(proc.pid, 10);
          }
          catch { }
          this.pending = new Uint8Array(0);
          this.accessUnitsSent = 0;
          this.waitingForKeyFrame = true;
          this.running = true;
          this._deliberateStop = false;
          let stderr = '';
          proc.stdout?.on('data', (chunk) => {
              try {
                  this.onData(toBytesView(chunk));
              }
              catch (err) {
                  this.logger.error('video stream parse error', { message: toError(err).message });
              }
          });
          proc.stderr?.on('data', (chunk) => {
              stderr = (stderr + TEXT_DECODER.decode(chunk)).slice(-MAX_STDERR_CHARS);
          });
          proc.on('error', (err) => {
              this.logger.error('ffmpeg video process error', { message: err.message });
              this.running = false;
          });
          proc.on('close', (code) => {
              if (this.proc === proc)
                  this.proc = null;
              this.running = false;
              if (code !== 0 && code !== null) {
                  this.logger.error('ffmpeg video process exited unexpectedly', { code, stderr: stderr.trim() });
              }
              if (!this._deliberateStop && this.sourceKind) {
                  const now = Date.now();
                  if (!this._restartWindowStartedAt || now - this._restartWindowStartedAt > 60_000) {
                      this._restartWindowStartedAt = now;
                      this._restartCount = 0;
                  }
                  this._restartCount = (this._restartCount ?? 0) + 1;
                  if (this._restartCount > 5) {
                      this.logger.error('video encoder crash-looped, giving up on auto-restart', {
                          source: this.sourceKind, videoPath: this.videoPath, restartCount: this._restartCount
                      });
                      return;
                  }
                  this.logger.error('restarting video encoder after unexpected exit', {
                      source: this.sourceKind, videoPath: this.videoPath, restartCount: this._restartCount
                  });
                  this.start();
              }
          });
      }

      onData(chunk) {
          const merged = new Uint8Array(this.pending.length + chunk.length);
          merged.set(this.pending, 0);
          merged.set(chunk, this.pending.length);
          this.pending = merged;
          if (this.pending.length > MAX_PENDING_BYTES) {
              this.pending = new Uint8Array(0);
              return;
          }
          const audPositions = [];
          let i = 0;
          const data = this.pending;
          while (i < data.length) {
              const sc = startCodeLen(data, i);
              if (sc > 0) {
                  const naluStart = i + sc;
                  if (naluStart < data.length && (data[naluStart] & 0x1f) === 9) {
                      audPositions.push(i);
                  }
                  i += sc;
                  continue;
              }
              i++;
          }
          if (audPositions.length < 2)
              return;
          for (let k = 0; k < audPositions.length - 1; k++) {
              const au = data.subarray(audPositions[k], audPositions[k + 1]);
              this.emitAccessUnit(au);
          }
          this.pending = data.slice(audPositions[audPositions.length - 1]);
      }

      emitAccessUnit(au) {
          if (this.waitingForKeyFrame) {
              if (!auHasIDR(au))
                  return;
              this.waitingForKeyFrame = false;
          }
          this.accessUnitsSent++;
          if (this.videoSender) {
              try {
                  this.videoSender.sendCapturedVideoAU(au, this.frameDurationMs);
              }
              catch { }
          }
      }

      stop({ keepSource = false } = {}) {
          this._deliberateStop = true;
          this.running = false;
          if (this.proc) {
              try {
                  this.proc.kill('SIGKILL');
              }
              catch { }
              this.proc = null;
          }
          this.pending = new Uint8Array(0);
          if (!keepSource) {
              this.videoPath = null;
              this.sourceKind = null;
          }
      }
  }
  return { WaVideoEngine };
})();

/* ═══ crypto-rtcp.js ════════════════════════════════════════════════ */
const __crypto_rtcp = (() => {
  const { writeUInt32BE, writeBigUInt64BE } = __bytes;
  const { aesCtr128, hmacSha1 } = __primitives;
  const { RTCP_AUTH_TAG_LEN, SRTCP_LABEL } = __types;
  const RTCP_HEADER_LEN = 8;

  function deriveKey(masterKey, masterSalt, label, length) {
      const iv = new Uint8Array(16);
      iv.set(masterSalt.subarray(0, 14), 0);
      iv[7] ^= label;
      const zeros = new Uint8Array(length);
      return aesCtr128(masterKey, iv, zeros);
  }

  class SrtcpSendContext {
      #cipherKey;
      #authKey;
      #salt;
      #index = 1;
      #ssrcBuffer = new Uint8Array(4);
      #ivBuffer = new Uint8Array(16);
      #indexBuffer = new Uint8Array(8);

      constructor(keying) {
          this.#cipherKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.ENCRYPTION, 16);
          this.#authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.AUTH, 20);
          this.#salt = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.SALT, 14);
      }

      rekey(keying) {
          this.#cipherKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.ENCRYPTION, 16);
          this.#authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.AUTH, 20);
          this.#salt = deriveKey(keying.masterKey, keying.masterSalt, SRTCP_LABEL.SALT, 14);
      }

      #generateIv(ssrc, roc, seq) {
          this.#ivBuffer.fill(0);
          this.#ivBuffer.set(this.#salt.subarray(0, 14), 0);
          writeUInt32BE(this.#ssrcBuffer, ssrc, 0);
          for (let i = 0; i < 4; i++) this.#ivBuffer[4 + i] ^= this.#ssrcBuffer[i];
          const index = (BigInt(roc >>> 0) << 16n) | BigInt(seq & 0xffff);
          writeBigUInt64BE(this.#indexBuffer, index, 0);
          for (let i = 0; i < 6; i++) this.#ivBuffer[8 + i] ^= this.#indexBuffer[2 + i];
          return this.#ivBuffer;
      }

      protect(senderSsrc, rtcpPacket) {
          const splitAt = Math.min(rtcpPacket.length, RTCP_HEADER_LEN);
          const header = rtcpPacket.subarray(0, splitAt);
          const body = rtcpPacket.subarray(splitAt);

          const index = this.#index >>> 0;
          this.#index = (this.#index + 1) >>> 0;

          const roc = index >>> 16;
          const seq = index & 0xffff;
          const iv = this.#generateIv(senderSsrc, roc, seq);
          const encryptedBody = aesCtr128(this.#cipherKey, iv, body);

          const withIndexWord = new Uint8Array(header.length + encryptedBody.length + 4);
          withIndexWord.set(header, 0);
          withIndexWord.set(encryptedBody, header.length);
          writeUInt32BE(withIndexWord, 0x80000000 | index, header.length + encryptedBody.length);

          const tag = hmacSha1(this.#authKey, withIndexWord).subarray(0, RTCP_AUTH_TAG_LEN);

          const out = new Uint8Array(withIndexWord.length + RTCP_AUTH_TAG_LEN);
          out.set(withIndexWord, 0);
          out.set(tag, withIndexWord.length);
          return out;
      }
  }
  return { SrtcpSendContext };
})();

/* ═══ crypto.js ═════════════════════════════════════════════════════ */
const __crypto = (() => {
  const { toBytesView } = __util;
  const EMPTY_BYTES = Object.freeze(new Uint8Array(0));
  function hkdf(ikm, salt, info, outLength) {
      return toBytesView(hkdfSync('sha256', ikm, salt ?? EMPTY_BYTES, info, outLength));
  }
  return { hkdf };
})();

/* ═══ encryption.js ═════════════════════════════════════════════════ */
const __encryption = (() => {
  const { TEXT_ENCODER } = __bytes;
  const { hkdf } = __crypto;
  const { randomBytes } = __primitives;
  function derivePerJidSrtpKey(callKey, deviceJid) {
      const output = hkdf(callKey, null, TEXT_ENCODER.encode(deviceJid), 46);
      return {
          masterKey: output.subarray(0, 16),
          masterSalt: output.subarray(16, 30)
      };
  }
  function generateCallKey() {
      return randomBytes(32);
  }
  return { derivePerJidSrtpKey, generateCallKey };
})();

/* ═══ media-rtcp.js ═════════════════════════════════════════════════ */
const __media_rtcp = (() => {
  const { writeUInt16BE, writeUInt32BE } = __bytes;
  const { randomBytes } = __primitives;
  const RTCP_PT = {
      SR: 200,
      SDES: 202
  };

  const NTP_UNIX_OFFSET_SECS = 2208988800;
  const WHATSAPP_RTCP_CNAME_LEN = 18;

  const HEX_CHARS = '0123456789abcdef';

  function buildWhatsappRtcpCname(entropy) {
      const randomHex = new Array(11);
      for (let nibble = 0; nibble < 11; nibble++) {
          const b = entropy[6 + Math.floor(nibble / 2)];
          randomHex[nibble] = (nibble & 1) === 0 ? HEX_CHARS[b >> 4] : HEX_CHARS[b & 0x0f];
      }
      const cname = new Uint8Array(WHATSAPP_RTCP_CNAME_LEN);
      const encoder = new TextEncoder();
      cname.set(encoder.encode(randomHex.slice(0, 5).join('')), 0);
      cname.set(encoder.encode('@pj'), 5);
      cname.set(encoder.encode(randomHex.slice(5).join('')), 8);
      cname.set(encoder.encode('.org'), 14);
      return cname;
  }

  function buildSenderReport(localSsrc, stats, nowMs) {
      const buf = new Uint8Array(28);
      buf[0] = 0x80;
      buf[1] = RTCP_PT.SR;
      buf[3] = 6;
      writeUInt32BE(buf, localSsrc, 4);
      const ntpSec = Math.floor(nowMs / 1000) + NTP_UNIX_OFFSET_SECS;
      const ntpFrac = Math.round(((nowMs % 1000) / 1000) * 4294967296);
      writeUInt32BE(buf, ntpSec >>> 0, 8);
      writeUInt32BE(buf, ntpFrac >>> 0, 12);
      writeUInt32BE(buf, stats.rtpTimestamp >>> 0, 16);
      writeUInt32BE(buf, stats.packetsSent >>> 0, 20);
      writeUInt32BE(buf, stats.octetsSent >>> 0, 24);
      return buf;
  }

  function buildSourceDescription(localSsrc, cname) {
      const packet = new Uint8Array(32);
      packet[0] = 0x81;
      packet[1] = RTCP_PT.SDES;
      writeUInt16BE(packet, 7, 2);
      writeUInt32BE(packet, localSsrc, 4);
      packet[8] = 1;
      packet[9] = WHATSAPP_RTCP_CNAME_LEN;
      packet.set(cname, 10);
      return packet;
  }

  function buildSenderReportWithSdes(localSsrc, stats, nowMs, cname) {
      const sr = buildSenderReport(localSsrc, stats, nowMs);
      const sdes = buildSourceDescription(localSsrc, cname);
      const out = new Uint8Array(sr.length + sdes.length);
      out.set(sr, 0);
      out.set(sdes, sr.length);
      return out;
  }

  function generateWhatsappRtcpCname() {
      return buildWhatsappRtcpCname(randomBytes(12));
  }
  return { RTCP_PT, buildWhatsappRtcpCname, buildSenderReport, buildSourceDescription, buildSenderReportWithSdes, generateWhatsappRtcpCname };
})();

/* ═══ mlow-codec.js ═════════════════════════════════════════════════ */
const __mlow_codec = (() => {
  const { createNoopLogger } = __core;
  const { toError } = __util;
  const MLOW_SAMPLE_RATE = 16_000;
  const MLOW_CHANNELS = 1;
  const FRAME_SIZE = 960;
  const MAX_FRAME_SIZE = 1_920;
  const APPLICATION_VOIP = 2048;
  const SIGNAL_VOICE = 3001;
  const CONCEAL_QUANTUM = MLOW_SAMPLE_RATE / 400;
  const DEFAULT_BITRATE = 24_000;
  const DEFAULT_MAX_CONCEAL_FRAMES = 5;
  const MAX_LOSS_HINT = 20;
  const SEQ_SPACE = 0x1_0000;
  const SEQ_HALF = 0x8000;
  const MLOW_ENCODER_CTL = Object.freeze({
      SUBFRAME_IMPORTANCE: 4060,
      USE_SPEECH_ACTIVITY_FLATNESS: 4062,
      VAD_NON_BINARY: 4066,
      VAD_HIGHPASS_SHARPNESS: 4068
  });
  let wasmReady = null;
  function loadMlowModule() {
      if (!wasmReady) {
          wasmReady = import('../audio-codec.js')
              .then(async (mod) => {
              const lib = mod;
              await lib.loadLibopus();
              return lib;
          })
              .catch((err) => {
              wasmReady = null;
              throw err;
          });
      }
      return wasmReady;
  }
  class MLowCodec {
      encoder = null;
      decoder = null;
      frameSize = FRAME_SIZE;
      logger = createNoopLogger();
      decodeErrors = 0;
      decodeSuccess = 0;
      plcFrames = 0;
      fecFrames = 0;
      lateFrames = 0;
      concealCapped = 0;
      opts = {};
      packetLossPercent = 0;
      maxConcealFrames = DEFAULT_MAX_CONCEAL_FRAMES;
      lastSeq = -1;
      lastDecodedSamples = 0;
      pcmScratch = new Int16Array(FRAME_SIZE);
      lib = null;
      encoderOptions = null;
      silenceScratch = new Float32Array(MAX_FRAME_SIZE);
      constructor() { }
      static async create(opts = {}) {
          const codec = new MLowCodec();
          await codec.init(opts);
          return codec;
      }
      async init(opts) {
          this.opts = opts;
          this.logger = opts.logger ?? createNoopLogger();
          this.packetLossPercent = Math.min(MAX_LOSS_HINT, clampPercent(opts.packetLossPercent ?? 0));
          const requestedConcealFrames = opts.maxConcealFrames;
          this.maxConcealFrames = Math.max(0, Math.trunc(Number.isFinite(requestedConcealFrames)
              ? requestedConcealFrames
              : DEFAULT_MAX_CONCEAL_FRAMES));
          const lib = await loadMlowModule();
          this.lib = lib;
          if (!opts.encodeOnly) {
              this.decoder = await lib.createDecoder({
                  channels: MLOW_CHANNELS,
                  sampleRate: MLOW_SAMPLE_RATE,
                  useSmpl: true,
                  maxFrameSize: MAX_FRAME_SIZE
              });
          }
          if (opts.decodeOnly) {
              return;
          }
          try {
              this.encoderOptions = {
                  channels: MLOW_CHANNELS,
                  sampleRate: MLOW_SAMPLE_RATE,
                  application: APPLICATION_VOIP,
                  frameSize: FRAME_SIZE,
                  useSmpl: true,
                  dtx: opts.dtx ?? false,
                  fec: opts.fec ?? true,
                  packetLossPercent: this.packetLossPercent,
                  bitrate: opts.bitrate ?? DEFAULT_BITRATE,
                  complexity: opts.complexity ?? 5,
                  signal: SIGNAL_VOICE
              };
              this.encoder = await lib.createEncoder(this.encoderOptions);
          }
          catch (err) {
              this.decoder?.free();
              this.decoder = null;
              throw err;
          }
          if (opts.tunables) {
              this.applyEncoderTunables(opts.tunables);
          }
      }
      encode(float32Audio) {
          if (!this.encoder) {
              throw new Error('[MLowCodec] encoder not initialized');
          }
          if (float32Audio.length !== this.frameSize) {
              throw new Error(`[MLowCodec] encode expects ${this.frameSize} samples, got ${float32Audio.length}`);
          }
          const pcm = this.pcmScratch;
          for (let i = 0; i < pcm.length; i++) {
              const sample = Math.max(-1, Math.min(1, float32Audio[i]));
              pcm[i] = Math.round(sample * 32_767);
          }
          return this.encoder.encode(pcm, { frameSize: this.frameSize });
      }
      decode(mlowFrame) {
          if (!this.decoder) {
              throw new Error('[MLowCodec] decoder not initialized');
          }
          if (mlowFrame === null) {
              return this.conceal(this.concealFrameSize());
          }
          const decoded = this.tryDecode(mlowFrame);
          return decoded ?? this.silence(this.concealFrameSize());
      }
      decodeSequenced(seq, packet, onFrame) {
          if (!this.decoder) {
              throw new Error('[MLowCodec] decoder not initialized');
          }
          if (packet.length === 0) {
              return;
          }
          const current = seq & 0xffff;
          if (this.lastSeq >= 0) {
              const delta = (current - this.lastSeq + SEQ_SPACE) % SEQ_SPACE;
              if (delta === 0 || delta >= SEQ_HALF) {
                  this.lateFrames++;
                  return;
              }
              if (delta > 1) {
                  this.concealGap(delta - 1, packet, onFrame);
              }
          }
          const decoded = this.tryDecode(packet);
          if (decoded === null) {
              this.lastSeq = (current - 1 + SEQ_SPACE) % SEQ_SPACE;
              return;
          }
          this.lastSeq = current;
          onFrame(decoded);
      }
      resetSequence() {
          this.lastSeq = -1;
          this.lastDecodedSamples = 0;
      }
      setExpectedPacketLossPercent(percent) {
          const next = Math.min(MAX_LOSS_HINT, clampPercent(percent));
          if (next === this.packetLossPercent) {
              return;
          }
          this.packetLossPercent = next;
          if (!this.encoder) {
              return;
          }
          try {
              this.encoder.setPacketLossPercent(next);
          }
          catch (err) {
              this.logger.warn('mlow packet loss percent rejected', {
                  percent: next,
                  message: toError(err).message
              });
          }
      }
      getExpectedPacketLossPercent() {
          return this.packetLossPercent;
      }
      applyEncoderTunables(tunables) {
          if (!this.encoder) {
              throw new Error('[MLowCodec] encoder not initialized');
          }
          this.opts = { ...this.opts, tunables };
          this.writeCtl(MLOW_ENCODER_CTL.SUBFRAME_IMPORTANCE, tunables.subframeImportance);
          this.writeCtl(MLOW_ENCODER_CTL.USE_SPEECH_ACTIVITY_FLATNESS, tunables.useSpeechActivityFlatness);
          this.writeCtl(MLOW_ENCODER_CTL.VAD_NON_BINARY, tunables.vadNonBinary);
          this.writeCtl(MLOW_ENCODER_CTL.VAD_HIGHPASS_SHARPNESS, tunables.vadHighpassSharpness);
      }
      getStats() {
          return {
              success: this.decodeSuccess,
              errors: this.decodeErrors,
              plc: this.plcFrames,
              fec: this.fecFrames,
              late: this.lateFrames,
              concealCapped: this.concealCapped
          };
      }
      getFrameSize() {
          return this.frameSize;
      }
      getFrameDurationMs() {
          return (this.frameSize / MLOW_SAMPLE_RATE) * 1000;
      }
      getSampleRate() {
          return MLOW_SAMPLE_RATE;
      }
      getMaxConcealFrames() {
          return this.maxConcealFrames;
      }
      async reset() {
          this.destroy();
          await this.init(this.opts);
          this.decodeErrors = 0;
          this.decodeSuccess = 0;
          this.plcFrames = 0;
          this.fecFrames = 0;
          this.lateFrames = 0;
          this.concealCapped = 0;
          this.resetSequence();
      }
      destroy() {
          this.encoder?.free();
          this.decoder?.free();
          this.encoder = null;
          this.decoder = null;
      }
      concealGap(missing, nextPacket, onFrame) {
          const limit = this.maxConcealFrames;
          const frames = missing > limit ? limit : missing;
          if (frames < missing) {
              this.concealCapped++;
          }
          if (frames <= 0) {
              return;
          }
          const frameSize = this.concealFrameSize();
          for (let i = 0; i < frames - 1; i++) {
              onFrame(this.conceal(frameSize));
          }
          onFrame(this.recoverPrevious(nextPacket, frameSize));
      }
      tryDecode(mlowFrame) {
          if (!this.decoder) {
              return null;
          }
          try {
              const audio = this.decoder.decodeFloat(mlowFrame);
              this.decodeSuccess++;
              if (audio.length > 0) {
                  this.lastDecodedSamples = audio.length;
              }
              return audio;
          }
          catch (err) {
              this.decodeErrors++;
              return null;
          }
      }
      recoverPrevious(nextPacket, frameSize) {
          if (!this.decoder) {
              return this.silence(frameSize);
          }
          try {
              const recovered = this.decoder.decodeFloat(nextPacket, {
                  decodeFec: true,
                  frameSize
              });
              this.fecFrames++;
              return recovered;
          }
          catch (err) {
              return this.conceal(frameSize);
          }
      }
      conceal(frameSize) {
          if (!this.decoder) {
              return this.silence(frameSize);
          }
          try {
              const concealed = this.decoder.decodePacketLossFloat(frameSize);
              this.plcFrames++;
              return concealed;
          }
          catch (err) {
              return this.silence(frameSize);
          }
      }
      concealFrameSize() {
          const last = this.lastDecodedSamples;
          if (last <= 0) {
              return this.frameSize;
          }
          const quantized = Math.round(last / CONCEAL_QUANTUM) * CONCEAL_QUANTUM;
          if (quantized < CONCEAL_QUANTUM) {
              return CONCEAL_QUANTUM;
          }
          return quantized > MAX_FRAME_SIZE ? MAX_FRAME_SIZE : quantized;
      }
      silence(frameSize) {
          const size = frameSize > MAX_FRAME_SIZE ? MAX_FRAME_SIZE : frameSize;
          return this.silenceScratch.subarray(0, size);
      }
      writeCtl(request, value) {
          if (value === undefined || !this.encoder) {
              return;
          }
          try {
              this.encoder.encoderCtl(request, value);
          }
          catch (err) {
              this.logger.warn('mlow encoder ctl rejected', {
                  request,
                  value,
                  message: toError(err).message
              });
          }
      }
  }
  function clampPercent(value) {
      if (!Number.isFinite(value)) {
          return 0;
      }
      const rounded = Math.round(value);
      if (rounded < 0) {
          return 0;
      }
      return rounded > 100 ? 100 : rounded;
  }
  return { MLOW_ENCODER_CTL, MLowCodec };
})();

/* ═══ shim-protocol.js ══════════════════════════════════════════════ */
const __shim_protocol = (() => {
  const WA_DEFAULTS = Object.freeze({
      HOST_DOMAIN: 's.whatsapp.net',
      GROUP_SERVER: 'g.us',
      BROADCAST_SERVER: 'broadcast',
      LID_SERVER: 'lid',
      HOSTED_SERVER: 'hosted',
      HOSTED_LID_SERVER: 'hosted.lid',
      HOSTED_DEVICE_ID: 99,
      MSGR_SERVER: 'msgr',
      INTEROP_SERVER: 'interop',
      NEWSLETTER_SERVER: 'newsletter',
      BOT_SERVER: 'bot',
      STATUS_BROADCAST_JID: 'status@broadcast'
  });
  const WA_MESSAGE_TAGS = Object.freeze({
      MESSAGE: 'message',
      ENC: 'enc',
      RECEIPT: 'receipt',
      ACK: 'ack',
      ERROR: 'error'
  });
  const KNOWN_SERVERS = [
      WA_DEFAULTS.LID_SERVER,
      WA_DEFAULTS.HOST_DOMAIN,
      WA_DEFAULTS.GROUP_SERVER,
      WA_DEFAULTS.BROADCAST_SERVER,
      WA_DEFAULTS.NEWSLETTER_SERVER,
      WA_DEFAULTS.HOSTED_SERVER,
      WA_DEFAULTS.HOSTED_LID_SERVER,
      WA_DEFAULTS.BOT_SERVER,
      WA_DEFAULTS.MSGR_SERVER,
      WA_DEFAULTS.INTEROP_SERVER
  ];
  function internServerAt(jid, from) {
      const length = jid.length - from;
      for (let index = 0; index < KNOWN_SERVERS.length; index += 1) {
          const server = KNOWN_SERVERS[index];
          if (server.length === length && jid.startsWith(server, from))
              return server;
      }
      return jid.slice(from);
  }
  function findAtIndex(jid) {
      const atIndex = jid.indexOf('@');
      if (atIndex < 1 || atIndex >= jid.length - 1)
          throw new Error(`invalid jid: ${jid}`);
      return atIndex;
  }
  function isJidType(jid, type) {
      const atIndex = jid.length - type.length - 1;
      if (atIndex < 1 || jid.charCodeAt(atIndex) !== 64 || !jid.endsWith(type))
          return false;
      for (let i = 0; i < atIndex; i += 1) {
          if (jid.charCodeAt(i) === 64)
              return false;
      }
      return true;
  }
  function isLidJid(jid) {
      return isJidType(jid, WA_DEFAULTS.LID_SERVER);
  }
  function isUserJid(jid) {
      return isJidType(jid, WA_DEFAULTS.HOST_DOMAIN);
  }
  function isGroupJid(jid) {
      return isJidType(jid, WA_DEFAULTS.GROUP_SERVER);
  }
  function parseSignalAddressFromJid(jid) {
      const atIndex = findAtIndex(jid);
      const colonIndex = jid.indexOf(':', 0);
      const server = internServerAt(jid, atIndex + 1);
      if (colonIndex === -1 || colonIndex > atIndex) {
          return { user: jid.slice(0, atIndex), server, device: 0 };
      }
      if (colonIndex >= atIndex - 1)
          throw new Error(`invalid jid device: ${jid}`);
      let device = 0;
      for (let i = colonIndex + 1; i < atIndex; i += 1) {
          const digit = jid.charCodeAt(i) - 48;
          if (digit < 0 || digit > 9)
              throw new Error(`invalid jid device: ${jid}`);
          device = device * 10 + digit;
          if (device > Number.MAX_SAFE_INTEGER)
              throw new Error(`invalid jid device: ${jid}`);
      }
      return { user: jid.slice(0, colonIndex), server, device };
  }
  function isHostedServerAt(jid, from) {
      const length = jid.length - from;
      if (length === WA_DEFAULTS.HOSTED_SERVER.length) {
          return jid.startsWith(WA_DEFAULTS.HOSTED_SERVER, from);
      }
      if (length === WA_DEFAULTS.HOSTED_LID_SERVER.length) {
          return jid.startsWith(WA_DEFAULTS.HOSTED_LID_SERVER, from);
      }
      return false;
  }
  function canonicalizeSignalServer(server, hostDomain = WA_DEFAULTS.HOST_DOMAIN) {
      if (server === WA_DEFAULTS.HOSTED_SERVER)
          return hostDomain;
      if (server === WA_DEFAULTS.HOSTED_LID_SERVER)
          return WA_DEFAULTS.LID_SERVER;
      return server;
  }
  function toUserJid(jid, options = {}) {
      const canonicalize = options.canonicalizeSignalServer === true;
      const atIndex = jid.indexOf('@');
      if (atIndex >= 1 && atIndex < jid.length - 1) {
          const colonIndex = jid.indexOf(':', 0);
          if ((colonIndex === -1 || colonIndex > atIndex) &&
              (!canonicalize || !isHostedServerAt(jid, atIndex + 1))) {
              return jid;
          }
      }
      const address = parseSignalAddressFromJid(jid);
      const baseServer = address.server ?? WA_DEFAULTS.HOST_DOMAIN;
      const server = canonicalize
          ? canonicalizeSignalServer(baseServer, options.hostDomain ?? WA_DEFAULTS.HOST_DOMAIN)
          : baseServer;
      if (server === baseServer && jid.length === address.user.length + 1 + server.length) {
          return jid;
      }
      return `${address.user}@${server}`;
  }
  function normalizeDeviceJid(jid) {
      const address = parseSignalAddressFromJid(jid);
      if (address.device === 0)
          return `${address.user}@${address.server}`;
      return `${address.user}:${address.device}@${address.server}`;
  }
  return { WA_DEFAULTS, WA_MESSAGE_TAGS, isLidJid, isUserJid, isGroupJid, parseSignalAddressFromJid, toUserJid, normalizeDeviceJid };
})();

/* ═══ transport.js ══════════════════════════════════════════════════ */
const __transport = (() => {
  const { WA_MESSAGE_TAGS } = __shim_protocol;
  const { TEXT_DECODER } = __util;
  const EMPTY_NODE_CHILDREN = Object.freeze([]);
  function getNodeChildren(node) {
      return Array.isArray(node.content) ? node.content : EMPTY_NODE_CHILDREN;
  }
  function getNodeTextContent(node) {
      if (!node)
          return undefined;
      const content = node.content;
      if (content instanceof Uint8Array)
          return TEXT_DECODER.decode(content);
      if (typeof content === 'string')
          return content;
      return undefined;
  }
  function findNodeChild(node, tag) {
      const content = node.content;
      if (!Array.isArray(content))
          return undefined;
      for (let i = 0; i < content.length; i++) {
          if (content[i].tag === tag)
              return content[i];
      }
      return undefined;
  }
  function getFirstNodeChild(node) {
      return getNodeChildren(node)[0];
  }
  function getNodeChildrenByTag(node, tag) {
      const content = node.content;
      if (!Array.isArray(content))
          return EMPTY_NODE_CHILDREN;
      let tagged = null;
      for (let i = 0; i < content.length; i++) {
          if (content[i].tag !== tag)
              continue;
          if (!tagged)
              tagged = [];
          tagged.push(content[i]);
      }
      return tagged ?? EMPTY_NODE_CHILDREN;
  }
  function hasNodeChild(node, tag) {
      return findNodeChild(node, tag) !== undefined;
  }
  function buildAckNode(input) {
      if (input.kind !== 'custom') {
          throw new Error(`buildAckNode: unsupported kind "${input.kind}"`);
      }
      const attrs = {
          class: input.ackClass,
          to: input.to
      };
      if (input.id)
          attrs.id = input.id;
      if (input.type)
          attrs.type = input.type;
      if (input.participant)
          attrs.participant = input.participant;
      if (input.recipient)
          attrs.recipient = input.recipient;
      if (input.from)
          attrs.from = input.from;
      if (input.error !== undefined)
          attrs.error = String(input.error);
      return {
          tag: WA_MESSAGE_TAGS.ACK,
          attrs,
          content: input.content
      };
  }
  function buildReceiptNode(input) {
      if (input.kind !== 'custom') {
          throw new Error(`buildReceiptNode: unsupported kind "${input.kind}"`);
      }
      return {
          tag: WA_MESSAGE_TAGS.RECEIPT,
          attrs: { ...input.attrs },
          content: input.content
      };
  }
  return { getNodeChildren, getNodeTextContent, findNodeChild, getFirstNodeChild, getNodeChildrenByTag, hasNodeChild, buildAckNode, buildReceiptNode };
})();

/* ═══ relay-ack.js ══════════════════════════════════════════════════ */
const __relay_ack = (() => {
  const { TEXT_DECODER } = __bytes;
  const { getNodeChildren, getNodeChildrenByTag, getNodeTextContent } = __transport;
  const { base64ToBytes, bytesToBase64 } = __util;
  function formatIpv6(bytes) {
      const groups = new Array(8);
      let bestStart = -1;
      let bestLen = 0;
      let runStart = -1;
      let runLen = 0;
      for (let i = 0; i < 8; i++) {
          const value = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
          groups[i] = value.toString(16);
          if (value === 0) {
              if (runStart < 0) {
                  runStart = i;
              }
              runLen++;
              if (runLen > bestLen) {
                  bestStart = runStart;
                  bestLen = runLen;
              }
          }
          else {
              runStart = -1;
              runLen = 0;
          }
      }
      if (bestLen < 2) {
          return groups.join(':');
      }
      return `${groups.slice(0, bestStart).join(':')}::${groups.slice(bestStart + bestLen).join(':')}`;
  }
  function parseRelayFromAck(ackNode) {
      const relays = [];
      const participantJids = [];
      const participantSeen = new Set();
      let uuid = '';
      let selfPid;
      let peerPid;
      let hbhKey;
      if (!ackNode.content || !Array.isArray(ackNode.content)) {
          return { relays, participantJids, uuid };
      }
      for (const child of ackNode.content) {
          if (typeof child !== 'object' || !('tag' in child))
              continue;
          if (child.tag === 'user' && Array.isArray(child.content)) {
              for (const deviceNode of child.content) {
                  if (typeof deviceNode === 'object' &&
                      'tag' in deviceNode &&
                      deviceNode.tag === 'device' &&
                      deviceNode.attrs?.jid) {
                      const jid = deviceNode.attrs.jid;
                      if (!participantSeen.has(jid)) {
                          participantSeen.add(jid);
                          participantJids.push(jid);
                      }
                  }
              }
          }
          if (child.tag !== 'relay')
              continue;
          const relayNode = child;
          uuid = relayNode.attrs?.uuid || '';
          if (relayNode.attrs?.self_pid)
              selfPid = parseInt(relayNode.attrs.self_pid, 10);
          if (relayNode.attrs?.peer_pid)
              peerPid = parseInt(relayNode.attrs.peer_pid, 10);
          const relayContent = getNodeChildren(relayNode);
          for (const rc of getNodeChildrenByTag(relayNode, 'participant')) {
              const jid = rc.attrs?.jid;
              if (jid && !participantSeen.has(jid)) {
                  participantSeen.add(jid);
                  participantJids.push(jid);
              }
          }
          let relayKey = '';
          const tokens = new Map();
          const authTokens = new Map();
          const rawTokens = new Map();
          const rawAuthTokens = new Map();
          for (const rc of relayContent) {
              if (typeof rc !== 'object' || !('tag' in rc))
                  continue;
              const rcNode = rc;
              if (rcNode.tag === 'key' && rcNode.content) {
                  relayKey = getNodeTextContent(rcNode) ?? '';
              }
              if (rcNode.tag === 'hbh_key' && rcNode.content) {
                  let rawKey;
                  if (rcNode.content instanceof Uint8Array) {
                      rawKey = rcNode.content;
                  }
                  else if (typeof rcNode.content === 'string') {
                      rawKey = base64ToBytes(rcNode.content);
                  }
                  if (rawKey) {
                      if (rawKey.length === 30) {
                          hbhKey = rawKey;
                      }
                      else if (rawKey.length > 30) {
                          const asB64 = TEXT_DECODER.decode(rawKey).trim();
                          const decoded = base64ToBytes(asB64);
                          if (decoded.length === 30)
                              hbhKey = decoded;
                      }
                  }
              }
              if (rcNode.tag === 'token' && rcNode.content) {
                  const tokenId = rcNode.attrs?.id || '0';
                  const tokenData = rcNode.content instanceof Uint8Array
                      ? bytesToBase64(rcNode.content)
                      : String(rcNode.content);
                  tokens.set(tokenId, tokenData);
                  if (rcNode.content instanceof Uint8Array) {
                      rawTokens.set(tokenId, rcNode.content);
                  }
              }
              if (rcNode.tag === 'auth_token' && rcNode.content) {
                  const authTokenId = rcNode.attrs?.id || '0';
                  const authTokenData = rcNode.content instanceof Uint8Array
                      ? bytesToBase64(rcNode.content)
                      : String(rcNode.content);
                  authTokens.set(authTokenId, authTokenData);
                  if (rcNode.content instanceof Uint8Array) {
                      rawAuthTokens.set(authTokenId, rcNode.content);
                  }
              }
          }
          for (const endpointTag of ['te2', 'te']) {
              for (const rcNode of getNodeChildrenByTag(relayNode, endpointTag)) {
                  const addrBytes = rcNode.content;
                  if (!(addrBytes instanceof Uint8Array)) {
                      continue;
                  }
                  const addrLength = addrBytes.length;
                  if (addrLength !== 6 && addrLength !== 18 && addrLength !== 24) {
                      continue;
                  }
                  const tokenId = rcNode.attrs?.token_id || '0';
                  const authTokenId = rcNode.attrs?.auth_token_id || '';
                  const shared = {
                      token: tokens.get(tokenId) || '',
                      authToken: authTokenId ? authTokens.get(authTokenId) : undefined,
                      rawAuthToken: authTokenId ? rawAuthTokens.get(authTokenId) : undefined,
                      rawToken: rawTokens.get(tokenId),
                      key: relayKey,
                      relayId: parseInt(rcNode.attrs?.relay_id || '0', 10),
                      protocol: rcNode.attrs?.protocol ? parseInt(rcNode.attrs.protocol, 10) : 0,
                      c2rRtt: rcNode.attrs?.c2r_rtt ? parseInt(rcNode.attrs.c2r_rtt, 10) : undefined,
                      relayName: rcNode.attrs?.relay_name || '',
                      authTokenId: authTokenId || tokenId,
                      isFna: rcNode.attrs?.is_fna === '1'
                  };
                  if (addrLength !== 18) {
                      const v4 = addrBytes.subarray(0, 6);
                      relays.push({
                          ...shared,
                          ip: `${v4[0]}.${v4[1]}.${v4[2]}.${v4[3]}`,
                          port: (v4[4] << 8) | v4[5],
                          addressBytes: new Uint8Array(v4)
                      });
                  }
                  if (addrLength !== 6) {
                      const v6 = addrLength === 18 ? addrBytes : addrBytes.subarray(6);
                      relays.push({
                          ...shared,
                          ip: formatIpv6(v6),
                          port: (v6[16] << 8) | v6[17],
                          addressBytes: new Uint8Array(v6)
                      });
                  }
              }
          }
      }
      relays.sort((a, b) => {
          if (!!a.isFna !== !!b.isFna)
              return a.isFna ? 1 : -1;
          return (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity);
      });
      return { relays, participantJids, uuid, selfPid, peerPid, hbhKey };
  }
  return { parseRelayFromAck };
})();

/* ═══ baileys-resolve.js ════════════════════════════════════════════ */
const __baileys_resolve = (() => {
  const DEFAULT_CANDIDATES = [
      'baileys',
      '@whiskeysockets/baileys',
      '@adiwajshing/baileys',
      '@itsliaaa/baileys',
  ];

  function candidateNames() {
      return DEFAULT_CANDIDATES;
  }

  let cachedModule = null;

  async function resolveBaileysModule() {
      if (cachedModule) return cachedModule;
      const names = candidateNames();
      let lastError;
      for (const name of names) {
          try {
              cachedModule = await import(name);
              return cachedModule;
          } catch (err) {
              lastError = err;
          }
      }
      throw new Error(
          `voip: could not find a Baileys install (tried: ${names.join(', ')}). ` +
          `Install one of these packages or add an npm alias for it named "baileys" in your package.json. ` +
          `Last error: ${lastError?.message || lastError}`
      );
  }
  return { resolveBaileysModule };
})();

/* ═══ proto.js ══════════════════════════════════════════════════════ */
const __proto = (() => {
  const { resolveBaileysModule } = __baileys_resolve;
  let cachedProto;

  async function getProto() {
      if (cachedProto) return cachedProto;
      const mod = await resolveBaileysModule();
      cachedProto = mod.proto;
      return cachedProto;
  }
  return { getProto };
})();

/* ═══ signaling.js ══════════════════════════════════════════════════ */
const __signaling = (() => {
  const { TEXT_ENCODER } = __bytes;
  const { createNoopLogger, unpadPkcs7, writeRandomPadMax16 } = __core;
  const { randomBytes } = __primitives;
  const { getProto } = __proto;
  const { parseSignalAddressFromJid, toUserJid } = __shim_protocol;
  const { buildAckNode, buildReceiptNode, findNodeChild, getFirstNodeChild, getNodeChildren, getNodeChildrenByTag } = __transport;
  const { bytesToHex, toError } = __util;
  async function encodeWAMessage(message) {
      const proto = await getProto();
      return writeRandomPadMax16(proto.Message.encode(message).finish());
  }
  function generateCallId() {
      const bytes = new Uint8Array(16);
      for (let i = 0; i < 16; i++) {
          bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytesToHex(bytes).toUpperCase();
  }
  function generateCallStanzaId() {
      return bytesToHex(randomBytes(16)).toUpperCase();
  }
  function extractNodeInfo(node) {
      const innerNode = getFirstNodeChild(node);
      if (!innerNode) {
          return null;
      }
      return {
          tag: innerNode.tag,
          peerJid: node.attrs.from,
          callId: innerNode.attrs?.['call-id'] || '',
          peerPlatform: node.attrs.platform || '',
          peerAppVersion: node.attrs.version || '',
          epochId: innerNode.attrs?.e,
          timestamp: innerNode.attrs?.t,
          innerNode
      };
  }
  function toRelayEndpoint(node) {
      const relay = {
          ip: node.attrs?.ip || '',
          port: parseInt(node.attrs?.port || '3480', 10),
          token: node.attrs?.token || '',
          key: node.attrs?.['relay-key'] || node.attrs?.key || '',
          relayId: parseInt(node.attrs?.['relay-id'] || '0', 10),
          c2rRtt: node.attrs?.['c2r-rtt'] ? parseInt(node.attrs['c2r-rtt'], 10) : undefined
      };
      return relay.ip && relay.token ? relay : null;
  }
  function extractRelayEndpoints(node) {
      const relayNodes = [...getNodeChildrenByTag(node, 'relay')];
      for (const wrapper of getNodeChildrenByTag(node, 'relays')) {
          relayNodes.push(...getNodeChildrenByTag(wrapper, 'relay'));
      }
      const relays = [];
      for (const relayNode of relayNodes) {
          const relay = toRelayEndpoint(relayNode);
          if (relay) {
              relays.push(relay);
          }
      }
      relays.sort((a, b) => (a.c2rRtt ?? Infinity) - (b.c2rRtt ?? Infinity));
      return relays;
  }
  async function decryptCallKey(deps, node, peerJid, logger) {
      const log = logger ?? createNoopLogger();
      const proto = await getProto();
      const isEnc = (child) => child.tag === 'enc' && !!child.attrs?.type;
      const encNodes = getNodeChildren(node).filter(isEnc);
      const destinationNode = findNodeChild(node, 'destination');
      if (destinationNode) {
          for (const toNode of getNodeChildren(destinationNode)) {
              if (toNode.tag === 'to') {
                  encNodes.push(...getNodeChildren(toNode).filter(isEnc));
              }
          }
      }
      const address = parseSignalAddressFromJid(peerJid);
      for (const encNode of encNodes) {
          if (!(encNode.content instanceof Uint8Array)) {
              continue;
          }
          try {
              const decrypted = await deps.signalProtocol.decryptMessage(address, {
                  type: encNode.attrs.type,
                  ciphertext: encNode.content
              });
              const message = proto.Message.decode(unpadPkcs7(decrypted));
              const callKey = message.call?.callKey;
              if (callKey && callKey.length === 32) {
                  return callKey;
              }
          }
          catch (err) {
              log.trace('call key decrypt candidate failed', { message: toError(err).message });
          }
      }
      return undefined;
  }
  const CAPABILITY_OFFER = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe4, 0xbb, 0x07]);
  const CAPABILITY_PREACCEPT = new Uint8Array([0x01, 0x05, 0xff, 0x09, 0xe4, 0xbb, 0x07]);
  async function buildCallParticipantNodes(deps, devices, callKey) {
      await deps.sessionResolver.ensureSessionsBatch(devices);
      const plaintext = await encodeWAMessage({ call: { callKey } });
      const encrypted = await Promise.all(devices.map((jid) => deps.signalProtocol.encryptMessage(parseSignalAddressFromJid(jid), plaintext)));
      const nodes = devices.map((jid, index) => ({
          tag: 'to',
          attrs: { jid },
          content: [
              {
                  tag: 'enc',
                  attrs: { v: '2', type: encrypted[index].type, count: '0' },
                  content: encrypted[index].ciphertext
              }
          ]
      }));
      return {
          nodes,
          shouldIncludeDeviceIdentity: encrypted.some((entry) => entry.type === 'pkmsg')
      };
  }
  async function buildOfferStanza(deps, stores, callId, callKey, peerJid, isVideo, logger) {
      const log = logger ?? createNoopLogger();
      const creds = deps.authClient.getCurrentCredentials();
      const callCreator = creds?.meLid || creds?.meJid || '';
      const synced = await deps.signalDeviceSync.syncDeviceList([peerJid]);
      const devices = synced.flatMap((entry) => entry.deviceJids);
      if (devices.length === 0) {
          throw new Error(`no device sessions to encrypt the call offer for ${peerJid}`);
      }
      const { nodes: destinations, shouldIncludeDeviceIdentity } = await buildCallParticipantNodes(deps, devices, callKey);
      const offerContent = [];
      try {
          const peerJidNormalized = toUserJid(peerJid);
          const tcTokenRecord = await stores.privacyToken.getByJid(peerJidNormalized);
          const tctoken = tcTokenRecord?.tcToken;
          if (tctoken) {
              offerContent.push({
                  tag: 'privacy',
                  attrs: {},
                  content: tctoken instanceof Uint8Array ? tctoken : new Uint8Array(tctoken)
              });
          }
      }
      catch (err) {
          log.trace('tctoken lookup failed', { message: toError(err).message });
      }
      offerContent.push({ tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined }, { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined });
      if (isVideo) {

          offerContent.push({
              tag: 'video',
              attrs: {
                  enc: 'h.264',
                  dec: 'H264',
                  screen_width: '1920',
                  screen_height: '1080',
                  device_orientation: '0'
              },
              content: undefined
          });
      }
      offerContent.push({ tag: 'net', attrs: { medium: '3' }, content: undefined });
      offerContent.push({
          tag: 'capability',
          attrs: { ver: '1' },
          content: CAPABILITY_OFFER
      });
      offerContent.push({ tag: 'destination', attrs: {}, content: destinations });
      offerContent.push({
          tag: 'encopt',
          attrs: { keygen: '2' },
          content: undefined
      });
      if (shouldIncludeDeviceIdentity && creds?.signedIdentity) {
          offerContent.push({
              tag: 'device-identity',
              attrs: {},
              content: creds.signedIdentity
          });
      }
      return {
          tag: 'call',
          attrs: { to: peerJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'offer',
                  attrs: { 'call-id': callId, 'call-creator': callCreator },
                  content: offerContent
              }
          ]
      };
  }
  async function buildAcceptStanza(deps, callId, callKey, peerJid, callCreator, isVideo) {
      await deps.messageDispatch.syncSignalSession(callCreator);
      const bytes = await encodeWAMessage({ call: { callKey } });
      let encNode;
      let shouldIncludeDeviceIdentity = false;
      try {
          const { type, ciphertext } = await deps.signalProtocol.encryptMessage(parseSignalAddressFromJid(callCreator), bytes);
          if (type === 'pkmsg') {
              shouldIncludeDeviceIdentity = true;
          }
          encNode = {
              tag: 'enc',
              attrs: { v: '2', type, count: '0' },
              content: ciphertext
          };
      }
      catch (err) {
          throw new Error(`Failed to encrypt accept for ${callCreator}: ${err.message}`);
      }
      const acceptContent = [
          { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
          { tag: 'net', attrs: { medium: '3' } },
          encNode,
          { tag: 'encopt', attrs: { keygen: '2' } }
      ];
      const acceptSignedIdentity = deps.authClient.getCurrentCredentials()?.signedIdentity;
      if (shouldIncludeDeviceIdentity && acceptSignedIdentity) {
          acceptContent.push({
              tag: 'device-identity',
              attrs: {},
              content: acceptSignedIdentity
          });
      }
      if (isVideo) {

          acceptContent.push({ tag: 'video', attrs: { dec: 'H264', device_orientation: '0' } });
      }
      const toJidClean = toUserJid(peerJid);
      return {
          tag: 'call',
          attrs: { to: toJidClean, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'accept',
                  attrs: { 'call-id': callId, 'call-creator': callCreator },
                  content: acceptContent
              }
          ]
      };
  }
  function buildTerminateStanza(peerJid, callId, callCreator, audioDurationMs, reason) {
      const attrs = {
          'call-id': callId,
          'call-creator': callCreator
      };
      if (audioDurationMs !== undefined && audioDurationMs >= 0) {
          const ms = String(Math.floor(audioDurationMs));
          attrs.duration = ms;
          attrs.audio_duration = ms;
      }
      if (reason !== undefined) {
          attrs.reason = reason;
      }
      return {
          tag: 'call',
          attrs: { to: peerJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'terminate',
                  attrs,
                  content: undefined
              }
          ]
      };
  }
  function buildRelaylatencyForwardStanza(peerJid, callId, callCreator, teNodes, destinationJids) {
      const destinationContent = destinationJids.map((jid) => ({
          tag: 'to',
          attrs: { jid },
          content: undefined
      }));
      return {
          tag: 'call',
          attrs: { to: toUserJid(peerJid), id: generateCallStanzaId() },
          content: [
              {
                  tag: 'relaylatency',
                  attrs: { 'call-id': callId, 'call-creator': callCreator },
                  content: [
                      ...teNodes,
                      { tag: 'destination', attrs: {}, content: destinationContent }
                  ]
              }
          ]
      };
  }
  function buildRejectStanza(peerJid, callId, callCreator) {
      const toJidClean = toUserJid(peerJid);
      return {
          tag: 'call',
          attrs: { to: toJidClean, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'reject',
                  attrs: { 'call-id': callId, 'call-creator': callCreator }
              }
          ]
      };
  }
  function buildPreacceptStanza(peerJid, callId, callCreator) {
      return {
          tag: 'call',
          attrs: { to: peerJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'preaccept',
                  attrs: { 'call-id': callId, 'call-creator': callCreator },
                  content: [
                      { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                      { tag: 'encopt', attrs: { keygen: '2' } },
                      { tag: 'capability', attrs: { ver: '1' }, content: CAPABILITY_PREACCEPT }
                  ]
              }
          ]
      };
  }
  function buildRelayLatencyStanza(peerJid, callId, callCreator, relays, destinationJids, meId) {
      const seenRelays = new Set();
      const teNodes = [];
      for (const relay of relays) {
          if (!relay.relayName || seenRelays.has(relay.relayName))
              continue;
          seenRelays.add(relay.relayName);
          const encodedLatency = 0x2000000 + (relay.latency || 0);
          teNodes.push({
              tag: 'te',
              attrs: {
                  latency: String(encodedLatency),
                  relay_name: relay.relayName
              },
              content: relay.addressBytes || undefined
          });
      }
      const destinationContent = destinationJids.map((jid) => ({
          tag: 'to',
          attrs: { jid },
          content: undefined
      }));
      const relayLatencyContent = [...teNodes];
      if (destinationContent.length > 0) {
          relayLatencyContent.push({
              tag: 'destination',
              attrs: {},
              content: destinationContent
          });
      }
      const toJidClean = toUserJid(peerJid);
      return {
          tag: 'call',
          attrs: { to: toJidClean, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'relaylatency',
                  attrs: { 'call-id': callId, 'call-creator': callCreator },
                  content: relayLatencyContent
              }
          ]
      };
  }
  function buildTransportStanza(peerJid, callId, callCreator, meId, messageType = '0', p2pCandRound = '0') {
      return {
          tag: 'call',
          attrs: { to: peerJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'transport',
                  attrs: {
                      'call-id': callId,
                      'call-creator': callCreator,
                      'transport-message-type': messageType,
                      'p2p-cand-round': p2pCandRound
                  },
                  content: [
                      {
                          tag: 'net',
                          attrs: { medium: '2', protocol: '0' },
                          content: undefined
                      }
                  ]
              }
          ]
      };
  }
  function buildMuteV2Stanza(peerDeviceJid, callId, callCreator, muteState, meId) {
      return {
          tag: 'call',
          attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'mute_v2',
                  attrs: {
                      'call-id': callId,
                      'call-creator': callCreator,
                      'mute-state': String(muteState)
                  }
              }
          ]
      };
  }
  function parseMuteV2(inner) {
      const rawMuteState = inner.attrs?.['mute-state'];
      let muted = null;
      if (rawMuteState === '1') {
          muted = true;
      }
      else if (rawMuteState === '0') {
          muted = false;
      }
      return { muted, isRequest: inner.attrs?.['request-state'] !== undefined };
  }
  const RAISE_HAND_ACTION = 'raise_hand';
  const RAISE_HAND_STATE_ATTR = 'raise-hand-state';
  function buildRaiseHandStanza(peerDeviceJid, callId, callCreator, raised, broadcast = false) {
      const attrs = {
          'call-id': callId,
          'call-creator': callCreator,
          action: RAISE_HAND_ACTION
      };
      if (broadcast) {
          attrs.broadcast = '1';
      }
      return {
          tag: 'call',
          attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'user_action',
                  attrs,
                  content: [
                      {
                          tag: RAISE_HAND_ACTION,
                          attrs: { [RAISE_HAND_STATE_ATTR]: raised ? '1' : '0' }
                      }
                  ]
              }
          ]
      };
  }
  function parseRaiseHandState(node) {
      const stateNode = node.tag === RAISE_HAND_ACTION ? node : findNodeChild(node, RAISE_HAND_ACTION);
      const raw = stateNode?.attrs?.[RAISE_HAND_STATE_ATTR];
      if (raw === '1')
          return true;
      if (raw === '0')
          return false;
      return null;
  }
  function buildAcceptReceiptStanza(peerDeviceJid, acceptMsgId, callId, callCreator, ourJid) {
      return buildReceiptNode({
          kind: 'custom',
          attrs: { to: peerDeviceJid, id: acceptMsgId, from: ourJid },
          content: [{ tag: 'accept', attrs: { 'call-id': callId, 'call-creator': callCreator } }]
      });
  }

  const VideoState = {
      Disabled: 0,
      Enabled: 1,
      UpgradeRequest: 3,
      UpgradeAccept: 4,
      UpgradeReject: 5,
      Stopped: 6,
      UpgradeCancel: 8,
      UpgradeRequestV2: 11
  };
  const VideoDecRequest = 'H264';
  const VideoDecAccept = 'H264,AV1';

  function buildVideoStateStanza(peerJid, callId, callCreator, state, { dec, deviceOrientation } = {}) {
      const attrs = {
          'call-id': callId,
          'call-creator': callCreator,
          state: String(state)
      };
      if (dec)
          attrs.dec = dec;
      if (state === VideoState.UpgradeRequestV2)
          attrs.voip_settings = 'video';
      if (deviceOrientation !== undefined && deviceOrientation !== null)
          attrs.device_orientation = String(deviceOrientation);
      return {
          tag: 'call',
          attrs: { to: peerJid, id: generateCallStanzaId() },
          content: [{ tag: 'video', attrs }]
      };
  }
  const ENCRYPTED_TAGS = ['preaccept', 'accept'];
  function needsDecryption(tag) {
      return ENCRYPTED_TAGS.includes(tag);
  }
  const groupCapabilityOffer = new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xbb, 0x13]);
  const GroupCapability = Object.freeze({
      offer: groupCapabilityOffer,
      videoOffer: new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xfa, 0x13]),
      preaccept: new Uint8Array([0x01, 0x05, 0xf7, 0x09, 0xe0, 0xbb, 0x07])
  });
  function callJidFor(callId) {
      return `${callId}@call`;
  }
  function readOptionalUint(node, key) {
      const raw = node?.attrs?.[key];
      if (raw === undefined || raw === null || raw === '') {
          return undefined;
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
          throw new Error(`invalid ${key} "${raw}"`);
      }
      return value;
  }
  function readRequiredUint(node, key) {
      const value = readOptionalUint(node, key);
      if (value === undefined) {
          throw new Error(`missing ${key}`);
      }
      return value;
  }
  function readNodeBytes(node) {
      if (node?.content instanceof Uint8Array) {
          return node.content;
      }
      if (typeof node?.content === 'string') {
          return TEXT_ENCODER.encode(node.content);
      }
      return undefined;
  }
  function sameBytes(left, right) {
      return !!left && !!right && bytesToHex(left) === bytesToHex(right);
  }
  function buildGroupUserNodes(participants, creator, video) {
      return participants.map((participant) => {
          if (!participant.jid || !participant.devices?.length) {
              throw new Error('group participant is incomplete');
          }
          const attrs = { jid: participant.jid };
          if (participant.state) {
              attrs.state = participant.state;
          }
          return {
              tag: 'user',
              attrs,
              content: participant.devices.map((device) => {
                  if (!device.jid) {
                      throw new Error('group device jid is required');
                  }
                  let content;
                  if (device.capability) {
                      content = [
                          {
                              tag: 'capability',
                              attrs: device.capabilityVersion ? { ver: String(device.capabilityVersion) } : {},
                              content: video && device.jid === creator && sameBytes(device.capability, groupCapabilityOffer) ? GroupCapability.videoOffer : device.capability
                          }
                      ];
                  }
                  return { tag: 'device', attrs: { jid: device.jid }, content };
              })
          };
      });
  }
  function buildGroupVideoOfferNode() {
      return {
          tag: 'video',
          attrs: { enc: 'h.264', dec: 'H264', screen_width: '1920', screen_height: '1080', device_orientation: '0' }
      };
  }
  function buildInitialGroupOfferStanza({ callId, creator, groupJid, participants, video }) {
      if (!callId || !creator) {
          throw new Error('call id and creator are required');
      }
      if (participants.length < 3) {
          throw new Error('a group call needs yourself and at least two other participants');
      }
      const content = [
          { tag: 'audio', attrs: { enc: 'opus', rate: '8000' } },
          { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }
      ];
      if (video) {
          content.push(buildGroupVideoOfferNode());
      }
      content.push({ tag: 'net', attrs: { medium: '3' } }, { tag: 'group_info', attrs: {}, content: buildGroupUserNodes(participants, creator, video) });
      const attrs = { 'call-id': callId, 'call-creator': creator };
      if (groupJid) {
          attrs['group-jid'] = groupJid;
      }
      return {
          tag: 'call',
          attrs: { to: callJidFor(callId) },
          content: [{ tag: 'offer', attrs, content }]
      };
  }
  function buildGroupInviteOfferStanza({ callId, to, creator, targetDevices, participants, video }) {
      if (!callId || !to || !creator || !targetDevices?.length || !participants?.length) {
          throw new Error('invite needs call identity, target devices and roster');
      }
      const content = [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }];
      if (video) {
          content.push(buildGroupVideoOfferNode());
      }
      content.push({ tag: 'net', attrs: { medium: '2' } }, {
          tag: 'destination',
          attrs: {},
          content: targetDevices.map((jid) => ({ tag: 'to', attrs: { jid } }))
      }, { tag: 'group_info', attrs: {}, content: buildGroupUserNodes(participants, undefined, false) });
      return {
          tag: 'call',
          attrs: { to },
          content: [{ tag: 'offer', attrs: { 'call-id': callId, 'call-creator': creator }, content }]
      };
  }
  function buildGroupPreacceptStanza(callId, creator, video) {
      const content = [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }];
      if (video) {
          content.push({
              tag: 'video',
              attrs: { dec: 'H264', device_orientation: '0', screen_width: '0', screen_height: '0' }
          });
      }
      content.push({ tag: 'encopt', attrs: { keygen: '2' } }, { tag: 'capability', attrs: { ver: '1' }, content: video ? groupCapabilityOffer : GroupCapability.preaccept });
      return {
          tag: 'call',
          attrs: { to: callJidFor(callId), id: generateCallStanzaId() },
          content: [{ tag: 'preaccept', attrs: { 'call-id': callId, 'call-creator': creator }, content }]
      };
  }
  function buildGroupAcceptStanza(callId, creator) {
      return {
          tag: 'call',
          attrs: { to: callJidFor(callId), id: generateCallStanzaId() },
          content: [
              {
                  tag: 'accept',
                  attrs: { 'call-id': callId, 'call-creator': creator },
                  content: [
                      { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
                      { tag: 'net', attrs: { medium: '2' } },
                      { tag: 'encopt', attrs: { keygen: '2' } }
                  ]
              }
          ]
      };
  }
  function buildGroupTerminateStanza(callId, creator) {
      return {
          tag: 'call',
          attrs: { to: callJidFor(callId), id: generateCallStanzaId() },
          content: [{ tag: 'terminate', attrs: { 'call-id': callId, 'call-creator': creator } }]
      };
  }
  function buildGroupEncRekeyStanza({ callId, to, creator, transactionId, encType, ciphertext }) {
      if (!callId || !to || !creator || !transactionId || !ciphertext?.length) {
          throw new Error('group rekey is incomplete');
      }
      if (encType !== 'msg' && encType !== 'pkmsg') {
          throw new Error(`unsupported group rekey encryption ${encType}`);
      }
      return {
          tag: 'call',
          attrs: { to, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'enc_rekey',
                  attrs: { 'call-id': callId, 'call-creator': creator, 'transaction-id': String(transactionId) },
                  content: [
                      { tag: 'encopt', attrs: { keygen: '2' } },
                      { tag: 'enc', attrs: { v: '2', type: encType, count: '0' }, content: ciphertext }
                  ]
              }
          ]
      };
  }
  function parseGroupDeviceNode(node) {
      const capabilityNode = findNodeChild(node, 'capability');
      return {
          jid: node.attrs?.jid,
          platform: node.attrs?.platform,
          pid: readOptionalUint(node, 'pid'),
          capabilityVersion: capabilityNode ? readOptionalUint(capabilityNode, 'ver') : undefined,
          capability: capabilityNode ? readNodeBytes(capabilityNode) : undefined
      };
  }
  function parseGroupInfoNode(groupInfo) {
      const participants = getNodeChildrenByTag(groupInfo, 'user').map((user) => ({
          jid: user.attrs?.jid,
          pn: user.attrs?.user_pn,
          state: user.attrs?.state || '',
          type: user.attrs?.type,
          rekey: user.attrs?.rekey === '1',
          devices: getNodeChildrenByTag(user, 'device').map(parseGroupDeviceNode)
      }));
      return {
          groupJid: groupInfo.attrs?.['group-jid'],
          media: groupInfo.attrs?.media,
          joinable: groupInfo.attrs?.joinable === '1',
          rekeyRequested: groupInfo.attrs?.rekey === '1' || participants.some((participant) => participant.rekey),
          transactionId: readRequiredUint(groupInfo, 'transaction-id'),
          connectedLimit: readRequiredUint(groupInfo, 'connected-limit'),
          participants
      };
  }
  function parseGroupRelayNode(relayNode) {
      const hbhKey = readNodeBytes(findNodeChild(relayNode, 'hbh_key'));
      return {
          node: relayNode,
          uuid: relayNode.attrs?.uuid,
          participantUuid: relayNode.attrs?.participant_uuid,
          transactionId: readOptionalUint(relayNode, 'transaction-id'),
          selfPid: readOptionalUint(relayNode, 'self_pid'),
          warpMiTagLength: readOptionalUint(relayNode, 'warp_mi_tag_len'),
          hbhKey: hbhKey && hbhKey.length === 30 ? hbhKey : undefined
      };
  }
  function parseGroupInviteSnapshot(offerNode) {
      const groupInfo = findNodeChild(offerNode, 'group_info');
      if (!groupInfo) {
          return null;
      }
      const update = {
          callId: offerNode.attrs?.['call-id'],
          callCreator: offerNode.attrs?.['call-creator'],
          ...parseGroupInfoNode(groupInfo)
      };
      update.joinable = offerNode.attrs?.joinable === '1';
      return update;
  }
  function parseInitialGroupAck(ackNode) {
      const groupInfo = findNodeChild(ackNode, 'group_info');
      if (!groupInfo) {
          return null;
      }
      const update = {
          callId: groupInfo.attrs?.['call-id'],
          callCreator: groupInfo.attrs?.['call-creator'],
          ...parseGroupInfoNode(groupInfo)
      };
      const relayNode = findNodeChild(ackNode, 'relay');
      if (relayNode) {
          update.relay = parseGroupRelayNode(relayNode);
      }
      return update;
  }
  function parseGroupUpdate(node) {
      const groupInfo = findNodeChild(node, 'group_info');
      if (!groupInfo) {
          throw new Error('group_update is missing group_info');
      }
      const update = {
          callId: node.attrs?.['call-id'],
          callCreator: node.attrs?.['call-creator'],
          ...parseGroupInfoNode(groupInfo)
      };
      update.avUpgradable = findNodeChild(node, 'av_upgrade')?.attrs?.['av-upgradable'] === '1';
      const relayNode = findNodeChild(node, 'relay');
      if (relayNode) {
          update.relay = parseGroupRelayNode(relayNode);
      }
      return update;
  }
  function parseGroupEncRekey(node) {
      const encopt = findNodeChild(node, 'encopt');
      const enc = findNodeChild(node, 'enc');
      if (!encopt || !enc) {
          throw new Error('enc_rekey is missing encopt or enc');
      }
      if (readRequiredUint(encopt, 'keygen') !== 2) {
          throw new Error('unsupported key generation');
      }
      const encType = enc.attrs?.type;
      if ((encType !== 'msg' && encType !== 'pkmsg') || readRequiredUint(enc, 'v') !== 2) {
          throw new Error('unsupported group rekey encryption');
      }
      if (!(enc.content instanceof Uint8Array)) {
          throw new Error('enc_rekey ciphertext is missing');
      }
      return {
          callId: node.attrs?.['call-id'],
          callCreator: node.attrs?.['call-creator'],
          transactionId: readRequiredUint(node, 'transaction-id'),
          encType,
          ciphertext: enc.content
      };
  }
  function buildCallControlAckNode(node, childTag) {
      const { id, from, participant, recipient } = node.attrs ?? {};
      if (!id || !from || !childTag) {
          return null;
      }
      return buildAckNode({
          kind: 'custom',
          ackClass: 'call',
          to: from,
          id,
          type: childTag,
          participant: participant && participant !== from ? participant : undefined,
          recipient: recipient || undefined
      });
  }
  function normalizeLinkMedia(media) {
      if (media !== 'audio' && media !== 'video') {
          throw new Error(`invalid call link media "${media}"`);
      }
      return media;
  }
  function buildCallLinkUrl(token, media) {
      return `https://call.whatsapp.com/${normalizeLinkMedia(media) === 'video' ? 'video' : 'voice'}/${token}`;
  }
  function parseCallLink(raw) {
      const text = String(raw ?? '').trim();
      if (!text) {
          throw new Error('call link token is required');
      }
      if (!text.includes('://')) {
          if (text.includes('/')) {
              throw new Error('invalid call link token');
          }
          return { token: text, media: undefined };
      }
      const url = new URL(text);
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.protocol !== 'https:' || url.hostname !== 'call.whatsapp.com' || parts.length !== 2 || !['audio', 'video', 'voice'].includes(parts[0])) {
          throw new Error('invalid WhatsApp call link');
      }
      return { token: parts[1], media: parts[0] === 'video' ? 'video' : 'audio' };
  }
  function parseCallLinkToken(raw) {
      return parseCallLink(raw).token;
  }
  function buildCallServiceRequest(requestId, action) {
      return { tag: 'call', attrs: { to: '@call', id: requestId }, content: [action] };
  }
  function buildCallLinkCreateStanza(media, requestId) {
      return buildCallServiceRequest(requestId, { tag: 'link_create', attrs: { media: normalizeLinkMedia(media) } });
  }
  function buildCallLinkQueryStanza(token, media, requestId) {
      return buildCallServiceRequest(requestId, { tag: 'link_query', attrs: { token, media: normalizeLinkMedia(media) } });
  }
  function buildCallLinkJoinStanza(token, media, requestId) {
      const content = [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }];
      if (normalizeLinkMedia(media) === 'video') {
          content.push({ tag: 'video', attrs: { dec: 'H264', device_orientation: '0' } });
      }
      content.push({ tag: 'net', attrs: { medium: '2' } }, { tag: 'capability', attrs: { ver: '1' }, content: groupCapabilityOffer });
      return buildCallServiceRequest(requestId, { tag: 'link_join', attrs: { token, media }, content });
  }
  function buildWaitingRoomRequestStanza(tag, callId, creator, requestId, extraAttrs = {}, children = undefined) {
      return {
          tag: 'call',
          attrs: { to: callJidFor(callId), id: requestId },
          content: [{ tag, attrs: { 'call-id': callId, 'call-creator': creator, ...extraAttrs }, content: children }]
      };
  }
  function validateCallLinkAck(node, expectedType) {
      if (!node || node.tag !== 'ack' || node.attrs?.class !== 'call' || node.attrs?.type !== expectedType) {
          const reason = node?.attrs?.error ? ` (error ${node.attrs.error})` : '';
          throw new Error(`unexpected ${expectedType} response${reason}`);
      }
      return findNodeChild(node, expectedType);
  }
  function parseCallLinkCreateAck(node) {
      const child = validateCallLinkAck(node, 'link_create');
      const token = child?.attrs?.token;
      if (!token) {
          throw new Error('link_create response has no token');
      }
      return { token, media: normalizeLinkMedia(child.attrs.media) };
  }
  function parseCallLinkQueryAck(node) {
      const child = validateCallLinkAck(node, 'link_query');
      if (!child) {
          throw new Error('link_query response has no payload');
      }
      const room = findNodeChild(child, 'waiting_room');
      if (!room) {
          throw new Error('link_query response has no waiting_room');
      }
      return {
          token: child.attrs?.token,
          media: normalizeLinkMedia(child.attrs?.media),
          creator: child.attrs?.link_creator,
          creatorPn: child.attrs?.link_creator_pn,
          waitingRoomEnabled: room.attrs?.enabled === '1',
          isAdmin: room.attrs?.is_admin === '1'
      };
  }
  function parseWaitingRoomNode(node) {
      const transactionId = node.attrs?.['transaction-id'];
      return {
          callId: node.attrs?.['call-id'],
          callCreator: node.attrs?.['call-creator'],
          linkToken: node.attrs?.['link-token'],
          media: normalizeLinkMedia(node.attrs?.media),
          enabled: node.attrs?.enabled === '1',
          isAdmin: node.attrs?.is_admin === '1',
          transactionId: transactionId ? Number(transactionId) : 0,
          users: getNodeChildrenByTag(node, 'user').map((user) => ({
              jid: user.attrs?.jid,
              pn: user.attrs?.user_pn,
              state: user.attrs?.state || ''
          }))
      };
  }
  function parseCallLinkJoinAck(node) {
      validateCallLinkAck(node, 'link_join');
      const waitingNode = findNodeChild(node, 'waiting_room');
      const result = { waitingRoom: waitingNode ? parseWaitingRoomNode(waitingNode) : null, group: parseInitialGroupAck(node) };
      if (!result.waitingRoom && !result.group) {
          throw new Error('link_join response has no group_info or waiting_room');
      }
      result.callId = result.waitingRoom?.callId || result.group.callId;
      result.callCreator = result.waitingRoom?.callCreator || result.group.callCreator;
      result.inWaitingRoom = !!result.waitingRoom && result.waitingRoom.enabled && !result.group;
      return result;
  }
  function parseWaitingRoomUpdate(node) {
      const child = findNodeChild(node, 'waiting_room');
      if (!child) {
          throw new Error('waiting_room_update has no waiting_room');
      }
      return parseWaitingRoomNode(child);
  }
  return { encodeWAMessage, generateCallId, generateCallStanzaId, extractNodeInfo, extractRelayEndpoints, decryptCallKey, buildCallParticipantNodes, buildOfferStanza, buildAcceptStanza, buildTerminateStanza, buildRelaylatencyForwardStanza, buildRejectStanza, buildPreacceptStanza, buildRelayLatencyStanza, buildTransportStanza, buildMuteV2Stanza, parseMuteV2, buildRaiseHandStanza, parseRaiseHandState, buildAcceptReceiptStanza, VideoState, VideoDecRequest, VideoDecAccept, buildVideoStateStanza, ENCRYPTED_TAGS, needsDecryption, GroupCapability, callJidFor, buildInitialGroupOfferStanza, buildGroupInviteOfferStanza, buildGroupPreacceptStanza, buildGroupAcceptStanza, buildGroupTerminateStanza, buildGroupEncRekeyStanza, parseGroupInviteSnapshot, parseInitialGroupAck, parseGroupUpdate, parseGroupEncRekey, buildCallControlAckNode, buildCallLinkUrl, parseCallLink, parseCallLinkToken, buildCallLinkCreateStanza, buildCallLinkQueryStanza, buildCallLinkJoinStanza, buildWaitingRoomRequestStanza, parseCallLinkCreateAck, parseCallLinkQueryAck, parseCallLinkJoinAck, parseWaitingRoomUpdate };
})();

/* ═══ screen-share.js ═══════════════════════════════════════════════ */
const __screen_share = (() => {
  const { generateCallStanzaId } = __signaling;
  function tryAsNumber(value) {
      if (value === undefined || value === null || value === '')
          return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
  }

  const WA_SCREEN_SHARE_STATE = Object.freeze({
      NotSupported: 0,
      Started: 1,
      Stopped: 2,
      Failed: 3
  });

  const WA_SCREEN_SHARE_VERSION = Object.freeze({
      Invalid: -1,
      Legacy: 0,
      V1: 1,
      V2: 2,
      V3: 3,
      V4: 4
  });

  const WA_SCREEN_SHARE_SEND_VERSION = WA_SCREEN_SHARE_VERSION.V2;

  function parseScreenShareNode(node) {
      const attrs = node.attrs ?? {};
      const state = tryAsNumber(attrs.screenshare_state);
      const requestState = tryAsNumber(attrs['request-state'] ?? attrs.request_state);
      if (state === null && requestState === null)
          return null;
      return {
          state,
          requestState,
          version: tryAsNumber(attrs.version),
          screenWidth: tryAsNumber(attrs.screen_width),
          screenHeight: tryAsNumber(attrs.screen_height),
          deviceOrientation: tryAsNumber(attrs.device_orientation)
      };
  }

  function buildScreenShareStanza(peerDeviceJid, callId, callCreator, screenShareState) {
      return {
          tag: 'call',
          attrs: { to: peerDeviceJid, id: generateCallStanzaId() },
          content: [
              {
                  tag: 'screen_share',
                  attrs: {
                      'call-id': callId,
                      'call-creator': callCreator,
                      screenshare_state: String(screenShareState),
                      version: String(WA_SCREEN_SHARE_SEND_VERSION)
                  }
              }
          ]
      };
  }
  return { WA_SCREEN_SHARE_STATE, WA_SCREEN_SHARE_VERSION, WA_SCREEN_SHARE_SEND_VERSION, parseScreenShareNode, buildScreenShareStanza };
})();

/* ═══ srtp.js ═══════════════════════════════════════════════════════ */
const __srtp = (() => {
  const { writeBigUInt64BE, writeUInt32BE } = __bytes;
  const { aesCtr128, hmacSha1 } = __primitives;
  const { RtpHeader, RtpPacket } = __rtp;
  const { SRTP_AUTH_TAG_LEN, SRTP_LABEL } = __types;
  const { uint8TimingSafeEqual } = __util;
  const SRTP_REPLAY_WINDOW = 64n;
  const SRTP_INDEX_MASK = (1n << 64n) - 1n;
  class SrtpContext {
      sessionKey;
      sessionSalt;
      authKey;
      roc = 0;
      lastSeq = 0;
      initialized = false;
      highestIndex = 0n;
      replayMask = 0n;
      authTagLen;
      ivBuffer = new Uint8Array(16);
      ssrcBuffer = new Uint8Array(4);
      indexBuffer = new Uint8Array(8);
      rocBuffer = new Uint8Array(4);
      constructor(keying, authTagLen) {
          this.authTagLen = authTagLen ?? SRTP_AUTH_TAG_LEN;
          this.sessionKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.ENCRYPTION, 16);
          this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.AUTH, 20);
          this.sessionSalt = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.SALT, 14);
      }
      setAuthKeying(keying) {
          this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.AUTH, 20);
      }
      rekey(keying) {
          this.sessionKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.ENCRYPTION, 16);
          this.authKey = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.AUTH, 20);
          this.sessionSalt = deriveKey(keying.masterKey, keying.masterSalt, SRTP_LABEL.SALT, 14);
      }
      protect(packet) {
          this.updateRoc(packet.header.sequenceNumber);
          const index = this.packetIndex(packet.header.sequenceNumber);
          const headerSize = packet.header.size();
          const output = new Uint8Array(headerSize + packet.payload.length + this.authTagLen);
          packet.header.encode(output);
          const iv = this.generateIv(packet.header.ssrc, index);
          const encrypted = aesCtr128(this.sessionKey, iv, packet.payload);
          output.set(encrypted, headerSize);
          if (this.authTagLen > 0) {
              const authData = output.subarray(0, headerSize + packet.payload.length);
              const tag = this.computeAuthTag(authData, this.roc, this.authTagLen);
              output.set(tag, headerSize + packet.payload.length);
          }
          return output;
      }
      unprotect(data) {
          if (data.length < 12) {
              throw new SrtpError('packet_too_short', `Packet too short: ${data.length} bytes`);
          }
          const header = RtpHeader.decode(data);
          const headerSize = header.size();
          const payloadLen = data.length - headerSize - this.authTagLen;
          if (payloadLen <= 0) {
              throw new SrtpError('packet_too_short', `No payload: ${data.length}B total, ${headerSize}B header, auth=${this.authTagLen}`);
          }
          const seq = header.sequenceNumber;
          const estimatedRoc = this.estimateRoc(seq);
          const index = (BigInt(estimatedRoc) << 16n) | BigInt(seq);
          if (this.isReplayed(index)) {
              throw new SrtpError('replay', `SRTP replay detected: index ${index}`);
          }
          if (this.authTagLen > 0) {
              const authStart = headerSize + payloadLen;
              const authData = data.subarray(0, authStart);
              const expected = this.computeAuthTag(authData, estimatedRoc, this.authTagLen);
              const received = data.subarray(authStart, authStart + this.authTagLen);
              if (!uint8TimingSafeEqual(expected, received)) {
                  throw new SrtpError('auth_failed', 'SRTP auth tag verification failed');
              }
          }
          const iv = this.generateIv(header.ssrc, index);
          const decrypted = aesCtr128(this.sessionKey, iv, data.subarray(headerSize, headerSize + payloadLen));
          this.advanceReplay(index, estimatedRoc, seq);
          return new RtpPacket(header, decrypted);
      }
      updateRoc(seq) {
          if (!this.initialized) {
              this.lastSeq = seq;
              this.initialized = true;
              return;
          }
          const diff = seq - this.lastSeq;
          if (diff < -32768) {
              this.roc = (this.roc + 1) >>> 0;
          }
          this.lastSeq = seq;
      }
      estimateRoc(seq) {
          if (!this.initialized) {
              return this.roc;
          }
          if (this.lastSeq < 32768) {
              return seq - this.lastSeq > 32768 ? (this.roc - 1) >>> 0 : this.roc;
          }
          return this.lastSeq - seq > 32768 ? (this.roc + 1) >>> 0 : this.roc;
      }
      isReplayed(index) {
          if (!this.initialized) {
              return false;
          }
          if (index > this.highestIndex) {
              return false;
          }
          const offset = this.highestIndex - index;
          if (offset >= SRTP_REPLAY_WINDOW) {
              return true;
          }
          return (this.replayMask & (1n << offset)) !== 0n;
      }
      advanceReplay(index, estimatedRoc, seq) {
          if (this.initialized && index <= this.highestIndex) {
              const offset = this.highestIndex - index;
              if (offset < SRTP_REPLAY_WINDOW) {
                  this.replayMask |= 1n << offset;
              }
              return;
          }
          const shift = this.initialized ? index - this.highestIndex : SRTP_REPLAY_WINDOW;
          this.replayMask =
              shift >= SRTP_REPLAY_WINDOW ? 1n : ((this.replayMask << shift) | 1n) & SRTP_INDEX_MASK;
          this.highestIndex = index;
          this.roc = estimatedRoc;
          this.lastSeq = seq;
          this.initialized = true;
      }
      packetIndex(seq) {
          return (BigInt(this.roc) << 16n) | BigInt(seq);
      }
      generateIv(ssrc, index) {
          this.ivBuffer.fill(0);
          this.ivBuffer.set(this.sessionSalt.subarray(0, 14), 0);
          writeUInt32BE(this.ssrcBuffer, ssrc, 0);
          for (let i = 0; i < 4; i++) {
              this.ivBuffer[4 + i] ^= this.ssrcBuffer[i];
          }
          writeBigUInt64BE(this.indexBuffer, index, 0);
          for (let i = 0; i < 6; i++) {
              this.ivBuffer[8 + i] ^= this.indexBuffer[2 + i];
          }
          return this.ivBuffer;
      }
      computeAuthTag(data, roc, tagLen = SRTP_AUTH_TAG_LEN) {
          writeUInt32BE(this.rocBuffer, roc, 0);
          const result = hmacSha1(this.authKey, data, this.rocBuffer);
          return result.subarray(0, tagLen);
      }
  }
  class SrtpSession {
      sendCtx;
      recvCtx;
      constructor(sendKey, recvKey, sendAuthLen, recvAuthLen) {
          this.sendCtx = new SrtpContext(sendKey, sendAuthLen);
          this.recvCtx = new SrtpContext(recvKey, recvAuthLen);
      }
      protect(packet) {
          return this.sendCtx.protect(packet);
      }
      unprotect(data) {
          return this.recvCtx.unprotect(data);
      }
      setSendAuthKeying(keying) {
          this.sendCtx.setAuthKeying(keying);
      }
  }
  function deriveKey(masterKey, masterSalt, label, length) {
      const iv = new Uint8Array(16);
      iv.set(masterSalt.subarray(0, 14), 0);
      iv[7] ^= label;
      const zeros = new Uint8Array(length);
      return aesCtr128(masterKey, iv, zeros);
  }
  class SrtpError extends Error {
      type;
      constructor(type, message) {
          super(message);
          this.type = type;
          this.name = 'SrtpError';
      }
  }
  return { SrtpContext, SrtpSession, SrtpError };
})();

/* ═══ ssrc.js ═══════════════════════════════════════════════════════ */
const __ssrc = (() => {
  const { readUInt32LE, TEXT_ENCODER, writeUInt32LE } = __bytes;
  const { hkdf } = __crypto;
  function generateSecureSsrc(callId, selfJid, counter = 0) {
      const key = TEXT_ENCODER.encode(callId);
      const salt = new Uint8Array(4);
      writeUInt32LE(salt, counter, 0);
      const info = TEXT_ENCODER.encode(selfJid);
      const result = hkdf(key, salt, info, 4);
      return readUInt32LE(result, 0);
  }

  const WASM_RELAY_STREAM_SLOT_WORDS = [0, 1, 4, 2, 3, 5, 7, 8, 6];
  function deriveWasmRelayStreamSsrcs(callId, participantId) {
      return WASM_RELAY_STREAM_SLOT_WORDS.map((slotWord) => generateSecureSsrc(callId, participantId, slotWord));
  }
  function formatParticipantId(jid) {
      const bare = String(jid ?? '').split('/')[0].trim();
      const at = bare.lastIndexOf('@');
      if (at <= 0) {
          return bare;
      }
      const user = bare.slice(0, at);
      const domain = bare.slice(at + 1);
      return domain === 'lid' && !user.includes(':') ? `${user}:0@${domain}` : bare;
  }
  return { generateSecureSsrc, WASM_RELAY_STREAM_SLOT_WORDS, deriveWasmRelayStreamSsrcs, formatParticipantId };
})();

/* ═══ WaCallMediaSession.js ═════════════════════════════════════════ */
const __WaCallMediaSession = (() => {
  const { WaAppDataStream } = __WaAppDataStream;
  const { WaAudioEngine } = __WaAudioEngine;
  const { WaManualRelay } = __WaManualRelay;
  const { WaVideoEngine } = __WaVideoEngine;
  const { concatBytes, EMPTY_BYTES, readUInt32BE, TEXT_ENCODER, toArrayBuffer } = __bytes;
  const { SrtcpSendContext } = __crypto_rtcp;
  const { derivePerJidSrtpKey, generateCallKey } = __encryption;
  const { auHasIDR, buildAccessUnitPayload, packageH264NALU, H264AccessUnitAssembler } = __h264;
  const { buildSenderReportWithSdes, generateWhatsappRtcpCname } = __media_rtcp;
  const { MLowCodec } = __mlow_codec;
  const { parseRelayFromAck } = __relay_ack;
  const { RtpSession, RtpPacket, VideoRtpStream, VideoMediaFrameInfo, videoRtpDurationSamples } = __rtp;
  const { buildScreenShareStanza, parseScreenShareNode, WA_SCREEN_SHARE_STATE } = __screen_share;
  const { parseSignalAddressFromJid, toUserJid } = __shim_protocol;
  const { buildAcceptReceiptStanza, buildAcceptStanza, buildGroupAcceptStanza, buildGroupEncRekeyStanza, buildGroupInviteOfferStanza, buildGroupPreacceptStanza, buildGroupTerminateStanza, buildWaitingRoomRequestStanza, callJidFor, encodeWAMessage, generateCallStanzaId, parseGroupEncRekey, parseGroupUpdate, parseInitialGroupAck, parseWaitingRoomUpdate, buildMuteV2Stanza, buildPreacceptStanza, buildRaiseHandStanza, buildRejectStanza, buildRelaylatencyForwardStanza, buildRelayLatencyStanza, buildTerminateStanza, buildTransportStanza, buildVideoStateStanza, decryptCallKey, extractNodeInfo, extractRelayEndpoints, needsDecryption, parseMuteV2, parseRaiseHandState, VideoDecAccept, VideoDecRequest, VideoState } = __signaling;
  const { SrtpContext, SrtpSession } = __srtp;
  const { deriveWasmRelayStreamSsrcs, formatParticipantId, generateSecureSsrc } = __ssrc;
  const { buildGroupAllocateForRelay, isRtpPacket, isStunPacket } = __stun;
  const { getFirstNodeChild, getNodeChildrenByTag } = __transport;
  const { CallDirection, CallMediaType, CallState, EndCallReason, PayloadType, SRTP_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN, SRTP_SEND_AUTH_TAG_LEN } = __types;
  const { toError, uint8TimingSafeEqual } = __util;
  class WaCallMediaSession {
      info;
      deps;
      logger;
      delegate;
      rtpSession = null;
      srtpSession = null;
      opusCodec = null;
      sctpRelay;
      audioEngine;
      initialTransportSent = false;
      outgoingPreacceptSent = false;
      answeredRelays = new Map();
      announcedRelayNames = new Set();
      relayLatencyOpened = false;
      selfSsrc = 0;
      selfSsrcJid = '';
      peerSsrcs = [];
      firstPacketSent = false;
      acceptedByJid = null;
      debeEnabled = true;
      audioSendCount = 0;
      audioDropCount = 0;
      realAudioSendCount = 0;
      static EMPTY_BYTES = EMPTY_BYTES;
      encodeBufferA = null;
      encodeBufferB = null;
      encodeBuffer = null;
      encodeBufferPos = 0;
      authPaddingBuffer = null;
      audioRecvCount = 0;
      recvRealCount = 0;
      recvDtxCount = 0;
      srtpErrorCount = 0;
      relayPacketCount = 0;
      stunResponseCount = 0;
      selfEchoCount = 0;
      lastRecvSeq = -1;
      recvSeqGaps = 0;
      actualPeerSsrc = null;
      ssrcResubscribed = false;
      reconnecting = false;

      videoSsrc = 0;
      videoRtpStream = null;
      videoSrtpSession = null;
      videoEngine;
      videoSendCount = 0;
      videoKeyframeRequired = false;
      videoFlushSeen = 0;
      videoIdrSendCount = 0;
      videoDropCount = 0;

      audioRtcpSession = null;
      videoRtcpSession = null;
      audioRtcpCname = null;
      videoRtcpCname = null;
      audioOctetsSent = 0;
      videoOctetsSent = 0;
      rtcpTimer = null;
      mediaStartedAtMs = null;
      mediaFlowStarted = false;

      peerVideoUpgradePending = false;
      peerVideoActive = false;
      peerVideoJids = new Set();
      videoAssembler = null;
      appDataStream = null;
      appDataSrtpSession = null;
      peerAppDataSsrcs = new Set();
      constructor(options) {
          this.deps = options.deps;
          this.logger = options.logger;
          this.info = options.info;
          this.delegate = options.delegate;
          this.sctpRelay = new WaManualRelay({
              logger: this.logger.child({ component: 'sctp' }),
              maxActiveRelays: options.maxActiveRelays
          });
          this.audioEngine = new WaAudioEngine({
              logger: this.logger.child({ component: 'audio-engine' })
          });
          this.audioEngine.setAudioSender(this);
          this.audioEngine.setOnAudioFinished(() => {
              this.delegate.emitOutboundAudioFinished(this.info);
          });
          this.videoEngine = new WaVideoEngine({
              logger: this.logger.child({ component: 'video-engine' }),
              ...(options.videoConfig || {})
          });
          this.videoEngine.setVideoSender(this);
          this.sctpRelay.on('relay_connected', () => {
              this.onRelayConnected();
          });
          this.sctpRelay.on('relay_answered', (detail) => {
              this.onRelayAnswered(detail);
          });
          this.sctpRelay.on('relay_receive', (relayInfo) => {
              this.onRelayData(relayInfo.data);
          });
          this.sctpRelay.on('relay_lost', (detail) => {
              if (!detail.anyOpen)
                  this.markReconnecting({ attempt: 0, max: detail.max });
          });
          this.sctpRelay.on('relay_retrying', (detail) => {
              if (!detail.anyOpen)
                  this.markReconnecting({ attempt: detail.attempt, max: detail.max });
          });
          this.sctpRelay.on('relay_recovered', () => {
              if (!this.reconnecting || !this.sctpRelay.hasConnection())
                  return;
              this.reconnecting = false;
              this.delegate.emitReconnected(this.info);
          });
          this.sctpRelay.on('relay_failed', (detail) => {
              if (!detail.anyOpen)
                  this.endCall(EndCallReason.Failed).catch(() => { });
          });
      }
      get callId() {
          return this.info.callId;
      }
      markReconnecting(detail) {
          this.reconnecting = true;
          this.delegate.emitReconnecting(this.info, detail);
      }
      onDecodedAudio = (pcm) => {
          this.audioEngine.onPlaybackData(pcm);
          this.delegate.emitInboundAudio?.(this.info, pcm);
      };
      async initMedia(selfLid, peerJid) {
          const ssrc = generateSecureSsrc(this.info.callId, this.ensureDeviceJid(selfLid));
          this.rtpSession = RtpSession.whatsappOpus(ssrc);
          this.selfSsrc = ssrc;
          this.selfSsrcJid = this.ensureDeviceJid(selfLid);
          const peerSsrc = generateSecureSsrc(this.info.callId, this.ensureDeviceJid(peerJid));
          this.peerSsrcs = [peerSsrc];
          this.opusCodec = await MLowCodec.create({ logger: this.logger.child({ component: 'mlow' }), fec: true });
          if (this.info.mediaType === CallMediaType.Video) {
              this.videoSsrc = generateSecureSsrc(this.info.callId, this.ensureDeviceJid(selfLid), 2);
              this.videoRtpStream = new VideoRtpStream(this.videoSsrc, videoRtpDurationSamples(this.videoEngine.frameDurationMs));
              this.videoAssembler = new H264AccessUnitAssembler();
          }
      }
      resetOutgoingFlags() {
          this.initialTransportSent = false;
          this.outgoingPreacceptSent = false;
      }
      async acceptCall() {
          if (!this.info.canAccept) {
              throw new Error(`Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`);
          }
          this.info.applyTransition({ type: 'local_accepted' });
          this.delegate.emitState(this.info);
          const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
          const callId = this.info.callId;
          const callCreator = this.info.callCreator;
          const peerJid = this.info.peerJid;
          const isVideo = this.info.mediaType === CallMediaType.Video;
          this.acceptedByJid = peerJid;
          this.initSrtpKeys();
          try {
              const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId);
              await this.deps.lowLevelCoordinator.sendNode(muteNode);
          }
          catch (err) {
              this.logger.error('error sending mute_v2', {
                  message: toError(err).message
              });
          }
          try {
              const transportNode = buildTransportStanza(peerJid, callId, callCreator, meId, '1', '1');
              await this.deps.lowLevelCoordinator.sendNode(transportNode);
          }
          catch (err) {
              this.logger.error('error sending transport', {
                  message: toError(err).message
              });
          }
          if (this.info.encryptionKey) {
              const acceptStanza = await buildAcceptStanza(this.deps, this.info.callId, this.info.encryptionKey, this.info.peerJid, this.info.callCreator, isVideo);
              try {
                  await this.deps.lowLevelCoordinator.sendNode(acceptStanza);
              }
              catch (err) {
                  this.logger.error('accept send error', {
                      message: toError(err).message
                  });
              }
          }
          if (this.info.relayData) {
              await this.connectRelays(this.info.relayData.endpoints);
          }
      }
      async rejectCall(reason = EndCallReason.Declined) {
          this.info.applyTransition({ type: 'local_rejected', reason });
          this.delegate.emitState(this.info);
          const node = buildRejectStanza(this.info.peerJid, this.info.callId, this.info.callCreator);
          try {
              await this.deps.lowLevelCoordinator.sendNode(node);
          }
          catch (err) {
              this.logger.warn('reject send failed', { message: toError(err).message });
          }
          this.cleanup();
      }
      async endCall(reason = EndCallReason.UserEnded) {
          if (this.info.isEnded)
              return;
          const connectedAt = this.info.stateData.connectedAt;
          const audioDurationMs = connectedAt ? Date.now() - connectedAt.getTime() : undefined;
          this.info.applyTransition({ type: 'terminated', reason });
          const terminateTarget = this.acceptedByJid ?? this.info.peerJid;
          const node = buildTerminateStanza(terminateTarget, this.info.callId, this.info.callCreator, audioDurationMs);
          this.delegate.emitEnded(this.info);
          this.delegate.emitState(this.info);
          try {
              await this.deps.lowLevelCoordinator.sendNode(node);
          }
          catch (err) {
              this.logger.warn('terminate send failed', { message: toError(err).message });
          }

          await new Promise((resolve) => setTimeout(resolve, 400));
          this.cleanup();
      }
      setMute(muted) {
          if (!this.info.isActive)
              return;
          this.info.applyTransition({ type: 'audio_mute_changed', muted });
          this.delegate.emitState(this.info);
          if (muted) {
              this.audioEngine.stopCapture();
          }
          else {
              this.audioEngine.startCapture();
          }
      }
      async loadAudio(audioPath) {
          this.audioEngine.setLoopMode(false);
          await this.audioEngine.loadSource(audioPath);
          this.resetEncodeState();
      }
      setExternalAudioMode(enabled) {
          this.audioEngine.setExternalMode(enabled);
          if (enabled) {
              this.resetEncodeState();
          }
      }
      feedLiveAudio(data) {
          return this.audioEngine.feedExternalAudio(data);
      }
      getLiveBufferMs() {
          return this.audioEngine.getLiveBufferMs();
      }
      async sendIncomingPreaccept(peerJid) {
          try {
              const preacceptNode = buildPreacceptStanza(peerJid, this.info.callId, this.info.callCreator);
              await this.deps.lowLevelCoordinator.sendNode(preacceptNode);
          }
          catch (err) {
              this.logger.error('error sending preaccept', {
                  message: toError(err).message
              });
          }
      }
      onRelayAnswered(detail) {
          if (!detail?.name || this.answeredRelays.has(detail.name))
              return;
          this.answeredRelays.set(detail.name, detail.rttMs);
          if (this.relayLatencyOpened) {
              void this.announceRelayLatency();
          }
      }
      async announceRelayLatency(isEligible = (ep) => this.answeredRelays.has(ep.relayName)) {
          if (!this.info.relayData)
              return;
          const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
          const callId = this.info.callId;
          const callCreator = this.info.callCreator;
          const destinationJids = this.info.relayData.participantJids || [];
          for (const ep of this.info.relayData.endpoints) {
              const name = ep.relayName || '';
              if (!name || ep.ip.includes(':') || this.announcedRelayNames.has(name) || !isEligible(ep))
                  continue;
              this.announcedRelayNames.add(name);
              try {
                  const relayData = [
                      {
                          relayName: name,
                          latency: ep.c2rRtt ?? this.answeredRelays.get(name) ?? 0,
                          addressBytes: ep.addressBytes
                      }
                  ];
                  const relayLatencyNode = buildRelayLatencyStanza(this.info.peerJid, callId, callCreator, relayData, destinationJids, meId);
                  await this.deps.lowLevelCoordinator.sendNode(relayLatencyNode);
              }
              catch (err) {
                  this.announcedRelayNames.delete(name);
                  this.logger.error('error sending relaylatency', {
                      relayName: name,
                      message: toError(err).message
                  });
              }
          }
      }
      async sendIncomingRelayLatency() {
          if (!this.info.relayData)
              return;
          this.relayLatencyOpened = true;
          const dialed = new Set(this.selectRelayEndpoints(this.info.relayData.endpoints)
              .slice(0, this.sctpRelay.maxActiveRelays)
              .map((ep) => ep.relayName));
          await this.announceRelayLatency((ep) => dialed.size === 0 || dialed.has(ep.relayName) || this.answeredRelays.has(ep.relayName));
      }
      async handleCallAccept(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          let srtpFromPeerKey = false;
          if (needsDecryption(nodeInfo.tag)) {
              try {
                  const peerCallKey = await decryptCallKey(this.deps, nodeInfo.innerNode, peerJid, this.logger.child({ component: 'signaling' }));
                  if (peerCallKey) {
                      const ourCallKey = this.info.encryptionKey;
                      const keysMatch = ourCallKey
                          ? uint8TimingSafeEqual(ourCallKey, peerCallKey)
                          : false;
                      if (!keysMatch && ourCallKey) {
                          const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
                          const meJid = this.deps.authClient.getCurrentCredentials()?.meJid;
                          const ourCredJid = meLid || meJid || '';
                          const ourBase = ourCredJid ? toUserJid(ourCredJid) : '';
                          const participants = this.info.relayData?.participantJids || [];
                          const ourDeviceJid = participants.find((jid) => {
                              const jBase = toUserJid(jid);
                              return jBase === ourBase && /:\d+@/.test(jid);
                          }) || ourCredJid;
                          if (ourDeviceJid && peerJid) {
                              try {
                                  const sendKeying = derivePerJidSrtpKey(ourCallKey, this.ensureDeviceJid(ourDeviceJid));
                                  const recvKeying = derivePerJidSrtpKey(peerCallKey, this.ensureDeviceJid(peerJid));
                                  this.srtpSession = new SrtpSession(sendKeying, recvKeying, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN);
                                  srtpFromPeerKey = true;
                              }
                              catch (err) {
                                  this.logger.error('per-jid srtp re-derivation failed', {
                                      message: toError(err).message
                                  });
                              }
                          }
                      }
                  }
              }
              catch (err) {
                  this.logger.error('accept decrypt error', {
                      message: toError(err).message
                  });
              }
          }
          try {
              this.info.applyTransition({ type: 'remote_accepted' });
              this.delegate.emitState(this.info);
          }
          catch { }
          const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
          const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
          const ourJid = meLid || meId;
          const ourBase = ourJid ? toUserJid(ourJid) : '';
          const callId = this.info.callId;
          const callCreator = this.info.callCreator;
          const acceptingDeviceJid = peerJid;
          this.acceptedByJid = acceptingDeviceJid;
          if (this.actualPeerSsrc !== null) {
              this.ensureDeviceJid(acceptingDeviceJid);
          }
          else {
              const peerDeviceJidForSsrc = this.ensureDeviceJid(acceptingDeviceJid);
              const acceptSsrc = generateSecureSsrc(callId, peerDeviceJidForSsrc);
              this.peerSsrcs = [acceptSsrc];
          }
          this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);
          this.sctpRelay.resendSubscriptions();
          if (!srtpFromPeerKey) {
              this.initSrtpKeys();
          }
          if (this.info.relayData?.participantJids) {
              const otherDevices = this.info.relayData.participantJids.filter((jid) => {
                  if (jid === acceptingDeviceJid)
                      return false;
                  const jidBase = toUserJid(jid);
                  if (jidBase === ourBase)
                      return false;
                  return true;
              });
              for (const deviceJid of otherDevices) {
                  try {
                      const terminateNode = buildTerminateStanza(deviceJid, callId, callCreator, undefined, 'accepted_elsewhere');
                      await this.deps.lowLevelCoordinator.sendNode(terminateNode);
                  }
                  catch (err) {
                      this.logger.error('error sending terminate_elsewhere', {
                          deviceJid,
                          message: toError(err).message
                      });
                  }
              }
          }
          try {
              const transportNode = buildTransportStanza(acceptingDeviceJid, callId, callCreator, meId, '1', '1');
              await this.deps.lowLevelCoordinator.sendNode(transportNode);
          }
          catch (err) {
              this.logger.error('error sending transport', {
                  message: toError(err).message
              });
          }
          try {
              const muteNode = buildMuteV2Stanza(acceptingDeviceJid, callId, callCreator, 0, meId);
              await this.deps.lowLevelCoordinator.sendNode(muteNode);
          }
          catch (err) {
              this.logger.error('error sending mute_v2', {
                  message: toError(err).message
              });
          }
          const acceptMsgId = node.attrs?.id;
          if (acceptMsgId) {
              try {
                  const receiptNode = buildAcceptReceiptStanza(acceptingDeviceJid, acceptMsgId, callId, callCreator, ourJid);
                  await this.deps.lowLevelCoordinator.sendNode(receiptNode);
              }
              catch (err) {
                  this.logger.error('error sending accept receipt', {
                      message: toError(err).message
                  });
              }
          }
          if (this.sctpRelay.hasConnection()) {
              try {
                  this.info.applyTransition({ type: 'media_connected' });
                  this.delegate.emitState(this.info);
                  setTimeout(() => {
                      if (this.info.stateData.state === CallState.Ended) {
                          return;
                      }
                      this.startMediaFlow();
                  }, 3000);
              }
              catch { }
          }
          else if (this.info.relayData) {
              await this.connectRelays(this.info.relayData.endpoints);
          }
      }
      async handleCallPreaccept(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          if (this.info.direction === CallDirection.Outgoing && this.info.relayData) {
              const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
              const callId = this.info.callId;
              const callCreator = this.info.callCreator;
              this.relayLatencyOpened = true;
              await this.announceRelayLatency();
              if (!this.initialTransportSent) {
                  try {
                      const basePeerJid = toUserJid(peerJid);
                      const transportNode = buildTransportStanza(basePeerJid, callId, callCreator, meId);
                      await this.deps.lowLevelCoordinator.sendNode(transportNode);
                      this.initialTransportSent = true;
                  }
                  catch (err) {
                      this.logger.error('error sending initial transport', {
                          message: toError(err).message
                      });
                  }
              }
          }
      }
      async handleCallTransport(_node) {
          const nodeInfo = extractNodeInfo(_node);
          if (!nodeInfo)
              return;
          const relays = extractRelayEndpoints(nodeInfo.innerNode);
          if (relays.length > 0 && !this.sctpRelay.hasConnection()) {
              this.info.relayData = {
                  ...this.info.relayData,
                  endpoints: relays
              };
              await this.connectRelays(relays);
          }
      }
      async handleCallAck(node) {
          const ackType = node.attrs?.type;
          if (ackType !== 'offer')
              return;
          const error = node.attrs?.error;
          if (error) {
              this.logger.error('ack error', { callId: this.info.callId, error });
              return;
          }
          const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(node);
          if (relays.length > 0) {
              this.info.relayData = {
                  endpoints: relays,
                  participantJids,
                  uuid,
                  selfPid,
                  peerPid,
                  hbhKey
              };
              const callKey = this.info.encryptionKey;
              if (participantJids.length > 0) {
                  const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
                  const meId = this.deps.authClient.getCurrentCredentials()?.meJid;
                  const ourCredJid = meLid || meId || '';
                  const ourBase = ourCredJid ? toUserJid(ourCredJid) : '';
                  const ourDeviceJid = this.ensureDeviceJid(participantJids.find((jid) => {
                      const jidBase = toUserJid(jid);
                      return jidBase === ourBase && /:\d+@/.test(jid);
                  }) || ourCredJid);
                  const peerJids = participantJids.filter((jid) => {
                      const jidBase = toUserJid(jid);
                      return jidBase !== ourBase;
                  });
                  const peerCandidate = peerJids.find((jid) => /:\d+@/.test(jid) && !/:0@/.test(jid)) || peerJids[0];
                  const peerDeviceJid = peerCandidate ? this.ensureDeviceJid(peerCandidate) : undefined;
                  const newSelfSsrc = generateSecureSsrc(this.info.callId, ourDeviceJid);
                  if (newSelfSsrc !== this.selfSsrc) {
                      this.selfSsrc = newSelfSsrc;
                      this.selfSsrcJid = ourDeviceJid;
                      this.rtpSession = RtpSession.whatsappOpus(newSelfSsrc);
                  }
                  if (peerDeviceJid) {
                      const peerDeviceSsrc = generateSecureSsrc(this.info.callId, peerDeviceJid);
                      this.peerSsrcs = [peerDeviceSsrc];
                  }
                  if (callKey) {
                      this.initSrtpKeys();
                  }
              }
              if (this.info.isInitiator && !this.outgoingPreacceptSent) {
                  try {
                      const preacceptNode = buildPreacceptStanza(this.info.peerJid, this.info.callId, this.info.callCreator);
                      await this.deps.lowLevelCoordinator.sendNode(preacceptNode);
                      this.outgoingPreacceptSent = true;
                  }
                  catch (err) {
                      this.logger.error('error sending preaccept (caller)', {
                          message: toError(err).message
                      });
                  }
              }
              await this.connectRelays(relays);
              if (this.srtpSession &&
                  this.rtpSession &&
                  this.opusCodec &&
                  this.sctpRelay.hasConnection()) {
                  this.audioEngine.startSilenceCapture();
              }
          }
      }
      async handleCallRelaylatency(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          const inner = nodeInfo.innerNode;
          const callId = inner.attrs?.['call-id'] || this.info.callId;
          const callCreator = inner.attrs?.['call-creator'] || this.info.callCreator;
          const teNodes = getNodeChildrenByTag(inner, 'te');
          if (teNodes.length === 0)
              return;
          const destinationJids = this.info.relayData?.participantJids || [];
          if (destinationJids.length > 0) {
              const forwardNode = buildRelaylatencyForwardStanza(peerJid, callId, callCreator, teNodes, destinationJids);
              try {
                  await this.deps.lowLevelCoordinator.sendNode(forwardNode);
              }
              catch (err) {
                  this.logger.error('error forwarding relaylatency', {
                      message: toError(err).message
                  });
              }
          }
      }
      handleRelayElection(node) {
          const inner = getFirstNodeChild(node);
          if (!inner)
              return;
          let electedRelayIdx;
          if (inner.attrs?.['elected_relay_idx'] !== undefined) {
              const parsed = Number(inner.attrs['elected_relay_idx']);
              if (Number.isSafeInteger(parsed) && parsed >= 0)
                  electedRelayIdx = parsed;
          }
          else if (inner.attrs?.['relay_id'] !== undefined) {
              const parsed = Number(inner.attrs['relay_id']);
              if (Number.isSafeInteger(parsed) && parsed >= 0)
                  electedRelayIdx = parsed;
          }
          else if (inner.content instanceof Uint8Array) {
              const bytes = inner.content;
              if (bytes.length >= 4)
                  electedRelayIdx = readUInt32BE(bytes, 0);
              else if (bytes.length > 0)
                  electedRelayIdx = bytes[0];
          }
          if (electedRelayIdx !== undefined) {
              this.info.electedRelayIdx = electedRelayIdx;
          }
      }
      async handleCallMuteV2(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          const meId = this.deps.authClient.getCurrentCredentials()?.meJid ?? '';
          const callId = this.info.callId;
          const callCreator = this.info.callCreator;
          if (!this.isOwnAccountJid(peerJid)) {
              const payload = parseMuteV2(nodeInfo.innerNode);
              if (!payload.isRequest && payload.muted !== null && this.info.stateData.peerAudioMuted !== payload.muted) {
                  this.info.stateData.peerAudioMuted = payload.muted;
                  this.delegate.emitPeerMute?.(this.info, payload.muted);
              }
          }
          try {
              const muteNode = buildMuteV2Stanza(peerJid, callId, callCreator, 0, meId);
              await this.deps.lowLevelCoordinator.sendNode(muteNode);
          }
          catch (err) {
              this.logger.error('error sending mute_v2 response', {
                  message: toError(err).message
              });
          }
      }
      isOwnAccountJid(jid) {
          const creds = this.deps.authClient.getCurrentCredentials();
          const user = toUserJid(jid);
          return ((!!creds?.meLid && user === toUserJid(creds.meLid)) ||
              (!!creds?.meJid && user === toUserJid(creds.meJid)));
      }
      get videoSendActive() {
          return !!(this.videoRtpStream && this.videoSrtpSession);
      }
      async setHandRaised(raised) {
          if (!this.info.isActive)
              return;
          if (this.info.stateData.handRaised === raised)
              return;
          const node = buildRaiseHandStanza(this.acceptedByJid ?? this.info.peerJid, this.info.callId, this.info.callCreator, raised);
          try {
              await this.deps.lowLevelCoordinator.sendNode(node);
          }
          catch (err) {
              this.logger.warn('raise hand send failed', {
                  raised,
                  message: toError(err).message
              });
              throw err;
          }
          this.info.applyTransition({ type: 'hand_raise_changed', raised });
          this.delegate.emitState(this.info);
      }
      async setScreenShare(sharing) {
          if (!this.info.isActive)
              return;
          if (this.info.stateData.screenSharing === sharing)
              return;
          if (sharing && !this.videoSendActive) {
              throw new Error(`Call ${this.info.callId} carries no video to share the screen on`);
          }
          const peerDeviceJid = this.acceptedByJid ?? this.info.peerJid;
          const state = sharing ? WA_SCREEN_SHARE_STATE.Started : WA_SCREEN_SHARE_STATE.Stopped;
          try {
              await this.deps.lowLevelCoordinator.sendNode(buildScreenShareStanza(peerDeviceJid, this.info.callId, this.info.callCreator, state));
          }
          catch (err) {
              this.logger.warn('screen share request failed', {
                  sharing,
                  message: toError(err).message
              });
              throw err;
          }
          this.info.applyTransition({ type: 'screen_share_changed', sharing });
          this.delegate.emitState(this.info);
      }
      handleCallUserAction(node, peerJid) {
          this.applyPeerRaiseHand(node, peerJid);
      }
      handleCallRaiseHand(node, peerJid) {
          this.applyPeerRaiseHand(node, peerJid);
      }
      applyPeerRaiseHand(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          if (this.isOwnAccountJid(peerJid))
              return;
          const raised = parseRaiseHandState(nodeInfo.innerNode);
          if (raised === null)
              return;
          const raisedHands = this.info.raisedHands;
          if (raisedHands.has(peerJid) === raised)
              return;
          if (raised) {
              if (raisedHands.size >= 64)
                  return;
              raisedHands.add(peerJid);
          }
          else {
              raisedHands.delete(peerJid);
          }
          this.delegate.emitHandRaise?.(this.info, peerJid, raised);
      }
      handleCallScreenShare(node) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          const share = parseScreenShareNode(nodeInfo.innerNode);
          if (!share)
              return;
          this.info.peerScreenShare = share;
          this.delegate.emitScreenShare?.(this.info, share);
          this.delegate.emitState(this.info);
      }
      sendReaction(reaction) {
          if (!this.appDataStream || !this.appDataSrtpSession)
              return false;
          if (!this.info.isActive)
              return false;
          return this.appDataStream.sendReaction(reaction);
      }
      openAppDataStream(selfDeviceJid) {
          const ssrc = generateSecureSsrc(this.info.callId, selfDeviceJid, 6);
          this.appDataStream?.close();
          this.appDataStream = new WaAppDataStream({
              logger: this.logger.child({ component: 'app-data' }),
              ssrc,
              sendPacket: (packet) => {
                  if (!this.appDataSrtpSession)
                      return false;
                  return this.sctpRelay.broadcast(toArrayBuffer(this.appDataSrtpSession.protect(packet)));
              }
          });
      }
      trackPeerAppDataSsrcs(deviceJids) {
          for (const jid of deviceJids) {
              if (!jid)
                  continue;
              if (this.peerAppDataSsrcs.size >= 16)
                  break;
              this.peerAppDataSsrcs.add(generateSecureSsrc(this.info.callId, this.ensureDeviceJid(jid), 6));
          }
      }
      onAppDataPacket(data, payloadType, ssrc) {
          const stream = this.appDataStream;
          if (!stream || !this.appDataSrtpSession)
              return;
          try {
              const packet = this.appDataSrtpSession.unprotect(data);
              stream.observeInboundPayloadType(payloadType);
              for (const reaction of stream.receive(packet.payload, ssrc)) {
                  this.delegate.emitCallReaction?.(this.info, reaction);
              }
          }
          catch { }
      }

      async handleCallVideo(node) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo)
              return;
          const inner = nodeInfo.innerNode;
          const state = Number(inner.attrs?.state ?? Number.NaN);
          if (!Number.isFinite(state))
              return;
          const peerJid = this.acceptedByJid || this.info.peerJid;
          const callId = this.info.callId;
          const callCreator = this.info.callCreator;
          const sourceJid = nodeInfo.peerJid || peerJid;
          const setPeerVideo = (on) => {
              const before = this.peerVideoJids.size;
              if (on)
                  this.peerVideoJids.add(sourceJid);
              else
                  this.peerVideoJids.delete(sourceJid);
              this.peerVideoActive = this.peerVideoJids.size > 0;
              return { before, after: this.peerVideoJids.size };
          };
          switch (state) {
              case VideoState.UpgradeRequest:
              case VideoState.UpgradeRequestV2: {
                  setPeerVideo(true);
                  this.peerVideoUpgradePending = true;
                  await this.enableVideoMidCall();
                  try {
                      const accept = buildVideoStateStanza(peerJid, callId, callCreator, VideoState.UpgradeAccept, { dec: VideoDecAccept });
                      await this.deps.lowLevelCoordinator.sendNode(accept);
                  }
                  catch (err) {
                      this.logger.error('error sending video upgrade accept', { callId, message: toError(err).message });
                  }
                  this.peerVideoUpgradePending = false;
                  this.info.mediaType = CallMediaType.Video;
                  this.info.stateData.videoOff = false;
                  this.delegate.emitState(this.info);
                  this.delegate.emitVideoState?.(this.info, { active: true, upgrade: true, raw: state, jid: sourceJid });
                  break;
              }
              case VideoState.Disabled:
              case VideoState.Stopped: {
                  const { before, after } = setPeerVideo(false);
                  if (state === VideoState.Disabled && before === after)
                      break;
                  this.delegate.emitVideoState?.(this.info, {
                      active: false,
                      upgrade: false,
                      raw: state,
                      direction: 'inbound',
                      jid: sourceJid,
                      allOff: before > 0 && after === 0
                  });
                  break;
              }
              case VideoState.UpgradeReject:
              case VideoState.UpgradeCancel: {
                  this.disableVideoMidCall({ keepSource: true });
                  this.delegate.emitVideoState?.(this.info, { active: false, upgrade: false, raw: state });
                  break;
              }
              case VideoState.Enabled: {
                  setPeerVideo(true);
                  this.delegate.emitVideoState?.(this.info, { active: true, upgrade: false, raw: state, direction: 'inbound', jid: sourceJid });
                  break;
              }
              default:
                  break;
          }
      }

      async startVideoMidCall() {
          const peerJid = this.acceptedByJid || this.info.peerJid;
          const request = buildVideoStateStanza(peerJid, this.info.callId, this.info.callCreator, VideoState.UpgradeRequestV2, { dec: VideoDecRequest });
          await this.deps.lowLevelCoordinator.sendNode(request);
          await this.enableVideoMidCall();
          this.info.mediaType = CallMediaType.Video;
          this.info.stateData.videoOff = false;
          this.delegate.emitState(this.info);
          this.delegate.emitVideoState?.(this.info, { active: true, upgrade: true, raw: VideoState.UpgradeRequestV2 });
      }
      async enableVideoMidCall() {
          if (this.videoRtpStream && this.videoSrtpSession)
              return;
          const creds = this.deps.authClient.getCurrentCredentials();
          const selfLid = creds?.meLid || creds?.meJid || '';
          if (!this.videoSsrc) {
              this.videoSsrc = generateSecureSsrc(this.info.callId, this.ensureDeviceJid(selfLid), 2);
          }
          this.videoRtpStream = new VideoRtpStream(this.videoSsrc, videoRtpDurationSamples(this.videoEngine.frameDurationMs));

          if (this.srtpSession) {
              const meLid = creds?.meLid;
              const meId = creds?.meJid;
              const ourBase = toUserJid(meLid || meId || '');
              const participants = this.info.relayData?.participantJids || [];
              const ourDeviceJid = this.ensureDeviceJid(participants.find((jid) => toUserJid(jid) === ourBase && /:\d+@/.test(jid)) || meLid || meId || '');
              const peerDeviceJid = this.ensureDeviceJid(this.acceptedByJid || this.info.peerJid);
              try {
                  const sendKeying = derivePerJidSrtpKey(this.info.encryptionKey, ourDeviceJid);
                  const recvKeying = derivePerJidSrtpKey(this.info.encryptionKey, peerDeviceJid);
                  this.videoSrtpSession = new SrtpSession(sendKeying, recvKeying, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN);
                  this.videoRtcpSession = new SrtcpSendContext(sendKeying);
              }
              catch (err) {
                  this.logger.error('video srtp key derivation failed', { callId: this.info.callId, message: toError(err).message });
              }
          }
          this.videoAssembler = new H264AccessUnitAssembler();

          if (!this.videoEngine.hasSource()) {
              try {
                  await this.videoEngine.loadBlankSource();
              }
              catch (err) {
                  this.logger.error('blank video fallback unavailable', { callId: this.info.callId, message: toError(err).message });
              }
          }
          if (this.sctpRelay.hasConnection()) {
              this.videoEngine.start();
          }
      }

      async swapVideoSource(videoPath) {
          if (this.info.mediaType !== CallMediaType.Video) {
              throw new Error(`Call ${this.info.callId} has no active video stream to swap`);
          }
          this.videoEngine.stop({ keepSource: false });
          await this.videoEngine.loadVideoFile(videoPath);
          this.audioEngine.setLoopMode(true);
          this.videoEngine.start();
      }

      async stopVideoMidCall({ keepSource = false } = {}) {
          const peerJid = this.acceptedByJid || this.info.peerJid;
          try {
              const stop = buildVideoStateStanza(peerJid, this.info.callId, this.info.callCreator, VideoState.Stopped);
              await this.deps.lowLevelCoordinator.sendNode(stop);
          }
          catch (err) {
              this.logger.error('error sending video stop', { callId: this.info.callId, message: toError(err).message });
          }
          this.disableVideoMidCall({ keepSource });
          this.info.stateData.videoOff = true;
          this.delegate.emitState(this.info);
          this.delegate.emitVideoState?.(this.info, { active: false, upgrade: false, raw: VideoState.Stopped });
      }

      disableVideoMidCall({ keepSource = false } = {}) {
          this.videoEngine.stop({ keepSource });
          this.videoRtpStream = null;
          this.videoSrtpSession = null;
          this.videoRtcpSession = null;
          this.videoAssembler = null;
          this.info.mediaType = CallMediaType.Audio;
      }
      handleCallTerminate() {
          try {
              this.info.applyTransition({
                  type: 'terminated',
                  reason: EndCallReason.UserEnded
              });
          }
          catch { }
          this.delegate.emitEnded(this.info);
          this.delegate.emitState(this.info);
          this.cleanup();
      }
      sendCapturedAudio(data) {
          const hasRelay = this.sctpRelay.hasConnection();
          if (!this.rtpSession || !this.srtpSession || !this.opusCodec || !hasRelay) {
              this.audioDropCount++;
              return;
          }
          for (let i = 0; i < data.length; i++) {
              if (!Number.isFinite(data[i])) {
                  data[i] = 0;
              }
          }
          const frameSamples = this.encodeFrameSamples;
          if (!this.encodeBuffer) {
              if (!this.encodeBufferA) {
                  this.encodeBufferA = new Float32Array(frameSamples);
                  this.encodeBufferB = new Float32Array(frameSamples);
              }
              this.encodeBuffer = this.encodeBufferA;
              this.encodeBufferPos = 0;
          }
          let offset = 0;
          while (offset < data.length) {
              const toCopy = Math.min(data.length - offset, frameSamples - this.encodeBufferPos);
              this.encodeBuffer.set(data.subarray(offset, offset + toCopy), this.encodeBufferPos);
              this.encodeBufferPos += toCopy;
              offset += toCopy;
              if (this.encodeBufferPos < frameSamples)
                  break;
              const frameData = this.encodeBuffer;
              this.encodeBuffer =
                  frameData === this.encodeBufferA ? this.encodeBufferB : this.encodeBufferA;
              this.encodeBufferPos = 0;
              try {
                  const opusFrame = this.opusCodec.encode(frameData);
                  this.sendOpusFrame(opusFrame, false);
                  this.realAudioSendCount++;
              }
              catch (err) {
                  this.logger.error('encode error', {
                      callId: this.info.callId,
                      message: toError(err).message
                  });
              }
          }
      }

      async loadVideo(videoPath) {
          if (this.info.mediaType !== CallMediaType.Video) {
              throw new Error(`Call ${this.info.callId} was not started with isVideo — no video SSRC/RTP stream to send on`);
          }
          await this.videoEngine.loadVideoFile(videoPath);
          this.audioEngine.setLoopMode(true);

          if (this.mediaFlowStarted && this.sctpRelay.hasConnection()) {
              this.videoEngine.start();
          }
      }

      sendCapturedVideoAU(au, durationMs) {
          const hasRelay = this.sctpRelay.hasConnection();
          if (!this.videoRtpStream || !this.videoSrtpSession || !hasRelay) {
              this.videoDropCount++;
              return;
          }
          try {
              const payload = buildAccessUnitPayload(au);
              if (!payload)
                  return;
              const idr = auHasIDR(au);
              const flushesBefore = this.sctpRelay.getVideoFlushCount();
              if (flushesBefore !== this.videoFlushSeen) {
                  this.videoFlushSeen = flushesBefore;
                  this.videoKeyframeRequired = true;
              }
              if (this.videoKeyframeRequired && !idr)
                  return;
              const mediaFrameInfo = idr ? VideoMediaFrameInfo.IDR : VideoMediaFrameInfo.Delta;
              this.videoRtpStream.setTimestampStride(videoRtpDurationSamples(durationMs));
              const chunks = packageH264NALU(payload);
              for (let i = 0; i < chunks.length; i++) {
                  const header = this.videoRtpStream.nextPacket(i === chunks.length - 1, mediaFrameInfo);
                  const srtpData = this.videoSrtpSession.protect(new RtpPacket(header, chunks[i]));
                  this.sctpRelay.broadcast(toArrayBuffer(srtpData));
                  this.videoOctetsSent = (this.videoOctetsSent + chunks[i].length) >>> 0;
              }
              const flushesAfter = this.sctpRelay.getVideoFlushCount();
              if (flushesAfter !== flushesBefore) {
                  this.videoFlushSeen = flushesAfter;
                  this.videoKeyframeRequired = true;
              }
              else if (idr) {
                  this.videoKeyframeRequired = false;
              }
              this.videoSendCount++;
              if (idr)
                  this.videoIdrSendCount++;
          }
          catch (err) {
              this.logger.error('error sending video', {
                  callId: this.info.callId, message: toError(err).message
              });
          }
      }
      cleanup() {
          this.audioEngine.setOnAudioFinished(null);
          this.audioEngine.release();
          this.videoEngine.stop();
          this.sctpRelay.cleanup();
          this.answeredRelays.clear();
          this.announcedRelayNames.clear();
          this.relayLatencyOpened = false;
          if (this.rtcpTimer) {
              clearInterval(this.rtcpTimer);
              this.rtcpTimer = null;
          }
          if (this.opusCodec) {
              this.opusCodec.destroy();
              this.opusCodec = null;
          }
          this.rtpSession = null;
          this.srtpSession = null;
          this.appDataStream?.close();
          this.appDataStream = null;
          this.appDataSrtpSession = null;
          this.peerAppDataSsrcs.clear();
          this.audioRtcpSession = null;
          this.audioRtcpCname = null;
          this.audioOctetsSent = 0;
          this.videoRtpStream = null;
          this.videoSrtpSession = null;
          this.videoRtcpSession = null;
          this.videoRtcpCname = null;
          this.videoOctetsSent = 0;
          this.videoSsrc = 0;
          this.videoAssembler = null;
          this.peerVideoUpgradePending = false;
          this.peerVideoActive = false;
          this.peerVideoJids.clear();
          this.mediaStartedAtMs = null;
          this.videoSendCount = 0;
          this.videoIdrSendCount = 0;
          this.videoDropCount = 0;
          this.audioSendCount = 0;
          this.audioDropCount = 0;
          this.audioRecvCount = 0;
          this.srtpErrorCount = 0;
          this.relayPacketCount = 0;
          this.stunResponseCount = 0;
          this.selfEchoCount = 0;
          this.lastRecvSeq = -1;
          this.recvSeqGaps = 0;
          this.actualPeerSsrc = null;
          this.ssrcResubscribed = false;
          this.recvRealCount = 0;
          this.recvDtxCount = 0;
          this.initialTransportSent = false;
          this.outgoingPreacceptSent = false;
          this.firstPacketSent = false;
          this.realAudioSendCount = 0;
          this.encodeBuffer = null;
          this.encodeBufferPos = 0;
          this.acceptedByJid = null;
      }
      get encodeFrameSamples() {
          return this.opusCodec?.getFrameSize() ?? 960;
      }
      get rtpTsDelta() {
          return this.encodeFrameSamples;
      }
      sendOpusFrame(opusFrame, isSilence) {
          if (!this.rtpSession || !this.srtpSession)
              return;
          try {
              let rtpPayload = opusFrame;
              const authPadding = SRTP_AUTH_TAG_LEN - SRTP_SEND_AUTH_TAG_LEN;
              if (authPadding > 0) {
                  if (!this.authPaddingBuffer || this.authPaddingBuffer.length !== authPadding) {
                      this.authPaddingBuffer = new Uint8Array(authPadding);
                  }
                  rtpPayload = concatBytes([rtpPayload, this.authPaddingBuffer]);
              }
              const marker = !this.firstPacketSent;
              const tsDelta = this.rtpTsDelta;
              const rtpPacket = this.rtpSession.createPacketWithDuration(rtpPayload, tsDelta, marker);
              if (this.debeEnabled) {
                  rtpPacket.header.extension = true;
                  rtpPacket.header.extensionProfile = 0xdebe;
                  rtpPacket.header.extensionData = WaCallMediaSession.EMPTY_BYTES;
              }
              if (!this.firstPacketSent) {
                  this.firstPacketSent = true;
              }
              const srtpData = this.srtpSession.protect(rtpPacket);
              this.sctpRelay.broadcast(toArrayBuffer(srtpData));
              this.audioSendCount++;
              this.audioOctetsSent = (this.audioOctetsSent + rtpPayload.length) >>> 0;
          }
          catch (err) {
              this.logger.error('error sending audio', {
                  callId: this.info.callId,
                  message: toError(err).message
              });
          }
      }
      ensureDeviceJid(jid) {
          if (/:\d+@/.test(jid))
              return jid;
          return jid.replace('@', ':0@');
      }
      initSrtpKeys() {
          const callKey = this.info.encryptionKey;
          if (!callKey) {
              return;
          }
          const meLid = this.deps.authClient.getCurrentCredentials()?.meLid;
          const meId = this.deps.authClient.getCurrentCredentials()?.meJid;
          const ourCredJid = meLid || meId || '';
          const ourBase = toUserJid(ourCredJid);
          const participants = this.info.relayData?.participantJids || [];
          const ourDeviceJid = this.ensureDeviceJid(participants.find((jid) => {
              const jBase = toUserJid(jid);
              return jBase === ourBase && /:\d+@/.test(jid);
          }) || ourCredJid);
          let rawPeerJid = this.acceptedByJid || this.info.peerJid;
          if (!this.acceptedByJid) {
              const peerFromParticipants = participants.find((jid) => {
                  const jBase = toUserJid(jid);
                  return jBase !== ourBase;
              });
              if (peerFromParticipants)
                  rawPeerJid = peerFromParticipants;
          }
          const peerDeviceJid = this.ensureDeviceJid(rawPeerJid);
          try {
              const sendKeying = derivePerJidSrtpKey(callKey, ourDeviceJid);
              const recvKeying = derivePerJidSrtpKey(callKey, peerDeviceJid);
              this.srtpSession = new SrtpSession(sendKeying, recvKeying, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN);
              this.appDataSrtpSession = new SrtpSession(sendKeying, recvKeying, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN);
              this.openAppDataStream(ourDeviceJid);
              this.peerAppDataSsrcs.clear();
              this.trackPeerAppDataSsrcs([peerDeviceJid, ...participants.filter((jid) => toUserJid(jid) !== ourBase)]);
              this.audioRtcpSession = new SrtcpSendContext(sendKeying);
              if (this.info.mediaType === CallMediaType.Video) {
                  this.videoSrtpSession = new SrtpSession(sendKeying, recvKeying, SRTP_SEND_AUTH_TAG_LEN, SRTP_RECV_AUTH_TAG_LEN);
                  this.videoRtcpSession = new SrtcpSendContext(sendKeying);
              }
              this.startRtcpSenderReports();
          }
          catch { }
      }

      startRtcpSenderReports() {
          if (this.rtcpTimer)
              clearInterval(this.rtcpTimer);
          if (!this.audioRtcpCname)
              this.audioRtcpCname = generateWhatsappRtcpCname();
          if (!this.videoRtcpCname)
              this.videoRtcpCname = generateWhatsappRtcpCname();
          this.rtcpTimer = setInterval(() => {
              if (!this.sctpRelay.hasConnection())
                  return;
              const nowMs = Date.now();
              try {
                  if (this.audioRtcpSession && this.selfSsrc) {
                      const stats = {
                          packetsSent: this.audioSendCount,
                          octetsSent: this.audioOctetsSent,
                          rtpTimestamp: this.rtpSession?.timestamp ?? 0
                      };
                      const plain = buildSenderReportWithSdes(this.selfSsrc, stats, nowMs, this.audioRtcpCname);
                      const protectedPacket = this.audioRtcpSession.protect(this.selfSsrc, plain);
                      this.sctpRelay.broadcast(toArrayBuffer(protectedPacket));
                  }
                  if (this.videoRtcpSession && this.videoSsrc && this.videoSendCount > 0) {
                      const stats = {
                          packetsSent: this.videoSendCount,
                          octetsSent: this.videoOctetsSent,
                          rtpTimestamp: this.videoRtpStream?.timestamp ?? 0
                      };
                      const plain = buildSenderReportWithSdes(this.videoSsrc, stats, nowMs, this.videoRtcpCname);
                      const protectedPacket = this.videoRtcpSession.protect(this.videoSsrc, plain);
                      this.sctpRelay.broadcast(toArrayBuffer(protectedPacket));
                  }
              }
              catch { }
          }, 1500);
      }
      resetEncodeState() {
          this.encodeBuffer = null;
          this.encodeBufferPos = 0;
          this.realAudioSendCount = 0;
      }
      onRelayConnected() {
          if (this.info.stateData.state === CallState.Connecting) {
              try {
                  this.info.applyTransition({ type: 'media_connected' });
                  this.delegate.emitState(this.info);
                  if (!this.acceptedByJid) {
                      return;
                  }
                  setTimeout(() => {
                      if (this.info.stateData.state === CallState.Ended) {
                          return;
                      }
                      this.startMediaFlow();
                  }, 3000);
              }
              catch { }
          }
      }
      onRelayData(data) {
          this.relayPacketCount++;
          if (isStunPacket(data)) {
              this.stunResponseCount++;
              return;
          }
          if (!isRtpPacket(data))
              return;
          const pt = data[1] & 0x7f;
          if (this.peerAppDataSsrcs.size > 0 && data.length >= 12) {
              const appDataSsrc = readUInt32BE(data, 8);
              if (this.peerAppDataSsrcs.has(appDataSsrc)) {
                  this.onAppDataPacket(data, pt, appDataSsrc);
                  return;
              }
          }
          if (pt === PayloadType.H264) {
              this.onRelayVideoData(data);
              return;
          }
          if (!this.srtpSession || !this.opusCodec)
              return;
          if (pt !== 120)
              return;
          if (data.length >= 12) {
              const ssrc = ((data[8] << 24) | (data[9] << 16) | (data[10] << 8) | data[11]) >>> 0;
              if (ssrc === this.selfSsrc) {
                  this.selfEchoCount++;
                  return;
              }
              if (!this.ssrcResubscribed && this.actualPeerSsrc === null) {
                  this.actualPeerSsrc = ssrc;
                  const knownSsrc = this.peerSsrcs.includes(ssrc);
                  if (!knownSsrc) {
                      this.peerSsrcs = [ssrc];
                      this.ssrcResubscribed = true;
                      this.opusCodec.resetSequence();
                      this.lastRecvSeq = -1;
                      this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);
                      this.sctpRelay.resendSubscriptions();
                  }
              }
          }
          try {
              const rtpPacket = this.srtpSession.unprotect(data);
              const opusPayload = rtpPacket.payload;
              this.audioRecvCount++;
              if (opusPayload.length === 0)
                  return;
              const seq = rtpPacket.header.sequenceNumber;
              if (this.lastRecvSeq >= 0) {
                  const gap = ((seq - this.lastRecvSeq + 65536) % 65536) - 1;
                  if (gap > 0 && gap < 0x8000)
                      this.recvSeqGaps += gap;
              }
              this.lastRecvSeq = seq;
              const isDtx = opusPayload.length <= 2;
              if (isDtx)
                  this.recvDtxCount++;
              else
                  this.recvRealCount++;
              this.opusCodec.decodeSequenced(seq, opusPayload, this.onDecodedAudio);
              if (this.audioRecvCount % 100 === 0) {
                  const w = (this.lossWindow ??= { gaps: 0, pkts: 0 });
                  const gaps = this.recvSeqGaps - w.gaps;
                  const pkts = this.audioRecvCount - w.pkts;
                  w.gaps = this.recvSeqGaps;
                  w.pkts = this.audioRecvCount;
                  const lossPct = pkts + gaps > 0 ? Math.min(100, Math.round((100 * gaps) / (pkts + gaps))) : 0;
                  this.opusCodec.setExpectedPacketLossPercent(lossPct);
              }
          }
          catch (err) {
              this.srtpErrorCount++;
          }
      }

      onRelayVideoData(data) {
          if (!this.videoSrtpSession || !this.videoAssembler)
              return;
          try {
              const rtpPacket = this.videoSrtpSession.unprotect(data);
              const [accessUnit, complete] = this.videoAssembler.push(rtpPacket.header.sequenceNumber, rtpPacket.header.marker, rtpPacket.payload);
              if (complete && accessUnit) {
                  this.delegate.emitInboundVideo?.(this.info, accessUnit);
              }
          }
          catch (err) {
              this.srtpErrorCount++;
          }
      }
      selectRelayEndpoints(endpoints) {
          const seen = new Set();
          const uniqueEndpoints = [];
          for (const ep of endpoints) {
              if ((ep.protocol ?? 0) !== 0 || ep.ip.includes(':'))
                  continue;
              const key = `${ep.ip}:${ep.port}`;
              if (!seen.has(key)) {
                  seen.add(key);
                  uniqueEndpoints.push(ep);
              }
          }
          const usable = uniqueEndpoints.filter((ep) => ep.key && ep.rawToken);

          const inbound = this.info.direction === CallDirection.Incoming;
          let chosen = null;
          if (inbound) {
              chosen = usable.find((ep) => ep.isFna) ?? null;
          }
          if (!chosen) {
              chosen =
                  usable.find((ep) => !ep.isFna && parseInt(ep.authTokenId, 10) !== 0) ??
                  usable.find((ep) => !ep.isFna) ??
                  usable[0] ??
                  null;
          }
          const ordered = chosen ? [chosen] : [];
          const orderedAddresses = new Set(chosen ? [chosen.ip] : []);
          for (const ep of usable) {
              if (ordered.length >= 4)
                  break;
              if (orderedAddresses.has(ep.ip))
                  continue;
              orderedAddresses.add(ep.ip);
              ordered.push(ep);
          }
          return ordered;
      }
      async connectRelays(endpoints) {
          const ordered = this.selectRelayEndpoints(endpoints);
          const relays = ordered.map((ep) => ({
              ip: ep.ip,
              port: ep.port || 3478,
              token: ep.token,
              authToken: ep.authToken,
              rawAuthToken: ep.rawAuthToken,
              rawToken: ep.rawToken,
              key: ep.key,
              relayId: ep.relayId,
              name: ep.relayName || `${ep.ip}:${ep.port || 3478}`,
              authTokenId: ep.authTokenId,
              isFna: ep.isFna
          }));
          if (relays.length === 0) {
              this.logger.error('no relay configs', { callId: this.info.callId });
              return;
          }
          this.sctpRelay.setParticipantIds(this.info.relayData?.selfPid, this.info.relayData?.peerPid);
          this.sctpRelay.setSsrc(this.selfSsrc);
          this.sctpRelay.setStreamSsrcs(this.selfSsrcJid ? deriveWasmRelayStreamSsrcs(this.info.callId, this.selfSsrcJid) : null);
          if (this.info.mediaType === CallMediaType.Video) {
              this.sctpRelay.setVideoSsrc(this.videoSsrc);
          }
          this.sctpRelay.setSubscriptionSsrc(this.peerSsrcs[0] ?? 0);
          try {
              await this.sctpRelay.configureRelays(relays);
          }
          catch (err) {
              this.logger.error('sctp relay error', {
                  callId: this.info.callId,
                  message: toError(err).message
              });
          }
      }
      startMediaFlow() {
          this.mediaStartedAtMs = Date.now();
          this.mediaFlowStarted = true;
          this.resetEncodeState();
          this.audioEngine.startPlayback();
          this.audioEngine.startCapture();

          this.videoEngine.start();
      }
  }

  async function resolveUserLid(deps, jid) {
      const raw = String(jid ?? '').trim();
      if (!raw) {
          throw new Error('participant is required');
      }
      const normalized = raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@s.whatsapp.net`;
      if (normalized.endsWith('@lid')) {
          return normalized;
      }
      const [mapped] = await deps.signalDeviceSync.queryLidsByPhoneJids([normalized]);
      if (!mapped?.lidJid?.endsWith('@lid')) {
          throw new Error(`no LID mapping found for ${normalized}`);
      }
      return mapped.lidJid;
  }
  async function listUserDevices(deps, lid) {
      const devices = await deps.signalDeviceSync.getDevices([lid]);
      return [...new Set(devices.filter(Boolean))];
  }
  function stripDevice(jid) {
      return String(jid).replace(/:\d+@/, '@');
  }
  function unwrapGroupForwarding(data) {
      if (data.length === 0 || data[0] !== 0x09) {
          return data;
      }
      const headerBytes = { 2: 8, 4: 12, 7: 18 }[data[1]];
      if (!headerBytes || data.length < headerBytes + 12 || data[headerBytes] >> 6 !== 2) {
          return null;
      }
      return data.subarray(headerBytes);
  }
  function joinFloats(left, right) {
      const merged = new Float32Array(left.length + right.length);
      merged.set(left, 0);
      merged.set(right, left.length);
      return merged;
  }
  class GroupAudioMixer {
      chunkSamples = 160;
      frameSamples = 960;
      streams = new Map();
      allowed = new Set();
      rosterApplied = false;
      framePending = new Float32Array(0);
      add(participantId, pcm) {
          if (!participantId || pcm.length === 0) {
              return false;
          }
          if (this.rosterApplied && !this.allowed.has(participantId)) {
              return false;
          }
          let queue = this.streams.get(participantId);
          if (!queue) {
              queue = { pending: new Float32Array(0), started: false };
              this.streams.set(participantId, queue);
          }
          const maxSamples = this.frameSamples * 4;
          if (pcm.length >= maxSamples) {
              queue.pending = pcm.slice(pcm.length - maxSamples);
              return true;
          }
          const merged = joinFloats(queue.pending, pcm);
          queue.pending = merged.length > maxSamples ? merged.slice(merged.length - maxSamples) : merged;
          return true;
      }
      retain(participantIds) {
          this.allowed = new Set(participantIds.filter(Boolean));
          this.rosterApplied = true;
          for (const participantId of [...this.streams.keys()]) {
              if (!this.allowed.has(participantId)) {
                  this.streams.delete(participantId);
              }
          }
      }
      mixChunk() {
          const mixed = new Float32Array(this.chunkSamples);
          let contributed = false;
          for (const participantId of [...this.streams.keys()].sort()) {
              const queue = this.streams.get(participantId);
              if (!queue.started) {
                  if (queue.pending.length < this.frameSamples * 2) {
                      continue;
                  }
                  queue.started = true;
              }
              if (queue.pending.length < this.chunkSamples) {
                  queue.started = false;
                  continue;
              }
              for (let i = 0; i < mixed.length; i++) {
                  mixed[i] += queue.pending[i];
              }
              queue.pending = queue.pending.subarray(this.chunkSamples);
              contributed = true;
          }
          if (!contributed) {
              return null;
          }
          for (let i = 0; i < mixed.length; i++) {
              mixed[i] = Math.max(-1, Math.min(1, mixed[i]));
          }
          return mixed;
      }
      pushChunk(chunk) {
          this.framePending = joinFloats(this.framePending, chunk);
          if (this.framePending.length < this.frameSamples) {
              return null;
          }
          const frame = this.framePending.slice(0, this.frameSamples);
          this.framePending = this.framePending.slice(this.frameSamples);
          return frame;
      }
      reset() {
          this.streams.clear();
          this.allowed.clear();
          this.rosterApplied = false;
          this.framePending = new Float32Array(0);
      }
  }
  class GroupReceiver {
      audioCtx = null;
      videoCtx = null;
      appDataCtx = null;
      codec = null;
      closed = false;
      constructor(callId, participantId, deviceJid, pid, logger) {
          this.participantId = participantId;
          this.deviceJid = deviceJid;
          this.pid = pid;
          this.audioSsrc = generateSecureSsrc(callId, participantId, 0);
          this.videoSsrc = generateSecureSsrc(callId, participantId, 2);
          this.appDataSsrc = generateSecureSsrc(callId, participantId, 6);
          this.assembler = new H264AccessUnitAssembler();
          MLowCodec.create({ logger, fec: false, decodeOnly: true })
              .then((codec) => {
              if (this.closed) {
                  codec.destroy();
                  return;
              }
              this.codec = codec;
          })
              .catch(() => { });
      }
      install(rawKey, tagLength) {
          const keying = derivePerJidSrtpKey(rawKey, this.participantId);
          if (this.audioCtx) {
              this.audioCtx.rekey(keying);
              this.videoCtx.rekey(keying);
              this.appDataCtx.rekey(keying);
              return;
          }
          this.audioCtx = new SrtpContext(keying, tagLength);
          this.videoCtx = new SrtpContext(keying, tagLength);
          this.appDataCtx = new SrtpContext(keying, tagLength);
      }
      close() {
          this.closed = true;
          this.codec?.destroy();
          this.codec = null;
      }
  }
  class WaGroupCallSession extends WaCallMediaSession {
      roster = null;
      rosterTransactionId = null;
      epoch = null;
      pendingEpochs = new Map();
      receivers = new Map();
      audioBySsrc = new Map();
      videoBySsrc = new Map();
      appDataBySsrc = new Map();
      selfParticipantId = '';
      selfPid = 0;
      warpTagLength = 4;
      groupEndpoints = [];
      relayConfigured = false;
      subscribedPids = '';
      offerStanzaId = null;
      inviteSnapshot = null;
      mixer = new GroupAudioMixer();
      mixTimer = null;
      heartbeatTimer = null;
      constructor(options) {
          super({ ...options, maxActiveRelays: 1 });
          this.info.peerJid = callJidFor(this.info.callId);
          this.acceptedByJid = this.info.peerJid;
          this.sctpRelay.setAllocateBuilder((relayInfo, candidate, transactionId) => this.buildGroupAllocate(relayInfo, candidate, transactionId));
      }
      get callJid() {
          return callJidFor(this.info.callId);
      }
      async initMedia(selfLid) {
          const selfId = formatParticipantId(selfLid);
          this.selfParticipantId = selfId;
          this.selfSsrcJid = selfId;
          this.selfSsrc = generateSecureSsrc(this.info.callId, selfId, 0);
          this.rtpSession = RtpSession.whatsappOpus(this.selfSsrc);
          this.opusCodec = await MLowCodec.create({ logger: this.logger.child({ component: 'mlow' }), fec: true, encodeOnly: true });
          this.videoSsrc = generateSecureSsrc(this.info.callId, selfId, 2);
          if (this.info.mediaType === CallMediaType.Video) {
              this.videoRtpStream = new VideoRtpStream(this.videoSsrc, videoRtpDurationSamples(this.videoEngine.frameDurationMs));
              this.videoAssembler = new H264AccessUnitAssembler();
          }
      }
      async sendIncomingPreaccept() {
          await this.deps.lowLevelCoordinator.sendNode(buildGroupPreacceptStanza(this.info.callId, this.info.callCreator, this.info.mediaType === CallMediaType.Video));
      }
      async sendIncomingRelayLatency() { }
      async acceptCall() {
          if (!this.info.canAccept) {
              throw new Error(`Call ${this.info.callId} cannot be accepted in state ${this.info.stateData.state}`);
          }
          this.info.applyTransition({ type: 'local_accepted' });
          this.delegate.emitState(this.info);
          await this.deps.lowLevelCoordinator.sendNode(buildGroupAcceptStanza(this.info.callId, this.info.callCreator));
          await this.maybeStartMedia();
      }
      async rejectCall(reason = EndCallReason.Declined) {
          this.info.applyTransition({ type: 'local_rejected', reason });
          this.delegate.emitState(this.info);
          try {
              await this.deps.lowLevelCoordinator.sendNode({
                  tag: 'call',
                  attrs: { to: this.callJid, id: generateCallStanzaId() },
                  content: [{ tag: 'reject', attrs: { 'call-id': this.info.callId, 'call-creator': this.info.callCreator } }]
              });
          }
          catch (err) {
              this.logger.warn('reject send failed', { message: toError(err).message });
          }
          this.cleanup();
      }
      async endCall(reason = EndCallReason.UserEnded) {
          if (this.info.isEnded) {
              return;
          }
          this.info.applyTransition({ type: 'terminated', reason });
          this.delegate.emitEnded(this.info);
          this.delegate.emitState(this.info);
          try {
              await this.deps.lowLevelCoordinator.sendNode(buildGroupTerminateStanza(this.info.callId, this.info.callCreator));
          }
          catch (err) {
              this.logger.warn('terminate send failed', { message: toError(err).message });
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
          this.cleanup();
      }
      handleCallTerminate(node) {
          const participant = node?.attrs?.participant;
          if (participant && toUserJid(participant) !== toUserJid(this.info.callCreator)) {
              return false;
          }
          return super.handleCallTerminate();
      }
      async handleCallAccept() {
          if (this.info.stateData.state === CallState.Ringing) {
              try {
                  this.info.applyTransition({ type: 'remote_accepted' });
                  this.delegate.emitState(this.info);
              }
              catch { }
          }
          await this.maybeStartMedia();
      }
      async handleCallPreaccept() { }
      async handleCallTransport() { }
      async handleCallRelaylatency() { }
      handleRelayElection() { }
      handleCallUserAction(node) {
          this.applyPeerRaiseHand(node, node.attrs?.participant || node.attrs?.from);
      }
      handleCallRaiseHand(node) {
          this.applyPeerRaiseHand(node, node.attrs?.participant || node.attrs?.from);
      }
      async handleCallAck(node) {
          if (node.attrs?.type && node.attrs.type !== 'offer') {
              return;
          }
          if (node.attrs?.error) {
              this.logger.warn('group offer rejected', { error: node.attrs.error });
              await this.endCall(EndCallReason.Failed);
              return;
          }
          let update;
          try {
              update = parseInitialGroupAck(node);
          }
          catch (err) {
              this.logger.warn('group offer ack parse failed', { message: toError(err).message });
              return;
          }
          if (update) {
              await this.processGroupSnapshot(update);
          }
      }
      async handleGroupUpdate(node) {
          let update;
          try {
              update = parseGroupUpdate(getFirstNodeChild(node));
          }
          catch (err) {
              this.logger.warn('group update parse failed', { message: toError(err).message });
              return;
          }
          await this.processGroupSnapshot(update);
      }
      async handleGroupEncRekey(node) {
          const inner = getFirstNodeChild(node);
          let rekey;
          try {
              rekey = parseGroupEncRekey(inner);
          }
          catch (err) {
              this.logger.warn('group rekey parse failed', { message: toError(err).message });
              return;
          }
          const rawKey = await decryptCallKey(this.deps, inner, node.attrs?.participant || node.attrs?.from, this.logger);
          if (!rawKey) {
              this.logger.warn('group rekey could not be decrypted', { transactionId: rekey.transactionId });
              return;
          }
          if (this.applyEpoch(rekey.transactionId, rawKey)) {
              this.refreshRelayAllocation();
              await this.maybeStartMedia();
          }
      }
      handleWaitingRoomUpdate(node) {
          let room;
          try {
              room = parseWaitingRoomUpdate(getFirstNodeChild(node));
          }
          catch (err) {
              this.logger.warn('waiting room update parse failed', { message: toError(err).message });
              return;
          }
          this.info.waitingRoom = room;
          this.delegate.emitWaitingRoom?.(this.info, room);
          this.delegate.emitState(this.info);
      }
      async beginLinkJoin(result) {
          if (result.waitingRoom) {
              this.info.waitingRoom = result.waitingRoom;
          }
          if (result.group) {
              this.info.applyTransition({ type: 'group_joined' });
              this.delegate.emitState(this.info);
              await this.processGroupSnapshot(result.group);
              return;
          }
          this.info.applyTransition({ type: 'waiting_room_entered' });
          this.delegate.emitState(this.info);
          this.delegate.emitWaitingRoom?.(this.info, this.info.waitingRoom);
          this.startWaitingHeartbeat();
      }
      startWaitingHeartbeat() {
          this.stopWaitingHeartbeat();
          this.heartbeatTimer = setInterval(() => {
              if (this.info.stateData.state !== CallState.WaitingRoom) {
                  this.stopWaitingHeartbeat();
                  return;
              }
              this.sendWaitingRoomRequest('heartbeat', { type: 'waiting_room' }).catch(() => { });
          }, 10000);
          this.heartbeatTimer.unref?.();
      }
      stopWaitingHeartbeat() {
          if (this.heartbeatTimer) {
              clearInterval(this.heartbeatTimer);
              this.heartbeatTimer = null;
          }
      }
      async sendWaitingRoomRequest(tag, attrs, children) {
          await this.deps.lowLevelCoordinator.sendNode(buildWaitingRoomRequestStanza(tag, this.info.callId, this.info.callCreator, generateCallStanzaId(), attrs, children));
      }
      async setApprovalRequired(enabled) {
          await this.sendWaitingRoomRequest('waiting_room_toggle', { enabled: enabled ? '1' : '0' });
      }
      async admitParticipant(jid) {
          const lid = await resolveUserLid(this.deps, jid);
          await this.sendWaitingRoomRequest('waiting_room_admit', {}, [{ tag: 'user', attrs: { jid: lid } }]);
      }
      async denyParticipant(jid) {
          const lid = await resolveUserLid(this.deps, jid);
          await this.sendWaitingRoomRequest('waiting_room_deny', {}, [{ tag: 'user', attrs: { jid: lid } }]);
      }
      async addParticipant(target) {
          await this.inviteParticipant(target, false);
      }
      async ringParticipant(target) {
          await this.inviteParticipant(target, true);
      }
      async inviteParticipant(target, ring) {
          if (!this.roster) {
              throw new Error('the call roster is not available yet');
          }
          const lid = stripDevice(await resolveUserLid(this.deps, target));
          if (lid === stripDevice(this.selfParticipantId)) {
              throw new Error('this account is already in its own call');
          }
          const entry = this.roster.participants.find((participant) => stripDevice(participant.jid) === lid);
          if (ring && !entry) {
              throw new Error('participant is not in the call roster');
          }
          if (ring && entry.state === 'connected') {
              throw new Error('participant is already connected');
          }
          if (!ring && entry) {
              throw new Error('participant is already in the call roster');
          }
          const participants = ring ? this.roster.participants.filter((participant) => participant.state === 'connected') : this.roster.participants;
          if (participants.length === 0) {
              throw new Error('the call has no connected participants');
          }
          const targetDevices = await listUserDevices(this.deps, lid);
          if (targetDevices.length === 0) {
              throw new Error(`no reachable devices for ${lid}`);
          }
          const stanza = buildGroupInviteOfferStanza({
              callId: this.info.callId,
              to: lid,
              creator: this.info.callCreator,
              targetDevices,
              participants,
              video: this.info.mediaType === CallMediaType.Video
          });
          stanza.attrs.id = generateCallStanzaId();
          await this.deps.lowLevelCoordinator.sendNode(stanza);
      }
      getParticipants() {
          return this.info.groupState?.participants ?? [];
      }
      applyGroupUpdate(update) {
          if (this.rosterTransactionId !== null && update.transactionId <= this.rosterTransactionId) {
              return false;
          }
          const next = new Map();
          let selfPid = this.selfPid;
          for (const participant of update.participants) {
              if (participant.state !== 'connected') {
                  continue;
              }
              for (const device of participant.devices) {
                  if (!device.jid || device.pid === undefined) {
                      continue;
                  }
                  const participantId = formatParticipantId(device.jid);
                  if (participantId === this.selfParticipantId) {
                      selfPid = device.pid;
                      continue;
                  }
                  const receiver = this.receivers.get(participantId) ?? new GroupReceiver(this.info.callId, participantId, device.jid, device.pid, this.logger.child({ component: 'mlow' }));
                  receiver.pid = device.pid;
                  next.set(participantId, receiver);
              }
          }
          for (const [participantId, receiver] of this.receivers) {
              if (!next.has(participantId)) {
                  receiver.close();
              }
          }
          this.receivers = next;
          this.selfPid = selfPid;
          this.audioBySsrc = new Map([...next.values()].map((receiver) => [receiver.audioSsrc, receiver]));
          this.videoBySsrc = new Map([...next.values()].map((receiver) => [receiver.videoSsrc, receiver]));
          this.appDataBySsrc = new Map([...next.values()].map((receiver) => [receiver.appDataSsrc, receiver]));
          this.roster = update;
          this.rosterTransactionId = update.transactionId;
          this.mixer.retain([...next.keys()]);
          const ready = [...this.pendingEpochs.keys()].filter((transactionId) => transactionId <= update.transactionId).sort((a, b) => b - a);
          if (ready.length > 0) {
              const newest = ready[0];
              const rawKey = this.pendingEpochs.get(newest);
              for (const transactionId of this.pendingEpochs.keys()) {
                  if (transactionId <= newest) {
                      this.pendingEpochs.delete(transactionId);
                  }
              }
              if (!this.epoch || newest > this.epoch.transactionId) {
                  this.installEpoch(newest, rawKey);
              }
          }
          if (this.epoch) {
              for (const receiver of next.values()) {
                  receiver.install(this.epoch.rawKey, this.warpTagLength);
              }
          }
          return true;
      }
      applyEpoch(transactionId, rawKey) {
          if (this.rosterTransactionId === null || transactionId > this.rosterTransactionId) {
              this.pendingEpochs.set(transactionId, rawKey);
              while (this.pendingEpochs.size > 8) {
                  this.pendingEpochs.delete(Math.min(...this.pendingEpochs.keys()));
              }
              return false;
          }
          if (this.epoch && transactionId <= this.epoch.transactionId) {
              return false;
          }
          this.installEpoch(transactionId, rawKey);
          return true;
      }
      installEpoch(transactionId, rawKey) {
          this.epoch = { transactionId, rawKey };
          this.info.encryptionKey = rawKey;
          const keying = derivePerJidSrtpKey(rawKey, this.selfParticipantId);
          if (this.srtpSession) {
              this.srtpSession.rekey(keying);
              this.appDataSrtpSession.rekey(keying);
              this.audioRtcpSession.rekey(keying);
              this.videoSrtpSession?.rekey(keying);
              this.videoRtcpSession?.rekey(keying);
          }
          else {
              this.srtpSession = new SrtpContext(keying, this.warpTagLength);
              this.appDataSrtpSession = new SrtpContext(keying, this.warpTagLength);
              this.audioRtcpSession = new SrtcpSendContext(keying);
              this.openAppDataStream(this.selfParticipantId);
              this.startRtcpSenderReports();
          }
          if (this.videoRtpStream && !this.videoSrtpSession) {
              this.videoSrtpSession = new SrtpContext(keying, this.warpTagLength);
              this.videoRtcpSession = new SrtcpSendContext(keying);
          }
          for (const receiver of this.receivers.values()) {
              receiver.install(rawKey, this.warpTagLength);
          }
      }
      async distributeEpoch(update) {
          const rawKey = generateCallKey();
          const targets = [...this.receivers.values()].map((receiver) => receiver.deviceJid);
          if (targets.length > 0) {
              try {
                  await this.deps.sessionResolver.ensureSessionsBatch(targets);
              }
              catch (err) {
                  this.logger.warn('group rekey session setup failed', { message: toError(err).message });
              }
              for (const result of await Promise.allSettled(targets.map(async (jid) => {
                  const { type, ciphertext } = await this.deps.signalProtocol.encryptMessage(parseSignalAddressFromJid(jid), await encodeWAMessage({ call: { callKey: rawKey } }));
                  await this.deps.lowLevelCoordinator.sendNode(buildGroupEncRekeyStanza({
                      callId: this.info.callId,
                      to: jid,
                      creator: this.info.callCreator,
                      transactionId: update.transactionId,
                      encType: type,
                      ciphertext
                  }));
              }))) {
                  if (result.status === 'rejected') {
                      this.logger.warn('group rekey delivery failed', { message: toError(result.reason).message });
                  }
              }
          }
          this.applyEpoch(update.transactionId, rawKey);
      }
      async processGroupSnapshot(update) {
          if (this.info.isEnded || !this.applyGroupUpdate(update)) {
              return;
          }
          if (update.relay) {
              this.applyGroupRelay(update.relay);
          }
          this.info.groupState = {
              transactionId: update.transactionId,
              media: update.media,
              groupJid: update.groupJid,
              joinable: update.joinable,
              connectedLimit: update.connectedLimit,
              participants: update.participants.map((participant) => ({
                  jid: participant.jid,
                  pn: participant.pn,
                  state: participant.state,
                  type: participant.type,
                  isSelf: stripDevice(participant.jid) === stripDevice(this.selfParticipantId),
                  devices: participant.devices.map((device) => ({ jid: device.jid, pid: device.pid, platform: device.platform }))
              }))
          };
          this.advanceJoinState();
          this.delegate.emitGroupState?.(this.info, this.info.groupState);
          this.delegate.emitState(this.info);
          if (update.rekeyRequested) {
              await this.distributeEpoch(update);
          }
          else if (!this.epoch && this.info.linkToken && this.receivers.size === 0 && this.groupEndpoints.length > 0) {
              this.applyEpoch(update.transactionId, generateCallKey());
          }
          this.refreshRelayAllocation(!!update.relay);
          await this.maybeStartMedia();
      }
      advanceJoinState() {
          const state = this.info.stateData.state;
          try {
              if (state === CallState.WaitingRoom) {
                  this.stopWaitingHeartbeat();
                  this.info.applyTransition({ type: 'group_joined' });
              }
              else if (state === CallState.Ringing && this.receivers.size > 0) {
                  this.info.applyTransition({ type: 'remote_accepted' });
              }
          }
          catch { }
      }
      applyGroupRelay(relay) {
          if (relay.selfPid !== undefined) {
              this.selfPid = relay.selfPid;
          }
          if (relay.warpMiTagLength) {
              this.warpTagLength = relay.warpMiTagLength;
          }
          const { relays } = parseRelayFromAck({ content: [relay.node] });
          if (relays.length > 0) {
              this.groupEndpoints = relays;
          }
      }
      currentPids() {
          return [...new Set([...this.receivers.values()].map((receiver) => receiver.pid))].sort((a, b) => a - b);
      }
      buildGroupAllocate(relayInfo, candidate, transactionId) {
          return buildGroupAllocateForRelay(relayInfo.rawToken, {
              streamSsrcs: deriveWasmRelayStreamSsrcs(this.info.callId, this.selfParticipantId),
              appDataSsrc: generateSecureSsrc(this.info.callId, this.selfParticipantId, 6),
              hbhFecSsrcs: [generateSecureSsrc(this.info.callId, this.selfParticipantId, 7), generateSecureSsrc(this.info.callId, this.selfParticipantId, 8)],
              pids: this.currentPids()
          }, TEXT_ENCODER.encode(relayInfo.key), candidate.ip, candidate.port, transactionId, { relayedAddress: candidate.form });
      }
      refreshRelayAllocation(credentialsChanged = false) {
          if (!this.relayConfigured || this.groupEndpoints.length === 0) {
              return;
          }
          const pids = this.currentPids().join(',');
          if (pids === this.subscribedPids && !credentialsChanged) {
              return;
          }
          this.subscribedPids = pids;
          this.connectRelays(this.groupEndpoints).catch(() => { });
      }
      async maybeStartMedia() {
          const state = this.info.stateData.state;
          if (this.relayConfigured || !this.epoch || this.groupEndpoints.length === 0) {
              return;
          }
          if (state !== CallState.Connecting && state !== CallState.Active) {
              return;
          }
          this.subscribedPids = this.currentPids().join(',');
          await this.connectRelays(this.groupEndpoints);
      }
      async connectRelays(endpoints) {
          const relays = this.selectRelayEndpoints(endpoints).map((ep) => ({
              ip: ep.ip,
              port: ep.port || 3478,
              token: ep.token,
              authToken: ep.authToken,
              rawAuthToken: ep.rawAuthToken,
              rawToken: ep.rawToken,
              key: ep.key,
              relayId: ep.relayId,
              name: ep.relayName || `${ep.ip}:${ep.port || 3478}`,
              authTokenId: ep.authTokenId,
              isFna: ep.isFna
          }));
          if (relays.length === 0) {
              this.logger.error('no usable group relay endpoints', { callId: this.info.callId });
              return;
          }
          this.sctpRelay.setParticipantIds(this.selfPid, 0);
          this.sctpRelay.setSsrc(this.selfSsrc);
          this.sctpRelay.setStreamSsrcs(deriveWasmRelayStreamSsrcs(this.info.callId, this.selfParticipantId));
          this.sctpRelay.setSubscriptionSsrc(0);
          if (this.relayConfigured) {
              this.sctpRelay.refreshRelays(relays);
              return;
          }
          this.relayConfigured = true;
          try {
              await this.sctpRelay.configureRelays(relays);
          }
          catch (err) {
              this.logger.error('group relay error', { callId: this.info.callId, message: toError(err).message });
          }
      }
      onRelayConnected() {
          if (this.info.stateData.state === CallState.Connecting) {
              try {
                  this.info.applyTransition({ type: 'media_connected' });
                  this.delegate.emitState(this.info);
              }
              catch { }
          }
          if (!this.mediaFlowStarted && this.epoch && this.info.stateData.state === CallState.Active) {
              this.startMediaFlow();
          }
      }
      startMediaFlow() {
          super.startMediaFlow();
          this.startMixer();
      }
      startMixer() {
          if (this.mixTimer) {
              return;
          }
          this.mixTimer = setInterval(() => {
              if (this.receivers.size < 2) {
                  return;
              }
              for (let i = 0; i < 2; i++) {
                  const chunk = this.mixer.mixChunk();
                  if (!chunk) {
                      return;
                  }
                  const frame = this.mixer.pushChunk(chunk);
                  if (frame) {
                      this.onDecodedAudio(frame);
                  }
              }
          }, 10);
          this.mixTimer.unref?.();
      }
      onRelayData(data) {
          this.relayPacketCount++;
          const packet = unwrapGroupForwarding(data);
          if (!packet) {
              return;
          }
          if (isStunPacket(packet)) {
              this.stunResponseCount++;
              return;
          }
          if (!isRtpPacket(packet) || packet.length < 12) {
              return;
          }
          const payloadType = packet[1] & 0x7f;
          if (payloadType >= 72 && payloadType <= 76) {
              return;
          }
          const ssrc = readUInt32BE(packet, 8);
          if (ssrc === this.selfSsrc) {
              this.selfEchoCount++;
              return;
          }
          const audioReceiver = this.audioBySsrc.get(ssrc);
          if (audioReceiver) {
              this.onGroupAudio(audioReceiver, packet, payloadType);
              return;
          }
          const videoReceiver = this.videoBySsrc.get(ssrc);
          if (videoReceiver) {
              this.onGroupVideo(videoReceiver, packet);
              return;
          }
          const appDataReceiver = this.appDataBySsrc.get(ssrc);
          if (appDataReceiver) {
              this.onGroupAppData(appDataReceiver, packet, payloadType, ssrc);
          }
      }
      onGroupAudio(receiver, data, payloadType) {
          if (payloadType !== 120 || !receiver.audioCtx || !receiver.codec) {
              return;
          }
          try {
              const packet = receiver.audioCtx.unprotect(data);
              this.audioRecvCount++;
              if (packet.payload.length === 0) {
                  return;
              }
              receiver.codec.decodeSequenced(packet.header.sequenceNumber, packet.payload, (pcm) => this.onParticipantAudio(receiver, pcm));
          }
          catch {
              this.srtpErrorCount++;
          }
      }
      onParticipantAudio(receiver, pcm) {
          this.delegate.emitParticipantAudio?.(this.info, receiver.participantId, pcm);
          if (this.receivers.size > 1) {
              this.mixer.add(receiver.participantId, pcm);
              return;
          }
          this.onDecodedAudio(pcm);
      }
      onGroupVideo(receiver, data) {
          if (!receiver.videoCtx) {
              return;
          }
          try {
              const packet = receiver.videoCtx.unprotect(data);
              const [accessUnit, complete] = receiver.assembler.push(packet.header.sequenceNumber, packet.header.marker, packet.payload);
              if (complete && accessUnit) {
                  this.delegate.emitInboundVideo?.(this.info, accessUnit, receiver.participantId);
              }
          }
          catch {
              this.srtpErrorCount++;
          }
      }
      onGroupAppData(receiver, data, payloadType, ssrc) {
          const stream = this.appDataStream;
          if (!stream || !receiver.appDataCtx) {
              return;
          }
          try {
              const packet = receiver.appDataCtx.unprotect(data);
              stream.observeInboundPayloadType(payloadType);
              for (const reaction of stream.receive(packet.payload, ssrc)) {
                  this.delegate.emitCallReaction?.(this.info, { ...reaction, participantJid: receiver.deviceJid });
              }
          }
          catch { }
      }
      async enableVideoMidCall() {
          if (this.videoRtpStream && this.videoSrtpSession) {
              return;
          }
          this.videoRtpStream = new VideoRtpStream(this.videoSsrc, videoRtpDurationSamples(this.videoEngine.frameDurationMs));
          this.videoAssembler = new H264AccessUnitAssembler();
          if (this.epoch) {
              const keying = derivePerJidSrtpKey(this.epoch.rawKey, this.selfParticipantId);
              this.videoSrtpSession = new SrtpContext(keying, this.warpTagLength);
              this.videoRtcpSession = new SrtcpSendContext(keying);
          }
          if (!this.videoEngine.hasSource()) {
              try {
                  await this.videoEngine.loadBlankSource();
              }
              catch (err) {
                  this.logger.error('blank video fallback unavailable', { callId: this.info.callId, message: toError(err).message });
              }
          }
          if (this.sctpRelay.hasConnection()) {
              this.videoEngine.start();
          }
      }
      cleanup() {
          this.stopWaitingHeartbeat();
          if (this.mixTimer) {
              clearInterval(this.mixTimer);
              this.mixTimer = null;
          }
          for (const receiver of this.receivers.values()) {
              receiver.close();
          }
          this.receivers.clear();
          this.audioBySsrc.clear();
          this.videoBySsrc.clear();
          this.appDataBySsrc.clear();
          this.pendingEpochs.clear();
          this.mixer.reset();
          this.relayConfigured = false;
          super.cleanup();
          this.acceptedByJid = this.info.peerJid;
      }
  }
  return { WaCallMediaSession, resolveUserLid, listUserDevices, stripDevice, GroupAudioMixer, WaGroupCallSession };
})();

/* ═══ call-state.js ═════════════════════════════════════════════════ */
const __call_state = (() => {
  const { CallDirection, CallMediaType, CallState } = __types;
  class CallInfo {
      callId;
      peerJid;
      callCreator;
      direction;
      mediaType;
      stateData;
      createdAt;
      groupJid;
      isOffline;
      callerPn;
      encryptionKey;
      relayData;
      electedRelayIdx;
      raisedHands = new Set();
      peerScreenShare = null;
      isGroup = false;
      groupState = null;
      waitingRoom = null;
      linkToken = null;
      linkUrl = null;
      constructor(init) {
          this.callId = init.callId;
          this.peerJid = init.peerJid;
          this.callCreator = init.callCreator;
          this.direction = init.direction;
          this.mediaType = init.mediaType;
          this.stateData = init.stateData;
          this.createdAt = init.createdAt ?? new Date();
          this.groupJid = init.groupJid;
          this.isOffline = init.isOffline ?? false;
          this.callerPn = init.callerPn;
          this.encryptionKey = init.encryptionKey;
          this.relayData = init.relayData;
          this.electedRelayIdx = init.electedRelayIdx;
      }
      static newOutgoing(callId, peerJid, ourJid, mediaType) {
          return new CallInfo({
              callId,
              peerJid,
              callCreator: ourJid,
              direction: CallDirection.Outgoing,
              mediaType,
              stateData: {
                  state: CallState.Initiating,
                  audioMuted: false,
                  videoOff: mediaType !== CallMediaType.Video
              }
          });
      }
      static newIncoming(callId, peerJid, callCreator, callerPn, mediaType) {
          return new CallInfo({
              callId,
              peerJid,
              callCreator,
              direction: CallDirection.Incoming,
              mediaType,
              callerPn,
              stateData: {
                  state: CallState.IncomingRinging,
                  audioMuted: false,
                  videoOff: mediaType !== CallMediaType.Video
              }
          });
      }
      static newGroupOutgoing(callId, callJid, ourJid, mediaType, groupJid) {
          const info = CallInfo.newOutgoing(callId, callJid, ourJid, mediaType);
          info.isGroup = true;
          info.groupJid = groupJid;
          return info;
      }
      static newGroupIncoming(callId, callJid, callCreator, callerPn, mediaType, groupJid) {
          const info = CallInfo.newIncoming(callId, callJid, callCreator, callerPn, mediaType);
          info.isGroup = true;
          info.groupJid = groupJid;
          return info;
      }
      static newLinkJoin(callId, callJid, ourJid, mediaType, linkToken) {
          const info = CallInfo.newOutgoing(callId, callJid, ourJid, mediaType);
          info.isGroup = true;
          info.linkToken = linkToken;
          return info;
      }
      get isWaiting() {
          return this.stateData.state === CallState.WaitingRoom;
      }
      get isInitiator() {
          return this.direction === CallDirection.Outgoing;
      }
      get isActive() {
          return this.stateData.state === CallState.Active;
      }
      get isRinging() {
          return (this.stateData.state === CallState.Ringing ||
              this.stateData.state === CallState.IncomingRinging);
      }
      get isEnded() {
          return this.stateData.state === CallState.Ended;
      }
      get canAccept() {
          return this.stateData.state === CallState.IncomingRinging && !this.stateData.acceptBlocked;
      }
      get isAcceptBlocked() {
          return this.stateData.acceptBlocked === true;
      }
      get canReject() {
          return (this.stateData.state === CallState.IncomingRinging ||
              this.stateData.state === CallState.Ringing);
      }
      applyTransition(transition) {
          const s = this.stateData;
          switch (transition.type) {
              case 'offer_sent':
                  if (s.state !== CallState.Initiating) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Ringing;
                  break;
              case 'offer_received':
                  if (s.state !== CallState.Initiating) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.IncomingRinging;
                  s.silenced = transition.silenced;
                  break;
              case 'remote_accepted':
                  if (s.state !== CallState.Ringing) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Connecting;
                  s.acceptedAt = new Date();
                  break;
              case 'local_accepted':
                  if (s.state !== CallState.IncomingRinging) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Connecting;
                  s.acceptedAt = new Date();
                  break;
              case 'group_joined':
                  if (s.state === CallState.Connecting) {
                      break;
                  }
                  if (![CallState.Initiating, CallState.Ringing, CallState.IncomingRinging, CallState.WaitingRoom].includes(s.state)) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Connecting;
                  s.acceptedAt = new Date();
                  break;
              case 'waiting_room_entered':
                  if (s.state === CallState.WaitingRoom) {
                      break;
                  }
                  if (s.state !== CallState.Initiating && s.state !== CallState.Connecting) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.WaitingRoom;
                  break;
              case 'remote_rejected':
                  if (s.state !== CallState.Ringing) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Ended;
                  s.endedAt = new Date();
                  s.endReason = transition.reason;
                  break;
              case 'local_rejected':
                  if (s.state !== CallState.IncomingRinging) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Ended;
                  s.endedAt = new Date();
                  s.endReason = transition.reason;
                  break;
              case 'media_connected':
                  if (s.state !== CallState.Connecting) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Active;
                  s.connectedAt = new Date();
                  s.videoOff = this.mediaType !== CallMediaType.Video;
                  break;
              case 'terminated':
                  if (s.state === CallState.Ended) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  if (s.state === CallState.Active && s.connectedAt) {
                      s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000);
                  }
                  else if (s.state === CallState.OnHold && s.connectedAt) {
                      s.durationSecs = Math.floor((Date.now() - s.connectedAt.getTime()) / 1000);
                  }
                  s.state = CallState.Ended;
                  s.endedAt = new Date();
                  s.endReason = transition.reason;
                  break;
              case 'hold':
                  if (s.state !== CallState.Active) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.OnHold;
                  break;
              case 'resume':
                  if (s.state !== CallState.OnHold) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.state = CallState.Active;
                  break;
              case 'audio_mute_changed':
                  if (s.state !== CallState.Active) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.audioMuted = transition.muted;
                  break;
              case 'hand_raise_changed':
                  if (s.state !== CallState.Active) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.handRaised = transition.raised;
                  break;
              case 'screen_share_changed':
                  if (s.state !== CallState.Active) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.screenSharing = transition.sharing;
                  break;
              case 'video_state_changed':
                  if (s.state !== CallState.Active) {
                      throw new InvalidTransition(s.state, transition.type);
                  }
                  s.videoOff = transition.off;
                  break;
              default:
                  throw new InvalidTransition(s.state, transition.type);
          }
      }
  }
  class InvalidTransition extends Error {
      currentState;
      attempted;
      constructor(currentState, attempted) {
          super(`invalid transition '${attempted}' in state '${currentState}'`);
          this.name = 'InvalidTransition';
          this.currentState = currentState;
          this.attempted = attempted;
      }
  }
  return { CallInfo, InvalidTransition };
})();

/* ═══ WaCallManager.js ══════════════════════════════════════════════ */
const __WaCallManager = (() => {
  const { WaAudioEngine } = __WaAudioEngine;
  const { listUserDevices, resolveUserLid, stripDevice, WaCallMediaSession, WaGroupCallSession } = __WaCallMediaSession;
  const { CallInfo } = __call_state;
  const { createNoopLogger } = __core;
  const { generateCallKey } = __encryption;
  const { parseRelayFromAck } = __relay_ack;
  const { isLidJid } = __shim_protocol;
  const { buildCallLinkCreateStanza, buildCallLinkJoinStanza, buildCallLinkQueryStanza, buildCallLinkUrl, buildInitialGroupOfferStanza, buildOfferStanza, callJidFor, decryptCallKey, extractNodeInfo, generateCallId, generateCallStanzaId, GroupCapability, parseCallLink, parseCallLinkCreateAck, parseCallLinkJoinAck, parseCallLinkQueryAck, parseGroupInviteSnapshot } = __signaling;
  const { findNodeChild, hasNodeChild } = __transport;
  const { CallDirection, CallMediaType, CallState, EndCallReason } = __types;
  const { resolvePositive, toError } = __util;
  const DEFAULT_MAX_CONCURRENT_CALLS = 1;
  class WaCallManager extends EventEmitter {
      deps;
      stores;
      logger;
      maxConcurrentCalls;
      calls = new Map();
      pendingGroupEvents = new Map();
      linkRequests = new Map();
      linkJoinsInFlight = 0;
      constructor(config) {
          super();
          this.deps = config.deps;
          this.stores = config.stores;
          this.logger = config.logger ?? createNoopLogger();
          this.maxConcurrentCalls = resolvePositive(config.maxConcurrentCalls, DEFAULT_MAX_CONCURRENT_CALLS, 'maxConcurrentCalls');
      }
      async startCall(options) {
          if (this.activeCallCount >= this.maxConcurrentCalls) {
              throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`);
          }
          const callId = generateCallId();
          const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio;
          const creds = this.deps.authClient.getCurrentCredentials();
          const callCreator = creds?.meLid || creds?.meJid || '';
          const peerJid = await this.resolvePeerLid(options.peerJid);
          const info = CallInfo.newOutgoing(callId, peerJid, callCreator, mediaType);
          const callKey = generateCallKey();
          info.encryptionKey = callKey;
          const session = this.createSession(info, { videoConfig: options.videoConfig });
          try {
              session.resetOutgoingFlags();
              const selfLid = creds?.meLid || creds?.meJid || '';
              await session.initMedia(selfLid, peerJid);
              const offerStanza = await buildOfferStanza(this.deps, this.stores, callId, callKey, peerJid, options.isVideo ?? false, this.logger.child({ component: 'signaling' }));
              await this.deps.lowLevelCoordinator.sendNode(offerStanza);
          }
          catch (err) {
              session.cleanup();
              this.calls.delete(callId);
              throw err;
          }
          info.applyTransition({ type: 'offer_sent' });
          this.emitState(info);
          return callId;
      }
      assertCapacity() {
          if (this.activeCallCount >= this.maxConcurrentCalls) {
              throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`);
          }
      }
      async startGroupCall(options) {
          this.assertCapacity();
          const callId = generateCallId();
          const mediaType = options.isVideo ? CallMediaType.Video : CallMediaType.Audio;
          const creds = this.deps.authClient.getCurrentCredentials();
          const selfLid = creds?.meLid || creds?.meJid || '';
          const selfUser = stripDevice(selfLid);
          const targets = [...new Set((await Promise.all([...new Set(options.targets ?? [])].map((target) => resolveUserLid(this.deps, target)))).map(stripDevice))].filter((lid) => lid !== selfUser);
          if (targets.length < 2) {
              throw new Error('a group call needs at least two participants besides yourself');
          }
          const participants = [{ jid: selfUser, devices: [{ jid: selfLid, capabilityVersion: 1, capability: GroupCapability.offer }] }];
          for (const lid of targets) {
              const devices = await listUserDevices(this.deps, lid);
              if (devices.length === 0) {
                  throw new Error(`no reachable devices for ${lid}`);
              }
              participants.push({ jid: lid, devices: devices.map((jid) => ({ jid })) });
          }
          const info = CallInfo.newGroupOutgoing(callId, callJidFor(callId), selfLid, mediaType, options.groupJid);
          const session = this.createSession(info, { videoConfig: options.videoConfig });
          try {
              await session.initMedia(selfLid);
              const stanza = buildInitialGroupOfferStanza({ callId, creator: selfLid, groupJid: options.groupJid, participants, video: options.isVideo ?? false });
              stanza.attrs.id = generateCallStanzaId();
              session.offerStanzaId = stanza.attrs.id;
              await this.deps.lowLevelCoordinator.sendNode(stanza);
          }
          catch (err) {
              session.cleanup();
              this.calls.delete(callId);
              throw err;
          }
          info.applyTransition({ type: 'offer_sent' });
          this.emitState(info);
          return callId;
      }
      async createCallLink(options = {}) {
          const media = options.isVideo ? 'video' : 'audio';
          const response = await this.deps.lowLevelCoordinator.query(buildCallLinkCreateStanza(media, generateCallStanzaId()), 30000);
          const link = parseCallLinkCreateAck(response);
          return { token: link.token, media: link.media, isVideo: link.media === 'video', url: buildCallLinkUrl(link.token, link.media) };
      }
      async queryCallLink(tokenOrUrl, options = {}) {
          const { token, media: linkMedia } = parseCallLink(tokenOrUrl);
          const media = options.isVideo === undefined ? linkMedia ?? 'audio' : options.isVideo ? 'video' : 'audio';
          const response = await this.deps.lowLevelCoordinator.query(buildCallLinkQueryStanza(token, media, generateCallStanzaId()), 30000);
          const preview = parseCallLinkQueryAck(response);
          return { ...preview, isVideo: preview.media === 'video', url: buildCallLinkUrl(preview.token, preview.media) };
      }
      async joinCallLink(tokenOrUrl, options = {}) {
          this.assertCapacity();
          const { token, media: linkMedia } = parseCallLink(tokenOrUrl);
          const media = options.isVideo === undefined ? linkMedia ?? 'audio' : options.isVideo ? 'video' : 'audio';
          const creds = this.deps.authClient.getCurrentCredentials();
          const selfLid = creds?.meLid || creds?.meJid || '';
          this.linkJoinsInFlight++;
          try {
              const response = await this.deps.lowLevelCoordinator.query(buildCallLinkJoinStanza(token, media, generateCallStanzaId()), 30000);
              const result = parseCallLinkJoinAck(response);
              const info = CallInfo.newLinkJoin(result.callId, callJidFor(result.callId), selfLid, media === 'video' ? CallMediaType.Video : CallMediaType.Audio, token);
              info.callCreator = result.callCreator;
              info.linkUrl = buildCallLinkUrl(token, media);
              const session = this.createSession(info, { videoConfig: options.videoConfig });
              try {
                  await session.initMedia(selfLid);
                  await session.beginLinkJoin(result);
                  await this.flushGroupEvents(result.callId);
              }
              catch (err) {
                  session.cleanup();
                  this.calls.delete(result.callId);
                  throw err;
              }
              return result.callId;
          }
          finally {
              this.linkJoinsInFlight--;
              if (this.linkJoinsInFlight === 0) {
                  this.pendingGroupEvents.clear();
              }
          }
      }
      async getCallLink(callId) {
          const info = this.getCall(callId);
          if (!info) {
              throw new Error(`Unknown call ${callId}`);
          }
          if (info.linkUrl) {
              return info.linkUrl;
          }
          if (!this.linkRequests.has(callId)) {
              this.linkRequests.set(callId, this.createCallLink({ isVideo: info.mediaType === CallMediaType.Video })
                  .then((link) => {
                  info.linkUrl = link.url;
                  return link.url;
              })
                  .finally(() => this.linkRequests.delete(callId)));
          }
          return this.linkRequests.get(callId);
      }
      getGroupSessionOrThrow(callId) {
          const session = this.getSessionOrThrow(callId);
          if (!(session instanceof WaGroupCallSession)) {
              throw new Error(`Call ${callId} is not a group call`);
          }
          return session;
      }
      async addGroupParticipant(callId, target) {
          await this.getGroupSessionOrThrow(callId).addParticipant(target);
      }
      async ringGroupParticipant(callId, target) {
          await this.getGroupSessionOrThrow(callId).ringParticipant(target);
      }
      async setApprovalRequired(callId, enabled) {
          await this.getGroupSessionOrThrow(callId).setApprovalRequired(enabled);
      }
      async admitParticipant(callId, jid) {
          await this.getGroupSessionOrThrow(callId).admitParticipant(jid);
      }
      async denyParticipant(callId, jid) {
          await this.getGroupSessionOrThrow(callId).denyParticipant(jid);
      }
      getParticipants(callId) {
          return this.getGroupSessionOrThrow(callId).getParticipants();
      }
      bufferGroupEvent(node, method) {
          const callId = extractNodeInfo(node)?.callId;
          if (!callId || this.linkJoinsInFlight === 0) {
              return;
          }
          const queue = this.pendingGroupEvents.get(callId) ?? [];
          queue.push({ node, method });
          this.pendingGroupEvents.set(callId, queue);
      }
      async flushGroupEvents(callId) {
          const queue = this.pendingGroupEvents.get(callId) ?? [];
          this.pendingGroupEvents.delete(callId);
          const session = this.calls.get(callId);
          for (const { node, method } of queue) {
              await session?.[method]?.(node);
          }
      }
      async handleGroupUpdate(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session) {
              this.bufferGroupEvent(node, 'handleGroupUpdate');
              return;
          }
          await session.handleGroupUpdate?.(node);
      }
      async handleGroupEncRekey(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session) {
              this.bufferGroupEvent(node, 'handleGroupEncRekey');
              return;
          }
          await session.handleGroupEncRekey?.(node);
      }
      handleWaitingRoomUpdate(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session) {
              this.bufferGroupEvent(node, 'handleWaitingRoomUpdate');
              return;
          }
          session.handleWaitingRoomUpdate?.(node);
      }
      async handleGroupOffer(nodeInfo) {
          const callId = nodeInfo.callId;
          let snapshot;
          try {
              snapshot = parseGroupInviteSnapshot(nodeInfo.innerNode);
          }
          catch (err) {
              this.logger.warn('group invite parse failed', { callId, message: toError(err).message });
              return;
          }
          const callCreator = nodeInfo.innerNode.attrs?.['call-creator'];
          const mediaType = hasNodeChild(nodeInfo.innerNode, 'video') ? CallMediaType.Video : CallMediaType.Audio;
          const info = CallInfo.newGroupIncoming(callId, callJidFor(callId), callCreator, undefined, mediaType, snapshot.groupJid);
          const atCapacity = this.activeCallCount >= this.maxConcurrentCalls;
          const session = this.createSession(info, { acceptBlocked: atCapacity });
          session.inviteSnapshot = snapshot;
          if (!atCapacity) {
              try {
                  await this.activateGroupInvite(session);
              }
              catch (err) {
                  this.logger.error('incoming group call activation failed', { callId, message: toError(err).message });
                  try {
                      info.applyTransition({ type: 'terminated', reason: EndCallReason.Failed });
                  }
                  catch { }
                  this.emit('call_ended', info);
                  this.emitState(info);
                  session.cleanup();
                  this.calls.delete(callId);
                  await this.maybeUnblockWaitingCalls();
                  return;
              }
          }
          this.emit('call_incoming', info);
          this.emitState(info);
      }
      async activateGroupInvite(session) {
          const creds = this.deps.authClient.getCurrentCredentials();
          await session.initMedia(creds?.meLid || creds?.meJid || '');
          await session.sendIncomingPreaccept();
          if (session.inviteSnapshot) {
              await session.processGroupSnapshot(session.inviteSnapshot);
          }
      }
      async acceptCall(callId) {
          const session = this.getSessionOrThrow(callId);
          if (!session.info.canAccept) {
              throw new Error(`Call ${callId} cannot be accepted in state ${session.info.stateData.state}`);
          }
          await session.acceptCall();
      }
      async rejectCall(callId, reason = EndCallReason.Declined) {
          const session = this.getSessionOrThrow(callId);
          await session.rejectCall(reason);
          this.calls.delete(callId);
          await this.maybeUnblockWaitingCalls();
      }
      async endCall(callId, reason = EndCallReason.UserEnded) {
          const session = this.calls.get(callId);
          if (!session || session.info.isEnded)
              return;
          await session.endCall(reason);
          this.calls.delete(callId);
          await this.maybeUnblockWaitingCalls();
      }
      setMute(callId, muted) {
          const session = this.calls.get(callId);
          session?.setMute(muted);
      }
      async setHandRaised(callId, raised) {
          const session = this.getSessionOrThrow(callId);
          await session.setHandRaised(raised);
      }
      async setScreenShare(callId, sharing) {
          const session = this.getSessionOrThrow(callId);
          await session.setScreenShare(sharing);
      }
      sendReaction(callId, reaction) {
          const session = this.getSessionOrThrow(callId);
          return session.sendReaction(reaction);
      }
      async loadAudio(callId, audioPath) {
          const session = this.getSessionOrThrow(callId);
          await session.loadAudio(audioPath);
      }
      async loadVideo(callId, videoPath) {
          const session = this.getSessionOrThrow(callId);
          await session.loadVideo(videoPath);
      }

      async enableVideoMidCall(callId) {
          const session = this.getSessionOrThrow(callId);
          await session.enableVideoMidCall();
      }
      async disableVideoMidCall(callId, options) {
          const session = this.getSessionOrThrow(callId);
          session.disableVideoMidCall(options);
      }

      async startVideoMidCall(callId) {
          const session = this.getSessionOrThrow(callId);
          await session.startVideoMidCall();
      }
      async stopVideoMidCall(callId, options) {
          const session = this.getSessionOrThrow(callId);
          await session.stopVideoMidCall(options);
      }
      async swapVideoSource(callId, videoPath) {
          const session = this.getSessionOrThrow(callId);
          await session.swapVideoSource(videoPath);
      }
      setExternalAudioMode(callId, enabled) {
          const session = this.getSessionOrThrow(callId);
          session.setExternalAudioMode(enabled);
      }
      feedLiveAudio(callId, data) {
          const session = this.calls.get(callId);
          return session?.feedLiveAudio(data) ?? 0;
      }
      getLiveBufferMs(callId) {
          const session = this.calls.get(callId);
          return session?.getLiveBufferMs() ?? 0;
      }
      getFeedWatermarksMs() {
          return WaAudioEngine.feedWatermarksMs();
      }
      getCall(callId) {
          return this.calls.get(callId)?.info ?? null;
      }
      getCalls() {
          const result = [];
          for (const session of this.calls.values()) {
              result.push(session.info);
          }
          return result;
      }
      async handleCallOffer(node, peerJid) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo?.callId)
              return;
          const callId = nodeInfo.callId;
          const existing = this.calls.get(callId);
          if (existing) {
              if (!existing.info.isEnded) {
                  return;
              }
              existing.cleanup();
              this.calls.delete(callId);
          }
          if (findNodeChild(nodeInfo.innerNode, 'group_info')) {
              await this.handleGroupOffer(nodeInfo);
              return;
          }
          const callCreator = nodeInfo.innerNode.attrs?.['call-creator'] || peerJid;
          const isVideo = hasNodeChild(nodeInfo.innerNode, 'video');
          const callKey = await decryptCallKey(this.deps, nodeInfo.innerNode, peerJid, this.logger.child({ component: 'signaling' }));
          const { relays, participantJids, uuid, selfPid, peerPid, hbhKey } = parseRelayFromAck(nodeInfo.innerNode);
          const mediaType = isVideo ? CallMediaType.Video : CallMediaType.Audio;
          const info = CallInfo.newIncoming(callId, peerJid, callCreator, undefined, mediaType);
          if (callKey) {
              info.encryptionKey = callKey;
          }
          if (relays.length > 0) {
              info.relayData = {
                  endpoints: relays,
                  participantJids,
                  uuid,
                  selfPid,
                  peerPid,
                  hbhKey
              };
          }
          const atCapacity = this.activeCallCount >= this.maxConcurrentCalls;
          const session = this.createSession(info, { acceptBlocked: atCapacity });
          if (!atCapacity) {
              try {
                  const creds = this.deps.authClient.getCurrentCredentials();
                  const selfLid = creds?.meLid || creds?.meJid || '';
                  await session.initMedia(selfLid, peerJid);
                  await session.sendIncomingPreaccept(peerJid);
                  await session.sendIncomingRelayLatency();
              }
              catch (err) {
                  this.logger.error('incoming call activation failed', {
                      callId,
                      message: toError(err).message
                  });
                  try {
                      info.applyTransition({ type: 'terminated', reason: EndCallReason.Failed });
                  }
                  catch { }
                  this.emit('call_ended', info);
                  this.emitState(info);
                  session.cleanup();
                  this.calls.delete(callId);
                  await this.maybeUnblockWaitingCalls();
                  return;
              }
          }
          this.emit('call_incoming', info);
          this.emitState(info);
      }
      async handleCallAccept(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallAccept(node, peerJid);
      }
      async handleCallPreaccept(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallPreaccept(node, peerJid);
      }
      async handleCallTransport(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallTransport(node);
      }
      async handleCallAck(node) {
          if (['link_create', 'link_query', 'link_join'].includes(node.attrs?.type)) {
              return;
          }
          const session = this.resolveSessionForOfferAck(node);
          if (!session)
              return;
          await session.handleCallAck(node);
      }
      async handleCallRelaylatency(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallRelaylatency(node, peerJid);
      }
      handleRelayElection(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          session.handleRelayElection(node);
      }
      async handleCallMuteV2(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallMuteV2(node, peerJid);
      }
      handleCallUserAction(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          session.handleCallUserAction(node, peerJid);
      }
      handleCallRaiseHand(node, peerJid) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          session.handleCallRaiseHand(node, peerJid);
      }
      handleCallScreenShare(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          session.handleCallScreenShare(node);
      }
      async handleCallVideo(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          await session.handleCallVideo(node);
      }
      async handleCallTerminate(node) {
          const session = this.resolveSessionFromNode(node);
          if (!session)
              return;
          if (session.handleCallTerminate(node) === false) {
              return;
          }
          this.calls.delete(session.callId);
          await this.maybeUnblockWaitingCalls();
      }
      notifyReconnecting() {
          for (const session of this.calls.values()) {
              if (session.info.isActive && !session.info.isEnded) {
                  session.delegate.emitReconnecting(session.info, { attempt: 0, max: 0 });
              }
          }
      }
      notifyReconnected() {
          for (const session of this.calls.values()) {
              if (session.info.isActive && !session.info.isEnded && !session.reconnecting) {
                  session.delegate.emitReconnected(session.info);
              }
          }
      }
      destroy() {
          for (const session of this.calls.values()) {
              session.cleanup();
          }
          this.calls.clear();
          this.removeAllListeners();
      }
      get activeCallCount() {
          let count = 0;
          for (const session of this.calls.values()) {
              if (!session.info.isEnded && !session.info.isAcceptBlocked)
                  count++;
          }
          return count;
      }
      createSession(info, options = {}) {
          const prior = this.calls.get(info.callId);
          if (prior) {
              if (!prior.info.isEnded) {
                  throw new Error(`call ${info.callId} already exists`);
              }
              prior.cleanup();
              this.calls.delete(info.callId);
          }
          const acceptBlocked = options.acceptBlocked ?? false;
          if (!acceptBlocked && this.activeCallCount >= this.maxConcurrentCalls) {
              throw new Error(`max concurrent calls reached (${this.maxConcurrentCalls})`);
          }
          if (acceptBlocked) {
              info.stateData.acceptBlocked = true;
          }
          const sessionLogger = this.logger.child({ callId: info.callId });
          const session = new (info.isGroup ? WaGroupCallSession : WaCallMediaSession)({
              deps: this.deps,
              logger: sessionLogger,
              info,
              videoConfig: options.videoConfig,
              delegate: {
                  emitState: (call) => this.emitState(call),
                  emitIncoming: (call) => this.emit('call_incoming', call),
                  emitEnded: (call) => this.emit('call_ended', call),
                  emitInboundAudio: (call, pcm) => this.emit('call_inbound_audio', call, pcm),
                  emitPeerMute: (call, muted) => this.emit('call_peer_mute', call, muted),
                  emitHandRaise: (call, participantJid, raised) => this.emit('call_hand_raise', call, participantJid, raised),
                  emitCallReaction: (call, reaction) => this.emit('call_reaction', call, reaction),
                  emitScreenShare: (call, share) => this.emit('call_screen_share', call, share),
                  emitOutboundAudioFinished: (call) => this.emit('call_outbound_audio_finished', call),
                  emitReconnecting: (call, detail) => this.emit('call_reconnecting', call, detail),
                  emitReconnected: (call) => this.emit('call_reconnected', call),

                  emitVideoState: (call, videoState) => this.emit('call_video_state', call, videoState),

                  emitInboundVideo: (call, au, participantJid) => this.emit('call_inbound_video', call, au, participantJid),
                  emitGroupState: (call, state) => this.emit('call_group_state', call, state),
                  emitWaitingRoom: (call, room) => this.emit('call_waiting_room', call, room),
                  emitParticipantAudio: (call, participantJid, pcm) => this.emit('call_participant_audio', call, participantJid, pcm)
              }
          });
          this.calls.set(info.callId, session);
          return session;
      }
      getSessionOrThrow(callId) {
          const session = this.calls.get(callId);
          if (!session) {
              throw new Error(`No call with id ${callId}`);
          }
          return session;
      }
      resolveSessionFromNode(node) {
          const nodeInfo = extractNodeInfo(node);
          if (!nodeInfo?.callId) {
              return null;
          }
          const session = this.calls.get(nodeInfo.callId);
          if (!session) {
              return null;
          }
          return session;
      }
      resolveSessionForOfferAck(node) {
          const stanzaId = node.attrs?.id;
          if (stanzaId) {
              for (const session of this.calls.values()) {
                  if (session.offerStanzaId === stanzaId) {
                      return session;
                  }
              }
          }
          const callId = node.attrs?.['call-id'];
          if (callId) {
              const session = this.calls.get(callId);
              if (session)
                  return session;
          }
          const outgoing = [];
          for (const session of this.calls.values()) {
              if (session.info.isInitiator && !session.info.isEnded) {
                  const state = session.info.stateData.state;
                  if (state === CallState.Initiating || state === CallState.Ringing) {
                      outgoing.push(session);
                  }
              }
          }
          if (outgoing.length === 1)
              return outgoing[0];

          return null;
      }
      emitState(call) {
          this.emit('call_state', call);
      }
      async resolvePeerLid(peerJid) {
          if (isLidJid(peerJid))
              return peerJid;
          try {
              const [mapped] = await this.deps.signalDeviceSync.queryLidsByPhoneJids([peerJid]);
              if (mapped?.lidJid)
                  return mapped.lidJid;
          }
          catch { }
          return peerJid;
      }
      async maybeUnblockWaitingCalls() {
          while (this.activeCallCount < this.maxConcurrentCalls) {
              const waiting = [...this.calls.values()].find((session) => session.info.direction === CallDirection.Incoming &&
                  session.info.isRinging &&
                  session.info.isAcceptBlocked);
              if (!waiting)
                  break;
              await this.activateWaitingIncoming(waiting);
          }
      }
      async activateWaitingIncoming(session) {
          session.info.stateData.acceptBlocked = false;
          const creds = this.deps.authClient.getCurrentCredentials();
          const selfLid = creds?.meLid || creds?.meJid || '';
          if (session.info.isGroup) {
              await this.activateGroupInvite(session);
              this.emitState(session.info);
              return;
          }
          await session.initMedia(selfLid, session.info.peerJid);
          await session.sendIncomingPreaccept(session.info.peerJid);
          await session.sendIncomingRelayLatency();
          this.emitState(session.info);
      }
  }
  return { WaCallManager };
})();

/* ═══ bridge.js ═════════════════════════════════════════════════════ */
const __bridge = (() => {
  const { createNoopLogger } = __core;
  const { normalizeDeviceJid } = __shim_protocol;
  const { buildCallControlAckNode } = __signaling;
  const { buildAckNode, getFirstNodeChild } = __transport;
  const { toError } = __util;
  const RECEIPT_CALL_TAGS = new Set([
      'offer',
      'accept',
      'preaccept',
      'terminate',
      'transport',
      'relaylatency',
      'mute_v2'
  ]);
  async function routeCallStanza(manager, deps, node, logger) {
      const log = logger ?? createNoopLogger();
      const inner = getFirstNodeChild(node);
      if (!inner)
          return null;
      const tag = inner.tag;
      const peerJid = node.attrs.from;
      await deps.lowLevelCoordinator.sendNode(buildCallControlAckNode(node, tag) ?? buildAckNode({
          kind: 'custom',
          ackClass: 'call',
          to: peerJid,
          id: node.attrs.id,
          type: tag
      }));
      switch (tag) {
          case 'group_update':
              await manager.handleGroupUpdate(node);
              return tag;
          case 'enc_rekey':
              await manager.handleGroupEncRekey(node);
              return tag;
          case 'waiting_room_update':
              manager.handleWaitingRoomUpdate(node);
              return tag;
          default:
              break;
      }
      let normalizedPeerJid;
      try {
          normalizedPeerJid = normalizeDeviceJid(peerJid);
      }
      catch (err) {
          log.warn('failed to normalize call peer jid', {
              from: peerJid,
              message: toError(err).message
          });
          return tag;
      }
      switch (tag) {
          case 'offer':
              await manager.handleCallOffer(node, normalizedPeerJid);
              break;
          case 'preaccept':
              await manager.handleCallPreaccept(node, normalizedPeerJid);
              break;
          case 'accept':
              await manager.handleCallAccept(node, normalizedPeerJid);
              break;
          case 'transport':
              await manager.handleCallTransport(node, normalizedPeerJid);
              break;
          case 'terminate':
              await manager.handleCallTerminate(node);
              break;
          case 'relaylatency':
              await manager.handleCallRelaylatency(node, normalizedPeerJid);
              break;
          case 'mute_v2':
              await manager.handleCallMuteV2(node, normalizedPeerJid);
              break;
          case 'user_action':
              manager.handleCallUserAction(node, normalizedPeerJid);
              break;
          case 'raise_hand':
              manager.handleCallRaiseHand(node, normalizedPeerJid);
              break;
          case 'screen_share':
          case 'screen':
              manager.handleCallScreenShare(node);
              break;
          case 'video':
              await manager.handleCallVideo(node, normalizedPeerJid);
              break;
          case 'relay_election':
              manager.handleRelayElection(node);
              break;
          case 'reject':
              break;
          default:
              break;
      }
      return tag;
  }
  async function routeCallAck(manager, node) {
      await manager.handleCallAck(node);
  }
  async function routeCallReceipt(deps, node) {
      const inner = getFirstNodeChild(node);
      if (!inner)
          return false;
      if (!RECEIPT_CALL_TAGS.has(inner.tag))
          return false;
      const peerJid = node.attrs.from;
      await deps.lowLevelCoordinator.sendNode(buildAckNode({
          kind: 'custom',
          ackClass: 'receipt',
          to: peerJid,
          id: node.attrs.id,
          type: node.attrs.type || 'retry'
      }));
      return true;
  }
  return { routeCallStanza, routeCallAck, routeCallReceipt };
})();

/* ═══ WaVoipCoordinator.js ══════════════════════════════════════════ */
const __WaVoipCoordinator = (() => {
  const { WaCallManager } = __WaCallManager;
  const { routeCallAck, routeCallReceipt, routeCallStanza } = __bridge;
  const { WA_MESSAGE_TAGS } = __shim_protocol;
  class WaVoipCoordinator {
      manager;
      deps;
      logger;
      unregisterHandlers = [];
      ctx;
      constructor(ctx, options = {}) {
          this.ctx = ctx;
          this.deps = ctx.deps;
          this.logger = ctx.logger.child({ scope: 'voip' }, { level: options.logLevel });
          this.manager = new WaCallManager({
              deps: ctx.deps,
              stores: ctx.stores,
              logger: this.logger,
              maxConcurrentCalls: options.maxConcurrentCalls
          });
          this.registerIncomingHandlers(ctx);
          this.wireClientEvents(ctx);
      }
      async startCall(options) {
          return this.manager.startCall(options);
      }
      async startGroupCall(options) {
          return this.manager.startGroupCall(options);
      }
      async createCallLink(options) {
          return this.manager.createCallLink(options);
      }
      async queryCallLink(tokenOrUrl, options) {
          return this.manager.queryCallLink(tokenOrUrl, options);
      }
      async joinCallLink(tokenOrUrl, options) {
          return this.manager.joinCallLink(tokenOrUrl, options);
      }
      async addGroupParticipant(callId, target) {
          return this.manager.addGroupParticipant(callId, target);
      }
      async ringGroupParticipant(callId, target) {
          return this.manager.ringGroupParticipant(callId, target);
      }
      async setApprovalRequired(callId, enabled) {
          return this.manager.setApprovalRequired(callId, enabled);
      }
      async admitParticipant(callId, jid) {
          return this.manager.admitParticipant(callId, jid);
      }
      async denyParticipant(callId, jid) {
          return this.manager.denyParticipant(callId, jid);
      }
      async getCallLink(callId) {
          return this.manager.getCallLink(callId);
      }
      getParticipants(callId) {
          return this.manager.getParticipants(callId);
      }
      async acceptCall(callId) {
          return this.manager.acceptCall(callId);
      }
      async rejectCall(callId, reason) {
          return this.manager.rejectCall(callId, reason);
      }
      async endCall(callId, reason) {
          return this.manager.endCall(callId, reason);
      }
      async loadAudio(callId, audioPath) {
          return this.manager.loadAudio(callId, audioPath);
      }
      async loadVideo(callId, videoPath) {
          return this.manager.loadVideo(callId, videoPath);
      }
      async enableVideoMidCall(callId) {
          return this.manager.enableVideoMidCall(callId);
      }
      async disableVideoMidCall(callId, options) {
          return this.manager.disableVideoMidCall(callId, options);
      }
      async startVideoMidCall(callId) {
          return this.manager.startVideoMidCall(callId);
      }
      async stopVideoMidCall(callId, options) {
          return this.manager.stopVideoMidCall(callId, options);
      }
      async swapVideoSource(callId, videoPath) {
          return this.manager.swapVideoSource(callId, videoPath);
      }
      setMute(callId, muted) {
          this.manager.setMute(callId, muted);
      }
      async setHandRaised(callId, raised) {
          return this.manager.setHandRaised(callId, raised);
      }
      async setScreenShare(callId, sharing) {
          return this.manager.setScreenShare(callId, sharing);
      }
      sendReaction(callId, reaction) {
          return this.manager.sendReaction(callId, reaction);
      }
      setExternalAudioMode(callId, enabled) {
          this.manager.setExternalAudioMode(callId, enabled);
      }
      feedLiveAudio(callId, data) {
          return this.manager.feedLiveAudio(callId, data);
      }
      getLiveBufferMs(callId) {
          return this.manager.getLiveBufferMs(callId);
      }
      getFeedWatermarksMs() {
          return this.manager.getFeedWatermarksMs();
      }
      getCall(callId) {
          return this.manager.getCall(callId);
      }
      getCalls() {
          return this.manager.getCalls();
      }
      on(event, listener) {
          this.manager.on(event, listener);
          return this;
      }
      off(event, listener) {
          this.manager.off(event, listener);
          return this;
      }
      once(event, listener) {
          this.manager.once(event, listener);
          return this;
      }
      dispose() {
          this.suspendIncoming();
          this.manager.destroy();
      }
      suspendIncoming() {
          for (const unregister of this.unregisterHandlers.splice(0)) {
              unregister();
          }
      }
      resumeIncoming() {
          this.registerIncomingHandlers(this.ctx);
      }
      notifyReconnecting() {
          this.manager.notifyReconnecting();
      }
      notifyReconnected() {
          this.manager.notifyReconnected();
      }
      registerIncomingHandlers(ctx) {
          this.unregisterHandlers.push(ctx.registerIncomingHandler({
              tag: 'call',
              prepend: true,
              handler: async (node) => {
                  const tag = await routeCallStanza(this.manager, this.deps, node, this.logger);
                  return tag !== null;
              }
          }), ctx.registerIncomingHandler({
              tag: WA_MESSAGE_TAGS.ACK,
              prepend: true,
              handler: async (node) => {
                  if (node.attrs.class !== 'call') {
                      return false;
                  }
                  await routeCallAck(this.manager, node);
                  return true;
              }
          }), ctx.registerIncomingHandler({
              tag: WA_MESSAGE_TAGS.RECEIPT,
              prepend: true,
              handler: async (node) => routeCallReceipt(this.deps, node)
          }));
      }
      wireClientEvents(ctx) {
          this.manager.on('call_state', (call) => {
              ctx.emit('voip_call_state', call);
          });
          this.manager.on('call_incoming', (call) => {
              ctx.emit('voip_call_incoming', call);
          });
          this.manager.on('call_ended', (call) => {
              ctx.emit('voip_call_ended', call);
          });
          this.manager.on('call_inbound_audio', (call, pcm) => {
              ctx.emit('voip_call_inbound_audio', { call, pcm });
          });
          this.manager.on('call_outbound_audio_finished', (call) => {
              ctx.emit('voip_call_outbound_audio_finished', call);
          });
          this.manager.on('call_peer_mute', (call, muted) => {
              ctx.emit('voip_call_peer_mute', { call, muted });
          });
          this.manager.on('call_hand_raise', (call, participantJid, raised) => {
              ctx.emit('voip_call_hand_raise', { call, participantJid, raised });
          });
          this.manager.on('call_reaction', (call, reaction) => {
              ctx.emit('voip_call_reaction', { call, reaction });
          });
          this.manager.on('call_screen_share', (call, share) => {
              ctx.emit('voip_call_screen_share', { call, share });
          });
          this.manager.on('call_group_state', (call, state) => {
              ctx.emit('voip_call_group_state', { call, state });
          });
          this.manager.on('call_waiting_room', (call, room) => {
              ctx.emit('voip_call_waiting_room', { call, room });
          });
          this.manager.on('call_participant_audio', (call, participantJid, pcm) => {
              ctx.emit('voip_call_participant_audio', { call, participantJid, pcm });
          });
          this.manager.on('call_error', (error) => {
              ctx.emit('voip_call_error', error);
          });
      }
  }
  return { WaVoipCoordinator };
})();

/* ═══ voip-deps.js ══════════════════════════════════════════════════ */
const __voip_deps = (() => {
  const { resolveBaileysModule } = __baileys_resolve;
  const { parseSignalAddressFromJid } = __shim_protocol;
  const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;
  const TC_TOKEN_REQUEST_TIMEOUT_MS = 3500;
  let cachedBaileysHelpers = null;
  async function loadBaileysHelpers() {
      if (cachedBaileysHelpers)
          return cachedBaileysHelpers;
      const mod = await resolveBaileysModule();
      cachedBaileysHelpers = {
          jidDecode: mod.jidDecode,
          jidEncode: mod.jidEncode,
          parseAndInjectE2ESessions: mod.parseAndInjectE2ESessions,
          encodeSignedDeviceIdentity: mod.encodeSignedDeviceIdentity,
          getBinaryNodeChild: mod.getBinaryNodeChild,
          getAllBinaryNodeChildren: mod.getAllBinaryNodeChildren
      };
      return cachedBaileysHelpers;
  }
  function addressToJid(address) {
      return address.device
          ? `${address.user}:${address.device}@${address.server}`
          : `${address.user}@${address.server}`;
  }
  function normalizeDeviceList(baileysHelpers, jids) {
      const { jidDecode, jidEncode } = baileysHelpers;
      const result = new Set();
      for (const jid of jids) {
          const decoded = jidDecode(jid);
          if (!decoded?.user) {
              result.add(jid);
              continue;
          }
          const server = String(jid).endsWith('@lid') ? 'lid' : 's.whatsapp.net';
          result.add(jidEncode(decoded.user, server));
          if (decoded.device != null)
              result.add(`${decoded.user}:${decoded.device}@${server}`);
      }
      return [...result].slice(0, 5);
  }
  async function resolvePeerLid(sock, target) {
      const raw = String(target || '').trim();
      if (!raw)
          throw new Error('resolvePeerLid: target is required');
      if (raw.endsWith('@lid'))
          return raw;
      const pnJid = raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@s.whatsapp.net`;
      const lid = await sock.signalRepository.lidMapping?.getLIDForPN(pnJid);
      if (lid)
          return lid;
      return pnJid;
  }
  async function discoverPeerDevices(sock, baileysHelpers, peerLid) {
      const devices = await sock.getUSyncDevices([peerLid], true, false);
      const jids = devices.map((d) => d.jid).filter(Boolean);
      if (!jids.length)
          return [];
      return normalizeDeviceList(baileysHelpers, jids);
  }
  async function ensureSignalSessions(sock, baileysHelpers, jids, cache) {
      const missing = [];
      for (const jid of [...new Set(jids.filter(Boolean))]) {
          const signalId = sock.signalRepository.jidToSignalProtocolAddress(jid);
          const cachedAt = cache.get(signalId);
          if (cachedAt && Date.now() - cachedAt < SESSION_CACHE_TTL_MS)
              continue;
          const validation = await sock.signalRepository.validateSession(jid);
          if (validation?.exists) {
              cache.set(signalId, Date.now());
              continue;
          }
          missing.push(jid);
      }
      if (!missing.length)
          return;
      const sessionNode = await sock.query({
          tag: 'iq',
          attrs: { xmlns: 'encrypt', type: 'get', to: 's.whatsapp.net' },
          content: [
              { tag: 'key', attrs: {}, content: missing.map((jid) => ({ tag: 'user', attrs: { jid } })) }
          ]
      });
      await baileysHelpers.parseAndInjectE2ESessions(sessionNode, sock.signalRepository);
      for (const jid of missing) {
          cache.set(sock.signalRepository.jidToSignalProtocolAddress(jid), Date.now());
      }
  }
  function toBareJid(jid) {
      const at = String(jid).indexOf('@');
      if (at < 0)
          return jid;
      const user = String(jid).slice(0, at).split(':')[0];
      return `${user}@${String(jid).slice(at + 1)}`;
  }
  async function issueTcToken(sock, baileysHelpers, jid) {
      const userJid = toBareJid(jid);
      const issuedAt = Math.floor(Date.now() / 1000);
      try {
          const response = await sock.query({
              tag: 'iq',
              attrs: { to: 's.whatsapp.net', type: 'set', xmlns: 'privacy', id: sock.generateMessageTag() },
              content: [
                  {
                      tag: 'tokens',
                      attrs: {},
                      content: [{ tag: 'token', attrs: { jid: userJid, t: String(issuedAt), type: 'trusted_contact' } }]
                  }
              ]
          });
          const { getBinaryNodeChild, getAllBinaryNodeChildren } = baileysHelpers;
          const tokensNode = getBinaryNodeChild(response, 'tokens');
          const tokenNodes = tokensNode ? getAllBinaryNodeChildren(tokensNode).filter((c) => c.tag === 'token') : [];
          for (const tokenNode of tokenNodes) {
              if (tokenNode.attrs.type !== 'trusted_contact')
                  continue;
              const content = tokenNode.content;
              if (content instanceof Uint8Array && content.length > 0) {
                  await sock.authState.keys.set({
                      tctoken: { [userJid]: { token: Buffer.from(content), timestamp: String(tokenNode.attrs.t ?? issuedAt) } }
                  });
                  return Buffer.from(content);
              }
          }
          return undefined;
      }
      catch {
          return undefined;
      }
  }
  async function getCachedTcToken(sock, jid) {
      try {
          const result = await sock.authState.keys.get('tctoken', [jid]);
          const cached = result?.[jid];
          return cached?.token?.length ? Buffer.from(cached.token) : undefined;
      }
      catch {
          return undefined;
      }
  }
  async function ensureTcToken(sock, baileysHelpers, jid) {
      const bare = toBareJid(jid);
      const cached = await getCachedTcToken(sock, bare);
      if (cached?.length)
          return cached;
      return Promise.race([
          issueTcToken(sock, baileysHelpers, bare),
          new Promise((resolve) => setTimeout(() => resolve(undefined), TC_TOKEN_REQUEST_TIMEOUT_MS))
      ]);
  }
  async function createVoipDeps(sock) {
      const baileysHelpers = await loadBaileysHelpers();
      const sessionCache = new Map();
      const deps = {
          authClient: {
              getCurrentCredentials() {
                  const creds = sock.authState?.creds;
                  const account = creds?.account;
                  let signedIdentity;
                  if (account) {
                      try {
                          signedIdentity = baileysHelpers.encodeSignedDeviceIdentity(account, true);
                      }
                      catch {
                          signedIdentity = undefined;
                      }
                  }
                  return {
                      meLid: creds?.me?.lid,
                      meJid: creds?.me?.id,
                      signedIdentity
                  };
              }
          },
          lowLevelCoordinator: {
              async sendNode(node) {
                  await sock.sendNode(node);
              },
              async query(node, timeoutMs) {
                  return sock.query(node, timeoutMs);
              }
          },
          signalDeviceSync: {
              async syncDeviceList(jids) {
                  const out = [];
                  for (const jid of jids) {
                      try {
                          const peerLid = await resolvePeerLid(sock, jid);
                          const deviceJids = await discoverPeerDevices(sock, baileysHelpers, peerLid);
                          out.push({ deviceJids });
                      }
                      catch {
                          out.push({ deviceJids: [] });
                      }
                  }
                  return out;
              },
              async getDevices(jids) {
                  const devices = await sock.getUSyncDevices(jids, true, false);
                  return devices.map((device) => device.jid).filter(Boolean);
              },
              async queryLidsByPhoneJids(jids) {
                  const out = [];
                  for (const jid of jids) {
                      try {
                          out.push({ lidJid: await resolvePeerLid(sock, jid) });
                      }
                      catch {
                          out.push({ lidJid: undefined });
                      }
                  }
                  return out;
              }
          },
          sessionResolver: {
              async ensureSessionsBatch(devices) {
                  await ensureSignalSessions(sock, baileysHelpers, devices, sessionCache);
                  return devices.map((jid) => ({ address: parseSignalAddressFromJid(jid), session: null }));
              }
          },
          signalProtocol: {
              async encryptMessage(address, plaintext) {
                  const jid = addressToJid(address);
                  const { type, ciphertext } = await sock.signalRepository.encryptMessage({
                      jid,
                      data: Buffer.from(plaintext)
                  });
                  return { type, ciphertext: new Uint8Array(ciphertext) };
              },
              async decryptMessage(address, { type, ciphertext }) {
                  const jid = addressToJid(address);
                  const decrypted = await sock.signalRepository.decryptMessage({ jid, type, ciphertext });
                  return new Uint8Array(decrypted);
              }
          },
          messageDispatch: {
              async syncSignalSession(jid) {
                  await ensureSignalSessions(sock, baileysHelpers, [jid], sessionCache);
              }
          }
      };
      const stores = {
          privacyToken: {
              async getByJid(jid) {
                  const token = await ensureTcToken(sock, baileysHelpers, jid);
                  return token?.length ? { tcToken: token } : undefined;
              }
          }
      };
      return { deps, stores };
  }
  return { createVoipDeps };
})();

/* ═══ voipClient.js ═════════════════════════════════════════════════ */
const __voipClient = (() => {
  const { WaVoipCoordinator } = __WaVoipCoordinator;
  const { createConsoleLogger } = __core;
  const { createVoipDeps } = __voip_deps;
  async function resolvePeerLid(sock, target) {
      const raw = String(target || '').trim();
      if (!raw)
          throw new Error('resolvePeerLid: target is required');
      if (raw.endsWith('@lid'))
          return raw;
      const pnJid = raw.includes('@') ? raw : `${raw.replace(/\D/g, '')}@s.whatsapp.net`;
      const lid = await sock.signalRepository.lidMapping?.getLIDForPN(pnJid);
      return lid || pnJid;
  }
  function createVoipCtx(sock, deps, stores, logger, emitter) {
      return {
          deps,
          stores,
          logger,
          registerIncomingHandler({ tag, prepend, handler }) {
              const listener = (node) => {
                  Promise.resolve(handler(node)).catch((err) => {
                      logger.error('voip incoming handler failed', { tag, message: err?.message });
                  });
              };
              const key = `CB:${tag}`;
              const ws = sock.ws;
              if (prepend && typeof ws.prependListener === 'function') {
                  ws.prependListener(key, listener);
              }
              else {
                  ws.on(key, listener);
              }
              return () => {
                  try {
                      ws.off(key, listener);
                  }
                  catch { }
              };
          },
          emit(event, payload) {
              emitter.emit(event, payload);
          }
      };
  }
  class ActiveCall extends EventEmitter {
      callId;
      #coordinator;
      #endResolver;
      #endPromise;
      #endTimer = null;
      #ended = false;
      #connectedEmitted = false;
      constructor(coordinator, callId, durationMs) {
          super();
          this.callId = callId;
          this.#coordinator = coordinator;
          this.#endPromise = new Promise((res) => { this.#endResolver = res; });
          if (durationMs > 0)
              this.#endTimer = setTimeout(() => this.end(), durationMs);
      }
      _onState(call) {
          if (call.callId !== this.callId)
              return;
          if (call.isRinging)
              this.emit('ringing');
          if (call.isActive && !this.#connectedEmitted) {
              this.#connectedEmitted = true;
              this.emit('connected');
          }
      }
      _onEnded(call) {
          if (call.callId !== this.callId)
              return;
          this._forceEnd(call.stateData?.endReason ?? 'ended');
      }
      _onError(err) {
          this.emit('error', err);
      }
      setMute = (muted) => this.#coordinator.setMute(this.callId, !!muted);
      raiseHand = (raised = true) => this.#coordinator.setHandRaised(this.callId, !!raised);
      shareScreen = (sharing = true) => this.#coordinator.setScreenShare(this.callId, !!sharing);
      react = (emoji) => this.#coordinator.sendReaction(this.callId, emoji);
      upgradeToVideo = () => this.#coordinator.startVideoMidCall(this.callId);
      addParticipant = (target) => this.#coordinator.addGroupParticipant(this.callId, target);
      ringParticipant = (target) => this.#coordinator.ringGroupParticipant(this.callId, target);
      setApprovalRequired = (enabled) => this.#coordinator.setApprovalRequired(this.callId, !!enabled);
      admit = (jid) => this.#coordinator.admitParticipant(this.callId, jid);
      deny = (jid) => this.#coordinator.denyParticipant(this.callId, jid);
      get isGroup() {
          return !!this.#coordinator.getCall(this.callId)?.isGroup;
      }
      get participants() {
          return this.#coordinator.getCall(this.callId)?.groupState?.participants ?? [];
      }
      get waitingRoom() {
          return this.#coordinator.getCall(this.callId)?.waitingRoom ?? null;
      }
      end = async () => {
          if (this.#ended)
              return;
          if (this.#endTimer) {
              clearTimeout(this.#endTimer);
              this.#endTimer = null;
          }
          try {
              await this.#coordinator.endCall(this.callId);
          }
          catch (e) {
              this._forceEnd('ended');
              throw e;
          }
      };
      waitForEnd = () => this.#endPromise;
      get connected() {
          return this.#connectedEmitted;
      }
      get ended() {
          return this.#ended;
      }
      _forceEnd = (reason) => {
          if (this.#ended)
              return;
          this.#ended = true;
          if (this.#endTimer) {
              clearTimeout(this.#endTimer);
              this.#endTimer = null;
          }
          this.emit('ended', reason);
          this.#endResolver(reason);
      };
  }
  class VoipClient {
      #config;
      #sock = null;
      #coordinator = null;
      #activeCalls = new Map();
      #offSocketClose = null;
      #connecting = null;
      #boundEv = null;
      #logger = null;
      #signalingDown = false;
      #watchTimer = null;
      #deadlineTimer = null;
      constructor(config) {
          this.#config = config;
          if (!config?.existingSocket) {
              throw new Error('VoipClient requires { existingSocket }: VOIP always runs on the main bot session now, there is no standalone-device mode.');
          }
      }
      get coordinator() {
          return this.#coordinator;
      }
      get activeCalls() {
          return [...this.#activeCalls.values()];
      }
      connect = () => {
          if (this.#signalingDown)
              return Promise.reject(new Error('Connection is reconnecting, try again once it is restored.'));
          if (this.#coordinator && this.#sock === this.#config.existingSocket) {
              return Promise.resolve();
          }
          if (!this.#connecting) {
              this.#connecting = this.#setup().finally(() => {
                  this.#connecting = null;
              });
          }
          return this.#connecting;
      };
      #setup = async () => {
          this.#sock = this.#config.existingSocket;
          const { deps, stores } = await createVoipDeps(this.#sock);
          const logger = createConsoleLogger(this.#config.voipLogLevel ?? 'warn');
          this.#logger = logger;
          const emitter = new EventEmitter();
          const ctx = createVoipCtx(this.#sock, deps, stores, logger, emitter);
          this.#coordinator = new WaVoipCoordinator(ctx, {
              maxConcurrentCalls: this.#config.maxConcurrentCalls ?? 1,
              logLevel: this.#config.voipLogLevel ?? 'warn'
          });
          this.#listenForSocket();
      };
      #listenForSocket() {
          const ev = this.#sock.ev;
          const onUpdate = (update) => this.#onConnectionUpdate(update);
          ev?.on?.('connection.update', onUpdate);
          this.#boundEv = ev;
          this.#offSocketClose = () => {
              try {
                  ev?.off?.('connection.update', onUpdate);
              }
              catch { }
          };
      }
      #onConnectionUpdate(update) {
          if (update?.connection === 'open') {
              this.#restoreSignaling();
              return;
          }
          if (update?.connection !== 'close')
              return;
          const statusCode = update?.lastDisconnect?.error?.output?.statusCode
              ?? update?.lastDisconnect?.error?.output?.payload?.statusCode;
          if ([401, 403, 411, 440, 500].includes(statusCode) && !(statusCode === 500 && /^WebSocket Error/i.test(String(update?.lastDisconnect?.error?.message || '')))) {
              this.#logger?.warn('voip: socket closed for good, tearing down active calls', { statusCode });
              this.#teardown('connection_closed');
              return;
          }
          if (this.#signalingDown)
              return;
          this.#logger?.warn('voip: socket closed, keeping active calls until it reconnects');
          this.#suspendSignaling();
      }
      #suspendSignaling() {
          this.#signalingDown = true;
          this.#offSocketClose?.();
          this.#offSocketClose = null;
          this.#coordinator?.suspendIncoming();
          this.#coordinator?.notifyReconnecting();
          this.#watchTimer = setInterval(() => this.#watchSocket(), 50);
          this.#deadlineTimer = setTimeout(() => this.#teardown('connection_closed'), 120_000);
      }
      #watchSocket() {
          if (!this.#signalingDown || !this.#sock || this.#sock.ev === this.#boundEv)
              return;
          this.#listenForSocket();
          this.#coordinator?.suspendIncoming();
          this.#coordinator?.resumeIncoming();
      }
      #restoreSignaling() {
          if (!this.#signalingDown)
              return;
          this.#clearSignalingState();
          this.#coordinator?.notifyReconnected();
      }
      #clearSignalingState() {
          this.#signalingDown = false;
          clearInterval(this.#watchTimer);
          clearTimeout(this.#deadlineTimer);
          this.#watchTimer = null;
          this.#deadlineTimer = null;
      }
      #teardown(reason) {
          const calls = [...this.#activeCalls.values()];
          this.#activeCalls.clear();
          this.#offSocketClose?.();
          this.#offSocketClose = null;
          this.#clearSignalingState();
          for (const call of calls) {
              try {
                  call._forceEnd(reason);
              }
              catch { }
          }
          try {
              this.#coordinator?.dispose();
          }
          catch { }
          this.#sock = null;
          this.#coordinator = null;
          this.#boundEv = null;
      }
      call = async (phoneNumber, opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          const durationMs = opts.durationMs ?? 120_000;
          const peerJid = await resolvePeerLid(this.#sock, phoneNumber);
          const audioFile = opts.audioSource && opts.audioSource !== 'silence' ? opts.audioSource : undefined;
          const callId = await coordinator.startCall({
              peerJid,
              isVideo: !!opts.isVideo,
              audioFile,
              videoConfig: opts.videoConfig
          });
          if (this.#coordinator !== coordinator) {
              throw new Error('Connection closed while placing the call.');
          }
          if (audioFile) {
              try {
                  await coordinator.loadAudio(callId, audioFile);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load audio "${audioFile}" for call ${callId}:`, e?.message || e);
              }
          }
          if (opts.isVideo && opts.videoSource) {
              try {
                  await coordinator.loadVideo(callId, opts.videoSource);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load video "${opts.videoSource}" for call ${callId}:`, e?.message || e);
              }
          }
          if (this.#coordinator !== coordinator) {
              throw new Error('Connection closed while placing the call.');
          }
          return this.#track(coordinator, callId, durationMs);
      };
      #loadGroupMedia = async (coordinator, callId, opts) => {
          const audioFile = opts.audioSource && opts.audioSource !== 'silence' ? opts.audioSource : undefined;
          if (audioFile) {
              try {
                  await coordinator.loadAudio(callId, audioFile);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load audio "${audioFile}" for call ${callId}:`, e?.message || e);
              }
          }
          if (opts.videoSource) {
              try {
                  await coordinator.loadVideo(callId, opts.videoSource);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load video "${opts.videoSource}" for call ${callId}:`, e?.message || e);
              }
          }
          if (this.#coordinator !== coordinator) {
              throw new Error('Connection closed while placing the call.');
          }
          const call = this.#track(coordinator, callId, opts.durationMs ?? 0);
          setImmediate(() => {
              const info = coordinator.getCall(callId);
              if (info && !call.ended) {
                  call._onState(info);
              }
          });
          return call;
      };
      groupCall = async (targets, opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          const callId = await coordinator.startGroupCall({
              targets,
              groupJid: opts.groupJid,
              isVideo: !!opts.isVideo,
              videoConfig: opts.videoConfig
          });
          return this.#loadGroupMedia(coordinator, callId, opts);
      };
      createLink = async (opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          return coordinator.createCallLink({ isVideo: !!opts.isVideo });
      };
      queryLink = async (linkOrToken, opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          return coordinator.queryCallLink(linkOrToken, { isVideo: opts.isVideo });
      };
      joinLink = async (linkOrToken, opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          const callId = await coordinator.joinCallLink(linkOrToken, {
              isVideo: opts.isVideo,
              videoConfig: opts.videoConfig
          });
          return this.#loadGroupMedia(coordinator, callId, opts);
      };
      #track = (coordinator, callId, durationMs) => {
          const call = new ActiveCall(coordinator, callId, durationMs);
          this.#activeCalls.set(callId, call);
          call.coordinator = coordinator;
          const onState = (info) => call._onState(info);
          const onEnded = (info) => call._onEnded(info);
          const onError = (err) => {
              if (err?.callId && err.callId !== callId)
                  return;
              call._onError(err);
          };
          coordinator.on('call_state', onState);
          coordinator.on('call_ended', onEnded);
          coordinator.on('call_error', onError);
          const forwarded = [
              ['call_peer_mute', 'peer_mute', (c, muted) => [muted]],
              ['call_hand_raise', 'hand_raise', (c, jid, raised) => [{ jid, raised }]],
              ['call_reaction', 'reaction', (c, reaction) => [reaction]],
              ['call_screen_share', 'screen_share', (c, share) => [share]],
              ['call_video_state', 'peer_video', (c, change) => [change]],
              ['call_inbound_audio', 'inbound_audio', (c, pcm) => [pcm]],
              ['call_inbound_video', 'inbound_video', (c, frame, participantJid) => [frame, participantJid]],
              ['call_group_state', 'group_state', (c, state) => [state]],
              ['call_waiting_room', 'waiting_room', (c, room) => [room]],
              ['call_participant_audio', 'participant_audio', (c, participantJid, pcm) => [participantJid, pcm]],
              ['call_outbound_audio_finished', 'audio_finished', () => []],
              ['call_reconnecting', 'reconnecting', (c, detail) => [detail]],
              ['call_reconnected', 'reconnected', () => []]
          ].map(([source, target, shape]) => {
              const listener = (info, ...rest) => {
                  if (info?.callId === callId)
                      call.emit(target, ...shape(info, ...rest));
              };
              coordinator.on(source, listener);
              return [source, listener];
          });
          call.once('ended', () => {
              for (const [source, listener] of forwarded)
                  coordinator.off(source, listener);
              coordinator.off('call_state', onState);
              coordinator.off('call_ended', onEnded);
              coordinator.off('call_error', onError);
              if (this.#activeCalls.get(callId) === call)
                  this.#activeCalls.delete(callId);
          });
          return call;
      };
      answer = async (callId, opts = {}) => {
          const coordinator = this.#coordinator;
          if (!this.#sock || !coordinator)
              throw new Error('Not connected. Call connect() first.');
          const info = coordinator.getCall(callId);
          if (!info)
              throw new Error(`Unknown call ${callId}.`);
          if (!info.canAccept)
              throw new Error(`Call ${callId} cannot be accepted right now.`);
          const call = this.#track(coordinator, callId, opts.durationMs ?? 0);
          try {
              await coordinator.acceptCall(callId);
          }
          catch (err) {
              call._forceEnd('failed');
              throw err;
          }
          const audioFile = opts.audioSource && opts.audioSource !== 'silence' ? opts.audioSource : undefined;
          if (audioFile) {
              try {
                  await coordinator.loadAudio(callId, audioFile);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load audio "${audioFile}" for call ${callId}:`, e?.message || e);
              }
          }
          if (opts.videoSource) {
              try {
                  await coordinator.loadVideo(callId, opts.videoSource);
              } catch (e) {
                  console.error(`[ VOIP ] Failed to load video "${opts.videoSource}" for call ${callId}:`, e?.message || e);
              }
          }
          return call;
      };
      disconnect = () => {
          for (const call of this.#activeCalls.values()) {
              try {
                  call.end()?.catch?.(() => { });
              }
              catch { }
          }
          this.#teardown('disconnected');
      };
  }
  return { ActiveCall, VoipClient };
})();

/* ═══ index.js ══════════════════════════════════════════════════════ */
const __index = (() => {
  const { CallDirection, CallMediaType } = __types;
  const { VoipClient } = __voipClient;
  const RESOLUTION_PRESETS = {
      '240p': { width: 320, height: 240, frameRate: 20 },
      '360p': { width: 640, height: 360, frameRate: 30 },
      '480p': { width: 854, height: 480, frameRate: 30 },
      '720p': { width: 1280, height: 720, frameRate: 30 },
      '1080p': { width: 1920, height: 1080, frameRate: 30 },
  };

  function resolveVideoConfig(resolution, sourceDims) {
      if (!resolution) {
          if (!sourceDims?.width || !sourceDims?.height)
              return undefined;
          return applyOrientation(RESOLUTION_PRESETS['480p'], sourceDims);
      }
      if (typeof resolution === 'object')
          return resolution;
      const key = String(resolution).trim().toLowerCase();
      const preset = RESOLUTION_PRESETS[key];
      if (!preset) {
          const known = Object.keys(RESOLUTION_PRESETS).join(', ');
          throw new Error(`Unknown resolution "${resolution}". Use one of: ${known}, or pass { width, height, frameRate } directly.`);
      }
      return applyOrientation(preset, sourceDims);
  }

  function applyOrientation(preset, sourceDims) {
      if (!sourceDims?.width || !sourceDims?.height)
          return { ...preset };
      const sourceIsPortrait = sourceDims.height > sourceDims.width;
      const presetIsPortrait = preset.height > preset.width;
      if (sourceIsPortrait === presetIsPortrait)
          return { ...preset };
      return { ...preset, width: preset.height, height: preset.width };
  }

  const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|#|$)/i;
  const AUDIO_EXTENSIONS = /\.(mp3|ogg|opus|wav|m4a|aac|flac|weba)(\?|#|$)/i;

  function detectKind(source) {
      if (VIDEO_EXTENSIONS.test(source))
          return 'video';
      if (AUDIO_EXTENSIONS.test(source))
          return 'audio';
      return null;
  }

  function isUrl(source) {
      return /^https?:\/\//i.test(source);
  }

  async function downloadToTemp(url, extHint, maxBytes, tmpDirOverride) {
      const axios = (await import('axios')).default;
      const response = await axios({
          method: 'get',
          url,
          responseType: 'arraybuffer',
          timeout: 30_000,
          maxContentLength: maxBytes,
          headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const os = await import('node:os');
      const tmpDir = tmpDirOverride || os.tmpdir();
      if (!fs.existsSync(tmpDir))
          fs.mkdirSync(tmpDir, { recursive: true });
      const filePath = path.join(tmpDir, `voip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${extHint}`);
      fs.writeFileSync(filePath, Buffer.from(response.data));
      return filePath;
  }

  async function probeMedia(filePath, ffprobePath) {
      try {
          const { execFile } = await import('node:child_process');
          const { promisify } = await import('node:util');
          const execFileAsync = promisify(execFile);
          const { stdout } = await execFileAsync(ffprobePath, [
              '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath
          ]);
          const parsed = JSON.parse(stdout);
          const duration = parsed?.format?.duration;
          const durationMs = (!duration || isNaN(duration)) ? null : Math.ceil(parseFloat(duration) * 1000);
          const videoStream = parsed?.streams?.find((s) => s.codec_type === 'video');
          let width = videoStream?.width || null;
          let height = videoStream?.height || null;
          const rotation = getEffectiveRotation(videoStream);
          if (width && height && Math.abs(rotation) % 180 === 90) {
              [width, height] = [height, width];
          }
          return { durationMs, width, height };
      }
      catch {
          return { durationMs: null, width: null, height: null };
      }
  }

  function getEffectiveRotation(videoStream) {
      const tagRotate = videoStream?.tags?.rotate;
      if (tagRotate !== undefined) {
          const n = parseInt(tagRotate, 10);
          if (!isNaN(n)) return ((n % 360) + 360) % 360;
      }
      const matrixSideData = videoStream?.side_data_list?.find((sd) => sd.rotation !== undefined);
      if (matrixSideData) {
          const n = Math.round(matrixSideData.rotation);
          if (!isNaN(n)) return ((n % 360) + 360) % 360;
      }
      return 0;
  }

  async function normalizeItem(item, ffprobePath, tmpDir) {
      let kind;
      let rawSource;
      let autoAdvance = false;
      if (typeof item === 'string') {
          rawSource = item;
          kind = detectKind(item) ?? 'audio';
      }
      else if (item && typeof item === 'object') {
          autoAdvance = !!item.autoAdvance;
          if (item.video) {
              rawSource = item.video;
              kind = 'video';
          }
          else if (item.audio) {
              rawSource = item.audio;
              kind = 'audio';
          }
          else {
              throw new Error('Playlist item must be a string, or an object with a "video" or "audio" key.');
          }
      }
      else {
          throw new Error('Playlist item must be a string or an object.');
      }
      let source = rawSource;
      let isTemp = false;
      if (isUrl(rawSource) && kind === 'audio') {
          return { kind, source: rawSource, isTemp: false, durationMs: undefined, autoAdvance };
      }
      if (isUrl(rawSource)) {
          source = await downloadToTemp(rawSource, '.mp4', 50 * 1024 * 1024, tmpDir);
          isTemp = true;
      }
      else if (!fs.existsSync(rawSource)) {
          throw new Error(`Media file not found: ${rawSource}`);
      }
      const probed = await probeMedia(source, ffprobePath);
      const durationMs = probed.durationMs ?? undefined;
      const result = { kind, source, isTemp, durationMs, autoAdvance };
      if (kind === 'video' && probed.width && probed.height) {
          result.sourceWidth = probed.width;
          result.sourceHeight = probed.height;
      }
      return result;
  }

  class VoipCall extends EventEmitter {
      #activeCall = null;
      #coordinator = null;
      #items;
      #index = -1;
      #ended = false;
      #onRelease;
      #autoEndCall;
      #loop;
      #onItemAdvance;
      #target;
      #autoDowngrade;
      #startVideoOnFirst;
      #videoDown = false;
      #silenced = false;
      #members = new Set();
      #normalize = null;
      #itemDeadline = 0;
      #itemRemainingMs = null;
      _itemTimer = null;
      constructor(items, onRelease, opts = {}) {
          super();
          this.#items = items;
          this.#onRelease = onRelease;
          this.#autoEndCall = opts.autoEndCall === undefined ? true : !!opts.autoEndCall;
          this.#loop = !!opts.loop;
          this.#onItemAdvance = opts.onItemAdvance;
          this.#target = opts.target ?? null;
          this.#autoDowngrade = opts.autoDowngrade === undefined ? false : !!opts.autoDowngrade;
          this.#startVideoOnFirst = !!opts.startVideoOnFirst;
          this.#normalize = opts.normalize ?? null;
      }
      async _attach(activeCall) {
          this.#activeCall = activeCall;
          this.#coordinator = activeCall.coordinator;
          activeCall.on('ringing', () => this.emit('ringing'));
          activeCall.on('connected', () => {
              this.emit('connected');
              this._advance().catch((err) => this.emit('error', err));
          });
          activeCall.on('ended', (reason) => this._finish(reason));
          activeCall.on('audio_finished', () => this._onAudioFinished());
          activeCall.on('error', (err) => this.emit('error', err));
          activeCall.on('group_state', (state) => {
              const change = participantChanges(this.#members, state?.participants ?? []);
              this.#members = change.members;
              if (change.added.length || change.removed.length) {
                  this.emit('participants_changed', {
                      added: change.added.map((participant) => ({ number: numberOf(participant), jid: participant.jid, state: participant.state })),
                      removed: change.removed.map((key) => ({ number: key })),
                  });
              }
          });
          activeCall.on('peer_video', (change) => {
              this._onPeerVideo(change).catch((err) => this.emit('error', err));
          });
          if (activeCall.ended) {
              this._finish('ended');
              return;
          }
          if (activeCall.connected) {
              this.emit('connected');
              this._advance().catch((err) => this.emit('error', err));
          }
          for (const ev of ['peer_mute', 'hand_raise', 'reaction', 'screen_share', 'peer_video', 'inbound_audio', 'inbound_video', 'audio_finished', 'reconnecting', 'reconnected', 'group_state', 'waiting_room', 'participant_audio']) {
              activeCall.on(ev, (...args) => this.emit(ev, ...args));
          }
      }
      get callId() {
          return this.#activeCall?.callId ?? null;
      }
      get target() {
          return this.#target;
      }
      mute(value = true) {
          return this.#activeCall?.setMute(value);
      }
      raiseHand(value = true) {
          return this.#activeCall?.raiseHand(value);
      }
      shareScreen(value = true) {
          return this.#activeCall?.shareScreen(value);
      }
      react(emoji) {
          return this.#activeCall?.react(emoji) ?? false;
      }
      get isGroup() {
          return this.#activeCall?.isGroup ?? false;
      }
      get link() {
          return this.#coordinator?.getCall(this.callId)?.linkUrl ?? null;
      }
      get participants() {
          return this.#activeCall?.participants ?? [];
      }
      get waitingRoom() {
          return this.#activeCall?.waitingRoom ?? null;
      }
      get connected() {
          return !!this.#activeCall?.connected;
      }
      get ended() {
          return this.#ended;
      }
      get silenced() {
          return this.#silenced;
      }
      get items() {
          return this.#items;
      }
      get index() {
          return this.#index;
      }
      addParticipant(target) {
          return this.#activeCall?.addParticipant(target);
      }
      ringParticipant(target) {
          return this.#activeCall?.ringParticipant(target);
      }
      setApprovalRequired(enabled) {
          return this.#activeCall?.setApprovalRequired(enabled);
      }
      admit(jid) {
          return this.#activeCall?.admit(jid);
      }
      deny(jid) {
          return this.#activeCall?.deny(jid);
      }
      async upgradeToVideo() {
          await this.#activeCall?.upgradeToVideo();
          this.#videoDown = false;
      }
      get isVideoDowngraded() {
          return this.#videoDown;
      }
      async _onPeerVideo(change) {
          if (!this.#autoDowngrade || this.#ended || this.#silenced || this.#videoDown)
              return;
          if (change?.direction !== 'inbound' || change.active || !change.allOff)
              return;
          const current = this.#items[this.#index];
          if (current?.kind !== 'video')
              return;
          const callId = this.#activeCall?.callId;
          if (!callId)
              return;
          this.#videoDown = true;
          try {
              await this.#coordinator.stopVideoMidCall(callId, { keepSource: true });
              this.emit('downgraded');
          }
          catch (err) {
              this.#videoDown = false;
              throw new Error(`Failed to downgrade call to audio: ${err?.message || err}`);
          }
      }

      async _advance(target = null) {
          if (this.#silenced)
              return;
          const previous = this.#items[this.#index] ?? null;
          this.#index = target ?? this.#index + 1;
          let next = this.#items[this.#index];
          this.#itemRemainingMs = null;
          if (!next) {
              if (this.#loop && this.#items.length > 0) {
                  this.emit('playlist_looped');
                  this.#index = 0;
                  next = this.#items[0];
              }
              else {
                  this.#onItemAdvance?.(null);
                  this.emit('playlist_ended');
                  if (this.#autoEndCall) {
                      this.end().catch((err) => this.emit('error', err));
                  }
                  return;
              }
          }
          const isFirst = target === null && previous === null && this.#index === 0;
          if (isFirst && next.kind === 'video' && this.#startVideoOnFirst) {
              try {
                  await this.#coordinator.startVideoMidCall(this.#activeCall.callId);
              }
              catch (err) {
                  this.emit('error', new Error(`Failed to start video: ${err?.message || err}`));
              }
          }
          if (!isFirst) {
              const callId = this.#activeCall.callId;
              const videoRunning = previous?.kind === 'video' && !this.#videoDown;
              try {
                  if (next.kind === 'video') {
                      if (previous && previous.kind === 'video') {
                          await this.#coordinator.swapVideoSource(callId, next.source);
                      }
                      else {
                          await this.#coordinator.loadVideo(callId, next.source);
                      }
                      await this.#coordinator.loadAudio(callId, next.source);
                      if (!videoRunning) {
                          await this.#coordinator.startVideoMidCall(callId);
                      }
                  }
                  else {
                      await this.#coordinator.loadAudio(callId, next.source);
                      if (videoRunning) {
                          await this.#coordinator.stopVideoMidCall(callId, { keepSource: true });
                      }
                  }
                  this.#videoDown = false;
              }
              catch (err) {
                  this.emit('error', new Error(`Failed to advance to playlist item ${this.#index} (${next.kind} "${next.source}"): ${err?.message || err}`));
              }
              finally {
                  if (!this.#loop) {
                      this._cleanupItem(previous);
                  }
              }
          }
          this.emit('item', { index: this.#index, kind: next.kind, source: next.source });
          this.#onItemAdvance?.(next);
          if (next.kind === 'video' && next.autoAdvance && next.durationMs) {
              this._scheduleAdvance(next.durationMs);
          }
      }
      _onAudioFinished() {
          if (this.#ended || this.#silenced)
              return;
          if (this.#items[this.#index]?.kind !== 'audio')
              return;
          this._advance().catch((err) => this.emit('error', err));
      }
      _scheduleAdvance(ms) {
          this._clearItemTimer();
          this.#itemDeadline = Date.now() + ms;
          this._itemTimer = setTimeout(() => {
              this._itemTimer = null;
              this._advance().catch((err) => this.emit('error', err));
          }, ms);
      }
      _clearItemTimer() {
          if (this._itemTimer)
              clearTimeout(this._itemTimer);
          this._itemTimer = null;
      }
      setLoop(value = true) {
          this.#loop = !!value;
          return this.#loop;
      }
      async jump(index) {
          if (this.#ended || !this.#activeCall?.connected || index < 0 || index >= this.#items.length)
              return false;
          if (this.#silenced)
              await this.silent(false);
          this._clearItemTimer();
          await this._advance(index);
          return true;
      }
      async append(media) {
          if (this.#ended || !this.#normalize)
              return false;
          const incoming = [];
          for (const raw of [].concat(media))
              incoming.push(await this.#normalize(raw));
          const start = this.#items.length;
          this.#items.push(...incoming);
          if (this.#index >= start && this.#activeCall?.connected)
              await this._advance(start);
          return true;
      }
      _cleanupItem(item) {
          if (item?.isTemp && fs.existsSync(item.source)) {
              fs.unlink(item.source, () => { });
          }
      }
      _finish(reason) {
          if (this.#ended)
              return;
          this.#ended = true;
          if (this._itemTimer)
              clearTimeout(this._itemTimer);
          for (const item of this.#items)
              this._cleanupItem(item);
          this.#onRelease();
          this.emit('ended', reason);
      }

      async hangup() {
          if (this.#ended)
              return;
          await this.#activeCall?.end();
      }

      async silent(value) {
          if (this.#ended)
              return this.#silenced;
          const next = value === undefined ? !this.#silenced : !!value;
          if (next === this.#silenced)
              return this.#silenced;
          this.#silenced = next;
          const callId = this.#activeCall?.callId;
          if (!callId)
              return this.#silenced;
          const current = this.#items[this.#index];
          try {
              if (next) {
                  await this.#coordinator.setMute(callId, true);
                  if (current?.kind === 'video' && !this.#videoDown) {
                      await this.#coordinator.stopVideoMidCall(callId, { keepSource: true });
                      this.#videoDown = true;
                  }
                  if (this._itemTimer) {
                      this.#itemRemainingMs = Math.max(0, this.#itemDeadline - Date.now());
                  }
                  this._clearItemTimer();
                  this.#onItemAdvance?.(null);
              }
              else {
                  await this.#coordinator.setMute(callId, false);
                  if (current?.kind === 'video') {
                      await this.#coordinator.startVideoMidCall(callId);
                      this.#videoDown = false;
                  }
                  const remaining = this.#itemRemainingMs;
                  this.#itemRemainingMs = null;
                  if (remaining !== null)
                      this._scheduleAdvance(remaining);
                  this.#onItemAdvance?.(current ?? null);
              }
              this.emit('silent', this.#silenced);
          }
          catch (err) {
              this.#silenced = !next;
              this.emit('error', new Error(`Failed to ${next ? 'silence' : 'resume'} call: ${err?.message || err}`));
          }
          return this.#silenced;
      }
      get isSilenced() {
          return this.#silenced;
      }

      async end() {
          return this.hangup();
      }
  }

  class Voip {
      #conn;
      #client = null;
      #clientForConn = null;
      #calls = new Set();
      #pending = 0;
      #maxConcurrentCalls;
      #ffprobePath;
      #tmpDir;
      #voipLogLevel;
      constructor(conn, opts = {}) {
          this.#conn = conn;
          this.#ffprobePath = opts.ffprobePath || 'ffprobe';
          this.#voipLogLevel = opts.voipLogLevel ?? opts.level ?? 'warn';
          this.#maxConcurrentCalls = opts.maxConcurrentCalls ?? Number.MAX_SAFE_INTEGER;
          if (!Number.isSafeInteger(this.#maxConcurrentCalls) || this.#maxConcurrentCalls < 1)
              throw new Error('maxConcurrentCalls must be a positive integer.');
          this.#tmpDir = opts.tmpDir;
      }
      #getClient() {
          if (this.#client && this.#clientForConn === this.#conn)
              return this.#client;
          this.#client = new VoipClient({
              existingSocket: this.#conn,
              voipLogLevel: this.#voipLogLevel,
              maxConcurrentCalls: this.#maxConcurrentCalls
          });
          this.#clientForConn = this.#conn;
          return this.#client;
      }
      get calls() {
          return [...this.#calls];
      }
      get maxConcurrentCalls() {
          return this.#maxConcurrentCalls;
      }

      #assertCapacity() {
          if (this.#calls.size + this.#pending >= this.#maxConcurrentCalls)
              throw new Error(`Maximum concurrent calls reached (${this.#maxConcurrentCalls}), wait for a call to end.`);
      }
      async call(jid, media, resolution, options = {}) {
          this.#assertCapacity();
          const targetJid = String(jid || '').replace(/\D/g, '');
          if (!targetJid)
              throw new Error('Invalid phone number / jid.');
          return this.#launch(targetJid, media, resolution, options, (client, first, videoConfig) => client.call(targetJid, {
              audioSource: first.source,
              isVideo: first.kind === 'video',
              ...(first.kind === 'video' ? { videoSource: first.source } : {}),
              durationMs: 0,
              videoConfig,
          }));
      }
      async accept(callId, media, resolution, options = {}) {
          await this.listen();
          this.#assertCapacity();
          const info = this.coordinator.getCall(callId);
          if (!info)
              throw new Error(`Unknown call ${callId}.`);
          if (!info.canAccept)
              throw new Error(`Call ${callId} cannot be accepted right now.`);
          const callIsVideo = info.mediaType === CallMediaType.Video;
          return this.#launch(info.peerJid, media, resolution, { ...options, startVideoOnFirst: !callIsVideo }, (client, first) => client.answer(callId, {
              audioSource: first.source,
              videoSource: first.kind === 'video' ? first.source : undefined,
              durationMs: 0,
          }));
      }
      async reject(callId, reason) {
          await this.listen();
          return this.coordinator.rejectCall(callId, reason);
      }
      incoming() {
          return (this.coordinator?.getCalls() ?? [])
              .filter((info) => info.direction === CallDirection.Incoming && info.isRinging)
              .map((info) => ({
              id: info.callId,
              from: numberOf({ pn: info.callerPn, jid: info.peerJid }),
              isVideo: info.mediaType === CallMediaType.Video,
              isGroup: info.isGroup,
              canAccept: info.canAccept,
          }));
      }
      onIncoming(listener) {
          const coordinator = this.#requireCoordinator();
          const wrapped = (info) => listener({
              id: info.callId,
              from: numberOf({ pn: info.callerPn, jid: info.peerJid }),
              callId: info.callId,
              jid: info.peerJid,
              creator: info.callCreator,
              isVideo: info.mediaType === CallMediaType.Video,
              isGroup: info.isGroup,
              canAccept: info.canAccept,
              info,
          });
          coordinator.on('call_incoming', wrapped);
          return () => coordinator.off('call_incoming', wrapped);
      }
      async #launch(targetJid, media, resolution, options, begin) {
          this.#pending++;
          let reserved = true;
          const releaseReservation = () => {
              if (!reserved)
                  return;
              reserved = false;
              this.#pending--;
          };
          const items = [];
          const cleanupItems = () => {
              for (const item of items) {
                  if (item?.isTemp && fs.existsSync(item.source))
                      fs.unlink(item.source, () => { });
              }
          };
          try {
              const rawItems = Array.isArray(media) ? media : [media ?? 'silence'];
              for (const raw of rawItems) {
                  if (raw === 'silence' || raw == null) {
                      items.push({ kind: 'audio', source: 'silence', isTemp: false });
                      continue;
                  }
                  items.push(await normalizeItem(raw, this.#ffprobePath, this.#tmpDir));
              }
              const first = items[0];
              const videoConfig = resolveVideoConfig(resolution, { width: first.sourceWidth, height: first.sourceHeight });
              const client = this.#getClient();
              await client.connect();
              const safetyTimer = { handle: null };
              const scheduleSafety = (ms) => {
                  if (safetyTimer.handle)
                      clearTimeout(safetyTimer.handle);
                  safetyTimer.handle = setTimeout(() => {
                      call.emit('error', new Error('Safety timeout — call never reached ended/error.'));
                      this.#calls.delete(call);
                  }, ms);
              };
              const rescheduleSafetyForItem = (item) => {
                  clearTimeout(safetyTimer.handle);
                  if (item?.kind === 'video') {
                      scheduleSafety(10 * 60_000);
                  }
              };
              const call = new VoipCall(items, () => { this.#calls.delete(call); }, {
                  autoEndCall: options.autoEndCall,
                  loop: options.loop,
                  autoDowngrade: options.autoDowngrade,
                  startVideoOnFirst: options.startVideoOnFirst,
                  target: targetJid,
                  onItemAdvance: rescheduleSafetyForItem,
                  normalize: raw => normalizeItem(raw, this.#ffprobePath, this.#tmpDir),
              });
              this.#calls.add(call);
              releaseReservation();
              scheduleSafety(options.safetyMs ?? 105_000);
              let activeCall;
              try {
                  activeCall = await begin(client, first, videoConfig);
              }
              catch (err) {
                  clearTimeout(safetyTimer.handle);
                  call._finish('failed');
                  throw err;
              }
              activeCall.on('ended', () => clearTimeout(safetyTimer.handle));
              activeCall.on('error', () => clearTimeout(safetyTimer.handle));
              await call._attach(activeCall);
              return call;
          }
          catch (err) {
              cleanupItems();
              throw err;
          }
          finally {
              releaseReservation();
          }
      }

      async callMany(targets, media, resolution, options = {}) {
          const seen = new Set();
          const list = [];
          for (const target of Array.isArray(targets) ? targets : [targets]) {
              const key = String(target ?? '').replace(/\D/g, '') || String(target ?? '');
              if (seen.has(key))
                  continue;
              seen.add(key);
              list.push(target);
          }
          if (!list.length)
              throw new Error('callMany needs at least one target.');
          await this.listen();
          const settled = await Promise.allSettled(list.map((jid) => this.call(jid, media, resolution, options)));
          return settled.map((result, index) => result.status === 'fulfilled'
              ? { jid: list[index], call: result.value }
              : { jid: list[index], error: result.reason });
      }

      async groupCall(targets, media, resolution, options = {}) {
          this.#assertCapacity();
          const list = [...new Set((Array.isArray(targets) ? targets : [targets]).map((target) => String(target ?? '').trim()).filter(Boolean))];
          if (list.length < 2)
              throw new Error('A group call needs at least two participants besides yourself.');
          await this.listen();
          return this.#launch(list.join(','), media, resolution, options, (client, first, videoConfig) => client.groupCall(list, {
              groupJid: options.groupJid,
              audioSource: first.source,
              isVideo: first.kind === 'video',
              ...(first.kind === 'video' ? { videoSource: first.source } : {}),
              durationMs: 0,
              videoConfig,
          }));
      }
      async getLink(callOrId) {
          return this.#requireCoordinator().getCallLink(typeof callOrId === 'object' ? callOrId?.callId : callOrId);
      }
      async previewLink(link, options = {}) {
          await this.listen();
          return this.#getClient().queryLink(link, { isVideo: options.isVideo });
      }
      async joinLink(link, media, resolution, options = {}) {
          this.#assertCapacity();
          await this.listen();
          return this.#launch(String(link), media, resolution, { ...options, safetyMs: options.safetyMs ?? 10 * 60_000 }, (client, first, videoConfig) => client.joinLink(link, {
              audioSource: first.source,
              isVideo: options.isVideo,
              ...(first.kind === 'video' ? { videoSource: first.source } : {}),
              durationMs: 0,
              videoConfig,
          }));
      }
      async createRoom(media, resolution, options = {}) {
          await this.listen();
          const link = await this.#getClient().createLink({ isVideo: options.isVideo ?? detectKind(String((Array.isArray(media) ? media[0] : media) ?? '')) === 'video' });
          const call = await this.joinLink(link.url, media, resolution, { autoEndCall: false, ...options, isVideo: link.isVideo });
          if (options.requireApproval !== undefined) {
              call.once('connected', () => {
                  Promise.resolve(call.setApprovalRequired(!!options.requireApproval)).catch((err) => call.emit('error', err));
              });
          }
          return call;
      }
      async listen() {
          await this.#getClient().connect();
          return this;
      }
      get coordinator() {
          return this.#client?.coordinator ?? null;
      }
      on(event, listener) {
          if (!this.coordinator)
              throw new Error('Call listen() before subscribing to voip events.');
          this.coordinator.on(event, listener);
          return this;
      }
      off(event, listener) {
          this.coordinator?.off(event, listener);
          return this;
      }
      async acceptCall(callId) {
          return this.#requireCoordinator().acceptCall(callId);
      }
      async rejectCall(callId, reason) {
          return this.#requireCoordinator().rejectCall(callId, reason);
      }
      async hangup(callId) {
          return this.#requireCoordinator().endCall(callId);
      }
      #requireCoordinator() {
          if (!this.coordinator)
              throw new Error('Call listen() first.');
          return this.coordinator;
      }
      #find(id) {
          return [...this.#calls].find((call) => call.callId === String(id)) ?? null;
      }
      #require(id) {
          const call = this.#find(id);
          if (!call)
              throw new Error(`No active call with id ${id}.`);
          return call;
      }
      activeCalls() {
          return [...this.#calls].filter((call) => call.callId).map(summarizeCall);
      }
      info(id) {
          const call = this.#find(id);
          return call ? describeCall(call) : null;
      }
      silent(id, value) {
          return this.#require(id).silent(value);
      }
      mute(id, value = true) {
          return this.#require(id).mute(value);
      }
      react(id, emoji) {
          return this.#require(id).react(emoji);
      }
      hand(id, value = true) {
          return this.#require(id).raiseHand(value);
      }
      add(id, number) {
          return this.#require(id).addParticipant(number);
      }
      admit(id, jid) {
          return this.#require(id).admit(jid);
      }
      deny(id, jid) {
          return this.#require(id).deny(jid);
      }
      approval(id, enabled) {
          return this.#require(id).setApprovalRequired(enabled);
      }
      link(id) {
          return this.#require(id).link;
      }
      async end(target = false) {
          if (typeof target === 'string')
              return this.#require(target).hangup();
          if (target) {
              this.#calls.clear();
              return;
          }
          await Promise.all([...this.#calls].map((call) => call.hangup()));
      }
  }

  function numberOf(entry) {
      return String(entry?.pn || entry?.jid || '').split('@')[0].split(':')[0];
  }
  function accountOf(entry) {
      return String(entry?.jid || '').split('@')[0].split(':')[0];
  }
  const joinedStates = new Set(['connected', 'receipt', 'outgoing', 'creating', 'visible', 'invisible']);
  function participantChanges(members, participants) {
      const joined = participants.filter((participant) => !participant.isSelf && joinedStates.has(participant.state));
      const keys = new Set(joined.map(accountOf));
      return {
          members: keys,
          added: joined.filter((participant) => !members.has(accountOf(participant))),
          removed: [...members].filter((key) => !keys.has(key)),
      };
  }
  function kindOf(call) {
      if (call.link)
          return 'link';
      return call.isGroup ? 'group' : 'direct';
  }
  function summarizeCall(call) {
      return {
          id: call.callId,
          kind: kindOf(call),
          connected: call.connected,
          silenced: call.silenced,
          ended: call.ended,
      };
  }
  function describeCall(call) {
      return {
          ...summarizeCall(call),
          link: call.link,
          target: call.target,
          participants: call.participants
              .filter((participant) => participant.state !== 'terminated' && participant.state !== 'invalid')
              .map((participant) => ({ number: numberOf(participant), state: participant.state, self: !!participant.isSelf })),
          waiting: (call.waitingRoom?.users ?? []).map((user) => numberOf(user)),
      };
  }
  return { Voip };
})();

/* ═══ الجسر العام — واجهة الإضافات ══════════════════════════════════ */

/* ── متطلبات السيرفر — فحص ffmpeg/ffprobe ────────────────────────────────────── */

// يفحص توفّر ffmpeg/ffprobe على PATH مع تخزين النتيجة مؤقتاً.
const cache = new Map()

function probe(bin, timeout = 4000) {
  if (cache.has(bin)) return cache.get(bin)
  const p = new Promise((resolve) => {
    execFile(bin, ["-version"], { timeout }, (err) => resolve(!err))
  })
  cache.set(bin, p)
  return p
}

export function hasFfmpeg() {
  return probe("ffmpeg")
}

export function hasFfprobe() {
  return probe("ffprobe")
}

// يعيد قائمة بالنواقص؛ فارغة تعني أن كل المتطلبات متوفرة.
export async function missingRequirements({ media = false } = {}) {
  const missing = []
  if (!media) return missing
  if (!(await hasFfmpeg())) missing.push("ffmpeg")
  if (!(await hasFfprobe())) missing.push("ffprobe")
  return missing
}

export function mediaRequirementMessage(missing) {
  return (
    `❌ *متطلب ناقص على السيرفر:* ${missing.join(" · ")}\n\n` +
    `> المكالمات ذات الوسائط تحتاج *ffmpeg* و*ffprobe*.\n` +
    `> *Debian/Ubuntu:* \`apt-get install -y ffmpeg\`\n` +
    `> *Alpine:* \`apk add ffmpeg\`\n` +
    `> المكالمات الصامتة (*.مكالمة <رقم>*) تعمل بدونها.`
  )
}

const Voip = __index.Voip;
/* ── جسر المكالمات — واجهة محرّك VoIP لإضافات البوت ──────────────────────────── */

// سجل المكالمات الجارية لكل محادثة.
const activeCalls = new Map()

const VIDEO_EXT_RE = /\.(mp4|mov|webm|mkv|avi|m4v|3gp)(\?|#|$)/i
const RESOLUTION_RE = /^(240p|360p|480p|720p|1080p)$/i

export function getVoip(sock) {
  if (!sock.voipInstance) {
    sock.voipInstance = new Voip(sock, { voipLogLevel: "warn" })
  }
  return sock.voipInstance
}

// يحلّل وسائط الأمر: روابط + ردّ على صوت/فيديو + دقة + auto/loop.
export async function parseMediaArgs(sock, msg, args, { skipIndexes = [] } = {}) {
  const rest = args.filter((_, i) => !skipIndexes.includes(i))
  const resolutionArg = rest.find((a) => RESOLUTION_RE.test(a))
  const urls = rest.filter((a) => /^https?:\/\//i.test(a) && !/call\.whatsapp\.com/i.test(a))
  const media = [...urls]
  const tempFiles = []

  const contextInfo = msg?.message?.extendedTextMessage?.contextInfo
  const quoted = contextInfo?.quotedMessage
  const mime = quoted?.audioMessage?.mimetype || quoted?.videoMessage?.mimetype || ""
  const kind = /^video/.test(mime) ? "video" : /^audio/.test(mime) ? "audio" : null

  if (kind) {
    try {
      const { downloadMediaMessage } = await import("@whiskeysockets/baileys")
      const buffer = await downloadMediaMessage(
        {
          key: {
            remoteJid: contextInfo.remoteJid || msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant
          },
          message: quoted
        },
        "buffer",
        {},
        { sock }
      )
      if (buffer) {
        const file = path.join(os.tmpdir(), `voip_${kind}_${Date.now()}${kind === "video" ? ".mp4" : ".audio"}`)
        fs.writeFileSync(file, buffer)
        tempFiles.push(file)
        media.unshift(file)
      }
    } catch {}
  }

  const isVideo = media.some((src) => VIDEO_EXT_RE.test(src))
  const finalMedia = media.length === 0 ? "silence" : media.length === 1 ? media[0] : media

  return {
    media: finalMedia,
    resolution: resolutionArg ? resolutionArg.toLowerCase() : undefined,
    autoEndCall: rest.some((a) => /^auto$/i.test(a)),
    loop: rest.some((a) => /^loop$/i.test(a)),
    isVideo,
    hasMedia: media.length > 0,
    tempFiles,
    cleanup: () => {
      for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
    }
  }
}

// يربط أحداث المكالمة بتحديث رسالة واحدة، ويُنظّف عند الانتهاء.
export function wireCallEvents({ sock, from, call, key, tempFiles = [], title = "المكالمة" }) {
  const edit = (t) =>
    key ? sock.sendMessage(from, { text: t, edit: key }).catch(() => {}) : sock.sendMessage(from, { text: t }).catch(() => {})

  const cleanup = () => {
    removeCall(from, call)
    for (const f of tempFiles) try { fs.existsSync(f) && fs.unlinkSync(f) } catch {}
  }

  call.on("ringing", () => edit(`📞 *${title} ترنّ...*`))
  call.on("connected", () => edit(`✅ *${title} جارية*\n> *.إغلاق* للإنهاء · *.كتم* للكتم · *.رفع-يد* · *.مشاركة-شاشة*`))
  call.on("downgraded", () => sock.sendMessage(from, { text: "🎥 أُوقفت الكاميرات، تحوّلت المكالمة إلى صوتية." }).catch(() => {}))
  call.on("ended", (reason) => {
    cleanup()
    edit(reason === "declined" ? `📵 *رُفضت ${title}.*` : `📴 *انتهت ${title}:* ${reason}`)
  })
  call.on("error", (err) => {
    cleanup()
    sock.sendMessage(from, { text: `❌ *خطأ في ${title}:* ${err?.message || err}` }).catch(() => {})
  })

  return { edit, cleanup }
}


export function addCall(from, call) {
  if (!activeCalls.has(from)) activeCalls.set(from, new Set())
  activeCalls.get(from).add(call)
}

export function removeCall(from, call) {
  const calls = activeCalls.get(from)
  if (!calls) return
  calls.delete(call)
  if (calls.size === 0) activeCalls.delete(from)
}

export function currentCall(from) {
  const calls = activeCalls.get(from)
  if (!calls || calls.size === 0) return null
  return [...calls][calls.size - 1]
}

export function callsOf(from) {
  return [...(activeCalls.get(from) ?? [])]
}

// يستخرج أعضاء المجموعة كأرقام (يستثني البوت نفسه)، مع حلّ معرّفات @lid.
export async function groupMemberNumbers(ctx) {
  const { groupMeta, sock, resolveLid } = ctx
  const participants = groupMeta?.participants ?? []
  const selfNums = new Set(
    [sock?.user?.id, sock?.user?.lid]
      .filter(Boolean)
      .map((j) => String(j).split(/[:@]/)[0])
  )

  const numbers = []
  const seen = new Set()
  for (const p of participants) {
    // phoneNumber (PN) هو الأنسب للمكالمات؛ فإن غاب وكان المعرّف @lid نحلّه.
    let jid = p.phoneNumber || p.id || ""
    if (jid.endsWith("@lid") && resolveLid) {
      try { jid = (await resolveLid(jid)) || jid } catch {}
    }
    if (!jid) continue
    const num = String(jid).split(/[:@]/)[0].replace(/\D/g, "")
    if (!num || num.length < 6) continue
    if (selfNums.has(num) || seen.has(num)) continue
    seen.add(num)
    numbers.push(num)
  }
  return numbers
}
