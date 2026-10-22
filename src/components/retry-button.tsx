"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "Retry failed");
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button className="btn btn-sm" onClick={retry} disabled={busy}>
        {busy ? "Retrying…" : "Retry"}
      </button>
      {error && <span className="error-text" role="alert"> {error}</span>}
    </span>
  );
}
