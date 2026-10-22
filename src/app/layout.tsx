import type { Metadata, Viewport } from "next";
import { AmbientBackground } from "@/components/ambient-background";
import { MotionProvider } from "@/components/motion";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/session-server";
import "./globals.css";

export const metadata: Metadata = { title: "Mailbox Orders", description: "Internal mailbox order manager" };

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f17" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <MotionProvider>
          <AmbientBackground />
          <SiteHeader user={user ? { email: user.email, role: user.role } : null} />
          <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">{children}</main>
        </MotionProvider>
      </body>
    </html>
  );
}
