from app.main import _normalize_wbs_row
from app.services.wbs import parse_wbs


def test_wbs_csv_upload_parsing():
    content = (
        "Task ID,Task Name,Owner,Due Date,Status\n"
        "WBS-001,API integration,Lee,2026-05-20,In Progress\n"
        "WBS-002,QA test,Park,2026-05-22,Pending\n"
    ).encode()

    columns, rows = parse_wbs("wbs.csv", content)

    assert "Task ID" in columns
    assert "_row_id" in columns
    assert len(rows) == 2
    assert rows[0]["Task Name"] == "API integration"


def test_column_mapping_normalizes_uploaded_row():
    raw = {
        "ID": "WBS-101",
        "Title": "Mapped task",
        "Person": "Kim",
        "Finish": "2026-06-01",
        "State": "Ready",
    }
    mapping = {
        "id": "ID",
        "task_name": "Title",
        "description": "",
        "owner": "Person",
        "start_date": "",
        "due_date": "Finish",
        "status": "State",
        "dependency": "",
        "notes": "",
    }

    row = _normalize_wbs_row(raw, mapping=mapping)

    assert row["wbs_id"] == "WBS-101"
    assert row["task_name"] == "Mapped task"
    assert row["owner"] == "Kim"
    assert row["due_date"] == "2026-06-01"
    assert row["status"] == "Ready"

