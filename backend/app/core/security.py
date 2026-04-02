from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, Header, HTTPException
from jose import JWTError, jwt
from jose.exceptions import ExpiredSignatureError

from app.core.config import get_settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt."""
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a bcrypt hash."""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(subject: str, role: str) -> str:
    """Create a signed JWT access token.

    Args:
        subject: The user's email address (stored as 'sub' claim).
        role: The user's role — 'admin', 'recruiter', or 'interviewer'.

    Returns:
        A signed JWT string valid for ACCESS_TOKEN_EXPIRE_MINUTES.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, get_settings().secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token.

    Args:
        token: The raw JWT string from the Authorization header or cookie.

    Returns:
        The decoded payload dict containing 'sub', 'role', 'exp'.

    Raises:
        HTTPException(401): If the token is expired, tampered, or invalid.
    """
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=[ALGORITHM])
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")


async def get_current_user(
    authorization: str | None = Header(default=None),
) -> dict:
    """FastAPI dependency: extract and validate JWT from Authorization header.

    Usage in routers:
        @router.get("/some-endpoint")
        async def handler(user: dict = Depends(get_current_user)):
            # user contains {"sub": "email@example.com", "role": "recruiter", "exp": ...}

    Raises:
        HTTPException(401): If Authorization header is missing, malformed, or token invalid/expired.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    return decode_access_token(token)  # raises 401 if expired or invalid


def require_role(*allowed_roles: str):
    """FastAPI dependency factory for role-based access control.

    Admin always has full access to all protected routes (bypasses role restriction).
    Other roles must match one of the allowed_roles exactly.

    Usage:
        @router.get("/admin-only")
        async def handler(user: dict = Depends(require_role("admin"))):
            ...

        @router.get("/recruiters-and-admins")
        async def handler(user: dict = Depends(require_role("recruiter"))):
            ...

    Raises:
        HTTPException(403): If the user's role is not permitted.
    """
    async def role_checker(user: dict = Depends(get_current_user)) -> dict:
        role = user.get("role", "")
        if role in allowed_roles or role == "admin":
            return user
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    return role_checker
