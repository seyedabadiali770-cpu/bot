"""بارگذاری تنظیمات از متغیرهای محیطی."""
import os

from dotenv import load_dotenv

load_dotenv()

# توکن ربات تلگرام
BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

# آیدی ادمین‌ها (اختیاری)
ADMIN_IDS = {
    int(x.strip())
    for x in os.getenv("ADMIN_IDS", "").split(",")
    if x.strip().isdigit()
}

# حداکثر حجم فایل برای ارسال (مگابایت)
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "49") or 49)
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# --- روبیکا ---
RUBIKA_AUTH = os.getenv("RUBIKA_AUTH", "").strip()
RUBIKA_PHONE = os.getenv("RUBIKA_PHONE", "").strip()
RUBIKA_PASSWORD = os.getenv("RUBIKA_PASSWORD", "").strip()
