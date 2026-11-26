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
    <html lang="en" className="h-full" style={{ colorScheme: 'light', backgroundColor: '#fff' }}>
      <body className="min-h-full" style={{ backgroundColor: '#fff', color: '#000' }}>{children}</body>
    </html>
  );
}
