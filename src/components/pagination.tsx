import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  basePath: string;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  /** Other query params (filters) to keep when changing page. */
  params?: Record<string, string | undefined>;
}

export function Pagination({ basePath, page, totalPages, total, pageSize, params = {} }: Props) {
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("page", String(p));
    return `${basePath}?${q.toString()}`;
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;
  const linkClass = (disabled: boolean) =>
    cn(buttonVariants({ variant: "outline", size: "sm" }), disabled && "pointer-events-none opacity-45");

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:px-5"
      aria-label="Pagination"
    >
      <span className="tabular-nums">
        {from}–{to} of {total}
      </span>
      <span className="flex items-center gap-3">
        <Link className={linkClass(prevDisabled)} href={href(page - 1)} aria-disabled={prevDisabled} tabIndex={prevDisabled ? -1 : undefined}>
          <ChevronLeft />
          Previous
        </Link>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <Link className={linkClass(nextDisabled)} href={href(page + 1)} aria-disabled={nextDisabled} tabIndex={nextDisabled ? -1 : undefined}>
          Next
          <ChevronRight />
        </Link>
      </span>
    </nav>
  );
}
