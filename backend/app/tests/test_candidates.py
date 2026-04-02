import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.db.dependencies import get_db
from app.main import app
from app.models.base import Base
from app.models.candidate_note import CandidateNote  # noqa: F401 — register table
from app.models.job_description import JobDescription  # noqa: F401 — register table
from app.models.resume_analysis import ResumeAnalysis  # noqa: F401 — register table
from app.models.user import User  # noqa: F401 — register table

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


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
async def analysis(test_db, recruiter_user):
    """Create a bare-minimum ResumeAnalysis row for note tests."""
    row = ResumeAnalysis(
        candidate_name="Alice Smith",
        resume_blob=b"fake-pdf-bytes",
        resume_filename="alice.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
    )
    test_db.add(row)
    await test_db.commit()
    await test_db.refresh(row)
    return row


def _auth_header(email: str = "recruiter@example.com", role: str = "recruiter") -> dict:
    token = create_access_token(subject=email, role=role)
    return {"Authorization": f"Bearer {token}"}


# ── AC #2: POST /candidates/{analysis_id}/notes ──────────────────────────────

async def test_create_note_unauthenticated_returns_401(client, analysis):
    """AC #2: no JWT → 401."""
    response = await client.post(
        f"/candidates/{analysis.id}/notes",
        json={"content": "Strong backend skills"},
    )
    assert response.status_code == 401


async def test_create_note_wrong_role_returns_403(client, analysis):
    """AC #2: interviewer role → 403."""
    response = await client.post(
        f"/candidates/{analysis.id}/notes",
        json={"content": "Strong backend skills"},
        headers=_auth_header(role="interviewer"),
    )
    assert response.status_code == 403


async def test_create_note_returns_201(client, analysis, recruiter_user):
    """AC #2: valid recruiter + valid analysis → 201 with full note object."""
    response = await client.post(
        f"/candidates/{analysis.id}/notes",
        json={"content": "Strong backend, weak Kubernetes exposure"},
        headers=_auth_header(),
    )
    assert response.status_code == 201
    data = response.json()
    assert data["content"] == "Strong backend, weak Kubernetes exposure"
    assert data["analysis_id"] == analysis.id
    assert data["created_by"] == recruiter_user.id
    assert "id" in data
    assert "created_at" in data


async def test_create_note_unknown_analysis_returns_404(client, recruiter_user):
    """AC #2: analysis_id that doesn't exist → 404."""
    response = await client.post(
        "/candidates/9999/notes",
        json={"content": "Some note"},
        headers=_auth_header(),
    )
    assert response.status_code == 404


# ── AC #3: GET /candidates/{analysis_id}/notes ───────────────────────────────

async def test_list_notes_empty(client, analysis):
    """AC #3: no notes yet → {"items": [], "total": 0}."""
    response = await client.get(
        f"/candidates/{analysis.id}/notes",
        headers=_auth_header(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data == {"items": [], "total": 0}


async def test_list_notes_returns_chronological_order(client, analysis, test_db):
    """AC #3: two notes returned in chronological (created_at ASC) order."""
    from datetime import datetime, timezone

    note1 = CandidateNote(
        content="First note",
        analysis_id=analysis.id,
        created_by=analysis.created_by,
        created_at=datetime(2026, 3, 30, 10, 0, 0, tzinfo=timezone.utc),
    )
    note2 = CandidateNote(
        content="Second note",
        analysis_id=analysis.id,
        created_by=analysis.created_by,
        created_at=datetime(2026, 3, 30, 11, 0, 0, tzinfo=timezone.utc),
    )
    test_db.add_all([note1, note2])
    await test_db.commit()

    response = await client.get(
        f"/candidates/{analysis.id}/notes",
        headers=_auth_header(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert data["items"][0]["content"] == "First note"
    assert data["items"][1]["content"] == "Second note"


async def test_list_notes_unknown_analysis_returns_404(client, recruiter_user):
    """AC #3: analysis_id that doesn't exist → 404."""
    response = await client.get(
        "/candidates/9999/notes",
        headers=_auth_header(),
    )
    assert response.status_code == 404


# ── AC #4: PUT /candidates/{analysis_id}/notes/{note_id} ─────────────────────

async def test_update_note_returns_200(client, analysis, test_db):
    """AC #4: valid PUT with updated content → 200 with updated note."""
    note = CandidateNote(
        content="Original content",
        analysis_id=analysis.id,
        created_by=analysis.created_by,
    )
    test_db.add(note)
    await test_db.commit()
    await test_db.refresh(note)

    response = await client.put(
        f"/candidates/{analysis.id}/notes/{note.id}",
        json={"content": "Updated content"},
        headers=_auth_header(),
    )
    assert response.status_code == 200
    data = response.json()
    assert data["content"] == "Updated content"
    assert data["id"] == note.id


async def test_update_note_unknown_note_returns_404(client, analysis):
    """AC #4: note_id=9999 → 404."""
    response = await client.put(
        f"/candidates/{analysis.id}/notes/9999",
        json={"content": "Updated content"},
        headers=_auth_header(),
    )
    assert response.status_code == 404


async def test_update_note_wrong_analysis_returns_404(client, analysis, test_db, recruiter_user):
    """AC #4: note_id exists but with a different analysis_id → 404."""
    # Create a second analysis
    other_analysis = ResumeAnalysis(
        candidate_name="Bob Jones",
        resume_blob=b"fake",
        resume_filename="bob.pdf",
        is_shortlisted=False,
        created_by=recruiter_user.id,
    )
    test_db.add(other_analysis)
    await test_db.commit()
    await test_db.refresh(other_analysis)

    # Create note on the OTHER analysis
    note = CandidateNote(
        content="Note on other analysis",
        analysis_id=other_analysis.id,
        created_by=recruiter_user.id,
    )
    test_db.add(note)
    await test_db.commit()
    await test_db.refresh(note)

    # Try to update it via the FIRST analysis path → 404 (analysis/note mismatch)
    response = await client.put(
        f"/candidates/{analysis.id}/notes/{note.id}",
        json={"content": "Should fail"},
        headers=_auth_header(),
    )
    assert response.status_code == 404
