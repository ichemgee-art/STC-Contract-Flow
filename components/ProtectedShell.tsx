"use client";

import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contracts", label: "Contracts", icon: FileText },
];

function pageTitle(pathname: string) {
  if (pathname === "/dashboard") return "Dashboard";
  if (pathname === "/contracts") return "Contracts";
  if (pathname === "/contracts/new") return "New Contract";
  if (pathname.startsWith("/contracts/")) return "Contract Details";
  return "STC Contract Flow";
}

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const initials = useMemo(() => {
    const source = profile?.displayName || user?.email || "STC";
    return source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");
  }, [profile, user]);

  if (loading || !user) {
    return (
      <div className="screen-loader">
        <div className="loader-mark">STC</div>
        <div className="loader-line" />
        <p>Loading Contract Flow…</p>
      </div>
    );
  }

  if (!profile?.active) {
    return (
      <div className="access-screen">
        <div className="access-card">
          <div className="access-icon"><ShieldCheck size={28} /></div>
          <p className="eyebrow">Access control</p>
          <h1>Your account is not enabled yet.</h1>
          <p>
            Ask the system administrator to activate your user profile in Firebase,
            then sign in again.
          </p>
          <button
            className="button button-primary"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut size={17} /> Sign out
          </button>
        </div>
      </div>
    );
  }

  const nav = (
    <>
      <div className="brand-lockup">
        <div className="brand-monogram" aria-hidden="true">STC</div>
        <div>
          <strong>Contract Flow</strong>
          <span>Specialized Trading & Construction</span>
        </div>
      </div>

      <nav className="side-nav" aria-label="Main navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/contracts" && pathname.startsWith("/contracts/"));
          return (
            <Link key={href} href={href} className={active ? "nav-link active" : "nav-link"}>
              <Icon size={19} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-spacer" />

      <Link href="/contracts/new" className="button button-primary sidebar-add">
        <Plus size={18} /> New Contract
      </Link>

      <div className="sidebar-user">
        <div className="avatar">{initials}</div>
        <div className="sidebar-user-copy">
          <strong>{profile.displayName}</strong>
          <span>{profile.role === "admin" ? "Administrator" : "Editor"}</span>
        </div>
        <button
          className="icon-button"
          aria-label="Sign out"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          <LogOut size={17} />
        </button>
      </div>
    </>
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">{nav}</aside>

      {mobileOpen && (
        <div className="mobile-drawer-layer">
          <button className="mobile-backdrop" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
          <aside className="mobile-drawer">
            <button className="drawer-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <section className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu size={21} />
            </button>
            <div>
              <p className="topbar-kicker">STC Contract Flow</p>
              <h1>{pageTitle(pathname)}</h1>
            </div>
          </div>

          <Link href="/contracts/new" className="button button-primary topbar-add">
            <Plus size={18} /> Add Contract
          </Link>
        </header>

        <main className="app-content">{children}</main>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/contracts" && pathname.startsWith("/contracts/"));
          return (
            <Link key={href} href={href} className={active ? "mobile-nav-link active" : "mobile-nav-link"}>
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link href="/contracts/new" className="mobile-nav-add" aria-label="Add contract">
          <Plus size={21} />
        </Link>
      </nav>
    </div>
  );
}
