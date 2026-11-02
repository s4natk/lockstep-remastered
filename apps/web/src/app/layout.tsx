import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { PreferencesProvider } from "../components/providers/PreferencesProvider";
import { ToastProvider } from "../components/providers/ToastProvider";
import { PREFERENCES_BOOT_SCRIPT, THEME_COLORS } from "../lib/preferences";
import "./globals.css";
import "./investigation.css";

export const metadata: Metadata = {
  title: { default: "Lockstep — AI Debugging & Incident Investigation", template: "%s · Lockstep" },
  description:
    "Understand the error. Find the cause. Know what to do next. Evidence-grounded investigation for runtime errors, failed tests, API failures, logs, and SQL.",
  applicationName: "Lockstep",
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
  ],
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_BOOT_SCRIPT }} />
      </head>
      <body>
        <PreferencesProvider>
          <ToastProvider>{children}</ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
