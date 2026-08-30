"""موتور دانلود — تشخیص پلتفرم، انتخاب کیفیت، استخراج صدا و دانلود با yt-dlp."""
import os
import re
import tempfile
from dataclasses import dataclass, field
from typing import Callable, Optional

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

# نگاشت کیفیت → فرمت yt-dlp
VIDEO_FORMATS = {
    "best": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best",
    "high": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]/best",
    "medium": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]/best",
    "low": "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]/best",
}

QUALITY_LABELS_FA = {
    "best": "کیفیت اصلی / HD",
    "high": "تا ۱۰۸۰p",
    "medium": "تا ۷۲۰p",
    "low": "تا ۴۸۰p",
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


def format_duration(seconds: Optional[int]) -> str:
    """ثانیه → «mm:ss» یا «hh:mm:ss»."""
    if not seconds:
        return "—"
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# ---------------------------------------------------------------------------
# ساختار نتیجه
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
    duration: int = 0
    error: str = ""
    warnings: list = field(default_factory=list)


@dataclass
class InfoResult:
    ok: bool
    title: str = ""
    duration: int = 0
    uploader: str = ""
    view_count: int = 0
    like_count: int = 0
    upload_date: str = ""
    thumbnail: str = ""
    description: str = ""
    error: str = ""


# ---------------------------------------------------------------------------
# گزینه‌های yt-dlp
# ---------------------------------------------------------------------------
def _base_opts(outdir: str, prefer_audio: bool, quality: str, progress_cb=None) -> dict:
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

    if progress_cb:
        opts["progress_hooks"] = [progress_cb]

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
        opts["format"] = VIDEO_FORMATS.get(quality, VIDEO_FORMATS["best"])
        opts["merge_output_format"] = "mp4"

    return opts


def _resolve_final_path(info: dict, ydl, prefer_audio: bool) -> Optional[str]:
    """پیدا کردن فایل نهایی دانلودشده (پس از ادغام/تبدیل)."""
    if "requested_downloads" in info and info["requested_downloads"]:
        fp = info["requested_downloads"][0].get("filepath")
        if fp and os.path.exists(fp):
            return fp

    base = os.path.splitext(ydl.prepare_filename(info))[0]
    candidates = [base + ".mp4", base + ".mkv", base + ".mp3", base + ".webm", base + ".m4a"]
    for cand in candidates:
        if os.path.exists(cand):
            return cand
    return None


# ---------------------------------------------------------------------------
# دانلود تک‌لینک
# ---------------------------------------------------------------------------
def download(
    url: str,
    prefer_audio: bool = False,
    quality: str = "best",
    progress_cb: Optional[Callable] = None,
) -> DownloadResult:
    """دانلود از لینک. quality: best | high | medium | low"""
    result = DownloadResult(ok=False, url=url)
    tmpdir = tempfile.mkdtemp(prefix="dlbot_")

    try:
        opts = _base_opts(tmpdir, prefer_audio, quality, progress_cb)

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)

            if "entries" in info:
                info = info["entries"][0]

            final_path = _resolve_final_path(info, ydl, prefer_audio)
            if not final_path:
                result.error = "فایل خروجی پیدا نشد."
                return result

            result.ok = True
            result.filepath = final_path
            result.title = info.get("title") or "بدون عنوان"
            result.ext = os.path.splitext(final_path)[1].lstrip(".").lower()
            result.filesize = os.path.getsize(final_path)
            result.is_audio = prefer_audio
            result.duration = info.get("duration") or 0
            result.warnings = info.get("_warning_lines", []) or []
            return result

    except yt_dlp.utils.DownloadError as e:
        result.error = str(e).split("\n")[-1][:500] or "خطا در دانلود"
    except Exception as e:  # noqa: BLE001
        result.error = f"{type(e).__name__}: {e}"[:500]
    return result


# ---------------------------------------------------------------------------
# اطلاعات ویدیو (بدون دانلود)
# ---------------------------------------------------------------------------
def get_info(url: str) -> InfoResult:
    """دریافت متادیتای ویدیو/پست بدون دانلود فایل."""
    res = InfoResult(ok=False, url=url)
    try:
        opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "noplaylist": True,
            "socket_timeout": 30,
            "http_headers": {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                )
            },
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if "entries" in info:
                info = info["entries"][0]

            res.ok = True
            res.title = info.get("title") or "بدون عنوان"
            res.duration = info.get("duration") or 0
            res.uploader = info.get("uploader") or info.get("channel") or "—"
            res.view_count = info.get("view_count") or 0
            res.like_count = info.get("like_count") or 0
            res.upload_date = info.get("upload_date") or ""
            res.thumbnail = info.get("thumbnail") or ""
            res.description = (info.get("description") or "")[:300]
    except Exception as e:  # noqa: BLE001
        res.error = f"{type(e).__name__}: {e}"[:500]
    return res


# ---------------------------------------------------------------------------
# دانلود لیست پخش (یوتیوب)
# ---------------------------------------------------------------------------
def download_playlist(
    url: str,
    limit: int = 5,
    prefer_audio: bool = False,
    quality: str = "best",
    progress_cb: Optional[Callable] = None,
) -> list[DownloadResult]:
    """دانلود چند آیتم اول یک لیست پخش."""
    results: list[DownloadResult] = []
    tmpdir = tempfile.mkdtemp(prefix="dlbot_pl_")

    try:
        opts = _base_opts(tmpdir, prefer_audio, quality, progress_cb)
        opts["noplaylist"] = False
        opts["playlistend"] = limit

        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            entries = info.get("entries") or []
            for entry in entries:
                if not entry:
                    continue
                r = DownloadResult(ok=False, url=entry.get("webpage_url", url))
                final_path = _resolve_final_path(entry, ydl, prefer_audio)
                if final_path:
                    r.ok = True
                    r.filepath = final_path
                    r.title = entry.get("title") or "بدون عنوان"
                    r.ext = os.path.splitext(final_path)[1].lstrip(".").lower()
                    r.filesize = os.path.getsize(final_path)
                    r.is_audio = prefer_audio
                    r.duration = entry.get("duration") or 0
                results.append(r)
    except Exception as e:  # noqa: BLE001
        results.append(DownloadResult(ok=False, url=url, error=f"{type(e).__name__}: {e}"[:300]))
    return results


def search(query: str, limit: int = 5) -> list[dict]:
    """جستجوی ویدیوهای مرتبط در یوتیوب بر اساس عنوان/عبارت."""
    results: list[dict] = []
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 30,
        "extract_flat": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query}", download=False)
            for e in info.get("entries") or []:
                if not e:
                    continue
                vid = e.get("id")
                results.append(
                    {
                        "id": vid,
                        "title": e.get("title") or "بدون عنوان",
                        "duration": e.get("duration") or 0,
                        "channel": e.get("channel") or e.get("uploader") or "—",
                        "url": e.get("webpage_url") or (f"https://youtu.be/{vid}" if vid else ""),
                    }
                )
    except Exception:  # noqa: BLE001
        pass
    return results


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
