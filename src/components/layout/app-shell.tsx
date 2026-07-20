"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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
}: {
  navigation: { href: string; label: string; icon: IconName }[];
  pathname: string;
}) {
  return navigation.map(({ href, label, icon }) => {
    const active = isActive(pathname, href);
    return (
      <Link
        aria-current={active ? "page" : undefined}
        className={active ? "active" : ""}
        href={href}
        key={href}
      >
        <Icon name={icon} />
        <span>{label}</span>
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
  const copy = getMessages(locale).navigation;
  const navigation: { href: string; label: string; icon: IconName }[] = [
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
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {copy.skip}
      </a>
      <aside>
        <Brand homeLabel={copy.home} />
        <nav aria-label={copy.main}>
          <NavLinks navigation={navigation} pathname={pathname} />
        </nav>
        {authStatus}
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
