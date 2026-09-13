'use strict';

/* ============================================================
   🧪 شبیه‌ساز ساده‌ی Telegram Bot API (فقط برای تست محلی)
   ------------------------------------------------------------
   هدف: بدون توکن واقعی و بدون دسترسی به اینترنت، رفتار ربات
   (ارسال پست، پنل، دکمه‌ها، خطاها) را تست کنیم.

   استفاده:
     node prompt-bot/test/telegram-mock.js 8043
   سپس متغیر TELEGRAM_API_ROOT=http://127.0.0.1:8043 را به ربات بده.

   اندپوینت‌های کنترلی:
     POST /_inject   { update }   → تزریق آپدیت (مثل پیام کاربر)
     GET  /_sent                  → لیست پیام‌های ارسال‌شده‌ی ربات
     POST /_reset                 → پاک‌کردن لیست پیام‌ها و صف آپدیت
     GET  /image/prompt/:text     → عکس PNG تستی (به‌جای pollinations)
   ============================================================ */

const http = require('http');
const zlib = require('zlib');

const PORT = Number(process.argv[2] || 8043);
const BAD_CHAT_ID = -1000000000001; // چتی که شبیه‌ساز برایش خطا می‌دهد (تست سناریوی خطا)
const CHANNEL_ID = -1001234567890; // کانال تستی

/* ───────── ساخت یک PNG واقعی ۶۴×۶۴ (بدون وابستگی خارجی) ───────── */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      raw[p++] = (x * 4) % 256;
      raw[p++] = (y * 4) % 256;
      raw[p++] = 160;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TEST_PNG = makePng(64);

/* ───────── وضعیت شبیه‌ساز ───────── */

let updateId = 1;
let sent = [];
let queue = [];
let waiters = [];

const ok = (result) => JSON.stringify({ ok: true, result });
const err = (description, code = 400) => JSON.stringify({ ok: false, error_code: code, description });

function pushUpdate(update) {
  const u = { update_id: updateId++, ...update };
  if (waiters.length) {
    const w = waiters.shift();
    w([u]);
  } else {
    queue.push(u);
  }
  return u;
}

function messageResult(chatId, extra = {}) {
  return {
    message_id: ++messageResult._id,
    from: { id: 1, is_bot: true, first_name: 'PromptBot', username: 'prompt_test_bot' },
    chat: { id: chatId, type: String(chatId).startsWith('-100') ? 'channel' : 'private' },
    date: Math.floor(Date.now() / 1000),
    ...extra,
  };
}
messageResult._id = 1000;

/* ───────── پارس مینیمال multipart (برای sendPhoto) ───────── */

function parseMultipart(body, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let idx = body.indexOf(sep);
  while (idx !== -1) {
    const next = body.indexOf(sep, idx + sep.length);
    if (next === -1) break;
    const part = body.slice(idx + sep.length + 2, next - 2); // حذف \r\n
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd > -1) {
      const headers = part.slice(0, headerEnd).toString('utf8');
      const content = part.slice(headerEnd + 4);
      const name = (headers.match(/name="([^"]+)"/) || [])[1];
      const filename = (headers.match(/filename="([^"]*)"/) || [])[1];
      parts.push({ name, filename, content, headers });
    }
    idx = next;
  }
  return parts;
}

/* ───────── سرور ───────── */

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    const json = (s) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(s);
    };

    /* --- کنترل تست --- */
    if (path === '/_inject') {
      const u = pushUpdate(JSON.parse(body.toString('utf8') || '{}'));
      return json(JSON.stringify({ ok: true, injected: u.update_id }));
    }
    if (path === '/_sent') return json(JSON.stringify(sent));
    if (path === '/_reset') {
      sent = [];
      queue = [];
      return json(JSON.stringify({ ok: true }));
    }

    /* --- عکس تستی جای pollinations --- */
    if (path.startsWith('/image/prompt/')) {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TEST_PNG.length });
      return res.end(TEST_PNG);
    }

    /* --- Bot API --- */
    const m = path.match(/^\/bot([^/]+)\/(\w+)$/);
    if (!m) {
      res.writeHead(404);
      return res.end('not found');
    }
    const method = m[2];

    if (method === 'getMe') {
      return json(ok({ id: 1, is_bot: true, first_name: 'PromptBot', username: 'prompt_test_bot' }));
    }

    if (method === 'getChat') {
      let payload = {};
      try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { /* ignore */ }
      const target = String(payload.chat_id || '');
      sent.push({ method, chat_id: target });
      if (target.includes('not_found') || target === '0' || target === BAD_CHAT_ID) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(err('Bad Request: chat not found'));
      }
      return json(ok({ id: CHANNEL_ID, type: 'channel', title: 'کانال پرامپت تست', username: 'prompt_test_ch' }));
    }

    if (method === 'getUpdates') {
      const offset = Number((JSON.parse(body.toString('utf8') || '{}') || {}).offset || 0);
      if (offset > 0) queue = queue.filter(u => u.update_id >= offset);
      if (queue.length) return json(ok(queue));
      // لانگ‌پولینگ: تا ۱۵ ثانیه منتظر آپدیت بمان
      const timer = setTimeout(() => {
        const i = waiters.indexOf(waiter);
        if (i > -1) waiters.splice(i, 1);
        json(ok([]));
      }, 15000);
      const waiter = (updates) => {
        clearTimeout(timer);
        json(ok(updates));
      };
      waiters.push(waiter);
      return;
    }

    if (method === 'deleteWebhook' || method === 'setMyCommands' || method === 'sendChatAction' ||
        method === 'answerCallbackQuery' || method === 'close' || method === 'logOut') {
      sent.push({ method, payload: body.toString('utf8').slice(0, 300) });
      return json(ok(true));
    }

    if (method === 'sendMessage' || method === 'editMessageText') {
      let payload = {};
      try { payload = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { /* ignore */ }
      if (String(payload.chat_id) === String(BAD_CHAT_ID)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(err('Bad Request: chat not found'));
      }
      sent.push({ method, chat_id: payload.chat_id, text: payload.text, parse_mode: payload.parse_mode, keyboard: !!payload.reply_markup });
      if (method === 'editMessageText') return json(ok(true));
      return json(ok(messageResult(payload.chat_id, { text: payload.text })));
    }

    if (method === 'editMessageReplyMarkup') {
      sent.push({ method, payload: body.toString('utf8').slice(0, 300) });
      return json(ok(true));
    }

    if (method === 'sendPhoto') {
      const ctype = req.headers['content-type'] || '';
      const boundary = (ctype.match(/boundary=(.+)$/) || [])[1];
      let chatId = null;
      let caption = '';
      let imageBytes = 0;
      let isPng = false;
      if (boundary) {
        const parts = parseMultipart(body, boundary.trim());
        for (const p of parts) {
          if (p.name === 'chat_id') chatId = p.content.toString('utf8').replace(/\r\n$/, '');
          if (p.name === 'caption') caption = p.content.toString('utf8');
          if (p.filename || (p.headers || '').includes('image/')) {
            imageBytes = p.content.length;
            isPng = p.content.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
          }
        }
      } else {
        try {
          const p = JSON.parse(body.toString('utf8') || '{}');
          chatId = p.chat_id;
          caption = p.caption || '';
          if (typeof p.photo === 'string') {
            sent.push({ method, chat_id: chatId, caption, customFileId: p.photo });
            return json(ok(messageResult(chatId, { caption, photo: [{ file_id: p.photo }] })));
          }
        } catch (e) { /* ignore */ }
      }
      if (String(chatId) === String(BAD_CHAT_ID)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(err('Bad Request: chat not found'));
      }
      sent.push({ method, chat_id: chatId, caption, imageBytes, isPng });
      return json(ok(messageResult(chatId, { caption, photo: [{ file_id: 'test' }] })));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(ok(true));
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🧪 شبیه‌ساز Telegram Bot API روی پورت ${PORT} فعال شد.`);
});

module.exports = { server, pushUpdate, BAD_CHAT_ID, TEST_PNG };
