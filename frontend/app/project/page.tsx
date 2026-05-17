"use client";

import { Download } from "lucide-react";
import { api } from "@/lib/api";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import { ProjectNav } from "@/components/project-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProjectDetailPage() {
  const projectId = useProjectIdFromQuery();

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Project #{projectId || "-"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Upload WBS, analyze meeting notes, and apply approved changes only.</p>
        </div>
        <ProjectNav projectId={projectId} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Latest WBS</CardTitle>
          <a href={projectId ? api.downloadWbsUrl(projectId) : "#"}>
            <Button variant="outline">
              <Download className="mr-2 h-4 w-4" />
              Download CSV
            </Button>
          </a>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            Use Upload to preview a WBS file. Latest CSV is available after a WBS has been uploaded.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
