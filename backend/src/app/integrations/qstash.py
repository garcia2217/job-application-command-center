from typing import Annotated

from fastapi import Header, Request
from qstash import Receiver
from qstash.errors import SignatureError

from app.dependencies import SettingsDep
from app.errors import JobSignatureError

_PLACEHOLDER = "REPLACE_ME"


async def verify_qstash_signature(
    request: Request,
    settings: SettingsDep,
    upstash_signature: Annotated[str | None, Header()] = None,
) -> None:
    """Route dependency for /jobs/*: only QStash may trigger jobs (no session)."""
    if not upstash_signature:
        raise JobSignatureError("Missing Upstash-Signature header")
    if _PLACEHOLDER in (
        settings.qstash_current_signing_key,
        settings.qstash_next_signing_key,
    ):
        raise JobSignatureError("QStash signing keys are not configured")
    receiver = Receiver(
        current_signing_key=settings.qstash_current_signing_key,
        next_signing_key=settings.qstash_next_signing_key,
    )
    body = (await request.body()).decode()
    try:
        receiver.verify(
            signature=upstash_signature,
            body=body,
            url=f"{settings.public_base_url}{request.url.path}",
        )
    except SignatureError as exc:
        raise JobSignatureError("Invalid QStash signature") from exc
