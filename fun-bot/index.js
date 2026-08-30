/* ============================================================
   🎪 سرگرمی بات — ربات تلگرامی سرگرمی فارسی
   جوک، فال حافظ، اسلات، حدس عدد، شیر یا خط، تاس،
   امتیاز و سطح، برترین کاربران
   ============================================================ */

const fs = require('fs');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');

/* ─────────────────────────── تنظیمات ─────────────────────────── */

const BOT_TOKEN = (
  process.env.FUN_BOT_TOKEN ||
  process.env.BOT_TOKEN_FUN ||
  '8552382239:AAEElINJciv_3N69oJmHFluDb8fdBYWu1wI'
).trim();

const BOT_NAME = process.env.FUN_BOT_NAME || '🎪 سرگرمی بات';
// فایل امتیازها کنار بقیه دیتاها در پوشه‌ی data/ ریشه ذخیره می‌شود
// تا همان workflow فعلی گیت‌هاب خودکار ذخیره‌اش کند
const DATA_PATH = path.join(__dirname, '..', 'data', 'fun-users.json');

/* ─────────────────────────── ذخیره‌سازی ─────────────────────────── */

function loadData() {
  try {
    if (fs.existsSync(DATA_PATH)) {
      return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('load data error:', e.message);
  }
  return {};
}

let data = loadData();

function saveData() {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('save data error:', e.message);
  }
}

setInterval(saveData, 30 * 1000);

function getUser(id) {
  const key = String(id);
  if (!data[key]) {
    data[key] = { xp: 0, plays: 0, wins: 0, jackpot: 0, joinedAt: new Date().toISOString() };
  }
  return data[key];
}

/* ─────────────────────────── اطلاعات ─────────────────────────── */

const RANKS = [
  { min: 0, name: '🐣 تازه‌وارد' },
  { min: 100000, name: '😊 مشتری پر و پا قرص' },
  { min: 1000000, name: '😎 حرفه‌ای' },
  { min: 10000000, name: '🔥 قهرمان سرگرمی' },
  { min: 100000000, name: '👑 اسطوره' },
];

function rankOf(xp) {
  let rank = RANKS[0].name;
  for (const r of RANKS) if (xp >= r.min) rank = r.name;
  return rank;
}

function nextRank(xp) {
  for (const r of RANKS) {
    if (xp < r.min) return { name: r.name, need: r.min - xp };
  }
  return null;
}

function addXp(user, amount) {
  user.xp = (user.xp || 0) + amount;
  return amount;
}

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const nameOf = (ctx) => ctx.from.first_name || 'دوست عزیز';
// اعداد بزرگ با ارقام فارسی و جداکننده هزارگان
const fmt = (n) => Number(n || 0).toLocaleString('fa-IR');

/* ─────────────────────────── منو ─────────────────────────── */

const mainMenu = Markup.inlineKeyboard([
  [
    Markup.button.callback('🎰 اسلات شانس', 'slot'),
    Markup.button.callback('🔢 حدس عدد', 'guess_start'),
  ],
  [
    Markup.button.callback('🪙 شیر یا خط', 'coin'),
    Markup.button.callback('🎲 تاس شانس', 'dice'),
  ],
  [
    Markup.button.callback('😂 جوک', 'joke'),
    Markup.button.callback('📖 فال حافظ', 'fal'),
  ],
  [
    Markup.button.callback('⭐ امتیاز من', 'me'),
    Markup.button.callback('🏆 برترین‌ها', 'top'),
  ],
  [Markup.button.callback('🔄 بستن منو', 'close')],
]);

/* ─────────────────────────── محتوا: جوک‌ها ─────────────────────────── */

const JOKES = [
  'معلم: حسن! اگه من ۵ تا سیب تو دست راستم و ۶ تا سیب تو دست چپم داشته باشم، چی دارم؟\nحسن: دستای خیلی بزرگ آقا! 🍎😂',
  'یکی رفته بود دکتر، گفته بود دکترم درد دارم!\nدکتر: کجات؟\nمیگه: اینجا که می‌گم یه جا که نباید باشه هست!\nدکتر: خب اون جایی که نباید باشه چرا هست؟ 😂',
  'بابا از پسرش پرسید: پسرجان، نمره ریاضی‌ات چی شد؟\nپسر: زنگ تفریح بود بابا، نمره ندادن!\nبابا: آخر بابا، زنگ تفریح نمره داره آخه؟! 🤦‍♂️',
  'به دوستم گفتم دارم رژیم می‌گیرم.\nگفت: آره می‌بینم، هر روز یه سایز بزرگ‌تر می‌شی! 😂🍕',
  'معلم: احمد، بگو ببینم چرا سکوت کردی؟\nاحمد: آقا سکوت علامت رضاست!\nمعلم: آفرین! پس راضی هستی صفر بگیری؟ 😄',
  'یکی رفته بود بانک، گفته بود می‌خوام وام بگیرم.\nکارمند: ضامن دارید؟\nمیگه: آره، ضامنم مادرم هست.\nکارمند: مادرتون چیکاره‌ان؟\nمیگه: هیچی، ضامن من هست! 🏦😅',
  'دختر: مامان، چرا وقتی بابا خونه نیست تلویزیون اینقدر قشنگه؟ 😂',
  'معلم: اگر ۲ پرنده روی درخت باشن و یکی رو بزنیم، چند تا می‌مونه؟\nشاگرد: صفر آقا! بقیه می‌ترسن و فرار می‌کنن.\nمعلم: ریاضیت خوب نیست، ولی استدلالت رو دوست دارم! 🐦',
  'دوستم ازم پرسید: اگه یه روز پولدار بشی چیکار می‌کنی؟\nگفتم: قسط همین بات رو می‌دم 😂😂',
  'پسر: بابا! من وقتی بزرگ شدم می‌خوام مثل تو باشم.\nبابا: چرا پسرم؟\nپسر: که هر شب راحت بخوابم و کاری به کار کسی نداشته باشم! 😴😄',
  'معلم: محمد، چرا دیر اومدی؟\nمحمد: آقا تو خواب یه بازی فوتبال بود، تازه تموم شد!\nمعلم: آخه فوتبال ۹۰ دقیقه‌ست!\nمحمد: نیمه‌نهایی بود، وقت اضافه و ضربات پنالتی هم داشت! ⚽😂',
  'یکی توی اتوبان با سرعت ۱۴۰ می‌رفت، پلیس جلوش رو گرفت:\n- می‌دونی سرعت مجاز چنده؟\n- نه قربان، ولی هر چی هست فکر کنم عقب موندم! 🚗💨',
  'مادر: پسرم چرا اینقدر کم غذا می‌خوری؟\nپسر: مامان من رژیمم!\nمادر: آخه تو ۸ سالته! 😂',
  'رفتم کافه گفتم یه قهوه تلخ بدید.\nگفت: چقدر تلخ؟\nگفم: مثل روزی که قبض برق اومد! ☕😫',
  'معلم: بگو ببینم، آب دریای خزر شوره یا شیرین؟\nشاگرد: آقا من فقط تست کردم، نه شیرین بود نه شور، خیس بود! 🌊😂',
  'دوستم گوشی جدید خریده بود.\nگفتم دوربینش چطوره؟\nگفت: عالی! حتی پولام رو هم واضح نشون می‌ده که ندارم! 📱😂',
  'معلم: سارا، اگر تو یک میلیون تومان داشتی چیکار می‌کردی؟\nسارا: اول قول می‌دادم تکلیف شب رو بنویسم، بعد بقیه‌ش رو... 🤔😂',
  'یکی به دوستش: شنیدم رفتی باشگاه؟\nدوستش: آره!\n- خب نتیجه‌ش کو؟\n- نتیجه این شد که فهمیدم ورزش مال من نیست! 🏋️😅',
  'بابا: پسرم، تو چرا همیشه گوشی تو دستته؟\nپسر: آخه باباجان، اگه بذارمش زمین ممکنه باتریش بخوابه! 🔋😂',
  'رفتم دکتر گفتم: دکتر هر وقت جلو آیینه می‌رم می‌بینم یکی داره بهم نگاه می‌کنه!\nدکتر: آروم باش، اون خودتی!\nمن: آخه دکتر، من خیلی خوشتیپ‌تر از اونم! 😎🪞',
];

/* ─────────────────────────── محتوا: فال حافظ ─────────────────────────── */

const FALS = [
  '«الا یا ایها الساقی ادر کاسا و ناولها»\n\n🍀 فال تو: بخت یارت هست! کاری که این روزها دلت روش گیره، به زودی نتیجه می‌ده. ناامید نباش، تلاش‌ات دیده می‌شه. یه خبر خوش توی راهه، چشم‌ات به پیامک‌ها باشه! 🎉',
  '«درخت دوستی بنشان که کام دل به بار آرد»\n\n🍀 فال تو: یه دوست قدیمی به یادت هست و به‌زودی بهت سر می‌زنه. اختلاف‌ها رو کنار بذار، دل آدما از کینه تیره می‌شه. مهربونی کن، مهربونی برمی‌گرده. 💛',
  '«مرغ عاشق شد آدمی را دید / برگرفت از درخت آدم را»\n\n🍀 فال تو: عشق و محبت توی زندگیت داره پر رنگ‌تر می‌شه. اگه از کسی دلخوری، حالا وقت آشتیه. با یه شاخه گل یا یه پیام ساده، همه‌چیز رو می‌شه درست کرد. ❤️',
  '«روز هجران و شب فرقت یار آخر شد / زدم این فال و گذشت اختر و کار آخر شد»\n\n🍀 فال تو: دوران سختی داره تموم می‌شه! غصه‌ها رفتنی‌ان و روزای روشن در راهن. کاری که نیمه‌کاره رها کرده بودی، همین هفته تمومش کن — موفقیت نزدیکه. 🌅',
  '«رسید مژده که ایام غم نخواهد ماند / چنان نماند چنین نیز هم نخواهد ماند»\n\n🍀 فال تو: غم‌ها همیشگی نیستن! یه مشکل مالی یا کاری به زودی حل می‌شه. دست از تلاش برندار، آخر شب تیره، سحر روشنه. پول و برکت توی راهه. 💰',
  '«ما آزموده‌ایم در این شهر بخت خویش / بیرون کشید باید از این ورطه رخت خویش»\n\n🍀 فال تو: وقت تغییره! اگه از وضعیتی راضی نیستی، منتظر معجزه نمون — خودت معجزه شو. یه تصمیم کوچیک می‌تونه مسیر زندگیت رو عوض کنه. شهامت داشته باش. 🚀',
  '«خوش آمد گل وز آن خوش‌تر نباشد / که در دست کسی خوش‌تر نباشد»\n\n🍀 فال تو: یه هدیه یا غافلگیری خوش منتظرته! توی جمع دوستان، تو مرکز توجهی. این هفته یه دعوت مهم دریافت می‌کنی، ردش نکن — پشتش خوشبختیه. 🎁',
  '«بیا تا گل برافشانیم و می در ساغر اندازیم / فلک را سقف بشکافیم و طرحی نو دراندازیم»\n\n🍀 فال تو: انرژی بالایی داری! حالا بهترین وقت شروع یه کار جدیده: درس، ورزش، پروژه تازه. ایده‌های بزرگت رو دست‌کم نگیر، تو می‌تونی غوغا کنی. 🌟',
  '«ساقیا برخیز و در ده به دلم باده زود / پیش از آن کام که این تیره فلک گردد دود»\n\n🍀 فال تو: قدر لحظه‌ها رو بدون! یه سفری مهم یا دورهمی خاطره‌انگیز در راهه. با خانواده وقت بگذرون، سال‌ها بعد یاد همین روزها می‌افتی. 🌙',
  '«دل ما به دور رویت ز فراق خون چکید / چو شکفته لاله از خاک برون چکید»\n\n🍀 فال تو: کسی که ازش دوری داری، دلش برات تنگ شده. یه پیام یا تماس ساده، یه آشتی بزرگ رو می‌سازه. غرور رو بذار کنار، محبت برنده‌ست. 🤝',
];

/* ─────────────────────────── وضعیت بازی‌ها ─────────────────────────── */

const sessions = {}; // chatId -> { kind: 'guess', number, tries, range, wins }

/* ─────────────────────────── ربات ─────────────────────────── */

const bot = new Telegraf(BOT_TOKEN);

bot.catch((err, ctx) => {
  console.error('bot error:', err && err.message);
});

bot.start((ctx) => {
  delete sessions[ctx.chat.id];
  const u = getUser(ctx.from.id);
  u.joinedAt = u.joinedAt || new Date().toISOString();
  saveData();
  return ctx.reply(
    `سلام ${nameOf(ctx)}! به ${BOT_NAME} خوش اومدی 🎪\n\n` +
    `اینجا پر از بازی و خنده‌ست:\n` +
    `😂 جوک بخون   📖 فال حافظ بگیر\n` +
    `🎰 اسلات بزن   🔢 حدس عدد بازی کن\n` +
    `🪙 شیر یا خط   🎲 تاس شانس\n\n` +
    `⭐ هر بازی که بکنی امتیاز می‌گیری و سطحت بالا می‌ره!\n\n` +
    `از دستور /menu منو رو باز کن 👇`,
    mainMenu
  );
});

bot.help((ctx) => {
  delete sessions[ctx.chat.id];
  return ctx.reply(
    `🎪 ${BOT_NAME}\n\n` +
    `/menu — باز کردن منوی بازی‌ها\n` +
    `/joke — یه جوک خنده‌دار 😂\n` +
    `/fal — فال حافظ 📖\n` +
    `/slot — اسلات شانس 🎰\n` +
    `/guess — بازی حدس عدد 🔢\n` +
    `/coin — شیر یا خط 🪙\n` +
    `/dice — پرتاب تاس 🎲\n` +
    `/me — امتیاز و سطح من ⭐\n` +
    `/top — برترین کاربران 🏆`,
    mainMenu
  );
});

bot.command('menu', (ctx) => ctx.reply('🎡 منوی سرگرمی — یکی رو انتخاب کن:', mainMenu));

/* ─── امتیاز من ─── */

bot.command('me', (ctx) => sendProfile(ctx));

function sendProfile(ctx) {
  const u = getUser(ctx.from.id);
  const next = nextRank(u.xp || 0);
  let text =
    `⭐ کارنامه ${nameOf(ctx)}:\n\n` +
    `🏅 رتبه: ${rankOf(u.xp || 0)}\n` +
    `✨ امتیاز: ${fmt(u.xp)}\n` +
    `🎮 بازی‌های انجام‌شده: ${fmt(u.plays || 0)}\n` +
    `🏆 بردهای اسلات: ${fmt(u.wins || 0)}\n` +
    `💎 جک‌پات: ${fmt(u.jackpot || 0)} بار`;
  if (next) text += `\n\n💪 تا رتبه «${next.name}» فقط ${next.need} امتیاز فاصله داری!`;
  return ctx.reply(text, mainMenu);
}

/* ─── برترین‌ها ─── */

bot.command('top', (ctx) => sendTop(ctx));

function sendTop(ctx) {
  const list = Object.entries(data)
    .map(([id, u]) => ({ id, xp: u.xp || 0 }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  const medals = ['🥇', '🥈', '🥉'];
  let text = '🏆 تالار برترین‌های سرگرمی:\n\n';
  list.forEach((p, i) => {
    const mark = medals[i] || `${i + 1}️⃣.`;
    const self = String(p.id) === String(ctx.from.id) ? ' 👈 تو!' : '';
    text += `${mark} <a href="tg://user?id=${p.id}">کاربر</a> — ${fmt(p.xp)} امتیاز${self}\n`;
  });
  if (!list.length) text += 'هنوز کسی بازی نکرده! اولین نفر باش 😄';
  return ctx.reply(text, { parse_mode: 'HTML', ...mainMenu });
}

/* ─── جوک ─── */

bot.command('joke', (ctx) => sendJoke(ctx));

function sendJoke(ctx) {
  const u = getUser(ctx.from.id);
  addXp(u, 5000);
  return ctx.reply('😂 ' + rand(JOKES), mainMenu);
}

/* ─── فال حافظ ─── */

bot.command('fal', (ctx) => sendFal(ctx));

function sendFal(ctx) {
  const u = getUser(ctx.from.id);
  addXp(u, 5000);
  return ctx.reply('📖 فال حافظ تو:\n\n' + rand(FALS), mainMenu);
}

/* ─── اسلات ─── */

bot.command('slot', (ctx) => doSlot(ctx));

function doSlot(ctx) {
  const u = getUser(ctx.from.id);
  u.plays = (u.plays || 0) + 1;
  return ctx.replyWithDice({ emoji: '🎰' }).then((msg) => {
    const val = msg.dice.value; // 1..64
    let gain = 0, result = '';
    if (val === 64) {
      gain = 100000000;
      u.jackpot = (u.jackpot || 0) + 1;
      u.wins = (u.wins || 0) + 1;
      result = '💎💎💎 جک‌پووووت! سه تا الماس! 💯 میلیون امتیاز!';
    } else if (val === 1) {
      gain = 10000000;
      u.wins = (u.wins || 0) + 1;
      result = '🎉 سه تا هفت! برنده شدی! ۱۰ میلیون امتیاز!';
    } else if (val >= 44) {
      gain = 1000000;
      u.wins = (u.wins || 0) + 1;
      result = '😎 دو تا شبیه! برنده شدی! ۱ میلیون امتیاز!';
    } else {
      gain = 1000;
      result = '😅 این بار شانس بزرگ همراهت نبود! ۱٬۰۰۰ امتیاز سرگرمی گرفتی، دوباره بزن!';
    }
    addXp(u, gain);
    setTimeout(() => {
      ctx.reply(`${result}\n\n✨ مجموع امتیازت: ${fmt(u.xp)}`, mainMenu).catch(() => {});
    }, 2000);
  });
}

/* ─── حدس عدد ─── */

bot.command('guess', (ctx) => startGuess(ctx));

function startGuess(ctx) {
  const secret = randInt(1, 10);
  sessions[ctx.chat.id] = { kind: 'guess', number: secret, tries: 0 };
  return ctx.reply(
    '🔢 بازی حدس عدد!\n\nمن یه عدد بین ۱ تا ۱۰ انتخاب کردم 🤫\nحدست رو بفرست! ۳ تا شانس داری.',
    Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map((n) => Markup.button.callback(String(n), 'guess_' + n)),
      [6, 7, 8, 9, 10].map((n) => Markup.button.callback(String(n), 'guess_' + n)),
    ])
  );
}

function guessHandle(ctx, guessed) {
  const s = sessions[ctx.chat.id];
  if (!s || s.kind !== 'guess') {
    return ctx.answerCbQuery('اول بازی رو با /guess شروع کن').catch(() => {});
  }
  s.tries++;
  const u = getUser(ctx.from.id);
  u.plays = (u.plays || 0) + 1;

  if (guessed === s.number) {
    delete sessions[ctx.chat.id];
    const gain = s.tries === 1 ? 5000000 : s.tries === 2 ? 2000000 : 1000000;
    addXp(u, gain);
    ctx.answerCbQuery('درست حدس زدی! 🎉').catch(() => {});
    return ctx.editMessageText(
      `🎊 آفرین! عدد ${s.number} بود!\n` +
      `تو ${s.tries} تلاش پیداش کردی و ${fmt(gain)} امتیاز گرفتی!\n\n✨ مجموع امتیازت: ${fmt(u.xp)}`,
      mainMenu
    );
  }

  if (s.tries >= 3) {
    delete sessions[ctx.chat.id];
    addXp(u, 1000);
    ctx.answerCbQuery('فرصت‌ها تموم شد').catch(() => {});
    return ctx.editMessageText(
      `😅 فرصت‌ها تموم شد! عدد درست ${s.number} بود.\n` +
      `۱٬۰۰۰ امتیاز سرگرمی گرفتی! دوباره امتحان کن 👇`,
      mainMenu
    );
  }

  const hint = guessed < s.number ? 'بزرگ‌تره ⬆️' : 'کوچک‌تره ⬇️';
  const remain = 3 - s.tries;
  ctx.answerCbQuery(hint + ` (${remain} شانس)`).catch(() => {});
  return ctx.editMessageText(
    `❌ نه! عدد ${hint}\n\n🎯 ${remain} شانس باقی مونده. دوباره حدس بزن:`,
    Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map((n) => Markup.button.callback(String(n), 'guess_' + n)),
      [6, 7, 8, 9, 10].map((n) => Markup.button.callback(String(n), 'guess_' + n)),
    ])
  );
}

/* ─── شیر یا خط ─── */

bot.command('coin', (ctx) => doCoin(ctx));

function doCoin(ctx) {
  const u = getUser(ctx.from.id);
  u.plays = (u.plays || 0) + 1;
  addXp(u, 1000);
  const isHeads = Math.random() < 0.5;
  return ctx.reply(
    isHeads
      ? '🪙 سکه هوا رفت... و روی **شیر** نشست! 👑\n۱٬۰۰۰ امتیاز گرفتی!'
      : '🪙 سکه هوا رفت... و روی **خط** نشست! 📏\n۱٬۰۰۰ امتیاز گرفتی!',
    { parse_mode: 'Markdown', ...mainMenu }
  );
}

/* ─── تاس ─── */

bot.command('dice', (ctx) => doDice(ctx));

function doDice(ctx) {
  const u = getUser(ctx.from.id);
  u.plays = (u.plays || 0) + 1;
  return ctx.replyWithDice({ emoji: '🎲' }).then((msg) => {
    const v = msg.dice.value;
    let gain = 1000, text = '';
    if (v === 6) { gain = 5000000; text = '🔥 شیش! عالی! ۵ میلیون امتیاز!'; }
    else if (v === 5) { gain = 2000000; text = '😄 پنج! خیلی خوب! ۲ میلیون امتیاز!'; }
    else text = `${v} اومد! ${fmt(gain)} امتیاز سرگرمی گرفتی!`;
    addXp(u, gain);
    setTimeout(() => {
      ctx.reply(`🎲 ${text}\n\n✨ مجموع امتیازت: ${fmt(u.xp)}`, mainMenu).catch(() => {});
    }, 2200);
  });
}

/* ─────────────────────────── دکمه‌های شیشه‌ای ─────────────────────────── */

bot.action('close', (ctx) => {
  delete sessions[ctx.chat.id];
  ctx.answerCbQuery('منو بسته شد. /menu برای باز کردن دوباره').catch(() => {});
  return ctx.deleteMessage().catch(() => {});
});

bot.action('joke', (ctx) => ctx.answerCbQuery().then(() => sendJoke(ctx)));
bot.action('fal', (ctx) => ctx.answerCbQuery().then(() => sendFal(ctx)));
bot.action('slot', (ctx) => ctx.answerCbQuery('🎰 اسلات چرخید!').then(() => doSlot(ctx)));
bot.action('dice', (ctx) => ctx.answerCbQuery('🎲 تاس پرت شد!').then(() => doDice(ctx)));
bot.action('coin', (ctx) => ctx.answerCbQuery().then(() => doCoin(ctx)));
bot.action('me', (ctx) => ctx.answerCbQuery().then(() => sendProfile(ctx)));
bot.action('top', (ctx) => ctx.answerCbQuery().then(() => sendTop(ctx)));

bot.action('guess_start', (ctx) => {
  ctx.answerCbQuery('🔢 بازی شروع شد!').catch(() => {});
  return startGuess(ctx);
});

bot.action(/^guess_(\d+)$/, (ctx) => {
  const n = Number(ctx.match[1]);
  return guessHandle(ctx, n);
});

/* متن‌های معمولی که عدد نیستند و داخل بازی نیستند → راهنما */
bot.on('text', (ctx, next) => {
  const s = sessions[ctx.chat.id];
  if (s && s.kind === 'guess') {
    const n = parseInt(ctx.message.text.trim(), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 10) return guessHandle(ctx, n);
    return ctx.reply(`عدد بین ۱ تا ۱۰ بفرست! (${3 - s.tries} شانس)`);
  }
  return next();
});

/* ─────────────────────────── تنظیم پروفایل ربات (خودکار) ─────────────────────────── */

async function setupProfile() {
  const tg = bot.telegram;
  const tasks = [
    () => tg.callApi('setMyName', { name: 'سرگرمی بات' }).catch(() => {}),
    () =>
      tg.setMyShortDescription(
        '🎪 ربات سرگرمی فارسی: جوک، فال حافظ، اسلات، حدس عدد، تاس و کلی بازی! /menu رو بزن.'
      ).catch(() => {}),
    () =>
      tg.setMyCommands([
        { command: 'menu', description: '🎡 منوی بازی‌ها' },
        { command: 'joke', description: '😂 یه جوک خنده‌دار' },
        { command: 'fal', description: '📖 فال حافظ' },
        { command: 'slot', description: '🎰 اسلات شانس' },
        { command: 'guess', description: '🔢 بازی حدس عدد' },
        { command: 'coin', description: '🪙 شیر یا خط' },
        { command: 'dice', description: '🎲 پرتاب تاس' },
        { command: 'me', description: '⭐ امتیاز و سطح من' },
        { command: 'top', description: '🏆 برترین کاربران' },
        { command: 'help', description: '❓ راهنما' },
      ]).catch(() => {}),
  ];
  for (const t of tasks) {
    try { await t(); } catch (e) { console.error('profile setup:', e.message); }
  }
}

/* ─────────────────────────── اجرا با حلقه مقاوم ─────────────────────────── */

async function main() {
  await setupProfile();
  console.log('Fun bot starting...');
  let consecutiveFails = 0;
  while (true) {
    try {
      await bot.launch({ dropPendingUpdates: true });
      consecutiveFails = 0;
    } catch (err) {
      consecutiveFails++;
      console.error('launch error:', err && err.message);
      const wait = Math.min(30000, 3000 * consecutiveFails);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

function shutdown(sig) {
  saveData();
  try { bot.stop(sig); } catch (e) { /* اگر ربات هنوز اجرا نشده بود */ }
  process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

main();
