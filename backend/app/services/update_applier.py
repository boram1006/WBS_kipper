from __future__ import annotations

import re
import sqlite3
from typing import Any


def apply_approved_changes(
    conn: sqlite3.Connection,
    project_id: int,
    change_ids: list[int],
    applied_by: str = "system",
) -> dict[str, Any]:
    if not change_ids:
        return {"applied_count": 0, "updated_wbs_preview": _wbs_preview(conn, project_id)}

    placeholders = ",".join("?" for _ in change_ids)
    changes = conn.execute(
        f"""
        SELECT * FROM change_candidates
        WHERE project_id = ? AND status = 'pending' AND id IN ({placeholders})
        """,
        (project_id, *change_ids),
    ).fetchall()

    applied_count = 0
    for change in changes:
        change_type = change["change_type"]
        if change_type == "clarification_needed":
            continue

        if change_type == "risk":
            _save_risk(conn, project_id, change)
            _insert_history(conn, project_id, change, change["matched_wbs_id"], change["task_name"], "risk", None, "saved_to_risks", applied_by)
            _mark_applied(conn, change["id"])
            applied_count += 1
            continue

        if change_type == "new_task":
            row = _create_new_task(conn, project_id, change)
            _insert_history(conn, project_id, change, row["wbs_id"], row["task_name"], "row", None, "created", applied_by)
            _mark_applied(conn, change["id"])
            applied_count += 1
            continue

        row = _find_wbs_row(conn, project_id, change["matched_wbs_id"])
        if not row:
            continue

        field = _field_for_change(change)
        new_value = _new_value_for_change(change)
        if not field or new_value is None:
            continue

        old_value = row[field] if field in row.keys() else None
        conn.execute(
            f"UPDATE wbs_rows SET {field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (new_value, row["id"]),
        )
        _insert_history(conn, project_id, change, row["wbs_id"], row["task_name"], field, old_value, new_value, applied_by)
        _mark_applied(conn, change["id"])
        applied_count += 1

    return {"applied_count": applied_count, "updated_wbs_preview": _wbs_preview(conn, project_id)}


def _create_new_task(conn: sqlite3.Connection, project_id: int, change) -> dict[str, str]:
    next_id = _next_wbs_id(conn, project_id)
    task_name = change["task_name"] or change["proposed_value"] or "New task"
    description = change["reason"] or change["evidence"]
    conn.execute(
        """
        INSERT INTO wbs_rows (
            project_id, wbs_id, task_name, description, owner, start_date, due_date,
            status, dependency, notes, raw_json
        ) VALUES (?, ?, ?, ?, '', '', '', ?, '', ?, ?)
        """,
        (project_id, next_id, task_name, description, "예정", change["evidence"], "{}"),
    )
    return {"wbs_id": next_id, "task_name": task_name}


def _save_risk(conn: sqlite3.Connection, project_id: int, change) -> None:
    conn.execute(
        """
        INSERT INTO risks (
            project_id, meeting_id, related_wbs_id, risk_type, description, severity, evidence, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
        """,
        (
            project_id,
            change["meeting_id"],
            change["matched_wbs_id"],
            "delivery",
            change["evidence"],
            _severity_from_confidence(change["confidence"]),
            change["evidence"],
        ),
    )


def _field_for_change(change) -> str | None:
    change_type = change["change_type"]
    field = (change["field"] or "").lower()
    if change_type == "schedule_change":
        return "start_date" if "start" in field else "due_date"
    if change_type == "owner_change":
        return "owner"
    if change_type == "status_change":
        return "status"
    if change_type == "dependency_change":
        return "dependency"
    if change_type == "hold_or_drop":
        return "status"
    return None


def _new_value_for_change(change) -> str | None:
    if change["change_type"] == "hold_or_drop":
        text = f"{change['proposed_value'] or ''} {change['evidence']}".lower()
        if "exclude" in text or "out of scope" in text or "drop" in text or "제외" in text:
            return "제외"
        return "보류"
    return change["proposed_value"]


def _find_wbs_row(conn: sqlite3.Connection, project_id: int, wbs_id: str | None):
    if not wbs_id:
        return None
    return conn.execute(
        "SELECT * FROM wbs_rows WHERE project_id = ? AND wbs_id = ?",
        (project_id, wbs_id),
    ).fetchone()


def _next_wbs_id(conn: sqlite3.Connection, project_id: int) -> str:
    rows = conn.execute("SELECT wbs_id FROM wbs_rows WHERE project_id = ?", (project_id,)).fetchall()
    values = [row["wbs_id"] for row in rows]
    matches = [re.match(r"^(.*?)(\d+)$", value or "") for value in values]
    parsed = [(match.group(1), match.group(2)) for match in matches if match]
    if parsed:
        prefix, digits = parsed[-1]
        max_number = max(int(number) for _, number in parsed)
        return f"{prefix}{max_number + 1:0{len(digits)}d}"
    return str(len(values) + 1)


def _insert_history(
    conn: sqlite3.Connection,
    project_id: int,
    change,
    wbs_id: str | None,
    task_name: str,
    field: str | None,
    old_value: str | None,
    new_value: str | None,
    applied_by: str,
) -> None:
    conn.execute(
        """
        INSERT INTO change_history (
            project_id, change_type, wbs_id, task_name, field, old_value,
            new_value, evidence, confidence, applied_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            change["change_type"],
            wbs_id,
            task_name,
            field,
            old_value,
            new_value,
            change["evidence"],
            change["confidence"],
            applied_by,
        ),
    )


def _mark_applied(conn: sqlite3.Connection, change_id: int) -> None:
    conn.execute(
        "UPDATE change_candidates SET status = 'applied', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        (change_id,),
    )


def _wbs_preview(conn: sqlite3.Connection, project_id: int) -> dict[str, Any]:
    rows = [
        dict(row)
        for row in conn.execute(
            """
            SELECT wbs_id, task_name, description, owner, start_date, due_date, status, dependency, notes
            FROM wbs_rows
            WHERE project_id = ?
            ORDER BY id
            """,
            (project_id,),
        ).fetchall()
    ]
    return {
        "columns": ["wbs_id", "task_name", "description", "owner", "start_date", "due_date", "status", "dependency", "notes"],
        "rows_preview": rows[:20],
        "total_rows": len(rows),
    }


def _severity_from_confidence(confidence: str) -> str:
    if confidence == "high":
        return "high"
    if confidence == "medium":
        return "medium"
    return "low"

