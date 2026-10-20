"""
FOMS AI Layer — Immutable Audit Logger (§21).

Two logging channels:
1. Database (ai_audit_events table) — primary, immutable, append-only.
2. File-based JSON logs — secondary backup with rotation and retention.

Audit logs must NEVER be updated or deleted through application endpoints.
"""
import os
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# ── Configuration via environment variables ──────────────────────────────
AUDIT_RETENTION_YEARS = int(os.getenv("AUDIT_RETENTION_YEARS", "5"))
LOG_ROTATION_MAX_SIZE_MB = int(os.getenv("LOG_ROTATION_MAX_SIZE_MB", "100"))
LOG_ROTATION_DAILY = os.getenv("LOG_ROTATION_DAILY", "true").lower() == "true"

# Base audit log directory (create if missing)
BASE_LOG_DIR = Path(os.getenv("AUDIT_LOG_DIR", "logs"))
BASE_LOG_DIR.mkdir(parents=True, exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════
# §21 PRIMARY: Database-backed immutable audit logging
# ══════════════════════════════════════════════════════════════════════════

def log_audit_event_to_db(
    event_type: str,
    action_description: str,
    result: str = "SUCCESS",
    user_id: Optional[str] = None,
    full_name: Optional[str] = None,
    role_name: Optional[str] = None,
    related_record_type: Optional[str] = None,
    source_reference: Optional[str] = None,
    normalized_reference: Optional[str] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    correlation_id: Optional[str] = None,
) -> Optional[str]:
    """
    Write an immutable audit event to the ai_audit_events PostgreSQL table.

    This function is append-only — there is NO update or delete endpoint.
    Returns the event_id (UUID) on success, None on failure.
    """
    event_id = str(uuid.uuid4())
    try:
        from app.models.database import SessionLocal
        db = SessionLocal()
        try:
            from sqlalchemy import text
            db.execute(
                text("""
                    INSERT INTO ai_audit_events (
                        event_id, occurred_at, user_id, full_name, role_name,
                        event_type, action_description, related_record_type,
                        source_reference, normalized_reference, result,
                        ip_address, user_agent, details, correlation_id
                    ) VALUES (
                        :event_id, :occurred_at, :user_id, :full_name, :role_name,
                        :event_type, :action_description, :related_record_type,
                        :source_reference, :normalized_reference, :result,
                        :ip_address, :user_agent, :details, :correlation_id
                    )
                """),
                {
                    "event_id": event_id,
                    "occurred_at": datetime.now(timezone.utc),
                    "user_id": user_id,
                    "full_name": full_name,
                    "role_name": role_name,
                    "event_type": event_type,
                    "action_description": action_description,
                    "related_record_type": related_record_type,
                    "source_reference": source_reference,
                    "normalized_reference": normalized_reference,
                    "result": result,
                    "ip_address": ip_address,
                    "user_agent": user_agent,
                    "details": json.dumps(details) if details else None,
                    "correlation_id": correlation_id or str(uuid.uuid4()),
                }
            )
            db.commit()
            return event_id
        except Exception as e:
            db.rollback()
            logger.error(f"Failed to write audit event to DB: {e}")
            return None
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Failed to obtain DB session for audit: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════════
# SECONDARY: File-based JSON audit logging (backup)
# ══════════════════════════════════════════════════════════════════════════

def _current_log_path() -> Path:
    """Return the Path for the current audit log file.
    Daily rotation uses YYYY-MM-DD suffix; size-based rotation appends an index.
    """
    if LOG_ROTATION_DAILY:
        filename = datetime.now(timezone.utc).strftime("audit-%Y-%m-%d.log")
    else:
        filename = "audit.log"
    return BASE_LOG_DIR / filename


def _rotate_if_needed():
    """Rotate the log file based on size limit.
    When the file exceeds LOG_ROTATION_MAX_SIZE_MB, a new file with an incremental
    suffix is created (audit-YYYY-MM-DD-1.log, audit-YYYY-MM-DD-2.log, ...).
    """
    log_path = _current_log_path()
    if not log_path.exists():
        return
    size_mb = log_path.stat().st_size / (1024 * 1024)
    if size_mb < LOG_ROTATION_MAX_SIZE_MB:
        return
    # Determine next index
    base = log_path.stem  # e.g. "audit-2024-10-15"
    idx = 1
    while True:
        new_name = f"{base}-{idx}.log"
        new_path = BASE_LOG_DIR / new_name
        if not new_path.exists():
            log_path.rename(new_path)
            break
        idx += 1


def _purge_old_logs():
    """Delete logs older than the configured retention period (years).
    Only audit logs are touched; rotation files are considered.
    """
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - \
        timedelta(days=AUDIT_RETENTION_YEARS * 365)
    for file in BASE_LOG_DIR.iterdir():
        if not file.is_file() or not file.name.startswith("audit-"):
            continue
        try:
            # For daily files: audit-YYYY-MM-DD.log or audit-YYYY-MM-DD-1.log
            date_part = "-".join(file.name.split("-")[1:4])
            file_date = datetime.strptime(date_part, "%Y-%m-%d")
        except Exception:
            continue
        if file_date < cutoff:
            try:
                file.unlink()
            except Exception as e:
                logger.warning(f"Failed to delete old audit log {file}: {e}")


def log_action(**kwargs):
    """Write an immutable audit record to the file-based log.
    Expected fields (all optional, but recommended):
        audit_id, user_id, employee_id, client_id, role, account_type,
        action, module, entity_type, entity_id, result, remarks, ip, user_agent
    The function adds timestamp (UTC), trace_id (UUID) and ensures the log
    line is a single JSON object followed by a newline.
    """
    _rotate_if_needed()
    _purge_old_logs()
    record = {
        "audit_id": str(uuid.uuid4()),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "trace_id": str(uuid.uuid4()),
    }
    record.update(kwargs)
    try:
        line = json.dumps(record, separators=(",", ":"))
        with open(_current_log_path(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")
