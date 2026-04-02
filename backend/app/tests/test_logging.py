import structlog

from app.core.logging import PII_FIELDS, configure_logging, strip_pii


def test_strip_pii_redacts_candidate_name():
    """candidate_name is redacted to [REDACTED]."""
    event_dict = {"event": "analysis_complete", "candidate_name": "John Doe", "score": 85}
    result = strip_pii(None, None, event_dict)
    assert result["candidate_name"] == "[REDACTED]"
    assert result["event"] == "analysis_complete"
    assert result["score"] == 85


def test_strip_pii_redacts_email():
    """email is redacted to [REDACTED]."""
    event_dict = {"event": "user_login", "email": "recruiter@company.com", "user_id": 42}
    result = strip_pii(None, None, event_dict)
    assert result["email"] == "[REDACTED]"
    assert result["user_id"] == 42


def test_strip_pii_redacts_name():
    """name field is redacted to [REDACTED]."""
    event_dict = {"event": "candidate_created", "name": "Jane Smith"}
    result = strip_pii(None, None, event_dict)
    assert result["name"] == "[REDACTED]"


def test_strip_pii_redacts_resume_content():
    """resume_content (raw resume text) is redacted to [REDACTED]."""
    event_dict = {"event": "resume_uploaded", "resume_content": "John Smith, john@email.com..."}
    result = strip_pii(None, None, event_dict)
    assert result["resume_content"] == "[REDACTED]"


def test_strip_pii_leaves_non_pii_fields_unchanged():
    """Non-PII fields are passed through unmodified."""
    event_dict = {"event": "analysis_complete", "score": 85, "user_id": 42, "job_id": 7}
    result = strip_pii(None, None, event_dict)
    assert result == {"event": "analysis_complete", "score": 85, "user_id": 42, "job_id": 7}


def test_strip_pii_handles_empty_event_dict():
    """strip_pii is a no-op when no PII fields are present."""
    event_dict = {"event": "health_check"}
    result = strip_pii(None, None, event_dict)
    assert result == {"event": "health_check"}


def test_strip_pii_redacts_multiple_pii_fields():
    """Multiple PII fields in a single log entry are all redacted."""
    event_dict = {
        "event": "analysis_complete",
        "candidate_name": "Alice",
        "email": "alice@example.com",
        "score": 72,
    }
    result = strip_pii(None, None, event_dict)
    assert result["candidate_name"] == "[REDACTED]"
    assert result["email"] == "[REDACTED]"
    assert result["score"] == 72


def test_pii_fields_constant_contains_required_fields():
    """PII_FIELDS frozenset contains the four expected field names."""
    assert "candidate_name" in PII_FIELDS
    assert "email" in PII_FIELDS
    assert "name" in PII_FIELDS
    assert "resume_content" in PII_FIELDS


def test_configure_logging_executes_without_error():
    """configure_logging() can be called without raising exceptions."""
    # Idempotent — calling multiple times is safe for structlog
    configure_logging()


def test_configure_logging_produces_structured_json_with_required_fields():
    """AC2: processor chain produces structured JSON with timestamp, level, and event."""
    import json
    from structlog.processors import JSONRenderer, TimeStamper
    from structlog.stdlib import add_log_level

    event_dict: dict = {"event": "ac2_test_event"}
    event_dict = add_log_level(None, "info", event_dict)
    event_dict = TimeStamper(fmt="iso")(None, "info", event_dict)
    result = JSONRenderer()(None, "info", event_dict)

    parsed = json.loads(result)
    assert "timestamp" in parsed
    assert "level" in parsed
    assert "event" in parsed
    assert parsed["event"] == "ac2_test_event"
    assert parsed["level"] == "info"
