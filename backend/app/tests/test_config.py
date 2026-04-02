import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Clear lru_cache before and after each test for isolation."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_get_settings_returns_settings_instance():
    """get_settings() returns a Settings object (env vars set by conftest)."""
    settings = get_settings()
    assert isinstance(settings, Settings)


def test_get_settings_is_cached():
    """get_settings() returns the same cached instance on repeated calls."""
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2


def test_settings_database_url_default():
    """DATABASE_URL defaults to SQLite when not explicitly set."""
    settings = get_settings()
    assert settings.database_url == "sqlite+aiosqlite:///./app.db"


def test_settings_retention_days_default():
    """RETENTION_DAYS defaults to 90 when not explicitly set."""
    settings = get_settings()
    assert settings.retention_days == 90


def test_settings_fails_without_gemini_api_key(monkeypatch):
    """Settings raises ValidationError when GEMINI_API_KEY is absent."""
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, secret_key="test-secret")
    assert "gemini_api_key" in str(exc_info.value).lower()


def test_settings_fails_without_secret_key(monkeypatch):
    """Settings raises ValidationError when SECRET_KEY is absent."""
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None, gemini_api_key="test-key")
    assert "secret_key" in str(exc_info.value).lower()


def test_settings_accepts_custom_database_url(monkeypatch):
    """DATABASE_URL can be overridden via environment variable."""
    custom_url = "sqlite+aiosqlite:///./custom_test.db"
    monkeypatch.setenv("DATABASE_URL", custom_url)
    settings = Settings(_env_file=None, gemini_api_key="test-key", secret_key="test-secret-key-for-config-test-xx")
    assert settings.database_url == custom_url


def test_settings_accepts_custom_retention_days(monkeypatch):
    """RETENTION_DAYS can be overridden and is cast to int."""
    monkeypatch.setenv("RETENTION_DAYS", "30")
    settings = Settings(_env_file=None, gemini_api_key="test-key", secret_key="test-secret-key-for-config-test-xx")
    assert settings.retention_days == 30
    assert isinstance(settings.retention_days, int)
