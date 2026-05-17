# WBS Update Agent MVP

Meeting-note based WBS update review app built with Next.js and FastAPI.

The MVP is intentionally review-first:

- Meeting notes are analyzed into change candidates.
- Changes are never applied automatically.
- Every candidate shows evidence, before/after values, confidence, and `requires_confirmation`.
- Only checked candidates are applied to the latest WBS.
- Applied changes are stored in history.
- The latest WBS can be downloaded as CSV.

## Tech Stack

Frontend:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui-style local components
- TanStack Table
- React Hook Form
- Zod

Backend:

- Python FastAPI
- pandas
- openpyxl
- pydantic
- OpenAI SDK
- SQLite

## Project Structure

```text
backend/
  app/
    main.py          # FastAPI routes
    schemas.py       # Pydantic request/response contracts
    database.py      # SQLite connection and automatic table creation
    models.py        # SQLite table schema
    services/
      meeting_analyzer.py # OpenAI or mock/rule meeting analysis
      ai.py          # Backward-compatible wrapper
      wbs.py         # CSV/XLSX parsing and CSV export
frontend/
  app/               # Next.js App Router pages
  components/        # UI and table components
  lib/
    api.ts           # Frontend API client
    types.ts         # TypeScript request/response contracts
docs/
  API_CONTRACT.md
sample-wbs.csv
sample_wbs.csv
sample_meeting.txt
sample-meeting-note.txt
```

## Environment Files

Backend:

```powershell
cd backend
Copy-Item .env.example .env
```

`backend/.env.example`:

```env
OPENAI_API_KEY=
DATABASE_URL=sqlite:///./wbs_agent.db
CORS_ORIGINS=http://localhost:3000
MOCK_ANALYSIS=true
```

Frontend:

```powershell
cd frontend
Copy-Item .env.example .env.local
```

`frontend/.env.example`:

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Run Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Shortcut:

```powershell
cd backend
.\run-dev.ps1
```

Backend health check:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

## Run Frontend

Open a second terminal:

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Shortcut:

```powershell
cd frontend
.\run-dev.ps1
```

Frontend URL:

- `http://localhost:3000`

## Deploy Without Local Servers

Recommended MVP deployment:

- Frontend: Vercel
- Backend: Render Web Service
- Database: SQLite in the Render Free service filesystem

This keeps the demo URL always available, so you do not need to start the frontend and backend in separate local terminals.

### 1. Deploy Backend To Render

1. Push this repository to GitHub.
2. In Render, create a new `Blueprint` from this repository. The included `render.yaml` creates `wbs-kipper-api`.
3. Confirm these environment variables. `PYTHON_VERSION=3.12.8` is pinned so Render does not build the backend with Python 3.14, which can break `pydantic-core` installation.

```env
PYTHON_VERSION=3.12.8
MOCK_ANALYSIS=true
DATABASE_URL=sqlite:///./wbs_agent.db
CORS_ORIGINS=https://your-vercel-app.vercel.app
OPENAI_API_KEY=
```

4. After deployment, confirm:

- `https://your-render-api.onrender.com/health`
- `https://your-render-api.onrender.com/docs`

Render Free does not support persistent disks. With `sqlite:///./wbs_agent.db`, SQLite works for the MVP demo, but data persistence is not guaranteed after redeploys, restarts, or instance replacement.

If permanent storage is needed later, move the backend database to a Render paid persistent disk, PostgreSQL, Supabase, or Neon.

### 2. Deploy Frontend To Vercel

1. Import the same GitHub repository in Vercel.
2. Set the Vercel project root directory to `frontend`.
3. Keep the Vercel framework preset as `Next.js`.
4. Set Output Directory to `out`. The frontend uses Next.js static export to avoid server build tracing.
5. Add this environment variable:

```env
NEXT_PUBLIC_API_BASE_URL=https://your-render-api.onrender.com
```

6. Deploy the frontend.
7. Copy the Vercel URL and update the Render backend `CORS_ORIGINS` value to that URL.

After this, use the Vercel URL for demos instead of `localhost:3000`.

## Tests And Checks

Backend tests use pytest:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pytest
```

Frontend type/build check:

```powershell
cd frontend
npm install
npm run typecheck
npm run build
```

On Windows PowerShell, use `npm.cmd run build` if script execution policy blocks `npm`.

## Recommended Test Flow

1. Open `http://localhost:3000`.
2. Create a project.
3. Open the created project.
4. Go to `WBS Upload`.
5. Upload `sample-wbs.csv`.
6. Save the suggested column mapping.
7. Go to `Meeting Note Input`.
8. Paste the contents of `sample-meeting-note.txt`.
9. Analyze the meeting note.
10. Review pending changes.
11. Check only the changes to approve.
12. Apply selected changes.
13. Check `Change History`.
14. Download the latest WBS CSV.

## 3-Minute Demo Scenario

Fast path:

1. Open `http://localhost:3000`.
2. Click `샘플 데이터로 시작하기`.
3. The app creates a demo project, loads `sample_wbs.csv`, loads `sample_meeting.txt`, analyzes the meeting note, and shows the generated project card.
4. Open the generated project and continue to the review screen.

Presenter flow:

1. Project creation: show the generated `Demo - WBS Update Agent MVP` project.
2. WBS upload: explain that `sample_wbs.csv` contains a realistic MVP project WBS with discovery, API, upload, analyzer, review, apply, export, QA, demo, and handoff tasks.
3. Meeting note input: explain that `sample_meeting.txt` includes status, owner, schedule, dependency, hold/drop, new task, decision, and risk statements.
4. AI analysis result: open `Update Review` and point out evidence, before/after values, confidence, and confirmation flags.
5. Change candidate review: select only the candidates to approve.
6. Apply approved items: click `Apply Selected`; unchecked items stay pending.
7. Change history: open `Change History` and show applied changes with old/new values.
8. Latest WBS download: click CSV download and confirm the latest WBS export includes approved updates only.

## API Contract

The frontend calls only these backend APIs:

- `POST /api/projects`
- `POST /api/projects/{project_id}/wbs/upload`
- `POST /api/projects/{project_id}/wbs/map-columns`
- `POST /api/projects/{project_id}/meetings/analyze`
- `GET /api/projects/{project_id}/changes/pending`
- `POST /api/projects/{project_id}/changes/apply`
- `GET /api/projects/{project_id}/history`
- `GET /api/projects/{project_id}/wbs/download`

Contract locations:

- Backend Pydantic models: `backend/app/schemas.py`
- Frontend TypeScript types: `frontend/lib/types.ts`
- Contract summary: `docs/API_CONTRACT.md`
- SQLite storage summary: `docs/DATABASE.md`

## Current Features

- Create project
- Upload CSV/XLSX WBS
- Store WBS in SQLite
- Save WBS column mapping
- Analyze meeting note into candidate changes
- Show evidence, before/after, confidence, and confirmation flag
- Apply only selected changes
- Apply new tasks, schedule, owner, status, dependency, hold/drop, and risk changes with type-specific rules
- Save change history
- Download latest WBS CSV
- CORS configured for `http://localhost:3000`

## Mock Features

The analysis step is mock/rule-based by default.

- `MOCK_ANALYSIS=true`: uses local rule-based analysis. No OpenAI key required.
- `MOCK_ANALYSIS=false` and `OPENAI_API_KEY` set: attempts OpenAI analysis.
- If OpenAI analysis fails, the backend falls back to local rule-based analysis.

The current mock analyzer recognizes simple status, owner, due date, and risk phrases from the meeting note. It is meant to verify the full app flow without external API access.
