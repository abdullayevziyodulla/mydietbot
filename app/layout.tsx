import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Diet — Personal food journal",
  description: "Your private food journal. Log meals, review estimates, and track daily calories and macros.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
