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

  /* ── ۱۳) افزودن پرامپت با ویزارد گام‌به‌گام ── */
  await post('/_reset', {});
  const customBefore = (st.custom || []).length;
  await inject(msg('/addprompt'));                      // شروع ویزارد
  await sleep(700);
  await inject(msg('a neon cyberpunk street food stall at midnight, rain, reflections, cinematic, 8k'));
  await sleep(700);
  await inject(msg('غرفه غذای سایبرپانک'));
  await sleep(700);
  await inject(msg('رنگ نئون را از صورتی به سبز تغییر بده.'));
  await sleep(700);
  s = await sent();
  check('ویزارد گام دسته‌بندی را نشان داد', s.some(m => /دسته‌بندی این پرامپت/.test(m.text || '')));
  await inject(cb('pb:addcat:cyberpunk'));
  await sleep(900);
  s = await sent();
  check('ویزارد پیش‌نمایش پست را نشان داد', s.some(m => /پیش‌نمایش پرامپت تو/.test(m.text || '')));
  await inject(cb('pb:wiz:save'));
  await sleep(900);
  check('پرامپت ویزاردی ذخیره شد', (st.custom || []).length === customBefore + 1);
  const wizItem = st.custom[st.custom.length - 1];
  check('دسته‌ی انتخاب‌شده ذخیره شد', wizItem.cat === 'cyberpunk', wizItem.cat);
  check('عنوان و نکته‌ی فارسی ذخیره شد', /غرفه/.test(wizItem.t) && /نئون/.test(wizItem.tip));

  /* ── ۱۴) لیست و حذف پرامپت سفارشی ── */
  await post('/_reset', {});
  await inject(msg('/mylist'));
  await sleep(800);
  s = await sent();
  check('لیست پرامپت‌های من نمایش داده شد', s.some(m => /پرامپت‌های سفارشی تو/.test(m.text || '')));
  await inject(cb('pb:del:' + wizItem.id));
  await sleep(800);
  check('حذف پرامپت سفارشی کار می‌کند', (st.custom || []).every(p => p.id !== wizItem.id));

  /* ── ۱۵) نمونه‌کار عکس دستی ── */
  await post('/_reset', {});
  await inject({
    update_id: 0,
    message: {
      message_id: 90210,
      from: { id: ADMIN, is_bot: false, first_name: 'Admin', username: 'admin' },
      chat: { id: ADMIN, type: 'private', first_name: 'Admin' },
      date: Math.floor(Date.now() / 1000),
      photo: [
        { file_id: 'small123', file_unique_id: 'u1', width: 90, height: 90 },
        { file_id: 'big456', file_unique_id: 'u2', width: 1024, height: 1024 },
      ],
      caption: 'نمونه‌کار دستی',
    },
  });
  await sleep(900);
  check('عکس ادمین به‌عنوان نمونه‌کار ذخیره شد', !!(st.pendingSample && st.pendingSample.fileId === 'big456'));
  await post('/_reset', {});
  await inject(cb('pb:sample:post'));
  await sleep(2500);
  s = await sent();
  const samplePost = s.find(m => m.method === 'sendPhoto');
  check('پست با نمونه‌کار دستی ارسال شد', !!(samplePost && samplePost.customFileId === 'big456'), JSON.stringify(samplePost || {}));
  check('بعد از ارسال، نمونه‌کار مصرف شد', st.pendingSample === null);

  /* ── ۱۶) هشتگ روی پست ── */
  await post('/_reset', {});
  await inject(msg('/preview'));
  await sleep(900);
  s = await sent();
  const withHash = s.find(m => /#پرامپت_تصویر/.test(m.text || ''));
  check('هشتگ‌ها در پیش‌نمایش پست هستند', !!withHash);
  const tagCount = withHash ? (withHash.text.match(/#[\u0600-\u06FF\w]+/g) || []).length : 0;
  check('تعداد هشتگ‌ها بین ۴ تا ۸ است', tagCount >= 4 && tagCount <= 8, 'تعداد: ' + tagCount);
  await inject(cb('pb:togglehash'));
  await sleep(700);
  check('هشتگ خاموش شد', st.settings.hashtags === false);
  await post('/_reset', {});
  await inject(msg('/preview'));
  await sleep(800);
  s = await sent();
  check('با خاموش‌بودن هشتگ، تگی در پست نیست', !s.some(m => /#پرامپت_تصویر/.test(m.text || '')));
  await inject(cb('pb:togglehash'));
  await sleep(700);

  /* ── ۱۷) بازه‌ی زمانی شامل ساعتی + دلخواه ── */
  await inject(cb('pb:interval'));
  await sleep(800);
  s = await sent();
  check('منوی بازه شامل گزینه‌ی ساعتی است', s.some(m => /ساعت/.test(m.text || '')));
  await inject(cb('pb:setint:720'));
  await sleep(800);
  check('بازه‌ی ۱۲ ساعته ست شد', st.settings.intervalMinutes === 720, String(st.settings.intervalMinutes));
  await inject(cb('pb:setint:custom'));
  await sleep(600);
  await inject(msg('90'));
  await sleep(800);
  check('بازه‌ی دلخواه (۹۰ دقیقه) ثبت شد', st.settings.intervalMinutes === 90, String(st.settings.intervalMinutes));
  await inject(msg('/interval 45'));
  await sleep(700);
  check('دستور /interval 45 کار می‌کند', st.settings.intervalMinutes === 45);
  await inject(msg('/interval'));
  await sleep(600);
  s = await sent();
  check('دستور /interval بدون عدد راهنما می‌دهد', s.some(m => /۵ تا ۱۴۴۰/.test(m.text || '')));

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
