from functools import lru_cache

from pydantic import EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Required — no defaults; missing values raise ValidationError at startup
    gemini_api_key: str = Field(..., min_length=1, description="Google Gemini API key")
    secret_key: str = Field(..., min_length=32, description="JWT signing secret key (HS256 requires ≥32 chars)")

    # Optional with defaults
    database_url: str = Field(
        default="sqlite+aiosqlite:///./app.db",
        description="Async SQLAlchemy database URL",
    )
    retention_days: int = Field(
        default=90,
        gt=0,
        description="Candidate data retention period in days (GDPR)",
    )
    admin_email: EmailStr = Field(
        default="admin@example.com",
        description="Default admin user email seeded on first run",
    )
    admin_password: str = Field(
        default="changeme",
        min_length=1,
        description="Default admin user password (hashed before storage)",
    )


@lru_cache
def get_settings() -> Settings:
    """Return the cached Settings singleton. Fails fast if required env vars are absent."""
    return Settings()
