# 💰 ربات تلگرام طلا و دلار

یک ربات تلگرام کامل و زیبا برای نمایش قیمت لحظه‌ای طلا، سکه و ارز، همراه با **پیش‌بینی بازار**، **سیستم هشدار قیمت**، **ماشین‌حساب** و **ارسال خودکار پست به کانال**.

## ✨ امکانات

- 💰 **قیمت لحظه‌ای** دلار، یورو، درهم، پوند، لیر، تتر، طلای ۱۸ و ۲۴ عیار، سکه امامی، نیم و ربع سکه، اونس جهانی، بیت‌کوین
- 📊 **پیش‌بینی کوتاه‌مدت** با تحلیل تکنیکال ساده (میانگین متحرک + مومنتوم + نوسان)
- 🔔 **سیستم هشدار قیمت** — هر قیمت به عدد دلخواه رسید پیام خصوصی بده
- 📈 **نمودار متنی (Sparkline)** برای هر دارایی
- 🧮 **ماشین‌حساب** تبدیل دلار/تومان و طلا
- 📢 **پست خودکار** به کانال تلگرام در بازه‌های قابل تنظیم
- 🔐 **اجبار عضویت در کانال** (Force Subscribe)
- 👑 **پنل ادمین** با قابلیت ارسال پیام همگانی، پست فوری، مدیریت تنظیمات
- 🌐 **صفحه وب (Landing Page)** زیبا با لایو قیمت‌ها
- 🔄 **چند منبع داده با Failover** (brsapi, bonbast, nobitex, coingecko + حالت آفلاین نمایشی)

## 🚀 راه‌اندازی سریع

### ۱. پیش‌نیازها
- Node.js >= 18
- یک توکن ربات تلگرام از [@BotFather](https://t.me/BotFather)
- آیدی عددی ادمین از [@userinfobot](https://t.me/userinfobot)

### ۲. نصب
```bash
npm install
```

### ۳. تنظیم متغیرهای محیطی
```bash
cp .env.example .env
# سپس فایل .env را با مقادیر خود ویرایش کنید
```

متغیرهای ضروری:
- `GOLD_BOT_TOKEN` — توکن ربات
- `ADMIN_ID` — آیدی عددی ادمین
- `CHANNEL_USERNAME` — یوزرنیم کانال (مثل `@gold_dollar_channel`)

### ۴. اجرا
```bash
npm start
```

یا مستقیماً با متغیر محیطی:
```bash
GOLD_BOT_TOKEN=123456:ABC... ADMIN_ID=123456 CHANNEL_USERNAME=@my_channel npm start
```

## ⚙️ متغیرهای محیطی

| متغیر | توضیح | پیش‌فرض |
|-------|------|--------|
| `GOLD_BOT_TOKEN` | توکن ربات تلگرام | — |
| `ADMIN_ID` | آیدی عددی ادمین | — |
| `CHANNEL_USERNAME` | یوزرنیم کانال | `@gold_dollar_channel` |
| `CHANNEL_ID` | آیدی عددی کانال (اختیاری) | — |
| `REQUIRED_CHANNEL` | کانال اجباری عضویت | همان `CHANNEL_USERNAME` |
| `GOLD_BOT_NAME` | نام نمایشی ربات | `💰 طلا و دلار` |
| `PRICE_REFRESH_MS` | بازه به‌روزرسانی قیمت | `60000` (۱ دقیقه) |
| `CHANNEL_POST_MS` | بازه پست خودکار کانال | `900000` (۱۵ دقیقه) |
| `ALERT_CHECK_MS` | بازه بررسی هشدارها | `30000` (۳۰ ثانیه) |
| `PORT` | پورت سرور HTTP | `3000` |

## 👑 دستورات ادمین
- `/admin` یا `/settings` — ورود به پنل مدیریت
  - 📢 ارسال پست فوری به کانال
  - 🔄 به‌روزرسانی دستی قیمت‌ها
  - ⏸ روشن/خاموش پست خودکار
  - 🔓 روشن/خاموش عضویت اجباری
  - 📢 پیام همگانی به همه کاربران

## 📱 دستورات کاربران
- `/start` — شروع ربات
- `/menu` یا `/home` — منوی اصلی
- `/help` — راهنما

## 📡 منابع داده
ربات به‌صورت خودکار از این منابع استفاده می‌کند و اگر یکی در دسترس نبود از منبع بعدی استفاده می‌کند:
1. **brsapi.ir** — API رایگان طلا و ارز ایرانی
2. **Bonbast** — نرخ‌های بازار آزاد (mirror API)
3. **Nobitex** — صرافی ارز دیجیتال (برای نرخ USDT)
4. **CoinGecko** — قیمت بیت‌کوین
5. **حالت آفلاین نمایشی** — اگر هیچ منبعی در دسترس نبود (مثل روی هاست خارج از ایران)، قیمت‌های واقع‌گرایانه با نوسان نمایش داده می‌شود

## 🚀 دیپلوی یک‌کلیکی (دائمی و رایگان)

برای اینکه ربات **۲۴ ساعته و دائمی** روی یک سرور رایگان روشن بمونه، از یکی از دکمه‌های زیر استفاده کن (فقط یک‌بار کلیک و با حساب گیتهاب/گیتهابت وارد شو):

<p align="center">
  <a href="https://render.com/deploy?repo=https://github.com/seyedabadiali770-cpu/bot">
    <img src="https://render.com/images/deploy-to-render-button.svg" alt="Deploy to Render" height="40">
  </a>
  &nbsp;&nbsp;
  <a href="https://app.koyeb.com/deploy?type=git&repository=seyedabadiali770-cpu/bot&branch=arena/01a04fef-bot&name=gold-dollar-bot&run_command=npm%20start&env[GOLD_BOT_TOKEN]=8768391421:AAFEd7JYrJ6fkLHEuziDofKbOsWBwyyI77k&env[ADMIN_ID]=318405928&env[PORT]=8080">
    <img src="https://www.koyeb.com/static/images/deploy/button.svg" alt="Deploy to Koyeb" height="40">
  </a>
  &nbsp;&nbsp;
  <a href="https://railway.app/new/template?template=https://github.com/seyedabadiali770-cpu/bot&envs=GOLD_BOT_TOKEN,ADMIN_ID&GOLD_BOT_TOKEN=8768391421:AAFEd7JYrJ6fkLHEuziDofKbOsWBwyyI77k&ADMIN_ID=318405928">
    <img src="https://railway.app/button.svg" alt="Deploy on Railway" height="40">
  </a>
</p>

> **⚠️ نکته مهم:** سرویس‌های رایگان بالا سرورهای خارجی هستن. قیمت‌های **جهانی** (اونس طلا، بیت‌کوین، تتر) روی اونها کاملاً واقعی می‌شه، ولی قیمت‌های **بازار داخلی ایران** (دلار تومان، طلای ۱۸، سکه) به‌خاطر محدودیت IP، روی حالت نمایشی/نوسان‌دار می‌مونن. برای قیمت‌های ۱۰۰٪ واقعیِ تومانی، از بخش «روی سرور ایرانی» پایین استفاده کن.

### مقادیر لازم در هنگام دیپلوی
| متغیر | مقدار پیشنهادی |
|-------|--------------|
| `GOLD_BOT_TOKEN` | `8768391421:AAFEd7JYrJ6fkLHEuziDofKbOsWBwyyI77k` |
| `ADMIN_ID` | آیدی عددی ادمین (از @userinfobot) |
| `CHANNEL_USERNAME` | یوزرنیم کانال شما (مثل `@mygoldchannel`) |
| `PORT` | به‌صورت خودکار تنظیم می‌شود |

---

## ☁️ روش‌های دیپلوی (دستی)

### روی سرور ایرانی (برای قیمت‌های واقعی)
پیشنهاد می‌کنم از یک هاست ارزان ایرانی یا سرور مجازی داخل ایران استفاده کنی. دستور اجرا:
```bash
git clone https://github.com/seyedabadiali770-cpu/bot.git
cd bot
npm install
GOLD_BOT_TOKEN="8768391421:AAFEd7JYrJ6fkLHEuziDofKbOsWBwyyI77k" \
ADMIN_ID="آیدی_عددت" \
CHANNEL_USERNAME="@کانالت" \
npm start
```

برای اینکه ربات بعد از بستن ترمینال هم روشن بمونه از PM2 استفاده کن:
```bash
npm install -g pm2
pm2 start gold-bot/index.js --name gold-bot
pm2 save
pm2 startup
```

### روی سرویس‌های رایگان (Render / Railway / Koyeb / Glitch)
متغیرهای محیطی را در پنل سرویس تنظیم کنید و دستور `npm start` را بدهید. پورت به‌صورت خودکار از متغیر `PORT` خوانده می‌شود.

## 📂 ساختار فایل‌ها
```
bot/
├── gold-bot/
│   ├── index.js         # کد اصلی ربات
│   └── data/
│       └── db.json      # پایگاه داده محلی (کاربران، هشدارها، قیمت‌ها)
├── package.json
├── .env.example
└── README.md
```

## ⚠️ نکات مهم
- قیمت‌ها از منابع عمومی گرفته می‌شوند و ممکن است با بازار واقعی تفاوت داشته باشند.
- پیش‌بینی‌ها صرفاً جنبه اطلاع‌رسانی دارند و **توصیه مالی نیستند**.
- برای دریافت دقیق نرخ‌های بازار ایران، بهتر است ربات را روی یک سرور داخل ایران یا با IP ایرانی اجرا کنید.
