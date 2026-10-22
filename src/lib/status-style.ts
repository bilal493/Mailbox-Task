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
// Concrete gray = waiting, burnt amber = in progress, sage green = done.
export const STATUS_STYLES: Record<Status, StatusStyle> = {
  PENDING: { label: "Pending", badge: "bg-concrete/20 text-foreground/75 ring-concrete/60", dot: "bg-concrete" },
  PROVISIONING: { label: "Provisioning", badge: "bg-warning/10 text-warning-ink ring-warning/30", dot: "bg-warning" },
  ACTIVE: { label: "Active", badge: "bg-primary/20 text-success ring-primary/50", dot: "bg-primary" },
  FAILED: { label: "Failed", badge: "bg-destructive/10 text-destructive ring-destructive/25", dot: "bg-destructive" },
};
