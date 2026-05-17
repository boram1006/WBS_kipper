import Link from "next/link";
import { routes } from "@/lib/routes";

type NavItem = {
  label: string;
  href: (projectId: string | number) => string;
};

const items: NavItem[] = [
  { label: "Current WBS", href: routes.wbs },
  { label: "Import WBS", href: routes.upload },
  { label: "Meeting Input", href: routes.meetingNote },
  { label: "Update Review", href: routes.review },
  { label: "Change History", href: routes.history }
];

export function ProjectNav({ projectId }: { projectId: string }) {
  return (
    <nav className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Link key={item.label} href={item.href(projectId)} className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-muted">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
