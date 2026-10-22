"use client";

import { motion } from "framer-motion";
import { CircleCheck, CircleX, Clock, LoaderCircle, type LucideIcon } from "lucide-react";
import type { OrderStatus } from "@/domain/order-status";
import type { MailboxStatus } from "@/domain/types";
import { STATUS_STYLES } from "@/lib/status-style";
import { cn } from "@/lib/utils";

const ICONS: Record<OrderStatus | MailboxStatus, LucideIcon> = {
  PENDING: Clock,
  PROVISIONING: LoaderCircle,
  ACTIVE: CircleCheck,
  FAILED: CircleX,
};

export function StatusBadge({ status }: { status: OrderStatus | MailboxStatus }) {
  const style = STATUS_STYLES[status];
  const Icon = ICONS[status];
  return (
    // key = status: the badge "pops" again whenever the status changes after an auto-refresh.
    <motion.span
      key={status}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 18 }}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        style.badge,
      )}
    >
      <Icon className={cn("size-3.5", status === "PROVISIONING" && "animate-spin")} aria-hidden />
      {style.label}
    </motion.span>
  );
}
