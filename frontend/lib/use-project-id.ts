"use client";

import { useEffect, useState } from "react";

export function useProjectIdFromQuery() {
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    setProjectId(new URLSearchParams(window.location.search).get("id") ?? "");
  }, []);

  return projectId;
}
