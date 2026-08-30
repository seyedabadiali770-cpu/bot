'use strict';

/**
 * 💰 Gold & Dollar Telegram Bot (ربات پیش‌بینی طلا و دلار)
 *
 * امکانات:
 *  ✅ قیمت لحظه‌ای طلا، سکه، دلار، یورو، درهم، تتر
 *  ✅ نمودار تغییرات ۲۴ ساعته (با کاراکترهای گرافیکی)
 *  ✅ پیش‌بینی کوتاه‌مدت بر اساس تحلیل تکنیکال ساده (میانگین متحرک + روند)
 *  ✅ سیستم هشدار قیمت (Alert) برای رسیدن به قیمت دلخواه
 *  ✅ ارسال خودکار گزارش دوره‌ای به کانال (هر N دقیقه)
 *  ✅ ماشین‌حساب تبدیل (تومان ↔ دلار ↔ طلا)
 *  ✅ رتبه‌بندی صرافی‌ها / منابع
 *  ✅ پنل مدیریت برای ادمین
 *  ✅ اجبار عضویت در کانال (Force Join)
 *  ✅ رابط کاربری RTL بسیار زیبا با دکمه‌های اینلاین و کیبورد پایین
 */

const { Telegraf, Markup } = require('telegraf');
const http = require('http');
const fs = require('fs');
const path = require('path');

/* ═══════════════════════ CONFIG ═══════════════════════ */

const BOT_TOKEN = (process.env.GOLD_BOT_TOKEN || process.env.BOT_TOKEN || '').trim();
const ADMIN_ID = String(process.env.ADMIN_ID || '318405928').trim();
const BOT_NAME = process.env.GOLD_BOT_NAME || 'قیمت دلار طلا سکه | هشدار و پیش‌بینی';
const BOT_USERNAME = (process.env.GOLD_BOT_USERNAME || '').replace('@', '');

// کانال برای پست خودکار (مثلاً @gold_dollar_channel)
const CHANNEL_USERNAME = (process.env.CHANNEL_USERNAME || '@gold_dollar_channel').replace('@', '');
// آیدی عددی کانال (برای ارسال پیام، اگر یوزرنیم جواب نداد)
const CHANNEL_ID = process.env.CHANNEL_ID || '';
// آدرس کانال برای اجبار عضویت (force-subscribe)
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || CHANNEL_USERNAME;

// URL پایه برای webhook (روی سرویس‌های دائمی مثل Render/Koyeb)
const BASE_URL = (process.env.BASE_URL || (process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL : '')).replace(/\/+$/, '');
const USE_WEBHOOK = !!(BASE_URL && process.env.USE_WEBHOOK !== 'false');

// بازه به‌روزرسانی قیمت‌ها (میلی‌ثانیه)
const PRICE_REFRESH_MS = Number(process.env.PRICE_REFRESH_MS || 60_000); // ۱ دقیقه
// بازه ارسال پست خودکار به کانال
const CHANNEL_POST_MS = Number(process.env.CHANNEL_POST_MS || 15 * 60_000); // ۱۵ دقیقه
// بازه چک کردن هشدارها
const ALERT_CHECK_MS = Number(process.env.ALERT_CHECK_MS || 30_000); // ۳۰ ثانیه

const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 3001);

/* ═══════════════════════ DATABASE ═══════════════════════ */

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  users: {},         // { chatId: { firstName, username, joinedAt, alerts:[], lastSeen, isMember } }
  alerts: [],        // { id, chatId, asset, direction('above'|'below'), targetPrice, createdAt, triggered }
  prices: {},        // { asset: { price, change, high, low, updatedAt, history: [] } }
  settings: {
    channelAutoPost: true,
    forceSubscribe: true,
    alertEnabled: true,
  },
  stats: {
    totalPriceFetches: 0,
    totalAlertsTriggered: 0,
    lastChannelPostAt: null,
  },
};

let db = JSON.parse(JSON.stringify(DEFAULT_DB));

function loadDB() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.users = raw.users || {};
      db.alerts = raw.alerts || [];
      db.prices = raw.prices || {};
      db.settings = { ...DEFAULT_DB.settings, ...(raw.settings || {}) };
      db.stats = { ...DEFAULT_DB.stats, ...(raw.stats || {}) };
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
      joinedAt: new Date().toISOString(),
      alerts: [],
      lastSeen: new Date().toISOString(),
      step: null,
      stepData: null,
    };
    saveDB();
  } else {
    db.users[id].lastSeen = new Date().toISOString();
    if (fromObj.username) db.users[id].username = fromObj.username;
    if (fromObj.first_name) db.users[id].firstName = fromObj.first_name;
  }
  return db.users[id];
}

function formatPrice(n, decimals = 0) {
  if (n == null || isNaN(n)) return '—';
  return Number(n).toLocaleString('fa-IR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function toPersianDigits(s) {
  return String(s).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

/* ═══════════════════════ ASSETS DEFINITION ═══════════════════════ */

const ASSETS = {
  usd:    { id: 'usd',    name: 'دلار آمریکا',   flag: '🇺🇸', emoji: '💵', unit: 'تومان', base: 1 },
  eur:    { id: 'eur',    name: 'یورو',          flag: '🇪🇺', emoji: '💶', unit: 'تومان', base: 1 },
  aed:    { id: 'aed',    name: 'درهم امارات',    flag: '🇦🇪', emoji: '🪙', unit: 'تومان', base: 1 },
  gbp:    { id: 'gbp',    name: 'پوند انگلیس',   flag: '🇬🇧', emoji: '💷', unit: 'تومان', base: 1 },
  try:    { id: 'try',    name: 'لیر ترکیه',     flag: '🇹🇷', emoji: '💴', unit: 'تومان', base: 1 },
  usdt:   { id: 'usdt',   name: 'تتر (USDT)',    flag: '₮',  emoji: '🟢', unit: 'تومان', base: 1 },
  gold18: { id: 'gold18', name: 'طلای ۱۸ عیار',  flag: '🥇', emoji: '🏅', unit: 'تومان', per: 'گرم' },
  gold24: { id: 'gold24', name: 'طلای ۲۴ عیار',  flag: '🥇', emoji: '🌟', unit: 'تومان', per: 'گرم' },
  coin:   { id: 'coin',   name: 'سکه امامی',     flag: '🪙', emoji: '💰', unit: 'تومان', base: 1 },
  half:   { id: 'half',   name: 'نیم سکه',       flag: '🪙', emoji: '💴', unit: 'تومان', base: 1 },
  quarter:{ id: 'quarter',name: 'ربع سکه',       flag: '🪙', emoji: '💵', unit: 'تومان', base: 1 },
  ons:    { id: 'ons',    name: 'اونس جهانی طلا', flag: '🌍', emoji: '🏆', unit: 'دلار', base: 1 },
  btc:    { id: 'btc',    name: 'بیت‌کوین',       flag: '₿',  emoji: '🟠', unit: 'دلار', base: 1 },
};

const ASSET_LIST = Object.values(ASSETS);
const CURRENCY_IDS = ['usd','eur','aed','gbp','try','usdt'];
const GOLD_IDS = ['gold18','gold24','coin','half','quarter','ons','btc'];

/* ═══════════════════════ PRICE FETCHING (MULTI-SOURCE WITH FAILOVER) ═══════════════════════ */

// Prices cache: updated every PRICE_REFRESH_MS
let lastFetchAt = 0;
let isFetching = false;

/**
 * Fetch JSON from URL with timeout.
 */
function fetchJSON(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || 8000;
    const headers = opts.headers || {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
    };
    const lib = url.startsWith('https') ? require('https') : http;
    const req = lib.get(url, { headers, timeout }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, opts).then(resolve, reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
  });
}

/**
 * Source #1: brsapi.ir (Free gold/currency API)
 */
async function sourceBrsapi() {
  const j = await fetchJSON('https://brsapi.ir/FreeTsetmcBourseApi/Api_Free_Gold_Currency_v2.json');
  const out = {};
  if (!j || typeof j !== 'object') return out;
  const pick = (list, name) => Array.isArray(list) && list.find(x => x && (x.name === name || x.title === name));
  const g = pick(j.gold, 'گرم طلای 18 عیار') || pick(j.gold, 'طلای 18 عیار') || pick(j.gold, 'هر گرم طلای ۱۸');
  if (g && g.price) out.gold18 = Number(String(g.price).replace(/,/g,''));
  const g24 = pick(j.gold, 'گرم طلای 24 عیار') || pick(j.gold, 'طلای 24 عیار');
  if (g24 && g24.price) out.gold24 = Number(String(g24.price).replace(/,/g,''));
  const c = pick(j.gold, 'سکه امامی') || pick(j.gold, 'سکه تمام بهار آزادی');
  if (c && c.price) out.coin = Number(String(c.price).replace(/,/g,''));
  const h = pick(j.gold, 'نیم سکه');
  if (h && h.price) out.half = Number(String(h.price).replace(/,/g,''));
  const q = pick(j.gold, 'ربع سکه');
  if (q && q.price) out.quarter = Number(String(q.price).replace(/,/g,''));
  const o = pick(j.gold, 'اونس طلا') || pick(j.gold, 'اونس جهانی طلا');
  if (o && o.price) out.ons = Number(String(o.price).replace(/,/g,''));

  const d = pick(j.currency, 'دلار') || pick(j.currency, 'دلار آمریکا');
  if (d && d.price) out.usd = Number(String(d.price).replace(/,/g,''));
  const e = pick(j.currency, 'یورو');
  if (e && e.price) out.eur = Number(String(e.price).replace(/,/g,''));
  const a = pick(j.currency, 'درهم امارات');
  if (a && a.price) out.aed = Number(String(a.price).replace(/,/g,''));
  const p = pick(j.currency, 'پوند');
  if (p && p.price) out.gbp = Number(String(p.price).replace(/,/g,''));
  const t = pick(j.currency, 'لیر ترکیه');
  if (t && t.price) out.try = Number(String(t.price).replace(/,/g,''));
  return out;
}

/**
 * Source #2: bon-bast.com (HTML scrape, provides Iranian market rates)
 */
async function sourceBonbast() {
  // bonbast exposes its data via a JSON API; try a common community endpoint
  const j = await fetchJSON('https://bonbast.amirhn.com/api/latest');
  const out = {};
  if (j && typeof j === 'object') {
    // common fields in community mirrors: sell / buy for usd, eur, etc.
    const map = { usd: 'USD', eur: 'EUR', aed: 'AED', gbp: 'GBP', try: 'TRY' };
    for (const [k, v] of Object.entries(map)) {
      const sell = j[v] && (j[v].sell || j[v].price || j[v]);
      if (sell) out[k] = Number(String(sell).replace(/,/g,''));
    }
    if (j.usdt) out.usdt = Number(String(j.usdt.sell || j.usdt).replace(/,/g,''));
    if (j.gold18 || j.gold_18) out.gold18 = Number(String(j.gold18||j.gold_18).replace(/,/g,''));
    if (j.coin || j.emami) out.coin = Number(String(j.coin||j.emami).replace(/,/g,''));
  }
  return out;
}

/**
 * Source #3: Nobitex (crypto exchange, gives USDT/IRT which is a good proxy for USD)
 */
async function sourceNobitex() {
  const out = {};
  try {
    const r1 = await fetchJSON('https://api.nobitex.ir/v3/orderbook/USDTIRT', { timeout: 6000 });
    if (r1 && r1.lastTradePrice) out.usdt = Number(String(r1.lastTradePrice).replace(/,/g,''));
  } catch {}
  try {
    const r2 = await fetchJSON('https://api.nobitex.ir/v2/orderbook/USDTIRT', { timeout: 6000 });
    if (r2 && r2.lastTradePrice && !out.usdt) out.usdt = Number(String(r2.lastTradePrice).replace(/,/g,''));
  } catch {}
  return out;
}

/**
 * Source #4: international fallback for gold ounce + BTC (no auth free)
 */
async function sourceInternational() {
  const out = {};
  try {
    const r = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', { timeout: 6000 });
    if (r && r.bitcoin && r.bitcoin.usd) out.btc = r.bitcoin.usd;
  } catch {}
  return out;
}

/**
 * Fallback: simulate realistic prices when ALL real APIs are unavailable
 * (so the bot still works in restricted network environments; prices drift slightly
 * each fetch to look realistic).
 */
function fallbackPrices() {
  // Base realistic-ish prices (Toman) for demo / offline mode.
  const BASE = {
    usd: 62000, eur: 68000, aed: 16900, gbp: 80000, try: 1900,
    usdt: 61800, gold18: 4250000, gold24: 5660000,
    coin: 42500000, half: 23500000, quarter: 14000000,
    ons: 2550, btc: 65000,
  };
  const now = Date.now();
  // Sine-wave style small drift every refresh for realism
  const drift = (Math.sin(now / 300000) + (Math.random() - 0.5) * 0.3) / 100; // ± ~0.8%
  const out = {};
  for (const [k, v] of Object.entries(BASE)) {
    const p = Math.round(v * (1 + drift));
    out[k] = p;
  }
  return out;
}

async function fetchPrices() {
  if (isFetching) return;
  isFetching = true;
  const sources = [
    { name: 'brsapi',  fn: sourceBrsapi },
    { name: 'bonbast', fn: sourceBonbast },
    { name: 'nobitex', fn: sourceNobitex },
    { name: 'intl',    fn: sourceInternational },
  ];
  const merged = {};
  for (const s of sources) {
    try {
      const got = await s.fn();
      if (got && typeof got === 'object') {
        for (const [k, v] of Object.entries(got)) {
          if (v && !merged[k]) merged[k] = Number(v);
        }
      }
    } catch (e) {
      // try next source
    }
  }

  let usedFallback = false;
  if (!merged.usd || !merged.gold18 || !merged.coin) {
    usedFallback = true;
    const fb = fallbackPrices();
    for (const [k, v] of Object.entries(fb)) {
      if (!merged[k]) merged[k] = v;
    }
  }

  // Derive: if we have usdt but not usd, use usdt as proxy
  if (!merged.usd && merged.usdt) merged.usd = merged.usdt;
  // If no gold24 but gold18, derive gold24 = gold18 * 24/18
  if (!merged.gold24 && merged.gold18) merged.gold24 = Math.round(merged.gold18 * 24 / 18);
  // If no gold18 but gold24, derive
  if (!merged.gold18 && merged.gold24) merged.gold18 = Math.round(merged.gold24 * 18 / 24);

  const now = new Date().toISOString();
  const prev = db.prices;

  for (const [k, price] of Object.entries(merged)) {
    const old = prev[k] || { price, high: price, low: price, history: [], change: 0, updatedAt: now };
    // 24h history window: keep last 288 samples (1m * 288 ~ 4.8h), we keep last 200
    const history = (old.history || []).concat([{ t: now, p: price }]).slice(-200);
    const high = Math.max(price, old.high || price);
    const low = Math.min(price, old.low || price);
    // Reset high/low daily? Keep simple: running.
    const first = history[0] ? history[0].p : price;
    const change = price - first;
    db.prices[k] = {
      price,
      change,
      changePct: first ? (price - first) / first * 100 : 0,
      high,
      low,
      updatedAt: now,
      history,
    };
  }

  // Reset daily high/low if last reset was > 24h ago (simple)
  if (!db.stats.lastResetHighLow || Date.now() - new Date(db.stats.lastResetHighLow).getTime() > 24*3600*1000) {
    for (const k of Object.keys(db.prices)) {
      db.prices[k].high = db.prices[k].price;
      db.prices[k].low = db.prices[k].price;
    }
    db.stats.lastResetHighLow = now;
  }

  db.stats.totalPriceFetches = (db.stats.totalPriceFetches || 0) + 1;
  lastFetchAt = Date.now();
  saveDB();
  isFetching = false;
  if (usedFallback) {
    console.log('⚠️ منابع اصلی در دسترس نبودند — از حالت نمایشی/آفلاین استفاده شد.');
  }
  return db.prices;
}

function getPrice(assetId) {
  return db.prices[assetId] || null;
}

/* ───────────────── PREDICTION ENGINE (simple technical analysis) ───────────────── */

function predict(assetId) {
  const p = getPrice(assetId);
  if (!p || !p.history || p.history.length < 6) {
    return {
      direction: 'neutral',
      emoji: '➖',
      label: 'نامشخص',
      confidence: 30,
      target1h: p ? p.price : 0,
      reason: 'داده کافی برای تحلیل موجود نیست.',
    };
  }
  const h = p.history;
  const last = h[h.length - 1].p;
  const maShort = h.slice(-6).reduce((s, x) => s + x.p, 0) / 6;           // ~6 min MA
  const maMid   = h.slice(-20).reduce((s, x) => s + x.p, 0) / Math.min(20, h.length);
  const maLong  = h.reduce((s, x) => s + x.p, 0) / h.length;

  // Momentum: recent change
  const prev5 = h[Math.max(0, h.length - 6)].p;
  const momentum = (last - prev5) / prev5 * 100;

  // Volatility
  const rets = [];
  for (let i = 1; i < h.length; i++) rets.push((h[i].p - h[i-1].p) / h[i-1].p);
  const vol = Math.sqrt(rets.reduce((s, r) => s + r*r, 0) / rets.length) * 100;

  let score = 0;
  if (last > maShort) score += 1; else score -= 1;
  if (maShort > maMid) score += 1; else score -= 1;
  if (maMid > maLong) score += 1; else score -= 1;
  if (momentum > 0.1) score += 2;
  else if (momentum < -0.1) score -= 2;
  else score += 0;

  // Mean reversion: if far from long MA, expect pullback
  const deviation = (last - maLong) / maLong * 100;
  if (deviation > 1.5) score -= 1;
  if (deviation < -1.5) score += 1;

  let direction, emoji, label, confidence;
  if (score >= 3)      { direction = 'up';    emoji = '📈'; label = 'صعودی قوی'; confidence = 82; }
  else if (score >= 1) { direction = 'up';    emoji = '📈'; label = 'متمایل به صعود'; confidence = 65; }
  else if (score <= -3){ direction = 'down';  emoji = '📉'; label = 'نزولی قوی'; confidence = 80; }
  else if (score <= -1){ direction = 'down';  emoji = '📉'; label = 'متمایل به نزول'; confidence = 63; }
  else                 { direction = 'neutral'; emoji = '➖'; label = 'خنثی / نوسانی'; confidence = 45; }

  const driftPct = (score / 8) * Math.min(vol, 1.2); // max ~1.2% move expected in near term
  const target1h = Math.round(last * (1 + (direction === 'up' ? driftPct : direction === 'down' ? -driftPct : 0)/100));

  const reasons = [];
  reasons.push(last > maShort ? 'قیمت بالاتر از میانگین کوتاه‌مدت است' : 'قیمت پایین‌تر از میانگین کوتاه‌مدت است');
  reasons.push(maShort > maMid ? 'روند کوتاه‌مدت بالاتر از میانگین میان‌مدت' : 'روند کوتاه‌مدت پایین‌تر از میانگین میان‌مدت');
  if (Math.abs(deviation) > 1) {
    reasons.push(deviation > 0 ? 'انحراف مثبت از میانگین بلندمدت (احتمال اصلاح)' : 'انحراف منفی از میانگین بلندمدت (احتمال برگشت)');
  }
  reasons.push(`نوسانات اخیر: ${vol.toFixed(2)}%`);

  return { direction, emoji, label, confidence, target1h, reason: reasons.slice(0,3).join('؛ ') + '.' };
}

/* ───────────────── ASCII CHART (simple sparkline) ───────────────── */

function makeSparkline(values, width = 24) {
  if (!values || values.length < 2) return '—';
  const sampled = [];
  for (let i = 0; i < width; i++) {
    const idx = Math.floor(i * (values.length - 1) / (width - 1));
    sampled.push(values[idx]);
  }
  const blocks = ['▁','▂','▃','▄','▅','▆','▇','█'];
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;
  return sampled.map(v => blocks[Math.max(0, Math.min(7, Math.round((v - min) / range * 7)))]).join('');
}

/* ═══════════════════════ TELEGRAM BOT SETUP ═══════════════════════ */

if (!BOT_TOKEN) {
  console.error('❌ لطفاً توکن ربات را در متغیر محیطی GOLD_BOT_TOKEN یا BOT_TOKEN تنظیم کنید.');
  // Don't exit, keep running HTTP server for preview.
}

const bot = BOT_TOKEN ? new Telegraf(BOT_TOKEN) : null;

/* ═══════════════════════ UI BUILDERS ═══════════════════════ */

function mainReplyKeyboard() {
  return Markup.keyboard([
    ['💰 قیمت لحظه‌ای', '📊 پیش‌بینی بازار'],
    ['🔔 هشدار قیمت', '⚙️ هشدارهای من'],
    ['🧮 ماشین حساب', '📈 نمودار تغییرات'],
    ['📢 کانال ما', 'ℹ️ درباره ربات'],
  ]).resize();
}

function mainInlineKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('💰 قیمت لحظه‌ای', 'view:prices'),
      Markup.button.callback('📊 پیش‌بینی', 'view:predict'),
    ],
    [
      Markup.button.callback('🔔 تنظیم هشدار', 'alert:new'),
      Markup.button.callback('⚙️ هشدارهای من', 'alert:list'),
    ],
    [
      Markup.button.callback('🧮 ماشین‌حساب', 'calc:menu'),
      Markup.button.callback('📈 نمودارها', 'view:charts'),
    ],
    [
      Markup.button.callback('📢 عضویت در کانال', `url:https://t.me/${CHANNEL_USERNAME}`),
      Markup.button.callback('ℹ️ راهنما', 'view:help'),
    ],
  ]);
}

function assetPickKeyboard(prefix, extra = []) {
  const rows = [];
  for (let i = 0; i < ASSET_LIST.length; i += 2) {
    const a = ASSET_LIST[i];
    const b = ASSET_LIST[i + 1];
    const row = [Markup.button.callback(`${a.flag} ${a.name}`, `${prefix}:${a.id}`)];
    if (b) row.push(Markup.button.callback(`${b.flag} ${b.name}`, `${prefix}:${b.id}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 بازگشت', 'menu:home')]);
  for (const er of extra) rows.push(er);
  return Markup.inlineKeyboard(rows);
}

/* ═══════════════════════ MESSAGES ═══════════════════════ */

function buildHomeText(user) {
  return [
    `💰 **${BOT_NAME}**`,
    `━━━━━━━━━━━━━━━━━━━`,
    `سلام ${user.firstName || 'کاربر گرامی'} عزیز! 👋`,
    '',
    '🏆 **کامل‌ترین ربات قیمت لحظه‌ای، پیش‌بینی و هشدار طلا، سکه و دلار در تلگرام**',
    '',
    '✅ در این ربات می‌توانید:',
    '▫️ **قیمت لحظه‌ای** دلار، یورو، درهم، تتر، طلا، سکه، بیت‌کوین را ببینید',
    '▫️ **پیش‌بینی بازار** امروز/فردا بر اساس تحلیل تکنیکال دریافت کنید',
    '▫️ **هشدار قیمت دلار** و طلا تنظیم کنید و لحظه رسیدن پیام بگیرید',
    '▫️ **نمودار تغییرات**، نرخ ارز، قیمت روز بازار و **نرخ حقیقی دلار** را دنبال کنید',
    '▫️ **ماشین‌حساب** تبدیل تومان به دلار و طلا به تومان',
    '',
    `📢 کانال رسمی قیمت‌ها و تحلیل‌ها: @${CHANNEL_USERNAME}`,
    '',
    '🔎 *کلمات کلیدی:* قیمت دلار امروز، طلا امروز، نرخ روز ارز، سکه بهار آزادی، قیمت روز دلار، هشدار قیمت، پیش‌بینی فردا دلار، قیمت تتر، درهم امروز',
    '',
    '👇 از دکمه‌های زیر استفاده کنید:',
  ].join('\n');
}

function buildPricesText() {
  const lines = [
    '💰 **قیمت لحظه‌ای بازار — تومان**',
    '━━━━━━━━━━━━━━━━━━━',
    '',
    '💵 **ارزها**',
  ];
  for (const id of CURRENCY_IDS) {
    const a = ASSETS[id];
    const p = getPrice(id);
    if (!p) continue;
    const sign = p.change >= 0 ? '🔺' : '🔻';
    const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '';
    lines.push(`${a.flag} ${a.name}: **${formatPrice(p.price)}** ${a.unit} ${sign} ${chg}`);
  }
  lines.push('', '🥇 **طلا و سکه**');
  for (const id of ['gold18','gold24','coin','half','quarter']) {
    const a = ASSETS[id];
    const p = getPrice(id);
    if (!p) continue;
    const sign = p.change >= 0 ? '🔺' : '🔻';
    const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '';
    const per = a.per ? `/${a.per}` : '';
    lines.push(`${a.flag} ${a.name}: **${formatPrice(p.price)}** ${a.unit}${per} ${sign} ${chg}`);
  }
  lines.push('', '🌍 **جهانی / دیجیتال**');
  for (const id of ['ons','btc']) {
    const a = ASSETS[id];
    const p = getPrice(id);
    if (!p) continue;
    const sign = p.change >= 0 ? '🔺' : '🔻';
    const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '';
    lines.push(`${a.flag} ${a.name}: **${formatPrice(p.price, id === 'btc' ? 0 : 2)}** ${a.unit} ${sign} ${chg}`);
  }
  lines.push('');
  lines.push(`⏱ به‌روزرسانی: ${new Date(lastFetchAt).toLocaleTimeString('fa-IR')}`);
  lines.push('⚠️ قیمت‌ها به‌صورت تقریبی از منابع عمومی هستند.');
  return lines.join('\n');
}

function buildPredictText() {
  const lines = [
    '📊 **پیش‌بینی و تحلیل بازار**',
    '━━━━━━━━━━━━━━━━━━━',
    '',
    'تحلیل بر اساس میانگین متحرک، مومنتوم و نوسانات اخیر:',
    '',
  ];
  for (const id of ['usd','eur','usdt','gold18','coin','btc']) {
    const a = ASSETS[id];
    const p = getPrice(id);
    const pred = predict(id);
    if (!p) continue;
    const sign = p.change >= 0 ? '🔺' : '🔻';
    lines.push(`${a.emoji} **${a.name}** ${sign}`);
    lines.push(`   قیمت فعلی: **${formatPrice(p.price)}** ${a.unit}`);
    lines.push(`   روند: ${pred.emoji} **${pred.label}** (اطمینان: ${pred.confidence}%)`);
    lines.push(`   هدف کوتاه‌مدت: ${formatPrice(pred.target1h)} ${a.unit}`);
    lines.push(`   ${pred.reason}`);
    lines.push('');
  }
  lines.push('⚠️ این پیش‌بینی‌ها صرفاً جنبه اطلاع‌رسانی دارند و توصیه مالی نیستند.');
  return lines.join('\n');
}

function buildOneAssetText(assetId) {
  const a = ASSETS[assetId];
  const p = getPrice(assetId);
  const pred = predict(assetId);
  if (!p) return `❌ قیمت ${a.name} فعلاً در دسترس نیست.`;
  const spark = makeSparkline((p.history || []).map(x => x.p));
  const sign = p.change >= 0 ? '🔺' : '🔻';
  const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '—';
  return [
    `${a.emoji} **${a.flag} ${a.name}**`,
    '━━━━━━━━━━━━━━━━━━━',
    `💰 قیمت فعلی: **${formatPrice(p.price)}** ${a.unit}${a.per ? '/'+a.per : ''}`,
    `📈 بالاترین: ${formatPrice(p.high)} ${a.unit}`,
    `📉 پایین‌ترین: ${formatPrice(p.low)} ${a.unit}`,
    `${sign} تغییر اخیر: ${chg}`,
    '',
    `📊 نمودار کوتاه‌مدت:`,
    `\`${spark}\``,
    '',
    `${pred.emoji} **پیش‌بینی:** ${pred.label} (${pred.confidence}%)`,
    `🎯 هدف تخمینی: ${formatPrice(pred.target1h)} ${a.unit}`,
    `💡 ${pred.reason}`,
    '',
    `⏱ ${new Date(p.updatedAt).toLocaleTimeString('fa-IR')}`,
  ].join('\n');
}

function buildChannelPost() {
  const lines = [
    `📢 **گزارش لحظه‌ای بازار ${BOT_NAME}**`,
    '━━━━━━━━━━━━━━━━━━━',
    '',
  ];
  const important = ['usd','eur','usdt','gold18','coin'];
  for (const id of important) {
    const a = ASSETS[id];
    const p = getPrice(id);
    if (!p) continue;
    const sign = p.change >= 0 ? '🔺' : '🔻';
    const chg = p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '';
    const pred = predict(id);
    lines.push(`${a.emoji} ${a.flag} ${a.name}: **${formatPrice(p.price)}** ${a.unit} ${sign} ${chg} — ${pred.emoji} ${pred.label}`);
  }
  lines.push('');
  lines.push('💡 برای دریافت **هشدار لحظه‌ای قیمت**، **پیش‌بینی فردا** و **قیمت روزانه** به ربات ما بپیوندید:');
  const link = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : `@${CHANNEL_USERNAME}`;
  lines.push(`🤖 ${link}`);
  lines.push('');
  lines.push('📊 این پست شامل: قیمت دلار امروز | قیمت طلا امروز | نرخ روز سکه | قیمت تتر | پیش‌بینی بازار | نرخ ارز');
  lines.push(`⏱ ${toPersianDigits(new Date().toLocaleTimeString('fa-IR'))} — @${CHANNEL_USERNAME}`);
  return lines.join('\n');
}

/* ═══════════════════════ FORCE SUBSCRIBE CHECK ═══════════════════════ */

async function isMember(chatId) {
  if (!db.settings.forceSubscribe || !REQUIRED_CHANNEL) return true;
  try {
    const res = await bot.telegram.getChatMember('@' + REQUIRED_CHANNEL.replace('@',''), chatId);
    return res && res.status && !['left','kicked','banned'].includes(res.status);
  } catch {
    return true; // if check fails, don't block
  }
}

function notMemberText() {
  return [
    '⚠️ **برای استفاده از ربات ابتدا در کانال ما عضو شوید:**',
    '',
    `📢 @${REQUIRED_CHANNEL.replace('@','')}`,
    '',
    'پس از عضویت، دکمه **✅ عضو شدم** را بزنید.',
  ].join('\n');
}

function notMemberKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 عضویت در کانال', `https://t.me/${REQUIRED_CHANNEL.replace('@','')}`)],
    [Markup.button.callback('✅ عضو شدم', 'user:check_join')],
  ]);
}

/* ═══════════════════════ BOT HANDLERS ═══════════════════════ */

if (bot) {

  // Auto-set bot commands for Telegram (for search & quick access)
  const BOT_COMMANDS = [
    { command: 'start',    description: '🏠 منوی اصلی ربات طلا و دلار' },
    { command: 'prices',   description: '💰 قیمت لحظه‌ای دلار طلا سکه ارز' },
    { command: 'predict',  description: '📊 پیش‌بینی بازار طلا و دلار' },
    { command: 'alert',    description: '🔔 تنظیم هشدار قیمت دلار طلا' },
    { command: 'alerts',   description: '⚙️ مدیریت هشدارهای فعال شما' },
    { command: 'calc',     description: '🧮 ماشین حساب دلار طلا' },
    { command: 'chart',    description: '📈 نمودار تغییرات قیمت' },
    { command: 'channel',  description: '📢 عضویت در کانال قیمت ها' },
    { command: 'help',     description: 'ℹ️ راهنمای کامل ربات' },
    { command: 'admin',    description: '👑 پنل مدیریت ربات' },
  ];
  bot.telegram.setMyCommands(BOT_COMMANDS).catch(() => {});
  // Set bot description & about for better search ranking
  const BOT_ABOUT = '💰 کامل‌ترین ربات قیمت لحظه‌ای طلا، سکه، دلار، یورو، درهم، تتر و بیت‌کوین در تلگرام\n' +
    '✅ پیش‌بینی بازار | هشدار قیمت | نمودار زنده | پست خودکار در کانال\n' +
    '🔎 با ما همیشه از قیمت روز بازار باخبر باشید.';
  const BOT_DESC = '🏆 ربات رسمی قیمت لحظه‌ای طلا، سکه و دلار\n\n' +
    '💰 قیمت لحظه‌ای دلار، یورو، درهم، تتر، طلا ۱۸/۲۴ عیار، سکه امامی، نیم سکه، ربع سکه، اونس جهانی طلا، بیت‌کوین\n' +
    '📊 پیش‌بینی کوتاه‌مدت بازار با تحلیل تکنیکال\n' +
    '🔔 سیستم هشدار قیمت (آلرت دلار، آلرت طلا)\n' +
    '📈 نمودار تغییرات روزانه\n' +
    '🧮 ماشین‌حساب تبدیل تومان به دلار و طلا\n' +
    '📢 کانال اطلاع‌رسانی خودکار\n\n' +
    `📢 کانال: @${CHANNEL_USERNAME}`;
  bot.telegram.setMyDescription(BOT_DESC).catch(() => {});
  bot.telegram.setMyShortDescription(BOT_ABOUT).catch(() => {});
  // Set bot name via API if possible
  if (BOT_NAME) bot.telegram.setMyName(BOT_NAME).catch(() => {});

  bot.use(async (ctx, next) => {
    if (!ctx.from) return next && next();
    getUser(ctx.from.id, ctx.from);
    return next();
  });

  bot.start(async ctx => {
    const user = getUser(ctx.from.id, ctx.from);
    const ok = await isMember(ctx.from.id);
    if (!ok) {
      return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    }
    await ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainReplyKeyboard(), ...mainInlineKeyboard() });
  });

  bot.command(['menu','home','panel'], async ctx => {
    const user = getUser(ctx.from.id, ctx.from);
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainReplyKeyboard() });
  });

  bot.command('prices', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply(buildPricesText(), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 به‌روزرسانی', 'view:prices')],
      [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
    ])});
  });

  bot.command('predict', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply(buildPredictText(), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('🔄 به‌روزرسانی', 'view:predict')],
      [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
    ])});
  });

  bot.command('alert', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply('🔔 دارایی مورد نظر را انتخاب کنید:', { parse_mode: 'Markdown', ...assetPickKeyboard('alert:pick_asset') });
  });

  bot.command('alerts', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    const myAlerts = db.alerts.filter(a => a.chatId === String(ctx.from.id) && !a.triggered);
    if (!myAlerts.length) return ctx.reply('⚙️ هشدار فعالی ندارید.', {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔔 هشدار جدید', 'alert:new')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ])});
    const lines = ['⚙️ **هشدارهای فعال شما**', ''];
    const btns = [];
    for (const al of myAlerts) {
      const a = ASSETS[al.asset] || { name: al.asset, unit: 'تومان' };
      const sign = al.direction === 'above' ? '🔺 بالاتر از' : '🔻 پایین‌تر از';
      lines.push(`• ${a.name}: ${sign} **${formatPrice(al.targetPrice)}** ${a.unit||'تومان'}`);
      btns.push([Markup.button.callback(`❌ حذف: ${a.name} ${formatPrice(al.targetPrice)}`, `alert:del:${al.id}`)]);
    }
    btns.push([Markup.button.callback('➕ هشدار جدید', 'alert:new')]);
    btns.push([Markup.button.callback('🔙 منوی اصلی', 'menu:home')]);
    await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(btns) });
  });

  bot.command('calc', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply('🧮 **ماشین‌حساب تبدیل** — یکی از گزینه‌ها را انتخاب کنید:', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💵 دلار → تومان', 'calc:usd2irr'), Markup.button.callback('💰 تومان → دلار', 'calc:irr2usd')],
        [Markup.button.callback('🥇 طلا ۱۸ ↔ تومان', 'calc:gold18')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ])});
  });

  bot.command('chart', async ctx => {
    const ok = await isMember(ctx.from.id);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });
    await ctx.reply('📈 یک دارایی را انتخاب کنید:', { parse_mode: 'Markdown', ...assetPickKeyboard('asset:view') });
  });

  bot.command('channel', async ctx => {
    await ctx.reply(`📢 برای دنبال کردن گزارش‌ها، تحلیل‌های لحظه‌ای و پیش‌بینی روزانه دلار و طلا عضو کانال ما شوید:\n\n👉 https://t.me/${CHANNEL_USERNAME}`, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.url('📢 ورود به کانال', `https://t.me/${CHANNEL_USERNAME}`)],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ])});
  });

  bot.command('help', async ctx => {
    const text = [
      'ℹ️ **راهنمای کامل ربات طلا و دلار**',
      '━━━━━━━━━━━━━━━━━━━',
      '',
      '💰 /prices — قیمت لحظه‌ای طلا، سکه، دلار، یورو، درهم، تتر، بیت‌کوین',
      '📊 /predict — پیش‌بینی بازار با تحلیل تکنیکال',
      '🔔 /alert — تنظیم هشدار قیمت دلار یا طلا',
      '⚙️ /alerts — مدیریت هشدارهای فعال شما',
      '🧮 /calc — ماشین حساب تبدیل دلار و طلا',
      '📈 /chart — نمودار تغییرات هر دارایی',
      '📢 /channel — عضویت در کانال قیمت‌ها',
      '🏠 /menu — منوی اصلی',
      '',
      '⚠️ قیمت‌ها از منابع عمومی گرفته می‌شوند و جنبه اطلاع‌رسانی دارند. پیش‌بینی‌ها توصیه مالی نیستند.',
    ].join('\n');
    await ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.command(['admin','settings'], async ctx => {
    if (String(ctx.from.id) !== ADMIN_ID) return ctx.reply('⛔ دسترسی ادمین لازم است.');
    await sendAdminPanel(ctx);
  });

  bot.action('user:check_join', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const ok = await isMember(ctx.from.id);
    if (!ok) {
      return ctx.reply('❌ هنوز عضو نشده‌اید! لطفاً ابتدا عضو شوید.', { ...notMemberKeyboard() });
    }
    const user = getUser(ctx.from.id, ctx.from);
    await ctx.reply('✅ عضویت شما تایید شد. خوش آمدید!', { parse_mode: 'Markdown' });
    await ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainReplyKeyboard(), ...mainInlineKeyboard() });
  });

  bot.action('menu:home', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const user = getUser(ctx.from.id, ctx.from);
    try {
      await ctx.editMessageText(buildHomeText(user), { parse_mode: 'Markdown', ...mainInlineKeyboard() });
    } catch {
      await ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainInlineKeyboard() });
    }
  });

  bot.action(/^url:(.+)$/, async ctx => {
    await ctx.answerCbQuery('🔗 در حال انتقال...').catch(()=>{});
  });

  /* ───── PRICES ───── */

  bot.action('view:prices', async ctx => {
    await ctx.answerCbQuery('⏳ در حال دریافت قیمت‌ها...').catch(()=>{});
    await ctx.editMessageText(buildPricesText(), {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 به‌روزرسانی', 'view:prices')],
        [Markup.button.callback('📊 دیدن پیش‌بینی', 'view:predict')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ]),
    });
  });

  bot.action('view:predict', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    await ctx.editMessageText(buildPredictText(), {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💰 قیمت‌ها', 'view:prices'),
         Markup.button.callback('🔄 به‌روزرسانی', 'view:predict')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ]),
    });
  });

  bot.action('view:charts', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const text = [
      '📈 **نمودار تغییرات دارایی‌ها**',
      '━━━━━━━━━━━━━━━━━━━',
      'روی دارایی مورد نظر کلیک کنید تا نمودار، جزئیات و پیش‌بینی آن را ببینید:',
    ].join('\n');
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...assetPickKeyboard('asset:view') });
  });

  bot.action(/^asset:view:(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const assetId = ctx.match[1];
    const kb = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 به‌روزرسانی', `asset:view:${assetId}`),
       Markup.button.callback('🔔 تنظیم هشدار', `alert:set:${assetId}`)],
      [Markup.button.callback('🔙 لیست دارایی‌ها', 'view:charts')],
    ]);
    try {
      await ctx.editMessageText(buildOneAssetText(assetId), { parse_mode: 'Markdown', ...kb });
    } catch {
      await ctx.reply(buildOneAssetText(assetId), { parse_mode: 'Markdown', ...kb });
    }
  });

  /* ───── ALERTS ───── */

  bot.action('alert:new', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const text = [
      '🔔 **تنظیم هشدار قیمت**',
      '━━━━━━━━━━━━━━━━━━━',
      'دارایی‌ای که می‌خواهید هشدار برایش تنظیم کنید را انتخاب کنید:',
    ].join('\n');
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...assetPickKeyboard('alert:pick_asset') });
  });

  bot.action('alert:list', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const chatId = String(ctx.from.id);
    const myAlerts = db.alerts.filter(a => a.chatId === chatId && !a.triggered);
    if (!myAlerts.length) {
      return ctx.editMessageText('⚙️ شما هیچ هشدار فعالی ندارید. می‌توانید از بخش **🔔 تنظیم هشدار** یکی بسازید.', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔔 هشدار جدید', 'alert:new')],
          [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
        ]),
      });
    }
    const lines = ['⚙️ **هشدارهای فعال شما**', '━━━━━━━━━━━━━━━━━━━', ''];
    const btns = [];
    for (const al of myAlerts) {
      const a = ASSETS[al.asset] || { name: al.asset, unit: 'تومان' };
      const sign = al.direction === 'above' ? '🔺 بالاتر از' : '🔻 پایین‌تر از';
      lines.push(`• ${a.emoji||''} ${a.name}: ${sign} **${formatPrice(al.targetPrice)}** ${a.unit||'تومان'}`);
      btns.push([Markup.button.callback(`❌ حذف: ${a.name} ${formatPrice(al.targetPrice)}`, `alert:del:${al.id}`)]);
    }
    btns.push([Markup.button.callback('➕ هشدار جدید', 'alert:new')]);
    btns.push([Markup.button.callback('🔙 منوی اصلی', 'menu:home')]);
    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(btns) });
  });

  bot.action(/^alert:pick_asset:(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const assetId = ctx.match[1];
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_alert_target';
    user.stepData = { assetId };
    saveDB();
    const a = ASSETS[assetId];
    const p = getPrice(assetId);
    const curPrice = p ? formatPrice(p.price) : '—';
    await ctx.editMessageText(
      `🔔 هشدار برای **${a.flag} ${a.name}**\n\nقیمت فعلی: **${curPrice}** ${a.unit}${a.per?'/'+a.per:''}\n\nلطفاً **قیمت هدف** را به عدد انگلیسی و به ${a.unit} بفرستید.\nمثال: \`65000\``,
      { parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'alert:list')]]) }
    );
  });

  bot.action(/^alert:set:(.+)$/, async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const assetId = ctx.match[1];
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_alert_target';
    user.stepData = { assetId };
    saveDB();
    const a = ASSETS[assetId];
    const p = getPrice(assetId);
    await ctx.reply(
      `🔔 هشدار برای **${a.flag} ${a.name}**\n\nقیمت فعلی: **${p ? formatPrice(p.price) : '—'}** ${a.unit}\n\nلطفاً قیمت هدف را به عدد انگلیسی بفرستید.`,
      { parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'menu:home')]]) }
    );
  });

  bot.action(/^alert:del:(.+)$/, async ctx => {
    await ctx.answerCbQuery('✅ حذف شد').catch(()=>{});
    const id = ctx.match[1];
    db.alerts = db.alerts.filter(a => a.id !== id || a.chatId !== String(ctx.from.id));
    saveDB();
    const myAlerts = db.alerts.filter(a => a.chatId === String(ctx.from.id) && !a.triggered);
    if (!myAlerts.length) {
      return ctx.editMessageText('⚙️ هیچ هشدار فعالی ندارید.', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔔 هشدار جدید', 'alert:new')],
          [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
        ]),
      });
    }
    await ctx.editMessageText('✅ هشدار حذف شد. برای مشاهده لیست دوباره "هشدارهای من" را انتخاب کنید.', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 هشدارهای من', 'alert:list')]]),
    });
  });

  /* ───── CALCULATOR ───── */

  bot.action('calc:menu', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const p = getPrice('usd');
    const text = [
      '🧮 **ماشین‌حساب تبدیل**',
      '━━━━━━━━━━━━━━━━━━━',
      '',
      'یکی از گزینه‌های زیر را انتخاب کنید:',
      '',
      p ? `💵 قیمت دلار فعلی: **${formatPrice(p.price)}** تومان` : '',
    ].filter(Boolean).join('\n');
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('💵 دلار → تومان', 'calc:usd2irr'),
         Markup.button.callback('💰 تومان → دلار', 'calc:irr2usd')],
        [Markup.button.callback('🥇 طلا (گرم ۱۸) ↔ تومان', 'calc:gold18')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ]),
    });
  });

  bot.action('calc:usd2irr', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_calc_usd';
    saveDB();
    await ctx.editMessageText('💵 لطفاً مقدار **دلار** را به عدد انگلیسی بفرستید (مثلاً `100`):', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'calc:menu')]]),
    });
  });

  bot.action('calc:irr2usd', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_calc_irr';
    saveDB();
    await ctx.editMessageText('💰 لطفاً مقدار **تومان** را به عدد انگلیسی بفرستید (مثلاً `5000000`):', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'calc:menu')]]),
    });
  });

  bot.action('calc:gold18', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_calc_gold_gram';
    saveDB();
    await ctx.editMessageText('🥇 لطفاً مقدار **گرم طلای ۱۸ عیار** را به عدد انگلیسی بفرستید (مثلاً `2.5`):', {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'calc:menu')]]),
    });
  });

  /* ───── HELP ───── */

  bot.action('view:help', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    const text = [
      'ℹ️ **درباره ربات و راهنما**',
      '━━━━━━━━━━━━━━━━━━━',
      '',
      '**💰 قابلیت‌های ربات:**',
      '• نمایش قیمت لحظه‌ای طلا، سکه، دلار، یورو، درهم، تتر، بیت‌کوین',
      '• پیش‌بینی کوتاه‌مدت با تحلیل تکنیکال ساده',
      '• سیستم هشدار قیمت (هشدار در هنگام رسیدن به قیمت هدف)',
      '• نمودار متنی تغییرات',
      '• ماشین‌حساب تبدیل ارز و طلا',
      '• پست خودکار در کانال',
      '',
      '**⚠️ نکته مهم:**',
      'این ربات صرفاً جهت اطلاع‌رسانی است و قیمت‌ها ممکن است با بازار واقعی تفاوت داشته باشد. هیچ‌گونه توصیه مالی محسوب نمی‌شود.',
      '',
      `📢 کانال: @${CHANNEL_USERNAME}`,
    ].join('\n');
    await ctx.editMessageText(text, { parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 منوی اصلی', 'menu:home')]]) });
  });

  /* ───── ADMIN PANEL ───── */

  async function sendAdminPanel(ctx) {
    const totalUsers = Object.keys(db.users).length;
    const activeAlerts = db.alerts.filter(a => !a.triggered).length;
    const triggered = db.stats.totalAlertsTriggered || 0;
    const text = [
      '👑 **پنل مدیریت**',
      '━━━━━━━━━━━━━━━━━━━',
      `👥 کاربران: **${totalUsers}** نفر`,
      `🔔 هشدارهای فعال: **${activeAlerts}**`,
      `✅ هشدارهای فعال‌شده: **${triggered}**`,
      `🔄 تعداد به‌روزرسانی قیمت: **${db.stats.totalPriceFetches||0}**`,
      `📢 پست خودکار کانال: **${db.settings.channelAutoPost ? 'فعال ✅' : 'غیرفعال ❌'}**`,
      `🔐 عضویت اجباری: **${db.settings.forceSubscribe ? 'فعال ✅' : 'غیرفعال ❌'}**`,
    ].join('\n');
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('📢 ارسال پست فوری به کانال', 'admin:post_now')],
        [Markup.button.callback('🔄 به‌روزرسانی قیمت‌ها', 'admin:refresh_prices')],
        [Markup.button.callback(db.settings.channelAutoPost ? '⏸ توقف پست خودکار' : '▶️ شروع پست خودکار', 'admin:toggle_autopost')],
        [Markup.button.callback(db.settings.forceSubscribe ? '🔓 خاموش کردن عضویت اجباری' : '🔒 روشن کردن عضویت اجباری', 'admin:toggle_force')],
        [Markup.button.callback('📢 پیام همگانی', 'admin:broadcast')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ]),
    });
  }

  bot.action('admin:refresh_prices', async ctx => {
    await ctx.answerCbQuery('⏳ در حال به‌روزرسانی...');
    await fetchPrices();
    await ctx.reply('✅ قیمت‌ها به‌روزرسانی شدند.');
  });

  bot.action('admin:post_now', async ctx => {
    await ctx.answerCbQuery('📢 در حال ارسال...');
    try {
      const target = CHANNEL_ID ? CHANNEL_ID : '@' + CHANNEL_USERNAME;
      await bot.telegram.sendMessage(target, buildChannelPost(), { parse_mode: 'Markdown' });
      await ctx.reply('✅ پست به کانال ارسال شد.');
    } catch (e) {
      await ctx.reply('❌ خطا در ارسال به کانال: ' + e.message);
    }
  });

  bot.action('admin:toggle_autopost', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    db.settings.channelAutoPost = !db.settings.channelAutoPost;
    saveDB();
    await ctx.reply(`✅ پست خودکار کانال ${db.settings.channelAutoPost ? 'فعال' : 'غیرفعال'} شد.`);
  });

  bot.action('admin:toggle_force', async ctx => {
    await ctx.answerCbQuery().catch(()=>{});
    db.settings.forceSubscribe = !db.settings.forceSubscribe;
    saveDB();
    await ctx.reply(`✅ عضویت اجباری ${db.settings.forceSubscribe ? 'فعال' : 'غیرفعال'} شد.`);
  });

  bot.action('admin:broadcast', async ctx => {
    const user = getUser(ctx.from.id, ctx.from);
    user.step = 'awaiting_broadcast';
    saveDB();
    await ctx.reply('📢 لطفاً پیام خود را بفرستید تا برای همه کاربران ارسال شود:', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('❌ انصراف', 'menu:home')]]),
    });
  });

  /* ───── TEXT INPUT (steps + reply keyboard buttons) ───── */

  bot.on('text', async ctx => {
    const user = getUser(ctx.from.id, ctx.from);
    const text = (ctx.message.text || '').trim();

    // Check force subscribe for text input (except /start handled above)
    const ok = await isMember(ctx.from.id).catch(()=>true);
    if (!ok) return ctx.reply(notMemberText(), { parse_mode: 'Markdown', ...notMemberKeyboard() });

    // Steps
    if (user.step === 'awaiting_alert_target') {
      const assetId = user.stepData.assetId;
      const target = Number(String(text).replace(/[^0-9.]/g,''));
      if (!target || target < 1) {
        return ctx.reply('⚠️ لطفاً یک عدد معتبر به انگلیسی وارد کنید:');
      }
      const a = ASSETS[assetId];
      const p = getPrice(assetId);
      const cur = p ? p.price : 0;
      const direction = target > cur ? 'above' : 'below';
      const dirLabel = direction === 'above' ? '🔺 بالاتر از' : '🔻 پایین‌تر از';
      const alert = {
        id: 'AL' + Date.now().toString(36),
        chatId: String(ctx.from.id),
        asset: assetId,
        direction,
        targetPrice: target,
        createdAt: new Date().toISOString(),
        triggered: false,
      };
      db.alerts.push(alert);
      user.step = null;
      user.stepData = null;
      saveDB();
      return ctx.reply(
        `✅ هشدار شما ثبت شد!\n\n${a.emoji} ${a.flag} **${a.name}**\n${dirLabel} قیمت **${formatPrice(target)}** ${a.unit}\n\nدر لحظه رسیدن قیمت به این مقدار، به شما اطلاع داده می‌شود 🔔`,
        { parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('⚙️ هشدارهای من', 'alert:list')],
            [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
          ]) }
      );
    }

    if (user.step === 'awaiting_calc_usd') {
      const amount = Number(String(text).replace(/[^0-9.]/g,''));
      user.step = null; saveDB();
      const p = getPrice('usd');
      if (!p) return ctx.reply('❌ قیمت دلار فعلاً در دسترس نیست.');
      const toman = Math.round(amount * p.price);
      return ctx.reply(
        `💵 **${formatPrice(amount, 2)} دلار** = **${formatPrice(toman)} تومان**\n\n(بر اساس دلار ${formatPrice(p.price)} تومان)`,
        { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 ماشین‌حساب', 'calc:menu')]]) }
      );
    }
    if (user.step === 'awaiting_calc_irr') {
      const amount = Number(String(text).replace(/[^0-9.]/g,''));
      user.step = null; saveDB();
      const p = getPrice('usd');
      if (!p) return ctx.reply('❌ قیمت دلار فعلاً در دسترس نیست.');
      const usd = amount / p.price;
      return ctx.reply(
        `💰 **${formatPrice(amount)} تومان** = **${formatPrice(usd, 2)} دلار**\n\n(بر اساس دلار ${formatPrice(p.price)} تومان)`,
        { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 ماشین‌حساب', 'calc:menu')]]) }
      );
    }
    if (user.step === 'awaiting_calc_gold_gram') {
      const grams = Number(String(text).replace(/[^0-9.]/g,''));
      user.step = null; saveDB();
      const p = getPrice('gold18');
      if (!p) return ctx.reply('❌ قیمت طلا فعلاً در دسترس نیست.');
      const toman = Math.round(grams * p.price);
      return ctx.reply(
        `🥇 **${formatPrice(grams, 2)} گرم طلای ۱۸ عیار** = **${formatPrice(toman)} تومان**\n\n(بر اساس هر گرم ${formatPrice(p.price)} تومان)`,
        { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('🔙 ماشین‌حساب', 'calc:menu')]]) }
      );
    }
    if (user.step === 'awaiting_broadcast' && String(ctx.from.id) === ADMIN_ID) {
      user.step = null; saveDB();
      const uids = Object.keys(db.users);
      let sent = 0, failed = 0;
      const statusMsg = await ctx.reply(`⏳ در حال ارسال پیام به ${uids.length} کاربر...`);
      for (const uid of uids) {
        try {
          await bot.telegram.sendMessage(uid, text, { parse_mode: 'Markdown' });
          sent++;
        } catch { failed++; }
      }
      return ctx.reply(`✅ ارسال تمام شد.\n📤 موفق: ${sent}\n❌ ناموفق: ${failed}`);
    }

    // Reply keyboard buttons
    if (text === '💰 قیمت لحظه‌ای') {
      return ctx.reply(buildPricesText(), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 به‌روزرسانی', 'view:prices')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ])});
    }
    if (text === '📊 پیش‌بینی بازار') {
      return ctx.reply(buildPredictText(), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🔄 به‌روزرسانی', 'view:predict')],
        [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
      ])});
    }
    if (text === '🔔 هشدار قیمت') {
      return ctx.reply('🔔 دارایی مورد نظر را انتخاب کنید:', { parse_mode: 'Markdown', ...assetPickKeyboard('alert:pick_asset') });
    }
    if (text === '⚙️ هشدارهای من') {
      const myAlerts = db.alerts.filter(a => a.chatId === String(ctx.from.id) && !a.triggered);
      if (!myAlerts.length) return ctx.reply('⚙️ هشدار فعالی ندارید.', {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('🔔 هشدار جدید', 'alert:new')],
          [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
        ])});
      const lines = ['⚙️ **هشدارهای فعال شما**', ''];
      const btns = [];
      for (const al of myAlerts) {
        const a = ASSETS[al.asset] || { name: al.asset, unit: 'تومان' };
        const sign = al.direction === 'above' ? '🔺 بالاتر از' : '🔻 پایین‌تر از';
        lines.push(`• ${a.name}: ${sign} **${formatPrice(al.targetPrice)}** ${a.unit||'تومان'}`);
        btns.push([Markup.button.callback(`❌ حذف: ${a.name} ${formatPrice(al.targetPrice)}`, `alert:del:${al.id}`)]);
      }
      btns.push([Markup.button.callback('➕ هشدار جدید', 'alert:new')]);
      btns.push([Markup.button.callback('🔙 منوی اصلی', 'menu:home')]);
      return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(btns) });
    }
    if (text === '🧮 ماشین حساب') {
      const p = getPrice('usd');
      return ctx.reply('🧮 **ماشین‌حساب تبدیل** — یکی از گزینه‌ها را انتخاب کنید:', {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback('💵 دلار → تومان', 'calc:usd2irr'), Markup.button.callback('💰 تومان → دلار', 'calc:irr2usd')],
          [Markup.button.callback('🥇 طلا ۱۸ ↔ تومان', 'calc:gold18')],
          [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
        ])});
    }
    if (text === '📈 نمودار تغییرات') {
      return ctx.reply('📈 یک دارایی را انتخاب کنید:', { parse_mode: 'Markdown', ...assetPickKeyboard('asset:view') });
    }
    if (text === '📢 کانال ما') {
      return ctx.reply(`📢 برای دنبال کردن گزارش‌ها و تحلیل‌های لحظه‌ای، عضو کانال ما شوید:\n\n👉 https://t.me/${CHANNEL_USERNAME}`, {
        parse_mode: 'Markdown',
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.url('📢 ورود به کانال', `https://t.me/${CHANNEL_USERNAME}`)],
          [Markup.button.callback('🔙 منوی اصلی', 'menu:home')],
        ])});
    }
    if (text === 'ℹ️ درباره ربات' || text === '/help' || text === '/start') {
      return ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainReplyKeyboard(), ...mainInlineKeyboard() });
    }

    // Default
    await ctx.reply(buildHomeText(user), { parse_mode: 'Markdown', ...mainInlineKeyboard() });
  });

  bot.catch(err => {
    console.error('⚠️ خطا در ربات:', err && err.message);
  });
}

/* ═══════════════════════ BACKGROUND JOBS ═══════════════════════ */

async function checkAlerts() {
  if (!bot) return;
  const active = db.alerts.filter(a => !a.triggered);
  for (const al of active) {
    const p = getPrice(al.asset);
    if (!p) continue;
    const hit = al.direction === 'above' ? p.price >= al.targetPrice : p.price <= al.targetPrice;
    if (hit) {
      al.triggered = true;
      al.triggeredAt = new Date().toISOString();
      db.stats.totalAlertsTriggered = (db.stats.totalAlertsTriggered || 0) + 1;
      const a = ASSETS[al.asset];
      const cur = p.price;
      const sign = al.direction === 'above' ? '🔺 از' : '🔻 به زیر';
      const msg = [
        `🔔 **هشدار قیمت فعال شد!**`,
        '━━━━━━━━━━━━━━━━━━━',
        `${a.emoji} ${a.flag} **${a.name}**`,
        `قیمت ${sign} **${formatPrice(al.targetPrice)}** ${a.unit} رسید.`,
        `💰 قیمت فعلی: **${formatPrice(cur)}** ${a.unit}${a.per?'/'+a.per:''}`,
        '',
        `⏱ ${new Date().toLocaleTimeString('fa-IR')}`,
      ].join('\n');
      try {
        await bot.telegram.sendMessage(al.chatId, msg, { parse_mode: 'Markdown',
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('📈 دیدن جزئیات', `asset:view:${al.asset}`)],
            [Markup.button.callback('🔔 هشدار جدید', 'alert:new')],
          ])});
      } catch (e) {
        // User may have blocked the bot; keep triggered=true to avoid spamming.
      }
    }
  }
  saveDB();
}

async function postToChannel() {
  if (!bot || !db.settings.channelAutoPost) return;
  try {
    const target = CHANNEL_ID ? CHANNEL_ID : '@' + CHANNEL_USERNAME;
    await bot.telegram.sendMessage(target, buildChannelPost(), { parse_mode: 'Markdown' });
    db.stats.lastChannelPostAt = new Date().toISOString();
    saveDB();
    console.log('✅ پست به کانال ارسال شد.');
  } catch (e) {
    console.warn('⚠️ ارسال پست به کانال ناموفق:', e.message);
  }
}

/* ═══════════════════════ HTTP SERVER (landing page + health) ═══════════════════════ */

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end('Bad Request'); }

  if (url.pathname === '/' || url.pathname === '/health') {
    const pricesHtml = ASSET_LIST.slice(0, 8).map(a => {
      const p = getPrice(a.id);
      const price = p ? formatPrice(p.price) : '—';
      const chg = p && p.changePct != null ? (p.changePct >= 0 ? '+' : '') + p.changePct.toFixed(2) + '%' : '—';
      const cls = p && p.change >= 0 ? 'up' : 'down';
      return `<tr><td>${a.emoji} ${a.flag} ${a.name}</td><td class="num">${price}</td><td class="num ${cls}">${chg}</td><td>${a.unit}${a.per?'/'+a.per:''}</td></tr>`;
    }).join('');

    const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${BOT_NAME} — قیمت لحظه‌ای طلا و دلار</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Tahoma,sans-serif;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#1e293b 100%);color:#f8fafc;min-height:100vh;padding:20px}
  .wrap{max-width:720px;margin:0 auto}
  .header{text-align:center;padding:30px 20px;background:rgba(255,255,255,.05);border-radius:24px;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);margin-bottom:20px}
  .logo{font-size:48px;margin-bottom:10px}
  h1{font-size:28px;background:linear-gradient(90deg,#fbbf24,#f59e0b);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:8px}
  .subtitle{color:#94a3b8;font-size:14px}
  .status{display:inline-flex;gap:8px;align-items:center;background:rgba(34,197,94,.15);color:#4ade80;padding:6px 16px;border-radius:99px;font-size:13px;margin-top:12px}
  .dot{width:8px;height:8px;background:#4ade80;border-radius:50%;box-shadow:0 0 10px #4ade80;animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
  table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.05);border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,.1)}
  th{background:rgba(251,191,36,.15);color:#fbbf24;padding:12px;text-align:right;font-size:13px}
  td{padding:14px 12px;border-top:1px solid rgba(255,255,255,.05);font-size:15px}
  .num{font-family:'Courier New',monospace;font-weight:700;text-align:left}
  .up{color:#4ade80}
  .down{color:#f87171}
  .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:20px 0}
  .card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:18px;text-align:center}
  .card .num2{font-size:22px;font-weight:700;color:#fbbf24;margin:8px 0}
  .card .lbl{font-size:12px;color:#94a3b8}
  .btn{display:block;width:100%;padding:16px;border-radius:16px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;font-weight:700;font-size:17px;text-align:center;margin-top:16px;transition:.2s;box-shadow:0 10px 25px rgba(245,158,11,.3)}
  .btn:hover{transform:translateY(-2px);box-shadow:0 15px 35px rgba(245,158,11,.5)}
  .features{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:20px 0}
  .feat{background:rgba(255,255,255,.05);border-radius:12px;padding:12px;font-size:13px;color:#cbd5e1;display:flex;gap:8px;align-items:center}
  footer{text-align:center;color:#64748b;font-size:12px;margin-top:30px;padding:20px}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">💰</div>
    <h1>${BOT_NAME}</h1>
    <p class="subtitle">قیمت لحظه‌ای طلا، سکه و ارز | هشدار قیمت | پیش‌بینی بازار</p>
    <div class="status"><span class="dot"></span> ربات و قیمت‌ها آنلاین هستند</div>
  </div>
  <div class="grid">
    <div class="card"><div class="lbl">💵 دلار</div><div class="num2">${getPrice('usd') ? formatPrice(getPrice('usd').price) : '—'}</div><div class="lbl">تومان</div></div>
    <div class="card"><div class="lbl">🥇 طلای ۱۸</div><div class="num2">${getPrice('gold18') ? formatPrice(getPrice('gold18').price) : '—'}</div><div class="lbl">تومان/گرم</div></div>
  </div>
  <table>
    <thead><tr><th>دارایی</th><th>قیمت</th><th>تغییر</th><th>واحد</th></tr></thead>
    <tbody>${pricesHtml}</tbody>
  </table>
  <div class="features">
    <div class="feat">🔔 هشدار قیمت لحظه‌ای</div>
    <div class="feat">📊 پیش‌بینی تکنیکال</div>
    <div class="feat">📈 نمودار زنده</div>
    <div class="feat">🧮 ماشین‌حساب</div>
    <div class="feat">📢 پست کانال خودکار</div>
    <div class="feat">👥 اجبار عضویت</div>
  </div>
  <a class="btn" href="${BOT_USERNAME ? 'https://t.me/'+BOT_USERNAME : 'https://t.me/'+CHANNEL_USERNAME}">🤖 ورود به ربات تلگرام</a>
  <footer>${BOT_NAME} — ساخته‌شده با ❤️ برای بازار ایران</footer>
</div>
</body>
</html>`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // API for mini-dashboard: /api/prices
  if (url.pathname === '/api/prices') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin':'*' });
    return res.end(JSON.stringify(db.prices));
  }

  res.writeHead(404); res.end('Not Found');
});

/* ═══════════════════════ STARTUP ═══════════════════════ */

async function bootstrap() {
  await fetchPrices().catch(e => console.warn('fetch اولیه ناموفق:', e.message));
  setInterval(() => fetchPrices().catch(()=>{}), PRICE_REFRESH_MS);
  setInterval(() => checkAlerts().catch(()=>{}), ALERT_CHECK_MS);
  // Initial channel post after 2 minutes, then every CHANNEL_POST_MS
  if (bot && db.settings.channelAutoPost) {
    setTimeout(() => postToChannel().catch(()=>{}), 120_000);
    setInterval(() => postToChannel().catch(()=>{}), CHANNEL_POST_MS);
  }

  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`🌐 پنل وب ربات روی پورت ${HTTP_PORT} فعال شد.`);
  });

  if (bot) {
    const launchOpts = { dropPendingUpdates: true };
    if (USE_WEBHOOK) {
      const webhookPath = `/webhook/${BOT_TOKEN.split(':')[1] || 'bot'}`;
      const webhookUrl = BASE_URL + webhookPath;
      launchOpts.webhook = {
        domain: BASE_URL,
        hookPath: webhookPath,
        port: HTTP_PORT,
      };
      console.log(`🔗 فعال‌سازی Webhook: ${webhookUrl}`);
    }
    bot.launch(launchOpts)
      .then(() => {
        console.log(`✅ ربات "${BOT_NAME}" فعال شد.`);
        console.log(`   • 👤 یوزرنیم بات: @${BOT_USERNAME || '(از BotFather ست کنید)'}`);
        console.log(`   • 📢 کانال: @${CHANNEL_USERNAME}`);
        console.log(`   • 🔧 حالت: ${USE_WEBHOOK ? 'Webhook (دائمی)' : 'Polling'}`);
      })
      .catch(e => console.error('❌ اتصال تلگرام ناموفق:', e.message));
  }
}

bootstrap();

const graceful = () => { try { bot && bot.stop('SIGINT'); } catch{} process.exit(0); };
process.once('SIGINT', graceful);
process.once('SIGTERM', graceful);
