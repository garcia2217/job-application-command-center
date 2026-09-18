from typing import Protocol

import resend


class EmailSendError(Exception):
    """The provider rejected or could not deliver the message.

    The message is a short, safe summary suitable for a JobRun detail.
    """


class EmailSender(Protocol):
    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        """Send one message; returns the provider's message id."""
        ...


class ResendEmailSender:
    def __init__(self, api_key: str, from_address: str) -> None:
        resend.api_key = api_key  # the SDK is configured module-wide
        self.from_address = from_address

    async def send(self, *, to: str, subject: str, html: str, text: str) -> str:
        params: resend.Emails.SendParams = {
            "from": self.from_address,
            "to": [to],
            "subject": subject,
            "html": html,
            "text": text,
        }
        try:
            response = await resend.Emails.send_async(params)
        except Exception as exc:  # any SDK/HTTP failure becomes a recorded Failed run
            raise EmailSendError(f"{type(exc).__name__}: {exc}") from exc
        return response["id"]
