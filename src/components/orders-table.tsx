"use client";

import { motion, type Variants } from "framer-motion";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { OrderWithOwner } from "@/repositories/order.repository";
import { formatDateTime, providerLabel } from "@/lib/format";
import { RetryButton } from "./retry-button";
import { StatusBadge } from "./status-badge";

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 28 } },
};

export function OrdersTable({ orders, admin }: { orders: OrderWithOwner[]; admin: boolean }) {
  return (
    <>
      {/* Desktop / tablet: table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-semibold">Domain</th>
              {admin && <th className="px-4 py-3 font-semibold">Customer</th>}
              <th className="px-4 py-3 font-semibold">Provider</th>
              <th className="px-4 py-3 text-right font-semibold">Mailboxes</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Created (UTC)</th>
              {admin && <th className="px-5 py-3" aria-label="Actions" />}
            </tr>
          </thead>
          <motion.tbody variants={list} initial="hidden" animate="show">
            {orders.map((o) => (
              <motion.tr key={o.id} variants={item} className="group border-b transition-colors last:border-0 hover:bg-accent/50">
                <td className="whitespace-nowrap px-5 py-3.5">
                  <Link
                    href={`/orders/${o.id}`}
                    className="inline-flex items-center gap-1 font-semibold text-foreground transition-colors group-hover:text-primary"
                  >
                    {o.domain}
                    <ChevronRight className="size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </Link>
                </td>
                {admin && <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">{o.userEmail}</td>}
                <td className="whitespace-nowrap px-4 py-3.5">{providerLabel(o.provider)}</td>
                <td className="px-4 py-3.5 text-right tabular-nums">{o.mailboxCount}</td>
                <td className="px-4 py-3.5">
                  <StatusBadge status={o.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3.5 text-muted-foreground">{formatDateTime(o.createdAt)}</td>
                {admin && <td className="px-5 py-3.5 text-right">{o.status === "FAILED" && <RetryButton orderId={o.id} />}</td>}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <motion.ul variants={list} initial="hidden" animate="show" className="divide-y md:hidden">
        {orders.map((o) => (
          <motion.li key={o.id} variants={item} className="p-4">
            <Link href={`/orders/${o.id}`} className="block rounded-lg active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{o.domain}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {providerLabel(o.provider)} · {o.mailboxCount} mailboxes
                  </div>
                </div>
                <StatusBadge status={o.status} />
              </div>
              {admin && <div className="mt-2 truncate text-xs text-muted-foreground">{o.userEmail}</div>}
              <div className="mt-2 text-xs tabular-nums text-muted-foreground">{formatDateTime(o.createdAt)} UTC</div>
            </Link>
            {admin && o.status === "FAILED" && (
              <div className="mt-3">
                <RetryButton orderId={o.id} />
              </div>
            )}
          </motion.li>
        ))}
      </motion.ul>
    </>
  );
}
