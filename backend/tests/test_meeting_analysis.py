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


def test_korean_discussion_note_extracts_action_items_not_line_items(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "mock_analysis", True)
    note = """
주요 논의 사항
1. 과제 방향 정리
현업 인터뷰 및 요구사항 검토를 통해, PRD → UX 시나리오 → GUI 초안을 공통 컴포넌트 기반으로 연결하는 워크플로우 개선 방향을 논의함
3. MVP 착수를 위해 필요한 것
3-1. PoC 시나리오 선정
LG Gallery+ 외의 시나리오 추가 여부
입출력 데이터 준비
PRD 업데이트 및 공유
전체 일정표 작성 및 각 담당 세부 일정 검토 요청
9월 임원 AX 평가 기준 확인
기본 컴포넌트 추출 및 에이전트 구성 방식 검토
"""

    result = analyze_meeting_note("2026-05-18", "AX 과제 회의", note, [])
    task_names = {change["task_name"] for change in result["changes"]}

    assert "PoC 시나리오 선정" in task_names
    assert "입출력 데이터 준비" in task_names
    assert "PRD 업데이트 및 공유" in task_names
    assert "전체 일정표 작성" in task_names
    assert "9월 임원 AX 평가 기준 확인" in task_names
    assert all(not name.startswith("Item ") for name in task_names)
    assert all("주요 논의 사항" not in change["evidence"] for change in result["changes"])
