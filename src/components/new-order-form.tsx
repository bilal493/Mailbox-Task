"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, LoaderCircle, Minus, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface ApiError {
  error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
}

type ProviderId = "google" | "microsoft";

const PROVIDER_OPTIONS: { id: ProviderId; name: string; note: string }[] = [
  { id: "google", name: "Google Workspace", note: "Gmail mailboxes" },
  { id: "microsoft", name: "Microsoft 365", note: "Outlook mailboxes" },
];

function FieldError({ message }: { message?: string }) {
  return (
    <AnimatePresence initial={false}>
      {message && (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="text-sm text-destructive"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

export function NewOrderForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [provider, setProvider] = useState<ProviderId>("google");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One key per distinct payload: a double click or a retry after a network drop
  // replays the same request, while an edited form gets a fresh key.
  const keyRef = useRef<{ payload: string; key: string } | null>(null);

  const stepCount = (delta: number) => {
    const next = Math.min(50, Math.max(1, (Number(count) || 0) + delta));
    setCount(String(next));
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setFieldErrors({});

    const body = { domain: domain.trim(), provider, mailboxCount: Number(count) };
    const payload = JSON.stringify(body);
    if (keyRef.current?.payload !== payload) keyRef.current = { payload, key: crypto.randomUUID() };

    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": keyRef.current.key },
        body: payload,
      });
      const json = (await res.json().catch(() => null)) as (ApiError & { order?: { id: string } }) | null;
      if (!res.ok) {
        const details = json?.error?.details;
        if (Array.isArray(details)) {
          setFieldErrors(Object.fromEntries(details.map((d) => [d.field, d.message])));
        }
        setError(json?.error?.message ?? "Could not create the order");
        return;
      }
      router.push(`/orders/${json?.order?.id}`);
      router.refresh();
    } catch {
      setError("Network error. Submit again: your order will not be duplicated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Alert variant="destructive" role="alert">
              <CircleAlert />
              {error}
            </Alert>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        <Label htmlFor="domain">Domain</Label>
        <Input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          aria-invalid={Boolean(fieldErrors.domain)}
        />
        <FieldError message={fieldErrors.domain} />
      </div>

      <div className="space-y-2">
        <Label id="provider-label">Provider</Label>
        <div role="radiogroup" aria-labelledby="provider-label" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PROVIDER_OPTIONS.map((p) => {
            const selected = provider === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setProvider(p.id)}
                className={cn(
                  "relative rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected ? "border-primary text-foreground" : "border-input bg-card text-muted-foreground hover:border-primary/40",
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="provider-highlight"
                    className="absolute inset-0 rounded-xl bg-accent ring-1 ring-primary/40"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <span className="relative block text-sm font-semibold text-foreground">{p.name}</span>
                <span className="relative block text-xs text-muted-foreground">{p.note}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="count">Number of mailboxes</Label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="icon" aria-label="Decrease" onClick={() => stepCount(-1)}>
            <Minus />
          </Button>
          <Input
            id="count"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-invalid={Boolean(fieldErrors.mailboxCount)}
            className="text-center tabular-nums"
          />
          <Button type="button" variant="outline" size="icon" aria-label="Increase" onClick={() => stepCount(1)}>
            <Plus />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Between 1 and 50.</p>
        <FieldError message={fieldErrors.mailboxCount} />
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Send />}
        {busy ? "Placing order…" : "Place order"}
      </Button>
    </form>
  );
}
