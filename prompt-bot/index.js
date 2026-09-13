'use strict';

/* ============================================================
   🎨 پرامپت عکس بات — ربات کانال پرامپت تصویرسازی هوش مصنوعی
   ------------------------------------------------------------
   کارش چیه؟
     ۱) ربات رو توی کانال (یا سوپرگروپ) عضو و ادمین می‌کنی؛ خودش
        تشخیص می‌ده و کانال رو به خاطر می‌سپاره.
     ۲) هر ساعت (قابل تغییر) یک پرامپت عکس جدید پست می‌کنه:
        عکس نمونه‌ی ساخته‌شده با همون پرامپت + متن پرامپت آماده کپی
        + دسته‌بندی و نکته‌ی فارسی + هشتگ.
     ۳) بانک داخلی پرامپت‌ها (prompts.js) همیشه هست؛ اگر کلید
        هوش مصنوعی (AI_API_KEY) بذاری، بخشی از پست‌ها هم به‌صورت
        خودکار و تازه تولید می‌شه (ترکیبی).
     ۴) پنل مدیریت در چت خصوصی ربات: پست فوری، پیش‌نمایش، تنظیم
        بازه‌ی زمانی، انتخاب دسته‌بندی، افزودن پرامپت دلخواه، آمار.

   اجرا:
     node index.js        (توکن ربات از BotFather → PROMPT_BOT_TOKEN)
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

const { CATEGORIES, PROMPTS } = require('./prompts');

/* ─────────────────────────── تنظیمات ─────────────────────────── */

// توکن پیش‌فرض ربات کانال پرامپت (مثل بقیه‌ی ربات‌های این پروژه).
// بهتر است برای امنیت، توکن را در متغیر محیطی PROMPT_BOT_TOKEN بگذاری و این مقدار را خالی کنی.
const DEFAULT_PROMPT_TOKEN = '8747751997:AAHc_SIpWKmY4Y2BB4LpIDHCROKpzMm-2rs';

const BOT_TOKEN = (
  process.env.PROMPT_BOT_TOKEN ||
  process.env.PROMPT_TOKEN ||
  DEFAULT_PROMPT_TOKEN
).trim();
const BOT_NAME = process.env.PROMPT_BOT_NAME || '🎨 پرامپت عکس';
const ADMIN_ID = String(process.env.PROMPT_ADMIN_ID || process.env.ADMIN_ID || '318405928').trim();

// کانال پیش‌فرض (اختیاری)؛ اگر نذاری، ربات خودش کانالی که ادمینش کنی رو تشخیص می‌ده
const PRESET_CHANNEL = (process.env.PROMPT_CHANNEL_ID || process.env.PROMPT_CHANNEL || '').trim();

// لینک دکمه‌ی «تست همین پرامپت»
const TRY_URL = process.env.PROMPT_TRY_URL || 'https://arena.ai';

// تنظیمات عکس نمونه
const IMAGE_ENABLED = String(process.env.PROMPT_IMAGE || 'on').toLowerCase() !== 'off';
const POLLINATIONS_BASE = (process.env.POLLINATIONS_BASE || 'https://image.pollinations.ai').replace(/\/+$/, '');
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || 'flux';
const IMAGE_WIDTH = Number(process.env.PROMPT_IMAGE_WIDTH || 1024);
const IMAGE_HEIGHT = Number(process.env.PROMPT_IMAGE_HEIGHT || 1024);
const IMAGE_TIMEOUT_MS = Number(process.env.PROMPT_IMAGE_TIMEOUT_MS || 120000);

// کلید اختیاری برای تولید عکس/متن با OpenAI (اگر بود، عکس از OpenAI گرفته می‌شود)
const OPENAI_KEY = (process.env.OPENAI_API_KEY || '').trim();
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE || '1024x1024';

// کلید اختیاری هوش مصنوعی برای تولید پرامپت تازه (هر سرویس سازگار با OpenAI)
const AI_KEY = (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || '').trim();
const AI_BASE = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const AI_MODEL = process.env.AI_MODEL || (process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini');
const AI_RATIO = Math.max(0, Math.min(1, Number(process.env.PROMPT_AI_RATIO || 0.35))); // سهم پست‌های AI از کل پست‌ها

const STATE_PATH = process.env.PROMPT_STATE_PATH || path.join(__dirname, '..', 'data', 'prompt-bot.json');
let bot = null; // نمونه‌ی Telegraf (در پایین مقداردهی می‌شود)
let wizard = null; // ویزارد افزودن پرامپت: { step, data }
let awaitingInterval = false; // منتظر عدد بازه‌ی زمانی از ادمین
// برای تست محلی می‌توان آدرس Bot API را به شبیه‌ساز محلی تغییر داد
const TELEGRAM_API_ROOT = (process.env.TELEGRAM_API_ROOT || '').replace(/\/+$/, '');
const POST_INTERVAL_DEFAULT_MIN = Number(process.env.PROMPT_INTERVAL_MINUTES || 60);
const TICK_MS = 30 * 1000; // هر ۳۰ ثانیه بررسی می‌کنه که وقت پست هست یا نه

/* ─────────────────────────── وضعیت (state) ─────────────────────────── */

const defaultState = () => ({
  channel: null, // { id, title, username, type, addedAt }
  settings: {
    intervalMinutes: POST_INTERVAL_DEFAULT_MIN,
    paused: false,
    categories: [], // خالی = همه‌ی دسته‌ها
    withImage: IMAGE_ENABLED,
    useAi: !!AI_KEY && AI_RATIO > 0,
    hashtags: true,
  },
  lastPostedAt: 0,
  nextTryAt: 0,
  seen: [], // آی‌دی پرامپت‌هایی که اخیراً پست شدن
  custom: [], // پرامپت‌های اضافه‌شده توسط ادمین
  pendingSample: null, // نمونه‌کار عکسی که ادمین فرستاده تا در پست بعدی استفاده شود
  stats: { posts: 0, fails: 0, byDay: {} },
  history: [], // آخرین پست‌ها برای «تکرار نکن»
});

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
      const s = defaultState();
      return {
        ...s,
        ...raw,
        settings: { ...s.settings, ...(raw.settings || {}) },
        stats: { ...s.stats, ...(raw.stats || {}) },
        seen: Array.isArray(raw.seen) ? raw.seen : [],
        custom: Array.isArray(raw.custom) ? raw.custom : [],
        pendingSample: raw.pendingSample || null,
        history: Array.isArray(raw.history) ? raw.history : [],
      };
    }
  } catch (e) {
    console.error('[prompt-bot] خواندن state ناموفق:', e.message);
  }
  return defaultState();
}

let state = loadState();

let saveTimer = null;
function saveState(now = false) {
  if (saveTimer) clearTimeout(saveTimer);
  const write = () => {
    try {
      fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
    } catch (e) {
      console.error('[prompt-bot] ذخیره state ناموفق:', e.message);
    }
  };
  if (now) return write();
  saveTimer = setTimeout(write, 1500);
}

/* ─────────────────────────── ابزارها ─────────────────────────── */

const today = () => new Date().toISOString().slice(0, 10);
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const faNum = n => Number(n || 0).toLocaleString('fa-IR');

function catOf(id) {
  return CATEGORIES.find(c => c.id === id) || { id: id || 'misc', fa: 'عمومی', emoji: '🎨' };
}

function allPrompts() {
  return PROMPTS.concat(state.custom || []);
}

function activePrompts() {
  const cats = state.settings.categories || [];
  const list = allPrompts();
  return cats.length ? list.filter(p => cats.includes(p.cat)) : list;
}

/** یک پرامپت تازه انتخاب کن که اخیراً پست نشده باشد */
function pickPrompt() {
  const list = activePrompts();
  if (!list.length) return null;
  const seen = new Set(state.seen || []);
  let pool = list.filter(p => !seen.has(p.id));
  if (!pool.length) {
    // همه دیده شده‌اند → لیست را ریست کن
    state.seen = [];
    pool = list;
  }
  const item = pool[Math.floor(Math.random() * pool.length)];
  state.seen = (state.seen || []).concat(item.id).slice(-600);
  saveState();
  return item;
}

/* ─────────────────────────── تولید پرامپت با AI ─────────────────────────── */

const AI_SYSTEM_PROMPT = `You are a senior prompt engineer for text-to-image models (Flux, Midjourney, DALL·E).
Return ONLY a compact JSON object with these keys:
{"title_fa":"<6-9 کلمه فارسی، عنوان جذاب>","tip_fa":"<یک جمله فارسی: نکته‌ی استفاده یا ایده‌ی تغییر پرامپت>","prompt_en":"<a rich English image prompt, 35-60 words, describe subject, composition, lighting, lens, style, mood, colors, quality tags>","category":"<one of: portrait, fantasy, anime, logo, product, scifi, nature, cartoon, render3d, food, cyberpunk, car, animal, wedding, persian, sport, painting, avatar, arch, fashion, poster, kidsbook, infographic>"}`;

async function aiPrompt(idea) {
  if (!AI_KEY) return null;
  const userMsg = idea
    ? `یک پرامپت تصویری تازه و خلاقانه بساز با موضوع/ایده: «${idea}».`
    : 'یک پرامپت تصویری تازه، متفاوت و خلاقانه بساز (هر موضوع و سبکی که جذاب و پرطرفدار باشد).';
  try {
    const res = await fetch(`${AI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_KEY}` },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    let text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('پاسخ خالی');
    text = text.replace(/```json|```/g, '').trim();
    const obj = JSON.parse(text);
    if (!obj.prompt_en) throw new Error('پرامپت انگلیسی ندارد');
    return {
      id: 'ai-' + Date.now().toString(36),
      cat: CATEGORIES.some(c => c.id === obj.category) ? obj.category : 'misc',
      t: (obj.title_fa || 'پرامپت هوش مصنوعی').trim(),
      tip: (obj.tip_fa || '').trim(),
      prompt: String(obj.prompt_en).trim(),
      ai: true,
    };
  } catch (e) {
    console.error('[prompt-bot] تولید پرامپت با AI ناموفق:', e.message);
    return null;
  }
}

/* ─────────────────────────── ساخت عکس نمونه ─────────────────────────── */

async function fetchImage(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS), ...opts });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error('پاسخ عکس نیست (' + type + ')');
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1024) throw new Error('عکس خیلی کوچک است');
  return buf;
}

async function openaiImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: OPENAI_IMAGE_SIZE,
      n: 1,
    }),
    signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('OpenAI HTTP ' + res.status);
  const data = await res.json();
  const item = data && data.data && data.data[0];
  if (!item) throw new Error('پاسخ OpenAI خالی است');
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item.url) return fetchImage(item.url);
  throw new Error('خروجی OpenAI ناشناخته');
}

/** عکس نمونه رو می‌سازه؛ اگر نشد null برمی‌گردونه تا پست متنی بفرستیم */
async function makeImage(prompt) {
  if (!state.settings.withImage) return null;
  const seed = Math.floor(Math.random() * 1e6);
  const useOpenai = !!OPENAI_KEY && String(process.env.PROMPT_IMAGE_SOURCE || '').toLowerCase() !== 'pollinations';

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (useOpenai) return await openaiImage(prompt);
      const url =
        `${POLLINATIONS_BASE}/prompt/${encodeURIComponent(prompt)}` +
        `?width=${IMAGE_WIDTH}&height=${IMAGE_HEIGHT}&nologo=true&model=${encodeURIComponent(POLLINATIONS_MODEL)}&seed=${seed}`;
      return await fetchImage(url);
    } catch (e) {
      console.error(`[prompt-bot] ساخت عکس ناموفق (تلاش ${attempt}):`, e.message);
      if (attempt < 2) await sleep(8000);
    }
  }
  return null;
}

/* ─────────────────────────── متن پست ─────────────────────────── */

/** هشتگ مخصوص هر دسته */
const CAT_HASHTAGS = {
  portrait:   ['#پرتره', '#عکاسی_پرتره', '#PortraitPrompt'],
  avatar:     ['#آواتار', '#پروفایل', '#AvatarPrompt'],
  fantasy:    ['#فانتزی', '#دنیای_فانتزی', '#FantasyArt'],
  anime:      ['#انیمه', '#مانگا', '#AnimeArt'],
  cartoon:    ['#کارتونی', '#تصویرسازی_کودکانه', '#CartoonArt'],
  logo:       ['#لوگو', '#برندینگ', '#LogoDesign'],
  poster:     ['#پوستر', '#طراحی_گرافیک', '#PosterDesign'],
  product:    ['#عکس_محصول', '#تبلیغات', '#ProductShot'],
  food:       ['#غذا', '#عکاسی_غذا', '#FoodPhotography'],
  scifi:      ['#علمی_تخیلی', '#فضا', '#SciFiArt'],
  cyberpunk:  ['#سایبرپانک', '#نئون', '#CyberpunkArt'],
  render3d:   ['#رندر_سه_بعدی', '#طراحی_سه_بعدی', '#3DRender'],
  nature:     ['#طبیعت', '#منظره', '#NaturePhotography'],
  persian:    ['#ایران', '#هنر_ایرانی', '#PersianArt'],
  animal:     ['#حیوانات', '#حیات_وحش', '#AnimalArt'],
  car:        ['#خودرو', '#ماشین', '#CarPhotography'],
  fashion:    ['#مد', '#فشن', '#FashionEditorial'],
  wedding:    ['#عروسی', '#عاشقانه', '#WeddingPhotography'],
  sport:      ['#ورزشی', '#ورزش', '#SportsPhotography'],
  painting:   ['#نقاشی', '#هنر_دستی', '#Painting'],
  arch:       ['#معماری', '#دکوراسیون', '#Architecture'],
  kidsbook:   ['#کتاب_کودک', '#تصویرسازی', '#KidsBookIllustration'],
  infographic:['#اینفوگرافیک', '#نمودار', '#InfographicDesign'],
  custom:     ['#پرامپت_اختصاصی', '#پرامپت_شخصی'],
  misc:       ['#خلاقانه', '#ایده_عکس'],
};

/** هشتگ‌های هر پست: پایه + دسته + کلیدواژه‌های داخل پرامپت */
function hashtagsFor(item) {
  const c = catOf(item.cat);
  const p = String(item.prompt || '').toLowerCase();
  const tags = ['#پرامپت_تصویر', '#هوش_مصنوعی', '#پرامپت_عکس'].concat(CAT_HASHTAGS[c.id] || []);

  if (c.id !== 'portrait' && !/#پرتره/.test(tags.join('')) && /portrait|headshot|face/.test(p)) tags.push('#پرتره');
  if (/logo|monogram|branding/.test(p)) tags.push('#لوگو', '#برندینگ');
  if (/anime|manga|chibi|mecha/.test(p)) tags.push('#انیمه');
  if (/cinematic|film|movie/.test(p)) tags.push('#سینمایی');
  if (/neon|cyberpunk|synthwave/.test(p)) tags.push('#سایبرپانک');
  if (/3d|octane|render|cgi/.test(p)) tags.push('#سه_بعدی', '#Rendering');
  if (/midjourney|dall|stable diffusion|flux/.test(p)) tags.push('#مدل_تصویرسازی');
  if (c.id === 'persian') tags.push('#PersianArt', '#Iran');
  if (item.ai) tags.push('#پرامپت_هوش_مصنوعی');

  return [...new Set(tags)].slice(0, 8).join(' ');
}

function buildPost(item, opts = {}) {
  const c = catOf(item.cat);
  const total = allPrompts().length;
  const head = `${c.emoji} <b>${esc(item.t || c.fa)}</b>\n`;
  const meta = `🎬 دسته: ${c.emoji} ${esc(c.fa)}   |   🧠 مناسب: Flux / Midjourney / DALL·E\n`;
  const body =
    '\n✍️ <b>پرامپت (لمس کن تا کپی شه):</b>\n' +
    `<code>${esc(item.prompt)}</code>\n` +
    (item.tip ? `\n💡 <b>نکته:</b> ${esc(item.tip)}\n` : '') +
    (opts.note ? `\n${opts.note}\n` : '');
  const foot = `\n${state.settings.hashtags ? hashtagsFor(item) : ''}`;
  const text = (head + meta + body + foot).trim();
  const shortText = `${head}${body.split('\n').slice(0, 3).join('\n')}`.trim();
  return { text, shortText, total };
}

function postKeyboard(item) {
  const rows = [
    [Markup.button.url('🎨 همین پرامپت رو تست کن', TRY_URL)],
    [
      Markup.button.callback('🔁 پست بعدی', 'pb:next'),
      Markup.button.callback('🎲 تصادفی', 'pb:next'),
    ],
  ];
  return Markup.inlineKeyboard(rows);
}

/* ─────────────────────────── ارسال پست ─────────────────────────── */

let lastErrorNotice = 0;

async function notifyAdmin(text, extra) {
  if (!ADMIN_ID || !bot) return;
  try {
    await bot.telegram.sendMessage(ADMIN_ID, text, extra);
  } catch (e) {
    console.error('[prompt-bot] ارسال پیام به ادمین ناموفق:', e.message);
  }
}

async function postToChannel(opts = {}) {
  if (!bot) return { ok: false, reason: 'bot-not-ready' };
  const chatId = opts.chatId || (state.channel && state.channel.id);
  if (!chatId) return { ok: false, reason: 'no-channel' };

  let item = opts.item || null;
  if (!item) {
    const wantAi = state.settings.useAi && AI_KEY && Math.random() < AI_RATIO;
    if (wantAi) item = await aiPrompt(opts.idea);
    if (!item) item = pickPrompt();
  }
  if (!item) return { ok: false, reason: 'no-prompt' };

  const { text, shortText } = buildPost(item);
  const kb = postKeyboard(item);
  let image = null;
  let customFileId = null;
  if (opts.withImage !== false) {
    // اگر ادمین «نمونه‌کار» عکسی فرستاده باشد، همان اول استفاده می‌شود
    if (state.pendingSample && state.pendingSample.fileId && opts.useSample !== false) {
      customFileId = state.pendingSample.fileId;
    } else {
      image = await makeImage(item.prompt);
    }
  }

  try {
    if (customFileId) {
      const long = text.length > 1000;
      await bot.telegram.sendPhoto(chatId, customFileId, {
        caption: long ? shortText : text,
        parse_mode: 'HTML',
        reply_markup: kb.reply_markup,
      });
      if (long) {
        await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
      image = true;
      state.pendingSample = null;
      saveState();
    } else if (image) {
      // کپشن تلگرام حداکثر ۱۰۲۴ کاراکتر است؛ اگر متن بلند بود، عکس با کپشن کوتاه و متن کامل جدا می‌رود
      const long = text.length > 1000;
      await bot.telegram.sendPhoto(chatId, { source: image }, {
        caption: long ? shortText : text,
        parse_mode: 'HTML',
        reply_markup: kb.reply_markup,
      });
      if (long) {
        await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', disable_web_page_preview: true });
      }
    } else {
      await bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: kb.reply_markup,
      });
    }
  } catch (e) {
    state.stats.fails = (state.stats.fails || 0) + 1;
    state.nextTryAt = Date.now() + 10 * 60 * 1000; // ۱۰ دقیقه صبر کن
    saveState(true);
    console.error('[prompt-bot] ارسال به کانال ناموفق:', e.message);
    const now = Date.now();
    if (now - lastErrorNotice > 60 * 60 * 1000) {
      lastErrorNotice = now;
      const hint = /chat not found|not enough rights|CHAT_ADMIN_REQUIRED|bot is not a member|Forbidden/i.test(e.message)
        ? '\n\n⚠️ احتمالاً ربات در کانال ادمین نیست. مطمئن شو به‌عنوان <b>ادمین با اجازه‌ی ارسال پیام</b> اضافه شده باشد.'
        : '';
      await notifyAdmin(`❌ ارسال پست به کانال ناموفق بود:\n<code>${esc(e.message)}</code>${hint}`);
    }
    return { ok: false, reason: e.message };
  }

  // ثبت آمار
  state.lastPostedAt = Date.now();
  state.nextTryAt = 0;
  state.stats.posts = (state.stats.posts || 0) + 1;
  state.stats.byDay[today()] = (state.stats.byDay[today()] || 0) + 1;
  state.history = [{ id: item.id, t: item.t, at: new Date().toISOString(), image: !!image }]
    .concat(state.history || [])
    .slice(0, 50);
  saveState(true);

  console.log(
    `[prompt-bot] ✅ پست شد → ${opts.reason || 'auto'} | ${item.id} | ${item.t} | عکس: ${image ? 'دارد' : 'ندارد'}`
  );
  return { ok: true, item, withImage: !!image };
}

/* ─────────────────────────── زمان‌بند ─────────────────────────── */

let ticking = false;

async function tick() {
  if (ticking) return;
  if (!state.channel) return;
  if (state.settings.paused) return;
  if (state.nextTryAt && Date.now() < state.nextTryAt) return;
  const interval = Math.max(5, Number(state.settings.intervalMinutes) || POST_INTERVAL_DEFAULT_MIN) * 60 * 1000;
  const since = Date.now() - (state.lastPostedAt || 0);
  if (state.lastPostedAt && since < interval) return;
  ticking = true;
  try {
    await postToChannel({ reason: 'زمان‌بندی خودکار' });
  } catch (e) {
    console.error('[prompt-bot] خطای زمان‌بند:', e.message);
  } finally {
    ticking = false;
  }
}

function startScheduler() {
  if (startScheduler._started) return;
  startScheduler._started = true;
  setInterval(() => { tick().catch(() => {}); }, TICK_MS);
  // اولین بررسی چند ثانیه بعد از بالا آمدن (برای جبران ساعت‌های از دست‌رفته)
  setTimeout(() => { tick().catch(() => {}); }, 8000);
}

/* ─────────────────────────── متن‌های پنل ─────────────────────────── */

const fmtTime = ts =>
  ts
    ? new Date(ts).toLocaleString('fa-IR', {
        timeZone: 'Asia/Tehran',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—';

async function statusText() {
  const ch = state.channel;
  const days = state.stats.byDay || {};
  const week = Object.keys(days).sort().slice(-7).reduce((a, k) => a + days[k], 0);
  const nextAt = (state.lastPostedAt || Date.now()) + Math.max(5, state.settings.intervalMinutes) * 60 * 1000;
  const cats = (state.settings.categories || []).map(id => catOf(id).fa).join('، ') || 'همه دسته‌ها';
  return (
    `🎨 <b>${esc(BOT_NAME)}</b>\n` +
    `— — — — — — — — — —\n` +
    `📢 کانال: ${ch ? `${esc(ch.title)}${ch.username ? ` (@${esc(ch.username)})` : ''}` : '❌ متصل نیست'}\n` +
    `⏱️ بازه‌ی پست: هر ${faNum(state.settings.intervalMinutes)} دقیقه ${state.settings.paused ? '⏸ (متوقف)' : '▶️ (فعال)'}\n` +
    `🗂️ دسته‌بندی‌ها: ${esc(cats)}\n` +
    `🖼️ عکس نمونه: ${state.settings.withImage ? 'روشن' : 'خاموش'} | 🏷️ هشتگ: ${state.settings.hashtags ? 'روشن' : 'خاموش'} | 🤖 AI: ${state.settings.useAi && AI_KEY ? 'روشن' : 'خاموش'}\n` +
    `🧩 نمونه‌کار دستی: ${state.pendingSample ? 'ذخیره شده (پست بعدی با عکس خودت)' : 'ندارد (عکس خودکار ساخته می‌شود)'}\n` +
    `🧠 بانک پرامپت: ${allPrompts().length.toLocaleString('fa-IR')} پرامپت (${(state.custom || []).length.toLocaleString('fa-IR')} سفارشی)\n` +
    `📮 پست‌های ارسالی: ${(state.stats.posts || 0).toLocaleString('fa-IR')} | ۷ روز اخیر: ${week.toLocaleString('fa-IR')} | خطا: ${(state.stats.fails || 0).toLocaleString('fa-IR')}\n` +
    `🕒 آخرین پست: ${fmtTime(state.lastPostedAt)}\n` +
    `⏭️ پست بعدی: ${state.channel && !state.settings.paused ? fmtTime(nextAt) : '—'}`
  );
}

function panelKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📮 پست فوری در کانال', 'pb:post'),
      Markup.button.callback('👀 پیش‌نمایش', 'pb:preview'),
    ],
    [
      Markup.button.callback('➕ افزودن پرامپت خودم', 'pb:add'),
      Markup.button.callback('🧩 نمونه‌کار عکس', 'pb:sample'),
    ],
    [
      Markup.button.callback(`⏱️ ساعت/بازه: هر ${faNum(state.settings.intervalMinutes)} دقیقه`, 'pb:interval'),
    ],
    [
      Markup.button.callback('🗂️ دسته‌بندی‌ها', 'pb:cats'),
      Markup.button.callback('📚 پرامپت‌های من', 'pb:mylist'),
    ],
    [
      Markup.button.callback(`🖼️ عکس نمونه: ${state.settings.withImage ? 'روشن' : 'خاموش'}`, 'pb:toggleimg'),
      Markup.button.callback(`🏷️ هشتگ: ${state.settings.hashtags ? 'روشن' : 'خاموش'}`, 'pb:togglehash'),
    ],
    [
      Markup.button.callback(`🤖 هوش مصنوعی: ${state.settings.useAi && AI_KEY ? 'روشن' : 'خاموش'}`, 'pb:toggleai'),
      Markup.button.callback('🔄 بروزرسانی', 'pb:status'),
    ],
    [
      Markup.button.callback(state.settings.paused ? '▶️ ادامه‌ی ارسال' : '⏸ توقف موقت', 'pb:pause'),
    ],
  ]);
}

const HELP_TEXT =
  `🎨 <b>راهنمای ${esc(BOT_NAME)}</b>\n\n` +
  `۱) ربات رو در کانالت <b>ادمین</b> کن (با اجازه‌ی ارسال پیام) — خودش کانال رو تشخیص می‌ده.\n` +
  `۲) همین‌جا در چت خصوصی، از دکمه‌های پنل استفاده کن.\n\n` +
  `<b>دستورها:</b>\n` +
  `/panel — پنل مدیریت\n` +
  `/postnow — پست فوری در کانال\n` +
  `/preview — پیش‌نمایش پست بعدی (بدون ارسال)\n` +
  `/interval 30 — تغییر بازه به ۳۰ دقیقه\n` +
  `/categories — انتخاب دسته‌بندی‌ها\n` +
  `/pause و /resume — توقف و ادامه\n` +
  `/ai on|off — تولید پرامپت تازه با هوش مصنوعی\n` +
  `/image on|off — عکس نمونه روشن/خاموش\n` +
  `/addprompt — افزودن پرامپت خودت با ویزارد گام‌به‌گام (یا سریع: \`/addprompt متن انگلیسی\`)\n` +
  `/addprompt عنوان فارسی | نکته | متن انگلیسی — افزودن سریع یک‌خطی\n` +
  `/mylist — دیدن و حذف‌کردن پرامپت‌های خودت\n` +
  `/sample — راهنمای نمونه‌کار عکس\n` +
  `/stats — آمار\n` +
  `/channel — وضعیت کانال\n` +
  `/connect @channel — اتصال دستی کانال (اگر خودکار تشخیص داده نشد)`;

function onlyAdmin(ctx) {
  const id = String(ctx.from && ctx.from.id);
  if (id === ADMIN_ID) return true;
  if (ctx.chat && ctx.chat.type === 'private') {
    ctx.reply('این ربات مخصوص مدیریت کانال پرامپت است 🙂\nاگر می‌خوای این کانال رو داشته باشی، به ادمین پیام بده.').catch(() => {});
  }
  return false;
}

/* ─────────────────────────── ربات تلگرام ─────────────────────────── */

if (!BOT_TOKEN) {
  console.log(
    '[prompt-bot] ⚠️ توکن ربات پرامپت تنظیم نشده، این ماژول اجرا نمی‌شود.\n' +
      '           برای فعال‌سازی: از @BotFather یک ربات بساز، توکن را در متغیر محیطی\n' +
      '           PROMPT_BOT_TOKEN بگذار (یا GitHub → Settings → Secrets → Actions) و ربات را در کانال ادمین کن.'
  );
  module.exports = { enabled: false };
} else {
  bot = new Telegraf(BOT_TOKEN, TELEGRAM_API_ROOT ? { telegram: { apiRoot: TELEGRAM_API_ROOT } } : undefined);

  bot.catch((err, ctx) => {
    console.error('[prompt-bot] خطای ربات:', (err && err.message) || err);
    if (ctx && ctx.updateType === 'callback_query' && ctx.answerCbQuery) {
      ctx.answerCbQuery('خطایی رخ داد، دوباره تلاش کن').catch(() => {});
    }
  });

  /* --- اضافه/حذف شدن ربات در کانال --- */
  bot.on('my_chat_member', async ctx => {
    try {
      const upd = ctx.myChatMember;
      const chat = upd.chat;
      const status = upd.new_chat_member && upd.new_chat_member.status;
      const isTarget = chat.type === 'channel' || chat.type === 'supergroup' || chat.type === 'group';

      if (isTarget && (status === 'administrator' || status === 'member')) {
        state.channel = {
          id: chat.id,
          title: chat.title || chat.username || String(chat.id),
          username: chat.username || '',
          type: chat.type,
          addedAt: new Date().toISOString(),
        };
        if (!state.lastPostedAt) state.lastPostedAt = Date.now() - state.settings.intervalMinutes * 60 * 1000 + 60 * 1000;
        saveState(true);
        startScheduler();

        const isChannel = chat.type === 'channel';
        const warn = isChannel && status !== 'administrator'
          ? '\n⚠️ برای ارسال پست، ربات باید <b>ادمین</b> کانال باشد.'
          : '';
        await notifyAdmin(
          `✅ ربات به ${isChannel ? 'کانال' : 'گروه'} وصل شد:\n<b>${esc(chat.title || chat.id)}</b>${chat.username ? ` (@${esc(chat.username)})` : ''}\n` +
            `⏱️ از این به بعد هر ${state.settings.intervalMinutes} دقیقه یک پرامپت پست می‌شود.${warn}`
        );
        if (chat.type === 'channel' || chat.type === 'supergroup') {
          bot.telegram
            .sendMessage(
              chat.id,
              `🎨 <b>${esc(BOT_NAME)} فعال شد!</b>\n` +
                `از این به بعد هر ${state.settings.intervalMinutes} دقیقه یک پرامپت عکس آماده — همراه با نمونه‌ی ساخته‌شده — اینجا منتشر می‌شود.\n` +
                `🎯 پرامپت‌ها برای مدل‌های تصویرسازی مثل Arena، Midjourney، Flux و DALL·E مناسب‌اند.`,
              { parse_mode: 'HTML' }
            )
            .catch(() => {});
        }
      } else if (isTarget && (status === 'left' || status === 'kicked')) {
        if (state.channel && String(state.channel.id) === String(chat.id)) {
          state.channel = null;
          saveState(true);
          await notifyAdmin(`⚠️ ربات از «${esc(chat.title || chat.id)}» حذف شد. کانال جدیدی ادمین کن تا ارسال ادامه پیدا کند.`);
        }
      }
    } catch (e) {
      console.error('[prompt-bot] my_chat_member:', e.message);
    }
  });

  /* --- شناسایی کانال از روی پست‌های خود کانال (روش دوم تشخیص) --- */
  bot.on('channel_post', async ctx => {
    try {
      const chat = ctx.chat;
      if (!chat || (chat.type !== 'channel' && chat.type !== 'supergroup')) return;
      if (state.channel && String(state.channel.id) === String(chat.id)) return;
      state.channel = {
        id: chat.id,
        title: chat.title || chat.username || String(chat.id),
        username: chat.username || '',
        type: chat.type,
        addedAt: new Date().toISOString(),
      };
      if (!state.lastPostedAt) {
        state.lastPostedAt = Date.now() - state.settings.intervalMinutes * 60 * 1000 + 60 * 1000;
      }
      saveState(true);
      startScheduler();
      console.log(`[prompt-bot] کانال از روی پست کانال شناسایی شد: ${state.channel.title} (${chat.id})`);
      await notifyAdmin(
        `✅ کانال شناسایی شد: <b>${esc(state.channel.title)}</b>${chat.username ? ` (@${esc(chat.username)})` : ''}\n` +
          `⏱️ از این به بعد هر ${faNum(state.settings.intervalMinutes)} دقیقه یک پرامپت پست می‌شود.`
      );
    } catch (e) {
      console.error('[prompt-bot] channel_post:', e.message);
    }
  });

  /* --- دستورها --- */
  bot.start(async ctx => {
    if (!onlyAdmin(ctx)) return;
    await ctx.replyWithHTML(
      `${esc(BOT_NAME)} آماده است 🎨\n\n` + (await statusText()),
      panelKeyboard()
    );
    if (!state.channel) {
      await ctx.replyWithHTML(
        'برای شروع: ربات را در کانال‌ات <b>ادمین</b> کن (اجازه‌ی Post Messages بده).\nهمین که ادمینش کنی، خودم تشخیص می‌دم و پست‌ها شروع می‌شه ✨'
      );
    }
  });

  bot.command(['panel', 'menu'], async ctx => {
    if (!onlyAdmin(ctx)) return;
    await ctx.replyWithHTML(await statusText(), panelKeyboard());
  });

  bot.command('help', async ctx => {
    if (!onlyAdmin(ctx)) return;
    await ctx.replyWithHTML(HELP_TEXT, panelKeyboard());
  });

  bot.command('status', async ctx => {
    if (!onlyAdmin(ctx)) return;
    await ctx.replyWithHTML(await statusText(), panelKeyboard());
  });

  bot.command('stats', async ctx => {
    if (!onlyAdmin(ctx)) return;
    await ctx.replyWithHTML(await statusText(), panelKeyboard());
  });

  bot.command('channel', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const ch = state.channel;
    await ctx.replyWithHTML(
      ch
        ? `📢 کانال متصل: <b>${esc(ch.title)}</b>${ch.username ? ` (@${esc(ch.username)})` : ''}\nآی‌دی: <code>${esc(ch.id)}</code>\nاز ${fmtTime(new Date(ch.addedAt).getTime())}`
        : '📢 هنوز به کانالی وصل نیستم.\n\nراهنما:\n۱) ربات را با نام کاربری‌اش در کانال اضافه کن\n۲) در لیست اعضا، <b>Administrator</b> کن و اجازه‌ی Post Messages بده\n۳) همین‌جا /status بزن — کانال خودکار ثبت می‌شه'
    );
  });

  bot.command('connect', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const arg = String(ctx.message.text).split(/\s+/)[1];
    if (!arg) {
      return ctx.replyWithHTML(
        '📢 <b>اتصال دستی کانال</b>\n\n' +
          'اگر ربات را در کانال ادمین کردی ولی خودکار تشخیص داده نشد، این‌طوری وصلش کن:\n' +
          '<code>/connect @my_channel</code>\nیا با آیدی عددی کانال:\n<code>/connect -1001234567890</code>\n\n' +
          '⚠️ ربات باید در آن کانال <b>ادمین با اجازه‌ی ارسال پیام</b> باشد.'
      );
    }
    await ctx.replyWithHTML('⏳ دارم کانال را بررسی می‌کنم...');
    try {
      const chat = await bot.telegram.getChat(arg);
      if (chat.type !== 'channel' && chat.type !== 'supergroup') {
        return ctx.replyWithHTML('⚠️ این مورد کانال/سوپرگروپ نیست.');
      }
      state.channel = {
        id: chat.id,
        title: chat.title || chat.username || String(chat.id),
        username: chat.username || '',
        type: chat.type,
        addedAt: new Date().toISOString(),
      };
      if (!state.lastPostedAt) {
        state.lastPostedAt = Date.now() - state.settings.intervalMinutes * 60 * 1000 + 60 * 1000;
      }
      saveState(true);
      startScheduler();
      await ctx.replyWithHTML(
        `✅ کانال وصل شد: <b>${esc(state.channel.title)}</b>${state.channel.username ? ` (@${esc(state.channel.username)})` : ''}\n` +
          `⏱️ از این به بعد هر ${faNum(state.settings.intervalMinutes)} دقیقه یک پرامپت پست می‌شود.`,
        panelKeyboard()
      );
    } catch (e) {
      const hint = /chat not found|not enough rights|Forbidden/i.test(e.message)
        ? '\n\n⚠️ احتمالاً ربات در آن کانال ادمین نیست. اول ادمینش کن، بعد دوباره تلاش کن.'
        : '';
      await ctx.replyWithHTML(`❌ نشد: <code>${esc(e.message)}</code>${hint}`);
    }
  });

  bot.command('postnow', async ctx => {
    if (!onlyAdmin(ctx)) return;
    if (!state.channel) return ctx.replyWithHTML('اول باید ربات را در کانال ادمین کنی 📢');
    await ctx.replyWithHTML('⏳ دارم پرامپت می‌سازم و پست می‌کنم... (ساخت عکس چند ثانیه طول می‌کشد)');
    const r = await postToChannel({ reason: 'درخواست ادمین' });
    await ctx.replyWithHTML(
      r.ok
        ? `✅ پست شد${r.withImage ? ' (همراه عکس نمونه)' : ' (بدون عکس — ساخت عکس نشد)'}`
        : `❌ نشد: <code>${esc(r.reason)}</code>`
    );
  });

  bot.command('preview', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const item = (AI_KEY && state.settings.useAi && Math.random() < AI_RATIO ? await aiPrompt() : null) || pickPrompt();
    if (!item) return ctx.reply('بانک پرامپت خالی است.');
    const { text } = buildPost(item);
    await ctx.replyWithHTML(text, { disable_web_page_preview: true, reply_markup: postKeyboard(item).reply_markup });
  });

  bot.command('interval', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const m = parseInt(String(ctx.message.text).split(/\s+/)[1], 10);
    if (!m || m < 5 || m > 1440) {
      return ctx.replyWithHTML(
        '⏱️ بازه‌ی ارسال را به دقیقه بنویس (۵ تا ۱۴۴۰):\n<code>/interval 30</code> — هر نیم‌ساعت\n<code>/interval 180</code> — هر ۳ ساعت\n\n' +
          'یا از پنل، دکمه‌ی «⏱️ ساعت/بازه» را بزن.'
      );
    }
    state.settings.intervalMinutes = m;
    state.nextTryAt = 0;
    saveState(true);
    await ctx.replyWithHTML(
      `⏱️ بازه‌ی پست شد: هر ${faNum(m)} دقیقه\n⏭️ پست بعدی: ${fmtTime(Date.now() + m * 60 * 1000)}`,
      panelKeyboard()
    );
  });

  bot.command('pause', async ctx => {
    if (!onlyAdmin(ctx)) return;
    state.settings.paused = true;
    saveState(true);
    await ctx.replyWithHTML('⏸ ارسال پست‌ها موقتاً متوقف شد.', panelKeyboard());
  });

  bot.command('resume', async ctx => {
    if (!onlyAdmin(ctx)) return;
    state.settings.paused = false;
    state.nextTryAt = 0;
    saveState(true);
    await ctx.replyWithHTML('▶️ ارسال پست‌ها ادامه یافت.', panelKeyboard());
  });

  bot.command('ai', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const arg = String(ctx.message.text).split(/\s+/)[1];
    if (!AI_KEY) return ctx.replyWithHTML('⚠️ برای این قابلیت کلید <code>AI_API_KEY</code> (سرویس سازگار با OpenAI) لازم است.');
    state.settings.useAi = arg ? /^(on|1|روشن)$/i.test(arg) : !state.settings.useAi;
    saveState(true);
    await ctx.replyWithHTML(`🤖 تولید پرامپت با AI: ${state.settings.useAi ? 'روشن' : 'خاموش'}`, panelKeyboard());
  });

  bot.command('image', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const arg = String(ctx.message.text).split(/\s+/)[1];
    state.settings.withImage = arg ? /^(on|1|روشن)$/i.test(arg) : !state.settings.withImage;
    saveState(true);
    await ctx.replyWithHTML(`🖼️ عکس نمونه: ${state.settings.withImage ? 'روشن' : 'خاموش'}`, panelKeyboard());
  });

  bot.command('categories', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const chosen = new Set(state.settings.categories || []);
    const buttons = CATEGORIES.map(c =>
      Markup.button.callback(`${chosen.has(c.id) ? '✅' : '⬜️'} ${c.emoji} ${c.fa}`, `pb:cat:${c.id}`)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    rows.push([Markup.button.callback('♻️ همه دسته‌ها', 'pb:cat:ALL')]);
    await ctx.replyWithHTML(
      '🗂️ دسته‌بندی‌هایی که دوست داری پست شن را انتخاب کن (چندتایی هم می‌شه):',
      Markup.inlineKeyboard(rows)
    );
  });

  /* ───── ➕ افزودن پرامپت دلخواه (ویزارد گام‌به‌گام) ───── */

  const WIZ_CANCEL = () =>
    Markup.inlineKeyboard([[Markup.button.callback('❌ لغو', 'pb:wiz:cancel')]]);

  function startWizard(ctx) {
    wizard = { step: 'prompt', data: {} };
    return ctx.replyWithHTML(
      '➕ <b>افزودن پرامپت جدید</b> (۱ از ۳)\n\n' +
        'متن <b>انگلیسی</b> پرامپت را بفرست — همان چیزی که داخل مدل تصویرسازی می‌چسبانی.\n' +
        'مثال:\n<code>a cozy wooden cabin in a snowy pine forest, warm window light, falling snow, cinematic, 8k</code>',
      WIZ_CANCEL()
    );
  }

  function wizardPreview(data) {
    const item = { id: 'preview', cat: data.cat || 'custom', t: data.t || 'پرامپت اختصاصی', tip: data.tip || '', prompt: data.prompt };
    return buildPost(item).text;
  }

  function wizardConfirmKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ ذخیره در بانک', 'pb:wiz:save')],
      [
        Markup.button.callback('✏️ از اول', 'pb:wiz:restart'),
        Markup.button.callback('❌ لغو', 'pb:wiz:cancel'),
      ],
    ]);
  }

  function categoryKeyboard(prefix) {
    const buttons = CATEGORIES.map(c => Markup.button.callback(`${c.emoji} ${c.fa}`, `${prefix}${c.id}`));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    rows.push([Markup.button.callback('⏭️ بدون دسته (سفارشی)', `${prefix}custom`)]);
    return Markup.inlineKeyboard(rows);
  }

  function saveCustomPrompt(data) {
    const item = {
      id: 'cu-' + Date.now().toString(36),
      cat: data.cat || 'custom',
      t: (data.t || 'پرامپت اختصاصی').trim(),
      tip: (data.tip || '').trim(),
      prompt: String(data.prompt || '').trim(),
      addedAt: new Date().toISOString(),
    };
    state.custom = (state.custom || []).concat(item).slice(-500);
    saveState(true);
    return item;
  }

  bot.command('addprompt', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const text = String(ctx.message.text).replace(/^\/addprompt(@\w+)?\s*/, '').trim();
    if (!text) return startWizard(ctx); // ویزارد
    // افزودن سریع یک‌خطی
    const parts = text.split('|').map(s => s.trim());
    const item = saveCustomPrompt({
      t: parts.length >= 3 ? parts[0] : 'پرامپت اختصاصی',
      tip: parts.length >= 3 ? parts[1] : '',
      prompt: parts.length >= 3 ? parts[2] : text,
      cat: 'custom',
    });
    await ctx.replyWithHTML(
      `✅ اضافه شد (${allPrompts().length.toLocaleString('fa-IR')} پرامپت در بانک)\n\n` +
        `📌 عنوان: ${esc(item.t)}\n\n` + buildPost(item).text,
      { disable_web_page_preview: true }
    );
  });

  bot.command('mylist', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const list = state.custom || [];
    if (!list.length) {
      return ctx.replyWithHTML('📚 هنوز پرامپت سفارشی نداری.\nبا دکمه‌ی «➕ افزودن پرامپت خودم» یا دستور /addprompt اضافه کن.');
    }
    const lines = list
      .slice(-15)
      .reverse()
      .map((p, i) => `${i + 1}. ${catOf(p.cat).emoji} <b>${esc(p.t)}</b>\n<code>${esc(String(p.prompt).slice(0, 90))}${String(p.prompt).length > 90 ? '…' : ''}</code>`)
      .join('\n\n');
    const rows = list.slice(-6).reverse().map(p => [Markup.button.callback('🗑 حذف: ' + String(p.t).slice(0, 22), 'pb:del:' + p.id)]);
    await ctx.replyWithHTML(
      `📚 <b>پرامپت‌های سفارشی تو</b> (${list.length.toLocaleString('fa-IR')} تا)\n\n${lines}`,
      Markup.inlineKeyboard(rows)
    );
  });

  bot.command('sample', async ctx => {
    if (!onlyAdmin(ctx)) return;
    const has = state.pendingSample ? '✅ یک نمونه‌کار عکس ذخیره شده و در پست بعدی استفاده می‌شود.' : 'ℹ️ الان نمونه‌کار ذخیره‌شده‌ای نداری.';
    await ctx.replyWithHTML(
      `🧩 <b>نمونه‌کار عکس</b>\n\n${has}\n\n` +
        'هر عکسی (نمونه‌ی ساخته‌شده در Arena، میجورنی، فتوشاپ و…) را همین‌جا در چت بفرست؛\n' +
        'از آن به بعد، آن عکس به‌عنوان تصویر پست‌های کانال استفاده می‌شود و ربات عکس جدید نمی‌سازد.\n' +
        'اگر عکسی نفرستی، خود ربات برای هر پرامپت یک عکس نمونه می‌سازد.',
      Markup.inlineKeyboard([
        [Markup.button.callback('📮 پست فوری با همین عکس', 'pb:sample:post')],
        [Markup.button.callback('🗑 پاک‌کردن نمونه‌کار ذخیره‌شده', 'pb:sample:clear')],
      ])
    );
  });

  /* --- دکمه‌های پنل --- */
  bot.action(/^pb:cat:(.+)$/, async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    const id = ctx.match[1];
    if (id === 'ALL') state.settings.categories = [];
    else {
      const set = new Set(state.settings.categories || []);
      set.has(id) ? set.delete(id) : set.add(id);
      state.settings.categories = [...set];
    }
    saveState(true);
    await ctx.answerCbQuery('ذخیره شد ✅');
    const chosen = new Set(state.settings.categories || []);
    const buttons = CATEGORIES.map(c =>
      Markup.button.callback(`${chosen.has(c.id) ? '✅' : '⬜️'} ${c.emoji} ${c.fa}`, `pb:cat:${c.id}`)
    );
    const rows = [];
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
    rows.push([Markup.button.callback('♻️ همه دسته‌ها', 'pb:cat:ALL')]);
    await ctx.editMessageReplyMarkup(Markup.inlineKeyboard(rows).reply_markup).catch(() => {});
  });

  bot.action('pb:status', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery('بروزرسانی شد 🔄');
    await ctx.editMessageText(await statusText(), { parse_mode: 'HTML', ...panelKeyboard() }).catch(() => {});
  });

  bot.action('pb:post', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!state.channel) return ctx.answerCbQuery('اول ربات را در کانال ادمین کن 📢', { show_alert: true });
    await ctx.answerCbQuery('دارم پست می‌کنم... 🎨');
    const r = await postToChannel({ reason: 'دکمه‌ی پنل' });
    await ctx.replyWithHTML(r.ok ? '✅ پست شد' + (r.withImage ? ' (با عکس نمونه)' : ' (بدون عکس)') : `❌ نشد: <code>${esc(r.reason)}</code>`);
  });

  bot.action('pb:next', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!state.channel) return ctx.answerCbQuery('اول ربات را در کانال ادمین کن 📢', { show_alert: true });
    await ctx.answerCbQuery('پرامپت بعدی در راه است 🔁');
    state.lastPostedAt = 0;
    const r = await postToChannel({ reason: 'پرامپت بعدی' });
    if (!r.ok) await notifyAdmin(`❌ ارسال ناموفق: <code>${esc(r.reason)}</code>`);
  });

  bot.action('pb:preview', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery('پیش‌نمایش 👀');
    const item = pickPrompt();
    if (!item) return ctx.reply('بانک پرامپت خالی است.');
    await ctx.replyWithHTML(buildPost(item).text, {
      disable_web_page_preview: true,
      reply_markup: postKeyboard(item).reply_markup,
    });
  });

  bot.action('pb:interval', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    const m = state.settings.intervalMinutes;
    const nextAt = (state.lastPostedAt || Date.now()) + m * 60 * 1000;
    const label = x =>
      x < 60
        ? `${faNum(x)} دقیقه`
        : x % 60 === 0
          ? `${faNum(x / 60)} ساعت`
          : `${faNum(Math.floor(x / 60))} ساعت و ${faNum(x % 60)} دقیقه`;
    const presets = [15, 30, 45, 60, 120, 180, 240, 360, 720, 1440];
    const row1 = presets.slice(0, 5).map(x => Markup.button.callback(label(x), `pb:setint:${x}`));
    const row2 = presets.slice(5).map(x => Markup.button.callback(label(x), `pb:setint:${x}`));
    await ctx.replyWithHTML(
      `⏱️ <b>تنظیم ساعت ارسال</b>\n\n` +
        `بازه‌ی فعلی: هر <b>${label(m)}</b> یک پرامپت\n` +
        `⏭️ پست بعدی: ${state.channel && !state.settings.paused ? fmtTime(nextAt) : '—'}\n\n` +
        `یک بازه انتخاب کن، یا «✍️ بازه‌ی دلخواه» را بزن و عدد دقیقه را بفرست (۵ تا ۱۴۴۰):`,
      Markup.inlineKeyboard([
        row1.slice(0, 3),
        row1.slice(3),
        row2.slice(0, 3),
        row2.slice(3),
        [Markup.button.callback('✍️ بازه‌ی دلخواه (دقیقه)', 'pb:setint:custom')],
      ])
    );
  });

  bot.action(/^pb:setint:(\d+|custom)$/, async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    const val = ctx.match[1];
    if (val === 'custom') {
      awaitingInterval = true;
      await ctx.answerCbQuery('عدد دقیقه را بفرست ✍️');
      return ctx.replyWithHTML(
        '✍️ بازه‌ی دلخواه را به <b>دقیقه</b> بنویس (بین ۵ تا ۱۴۴۰).\nمثال: <code>90</code> یعنی هر یک‌ساعت‌ونیم.',
        WIZ_CANCEL()
      );
    }
    state.settings.intervalMinutes = Number(val);
    state.nextTryAt = 0;
    saveState(true);
    const v = state.settings.intervalMinutes;
    const label = v < 60 ? `${faNum(v)} دقیقه` : v % 60 === 0 ? `${faNum(v / 60)} ساعت` : `${faNum(Math.floor(v / 60))} ساعت و ${faNum(v % 60)} دقیقه`;
    await ctx.answerCbQuery(`⏱️ هر ${label} ✅`);
    await ctx.editMessageText(
      `✅ بازه‌ی ارسال تغییر کرد: هر ${label} یک پرامپت\n⏭️ پست بعدی: ${fmtTime(Date.now() + state.settings.intervalMinutes * 60 * 1000)}`
    ).catch(() => {});
  });

  bot.action('pb:toggleimg', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    state.settings.withImage = !state.settings.withImage;
    saveState(true);
    await ctx.answerCbQuery(state.settings.withImage ? '🖼️ عکس نمونه روشن شد' : '🖼️ عکس نمونه خاموش شد');
    await ctx.editMessageText(await statusText(), { parse_mode: 'HTML', ...panelKeyboard() }).catch(() => {});
  });

  bot.action('pb:toggleai', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!AI_KEY) return ctx.answerCbQuery('کلید AI_API_KEY تنظیم نشده ⚠️', { show_alert: true });
    state.settings.useAi = !state.settings.useAi;
    saveState(true);
    await ctx.answerCbQuery(state.settings.useAi ? '🤖 AI روشن شد' : '🤖 AI خاموش شد');
    await ctx.editMessageText(await statusText(), { parse_mode: 'HTML', ...panelKeyboard() }).catch(() => {});
  });

  /* ➕ افزودن پرامپت */
  bot.action('pb:add', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    await startWizard(ctx);
  });

  /* 👣 گام‌های ویزارد */
  bot.action('pb:wiz:skiptitle', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!wizard) return ctx.answerCbQuery('ویزارد منقضی شد؛ دوباره /addprompt بزن.', { show_alert: true });
    wizard.data.t = 'پرامپت اختصاصی';
    wizard.step = 'tip';
    await ctx.answerCbQuery('رد شد');
    await ctx.replyWithHTML(
      '➕ <b>افزودن پرامپت جدید</b> (۳ از ۳)\n\nیک <b>نکته‌ی فارسی</b> بنویس یا رد کن:',
      Markup.inlineKeyboard([
        [Markup.button.callback('⏭️ بدون نکته', 'pb:wiz:skiptip')],
        [Markup.button.callback('❌ لغو', 'pb:wiz:cancel')],
      ])
    );
  });

  bot.action('pb:wiz:skiptip', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!wizard) return ctx.answerCbQuery('ویزارد منقضی شد؛ دوباره /addprompt بزن.', { show_alert: true });
    wizard.data.tip = '';
    wizard.step = 'cat';
    await ctx.answerCbQuery('رد شد');
    await ctx.replyWithHTML('🗂️ دسته‌بندی این پرامپت را انتخاب کن:', categoryKeyboard('pb:addcat:'));
  });

  bot.action(/^pb:addcat:(.+)$/, async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!wizard || !wizard.data.prompt) return ctx.answerCbQuery('ویزارد منقضی شد؛ دوباره /addprompt بزن.', { show_alert: true });
    wizard.data.cat = ctx.match[1];
    wizard.step = 'confirm';
    await ctx.answerCbQuery('دسته ثبت شد ✅');
    await ctx.replyWithHTML('👀 <b>پیش‌نمایش پرامپت تو:</b>\n\n' + wizardPreview(wizard.data), wizardConfirmKeyboard());
  });

  bot.action('pb:wiz:save', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!wizard || !wizard.data.prompt) return ctx.answerCbQuery('ویزارد منقضی شد؛ دوباره /addprompt بزن.', { show_alert: true });
    const item = saveCustomPrompt(wizard.data);
    wizard = null;
    await ctx.answerCbQuery('ذخیره شد ✅');
    await ctx.replyWithHTML(
      `✅ پرامپت «${esc(item.t)}» ذخیره شد.\n🧠 بانک فعلی: ${allPrompts().length.toLocaleString('fa-IR')} پرامپت (${(state.custom || []).length.toLocaleString('fa-IR')} سفارشی)\n` +
        'از این به بعد در چرخه‌ی پست‌ها هم استفاده می‌شود.',
      panelKeyboard()
    );
  });

  bot.action('pb:wiz:restart', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery('از اول شروع کن');
    await startWizard(ctx);
  });

  bot.action('pb:wiz:cancel', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    wizard = null;
    awaitingInterval = false;
    await ctx.answerCbQuery('لغو شد');
    await ctx.replyWithHTML('❌ لغو شد.', panelKeyboard());
  });

  /* 📚 پرامپت‌های من */
  bot.action('pb:mylist', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    const list = state.custom || [];
    if (!list.length) {
      return ctx.replyWithHTML('📚 هنوز پرامپت سفارشی نداری.', Markup.inlineKeyboard([[Markup.button.callback('➕ افزودن پرامپت', 'pb:add')]]));
    }
    const rows = list.slice(-6).reverse().map(p => [Markup.button.callback('🗑 حذف: ' + String(p.t).slice(0, 22), 'pb:del:' + p.id)]);
    rows.push([Markup.button.callback('➕ افزودن پرامپت جدید', 'pb:add')]);
    await ctx.replyWithHTML(
      `📚 <b>پرامپت‌های سفارشی تو</b> (${list.length.toLocaleString('fa-IR')} تا)\nبرای حذف، دکمه‌ی مربوطه را بزن.`,
      Markup.inlineKeyboard(rows)
    );
  });

  bot.action(/^pb:del:(.+)$/, async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    const id = ctx.match[1];
    const before = (state.custom || []).length;
    state.custom = (state.custom || []).filter(p => p.id !== id);
    state.seen = (state.seen || []).filter(x => x !== id);
    saveState(true);
    await ctx.answerCbQuery(before === state.custom.length ? 'پیدا نشد' : 'حذف شد 🗑');
    await ctx.editMessageText(
      `🗑 حذف شد. پرامپت‌های سفارشی باقی‌مانده: ${(state.custom || []).length.toLocaleString('fa-IR')}`
    ).catch(() => {});
  });

  /* 🧩 نمونه‌کار */
  bot.action('pb:sample', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery();
    const has = state.pendingSample
      ? `✅ نمونه‌کار ذخیره‌شده (${fmtTime(new Date(state.pendingSample.addedAt).getTime())}) — در پست بعدی استفاده می‌شود.`
      : 'ℹ️ نمونه‌کار ذخیره‌شده‌ای نداری؛ ربات خودش برای هر پرامپت عکس می‌سازد.';
    await ctx.replyWithHTML(
      `🧩 <b>نمونه‌کار عکس</b>\n\n${has}\n\n` +
        'کافی است عکس نمونه‌ی خودت (ساخته‌شده در Arena، میجورنی و…) را در همین چت بفرستی.',
      Markup.inlineKeyboard([
        [Markup.button.callback('📮 پست فوری با همین عکس', 'pb:sample:post')],
        [Markup.button.callback('🗑 پاک‌کردن نمونه‌کار', 'pb:sample:clear')],
      ])
    );
  });

  bot.action('pb:sample:keep', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    await ctx.answerCbQuery('برای پست بعدی نگه داشته شد ✅');
    await ctx.editMessageText('⏭️ نمونه‌کار برای پست‌های بعدی ذخیره شد.').catch(() => {});
  });

  bot.action('pb:sample:clear', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    state.pendingSample = null;
    saveState(true);
    await ctx.answerCbQuery('پاک شد 🗑');
    await ctx.editMessageText('🗑 نمونه‌کار پاک شد؛ از این به بعد عکس‌ها خودکار ساخته می‌شوند.').catch(() => {});
  });

  bot.action('pb:sample:post', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    if (!state.channel) return ctx.answerCbQuery('اول ربات را در کانال ادمین کن 📢', { show_alert: true });
    if (!state.pendingSample) return ctx.answerCbQuery('اول یک عکس نمونه در چت بفرست 🧩', { show_alert: true });
    await ctx.answerCbQuery('دارم پست می‌کنم... 🎨');
    const r = await postToChannel({ reason: 'نمونه‌کار دستی ادمین' });
    await ctx.replyWithHTML(r.ok ? '✅ پست با عکس خودت در کانال منتشر شد.' : `❌ نشد: <code>${esc(r.reason)}</code>`);
  });

  /* 🏷️ هشتگ */
  bot.action('pb:togglehash', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    state.settings.hashtags = !state.settings.hashtags;
    saveState(true);
    await ctx.answerCbQuery(state.settings.hashtags ? '🏷️ هشتگ روشن شد' : '🏷️ هشتگ خاموش شد');
    await ctx.editMessageText(await statusText(), { parse_mode: 'HTML', ...panelKeyboard() }).catch(() => {});
  });

  bot.action('pb:pause', async ctx => {
    if (!onlyAdmin(ctx)) return ctx.answerCbQuery().catch(() => {});
    state.settings.paused = !state.settings.paused;
    saveState(true);
    await ctx.answerCbQuery(state.settings.paused ? '⏸ متوقف شد' : '▶️ ادامه یافت');
    await ctx.editMessageText(await statusText(), { parse_mode: 'HTML', ...panelKeyboard() }).catch(() => {});
  });

  /* --- 🧩 دریافت نمونه‌کار عکس از ادمین --- */
  bot.on('photo', async ctx => {
    if (ctx.chat.type !== 'private') return;
    if (!onlyAdmin(ctx)) return;
    const photos = ctx.message.photo || [];
    const best = photos[photos.length - 1];
    if (!best) return;
    state.pendingSample = {
      fileId: best.file_id,
      caption: ctx.message.caption || '',
      addedAt: new Date().toISOString(),
    };
    saveState(true);
    await ctx.replyWithHTML(
      '🧩 <b>نمونه‌کار ذخیره شد!</b>\n\n' +
        'از این به بعد همین عکس روی پست‌های کانال می‌رود (تا وقتی عکس جدیدی بفرستی).\n' +
        'می‌خواهی همین حالا با همین عکس یک پرامپت در کانال پست شود؟',
      Markup.inlineKeyboard([
        [Markup.button.callback('📮 همین حالا پست کن', 'pb:sample:post')],
        [Markup.button.callback('⏭️ برای پست بعدی نگه دار', 'pb:sample:keep')],
      ])
    );
  });

  /* --- پیش‌فرض (ورودی متنی ادمین: ویزارد / بازه‌ی زمانی) --- */
  bot.on('message', async ctx => {
    if (ctx.chat.type !== 'private') return;
    if (!onlyAdmin(ctx)) return;
    const text = String(ctx.message.text || '').trim();
    if (!text) return;

    /* بازه‌ی زمانی دلخواه */
    if (awaitingInterval) {
      const m = parseInt(text.replace(/[^0-9]/g, ''), 10);
      if (!m || m < 5 || m > 1440) {
        return ctx.replyWithHTML('یک عدد بین ۵ تا ۱۴۴۰ (دقیقه) بفرست. مثال: <code>45</code>', WIZ_CANCEL());
      }
      awaitingInterval = false;
      state.settings.intervalMinutes = m;
      saveState(true);
      return ctx.replyWithHTML(
        `⏱️ بازه‌ی ارسال شد: هر ${faNum(m)} دقیقه\n⏭️ پست بعدی حدوداً: ${fmtTime(Date.now() + m * 60 * 1000)}`,
        panelKeyboard()
      );
    }

    /* ویزارد افزودن پرامپت */
    if (wizard) {
      if (wizard.step === 'prompt') {
        if (text.length < 8) return ctx.replyWithHTML('متن پرامپت خیلی کوتاه است؛ کامل‌تر بفرست 🙂', WIZ_CANCEL());
        wizard.data.prompt = text;
        wizard.step = 'title';
        return ctx.replyWithHTML(
          '➕ <b>افزودن پرامپت جدید</b> (۲ از ۳)\n\n' +
            'یک <b>عنوان فارسی</b> برای این پرامپت بنویس (برای نمایش در بالای پست)\n' +
            'مثال: <code>کلبه چوبی در جنگل برفی</code>',
          Markup.inlineKeyboard([
            [Markup.button.callback('⏭️ بدون عنوان (خودکار)', 'pb:wiz:skiptitle')],
            [Markup.button.callback('❌ لغو', 'pb:wiz:cancel')],
          ])
        );
      }
      if (wizard.step === 'title') {
        wizard.data.t = text.slice(0, 60);
        wizard.step = 'tip';
        return ctx.replyWithHTML(
          '➕ <b>افزودن پرامپت جدید</b> (۳ از ۳)\n\n' +
            'یک <b>نکته‌ی فارسی</b> بنویس (زیر پست نمایش داده می‌شود؛ مثلاً چه چیزی را در پرامپت عوض کنند).\n' +
            'مثال: <code>کلمه‌ی snowy را به rainy تغییر بده تا حس پاییزی بگیرد.</code>',
          Markup.inlineKeyboard([
            [Markup.button.callback('⏭️ بدون نکته', 'pb:wiz:skiptip')],
            [Markup.button.callback('❌ لغو', 'pb:wiz:cancel')],
          ])
        );
      }
      if (wizard.step === 'tip') {
        wizard.data.tip = text.slice(0, 200);
        wizard.step = 'cat';
        return ctx.replyWithHTML('🗂️ دسته‌بندی این پرامپت را انتخاب کن:', categoryKeyboard('pb:addcat:'));
      }
      if (wizard.step === 'cat') {
        return ctx.replyWithHTML('🗂️ لطفاً از دکمه‌های بالا یک دسته انتخاب کن (یا «بدون دسته»).');
      }
      if (wizard.step === 'confirm') {
        return ctx.replyWithHTML('برای ذخیره، دکمه‌ی «✅ ذخیره در بانک» را بزن.', wizardConfirmKeyboard());
      }
    }

    await ctx.replyWithHTML('متوجه نشدم 🤔 از پنل استفاده کن یا /help را بزن.', panelKeyboard());
  });

  /* ─────────────────────────── راه‌اندازی ─────────────────────────── */

  bot
    .launch({
      // توجه: آپدیت‌های معوق را دور نمی‌ریزیم تا اگر ربات را وقتی خاموش بود در کانال
      // ادمین کردی، همان آپدیت «ادمین شدم» را بگیرد و کانال را ثبت کند.
      dropPendingUpdates: false,
      allowedUpdates: ['message', 'callback_query', 'my_chat_member', 'channel_post', 'edited_message'],
    })
    .then(async () => {
      console.log('✅ ' + BOT_NAME + ' فعال شد.');
      if (state.channel) {
        // کانال ذخیره‌شده را بررسی کن: اگر دیگر دسترسی نداریم، پاکش کن
        try {
          const chat = await bot.telegram.getChat(state.channel.id);
          state.channel = {
            ...state.channel,
            title: chat.title || state.channel.title,
            username: chat.username || state.channel.username || '',
          };
          saveState();
          console.log(`[prompt-bot] کانال متصل: ${state.channel.title} (${state.channel.id})`);
        } catch (e) {
          console.error('[prompt-bot] دسترسی به کانال ذخیره‌شده ممکن نیست:', e.message);
          const lost = state.channel;
          state.channel = null;
          saveState(true);
          await notifyAdmin(
            `⚠️ به کانال «${esc(lost.title)}» دسترسی ندارم (احتمالاً ربات ادمین نیست).\n` +
              'ربات را در کانال ادمین کن (اجازه‌ی Post Messages) تا خودکار وصل شود.'
          );
        }
        startScheduler();
      } else if (PRESET_CHANNEL) {
        state.channel = { id: PRESET_CHANNEL, title: PRESET_CHANNEL, username: '', type: 'channel', addedAt: new Date().toISOString() };
        saveState(true);
        startScheduler();
        console.log('[prompt-bot] کانال از متغیر محیطی ثبت شد: ' + PRESET_CHANNEL);
      } else {
        console.log('[prompt-bot] منتظر ادمین‌شدن در کانال... (ربات را در کانال ادمین کن)');
        startScheduler();
      }
    })
    .catch(e => console.error('❌ اتصال ربات پرامپت ناموفق:', e.message));

  const stop = () => { try { bot.stop(); } catch (e) { /* ignore */ } };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  module.exports = { enabled: true, bot, state, postToChannel, pickPrompt, buildPost };
}
