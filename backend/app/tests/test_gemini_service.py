from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.gemini_service import GeminiService, _sse_event

# A minimal valid AnalysisResult payload that passes Pydantic validation
VALID_GEMINI_PAYLOAD = {
    "score": 78.5,
    "ats_score": 82.0,
    "matched_keywords": ["Python", "FastAPI"],
    "missing_keywords": ["Kubernetes"],
    "jd_match": [
        {"skill": "Python", "present": True, "evidence": "5 years Python"},
        {"skill": "Kubernetes", "present": False, "evidence": None},
    ],
    "feedback": "Strong backend candidate with gaps in Kubernetes.",
    "reasoning": "The resume demonstrates Python depth...",
}


def _make_mock_response(text: str) -> MagicMock:
    """Create a mock Gemini response object with a .text attribute."""
    mock = MagicMock()
    mock.text = text
    return mock


@pytest.fixture
def mock_genai():
    """Patch google.generativeai so no real API calls are made."""
    with patch("app.services.gemini_service.genai") as mock:
        mock_model = MagicMock()
        mock.GenerativeModel.return_value = mock_model
        mock.GenerationConfig.return_value = MagicMock()
        yield mock, mock_model


async def test_stream_analysis_happy_path(mock_genai):
    """AC1: yields reasoning_step events then analysis_complete with valid data."""
    import json

    _, mock_model = mock_genai
    mock_model.generate_content_async = AsyncMock(
        return_value=_make_mock_response(json.dumps(VALID_GEMINI_PAYLOAD))
    )

    service = GeminiService()
    events = []
    async for event in service.stream_analysis("resume text", "jd text"):
        events.append(event)

    # Must have at least one reasoning_step before analysis_complete
    event_types = [e.split("\n")[0].replace("event: ", "") for e in events]
    assert "reasoning_step" in event_types
    assert event_types[-1] == "analysis_complete"

    # Validate the analysis_complete payload round-trips through AnalysisResult
    from app.schemas.analysis import AnalysisResult

    last_event = events[-1]
    data_line = [line for line in last_event.split("\n") if line.startswith("data:")][0]
    payload = json.loads(data_line[len("data: "):])
    result = AnalysisResult.model_validate(payload)
    assert result.score == 78.5
    assert result.ats_score == 82.0
    assert "Python" in result.matched_keywords


async def test_stream_analysis_malformed_json(mock_genai):
    """AC2: non-JSON Gemini response yields event: error, no exception propagates."""
    _, mock_model = mock_genai
    mock_model.generate_content_async = AsyncMock(
        return_value=_make_mock_response("This is not JSON at all.")
    )

    service = GeminiService()
    events = []
    async for event in service.stream_analysis("resume text", "jd text"):
        events.append(event)

    event_types = [e.split("\n")[0].replace("event: ", "") for e in events]
    assert "error" in event_types
    assert "analysis_complete" not in event_types


async def test_stream_analysis_validation_error(mock_genai):
    """AC2: valid JSON but missing required fields yields event: error."""
    import json

    _, mock_model = mock_genai
    mock_model.generate_content_async = AsyncMock(
        return_value=_make_mock_response(json.dumps({"score": 70}))  # incomplete
    )

    service = GeminiService()
    events = []
    async for event in service.stream_analysis("resume text", "jd text"):
        events.append(event)

    event_types = [e.split("\n")[0].replace("event: ", "") for e in events]
    assert "error" in event_types
    assert "analysis_complete" not in event_types


async def test_stream_analysis_gemini_api_exception(mock_genai):
    """AC3: Gemini API exception yields event: error, no exception propagates."""
    _, mock_model = mock_genai
    mock_model.generate_content_async = AsyncMock(
        side_effect=Exception("Quota exceeded")
    )

    service = GeminiService()
    events = []
    async for event in service.stream_analysis("resume text", "jd text"):
        events.append(event)

    event_types = [e.split("\n")[0].replace("event: ", "") for e in events]
    assert "error" in event_types
    # Confirm no propagation — simply collecting events without try/except is the test


async def test_api_key_from_settings(mock_genai):
    """AC4: GeminiService reads key from get_settings(), not hardcoded."""
    mock_genai_module, _ = mock_genai

    with patch("app.services.gemini_service.get_settings") as mock_settings:
        mock_settings.return_value.gemini_api_key = "test-key-xyz"
        GeminiService()
        mock_settings.assert_called_once()
        mock_genai_module.configure.assert_called_once_with(api_key="test-key-xyz")
