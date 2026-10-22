import type { OrderStatus } from "@/domain/order-status";
import type { MailboxStatus } from "@/domain/types";

export function StatusBadge({ status }: { status: OrderStatus | MailboxStatus }) {
  return <span className={`badge badge-${status}`}>{status}</span>;
}
