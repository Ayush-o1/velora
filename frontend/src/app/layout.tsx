import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: { default: "Velora", template: "%s · Velora" },
  description:
    "A small marketplace for live sessions. Creators publish a time and a seat count; you take one of the seats.",
  openGraph: {
    title: "Velora",
    description:
      "A small marketplace for live sessions. Creators publish a time and a seat count; you take one of the seats.",
    type: "website",
  },
  // icon.png / apple-icon.png in this directory are picked up automatically
  // by Next's file-based metadata convention — nothing to wire up here.
};

export const viewport = {
  themeColor: "#faf8f3",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-bg text-ink antialiased">
        <AuthProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-on-accent"
          >
            Skip to content
          </a>
          <Nav />
          <main id="main" className="flex-1 w-full max-w-[1180px] mx-auto px-5 py-10 sm:px-8">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
