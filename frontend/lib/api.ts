import type {
  ApplyChangesResponse,
  ChangeHistoryResponse,
  DemoStartResponse,
  MeetingAnalyzeRequest,
  MeetingAnalyzeResponse,
  PendingChangesResponse,
  ProjectCreateRequest,
  ProjectResponse,
  WbsColumnMapping,
  WbsMapColumnsResponse,
  WbsUploadResponse
} from "@/lib/types";

const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

function apiBase() {
  if (CONFIGURED_API_BASE) return CONFIGURED_API_BASE;
  if (typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return "http://localhost:8000";
  }
  return "https://wbs-kipper-api.onrender.com";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.text();
}

export const api = {
  createProject: (payload: ProjectCreateRequest) =>
    request<ProjectResponse>("/api/projects", { method: "POST", body: JSON.stringify(payload) }),

  startDemo: () => request<DemoStartResponse>("/api/demo/start", { method: "POST" }),

  uploadWbs: (projectId: string | number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<WbsUploadResponse>(`/api/projects/${projectId}/wbs/upload`, { method: "POST", body: form });
  },

  mapWbsColumns: (projectId: string | number, mapping: WbsColumnMapping) =>
    request<WbsMapColumnsResponse>(`/api/projects/${projectId}/wbs/map-columns`, {
      method: "POST",
      body: JSON.stringify({ mapping })
    }),

  getWbs: (projectId: string | number) => request<WbsUploadResponse>(`/api/projects/${projectId}/wbs`),

  analyzeMeeting: (projectId: string | number, payload: MeetingAnalyzeRequest) =>
    request<MeetingAnalyzeResponse>(`/api/projects/${projectId}/meetings/analyze`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  getPendingChanges: (projectId: string | number) =>
    request<PendingChangesResponse>(`/api/projects/${projectId}/changes/pending`),

  applyChanges: (projectId: string | number, changeIds: string[]) =>
    request<ApplyChangesResponse>(`/api/projects/${projectId}/changes/apply`, {
      method: "POST",
      body: JSON.stringify({ change_ids: changeIds })
    }),

  getHistory: (projectId: string | number) => request<ChangeHistoryResponse>(`/api/projects/${projectId}/history`),

  downloadWbsCsvText: (projectId: string | number) => requestText(`/api/projects/${projectId}/wbs/download`),

  downloadWbsUrl: (projectId: string | number) => `${apiBase()}/api/projects/${projectId}/wbs/download`
};
