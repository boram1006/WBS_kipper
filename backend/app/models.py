SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wbs_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    wbs_id TEXT NOT NULL,
    task_name TEXT NOT NULL,
    description TEXT,
    owner TEXT,
    start_date TEXT,
    due_date TEXT,
    status TEXT,
    dependency TEXT,
    notes TEXT,
    raw_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    meeting_title TEXT NOT NULL,
    meeting_date TEXT NOT NULL,
    meeting_note TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS change_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    meeting_id INTEGER NOT NULL,
    change_type TEXT NOT NULL,
    matched_wbs_id TEXT,
    task_name TEXT NOT NULL,
    field TEXT,
    current_value TEXT,
    proposed_value TEXT,
    proposed_wbs_id TEXT,
    proposed_description TEXT,
    proposed_owner TEXT,
    proposed_start_date TEXT,
    proposed_due_date TEXT,
    proposed_status TEXT,
    proposed_dependency TEXT,
    proposed_notes TEXT,
    evidence TEXT NOT NULL,
    confidence TEXT NOT NULL,
    requires_confirmation INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'applied', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    meeting_id INTEGER,
    related_wbs_id TEXT,
    risk_type TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL,
    evidence TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id),
    FOREIGN KEY(meeting_id) REFERENCES meetings(id)
);

CREATE TABLE IF NOT EXISTS wbs_milestones (
    id TEXT NOT NULL,
    project_id BIGINT NOT NULL,
    label TEXT NOT NULL,
    date TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, id),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS wbs_groups (
    group_key TEXT NOT NULL,
    project_id BIGINT NOT NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, group_key),
    FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS change_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    change_type TEXT NOT NULL,
    wbs_id TEXT,
    task_name TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    evidence TEXT NOT NULL,
    confidence TEXT NOT NULL,
    applied_by TEXT NOT NULL DEFAULT 'system',
    FOREIGN KEY(project_id) REFERENCES projects(id)
);
"""


WBS_FIELDS = [
    "wbs_id",
    "task_name",
    "description",
    "owner",
    "start_date",
    "due_date",
    "status",
    "dependency",
    "notes",
]

