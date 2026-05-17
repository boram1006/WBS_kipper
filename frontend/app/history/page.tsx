"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import type { ChangeHistoryItem } from "@/lib/types";
import { ProjectNav } from "@/components/project-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HistoryPage() {
  const projectId = useProjectIdFromQuery();
  const [history, setHistory] = useState<ChangeHistoryItem[]>([]);

  useEffect(() => {
    if (!projectId) return;
    api.getHistory(projectId).then((response) => setHistory(response.history));
  }, [projectId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Change History</h1>
          <p className="mt-1 text-sm text-muted-foreground">Only approved and applied changes are stored here.</p>
        </div>
        <ProjectNav projectId={projectId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Applied Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Applied</th>
                  <th className="px-3 py-2 text-left">WBS ID</th>
                  <th className="px-3 py-2 text-left">Task</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Field</th>
                  <th className="px-3 py-2 text-left">Before</th>
                  <th className="px-3 py-2 text-left">After</th>
                  <th className="px-3 py-2 text-left">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2 align-top">{item.changed_at}</td>
                    <td className="px-3 py-2 align-top">{item.wbs_id}</td>
                    <td className="px-3 py-2 align-top">{item.task_name}</td>
                    <td className="px-3 py-2 align-top">{item.change_type}</td>
                    <td className="px-3 py-2 align-top">{item.field}</td>
                    <td className="px-3 py-2 align-top">{item.old_value || "-"}</td>
                    <td className="px-3 py-2 align-top">{item.new_value || "-"}</td>
                    <td className="px-3 py-2 align-top text-muted-foreground">{item.evidence}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      No history yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
