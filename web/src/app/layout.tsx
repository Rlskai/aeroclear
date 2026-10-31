import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Disruption Negotiation Web View",
  description: "ATC, Pilot and Ground agents negotiate a revised arrival plan. Autonomous SG 2026, Airbus Challenge 2.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
