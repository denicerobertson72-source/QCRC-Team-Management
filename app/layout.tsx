import "./globals.css";
import type { Metadata } from "next";
import type { Viewport } from "next";
import { PwaExperience } from "@/components/PwaExperience";

export const metadata: Metadata = {
  title: "QCRC Team Management",
  description: "Rowing club reservations, sign-out, and damage tracking",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/qcrc-lockup.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "QCRC Team",
  },
};

export const viewport: Viewport = {
  themeColor: "#ff5a1f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PwaExperience />
        {children}
      </body>
    </html>
  );
}
