# SQLite Storage

The backend uses `sqlite3` consistently.

- Connection and initialization: `backend/app/database.py`
- Table schema: `backend/app/models.py`
- Tables are created automatically on FastAPI startup through `init_db()`.

## Tables

### projects

- id
- name
- description
- created_at
- updated_at

### wbs_rows

- id
- project_id
- wbs_id
- task_name
- description
- owner
- start_date
- due_date
- status
- dependency
- notes
- raw_json
- created_at
- updated_at

### meetings

- id
- project_id
- meeting_title
- meeting_date
- meeting_note
- summary_json
- created_at

### change_candidates

- id
- project_id
- meeting_id
- change_type
- matched_wbs_id
- task_name
- field
- current_value
- proposed_value
- evidence
- confidence
- requires_confirmation
- reason
- status
- created_at
- updated_at

### risks

- id
- project_id
- meeting_id
- related_wbs_id
- risk_type
- description
- severity
- evidence
- status
- created_at

### change_history

- id
- project_id
- changed_at
- change_type
- wbs_id
- task_name
- field
- old_value
- new_value
- evidence
- confidence
- applied_by

