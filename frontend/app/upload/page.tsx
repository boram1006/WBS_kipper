"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Info,
  Play,
  Plus,
  Sparkles,
  Table2,
  Trash2,
  Upload
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { setActiveProjectId, useProjectIdFromQuery } from "@/lib/use-project-id";
import { cn } from "@/lib/utils";

type StandardColumn = {
  key: keyof WbsEditableRow;
  label: string;
  required: boolean;
  description: string;
};

type WbsEditableRow = {
  clientId: string;
  wbs_id: string;
  task_name: string;
  description: string;
  owner: string;
  start_date: string;
  due_date: string;
  status: string;
  dependency: string;
  notes: string;
};

type ValidationStatus = "empty" | "valid" | "needs_fix" | "missing_required";

const STATUS_OPTIONS = ["예정", "진행중", "완료", "지연", "보류"];
const REQUIRED_FIELDS: Array<keyof WbsEditableRow> = ["wbs_id", "task_name", "due_date", "status"];

const STANDARD_COLUMNS: StandardColumn[] = [
  { key: "wbs_id", label: "WBS ID", required: true, description: "Stable task identifier" },
  { key: "task_name", label: "Task name", required: true, description: "Work item title" },
  { key: "description", label: "Description", required: false, description: "Short task context" },
  { key: "owner", label: "Owner", required: false, description: "Person or team responsible" },
  { key: "start_date", label: "Start date", required: false, description: "YYYY-MM-DD" },
  { key: "due_date", label: "Due date", required: true, description: "YYYY-MM-DD" },
  { key: "status", label: "Status", required: true, description: "Planned, in progress, done, held" },
  { key: "dependency", label: "Dependency", required: false, description: "Preceding WBS ID" },
  { key: "notes", label: "Notes", required: false, description: "Extra context for review" }
];

const STANDARD_COLUMN_KEYS = STANDARD_COLUMNS.map((column) => column.key);

const SAMPLE_ROWS = [
  ["1.1", "요구사항 정리", "프로젝트 요구사항 초안 작성", "보람", "2026-05-13", "2026-05-17", "진행중", "", ""],
  ["1.2", "UX 시나리오 작성", "주요 사용자 플로우 정의", "보람", "2026-05-16", "2026-05-20", "예정", "1.1", ""],
  ["1.3", "GUI 초안 생성", "Figma 기반 화면 초안 생성", "디자인팀", "2026-05-20", "2026-05-24", "예정", "1.2", ""],
  ["1.4", "개발 구현", "Next.js + FastAPI MVP 개발", "개발팀", "2026-05-24", "2026-05-31", "예정", "1.3", ""],
  ["1.5", "QA 및 리뷰", "기능 검수 및 피드백 반영", "QA팀", "2026-06-01", "2026-06-05", "예정", "1.4", ""]
];

function createClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowFromValues(values: string[]): WbsEditableRow {
  return {
    clientId: createClientId(),
    wbs_id: values[0] ?? "",
    task_name: values[1] ?? "",
    description: values[2] ?? "",
    owner: values[3] ?? "",
    start_date: values[4] ?? "",
    due_date: values[5] ?? "",
    status: values[6] ?? "예정",
    dependency: values[7] ?? "",
    notes: values[8] ?? ""
  };
}

function emptyRow(nextIndex: number): WbsEditableRow {
  return rowFromValues([`1.${nextIndex}`, "", "", "", "", "", "예정", "", ""]);
}

function escapeCsv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function rowsToCsv(rows: WbsEditableRow[]) {
  const body = rows.map((row) => STANDARD_COLUMN_KEYS.map((key) => escapeCsv(String(row[key] ?? ""))).join(","));
  return [STANDARD_COLUMN_KEYS.join(","), ...body].join("\r\n");
}

function buildTemplateCsv() {
  return [STANDARD_COLUMN_KEYS.join(","), ...SAMPLE_ROWS.map((row) => row.map(escapeCsv).join(","))].join("\r\n");
}

function csvFileFromRows(rows: WbsEditableRow[]) {
  return new File([`\uFEFF${rowsToCsv(rows)}`], "wbs-standard-template.csv", { type: "text/csv;charset=utf-8" });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row.map((value) => value.trim()));
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row.map((value) => value.trim()));
  return rows;
}

function normalizeUploadedRows(text: string) {
  const parsed = parseCsv(text.replace(/^\uFEFF/, ""));
  if (parsed.length === 0) return { columns: [] as string[], rows: [] as WbsEditableRow[] };
  const columns = parsed[0].map((column) => column.trim());
  const dataRows = parsed.slice(1).map((values) => {
    const raw = Object.fromEntries(columns.map((column, index) => [column, values[index] ?? ""]));
    return rowFromValues(STANDARD_COLUMN_KEYS.map((key) => raw[key] ?? ""));
  });
  return { columns, rows: dataRows };
}

function isIsoDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function rowErrors(row: WbsEditableRow) {
  const missing = REQUIRED_FIELDS.filter((field) => !String(row[field] ?? "").trim());
  const invalidDates = ["start_date", "due_date"].filter((field) => !isIsoDate(String(row[field as keyof WbsEditableRow] ?? "")));
  return { missing, invalidDates };
}

function validationFor(rows: WbsEditableRow[], uploadedColumns: string[]) {
  const missingRequiredColumns = uploadedColumns.length
    ? REQUIRED_FIELDS.filter((field) => !uploadedColumns.includes(field))
    : [];
  const unsupportedColumns = uploadedColumns.filter((column) => !STANDARD_COLUMN_KEYS.includes(column as keyof WbsEditableRow));
  const rowIssues = rows.map((row, index) => ({ rowIndex: index + 1, ...rowErrors(row) }));
  const invalidDateRows = rowIssues.filter((issue) => issue.invalidDates.length > 0).map((issue) => issue.rowIndex);
  const missingRequiredRows = rowIssues.filter((issue) => issue.missing.length > 0).map((issue) => issue.rowIndex);
  const requiredFound = uploadedColumns.length ? REQUIRED_FIELDS.length - missingRequiredColumns.length : REQUIRED_FIELDS.length;

  let status: ValidationStatus = "valid";
  if (rows.length === 0) status = "empty";
  else if (missingRequiredColumns.length > 0) status = "missing_required";
  else if (invalidDateRows.length > 0 || missingRequiredRows.length > 0) status = "needs_fix";

  return { status, missingRequiredColumns, unsupportedColumns, rowIssues, invalidDateRows, missingRequiredRows, requiredFound };
}

function statusBadge(status: ValidationStatus) {
  if (status === "valid") return { label: "Valid", variant: "success" as const };
  if (status === "missing_required") return { label: "Missing Required Columns", variant: "danger" as const };
  if (status === "needs_fix") return { label: "Needs Fix", variant: "warning" as const };
  return { label: "Draft", variant: "outline" as const };
}

export default function WbsSetupPage() {
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<WbsEditableRow[]>([]);
  const [uploadedColumns, setUploadedColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const validation = useMemo(() => validationFor(rows, uploadedColumns), [rows, uploadedColumns]);
  const badge = statusBadge(validation.status);
  const canSave = rows.length > 0 && validation.status === "valid";

  function downloadTemplate() {
    const blob = new Blob([`\uFEFF${buildTemplateCsv()}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wbs-standard-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function loadSample() {
    setRows(SAMPLE_ROWS.map(rowFromValues));
    setUploadedColumns([...STANDARD_COLUMN_KEYS]);
    setFileName("Sample WBS");
    setError(null);
    setMessage("Sample WBS loaded into the editable table. You can adjust rows before saving.");
  }

  async function handleFile(selectedFile: File | null) {
    setError(null);
    setMessage(null);
    if (!selectedFile) return;
    setFileName(selectedFile.name);

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv") {
      setUploadedColumns([]);
      setError("Please upload the standard CSV template. Custom Excel layouts are not supported in the MVP.");
      return;
    }

    try {
      const result = normalizeUploadedRows(await selectedFile.text());
      setUploadedColumns(result.columns);
      setRows(result.rows);
      const resultValidation = validationFor(result.rows, result.columns);
      if (resultValidation.missingRequiredColumns.length > 0) {
        setError(`This file is missing required columns: ${resultValidation.missingRequiredColumns.join(", ")}.`);
      } else if (resultValidation.status === "needs_fix") {
        setError("The file loaded into the editable table, but some rows need fixes before saving.");
      } else {
        setMessage("Template loaded into the editable table. Review or edit rows before saving.");
      }
    } catch {
      setUploadedColumns([]);
      setRows([]);
      setError("We could not read this file. Please use the standard WBS CSV template.");
    }
  }

  function addTask() {
    setRows((current) => [...current, emptyRow(current.length + 1)]);
    setMessage("New task row added. Fill the required fields before saving.");
    setError(null);
  }

  function updateRow(clientId: string, field: keyof WbsEditableRow, value: string) {
    setRows((current) => current.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row)));
  }

  function deleteRow(clientId: string) {
    setRows((current) => current.filter((row) => row.clientId !== clientId));
  }

  async function saveWbs(continueToMeeting = false) {
    if (!canSave) {
      setError("Fix required row fields before saving the WBS.");
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      let targetProjectId = projectId;
      const file = csvFileFromRows(rows);
      try {
        await api.uploadWbs(targetProjectId, file);
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        if (!detail.includes("Project not found") && !detail.includes("404")) throw err;
        const project = await api.createProject({
          name: "WBS Setup Project",
          description: "Created from the standard WBS setup table."
        });
        targetProjectId = String(project.id);
        setActiveProjectId(targetProjectId);
        await api.uploadWbs(targetProjectId, file);
      }
      setMessage("WBS saved successfully.");
      router.push(continueToMeeting ? routes.meetingNote(targetProjectId) : routes.wbs(targetProjectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this WBS. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={0} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-6 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>WBS Keeper</span>
                <span>/</span>
                <span className="text-zinc-700">WBS Setup</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-tight text-zinc-950">
                WBS Setup
                <Badge variant={badge.variant} className="border border-current/10">
                  {badge.label}
                </Badge>
              </h1>
              <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                Start with a standardized WBS template for reliable meeting-based updates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={downloadTemplate}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download Template
              </Button>
              <Button className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800" onClick={loadSample}>
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Use Sample WBS
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-8 py-5 pb-24">
          {(error || message) && (
            <div
              className={cn(
                "mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px] leading-5",
                error ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
              )}
            >
              {error ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{error ?? message}</span>
            </div>
          )}

          <StandardInfoCard />

          <section className="mt-5 grid gap-4 lg:grid-cols-3">
            <StartOption
              icon={Sparkles}
              title="Use Sample WBS"
              description="Load ready-made sample rows into the editable table."
              action={
                <Button className="h-9 rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800" onClick={loadSample}>
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Start with Sample WBS
                </Button>
              }
            />
            <StartOption
              icon={Download}
              title="Download Template"
              description="Download the standard WBS CSV template, fill it out, and upload it back."
              action={
                <Button variant="outline" className="h-9 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={downloadTemplate}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Download Template
                </Button>
              }
            />
            <StartOption
              icon={Upload}
              title="Upload Standard Template"
              description="Upload a WBS file created from the official template, then edit it here."
              action={
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[88px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center text-[12.5px] font-medium text-zinc-600 hover:border-zinc-400 hover:bg-white"
                  >
                    <Upload className="mb-2 h-5 w-5 text-zinc-500" />
                    {fileName ?? "Choose standard CSV template"}
                    <span className="mt-1 text-[11px] font-normal text-zinc-400">CSV only for MVP</span>
                  </button>
                </div>
              }
            />
          </section>

          <EditableWbsTable
            rows={rows}
            validation={validation}
            onAdd={addTask}
            onDelete={deleteRow}
            onUpdate={updateRow}
          />

          <section className="mt-5 grid items-start gap-4 xl:grid-cols-[minmax(520px,1fr)_390px]">
            <StandardColumnsCard />
            <ValidationCard validation={validation} rowCount={rows.length} />
          </section>
        </main>

        <div className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.20)]">
          <div className="flex items-center justify-between gap-6 px-8 py-3">
            <div className="flex min-w-0 items-center gap-3 text-[12.5px] text-zinc-500">
              <span className={cn("grid h-5 w-5 place-items-center rounded-full", canSave ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
                {canSave ? <Check className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
              </span>
              <span className="truncate">
                {canSave ? "Editable WBS is valid. Save it or continue to Meeting Input." : "Add rows or fix required fields before saving."}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" className="h-9 rounded-lg border-zinc-200 bg-white px-3 text-xs" onClick={() => void saveWbs(false)} disabled={!canSave || saving}>
                <Table2 className="mr-1.5 h-3.5 w-3.5" />
                Save WBS
              </Button>
              <Button className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800" onClick={() => void saveWbs(true)} disabled={!canSave || saving}>
                Continue to Meeting Input
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StandardInfoCard() {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-5 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-950">
            <Info className="h-4 w-4 text-zinc-500" />
            Use a standardized WBS format
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-zinc-500">
            To keep meeting-based updates reliable, WBS Keeper uses a standard WBS template. Merged cells, multi-row
            headers, and custom Excel formats are not supported in the MVP.
          </p>
        </div>
        <Badge variant="outline" className="rounded-lg border-zinc-200 px-2.5 py-1 text-[11.5px]">
          MVP template mode
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          "Standard columns are required",
          "Merged cells are not supported",
          "Custom Excel layouts will be supported later",
          "You can edit rows directly in WBS Keeper"
        ].map((item) => (
          <div key={item} className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 text-[12px] font-medium text-zinc-700">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function StartOption({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[188px] flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div>
        <span className="grid h-9 w-9 place-items-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="mt-3 text-sm font-semibold text-zinc-950">{title}</h2>
        <p className="mt-1 text-[12.5px] leading-5 text-zinc-500">{description}</p>
      </div>
      <div className="mt-4">{action}</div>
    </section>
  );
}

function EditableWbsTable({
  rows,
  validation,
  onAdd,
  onDelete,
  onUpdate
}: {
  rows: WbsEditableRow[];
  validation: ReturnType<typeof validationFor>;
  onAdd: () => void;
  onDelete: (clientId: string) => void;
  onUpdate: (clientId: string, field: keyof WbsEditableRow, value: string) => void;
}) {
  const issueMap = new Map(validation.rowIssues.map((issue) => [issue.rowIndex, issue]));

  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Table2 className="h-3.5 w-3.5 text-zinc-500" />
            Editable WBS Table
          </h2>
          <p className="mt-1 text-xs text-zinc-500">
            Add, edit, or delete standard WBS rows without reopening Excel. Dependency can reference an existing WBS ID.
          </p>
        </div>
        <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={onAdd}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add Task
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center text-sm text-zinc-500">
          <Table2 className="mb-3 h-8 w-8 text-zinc-300" />
          Start with sample rows, upload the standard template, or add a task manually.
          <Button variant="outline" className="mt-4 h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs" onClick={onAdd}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Task
          </Button>
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-[1460px] w-full border-collapse text-left text-[12px]">
            <thead className="bg-zinc-50 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-zinc-500">
              <tr className="border-b border-zinc-200">
                <th className="w-10 px-3 py-3">#</th>
                <th className="w-[96px] px-2 py-3">WBS ID*</th>
                <th className="w-[180px] px-2 py-3">Task name*</th>
                <th className="w-[230px] px-2 py-3">Description</th>
                <th className="w-[130px] px-2 py-3">Owner</th>
                <th className="w-[140px] px-2 py-3">Start date</th>
                <th className="w-[140px] px-2 py-3">Due date*</th>
                <th className="w-[110px] px-2 py-3">Status*</th>
                <th className="w-[130px] px-2 py-3">Dependency</th>
                <th className="w-[210px] px-2 py-3">Notes</th>
                <th className="w-[100px] px-2 py-3">Validation</th>
                <th className="w-12 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const issue = issueMap.get(index + 1);
                const hasError = Boolean(issue && (issue.missing.length > 0 || issue.invalidDates.length > 0));
                return (
                  <tr key={row.clientId} className={cn("border-b border-zinc-100 last:border-0", hasError && "bg-amber-50/40")}>
                    <td className="px-3 py-2 font-mono text-zinc-400">{index + 1}</td>
                    <td className="px-2 py-2">
                      <CellInput value={row.wbs_id} invalid={issue?.missing.includes("wbs_id")} onChange={(value) => onUpdate(row.clientId, "wbs_id", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput value={row.task_name} invalid={issue?.missing.includes("task_name")} onChange={(value) => onUpdate(row.clientId, "task_name", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput value={row.description} onChange={(value) => onUpdate(row.clientId, "description", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput value={row.owner} onChange={(value) => onUpdate(row.clientId, "owner", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput type="date" value={row.start_date} invalid={issue?.invalidDates.includes("start_date")} onChange={(value) => onUpdate(row.clientId, "start_date", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput type="date" value={row.due_date} invalid={issue?.missing.includes("due_date") || issue?.invalidDates.includes("due_date")} onChange={(value) => onUpdate(row.clientId, "due_date", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={row.status}
                        onChange={(event) => onUpdate(row.clientId, "status", event.target.value)}
                        className={cn(
                          "h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] font-medium text-zinc-800 outline-none focus:border-zinc-400",
                          issue?.missing.includes("status") && "border-amber-400 bg-amber-50"
                        )}
                      >
                        <option value="">Select</option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <CellInput value={row.dependency} placeholder="e.g. 1.1" onChange={(value) => onUpdate(row.clientId, "dependency", value)} />
                    </td>
                    <td className="px-2 py-2">
                      <CellInput value={row.notes} onChange={(value) => onUpdate(row.clientId, "notes", value)} />
                    </td>
                    <td className="px-2 py-2">
                      {hasError ? (
                        <Badge variant="warning" className="border border-amber-200">
                          Needs Fix
                        </Badge>
                      ) : (
                        <Badge variant="success" className="border border-emerald-200">
                          Valid
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => onDelete(row.clientId)}
                        className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-red-50 hover:text-red-700"
                        aria-label="Delete row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CellInput({
  value,
  onChange,
  invalid,
  type = "text",
  placeholder
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={cn("h-8 rounded-md border-zinc-200 px-2 text-[12px] shadow-none focus-visible:ring-1", invalid && "border-amber-400 bg-amber-50")}
    />
  );
}

function StandardColumnsCard() {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <ClipboardList className="h-3.5 w-3.5 text-zinc-500" />
            Standard column preview
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Only these columns are used for meeting-based WBS updates.</p>
        </div>
        <Badge variant="outline">{STANDARD_COLUMNS.length} columns</Badge>
      </div>
      <div className="grid gap-2 p-4 md:grid-cols-2 xl:grid-cols-3">
        {STANDARD_COLUMNS.map((column) => (
          <div key={column.key} className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-[12px] font-semibold text-zinc-950">{column.key}</p>
                <p className="mt-1 text-[11.5px] text-zinc-500">{column.description}</p>
              </div>
              <Badge variant={column.required ? "default" : "outline"} className={column.required ? "bg-zinc-950" : undefined}>
                {column.required ? "Required" : "Optional"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ValidationCard({ validation, rowCount }: { validation: ReturnType<typeof validationFor>; rowCount: number }) {
  const checks = [
    {
      label: "Required columns found",
      detail: `${validation.requiredFound} / ${REQUIRED_FIELDS.length}`,
      ok: validation.missingRequiredColumns.length === 0
    },
    {
      label: "Invalid date rows",
      detail: validation.invalidDateRows.length ? validation.invalidDateRows.join(", ") : "0",
      ok: validation.invalidDateRows.length === 0
    },
    {
      label: "Rows missing required fields",
      detail: validation.missingRequiredRows.length ? validation.missingRequiredRows.join(", ") : "0",
      ok: validation.missingRequiredRows.length === 0
    },
    {
      label: "Unsupported columns ignored",
      detail: validation.unsupportedColumns.length ? validation.unsupportedColumns.join(", ") : "0",
      ok: true
    },
    {
      label: "Ready to continue",
      detail: rowCount ? `${rowCount} rows` : "No rows yet",
      ok: validation.status === "valid"
    }
  ];
  const badge = statusBadge(validation.status);

  return (
    <aside className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />
            Validation Summary
          </h2>
          <p className="mt-1 text-xs text-zinc-500">Fix row issues before saving the WBS.</p>
        </div>
        <Badge variant={badge.variant} className="border border-current/10">
          {badge.label}
        </Badge>
      </div>
      <div className="divide-y divide-zinc-100">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-3 px-4 py-3">
            <span className={cn("grid h-5 w-5 place-items-center rounded-full", check.ok ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-400")}>
              {check.ok ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
            </span>
            <span className="flex-1 text-[12px] font-medium text-zinc-700">{check.label}</span>
            <span className="max-w-[160px] truncate text-right text-[11px] text-zinc-400">{check.detail}</span>
          </div>
        ))}
      </div>
      {validation.status === "needs_fix" && (
        <div className="border-t border-amber-100 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
          Required fields are WBS ID, task name, due date, and status. Dates must use YYYY-MM-DD.
        </div>
      )}
    </aside>
  );
}
