export type ProjectCreateRequest = {
  name: string;
  description?: string;
};

export type ProjectResponse = {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
};

export type ProjectsResponse = {
  projects: ProjectResponse[];
};

export type WbsUploadResponse = {
  columns: string[];
  rows_preview: Record<string, string>[];
  total_rows: number;
};

export type WbsColumnMapping = {
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

export type WbsMapColumnsRequest = {
  mapping: WbsColumnMapping;
};

export type WbsMapColumnsResponse = {
  mapping: WbsColumnMapping;
  saved: boolean;
};

export type MeetingAnalyzeRequest = {
  meeting_date: string;
  meeting_title: string;
  meeting_note: string;
};

export type WbsChangeCandidate = {
  id: string;
  change_type: string;
  matched_wbs_id: string | null;
  task_name: string;
  field: string | null;
  current_value: string | null;
  proposed_value: string | null;
  proposed_wbs_id?: string | null;
  proposed_description?: string | null;
  proposed_owner?: string | null;
  proposed_start_date?: string | null;
  proposed_due_date?: string | null;
  proposed_status?: string | null;
  proposed_dependency?: string | null;
  proposed_notes?: string | null;
  evidence: string;
  confidence: "high" | "medium" | "low";
  requires_confirmation: boolean;
  reason: string;
  status: string;
};

export type MeetingRisk = {
  id: string;
  risk_type: string;
  description: string;
  related_wbs_id: string | null;
  severity: "high" | "medium" | "low";
  evidence: string;
};

export type MeetingAnalysisSummary = {
  total_changes: number;
  new_tasks: number;
  schedule_changes: number;
  owner_changes: number;
  status_changes: number;
  dependency_changes: number;
  hold_or_drop: number;
  risks: number;
  clarification_needed: number;
};

export type MeetingAnalyzeResponse = {
  meeting_id: number;
  changes: WbsChangeCandidate[];
  risks: MeetingRisk[];
  summary: MeetingAnalysisSummary;
};

export type PendingChangesResponse = {
  changes: WbsChangeCandidate[];
};

export type ApplyChangesRequest = {
  change_ids: string[];
};

export type WbsPreview = {
  columns: string[];
  rows_preview: Record<string, string>[];
  total_rows: number;
};

export type ApplyChangesResponse = {
  applied_count: number;
  updated_wbs_preview: WbsPreview;
};

export type ChangeHistoryItem = {
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

export type ChangeHistoryResponse = {
  history: ChangeHistoryItem[];
};

export type DemoStartResponse = {
  project: ProjectResponse;
  meeting_id: number;
  candidate_count: number;
  wbs: WbsUploadResponse;
  summary: MeetingAnalysisSummary;
};
