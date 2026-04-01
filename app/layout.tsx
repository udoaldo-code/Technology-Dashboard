import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Integration VAS — Executive Dashboard",
  description: "Jira project status dashboard for Integration VAS (IV)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
