import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./sidekick.css";
const sans = Inter({ subsets: ["latin"], variable: "--ls-font-sans", display: "swap" });
const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--ls-font-display",
  display: "swap",
});
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--ls-font-mono", display: "swap" });
export const metadata: Metadata = {
  title: { default: "Lockstep — Your debugging workspace", template: "%s · Lockstep" },
  description:
    "An investigation partner for errors, failed tests, API failures, logs, and SQL. Keep the conversation, context, and evidence together.",
  applicationName: "Lockstep",
};
export const viewport: Viewport = {
  themeColor: "#070b16",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
