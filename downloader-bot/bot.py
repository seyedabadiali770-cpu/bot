"""ربات تلگرامی دانلودر چندپلتفرمه با انتخاب کیفیت و استخراج صدا.

پشتیبانی: یوتیوب، اینستاگرام، تیک‌تاک، توییتر/ایکس، فیسبوک، ردیت، تلگرام
و (اختیاری) روبیکا — به‌علاوه‌ی هر سایت دیگری که yt-dlp بشناسد.
"""
import asyncio
import logging
import os
import time
import uuid

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction, ParseMode
from telegram.ext import (
    Application,
    CallbackQueryHandler,
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

# لینک‌های در انتظار کاربر (id → url)
PENDING: dict[str, str] = {}

# نتایج جستجوی ویدیوهای مرتبط (id → list)
SEARCH_RESULTS: dict[str, list] = {}

# آمار ساده‌ی درون‌حافظه‌ای
STATS = {"downloads": 0, "errors": 0, "users": set()}

HELP_TEXT = (
    "🎬 <b>ربات دانلودر همه‌کاره</b>\n\n"
    "لینک را بفرست، بعد با دکمه‌ها انتخاب کن:\n\n"
    "🎬 <b>ویدیو HD</b> — بالاترین کیفیت\n"
    "📹 <b>۷۲۰p / ۴۸۰p</b> — کیفیت کمتر، حجم کمتر\n"
    "🎵 <b>صدا MP3</b> — جدا کردن موزیک از ویدیو\n"
    "ℹ️ <b>اطلاعات</b> — عنوان، مدت، بازدید\n"
    "🔍 <b>ویدیوهای مرتبط</b> — پیشنهاد ویدیوهای مشابه\n"
    "📃 <b>لیست پخش</b> — چند ویدیوی اول (یوتیوب)\n\n"
    "<b>پلتفرم‌ها:</b>\n"
    "▶️ یوتیوب • 📸 اینستاگرام • 🎵 تیک‌تاک\n"
    "🐦 توییتر/ایکس • 📘 فیسبوک • ردیت • تلگرام\n"
    "🟡 روبیکا (اختیاری) • و ده‌ها سایت دیگر\n\n"
    "<b>دستورها:</b>\n"
    "/start — شروع\n"
    "/mp3 &lt;لینک&gt; — فقط صدا\n"
    "/video &lt;لینک&gt; — ویدیو HD\n"
    "/info &lt;لینک&gt; — اطلاعات ویدیو\n"
    "/playlist &lt;لینک&gt; — لیست پخش\n"
    "/help — راهنما\n"
)


# ---------------------------------------------------------------------------
# کمکی: بررسی دسترسی کاربر (در صورت فعال‌بودن لیست سفید)
# ---------------------------------------------------------------------------
def _allowed(user_id: int) -> bool:
    if not config.ALLOWED_IDS:
        return True
    return user_id in config.ALLOWED_IDS


# ---------------------------------------------------------------------------
# دستورهای ساده
# ---------------------------------------------------------------------------
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "سلام! 👋 لینک هر ویدیو/پست/موزیکی را بفرست تا دانلودش کنم 🎬\n\n"
        + HELP_TEXT,
        parse_mode="HTML",
    )


async def help_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(HELP_TEXT, parse_mode="HTML")


async def stats_cmd(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if config.ADMIN_IDS and update.effective_user.id not in config.ADMIN_IDS:
        return
    await update.message.reply_text(
        f"📊 <b>آمار ربات</b>\n\n"
        f"⬇️ دانلودهای موفق: {STATS['downloads']}\n"
        f"❌ خطاها: {STATS['errors']}\n"
        f"👤 کاربران: {len(STATS['users'])}",
        parse_mode="HTML",
    )


# ---------------------------------------------------------------------------
# نمایش منوی انتخاب (پس از ارسال لینک)
# ---------------------------------------------------------------------------
def _menu_keyboard(pid: str, platform: str) -> InlineKeyboardMarkup:
    rows = [
        [
            InlineKeyboardButton("🎬 ویدیو HD", callback_data=f"v:best:{pid}"),
            InlineKeyboardButton("📹 ۷۲۰p", callback_data=f"v:medium:{pid}"),
        ],
        [
            InlineKeyboardButton("🎥 ۴۸۰p", callback_data=f"v:low:{pid}"),
            InlineKeyboardButton("🎵 صدا MP3", callback_data=f"a:{pid}"),
        ],
        [
            InlineKeyboardButton("ℹ️ اطلاعات", callback_data=f"i:{pid}"),
            InlineKeyboardButton("🔍 ویدیوهای مرتبط", callback_data=f"rel:{pid}"),
        ],
    ]
    if platform == "youtube":
        rows.append([InlineKeyboardButton("📃 لیست پخش (۵ تای اول)", callback_data=f"pl:{pid}")])
    return InlineKeyboardMarkup(rows)


async def show_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str) -> None:
    platform = downloader.detect_platform(url)
    platform_fa = downloader.PLATFORM_NAMES_FA.get(platform, "عمومی")
    pid = uuid.uuid4().hex[:10]
    PENDING[pid] = url

    if platform == "rubika":
        await _handle_rubika(update, context, url)
        return

    await update.message.reply_text(
        f"🔗 لینک <b>{platform_fa}</b> دریافت شد.\n"
        f"چه کاری انجام بدم؟ 👇",
        parse_mode="HTML",
        reply_markup=_menu_keyboard(pid, platform),
    )


# ---------------------------------------------------------------------------
# نمایش پیشرفت دانلود
# ---------------------------------------------------------------------------
async def _download_with_progress(
    status, func, *args, **kwargs
):
    """اجرای دانلود در thread و به‌روزرسانی پیام پیشرفت."""
    state = {"text": "", "done": False}

    def hook(d):
        if d.get("status") == "downloading":
            pct = d.get("_percent_str", "").strip()
            speed = d.get("_speed_str", "").strip()
            state["text"] = f"⏳ در حال دانلود... {pct} ({speed})"
        elif d.get("status") == "finished":
            state["text"] = "⚙️ در حال پردازش/ادغام فایل..."

    kwargs["progress_cb"] = hook

    async def updater():
        last = ""
        while not state["done"]:
            await asyncio.sleep(2)
            if state["text"] and state["text"] != last:
                last = state["text"]
                try:
                    await status.edit_text(state["text"])
                except Exception:
                    pass

    updater_task = asyncio.create_task(updater())
    result = await asyncio.to_thread(func, *args, **kwargs)
    state["done"] = True
    await updater_task
    return result


# ---------------------------------------------------------------------------
# پردازش و ارسال فایل
# ---------------------------------------------------------------------------
async def _process_and_send(
    update: Update, context: ContextTypes.DEFAULT_TYPE, url: str,
    prefer_audio: bool = False, quality: str = "best",
    msg=None, via_callback: bool = False,
) -> None:
    user_id = update.effective_user.id
    STATS["users"].add(user_id)

    platform = downloader.detect_platform(url)
    platform_fa = downloader.PLATFORM_NAMES_FA.get(platform, "عمومی")

    if via_callback and msg is not None:
        status = msg
        await status.edit_text("⏳ شروع دانلود...")
    else:
        status = await msg.reply_text("⏳ شروع دانلود...")

    await update.effective_chat.send_action(ChatAction.UPLOAD_DOCUMENT)

    result = await _download_with_progress(
        status, downloader.download, url,
        prefer_audio=prefer_audio, quality=quality,
    )

    if not result.ok:
        STATS["errors"] += 1
        err = result.error or "خطای نامشخص"
        await status.edit_text(
            f"❌ دانلود ناموفق ({platform_fa}):\n\n<code>{err}</code>",
            parse_mode="HTML",
        )
        return

    if result.filesize > config.MAX_FILE_SIZE_BYTES:
        size_mb = result.filesize / 1024 / 1024
        await status.edit_text(
            f"⚠️ حجم فایل ({size_mb:.1f} مگابایت) بیشتر از حد مجاز "
            f"({config.MAX_FILE_SIZE_MB} مگابایت) است.\n\n"
            f"می‌توانی با دکمه <b>🎵 صدا MP3</b> یا کیفیت پایین‌تر، حجم را کم کنی.",
            parse_mode="HTML",
        )
        downloader.cleanup(result.filepath)
        return

    caption = (
        f"✅ دانلود شد از {platform_fa}\n"
        f"📛 {result.title}\n"
        f"⏱ {downloader.format_duration(result.duration)}"
        + (" | 🎵 MP3" if result.is_audio else " | 🎬 ویدیو")
    )

    try:
        is_audio_file = result.is_audio or result.ext in (
            "mp3", "m4a", "opus", "ogg", "wav", "flac"
        )
        await status.edit_text("📤 در حال آپلود...")
        if is_audio_file:
            with open(result.filepath, "rb") as f:
                await status.reply_audio(audio=f, title=result.title[:64], caption=caption)
        else:
            with open(result.filepath, "rb") as f:
                await status.reply_video(video=f, caption=caption, supports_streaming=True)

        await status.delete()
        STATS["downloads"] += 1
    except Exception as e:  # noqa: BLE001
        logger.exception("send error")
        await status.edit_text(f"❌ خطا در ارسال فایل: {e}"[:500])
    finally:
        downloader.cleanup(result.filepath)


# ---------------------------------------------------------------------------
# اطلاعات ویدیو
# ---------------------------------------------------------------------------
async def _show_info(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str, msg=None) -> None:
    if msg is not None:
        await msg.edit_text("ℹ️ در حال دریافت اطلاعات...")
        status = msg
    else:
        status = await update.message.reply_text("ℹ️ در حال دریافت اطلاعات...")

    info = await asyncio.to_thread(downloader.get_info, url)
    if not info.ok:
        await status.edit_text(f"❌ {info.error or 'خطا'}"[:500])
        return

    text = (
        f"ℹ️ <b>{info.title}</b>\n\n"
        f"👤 سازنده: {info.uploader}\n"
        f"⏱ مدت: {downloader.format_duration(info.duration)}\n"
        f"👁 بازدید: {info.view_count:,}\n"
        f"👍 لایک: {info.like_count:,}\n"
    )
    if info.upload_date:
        text += f"📅 تاریخ: {info.upload_date[:4]}/{info.upload_date[4:6]}/{info.upload_date[6:8]}\n"
    if info.description:
        text += f"\n📝 {info.description}"
    await status.edit_text(text, parse_mode="HTML")


# ---------------------------------------------------------------------------
# ویدیوهای مرتبط
# ---------------------------------------------------------------------------
async def _show_related(
    update: Update, context: ContextTypes.DEFAULT_TYPE, url: str, msg=None
) -> None:
    if msg is not None:
        status = msg
        await status.edit_text("🔍 در حال جستجوی ویدیوهای مرتبط...")
    else:
        status = await update.message.reply_text("🔍 در حال جستجوی ویدیوهای مرتبط...")

    # عنوان ویدیوی فعلی را پیدا کن و بر اساس آن جستجو کن
    info = await asyncio.to_thread(downloader.get_info, url)
    query = info.title if (info.ok and info.title) else url
    results = await asyncio.to_thread(downloader.search, query, 5)

    if not results:
        await status.edit_text("❌ ویدیوی مرتبطی پیدا نشد.")
        return

    sid = uuid.uuid4().hex[:10]
    SEARCH_RESULTS[sid] = results

    buttons = []
    for idx, r in enumerate(results):
        dur = downloader.format_duration(r["duration"])
        label = f"{idx + 1}. {r['title'][:40]} ({dur})"
        buttons.append([InlineKeyboardButton(label, callback_data=f"rs:{sid}:{idx}")])

    await status.edit_text(
        f"🔍 نتایج مرتبط با «{query[:50]}»:\n"
        f"برای دانلود یکی را انتخاب کن 👇",
        reply_markup=InlineKeyboardMarkup(buttons),
    )


# ---------------------------------------------------------------------------
# لیست پخش
# ---------------------------------------------------------------------------
async def _process_playlist(
    update: Update, context: ContextTypes.DEFAULT_TYPE, url: str, msg=None
) -> None:
    if msg is not None:
        status = msg
        await status.edit_text("📃 در حال دانلود لیست پخش...")
    else:
        status = await update.message.reply_text("📃 در حال دانلود لیست پخش...")

    await update.effective_chat.send_action(ChatAction.UPLOAD_DOCUMENT)
    results = await _download_with_progress(
        status, downloader.download_playlist, url, limit=5
    )

    ok_count = 0
    for r in results:
        if not r.ok:
            STATS["errors"] += 1
            continue
        if r.filesize > config.MAX_FILE_SIZE_BYTES:
            downloader.cleanup(r.filepath)
            continue
        try:
            with open(r.filepath, "rb") as f:
                await status.reply_video(
                    video=f,
                    caption=f"📃 {r.title}\n⏱ {downloader.format_duration(r.duration)}",
                    supports_streaming=True,
                )
            ok_count += 1
        except Exception:
            pass
        finally:
            downloader.cleanup(r.filepath)

    if ok_count:
        await status.edit_text(f"✅ {ok_count} ویدیو از لیست پخش ارسال شد.")
        STATS["downloads"] += ok_count
    else:
        await status.edit_text("❌ هیچ ویدیویی از لیست پخش دانلود نشد.")


# ---------------------------------------------------------------------------
# روبیکا
# ---------------------------------------------------------------------------
async def _handle_rubika(update: Update, context: ContextTypes.DEFAULT_TYPE, url: str) -> None:
    msg = update.message
    if not rubika.is_available() or not (config.RUBIKA_AUTH or config.RUBIKA_PHONE):
        await msg.reply_text(
            "🟡 <b>روبیکا</b> نیاز به تنظیمات اکانت دارد:\n\n"
            "۱) نصب کتابخانه: <code>pip install -U rubpy</code>\n"
            "۲) در فایل <code>.env</code> یکی از این دو را تنظیم کن:\n"
            "• <code>RUBIKA_AUTH=...</code>\n"
            "• <code>RUBIKA_PHONE=...</code> + <code>RUBIKA_PASSWORD=...</code>\n\n"
            "⚠️ این بخش آزمایشی است.",
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
            await status.reply_document(document=f, caption="✅ دانلود شد از روبیکا")
        await status.delete()
    except Exception as e:  # noqa: BLE001
        await status.edit_text(f"❌ خطا در ارسال: {e}"[:500])
    finally:
        downloader.cleanup(res.get("filepath", ""))


# ---------------------------------------------------------------------------
# هندلر پیام متنی
# ---------------------------------------------------------------------------
async def on_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_user.id):
        return
    text = update.message.text or ""
    urls = downloader.extract_urls(text)
    if not urls:
        return
    if len(urls) == 1:
        await show_menu(update, context, urls[0])
    else:
        for u in urls[:3]:
            await show_menu(update, context, u)


# ---------------------------------------------------------------------------
# هندلر دکمه‌های اینلاین
# ---------------------------------------------------------------------------
async def on_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data
    msg = query.message

    if data == "nothing":
        return

    # انتخاب یک ویدیو از نتایج مرتبط
    if data.startswith("rs:"):
        try:
            _, sid, idx = data.split(":")
        except ValueError:
            return
        results = SEARCH_RESULTS.get(sid)
        if not results:
            await msg.edit_text("⏰ نتایج منقضی شده؛ دوباره تلاش کن.")
            return
        try:
            r = results[int(idx)]
        except (IndexError, ValueError):
            await msg.edit_text("خطا در انتخاب.")
            return
        SEARCH_RESULTS.pop(sid, None)
        await _process_and_send(
            update, context, r["url"], prefer_audio=False, quality="best",
            msg=msg, via_callback=True,
        )
        return

    parts = data.split(":")
    action, pid = parts[0], parts[-1]
    url = PENDING.get(pid)
    if not url:
        await msg.edit_text("⏰ این درخواست منقضی شده؛ لینک را دوباره بفرست.")
        return

    try:
        if action == "i":
            await _show_info(update, context, url, msg=msg)
        elif action == "a":
            await _process_and_send(
                update, context, url, prefer_audio=True, quality="best",
                msg=msg, via_callback=True,
            )
        elif action == "rel":
            await _show_related(update, context, url, msg=msg)
        elif action == "pl":
            await _process_playlist(update, context, url, msg=msg)
        elif action == "v":
            quality = parts[1] if len(parts) == 3 else "best"
            await _process_and_send(
                update, context, url, prefer_audio=False, quality=quality,
                msg=msg, via_callback=True,
            )
    finally:
        PENDING.pop(pid, None)


# ---------------------------------------------------------------------------
# دستورهای با آرگومان لینک
# ---------------------------------------------------------------------------
async def _cmd(update: Update, context: ContextTypes.DEFAULT_TYPE, prefer_audio: bool) -> None:
    if not _allowed(update.effective_user.id):
        return
    if not context.args:
        await update.message.reply_text(
            "لینک را هم بنویس. مثال:\n`/mp3 https://...`",
            parse_mode="MarkdownV2",
        )
        return
    await _process_and_send(
        update, context, context.args[0], prefer_audio=prefer_audio, quality="best",
        msg=update.message,
    )


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


async def cmd_info(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_user.id):
        return
    if not context.args:
        await update.message.reply_text("لینک را هم بنویس. مثال:\n`/info https://...`")
        return
    await _show_info(update, context, context.args[0])


async def cmd_playlist(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not _allowed(update.effective_user.id):
        return
    if not context.args:
        await update.message.reply_text("لینک لیست پخش را هم بنویس.")
        return
    await _process_playlist(update, context, context.args[0])


async def cmd_rubika(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not context.args:
        await update.message.reply_text("لینک روبیکا را هم بنویس.")
        return
    await _handle_rubika(update, context, context.args[0])


# ---------------------------------------------------------------------------
def main() -> None:
    if not config.BOT_TOKEN:
        raise SystemExit("❌ BOT_TOKEN در فایل .env تنظیم نشده است.")

    app = Application.builder().token(config.BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_cmd))
    app.add_handler(CommandHandler("stats", stats_cmd))
    app.add_handler(CommandHandler("mp3", cmd_mp3))
    app.add_handler(CommandHandler("audio", cmd_mp3))
    app.add_handler(CommandHandler("video", cmd_video))
    app.add_handler(CommandHandler("yt", cmd_yt))
    app.add_handler(CommandHandler("youtube", cmd_yt))
    app.add_handler(CommandHandler("insta", cmd_insta))
    app.add_handler(CommandHandler("instagram", cmd_insta))
    app.add_handler(CommandHandler("tiktok", cmd_tiktok))
    app.add_handler(CommandHandler("tt", cmd_tiktok))
    app.add_handler(CommandHandler("info", cmd_info))
    app.add_handler(CommandHandler("playlist", cmd_playlist))
    app.add_handler(CommandHandler("rubika", cmd_rubika))
    app.add_handler(CallbackQueryHandler(on_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, on_text))

    logger.info("🤖 ربات در حال اجراست...")

    if config.MAX_RUNTIME_SECONDS > 0:
        # اجرای محدود (برای GitHub Actions): بعد از N ثانیه تمیز خاموش می‌شود
        async def run_limited() -> None:
            await app.initialize()
            await app.start()
            await app.updater.start_polling(allowed_updates=Update.ALL_TYPES)
            await asyncio.sleep(config.MAX_RUNTIME_SECONDS)
            await app.updater.stop()
            await app.stop()
            await app.shutdown()
            logger.info("⏹️ پایان اجرای محدود (MAX_RUNTIME_SECONDS).")

        asyncio.run(run_limited())
    else:
        app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
