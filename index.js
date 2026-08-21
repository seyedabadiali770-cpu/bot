'use strict';

/**
 * 🐶 DogsVPN — ربات تلگرامی کانفیگ‌ساز رایگان
 * تمام امکانات بدون پرداخت — برای همیشه رایگان ♾️
 *
 * دو حالت کار:
 *  ۱) حالت «استخر رایگان» (پیش‌فرض، بدون نیاز به سرور):
 *     ربات هر FETCH_INTERVAL_MIN دقیقه از منابع عمومی (FREE_SOURCES)
 *     کانفیگ‌های رایگان واقعی را می‌گیرد، پینگ می‌کند و فقط سرورهای زنده را می‌دهد.
 *  ۲) حالت «پنل اختصاصی» (اگر XUI_* ست شود):
 *     کاربر واقعی روی پنل 3x-ui ساخته می‌شود و کانفیگ اختصاصی می‌گیرد.
 *
 * متغیرهای محیطی:
 *  BOT_TOKEN (اجباری) — توکن ربات از @BotFather
 *  BOT_NAME / BOT_USERNAME / BASE_URL / PORT
 *  FREE_SOURCES — JSON آرایه‌ای از آدرس سابسکریپشن‌های رایگان
 *  POOL_SIZE — حداکثر سرورهای زنده نگه‌داشته‌شده (پیش‌فرض 40)
 *  FETCH_INTERVAL_MIN — بازه آپدیت استخر (پیش‌فرض 120)
 *  SERVERS_JSON — سرورهای ثابت برای حالت پنل (اختیاری)
 *  SS_METHOD / VLESS_FLOW / SNI / WG_SERVER_PUBLIC_KEY
 *  XUI_BASE_URL / XUI_USERNAME / XUI_PASSWORD / XUI_INBOUND_IDS / XUI_CONFIG_HOST
 *  DEMO_USER — برای تست محلی
 */

const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ─────────────────────────── تنظیمات ─────────────────────────── */

const BOT_TOKEN = (process.env.BOT_TOKEN || process.env.TOKEN || '').trim() || '8688771229:AAGDp0G4pY2-Wky7utOaL0It66gj8MZdR1Q';
if (!process.env.BOT_TOKEN) {
  console.warn('⚠️ BOT_TOKEN در متغیرهای محیطی نبود؛ از توکن پیش‌فرض استفاده شد.');
}
if (!BOT_TOKEN) {
  console.error('❌ توکن ربات تنظیم نشده است.');
  process.exit(1);
}

const BOT_NAME = process.env.BOT_NAME || '🐶 DogsVPN';
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace('@', '');
// آدرس عمومی: اول متغیر BASE_URL، بعد دامنه خودکار Railway، بعد خالی
const BASE_URL = (process.env.BASE_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')).replace(/\/+$/, '');
const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3000);
const SS_METHOD = process.env.SS_METHOD || 'aes-256-gcm';
const VLESS_FLOW = process.env.VLESS_FLOW || '';
const SNI = process.env.SNI || '';
const WG_SERVER_PUBLIC_KEY = process.env.WG_SERVER_PUBLIC_KEY || '';

// پنل 3x-ui (اختیاری)
const XUI = {
  base: (process.env.XUI_BASE_URL || '').replace(/\/+$/, ''),
  username: process.env.XUI_USERNAME || '',
  password: process.env.XUI_PASSWORD || '',
  inboundIds: (process.env.XUI_INBOUND_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean),
  configHost: process.env.XUI_CONFIG_HOST || '',
};
const XUI_ENABLED = !!(XUI.base && XUI.username && XUI.password);

/* ─────────────────────────── لیست سرورهای ثابت (حالت پنل) ─────────────────────────── */

const DEFAULT_SERVERS = [
  { id: 'de', flag: '🇩🇪', name: 'آلمان',    host: '185.244.181.12', port: 443, security: 'tls', network: 'tcp' },
  { id: 'nl', flag: '🇳🇱', name: 'هلند',     host: '194.36.88.45',   port: 443, security: 'tls', network: 'tcp' },
  { id: 'fr', flag: '🇫🇷', name: 'فرانسه',   host: '195.58.39.78',   port: 443, security: 'tls', network: 'tcp' },
  { id: 'us', flag: '🇺🇸', name: 'آمریکا',   host: '198.54.128.99',  port: 443, security: 'tls', network: 'tcp' },
  { id: 'gb', flag: '🇬🇧', name: 'انگلیس',   host: '185.102.219.33', port: 443, security: 'tls', network: 'tcp' },
  { id: 'ca', flag: '🇨🇦', name: 'کانادا',   host: '212.80.246.77',  port: 443, security: 'tls', network: 'tcp' },
  { id: 'jp', flag: '🇯🇵', name: 'ژاپن',     host: '185.198.56.89',  port: 443, security: 'tls', network: 'tcp' },
  { id: 'sg', flag: '🇸🇬', name: 'سنگاپور',  host: '185.244.180.44', port: 443, security: 'tls', network: 'tcp' },
  { id: 'tr', flag: '🇹🇷', name: 'ترکیه',    host: '194.36.89.22',   port: 443, security: 'tls', network: 'tcp' },
];

let SERVERS = DEFAULT_SERVERS;
try {
  if (process.env.SERVERS_JSON) {
    SERVERS = JSON.parse(process.env.SERVERS_JSON);
    if (!Array.isArray(SERVERS) || !SERVERS.length) throw new Error('empty');
  }
} catch (e) {
  console.warn('⚠️ SERVERS_JSON نامعتبر است؛ از لیست پیش‌فرض استفاده می‌شود.');
  SERVERS = DEFAULT_SERVERS;
}

function getServer(id) {
  return SERVERS.find(s => s.id === id) || SERVERS[0];
}

/* ─────────────────────────── ذخیره‌سازی کاربران ─────────────────────────── */

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'users.json');

let users = {};
try { users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {}; } catch (e) { users = {}; }

function saveUsers() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
  } catch (e) {
    console.warn('⚠️ ذخیره‌سازی دیتا ممکن نشد:', e.message);
  }
}

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function getUser(chatId) {
  const id = String(chatId);
  if (!users[id]) {
    users[id] = {
      chatId: id,
      uuid: genUUID(),
      ssPass: crypto.randomBytes(16).toString('base64url'),
      wgPriv: crypto.randomBytes(32).toString('base64url'),
      serverId: SERVERS[0].id,
      createdAt: new Date().toISOString(),
    };
    saveUsers();
  }
  return users[id];
}

function findByUuid(uuid) {
  return Object.values(users).find(u => u.uuid === uuid) || null;
}

/* ─────────────────────────── ابزارها ─────────────────────────── */

function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

function testPing(host, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(4000);
    const t = Date.now();
    socket.on('connect', () => { socket.destroy(); resolve(Date.now() - t); });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    try { socket.connect(port, host); } catch (e) { resolve(null); }
  });
}

function cfgName(s) {
  return `${BOT_NAME} — ${s.flag || ''} ${s.name || ''}`.trim();
}

/* ─────────────────────────── استخر سرورهای رایگان ─────────────────────────── */

const POOL_FILE = path.join(DATA_DIR, 'pool.json');

let pool = { fetchedAt: 0, links: [], fetching: false };
try {
  const saved = safeParse(fs.readFileSync(POOL_FILE, 'utf8'), null);
  if (saved && Array.isArray(saved.links)) pool = { fetchedAt: saved.fetchedAt || 0, links: saved.links, fetching: false };
} catch (e) { /* اولین اجرا */ }

const DEFAULT_FREE_SOURCES = [
  'https://raw.githubusercontent.com/freefq/free/master/v2',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
];

let FREE_SOURCES = DEFAULT_FREE_SOURCES;
try {
  if (process.env.FREE_SOURCES) {
    const arr = JSON.parse(process.env.FREE_SOURCES);
    if (Array.isArray(arr) && arr.length) FREE_SOURCES = arr;
  }
} catch (e) { /* پیش‌فرض */ }

const POOL_SIZE = Math.max(5, Number(process.env.POOL_SIZE || 40));
const FETCH_INTERVAL_MS = Math.max(15, Number(process.env.FETCH_INTERVAL_MIN || 120)) * 60000;
const POOL_REFRESH_MS = Math.max(2, Number(process.env.POOL_REFRESH_MIN || 30)) * 60000;
// فقط برای تست: بدون تست پینگ همه لینک‌ها نگه داشته می‌شوند
const POOL_NO_PING = process.env.POOL_NO_PING === '1';

/* پارس لینک‌های کانفیگ */

const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9.\-]*$/;

function validHostPort(host, port) {
  return !!host && HOST_RE.test(host) && port > 0 && port <= 65535;
}

function parseVmessB64(b64) {
  try {
    const o = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!o.add || !o.port || !o.id) return null;
    const host = String(o.add).trim();
    const port = Number(o.port);
    if (!validHostPort(host, port)) return null;
    return {
      proto: 'vmess',
      host,
      port,
      id: String(o.id).trim(),
      aid: String(o.aid || '0'),
      security: (o.tls === 'tls' || o.tls === true) ? 'tls' : 'none',
      network: String(o.net || 'tcp'),
      path: String(o.path || ''),
      hostHeader: String(o.host || ''),
      sni: String(o.sni || ''),
    };
  } catch (e) { return null; }
}

function parseVlessTrojan(link) {
  try {
    const u = new URL(link);
    const proto = u.protocol.replace(':', '');
    if (proto !== 'vless' && proto !== 'trojan') return null;
    const p = u.searchParams;
    const sec = p.get('security') || (proto === 'trojan' ? 'tls' : 'none');
    const host = u.hostname;
    const port = Number(u.port || (sec === 'none' ? 80 : 443));
    if (!validHostPort(host, port) || !u.username) return null;
    return {
      proto,
      host,
      port,
      id: decodeURIComponent(u.username),
      security: sec,
      network: p.get('type') || 'tcp',
      path: p.get('path') || '',
      hostHeader: p.get('host') || '',
      sni: p.get('sni') || '',
      flow: p.get('flow') || '',
      pbk: p.get('pbk') || '',
      sid: p.get('sid') || '',
      fp: p.get('fp') || '',
    };
  } catch (e) { return null; }
}

function parseSs(link) {
  try {
    let rest = link.slice(5);
    if (rest.includes('@')) {
      // ss://base64(method:pass)@host:port#name
      const at = rest.indexOf('@');
      const hp = rest.slice(at + 1).split('#')[0];
      const colon = hp.lastIndexOf(':');
      if (colon <= 0) return null;
      const [method, pass] = Buffer.from(rest.slice(0, at), 'base64').toString('utf8').split(':');
      if (!method || !pass) return null;
      const host = hp.slice(0, colon);
      const port = Number(hp.slice(colon + 1));
      if (!validHostPort(host, port)) return null;
      return { proto: 'ss', host, port, method, ssPass: pass };
    }
    // ss://base64(method:pass@host:port)#name
    const core = rest.split('#')[0];
    const dec = Buffer.from(core, 'base64').toString('utf8');
    const at = dec.lastIndexOf('@');
    if (at <= 0) return null;
    const hp = dec.slice(at + 1);
    const colon = hp.lastIndexOf(':');
    if (colon <= 0) return null;
    const [method, pass] = dec.slice(0, at).split(':');
    if (!method || !pass) return null;
    const host = hp.slice(0, colon);
    const port = Number(hp.slice(colon + 1));
    if (!validHostPort(host, port)) return null;
    return { proto: 'ss', host, port, method, ssPass: pass };
  } catch (e) { return null; }
}

function parseLink(line) {
  const l = String(line || '').trim();
  if (!l || !l.includes('://')) return null;
  if (l.startsWith('vmess://')) {
    const rest = l.slice(8).split('#')[0];
    if (rest.includes('@')) return null; // فرم جدید vmess پشتیبانی نمی‌شود
    return parseVmessB64(rest);
  }
  if (l.startsWith('vless://') || l.startsWith('trojan://')) return parseVlessTrojan(l);
  if (l.startsWith('ss://')) return parseSs(l);
  return null;
}

/* دریافت منابع */

async function httpGet(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.text();
}

async function fetchSource(url) {
  let body;
  try {
    body = await httpGet(url);
  } catch (e) {
    // fallback: raw.githubusercontent.com از این سندباکس مسدود است → api.github.com
    const m = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
    if (!m) throw e;
    const apiUrl = `https://api.github.com/repos/${m[1]}/${m[2]}/contents/${m[4]}?ref=${m[3]}`;
    const j = safeParse(await httpGet(apiUrl), null);
    if (!j || !j.content) throw new Error('api github: empty');
    body = Buffer.from(j.content, 'base64').toString('utf8');
  }
  const lines = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.some(l => l.includes('://'))) return lines;
  // احتمالاً base64 کل بدنه
  try {
    const dec = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    const dlines = dec.split(/\r?\n/).map(s => s.trim()).filter(s => s.includes('://'));
    if (dlines.length) return dlines;
  } catch (e) { /* not base64 */ }
  return lines;
}

/* ساخت و به‌روزرسانی استخر */

async function buildPool() {
  const all = [];
  for (const url of FREE_SOURCES) {
    try {
      const lines = await fetchSource(url);
      for (const l of lines) {
        const o = parseLink(l);
        if (o) all.push(o);
      }
      console.log(`📥 منبع استخر: ${url} → ${lines.length} لینک، ${all.length} پارس‌شده`);
    } catch (e) {
      console.warn(`⚠️ منبع استخر در دسترس نبود: ${url} — ${e.message}`);
    }
  }

  // حذف تکراری‌ها
  const seen = new Set();
  const uniq = [];
  for (const o of all) {
    const k = o.proto + '|' + o.host + '|' + o.port + '|' + (o.id || o.ssPass);
    if (!seen.has(k)) { seen.add(k); uniq.push(o); }
  }

  let links = uniq;
  if (!POOL_NO_PING) {
    // تست زنده‌بودن با پینگ
    const hosts = [...new Set(uniq.map(o => o.host + ':' + o.port))];
    const pings = new Map();
    let idx = 0;
    const worker = async () => {
      while (idx < hosts.length) {
        const key = hosts[idx++];
        const sep = key.lastIndexOf(':');
        pings.set(key, await testPing(key.slice(0, sep), Number(key.slice(sep + 1))));
      }
    };
    await Promise.all(Array.from({ length: Math.min(12, hosts.length) }, worker));
    const alive = uniq.filter(o => pings.get(o.host + ':' + o.port) !== null);
    alive.forEach(o => { o.ping = pings.get(o.host + ':' + o.port); });
    alive.sort((a, b) => a.ping - b.ping);
    links = alive.slice(0, POOL_SIZE);
    console.log(`✅ استخر: ${alive.length} سرور زنده از ${uniq.length} → ${links.length} نگه‌داشته شد`);
  } else {
    links = uniq.slice(0, POOL_SIZE);
    console.log(`🧪 حالت تست: ${links.length} سرور بدون تست پینگ نگه داشته شد`);
  }

  pool = { fetchedAt: Date.now(), links, fetching: false };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(POOL_FILE, JSON.stringify(pool, null, 2));
  } catch (e) { /* غیرحیاتی */ }
}

async function ensurePool() {
  if (pool.fetching) return;
  if (pool.links.length && Date.now() - pool.fetchedAt < POOL_REFRESH_MS) return;
  pool.fetching = true;
  try { await buildPool(); } catch (e) { console.warn('⚠️ به‌روزرسانی استخر ناموفق:', e.message); }
}

/* ─────────────────────────── ساخت لینک کانفیگ ─────────────────────────── */

function buildLink(proto, u, s) {
  const name = encodeURIComponent(cfgName(s));

  if (proto === 'vless') {
    const q = new URLSearchParams();
    q.set('encryption', 'none');
    q.set('security', s.security || 'tls');
    if (VLESS_FLOW || s.flow) q.set('flow', VLESS_FLOW || s.flow);
    q.set('type', s.network || 'tcp');
    if (s.path) q.set('path', s.path);
    if (s.hostHeader) q.set('host', s.hostHeader);
    if (s.security === 'reality') {
      q.set('sni', s.sni || SNI || s.host);
      q.set('fp', s.fp || 'chrome');
      if (s.pbk) q.set('pbk', s.pbk);
      if (s.sid) q.set('sid', s.sid);
    } else if (s.security === 'tls') {
      q.set('sni', SNI || s.sni || s.host);
    }
    return `vless://${u.uuid}@${s.host}:${s.port}?${q.toString()}#${name}`;
  }

  if (proto === 'vmess') {
    const obj = {
      v: '2',
      ps: cfgName(s),
      add: s.host,
      port: Number(s.port),
      id: u.uuid,
      aid: '0',
      scy: 'auto',
      net: s.network || 'tcp',
      type: 'none',
      host: s.hostHeader || '',
      path: s.path || '',
      tls: (s.security === 'reality' || s.security === 'tls') ? 'tls' : '',
      sni: SNI || s.sni || s.host,
    };
    return 'vmess://' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  }

  if (proto === 'trojan') {
    const q = new URLSearchParams();
    q.set('security', s.security === 'none' ? 'none' : 'tls');
    q.set('type', s.network || 'tcp');
    if (s.path) q.set('path', s.path);
    if (s.hostHeader) q.set('host', s.hostHeader);
    if (s.security !== 'none') q.set('sni', SNI || s.sni || s.host);
    return `trojan://${u.uuid}@${s.host}:${s.port}?${q.toString()}#${name}`;
  }

  if (proto === 'ss') {
    const method = s.method || SS_METHOD;
    const payload = Buffer.from(`${method}:${u.ssPass}`, 'utf8').toString('base64');
    return `ss://${payload}@${s.host}:${s.port}#${name}`;
  }

  if (proto === 'wg') {
    return [
      '[Interface]',
      `PrivateKey = ${u.wgPriv}`,
      'Address = 10.0.0.2/32',
      'DNS = 1.1.1.1',
      'MTU = 1420',
      '',
      '[Peer]',
      `PublicKey = ${WG_SERVER_PUBLIC_KEY || 'YOUR_SERVER_PUBLIC_KEY'}`,
      `Endpoint = ${s.host}:${s.port}`,
      'AllowedIPs = 0.0.0.0/0, ::/0',
      'PersistentKeepalive = 25',
    ].join('\n');
  }

  return '';
}

function buildSubscription(u) {
  const s = getServer(u.serverId);
  return ['vless', 'vmess', 'trojan', 'ss']
    .map(p => buildLink(p, u, s))
    .join('\n');
}

/* بازسازی لینک سرور استخر با برند خودمان */
function poolLink(o) {
  const s = {
    host: o.host,
    port: o.port,
    security: o.security || 'none',
    network: o.network || 'tcp',
    path: o.path || '',
    hostHeader: o.hostHeader || '',
    sni: o.sni || '',
    flow: o.flow || '',
    pbk: o.pbk || '',
    sid: o.sid || '',
    fp: o.fp || '',
    method: o.method || '',
    flag: '🆓',
    name: 'رایگان',
  };
  const creds = { uuid: o.id || o.ssPass || genUUID(), ssPass: o.ssPass || o.id || genUUID() };
  return buildLink(o.proto, creds, s);
}

/* ─────────────────────────── اتصال به پنل 3x-ui (اختیاری) ─────────────────────────── */

const xuiCache = { cookie: '', inbounds: [], at: 0 };

async function xuiFetch(pathname, opts = {}) {
  const res = await fetch(XUI.base + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: xuiCache.cookie },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('x-ui http ' + res.status);
  return res;
}

async function xuiLogin() {
  const res = await fetch(XUI.base + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: XUI.username, password: XUI.password }),
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  });
  const cookies = [];
  const raw = res.headers.get('set-cookie') || '';
  raw.split(',').forEach(c => { const p = c.split(';')[0].trim(); if (p) cookies.push(p); });
  if (res.headers.getSetCookie) {
    res.headers.getSetCookie().forEach(c => cookies.push(c.split(';')[0]));
  }
  if (!cookies.length) throw new Error('x-ui login failed');
  xuiCache.cookie = cookies.join('; ');
}

async function xuiList() {
  if (xuiCache.inbounds.length && Date.now() - xuiCache.at < 5 * 60 * 1000) return xuiCache.inbounds;
  const res = await xuiFetch('/panel/api/inbounds/list');
  const data = await res.json();
  const inbounds = (data.obj || []).filter(ib => !XUI.inboundIds.length || XUI.inboundIds.includes(ib.id));
  xuiCache.inbounds = inbounds;
  xuiCache.at = Date.now();
  return inbounds;
}

function ibToOpts(ib) {
  const ss = safeParse(ib.streamSettings, {});
  const sec = ss.security || 'none';
  const net = ss.network || 'tcp';
  const o = {
    host: XUI.configHost || ib.remark || 'SERVER',
    port: ib.port,
    security: sec === 'reality' ? 'reality' : (sec === 'tls' ? 'tls' : 'none'),
    network: net,
    flow: '',
    path: '',
    hostHeader: '',
    sni: '',
    pbk: '',
    sid: '',
    fp: '',
  };
  if (net === 'ws' && ss.wsSettings) {
    o.path = ss.wsSettings.path || '';
    o.hostHeader = ss.wsSettings.host || '';
  }
  if (net === 'grpc' && ss.grpcSettings) {
    o.path = ss.grpcSettings.serviceName || '';
  }
  if (sec === 'reality' && ss.realitySettings) {
    o.pbk = ss.realitySettings.publicKey || '';
    o.sid = (ss.realitySettings.shortIds || [''])[0] || '';
    o.sni = (ss.realitySettings.serverNames || [''])[0] || '';
    o.fp = 'chrome';
    o.flow = 'xtls-rprx-vision';
  }
  if (sec === 'tls' && ss.tlsSettings) {
    o.sni = ss.tlsSettings.serverName || XUI.configHost || '';
  }
  const map = { vless: 'vless', vmess: 'vmess', trojan: 'trojan', shadowsocks: 'ss' };
  return { proto: map[String(ib.protocol || '').toLowerCase()] || '', srvOpts: o };
}

async function xuiEnsureClients(u) {
  try { await xuiLogin(); } catch (e) { /* کوکی قبلی ممکن است هنوز معتبر باشد */ }
  const inbounds = await xuiList();
  for (const ib of inbounds) {
    const settings = safeParse(ib.settings, {});
    const clients = Array.isArray(settings.clients) ? settings.clients : [];
    if (clients.some(c => c && c.id === u.uuid)) continue;
    const client = { id: u.uuid, email: 'tg_' + u.chatId, enable: true, expiryTime: 0, limitIp: 0, totalGB: 0, subId: u.uuid };
    const body = JSON.stringify({ id: ib.id, settings: JSON.stringify({ ...settings, clients: [...clients, client] }) });
    const res = await xuiFetch('/panel/api/inbounds/' + ib.id + '/addClient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.success === false) throw new Error('addClient rejected');
    console.log('✅ کاربر روی اینباند', ib.id, 'ساخته شد');
  }
  return inbounds.map(ibToOpts).filter(x => x.proto);
}

/* ─────────────────────────── ربات تلگرام ─────────────────────────── */

const bot = new Telegraf(BOT_TOKEN);

const mainMenu = Markup.inlineKeyboard([
  [Markup.button.callback('📥 کانفیگ جدید', 'menu:config')],
  [Markup.button.callback('🔗 لینک اشتراک', 'menu:sub')],
  [Markup.button.callback('🌍 تغییر سرور', 'menu:server')],
  [Markup.button.callback('📊 وضعیت من', 'menu:status')],
  [Markup.button.callback('📖 راهنما', 'menu:help')],
]);

const protoMenu = Markup.inlineKeyboard([
  [Markup.button.callback('⚡ VLESS', 'cfg:vless'), Markup.button.callback('📡 VMess', 'cfg:vmess')],
  [Markup.button.callback('🔴 Trojan', 'cfg:trojan'), Markup.button.callback('🟢 Shadowsocks', 'cfg:ss')],
  [Markup.button.callback('🟡 WireGuard', 'cfg:wg')],
  [Markup.button.callback('🔙 منو', 'menu:back')],
]);

function backBtn() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 منو', 'menu:back')]]);
}

function serverMenu() {
  const rows = [];
  for (let i = 0; i < SERVERS.length; i += 2) {
    const row = [Markup.button.callback(`${SERVERS[i].flag} ${SERVERS[i].name}`, `srv:${SERVERS[i].id}`)];
    if (SERVERS[i + 1]) row.push(Markup.button.callback(`${SERVERS[i + 1].flag} ${SERVERS[i + 1].name}`, `srv:${SERVERS[i + 1].id}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 منو', 'menu:back')]);
  return Markup.inlineKeyboard(rows);
}

const PROTOS = { vless: 'VLESS', vmess: 'VMess', trojan: 'Trojan', ss: 'Shadowsocks', wg: 'WireGuard' };

function welcomeText() {
  const mode = XUI_ENABLED ? '🛰 پنل اختصاصی' : '🆓 استخر سرورهای رایگان (به‌روزرسانی خودکار)';
  return [
    `${BOT_NAME}`,
    '━━━━━━━━━━━━━━━',
    '✅ *کاملاً رایگان برای همیشه*',
    '🚫 بدون پرداخت، بدون اشتراک، بدون محدودیت',
    '',
    `✨ حالت فعلی: ${mode}`,
    '▫️ کانفیگ: VLESS ،VMess ،Trojan ،Shadowsocks ،WireGuard',
    '▫️ لینک اشتراک اختصاصی برای همه دستگاه‌ها',
    '',
    '👇 از منو انتخاب کن:',
  ].join('\n');
}

async function sendWelcome(ctx) {
  const logo = path.join(__dirname, 'logo.png');
  const opts = { reply_markup: mainMenu.reply_markup };
  try {
    if (fs.existsSync(logo)) {
      await ctx.replyWithPhoto({ source: logo }, { caption: welcomeText(), ...opts });
    } else {
      await ctx.reply(welcomeText(), opts);
    }
  } catch (e) {
    try { await ctx.reply(welcomeText(), opts); } catch (e2) { /* ignore */ }
  }
}

bot.start(async ctx => {
  getUser(ctx.from.id);
  await sendWelcome(ctx).catch(() => {});
});

bot.command(['help', 'menu'], async ctx => {
  await ctx.reply('📌 منوی اصلی', { reply_markup: mainMenu.reply_markup }).catch(() => {});
});

bot.command('status', async ctx => {
  const u = getUser(ctx.from.id);
  const lines = [
    '📊 *وضعیت حساب*',
    '',
    `👤 نام: ${ctx.from.first_name || '—'}`,
    `🆔 آیدی: \`${u.chatId}\``,
    `🔑 UUID: \`${u.uuid}\``,
    `📅 عضویت: ${u.createdAt.slice(0, 10)}`,
  ];
  if (XUI_ENABLED) {
    const srv = getServer(u.serverId);
    lines.push(`🌍 سرور: ${srv.flag} ${srv.name} — \`${srv.host}:${srv.port}\``);
  } else {
    lines.push(`🆓 استخر رایگان: ${pool.links.length} سرور زنده`);
    lines.push(`🔄 آخرین آپدیت: ${pool.fetchedAt ? new Date(pool.fetchedAt).toLocaleString('fa-IR') : 'در حال بارگیری...'}`);
  }
  lines.push('', '💰 هزینه: **رایگان ♾️**', '⏳ انقضا: ندارد — برای همیشه فعال');
  if (BASE_URL) lines.push('', `🔗 اشتراک: \`${BASE_URL}/sub/${u.uuid}\``);
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup }).catch(() => {});
});

bot.command('sub', async ctx => {
  const u = getUser(ctx.from.id);
  if (!BASE_URL) {
    return ctx.reply('⚠️ لینک اشتراک هنوز فعال نشده؛ کمی بعد تلاش کن.').catch(() => {});
  }
  const text = [
    '🔗 *لینک اشتراک اختصاصی تو*',
    '',
    `\`${BASE_URL}/sub/${u.uuid}\``,
    '',
    '📲 نحوه استفاده:',
    '▫️ اپ v2rayNG / Streisand / NekoBox / Hiddify',
    '▫️ ➕ Import from Clipboard',
    '▫️ همه کانفیگ‌ها با یک لینک آپدیت می‌شوند 🔄',
    '',
    '🔒 لینک مال خودته — با کسی share نکن!',
  ].join('\n');
  await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: mainMenu.reply_markup }).catch(() => {});
});

bot.action('menu:back', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText('📌 منوی اصلی', { reply_markup: mainMenu.reply_markup }).catch(() => {});
});

bot.action('menu:config', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText('📥 کدام پروتکل؟', { reply_markup: protoMenu.reply_markup }).catch(() => {});
});

bot.action('menu:server', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  if (XUI_ENABLED) {
    await ctx.editMessageText('🌍 سرور مورد نظرت رو انتخاب کن:', { reply_markup: serverMenu().reply_markup }).catch(() => {});
  } else {
    const text = [
      '🌍 *حالت استخر رایگان*',
      '',
      'سرورها به‌صورت خودکار از بین سرورهای رایگانِ در دسترس انتخاب می‌شوند و هر چند ساعت آپدیت می‌شوند.',
      '',
      `🔢 الان ${pool.links.length} سرور زنده توی استخر هست.`,
    ].join('\n');
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: backBtn().reply_markup }).catch(() => {});
  }
});

bot.action('menu:help', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const text = [
    '📖 *راهنما*',
    '',
    '۱️⃣ اپ مناسب دستگاهت رو نصب کن:',
    '   📱 اندروید: v2rayNG یا Hiddify',
    '   🍎 آیفون: Streisand یا V2Box',
    '   💻 ویندوز: v2rayN یا Hiddify',
    '',
    '۲️⃣ از منو «📥 کانفیگ جدید» یک پروتکل انتخاب کن،',
    '   یا «🔗 لینک اشتراک» رو کپی کن.',
    '',
    '۳️⃣ توی اپ:',
    '   ➕ → Import from Clipboard',
    '',
    '▫️ همه‌چیز رایگانه، بدون محدودیت ♾️',
    XUI_ENABLED ? '▫️ سرور دلخواهت رو از «🌍 تغییر سرور» انتخاب کن' : '▫️ سرورها خودکار از استخر رایگان انتخاب می‌شوند',
    '',
    '⚠️ سرورهای رایگان عمومی هستند؛ برای حریم خصوصی بیشتر، سرور اختصاصی بهتر است.',
  ].join('\n');
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: backBtn().reply_markup }).catch(() => {});
});

bot.action('menu:sub', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const u = getUser(ctx.from.id);
  if (!BASE_URL) {
    return ctx.editMessageText('⚠️ لینک اشتراک هنوز فعال نشده؛ کمی بعد دوباره تلاش کن 🙏', { reply_markup: backBtn().reply_markup }).catch(() => {});
  }
  const text = [
    '🔗 *لینک اشتراک اختصاصی تو*',
    '',
    `\`${BASE_URL}/sub/${u.uuid}\``,
    '',
    '📲 نحوه استفاده:',
    '▫️ اپ v2rayNG / Streisand / NekoBox / Hiddify',
    '▫️ ➕ Import from Clipboard',
    '▫️ همه کانفیگ‌ها با یک لینک آپدیت می‌شوند 🔄',
    '',
    '🔒 لینک مال خودته — با کسی share نکن!',
  ].join('\n');
  await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: backBtn().reply_markup }).catch(() => {});
});

bot.action('menu:status', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const u = getUser(ctx.from.id);
  const lines = [
    '📊 *وضعیت حساب*',
    '',
    `👤 نام: ${ctx.from.first_name || '—'}`,
    `🆔 آیدی: \`${u.chatId}\``,
    `🔑 UUID: \`${u.uuid}\``,
    `📅 عضویت: ${u.createdAt.slice(0, 10)}`,
  ];
  if (XUI_ENABLED) {
    const srv = getServer(u.serverId);
    lines.push(`🌍 سرور: ${srv.flag} ${srv.name} — \`${srv.host}:${srv.port}\``);
  } else {
    lines.push(`🆓 استخر رایگان: ${pool.links.length} سرور زنده`);
    lines.push(`🔄 آخرین آپدیت: ${pool.fetchedAt ? new Date(pool.fetchedAt).toLocaleString('fa-IR') : 'در حال بارگیری...'}`);
  }
  lines.push('', '💰 هزینه: **رایگان ♾️**', '⏳ انقضا: ندارد — برای همیشه فعال');
  if (BASE_URL) lines.push('', `🔗 اشتراک: \`${BASE_URL}/sub/${u.uuid}\``);
  await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: backBtn().reply_markup }).catch(() => {});
});

bot.action(/^srv:(.+)$/, async ctx => {
  const srv = SERVERS.find(s => s.id === ctx.match[1]);
  if (!srv) return ctx.answerCbQuery('سرور پیدا نشد').catch(() => {});
  await ctx.answerCbQuery().catch(() => {});
  const u = getUser(ctx.from.id);
  u.serverId = srv.id;
  saveUsers();
  await ctx.editMessageText('⏳ تست پینگ...').catch(() => {});
  const ping = await testPing(srv.host, srv.port);
  const text = [
    '✅ *سرور تغییر کرد!*',
    '',
    `${srv.flag} ${srv.name}`,
    `🌍 \`${srv.host}:${srv.port}\``,
    `⚡ پینگ: ${ping ? ping + 'ms' : 'نامشخص'}`,
    '',
    '📥 حالا از «کانفیگ جدید» کانفیگ بگیر.',
  ].join('\n');
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📥 کانفیگ جدید', 'menu:config')],
      [Markup.button.callback('🔙 منو', 'menu:back')],
    ]),
  }).catch(() => {});
});

bot.action(/^cfg:(vless|vmess|trojan|ss|wg)$/, async ctx => {
  const proto = ctx.match[1];
  const u = getUser(ctx.from.id);
  await ctx.answerCbQuery().catch(() => {});
  await ctx.editMessageText('⏳ در حال ساخت کانفیگ...').catch(() => {});

  try {
    // ── حالت پنل اختصاصی ──
    if (XUI_ENABLED) {
      let srv = getServer(u.serverId);
      let panelNote = '';
      try {
        const opts = await xuiEnsureClients(u);
        const match = opts.find(o => o.proto === proto) || opts[0];
        if (match) {
          srv = match.srvOpts;
          panelNote = '🛰 متصل به پنل واقعی\n';
        }
      } catch (e) {
        console.warn('⚠️ اتصال به پنل x-ui ممکن نشد، کانفیگ معمولی ساخته شد:', e.message);
      }
      const link = buildLink(proto, u, srv);
      const ping = proto === 'wg' ? null : await testPing(srv.host, srv.port);
      const lines = [
        `✅ *کانفیگ ${PROTOS[proto]} ساخته شد*`,
        '',
        `${panelNote}🌍 ${srv.flag || ''} ${srv.name || ''}`,
        `📡 \`${srv.host}:${srv.port}\``,
      ];
      if (ping) lines.push(`⚡ پینگ: ${ping}ms`);
      lines.push('', '━━━━━━━━━━━━━━━', '```', link, '```', '');
      if (proto === 'wg' && !WG_SERVER_PUBLIC_KEY) {
        lines.push('⚠️ برای WireGuard، کلید عمومی سرور باید در متغیر `WG_SERVER_PUBLIC_KEY` ست شده باشد.');
        lines.push('');
      }
      lines.push('📲 لینک رو کپی کن و توی اپ Import کن.');
      await ctx.editMessageText(lines.join('\n'), {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔄 دوباره بساز', `cfg:${proto}`), Markup.button.callback('🔗 لینک اشتراک', 'menu:sub')],
          [Markup.button.callback('🔙 منو', 'menu:back')],
        ]),
      }).catch(() => {});
      return;
    }

    // ── حالت استخر رایگان ──
    if (proto === 'wg') {
      const text = [
        '🟡 *WireGuard در حالت رایگان*',
        '',
        'سرورهای رایگان عمومی معمولاً WireGuard پشتیبانی نمی‌کنند.',
        'برای WireGuard باید سرور اختصاصی با `WG_SERVER_PUBLIC_KEY` داشته باشی.',
      ].join('\n');
      return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: backBtn().reply_markup }).catch(() => {});
    }

    await ensurePool();
    const candidates = pool.links.filter(l => l.proto === proto);
    if (!candidates.length) {
      return ctx.editMessageText(
        `😔 الان سرور رایگان فعال برای ${PROTOS[proto]} در دسترس نیست.\n\nکمی بعد دوباره تلاش کن — استخر سرورها خودکار آپدیت می‌شود. 🔄`,
        { reply_markup: backBtn().reply_markup }
      ).catch(() => {});
    }

    const o = candidates[Math.floor(Math.random() * candidates.length)];
    const link = poolLink(o);
    const ping = await testPing(o.host, o.port);
    const lines = [
      `✅ *کانفیگ ${PROTOS[proto]} ساخته شد* 🆓`,
      '',
      `🌍 سرور رایگان`,
      `📡 \`${o.host}:${o.port}\``,
    ];
    if (ping) lines.push(`⚡ پینگ: ${ping}ms`);
    lines.push('', '━━━━━━━━━━━━━━━', '```', link, '```', '');
    lines.push('📲 لینک رو کپی کن و توی اپ Import کن.');
    await ctx.editMessageText(lines.join('\n'), {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 یکی دیگه بده', `cfg:${proto}`), Markup.button.callback('🔗 لینک اشتراک', 'menu:sub')],
        [Markup.button.callback('🔙 منو', 'menu:back')],
      ]),
    }).catch(() => {});
  } catch (e) {
    console.error('خطا در ساخت کانفیگ:', e.message);
    await ctx.editMessageText('❌ خطا در ساخت کانفیگ؛ دوباره تلاش کن.', { reply_markup: backBtn().reply_markup }).catch(() => {});
  }
});

bot.on('message', async ctx => {
  const text = (ctx.message && ctx.message.text) || '';
  if (text && !text.startsWith('/')) {
    await ctx.reply('📌 از منوی زیر انتخاب کن:', { reply_markup: mainMenu.reply_markup }).catch(() => {});
  }
});

bot.catch(err => console.log('Bot error:', err.message));

/* ─────────────────────────── سرور HTTP (لینک اشتراک) ─────────────────────────── */

const server = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) {
    res.writeHead(400); return res.end('400');
  }

  // صفحه وضعیت / سلامت
  if (url.pathname === '/' || url.pathname === '/health') {
    const count = Object.keys(users).length;
    const demoUser = process.env.DEMO_USER ? Object.values(users)[0] : null;
    const demoSub = demoUser ? `<p><a class="btn2" href="/sub/${demoUser.uuid}">🧪 تست لینک اشتراک نمونه</a></p>` : '';
    const tgBtn = BOT_USERNAME ? `<a class="btn" href="tg://resolve?domain=${BOT_USERNAME}">🚀 شروع در تلگرام</a>` : '';
    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BOT_NAME}</title>
<style>
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;background:linear-gradient(135deg,#0f172a,#1e293b);color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh}
  .card{background:#1e293b;border:1px solid #334155;border-radius:20px;padding:36px 40px;text-align:center;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
  h1{font-size:26px;margin:0 0 8px}
  .ok{color:#4ade80;font-weight:600}
  .free{color:#fbbf24;margin:6px 0 16px}
  .btn{display:inline-block;margin-top:14px;padding:12px 26px;border-radius:12px;background:#2563eb;color:#fff;text-decoration:none;font-weight:700}
  .btn:hover{background:#1d4ed8}
  .btn2{display:inline-block;margin-top:8px;padding:10px 20px;border-radius:12px;background:#334155;color:#93c5fd;text-decoration:none;font-weight:600;font-size:13px}
  .btn2:hover{background:#475569}
  .meta{font-size:12px;color:#94a3b8;margin-top:18px}
</style>
</head>
<body>
  <div class="card">
    <h1>🐶 ${BOT_NAME}</h1>
    <p class="ok">● ربات آنلاین است</p>
    <p class="free">♾️ کاملاً رایگان — بدون پرداخت</p>
    <p>👥 ${count} کاربر فعال</p>
    ${tgBtn}
    ${demoSub}
    <p class="meta">${new Date().toISOString()}</p>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // لینک اشتراک: /sub/{uuid}
  const m = url.pathname.match(/^\/sub\/([A-Za-z0-9-]+)$/);
  if (m) {
    const u = findByUuid(m[1]);
    if (!u) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    let sub;
    if (XUI_ENABLED) {
      sub = buildSubscription(u);
    } else {
      await ensurePool().catch(() => {});
      sub = pool.links.map(poolLink).join('\n');
    }
    const plain = url.searchParams.get('fmt') === 'plain';
    const body = plain ? sub : Buffer.from(sub, 'utf8').toString('base64');
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(body);
  }

  res.writeHead(404);
  res.end('404');
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`🌐 سرور HTTP روی پورت ${HTTP_PORT} روشن شد`);
  if (BASE_URL) console.log(`🔗 صفحه وضعیت: ${BASE_URL}/`);
});

/* ─────────────────────────── اجرا ─────────────────────────── */

// کاربر نمونه برای تست محلی (DEMO_USER=chatId)
if (process.env.DEMO_USER) {
  const demo = getUser(process.env.DEMO_USER);
  console.log('🧪 کاربر نمونه ساخته شد، UUID:', demo.uuid);
  if (BASE_URL) console.log('🔗 لینک اشتراک نمونه:', BASE_URL + '/sub/' + demo.uuid);
}

// شروع استخر رایگان (اگر پنل اختصاصی نیست)
if (!XUI_ENABLED) {
  ensurePool().catch(() => {});
  setInterval(() => ensurePool().catch(() => {}), FETCH_INTERVAL_MS);
}

console.log('🚀 در حال شروع ' + BOT_NAME + ' ...');
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('✅ ربات روشن شد!'))
  .catch(e => console.error('❌ اتصال به تلگرام ناموفق:', e.message));

const stopBot = () => { try { bot.stop('SIGINT'); } catch (e) { /* bot not running */ } };
process.once('SIGINT', stopBot);
process.once('SIGTERM', stopBot);
