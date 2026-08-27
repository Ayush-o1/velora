import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/Nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Velora — Sessions Marketplace",
  description: "Browse, book, and host live sessions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-neutral-50 text-neutral-900">
        <AuthProvider>
          <Nav />
          <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:px-6">{children}</main>
          <footer className="border-t border-neutral-200 py-6 text-center text-sm text-neutral-500">
            Velora — a compact sessions marketplace
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
