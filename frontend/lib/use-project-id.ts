"use client";

import { useEffect, useState } from "react";

const ACTIVE_PROJECT_ID_KEY = "wbs_keeper_active_project_id";
const DEFAULT_PROJECT_ID = "1";

export function setActiveProjectId(projectId: string | number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_PROJECT_ID_KEY, String(projectId));
}

export function getActiveProjectId() {
  if (typeof window === "undefined") return DEFAULT_PROJECT_ID;
  return window.localStorage.getItem(ACTIVE_PROJECT_ID_KEY) || DEFAULT_PROJECT_ID;
}

export function useProjectIdFromQuery() {
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);

  useEffect(() => {
    const idFromUrl = new URLSearchParams(window.location.search).get("id");
    if (idFromUrl) {
      setActiveProjectId(idFromUrl);
      setProjectId(idFromUrl);
      return;
    }
    setProjectId(getActiveProjectId());
  }, []);

  return projectId;
}
