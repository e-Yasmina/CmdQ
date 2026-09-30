import os
import platform
import re
import hashlib
import base64
from cryptography.fernet import Fernet


_MACHINE_KEY_CACHE = None


def _get_machine_key() -> bytes:
    global _MACHINE_KEY_CACHE
    if _MACHINE_KEY_CACHE:
        return _MACHINE_KEY_CACHE

    seed = platform.node()
    if platform.system() == "Windows":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography") as key:
                guid, _ = winreg.QueryValueEx(key, "MachineGuid")
                if guid:
                    seed = guid
        except Exception:
            pass

    raw = hashlib.pbkdf2_hmac("sha256", seed.encode("utf-8"), b"cmdq-secret-salt", 100000, dklen=32)
    _MACHINE_KEY_CACHE = base64.urlsafe_b64encode(raw)
    return _MACHINE_KEY_CACHE


def encrypt_api_key(plaintext: str) -> str:
    if not plaintext:
        return ""
    f = Fernet(_get_machine_key())
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_api_key(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        f = Fernet(_get_machine_key())
        return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


_PASSWORD_PATTERN = re.compile(
    r"(?<=[:=])[^@\s/:]+@",  # matches password before @ in URLs
    re.IGNORECASE
)


def mask_password(text: str) -> str:
    if not text:
        return text
    masked = _PASSWORD_PATTERN.sub("****@", text)
    masked = re.sub(
        r"(password|passwd|pwd|secret)(['\"]?\s*[:=]\s*['\"]?)([^'\"\s,;}]+)",
        r"\1\2****",
        masked,
        flags=re.IGNORECASE
    )
    return masked
