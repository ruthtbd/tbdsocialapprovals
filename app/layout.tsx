import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Post Approval",
  description: "Review and approve social media posts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-black text-white">{children}</body>
    </html>
  );
}
