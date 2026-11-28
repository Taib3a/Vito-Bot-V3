import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 20 * 1024 * 1024;

const API_URL = process.env.IMAGE_API_URL || 'https://api.openai.com/v1/images/generations';
const EDIT_URL = process.env.IMAGE_EDIT_URL || '';
const API_KEY = process.env.IMAGE_API_KEY || '';
const MODEL = process.env.IMAGE_MODEL || 'gpt-image-1';
const LIVE = Boolean(API_KEY);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const json = (res, code, body) => {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store'
  });
  res.end(data);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('الطلب أكبر من الحد المسموح'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/* ---------- demo renderer ---------- */
const xml = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function wrap(text, perLine = 34, maxLines = 3) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > perLine && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  return lines;
}

function demoImage({ prompt, size, image, tool }) {
  const [w, h] = String(size || '1024x1024').split('x').map(Number);
  const hash = crypto.createHash('sha256').update(String(prompt) + tool).digest();
  const hue = hash[0] * 360 / 255;
  const hue2 = (hue + 55 + hash[1] / 4) % 360;
  const lines = wrap(prompt || 'STARX', 34, 3);

  const art = image
    ? `<image href="${xml(image)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" opacity="0.92"/>
       <rect width="${w}" height="${h}" fill="url(#tint)" opacity="0.35"/>`
    : `<circle cx="${w * 0.28}" cy="${h * 0.3}" r="${w * 0.3}" fill="hsla(${hue},90%,65%,.55)" filter="url(#soft)"/>
       <circle cx="${w * 0.74}" cy="${h * 0.66}" r="${w * 0.28}" fill="hsla(${hue2},85%,60%,.5)" filter="url(#soft)"/>
       <circle cx="${w * 0.6}" cy="${h * 0.2}" r="${w * 0.16}" fill="hsla(${(hue + 180) % 360},80%,70%,.4)" filter="url(#soft)"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,10%)"/>
      <stop offset="1" stop-color="hsl(${hue2},50%,6%)"/>
    </linearGradient>
    <linearGradient id="tint" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsla(${hue},90%,60%,.5)"/>
      <stop offset="1" stop-color="hsla(${hue2},90%,55%,.45)"/>
    </linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="rgba(0,0,0,0)"/>
      <stop offset="1" stop-color="rgba(0,0,0,.78)"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="${w * 0.08}"/></filter>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${art}
  <rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.5"/>
  <rect width="${w}" height="${h * 0.42}" y="${h * 0.58}" fill="url(#shade)"/>
  <g font-family="Segoe UI, system-ui, sans-serif" direction="rtl" text-anchor="end">
    <text x="${w - 56}" y="${h - 96}" fill="rgba(255,255,255,.92)" font-size="${Math.round(w * 0.028)}">${xml(lines.join(' ')).slice(0, 150)}</text>
    <text x="${w - 56}" y="${h - 52}" fill="rgba(255,255,255,.55)" font-size="${Math.round(w * 0.019)}" letter-spacing="3">STARX · ${xml(tool || 'generate').toUpperCase()}</text>
  </g>
</svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

/* ---------- live upstream ---------- */
async function callUpstream({ prompt, size, n, image, tool }) {
  const useEdit = Boolean(image && EDIT_URL);
  const url = useEdit ? EDIT_URL : API_URL;
  const payload = useEdit
    ? { model: MODEL, prompt: prompt || 'حسّن الصورة', image, size, n }
    : { model: MODEL, prompt: prompt || 'abstract art', size, n };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || 'خطأ من مزوّد الصور (' + res.status + ')');
    const items = (data.data || []).map((d) => d.b64_json ? 'data:image/png;base64,' + d.b64_json : d.url).filter(Boolean);
    if (!items.length) throw new Error('لم يرجع المزوّد أي صورة');
    return items;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- static ---------- */
async function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) return json(res, 403, { ok: false, error: 'forbidden' });
  try {
    const buf = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  } catch {
    json(res, 404, { ok: false, error: 'not found' });
  }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/health') {
    return json(res, 200, { ok: true, mode: LIVE ? 'live' : 'demo', model: MODEL });
  }

  if (url.pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = JSON.parse((await readBody(req)) || '{}');
      const prompt = String(body.prompt || '').slice(0, 2000);
      const size = /^\d{3,4}x\d{3,4}$/.test(body.size) ? body.size : '1024x1024';
      const n = Math.min(Math.max(Number(body.n) || 1, 1), 4);
      const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;
      const tool = String(body.tool || 'generate');

      if (LIVE && (!image || EDIT_URL)) {
        const images = await callUpstream({ prompt, size, n, image, tool });
        return json(res, 200, { ok: true, mode: 'live', images });
      }

      const images = Array.from({ length: n }, () => demoImage({ prompt, size, image, tool }));
      return json(res, 200, { ok: true, mode: 'demo', images });
    } catch (err) {
      return json(res, 400, { ok: false, error: err.message || 'خطأ غير متوقع' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, error: 'method not allowed' });
  }
  await serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`STARX → http://localhost:${PORT}  (${LIVE ? 'live: ' + MODEL : 'وضع تجريبي — أضف IMAGE_API_KEY للتوليد الحقيقي'})`);
});
