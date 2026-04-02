import json
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.base import Base
from app.models.candidate_note import CandidateNote  # noqa: F401 — register table
from app.models.job_description import JobDescription  # noqa: F401 — register table
from app.models.resume_analysis import ResumeAnalysis
from app.models.user import User  # noqa: F401 — register table

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

PDF_CONTENT_TYPE = "application/pdf"
FAKE_PDF_BYTES = b"%PDF-1.4 stub"

# Minimal valid AnalysisResult payload matching AnalysisResult Pydantic schema
MOCK_ANALYSIS_COMPLETE_PAYLOAD = {
    "score": 72.5,
    "ats_score": 85.0,
    "matched_keywords": ["Python", "FastAPI", "SQLAlchemy"],
    "missing_keywords": ["Kubernetes", "Docker Swarm"],
    "jd_match": [
        {"skill": "Python", "present": True, "evidence": "5 years Python experience"},
        {"skill": "Kubernetes", "present": False, "evidence": None},
    ],
    "feedback": "Strong Python backend skills. Missing container orchestration experience.",
    "reasoning": "Candidate demonstrates solid FastAPI and SQLAlchemy knowledge matching core JD requirements.",
}


def _make_reasoning_event(step: str, message: str) -> str:
    return f"event: reasoning_step\ndata: {json.dumps({'step': step, 'message': message})}\n\n"


def _make_complete_event(payload: dict) -> str:
    return f"event: analysis_complete\ndata: {json.dumps(payload)}\n\n"


def _make_error_event(message: str) -> str:
    return f"event: error\ndata: {json.dumps({'message': message})}\n\n"


async def _fake_stream_analysis(resume_text: str, jd_text: str):
    """Mock GeminiService.stream_analysis for happy-path tests."""
    yield _make_reasoning_event("initialising", "Initialising analysis engine...")
    yield _make_reasoning_event("skills_match", "Analysing skills match...")
    yield _make_complete_event(MOCK_ANALYSIS_COMPLETE_PAYLOAD)


async def _fake_stream_error(resume_text: str, jd_text: str):
    """Mock GeminiService.stream_analysis for error-path tests."""
    yield _make_reasoning_event("initialising", "Initialising analysis engine...")
    yield _make_error_event("Analysis failed. Please try again.")


@pytest.fixture
async def test_db():
    engine = create_async_engine(
        TEST_DATABASE_URL, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    async with session_factory() as session:
        yield session
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def client(test_db):
    async def override_get_db():
        yield test_db

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def recruiter_user(test_db):
    user = User(
        email="recruiter@example.com",
        hashed_password=hash_password("password"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def other_user(test_db):
    user = User(
        email="other@example.com",
        hashed_password=hash_password("password"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def saved_jd(test_db, recruiter_user):
    jd = JobDescription(
        title="Senior Python Engineer",
        content="We need an experienced Python developer with FastAPI and SQLAlchemy.",
        created_by=recruiter_user.id,
    )
    test_db.add(jd)
    await test_db.commit()
    await test_db.refresh(jd)
    return jd


@pytest.fixture
async def recruiter_analysis(test_db, recruiter_user, saved_jd):
    """Create a resume_analyses record with fake PDF bytes and a linked JD."""
    analysis = ResumeAnalysis(
        candidate_name="Jane Candidate",
        resume_blob=FAKE_PDF_BYTES,
        resume_filename="jane_cv.pdf",
        jd_id=saved_jd.id,
        created_by=recruiter_user.id,
    )
    test_db.add(analysis)
    await test_db.commit()
    await test_db.refresh(analysis)
    return analysis


def _auth_header(email: str = "recruiter@example.com", role: str = "recruiter") -> dict:
    token = create_access_token(subject=email, role=role)
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
# AC5: Unauthenticated → 401
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_unauthenticated_returns_401(client, recruiter_analysis):
    """AC5: No JWT → 401, no stream started."""
    response = await client.get(f"/analyses/stream/{recruiter_analysis.id}")
    assert response.status_code == 401


# ─────────────────────────────────────────────────────────────────────────────
# AC6: Non-existent analysis → 404
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_nonexistent_analysis_returns_404(client, recruiter_user):
    """AC6: analysis_id that does not exist → 404."""
    response = await client.get(
        "/analyses/stream/99999",
        headers=_auth_header(),
    )
    assert response.status_code == 404
    assert "Analysis not found" in response.json()["detail"]


# ─────────────────────────────────────────────────────────────────────────────
# AC4: Non-owner → 403
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_non_owner_returns_403(client, recruiter_analysis, other_user):
    """AC4: A different recruiter (not the owner) → 403."""
    response = await client.get(
        f"/analyses/stream/{recruiter_analysis.id}",
        headers=_auth_header(email="other@example.com", role="recruiter"),
    )
    assert response.status_code == 403
    assert "Access denied" in response.json()["detail"]


# ─────────────────────────────────────────────────────────────────────────────
# AC4 (admin exception): Admin can access any analysis
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_admin_can_access_any_analysis(
    client, test_db, recruiter_analysis
):
    """Admin role can stream analyses they did not create (Story 2.3 AC3)."""
    admin = User(
        email="admin@example.com",
        hashed_password=hash_password("adminpass"),
        role="admin",
    )
    test_db.add(admin)
    await test_db.commit()

    with (
        patch(
            "app.routers.analyses.GeminiService"
        ) as MockGemini,
        patch(
            "app.routers.analyses.extract_resume_text",
            return_value="Mocked resume text",
        ),
    ):
        mock_instance = MockGemini.return_value
        mock_instance.stream_analysis = _fake_stream_analysis

        response = await client.get(
            f"/analyses/stream/{recruiter_analysis.id}",
            headers=_auth_header(email="admin@example.com", role="admin"),
        )
    assert response.status_code == 200


# ─────────────────────────────────────────────────────────────────────────────
# AC1: Owner gets 200 with text/event-stream Content-Type
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_owner_gets_200_event_stream(client, recruiter_analysis):
    """AC1: Authenticated owner → 200 with text/event-stream content type."""
    with (
        patch(
            "app.routers.analyses.GeminiService"
        ) as MockGemini,
        patch(
            "app.routers.analyses.extract_resume_text",
            return_value="Mocked resume text",
        ),
    ):
        mock_instance = MockGemini.return_value
        mock_instance.stream_analysis = _fake_stream_analysis

        response = await client.get(
            f"/analyses/stream/{recruiter_analysis.id}",
            headers=_auth_header(),
        )

    assert response.status_code == 200
    assert "text/event-stream" in response.headers.get("content-type", "")


# ─────────────────────────────────────────────────────────────────────────────
# AC2: Events streamed in correct order (reasoning_step → analysis_complete)
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_events_in_correct_order(client, recruiter_analysis):
    """AC2: reasoning_step events arrive before analysis_complete."""
    with (
        patch(
            "app.routers.analyses.GeminiService"
        ) as MockGemini,
        patch(
            "app.routers.analyses.extract_resume_text",
            return_value="Mocked resume text",
        ),
    ):
        mock_instance = MockGemini.return_value
        mock_instance.stream_analysis = _fake_stream_analysis

        response = await client.get(
            f"/analyses/stream/{recruiter_analysis.id}",
            headers=_auth_header(),
        )

    assert response.status_code == 200
    body = response.text

    # Verify event ordering: all reasoning_step events precede analysis_complete
    reasoning_pos = body.find("event: reasoning_step")
    complete_pos = body.find("event: analysis_complete")
    assert reasoning_pos != -1, "No reasoning_step events found"
    assert complete_pos != -1, "No analysis_complete event found"
    assert reasoning_pos < complete_pos, "reasoning_step must precede analysis_complete"

    # Verify analysis_complete payload contains expected fields
    lines = body.split("\n")
    for i, line in enumerate(lines):
        if line == "event: analysis_complete":
            data_line = lines[i + 1]
            assert data_line.startswith("data: ")
            payload = json.loads(data_line[6:])
            assert "score" in payload
            assert "ats_score" in payload
            assert "matched_keywords" in payload
            assert "feedback" in payload
            assert "reasoning" in payload
            break


# ─────────────────────────────────────────────────────────────────────────────
# AC2: DB record updated on analysis_complete
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_updates_db_on_analysis_complete(
    client, recruiter_analysis, test_db
):
    """AC2: After analysis_complete, resume_analyses record has score/results populated."""
    with (
        patch(
            "app.routers.analyses.GeminiService"
        ) as MockGemini,
        patch(
            "app.routers.analyses.extract_resume_text",
            return_value="Mocked resume text",
        ),
        patch(
            "app.routers.analyses.AsyncSessionLocal",
        ) as MockSessionLocal,
    ):
        mock_instance = MockGemini.return_value
        mock_instance.stream_analysis = _fake_stream_analysis

        # Make AsyncSessionLocal() return the test_db session via async context manager
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__ = AsyncMock(return_value=test_db)
        mock_ctx.__aexit__ = AsyncMock(return_value=False)
        MockSessionLocal.return_value = mock_ctx

        response = await client.get(
            f"/analyses/stream/{recruiter_analysis.id}",
            headers=_auth_header(),
        )

    assert response.status_code == 200

    # Refresh from DB and verify result fields were persisted
    await test_db.refresh(recruiter_analysis)
    assert recruiter_analysis.score == MOCK_ANALYSIS_COMPLETE_PAYLOAD["score"]
    assert recruiter_analysis.ats_score == MOCK_ANALYSIS_COMPLETE_PAYLOAD["ats_score"]
    assert recruiter_analysis.feedback == MOCK_ANALYSIS_COMPLETE_PAYLOAD["feedback"]
    assert recruiter_analysis.reasoning == MOCK_ANALYSIS_COMPLETE_PAYLOAD["reasoning"]
    # matched_keywords stored as JSON string
    assert json.loads(recruiter_analysis.matched_keywords) == MOCK_ANALYSIS_COMPLETE_PAYLOAD["matched_keywords"]
    assert recruiter_analysis.matched_keywords is not None


# ─────────────────────────────────────────────────────────────────────────────
# AC3: Gemini error → event:error sent, no server crash
# ─────────────────────────────────────────────────────────────────────────────

async def test_stream_gemini_error_sends_error_event(client, recruiter_analysis):
    """AC3: When Gemini fails, event:error is yielded and connection closes cleanly."""
    with (
        patch(
            "app.routers.analyses.GeminiService"
        ) as MockGemini,
        patch(
            "app.routers.analyses.extract_resume_text",
            return_value="Mocked resume text",
        ),
    ):
        mock_instance = MockGemini.return_value
        mock_instance.stream_analysis = _fake_stream_error

        response = await client.get(
            f"/analyses/stream/{recruiter_analysis.id}",
            headers=_auth_header(),
        )

    assert response.status_code == 200  # HTTP 200 — errors are inside the SSE stream
    assert "event: error" in response.text
    assert "Analysis failed" in response.text
