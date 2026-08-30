"""ثبت اسم و توضیحات ربات در تلگرام (یک‌بار اجرا کن).

این اسکریپت اسم، توضیحات و توضیح کوتاه ربات را از طریق Bot API ثبت می‌کند
تا ربات در جستجوی تلگرام بهتر دیده شود.

اجرا (از روی سرور/دستگاهی که به اینترنت دسترسی دارد):
    python setup_bot_profile.py

نکته: نام کاربری (@username) ربات را نمی‌توان با API عوض کرد؛ برای تغییر آن
باید ربات جدید بسازی (@BotFather → /newbot) و توکن جدید را در .env بگذاری.
اما «اسم نمایشی» (که اینجا تنظیم می‌شود) در نتایج جستجو مهم است.
"""
import json
import urllib.request

import config

# ---------------------------------------------------------------------------
# اسم و توضیحات پیشنهادی (کلمات کلیدی جستجو را شامل می‌شود)
# ---------------------------------------------------------------------------
NAME = "🎬 دانلودر ویدیو و موزیک | یوتیوب اینستاگرام تیک تاک"

DESCRIPTION = (
    "دانلود ویدیو و موزیک از یوتیوب، اینستاگرام، تیک تاک، توییتر، "
    "فیسبوک، ردیت و روبیکا — فقط لینک را بفرست! 🎬\n\n"
    "🎬 ویدیو با کیفیت HD / 720p / 480p\n"
    "🎵 استخراج موزیک (MP3) از ویدیو\n"
    "🔍 ویدیوهای مرتبط\n"
    "ℹ️ اطلاعات ویدیو (بازدید، لایک، مدت)\n"
    "📃 دانلود لیست پخش"
)

SHORT_DESCRIPTION = "دانلود ویدیو و موزیک از همه شبکه‌های اجتماعی"


def _call(method: str, payload: dict) -> dict:
    url = f"https://api.telegram.org/bot{config.BOT_TOKEN}/{method}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> None:
    if not config.BOT_TOKEN:
        raise SystemExit("❌ BOT_TOKEN در فایل .env تنظیم نشده است.")

    print("ربات فعلی:", json.dumps(_call("getMe"), ensure_ascii=False))
    print("ثبت اسم:", json.dumps(_call("setMyName", {"name": NAME}), ensure_ascii=False))
    print("ثبت توضیحات:", json.dumps(_call("setMyDescription", {"description": DESCRIPTION}), ensure_ascii=False))
    print("ثبت توضیح کوتاه:", json.dumps(_call("setMyShortDescription", {"short_description": SHORT_DESCRIPTION}), ensure_ascii=False))
    print("\n✅ انجام شد. اسم ربات:", NAME)


if __name__ == "__main__":
    main()
