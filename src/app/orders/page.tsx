import { Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Float, FadeIn } from "@/components/motion";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePageUser } from "@/lib/session-server";
import { cn } from "@/lib/utils";
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
      <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track the mailboxes you have ordered.</p>
        </div>
        <Link className={cn(buttonVariants(), "w-full sm:w-auto")} href="/orders/new">
          <Plus />
          New order
        </Link>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Card className="overflow-hidden">
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Float>
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <Inbox className="size-7" />
                </span>
              </Float>
              <strong className="mt-4 font-semibold">No orders yet</strong>
              <Link href="/orders/new" className={cn(buttonVariants({ variant: "outline" }), "mt-4")}>
                Place your first order
              </Link>
            </div>
          ) : (
            <>
              <OrdersTable orders={result.items} admin={false} />
              <Pagination basePath="/orders" {...result} />
            </>
          )}
        </Card>
      </FadeIn>
    </>
  );
}
