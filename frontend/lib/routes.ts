export function withProjectId(path: string, _projectId?: string | number) {
  return path;
}

export const routes = {
  project: (projectId?: string | number) => withProjectId("/project", projectId),
  wbs: (projectId?: string | number) => withProjectId("/wbs", projectId),
  upload: (projectId?: string | number) => withProjectId("/upload", projectId),
  meetingNote: (projectId?: string | number) => withProjectId("/meeting-note", projectId),
  history: (projectId?: string | number) => withProjectId("/history", projectId)
};
