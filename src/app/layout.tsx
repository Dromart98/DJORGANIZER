import type { Metadata } from "next";
import { AuthStatus } from "@/components/auth/auth-status";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DJOrganizer", template: "%s · DJOrganizer" },
  description: "Organiza tu biblioteca musical para cada sesión.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <AppShell authStatus={<AuthStatus />}>{children}</AppShell>
      </body>
    </html>
  );
}
