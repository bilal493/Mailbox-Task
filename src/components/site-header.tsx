"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Inbox, Layers, Mail, Menu, Plus, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/logout-button";
import { cn } from "@/lib/utils";

interface HeaderUser {
  email: string;
  role: "customer" | "admin";
}

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

function linksFor(role: HeaderUser["role"]): NavLink[] {
  return role === "admin"
    ? [{ href: "/admin/orders", label: "All orders", icon: Layers }]
    : [
        { href: "/orders", label: "My orders", icon: Inbox },
        { href: "/orders/new", label: "New order", icon: Plus },
      ];
}

/** The most specific link wins, so /orders/new does not also highlight "My orders". */
function activeHref(links: NavLink[], pathname: string): string | null {
  const matches = links.filter((l) => pathname === l.href || pathname.startsWith(`${l.href}/`));
  matches.sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

export function SiteHeader({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = user ? linksFor(user.role) : [];
  const active = activeHref(links, pathname);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-40 border-b bg-background/75 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:h-16 sm:gap-6 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-tight">
          <motion.span
            whileHover={{ rotate: -8, scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-primary-foreground shadow-glow"
          >
            <Mail className="size-4" />
          </motion.span>
          <span>Mailbox Orders</span>
        </Link>

        {user && (
          <>
            <nav aria-label="Main" className="ml-2 hidden flex-1 items-center gap-1 md:flex">
              {links.map((l) => {
                const isActive = l.href === active;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      isActive ? "text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-accent"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <l.icon className="relative size-4" />
                    <span className="relative">{l.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto hidden items-center gap-3 md:flex">
              <div className="flex items-center gap-2.5 text-sm">
                <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-violet-500/80 text-xs font-bold uppercase text-primary-foreground">
                  {user.email.slice(0, 1)}
                </span>
                <div className="leading-tight">
                  <div className="max-w-[180px] truncate font-medium">{user.email}</div>
                  <div className="text-xs capitalize text-muted-foreground">{user.role}</div>
                </div>
              </div>
              <LogoutButton />
            </div>

            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="mobile-menu"
              onClick={() => setOpen((v) => !v)}
              className="ml-auto flex size-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95 md:hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={open ? "x" : "menu"}
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 0, opacity: 1 }}
                  exit={{ rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {open ? <X className="size-5" /> : <Menu className="size-5" />}
                </motion.span>
              </AnimatePresence>
            </button>
          </>
        )}
      </div>

      <AnimatePresence>
        {user && open && (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t bg-background/95 md:hidden"
          >
            <nav aria-label="Mobile" className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {links.map((l, i) => (
                <motion.div key={l.href} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i + 0.05 }}>
                  <Link
                    href={l.href}
                    aria-current={l.href === active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium",
                      l.href === active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <l.icon className="size-4" />
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              <div className="mt-2 flex items-center justify-between gap-3 border-t px-3 pt-3">
                <div className="min-w-0 text-sm leading-tight">
                  <div className="truncate font-medium">{user.email}</div>
                  <div className="text-xs capitalize text-muted-foreground">{user.role}</div>
                </div>
                <LogoutButton />
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
