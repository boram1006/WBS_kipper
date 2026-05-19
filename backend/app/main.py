from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .database import dumps, get_conn, init_db, loads
from .models import WBS_FIELDS
from .schemas import (
    ApplyChangesRequest,
    ApplyChangesResponse,
    ChangeCandidateUpdateRequest,
    ChangeHistoryResponse,
    MeetingAnalyzeRequest,
    MeetingAnalyzeResponse,
    PendingChangesResponse,
    ProjectCreateRequest,
    ProjectResponse,
    WbsChangeCandidate,
    WbsMapColumnsRequest,
    WbsMapColumnsResponse,
    WbsUploadResponse,
)
from .services.meeting_analyzer import analyze_meeting_note
from .services.update_applier import apply_approved_changes
from .services.wbs import parse_wbs, rows_to_csv

app = FastAPI(title="WBS Update Agent MVP")
DEFAULT_PROJECT_NAME = "webOS UX"

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()
    with get_conn() as conn:
        _ensure_default_project(conn)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/projects", response_model=ProjectResponse)
def create_project(payload: ProjectCreateRequest) -> dict:
    with get_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO projects (name, description) VALUES (?, ?)",
            (payload.name, payload.description),
        )
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(row)


@app.get("/api/projects")
def list_projects() -> dict:
    with get_conn() as conn:
        _ensure_default_project(conn)
        rows = conn.execute(
            """
            SELECT *
            FROM projects
            ORDER BY
                CASE WHEN EXISTS (SELECT 1 FROM wbs_rows w WHERE w.project_id = projects.id) THEN 0 ELSE 1 END,
                id DESC
            """
        ).fetchall()
        return {"projects": [dict(row) for row in rows]}


@app.post("/api/demo/start")
def start_demo() -> dict:
    root = Path(__file__).resolve().parents[2]
    wbs_path = root / "sample_wbs.csv"
    meeting_path = root / "sample_meeting.txt"
    if not wbs_path.exists() or not meeting_path.exists():
        raise HTTPException(status_code=500, detail="Demo sample files are missing")

    meeting_note = meeting_path.read_text(encoding="utf-8")
    meeting_date = _sample_value(meeting_note, "Meeting date") or "2026-05-17"
    meeting_title = _sample_value(meeting_note, "Meeting title") or "WBS Agent MVP weekly sync"

    columns, raw_rows = parse_wbs(wbs_path.name, wbs_path.read_bytes())
    with get_conn() as conn:
        project_id = conn.execute(
            "INSERT INTO projects (name, description) VALUES (?, ?)",
            ("Demo - WBS Update Agent MVP", "Sample project with WBS and meeting analysis preloaded."),
        ).lastrowid
        for index, raw in enumerate(raw_rows, start=1):
            row = _normalize_wbs_row(raw, index=index)
            _insert_wbs_row(conn, project_id, row, raw)

        current_rows = _get_wbs_rows(conn, project_id)
        analysis = analyze_meeting_note(meeting_date, meeting_title, meeting_note, current_rows)
        meeting_id = conn.execute(
            """
            INSERT INTO meetings (project_id, meeting_title, meeting_date, meeting_note, summary_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, meeting_title, meeting_date, meeting_note, dumps(analysis["summary"])),
        ).lastrowid

        for item in analysis["changes"]:
            conn.execute(
                """
                INSERT INTO change_candidates (
                    project_id, meeting_id, change_type, matched_wbs_id, task_name, field,
                    current_value, proposed_value, evidence, confidence, requires_confirmation,
                    reason, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    project_id,
                    meeting_id,
                    item.get("change_type", "clarification_needed"),
                    item.get("matched_wbs_id"),
                    item.get("task_name") or "",
                    _canonical_field(item.get("field")) or "",
                    item.get("current_value"),
                    item.get("proposed_value"),
                    item.get("evidence", ""),
                    item.get("confidence", "low"),
                    1 if item.get("requires_confirmation", True) else 0,
                    item.get("reason", ""),
                ),
            )

        project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return {
            "project": dict(project),
            "meeting_id": meeting_id,
            "candidate_count": len(analysis["changes"]),
            "wbs": {"columns": columns, "rows_preview": raw_rows[:20], "total_rows": len(raw_rows)},
            "summary": analysis["summary"],
        }


@app.post("/api/projects/{project_id}/wbs/upload", response_model=WbsUploadResponse)
async def upload_wbs(project_id: int, file: UploadFile = File(...)) -> dict:
    content = await file.read()
    columns, raw_rows = parse_wbs(file.filename or "wbs.xlsx", content)
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        conn.execute("DELETE FROM wbs_rows WHERE project_id = ?", (project_id,))
        for index, raw in enumerate(raw_rows, start=1):
            row = _normalize_wbs_row(raw, index=index)
            _insert_wbs_row(conn, project_id, row, raw)
        return {"columns": columns, "rows_preview": raw_rows[:20], "total_rows": len(raw_rows)}


@app.post("/api/projects/{project_id}/wbs/map-columns", response_model=WbsMapColumnsResponse)
def map_wbs_columns(project_id: int, payload: WbsMapColumnsRequest) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        rows = conn.execute("SELECT id, raw_json FROM wbs_rows WHERE project_id = ?", (project_id,)).fetchall()
        for index, row in enumerate(rows, start=1):
            raw = loads(row["raw_json"]) or {}
            normalized = _normalize_wbs_row(raw, mapping=payload.mapping.model_dump(), index=index)
            conn.execute(
                """
                UPDATE wbs_rows SET
                    wbs_id = ?, task_name = ?, description = ?, owner = ?, start_date = ?,
                    due_date = ?, status = ?, dependency = ?, notes = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (*[normalized[field] for field in WBS_FIELDS], row["id"]),
            )
        return {"mapping": payload.mapping.model_dump(), "saved": True}


@app.get("/api/projects/{project_id}/wbs")
def get_latest_wbs(project_id: int) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        rows = _get_wbs_rows(conn, project_id)
        return {"columns": WBS_FIELDS, "rows_preview": rows, "total_rows": len(rows)}


@app.post("/api/projects/{project_id}/meetings/analyze", response_model=MeetingAnalyzeResponse)
def analyze_meeting(project_id: int, payload: MeetingAnalyzeRequest) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        current_rows = _get_wbs_rows(conn, project_id)
        if not current_rows:
            raise HTTPException(status_code=404, detail="WBS not uploaded")

        analysis = analyze_meeting_note(
            payload.meeting_date,
            payload.meeting_title,
            payload.meeting_note,
            current_rows,
            enabled_detection=payload.enabled_detection,
            auto_match=payload.auto_match,
        )
        conn.execute(
            "DELETE FROM change_candidates WHERE project_id = ? AND status = 'pending'",
            (project_id,),
        )
        meeting_id = conn.execute(
            """
            INSERT INTO meetings (project_id, meeting_title, meeting_date, meeting_note, summary_json)
            VALUES (?, ?, ?, ?, ?)
            """,
            (project_id, payload.meeting_title, payload.meeting_date, payload.meeting_note, dumps(analysis["summary"])),
        ).lastrowid

        response_changes: list[dict] = []
        for item in analysis["changes"]:
            change_id = conn.execute(
                """
                INSERT INTO change_candidates (
                    project_id, meeting_id, change_type, matched_wbs_id, task_name, field,
                    current_value, proposed_value, evidence, confidence, requires_confirmation,
                    reason, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
                """,
                (
                    project_id,
                    meeting_id,
                    item.get("change_type", "clarification_needed"),
                    item.get("matched_wbs_id"),
                    item.get("task_name") or "",
                    _canonical_field(item.get("field")) or "",
                    item.get("current_value"),
                    item.get("proposed_value"),
                    item.get("evidence", ""),
                    item.get("confidence", "low"),
                    1 if item.get("requires_confirmation", True) else 0,
                    item.get("reason", ""),
                ),
            ).lastrowid
            response_changes.append({**item, "id": str(change_id), "status": "pending"})

        return {
            "meeting_id": meeting_id,
            "changes": response_changes,
            "risks": analysis["risks"],
            "summary": analysis["summary"],
        }


@app.get("/api/projects/{project_id}/changes/pending", response_model=PendingChangesResponse)
def list_pending_changes(project_id: int) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        rows = conn.execute(
            "SELECT * FROM change_candidates WHERE project_id = ? AND status = 'pending' ORDER BY id DESC",
            (project_id,),
        ).fetchall()
        return {"changes": [_change_response(dict(row)) for row in rows]}


@app.patch("/api/projects/{project_id}/changes/{change_id}", response_model=WbsChangeCandidate)
def update_change_candidate(project_id: int, change_id: int, payload: ChangeCandidateUpdateRequest) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        row = conn.execute(
            "SELECT * FROM change_candidates WHERE project_id = ? AND id = ? AND status = 'pending'",
            (project_id, change_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Change candidate not found")

        values = payload.model_dump(exclude_unset=True)
        if values:
            allowed = {
                "matched_wbs_id",
                "task_name",
                "field",
                "current_value",
                "proposed_value",
                "proposed_wbs_id",
                "proposed_description",
                "proposed_owner",
                "proposed_start_date",
                "proposed_due_date",
                "proposed_status",
                "proposed_dependency",
                "proposed_notes",
            }
            assignments = ", ".join(f"{key} = ?" for key in values if key in allowed)
            params = [values[key] for key in values if key in allowed]
            if assignments:
                conn.execute(
                    f"UPDATE change_candidates SET {assignments}, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND id = ?",
                    (*params, project_id, change_id),
                )
        updated = conn.execute("SELECT * FROM change_candidates WHERE project_id = ? AND id = ?", (project_id, change_id)).fetchone()
        return _change_response(dict(updated))


@app.post("/api/projects/{project_id}/changes/apply", response_model=ApplyChangesResponse)
def apply_changes(project_id: int, payload: ApplyChangesRequest) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        change_ids = [_parse_change_id(change_id) for change_id in payload.change_ids]
        return apply_approved_changes(conn, project_id, change_ids)


@app.get("/api/projects/{project_id}/history", response_model=ChangeHistoryResponse)
def list_history(project_id: int) -> dict:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        rows = conn.execute(
            "SELECT * FROM change_history WHERE project_id = ? ORDER BY id DESC",
            (project_id,),
        ).fetchall()
        return {"history": [dict(row) for row in rows]}


@app.get("/api/projects/{project_id}/wbs/download")
def download_latest_wbs(project_id: int) -> Response:
    with get_conn() as conn:
        _ensure_project(conn, project_id)
        rows = _get_wbs_rows(conn, project_id)
        if not rows:
            raise HTTPException(status_code=404, detail="WBS not uploaded")
        csv = rows_to_csv(WBS_FIELDS, rows)
        return Response(
            content=csv.encode("utf-8-sig"),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="project-{project_id}-wbs.csv"'},
        )


def _ensure_project(conn, project_id: int) -> None:
    if not conn.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Project not found")


def _ensure_default_project(conn) -> None:
    project_with_wbs = conn.execute(
        """
        SELECT p.id
        FROM projects p
        WHERE EXISTS (SELECT 1 FROM wbs_rows w WHERE w.project_id = p.id)
        ORDER BY p.id DESC
        LIMIT 1
        """
    ).fetchone()
    if project_with_wbs:
        conn.execute(
            "UPDATE projects SET name = ?, description = ? WHERE id = ?",
            (DEFAULT_PROJECT_NAME, "Default WBS project.", project_with_wbs["id"]),
        )
        return
    legacy = conn.execute("SELECT id FROM projects WHERE name = ?", ("WBS 설정 프로젝트",)).fetchone()
    if legacy:
        conn.execute(
            "UPDATE projects SET name = ?, description = ? WHERE id = ?",
            (DEFAULT_PROJECT_NAME, "Default WBS project.", legacy["id"]),
        )
        return
    if conn.execute("SELECT id FROM projects WHERE name = ?", (DEFAULT_PROJECT_NAME,)).fetchone():
        return
    conn.execute(
        "INSERT INTO projects (name, description) VALUES (?, ?)",
        (DEFAULT_PROJECT_NAME, "Default WBS project."),
    )


def _insert_wbs_row(conn, project_id: int, row: dict[str, str], raw: dict[str, str]) -> None:
    conn.execute(
        """
        INSERT INTO wbs_rows (
            project_id, wbs_id, task_name, description, owner, start_date, due_date,
            status, dependency, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (project_id, *[row[field] for field in WBS_FIELDS], dumps(raw)),
    )


def _get_wbs_rows(conn, project_id: int) -> list[dict[str, str]]:
    return [
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


def _normalize_wbs_row(raw: dict[str, str], mapping: dict[str, str] | None = None, index: int = 1) -> dict[str, str]:
    mapping = mapping or {}
    return {
        "wbs_id": _value(raw, mapping.get("id"), ["task id", "wbs id", "id", "_row_id"]) or str(index),
        "task_name": _value(raw, mapping.get("task_name"), ["task name", "task", "name", "title"]) or f"Task {index}",
        "description": _value(raw, mapping.get("description"), ["description", "desc"]) or "",
        "owner": _value(raw, mapping.get("owner"), ["owner", "assignee"]) or "",
        "start_date": _value(raw, mapping.get("start_date"), ["start date", "start"]) or "",
        "due_date": _value(raw, mapping.get("due_date"), ["due date", "due", "deadline"]) or "",
        "status": _value(raw, mapping.get("status"), ["status", "state"]) or "",
        "dependency": _value(raw, mapping.get("dependency"), ["dependency", "depends"]) or "",
        "notes": _value(raw, mapping.get("notes"), ["notes", "memo"]) or "",
    }


def _value(raw: dict[str, str], mapped_column: str | None, fallbacks: list[str]) -> str | None:
    if mapped_column and mapped_column in raw:
        return str(raw.get(mapped_column, "")).strip()
    for key in fallbacks:
        for column, value in raw.items():
            if key == column.lower() or key in column.lower():
                text = str(value).strip()
                if text:
                    return text
    return None


def _canonical_field(field: str | None) -> str | None:
    if not field:
        return None
    lowered = field.lower()
    if "start" in lowered:
        return "start_date"
    if "due" in lowered or "deadline" in lowered or "date" in lowered:
        return "due_date"
    if "owner" in lowered or "assignee" in lowered:
        return "owner"
    if "status" in lowered:
        return "status"
    if "dependency" in lowered or "depends" in lowered:
        return "dependency"
    if "description" in lowered:
        return "description"
    if "notes" in lowered:
        return "notes"
    return field if field in WBS_FIELDS else None


def _change_response(row: dict) -> dict:
    def optional(key: str) -> str | None:
        return row.get(key)

    return {
        "id": str(row["id"]),
        "change_type": row["change_type"],
        "matched_wbs_id": row["matched_wbs_id"],
        "task_name": row["task_name"],
        "field": row["field"],
        "current_value": row["current_value"],
        "proposed_value": row["proposed_value"],
        "proposed_wbs_id": optional("proposed_wbs_id"),
        "proposed_description": optional("proposed_description"),
        "proposed_owner": optional("proposed_owner"),
        "proposed_start_date": optional("proposed_start_date"),
        "proposed_due_date": optional("proposed_due_date"),
        "proposed_status": optional("proposed_status"),
        "proposed_dependency": optional("proposed_dependency"),
        "proposed_notes": optional("proposed_notes"),
        "evidence": row["evidence"],
        "confidence": row["confidence"],
        "requires_confirmation": bool(row["requires_confirmation"]),
        "reason": row["reason"],
        "status": row["status"],
    }


def _parse_change_id(change_id: str) -> int:
    try:
        return int(change_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid change id: {change_id}") from exc


def _sample_value(text: str, label: str) -> str | None:
    prefix = f"{label}:"
    for line in text.splitlines():
        if line.startswith(prefix):
            return line.replace(prefix, "", 1).strip()
    return None
