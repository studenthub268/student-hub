import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { VerificationBanner } from "@/components/layout/VerificationBanner";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import Footer from "@/components/layout/Footer";
import { LazyToaster } from "@/components/LazyToaster";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { DeployWatcher } from "@/components/DeployWatcher";
import { Analytics } from "@/components/ui/Analytics";
import { Vitals } from "@/components/ui/Vitals";
import { IdleMount } from "@/components/IdleMount";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // Serve only the weights actually used (400/500/700 via font-bold etc.):
  // smaller font files, fewer font variants to download before text paints.
  weight: ["400", "500", "700"],
  display: "swap", // text renders immediately in the fallback font
  adjustFontFallback: true, // metric-compatible fallback => no layout shift
  preload: true,
});


export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "https://student-hub-uet.vercel.app"),
  icons: {
    // ?v=3 cache-buster: the 512/maskable icons were rebuilt from the crisp
    // 192 source (they were blurry upscales); both the service worker and
    // browsers cache icons by URL — a new URL is the only reliable way for
    // returning visitors to get the new art.
    icon: [
      // /favicon.ico: browsers auto-request this exact path regardless of
      // what's declared here — without a real file the probe 404s and logs a
      // console error on every visit (Lighthouse "errors logged to console").
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/icon-192.png?v=3", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png?v=3", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icon-192.png?v=3" }],
  },
  title: "Student Hub — Study Smarter. Share More.",
  description: "University notes, past papers and study resources shared by students. Peer-powered and student-run — built for UET students.",
  openGraph: {
    title: "Student Hub — Study Smarter. Share More.",
    description: "University notes, past papers and study resources shared by students. Peer-powered and student-run — built for UET students.",
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
    description: "Access notes, past papers and study materials uploaded by students. Join Student Hub — the peer-powered academic resource platform for every student.",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: { canonical: "/" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Student Hub",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B6F63",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col" suppressHydrationWarning={true}>
        <OfflineBanner />
        <VerificationBanner />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <LazyToaster />
        <CookieConsent />
        {/* Non-critical, nothing-rendering reporters and pollers: deferring
            them to idle keeps their fetches (session/verified/admin/version/
            analytics) and JS off the critical path — on a throttled phone
            those four requests were firing ~2.8s into the load, competing
            with the font and stylesheets the LCP heading waits on. All are
            hidden-or-null at first paint, so nothing visible is delayed:
            the two banners still render (they read caches synchronously and
            show only after a network verdict anyway). */}
        <IdleMount>
          <Analytics />
          <Vitals />
          <ServiceWorkerRegister />
          <DeployWatcher />
        </IdleMount>
      </body>
    </html>
  );
}
