# Resume Analysis Platform

An AI-powered resume screening tool built with FastAPI, React, and Google Gemini. Upload resumes against job descriptions and get structured analysis with real-time streaming results.

## Features

- JWT authentication with role-based access (admin / user)
- Job Description CRUD
- Resume upload (PDF / DOCX) → Google Gemini structured analysis with SSE streaming
- Candidate shortlisting and notes
- Analysis history
- Admin panel for user management
- Automatic GDPR data-retention purge (configurable)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic, SQLite |
| AI | Google Gemini API (`google-generativeai`) |
| Auth | JWT (`python-jose`) + bcrypt (`passlib`) |
| Frontend | React 19, TypeScript, Vite, TailwindCSS, shadcn/ui |
| Data fetching | TanStack React Query v5, `@microsoft/fetch-event-source` |
| Containers | Docker Compose, Nginx (frontend) |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2
- A **Google Gemini API key** — get one from [Google AI Studio](https://aistudio.google.com/)

For local development without Docker:
- Python 3.11+ with [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- Node.js 20+

---

## Quick Start (Docker Compose)

```bash
# 1. Clone and enter the project
git clone <repo-url>
cd bmad_evaluation_two

# 2. Configure environment variables
cp .env.example .env
# Edit .env and set GEMINI_API_KEY and SECRET_KEY (see Environment Variables below)

# 3. Build and start all services
docker compose up --build
```

On first start, migrations run automatically and an admin user is seeded.

| Service | URL |
|---|---|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |

Default admin credentials (override in `.env`):
- **Email:** `admin@example.com`
- **Password:** `changeme`

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Google AI Studio API key |
| `SECRET_KEY` | **Yes** | — | JWT signing secret (min 32 characters) |
| `DATABASE_URL` | No | `sqlite+aiosqlite:///./app.db` | Docker overrides this to `/data/app.db` |
| `RETENTION_DAYS` | No | `90` | Days before analyses are purged (GDPR) |
| `ADMIN_EMAIL` | No | `admin@example.com` | Seed admin email |
| `ADMIN_PASSWORD` | No | `changeme` | Seed admin password |

> **Security:** Generate a strong `SECRET_KEY` with `openssl rand -hex 32` and change `ADMIN_PASSWORD` before deploying.

---

## Local Development (without Docker)

### Backend

```bash
cd backend

# Install dependencies (creates a virtual environment automatically)
uv sync

# Copy and configure environment
cp .env.example .env
# Set GEMINI_API_KEY and SECRET_KEY in .env

# Run database migrations
uv run alembic upgrade head

# Start the development server
uv run uvicorn app.main:app --reload --port 8000
```

API available at http://localhost:8000  
Interactive docs at http://localhost:8000/docs

### Frontend

```bash
cd frontend

# Install dependencies
npm ci

# Start the dev server (proxies /api to http://localhost:8000)
npm run dev
```

Frontend available at http://localhost:5173

---

## Running Tests

### Backend

```bash
cd backend
uv run pytest
```

Test environment variables are set automatically by `conftest.py` — no `.env` file required.

### Frontend

```bash
cd frontend

npm test          # headless (Vitest)
npm run test:ui   # Vitest browser UI
```

---

## Project Structure

```
.
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI app entry point
│   │   ├── models/          # SQLAlchemy models
│   │   ├── routers/         # API route handlers
│   │   ├── schemas/         # Pydantic schemas
│   │   └── services/        # Business logic (Gemini, auth, etc.)
│   ├── alembic/             # Database migrations
│   ├── pyproject.toml
│   └── Dockerfile
└── frontend/
    ├── src/
    │   ├── components/      # React components
    │   ├── pages/           # Route-level pages
    │   ├── hooks/           # Custom hooks (React Query)
    │   └── lib/             # Utilities and API client
    ├── package.json
    └── Dockerfile
```

---

## API Overview

| Prefix | Description |
|---|---|
| `POST /auth/login` | Obtain JWT token |
| `POST /auth/logout` | Invalidate session |
| `/job_descriptions` | CRUD for job descriptions |
| `/analyses` | Resume upload, AI analysis, SSE stream |
| `/candidates` | Candidate management and shortlisting |
| `/users` | User management (admin only) |
| `GET /health` | Health check |

Full interactive documentation: http://localhost:8000/docs

---

## Data Persistence

SQLite database is stored in a Docker named volume (`sqlite_data`) so data survives container restarts. To reset:

```bash
docker compose down -v   # removes the volume — all data will be lost
docker compose up --build
```
