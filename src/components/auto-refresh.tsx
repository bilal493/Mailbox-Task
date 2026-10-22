"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the server component while an order is still moving through the worker. */
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
