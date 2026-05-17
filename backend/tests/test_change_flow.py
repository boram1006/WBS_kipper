from app.main import analyze_meeting
from app.schemas import MeetingAnalyzeRequest
from app.services.update_applier import apply_approved_changes

from helpers import create_project, insert_change, insert_meeting, insert_wbs_row


def test_change_candidates_are_saved_from_meeting_analysis(conn):
    project_id = create_project(conn)
    insert_wbs_row(conn, project_id, wbs_id="WBS-001", task_name="API integration")

    response = analyze_meeting(
        project_id,
        MeetingAnalyzeRequest(
            meeting_date="2026-05-17",
            meeting_title="Sync",
            meeting_note="API integration is done. QA may be delayed.",
        ),
    )

    saved = conn.execute("SELECT COUNT(*) AS count FROM change_candidates WHERE project_id = ?", (project_id,)).fetchone()
    assert response["meeting_id"]
    assert saved["count"] >= 1


def test_only_approved_changes_are_applied(conn):
    project_id = create_project(conn)
    insert_wbs_row(conn, project_id, wbs_id="WBS-001", task_name="API integration", due_date="2026-05-20")
    meeting_id = insert_meeting(conn, project_id)
    approved = insert_change(
        conn,
        project_id,
        meeting_id,
        change_type="schedule_change",
        matched_wbs_id="WBS-001",
        field="due_date",
        current_value="2026-05-20",
        proposed_value="2026-05-24",
    )
    insert_change(
        conn,
        project_id,
        meeting_id,
        change_type="owner_change",
        matched_wbs_id="WBS-001",
        field="owner",
        current_value="Lee",
        proposed_value="Kim",
    )

    result = apply_approved_changes(conn, project_id, [approved])
    row = conn.execute("SELECT due_date, owner FROM wbs_rows WHERE wbs_id = 'WBS-001'").fetchone()
    pending = conn.execute("SELECT COUNT(*) AS count FROM change_candidates WHERE status = 'pending'").fetchone()

    assert result["applied_count"] == 1
    assert row["due_date"] == "2026-05-24"
    assert row["owner"] == "Lee"
    assert pending["count"] == 1


def test_new_task_auto_generates_next_wbs_id(conn):
    project_id = create_project(conn)
    insert_wbs_row(conn, project_id, wbs_id="WBS-001")
    insert_wbs_row(conn, project_id, wbs_id="WBS-002", task_name="QA test")
    meeting_id = insert_meeting(conn, project_id)
    change_id = insert_change(
        conn,
        project_id,
        meeting_id,
        change_type="new_task",
        task_name="Stakeholder demo checklist",
        proposed_value="Stakeholder demo checklist",
        evidence="New task: Add stakeholder demo checklist.",
    )

    apply_approved_changes(conn, project_id, [change_id])
    row = conn.execute("SELECT * FROM wbs_rows WHERE wbs_id = 'WBS-003'").fetchone()

    assert row is not None
    assert row["task_name"] == "Stakeholder demo checklist"
    assert row["status"] == "예정"
    assert "New task" in row["notes"]


def test_schedule_change_updates_due_date(conn):
    project_id = create_project(conn)
    insert_wbs_row(conn, project_id, wbs_id="WBS-001", due_date="2026-05-20")
    meeting_id = insert_meeting(conn, project_id)
    change_id = insert_change(
        conn,
        project_id,
        meeting_id,
        change_type="schedule_change",
        matched_wbs_id="WBS-001",
        field="due_date",
        current_value="2026-05-20",
        proposed_value="2026-05-24",
    )

    apply_approved_changes(conn, project_id, [change_id])
    row = conn.execute("SELECT due_date FROM wbs_rows WHERE wbs_id = 'WBS-001'").fetchone()

    assert row["due_date"] == "2026-05-24"


def test_risk_is_saved_without_modifying_wbs(conn):
    project_id = create_project(conn)
    insert_wbs_row(conn, project_id, wbs_id="WBS-001", status="Pending")
    meeting_id = insert_meeting(conn, project_id)
    change_id = insert_change(
        conn,
        project_id,
        meeting_id,
        change_type="risk",
        matched_wbs_id="WBS-001",
        task_name="API integration",
        evidence="Risk: API integration may be delayed.",
        confidence="high",
    )

    apply_approved_changes(conn, project_id, [change_id])
    row = conn.execute("SELECT status FROM wbs_rows WHERE wbs_id = 'WBS-001'").fetchone()
    risk = conn.execute("SELECT * FROM risks WHERE project_id = ?", (project_id,)).fetchone()

    assert row["status"] == "Pending"
    assert risk is not None
    assert risk["related_wbs_id"] == "WBS-001"
