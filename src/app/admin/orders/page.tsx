import { redirect } from "next/navigation";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { ORDER_STATUSES } from "@/domain/order-status";
import { PROVIDERS } from "@/domain/types";
import { providerLabel } from "@/lib/format";
import { requirePageUser } from "@/lib/session-server";
import { orderService } from "@/services/order.service";
import { listOrdersQuerySchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePageUser();
  if (user.role !== "admin") redirect("/orders");

  const query = listOrdersQuerySchema.catch({ page: 1, pageSize: 10 }).parse(searchParams);
  const result = await orderService.list(user, query);
  const filtered = Boolean(query.status || query.provider);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>All orders</h1>
          <p className="sub">Every customer order. Failed orders can be retried.</p>
        </div>
      </div>
      <div className="card">
        <form className="filters" method="get" action="/admin/orders">
          <div className="field">
            <label htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={query.status ?? ""}>
              <option value="">All statuses</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="provider">Provider</label>
            <select id="provider" name="provider" defaultValue={query.provider ?? ""}>
              <option value="">All providers</option>
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {providerLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">
            Apply filters
          </button>
          {filtered && (
            <a className="btn btn-ghost" href="/admin/orders">
              Clear
            </a>
          )}
        </form>
        {result.items.length === 0 ? (
          <div className="empty">
            <strong>{filtered ? "No orders match these filters" : "No orders yet"}</strong>
            {filtered ? "Try a different status or provider." : "Orders will appear here when customers place them."}
          </div>
        ) : (
          <>
            <OrdersTable orders={result.items} admin />
            <Pagination
              basePath="/admin/orders"
              params={{ status: query.status, provider: query.provider }}
              {...result}
            />
          </>
        )}
      </div>
    </>
  );
}
