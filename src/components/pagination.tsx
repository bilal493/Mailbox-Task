import Link from "next/link";

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
  return (
    <nav className="pager" aria-label="Pagination">
      <span>
        {from}–{to} of {total}
      </span>
      <span className="pager-links">
        <Link className={`btn btn-sm ${page <= 1 ? "disabled" : ""}`} href={href(page - 1)} aria-disabled={page <= 1}>
          Previous
        </Link>
        <span className="muted" style={{ alignSelf: "center" }}>
          Page {page} of {totalPages}
        </span>
        <Link className={`btn btn-sm ${page >= totalPages ? "disabled" : ""}`} href={href(page + 1)} aria-disabled={page >= totalPages}>
          Next
        </Link>
      </span>
    </nav>
  );
}
