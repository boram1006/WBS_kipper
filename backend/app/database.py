import json
import sqlite3
from pathlib import Path
from typing import Any

from .config import settings
from .models import SCHEMA_SQL


def _db_path() -> Path:
    url = settings.database_url
    if url.startswith("sqlite:///"):
        return Path(url.replace("sqlite:///", "", 1))
    return Path("wbs_agent.db")


DB_PATH = _db_path()


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        _drop_legacy_tables(conn)
        conn.executescript(SCHEMA_SQL)
        _ensure_columns(
            conn,
            "projects",
            {
                "updated_at": "TEXT DEFAULT ''",
            },
        )
        _ensure_columns(
            conn,
            "change_candidates",
            {
                "meeting_id": "INTEGER",
                "matched_wbs_id": "TEXT",
                "task_name": "TEXT DEFAULT ''",
                "current_value": "TEXT",
                "proposed_value": "TEXT",
                "reason": "TEXT DEFAULT ''",
                "updated_at": "TEXT DEFAULT ''",
            },
        )
        _ensure_columns(
            conn,
            "risks",
            {
                "meeting_id": "INTEGER",
                "status": "TEXT DEFAULT 'open'",
            },
        )
        _ensure_columns(
            conn,
            "change_history",
            {
                "changed_at": "TEXT DEFAULT ''",
                "change_type": "TEXT DEFAULT ''",
                "wbs_id": "TEXT",
                "task_name": "TEXT DEFAULT ''",
                "old_value": "TEXT",
                "new_value": "TEXT",
                "confidence": "TEXT DEFAULT ''",
                "applied_by": "TEXT DEFAULT 'system'",
            },
        )


def _ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    for column, definition in columns.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _drop_legacy_tables(conn: sqlite3.Connection) -> None:
    candidate_columns = _table_columns(conn, "change_candidates")
    history_columns = _table_columns(conn, "change_history")
    risk_columns = _table_columns(conn, "risks")
    if "meeting_note_id" in candidate_columns or "row_id" in candidate_columns:
        conn.execute("DROP TABLE IF EXISTS change_history")
        conn.execute("DROP TABLE IF EXISTS risks")
        conn.execute("DROP TABLE IF EXISTS change_candidates")
    elif "candidate_id" in history_columns or "row_id" in history_columns:
        conn.execute("DROP TABLE IF EXISTS change_history")
    elif "change_id" in risk_columns:
        conn.execute("DROP TABLE IF EXISTS risks")


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    exists = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    if not exists:
        return set()
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(value: str | None) -> Any:
    if not value:
        return None
    return json.loads(value)
