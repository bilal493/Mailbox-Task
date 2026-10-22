import type { Metadata } from "next";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { getCurrentUser } from "@/lib/session-server";
import "./globals.css";

export const metadata: Metadata = { title: "Mailbox Orders", description: "Internal mailbox order manager" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              Mailbox Orders
            </Link>
            {user && (
              <>
                <nav className="nav" aria-label="Main">
                  {user.role === "admin" ? (
                    <Link href="/admin/orders">All orders</Link>
                  ) : (
                    <>
                      <Link href="/orders">My orders</Link>
                      <Link href="/orders/new">New order</Link>
                    </>
                  )}
                </nav>
                <div className="who">
                  <span>
                    {user.email} ({user.role})
                  </span>
                  <LogoutButton />
                </div>
              </>
            )}
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
