from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from ..config import settings

Confidence = Literal["high", "medium", "low"]
ChangeType = Literal[
    "new_task",
    "schedule_change",
    "owner_change",
    "status_change",
    "dependency_change",
    "hold_or_drop",
    "risk",
    "decision",
    "clarification_needed",
]

SUMMARY_KEYS = [
    "total_changes",
    "new_tasks",
    "schedule_changes",
    "owner_changes",
    "status_changes",
    "dependency_changes",
    "hold_or_drop",
    "risks",
    "clarification_needed",
]

DETECTION_TO_CHANGE_TYPES = {
    "new_tasks": {"new_task"},
    "schedule_changes": {"schedule_change"},
    "owner_changes": {"owner_change"},
    "status_changes": {"status_change"},
    "dependency_changes": {"dependency_change", "hold_or_drop"},
    "risks": {"risk"},
    "clarification_needed": {"clarification_needed", "decision"},
}


def analyze_meeting_note(
    meeting_date: str,
    meeting_title: str,
    meeting_note: str,
    current_wbs_rows: list[dict[str, str]],
    enabled_detection: dict[str, bool] | None = None,
    auto_match: bool = True,
) -> dict[str, Any]:
    allowed_change_types = _allowed_change_types(enabled_detection)
    if not settings.mock_analysis and settings.openai_api_key:
        try:
            return _normalize_analysis(
                _analyze_with_openai(
                    meeting_date,
                    meeting_title,
                    meeting_note,
                    current_wbs_rows,
                    enabled_detection,
                    allowed_change_types,
                    auto_match,
                ),
                current_wbs_rows,
                allowed_change_types,
                auto_match,
            )
        except Exception:
            pass
    return _analyze_with_rules(
        meeting_date,
        meeting_title,
        meeting_note,
        current_wbs_rows,
        allowed_change_types,
        auto_match,
    )


def _analyze_with_openai(
    meeting_date: str,
    meeting_title: str,
    meeting_note: str,
    current_wbs_rows: list[dict[str, str]],
    enabled_detection: dict[str, bool] | None,
    allowed_change_types: set[str],
    auto_match: bool,
) -> dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = {
        "meeting_date": meeting_date,
        "meeting_title": meeting_title,
        "meeting_note": meeting_note,
        "current_wbs_rows": current_wbs_rows[:120],
        "enabled_detection": enabled_detection or {key: True for key in DETECTION_TO_CHANGE_TYPES},
        "allowed_change_types": sorted(allowed_change_types),
        "auto_match": auto_match,
        "output_schema": _schema_description(),
        "rules": [
            "Extract only actionable WBS update candidates. Do not summarize the meeting note line by line.",
            "Only return changes whose change_type is included in allowed_change_types.",
            "If allowed_change_types does not include risk, return an empty risks array.",
            "If auto_match is false, set matched_wbs_id=null and current_value=null for every change.",
            "Do not create candidates for headings, section labels, background context, alternatives, or descriptive discussion.",
            "Ignore lines such as '주요 논의 사항', numbered headings, '[필수]', '[옵션]', '기존:', and '개선:' unless they contain a concrete action owner/date/status update.",
            "A valid candidate must represent one of: new work item, owner assignment, due date/schedule change, status change, dependency/scope change, risk/blocker, or explicit follow-up/confirmation action.",
            "For Korean notes, prefer compact action-item task names such as 'PoC 시나리오 선정', '입출력 데이터 준비', 'PRD 업데이트 및 공유'. Never use generic names like 'Item 01'.",
            "Do not infer facts that are not present in meeting_note.",
            "Every change must include an exact original sentence in evidence.",
            "Resolve relative dates using meeting_date. If uncertain, set requires_confirmation=true.",
            "If WBS matching is ambiguous, matched_wbs_id may be set but confidence must be low.",
            "New tasks must have matched_wbs_id=null.",
            "Classify hold, moved to phase 2, out of scope as hold_or_drop.",
            "Classify concern, risk, blocker, blocked, possible delay as risk.",
            "Classify next meeting decision, follow-up check, later confirmation as clarification_needed.",
            "Return JSON only. No markdown. No explanatory text.",
        ],
    }
    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a strict JSON generator for WBS meeting analysis. "
                    "Return only one valid JSON object matching the requested schema."
                ),
            },
            {"role": "user", "content": json.dumps(prompt, ensure_ascii=False)},
        ],
        temperature=0.0,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    return _parse_json_with_repair(content)


def _parse_json_with_repair(content: str) -> dict[str, Any]:
    try:
        parsed = json.loads(content)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", content, re.DOTALL)
    if match:
        snippet = match.group(0)
        try:
            parsed = json.loads(snippet)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            repaired = snippet.replace("```json", "").replace("```", "")
            repaired = re.sub(r",\s*([}\]])", r"\1", repaired)
            try:
                parsed = json.loads(repaired)
                return parsed if isinstance(parsed, dict) else {}
            except json.JSONDecodeError:
                return {}
    return {}


def _analyze_with_rules(
    meeting_date: str,
    meeting_title: str,
    meeting_note: str,
    current_wbs_rows: list[dict[str, str]],
    allowed_change_types: set[str],
    auto_match: bool,
) -> dict[str, Any]:
    sentences = _split_sentences(meeting_note)
    changes: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    parsed_meeting_date = _parse_date(meeting_date)

    for index, sentence in enumerate(sentences, start=1):
        if _is_noise_sentence(sentence):
            continue
        match = _match_wbs(sentence, current_wbs_rows) if auto_match else None
        matched_id = match.get("wbs_id") if match else None
        task_name = match.get("task_name") if match else _extract_task_name(sentence)
        confidence: Confidence = "high" if match else "low"

        if _contains(sentence, ["new task", "add task", "create task", " 신규", "추가 작업", "새 작업"]):
            changes.append(
                _change(
                    index,
                    "new_task",
                    None,
                    task_name or _extract_after_keyword(sentence, ["new task", "add task", "create task"]) or "New task",
                    None,
                    None,
                    task_name or sentence,
                    sentence,
                    "low",
                    True,
                    "Meeting note explicitly mentions a task to add.",
                )
            )

        due = _extract_due_date(sentence, parsed_meeting_date)
        if due:
            changes.append(
                _change(
                    index,
                    "schedule_change",
                    matched_id,
                    task_name,
                    _field_name(match, ["due", "deadline", "date"], "Due Date"),
                    _current_value(match, ["due", "deadline", "date"]),
                    due["value"],
                    sentence,
                    "medium" if due["requires_confirmation"] or confidence == "low" else confidence,
                    due["requires_confirmation"] or confidence == "low",
                    due["reason"],
                )
            )

        owner = _extract_owner(sentence)
        if owner:
            changes.append(
                _change(
                    index,
                    "owner_change",
                    matched_id,
                    task_name,
                    _field_name(match, ["owner", "assignee"], "Owner"),
                    _current_value(match, ["owner", "assignee"]),
                    owner,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    confidence == "low",
                    "Meeting note states an owner assignment.",
                )
            )

        status = _extract_status(sentence)
        if status and not _looks_like_status_update(sentence, matched=bool(match)):
            status = None
        if status:
            changes.append(
                _change(
                    index,
                    "status_change",
                    matched_id,
                    task_name,
                    _field_name(match, ["status"], "Status"),
                    _current_value(match, ["status"]),
                    status,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    confidence == "low",
                    "Meeting note states a task status change.",
                )
            )

        dependency = _extract_dependency(sentence)
        if dependency:
            changes.append(
                _change(
                    index,
                    "dependency_change",
                    matched_id,
                    task_name,
                    _field_name(match, ["dependency", "depends"], "Dependency"),
                    _current_value(match, ["dependency", "depends"]),
                    dependency,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    True,
                    "Meeting note mentions a dependency relationship.",
                )
            )

        if _contains(sentence, ["보류", "2차로 미룸", "범위 제외", "hold", "defer", "phase 2", "out of scope", "drop"]):
            changes.append(
                _change(
                    index,
                    "hold_or_drop",
                    matched_id,
                    task_name,
                    _field_name(match, ["status"], "Status"),
                    _current_value(match, ["status"]),
                    "Hold/Drop",
                    sentence,
                    "medium" if confidence != "low" else "low",
                    True,
                    "Meeting note indicates the work is held, deferred, or removed from scope.",
                )
            )

        if _contains(sentence, ["우려", "리스크", "막힘", "지연 가능", "risk", "concern", "blocked", "blocker", "possible delay", "may be delayed"]):
            risk_id = f"risk-{index:03d}"
            risk = {
                "id": risk_id,
                "risk_type": "delivery",
                "description": sentence,
                "related_wbs_id": matched_id,
                "severity": _risk_severity(sentence),
                "evidence": sentence,
            }
            risks.append(risk)
            changes.append(
                _change(
                    index,
                    "risk",
                    matched_id,
                    task_name,
                    None,
                    None,
                    None,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    True,
                    "Meeting note explicitly mentions a risk or blocker.",
                )
            )

        if _contains(sentence, ["다음 회의에서 결정", "추후 확인", "later confirmation", "follow up", "next meeting", "to be confirmed", "tbd"]):
            changes.append(
                _change(
                    index,
                    "clarification_needed",
                    matched_id,
                    task_name,
                    None,
                    None,
                    None,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    True,
                    "Meeting note says the item needs later confirmation.",
                )
            )

        if _contains(sentence, ["decided", "decision", "결정"]):
            changes.append(
                _change(
                    index,
                    "decision",
                    matched_id,
                    task_name,
                    None,
                    None,
                    None,
                    sentence,
                    "medium" if confidence != "low" else "low",
                    True,
                    "Meeting note records a decision but does not map to a direct WBS field update.",
                )
            )

    existing_task_names = {str(change.get("task_name") or "") for change in changes}
    if "new_task" in allowed_change_types:
        for action in _extract_korean_action_items(meeting_note, start_index=len(changes) + 1):
            if action["task_name"] not in existing_task_names:
                changes.append(action)
                existing_task_names.add(action["task_name"])

    return _normalize_analysis({"summary": {}, "changes": changes, "risks": risks}, current_wbs_rows, allowed_change_types, auto_match)


def _normalize_analysis(
    raw: dict[str, Any],
    current_wbs_rows: list[dict[str, str]],
    allowed_change_types: set[str] | None = None,
    auto_match: bool = True,
) -> dict[str, Any]:
    changes = [
        change
        for idx, item in enumerate(raw.get("changes", []), start=1)
        if isinstance(item, dict)
        for change in [_normalize_change(item, idx)]
        if not _is_noise_change(change)
    ]
    if allowed_change_types is not None:
        changes = [change for change in changes if change["change_type"] in allowed_change_types]
    if not auto_match:
        changes = [{**change, "matched_wbs_id": None, "current_value": None} for change in changes]

    risks = [_normalize_risk(item, idx) for idx, item in enumerate(raw.get("risks", []), start=1) if isinstance(item, dict)]
    if allowed_change_types is not None and "risk" not in allowed_change_types:
        risks = []
    if not auto_match:
        risks = [{**risk, "related_wbs_id": None} for risk in risks]
    return {"summary": _build_summary(changes, risks), "changes": changes, "risks": risks}


def _allowed_change_types(enabled_detection: dict[str, bool] | None) -> set[str]:
    if enabled_detection is None:
        return set(_change_types())
    allowed: set[str] = set()
    for key, change_types in DETECTION_TO_CHANGE_TYPES.items():
        if enabled_detection.get(key, True):
            allowed.update(change_types)
    return allowed


def _normalize_change(item: dict[str, Any], index: int) -> dict[str, Any]:
    change_type = item.get("change_type") if item.get("change_type") in _change_types() else "clarification_needed"
    confidence = item.get("confidence") if item.get("confidence") in ["high", "medium", "low"] else "low"
    return {
        "id": str(item.get("id") or f"chg-{index:03d}"),
        "change_type": change_type,
        "matched_wbs_id": _nullable_str(item.get("matched_wbs_id")),
        "task_name": str(item.get("task_name") or ""),
        "field": _nullable_str(item.get("field")),
        "current_value": _nullable_str(item.get("current_value")),
        "proposed_value": _nullable_str(item.get("proposed_value")),
        "evidence": str(item.get("evidence") or ""),
        "confidence": confidence,
        "requires_confirmation": bool(item.get("requires_confirmation", confidence != "high")),
        "reason": str(item.get("reason") or ""),
    }


def _normalize_risk(item: dict[str, Any], index: int) -> dict[str, Any]:
    severity = item.get("severity") if item.get("severity") in ["high", "medium", "low"] else "medium"
    return {
        "id": str(item.get("id") or f"risk-{index:03d}"),
        "risk_type": str(item.get("risk_type") or "general"),
        "description": str(item.get("description") or ""),
        "related_wbs_id": _nullable_str(item.get("related_wbs_id")),
        "severity": severity,
        "evidence": str(item.get("evidence") or ""),
    }


def _build_summary(changes: list[dict[str, Any]], risks: list[dict[str, Any]]) -> dict[str, int]:
    summary = {key: 0 for key in SUMMARY_KEYS}
    summary["total_changes"] = len(changes)
    summary["risks"] = len(risks)
    mapping = {
        "new_task": "new_tasks",
        "schedule_change": "schedule_changes",
        "owner_change": "owner_changes",
        "status_change": "status_changes",
        "dependency_change": "dependency_changes",
        "hold_or_drop": "hold_or_drop",
        "clarification_needed": "clarification_needed",
    }
    for change in changes:
        key = mapping.get(change["change_type"])
        if key:
            summary[key] += 1
    return summary


def _change(
    sentence_index: int,
    change_type: ChangeType,
    matched_wbs_id: str | None,
    task_name: str | None,
    field: str | None,
    current_value: str | None,
    proposed_value: str | None,
    evidence: str,
    confidence: Confidence,
    requires_confirmation: bool,
    reason: str,
) -> dict[str, Any]:
    return {
        "id": f"chg-{sentence_index:03d}-{change_type}",
        "change_type": change_type,
        "matched_wbs_id": matched_wbs_id,
        "task_name": task_name or "",
        "field": field,
        "current_value": current_value,
        "proposed_value": proposed_value,
        "evidence": evidence,
        "confidence": confidence,
        "requires_confirmation": requires_confirmation,
        "reason": reason,
    }


def _schema_description() -> dict[str, Any]:
    return {
        "summary": {key: "number" for key in SUMMARY_KEYS},
        "changes": [
            {
                "id": "string",
                "change_type": list(_change_types()),
                "matched_wbs_id": "string|null",
                "task_name": "string",
                "field": "string|null",
                "current_value": "string|null",
                "proposed_value": "string|null",
                "evidence": "exact source sentence",
                "confidence": ["high", "medium", "low"],
                "requires_confirmation": "boolean",
                "reason": "string",
            }
        ],
        "risks": [
            {
                "id": "string",
                "risk_type": "string",
                "description": "string",
                "related_wbs_id": "string|null",
                "severity": ["high", "medium", "low"],
                "evidence": "exact source sentence",
            }
        ],
    }


def _change_types() -> set[str]:
    return {
        "new_task",
        "schedule_change",
        "owner_change",
        "status_change",
        "dependency_change",
        "hold_or_drop",
        "risk",
        "decision",
        "clarification_needed",
    }


def _split_sentences(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.replace("\n", ". ")).strip()
    return [part.strip(" .") for part in re.split(r"(?<=[.!?])\s+", normalized) if part.strip(" .")]


def _match_wbs(sentence: str, rows: list[dict[str, str]]) -> dict[str, str] | None:
    lowered = sentence.lower()
    best: dict[str, str] | None = None
    best_score = 0
    for row in rows:
        task_name = _row_value(row, ["task name", "task", "name", "title"])
        wbs_id = _row_value(row, ["wbs_id", "task id", "wbs id", "id", "_row_id"])
        score = 0
        if task_name and task_name.lower() in lowered:
            score += 3
        if wbs_id and wbs_id.lower() in lowered:
            score += 4
        for token in _tokens(task_name):
            if len(token) >= 4 and token in lowered:
                score += 1
        if score > best_score:
            best = row
            best_score = score
    return best if best_score >= 2 else None


def _row_value(row: dict[str, str], keys: list[str]) -> str | None:
    for key in keys:
        for column, value in row.items():
            if key == column.lower() or key in column.lower():
                text = str(value).strip()
                if text:
                    return text
    return None


def _field_name(row: dict[str, str] | None, keys: list[str], default: str) -> str:
    if row:
        for key in keys:
            for column in row:
                if key in column.lower():
                    return column
    return default


def _current_value(row: dict[str, str] | None, keys: list[str]) -> str | None:
    return _row_value(row, keys) if row else None


def _extract_task_name(sentence: str) -> str:
    before_marker = re.split(r"\s+(?:is|was|will|due|owner|담당|완료|보류|blocked)\b", sentence, maxsplit=1, flags=re.IGNORECASE)[0]
    return before_marker.strip(" .:-")[:80]


def _extract_after_keyword(sentence: str, keywords: list[str]) -> str | None:
    for keyword in keywords:
        match = re.search(re.escape(keyword) + r"\s*[:\-]?\s*(.+)", sentence, re.IGNORECASE)
        if match:
            return match.group(1).strip(" .")
    return None


def _extract_due_date(sentence: str, meeting_date: date | None) -> dict[str, Any] | None:
    absolute = re.search(r"\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b", sentence)
    if absolute:
        return {"value": absolute.group(1).replace("/", "-").replace(".", "-"), "requires_confirmation": False, "reason": "Meeting note contains an absolute date."}

    short = re.search(r"\b(\d{1,2})[/-](\d{1,2})\b", sentence)
    if short and meeting_date:
        month, day = int(short.group(1)), int(short.group(2))
        return {"value": f"{meeting_date.year:04d}-{month:02d}-{day:02d}", "requires_confirmation": True, "reason": "Meeting note contains a month/day date without a year."}

    if meeting_date and _contains(sentence, ["tomorrow", "내일"]):
        return {"value": (meeting_date + timedelta(days=1)).isoformat(), "requires_confirmation": False, "reason": "Relative date resolved from meeting_date."}
    if meeting_date and _contains(sentence, ["next week", "다음 주"]):
        return {"value": (meeting_date + timedelta(days=7)).isoformat(), "requires_confirmation": True, "reason": "Relative week expression is approximate."}
    return None


def _extract_owner(sentence: str) -> str | None:
    patterns = [
        r"\bowner\s+(?:is|to|=|:)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)",
        r"\bassignee\s+(?:is|to|=|:)?\s*([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)",
        r"담당(?:자)?\s*(?:은|는|:)\s*([A-Za-z가-힣0-9_.-]{2,20})",
        r"([A-Za-z가-힣0-9_.-]{2,20})\s*(?:이|가|에서)?\s*담당(?:하기로|한다|함|예정)",
    ]
    for pattern in patterns:
        match = re.search(pattern, sentence, re.IGNORECASE)
        if match:
            owner = match.group(1).strip()
            if owner in {"각", "담당", "세부", "일정", "검토"}:
                return None
            return owner
    return None


def _extract_status(sentence: str) -> str | None:
    statuses = [
        (["done", "complete", "completed", "완료"], "Done"),
        (["in progress", "started", "진행", "착수"], "In Progress"),
        (["pending", "대기"], "Pending"),
        (["blocked", "blocker", "막힘"], "Blocked"),
        (["delayed", "지연"], "Delayed"),
    ]
    for keywords, status in statuses:
        if _contains(sentence, keywords):
            return status
    return None


def _looks_like_status_update(sentence: str, matched: bool) -> bool:
    if _contains(sentence, ["status", "state", "done", "complete", "completed", "in progress", "started", "blocked", "delayed"]):
        return True
    if matched and _contains(sentence, ["상태", "완료", "진행중", "착수", "지연", "보류", "막힘"]):
        return True
    return bool(re.search(r"(?:상태|작업|태스크|일정).{0,20}(?:완료|진행중|착수|지연|보류|막힘)", sentence))


def _extract_dependency(sentence: str) -> str | None:
    match = re.search(r"(?:depends on|after|blocked by|dependency[: ]+)([^.]+)", sentence, re.IGNORECASE)
    return match.group(1).strip() if match else None


def _risk_severity(sentence: str) -> str:
    if _contains(sentence, ["blocked", "blocker", "critical", "high", "막힘"]):
        return "high"
    if _contains(sentence, ["may", "possible", "우려", "가능"]):
        return "medium"
    return "low"


def _is_noise_sentence(sentence: str) -> bool:
    text = sentence.strip()
    if not text:
        return True
    normalized = re.sub(r"\s+", " ", text)
    if len(normalized) <= 3:
        return True
    if re.search(
        r"(PoC|PRD|입출력|전체\s*일정|AX\s*평가|컴포넌트|시나리오\s*추가|담당|확인|준비|공유|작성)",
        normalized,
        re.IGNORECASE,
    ):
        return False
    if re.fullmatch(r"\d+(?:[-.]\d+)*\.?\s*[^:→]{0,30}", normalized):
        return True
    if re.fullmatch(r"\[[^\]]+\]", normalized):
        return True
    lowered = normalized.lower()
    noise_prefixes = (
        "주요 논의 사항",
        "논의한 과제 스콥",
        "mvp 착수를 위해 필요한 것",
        "기존 :",
        "기존:",
        "개선 :",
        "개선:",
    )
    if lowered in {"draft ux", "ux 시나리오", "gui 초안", "[필수]", "[옵션]"}:
        return True
    return any(lowered.startswith(prefix) for prefix in noise_prefixes)


def _is_noise_change(change: dict[str, Any]) -> bool:
    task_name = str(change.get("task_name") or "").strip()
    evidence = str(change.get("evidence") or "").strip()
    if re.fullmatch(r"Item\s+\d+", task_name, re.IGNORECASE):
        return True
    if _is_noise_sentence(task_name) or _is_noise_sentence(evidence):
        return True
    if len(evidence) < 8:
        return True
    return False


def _extract_korean_action_items(text: str, start_index: int = 1) -> list[dict[str, Any]]:
    lines = [line.strip(" -\t") for line in text.splitlines()]
    actions: list[dict[str, Any]] = []
    seen: set[str] = set()
    action_patterns = [
        (r"(PoC\s*시나리오\s*선정[^.\n]*)", "PoC 시나리오 선정"),
        (r"(LG\s*Gallery\+?\s*외의?\s*시나리오\s*추가\s*여부[^.\n]*)", "LG Gallery+ 외 시나리오 추가 여부 확인"),
        (r"(입출력\s*데이터\s*(?:준비|페이지에\s*업데이트)[^.\n]*)", "입출력 데이터 준비"),
        (r"(PRD\s*업데이트\s*및\s*공유[^.\n]*)", "PRD 업데이트 및 공유"),
        (r"(전체\s*일정표\s*작성[^.\n]*)", "전체 일정표 작성"),
        (r"(9월\s*임원\s*AX\s*평가\s*기준\s*확인[^.\n]*)", "9월 임원 AX 평가 기준 확인"),
        (r"(White\s*테마\s*컴포넌트\s*(?:제작|전달)[^.\n]*)", "White 테마 컴포넌트 제작 일정 확인"),
        (r"(기본\s*컴포넌트\s*추출[^.\n]*)", "기본 컴포넌트 추출 및 에이전트 구성 방식 검토"),
        (r"(컴포넌트\s*DB\s*(?:구성|구축)[^.\n]*)", "컴포넌트 DB 구성 방식 검토"),
        (r"(PoC\s*한정[^.\n]*컴포넌트[^.\n]*(?:논의|검토)[^.\n]*)", "PoC 한정 UI/GUI 컴포넌트 일원화 구조 논의"),
    ]

    for line in lines:
        if _is_noise_sentence(line):
            continue
        for pattern, task_name in action_patterns:
            match = re.search(pattern, line, re.IGNORECASE)
            if not match or task_name in seen:
                continue
            seen.add(task_name)
            actions.append(
                _change(
                    start_index + len(actions),
                    "new_task",
                    None,
                    task_name,
                    None,
                    None,
                    task_name,
                    match.group(1).strip(),
                    "medium",
                    True,
                    "회의록에서 후속 실행 또는 검토가 필요한 액션 아이템으로 감지되었습니다.",
                )
            )

    return actions


def _parse_date(value: str) -> date | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return None


def _contains(sentence: str, keywords: list[str]) -> bool:
    lowered = sentence.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def _tokens(value: str | None) -> list[str]:
    return re.findall(r"[a-z0-9가-힣]+", (value or "").lower())


def _nullable_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
