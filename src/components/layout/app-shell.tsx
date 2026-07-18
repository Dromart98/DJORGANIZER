"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/library", label: "Biblioteca", icon: "library" },
  { href: "/import", label: "Importar", icon: "import" },
  { href: "/crates", label: "Crates", icon: "crates" },
  { href: "/settings", label: "Ajustes", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link aria-label="DJOrganizer, inicio" className="brand" href="/">
      <span>DJ</span>Organizer
    </Link>
  );
}

function NavLinks({ pathname }: { pathname: string }) {
  return navigation.map(({ href, label, icon }) => (
    <Link className={isActive(pathname, href) ? "active" : ""} href={href} key={href}>
      <Icon name={icon} />
      <span>{label}</span>
    </Link>
  ));
}

export function AppShell({
  authStatus,
  children,
}: {
  authStatus: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname.startsWith("/auth/");
  const currentSection =
    navigation.find(({ href }) => isActive(pathname, href))?.label ?? "Inicio";

  if (isAuthRoute) {
    return <main className="auth-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <aside>
        <Brand />
        <nav aria-label="Navegación principal">
          <NavLinks pathname={pathname} />
        </nav>
        {authStatus}
      </aside>
      <header className="mobile-topbar">
        <Brand />
        <span>{currentSection}</span>
      </header>
      <main>{children}</main>
      <nav aria-label="Navegación móvil" className="mobile-nav">
        <NavLinks pathname={pathname} />
      </nav>
    </div>
  );
}
