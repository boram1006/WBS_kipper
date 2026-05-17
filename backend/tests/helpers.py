def create_project(conn, name="Test Project"):
    project_id = conn.execute(
        "INSERT INTO projects (name, description) VALUES (?, ?)",
        (name, "test"),
    ).lastrowid
    conn.commit()
    return project_id


def insert_wbs_row(
    conn,
    project_id,
    *,
    wbs_id="WBS-001",
    task_name="API integration",
    due_date="2026-05-20",
    status="Pending",
):
    conn.execute(
        """
        INSERT INTO wbs_rows (
            project_id, wbs_id, task_name, description, owner, start_date,
            due_date, status, dependency, notes, raw_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            wbs_id,
            task_name,
            "desc",
            "Lee",
            "2026-05-17",
            due_date,
            status,
            "",
            "",
            "{}",
        ),
    )
    conn.commit()


def insert_meeting(conn, project_id):
    meeting_id = conn.execute(
        """
        INSERT INTO meetings (project_id, meeting_title, meeting_date, meeting_note, summary_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (project_id, "Sync", "2026-05-17", "note", "{}"),
    ).lastrowid
    conn.commit()
    return meeting_id


def insert_change(
    conn,
    project_id,
    meeting_id,
    *,
    change_type,
    matched_wbs_id=None,
    task_name="API integration",
    field=None,
    current_value=None,
    proposed_value=None,
    evidence="source sentence",
    confidence="medium",
    requires_confirmation=0,
    status="pending",
):
    change_id = conn.execute(
        """
        INSERT INTO change_candidates (
            project_id, meeting_id, change_type, matched_wbs_id, task_name,
            field, current_value, proposed_value, evidence, confidence,
            requires_confirmation, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            project_id,
            meeting_id,
            change_type,
            matched_wbs_id,
            task_name,
            field,
            current_value,
            proposed_value,
            evidence,
            confidence,
            requires_confirmation,
            "reason",
            status,
        ),
    ).lastrowid
    conn.commit()
    return change_id
