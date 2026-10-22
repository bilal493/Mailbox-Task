import { ArrowLeft, Calendar, CircleAlert, Mail, RefreshCw, User } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { CountUp, FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/motion";
import { RetryButton } from "@/components/retry-button";
import { StatusBadge } from "@/components/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { isInFlight } from "@/domain/order-status";
import { NotFoundError } from "@/domain/errors";
import { formatDateTime, providerLabel } from "@/lib/format";
import { requirePageUser } from "@/lib/session-server";
import { STATUS_STYLES } from "@/lib/status-style";
import { cn } from "@/lib/utils";
import { orderService } from "@/services/order.service";
import { uuidSchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

function Stat({ icon: Icon, label, children }: { icon: typeof Mail; label: string; children: React.ReactNode }) {
  return (
    <Card className="h-full p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-2 break-words text-base font-semibold sm:text-lg">{children}</div>
    </Card>
  );
}

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
  const inFlight = isInFlight(order.status);
  const progressTone = order.status === "FAILED" ? "destructive" : order.status === "ACTIVE" ? "success" : "primary";

  return (
    <>
      <FadeIn className="mb-4 flex items-center justify-between gap-3">
        <Link
          href={backHref}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
          Back to orders
        </Link>
        <AutoRefresh active={inFlight} />
      </FadeIn>

      <FadeIn delay={0.05} className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="break-all text-2xl font-semibold tracking-tight sm:text-3xl">{order.domain}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {providerLabel(order.provider)} · {order.mailboxCount} mailboxes · Order{" "}
            <span className="font-mono text-xs">{order.id.slice(0, 8)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={order.status} />
          {isAdmin && order.status === "FAILED" && <RetryButton orderId={order.id} />}
        </div>
      </FadeIn>

      <div className="mb-6 space-y-3 empty:hidden">
        {order.status === "FAILED" && order.lastError && (
          <FadeIn>
            <Alert variant="destructive" role="alert">
              <CircleAlert />
              <span>
                {order.lastError}.{" "}
                {isAdmin ? "Retry will only re-provision the mailboxes that failed." : "Our team can retry this order for you."}
              </span>
            </Alert>
          </FadeIn>
        )}
        {inFlight && (
          <FadeIn>
            <Alert role="status">
              <RefreshCw className="animate-spin" />
              <span>
                {order.status === "PENDING" ? "Waiting for a worker to pick this order up." : "Creating mailboxes…"} This page updates
                automatically.
              </span>
            </Alert>
          </FadeIn>
        )}
      </div>

      <Stagger className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem className="col-span-2 lg:col-span-1">
          <Stat icon={Mail} label="Mailboxes ready">
            <div className="flex items-baseline gap-1.5">
              <CountUp value={active} className="text-2xl tabular-nums" />
              <span className="text-sm font-medium text-muted-foreground">of {order.mailboxCount}</span>
            </div>
            <ProgressBar value={active} max={order.mailboxCount} active={inFlight} tone={progressTone} className="mt-3" />
          </Stat>
        </StaggerItem>
        <StaggerItem>
          <Stat icon={RefreshCw} label="Attempts">
            <CountUp value={order.attempts} className="tabular-nums" />
          </Stat>
        </StaggerItem>
        {isAdmin && (
          <StaggerItem>
            <Stat icon={User} label="Customer">
              <span className="text-sm sm:text-base">{order.userEmail}</span>
            </Stat>
          </StaggerItem>
        )}
        <StaggerItem>
          <Stat icon={Calendar} label="Created (UTC)">
            <span className="text-sm tabular-nums sm:text-base">{formatDateTime(order.createdAt)}</span>
          </Stat>
        </StaggerItem>
      </Stagger>

      <FadeIn delay={0.15}>
        <Card className="mb-6 overflow-hidden">
          <CardHeader>
            <CardTitle>Mailboxes</CardTitle>
            <span className="text-xs text-muted-foreground">{mailboxes.length} total</span>
          </CardHeader>
          <Stagger as="ul" className="divide-y" stagger={0.04}>
            {mailboxes.map((m) => (
              <StaggerItem
                as="li"
                key={m.id}
                className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="break-all font-mono text-sm">{m.address}</div>
                  <div className="mt-0.5 text-xs">
                    {m.error ? (
                      <span className="text-destructive">{m.error}</span>
                    ) : (
                      <span className="break-all font-mono text-muted-foreground">{m.externalId ?? "-"}</span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={m.status} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </FadeIn>

      <FadeIn delay={0.25}>
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Audit log</CardTitle>
          </CardHeader>
          <Stagger as="ol" className="px-4 py-5 sm:px-5" stagger={0.06}>
            {auditLogs.map((l) => (
              <StaggerItem
                as="li"
                key={l.id}
                className="relative pb-6 pl-7 before:absolute before:bottom-[-0.25rem] before:left-[5px] before:top-4 before:w-px before:bg-border last:pb-0 last:before:hidden"
              >
                <span
                  className={cn(
                    "absolute left-0 top-1.5 size-[11px] rounded-full ring-4 ring-card",
                    STATUS_STYLES[l.toStatus].dot,
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {l.fromStatus ? <StatusBadge status={l.fromStatus} /> : <span className="text-xs text-muted-foreground">new</span>}
                  <span className="text-muted-foreground">→</span>
                  <StatusBadge status={l.toStatus} />
                </div>
                <div className="mt-1.5 text-sm text-muted-foreground">
                  <span className="capitalize">{l.actorType.toLowerCase()}</span>
                  {l.actorId && l.actorType === "WORKER" ? ` ${l.actorId}` : ""}
                  {l.note ? `: ${l.note}` : ""}
                </div>
                <time className="mt-0.5 block text-xs tabular-nums text-muted-foreground/80" dateTime={l.createdAt.toISOString()}>
                  {formatDateTime(l.createdAt)}
                </time>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      </FadeIn>
    </>
  );
}
