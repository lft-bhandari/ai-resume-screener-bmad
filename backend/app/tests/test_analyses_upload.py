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

# Minimal valid PDF bytes (magic bytes only — no text extraction in this story)
FAKE_PDF_BYTES = b"%PDF-1.4 stub content"
FAKE_DOCX_BYTES = b"PK\x03\x04stub-docx-content"  # DOCX is a zip file; PK magic bytes

PDF_CONTENT_TYPE = "application/pdf"
DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)


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
async def saved_jd(test_db, recruiter_user):
    jd = JobDescription(
        title="Senior Python Engineer",
        content="We need an expert Python developer with FastAPI experience.",
        created_by=recruiter_user.id,
    )
    test_db.add(jd)
    await test_db.commit()
    await test_db.refresh(jd)
    return jd


def _auth_header(email: str = "recruiter@example.com", role: str = "recruiter") -> dict:
    token = create_access_token(subject=email, role=role)
    return {"Authorization": f"Bearer {token}"}


# ──────────────────────────────────────────────────────────────────────────────
# AC #6: Unauthenticated request → 401
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_unauthenticated(client):
    """AC6: No JWT → 401, no record stored."""
    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={"candidate_name": "Jane Doe", "jd_content": "Looking for Python dev"},
    )
    assert response.status_code == 401


# ──────────────────────────────────────────────────────────────────────────────
# AC #2: Invalid file type → 422
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_invalid_extension_returns_422(client, recruiter_user):
    """AC2: .txt file → 422, no record created."""
    response = await client.post(
        "/analyses",
        files={"resume": ("cv.txt", b"plain text", "text/plain")},
        data={"candidate_name": "Jane Doe", "jd_content": "Some JD"},
        headers=_auth_header(),
    )
    assert response.status_code == 422
    assert "Unsupported file type" in response.json()["detail"]


async def test_initiate_analysis_wrong_content_type_returns_422(client, recruiter_user):
    """AC2: .pdf extension but wrong content-type → 422."""
    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, "text/plain")},
        data={"candidate_name": "Jane Doe", "jd_content": "Some JD"},
        headers=_auth_header(),
    )
    assert response.status_code == 422


# ──────────────────────────────────────────────────────────────────────────────
# AC #5: Neither jd_id nor jd_content → 422
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_no_jd_source_returns_422(client, recruiter_user):
    """AC5: No jd_id and no jd_content → 422."""
    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={"candidate_name": "Jane Doe"},
        headers=_auth_header(),
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "jd_id" in detail or "jd_content" in detail


# ──────────────────────────────────────────────────────────────────────────────
# AC #5: jd_id does not exist → 404
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_jd_id_not_found_returns_404(client, recruiter_user):
    """AC5: jd_id points to non-existent JD → 404."""
    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={"candidate_name": "Jane Doe", "jd_id": "9999"},
        headers=_auth_header(),
    )
    assert response.status_code == 404
    assert "Job description not found" in response.json()["detail"]


# ──────────────────────────────────────────────────────────────────────────────
# AC #1: Happy path — PDF + existing jd_id → 202
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_pdf_with_jd_id_returns_202(
    client, recruiter_user, saved_jd
):
    """AC1: Valid PDF + existing jd_id → 202 with analysis_id and status."""
    response = await client.post(
        "/analyses",
        files={"resume": ("jane_cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={"candidate_name": "Jane Doe", "jd_id": str(saved_jd.id)},
        headers=_auth_header(),
    )
    assert response.status_code == 202
    data = response.json()
    assert "analysis_id" in data
    assert isinstance(data["analysis_id"], int)
    assert data["status"] == "processing"


# ──────────────────────────────────────────────────────────────────────────────
# AC #1 + DOCX: Valid DOCX + inline jd_content → 202
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_docx_with_inline_jd_returns_202(client, recruiter_user):
    """AC1: Valid DOCX + jd_content (no save) → 202 with analysis_id."""
    response = await client.post(
        "/analyses",
        files={"resume": ("john_cv.docx", FAKE_DOCX_BYTES, DOCX_CONTENT_TYPE)},
        data={
            "candidate_name": "John Smith",
            "jd_content": "Looking for a Python developer with FastAPI expertise.",
        },
        headers=_auth_header(),
    )
    assert response.status_code == 202
    data = response.json()
    assert "analysis_id" in data
    assert data["status"] == "processing"


# ──────────────────────────────────────────────────────────────────────────────
# AC #3: jd_content + save_jd=true + jd_title → JD record created + linked
# ──────────────────────────────────────────────────────────────────────────────

async def test_initiate_analysis_saves_jd_when_requested(client, recruiter_user, test_db):
    """AC3: save_jd=True + jd_title → new job_descriptions record created and linked."""
    from sqlalchemy import select

    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={
            "candidate_name": "Alice Engineer",
            "jd_content": "Senior backend engineer needed with SQLAlchemy and FastAPI skills.",
            "jd_title": "Senior Backend Engineer",
            "save_jd": "true",
        },
        headers=_auth_header(),
    )
    assert response.status_code == 202
    analysis_id = response.json()["analysis_id"]

    # Verify the analysis record exists with a linked jd_id
    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one()
    assert analysis.jd_id is not None

    # Verify the JD was created with the supplied title
    jd_result = await test_db.execute(
        select(JobDescription).where(JobDescription.id == analysis.jd_id)
    )
    jd = jd_result.scalar_one()
    assert jd.title == "Senior Backend Engineer"
    assert "FastAPI" in jd.content


# ──────────────────────────────────────────────────────────────────────────────
# AC #4: jd_content without save_jd → ad-hoc JD still created (needed for 4.4)
# ──────────────────────────────────────────────────────────────────────────────

async def test_inline_jd_without_save_creates_ad_hoc_jd(client, recruiter_user, test_db):
    """AC4: jd_content + save_jd=False → ad-hoc JD created and linked to analysis."""
    from sqlalchemy import select

    response = await client.post(
        "/analyses",
        files={"resume": ("cv.pdf", FAKE_PDF_BYTES, PDF_CONTENT_TYPE)},
        data={
            "candidate_name": "Bob Candidate",
            "jd_content": "Need a DevOps engineer with Kubernetes experience.",
        },
        headers=_auth_header(),
    )
    assert response.status_code == 202
    analysis_id = response.json()["analysis_id"]

    result = await test_db.execute(
        select(ResumeAnalysis).where(ResumeAnalysis.id == analysis_id)
    )
    analysis = result.scalar_one()
    # jd_id must be set (ad-hoc JD was created) so Story 4.4 can retrieve JD text
    assert analysis.jd_id is not None

    jd_result = await test_db.execute(
        select(JobDescription).where(JobDescription.id == analysis.jd_id)
    )
    jd = jd_result.scalar_one()
    assert jd.title == "Ad-hoc Analysis JD"
