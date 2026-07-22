"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getMessages, type Locale } from "@/lib/i18n/i18n";
import { Icon, type IconName } from "./icon";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ homeLabel }: { homeLabel: string }) {
  return (
    <Link aria-label={`DJOrganizer, ${homeLabel}`} className="brand" href="/">
      <span>DJ</span>Organizer
    </Link>
  );
}

function NavLinks({
  navigation,
  pathname,
  collapsed,
}: {
  navigation: { href: string; label: string; icon: IconName }[];
  pathname: string;
  collapsed?: boolean;
}) {
  return navigation.map(({ href, label, icon }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? label : undefined}
        className={active ? "active" : ""}
        href={href}
        key={href}
      >
        <Icon name={icon} />
        <span className={collapsed ? "visually-hidden" : undefined}>{label}</span>
      </Link>
    );
  });
}

export function AppShell({
  authStatus,
  children,
  locale,
}: {
  authStatus: ReactNode;
  children: ReactNode;
  locale: Locale;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(localStorage.getItem("djorganizer-sidebar-collapsed") === "1"), []);
  function toggleSidebar() {
    setCollapsed((current) => {
      localStorage.setItem("djorganizer-sidebar-collapsed", current ? "0" : "1");
      return !current;
    });
  }
  const copy = getMessages(locale).navigation;
  const navigation: { href: string; label: string; icon: IconName }[] = [
    { href: "/", label: copy.home, icon: "home" },
    { href: "/library", label: copy.library, icon: "library" },
    { href: "/import", label: copy.import, icon: "import" },
    { href: "/crates", label: copy.crates, icon: "crates" },
    { href: "/settings", label: copy.settings, icon: "settings" },
  ];
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/");
  const currentSection =
    navigation.find(({ href }) => isActive(pathname, href))?.label ?? copy.home;

  if (isAuthRoute) {
    return (
      <>
        <a className="skip-link" href="#main-content">
          {copy.skip}
        </a>
        <main className="auth-main" id="main-content" tabIndex={-1}>
          {children}
        </main>
      </>
    );
  }

  return (
    <div className={`app-shell${collapsed ? " app-shell--collapsed" : ""}`}>
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <aside>
        <Brand homeLabel={copy.home} />
        <nav aria-label={copy.main}>
          <NavLinks collapsed={collapsed} navigation={navigation} pathname={pathname} />
        </nav>
        <button aria-expanded={!collapsed} aria-label={collapsed ? copy.expandSidebar : copy.collapseSidebar} className="sidebar-toggle" onClick={toggleSidebar} type="button" title={collapsed ? copy.expandSidebar : copy.collapseSidebar}>{collapsed ? "›" : "‹"}</button>
        {!collapsed ? authStatus : null}
      </aside>
      <header className="mobile-topbar">
        <Brand homeLabel={copy.home} />
        <span>{currentSection}</span>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <nav aria-label={copy.mobile} className="mobile-nav">
        <NavLinks navigation={navigation} pathname={pathname} />
      </nav>
    </div>
  );
}
