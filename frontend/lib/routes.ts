export function withProjectId(path: string, projectId: string | number) {
  return `${path}?id=${encodeURIComponent(String(projectId))}`;
}

export const routes = {
  project: (projectId: string | number) => withProjectId("/project", projectId),
  upload: (projectId: string | number) => withProjectId("/upload", projectId),
  meetingNote: (projectId: string | number) => withProjectId("/meeting-note", projectId),
  review: (projectId: string | number) => withProjectId("/review", projectId),
  history: (projectId: string | number) => withProjectId("/history", projectId)
};
