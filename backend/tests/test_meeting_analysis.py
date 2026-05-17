from app.services.meeting_analyzer import analyze_meeting_note


def test_mock_meeting_analysis_extracts_structured_changes(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "mock_analysis", True)
    rows = [
        {
            "wbs_id": "WBS-001",
            "task_name": "API integration",
            "description": "",
            "owner": "Lee",
            "start_date": "2026-05-17",
            "due_date": "2026-05-20",
            "status": "Pending",
            "dependency": "",
            "notes": "",
        },
        {
            "wbs_id": "WBS-002",
            "task_name": "QA test",
            "description": "",
            "owner": "Park",
            "start_date": "2026-05-17",
            "due_date": "2026-05-22",
            "status": "Pending",
            "dependency": "",
            "notes": "",
        },
    ]
    note = (
        "API integration is done. "
        "Owner is Minsoo Kim. "
        "QA test due date changed to 2026-05-24. "
        "New task: Add stakeholder demo checklist. "
        "Risk: QA may be delayed if CSV download remains open."
    )

    result = analyze_meeting_note("2026-05-17", "Sync", note, rows)

    assert result["summary"]["total_changes"] >= 4
    assert any(change["change_type"] == "status_change" for change in result["changes"])
    assert any(change["change_type"] == "schedule_change" for change in result["changes"])
    assert any(change["change_type"] == "new_task" for change in result["changes"])
    assert result["risks"]
    assert all(change["evidence"] for change in result["changes"])

