import type { OrderStatus } from "@/domain/order-status";
import type { MailboxStatus } from "@/domain/types";

type Status = OrderStatus | MailboxStatus;

interface StatusStyle {
  label: string;
  /** Pill classes (background, text, ring). */
  badge: string;
  /** Solid dot / marker colour. */
  dot: string;
}

// Full class names are written out so Tailwind can see them at build time.
export const STATUS_STYLES: Record<Status, StatusStyle> = {
  PENDING: { label: "Pending", badge: "bg-warning/10 text-warning ring-warning/25", dot: "bg-warning" },
  PROVISIONING: { label: "Provisioning", badge: "bg-info/10 text-info ring-info/25", dot: "bg-info" },
  ACTIVE: { label: "Active", badge: "bg-success/10 text-success ring-success/25", dot: "bg-success" },
  FAILED: { label: "Failed", badge: "bg-destructive/10 text-destructive ring-destructive/25", dot: "bg-destructive" },
};
