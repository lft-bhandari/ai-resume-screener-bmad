FROM python:3.11-slim

WORKDIR /app

# Install uv (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Use the system Python 3.11 from the base image; ignore .python-version (which pins 3.14)
ENV UV_PYTHON=python3.11 \
    UV_PYTHON_PREFERENCE=only-system

# Copy dependency manifests first for layer caching
COPY pyproject.toml uv.lock ./

# Install production dependencies only (no dev)
RUN uv sync --frozen --no-dev

# Copy application source
COPY . .

EXPOSE 8000

# Run Alembic migrations then start uvicorn
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]
