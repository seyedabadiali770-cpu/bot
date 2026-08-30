"""ربات تلگرامی دانلودر چندپلتفرمه.

پشتیبانی: یوتیوب، اینستاگرام، تیک‌تاک، توییتر/ایکس، فیسبوک، ردیت، تلگرام
و (به‌صورت اختیاری) روبیکا — به‌علاوه‌ی هر سایت دیگری که yt-dlp بشناسد.
"""
import asyncio
import logging
import os
import time

from telegram import Update
from telegram.constants import ChatAction
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

import config
import downloader
import rubika

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

HELP_TEXT = (
    "🎬 <b>ربات دانلودر همه‌کاره</b>\n\n"
    "فقط لینک ویدیو/پست/موزیک را بفرست تا دانلودش کنم:\n\n"
    "▶️ <b>یوتیوب</b> — ویدیو یا صدا (mp3)\n"
    "📸 <b>اینستاگرام</b> — پست، ریلز، استوری\n"
    "🎵 <b>تیک‌تاک</b> — ویدیو بدون واترمارک\n"
    "🐦 <b>توییتر / ایکس</b> — ویدیو و GIF\n"
    "📘 <b>فیسبوک</b> و <b>ردیت</b> و <b>تلگرام</b>\n"
    "🟡 <b>روبیکا</b> — (نیازمند تنظیم اکانت)\n"
    "🌐 و ده‌ها سایت دیگر\n\n"
    "<b>دستورها:</b>\n"
    "/start — شروع\n"
    "/mp3 &lt;لینک&gt; — دانلود فقط صدا (mp3)\n"
    "/video &lt;لینک&gt; — دانلود ویدیو\n"
    "/yt &lt;لینک&gt; — یوتیوب\n"
    "/insta &lt;لینک&gt; — اینستاگرام\n"
    "/tiktok &lt;لینک&gt; — تیک‌تاک\n"
    "/rubika &lt;لینک&gt; — روبیکا\n"
    "/help — راهنما\n\n"
    "کافیه لینک را مستقیم بفرستی؛ خودم تشخیص می‌دهم 🚀"
)


# ---------------------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "سلام! 👋\n"
        "لینک هر ویدیو یا پستی را بفرست تا دانلودش کنم 🎬\n\n"
        + HELP_TEXT,
        parse_mode="HTML",
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(HELP_TEXT, parse_mode="HTML")


# ---------------------------------------------------------------------------
async def _process_and_send(
    update: Update, context: ContextTypes.DEFAULT_TYPE, url: str,
    prefer_audio: bool = False, quality: str = "best",
) -> None:
    """دانلود و ارسال فایل به کاربر."""
    chat_id = update.effective_chat.id
    msg = update.message

    platform = downloader.detect_platform(url)
    platform_fa = downloader.PLATFORM_NAMES_FA.get(platform, "عمومی")

    # --- مسیر اختصاصی روبیکا ---
    if platform == "rubika":
        await _handle_rubika(update, context, url)
        return

    status = await msg.reply_text(
        f"⏳ در حال دانلود از {platform_fa}...\n"
        + ("🎵 (فقط صدا)" if prefer_audio else "")
    )
    await msg.chat.send_action(ChatAction.UPLOAD_DOCUMENT)

    # دانلود در thread جدا تا ربات بلاک نشود
    result = await asyncio.to_thread(
        downloader.download, url, prefer_audio=prefer_audio, quality=quality
    )

    if not result.ok:
        err = result.error or "خطای نامشخص"
        await status.edit_text(
            f"❌ دانلود ناموفق بود ({platform_fa}):\n\n<code>{err}</code>",
            parse_mode="HTML",
        )
        return

    # بررسی حجم
    if result.filesize > config.MAX_FILE_SIZE_BYTES:
        size_mb = result.filesize / 1024 / 1024
        await status.edit_text(
            f"⚠️ حجم فایل ({size_mb:.1f} مگابایت) بیشتر از حد مجاز "
            f"({config.MAX_FILE_SIZE_MB} مگابایت) است.\n\n"
            f"می‌توانی با دستور <code>/mp3</code> فقط صدا را (حجم کمتر) بگیری.",
            parse_mode="HTML",
        )
        downloader.cleanup(result.filepath)
        return

    try:
        caption = (
            f"✅ دانلود شد از {platform_fa}\n"
            f"📛 {result.title}\n"
            + ("🎵 فرمت: MP3" if result.is_audio else "🎬 فرمت: ویدیو")
        )

        if result.is_audio or result.ext in ("mp3", "m4a", "opus", "ogg", "wav", "flac"):
            await status.edit_text("📤 در حال آپلود صدا...")
            with open(result.filepath, "rb") as f:
                await msg.reply_audio(
                    audio=f,
                    title=result.title[:64],
                    caption=caption,
                )
        else:
            await status.edit_text("📤 در حال آپلود ویدیو...")
            with open(result.filepath, "rb") as f:
                await msg.reply_video(video=f, caption=caption)

        await status.delete()
    except Exception as e:  # noqa: BLE001
        logger.exception("send error")
        await status.edit_text(f"❌ خطا در ارسال فایل: {e}"[:500])
    finally:
        downloader.cleanup(result.filepath)


async def _handle_rubika(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str) -> None:
    msg = update.message
    if not rubika.is_available() or not (config.RUBIKA_AUTH or config.RUBIKA_PHONE):
        await msg.reply_text(
            "🟡 <b>روبیکا</b> نیاز به تنظیمات اکانت دارد:\n\n"
            "۱) نصب کتابخانه: <code>pip install -U rubpy</code>\n"
            "۲) در فایل <code>.env</code> یکی از این دو را تنظیم کن:\n"
            "• <code>RUBIKA_AUTH=...</code>\n"
            "• <code>RUBIKA_PHONE=...</code> + <code>RUBIKA_PASSWORD=...</code>\n\n"
            "⚠️ این بخش آزمایشی است و به دلیل تغییرات API روبیکا ممکن است نیاز به "
            "تنظیم داشته باشد.",
            parse_mode="HTML",
        )
        return

    status = await msg.reply_text("⏳ در حال دانلود از روبیکا...")
    res = await asyncio.to_thread(rubika.download, url)
    if not res.get("ok"):
        await status.edit_text(f"❌ {res.get('error', 'خطا')}")
        return

    await status.edit_text("📤 در حال آپلود...")
    try:
        with open(res["filepath"], "rb") as f:
            await msg.reply_document(document=f, caption="✅ دانلود شد از روبیکا")
        await status.delete()
    except Exception as e:  # noqa: BLE001
        await status.edit_text(f"❌ خطا در ارسال: {e}"[:500])
    finally:
        downloader.cleanup(res.get("filepath", ""))


# ---------------------------------------------------------------------------
async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """هر پیام متنی: اگر لینک داشت، پردازش کن."""
    text = update.message.text or ""
    urls = downloader.extract_urls(text)
    if not urls:
        return  # پیام بدون لینک → نادیده بگیر
    await _process_and_send(update, context, urls[0])


# --- دستورهای با آرگومان لینک ---
async def _cmd(update: Update, context: ContextTypes.DEFAULT_TYPE, prefer_audio: bool) -> None:
    if not context.args:
        await update.message.reply_text("لطفاً بعد از دستور، لینک را هم بنویس. مثال:\n`/mp3 https://...`", parse_mode="MarkdownV2")
        return
    await _process_and_send(update, context, context.args[0], prefer_audio=prefer_audio)


async def cmd_video(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _cmd(update, context, prefer_audio=False)


async def cmd_mp3(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _cmd(update, context, prefer_audio=True)


async def cmd_yt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _cmd(update, context, prefer_audio=False)


async def cmd_insta(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _cmd(update, context, prefer_audio=False)


async def cmd_tiktok(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await _cmd(update, context, prefer_audio=False)


async def cmd_rubika(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("لطفاً لینک روبیکا را بعد از دستور بنویس.")
        return
    await _handle_rubika(update, context, context.args[0])


# ---------------------------------------------------------------------------
def main() -> None:
    if not config.BOT_TOKEN:
        raise SystemExit("❌ BOT_TOKEN در فایل .env تنظیم نشده است.")

    app = Application.builder().token(config.BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("mp3", cmd_mp3))
    app.add_handler(CommandHandler("video", cmd_video))
    app.add_handler(CommandHandler("yt", cmd_yt))
    app.add_handler(CommandHandler("youtube", cmd_yt))
    app.add_handler(CommandHandler("insta", cmd_insta))
    app.add_handler(CommandHandler("instagram", cmd_insta))
    app.add_handler(CommandHandler("tiktok", cmd_tiktok))
    app.add_handler(CommandHandler("tt", cmd_tiktok))
    app.add_handler(CommandHandler("rubika", cmd_rubika))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("🤖 ربات در حال اجراست...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
