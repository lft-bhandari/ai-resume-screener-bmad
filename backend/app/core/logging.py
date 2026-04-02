import structlog

# PII fields that must never appear in log output (NFR-S6)
PII_FIELDS: frozenset[str] = frozenset(
    {"candidate_name", "email", "name", "resume_content"}
)


def strip_pii(
    logger: object, method: str, event_dict: dict
) -> dict:
    """Structlog processor: redact known PII fields from all log entries.

    Enforces NFR-S6: Candidate PII must not be logged in application logs.
    """
    for field in PII_FIELDS:
        if field in event_dict:
            event_dict[field] = "[REDACTED]"
    return event_dict


def configure_logging() -> None:
    """Configure structlog for structured JSON output with PII stripping.

    Must be called once at application startup (module level in main.py),
    before any logging calls occur.
    """
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            strip_pii,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
    )
