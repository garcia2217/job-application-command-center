import hashlib
import secrets

from fastapi.concurrency import run_in_threadpool
from pwdlib import PasswordHash

password_hash = PasswordHash.recommended()  # Argon2id

# Verified when the email is unknown, so unknown-email and wrong-password
# take similar time (no user enumeration by timing).
DUMMY_HASH = password_hash.hash("dummy-password-for-timing")


async def hash_password(password: str) -> str:
    return await run_in_threadpool(password_hash.hash, password)


async def verify_password(password: str, hashed: str) -> bool:
    return await run_in_threadpool(password_hash.verify, password, hashed)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    # Sessions are stored hashed so a DB leak doesn't expose live sessions.
    return hashlib.sha256(token.encode()).hexdigest()
