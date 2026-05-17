# API Contract

Backend Pydantic models live in `backend/app/schemas.py`.
Frontend TypeScript types live in `frontend/lib/types.ts`.

## 1. POST `/api/projects`

- Request: `ProjectCreateRequest`
- Response: `ProjectResponse`

```ts
type ProjectCreateRequest = { name: string; description?: string };
type ProjectResponse = { id: number; name: string; description?: string | null; created_at: string };
```

## 2. POST `/api/projects/{project_id}/wbs/upload`

- Multipart field: `file`
- Response: `WbsUploadResponse`

```ts
type WbsUploadResponse = {
  columns: string[];
  rows_preview: Record<string, string>[];
  total_rows: number;
};
```

## 3. POST `/api/projects/{project_id}/wbs/map-columns`

- Request: `WbsMapColumnsRequest`
- Response: `WbsMapColumnsResponse`

```ts
type WbsColumnMapping = {
  id: string;
  task_name: string;
  description: string;
  owner: string;
  start_date: string;
  due_date: string;
  status: string;
  dependency: string;
  notes: string;
};
```

## 4. POST `/api/projects/{project_id}/meetings/analyze`

- Request: `MeetingAnalyzeRequest`
- Response: `MeetingAnalyzeResponse`

```ts
type MeetingAnalyzeRequest = {
  meeting_date: string;
  meeting_title: string;
  meeting_note: string;
};

type MeetingAnalyzeResponse = {
  meeting_id: number;
  summary: MeetingAnalysisSummary;
  changes: WbsChangeCandidate[];
  risks: MeetingRisk[];
};

type WbsChangeCandidate = {
  id: string;
  change_type:
    | "new_task"
    | "schedule_change"
    | "owner_change"
    | "status_change"
    | "dependency_change"
    | "hold_or_drop"
    | "risk"
    | "decision"
    | "clarification_needed";
  matched_wbs_id: string | null;
  task_name: string;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
  requires_confirmation: boolean;
  reason: string;
  status: string;
};
```

## 5. GET `/api/projects/{project_id}/changes/pending`

- Response: `PendingChangesResponse`

## 6. POST `/api/projects/{project_id}/changes/apply`

- Request: `ApplyChangesRequest`
- Response: `ApplyChangesResponse`

```ts
type ApplyChangesRequest = { change_ids: string[] };
```

## 7. GET `/api/projects/{project_id}/history`

- Response: `ChangeHistoryResponse`

```ts
type ChangeHistoryItem = {
  id: number;
  changed_at: string;
  change_type: string;
  wbs_id: string;
  task_name: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  evidence: string;
  confidence: string;
  applied_by: string;
};
```

## 8. GET `/api/projects/{project_id}/wbs/download`

- Response: latest WBS CSV

## Demo. POST `/api/demo/start`

- Creates a sample project.
- Loads `sample_wbs.csv`.
- Loads and analyzes `sample_meeting.txt`.
- Response includes project, meeting id, candidate count, WBS preview, and analysis summary.
