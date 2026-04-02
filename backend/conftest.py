import os


def pytest_configure(config: object) -> None:
    """Set required env vars before test collection so Settings() can instantiate.

    Uses setdefault so actual .env values or CI-injected secrets take precedence.
    These test values must NEVER be used in production.
    """
    os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-for-pytest-only")
    os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-xx")
    os.environ.setdefault("ADMIN_EMAIL", "seed-admin@test.example.com")
    os.environ.setdefault("ADMIN_PASSWORD", "test-admin-password")
