import os
import random
import threading
import urllib.parse
import urllib.request
import subprocess
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ===== VK NOTIFICATIONS =====
VK_TOKEN = os.environ.get("SALON_VK_TOKEN", "vk1.a.XJ_Kp52BZwH0AFJRyaQ_FqnVmQ_YBQc__ew8A04bOWJwyppO8ABXUtSwDTtDeMyArDqA3EZ-utkkgPIoxdeRV7vPUiLrW5uZxfyqFGR9iq9SSM8FvN3jjx-w3nBMdr-t2Z1o7iuzyoU7n5a2nXam42w7bpOt5zJlB5BUU8XQ18izqv2tKODHAVx4NyBnRxQco-RcsQq7NP-8yJrHBeR6Kg")
VK_ADMIN_ID = int(os.environ.get("SALON_VK_ADMIN_ID", "76544534"))


NOTIFY_EMAIL = os.environ.get("SALON_NOTIFY_EMAIL", "academsaloon@mail.ru")
NOTIFY_EMAIL_CC = os.environ.get("SALON_NOTIFY_EMAIL_CC", "saymurrr@bk.ru")


def email_notify(subject: str, body: str) -> None:
    """Send email notification (fire-and-forget via mail.ru SMTP)."""
    def _send():
        try:
            msg = MIMEMultipart()
            msg["From"] = NOTIFY_EMAIL
            msg["To"] = NOTIFY_EMAIL
            msg["Cc"] = NOTIFY_EMAIL_CC
            msg["Subject"] = subject
            msg.attach(MIMEText(body, "plain", "utf-8"))
            # Note: mail.ru requires app password. Using simple sendmail fallback
            proc = subprocess.Popen(
                ["/usr/sbin/sendmail", "-t", "-oi"],
                stdin=subprocess.PIPE
            )
            proc.communicate(msg.as_bytes())
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True).start()


def vk_notify(message: str) -> None:
    """Send notification to admin via VK community messages (fire-and-forget)."""
    def _send():
        try:
            params = urllib.parse.urlencode({
                "user_id": VK_ADMIN_ID,
                "message": message,
                "random_id": random.randint(1, 2**31),
                "access_token": VK_TOKEN,
                "v": "5.199",
            })
            url = f"https://api.vk.com/method/messages.send?{params}"
            req = urllib.request.Request(url, method="GET")
            with urllib.request.urlopen(req, timeout=10) as resp:
                pass
        except Exception:
            pass  # Fire and forget — don't break order flow
    threading.Thread(target=_send, daemon=True).start()
