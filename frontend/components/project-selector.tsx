"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { ProjectResponse } from "@/lib/types";

type Props = {
  projectId: string;
  onChange: (projectId: string) => void;
  allowCreate?: boolean;
  preferDefaultProject?: boolean;
};

function projectLabel(project: ProjectResponse) {
  return project.name?.trim() || "webOS UX";
}

function uniqueProjectsByName(projects: ProjectResponse[], selectedProjectId: string) {
  const byName = new Map<string, ProjectResponse>();
  for (const project of projects) {
    const label = projectLabel(project);
    const existing = byName.get(label);
    if (!existing || String(project.id) === selectedProjectId) {
      byName.set(label, project);
    }
  }
  return Array.from(byName.values());
}

export function ProjectSelector({ projectId, onChange, allowCreate = true, preferDefaultProject = false }: Props) {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const defaultApplied = useRef(false);
  const visibleProjects = uniqueProjectsByName(projects, projectId);

  useEffect(() => {
    let alive = true;
    async function loadProjects() {
      try {
        const response = await api.getProjects();
        if (alive) {
          setProjects(response.projects);
          const selectedExists = response.projects.some((project) => String(project.id) === projectId);
          const hasSavedProject = window.localStorage.getItem("wbs_keeper_active_project_id");
          const defaultProject = response.projects.find((project) => project.name === "webOS UX") ?? response.projects[0];
          const shouldPreferDefault = preferDefaultProject && !defaultApplied.current && defaultProject && String(defaultProject.id) !== projectId;
          if (defaultProject && (shouldPreferDefault || !selectedExists || !hasSavedProject)) {
            defaultApplied.current = true;
            onChange(String(defaultProject.id));
          }
        }
      } catch {
        if (alive) setProjects([]);
      }
    }
    void loadProjects();
    return () => {
      alive = false;
    };
  }, [preferDefaultProject, projectId]);

  async function createProject() {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const project = await api.createProject({ name, description: "Created from WBS Keeper" });
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      onChange(String(project.id));
      setNewName("");
      setCreating(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={projectId}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 min-w-[220px] rounded-lg border border-zinc-200 bg-white px-3 text-[12.5px] font-medium text-zinc-800 outline-none focus:border-zinc-400"
      >
        {!visibleProjects.some((project) => String(project.id) === projectId) && <option value={projectId}>webOS UX</option>}
        {visibleProjects.map((project) => (
          <option key={project.id} value={project.id}>
            {projectLabel(project)}
          </option>
        ))}
      </select>

      {allowCreate && !creating && (
        <Button type="button" variant="outline" className="h-8 rounded-lg border-zinc-200 bg-white px-3 text-xs" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          새 프로젝트
        </Button>
      )}

      {allowCreate && creating && (
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="프로젝트 이름"
            className="h-8 w-[180px] rounded-lg border-zinc-200 text-xs"
          />
          <Button type="button" className="h-8 rounded-lg bg-zinc-950 px-3 text-xs text-white" disabled={loading || !newName.trim()} onClick={createProject}>
            생성
          </Button>
          <Button type="button" variant="ghost" className="h-8 rounded-lg px-2 text-xs" onClick={() => setCreating(false)}>
            취소
          </Button>
        </div>
      )}
    </div>
  );
}
