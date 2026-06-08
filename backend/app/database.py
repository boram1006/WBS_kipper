import json
import sqlite3
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from .config import settings
from .models import SCHEMA_SQL


def _database_url() -> str:
    return settings.database_url.strip()


def is_postgres() -> bool:
    return urlparse(_database_url()).scheme in {"postgres", "postgresql"}


def _postgres_dsn() -> str:
    url = _database_url()
    if url.startswith("postgres://"):
        return "postgresql://" + url.removeprefix("postgres://")
    return url


def _db_path(url: str | None = None) -> Path:
    url = url or _database_url()
    if url.startswith("sqlite:///"):
        return Path(url.replace("sqlite:///", "", 1))
    return Path("wbs_agent.db")


DB_PATH = _db_path()


class SQLiteConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, traceback) -> None:
        super().__exit__(exc_type, exc, traceback)
        self.close()


class PostgresConnection:
    def __init__(self, dsn: str):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "PostgreSQL DATABASE_URL requires psycopg. Install dependencies with `pip install -r requirements.txt`."
            ) from exc

        self._conn = psycopg.connect(dsn, row_factory=dict_row, prepare_threshold=None)

    def __enter__(self) -> "PostgresConnection":
        self._conn.__enter__()
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        self._conn.__exit__(exc_type, exc, traceback)

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> Any:
        returning_id = _should_return_id(sql)
        cursor = self._conn.execute(_to_postgres_sql(sql, returning_id=returning_id), params)
        if returning_id:
            row = cursor.fetchone()
            return PostgresCursor(cursor, row["id"] if row else None)
        return PostgresCursor(cursor)

    def executescript(self, sql: str) -> None:
        for statement in _split_sql_script(_postgres_schema_sql(sql)):
            self.execute(statement)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()


class PostgresCursor:
    def __init__(self, cursor: Any, lastrowid: int | None = None):
        self._cursor = cursor
        self.lastrowid = lastrowid

    def fetchone(self) -> Any:
        return self._cursor.fetchone()

    def fetchall(self) -> list[Any]:
        return self._cursor.fetchall()

    def __iter__(self):
        return iter(self._cursor)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


def get_conn() -> sqlite3.Connection | PostgresConnection:
    if is_postgres():
        return PostgresConnection(_postgres_dsn())

    conn = sqlite3.connect(DB_PATH, factory=SQLiteConnection)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        _drop_legacy_tables(conn)
        _drop_legacy_meta_tables(conn)
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
                "proposed_wbs_id": "TEXT",
                "proposed_description": "TEXT",
                "proposed_owner": "TEXT",
                "proposed_start_date": "TEXT",
                "proposed_due_date": "TEXT",
                "proposed_status": "TEXT",
                "proposed_dependency": "TEXT",
                "proposed_notes": "TEXT",
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


def _ensure_columns(conn: sqlite3.Connection | PostgresConnection, table: str, columns: dict[str, str]) -> None:
    existing = _table_columns(conn, table)
    for column, definition in columns.items():
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {_column_definition(definition)}")


def _drop_legacy_meta_tables(conn: sqlite3.Connection | PostgresConnection) -> None:
    # Drop old wbs_milestones/wbs_groups tables that used "order" reserved word or INTEGER project_id
    milestone_cols = _table_columns(conn, "wbs_milestones")
    if milestone_cols and "sort_order" not in milestone_cols:
        conn.execute("DROP TABLE IF EXISTS wbs_milestones")
    group_cols = _table_columns(conn, "wbs_groups")
    if group_cols and "sort_order" not in group_cols:
        conn.execute("DROP TABLE IF EXISTS wbs_groups")


def _drop_legacy_tables(conn: sqlite3.Connection | PostgresConnection) -> None:
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


def _table_columns(conn: sqlite3.Connection | PostgresConnection, table: str) -> set[str]:
    if is_postgres():
        rows = conn.execute(
            """
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            """,
            (table,),
        ).fetchall()
        return {row["name"] for row in rows}

    exists = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", (table,)).fetchone()
    if not exists:
        return set()
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}


def _column_definition(definition: str) -> str:
    if not is_postgres():
        return definition
    return definition.replace("INTEGER", "BIGINT")


def _postgres_schema_sql(sql: str) -> str:
    if not is_postgres():
        return sql
    return sql.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "BIGSERIAL PRIMARY KEY")


def _to_postgres_sql(sql: str, returning_id: bool = False) -> str:
    statement = sql.strip().rstrip(";")
    statement = statement.replace("?", "%s")
    if returning_id:
        statement = f"{statement} RETURNING id"
    return statement


def _should_return_id(sql: str) -> bool:
    normalized = " ".join(sql.strip().split()).lower()
    if not normalized.startswith("insert into ") or " returning " in normalized:
        return False
    # Tables that have no auto-increment id column (composite PK)
    parts = normalized.split()
    table = parts[2].rstrip("(") if len(parts) > 2 else ""
    if table in ("wbs_milestones", "wbs_groups"):
        return False
    # If id is explicitly provided in the column list it's not auto-generated
    paren_start = normalized.find("(")
    paren_end = normalized.find(")")
    if 0 < paren_start < paren_end:
        cols = {c.strip() for c in normalized[paren_start + 1 : paren_end].split(",")}
        if "id" in cols:
            return False
    return True


def _split_sql_script(sql: str) -> list[str]:
    return [statement.strip() for statement in sql.split(";") if statement.strip()]


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def loads(value: str | None) -> Any:
    if not value:
        return None
    return json.loads(value)
