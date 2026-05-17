"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  EyeOff,
  FileText,
  Flag,
  Hash,
  Info,
  Link2,
  RefreshCw,
  Search,
  Sparkles,
  StickyNote,
  Type,
  Upload,
  User,
  X
} from "lucide-react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import type { WbsColumnMapping, WbsUploadResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type FieldKey = keyof WbsColumnMapping;

const FIELD_META: Array<{
  key: FieldKey;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  required?: boolean;
  patterns: string[];
}> = [
  { key: "id", label: "WBS ID", hint: "작업 식별자", icon: Hash, required: true, patterns: ["wbs id", "wbs", "task id", "id", "code", "_row_id"] },
  { key: "task_name", label: "Task name", hint: "작업명", icon: Type, required: true, patterns: ["task", "name", "title", "작업"] },
  { key: "owner", label: "Owner", hint: "담당자", icon: User, required: true, patterns: ["owner", "assignee", "담당"] },
  { key: "due_date", label: "Due date", hint: "마감", icon: Calendar, required: true, patterns: ["due", "deadline", "end", "마감"] },
  { key: "status", label: "Status", hint: "상태", icon: Flag, required: true, patterns: ["status", "state", "상태"] },
  { key: "start_date", label: "Start date", hint: "시작일", icon: Calendar, patterns: ["start", "시작"] },
  { key: "dependency", label: "Depends on", hint: "의존성", icon: Link2, patterns: ["dependency", "depends", "predecessor", "의존"] },
  { key: "description", label: "Description", hint: "설명", icon: Type, patterns: ["description", "desc", "설명"] },
  { key: "notes", label: "Notes", hint: "비고", icon: StickyNote, patterns: ["notes", "memo", "comment", "비고", "메모"] }
];

function suggestMapping(wbs: WbsUploadResponse): WbsColumnMapping {
  const pick = (patterns: string[]) =>
    wbs.columns.find((column) => patterns.some((pattern) => column.toLowerCase().includes(pattern.toLowerCase()))) ?? "";

  return {
    id: pick(FIELD_META.find((field) => field.key === "id")!.patterns),
    task_name: pick(FIELD_META.find((field) => field.key === "task_name")!.patterns),
    description: pick(FIELD_META.find((field) => field.key === "description")!.patterns),
    owner: pick(FIELD_META.find((field) => field.key === "owner")!.patterns),
    start_date: pick(FIELD_META.find((field) => field.key === "start_date")!.patterns),
    due_date: pick(FIELD_META.find((field) => field.key === "due_date")!.patterns),
    status: pick(FIELD_META.find((field) => field.key === "status")!.patterns),
    dependency: pick(FIELD_META.find((field) => field.key === "dependency")!.patterns),
    notes: pick(FIELD_META.find((field) => field.key === "notes")!.patterns)
  };
}

function sampleValues(wbs: WbsUploadResponse | null, column: string) {
  if (!wbs || !column) return [];
  const values = wbs.rows_preview
    .map((row) => String(row[column] ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(values)).slice(0, 3);
}

function confidenceFor(index: number, mapped: boolean) {
  if (!mapped) return 41;
  return Math.max(65, 96 - index * 4);
}

export default function WbsUploadPage() {
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [wbs, setWbs] = useState<WbsUploadResponse | null>(null);
  const [mapping, setMapping] = useState<WbsColumnMapping | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function upload(selectedFile = file) {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      if (!projectId) throw new Error("Project id is missing.");
      const response = await api.uploadWbs(projectId, selectedFile);
      setWbs(response);
      setMapping(suggestMapping(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function saveMapping() {
    if (!wbs || !mapping) return;
    setSaving(true);
    setError(null);
    try {
      if (!projectId) throw new Error("Project id is missing.");
      await api.mapWbsColumns(projectId, mapping);
      router.push(routes.meetingNote(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mapping save failed.");
    } finally {
      setSaving(false);
    }
  }

  function updateMapping(key: FieldKey, value: string) {
    setMapping((current) => (current ? { ...current, [key]: value } : current));
  }

  const requiredFields = FIELD_META.filter((field) => field.required);
  const optionalFields = FIELD_META.filter((field) => !field.required);
  const mappedRequired = requiredFields.filter((field) => mapping?.[field.key]).length;
  const mappedTotal = FIELD_META.filter((field) => mapping?.[field.key]).length;
  const previewRows = wbs?.rows_preview.slice(0, 8) ?? [];
  const visibleColumns = useMemo(() => {
    if (!wbs) return [];
    const q = query.trim().toLowerCase();
    if (!q) return wbs.columns;
    return wbs.columns.filter((column) => column.toLowerCase().includes(q));
  }, [wbs, query]);

  return (
    <div className="fixed inset-0 z-50 flex bg-[#fafaf9] font-sans text-zinc-950">
      <AppSidebar projectId={projectId} pendingCount={0} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-zinc-200 bg-white px-8 pb-6 pt-5">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <nav className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
                <span>Projects</span>
                <span>/</span>
                <span>AI UX Review Agent</span>
                <span>/</span>
                <span>WBS</span>
                <span>/</span>
                <span className="text-zinc-700">Import</span>
              </nav>
              <h1 className="flex flex-wrap items-center gap-3 text-[22px] font-semibold leading-7 tracking-tight text-zinc-950">
                WBS Import
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11.5px] font-medium text-zinc-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#fd312e]" />
                  Project · AI UX Review Agent
                </span>
              </h1>
              <p className="mt-1 text-[13px] leading-5 text-zinc-500">
                기존 WBS 파일을 업로드하고 컬럼 매핑을 확인하세요. 매핑이 저장되면 회의록 기반 변경 후보를 받을 수 있어요.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                Template 다운로드
              </Button>
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs text-zinc-800 shadow-sm" onClick={() => router.push(routes.project(projectId))}>
                <X className="mr-1.5 h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button
                onClick={saveMapping}
                disabled={!wbs || mappedRequired < requiredFields.length || saving}
                className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save Mapping
                <kbd className="ml-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 sm:inline">⌘S</kbd>
              </Button>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-8 py-5 pb-24">
          <nav className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center rounded-xl border border-zinc-200 bg-white px-7 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <Step done number={1} label="Step 1" name="Upload File" />
            <div className="mx-4 h-px bg-zinc-200" />
            <Step active={!!wbs} number={2} label={wbs ? "Step 2 · 진행 중" : "Step 2"} name="Column Mapping" />
            <div className="mx-4 h-px bg-zinc-200" />
            <Step number={3} label="Step 3" name="Confirm & Save" />
          </nav>

          <section className="mt-5 flex items-center gap-4 rounded-xl border border-zinc-200 bg-white px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              className="hidden"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                if (selected) void upload(selected);
              }}
            />
            <div className="grid h-11 w-11 place-items-center rounded-lg border border-emerald-100 bg-emerald-50 text-emerald-700">
              <FileText className="h-5 w-5" />
              <span className="mt-[-4px] text-[9px] font-bold">{file?.name.toLowerCase().endsWith(".csv") ? "CSV" : "XLSX"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-zinc-950">{file?.name ?? "WBS 파일을 업로드하세요"}</p>
                {wbs && (
                  <Badge variant="success" className="border border-emerald-200">
                    <Check className="h-3 w-3" />
                    파일 검증 완료
                  </Badge>
                )}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {wbs ? (
                  <>
                    <span className="font-mono">{wbs.total_rows} rows</span>
                    <span>·</span>
                    <span className="font-mono">{wbs.columns.length} columns</span>
                    {file && (
                      <>
                        <span>·</span>
                        <span>{(file.size / 1024).toFixed(1)} KB</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>CSV 또는 XLSX 파일을 선택하면 첫 행과 컬럼 매핑을 미리 확인합니다.</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {wbs && (
                <button className="inline-flex h-8 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm">
                  <span className="text-zinc-400">Sheet</span>
                  WBS
                  <span className="text-zinc-400">1 / 1</span>
                </button>
              )}
              <Button variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs shadow-sm" onClick={() => fileInputRef.current?.click()}>
                {wbs ? <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                {wbs ? "Re-upload" : "Upload"}
              </Button>
              <Button variant="ghost" className="h-8 rounded-lg px-3 text-xs">
                <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                Preview 옵션
              </Button>
            </div>
          </section>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <section className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(420px,0.95fr)_minmax(520px,1.15fr)_360px]">
            <SourcePreview wbs={wbs} rows={previewRows} visibleColumns={visibleColumns} query={query} onQueryChange={setQuery} />
            <ColumnMappingPanel wbs={wbs} mapping={mapping} onChange={updateMapping} />
            <MappingStatusPanel wbs={wbs} mapping={mapping} mappedRequired={mappedRequired} mappedTotal={mappedTotal} />
          </section>
        </main>

        <div className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white shadow-[0_-8px_24px_-16px_rgba(15,23,42,0.20)]">
          <div className="flex items-center justify-between gap-6 px-8 py-3">
            <div className="flex shrink-0 items-center gap-3 text-[12.5px]">
              <span className={cn("grid h-5 w-5 place-items-center rounded-full", mappedRequired === requiredFields.length ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500")}>
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="font-medium text-zinc-900">필수 필드 {mappedRequired}개 모두 매핑</span>
              <span className="h-4 w-px bg-zinc-200" />
              <button type="button" className="text-zinc-500 hover:text-zinc-950">이전 매핑 불러오기</button>
              <button type="button" className="text-zinc-500 hover:text-zinc-950" onClick={() => wbs && setMapping(suggestMapping(wbs))}>매핑 초기화</button>
            </div>
            <p className="hidden min-w-0 items-center gap-1.5 truncate text-[11.5px] text-zinc-500 xl:flex">
              <Info className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              저장 시 매핑이 프로젝트에 적용되어 회의록 기반 변경 제안에 사용됩니다.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" className="h-9 rounded-lg border-zinc-200 bg-white px-3 text-xs" onClick={() => router.push(routes.project(projectId))}>
                <ChevronLeft className="mr-1.5 h-3.5 w-3.5" />
                이전 단계
              </Button>
              <Button variant="outline" className="h-9 rounded-lg border-zinc-200 bg-white px-3 text-xs">Save as draft</Button>
              <Button
                onClick={saveMapping}
                disabled={!wbs || mappedRequired < requiredFields.length || saving || uploading}
                className="h-[34px] rounded-lg bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800"
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Save Mapping & Continue
                <kbd className="ml-2 hidden rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-semibold opacity-90 sm:inline">⌘↵</kbd>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ number, label, name, done, active }: { number: number; label: string; name: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold", done && "border-zinc-950 bg-zinc-950 text-white", active && !done && "border-zinc-950 bg-white text-zinc-950", !done && !active && "border-zinc-300 text-zinc-400")}>
        {done ? <Check className="h-3.5 w-3.5" /> : number}
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-400">{label}</p>
        <p className="text-sm font-semibold text-zinc-950">{name}</p>
      </div>
    </div>
  );
}

function SourcePreview({
  wbs,
  rows,
  visibleColumns,
  query,
  onQueryChange
}: {
  wbs: WbsUploadResponse | null;
  rows: Record<string, string>[];
  visibleColumns: string[];
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
            <Hash className="h-3.5 w-3.5 text-zinc-500" />
            Source Preview
          </h2>
          <span className="text-[11.5px] font-medium text-zinc-400">first 8 rows</span>
        </div>
        <p className="mt-1 text-xs text-zinc-500">업로드된 시트의 첫 행이 컬럼 이름으로 인식됩니다.</p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="task · owner · 값 검색..." className="h-[30px] rounded-lg border-zinc-300 bg-white pl-8 text-xs shadow-none" />
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto">
        {!wbs ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center text-sm text-zinc-500">
            <Upload className="mb-3 h-8 w-8 text-zinc-300" />
            WBS 파일을 업로드하면 여기에서 원본 데이터를 확인할 수 있습니다.
          </div>
        ) : (
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-zinc-200">
                <th className="w-10 px-3 py-2 font-mono text-zinc-400">#</th>
                {visibleColumns.map((column) => (
                  <th key={column} className="min-w-[132px] px-3 py-2 font-semibold text-zinc-900">
                    <div className="space-y-1">
                      <span>{column}</span>
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
                        → Source column
                      </Badge>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 font-mono text-zinc-500">{rowIndex + 1}</td>
                  {visibleColumns.map((column) => (
                    <td key={column} className="max-w-[220px] truncate px-3 py-2 text-zinc-800">
                      {String(row[column] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {wbs && (
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          <span>
            Showing <b className="text-zinc-800">1-{Math.min(8, wbs.rows_preview.length)}</b> of {wbs.total_rows}
          </span>
          <span className="font-mono">1 / 1</span>
        </div>
      )}
    </div>
  );
}

function ColumnMappingPanel({
  wbs,
  mapping,
  onChange
}: {
  wbs: WbsUploadResponse | null;
  mapping: WbsColumnMapping | null;
  onChange: (key: FieldKey, value: string) => void;
}) {
  const requiredFields = FIELD_META.filter((field) => field.required);
  const optionalFields = FIELD_META.filter((field) => !field.required);
  const mappedRequired = requiredFields.filter((field) => mapping?.[field.key]).length;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-200 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
              <Sparkles className="h-3.5 w-3.5 text-zinc-500" />
              Column Mapping
            </h2>
            <p className="mt-1 text-xs text-zinc-500">AI가 자동 제안한 매핑입니다. 각 컬럼의 매칭 대상을 확인하고 필요 시 변경하세요.</p>
          </div>
          <div className="relative w-[220px] shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <Input placeholder="컬럼 / 필드 검색" className="h-[30px] rounded-lg border-zinc-300 bg-white pl-8 text-xs shadow-none" />
          </div>
        </div>
        <div className="mt-3 inline-flex rounded-lg bg-zinc-100 p-0.5">
          {[
            ["All", FIELD_META.length],
            ["Mapped", mapping ? FIELD_META.filter((field) => mapping[field.key]).length : 0],
            ["Needs review", FIELD_META.length - (mapping ? FIELD_META.filter((field) => mapping[field.key]).length : 0)]
          ].map(([label, count]) => (
            <span key={label} className={cn("inline-flex h-[26px] items-center gap-1 rounded-md px-2.5 text-xs font-medium", label === "All" ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500")}>
              {label} <b className="text-[10.5px] text-zinc-400">{count}</b>
            </span>
          ))}
        </div>
      </div>

      <div>
        <MappingGroup title="Required Fields" meta={`${mappedRequired} / ${requiredFields.length} 매핑됨`} fields={requiredFields} wbs={wbs} mapping={mapping} onChange={onChange} />
        <MappingGroup title="Optional Fields" meta={`${optionalFields.filter((field) => mapping?.[field.key]).length} / ${optionalFields.length} 매핑됨`} fields={optionalFields} wbs={wbs} mapping={mapping} onChange={onChange} />
      </div>
    </div>
  );
}

function MappingGroup({
  title,
  meta,
  fields,
  wbs,
  mapping,
  onChange
}: {
  title: string;
  meta: string;
  fields: typeof FIELD_META;
  wbs: WbsUploadResponse | null;
  mapping: WbsColumnMapping | null;
  onChange: (key: FieldKey, value: string) => void;
}) {
  return (
    <section className="border-b border-zinc-200 last:border-0">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">{title}</span>
        <span className="text-[11.5px] font-medium text-zinc-400">{meta}</span>
      </div>
      {fields.map((field, index) => {
        const selectedColumn = mapping?.[field.key] ?? "";
        const mapped = Boolean(selectedColumn);
        const values = sampleValues(wbs, selectedColumn);
        const confidence = confidenceFor(index, mapped);
        const Icon = field.icon;

        return (
          <div key={field.key} className={cn("grid grid-cols-[1fr_auto_250px_auto] items-center gap-4 border-t border-zinc-100 px-4 py-3", !mapped && "bg-amber-50/40")}>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-[10px] font-semibold text-zinc-500">{String.fromCharCode(65 + index)}</span>
                <span className="font-semibold text-sm text-zinc-950">{field.label}</span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{field.hint}</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {values.length > 0 ? values.map((value) => <span key={value} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600">{value}</span>) : <span className="text-[11.5px] text-zinc-400">샘플 값 없음</span>}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-400" />
            <div>
              <label className="relative block">
                <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <select
                  value={selectedColumn}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  disabled={!wbs}
                  className="h-9 w-full appearance-none rounded-lg border border-zinc-200 bg-white pl-8 pr-8 text-sm text-zinc-800 shadow-sm outline-none disabled:bg-zinc-50 disabled:text-zinc-400"
                >
                  <option value="">Ignored · 가져오지 않음</option>
                  {wbs?.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                </select>
              </label>
              <p className="mt-1 text-[11.5px] text-zinc-500">
                {mapped ? `AI suggested ${confidence}% · ${confidence >= 80 ? "High" : "Medium"}` : "No suggestion"}
              </p>
            </div>
            <Badge variant={mapped ? "success" : "warning"} className="justify-center border border-current/10">
              {mapped ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              {mapped ? "Matched" : "Review"}
            </Badge>
          </div>
        );
      })}
    </section>
  );
}

function MappingStatusPanel({
  wbs,
  mapping,
  mappedRequired,
  mappedTotal
}: {
  wbs: WbsUploadResponse | null;
  mapping: WbsColumnMapping | null;
  mappedRequired: number;
  mappedTotal: number;
}) {
  const requiredFields = FIELD_META.filter((field) => field.required);
  const optionalFields = FIELD_META.filter((field) => !field.required);
  const total = FIELD_META.length;
  const progress = total ? Math.round((mappedTotal / total) * 100) : 0;

  return (
    <aside className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="border-b border-zinc-200 px-4 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950">
          <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />
          Mapping Status
        </h2>
        <p className="mt-2 text-xs text-zinc-500">필수 필드와 매핑 결과를 확인하세요.</p>
      </div>
      <div className="space-y-5 px-4 py-4">
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">전체 매핑</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[30px] font-semibold leading-none tracking-tight text-zinc-950 tabular-nums">{mappedTotal}</span>
            <span className="text-sm text-zinc-500">/ {wbs ? wbs.columns.length : total} columns mapped</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full bg-emerald-700" style={{ width: `${progress}%` }} />
          </div>
        </section>

        <StatusGroup title={`필수 필드 · ${mappedRequired} / ${requiredFields.length}`} fields={requiredFields} mapping={mapping} />
        <StatusGroup title={`선택 필드 · ${optionalFields.filter((field) => mapping?.[field.key]).length} / ${optionalFields.length}`} fields={optionalFields} mapping={mapping} optional />

        <section className="space-y-2 border-t border-zinc-200 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">이슈 · {requiredFields.length - mappedRequired}</p>
          {mappedRequired < requiredFields.length ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[12.5px] leading-5 text-amber-800">
              <AlertCircle className="mr-1 inline h-3.5 w-3.5" />
              필수 WBS 필드와 일치하지 않은 항목이 있습니다. 저장 전 매핑을 지정해 주세요.
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12.5px] leading-5 text-emerald-800">
              <Check className="mr-1 inline h-3.5 w-3.5" />
              필수 필드가 모두 매핑되었습니다.
            </div>
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-center">
          <div className="mx-auto mb-3 grid h-8 w-8 place-items-center rounded-lg bg-zinc-950 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-950">AI suggested mapping</h3>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            샘플 값과 컬럼명을 분석해 자동 매핑을 제안했습니다. 매핑은 프로젝트 단위로 저장됩니다.
          </p>
        </section>
      </div>
    </aside>
  );
}

function StatusGroup({
  title,
  fields,
  mapping,
  optional
}: {
  title: string;
  fields: typeof FIELD_META;
  mapping: WbsColumnMapping | null;
  optional?: boolean;
}) {
  return (
    <section className="space-y-3 border-t border-zinc-200 pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-zinc-500">{title}</p>
      <div className="space-y-3">
        {fields.map((field, index) => {
          const mapped = Boolean(mapping?.[field.key]);
          return (
            <div key={field.key} className="flex items-center gap-3 text-sm">
              <span className={cn("grid h-4 w-4 place-items-center rounded-full border text-[10px]", mapped ? "border-emerald-200 bg-emerald-50 text-emerald-700" : optional ? "border-zinc-200 bg-zinc-50 text-zinc-400" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {mapped ? <Check className="h-3 w-3" /> : "!"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-950">
                  {field.label} {field.required && <span className="text-red-500">*</span>}
                </p>
                <p className="truncate text-[11.5px] text-zinc-400">← {mapping?.[field.key] || "미매핑"}</p>
              </div>
              <span className="text-[11.5px] text-zinc-500 tabular-nums">{mapped ? `${confidenceFor(index, true)}%` : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
