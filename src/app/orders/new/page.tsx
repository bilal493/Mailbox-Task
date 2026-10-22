import { redirect } from "next/navigation";
import { FadeIn } from "@/components/motion";
import { NewOrderForm } from "@/components/new-order-form";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageUser } from "@/lib/session-server";

export default async function NewOrderPage() {
  const user = await requirePageUser();
  if (user.role === "admin") redirect("/admin/orders");
  return (
    <div className="max-w-xl">
      <FadeIn className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">New order</h1>
        <p className="mt-1 text-sm text-muted-foreground">We create the mailboxes in the background. This page will show progress.</p>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Card>
          <CardContent className="sm:p-6">
            <NewOrderForm />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
