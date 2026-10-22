import { Filter, SearchX } from "lucide-react";
import { redirect } from "next/navigation";
import { FadeIn, Float } from "@/components/motion";
import { OrdersTable } from "@/components/orders-table";
import { Pagination } from "@/components/pagination";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ORDER_STATUSES } from "@/domain/order-status";
import { PROVIDERS } from "@/domain/types";
import { providerLabel } from "@/lib/format";
import { requirePageUser } from "@/lib/session-server";
import { cn } from "@/lib/utils";
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
      <FadeIn className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">All orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every customer order. Failed orders can be retried.</p>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Card className="overflow-hidden">
          <form
            className="grid grid-cols-1 gap-3 border-b bg-muted/30 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[1fr_1fr_auto]"
            method="get"
            action="/admin/orders"
          >
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={query.status ?? ""}>
                <option value="">All statuses</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="provider">Provider</Label>
              <Select id="provider" name="provider" defaultValue={query.provider ?? ""}>
                <option value="">All providers</option>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {providerLabel(p)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="submit" className="flex-1 lg:flex-none">
                <Filter />
                Apply filters
              </Button>
              {filtered && (
                <a className={buttonVariants({ variant: "ghost" })} href="/admin/orders">
                  Clear
                </a>
              )}
            </div>
          </form>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Float>
                <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                  <SearchX className="size-7" />
                </span>
              </Float>
              <strong className={cn("mt-4 font-semibold")}>{filtered ? "No orders match these filters" : "No orders yet"}</strong>
              <p className="mt-1 text-sm text-muted-foreground">
                {filtered ? "Try a different status or provider." : "Orders will appear here when customers place them."}
              </p>
            </div>
          ) : (
            <>
              <OrdersTable orders={result.items} admin />
              <Pagination basePath="/admin/orders" params={{ status: query.status, provider: query.provider }} {...result} />
            </>
          )}
        </Card>
      </FadeIn>
    </>
  );
}
