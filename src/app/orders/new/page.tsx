import { redirect } from "next/navigation";
import { NewOrderForm } from "@/components/new-order-form";
import { requirePageUser } from "@/lib/session-server";

export default async function NewOrderPage() {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/admin/orders");
  return (
    <div style={{ maxWidth: 520 }}>
      <div className="page-head">
        <div>
          <h1>New order</h1>
          <p className="sub">We create the mailboxes in the background. This page will show progress.</p>
        </div>
      </div>
      <div className="card card-pad">
        <NewOrderForm />
      </div>
    </div>
  );
}
