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


def analyze_meeting_note(
    meeting_date: str,
    meeting_title: str,
    meeting_note: str,
    current_wbs_rows: list[dict[str, str]],
) -> dict[str, Any]:
    if not settings.mock_analysis and settings.openai_api_key:
        try:
            return _normalize_analysis(
                _analyze_with_openai(meeting_date, meeting_title, meeting_note, current_wbs_rows),
                current_wbs_rows,
            )
        except Exception:
            pass
    return _analyze_with_rules(meeting_date, meeting_title, meeting_note, current_wbs_rows)


def _analyze_with_openai(
    meeting_date: str,
    meeting_title: str,
    meeting_note: str,
    current_wbs_rows: list[dict[str, str]],
) -> dict[str, Any]:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    prompt = {
        "meeting_date": meeting_date,
        "meeting_title": meeting_title,
        "meeting_note": meeting_note,
        "current_wbs_rows": current_wbs_rows[:120],
        "output_schema": _schema_description(),
        "rules": [
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
) -> dict[str, Any]:
    sentences = _split_sentences(meeting_note)
    changes: list[dict[str, Any]] = []
    risks: list[dict[str, Any]] = []
    parsed_meeting_date = _parse_date(meeting_date)

    for index, sentence in enumerate(sentences, start=1):
        match = _match_wbs(sentence, current_wbs_rows)
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

    return _normalize_analysis({"summary": {}, "changes": changes, "risks": risks}, current_wbs_rows)


def _normalize_analysis(raw: dict[str, Any], current_wbs_rows: list[dict[str, str]]) -> dict[str, Any]:
    changes = [_normalize_change(item, idx) for idx, item in enumerate(raw.get("changes", []), start=1) if isinstance(item, dict)]
    risks = [_normalize_risk(item, idx) for idx, item in enumerate(raw.get("risks", []), start=1) if isinstance(item, dict)]
    return {"summary": _build_summary(changes, risks), "changes": changes, "risks": risks}


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
        r"담당(?:자)?\s*(?:은|는|:)?\s*([A-Za-z가-힣0-9_.-]{2,20})",
    ]
    for pattern in patterns:
        match = re.search(pattern, sentence, re.IGNORECASE)
        if match:
            return match.group(1).strip()
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


def _extract_dependency(sentence: str) -> str | None:
    match = re.search(r"(?:depends on|after|blocked by|dependency[: ]+)([^.]+)", sentence, re.IGNORECASE)
    return match.group(1).strip() if match else None


def _risk_severity(sentence: str) -> str:
    if _contains(sentence, ["blocked", "blocker", "critical", "high", "막힘"]):
        return "high"
    if _contains(sentence, ["may", "possible", "우려", "가능"]):
        return "medium"
    return "low"


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
