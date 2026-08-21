'use strict';

/**
 * 🐶 DogsVPN — ربات تلگرامی کانفیگ‌ساز رایگان
 * تمام امکانات بدون پرداخت — برای همیشه رایگان ♾️
 *
 * امکانات:
 *  - ساخت کانفیگ VLESS / VMess / Trojan / Shadowsocks / WireGuard
 *  - لینک اشتراک (Subscription) اختصاصی برای هر کاربر
 *  - انتخاب سرور با تست پینگ
 *  - وضعیت حساب per-user
 *  - اتصال اختیاری به پنل 3x-ui (X-UI) برای ساخت واقعی کاربر روی پنل
 *
 * متغیرهای محیطی:
 *  BOT_TOKEN (اجباری) — توکن ربات از @BotFather
 *  BOT_NAME — نام ربات (پیش‌فرض: 🐶 DogsVPN)
 *  BOT_USERNAME — یوزرنیم ربات (برای لینک تلگرام در صفحه وضعیت)
 *  BASE_URL — آدرس عمومی برنامه (برای لینک اشتراک، مثل https://xxx.up.railway.app)
 *  PORT — پورت HTTP (در Railway خودکار ست می‌شود)
 *  SERVERS_JSON — لیست سرورها (اختیاری، JSON)
 *  SS_METHOD — روش رمزنگاری Shadowsocks (پیش‌فرض aes-256-gcm)
 *  VLESS_FLOW — مثل xtls-rprx-vision (اختیاری)
 *  SNI — نام دامنه سرور (اختیاری)
 *  WG_SERVER_PUBLIC_KEY — کلید عمومی سرور WireGuard (اختیاری)
 *  XUI_BASE_URL / XUI_USERNAME / XUI_PASSWORD / XUI_INBOUND_IDS / XUI_CONFIG_HOST
 *      — اتصال به پنل 3x-ui (اختیاری): اگر ست شود، کاربر واقعی روی پنل ساخته می‌شود
 *  DEMO_USER — برای تست محلی: یک کاربر نمونه می‌سازد (اختیاری)
 */

const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/* ─────────────────────────── تنظیمات ─────────────────────────── */

const BOT_TOKEN = process.env.BOT_TOKEN || '';
if (!BOT_TOKEN) {
  console.error('❌ متغیر محیطی BOT_TOKEN تنظیم نشده است.');
  console.error('   توکن را از @BotFather بگیرید و در Railway → Variables → BOT_TOKEN بگذارید.');
  process.exit(1);
}

const BOT_NAME = process.env.BOT_NAME || '🐶 DogsVPN';
const BOT_USERNAME = (process.env.BOT_USERNAME || 'dogs_vpnbot').replace('@', '');
const BASE_URL = (process.env.BASE_URL || '').replace(/\/+$/, '');
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

/* ─────────────────────────── لیست سرورها ─────────────────────────── */

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
    socket.setTimeout(5000);
    const t = Date.now();
    socket.on('connect', () => { socket.destroy(); resolve(Date.now() - t); });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
    try { socket.connect(port, host); } catch (e) { resolve(null); }
  });
}

function cfgName(s) {
  return `${BOT_NAME} — ${s.flag} ${s.name}`;
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
    const method = SS_METHOD;
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
  return [
    `${BOT_NAME}`,
    '━━━━━━━━━━━━━━━',
    '✅ *کاملاً رایگان برای همیشه*',
    '🚫 بدون پرداخت، بدون اشتراک، بدون محدودیت',
    '',
    '✨ امکانات:',
    `▫️ ساخت کانفیگ از ${SERVERS.length} سرور`,
    '▫️ پروتکل‌های VLESS ،VMess ،Trojan ،Shadowsocks و WireGuard',
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
  const srv = getServer(u.serverId);
  const lines = [
    '📊 *وضعیت حساب*',
    '',
    `👤 نام: ${ctx.from.first_name || '—'}`,
    `🆔 آیدی: \`${u.chatId}\``,
    `🔑 UUID: \`${u.uuid}\``,
    `🌍 سرور: ${srv.flag} ${srv.name} — \`${srv.host}:${srv.port}\``,
    `📅 عضویت: ${u.createdAt.slice(0, 10)}`,
    '',
    '💰 هزینه: **رایگان ♾️**',
    '⏳ انقضا: ندارد — برای همیشه فعال',
  ];
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
  await ctx.editMessageText('🌍 سرور مورد نظرت رو انتخاب کن:', { reply_markup: serverMenu().reply_markup }).catch(() => {});
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
    '▫️ سرور دلخواهت رو از «🌍 تغییر سرور» انتخاب کن',
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
  const srv = getServer(u.serverId);
  const lines = [
    '📊 *وضعیت حساب*',
    '',
    `👤 نام: ${ctx.from.first_name || '—'}`,
    `🆔 آیدی: \`${u.chatId}\``,
    `🔑 UUID: \`${u.uuid}\``,
    `🌍 سرور: ${srv.flag} ${srv.name} — \`${srv.host}:${srv.port}\``,
    `📅 عضویت: ${u.createdAt.slice(0, 10)}`,
    '',
    '💰 هزینه: **رایگان ♾️**',
    '⏳ انقضا: ندارد — برای همیشه فعال',
  ];
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
    let srv = getServer(u.serverId);
    let panelNote = '';

    if (XUI_ENABLED) {
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
    if (proto === 'wg') {
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

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch (e) {
    res.writeHead(400); return res.end('400');
  }

  // صفحه وضعیت / سلامت
  if (url.pathname === '/' || url.pathname === '/health') {
    const count = Object.keys(users).length;
    const demoUser = process.env.DEMO_USER ? findByUuid('') || Object.values(users)[0] : null;
    const demoSub = demoUser ? `<p><a class="btn2" href="/sub/${demoUser.uuid}">🧪 تست لینک اشتراک نمونه</a></p>` : '';
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
    <a class="btn" href="tg://resolve?domain=${BOT_USERNAME}">🚀 شروع در تلگرام</a>
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
    const sub = buildSubscription(u);
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

// کاربر نمونه برای تست محلی (DEMO_USER=chatId)
if (process.env.DEMO_USER) {
  const demo = getUser(process.env.DEMO_USER);
  console.log('🧪 کاربر نمونه ساخته شد، UUID:', demo.uuid);
  if (BASE_URL) console.log('🔗 لینک اشتراک نمونه:', BASE_URL + '/sub/' + demo.uuid);
}

/* ─────────────────────────── اجرا ─────────────────────────── */

console.log('🚀 در حال شروع ' + BOT_NAME + ' ...');
bot.launch({ dropPendingUpdates: true })
  .then(() => console.log('✅ ربات روشن شد!'))
  .catch(e => console.error('❌ اتصال به تلگرام ناموفق:', e.message));

const stopBot = () => { try { bot.stop('SIGINT'); } catch (e) { /* bot not running */ } };
process.once('SIGINT', stopBot);
process.once('SIGTERM', stopBot);
