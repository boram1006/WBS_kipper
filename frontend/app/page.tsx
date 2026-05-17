"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Play, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import type { ProjectResponse } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const schema = z.object({
  name: z.string().min(1, "Project name is required."),
  description: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "" }
  });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const project = await api.createProject(values);
      setProjects((current) => [project, ...current]);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project.");
    }
  }

  async function startDemo() {
    setDemoLoading(true);
    setError(null);
    try {
      const demo = await api.startDemo();
      setProjects((current) => [demo.project, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start demo.");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Create a project and review WBS update candidates.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Demo Flow</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Create a sample project with WBS rows and pre-analyzed meeting note candidates.
          </p>
          <Button type="button" onClick={startDemo} disabled={demoLoading}>
            <Play className="mr-2 h-4 w-4" />
            {demoLoading ? "샘플 준비 중" : "샘플 데이터로 시작하기"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>New Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]">
            <Input placeholder="Project name" {...form.register("name")} />
            <Input placeholder="Description" {...form.register("description")} />
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Create
            </Button>
          </form>
          {form.formState.errors.name && <p className="mt-2 text-sm text-red-600">{form.formState.errors.name.message}</p>}
        </CardContent>
      </Card>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Link key={project.id} href={routes.project(project.id)} className="rounded-lg border bg-white p-5 shadow-sm hover:bg-muted">
            <div className="font-medium">{project.name}</div>
            <div className="mt-1 text-sm text-muted-foreground">{project.description || "No description"}</div>
            <div className="mt-4 text-xs text-muted-foreground">Created {project.created_at}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
