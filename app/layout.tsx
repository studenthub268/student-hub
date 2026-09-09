import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { VerificationBanner } from "@/components/layout/VerificationBanner";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import Footer from "@/components/layout/Footer";
import { Toaster } from "react-hot-toast";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { DeployWatcher } from "@/components/DeployWatcher";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});


export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://student-hub-uet.vercel.app"),
  icons: {
    // ?v=2 cache-buster: the artwork changed (white background), and both the
    // service worker and browsers cache icons by URL — a new URL is the only
    // reliable way for returning visitors to get the new art.
    icon: [
      { url: "/favicon.png?v=2", type: "image/png", sizes: "any" },
      { url: "/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon-192.png?v=2" }],
  },
  title: "Student Hub — Study Smarter. Share More.",
  description: "Notes, past papers and study resources uploaded by students, for students. Free, accessible, peer-powered.",
  openGraph: {
    title: "Student Hub — Study Smarter. Share More.",
    description: "Notes, past papers and study resources uploaded by students, for students.",
    url: "/",
    siteName: "Student Hub",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Student Hub — Study Smarter. Share More.",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Student Hub — Study Smarter, Share More With Students",
    description: "Access free notes, past papers and study materials uploaded by students. Join Student Hub — the peer-powered academic resource platform for every student.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Student Hub",
  },
};

export const viewport: Viewport = {
  themeColor: "#0D9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning={true}>
        <OfflineBanner />
        <VerificationBanner />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "sh-toast sh-toast-default",
            success: { className: "sh-toast sh-toast-success" },
            error: { className: "sh-toast sh-toast-error" },
          }}
        />
        <ServiceWorkerRegister />
        <DeployWatcher />
      </body>
    </html>
  );
}
