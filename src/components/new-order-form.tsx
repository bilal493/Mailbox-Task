"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

interface ApiError {
  error?: { code?: string; message?: string; details?: { field: string; message: string }[] };
}

export function NewOrderForm() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [provider, setProvider] = useState<"google" | "microsoft">("google");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // One key per distinct payload: a double click or a retry after a network drop
  // replays the same request, while an edited form gets a fresh key.
  const keyRef = useRef<{ payload: string; key: string } | null>(null);

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
    <form onSubmit={onSubmit} noValidate>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="field">
        <label htmlFor="domain">Domain</label>
        <input
          id="domain"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.domain)}
        />
        {fieldErrors.domain && <span className="field-error">{fieldErrors.domain}</span>}
      </div>
      <div className="field">
        <label htmlFor="provider">Provider</label>
        <select id="provider" value={provider} onChange={(e) => setProvider(e.target.value as "google" | "microsoft")}>
          <option value="google">Google Workspace</option>
          <option value="microsoft">Microsoft 365</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="count">Number of mailboxes</label>
        <input
          id="count"
          type="number"
          min={1}
          max={50}
          step={1}
          value={count}
          onChange={(e) => setCount(e.target.value)}
          aria-invalid={Boolean(fieldErrors.mailboxCount)}
        />
        <span className="hint">Between 1 and 50.</span>
        {fieldErrors.mailboxCount && <span className="field-error">{fieldErrors.mailboxCount}</span>}
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
