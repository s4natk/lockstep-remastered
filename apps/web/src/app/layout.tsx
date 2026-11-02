import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import "./sidekick.css";
export const metadata: Metadata = {
  title: { default: "Lockstep — Your debugging workspace", template: "%s · Lockstep" },
  description:
    "An investigation partner for errors, failed tests, API failures, logs, and SQL. Keep the conversation, context, and evidence together.",
  applicationName: "Lockstep",
};
export const viewport: Viewport = { themeColor: "#121b2e", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
