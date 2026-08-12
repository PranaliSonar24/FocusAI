import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FocusAI | Edge Node",
  description: "Edge AI user monitoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
