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

function NavLinks() {
  const pathname = usePathname();
  return navigation.map(({ href, label, icon }) => <Link key={href} href={href} className={pathname === href ? "active" : ""}><Icon name={icon}/><span>{label}</span></Link>);
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

  if (isAuthRoute) {
    return <main className="auth-main">{children}</main>;
  }

  return (
    <div className="app-shell">
      <aside>
        <Link href="/" className="brand">
          <span>DJ</span>Organizer
        </Link>
        <p className="nav-label">Workspace</p>
        <nav>
          <NavLinks />
        </nav>
        {authStatus}
      </aside>
      <main>{children}</main>
      <nav className="mobile-nav">
        <NavLinks />
      </nav>
    </div>
  );
}
