const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || '8688771229:AAHJj9Bf9n7cRQU2VgKYBlA-MVlisJl5pjY';
const ADMIN_ID = process.env.ADMIN_ID || ''; // ایدی عددی ادمین برای تایید پرداخت
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME || '@dogs_vpn_support';
const CHANNEL_USERNAME = process.env.CHANNEL_USERNAME || '@dogs_vpn';

const bot = new Telegraf(BOT_TOKEN);

// --- Storage (JSON simple DB) ---
const DB_FILE = './data.json';
function loadDB() {
  try {
    if (!fs.existsSync(DB_FILE)) return { users: {}, orders: [] };
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch { return { users: {}, orders: [] }; }
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
let db = loadDB();

function getUser(id) {
  if (!db.users[id]) {
    db.users[id] = {
      id,
      balance: 0,
      services: [],
      usedTrial: false,
      joinedAt: new Date().toISOString(),
      inviteCount: 0
    };
    saveDB(db);
  }
  return db.users[id];
}

// --- Config ---
const servers = [
  { id: 'de', name: '🇩🇪 آلمان', host: '185.244.181.12', flag: '🇩🇪' },
  { id: 'nl', name: '🇳🇱 هلند', host: '194.36.88.45', flag: '🇳🇱' },
  { id: 'us', name: '🇺🇸 آمریکا', host: '198.54.128.99', flag: '🇺🇸' },
  { id: 'tr', name: '🇹🇷 ترکیه', host: '194.36.89.22', flag: '🇹🇷' },
  { id: 'fr', name: '🇫🇷 فرانسه', host: '195.58.39.78', flag: '🇫🇷' },
  { id: 'gb', name: '🇬🇧 انگلیس', host: '185.102.219.33', flag: '🇬🇧' },
];

const plans = [
  { id: 'p1', title: '۳۰ روزه', volume: '50 گیگ', price: 149000, popular: false, desc: 'مناسب مصرف متوسط' },
  { id: 'p2', title: '۳۰ روزه', volume: '100 گیگ', price: 219000, popular: true, desc: '🔥 محبوب‌ترین' },
  { id: 'p3', title: '60 روزه', volume: '200 گیگ', price: 389000, popular: false, desc: 'اقتصادی' },
  { id: 'p4', title: '90 روزه', volume: 'نامحدود ♾', price: 549000, popular: false, desc: 'حرفه‌ای - بدون محدودیت' },
];

function genUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c == 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function formatPrice(n) { return n.toLocaleString('fa-IR') + ' تومان'; }

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🛒 خرید اشتراک', 'buy'), Markup.button.callback('🎁 تست رایگان', 'trial')],
    [Markup.button.callback('📦 سرویس‌های من', 'myservices'), Markup.button.callback('💰 کیف پول', 'wallet')],
    [Markup.button.callback('📖 راهنما', 'help'), Markup.button.callback('👨‍💻 پشتیبانی', 'support')],
    [Markup.button.callback('📢 کانال ما', 'channel'), Markup.button.callback('👥 دعوت دوستان', 'invite')],
  ]);
}

function plansKeyboard() {
  const rows = plans.map(p => [
    Markup.button.callback(`${p.popular ? '⭐ ' : ''}${p.title} | ${p.volume} - ${formatPrice(p.price)}`, `plan_${p.id}`)
  ]);
  rows.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
  return Markup.inlineKeyboard(rows);
}

function serversKeyboard(planId) {
  const rows = [];
  for (let i = 0; i < servers.length; i += 2) {
    const row = servers.slice(i, i + 2).map(s => Markup.button.callback(s.name, `server_${planId}_${s.id}`));
    rows.push(row);
  }
  rows.push([Markup.button.callback('🔙 بازگشت', 'buy')]);
  return Markup.inlineKeyboard(rows);
}

function payKeyboard(planId, serverId) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 کارت به کارت', `pay_card_${planId}_${serverId}`), Markup.button.callback('💰 پرداخت با کیف پول', `pay_wallet_${planId}_${serverId}`)],
    [Markup.button.callback('₮ پرداخت ارزی (USDT)', `pay_crypto_${planId}_${serverId}`)],
    [Markup.button.callback('🔙 بازگشت', 'buy')]
  ]);
}

function walletKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 افزایش موجودی (کارت به کارت)', 'charge_card')],
    [Markup.button.callback('🔙 بازگشت به منو', 'back_home')]
  ]);
}

const welcomeText = (name) => `
🐶 **Dogs VPN** 🐶
━━━━━━━━━━━━━━━━━━
سلام ${name} عزیز! 👋

به **سریع‌ترین و پایدارترین** سرویس V2Ray ایران خوش اومدی 🚀

✨ **چرا Dogs VPN ؟**
▫️ سرعت فوق‌العاده تا 10Gbps
▫️ بدون قطعی - مناسب اینستا، تلگرام، یوتیوب
▫️ سرورهای اختصاصی در 6 کشور
▫️ پروتکل‌های VLESS / Trojan / Shadowsocks
▫️ پشتیبانی 24 ساعته

👇 از منوی زیر انتخاب کن:
`;

// --- Handlers ---

bot.start(async (ctx) => {
  const user = getUser(ctx.from.id);
  // invite tracking
  const ref = ctx.startPayload;
  if (ref && ref !== String(ctx.from.id) && db.users[ref]) {
    // simple anti abuse: don't count twice
  }
  await ctx.replyWithMarkdown(welcomeText(ctx.from.first_name || 'کاربر'), mainMenu());
});

bot.action('back_home', async (ctx) => {
  await ctx.editMessageText(welcomeText(ctx.from.first_name || 'کاربر'), { parse_mode: 'Markdown', ...mainMenu() }).catch(async () => {
    await ctx.replyWithMarkdown(welcomeText(ctx.from.first_name || 'کاربر'), mainMenu());
  });
  await ctx.answerCbQuery();
});

// Buy flow
bot.action('buy', async (ctx) => {
  await ctx.editMessageText(
    `🛒 **خرید اشتراک Dogs VPN**

پلن مورد نظرت رو انتخاب کن 👇
همه پلن‌ها شامل:
✅ آیپی ثابت
✅ بدون محدودیت سرعت
✅ قابلیت تمدید خودکار

💡 پلن محبوب کاربران: 30 روزه 100 گیگ`,
    { parse_mode: 'Markdown', ...plansKeyboard() }
  ).catch(() => { });
  await ctx.answerCbQuery();
});

bot.action(/plan_(.+)/, async (ctx) => {
  const planId = ctx.match[1];
  const plan = plans.find(p => p.id === planId);
  if (!plan) return ctx.answerCbQuery('پلن یافت نشد');
  await ctx.editMessageText(
    `📦 **${plan.title} - ${plan.volume}**
💰 قیمت: **${formatPrice(plan.price)}**
📝 ${plan.desc}

🌍 حالا لوکیشن سرورت رو انتخاب کن:`,
    { parse_mode: 'Markdown', ...serversKeyboard(planId) }
  );
  await ctx.answerCbQuery();
});

bot.action(/server_(.+)_([a-z]+)/, async (ctx) => {
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const plan = plans.find(p => p.id === planId);
  const srv = servers.find(s => s.id === serverId);
  if (!plan || !srv) return ctx.answerCbQuery('خطا');
  await ctx.editMessageText(
    `🧾 **پیش‌فاکتور**

📦 پلن: ${plan.title} | ${plan.volume}
🌍 سرور: ${srv.name} (${srv.host})
💰 مبلغ: **${formatPrice(plan.price)}**

روش پرداخت رو انتخاب کن:`,
    { parse_mode: 'Markdown', ...payKeyboard(planId, serverId) }
  );
  await ctx.answerCbQuery();
});

// Payments
bot.action(/pay_card_(.+)_([a-z]+)/, async (ctx) => {
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const plan = plans.find(p => p.id === planId);
  const srv = servers.find(s => s.id === serverId);
  const orderId = Date.now().toString().slice(-6);
  db.orders.push({ id: orderId, userId: ctx.from.id, planId, serverId, status: 'pending', createdAt: new Date().toISOString() });
  saveDB(db);
  await ctx.editMessageText(
    `💳 **پرداخت کارت به کارت**

مبلغ: **${formatPrice(plan.price)}**
شماره کارت:
\`\`\`
6219-8619-1234-5678
\`\`\`
به نام: Dogs VPN

شناسه سفارش: \`${orderId}\`
پلن: ${plan.title} ${plan.volume} - ${srv.name}

📌 بعد از واریز، **رسید رو همینجا عکس بفرست** تا ادمین تایید کنه و کانفیگت آنی ساخته بشه.

⏰ تا 10 دقیقه فرصت پرداخت داری`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ پرداخت کردم', `paid_${orderId}`)],
        [Markup.button.callback('🔙 بازگشت', 'buy')]
      ])
    }
  );
  await ctx.answerCbQuery();
});

bot.action(/pay_crypto_(.+)_([a-z]+)/, async (ctx) => {
  const plan = plans.find(p => p.id === ctx.match[1]);
  await ctx.editMessageText(
    `₮ **پرداخت ارزی USDT (TRC20)**

مبلغ: **${plan.price / 60000} USDT** معادل ${formatPrice(plan.price)}
آدرس کیف پول:
\`\`\`
TLx9y8Qe7aBcDeFgHiJkLmNoPqRsTuVwXyZ
\`\`\`
Network: TRC20

بعد از واریز، TxID رو بفرست تا بررسی بشه 👇`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'buy')]])
    }
  );
  await ctx.answerCbQuery();
});

bot.action(/pay_wallet_(.+)_([a-z]+)/, async (ctx) => {
  const planId = ctx.match[1];
  const serverId = ctx.match[2];
  const plan = plans.find(p => p.id === planId);
  const srv = servers.find(s => s.id === serverId);
  const user = getUser(ctx.from.id);
  if (user.balance < plan.price) {
    await ctx.answerCbQuery('موجودی کیف پولت کافی نیست!');
    await ctx.replyWithMarkdown(`❌ موجودی کافی نیست!\nموجودی فعلی: ${formatPrice(user.balance)}\nمبلغ پلن: ${formatPrice(plan.price)}`, walletKeyboard());
    return;
  }
  user.balance -= plan.price;
  const cfg = generateConfig(srv, plan);
  const service = { id: genUUID().slice(0, 8), plan: `${plan.title} ${plan.volume}`, server: srv.name, host: srv.host, config: cfg, createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() };
  user.services.push(service);
  saveDB(db);
  await ctx.editMessageText(
    `✅ **پرداخت با کیف پول موفق بود!**

📦 سرویس فعال شد
🌍 ${srv.name} | ${srv.host}
📅 انقضا: 30 روز دیگر

\`\`\`${cfg}\`\`\`

برای اتصال کافیه لینک رو کپی کنی و داخل اپ V2RayN / FoxRay / Streisand وارد کنی.`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('📦 سرویس‌های من', 'myservices')], [Markup.button.callback('🏠 منوی اصلی', 'back_home')]]) }
  );
  await ctx.answerCbQuery('✅ خرید موفق!');
});

bot.action(/paid_(.+)/, async (ctx) => {
  await ctx.answerCbQuery('رسیدت رو بفرست تا ادمین تایید کنه 🙏');
  await ctx.reply('📸 لطفا عکس رسید واریز رو ارسال کن تا ادمین در کمتر از 5 دقیقه تایید کنه.');
});

// Trial
bot.action('trial', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (user.usedTrial) {
    await ctx.answerCbQuery('❌ شما قبلا تست رایگان گرفتی!');
    await ctx.replyWithMarkdown('❌ هر کاربر فقط **یک بار** تست رایگان 24 ساعته داره.\n\nبرای ادامه از بخش 🛒 خرید اشتراک استفاده کن.', mainMenu());
    return;
  }
  user.usedTrial = true;
  const srv = servers[0];
  const cfg = `vless://${genUUID()}@${srv.host}:443?type=tcp&security=tls#DogsVPN-TRIAL-${ctx.from.id}`;
  const service = { id: 'trial-' + genUUID().slice(0, 6), plan: 'تست رایگان 24 ساعته - 2 گیگ', server: srv.name, host: srv.host, config: cfg, createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString() };
  user.services.push(service);
  saveDB(db);
  await ctx.editMessageText(
    `🎁 **تست رایگان فعال شد!**

⏰ مدت: 24 ساعت
📊 حجم: 2 گیگ
🌍 سرور: ${srv.name}

\`\`\`${cfg}\`\`\`

⚠️ بعد از اتمام تست، برای تمدید خرید کن.
💡 پیشنهاد: پلن 100 گیگ محبوب‌ترین انتخابه!`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🛒 خرید اشتراک', 'buy')], [Markup.button.callback('🏠 منو', 'back_home')]]) }
  );
  await ctx.answerCbQuery('✅ تست ساخته شد!');
});

// My services
bot.action('myservices', async (ctx) => {
  const user = getUser(ctx.from.id);
  if (user.services.length === 0) {
    await ctx.editMessageText('📦 هنوز سرویسی نداری.\n\nبا 🎁 تست رایگان شروع کن یا 🛒 خرید اشتراک رو بزن.', { ...Markup.inlineKeyboard([[Markup.button.callback('🎁 تست رایگان', 'trial')], [Markup.button.callback('🛒 خرید اشتراک', 'buy')], [Markup.button.callback('🔙 بازگشت', 'back_home')]]) });
  } else {
    let txt = `📦 **سرویس‌های شما (${user.services.length})**\n━━━━━━━━━━━━━━\n`;
    user.services.forEach((s, i) => {
      txt += `\n${i + 1}. ${s.plan}\n   ${s.server} | انقضا: ${new Date(s.expireAt).toLocaleDateString('fa-IR')}\n   \`${s.config.slice(0, 60)}...\`\n`;
    });
    const buttons = user.services.slice(-5).map(s => [Markup.button.callback(`📋 کپی ${s.plan.slice(0, 15)}`, `show_${s.id}`)]);
    buttons.push([Markup.button.callback('🔙 بازگشت', 'back_home')]);
    await ctx.editMessageText(txt, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) });
  }
  await ctx.answerCbQuery();
});

bot.action(/show_(.+)/, async (ctx) => {
  const user = getUser(ctx.from.id);
  const svc = user.services.find(s => s.id === ctx.match[1]);
  if (!svc) return ctx.answerCbQuery('یافت نشد');
  await ctx.replyWithMarkdown(`📋 **${svc.plan}**\n🌍 ${svc.server}\n\`\`\`${svc.config}\`\`\``);
  await ctx.answerCbQuery();
});

// Wallet
bot.action('wallet', async (ctx) => {
  const user = getUser(ctx.from.id);
  await ctx.editMessageText(
    `💰 **کیف پول**

موجودی فعلی: **${formatPrice(user.balance)}**

برای افزایش موجودی دکمه زیر رو بزن.
پرداخت کارت به کارت به صورت آنی تایید میشه.

🎁 با دعوت هر دوست 20,000 تومان هدیه میگیری!`,
    { parse_mode: 'Markdown', ...walletKeyboard() }
  );
  await ctx.answerCbQuery();
});

bot.action('charge_card', async (ctx) => {
  await ctx.editMessageText(
    `💳 **افزایش موجودی**

مبلغ دلخواه رو به کارت زیر واریز کن:

\`\`\`
6219-8619-1234-5678
به نام Dogs VPN
\`\`\`

بعد رسید رو همینجا بفرست با متن:
\`شارژ 200000\`

ادمین بعد از تایید موجودیت رو شارژ میکنه.`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'wallet')]]) }
  );
  await ctx.answerCbQuery();
});

// Help & Support
bot.action('help', async (ctx) => {
  await ctx.editMessageText(
    `📖 **راهنمای اتصال**

1️⃣ اپ مناسب رو نصب کن:
• اندروید: V2RayNG
• آیفون: FoxRay / Streisand / V2Box
• ویندوز: V2RayN

2️⃣ لینک کانفیگ رو کپی کن (از بخش 📦 سرویس‌های من)

3️⃣ داخل اپ گزینه + یا Import from Clipboard رو بزن

4️⃣ دکمه اتصال رو بزن و لذت ببر! 🚀

❓ سوالی داری؟ 👨‍💻 پشتیبانی رو بزن`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🎥 آموزش تصویری', 'help_vid')], [Markup.button.callback('🔙 بازگشت', 'back_home')]]) }
  );
  await ctx.answerCbQuery();
});

bot.action('help_vid', async (ctx) => {
  await ctx.answerCbQuery('به زودی ویدیو اضافه میشه 🎥');
});

bot.action('support', async (ctx) => {
  await ctx.editMessageText(
    `👨‍💻 **پشتیبانی Dogs VPN**

⏰ پاسخگویی 24 ساعته
💬 ادمین: ${SUPPORT_USERNAME}
📢 کانال: ${CHANNEL_USERNAME}

پیامت رو همینجا بفرست، مستقیم به پشتیبانی وصل میشی 👇`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.url('💬 پیام به پشتیبانی', `https://t.me/${SUPPORT_USERNAME.replace('@', '')}`)], [Markup.button.callback('🔙 بازگشت', 'back_home')]]) }
  );
  await ctx.answerCbQuery();
});

bot.action('channel', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdown(`📢 کانال رسمی ما:\n${CHANNEL_USERNAME}\n\nجدیدترین تخفیف‌ها و سرورها اونجا اعلام میشه 🔥`, Markup.inlineKeyboard([[Markup.button.url('📢 عضویت', `https://t.me/${CHANNEL_USERNAME.replace('@', '')}`)]]));
});

bot.action('invite', async (ctx) => {
  const link = `https://t.me/${ctx.botInfo.username}?start=${ctx.from.id}`;
  const user = getUser(ctx.from.id);
  await ctx.editMessageText(
    `👥 **دعوت دوستان = کسب درآمد**

لینک اختصاصی تو:
\`\`\`${link}\`\`\`

🎁 به ازای هر خرید دوستت: **30% پورسانت** + 20,000 تومان هدیه

👤 دعوت شده‌ها: ${user.inviteCount} نفر
💰 درآمد کل: ${formatPrice(user.inviteCount * 20000)}

همین الان لینکت رو بفرست برای دوستات!`,
    { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 بازگشت', 'back_home')]]) }
  );
  await ctx.answerCbQuery();
});

// Handle photos / receipts
bot.on('photo', async (ctx) => {
  await ctx.replyWithMarkdown(
    `✅ رسیدت دریافت شد!

شناسه: \`${ctx.from.id}\`
وضعیت: در انتظار تایید ⏳

ادمین تا 5 دقیقه دیگه بررسی میکنه و کانفیگت خودکار ارسال میشه.

${ADMIN_ID ? '' : '⚠️ (حالت تست: ادمین ست نشده، خودکار تایید میشه)'}
`,
    Markup.inlineKeyboard([[Markup.button.callback('📦 سرویس‌های من', 'myservices')]])
  );
  // Auto-approve in test mode (no admin)
  if (!ADMIN_ID) {
    const lastOrder = [...db.orders].reverse().find(o => o.userId === ctx.from.id && o.status === 'pending');
    if (lastOrder) {
      const plan = plans.find(p => p.id === lastOrder.planId) || plans[0];
      const srv = servers.find(s => s.id === lastOrder.serverId) || servers[0];
      const cfg = generateConfig(srv, plan);
      const user = getUser(ctx.from.id);
      const service = { id: genUUID().slice(0, 8), plan: `${plan.title} ${plan.volume}`, server: srv.name, host: srv.host, config: cfg, createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() };
      user.services.push(service);
      lastOrder.status = 'approved';
      saveDB(db);
      await ctx.replyWithMarkdown(`✅ **پرداخت تایید شد (تست خودکار)**\n\n📦 ${service.plan}\n🌍 ${srv.name}\n\n\`\`\`${cfg}\`\`\``);
    }
  } else {
    // forward to admin
    try { await ctx.forwardMessage(ADMIN_ID); await bot.telegram.sendMessage(ADMIN_ID, `🧾 رسید جدید از ${ctx.from.first_name} (@${ctx.from.username || 'no_user'}) ID:${ctx.from.id}\nبرای تایید: /approve_${ctx.from.id}`); } catch { }
  }
});

bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/approve') && String(ctx.from.id) === String(ADMIN_ID)) {
    const targetId = text.split('_')[1] || text.split(' ')[1];
    if (!targetId) return;
    const user = getUser(targetId);
    const pending = [...db.orders].reverse().find(o => String(o.userId) === String(targetId) && o.status === 'pending');
    if (!pending) return ctx.reply('سفارش pending یافت نشد');
    const plan = plans.find(p => p.id === pending.planId);
    const srv = servers.find(s => s.id === pending.serverId);
    const cfg = generateConfig(srv, plan);
    const service = { id: genUUID().slice(0, 8), plan: `${plan.title} ${plan.volume}`, server: srv.name, host: srv.host, config: cfg, createdAt: new Date().toISOString(), expireAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() };
    user.services.push(service);
    pending.status = 'approved';
    saveDB(db);
    await ctx.reply(`✅ تایید شد و برای ${targetId} ارسال شد`);
    await bot.telegram.sendMessage(targetId, `✅ پرداختت تایید شد!\n\n📦 ${service.plan}\n\`\`\`${cfg}\`\`\``, { parse_mode: 'Markdown' });
    return;
  }
  if (text.startsWith('شارژ')) {
    await ctx.reply('📸 لطفا رسید شارژ رو به صورت عکس بفرست تا تایید کنیم.');
    return;
  }
  // fallback menu
  await ctx.reply('📌 از منوی زیر انتخاب کن:', mainMenu());
});

function generateConfig(srv, plan) {
  const uuid = genUUID();
  // VLESS reality-like
  return `vless://${uuid}@${srv.host}:443?security=tls&sni=apple.com&fp=chrome&type=tcp&flow=xtls-rprx-vision#DogsVPN-${srv.id}-${plan.volume.replace(' ', '')}`;
}

bot.catch(err => console.log('Bot error:', err));
console.log('Starting Dogs VPN bot...');
bot.launch().then(() => console.log('✅ Bot running like @dogs_vpnbot!')).catch(e => console.log('❌', e.message));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
