import type { Metadata, Viewport } from "next";
import { AuthStatus } from "@/components/auth/auth-status";
import { AppShell } from "@/components/layout/app-shell";
import { ConnectivityStatus } from "@/components/pwa/connectivity-status";
import { PwaRegistration } from "@/components/pwa/pwa-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DJOrganizer", template: "%s · DJOrganizer" },
  description: "Organiza tu biblioteca musical para cada sesión.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#080d12",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <PwaRegistration />
        <ConnectivityStatus />
        <AppShell authStatus={<AuthStatus />}>{children}</AppShell>
      </body>
    </html>
  );
}
