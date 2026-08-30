"""دانلود از روبیکا (اختیاری و آزمایشی).

برای دانلود محتوای روبیکا به یک اکانت روبیکا نیاز دارید؛ زیرا روبیکا
لینک عمومیِ مستقیم فایل ارائه نمی‌دهد. این ماژول از کتابخانه‌ی `rubpy`
استفاده می‌کند. نصب:

    pip install -U rubpy

و سپس در فایل `.env` یکی از این دو حالت را تنظیم کنید:
    - RUBIKA_AUTH=<auth key روبیکا>
    - RUBIKA_PHONE + RUBIKA_PASSWORD

توجه: این بخش به دلیل تغییرات مکرر API روبیکا/کتابخانه، «آزمایشی» است و
ممکن است نیاز به تنظیم دقیق بر اساس نسخه‌ی نصب‌شده داشته باشد.
"""
import os
import tempfile

import config


def is_available() -> bool:
    """بررسی می‌کند آیا ماژول روبیکا قابل استفاده است یا نه."""
    try:
        import rubpy  # noqa: F401

        return True
    except ImportError:
        return False


def _get_client():
    """ساخت و لاگین کلاینت روبیکا."""
    from rubpy import Client

    if config.RUBIKA_AUTH:
        return Client(auth=config.RUBIKA_AUTH)
    if config.RUBIKA_PHONE and config.RUBIKA_PASSWORD:
        client = Client(auth=config.RUBIKA_PHONE)
        client.login(password=config.RUBIKA_PASSWORD)
        return client
    raise RuntimeError("اطلاعات ورود روبیکا در .env تنظیم نشده است.")


def download(link: str) -> dict:
    """تلاش برای دانلود محتوای روبیکا از روی لینک.

    خروجی: dict با کلیدهای ok / filepath / title / error
    """
    if not is_available():
        return {
            "ok": False,
            "error": (
                "کتابخانه‌ی `rubpy` نصب نیست. برای دانلود از روبیکا:\n"
                "`pip install -U rubpy` را اجرا و اطلاعات اکانت را در .env تنظیم کنید."
            ),
        }

    try:
        client = _get_client()

        # روبیکا لینک‌هایی مانند https://rubika.ir/... دارد؛
        # اینجا تلاش می‌کنیم شناسه‌ی پیام/چت را استخراج کنیم.
        parts = link.rstrip("/").split("/")
        message_id = parts[-1] if parts[-1].isdigit() else parts[-2] if len(parts) > 1 else None
        object_guid = None

        # پیاده‌سازی نمونه — بسته به نسخه rubpy، متدها ممکن است متفاوت باشند.
        try:
            if message_id:
                msgs = client.get_messages_by_id(
                    object_guid=object_guid or parts[0] if object_guid is None else object_guid,
                    message_ids=[message_id],
                )
                msg = msgs[0] if msgs else None
                if msg is not None:
                    outdir = tempfile.mkdtemp(prefix="dlbot_rubika_")
                    path = client.download(msg, save=os.path.join(outdir, "media"))
                    return {"ok": True, "filepath": path, "title": "فایل روبیکا"}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"خطای روبیکا: {e}"[:500]}

        return {"ok": False, "error": "شناسه‌ی معتبری از لینک روبیکا استخراج نشد."}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"خطای روبیکا: {e}"[:500]}
