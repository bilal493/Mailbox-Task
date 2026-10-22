import Link from "next/link";
import type { OrderWithOwner } from "@/repositories/order.repository";
import { formatDateTime, providerLabel } from "@/lib/format";
import { RetryButton } from "./retry-button";
import { StatusBadge } from "./status-badge";

export function OrdersTable({ orders, admin }: { orders: OrderWithOwner[]; admin: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Domain</th>
            {admin && <th>Customer</th>}
            <th>Provider</th>
            <th className="num">Mailboxes</th>
            <th>Status</th>
            <th>Created (UTC)</th>
            {admin && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <Link href={`/orders/${o.id}`}>{o.domain}</Link>
              </td>
              {admin && <td className="muted">{o.userEmail}</td>}
              <td>{providerLabel(o.provider)}</td>
              <td className="num">{o.mailboxCount}</td>
              <td>
                <StatusBadge status={o.status} />
              </td>
              <td className="muted">{formatDateTime(o.createdAt)}</td>
              {admin && <td>{o.status === "FAILED" && <RetryButton orderId={o.id} />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
