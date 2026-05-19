from pydantic import BaseModel, Field
from typing import Literal


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: str


class WbsUploadResponse(BaseModel):
    columns: list[str]
    rows_preview: list[dict[str, str]]
    total_rows: int


class WbsColumnMapping(BaseModel):
    id: str
    task_name: str
    description: str
    owner: str
    start_date: str
    due_date: str
    status: str
    dependency: str
    notes: str


class WbsMapColumnsRequest(BaseModel):
    mapping: WbsColumnMapping


class WbsMapColumnsResponse(BaseModel):
    mapping: WbsColumnMapping
    saved: bool


class MeetingAnalyzeRequest(BaseModel):
    meeting_date: str = Field(min_length=1)
    meeting_title: str = Field(min_length=1)
    meeting_note: str = Field(min_length=10)
    enabled_detection: dict[str, bool] | None = None
    auto_match: bool = True


class MeetingAnalysisSummary(BaseModel):
    total_changes: int
    new_tasks: int
    schedule_changes: int
    owner_changes: int
    status_changes: int
    dependency_changes: int
    hold_or_drop: int
    risks: int
    clarification_needed: int


class WbsChangeCandidate(BaseModel):
    id: str
    change_type: Literal[
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
    matched_wbs_id: str | None = None
    task_name: str
    field: str | None = None
    current_value: str | None = None
    proposed_value: str | None = None
    proposed_wbs_id: str | None = None
    proposed_description: str | None = None
    proposed_owner: str | None = None
    proposed_start_date: str | None = None
    proposed_due_date: str | None = None
    proposed_status: str | None = None
    proposed_dependency: str | None = None
    proposed_notes: str | None = None
    evidence: str
    confidence: Literal["high", "medium", "low"]
    requires_confirmation: bool
    reason: str
    status: str = "pending"


class MeetingAnalysisRisk(BaseModel):
    id: str
    risk_type: str
    description: str
    related_wbs_id: str | None = None
    severity: Literal["high", "medium", "low"]
    evidence: str


class MeetingAnalyzeResponse(BaseModel):
    meeting_id: int
    changes: list[WbsChangeCandidate]
    risks: list[MeetingAnalysisRisk]
    summary: MeetingAnalysisSummary


class PendingChangesResponse(BaseModel):
    changes: list[WbsChangeCandidate]


class ChangeCandidateUpdateRequest(BaseModel):
    matched_wbs_id: str | None = None
    task_name: str | None = None
    field: str | None = None
    current_value: str | None = None
    proposed_value: str | None = None
    proposed_wbs_id: str | None = None
    proposed_description: str | None = None
    proposed_owner: str | None = None
    proposed_start_date: str | None = None
    proposed_due_date: str | None = None
    proposed_status: str | None = None
    proposed_dependency: str | None = None
    proposed_notes: str | None = None


class ApplyChangesRequest(BaseModel):
    change_ids: list[str]


class WbsPreview(BaseModel):
    columns: list[str]
    rows_preview: list[dict[str, str]]
    total_rows: int


class ApplyChangesResponse(BaseModel):
    applied_count: int
    updated_wbs_preview: WbsPreview


class ChangeHistoryItem(BaseModel):
    id: int
    changed_at: str
    change_type: str
    wbs_id: str
    task_name: str
    field: str
    old_value: str | None = None
    new_value: str | None = None
    evidence: str
    confidence: str
    applied_by: str


class ChangeHistoryResponse(BaseModel):
    history: list[ChangeHistoryItem]
