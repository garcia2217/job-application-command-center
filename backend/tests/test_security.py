from app.security import (
    DUMMY_HASH,
    generate_session_token,
    hash_password,
    hash_session_token,
    verify_password,
)


async def test_password_roundtrip() -> None:
    hashed = await hash_password("correct horse")
    assert hashed != "correct horse"
    assert await verify_password("correct horse", hashed)
    assert not await verify_password("wrong", hashed)


async def test_dummy_hash_verifies_false() -> None:
    assert not await verify_password("anything", DUMMY_HASH)


def test_session_token_hashing() -> None:
    token = generate_session_token()
    assert len(token) >= 32
    digest = hash_session_token(token)
    assert digest == hash_session_token(token)
    assert len(digest) == 64
    assert digest != token
