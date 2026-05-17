"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { routes } from "@/lib/routes";
import { useProjectIdFromQuery } from "@/lib/use-project-id";
import { ProjectNav } from "@/components/project-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  meeting_date: z.string().min(1, "Meeting date is required."),
  meeting_title: z.string().min(1, "Meeting title is required."),
  meeting_note: z.string().min(10, "Meeting note must be at least 10 characters.")
});

type FormValues = z.infer<typeof schema>;

export default function MeetingNotePage() {
  const projectId = useProjectIdFromQuery();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      meeting_date: new Date().toISOString().slice(0, 10),
      meeting_title: "",
      meeting_note: ""
    }
  });

  async function onSubmit(values: FormValues) {
    setLoading(true);
    setError(null);
    try {
      if (!projectId) throw new Error("Project id is missing.");
      await api.analyzeMeeting(projectId, values);
      router.push(routes.review(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-semibold">Meeting Note Input</h1>
          <p className="mt-1 text-sm text-muted-foreground">Analysis creates candidates only. Nothing is applied automatically.</p>
        </div>
        <ProjectNav projectId={projectId} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="date" {...form.register("meeting_date")} />
              <Input placeholder="Meeting title" {...form.register("meeting_title")} />
            </div>
            <Textarea
              placeholder="Example: API integration is done. Owner is Minsoo Kim. QA due date changed to 2026-05-24."
              {...form.register("meeting_note")}
            />
            {form.formState.errors.meeting_note && <p className="text-sm text-red-600">{form.formState.errors.meeting_note.message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading}>
              <Sparkles className="mr-2 h-4 w-4" />
              {loading ? "Analyzing" : "Analyze"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
