import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/session-server";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="login">
      <div className="card card-pad">
        <h1>Sign in</h1>
        <p className="sub">Use your company account to manage mailbox orders.</p>
        <LoginForm />
      </div>
      <p className="creds">
        Demo accounts: <code>admin@example.com</code> / <code>admin123</code>, <code>alice@example.com</code> /{" "}
        <code>customer123</code>
      </p>
    </div>
  );
}
