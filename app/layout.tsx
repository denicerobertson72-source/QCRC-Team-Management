import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QCRC Team Management",
  description: "Rowing club reservations, sign-out, and damage tracking",
  icons: {
    icon: "/qcrc-lockup.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
