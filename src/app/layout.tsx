import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AuthStatus } from "@/components/auth/auth-status";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { AppShell } from "@/components/layout/app-shell";
import { ConnectivityStatus } from "@/components/pwa/connectivity-status";
import { DesktopScanSessionProvider } from "@/components/desktop/scan-session-provider";
import { OfflineSyncManager } from "@/components/pwa/offline-sync-manager";
import { PwaRegistration } from "@/components/pwa/pwa-registration";
import { DiagnosticsCapture } from "@/components/settings/privacy-diagnostics";
import { getOptionalUser } from "@/lib/auth/user";
import { translate } from "@/lib/i18n/functional";
import { resolveLocale } from "@/lib/i18n/i18n";
import { getCurrentLocale } from "@/lib/i18n/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getCurrentLocale();
  return {
    title: { default: "DJOrganizer", template: "%s · DJOrganizer" },
    description: translate(
      locale,
      "Organiza tu biblioteca musical para cada sesión.",
    ),
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#080d12",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [cookieStore, user] = await Promise.all([cookies(), getOptionalUser()]);
  const locale = resolveLocale(cookieStore.get("djorganizer-locale")?.value);
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>
          <PwaRegistration />
          <DiagnosticsCapture />
          <ConnectivityStatus />
          <OfflineSyncManager />
          <DesktopScanSessionProvider key={user?.id ?? "signed-out"}>
            <AppShell
              authStatus={<AuthStatus locale={locale} user={user} />}
              locale={locale}
            >
              {children}
            </AppShell>
          </DesktopScanSessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
