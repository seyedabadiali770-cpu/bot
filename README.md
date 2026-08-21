# 🐶 DogsVPN — ربات تلگرامی کانفیگ‌ساز رایگان

ربات تلگرامی شبیه ربات‌های سرویس VPN — ولی **کاملاً رایگان، بدون پرداخت، بدون انقضا** ♾️

## ✨ امکانات

- 📥 ساخت کانفیگ: **VLESS** / **VMess** / **Trojan** / **Shadowsocks** / **WireGuard**
- 🔗 **لینک اشتراک (Subscription) اختصاصی** برای هر کاربر — با یک لینک، همه کانفیگ‌ها روی همه دستگاه‌ها
- 🌍 انتخاب سرور از بین چند کشور (آلمان، هلند، فرانسه، آمریکا، ...) با **تست پینگ**
- 📊 وضعیت حساب هر کاربر (UUID، سرور، تاریخ عضویت) — بدون انقضا
- 📖 راهنمای نصب در اپ‌های v2rayNG / Streisand / NekoBox / Hiddify
- 🛰 اتصال اختیاری به پنل **3x-ui (X-UI)** برای ساخت واقعی کاربر روی پنل
- 🖼 لوگو در پیام خوش‌آمدگویی + صفحه وضعیت وب (برای Railway Healthcheck)
- 🔒 وضعیت هر کاربر جدا (سرور انتخابی و کلیدها per-user ذخیره می‌شود)

## 🚀 استقرار روی Railway

1. این ریپو را روی Railway دیپلوی کنید (Railway → New Project → Deploy from GitHub).
2. در تب **Variables** این متغیرها را بگذارید:

| متغیر | اجباری | توضیح |
|---|---|---|
| `BOT_TOKEN` | ✅ بله | توکن ربات از [@BotFather](https://t.me/BotFather) |
| `BASE_URL` | ✅ بله | آدرس عمومی برنامه (مثلاً `https://xxx.up.railway.app`) — برای لینک اشتراک |
| `BOT_NAME` | ❌ | نام ربات (پیش‌فرض: `🐶 DogsVPN`) |
| `BOT_USERNAME` | ❌ | یوزرنیم ربات برای لینک صفحه وضعیت |
| `SERVERS_JSON` | ❌ | لیست سرورهای دلخواه (JSON) — نمونه در پایین |
| `SS_METHOD` | ❌ | روش رمزنگاری Shadowsocks (پیش‌فرض `aes-256-gcm`) |
| `VLESS_FLOW` | ❌ | مثلاً `xtls-rprx-vision` |
| `SNI` | ❌ | نام دامنه سرور |
| `WG_SERVER_PUBLIC_KEY` | ❌ | کلید عمومی سرور WireGuard |

3. دیپلوی تمام شود، ربات بالا می‌آید. ✅

### اتصال به پنل 3x-ui (اختیاری — برای کانفیگ‌های واقعی)

اگر سرور VPN با پنل 3x-ui دارید، با این متغیرها ربات برای هر کاربر **کاربر واقعی روی پنل می‌سازد**:

| متغیر | توضیح |
|---|---|
| `XUI_BASE_URL` | آدرس پنل، مثلاً `https://panel.example.com:2053` |
| `XUI_USERNAME` | یوزرنیم پنل |
| `XUI_PASSWORD` | پسورد پنل |
| `XUI_INBOUND_IDS` | آیدی اینباندها (مثلاً `1,2,3`) — خالی = همه اینباندها |
| `XUI_CONFIG_HOST` | آدرس/دامنه‌ای که در لینک کانفیگ می‌آید |

اگر اتصال به پنل برقرار نشود، ربات به‌صورت خودکار کانفیگ معمولی می‌سازد (خطا نمی‌دهد).

## 🖥 اجرای محلی

```bash
npm install
BOT_TOKEN=123456:ABC \
BASE_URL=http://localhost:3000 \
node index.js
```

برای تست لینک اشتراک بدون تلگرام:
```bash
DEMO_USER=123456789 BASE_URL=http://localhost:3000 node index.js
# در لاگ، لینک اشتراک نمونه چاپ می‌شود → http://localhost:3000/sub/{uuid}
```

## 📂 ساختار

```
index.js       → کل ربات + سرور HTTP اشتراک
logo.png       → لوگوی ربات (پیام /start)
package.json   → وابستگی‌ها (فقط telegraf)
railway.json   → تنظیمات Railway
Dockerfile     → اجرای Docker
data/users.json→ ذخیره کاربران (خودکار ساخته می‌شود، در git نیست)
```

## 🔒 نکته امنیتی

توکن ربات **هرگز در کد قرار نگیرد** — فقط از متغیر محیطی `BOT_TOKEN` خوانده می‌شود.
اگر قبلاً توکنی در ریپو کمویت شده، از BotFather یک توکن جدید بگیرید و توکن قبلی را باطل کنید.

## 📝 نمونه `SERVERS_JSON`

```json
[
  {"id": "de", "flag": "🇩🇪", "name": "آلمان", "host": "1.2.3.4", "port": 443, "security": "tls", "network": "tcp"},
  {"id": "jp", "flag": "🇯🇵", "name": "ژاپن", "host": "5.6.7.8", "port": 8443, "security": "tls", "network": "ws", "path": "/vpn", "hostHeader": "cdn.example.com"}
]
```
