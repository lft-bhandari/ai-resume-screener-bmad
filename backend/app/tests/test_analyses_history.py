"""Tests for GET /analyses (list), GET /analyses/{id} (detail),
and PATCH /candidates/{id}/shortlist endpoints (Story 5.2).
"""

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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


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
async def other_recruiter_user(test_db):
    user = User(
        email="other_recruiter@example.com",
        hashed_password=hash_password("password"),
        role="recruiter",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def interviewer_user(test_db):
    user = User(
        email="interviewer@example.com",
        hashed_password=hash_password("password"),
        role="interviewer",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def admin_user(test_db):
    user = User(
        email="admin@example.com",
        hashed_password=hash_password("password"),
        role="admin",
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def jd(test_db, recruiter_user):
    job = JobDescription(
        title="Python Dev",
        content="Looking for a Python developer.",
        created_by=recruiter_user.id,
    )
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)
    return job


@pytest.fixture
async def analysis(test_db, recruiter_user, jd):
    row = ResumeAnalysis(
        candidate_name="Alice Smith",
        resume_blob=b"fake-pdf-bytes",
        resume_filename="alice.pdf",
        is_shortlisted=False,
        jd_id=jd.id,
        created_by=recruiter_user.id,
        matched_keywords='["python", "fastapi"]',
        jd_match='[]',
        feedback="Good candidate",
        reasoning="Strong Python background",
    )
    test_db.add(row)
    await test_db.commit()
    await test_db.refresh(row)
    return row


@pytest.fixture
async def shortlisted_analysis(test_db, recruiter_user, jd):
    row = ResumeAnalysis(
        candidate_name="Bob Jones",
        resume_blob=b"fake-pdf-bytes-2",
        resume_filename="bob.pdf",
        is_shortlisted=True,
        jd_id=jd.id,
        created_by=recruiter_user.id,
    )
    test_db.add(row)
    await test_db.commit()
    await test_db.refresh(row)
    return row


def _auth(email: str, role: str) -> dict:
    token = create_access_token(subject=email, role=role)
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# PATCH /candidates/{analysis_id}/shortlist  (AC: #1)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_shortlist_toggle_unauthenticated_returns_401(client, analysis):
    resp = await client.patch(
        f"/candidates/{analysis.id}/shortlist",
        json={"is_shortlisted": True},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_shortlist_toggle_wrong_role_returns_403(client, analysis, interviewer_user):
    resp = await client.patch(
        f"/candidates/{analysis.id}/shortlist",
        json={"is_shortlisted": True},
        headers=_auth(interviewer_user.email, "interviewer"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_shortlist_toggle_returns_200_with_updated_flag(client, analysis, recruiter_user, test_db):
    resp = await client.patch(
        f"/candidates/{analysis.id}/shortlist",
        json={"is_shortlisted": True},
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_shortlisted"] is True
    assert data["id"] == analysis.id

    # Verify DB was updated
    await test_db.refresh(analysis)
    assert analysis.is_shortlisted is True


@pytest.mark.asyncio
async def test_shortlist_toggle_unshortlist_returns_200(client, shortlisted_analysis, recruiter_user, test_db):
    resp = await client.patch(
        f"/candidates/{shortlisted_analysis.id}/shortlist",
        json={"is_shortlisted": False},
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    assert resp.json()["is_shortlisted"] is False

    await test_db.refresh(shortlisted_analysis)
    assert shortlisted_analysis.is_shortlisted is False


@pytest.mark.asyncio
async def test_shortlist_toggle_other_recruiter_returns_403(
    client, analysis, other_recruiter_user
):
    resp = await client.patch(
        f"/candidates/{analysis.id}/shortlist",
        json={"is_shortlisted": True},
        headers=_auth(other_recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_shortlist_toggle_unknown_analysis_returns_404(client, recruiter_user):
    resp = await client.patch(
        "/candidates/9999/shortlist",
        json={"is_shortlisted": True},
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# GET /analyses  (AC: #2, #3)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_analyses_unauthenticated_returns_401(client):
    resp = await client.get("/analyses")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_analyses_returns_recruiter_own_analyses(
    client, analysis, recruiter_user, jd
):
    resp = await client.get(
        "/analyses",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["id"] == analysis.id
    assert item["candidate_name"] == "Alice Smith"
    assert item["jd_title"] == jd.title


@pytest.mark.asyncio
async def test_list_analyses_ordered_by_created_at_desc(
    client, analysis, shortlisted_analysis, recruiter_user
):
    resp = await client.get(
        "/analyses",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 2
    # Newest first — shortlisted_analysis was created later
    assert items[0]["id"] == shortlisted_analysis.id
    assert items[1]["id"] == analysis.id


@pytest.mark.asyncio
async def test_list_analyses_shortlisted_filter(
    client, analysis, shortlisted_analysis, recruiter_user
):
    resp = await client.get(
        "/analyses?shortlisted=true",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["is_shortlisted"] is True


@pytest.mark.asyncio
async def test_list_analyses_interviewer_sees_only_shortlisted(
    client, analysis, shortlisted_analysis, interviewer_user
):
    resp = await client.get(
        "/analyses",
        headers=_auth(interviewer_user.email, "interviewer"),
    )
    assert resp.status_code == 200
    data = resp.json()
    # Only the shortlisted analysis should be visible
    assert data["total"] == 1
    assert data["items"][0]["is_shortlisted"] is True


@pytest.mark.asyncio
async def test_list_analyses_admin_sees_all(
    client, analysis, shortlisted_analysis, admin_user
):
    resp = await client.get(
        "/analyses",
        headers=_auth(admin_user.email, "admin"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2


# ---------------------------------------------------------------------------
# GET /analyses/{id}  (AC: #4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_analysis_detail_unauthenticated_returns_401(client, analysis):
    resp = await client.get(f"/analyses/{analysis.id}")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_analysis_detail_returns_full_record(client, analysis, recruiter_user):
    resp = await client.get(
        f"/analyses/{analysis.id}",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == analysis.id
    assert data["matched_keywords"] == '["python", "fastapi"]'
    assert data["feedback"] == "Good candidate"
    assert data["reasoning"] == "Strong Python background"
    assert "notes" in data


@pytest.mark.asyncio
async def test_get_analysis_detail_includes_notes(client, analysis, recruiter_user, test_db):
    # Add two notes with slight order difference
    note1 = CandidateNote(
        content="First note",
        analysis_id=analysis.id,
        created_by=recruiter_user.id,
    )
    note2 = CandidateNote(
        content="Second note",
        analysis_id=analysis.id,
        created_by=recruiter_user.id,
    )
    test_db.add(note1)
    await test_db.flush()
    test_db.add(note2)
    await test_db.commit()

    resp = await client.get(
        f"/analyses/{analysis.id}",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 200
    notes = resp.json()["notes"]
    assert len(notes) == 2
    assert notes[0]["content"] == "First note"
    assert notes[1]["content"] == "Second note"


@pytest.mark.asyncio
async def test_get_analysis_detail_unknown_analysis_returns_404(client, recruiter_user):
    resp = await client.get(
        "/analyses/9999",
        headers=_auth(recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_analysis_detail_other_recruiter_returns_403(
    client, analysis, other_recruiter_user
):
    resp = await client.get(
        f"/analyses/{analysis.id}",
        headers=_auth(other_recruiter_user.email, "recruiter"),
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_get_analysis_detail_admin_can_view_any(client, analysis, admin_user):
    resp = await client.get(
        f"/analyses/{analysis.id}",
        headers=_auth(admin_user.email, "admin"),
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == analysis.id


@pytest.mark.asyncio
async def test_get_analysis_detail_interviewer_can_view_shortlisted(
    client, shortlisted_analysis, interviewer_user
):
    resp = await client.get(
        f"/analyses/{shortlisted_analysis.id}",
        headers=_auth(interviewer_user.email, "interviewer"),
    )
    assert resp.status_code == 200
    assert resp.json()["is_shortlisted"] is True


@pytest.mark.asyncio
async def test_get_analysis_detail_interviewer_cannot_view_non_shortlisted(
    client, analysis, interviewer_user
):
    resp = await client.get(
        f"/analyses/{analysis.id}",
        headers=_auth(interviewer_user.email, "interviewer"),
    )
    assert resp.status_code == 403
