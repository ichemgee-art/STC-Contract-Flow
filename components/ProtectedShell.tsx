"use client";

import {
  BellRing,
  FileText,
  Languages,
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
import { useLanguage } from "@/components/LanguageProvider";
import { useContractNotifications } from "@/components/useContractNotifications";

export function ProtectedShell({ children }: { children: ReactNode }) {
  const { user, profile, loading, logout } = useAuth();
  const { t, toggleLanguage, language } = useLanguage();
  const { enabled: notificationsEnabled, toggle: toggleNotifications } = useContractNotifications(language);
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: "/dashboard", label: t("dashboard"), icon: LayoutDashboard },
    { href: "/contracts", label: t("contracts"), icon: FileText },
  ];

  function pageTitle() {
    if (pathname === "/dashboard") return t("dashboard");
    if (pathname === "/contracts") return t("contracts");
    if (pathname === "/contracts/new") return t("newContract");
    if (pathname.startsWith("/contracts/")) return t("contractDetails");
    return "STC Contract Flow";
  }

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
        <p>{t("loadingFlow")}</p>
      </div>
    );
  }

  if (!profile?.active) {
    return (
      <div className="access-screen">
        <div className="access-card">
          <div className="access-icon"><ShieldCheck size={28} /></div>
          <p className="eyebrow">{t("accessControl")}</p>
          <h1>{t("accountNotEnabled")}</h1>
          <p>{t("accountNotEnabledHelp")}</p>
          <button
            className="button button-primary"
            onClick={async () => {
              await logout();
              router.replace("/login");
            }}
          >
            <LogOut size={17} /> {t("signOut")}
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
          <span>{t("companyNameFull")}</span>
        </div>
      </div>

      <nav className="side-nav" aria-label={t("mainNavigation")}>
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
        <Plus size={18} /> {t("newContract")}
      </Link>

      <button
        type="button"
        className={notificationsEnabled ? "language-switch notification-toggle active" : "language-switch notification-toggle"}
        onClick={() => void toggleNotifications()}
        title={language === "ar" ? "تنبيهات العقود كل 5 ساعات" : "Contract reminders every 5 hours"}
      >
        <BellRing size={17} />
        <span>{language === "ar" ? (notificationsEnabled ? "التنبيهات مفعلة" : "تفعيل التنبيهات") : (notificationsEnabled ? "Notifications on" : "Enable notifications")}</span>
      </button>

      <button type="button" className="language-switch sidebar-language" onClick={toggleLanguage}>
        <Languages size={17} />
        <span>{t("languageLabel")}</span>
      </button>

      <div className="sidebar-user">
        <div className="avatar">{initials}</div>
        <div className="sidebar-user-copy">
          <strong>{profile.displayName}</strong>
          <span>{profile.role === "admin" ? t("administrator") : t("editor")}</span>
        </div>
        <button
          className="icon-button"
          aria-label={t("signOut")}
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
    <div className="app-shell" data-language={language}>
      <aside className="sidebar">{nav}</aside>

      {mobileOpen && (
        <div className="mobile-drawer-layer">
          <button className="mobile-backdrop" aria-label={t("closeMenu")} onClick={() => setMobileOpen(false)} />
          <aside className="mobile-drawer">
            <button className="drawer-close icon-button" onClick={() => setMobileOpen(false)} aria-label={t("closeMenu")}>
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      <section className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label={t("openMenu")}>
              <Menu size={21} />
            </button>
            <div>
              <p className="topbar-kicker">STC Contract Flow</p>
              <h1>{pageTitle()}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className={notificationsEnabled ? "language-switch notification-toggle active" : "language-switch notification-toggle"}
              onClick={() => void toggleNotifications()}
              title={language === "ar" ? "تنبيهات العقود كل 5 ساعات" : "Contract reminders every 5 hours"}
              aria-label={language === "ar" ? "تنبيهات العقود" : "Contract notifications"}
            >
              <BellRing size={17} />
              <span>{language === "ar" ? (notificationsEnabled ? "مفعلة" : "تنبيهات") : (notificationsEnabled ? "On" : "Alerts")}</span>
            </button>
            <button type="button" className="language-switch" onClick={toggleLanguage}>
              <Languages size={17} />
              <span>{t("languageLabel")}</span>
            </button>
            <Link href="/contracts/new" className="button button-primary topbar-add">
              <Plus size={18} /> {t("addContract")}
            </Link>
          </div>
        </header>

        <main className="app-content">{children}</main>
      </section>

      <nav className="mobile-bottom-nav" aria-label={t("mobileNavigation")}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href === "/contracts" && pathname.startsWith("/contracts/"));
          return (
            <Link key={href} href={href} className={active ? "mobile-nav-link active" : "mobile-nav-link"}>
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          );
        })}
        <Link href="/contracts/new" className="mobile-nav-add" aria-label={t("addContract")}>
          <Plus size={21} />
        </Link>
      </nav>
    </div>
  );
}
