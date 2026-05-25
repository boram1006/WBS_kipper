import Link from "next/link";
import { routes } from "@/lib/routes";

type NavItem = {
  label: string;
  href: (projectId: string | number) => string;
};

const items: NavItem[] = [
  { label: "WBS 현황", href: routes.wbs },
  { label: "WBS 설정", href: routes.upload },
  { label: "회의록 분석", href: routes.meetingNote }
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
