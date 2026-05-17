"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/lib/routes";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(routes.wbs());
  }, [router]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#fafaf9] text-sm text-zinc-500">
      Current WBS 화면을 여는 중입니다...
    </div>
  );
}
