"""موتور دانلود — تشخیص پلتفرم و دانلود با yt-dlp."""
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import Optional

import yt_dlp

# ---------------------------------------------------------------------------
# تشخیص پلتفرم از روی لینک
# ---------------------------------------------------------------------------
PLATFORM_PATTERNS = [
    ("youtube", r"(youtube\.com|youtu\.be)"),
    ("instagram", r"(instagram\.com|instagr\.am)"),
    ("tiktok", r"(tiktok\.com)"),
    ("twitter", r"(twitter\.com|x\.com)"),
    ("facebook", r"(facebook\.com|fb\.com|fb\.watch)"),
    ("reddit", r"(reddit\.com|redd\.it)"),
    ("telegram", r"(t\.me)"),
    ("rubika", r"(rubika\.ir)"),
]

PLATFORM_NAMES_FA = {
    "youtube": "یوتیوب",
    "instagram": "اینستاگرام",
    "tiktok": "تیک‌تاک",
    "twitter": "توییتر / ایکس",
    "facebook": "فیسبوک",
    "reddit": "ردیت",
    "telegram": "تلگرام",
    "rubika": "روبیکا",
    "generic": "عمومی",
}


def detect_platform(url: str) -> str:
    """نام پلتفرم را از لینک تشخیص می‌دهد (پیش‌فرض: generic)."""
    for name, pattern in PLATFORM_PATTERNS:
        if re.search(pattern, url, re.IGNORECASE):
            return name
    return "generic"


def extract_urls(text: str) -> list[str]:
    """همه‌ی لینک‌های موجود در متن را برمی‌گرداند."""
    return re.findall(r"https?://[^\s]+", text)


# ---------------------------------------------------------------------------
# ساختار نتیجه‌ی دانلود
# ---------------------------------------------------------------------------
@dataclass
class DownloadResult:
    ok: bool
    filepath: str = ""
    title: str = ""
    ext: str = ""
    filesize: int = 0
    is_audio: bool = False
    url: str = ""
    error: str = ""
    warnings: list = field(default_factory=list)


# ---------------------------------------------------------------------------
# گزینه‌های yt-dlp
# ---------------------------------------------------------------------------
def _base_opts(outdir: str, prefer_audio: bool, quality: str) -> dict:
    opts = {
        "outtmpl": os.path.join(outdir, "%(title).80s [%(id)s].%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "restrictfilenames": True,
        "retries": 3,
        "socket_timeout": 30,
        "nocheckcertificate": True,
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        },
    }

    if prefer_audio:
        opts.update(
            {
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }
                ],
            }
        )
    else:
        # اولویت با mp4 برای سازگاری بیشتر با تلگرام
        opts["format"] = (
            "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/"
            "bestvideo+bestaudio/best"
        )
        opts["merge_output_format"] = "mp4"

    if quality == "low":
        opts["format"] = "worst[ext=mp4]/worst"

    return opts


# ---------------------------------------------------------------------------
# تابع اصلی دانلود
# ---------------------------------------------------------------------------
def download(url: str, prefer_audio: bool = False, quality: str = "best") -> DownloadResult:
    """دانلود از لینک داده‌شده. کیفیت: best | low"""
    result = DownloadResult(ok=False, url=url)
    tmpdir = tempfile.mkdtemp(prefix="dlbot_")

    try:
        opts = _base_opts(tmpdir, prefer_audio, quality)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)

            if "entries" in info:  # پلی‌لیست → اولین آیتم
                info = info["entries"][0]

            # پیدا کردن فایل دانلودشده
            final_path = None
            if "requested_downloads" in info and info["requested_downloads"]:
                final_path = info["requested_downloads"][0].get("filepath")
            if not final_path:
                final_path = ydl.prepare_filename(info)
                if prefer_audio and final_path.endswith((".webm", ".m4a", ".opus")):
                    base = os.path.splitext(final_path)[0]
                    if os.path.exists(base + ".mp3"):
                        final_path = base + ".mp3"

            if not final_path or not os.path.exists(final_path):
                # در صورت ادغام فرمت‌ها، پسوند mp4 را امتحان کن
                base = os.path.splitext(ydl.prepare_filename(info))[0]
                for cand in (base + ".mp4", base + ".mkv", base + ".mp3", base + ".webm"):
                    if os.path.exists(cand):
                        final_path = cand
                        break

            if not final_path or not os.path.exists(final_path):
                result.error = "فایل خروجی پیدا نشد."
                return result

            result.ok = True
            result.filepath = final_path
            result.title = info.get("title") or "بدون عنوان"
            result.ext = os.path.splitext(final_path)[1].lstrip(".").lower()
            result.filesize = os.path.getsize(final_path)
            result.is_audio = prefer_audio
            result.warnings = info.get("_warning_lines", []) or []
            return result

    except yt_dlp.utils.DownloadError as e:
        result.error = str(e).split("\n")[-1][:500] or "خطا در دانلود"
    except Exception as e:  # noqa: BLE001
        result.error = f"{type(e).__name__}: {e}"[:500]
    return result


def cleanup(filepath: str) -> None:
    """حذف فایل دانلودشده (و دایرکتوری موقت آن)."""
    try:
        if filepath and os.path.exists(filepath):
            os.remove(filepath)
        parent = os.path.dirname(filepath)
        if parent and os.path.isdir(parent):
            try:
                os.rmdir(parent)
            except OSError:
                pass
    except OSError:
        pass
