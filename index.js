'use strict';

/**
 * 🐶 DogsVPN — ربات تلگرامی دوگانه (رایگان + فروشگاه VIP)
 *
 * اطلاعات کلیدی در تمامی بخش‌ها:
 *  🏷️ نام کانفیگ (Config Name)
 *  🟢 وضعیت کانفیگ (Config Status: فعال/منقضی/در حال اتصال)
 *  ⏳ مدت زمان کانفیگ (Duration: روزهای اعتبار + تاریخ دقیق انقضا + محاسبه روزهای باقی‌مانده)
 *  📊 حجم کانفیگ (Volume: حجم کل اختصاص داده شده)
 *
 * امکانات کامل:
 *  ۱) 🎁 بخش رایگان: استخر سرورهای زنده عمومی + پینگ خودکار + لینک سابسکریپشن زنده + تست رایگان VIP
 *  ۲) 🛒 فروشگاه VIP: پلن‌های ۱ تا ۳ ماهه با قیمت‌های اقتصادی، لوکیشن‌های اختصاصی، پروتکل‌های VLESS/VMess/Trojan/SS
 *  ۳) 💳 سیستم پرداخت: کارت به کارت با ارسال تصویر فیش + پرداخت با کیف پول + پرداخت ارزی (USDT)
 *  ۴) 👑 پنل مدیریت (Admin): تایید/رد فیش‌های واریزی، ارسال پیام همگانی (Broadcast)، آمار ربات، تنظیم شماره کارت، شارژ دستی کاربر
 *  ۵) 👥 زیرمجموعه‌گیری و دعوت دوستان: دریافت پاداش نقدی برای کیف پول
 *  ۶) 📦 مدیریت سرویس‌های فعال + 💰 کیف پول + 📖 راهنمای جامع اتصال در تمامی سیستم‌عامل‌ها
 *  ۷) 🌐 وب‌سرور لینک سابسکریپشن (/sub/:uuid) + صفحه لندینگ شیک و مدرن
 */

const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ─────────── راه‌اندازی ربات سرگرمی 🎪 (به‌عنوان زیرفرایند) ─────────── */
/* ربات سرگرمی کنار ربات VPN روشن می‌شود تا یک workflow هر دو را اجرا کند */
try {
  const { spawn } = require('child_process');
  const funBotFile = path.join(__dirname, 'fun-bot', 'index.js');
  if (fs.existsSync(funBotFile)) {
    const fun = spawn(process.execPath, [funBotFile], {
      cwd: path.join(__dirname, 'fun-bot'),
      stdio: 'inherit',
      env: process.env,
    });
    fun.on('exit', (code) => console.log('[fun-bot] متوقف شد، کد:', code));
    fun.on('error', (e) => console.error('[fun-bot] خطا در اجرا:', e && e.message));
  }
} catch (e) {
  console.error('[fun-bot] شروع نشد:', e && e.message);
}

/* ─────────────────────────── تنظیمات پایه ─────────────────────────── */

const BOT_TOKEN = (
  process.env.BOT_TOKEN ||
  process.env.TOKEN ||
  '8688771229:AAHJj9Bf9n7cRQU2VgKYBlA-MVlisJl5pjY'
).trim();

const ADMIN_ID = (process.env.ADMIN_ID || '318405928').trim();
const BOT_NAME = process.env.BOT_NAME || '🐶 DogsVPN';
const BOT_USERNAME = (process.env.BOT_USERNAME || '').replace('@', '');
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || '@dogs_vpn_support';
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@dogs_vpn';

const BASE_URL = (
  process.env.BASE_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN : '')
).replace(/\/+$/, '');

const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3000);
const SS_METHOD = process.env.SS_METHOD || 'aes-256-gcm';
const SNI = process.env.SNI || '';
const WG_SERVER_PUBLIC_KEY = process.env.WG_SERVER_PUBLIC_KEY || '';

// تنظیمات اختیاری پنل 3x-ui
const XUI = {
  base: (process.env.XUI_BASE_URL || '').replace(/\/+$/, ''),
  username: process.env.XUI_USERNAME || '',
  password: process.env.XUI_PASSWORD || '',
  inboundIds: (process.env.XUI_INBOUND_IDS || '').split(',').map(s => Number(s.trim())).filter(Boolean),
  configHost: process.env.XUI_CONFIG_HOST || '',
};
const XUI_ENABLED = !!(XUI.base && XUI.username && XUI.password);

/* ─────────────────────────── سرورهای VIP اختصاصی ─────────────────────────── */

const DEFAULT_VIP_SERVERS = [
  { id: 'de', flag: '🇩🇪', name: 'آلمان (فرانکفورت)', host: '185.244.181.12', port: 443, security: 'tls', network: 'tcp' },
  { id: 'nl', flag: '🇳🇱', name: 'هلند (آمستردام)',   host: '194.36.88.45',   port: 443, security: 'tls', network: 'tcp' },
  { id: 'fr', flag: '🇫🇷', name: 'فرانسه (پاریس)',    host: '195.58.39.78',   port: 443, security: 'tls', network: 'tcp' },
  { id: 'us', flag: '🇺🇸', name: 'آمریکا (شیکاگو)',    host: '198.54.128.99',  port: 443, security: 'tls', network: 'tcp' },
  { id: 'gb', flag: '🇬🇧', name: 'انگلیس (لندن)',     host: '185.102.219.33', port: 443, security: 'tls', network: 'tcp' },
  { id: 'tr', flag: '🇹🇷', name: 'ترکیه (استانبول)',  host: '194.36.89.22',   port: 443, security: 'tls', network: 'tcp' },
  { id: 'ca', flag: '🇨🇦', name: 'کانادا (تورنتو)',   host: '212.80.246.77',  port: 443, security: 'tls', network: 'tcp' },
  { id: 'jp', flag: '🇯🇵', name: 'ژاپن (توکیو)',      host: '185.198.56.89',  port: 443, security: 'tls', network: 'tcp' },
];

let VIP_SERVERS = DEFAULT_VIP_SERVERS;
try {
  if (process.env.SERVERS_JSON) {
    const s = JSON.parse(process.env.SERVERS_JSON);
    if (Array.isArray(s) && s.length) VIP_SERVERS = s;
  }
} catch (e) {
  VIP_SERVERS = DEFAULT_VIP_SERVERS;
}

function getVipServer(id) {
  return VIP_SERVERS.find(s => s.id === id) || VIP_SERVERS[0];
}

/* ─────────────────────────── پلن‌های اشتراک VIP (قیمت‌های مناسب و رند) ─────────────────────────── */

const PLANS = [
  {
    id: 'p1',
    title: '🥉 پلن پایه',
    volume: '50 گیگابایت',
    days: 30,
    price: 80000, // ۸۰ هزار تومان
    popular: false,
    desc: 'مناسب وب‌گردی و تلگرام',
  },
  {
    id: 'p2',
    title: '🥈 پلن اقتصادی',
    volume: '100 گیگابایت',
    days: 30,
    price: 140000, // ۱۴۰ هزار تومان
    popular: true,
    desc: '🔥 محبوب‌ترین انتخاب — سرعت حداکثری',
  },
  {
    id: 'p3',
    title: '🥇 پلن ویژه',
    volume: '200 گیگابایت',
    days: 60,
    price: 240000, // ۲۴۰ هزار تومان
    popular: false,
    desc: 'مناسب استریم و دانلود سنگین',
  },
  {
    id: 'p4',
    title: '💎 پلن نامحدود VIP',
    volume: 'نامحدود ♾️',
    days: 90,
    price: 380000, // ۳۸۰ هزار تومان
    popular: false,
    desc: 'بدون محدودیت حجم و ترافیک + پینگ پایین برای گیم',
  },
];

function getPlan(id) {
  return PLANS.find(p => p.id === id) || PLANS[0];
}

/* ─────────────────────────── توابع کمکی تاریخ و وضعیت ─────────────────────────── */

function getDaysRemaining(expireAtIso) {
  if (!expireAtIso) return 'نامحدود ♾️';
  const expire = new Date(expireAtIso).getTime();
  const now = Date.now();
  const diffMs = expire - now;
  if (diffMs <= 0) return 'منقضی شده ❌';
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return `${days} روز باقی‌مانده`;
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return d.toISOString().slice(0, 10);
  } catch {
    return isoStr || '—';
  }
}

function formatPrice(n) {
  return Number(n || 0).toLocaleString('fa-IR') + ' تومان';
}

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getServiceStatus(service) {
  if (!service || !service.expireAt) return 'فعال 🟢';
  const diff = new Date(service.expireAt).getTime() - Date.now();
  if (diff <= 0) return 'منقضی شده ❌';
  return 'فعال 🟢';
}

/* ─────────────────────────── پایگاه داده ─────────────────────────── */

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_SETTINGS = {
  cardNumber: '۶۰۳۷-۹۹۷۵-۱۲۳۴-۵۶۷۸',
  cardHolder: 'مدیریت DogsVPN',
  cryptoTrc20: 'TQXXXXXXXXX_USDT_TRC20_ADDRESS',
  rewardPerInvite: 15000,
  trialDays: 2,
  trialGB: 2,
};

let db = {
  users: {},
  orders: [],
  settings: { ...DEFAULT_SETTINGS },
};

function loadDB() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.users = parsed.users || {};
      db.orders = parsed.orders || [];
      db.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
    }
  } catch (e) {
    console.warn('⚠️ بارگیری DB ناموفق:', e.message);
  }
}

function saveDB() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.warn('⚠️ ذخیره DB ناموفق:', e.message);
  }
}

loadDB();

function getUser(chatId, fromObj = {}) {
  const id = String(chatId);
  if (!db.users[id]) {
    db.users[id] = {
      chatId: id,
      username: fromObj.username || '',
      firstName: fromObj.first_name || 'کاربر',
      balance: 0,
      uuid: genUUID(),
      services: [],
      usedTrial: false,
      invitedBy: null,
      inviteCount: 0,
      createdAt: new Date().toISOString(),
      step: null,
      stepData: null,
    };
    saveDB();
  } else if (fromObj.username && db.users[id].username !== fromObj.username) {
    db.users[id].username = fromObj.username;
    saveDB();
  }
  return db.users[id];
}

function findUserByUuid(uuid) {
  return Object.values(db.users).find(u => u.uuid === uuid) || null;
}

function findServiceByUuid(uuid) {
  for (const u of Object.values(db.users)) {
    if (u.uuid === uuid) return { user: u, service: u.services[0] || null };
    const found = (u.services || []).find(s => s.uuid === uuid);
    if (found) return { user: u, service: found };
  }
  return null;
}

/* ─────────────────────────── تست پینگ TCP ─────────────────────────── */

function testPing(host, port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(3500);
    const t = Date.now();
    socket.on('connect', () => {
      socket.destroy();
      resolve(Date.now() - t);
    });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(null);
    });
    try {
      socket.connect(port, host);
    } catch (e) {
      resolve(null);
    }
  });
}

/* ─────────────────────────── استخر سرورهای رایگان ─────────────────────────── */

let freePool = {
  fetchedAt: 0,
  links: [],
  fetching: false,
};

const DEFAULT_FREE_SOURCES = [
  'https://raw.githubusercontent.com/freefq/free/master/v2',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
];

const POOL_SIZE = 40;
const FETCH_INTERVAL_MS = 120 * 60 * 1000;

function parseVmessB64(b64) {
  try {
    const o = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!o.add || !o.port || !o.id) return null;
    return {
      proto: 'vmess',
      host: String(o.add).trim(),
      port: Number(o.port),
      id: String(o.id).trim(),
      aid: String(o.aid || '0'),
      security: o.tls === 'tls' || o.tls === true ? 'tls' : 'none',
      network: String(o.net || 'tcp'),
      path: String(o.path || ''),
      hostHeader: String(o.host || ''),
      sni: String(o.sni || ''),
    };
  } catch (e) {
    return null;
  }
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
    if (!host || !u.username) return null;
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
  } catch (e) {
    return null;
  }
}

function parseSs(link) {
  try {
    const rest = link.slice(5);
    if (rest.includes('@')) {
      const at = rest.indexOf('@');
      const hp = rest.slice(at + 1).split('#')[0];
      const colon = hp.lastIndexOf(':');
      if (colon <= 0) return null;
      const [method, pass] = Buffer.from(rest.slice(0, at), 'base64').toString('utf8').split(':');
      if (!method || !pass) return null;
      return { proto: 'ss', host: hp.slice(0, colon), port: Number(hp.slice(colon + 1)), method, ssPass: pass };
    }
    const core = rest.split('#')[0];
    const dec = Buffer.from(core, 'base64').toString('utf8');
    const at = dec.lastIndexOf('@');
    if (at <= 0) return null;
    const hp = dec.slice(at + 1);
    const colon = hp.lastIndexOf(':');
    if (colon <= 0) return null;
    const [method, pass] = dec.slice(0, at).split(':');
    if (!method || !pass) return null;
    return { proto: 'ss', host: hp.slice(0, colon), port: Number(hp.slice(colon + 1)), method, ssPass: pass };
  } catch (e) {
    return null;
  }
}

function parseLink(line) {
  const l = String(line || '').trim();
  if (!l || !l.includes('://')) return null;
  if (l.startsWith('vmess://')) {
    const rest = l.slice(8).split('#')[0];
    if (rest.includes('@')) return null;
    return parseVmessB64(rest);
  }
  if (l.startsWith('vless://') || l.startsWith('trojan://')) return parseVlessTrojan(l);
  if (l.startsWith('ss://')) return parseSs(l);
  return null;
}

async function httpGet(url) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('http ' + res.status);
  return res.text();
}

async function fetchSource(url) {
  let body;
  try {
    body = await httpGet(url);
  } catch (e) {
    const m = url.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)/);
    if (!m) throw e;
    const apiUrl = `https://api.github.com/repos/${m[1]}/${m[2]}/contents/${m[4]}?ref=${m[3]}`;
    const j = JSON.parse(await httpGet(apiUrl));
    if (!j || !j.content) throw new Error('github api empty');
    body = Buffer.from(j.content, 'base64').toString('utf8');
  }
  const lines = body.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (lines.some(l => l.includes('://'))) return lines;
  try {
    const dec = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    const dlines = dec.split(/\r?\n/).map(s => s.trim()).filter(s => s.includes('://'));
    if (dlines.length) return dlines;
  } catch (e) { /* ignore */ }
  return lines;
}

async function buildFreePool() {
  const all = [];
  for (const url of DEFAULT_FREE_SOURCES) {
    try {
      const lines = await fetchSource(url);
      for (const l of lines) {
        const o = parseLink(l);
        if (o) all.push(o);
      }
    } catch (e) {
      console.warn('⚠️ دریافت منبع استخر:', e.message);
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const o of all) {
    const k = `${o.proto}|${o.host}|${o.port}|${o.id || o.ssPass}`;
    if (!seen.has(k)) {
      seen.add(k);
      uniq.push(o);
    }
  }

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
  await Promise.all(Array.from({ length: Math.min(10, hosts.length) }, worker));

  const alive = uniq.filter(o => pings.get(o.host + ':' + o.port) !== null);
  alive.forEach(o => {
    o.ping = pings.get(o.host + ':' + o.port);
  });
  alive.sort((a, b) => (a.ping || 999) - (b.ping || 999));

  freePool = {
    fetchedAt: Date.now(),
    links: alive.slice(0, POOL_SIZE),
    fetching: false,
  };
  console.log(`✅ استخر رایگان: ${freePool.links.length} سرور زنده آماده شد.`);
}

async function ensureFreePool() {
  if (freePool.fetching) return;
  if (freePool.links.length && Date.now() - freePool.fetchedAt < 30 * 60 * 1000) return;
  freePool.fetching = true;
  try {
    await buildFreePool();
  } catch (e) {
    freePool.fetching = false;
  }
}

/* ─────────────────────────── ساخت رشته کانفیگ و نام‌گذاری ─────────────────────────── */

function buildConfigString(proto, srv, userUuid, remark) {
  const name = encodeURIComponent(remark || `${BOT_NAME} | ${srv.flag || '🚀'} ${srv.name || 'VIP'}`);
  const uuid = userUuid || genUUID();

  if (proto === 'vless') {
    const q = new URLSearchParams();
    q.set('encryption', 'none');
    q.set('security', srv.security || 'tls');
    q.set('type', srv.network || 'tcp');
    if (srv.path) q.set('path', srv.path);
    if (srv.hostHeader) q.set('host', srv.hostHeader);
    if (srv.security === 'tls') {
      q.set('sni', SNI || srv.sni || srv.host);
    }
    return `vless://${uuid}@${srv.host}:${srv.port}?${q.toString()}#${name}`;
  }

  if (proto === 'vmess') {
    const obj = {
      v: '2',
      ps: decodeURIComponent(name),
      add: srv.host,
      port: Number(srv.port),
      id: uuid,
      aid: '0',
      scy: 'auto',
      net: srv.network || 'tcp',
      type: 'none',
      host: srv.hostHeader || '',
      path: srv.path || '',
      tls: srv.security === 'tls' ? 'tls' : '',
      sni: SNI || srv.sni || srv.host,
    };
    return 'vmess://' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64');
  }

  if (proto === 'trojan') {
    const q = new URLSearchParams();
    q.set('security', srv.security === 'none' ? 'none' : 'tls');
    q.set('type', srv.network || 'tcp');
    if (srv.path) q.set('path', srv.path);
    if (srv.hostHeader) q.set('host', srv.hostHeader);
    if (srv.security !== 'none') q.set('sni', SNI || srv.sni || srv.host);
    return `trojan://${uuid}@${srv.host}:${srv.port}?${q.toString()}#${name}`;
  }

  if (proto === 'ss') {
    const method = srv.method || SS_METHOD;
    const payload = Buffer.from(`${method}:${uuid.slice(0, 16)}`, 'utf8').toString('base64');
    return `ss://${payload}@${srv.host}:${srv.port}#${name}`;
  }

  return '';
}

function buildPoolLink(o) {
  const s = {
    host: o.host,
    port: o.port,
    security: o.security || 'none',
    network: o.network || 'tcp',
    path: o.path || '',
    hostHeader: o.hostHeader || '',
    sni: o.sni || '',
    method: o.method || '',
    flag: '🆓',
    name: 'Free Server',
  };
  const configName = `${BOT_NAME} | 🆓 رایگان | ${o.proto.toUpperCase()} | پینگ زنده`;
  return buildConfigString(o.proto, s, o.id || o.ssPass, configName);
}

function generateVipService(user, planId, serverId, proto = 'vless') {
  const plan = getPlan(planId);
  const server = getVipServer(serverId);
  const serviceUuid = genUUID();

  // نام شیک و استاندارد برای داخل کلاینت‌ها (v2rayNG, Streisand, Hiddify)
  const configName = `${BOT_NAME} | ${server.flag} ${server.name} | ${plan.volume} | ${plan.days} روز`;
  const config = buildConfigString(proto, server, serviceUuid, configName);

  const now = new Date();
  const expireDate = new Date(now.getTime() + plan.days * 24 * 60 * 60 * 1000);

  const service = {
    id: 'srv_' + Date.now().toString(36),
    uuid: serviceUuid,
    name: configName,
    planId: plan.id,
    planTitle: plan.title,
    volume: plan.volume,
    days: plan.days,
    serverId: server.id,
    serverName: `${server.flag} ${server.name}`,
    proto,
    config,
    createdAt: now.toISOString(),
    expireAt: expireDate.toISOString(),
    status: 'فعال 🟢',
  };

  user.services = user.services || [];
  user.services.unshift(service);
  saveDB();
  return service;
}

function generateTrialService(user, serverId = 'de') {
  const trialDays = db.settings.trialDays || 2;
  const trialGB = db.settings.trialGB || 2;
  const server = getVipServer(serverId);
  const serviceUuid = genUUID();

  const volumeStr = `${trialGB} گیگابایت`;
  const configName = `${BOT_NAME} | ⚡ تست رایگان VIP | ${volumeStr} | ${trialDays} روزه`;
  const config = buildConfigString('vless', server, serviceUuid, configName);

  const now = new Date();
  const expireDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

  const service = {
    id: 'trial_' + Date.now().toString(36),
    uuid: serviceUuid,
    name: configName,
    planId: 'trial',
    planTitle: '🎁 تست رایگان ۲ روزه VIP',
    volume: volumeStr,
    days: trialDays,
    serverId: server.id,
    serverName: `${server.flag} ${server.name}`,
    proto: 'vless',
    config,
    createdAt: now.toISOString(),
    expireAt: expireDate.toISOString(),
    status: 'فعال 🟢',
  };

  user.usedTrial = true;
  user.services = user.services || [];
  user.services.unshift(service);
  saveDB();
  return service;
}

/* ساخت متن کارت کامل کانفیگ با ۴ فیلد کلیدی */
function formatServiceCard(s) {
  const status = getServiceStatus(s);
  const remaining = getDaysRemaining(s.expireAt);
  const expDate = formatDate(s.expireAt);
  const subUrl = BASE_URL ? `${BASE_URL}/sub/${s.uuid}` : '';

  return [
    `🏷️ *نام کانفیگ:* \`${s.name || s.planTitle || 'DogsVPN VIP'}\``,
    `🟢 *وضعیت کانفیگ:* ${status}`,
    `⏳ *مدت زمان کانفیگ:* ${s.days || 30} روز (تاریخ انقضا: \`${expDate}\` | ${remaining})`,
    `📊 *حجم کانفیگ:* *${s.volume || 'اختصاصی'}*`,
    `🌍 *لوکیشن سرور:* ${s.serverName || 'اختصاصی'}`,
    `📡 *پروتکل اتصال:* ${(s.proto || 'vless').toUpperCase()}`,
    '',
    '🔑 *کد کانفیگ (لمس برای کپی):*',
    '```',
    s.config,
    '```',
    subUrl ? `\n🔗 *لینک سابسکریپشن اختصاصی:*\n\`${subUrl}\`` : '',
  ].filter(Boolean).join('\n');
}

/* ─────────────────────────── ربات تلگرام ─────────────────────────── */

const bot = new Telegraf(BOT_TOKEN);

/* ⌨️ کیبورد اصلی پایین صفحه تلگرام (Reply Keyboard) */
function getReplyKeyboard(userId) {
  const isAdmin = String(userId) === String(ADMIN_ID);
  const rows = [
    ['🛒 خرید اشتراک VIP', '🎁 کانفیگ رایگان'],
    ['📦 سرویس‌های من', '💰 کیف پول و شارژ'],
    ['⚡ تست رایگان VIP', '🔗 لینک سابسکریپشن'],
    ['👥 دعوت دوستان', '🌍 لیست سرورها'],
    ['📖 راهنمای اتصال', '👨‍💻 پشتیبانی'],
  ];
  if (isAdmin) {
    rows.push(['👑 پنل مدیریت']);
  }
  return Markup.keyboard(rows).resize();
}

/* کیبوردهای اینلاین شیشه‌ای */
function getMainMenu(userId) {
  const isAdmin = String(userId) === String(ADMIN_ID);
  const rows = [
    [
      Markup.button.callback('🛒 خرید اشتراک VIP', 'menu:buy'),
      Markup.button.callback('🎁 کانفیگ رایگان', 'menu:free'),
    ],
    [
      Markup.button.callback('📦 سرویس‌های من', 'menu:services'),
      Markup.button.callback('💰 کیف پول', 'menu:wallet'),
    ],
    [
      Markup.button.callback('⚡ تست رایگان VIP', 'menu:trial'),
      Markup.button.callback('🔗 لینک سابسکریپشن', 'menu:sub'),
    ],
    [
      Markup.button.callback('🌍 لیست سرورها و پینگ', 'menu:servers'),
      Markup.button.callback('👥 دعوت دوستان (پاداش)', 'menu:invite'),
    ],
    [
      Markup.button.callback('📖 راهنمای اتصال', 'menu:help'),
      Markup.button.callback('👨‍💻 پشتیبانی', 'menu:support'),
    ],
  ];

  if (isAdmin) {
    rows.push([Markup.button.callback('👑 پنل مدیریت ادمین', 'admin:panel')]);
  }

  return Markup.inlineKeyboard(rows);
}

function getPlansMenu() {
  const rows = PLANS.map(p => [
    Markup.button.callback(
      `${p.popular ? '⭐ ' : ''}${p.title} | ${p.volume} (${p.days} روزه) — ${formatPrice(p.price)}`,
      `buy:plan:${p.id}`
    ),
  ]);
  rows.push([Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:home')]);
  return Markup.inlineKeyboard(rows);
}

function getVipServersMenu(planId) {
  const rows = [];
  for (let i = 0; i < VIP_SERVERS.length; i += 2) {
    const row = [Markup.button.callback(`${VIP_SERVERS[i].flag} ${VIP_SERVERS[i].name}`, `buy:srv:${planId}:${VIP_SERVERS[i].id}`)];
    if (VIP_SERVERS[i + 1]) {
      row.push(Markup.button.callback(`${VIP_SERVERS[i + 1].flag} ${VIP_SERVERS[i + 1].name}`, `buy:srv:${planId}:${VIP_SERVERS[i + 1].id}`));
    }
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 بازگشت به پلن‌ها', 'menu:buy')]);
  return Markup.inlineKeyboard(rows);
}

function getProtoMenu(planId, serverId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ VLESS (پیشنهادی)', `buy:proto:${planId}:${serverId}:vless`),
      Markup.button.callback('📡 VMess', `buy:proto:${planId}:${serverId}:vmess`),
    ],
    [
      Markup.button.callback('🔴 Trojan', `buy:proto:${planId}:${serverId}:trojan`),
      Markup.button.callback('🟢 Shadowsocks', `buy:proto:${planId}:${serverId}:ss`),
    ],
    [Markup.button.callback('🔙 بازگشت به انتخاب لوکیشن', `buy:plan:${planId}`)],
  ]);
}

function getPaymentMethodsMenu(planId, serverId, proto) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💳 کارت به کارت', `pay:card:${planId}:${serverId}:${proto}`),
      Markup.button.callback('💰 پرداخت از کیف پول', `pay:wallet:${planId}:${serverId}:${proto}`),
    ],
    [Markup.button.callback('₮ پرداخت ارزی تتر (USDT)', `pay:crypto:${planId}:${serverId}:${proto}`)],
    [Markup.button.callback('🔙 انصراف و بازگشت', 'menu:buy')],
  ]);
}

function getFreeMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ کانفیگ VLESS', 'free:cfg:vless'),
      Markup.button.callback('📡 کانفیگ VMess', 'free:cfg:vmess'),
    ],
    [
      Markup.button.callback('🔴 کانفیگ Trojan', 'free:cfg:trojan'),
      Markup.button.callback('🟢 کانفیگ Shadowsocks', 'free:cfg:ss'),
    ],
    [Markup.button.callback('🔗 دریافت لینک سابسکریپشن زنده', 'menu:sub')],
    [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:home')],
  ]);
}

function getBackHomeMenu() {
  return Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:home')]]);
}

/* متن خوش‌آمدگویی */
function getWelcomeMessage(user) {
  return [
    `🐶 *به ربات رسمی ${BOT_NAME} خوش آمدید!*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `سلام *${user.firstName || 'کاربر گرامی'}* عزیز 👋`,
    '',
    '🚀 سریع‌ترین و پایدارترین سرویس عبور از فیلترینگ با پروتکل‌های نسل جدید',
    '',
    '💎 *اطلاعات کلیدی در تمامی کانفیگ‌ها:*',
    '🏷️ *نام کانفیگ* | 🟢 *وضعیت* | ⏳ *مدت زمان و انقضا* | 📊 *حجم کل*',
    '',
    '✨ *امکانات ربات:*',
    '▫️ 🛒 خرید اشتراک‌های VIP اختصاصی (بدون قطعی و افت سرعت)',
    '▫️ 🎁 کانفیگ‌های رایگان و روزانه استخر عمومی',
    '▫️ ⚡ تست رایگان VIP برای اطمینان از کیفیت',
    '▫️ 🔗 لینک سابسکریپشن هوشمند قابل استفاده در تمام نرم‌افزارها',
    '▫️ 🌍 سرورهای پرسرعت در ۸ کشور اروپایی و آسیایی',
    '▫️ 👥 سیستم دعوت دوستان با پاداش نقدی در کیف پول',
    '',
    '💰 *موجودی کیف پول شما:* `' + formatPrice(user.balance) + '`',
    '',
    '👇 از منوی زیر یا دکمه‌های پایین صفحه گزینه مورد نظرتان را انتخاب کنید:',
  ].join('\n');
}

/* ارسال یا ویرایش منوی اصلی */
async function sendHome(ctx) {
  const user = getUser(ctx.from.id, ctx.from);
  user.step = null;
  user.stepData = null;
  saveDB();

  const text = getWelcomeMessage(user);
  const inlineKb = getMainMenu(ctx.from.id);
  const replyKb = getReplyKeyboard(ctx.from.id);

  try {
    if (ctx.updateType === 'callback_query') {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', ...inlineKb });
    } else {
      await ctx.reply(text, { parse_mode: 'Markdown', ...replyKb });
    }
  } catch (e) {
    try {
      await ctx.reply(text, { parse_mode: 'Markdown', ...inlineKb });
    } catch (e2) { /* ignore */ }
  }
}

/* ─────────────────────────── دستورات اصلی ربات ─────────────────────────── */

bot.start(async ctx => {
  const user = getUser(ctx.from.id, ctx.from);

  // سیستم رفرال و دعوت
  const payload = ctx.startPayload || '';
  if (payload.startsWith('ref_')) {
    const inviterId = payload.replace('ref_', '').trim();
    if (inviterId && inviterId !== String(ctx.from.id) && !user.invitedBy && db.users[inviterId]) {
      user.invitedBy = inviterId;
      const inviter = db.users[inviterId];
      inviter.inviteCount = (inviter.inviteCount || 0) + 1;
      const reward = Number(db.settings.rewardPerInvite || 15000);
      inviter.balance = (inviter.balance || 0) + reward;
      saveDB();

      try {
        await bot.telegram.sendMessage(
          inviterId,
          `🎉 *یک کاربر جدید با لینک شما عضو شد!*\n\n💰 مبلغ *${formatPrice(reward)}* به کیف پول شما واریز گردید.\n👥 تعداد کل دعوت‌ها: *${inviter.inviteCount} نفر*`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { /* ignore */ }
    }
  }

  await sendHome(ctx);
});

bot.command(['menu', 'home', 'panel'], async ctx => {
  await sendHome(ctx);
});

bot.command('help', async ctx => {
  await showHelp(ctx);
});

bot.command('admin', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) {
    return ctx.reply('⛔ شما به پنل مدیریت دسترسی ندارید.');
  }
  await sendAdminPanel(ctx);
});

/* ─────────────────────────── نمایش بخش‌ها ─────────────────────────── */

async function showBuyMenu(ctx) {
  const text = [
    '🛒 *خرید اشتراک اختصاصی DogsVPN VIP*',
    '━━━━━━━━━━━━━━━━━━━━',
    '⚡ تمامی پلن‌ها دارای مشخصات زیر هستند:',
    '✅ سرورهای اختصاصی با پورت 10Gbps بدون افت سرعت',
    '✅ آیپی تمیز و اختصاصی مناسب اینستاگرام، یوتیوب، ترید و وب',
    '✅ پشتیبانی ۲۴ ساعته و ضمانت اتصال پایدار',
    '✅ بدون محدودیت کاربر (قابل استفاده در چند دستگاه)',
    '',
    '👇 لطفاً پلن مورد نظرتان را انتخاب کنید:',
  ].join('\n');

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getPlansMenu() }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...getPlansMenu() });
  }
}

async function showFreeMenu(ctx) {
  const text = [
    '🎁 *کانفیگ‌های رایگان و استخر سرور عمومی*',
    '━━━━━━━━━━━━━━━━━━━━',
    '✨ کانفیگ‌های این بخش کاملاً رایگان هستند و به‌صورت خودکار هر چند ساعت با سرورهای زنده به‌روزرسانی می‌شوند.',
    '',
    `🔢 *تعداد سرورهای زنده فعلی:* ${freePool.links.length} سرور`,
    '',
    '👇 لطفاً پروتکل مورد نظر را انتخاب نمایید:',
  ].join('\n');

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getFreeMenu() }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...getFreeMenu() });
  }
}

async function showServices(ctx) {
  const user = getUser(ctx.from.id, ctx.from);
  const services = user.services || [];

  if (!services.length) {
    const text = [
      '📦 *شما در حال حاضر سرویس فعالی ندارید.*',
      '',
      'برای دریافت سرورهای پرسرعت می‌توانید از گزینه‌های زیر استفاده کنید 👇',
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🛒 خرید اشتراک VIP', 'menu:buy')],
      [Markup.button.callback('⚡ تست رایگان VIP', 'menu:trial')],
      [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
    ]);

    if (ctx.updateType === 'callback_query') {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
    } else {
      return ctx.reply(text, { parse_mode: 'Markdown', ...kb });
    }
  }

  const lines = ['📦 *لیست سرویس‌های شما:*', '━━━━━━━━━━━━━━━━━━━━', ''];

  services.forEach((s, idx) => {
    lines.push(`🔹 *سرویس شماره #${idx + 1}*`);
    lines.push(formatServiceCard(s));
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  });

  if (BASE_URL) {
    lines.push(`🔗 *لینک سابسکریپشن جامع:* \`${BASE_URL}/sub/${user.uuid}\``);
  }

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🛒 خرید اشتراک جدید', 'menu:buy')],
    [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', ...kb });
  }
}

async function showWallet(ctx) {
  const user = getUser(ctx.from.id, ctx.from);

  const text = [
    '💰 *کیف پول و موجودی حساب*',
    '━━━━━━━━━━━━━━━━━━━━',
    `👤 نام: *${user.firstName || 'کاربر'}*`,
    `🆔 شناسه کاربری: \`${user.chatId}\``,
    `👛 *موجودی فعلی شما:* *${formatPrice(user.balance)}*`,
    `👥 تعداد دعوت‌ها: *${user.inviteCount || 0} نفر*`,
    '',
    '✨ با شارژ کیف پول می‌توانید در هر زمان به راحتی و با یک کلیک پلن‌های VIP را خریداری یا تمدید نمایید.',
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('💳 افزایش موجودی (کارت به کارت)', 'wallet:charge')],
    [Markup.button.callback('👥 کسب موجودی با دعوت دوستان', 'menu:invite')],
    [Markup.button.callback('🔙 بازگشت به منوی اصلی', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

async function showTrial(ctx) {
  const user = getUser(ctx.from.id, ctx.from);

  if (user.usedTrial) {
    const text = [
      '⚠️ *شما قبلاً از هدیه تست رایگان VIP استفاده کرده‌اید.*',
      '',
      'برای تمدید و دریافت سرورهای پرسرعت اختصاصی می‌توانید از بخش «🛒 خرید اشتراک VIP» اقدام نمایید.',
    ].join('\n');

    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🛒 خرید اشتراک VIP', 'menu:buy')],
      [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
    ]);

    if (ctx.updateType === 'callback_query') {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
    } else {
      return ctx.reply(text, { parse_mode: 'Markdown', ...kb });
    }
  }

  const service = generateTrialService(user, 'de');

  const text = [
    '🎉 *تست رایگان VIP شما با موفقیت فعال شد!*',
    '━━━━━━━━━━━━━━━━━━━━',
    formatServiceCard(service),
    '',
    '📲 کانفیگ بالا را کپی نموده و در نرم‌افزار خود وارد نمایید.',
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('📦 سرویس‌های من', 'menu:services')],
    [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

async function showSubLink(ctx) {
  const user = getUser(ctx.from.id, ctx.from);

  if (!BASE_URL) {
    const text = '⚠️ لینک اشتراک سابسکریپشن در سرور فعال نشده است.\nمی‌توانید کانفیگ‌ها را مستقیماً از بخش «کانفیگ رایگان» یا «سرویس‌های من» کپی نمایید.';
    if (ctx.updateType === 'callback_query') {
      return ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackHomeMenu() }).catch(() => {});
    } else {
      return ctx.reply(text, { parse_mode: 'Markdown', ...getBackHomeMenu() });
    }
  }

  const subUrl = `${BASE_URL}/sub/${user.uuid}`;
  const text = [
    '🔗 *لینک سابسکریپشن اختصاصی شما*',
    '━━━━━━━━━━━━━━━━━━━━',
    'با افزودن این لینک به نرم‌افزار، تمامی سرورهای شما همیشه به‌صورت خودکار به‌روزرسانی می‌شوند 🔄',
    '',
    `\`${subUrl}\``,
    '',
    '📲 *نحوه استفاده در نرم‌افزارها:*',
    '▫️ اپلیکیشن v2rayNG / Streisand / Hiddify / V2Box',
    '▫️ منوی Subscription Groups ➕ Add',
    '▫️ لینک بالا را Paste کرده و ذخیره نمایید.',
  ].join('\n');

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackHomeMenu() }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...getBackHomeMenu() });
  }
}

async function showServers(ctx) {
  const rows = [];
  for (const s of VIP_SERVERS) {
    const ping = await testPing(s.host, s.port);
    rows.push(`${s.flag} *${s.name}*: ${ping ? '⚡ `' + ping + 'ms`' : '❌ آفلاین'}`);
  }

  const text = [
    '🌍 *وضعیت سرورهای اختصاصی VIP DogsVPN*',
    '━━━━━━━━━━━━━━━━━━━━',
    ...rows,
    '',
    `🆓 *سرورهای استخر رایگان:* ${freePool.links.length} سرور آنلاین`,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback('🔄 تست مجدد پینگ', 'menu:servers')],
    [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

async function showInvite(ctx) {
  const user = getUser(ctx.from.id, ctx.from);
  const botUser = BOT_USERNAME || 'DogsVPNBot';
  const inviteLink = `https://t.me/${botUser}?start=ref_${user.chatId}`;
  const reward = Number(db.settings.rewardPerInvite || 15000);

  const text = [
    '👥 *کسب درآمد و موجودی رایگان با دعوت دوستان*',
    '━━━━━━━━━━━━━━━━━━━━',
    `💰 به ازای هر نفری که با لینک اختصاصی شما عضو ربات شود، مبلغ *${formatPrice(reward)}* به کیف پول شما اضافه می‌گردد!`,
    '',
    `📊 *تعداد دوستان دعوت شده توسط شما:* *${user.inviteCount || 0} نفر*`,
    `👛 *موجودی فعلی شما:* *${formatPrice(user.balance)}*`,
    '',
    '🔗 *لینک دعوت اختصاصی شما (لمس برای کپی):*',
    `\`${inviteLink}\``,
    '',
    'پیام زیر را برای دوستان یا گروه‌های خود فوروارد کنید 👇',
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.url('🚀 اشتراک‌گذاری در تلگرام', `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('🔥 قوی‌ترین فیلترشکن بدون قطعی و پرسرعت — رایگان و VIP')}`)],
    [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

async function showHelp(ctx) {
  const text = [
    '📖 *راهنمای اتصال به سرویس DogsVPN*',
    '━━━━━━━━━━━━━━━━━━━━',
    '۱️⃣ *دانلود اپلیکیشن مناسب سیستم‌عامل:*',
    '📱 *اندروید:* v2rayNG / Hiddify / NekoBox',
    '🍎 *آیفون (iOS):* Streisand / V2Box / FoXray',
    '💻 *ویندوز / مک:* v2rayN / Hiddify / Clash Verge',
    '',
    '۲️⃣ *روش اتصال:*',
    '▫️ کانفیگ یا لینک اشتراک را از ربات کپی کنید.',
    '▫️ وارد نرم‌افزار شوید و علامت ➕ یا `Import from clipboard` را بزنید.',
    '▫️ دکمه اتصال (Connect) را لمس نمایید.',
    '',
    '✨ برای هرگونه سوال یا راهنمایی با پشتیبانی در تماس باشید.',
  ].join('\n');

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getBackHomeMenu() }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...getBackHomeMenu() });
  }
}

async function showSupport(ctx) {
  const text = [
    '👨‍💻 *پشتیبانی و ارتباط با مدیریت DogsVPN*',
    '━━━━━━━━━━━━━━━━━━━━',
    'در صورت وجود هرگونه سوال، مشکل در اتصال، یا پیگیری سفارشات با پشتیبانی ما در تماس باشید:',
    '',
    `▫️ آیدی پشتیبانی: ${SUPPORT_USERNAME}`,
    `▫️ کانال رسمی اطلاع‌رسانی: ${CHANNEL_USERNAME}`,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.url('💬 پیام به پشتیبانی', `https://t.me/${SUPPORT_USERNAME.replace('@', '')}`)],
    [Markup.button.url('📢 عضویت در کانال', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)],
    [Markup.button.callback('🔙 بازگشت به منو', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

/* ─────────────────────────── اکشن‌های اینلاین ─────────────────────────── */

bot.action('menu:home', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await sendHome(ctx);
});

bot.action('menu:buy', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showBuyMenu(ctx);
});

bot.action('menu:free', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showFreeMenu(ctx);
});

bot.action('menu:services', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showServices(ctx);
});

bot.action('menu:wallet', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showWallet(ctx);
});

bot.action('menu:trial', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showTrial(ctx);
});

bot.action('menu:sub', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showSubLink(ctx);
});

bot.action('menu:servers', async ctx => {
  await ctx.answerCbQuery('⏳ در حال تست پینگ سرورها...').catch(() => {});
  await showServers(ctx);
});

bot.action('menu:invite', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showInvite(ctx);
});

bot.action('menu:help', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showHelp(ctx);
});

bot.action('menu:support', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  await showSupport(ctx);
});

// انتخاب پلن
bot.action(/^buy:plan:(.+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const plan = getPlan(planId);

  const text = [
    `💎 *انتخاب سرور برای ${plan.title}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `📦 *حجم ترافیک:* ${plan.volume}`,
    `⏳ *مدت اعتبار:* ${plan.days} روز`,
    `💰 *قیمت:* ${formatPrice(plan.price)}`,
    '',
    '🌍 لطفاً کشور و لوکیشن سرور مورد نظرتان را انتخاب نمایید:',
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getVipServersMenu(planId) }).catch(() => {});
});

// انتخاب سرور
bot.action(/^buy:srv:([^:]+):([^:]+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const plan = getPlan(planId);
  const server = getVipServer(serverId);

  const text = [
    '⚡ *انتخاب پروتکل اتصال*',
    '━━━━━━━━━━━━━━━━━━━━',
    `📦 *پلن انتخابی:* ${plan.title} (${plan.volume})`,
    `🌍 *سرور انتخابی:* ${server.flag} ${server.name}`,
    `💰 *مبلغ قابل پرداخت:* ${formatPrice(plan.price)}`,
    '',
    '👇 لطفاً پروتکل اتصال دلخواه خود را مشخص کنید:',
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getProtoMenu(planId, serverId) }).catch(() => {});
});

// انتخاب پروتکل و نمایش روش‌های پرداخت
bot.action(/^buy:proto:([^:]+):([^:]+):([^:]+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const proto = ctx.match[3];

  const user = getUser(ctx.from.id, ctx.from);
  const plan = getPlan(planId);
  const server = getVipServer(serverId);

  const text = [
    '💳 *پیش‌فاکتور و انتخاب روش پرداخت*',
    '━━━━━━━━━━━━━━━━━━━━',
    `🏷️ *پلن:* ${plan.title}`,
    `📊 *حجم اختصاصی:* ${plan.volume}`,
    `⏳ *مدت زمان:* ${plan.days} روز`,
    `🌍 *لوکیشن:* ${server.flag} ${server.name}`,
    `📡 *پروتکل:* ${proto.toUpperCase()}`,
    '━━━━━━━━━━━━━━━━━━━━',
    `💰 *مبلغ فاکتور:* *${formatPrice(plan.price)}*`,
    `👛 *موجودی کیف پول:* *${formatPrice(user.balance)}*`,
    '',
    '👇 لطفاً روش پرداخت دلخواه را انتخاب کنید:',
  ].join('\n');

  await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getPaymentMethodsMenu(planId, serverId, proto) }).catch(() => {});
});

// پرداخت با کیف پول
bot.action(/^pay:wallet:([^:]+):([^:]+):([^:]+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const proto = ctx.match[3];

  const user = getUser(ctx.from.id, ctx.from);
  const plan = getPlan(planId);
  const server = getVipServer(serverId);

  if (user.balance < plan.price) {
    const diff = plan.price - user.balance;
    const text = [
      '❌ *موجودی کیف پول شما کافی نیست!*',
      '━━━━━━━━━━━━━━━━━━━━',
      `💰 مبلغ فاکتور: *${formatPrice(plan.price)}*`,
      `👛 موجودی شما: *${formatPrice(user.balance)}*`,
      `⚠️ کسری موجودی: *${formatPrice(diff)}*`,
      '',
      'می‌توانید از روش کارت به کارت استفاده کنید یا ابتدا کیف پول خود را شارژ نمایید.',
    ].join('\n');

    return ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💳 پرداخت مستقیم کارت به کارت', `pay:card:${planId}:${serverId}:${proto}`)],
        [Markup.button.callback('💰 شارژ کیف پول', 'wallet:charge')],
        [Markup.button.callback('🔙 بازگشت', 'menu:buy')],
      ]),
    }).catch(() => {});
  }

  // کسر از موجودی و ساخت آنی سرویس VIP
  user.balance -= plan.price;
  const service = generateVipService(user, planId, serverId, proto);

  const text = [
    '🎉 *پرداخت با موفقیت انجام شد! اشتراک VIP فعال گردید.*',
    '━━━━━━━━━━━━━━━━━━━━',
    formatServiceCard(service),
    '',
    '📲 کانفیگ بالا را کپی کرده و در اپلیکیشن خود اضافه نمایید.',
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('📦 سرویس‌های من', 'menu:services')],
      [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
    ]),
  }).catch(() => {});
});

// پرداخت کارت به کارت
bot.action(/^pay:card:([^:]+):([^:]+):([^:]+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const proto = ctx.match[3];

  const user = getUser(ctx.from.id, ctx.from);
  const plan = getPlan(planId);
  const server = getVipServer(serverId);

  user.step = 'awaiting_payment_receipt';
  user.stepData = { planId, serverId, proto, amount: plan.price, type: 'buy_plan' };
  saveDB();

  const text = [
    '💳 *پرداخت به صورت کارت به کارت*',
    '━━━━━━━━━━━━━━━━━━━━',
    `📦 *سفارش:* ${plan.title} (${server.flag} ${server.name})`,
    `💰 *مبلغ دقیق قابل واریز:* *${formatPrice(plan.price)}*`,
    '',
    '💳 *اطلاعات حساب بانکی:*',
    `▫️ شماره کارت: \`${db.settings.cardNumber}\``,
    `▫️ صاحب حساب: *${db.settings.cardHolder}*`,
    '',
    '📸 *مرحله بعد:*',
    'پس از واریز مبلغ، **عکس فیش یا اسکرین‌شات رسید تراکنش** را در همین چت ارسال نمایید.',
    '',
    '⚠️ در صورت انصراف دکمه زیر را لمس کنید.',
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف از پرداخت', 'menu:home')]]),
  }).catch(() => {});
});

// پرداخت تتری (USDT)
bot.action(/^pay:crypto:([^:]+):([^:]+):([^:]+)$/, async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const proto = ctx.match[3];

  const user = getUser(ctx.from.id, ctx.from);
  const plan = getPlan(planId);
  const server = getVipServer(serverId);
  const usdtAmount = Math.max(1.0, Math.ceil((plan.price / 85000) * 10) / 10);

  user.step = 'awaiting_payment_receipt';
  user.stepData = { planId, serverId, proto, amount: plan.price, usdtAmount, type: 'buy_crypto' };
  saveDB();

  const text = [
    '₮ *پرداخت با ارز دیجیتال تتر (USDT - TRC20)*',
    '━━━━━━━━━━━━━━━━━━━━',
    `📦 *سفارش:* ${plan.title} (${server.flag} ${server.name})`,
    `💰 *مبلغ معادل:* *${usdtAmount} USDT*`,
    '',
    '📬 *آدرس کیف پول (TRC-20):*',
    `\`${db.settings.cryptoTrc20}\``,
    '',
    '📸 *مرحله بعد:*',
    'پس از انتقال، **هش تراکنش (TxID) یا اسکرین‌شات واریز** را در همین چت بفرستید.',
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف از پرداخت', 'menu:home')]]),
  }).catch(() => {});
});

// دریافت کانفیگ رایگان استخر
bot.action(/^free:cfg:(vless|vmess|trojan|ss)$/, async ctx => {
  const proto = ctx.match[1];
  await ctx.answerCbQuery('⏳ در حال دریافت سرور زنده...').catch(() => {});

  await ensureFreePool();
  const candidates = freePool.links.filter(l => l.proto === proto);

  if (!candidates.length) {
    return ctx.editMessageText(
      `😔 در حال حاضر سرور زنده برای پروتکل ${proto.toUpperCase()} در استخر عمومی ثبت نشده است.\n\nکمی بعد دوباره امتحان کنید یا از دکمه زیر لینک سابسکریپشن را بردارید. 🔄`,
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔄 امتحان مجدد', `free:cfg:${proto}`)],
          [Markup.button.callback('🔙 بازگشت', 'menu:free')],
        ]),
      }
    ).catch(() => {});
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const link = buildPoolLink(selected);
  const ping = selected.ping ? selected.ping + 'ms' : 'زنده';

  const text = [
    `✅ *کانفیگ رایگان ${proto.toUpperCase()} ساخته شد!* 🆓`,
    '━━━━━━━━━━━━━━━━━━━━',
    `🏷️ *نام کانفیگ:* \`${BOT_NAME} | 🆓 رایگان | ${proto.toUpperCase()} | پینگ زنده\``,
    `🟢 *وضعیت کانفیگ:* فعال 🟢`,
    `⏳ *مدت زمان کانفیگ:* استخر عمومی زنده (به‌روزرسانی خودکار دائم)`,
    `📊 *حجم کانفیگ:* نامحدود رایگان ♾️`,
    `🌍 *آدرس سرور:* \`${selected.host}:${selected.port}\``,
    `⚡ *پینگ لحظه‌ای:* \`${ping}\``,
    '',
    '🔑 *کد کانفیگ (لمس برای کپی):*',
    '```',
    link,
    '```',
    '',
    '📲 کانفیگ را کپی کرده و در اپلیکیشن خود وارد کنید.',
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 دریافت کانفیگ دیگر', `free:cfg:${proto}`)],
      [Markup.button.callback('🔗 لینک اشتراک سابسکریپشن', 'menu:sub')],
      [Markup.button.callback('🔙 بازگشت', 'menu:free')],
    ]),
  }).catch(() => {});
});

// درخواست شارژ کیف پول
bot.action('wallet:charge', async ctx => {
  await ctx.answerCbQuery().catch(() => {});
  const user = getUser(ctx.from.id, ctx.from);
  user.step = 'awaiting_charge_amount';
  saveDB();

  const text = [
    '💳 *شارژ کیف پول (کارت به کارت)*',
    '━━━━━━━━━━━━━━━━━━━━',
    'لطفاً **مبلغ مورد نظر برای افزایش موجودی را به تومان به صورت عدد انگلیسی** ارسال کنید:',
    '',
    '▫️ نمونه: `140000`',
  ].join('\n');

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'menu:wallet')]]),
  }).catch(() => {});
});

/* ─────────────────────────── پنل مدیریت ادمین ─────────────────────────── */

async function sendAdminPanel(ctx) {
  const totalUsers = Object.keys(db.users).length;
  const pendingOrders = db.orders.filter(o => o.status === 'pending').length;
  const approvedOrders = db.orders.filter(o => o.status === 'approved').length;
  const totalSales = db.orders
    .filter(o => o.status === 'approved')
    .reduce((sum, o) => sum + (o.amount || 0), 0);

  const text = [
    '👑 *پنل مدیریت ربات DogsVPN*',
    '━━━━━━━━━━━━━━━━━━━━',
    `👥 *تعداد کل کاربران:* ${totalUsers} نفر`,
    `📋 *سفارشات در انتظار بررسی:* ${pendingOrders} عدد`,
    `✅ *سفارشات تایید شده:* ${approvedOrders} عدد`,
    `💰 *مجموع درآمد کل:* ${formatPrice(totalSales)}`,
    '',
    `💳 *شماره کارت فعلی:* \`${db.settings.cardNumber}\``,
    `👤 *صاحب حساب:* ${db.settings.cardHolder}`,
    `₮ *کیف پول تتر:* \`${db.settings.cryptoTrc20}\``,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [Markup.button.callback(`📋 بررسی فیش‌ها (${pendingOrders})`, 'admin:orders')],
    [Markup.button.callback('📢 پیام همگانی (Broadcast)', 'admin:broadcast')],
    [Markup.button.callback('💳 تغییر شماره کارت', 'admin:setcard')],
    [Markup.button.callback('💰 شارژ مستقیم کیف پول کاربر', 'admin:charge_user')],
    [Markup.button.callback('🔙 بازگشت به منوی کاربری', 'menu:home')],
  ]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...kb });
  }
}

bot.action('admin:panel', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔ عدم دسترسی');
  await ctx.answerCbQuery().catch(() => {});
  await sendAdminPanel(ctx);
});

// مشاهده فیش‌های در انتظار بررسی
bot.action('admin:orders', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery().catch(() => {});

  const pending = db.orders.filter(o => o.status === 'pending');
  if (!pending.length) {
    return ctx.editMessageText('✅ هیچ سفارش یا فیش در انتظار بررسی وجود ندارد.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 پنل ادمین', 'admin:panel')]]),
    }).catch(() => {});
  }

  const o = pending[0];
  const u = db.users[o.userId] || { firstName: 'نامشخص', chatId: o.userId };
  const plan = getPlan(o.planId);

  const text = [
    `📋 *بررسی سفارش #${o.id}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `👤 *کاربر:* ${u.firstName} (\`${o.userId}\`)`,
    `📦 *نوع سفارش:* ${o.type === 'wallet_charge' ? 'شارژ کیف پول' : plan.title}`,
    `💰 *مبلغ فیش:* *${formatPrice(o.amount)}*`,
    `📅 *زمان ثبت:* ${o.createdAt.slice(0, 19).replace('T', ' ')}`,
  ].join('\n');

  const kb = Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ تایید و تحویل سفارش', `order:approve:${o.id}`),
      Markup.button.callback('❌ رد سفارش', `order:reject:${o.id}`),
    ],
    [Markup.button.callback('🔙 بازگشت به پنل ادمین', 'admin:panel')],
  ]);

  if (o.photoId) {
    await ctx.replyWithPhoto(o.photoId, { caption: text, parse_mode: 'Markdown', ...kb });
  } else {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...kb }).catch(() => {});
  }
});

// تایید سفارش توسط ادمین
bot.action(/^order:approve:(.+)$/, async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  const orderId = ctx.match[1];
  const order = db.orders.find(o => o.id === orderId);

  if (!order || order.status !== 'pending') {
    return ctx.answerCbQuery('این سفارش قبلاً بررسی شده است.');
  }

  order.status = 'approved';
  const targetUser = db.users[order.userId];

  if (targetUser) {
    if (order.type === 'wallet_charge') {
      targetUser.balance = (targetUser.balance || 0) + order.amount;
      saveDB();
      try {
        await bot.telegram.sendMessage(
          order.userId,
          `🎉 *فیش واریزی شما تایید شد!*\n\n💰 مبلغ *${formatPrice(order.amount)}* به کیف پول شما اضافه شد.\n👛 موجودی جدید: *${formatPrice(targetUser.balance)}*`,
          { parse_mode: 'Markdown' }
        );
      } catch (e) { /* ignore */ }
    } else {
      // تحویل سرویس VIP به کاربر با کارت اطلاعات کامل
      const service = generateVipService(targetUser, order.planId, order.serverId, order.proto || 'vless');
      saveDB();

      const userText = [
        '🎉 *سفارش شما تایید و اشتراک VIP فعال شد!*',
        '━━━━━━━━━━━━━━━━━━━━',
        formatServiceCard(service),
        '',
        '📲 کانفیگ بالا را کپی کرده و در اپلیکیشن اضافه کنید.',
      ].join('\n');

      try {
        await bot.telegram.sendMessage(order.userId, userText, { parse_mode: 'Markdown' });
      } catch (e) { /* ignore */ }
    }
  }

  saveDB();
  await ctx.answerCbQuery('✅ سفارش تایید شد.');
  try {
    if (ctx.editMessageCaption) {
      await ctx.editMessageCaption('✅ سفارش با موفقیت تایید و به کاربر تحویل شد.');
    } else {
      await ctx.editMessageText('✅ سفارش با موفقیت تایید و به کاربر تحویل شد.');
    }
  } catch (e) { /* ignore */ }
});

// رد سفارش توسط ادمین
bot.action(/^order:reject:(.+)$/, async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  const orderId = ctx.match[1];
  const order = db.orders.find(o => o.id === orderId);

  if (!order || order.status !== 'pending') {
    return ctx.answerCbQuery('این سفارش قبلاً بررسی شده است.');
  }

  order.status = 'rejected';
  saveDB();

  try {
    await bot.telegram.sendMessage(
      order.userId,
      `❌ *فیش واریزی شما تایید نشد.*\n\nعلت: عدم تطابق مشخصات یا واریز نشدن مبلغ.\nجهت پیگیری به پشتیبانی پیام دهید: ${SUPPORT_USERNAME}`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) { /* ignore */ }

  await ctx.answerCbQuery('❌ سفارش رد شد.');
  try {
    if (ctx.editMessageCaption) {
      await ctx.editMessageCaption('❌ سفارش رد شد و به کاربر اطلاع داده شد.');
    } else {
      await ctx.editMessageText('❌ سفارش رد شد و به کاربر اطلاع داده شد.');
    }
  } catch (e) { /* ignore */ }
});

// پیام همگانی
bot.action('admin:broadcast', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery().catch(() => {});
  const adminUser = getUser(ctx.from.id, ctx.from);
  adminUser.step = 'awaiting_broadcast_msg';
  saveDB();

  await ctx.reply('📢 متن پیام همگانی را بفرستید (این پیام برای تمامی کاربران ارسال خواهد شد):', {
    reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'admin:panel')]]),
  });
});

// تنظیم کارت
bot.action('admin:setcard', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery().catch(() => {});
  const adminUser = getUser(ctx.from.id, ctx.from);
  adminUser.step = 'awaiting_card_info';
  saveDB();

  await ctx.reply(
    `💳 لطفاً شماره کارت جدید و نام صاحب حساب را در یک خط با فرمت زیر ارسال کنید:\n\n\`6037-9975-1234-5678 - علی رضایی\``,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'admin:panel')]]),
    }
  );
});

// شارژ مستقیم کاربر
bot.action('admin:charge_user', async ctx => {
  if (String(ctx.from.id) !== String(ADMIN_ID)) return ctx.answerCbQuery('⛔');
  await ctx.answerCbQuery().catch(() => {});
  const adminUser = getUser(ctx.from.id, ctx.from);
  adminUser.step = 'awaiting_charge_user_input';
  saveDB();

  await ctx.reply(
    `💰 لطفاً آیدی عددی کاربر و مبلغ شارژ را با فاصله ارسال کنید:\n\nفرمت: \`chatId amount\`\nمثال: \`123456789 50000\``,
    {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'admin:panel')]]),
    }
  );
});

/* ─────────────────────────── مدیریت دکمه‌های متنی و مراحل (Steps) ─────────────────────────── */

bot.on(['text', 'photo'], async ctx => {
  const user = getUser(ctx.from.id, ctx.from);
  const text = (ctx.message && ctx.message.text ? ctx.message.text.trim() : '');

  // ۱) مرحله دریافت مبلغ شارژ کیف پول
  if (user.step === 'awaiting_charge_amount') {
    const amount = parseInt(text.replace(/[^0-9]/g, ''), 10);
    if (!amount || amount < 10000) {
      return ctx.reply('⚠️ لطفاً یک مبلغ معتبر (حداقل ۱۰,۰۰۰ تومان) به عدد انگلیسی وارد نمایید:');
    }

    user.step = 'awaiting_payment_receipt';
    user.stepData = { amount, type: 'wallet_charge' };
    saveDB();

    const msg = [
      '💳 *مشخصات کارت برای افزایش موجودی*',
      '━━━━━━━━━━━━━━━━━━━━',
      `💰 *مبلغ قابل واریز:* *${formatPrice(amount)}*`,
      `▫️ شماره کارت: \`${db.settings.cardNumber}\``,
      `▫️ صاحب حساب: *${db.settings.cardHolder}*`,
      '',
      '📸 لطفاً پس از واریز، **عکس فیش واریزی** را ارسال نمایید.',
    ].join('\n');

    return ctx.reply(msg, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'menu:wallet')]]),
    });
  }

  // ۲) مرحله ارسال فیش واریزی (عکس یا متن)
  if (user.step === 'awaiting_payment_receipt') {
    const photo = ctx.message && ctx.message.photo;
    const photoId = photo ? photo[photo.length - 1].file_id : null;
    const data = user.stepData || {};

    const orderId = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const newOrder = {
      id: orderId,
      userId: String(ctx.from.id),
      type: data.type || 'buy_plan',
      planId: data.planId || 'p1',
      serverId: data.serverId || 'de',
      proto: data.proto || 'vless',
      amount: data.amount || 0,
      photoId: photoId,
      textNote: text,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    db.orders.unshift(newOrder);
    user.step = null;
    user.stepData = null;
    saveDB();

    // اطلاع به کاربر
    await ctx.reply(
      `✅ *رسید واریز شما با شناسه #${orderId} ثبت شد!*\n\n⏳ سفارش شما در حال بررسی توسط ادمین است و به محض تایید، کانفیگ اختصاصی در همین چت برایتان ارسال خواهد شد.`,
      { parse_mode: 'Markdown', ...getBackHomeMenu() }
    );

    // ارسال اعلان فوری برای ادمین
    const adminMsg = [
      `🔔 *فیش واریزی جدید ثبت شد!* (#${orderId})`,
      '━━━━━━━━━━━━━━━━━━━━',
      `👤 *کاربر:* ${user.firstName} (\`${user.chatId}\`)`,
      `📦 *نوع:* ${newOrder.type === 'wallet_charge' ? 'شارژ کیف پول' : getPlan(newOrder.planId).title}`,
      `💰 *مبلغ:* *${formatPrice(newOrder.amount)}*`,
    ].join('\n');

    const adminKb = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ تایید و فعال‌سازی', `order:approve:${orderId}`),
        Markup.button.callback('❌ رد فیش', `order:reject:${orderId}`),
      ],
    ]);

    try {
      if (photoId) {
        await bot.telegram.sendPhoto(ADMIN_ID, photoId, { caption: adminMsg, parse_mode: 'Markdown', ...adminKb });
      } else {
        await bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown', ...adminKb });
      }
    } catch (e) {
      console.warn('⚠️ ارسال پیام به ادمین ناموفق:', e.message);
    }
    return;
  }

  // ۳) پیام همگانی ادمین
  if (user.step === 'awaiting_broadcast_msg' && String(ctx.from.id) === String(ADMIN_ID)) {
    user.step = null;
    saveDB();

    const userIds = Object.keys(db.users);
    await ctx.reply(`⏳ در حال ارسال پیام به ${userIds.length} کاربر...`);

    let sent = 0;
    let failed = 0;
    for (const uid of userIds) {
      try {
        await bot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
        sent++;
      } catch (e) {
        failed++;
      }
    }

    return ctx.reply(`✅ ارسال همگانی پایان یافت.\n\n📤 ارسال موفق: ${sent}\n❌ ناموفق: ${failed}`, {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 پنل ادمین', 'admin:panel')]]),
    });
  }

  // ۴) تغییر مشخصات کارت بانکی
  if (user.step === 'awaiting_card_info' && String(ctx.from.id) === String(ADMIN_ID)) {
    user.step = null;
    const parts = text.split('-');
    if (parts.length >= 2) {
      db.settings.cardNumber = parts[0].trim();
      db.settings.cardHolder = parts.slice(1).join('-').trim();
    } else {
      db.settings.cardNumber = text.trim();
    }
    saveDB();

    return ctx.reply(`✅ اطلاعات کارت به‌روزرسانی شد:\n\n💳 شماره: \`${db.settings.cardNumber}\`\n👤 نام: ${db.settings.cardHolder}`, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 پنل ادمین', 'admin:panel')]]),
    });
  }

  // ۵) شارژ مستقیم کیف پول کاربر توسط ادمین
  if (user.step === 'awaiting_charge_user_input' && String(ctx.from.id) === String(ADMIN_ID)) {
    user.step = null;
    const [targetChatId, amountStr] = text.trim().split(/\s+/);
    const amount = parseInt(amountStr, 10);
    const targetUser = db.users[targetChatId];

    if (!targetUser || !amount) {
      return ctx.reply('❌ کاربر پیدا نشد یا مبلغ نامعتبر است.');
    }

    targetUser.balance = (targetUser.balance || 0) + amount;
    saveDB();

    try {
      await bot.telegram.sendMessage(
        targetChatId,
        `💰 کیف پول شما توسط مدیریت به مبلغ *${formatPrice(amount)}* شارژ شد.\nموجودی فعلی: *${formatPrice(targetUser.balance)}*`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) { /* ignore */ }

    return ctx.reply(`✅ مبلغ ${formatPrice(amount)} به حساب کاربر ${targetChatId} اضافه شد.`, {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 پنل ادمین', 'admin:panel')]]),
    });
  }

  // پردازش کلیک روی دکمه‌های کیبورد پایین (Reply Keyboard)
  if (text === '🛒 خرید اشتراک VIP') {
    return showBuyMenu(ctx);
  }
  if (text === '🎁 کانفیگ رایگان') {
    return showFreeMenu(ctx);
  }
  if (text === '📦 سرویس‌های من') {
    return showServices(ctx);
  }
  if (text === '💰 کیف پول و شارژ' || text === '💰 کیف پول') {
    return showWallet(ctx);
  }
  if (text === '⚡ تست رایگان VIP') {
    return showTrial(ctx);
  }
  if (text === '🔗 لینک سابسکریپشن') {
    return showSubLink(ctx);
  }
  if (text === '👥 دعوت دوستان') {
    return showInvite(ctx);
  }
  if (text === '🌍 لیست سرورها' || text === '🌍 لیست سرورها و پینگ') {
    return showServers(ctx);
  }
  if (text === '📖 راهنمای اتصال') {
    return showHelp(ctx);
  }
  if (text === '👨‍💻 پشتیبانی') {
    return showSupport(ctx);
  }
  if (text === '👑 پنل مدیریت' && String(ctx.from.id) === String(ADMIN_ID)) {
    return sendAdminPanel(ctx);
  }

  // در غیر این صورت ارسال منوی اصلی
  if (text && !text.startsWith('/')) {
    await sendHome(ctx);
  }
});

bot.catch(err => {
  console.error('⚠️ خطا در ربات:', err.message);
});

/* ─────────────────────────── سرور HTTP (سابسکریپشن و وضعیت) ─────────────────────────── */

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad Request');
  }

  // ۱) روت سلامت و صفحه لندینگ
  if (url.pathname === '/' || url.pathname === '/health') {
    const userCount = Object.keys(db.users).length;
    const activePool = freePool.links.length;
    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${BOT_NAME} — سرویس فیلترشکن هوشمند</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,sans-serif;background:radial-gradient(circle at top,#1e293b,#0f172a);color:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:rgba(30,41,59,0.85);backdrop-filter:blur(12px);border:1px solid #334155;border-radius:24px;padding:40px;text-align:center;max-width:440px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,.5)}
  h1{font-size:28px;margin:0 0 10px;color:#60a5fa}
  .status{display:inline-flex;align-items:center;gap:8px;background:rgba(34,197,94,0.15);color:#4ade80;padding:6px 16px;border-radius:99px;font-weight:600;font-size:14px;margin-bottom:20px}
  .dot{width:8px;height:8px;background:#4ade80;border-radius:50%;box-shadow:0 0 10px #4ade80}
  .desc{font-size:14px;color:#94a3b8;line-height:1.6;margin-bottom:24px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
  .box{background:#0f172a;border:1px solid #334155;border-radius:14px;padding:14px;text-align:center}
  .box-num{font-size:20px;font-weight:700;color:#f1f5f9;margin-bottom:4px}
  .box-label{font-size:12px;color:#64748b}
  .btn{display:block;width:100%;padding:14px;border-radius:14px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;text-decoration:none;font-weight:700;font-size:16px;transition:0.2s}
  .btn:hover{transform:translateY(-2px);box-shadow:0 10px 25px rgba(37,99,235,0.4)}
</style>
</head>
<body>
  <div class="card">
    <h1>${BOT_NAME}</h1>
    <div class="status"><span class="dot"></span> سرورها و ربات فعال هستند</div>
    <p class="desc">ارائه‌دهنده سرویس‌های پرسرعت VLESS / VMess / Trojan با سرورهای اختصاصی و کانفیگ‌های رایگان</p>
    <div class="grid">
      <div class="box"><div class="box-num">${userCount}</div><div class="box-label">کاربران فعال</div></div>
      <div class="box"><div class="box-num">${activePool}</div><div class="box-label">سرورهای زنده استخر</div></div>
    </div>
    <a class="btn" href="https://t.me/${BOT_USERNAME || 'DogsVPNBot'}">🚀 شروع و دریافت کانفیگ در تلگرام</a>
  </div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // ۲) روت سابسکریپشن: /sub/:uuid
  const m = url.pathname.match(/^\/sub\/([A-Za-z0-9-]+)$/);
  if (m) {
    const uuid = m[1];
    const found = findServiceByUuid(uuid);

    let links = [];

    // اگر کاربر سرویس VIP داشته باشد
    if (found && found.service && found.service.config) {
      links.push(found.service.config);
    } else if (found && found.user && found.user.services && found.user.services.length) {
      links = found.user.services.map(s => s.config);
    } else {
      // در غیر این صورت از سرورهای استخر رایگان
      await ensureFreePool().catch(() => {});
      links = freePool.links.map(buildPoolLink);
    }

    if (!links.length) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('No active configs found');
    }

    const payload = links.join('\n');
    const plain = url.searchParams.get('fmt') === 'plain';
    const body = plain ? payload : Buffer.from(payload, 'utf8').toString('base64');

    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(body);
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`🌐 سرور HTTP روی پورت ${HTTP_PORT} فعال است.`);
});

/* ─────────────────────────── شروع ربات ─────────────────────────── */

ensureFreePool().catch(() => {});
setInterval(() => ensureFreePool().catch(() => {}), FETCH_INTERVAL_MS);

console.log('🚀 در حال راه‌اندازی ' + BOT_NAME + ' ...');
bot
  .launch({ dropPendingUpdates: true })
  .then(() => console.log('✅ ربات با موفقیت فعال شد!'))
  .catch(e => console.error('❌ اتصال تلگرام ناموفق:', e.message));

const gracefulStop = () => {
  try {
    bot.stop('SIGINT');
  } catch (e) { /* ignore */ }
};
process.once('SIGINT', gracefulStop);
process.once('SIGTERM', gracefulStop);
