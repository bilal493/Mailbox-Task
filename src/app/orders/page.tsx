import Link from "next/link";
import { redirect } from "next/navigation";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { requirePageUser } from "@/lib/session-server";
import { orderService } from "@/services/order.service";
import { listOrdersQuerySchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/admin/orders");

  const query = listOrdersQuerySchema.catch({ page: 1, pageSize: 10 }).parse(searchParams);
  const result = await orderService.list(user, { ...query, status: undefined, provider: undefined });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My orders</h1>
          <p className="sub">Track the mailboxes you have ordered.</p>
        </div>
        <Link className="btn btn-primary" href="/orders/new">
          New order
        </Link>
      </div>
      <div className="card">
        {result.items.length === 0 ? (
          <div className="empty">
            <strong>No orders yet</strong>
            <Link href="/orders/new">Place your first order</Link>
          </div>
        ) : (
          <>
            <OrdersTable orders={result.items} admin={false} />
            <Pagination basePath="/orders" {...result} />
          </>
        )}
      </div>
    </>
  );
}
