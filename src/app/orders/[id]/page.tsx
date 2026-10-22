import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { RetryButton } from "@/components/retry-button";
import { StatusBadge } from "@/components/status-badge";
import { isInFlight } from "@/domain/order-status";
import { NotFoundError } from "@/domain/errors";
import { formatDateTime, providerLabel } from "@/lib/format";
import { requirePageUser } from "@/lib/session-server";
import { orderService } from "@/services/order.service";
import { uuidSchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();
  const id = uuidSchema.safeParse(params.id);
  if (!id.success) notFound();

  let detail;
  try {
    detail = await orderService.getDetail(user, id.data);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const { order, mailboxes, auditLogs } = detail;
  const isAdmin = user.role === "admin";
  const backHref = isAdmin ? "/admin/orders" : "/orders";
  const active = mailboxes.filter((m) => m.status === "ACTIVE").length;

  return (
    <>
      <AutoRefresh active={isInFlight(order.status)} />
      <p style={{ margin: "0 0 12px" }}>
        <Link href={backHref}>← Back to orders</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{order.domain}</h1>
          <p className="sub">
            {providerLabel(order.provider)} · {order.mailboxCount} mailboxes · Order <span className="mono">{order.id.slice(0, 8)}</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <StatusBadge status={order.status} />
          {isAdmin && order.status === "FAILED" && <RetryButton orderId={order.id} />}
        </div>
      </div>

      {order.status === "FAILED" && order.lastError && (
        <div className="alert" role="alert">
          {order.lastError}.{" "}
          {isAdmin ? "Retry will only re-provision the mailboxes that failed." : "Our team can retry this order for you."}
        </div>
      )}
      {isInFlight(order.status) && (
        <div className="notice" role="status">
          {order.status === "PENDING" ? "Waiting for a worker to pick this order up." : "Creating mailboxes…"} This page updates
          automatically.
        </div>
      )}

      <div className="card">
        <dl className="summary">
          <div>
            <dt>Mailboxes ready</dt>
            <dd>
              {active} of {order.mailboxCount}
            </dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{order.attempts}</dd>
          </div>
          {isAdmin && (
            <div>
              <dt>Customer</dt>
              <dd>{order.userEmail}</dd>
            </div>
          )}
          <div>
            <dt>Created (UTC)</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Mailboxes</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Address</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {mailboxes.map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.address}</td>
                  <td>
                    <StatusBadge status={m.status} />
                  </td>
                  <td>{m.error ? <span className="error-text">{m.error}</span> : <span className="muted mono">{m.externalId ?? "-"}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Audit log</h2>
        </div>
        <ol className="timeline">
          {auditLogs.map((l) => (
            <li key={l.id}>
              <time dateTime={l.createdAt.toISOString()}>{formatDateTime(l.createdAt)}</time>
              <div>
                {l.fromStatus ? <StatusBadge status={l.fromStatus} /> : <span className="muted">new</span>}
                <span className="arrow"> → </span>
                <StatusBadge status={l.toStatus} />
                <div className="note">
                  {l.actorType.toLowerCase()}
                  {l.actorId && l.actorType === "WORKER" ? ` ${l.actorId}` : ""}
                  {l.note ? `: ${l.note}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
