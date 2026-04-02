# Auth router — explicitly excluded from the get_current_user guard convention (Story 2.3 AC4).
# All other routers in app/routers/ MUST apply Depends(get_current_user) on every handler.
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, decode_access_token
from app.db.dependencies import get_db
from app.schemas.auth import LoginRequest, TokenResponse, UserMeResponse
from app.services.auth_service import authenticate_user

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return a JWT access token."""
    user = await authenticate_user(db, request.email, request.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(subject=user.email, role=user.role)
    return TokenResponse(access_token=token, role=user.role)


@router.post("/logout")
async def logout():
    """Log out the user. JWT is stateless — client discards the token."""
    return {"message": "Logged out"}


@router.get("/me", response_model=UserMeResponse)
async def me(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Return the current user's email and role from the JWT.

    Reads the token from the Authorization header: 'Bearer <token>'
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    payload = decode_access_token(token)
    email = payload.get("sub")
    role = payload.get("role")
    if not email or not role:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return UserMeResponse(email=email, role=role)
