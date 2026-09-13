'use strict';

/* ============================================================
   🧪 تست سرتاسری ربات پرامپت (کاملاً آفلاین)
   اجرا:  node prompt-bot/test/smoke-test.js
   ------------------------------------------------------------
   یک شبیه‌ساز Telegram Bot API بالا می‌آورد، ربات را به آن وصل
   می‌کند و سناریوهای واقعی (اضافه‌شدن به کانال، پنل، پست، دکمه‌ها،
   خطا) را بررسی می‌کند.
   ============================================================ */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const PORT = 8043;
const API = `http://127.0.0.1:${PORT}`;
const ADMIN = 318405928;
const CHANNEL = -1001234567890;
const STATE = path.join(require('os').tmpdir(), 'prompt-bot-test-state.json');
const BAD_CHAT = -1000000000001;

let pass = 0;
let fail = 0;
const results = [];

function check(name, cond, extra = '') {
  if (cond) { pass++; results.push(`✅ ${name}`); }
  else { fail++; results.push(`❌ ${name}${extra ? ' → ' + extra : ''}`); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function post(pathname, data, raw) {
  return new Promise((resolve, reject) => {
    const body = raw ? data : Buffer.from(JSON.stringify(data || {}));
    const req = http.request(API + pathname, {
      method: 'POST',
      headers: { 'Content-Type': raw ? 'application/x-www-form-urlencoded' : 'application/json', 'Content-Length': body.length },
    }, res => {
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get(API + pathname, res => {
      const c = [];
      res.on('data', d => c.push(d));
      res.on('end', () => resolve(Buffer.concat(c).toString('utf8')));
    }).on('error', reject);
  });
}

const sent = async () => JSON.parse(await get('/_sent'));
const inject = u => post('/_inject', u);

const msg = (text, id = Math.floor(Math.random() * 1e6)) => ({
  update_id: 0,
  message: {
    message_id: id,
    from: { id: ADMIN, is_bot: false, first_name: 'Admin', username: 'admin', language_code: 'fa' },
    chat: { id: ADMIN, type: 'private', first_name: 'Admin' },
    date: Math.floor(Date.now() / 1000),
    text,
    entities: text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined,
  },
});

const cb = (data) => ({
  update_id: 0,
  callback_query: {
    id: 'cb' + Math.random().toString(36).slice(2, 8),
    from: { id: ADMIN, is_bot: false, first_name: 'Admin', username: 'admin' },
    message: { message_id: 555, from: { id: 1, is_bot: true, first_name: 'PromptBot' }, chat: { id: ADMIN, type: 'private', first_name: 'Admin' }, date: Math.floor(Date.now() / 1000), text: 'panel' },
    chat_instance: 'test',
    data,
  },
});

(async () => {
  try { fs.unlinkSync(STATE); } catch (e) { /* ignore */ }

  /* ── ۱) بالا آوردن شبیه‌ساز ── */
  const mock = spawn(process.execPath, [path.join(__dirname, 'telegram-mock.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'pipe'] });
  mock.stdout.on('data', d => process.stdout.write('[mock] ' + d));
  mock.stderr.on('data', d => process.stderr.write('[mock:err] ' + d));
  await sleep(900);

  /* ── ۲) تنظیم محیط و بالا آوردن ربات ── */
  process.env.PROMPT_BOT_TOKEN = '123456:TEST-TOKEN';
  process.env.PROMPT_ADMIN_ID = String(ADMIN);
  process.env.PROMPT_INTERVAL_MINUTES = '60';
  process.env.PROMPT_STATE_PATH = STATE;
  process.env.TELEGRAM_API_ROOT = API;
  process.env.POLLINATIONS_BASE = API + '/image';
  process.env.PROMPT_IMAGE_TIMEOUT_MS = '15000';
  process.env.PROMPT_IMAGE_WIDTH = '256';
  process.env.PROMPT_IMAGE_HEIGHT = '256';

  const mod = require('../index.js');
  await sleep(2500);

  check('ماژول ربات با توکن فعال شد', mod.enabled === true);
  const st = mod.state;
  st.settings.paused = true; // جلوگیری از دخالت زمان‌بند در طول تست
  await post('/_reset', {});

  /* ── ۳) اضافه‌شدن ربات به کانال به‌عنوان ادمین ── */
  await inject({
    update_id: 0,
    my_chat_member: {
      chat: { id: CHANNEL, type: 'channel', title: 'کانال پرامپت تست', username: 'prompt_test_ch' },
      from: { id: ADMIN, is_bot: false, first_name: 'Admin' },
      date: Math.floor(Date.now() / 1000),
      old_chat_member: { status: 'left', user: { id: 1, is_bot: true, first_name: 'PromptBot' } },
      new_chat_member: { status: 'administrator', user: { id: 1, is_bot: true, first_name: 'PromptBot' } },
    },
  });
  await sleep(1500);

  let s = await sent();
  const toChannel = s.filter(m => m.method === 'sendMessage' && String(m.chat_id) === String(CHANNEL));
  const toAdmin = s.filter(m => m.method === 'sendMessage' && String(m.chat_id) === String(ADMIN));
  check('کانال خودکار شناسایی و ذخیره شد', st.channel && String(st.channel.id) === String(CHANNEL), JSON.stringify(st.channel));
  check('پیام خوش‌آمد به کانال ارسال شد', toChannel.some(m => /فعال شد/.test(m.text || '')));
  check('اطلاع‌رسانی به ادمین ارسال شد', toAdmin.some(m => /وصل شد/.test(m.text || '')));

  /* ── ۴) پنل ادمین ── */
  await post('/_reset', {});
  await inject(msg('/start'));
  await sleep(1200);
  s = await sent();
  const panel = s.find(m => m.method === 'sendMessage' && /کانال:/.test(m.text || ''));
  check('پنل /start با وضعیت کانال آمد', !!panel);
  check('دکمه‌های اینلاین روی پنل هست', !!(panel && panel.keyboard));
  check('نام کانال در پنل درست است', !!(panel && /کانال پرامپت تست/.test(panel.text)));

  /* ── ۵) پیش‌نمایش ── */
  await post('/_reset', {});
  await inject(msg('/preview'));
  await sleep(1200);
  s = await sent();
  const prev = s.find(m => /پرامپت \(لمس کن تا کپی شه\)/.test(m.text || ''));
  check('پیش‌نمایش پرامپت ساخته شد', !!prev);
  check('پرامپت داخل تگ کد (قابل‌کپی) است', !!(prev && /<code>/.test(prev.text)));

  /* ── ۶) پست فوری با عکس نمونه ── */
  await post('/_reset', {});
  await inject(msg('/postnow'));
  await sleep(6000);
  s = await sent();
  const photo = s.find(m => m.method === 'sendPhoto');
  check('عکس نمونه ساخته و آپلود شد', !!photo, JSON.stringify(s.map(x => x.method)));
  check('عکس واقعاً PNG است', !!(photo && photo.isPng));
  check('عکس حجم واقعی دارد', !!(photo && photo.imageBytes > 1024), photo && String(photo.imageBytes));
  check('کپشن شامل پرامپت است', !!(photo && /پرامپت \(لمس کن تا کپی شه\)/.test(photo.caption)));
  check('هشتگ در پست هست', !!(photo && /#پرامپت_تصویر/.test(photo.caption)));
  check('وضعیت پست در state ثبت شد', st.stats.posts >= 1 && st.lastPostedAt > 0);

  /* ── ۷) دسته‌بندی ── */
  await post('/_reset', {});
  await inject(cb('pb:cat:persian'));
  await sleep(900);
  check('انتخاب دسته‌بندی ذخیره شد', Array.isArray(st.settings.categories) && st.settings.categories.includes('persian'));
  const picked = mod.pickPrompt();
  check('پرامپت انتخابی از دسته‌ی انتخابی است', picked && picked.cat === 'persian', picked && picked.cat);
  await inject(cb('pb:cat:ALL'));
  await sleep(700);
  check('بازگشت به همه‌ی دسته‌ها', (st.settings.categories || []).length === 0);

  /* ── ۸) بازه‌ی زمانی و توقف/ادامه ── */
  await inject(msg('/interval 30'));
  await sleep(800);
  check('/interval بازه را تغییر داد', st.settings.intervalMinutes === 30);
  await inject(msg('/pause'));
  await sleep(600);
  await inject(msg('/resume'));
  await sleep(600);
  check('/pause و /resume کار می‌کنند', st.settings.paused === false);
  await inject(cb('pb:setint:120'));
  await sleep(800);
  check('دکمه‌ی بازه‌ی زمانی کار می‌کند', st.settings.intervalMinutes === 120);
  await inject(cb('pb:setint:60'));
  await sleep(600);

  /* ── ۹) افزودن پرامپت سفارشی و سوئیچ عکس ── */
  await inject(msg('/addprompt پرامپت تستی | نکته تستی | a test prompt of a blue teapot on a table, studio light'));
  await sleep(900);
  check('پرامپت سفارشی اضافه شد', (st.custom || []).length === 1 && st.custom[0].prompt.includes('blue teapot'));
  await inject(cb('pb:toggleimg'));
  await sleep(900);
  check('سوئیچ عکس خاموش شد', st.settings.withImage === false);
  await post('/_reset', {});
  await inject(msg('/preview'));
  await sleep(700);
  await inject(msg('/postnow'));
  await sleep(2000);
  s = await sent();
  const textPost = s.some(m => m.method === 'sendMessage' && String(m.chat_id) === String(CHANNEL) && /پرامپت \(لمس کن تا کپی شه\)/.test(m.text || ''));
  check('با خاموش‌بودن عکس، پست متنی ارسال می‌شود', !s.some(m => m.method === 'sendPhoto') && textPost);
  await inject(cb('pb:toggleimg'));
  await sleep(700);

  /* ── ۱۰) سناریوی خطا: کانال نامعتبر ── */
  const goodChannel = st.channel.id;
  st.channel.id = BAD_CHAT;
  await post('/_reset', {});
  await inject(msg('/postnow'));
  await sleep(2500);
  s = await sent();
  check('خطای ارسال به کانال مدیریت شد', s.some(m => m.method === 'sendMessage' && /ناموفق/.test(m.text || '') && /chat not found/.test(m.text || '')));
  st.channel.id = goodChannel;

  /* ── ۱۱) ذخیره‌ی وضعیت روی دیسک ── */
  await sleep(800);
  const savedRaw = fs.existsSync(STATE) ? fs.readFileSync(STATE, 'utf8') : '';
  let saved = {};
  try { saved = JSON.parse(savedRaw); } catch (e) { /* ignore */ }
  check(
    'state روی فایل ذخیره شد',
    !!saved.settings && !!saved.channel && saved.channel.title === 'کانال پرامپت تست' && !!saved.channel.id,
    JSON.stringify(saved.channel)
  );
  check('تاریخچه‌ی پست‌ها ذخیره شد', Array.isArray(saved.history) && saved.history.length >= 1, JSON.stringify(saved.history && saved.history.length));

  /* ── ۱۲) زمان‌بند (شبیه‌سازی گذر زمان) ── */
  st.settings.paused = false;
  st.lastPostedAt = Date.now() - 999 * 60 * 1000;
  await post('/_reset', {});
  await new Promise(r => setTimeout(r, 2000));
  // فراخوانی مستقیم تیک زمان‌بند از طریق پست خودکار: با تنظیم lastPostedAt در گذشته،
  // تیک داخلی (هر ۳۰ ثانیه) ممکن است دیر شود، پس مستقیم postToChannel را صدا می‌زنیم.
  const auto = await mod.postToChannel({ reason: 'تست زمان‌بند' });
  check('مسیر زمان‌بند هم پست می‌کند', auto.ok === true, JSON.stringify(auto));
  check('شمارنده‌ی آمار پست‌ها بالا رفت', st.stats.posts >= 2);

  /* ── نتیجه ── */
  console.log('\n──────── نتیجه‌ی تست ────────');
  console.log(results.join('\n'));
  console.log(`\nمجموع: ${pass} موفق، ${fail} ناموفق\n`);
  mock.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('❌ خطای غیرمنتظره در تست:', e);
  process.exit(1);
});
