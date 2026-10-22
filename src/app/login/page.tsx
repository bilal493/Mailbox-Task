import { Mail } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { Float, FadeIn } from "@/components/motion";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/session-server";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="mx-auto mt-4 max-w-md sm:mt-12">
      <FadeIn className="mb-6 flex flex-col items-center text-center">
        <Float>
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-glow">
            <Mail className="size-7" />
          </span>
        </Float>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Use your company account to manage mailbox orders.</p>
      </FadeIn>

      <FadeIn delay={0.1}>
        <Card>
          <CardContent className="p-5 pt-1 sm:p-7 sm:pt-1">
            <LoginForm />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.2}>
        <div className="mt-5 rounded-xl border border-dashed bg-card/60 p-4 text-xs text-muted-foreground">
          <div className="mb-1.5 font-semibold uppercase tracking-wide">Demo accounts</div>
          <div className="space-y-1">
            <p>
              <code className="font-mono text-foreground">admin@example.com</code> / <code className="font-mono text-foreground">admin123</code>
            </p>
            <p>
              <code className="font-mono text-foreground">alice@example.com</code> / <code className="font-mono text-foreground">customer123</code>
            </p>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
