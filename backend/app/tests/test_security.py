from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from jose import jwt

from app.core.security import (
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.core.config import get_settings


def test_hash_password_returns_non_plaintext():
    """hash_password() returns a bcrypt hash, not the original string."""
    hashed = hash_password("mysecret")
    assert hashed != "mysecret"
    assert len(hashed) > 0


def test_verify_password_correct():
    """verify_password() returns True when plain matches the hash."""
    hashed = hash_password("mysecret")
    assert verify_password("mysecret", hashed) is True


def test_verify_password_incorrect():
    """verify_password() returns False when plain does NOT match the hash."""
    hashed = hash_password("mysecret")
    assert verify_password("wrongpassword", hashed) is False


def test_create_access_token_returns_jwt_string():
    """create_access_token() returns a non-empty string with two dots (JWT format)."""
    token = create_access_token(subject="test@example.com", role="recruiter")
    assert isinstance(token, str)
    assert token.count(".") == 2  # JWT has 3 parts separated by 2 dots


def test_create_access_token_sub_claim():
    """Decoded token contains 'sub' equal to the subject passed."""
    token = create_access_token(subject="user@example.com", role="admin")
    payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    assert payload["sub"] == "user@example.com"


def test_create_access_token_role_claim():
    """Decoded token contains 'role' equal to the role passed."""
    token = create_access_token(subject="user@example.com", role="interviewer")
    payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    assert payload["role"] == "interviewer"


def test_create_access_token_expiry():
    """Decoded token 'exp' is approximately ACCESS_TOKEN_EXPIRE_MINUTES from now."""
    before = datetime.now(timezone.utc)
    token = create_access_token(subject="user@example.com", role="recruiter")
    payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    expected_exp = before + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    # Allow ±5 seconds clock skew
    assert abs((exp - expected_exp).total_seconds()) < 5


def test_decode_access_token_expired_raises_401():
    """decode_access_token() raises HTTPException(401) for an expired token."""
    expired_payload = {
        "sub": "user@example.com",
        "role": "recruiter",
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    }
    expired_token = jwt.encode(
        expired_payload, get_settings().secret_key, algorithm=ALGORITHM
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(expired_token)
    assert exc_info.value.status_code == 401


def test_decode_access_token_tampered_raises_401():
    """decode_access_token() raises HTTPException(401) for a tampered token."""
    token = create_access_token(subject="user@example.com", role="recruiter")
    tampered = token[:-5] + "XXXXX"  # corrupt the signature
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(tampered)
    assert exc_info.value.status_code == 401
